/**
 * 搜索服务
 * 提供对主机规则的搜索功能
 */
export default class SearchService {
  /**
   * 搜索主机
   * @param {Array} groups - 分组数组
   * @param {string} keyword - 搜索关键字
   * @returns {Object} - 包含匹配的分组和主机信息
   */
  static search (groups, keyword) {
    if (!keyword) {
      return {
        matchedGroups: [],
        totalMatches: 0
      };
    }

    const lowercaseKeyword = keyword.toLowerCase();
    const matchedGroups = [];
    let totalMatches = 0;

    groups.forEach(group => {
      const matchedHosts = [];

      // 遍历所有主机，找出所有匹配的主机
      group.hosts.forEach(host => {
        const ipMatch = host.ip.toLowerCase().includes(lowercaseKeyword);
        const domainMatch = host.domain.toLowerCase().includes(lowercaseKeyword);

        if (ipMatch || domainMatch) {
          // 添加匹配的主机到结果
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

  /**
   * 高亮文本中的关键字
   * @param {string} text - 原始文本
   * @param {string} keyword - 要高亮的关键字
   * @returns {string} - 包含高亮HTML的文本
   */
  static highlightText (text, keyword) {
    if (!keyword || !text) {
      return text;
    }

    // 转义特殊字符，避免正则表达式注入
    const escKeyword = this.escapeRegExp(keyword);

    // 创建一个不区分大小写的全局正则表达式
    const regex = new RegExp(`(${escKeyword})`, 'gi');

    // 替换所有匹配项为高亮标记
    return text.replace(regex, '<span class="highlight">$1</span>');
  }

  /**
   * 转义正则表达式特殊字符
   * @param {string} string - 要转义的字符串
   * @returns {string} - 转义后的字符串
   */
  static escapeRegExp (string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}