/**
 * 代理服务
 * 处理与代理相关的操作，包括代理设置更新和规则导入
 */
import {
  parseHostRule,
  isValidIpAddress,
  isValidDomain,
  normalizeHostRule,
  normalizeBypassRules as normalizeBypassRulesUtil,
  normalizeBypassRule
} from '../utils/ValidationUtils.js';
import MessageBridge from '../utils/MessageBridge.js';

export default class ProxyService {
  /**
   * 更新代理设置
   * 向后台脚本发送消息，更新Chrome代理配置
   * @returns {Promise<Object>} - 结果对象
   */
  static async updateProxySettings() {
    try {
      return await MessageBridge.updateProxySettings();
    } catch (error) {
      console.error('ProxyService: 更新代理设置失败', error);
      throw error;
    }
  }

  /**
   * 验证代理配置
   * @param {object} proxy - 代理配置
   * @returns {object} - 验证结果 {valid: boolean, message: string}
   */
  static validateProxyConfig(proxy) {
    if (!proxy) {
      return { valid: false, message: '代理配置不能为空' };
    }

    // 验证白名单
    if (proxy.bypassList) {
      const { invalid } = this.normalizeBypassRules(proxy.bypassList);
      if (invalid.length > 0) {
        return {
          valid: false,
          message: `白名单存在无效规则，例如: ${invalid[0]}`
        };
      }
    }

    // 如果禁用，则不需要验证其他字段
    if (!proxy.enabled) {
      return { valid: true };
    }

    // 验证主机
    if (!proxy.host || !proxy.host.trim()) {
      return { valid: false, message: '代理主机不能为空' };
    }

    // 验证端口
    if (!proxy.port) {
      return { valid: false, message: '代理端口不能为空' };
    }

    const port = Number(proxy.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      return { valid: false, message: '代理端口必须是 1-65535 之间的数字' };
    }

    // 验证认证信息
    if (proxy.auth && proxy.auth.enabled) {
      if (!proxy.auth.username || !proxy.auth.username.trim()) {
        return { valid: false, message: '代理用户名不能为空' };
      }

      if (!proxy.auth.password) {
        return { valid: false, message: '代理密码不能为空' };
      }
    }

    return { valid: true };
  }

  /**
   * 规范化代理白名单规则
   * @param {string|Array<string>} rules - 原始规则
   * @returns {{rules: Array<string>, invalid: Array<string>}} - 规范化后的规则及无效条目
   */
  static normalizeBypassRules(rules) {
    const normalized = normalizeBypassRulesUtil(rules);
    const invalid = [];

    // 收集无效规则
    const list = Array.isArray(rules) ? rules : (rules || '').split(/\r?\n|,/);
    for (const raw of list) {
      if (!raw || typeof raw !== 'string' || !raw.trim()) continue;
      if (!normalizeBypassRule(raw)) {
        invalid.push(raw.trim());
      }
    }

    return { rules: normalized, invalid };
  }

  /**
   * 解析并导入规则
   * @param {string} rulesText - 规则文本
   * @param {string} groupId - 分组ID
   * @param {object} [options] - 导入选项
   * @returns {Promise<Object>} - 导入结果
   */
  static async parseAndImportRules(rulesText, groupId, options = {}) {
    // 设置默认选项
    const settings = {
      skipDuplicates: true,
      enableRules: true,
      updateProxyImmediately: true,
      ...options
    };

    if (!rulesText || !groupId) {
      return {
        success: false,
        message: '规则文本或分组ID不能为空',
        imported: 0,
        skipped: 0,
        errors: []
      };
    }

    const result = {
      success: false,
      imported: 0,
      skipped: 0,
      errors: [],
      duplicates: [],
      invalidRules: []
    };

    try {
      // 获取当前分组
      const hostsGroups = await this.getHostsGroups();
      const groupIndex = hostsGroups.findIndex(g => g.id === groupId);

      if (groupIndex === -1) {
        return {
          ...result,
          message: '未找到指定的分组'
        };
      }

      const group = hostsGroups[groupIndex];
      const newHosts = [];

      // 分割规则行
      const lines = rulesText.split('\n');

      // 批量处理规则
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 跳过空行和注释
        if (!line || line.startsWith('#')) {
          result.skipped++;
          continue;
        }

        // 解析规则
        const parsedRule = parseHostRule(line);

        if (!parsedRule) {
          result.skipped++;
          result.invalidRules.push({ line, index: i + 1, reason: '格式无效' });
          continue;
        }

        const { ip, domain } = parsedRule;

        // 验证IP和域名格式
        if (!isValidIpAddress(ip)) {
          result.skipped++;
          result.invalidRules.push({ line, index: i + 1, reason: 'IP地址格式无效' });
          continue;
        }

        if (!isValidDomain(domain)) {
          result.skipped++;
          result.invalidRules.push({ line, index: i + 1, reason: '域名格式无效' });
          continue;
        }

        // 规范化规则
        const normalized = normalizeHostRule(ip, domain);
        if (!normalized) {
          result.skipped++;
          result.invalidRules.push({ line, index: i + 1, reason: '规则规范化失败' });
          continue;
        }

        // 检查是否已存在
        const exists = group.hosts.some(h => h.ip === normalized.ip && h.domain === normalized.domain);

        if (exists) {
          if (settings.skipDuplicates) {
            result.skipped++;
            result.duplicates.push({ ip: normalized.ip, domain: normalized.domain, index: i + 1 });
          } else {
            // 找到重复规则并更新
            const hostIndex = group.hosts.findIndex(h => h.ip === normalized.ip && h.domain === normalized.domain);
            if (hostIndex !== -1) {
              group.hosts[hostIndex].enabled = settings.enableRules;
              result.imported++;
            }
          }
        } else {
          // 创建新规则
          newHosts.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            ...normalized,
            enabled: settings.enableRules
          });
          result.imported++;
        }
      }

      // 添加新的hosts条目
      if (newHosts.length > 0) {
        group.hosts.push(...newHosts);
        await this.saveHostsGroups(hostsGroups);

        // 是否立即更新代理设置
        if (settings.updateProxyImmediately) {
          try {
            await this.updateProxySettings();
          } catch (error) {
            console.warn('导入后更新代理设置失败:', error);
            result.errors.push(`更新代理设置失败: ${error.message}`);
          }
        }
      }

      // 设置结果
      result.success = true;

      // 构建消息
      if (result.duplicates.length > 0) {
        result.message = `成功导入 ${result.imported} 条规则，${result.skipped} 条被跳过，包含 ${result.duplicates.length} 条重复规则`;
      } else if (result.invalidRules.length > 0) {
        result.message = `成功导入 ${result.imported} 条规则，${result.skipped} 条被跳过，包含 ${result.invalidRules.length} 条无效规则`;
      } else {
        result.message = `成功导入 ${result.imported} 条规则，${result.skipped} 条被跳过`;
      }

      return result;
    } catch (error) {
      console.error('解析并导入规则失败:', error);
      return {
        ...result,
        success: false,
        message: `导入失败: ${error.message}`
      };
    }
  }

  /**
   * 导出规则
   * @param {string} [groupId] - 分组ID，不指定则导出所有分组
   * @param {object} [options] - 导出选项
   * @returns {Promise<string>} - 导出的规则文本
   */
  static async exportRules(groupId, options = {}) {
    // 设置默认选项
    const settings = {
      includeDisabled: false,
      includeGroupHeaders: true,
      includeComments: true,
      ...options
    };

    try {
      const hostsGroups = await this.getHostsGroups();
      let output = '';

      // 添加注释头
      if (settings.includeComments) {
        const date = new Date().toISOString().split('T')[0];
        output += `# Hosts Manager - 导出的规则\n`;
        output += `# 导出日期: ${date}\n`;
      }

      // 确定要导出的分组
      let groupsToExport = [];

      if (groupId) {
        // 导出指定分组
        const group = hostsGroups.find(g => g.id === groupId);
        if (group) {
          groupsToExport = [group];
        } else {
          throw new Error('未找到指定的分组');
        }
      } else {
        // 导出所有分组
        groupsToExport = hostsGroups;
      }

      // 处理每个分组
      for (const group of groupsToExport) {
        // 添加分组标题
        if (settings.includeGroupHeaders) {
          output += `# ${group.name}\n`;
        }

        // 过滤和排序主机规则
        const hosts = [...group.hosts];

        // 按域名排序
        hosts.sort((a, b) => a.domain.localeCompare(b.domain));

        // 处理每条规则
        for (const host of hosts) {
          // 如果设置不包含禁用规则，则跳过
          if (!settings.includeDisabled && !host.enabled) {
            continue;
          }

          // 添加注释标记已禁用的规则
          if (!host.enabled && settings.includeComments) {
            output += `# 已禁用: `;
          }

          // 添加规则
          output += `${host.ip} ${host.domain}\n`;
        }

        // 分组之间添加空行
        output += '\n';
      }

      return output;
    } catch (error) {
      console.error('导出规则失败:', error);
      throw error;
    }
  }

  /**
   * 批量验证规则
   * @param {string} rulesText - 规则文本
   * @returns {Promise<Object>} - 验证结果
   */
  static async validateBatchRules(rulesText) {
    if (!rulesText || typeof rulesText !== 'string') {
      return { valid: 0, invalid: 0, errors: [], warnings: [] };
    }

    const lines = rulesText.split('\n');
    const result = { valid: 0, invalid: 0, errors: [], warnings: [] };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      if (!line || line.startsWith('#')) {
        continue;
      }

      const parsedRule = parseHostRule(line);

      if (!parsedRule) {
        result.invalid++;
        result.errors.push({
          line: lineNumber,
          content: line,
          error: '规则格式无效'
        });
        continue;
      }

      const { ip, domain } = parsedRule;

      if (!isValidIpAddress(ip)) {
        result.invalid++;
        result.errors.push({
          line: lineNumber,
          content: line,
          error: 'IP地址格式无效'
        });
        continue;
      }

      if (!isValidDomain(domain)) {
        result.invalid++;
        result.errors.push({
          line: lineNumber,
          content: line,
          error: '域名格式无效'
        });
        continue;
      }

      if (domain.includes('localhost') || domain.includes('127.0.0.1')) {
        result.warnings.push({
          line: lineNumber,
          content: line,
          warning: '本地地址可能不需要代理'
        });
      }

      result.valid++;
    }

    return result;
  }

  /**
   * 获取主机组
   * @returns {Promise<Array>} - 主机组数组
   * @private
   */
  static async getHostsGroups() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['hostsGroups'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`获取主机组失败: ${chrome.runtime.lastError.message}`));
          return;
        }

        resolve(result.hostsGroups || []);
      });
    });
  }

  /**
   * 保存主机组
   * @param {Array} hostsGroups - 主机组数组
   * @returns {Promise<void>}
   * @private
   */
  static async saveHostsGroups(hostsGroups) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ hostsGroups }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(`保存主机组失败: ${chrome.runtime.lastError.message}`));
          return;
        }

        resolve();
      });
    });
  }
}
