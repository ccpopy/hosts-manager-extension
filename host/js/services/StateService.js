class StateService {
  constructor() {
    this.state = {
      hostsGroups: [],
      activeGroups: [],
      socketProxy: {
        host: '',
        port: '',
        enabled: false,
        // 代理认证信息
        auth: {
          enabled: false,
          username: '',
          password: ''
        }
      },
      showAddGroupForm: false
    };
    this.listeners = [];
  }

  async initialize () {
    const data = await chrome.storage.local.get(['hostsGroups', 'activeGroups', 'socketProxy', 'showAddGroupForm']);
    this.state.hostsGroups = data.hostsGroups || [];
    this.state.activeGroups = data.activeGroups || [];
    this.state.socketProxy = data.socketProxy || { host: '', port: '', enabled: false };
    this.state.showAddGroupForm = data.showAddGroupForm || false;
    this.notifyListeners();
  }

  async saveState () {
    // 保存到Chrome存储并通知后台更新代理设置
    await chrome.storage.local.set({
      hostsGroups: this.state.hostsGroups,
      activeGroups: this.state.activeGroups,
      socketProxy: this.state.socketProxy,
      showAddGroupForm: this.state.showAddGroupForm
    });
    // 更新代理设置
    await chrome.runtime.sendMessage({ action: 'updateProxySettings' });
    // 通知所有订阅组件
    this.notifyListeners();
  }

  getState () {
    return this.state;
  }

  // 订阅状态变化
  subscribe (listener) {
    this.listeners.push(listener);
    // 返回取消订阅函数
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notifyListeners () {
    this.listeners.forEach(listener => listener(this.state));
  }

  // 分组相关方法
  async addGroup (group, active = true) {
    // 检查是否已存在同名分组
    const isNameExist = this.state.hostsGroups.some(g => g.name === group.name);
    if (isNameExist) return false;

    this.state.hostsGroups.push(group);
    if (active) {
      this.state.activeGroups.push(group.id);
    }
    await this.saveState();
    return true;
  }

  async updateGroup (groupId, updates) {
    const index = this.state.hostsGroups.findIndex(g => g.id === groupId);
    if (index === -1) return false;

    // 如果更新了名称，检查名称是否已存在
    if (updates.name && updates.name !== this.state.hostsGroups[index].name) {
      const isNameExist = this.state.hostsGroups.some(g => g.id !== groupId && g.name === updates.name);
      if (isNameExist) return false;
    }

    this.state.hostsGroups[index] = { ...this.state.hostsGroups[index], ...updates };
    await this.saveState();
    return true;
  }

  async deleteGroup (groupId) {
    this.state.hostsGroups = this.state.hostsGroups.filter(g => g.id !== groupId);
    this.state.activeGroups = this.state.activeGroups.filter(id => id !== groupId);
    await this.saveState();
    return true;
  }

  async toggleGroup (groupId, enabled) {
    if (enabled) {
      if (!this.state.activeGroups.includes(groupId)) {
        this.state.activeGroups.push(groupId);
      }
    } else {
      this.state.activeGroups = this.state.activeGroups.filter(id => id !== groupId);
    }
    await this.saveState();
    return true;
  }

  // 主机相关方法
  async addHost (groupId, host) {
    const group = this.state.hostsGroups.find(g => g.id === groupId);
    if (!group) return false;

    // 检查是否存在相同的IP和域名
    const isDuplicate = group.hosts.some(h => h.ip === host.ip && h.domain === host.domain);
    if (isDuplicate) return false;

    group.hosts.push(host);
    await this.saveState();
    return true;
  }

  async updateHost (groupId, hostId, updates) {
    const group = this.state.hostsGroups.find(g => g.id === groupId);
    if (!group) return null;

    const hostIndex = group.hosts.findIndex(h => h.id === hostId);
    if (hostIndex === -1) return null;

    // 检查更新后是否会导致重复
    if (updates.ip || updates.domain) {
      const newIp = updates.ip || group.hosts[hostIndex].ip;
      const newDomain = updates.domain || group.hosts[hostIndex].domain;

      const isDuplicate = group.hosts.some((h, idx) =>
        idx !== hostIndex && h.ip === newIp && h.domain === newDomain
      );

      if (isDuplicate) return null;
    }

    group.hosts[hostIndex] = { ...group.hosts[hostIndex], ...updates };
    await this.saveState();
    return group.hosts[hostIndex];
  }

  async toggleHost (groupId, hostId, enabled) {
    const result = await this.updateHost(groupId, hostId, { enabled });
    return result !== null;
  }

  async deleteHost (groupId, hostId) {
    const group = this.state.hostsGroups.find(g => g.id === groupId);
    if (!group) return false;

    group.hosts = group.hosts.filter(h => h.id !== hostId);
    await this.saveState();
    return true;
  }

  // Socket代理相关方法

  // 获取Socket代理配置
  async getSocketProxy () {
    return this.state.socketProxy;
  }

  // 更新Socket代理配置
  async updateSocketProxy (proxy) {
    if (!proxy.auth && this.state.socketProxy.auth) {
      proxy.auth = this.state.socketProxy.auth;
    }

    this.state.socketProxy = {
      ...this.state.socketProxy,
      ...proxy
    };

    await this.saveState();
    return true;
  }

  // 更新Socket代理认证信息
  async updateSocketProxyAuth (auth) {
    if (!this.state.socketProxy.auth) {
      this.state.socketProxy.auth = {
        enabled: false,
        username: '',
        password: ''
      };
    }

    this.state.socketProxy.auth = {
      ...this.state.socketProxy.auth,
      ...auth
    };

    await this.saveState();
    return true;
  }

  // 批量导入方法
  async batchImportHosts (groupId, rulesText) {
    const group = this.state.hostsGroups.find(g => g.id === groupId);
    if (!group) return { success: false, message: '未找到指定的分组', imported: 0, skipped: 0 };

    const lines = rulesText.split('\n');
    let imported = 0;
    let skipped = 0;

    lines.forEach(line => {
      line = line.trim();

      // 跳过空行和注释
      if (!line || line.startsWith('#')) {
        skipped++;
        return;
      }

      // 解析规则
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const ip = parts[0];
        const domain = parts[1];

        // 简单验证IP格式
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (ipRegex.test(ip)) {
          // 检查是否已存在
          const exists = group.hosts.some(h => h.ip === ip && h.domain === domain);
          if (!exists) {
            group.hosts.push({
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
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
    });

    if (imported > 0) {
      await this.saveState();
    }

    return { success: true, imported, skipped };
  }

  /**
   * 搜索主机
   * @param {string} keyword - 搜索关键字
   * @returns {Object} - 搜索结果
   */
  search (keyword) {
    if (!keyword) {
      return {
        matchedGroups: [],
        totalMatches: 0
      };
    }

    const lowercaseKeyword = keyword.toLowerCase();
    const matchedGroups = [];
    let totalMatches = 0;

    this.state.hostsGroups.forEach(group => {
      const matchedHosts = [];

      group.hosts.forEach(host => {
        const ipMatch = host.ip.toLowerCase().includes(lowercaseKeyword);
        const domainMatch = host.domain.toLowerCase().includes(lowercaseKeyword);

        if (ipMatch || domainMatch) {
          matchedHosts.push({
            ...host,
            _matches: {
              ip: ipMatch,
              domain: domainMatch
            }
          });
        }
      });

      if (matchedHosts.length > 0) {
        matchedGroups.push({
          id: group.id,
          name: group.name,
          hosts: matchedHosts,
          matchCount: matchedHosts.length
        });

        totalMatches += matchedHosts.length;
      }
    });

    return {
      matchedGroups,
      totalMatches
    };
  }

  // 添加分组表单显示控制
  async setShowAddGroupForm (show) {
    // 更新状态
    this.state.showAddGroupForm = show;

    // 保存到存储
    await chrome.storage.local.set({ showAddGroupForm: show });

    // 通知所有订阅者
    this.notifyListeners();

    return Promise.resolve();
  }
}

// 单例模式
export default new StateService(); 