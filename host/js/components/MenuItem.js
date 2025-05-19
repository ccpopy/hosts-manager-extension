/**
 * 创建菜单项组件
 * @param {string} text - 菜单项文本
 * @param {string} tab - 关联的标签页ID
 * @param {boolean} isActive - 是否激活
 * @param {string} iconSvg - 图标SVG
 * @returns {HTMLElement} - 菜单项DOM元素
 */
export function createMenuItem (text, tab, isActive, iconSvg) {
  const menuItem = document.createElement('div');
  menuItem.className = isActive ? 'menu-item active' : 'menu-item';
  menuItem.dataset.tab = tab;
  menuItem.innerHTML = iconSvg + `<span>${text}</span>`;
  return menuItem;
}

/**
 * 设置菜单导航功能
 */
export function setupMenuNavigation () {
  const menuItems = document.querySelectorAll('.menu-item');
  const contentEls = document.querySelectorAll('.tab-content');

  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      // 移除所有活动状态
      menuItems.forEach(i => i.classList.remove('active'));
      contentEls.forEach(c => c.classList.remove('active'));

      // 设置当前活动选项卡
      item.classList.add('active');
      const tabName = item.dataset.tab;
      document.querySelector(`.${tabName}-tab`).classList.add('active');
    });
  });
}