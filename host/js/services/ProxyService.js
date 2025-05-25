/**
 * 代理服务
 * 处理与代理相关的操作，包括代理设置更新和规则导入
 */
import { parseHostRule, isValidIp, isValidDomain, normalizeHostRule } from '../utils/ValidationUtils.js';

export default class ProxyService {
  /**
   * 更新代理设置
   * 向后台脚本发送消息，更新Chrome代理配置和declarativeNetRequest规则
   * @returns {Promise<Object>} - 结果对象
   */
  static updateProxySettings () {
    return new Promise((resolve, reject) => {
      try {
        const timeoutId = setTimeout(() => {
          reject(new Error('更新代理设置超时，后台脚本可能未响应'));
        }, 10000);

        chrome.runtime.sendMessage({ action: 'updateProxySettings' }, (response) => {
          clearTimeout(timeoutId);

          if (chrome.runtime.lastError) {
            reject(new Error(`代理更新错误: ${chrome.runtime.lastError.message}`));
            return;
          }

          if (!response) {
            reject(new Error('未收到来自后台脚本的响应'));
            return;
          }

          if (!response.success) {
            reject(new Error(response.error || '代理更新失败'));
            return;
          }

          resolve(response);
        });
      } catch (error) {
        reject(new Error(`更新代理设置失败: ${error.message}`));
      }
    });
  }

  /**
   * 验证 SOCKS 代理配置
   * @param {object} proxy - 代理配置
   * @returns {object} - 验证结果 {valid: boolean, message: string}
   */
  static validateProxyConfig (proxy) {
    if (!proxy) {
      return { valid: false, message: '代理配置不能为空' };
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

    // 验证认证信息（如果启用）
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
   * 解析并导入规则
   * @param {string} rulesText - 规则文本
   * @param {string} groupId - 分组ID
   * @param {object} [options] - 导入选项
   * @param {boolean} [options.skipDuplicates=true] - 是否跳过重复规则
   * @param {boolean} [options.enableRules=true] - 是否默认启用规则
   * @param {boolean} [options.updateProxyImmediately=true] - 是否立即更新代理
   * @returns {Promise<Object>} - 导入结果
   */
  static async parseAndImportRules (rulesText, groupId, options = {}) {
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

    // 结果统计
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

      // 使用分块处理大量规则，避免阻塞UI
      const processRulesBatch = async (lines, startIndex) => {
        //批处理大小
        const batchSize = 50;
        const endIndex = Math.min(startIndex + batchSize, lines.length);

        for (let i = startIndex; i < endIndex; i++) {
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

          // 额外验证IP和域名格式
          if (!isValidIp(ip)) {
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
                // 仅更新启用状态
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

        // 处理下一批，如果还有
        if (endIndex < lines.length) {
          // 异步处理下一批，避免阻塞UI
          await new Promise(resolve => setTimeout(resolve, 10));
          return processRulesBatch(lines, endIndex);
        }

        return;
      };

      // 分割规则行并处理第一批
      const lines = rulesText.split('\n');
      await processRulesBatch(lines, 0);

      // 添加新的hosts条目
      if (newHosts.length > 0) {
        group.hosts.push(...newHosts);
        await this.saveHostsGroups(hostsGroups);

        // 是否立即更新代理设置和declarativeNetRequest规则
        if (settings.updateProxyImmediately) {
          try {
            await this.updateProxySettings();
          } catch (error) {
            console.warn('导入后更新代理设置失败:', error);
            // 不影响导入结果，但在错误数组中记录
            result.errors.push(`更新代理设置失败: ${error.message}`);
          }
        }
      }

      // 设置结果
      result.success = true;

      // 添加详细信息
      if (result.duplicates.length > 0) {
        result.message = `成功导入 ${result.imported} 条规则，${result.skipped} 条被跳过，包含 ${result.duplicates.length} 条重复规则`;
      } else if (result.invalidRules.length > 0) {
        result.message = `成功导入 ${result.imported} 条规则，${result.skipped} 条被跳过，包含 ${result.invalidRules.length} 条无效规则`;
      } else {
        result.message = `成功导入 ${result.imported} 条规则，${result.skipped} 条被跳过`;
      }

      // 如果有错误但导入成功，添加到消息中
      if (result.errors.length > 0) {
        result.message += `（存在 ${result.errors.length} 个警告）`;
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
   * 将指定分组或所有分组的规则导出为文本
   * @param {string} [groupId] - 分组ID，不指定则导出所有分组
   * @param {object} [options] - 导出选项
   * @param {boolean} [options.includeDisabled=false] - 是否包含已禁用的规则
   * @param {boolean} [options.includeGroupHeaders=true] - 是否包含分组标题
   * @param {boolean} [options.includeComments=true] - 是否包含注释
   * @returns {Promise<string>} - 导出的规则文本
   */
  static async exportRules (groupId, options = {}) {
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
   * 在导入前验证所有规则的有效性
   * @param {string} rulesText - 规则文本
   * @returns {Promise<Object>} - 验证结果
   */
  static async validateBatchRules (rulesText) {
    if (!rulesText || typeof rulesText !== 'string') {
      return {
        valid: 0,
        invalid: 0,
        errors: [],
        warnings: []
      };
    }

    const lines = rulesText.split('\n');
    const result = {
      valid: 0,
      invalid: 0,
      errors: [],
      warnings: []
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // 跳过空行和注释
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

      // 验证IP
      if (!isValidIp(ip)) {
        result.invalid++;
        result.errors.push({
          line: lineNumber,
          content: line,
          error: 'IP地址格式无效'
        });
        continue;
      }

      // 验证域名
      if (!isValidDomain(domain)) {
        result.invalid++;
        result.errors.push({
          line: lineNumber,
          content: line,
          error: '域名格式无效'
        });
        continue;
      }

      // 检查是否为特殊域名
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
  static async getHostsGroups () {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(['hostsGroups'], (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`获取主机组失败: ${chrome.runtime.lastError.message}`));
            return;
          }

          resolve(result.hostsGroups || []);
        });
      } catch (error) {
        reject(new Error(`获取主机组失败: ${error.message}`));
      }
    });
  }

  /**
   * 保存主机组
   * @param {Array} hostsGroups - 主机组数组
   * @returns {Promise<void>}
   * @private
   */
  static async saveHostsGroups (hostsGroups) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set({ hostsGroups }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(`保存主机组失败: ${chrome.runtime.lastError.message}`));
            return;
          }

          resolve();
        });
      } catch (error) {
        reject(new Error(`保存主机组失败: ${error.message}`));
      }
    });
  }
}