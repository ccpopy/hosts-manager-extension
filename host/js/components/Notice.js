/**
 * 创建提示框组件
 * @param {string} message - 提示消息
 * @param {string} type - 提示类型 ('info' | 'success' | 'error')
 * @param {string} iconSvg - 图标SVG
 * @returns {HTMLElement} - 提示框DOM元素
 */
export function createNotice (message, type, iconSvg) {
  const notice = document.createElement('div');
  notice.className = `notice-box ${type}`;
  notice.innerHTML = iconSvg + `<span>${message}</span>`;
  return notice;
}