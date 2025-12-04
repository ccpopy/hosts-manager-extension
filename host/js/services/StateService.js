/**
 * 状态服务
 * 提供全局状态管理并与 Chrome 存储同步
 */
import MessageBridge from '../utils/MessageBridge.js';
import { normalizeBypassRules } from '../utils/ValidationUtils.js';

class StateService {
  constructor() {
    // 初始状态
    this.DEFAULT_SOCKET_PROXY = {
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

    this.state = {
      hostsGroups: [],
      activeGroups: [],
      socketProxy: { ...this.DEFAULT_SOCKET_PROXY },
      showAddGroupForm: false
    };

    // 订阅者列表
    this.listeners = [];

    // 状态是否已初始化
    this.initialized = false;

    // 节流控制
    this.saveThrottleTimeout = null;
    this.THROTTLE_DELAY = 500;

    // 搜索索引 - 用于优化搜索性能
    this.searchIndex = {
      domains: new Map(), // domain -> [groupId, hostId][]
      ips: new Map()      // ip -> [groupId, hostId][]
    };
  }

  /**
   * 初始化状态服务
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const data = await this.getStorageData(['hostsGroups', 'activeGroups', 'socketProxy', 'showAddGroupForm']);

      this.state.hostsGroups = data.hostsGroups || [];
      this.state.activeGroups = data.activeGroups || [];
      this.state.socketProxy = this.normalizeSocketProxyConfig(data.socketProxy || this.state.socketProxy);
      this.state.showAddGroupForm = data.showAddGroupForm || false;

      // 构建搜索索引
      this.buildSearchIndices();

      this.initialized = true;
      this.notifyListeners();

      // 监听存储变化
      this.setupStorageListener();
    } catch (error) {
      console.error('初始化状态服务失败:', error);
      throw error;
    }
  }

  /**
   * 获取Chrome存储数据
   * @param {Array<string>} keys - 要获取的键
   * @returns {Promise<object>}
   */
  getStorageData(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, result => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * 设置Chrome存储数据
   * @param {object} data - 要存储的数据
   * @returns {Promise<void>}
   */
  setStorageData(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 监听存储变化
   */
  setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      let stateChanged = false;

      if (changes.hostsGroups) {
        this.state.hostsGroups = changes.hostsGroups.newValue || [];
        this.buildSearchIndices();
        stateChanged = true;
      }

      if (changes.activeGroups) {
        this.state.activeGroups = changes.activeGroups.newValue || [];
        stateChanged = true;
      }

      if (changes.socketProxy) {
        this.state.socketProxy = this.normalizeSocketProxyConfig(
          changes.socketProxy.newValue || this.state.socketProxy
        );
        stateChanged = true;
      }

      if (changes.showAddGroupForm !== undefined) {
        this.state.showAddGroupForm = changes.showAddGroupForm.newValue || false;
        stateChanged = true;
      }

      if (stateChanged) {
        this.notifyListeners();
      }
    });
  }

  /**
   * 规范化Socket代理配置，填充默认值并清洗白名单
   * @param {object} proxy - 原始代理配置
   * @returns {object} - 规范化后的配置
   */
  normalizeSocketProxyConfig(proxy) {
    const merged = {
      ...this.DEFAULT_SOCKET_PROXY,
      ...(proxy || {}),
      auth: {
        ...this.DEFAULT_SOCKET_PROXY.auth,
        ...(proxy && proxy.auth)
      }
    };

    merged.bypassList = normalizeBypassRules(merged.bypassList || []);
    return merged;
  }

  /**
   * 将状态保存到存储中
   * @param {boolean} [immediate=false] - 是否立即保存，不使用节流
   * @returns {Promise<void>}
   */
  async saveState(immediate = false) {
    // 清除之前的节流定时器
    if (this.saveThrottleTimeout) {
      clearTimeout(this.saveThrottleTimeout);
      this.saveThrottleTimeout = null;
    }

    const performSave = async () => {
      try {
        // 保存到存储
        await this.setStorageData({
          hostsGroups: this.state.hostsGroups,
          activeGroups: this.state.activeGroups,
          socketProxy: this.state.socketProxy,
          showAddGroupForm: this.state.showAddGroupForm
        });

        // 更新代理设置
        await this.updateProxySettings();

        // 通知监听器
        this.notifyListeners();
      } catch (error) {
        console.error('保存状态失败:', error);
        // 在失败时也通知监听器，以便UI可以做出反应
        this.notifyListeners();
        throw error;
      }
    };

    if (immediate) {
      return performSave();
    } else {
      // 使用节流控制保存频率
      return new Promise((resolve, reject) => {
        this.saveThrottleTimeout = setTimeout(() => {
          performSave().then(resolve).catch(reject);
        }, this.THROTTLE_DELAY);
      });
    }
  }

  /**
   * 更新代理设置
   * @returns {Promise<void>}
   */
  async updateProxySettings() {
    try {
      await MessageBridge.updateProxySettings();
    } catch (error) {
      console.error('更新代理设置失败:', error);
      throw error;
    }
  }

  /**
   * 获取当前状态
   * @returns {object} 当前状态对象
   */
  getState() {
    return this.state;
  }

  /**
   * 订阅状态变化
   * @param {Function} listener - 监听函数，会在状态变化时调用
   * @returns {Function} 取消订阅的函数
   */
  subscribe(listener) {
    if (typeof listener !== 'function') {
      console.warn('订阅时提供的listener不是函数');
      return () => { };
    }

    this.listeners.push(listener);

    // 返回取消订阅函数
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * 通知所有监听器状态已更新
   */
  notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (error) {
        console.error('通知监听器时出错:', error);
      }
    });
  }

  /**
   * 构建搜索索引
   * 优化搜索性能
   */
  buildSearchIndices() {
    // 清空旧索引
    this.searchIndex.domains.clear();
    this.searchIndex.ips.clear();

    // 构建新索引
    this.state.hostsGroups.forEach(group => {
      if (!group.hosts) return;
      
      group.hosts.forEach(host => {
        // 索引域名
        if (!this.searchIndex.domains.has(host.domain)) {
          this.searchIndex.domains.set(host.domain, []);
        }
        this.searchIndex.domains.get(host.domain).push([group.id, host.id]);

        // 索引IP
        if (!this.searchIndex.ips.has(host.ip)) {
          this.searchIndex.ips.set(host.ip, []);
        }
        this.searchIndex.ips.get(host.ip).push([group.id, host.id]);
      });
    });
  }

  /**
   * 添加分组
   * @param {object} group - 分组对象
   * @param {boolean} [active=true] - 是否激活
   * @returns {Promise<boolean>} 是否添加成功
   */
  async addGroup(group, active = true) {
    // 检查是否已存在同名分组
    const isNameExist = this.state.hostsGroups.some(g => g.name === group.name);
    if (isNameExist) return false;

    // 添加到状态
    this.state.hostsGroups.push(group);

    // 如果需要激活，添加到活动分组列表
    if (active && !this.state.activeGroups.includes(group.id)) {
      this.state.activeGroups.push(group.id);
    }

    try {
      await this.saveState(true);
      return true;
    } catch (error) {
      // 回滚
      this.state.hostsGroups.pop();
      if (active) {
        this.state.activeGroups = this.state.activeGroups.filter(id => id !== group.id);
      }
      console.error('添加分组失败:', error);
      return false;
    }
  }

  /**
   * 更新分组
   * @param {string} groupId - 分组ID
   * @param {object} updates - 更新对象
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateGroup(groupId, updates) {
    const index = this.state.hostsGroups.findIndex(g => g.id === groupId);
    if (index === -1) return false;

    // 备份原始分组
    const originalGroup = { ...this.state.hostsGroups[index] };

    // 如果更新了名称，检查名称是否已存在
    if (updates.name && updates.name !== originalGroup.name) {
      const isNameExist = this.state.hostsGroups.some(g => g.id !== groupId && g.name === updates.name);
      if (isNameExist) return false;
    }

    // 应用更新
    this.state.hostsGroups[index] = { ...originalGroup, ...updates };

    try {
      await this.saveState();
      return true;
    } catch (error) {
      this.state.hostsGroups[index] = originalGroup;
      console.error('更新分组失败:', error);
      return false;
    }
  }

  /**
   * 删除分组
   * @param {string} groupId - 分组ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteGroup(groupId) {
    // 备份原始状态
    const originalGroups = [...this.state.hostsGroups];
    const originalActiveGroups = [...this.state.activeGroups];

    // 更新状态
    this.state.hostsGroups = this.state.hostsGroups.filter(g => g.id !== groupId);
    this.state.activeGroups = this.state.activeGroups.filter(id => id !== groupId);

    try {
      await this.saveState(true);
      return true;
    } catch (error) {
      this.state.hostsGroups = originalGroups;
      this.state.activeGroups = originalActiveGroups;
      console.error('删除分组失败:', error);
      return false;
    }
  }

  /**
   * 切换分组状态
   * @param {string} groupId - 分组ID
   * @param {boolean} enabled - 是否启用
   * @returns {Promise<boolean>} 是否切换成功
   */
  async toggleGroup(groupId, enabled) {
    // 备份原始状态
    const originalActiveGroups = [...this.state.activeGroups];

    // 更新活动分组
    if (enabled) {
      if (!this.state.activeGroups.includes(groupId)) {
        this.state.activeGroups.push(groupId);
      }
    } else {
      this.state.activeGroups = this.state.activeGroups.filter(id => id !== groupId);
    }

    try {
      await this.saveState(true);
      return true;
    } catch (error) {
      this.state.activeGroups = originalActiveGroups;
      console.error('切换分组状态失败:', error);
      return false;
    }
  }

  /**
   * 添加主机
   * @param {string} groupId - 分组ID
   * @param {object} host - 主机对象
   * @returns {Promise<boolean>} 是否添加成功
   */
  async addHost(groupId, host) {
    const groupIndex = this.state.hostsGroups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return false;

    const group = this.state.hostsGroups[groupIndex];

    // 检查是否存在相同的IP和域名
    const isDuplicate = group.hosts.some(h => h.ip === host.ip && h.domain === host.domain);
    if (isDuplicate) return false;

    // 备份原始主机列表
    const originalHosts = [...group.hosts];

    // 添加主机
    group.hosts.push(host);

    try {
      await this.saveState(true);
      return true;
    } catch (error) {
      this.state.hostsGroups[groupIndex].hosts = originalHosts;
      console.error('添加主机失败:', error);
      return false;
    }
  }

  /**
   * 更新主机
   * @param {string} groupId - 分组ID
   * @param {string} hostId - 主机ID
   * @param {object} updates - 更新对象
   * @returns {Promise<object|null>} 更新后的主机对象或null表示失败
   */
  async updateHost(groupId, hostId, updates) {
    const groupIndex = this.state.hostsGroups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return null;

    const group = this.state.hostsGroups[groupIndex];
    const hostIndex = group.hosts.findIndex(h => h.id === hostId);
    if (hostIndex === -1) return null;

    // 备份原始主机
    const originalHost = { ...group.hosts[hostIndex] };

    // 检查更新后是否会导致重复
    if (updates.ip || updates.domain) {
      const newIp = updates.ip || originalHost.ip;
      const newDomain = updates.domain || originalHost.domain;

      const isDuplicate = group.hosts.some(
        (h, idx) => idx !== hostIndex && h.ip === newIp && h.domain === newDomain
      );

      if (isDuplicate) return null;
    }

    // 应用更新
    this.state.hostsGroups[groupIndex].hosts[hostIndex] = {
      ...originalHost,
      ...updates
    };

    const updatedHost = this.state.hostsGroups[groupIndex].hosts[hostIndex];

    try {
      const needsImmediateUpdate = updates.ip || updates.domain || updates.enabled !== undefined;
      await this.saveState(needsImmediateUpdate);
      return updatedHost;
    } catch (error) {
      this.state.hostsGroups[groupIndex].hosts[hostIndex] = originalHost;
      console.error('更新主机失败:', error);
      return null;
    }
  }

  /**
   * 切换主机状态
   * @param {string} groupId - 分组ID
   * @param {string} hostId - 主机ID
   * @param {boolean} enabled - 是否启用
   * @returns {Promise<boolean>} 是否切换成功
   */
  async toggleHost(groupId, hostId, enabled) {
    const result = await this.updateHost(groupId, hostId, { enabled });
    return result !== null;
  }

  /**
   * 删除主机
   * @param {string} groupId - 分组ID
   * @param {string} hostId - 主机ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteHost(groupId, hostId) {
    const groupIndex = this.state.hostsGroups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return false;

    const group = this.state.hostsGroups[groupIndex];
    const originalHosts = [...group.hosts];

    // 过滤掉要删除的主机
    this.state.hostsGroups[groupIndex].hosts = group.hosts.filter(h => h.id !== hostId);

    try {
      await this.saveState(true);
      return true;
    } catch (error) {
      this.state.hostsGroups[groupIndex].hosts = originalHosts;
      console.error('删除主机失败:', error);
      return false;
    }
  }

  /**
   * 更新Socket代理配置
   * @param {object} proxy - 代理配置
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateSocketProxy(proxy) {
    // 备份原始代理配置
    const originalProxy = { ...this.state.socketProxy };

    // 规范化并合并配置
    const mergedProxy = this.normalizeSocketProxyConfig({
      ...this.state.socketProxy,
      ...(proxy || {}),
      auth: {
        ...this.state.socketProxy.auth,
        ...(proxy && proxy.auth)
      }
    });

    this.state.socketProxy = mergedProxy;

    try {
      await this.saveState(true);
      return true;
    } catch (error) {
      this.state.socketProxy = originalProxy;
      console.error('更新代理设置失败:', error);
      return false;
    }
  }

  /**
   * 设置是否显示添加分组表单
   * @param {boolean} show - 是否显示
   * @returns {Promise<void>}
   */
  async setShowAddGroupForm(show) {
    this.state.showAddGroupForm = show;

    try {
      await this.setStorageData({ showAddGroupForm: show });
      this.notifyListeners();
    } catch (error) {
      console.error('设置表单显示状态失败:', error);
      throw error;
    }
  }

  /**
   * 搜索主机规则
   * @param {string} keyword - 搜索关键字
   * @returns {object} 搜索结果
   */
  search(keyword) {
    if (!keyword) {
      return { matchedGroups: [], totalMatches: 0 };
    }

    try {
      const lowercaseKeyword = keyword.toLowerCase();
      const matchedGroups = [];
      let totalMatches = 0;

      // 使用索引加速搜索
      const matchedGroupMap = new Map();

      // 按域名搜索
      for (const [domain, entries] of this.searchIndex.domains.entries()) {
        if (domain.toLowerCase().includes(lowercaseKeyword)) {
          for (const [groupId, hostId] of entries) {
            this.addToMatchedResults(matchedGroupMap, groupId, hostId, 'domain');
          }
        }
      }

      // 按IP搜索
      for (const [ip, entries] of this.searchIndex.ips.entries()) {
        if (ip.toLowerCase().includes(lowercaseKeyword)) {
          for (const [groupId, hostId] of entries) {
            this.addToMatchedResults(matchedGroupMap, groupId, hostId, 'ip');
          }
        }
      }

      // 转换为预期格式的结果
      for (const [groupId, hostMatches] of matchedGroupMap.entries()) {
        const group = this.state.hostsGroups.find(g => g.id === groupId);
        if (!group) continue;

        const matchedHosts = hostMatches
          .map(match => {
            const host = group.hosts.find(h => h.id === match.hostId);
            if (!host || !host.ip || !host.domain) return null;

            return {
              ...host,
              _matches: match.matches
            };
          })
          .filter(Boolean);

        if (matchedHosts.length > 0) {
          matchedGroups.push({
            id: group.id,
            name: group.name,
            hosts: matchedHosts,
            matchCount: matchedHosts.length
          });
          totalMatches += matchedHosts.length;
        }
      }

      return { matchedGroups, totalMatches };
    } catch (error) {
      console.error('搜索处理失败:', error);
      return { matchedGroups: [], totalMatches: 0, error };
    }
  }

  /**
   * 辅助方法：添加到匹配结果中
   * @private
   */
  addToMatchedResults(matchedGroupMap, groupId, hostId, matchType) {
    if (!matchedGroupMap.has(groupId)) {
      matchedGroupMap.set(groupId, []);
    }

    // 检查是否已添加过
    const existingMatch = matchedGroupMap.get(groupId).find(m => m.hostId === hostId);

    if (existingMatch) {
      existingMatch.matches[matchType] = true;
    } else {
      matchedGroupMap.get(groupId).push({
        hostId,
        matches: { [matchType]: true }
      });
    }
  }

  /**
   * 强制刷新状态
   * @returns {Promise<void>}
   */
  async forceRefresh() {
    try {
      const data = await this.getStorageData(['hostsGroups', 'activeGroups', 'socketProxy', 'showAddGroupForm']);

      this.state.hostsGroups = data.hostsGroups || [];
      this.state.activeGroups = data.activeGroups || [];
      this.state.socketProxy = this.normalizeSocketProxyConfig(data.socketProxy || this.state.socketProxy);
      this.state.showAddGroupForm = data.showAddGroupForm || false;

      this.buildSearchIndices();
      this.notifyListeners();
    } catch (error) {
      console.error('强制刷新状态失败:', error);
      throw error;
    }
  }
}

// 单例模式
export default new StateService();
