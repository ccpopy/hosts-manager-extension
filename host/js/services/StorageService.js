/**
 * 存储服务，处理Chrome存储相关的操作
 */
export default class StorageService {
  /**
   * 获取存储数据
   * @param {Array|string} keys - 键或键数组
   * @returns {Promise<Object>} - 返回存储数据
   */
  static get (keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        resolve(result);
      });
    });
  }

  /**
   * 设置存储数据
   * @param {Object} data - 要存储的数据
   * @returns {Promise<void>}
   */
  static set (data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => {
        resolve();
      });
    });
  }

  /**
   * 监听存储变化
   * @param {Function} callback - 回调函数
   */
  static onChanged (callback) {
    chrome.storage.onChanged.addListener(callback);
  }

  /**
   * 获取所有分组
   * @returns {Promise<Array>} - 分组数组
   */
  static async getGroups () {
    const { hostsGroups = [] } = await this.get('hostsGroups');
    return hostsGroups;
  }

  /**
   * 获取活动分组
   * @returns {Promise<Array>} - 活动分组ID数组
   */
  static async getActiveGroups () {
    const { activeGroups = [] } = await this.get('activeGroups');
    return activeGroups;
  }

  /**
   * 获取Socket代理设置
   * @returns {Promise<Object>} - 代理设置
   */
  static async getSocketProxy () {
    const { socketProxy = {} } = await this.get('socketProxy');
    const defaultProxy = {
      host: '',
      port: '',
      enabled: false,
      protocol: 'SOCKS5',
      auth: {
        enabled: false,
        username: '',
        password: ''
      },
      bypassList: []
    };

    return {
      ...defaultProxy,
      ...socketProxy,
      auth: {
        ...defaultProxy.auth,
        ...(socketProxy.auth || {})
      },
      bypassList: Array.isArray(socketProxy.bypassList) ? socketProxy.bypassList : []
    };
  }

  /**
   * 保存分组
   * @param {Array} groups - 分组数组
   * @returns {Promise<void>}
   */
  static async saveGroups (groups) {
    await this.set({ hostsGroups: groups });
  }

  /**
   * 保存活动分组
   * @param {Array} activeGroups - 活动分组ID数组
   * @returns {Promise<void>}
   */
  static async saveActiveGroups (activeGroups) {
    await this.set({ activeGroups });
  }

  /**
   * 保存Socket代理设置
   * @param {Object} proxy - 代理设置
   * @returns {Promise<void>}
   */
  static async saveSocketProxy (proxy) {
    await this.set({ socketProxy: proxy });
  }

  /**
   * 添加分组
   * @param {Object} group - 分组对象
   * @param {boolean} active - 是否激活
   * @returns {Promise<void>}
   */
  static async addGroup (group, active = true) {
    const groups = await this.getGroups();
    const activeGroups = await this.getActiveGroups();

    groups.push(group);

    if (active && !activeGroups.includes(group.id)) {
      activeGroups.push(group.id);
      await this.saveActiveGroups(activeGroups);
    }

    await this.saveGroups(groups);
  }

  /**
   * 更新分组
   * @param {string} groupId - 分组ID
   * @param {Object} updates - 更新内容
   * @returns {Promise<boolean>} - 是否更新成功
   */
  static async updateGroup (groupId, updates) {
    const groups = await this.getGroups();
    const index = groups.findIndex(g => g.id === groupId);

    if (index === -1) return false;

    groups[index] = { ...groups[index], ...updates };
    await this.saveGroups(groups);
    return true;
  }

  /**
   * 删除分组
   * @param {string} groupId - 分组ID
   * @returns {Promise<boolean>} - 是否删除成功
   */
  static async deleteGroup (groupId) {
    const groups = await this.getGroups();
    const activeGroups = await this.getActiveGroups();

    const newGroups = groups.filter(g => g.id !== groupId);
    const newActiveGroups = activeGroups.filter(id => id !== groupId);

    await this.saveGroups(newGroups);
    await this.saveActiveGroups(newActiveGroups);
    return true;
  }

  /**
   * 切换分组状态
   * @param {string} groupId - 分组ID
   * @param {boolean} enabled - 是否启用
   * @returns {Promise<void>}
   */
  static async toggleGroup (groupId, enabled) {
    let activeGroups = await this.getActiveGroups();

    if (enabled) {
      if (!activeGroups.includes(groupId)) {
        activeGroups.push(groupId);
      }
    } else {
      activeGroups = activeGroups.filter(id => id !== groupId);
    }

    await this.saveActiveGroups(activeGroups);
  }

  /**
   * 添加主机
   * @param {string} groupId - 分组ID
   * @param {Object} host - 主机对象
   * @returns {Promise<boolean>} - 是否添加成功
   */
  static async addHost (groupId, host) {
    const groups = await this.getGroups();
    const index = groups.findIndex(g => g.id === groupId);

    if (index === -1) return false;

    groups[index].hosts.push(host);
    await this.saveGroups(groups);
    return true;
  }

  /**
   * 更新主机
   * @param {string} groupId - 分组ID
   * @param {string} hostId - 主机ID
   * @param {Object} updates - 更新内容
   * @returns {Promise<Object|null>} - 更新后的主机对象或null
   */
  static async updateHost (groupId, hostId, updates) {
    const groups = await this.getGroups();
    const groupIndex = groups.findIndex(g => g.id === groupId);

    if (groupIndex === -1) return null;

    const hostIndex = groups[groupIndex].hosts.findIndex(h => h.id === hostId);

    if (hostIndex === -1) return null;

    groups[groupIndex].hosts[hostIndex] = {
      ...groups[groupIndex].hosts[hostIndex],
      ...updates
    };

    await this.saveGroups(groups);
    return groups[groupIndex].hosts[hostIndex];
  }

  /**
   * 切换主机状态
   * @param {string} groupId - 分组ID
   * @param {string} hostId - 主机ID
   * @param {boolean} enabled - 是否启用
   * @returns {Promise<boolean>} - 是否操作成功
   */
  static async toggleHost (groupId, hostId, enabled) {
    return await this.updateHost(groupId, hostId, { enabled }) !== null;
  }

  /**
   * 删除主机
   * @param {string} groupId - 分组ID
   * @param {string} hostId - 主机ID
   * @returns {Promise<boolean>} - 是否删除成功
   */
  static async deleteHost (groupId, hostId) {
    const groups = await this.getGroups();
    const groupIndex = groups.findIndex(g => g.id === groupId);

    if (groupIndex === -1) return false;

    groups[groupIndex].hosts = groups[groupIndex].hosts.filter(h => h.id !== hostId);
    await this.saveGroups(groups);
    return true;
  }
}
