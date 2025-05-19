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