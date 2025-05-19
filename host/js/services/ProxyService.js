/**
 * 代理服务，处理与代理相关的操作
 */
export default class ProxyService {
  /**
   * 更新代理设置
   * @returns {Promise<Object>} - 结果
   */
  static updateProxySettings () {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'updateProxySettings' }, (response) => {
        resolve(response || { success: true });
      });
    });
  }

  /**
   * 解析并导入规则
   * @param {string} rulesText - 规则文本
   * @param {string} groupId - 分组ID
   * @returns {Promise<Object>} - 导入结果
   */
  static async parseAndImportRules (rulesText, groupId) {
    if (!rulesText || !groupId) {
      return { success: false, message: '规则文本或分组ID不能为空', imported: 0, skipped: 0 };
    }

    const lines = rulesText.split('\n');
    let imported = 0;
    let skipped = 0;

    return new Promise((resolve) => {
      chrome.storage.local.get(['hostsGroups'], (result) => {
        const hostsGroups = result.hostsGroups || [];
        const groupIndex = hostsGroups.findIndex(g => g.id === groupId);

        if (groupIndex === -1) {
          resolve({ success: false, message: '未找到指定的分组', imported, skipped });
          return;
        }

        const group = hostsGroups[groupIndex];
        const newHosts = [];

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

            // 验证IP格式（简单验证）
            const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
            if (ipRegex.test(ip)) {
              // 检查是否已存在
              const exists = group.hosts.some(h => h.ip === ip && h.domain === domain);
              if (!exists) {
                newHosts.push({
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

        // 添加新的hosts条目
        if (newHosts.length > 0) {
          group.hosts.push(...newHosts);
          chrome.storage.local.set({ hostsGroups }, () => {
            // 发送消息到后台脚本更新代理设置
            this.updateProxySettings().then(() => {
              resolve({ success: true, imported, skipped });
            });
          });
        } else {
          resolve({ success: true, imported, skipped });
        }
      });
    });
  }
}