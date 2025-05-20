/**
 * 搜索服务
 * 提供对主机规则的搜索功能
 */
export default class SearchService {
  /**
   * 高亮文本中的关键字
   * @param {string} text - 原始文本
   * @param {string} keyword - 要高亮的关键字
   * @returns {string} - 包含高亮HTML的文本
   */
  static highlightText (text, keyword) {
    if (!keyword || !text) {
      return text || '';
    }

    try {
      // 转义特殊字符，避免正则表达式注入
      const escKeyword = this.escapeRegExp(keyword);

      // 创建一个不区分大小写的全局正则表达式
      const regex = new RegExp(`(${escKeyword})`, 'gi');

      // 替换所有匹配项为高亮标记
      return text.replace(regex, '<span class="highlight">$1</span>');
    } catch (error) {
      console.error('搜索高亮处理失败:', error);
      // 发生错误时返回原始文本
      return text;
    }
  }

  /**
   * 转义正则表达式特殊字符
   * @param {string} string - 要转义的字符串
   * @returns {string} - 转义后的字符串
   */
  static escapeRegExp (string) {
    if (!string || typeof string !== 'string') {
      return '';
    }
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 提取高亮的关键字
   * @param {string} highlightedHtml - 包含高亮标记的HTML
   * @returns {string|null} - 提取的关键字或null
   */
  static extractKeyword (highlightedHtml) {
    if (!highlightedHtml) return null;

    try {
      const match = highlightedHtml.match(/<span class="highlight">(.+?)<\/span>/);
      if (match && match[1]) {
        return match[1];
      }
    } catch (error) {
      console.error('提取搜索关键字失败:', error);
    }

    return null;
  }

  /**
   * 移除文本中的高亮标记
   * @param {string} highlightedHtml - 包含高亮标记的HTML
   * @returns {string} - 移除标记后的文本
   */
  static removeHighlight (highlightedHtml) {
    if (!highlightedHtml) return '';

    try {
      return highlightedHtml.replace(/<span class="highlight">(.+?)<\/span>/g, '$1');
    } catch (error) {
      console.error('移除搜索高亮失败:', error);
      return highlightedHtml;
    }
  }

  /**
   * 将搜索结果转换为平面列表
   * 用于数据导出或批量操作
   * @param {Object} searchResult - 搜索结果对象
   * @returns {Array} - 主机对象数组
   */
  static flattenSearchResult (searchResult) {
    if (!searchResult || !searchResult.matchedGroups) {
      return [];
    }

    const flatList = [];

    try {
      searchResult.matchedGroups.forEach(group => {
        if (group.hosts && Array.isArray(group.hosts)) {
          group.hosts.forEach(host => {
            flatList.push({
              ...host,
              groupId: group.id,
              groupName: group.name
            });
          });
        }
      });
    } catch (error) {
      console.error('展平搜索结果失败:', error);
    }

    return flatList;
  }
}