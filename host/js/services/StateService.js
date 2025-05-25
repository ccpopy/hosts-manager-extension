/**
 * 状态服务
 * 提供全局状态管理并与 Chrome 存储同步
 */
class StateService {
  constructor() {
    // 初始状态
    this.state = {
      hostsGroups: [],
      activeGroups: [],
      socketProxy: {
        host: '',
        port: '',
        enabled: false,
        auth: {
          enabled: false,
          username: '',
          password: ''
        }
      },
      showAddGroupForm: false
    };

    // 订阅者列表
    this.listeners = [];

    // 操作队列，用于防止并发存储操作
    this.operationQueue = Promise.resolve();

    // 状态是否已初始化
    this.initialized = false;

    // 节流控制
    this.saveThrottleTimeout = null;
    // 单位：毫秒
    this.THROTTLE_DELAY = 500;

    // 搜索索引 - 用于优化搜索性能
    this.searchIndex = {
      domains: new Map(), // domain -> [groupId, hostId][]
      ips: new Map()      // ip -> [groupId, hostId][]
    };

    // 相关状态
    this.pacProxyState = {
      updating: false,
      lastUpdateTime: 0,
      updateCount: 0
    };
  }

  /**
   * 初始化状态服务
   * @returns {Promise<void>}
   */
  async initialize () {
    if (this.initialized) return;

    try {
      const data = await this.getStorageData(['hostsGroups', 'activeGroups', 'socketProxy', 'showAddGroupForm']);

      this.state.hostsGroups = data.hostsGroups || [];
      this.state.activeGroups = data.activeGroups || [];
      this.state.socketProxy = data.socketProxy || {
        host: '',
        port: '',
        enabled: false,
        auth: {
          enabled: false,
          username: '',
          password: ''
        }
      };
      this.state.showAddGroupForm = data.showAddGroupForm || false;

      // 构建搜索索引
      this.buildSearchIndices();

      this.initialized = true;
      this.notifyListeners();

      // 监听存储变化
      this.setupStorageListener();

      return Promise.resolve();
    } catch (error) {
      console.error('初始化状态服务失败:', error);
      return Promise.reject(error);
    }
  }

  /**
   * 获取Chrome存储数据
   * @param {Array<string>} keys - 要获取的键
   * @returns {Promise<object>}
   */
  getStorageData (keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(keys, result => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 设置Chrome存储数据
   * @param {object} data - 要存储的数据
   * @returns {Promise<void>}
   */
  setStorageData (data) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(data, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 监听存储变化
   */
  setupStorageListener () {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      let stateChanged = false;

      if (changes.hostsGroups && !this.isEqual(this.state.hostsGroups, changes.hostsGroups.newValue)) {
        this.state.hostsGroups = changes.hostsGroups.newValue || [];
        this.buildSearchIndices();
        stateChanged = true;
      }

      if (changes.activeGroups && !this.isEqual(this.state.activeGroups, changes.activeGroups.newValue)) {
        this.state.activeGroups = changes.activeGroups.newValue || [];
        stateChanged = true;
      }

      if (changes.socketProxy && !this.isEqual(this.state.socketProxy, changes.socketProxy.newValue)) {
        this.state.socketProxy = changes.socketProxy.newValue || {
          host: '',
          port: '',
          enabled: false,
          auth: {
            enabled: false,
            username: '',
            password: ''
          }
        };
        stateChanged = true;
      }

      if (changes.showAddGroupForm && this.state.showAddGroupForm !== changes.showAddGroupForm.newValue) {
        this.state.showAddGroupForm = changes.showAddGroupForm.newValue || false;
        stateChanged = true;
      }

      if (stateChanged) {
        this.notifyListeners();
      }
    });
  }

  /**
   * 深度比较两个对象是否相等
   * @param {any} obj1 - 对象1
   * @param {any} obj2 - 对象2
   * @returns {boolean}
   */
  isEqual (obj1, obj2) {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
  }

  /**
   * 将状态保存到存储中
   * @param {boolean} [immediate=false] - 是否立即保存，不使用节流
   * @returns {Promise<void>}
   */
  saveState (immediate = false) {
    // 清除之前的节流定时器
    if (this.saveThrottleTimeout) {
      clearTimeout(this.saveThrottleTimeout);
      this.saveThrottleTimeout = null;
    }

    const performSave = () => {
      // 将操作添加到队列
      this.operationQueue = this.operationQueue
        .then(() => this.setStorageData({
          hostsGroups: this.state.hostsGroups,
          activeGroups: this.state.activeGroups,
          socketProxy: this.state.socketProxy,
          showAddGroupForm: this.state.showAddGroupForm
        }))
        .then(() => this.updateProxySettings())
        .then(() => {
          this.notifyListeners();
        })
        .catch(error => {
          console.error('保存状态失败:', error);
          // 在失败时也通知监听器，以便UI可以做出反应
          this.notifyListeners();
          return Promise.reject(error);
        });

      return this.operationQueue;
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
   * 更新PAC脚本代理设置
   * @returns {Promise<void>}
   */
  updateProxySettings () {
    return new Promise((resolve, reject) => {
      try {
        // 防止过于频繁的更新
        const now = Date.now();
        if (this.pacProxyState.updating) {
          // 如果正在更新，等待一段时间后重试
          setTimeout(() => {
            this.updateProxySettings().then(resolve).catch(reject);
          }, 200);
          return;
        }

        this.pacProxyState.updating = true;
        this.pacProxyState.lastUpdateTime = now;
        this.pacProxyState.updateCount++;

        // 超时处理
        const timeoutId = setTimeout(() => {
          this.pacProxyState.updating = false;
          reject(new Error('更新代理设置和规则超时'));
        }, 15000);

        chrome.runtime.sendMessage({ action: 'updateProxySettings' }, response => {
          clearTimeout(timeoutId);
          this.pacProxyState.updating = false;

          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && !response.success) {
            reject(new Error(response.error || '更新代理设置失败'));
          } else {
            resolve();
          }
        });
      } catch (error) {
        this.pacProxyState.updating = false;
        reject(error);
      }
    });
  }

  /**
   * 获取当前状态
   * @returns {object} 当前状态对象
   */
  getState () {
    return this.state;
  }

  /**
   * 订阅状态变化
   * @param {Function} listener - 监听函数，会在状态变化时调用
   * @returns {Function} 取消订阅的函数
   */
  subscribe (listener) {
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
  notifyListeners () {
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
  buildSearchIndices () {
    // 清空旧索引
    this.searchIndex.domains.clear();
    this.searchIndex.ips.clear();

    // 构建新索引
    this.state.hostsGroups.forEach(group => {
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
  async addGroup (group, active = true) {
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
  async updateGroup (groupId, updates) {
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
  async deleteGroup (groupId) {
    // 备份原始状态
    const originalGroups = [...this.state.hostsGroups];
    const originalActiveGroups = [...this.state.activeGroups];

    // 更新状态
    this.state.hostsGroups = this.state.hostsGroups.filter(g => g.id !== groupId);
    this.state.activeGroups = this.state.activeGroups.filter(id => id !== groupId);

    try {
      // 立即保存，不使用节流，因为需要立即更新规则
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
  async toggleGroup (groupId, enabled) {
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
      // 立即保存，因为需要立即更新规则
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
  async addHost (groupId, host) {
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
      // 立即保存，因为需要立即更新规则
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
  async updateHost (groupId, hostId, updates) {
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
      // 根据更新类型决定是否立即保存
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
  async toggleHost (groupId, hostId, enabled) {
    const result = await this.updateHost(groupId, hostId, { enabled });
    return result !== null;
  }

  /**
   * 删除主机
   * @param {string} groupId - 分组ID
   * @param {string} hostId - 主机ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteHost (groupId, hostId) {
    const groupIndex = this.state.hostsGroups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return false;

    const group = this.state.hostsGroups[groupIndex];
    // 备份原始主机列表
    const originalHosts = [...group.hosts];

    // 过滤掉要删除的主机
    this.state.hostsGroups[groupIndex].hosts = group.hosts.filter(h => h.id !== hostId);

    try {
      // 立即保存，因为需要立即更新规则
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
  async updateSocketProxy (proxy) {
    // 备份原始代理配置
    const originalProxy = { ...this.state.socketProxy };

    // 合并认证信息
    if (!proxy.auth && this.state.socketProxy.auth) {
      proxy.auth = { ...this.state.socketProxy.auth };
    }

    // 应用更新
    this.state.socketProxy = {
      ...this.state.socketProxy,
      ...proxy
    };

    try {
      // 立即保存，因为代理设置更改需要立即生效
      await this.saveState(true);
      return true;
    } catch (error) {
      this.state.socketProxy = originalProxy;
      console.error('更新代理设置失败:', error);
      return false;
    }
  }

  /**
   * 更新Socket代理认证信息
   * @param {object} auth - 认证信息
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateSocketProxyAuth (auth) {
    // 备份原始代理认证配置
    const originalAuth = this.state.socketProxy.auth
      ? { ...this.state.socketProxy.auth }
      : { enabled: false, username: '', password: '' };

    // 确保auth对象存在
    if (!this.state.socketProxy.auth) {
      this.state.socketProxy.auth = {
        enabled: false,
        username: '',
        password: ''
      };
    }

    // 应用更新
    this.state.socketProxy.auth = {
      ...this.state.socketProxy.auth,
      ...auth
    };

    try {
      await this.saveState(true);
      return true;
    } catch (error) {
      this.state.socketProxy.auth = originalAuth;
      console.error('更新代理认证设置失败:', error);
      return false;
    }
  }

  /**
   * 批量导入主机规则
   * @param {string} groupId - 分组ID
   * @param {string} rulesText - 规则文本
   * @returns {Promise<object>} 导入结果
   */
  async batchImportHosts (groupId, rulesText) {
    const groupIndex = this.state.hostsGroups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) {
      return {
        success: false,
        message: '未找到指定的分组',
        imported: 0,
        skipped: 0
      };
    }

    const group = this.state.hostsGroups[groupIndex];
    const originalHosts = [...group.hosts];

    const lines = rulesText.split('\n');
    let imported = 0;
    let skipped = 0;
    let newHostIds = [];

    // 解析规则
    for (const line of lines) {
      const trimmedLine = line.trim();

      // 跳过空行和注释
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        skipped++;
        continue;
      }

      // 解析规则
      const parts = trimmedLine.split(/\s+/);
      if (parts.length >= 2) {
        const ip = parts[0];
        const domain = parts[1];

        // 简单验证IP格式
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (ipRegex.test(ip)) {
          // 检查是否已存在
          const exists = group.hosts.some(h => h.ip === ip && h.domain === domain);
          if (!exists) {
            const newHostId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            newHostIds.push(newHostId);

            group.hosts.push({
              id: newHostId,
              ip,
              domain,
              enabled: true
            });
            imported++;
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    // 如果有导入的规则，保存状态
    if (imported > 0) {
      try {
        // 立即保存，因为需要立即更新规则
        await this.saveState(true);
        return { success: true, imported, skipped };
      } catch (error) {

        this.state.hostsGroups[groupIndex].hosts = originalHosts;
        console.error('批量导入失败:', error);
        return {
          success: false,
          message: '保存规则时出错: ' + error.message,
          imported: 0,
          skipped: lines.length
        };
      }
    }

    return { success: true, imported, skipped };
  }

  /**
   * 搜索主机规则
   * @param {string} keyword - 搜索关键字
   * @returns {object} 搜索结果
   */
  search (keyword) {
    if (!keyword) {
      return { matchedGroups: [], totalMatches: 0 };
    }

    try {
      const lowercaseKeyword = keyword.toLowerCase();
      const matchedGroups = [];
      let totalMatches = 0;

      // 使用索引加速搜索，groupId -> matchedHosts[]
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

        // 过滤掉可能的null值，并做数据验证
        const matchedHosts = hostMatches
          .map(match => {
            const host = group.hosts.find(h => h.id === match.hostId);
            if (!host) return null;

            // 验证主机数据的完整性
            if (!host.ip || !host.domain) return null;

            return {
              ...host,
              _matches: match.matches
            };
          })
          .filter(Boolean); // 移除null值

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
      // 发生错误时返回空结果
      return { matchedGroups: [], totalMatches: 0, error };
    }
  }

  /**
   * 辅助方法：添加到匹配结果中
   * @private
   */
  addToMatchedResults (matchedGroupMap, groupId, hostId, matchType) {
    if (!matchedGroupMap.has(groupId)) {
      matchedGroupMap.set(groupId, []);
    }

    // 检查是否已添加过
    const existingMatch = matchedGroupMap.get(groupId).find(m => m.hostId === hostId);

    if (existingMatch) {
      // 更新匹配类型
      existingMatch.matches[matchType] = true;
    } else {
      // 添加新匹配
      matchedGroupMap.get(groupId).push({
        hostId,
        matches: { [matchType]: true }
      });
    }
  }

  /**
   * 设置是否显示添加分组表单
   * @param {boolean} show - 是否显示
   * @returns {Promise<void>}
   */
  async setShowAddGroupForm (show) {
    this.state.showAddGroupForm = show;

    try {
      // 只保存showAddGroupForm，不保存整个状态
      await this.setStorageData({ showAddGroupForm: show });
      this.notifyListeners();
      return Promise.resolve();
    } catch (error) {
      console.error('设置表单显示状态失败:', error);
      return Promise.reject(error);
    }
  }

  /**
   * 强制刷新状态
   * 用于确保视图与实际状态同步
   * @param {boolean} [notifyListeners=true] - 是否通知监听器
   * @returns {Promise<void>}
   */
  async forceRefresh (notifyListeners = true) {
    try {
      // 重新从存储获取最新状态
      const data = await this.getStorageData(['hostsGroups', 'activeGroups', 'socketProxy', 'showAddGroupForm']);

      // 更新内部状态
      this.state.hostsGroups = data.hostsGroups || [];
      this.state.activeGroups = data.activeGroups || [];
      this.state.socketProxy = data.socketProxy || {
        host: '',
        port: '',
        enabled: false,
        auth: {
          enabled: false,
          username: '',
          password: ''
        }
      };
      this.state.showAddGroupForm = data.showAddGroupForm || false;

      // 重建搜索索引
      this.buildSearchIndices();

      // 通知监听器
      if (notifyListeners) {
        this.notifyListeners();
      }

      return Promise.resolve();
    } catch (error) {
      console.error('强制刷新状态失败:', error);
      return Promise.reject(error);
    }
  }

  /**
   * 检查主机是否存在于任何分组中
   * @param {string} hostId - 主机ID
   * @returns {boolean} - 是否存在
   */
  hasHost (hostId) {
    if (!hostId) return false;

    try {
      return this.state.hostsGroups.some(group =>
        group.hosts && group.hosts.some(host => host.id === hostId)
      );
    } catch (error) {
      console.error('检查主机是否存在失败:', error);
      return false;
    }
  }

  /**
   * 获取主机所在的分组
   * @param {string} hostId - 主机ID
   * @returns {object|null} - {groupId, hostIndex, group, host} 或 null
   */
  findHostLocation (hostId) {
    if (!hostId) return null;

    try {
      for (const group of this.state.hostsGroups) {
        if (!group.hosts) continue;

        const hostIndex = group.hosts.findIndex(h => h.id === hostId);
        if (hostIndex !== -1) {
          return {
            groupId: group.id,
            hostIndex,
            group,
            host: group.hosts[hostIndex]
          };
        }
      }
    } catch (error) {
      console.error('查找主机位置失败:', error);
    }

    return null;
  }

  /**
   * 同步所有更新到存储
   * 当可能有多个视图需要同步时使用
   * @returns {Promise<boolean>} - 是否成功
   */
  async syncAll () {
    try {
      // 立即保存所有状态，不使用节流
      await this.saveState(true);

      // 触发代理更新
      await this.updateProxySettings();

      // 通知所有监听器
      this.notifyListeners();

      return true;
    } catch (error) {
      console.error('同步所有更新失败:', error);
      return false;
    }
  }

  /**
   * 获取PAC脚本代理状态
   * @returns {object} PAC脚本代理状态信息
   */
  getPacProxyState () {
    return {
      ...this.pacProxyState,
      hostsCount: Object.keys(this.state.hostsGroups.reduce((acc, group) => {
        if (this.state.activeGroups.includes(group.id)) {
          group.hosts.forEach(host => {
            if (host.enabled) {
              acc[host.domain] = host.ip;
            }
          });
        }
        return acc;
      }, {})).length
    };
  }
}

// 单例模式
export default new StateService();