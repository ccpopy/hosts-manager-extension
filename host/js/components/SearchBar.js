/**
 * 搜索栏组件
 * 用于创建搜索栏UI和处理搜索逻辑
 */
export default class SearchBar {
  /**
   * 构造函数
   * @param {Function} onSearch - 搜索回调函数，接收搜索关键字参数
   */
  constructor(onSearch) {
    this.onSearch = onSearch;
    this.element = this.createSearchBar();
  }

  /**
   * 创建搜索栏
   * @returns {HTMLElement} - 搜索栏DOM元素
   */
  createSearchBar () {
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';

    // 添加搜索图标
    const searchIcon = document.createElement('span');
    searchIcon.className = 'search-icon';
    searchIcon.innerHTML = `
      <svg fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"></path>
      </svg>
    `;

    // 搜索输入框
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'search-input';
    searchInput.placeholder = '搜索IP或域名...';

    // 清除按钮
    const clearButton = document.createElement('span');
    clearButton.className = 'clear-button';
    clearButton.innerHTML = `
      <svg fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
      </svg>
    `;
    clearButton.style.display = 'none';

    // 添加事件监听
    searchInput.addEventListener('input', () => {
      const keyword = searchInput.value.trim();
      clearButton.style.display = keyword ? 'flex' : 'none';
      this.onSearch(keyword);
    });

    // 输入框获得焦点时的动画效果
    searchInput.addEventListener('focus', () => {
      searchContainer.classList.add('focused');
    });

    searchInput.addEventListener('blur', () => {
      searchContainer.classList.remove('focused');
    });

    clearButton.addEventListener('click', () => {
      searchInput.value = '';
      clearButton.style.display = 'none';
      searchInput.focus();
      this.onSearch('');
    });

    // 组装搜索栏
    searchContainer.appendChild(searchIcon);
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(clearButton);

    return searchContainer;
  }

  /**
   * 获取搜索栏元素
   * @returns {HTMLElement} - 搜索栏DOM元素
   */
  getElement () {
    return this.element;
  }

  /**
   * 清空搜索栏
   */
  clear () {
    const searchInput = this.element.querySelector('.search-input');
    const clearButton = this.element.querySelector('.clear-button');

    if (searchInput) {
      searchInput.value = '';
    }

    if (clearButton) {
      clearButton.style.display = 'none';
    }

    // 触发搜索回调，传递空字符串表示清除搜索
    this.onSearch('');

    // 触发一个自定义事件，通知需要刷新主视图
    const event = new CustomEvent('searchCleared', {
      bubbles: true
    });
    this.element.dispatchEvent(event);
  }

  /**
   * 设置搜索关键字
   * @param {string} keyword - 搜索关键字
   */
  setKeyword (keyword) {
    const searchInput = this.element.querySelector('.search-input');
    const clearButton = this.element.querySelector('.clear-button');

    if (searchInput) {
      searchInput.value = keyword;
    }

    if (clearButton) {
      clearButton.style.display = keyword ? 'flex' : 'none';
    }

    this.onSearch(keyword);
  }
}