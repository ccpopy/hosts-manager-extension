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
    this.currentKeyword = ''; // 添加属性跟踪当前关键字
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
      this.currentKeyword = keyword; // 更新当前关键字
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

    clearButton.addEventListener('click', (e) => {
      searchInput.value = '';
      clearButton.style.display = 'none';
      searchInput.focus();
      this.clearSearch(); // 使用新的清除方法
    });

    // 监听按下 Escape 键
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.currentKeyword) {
        searchInput.value = '';
        clearButton.style.display = 'none';
        this.clearSearch(); // 使用新的清除方法
      }
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
   * 清空搜索栏并触发自定义事件
   */
  clearSearch () {
    const hadKeyword = !!this.currentKeyword;
    this.currentKeyword = '';

    // 触发搜索回调，传递空字符串表示清除搜索
    this.onSearch('');

    // 仅当之前有关键字时才触发事件
    if (hadKeyword) {
      this.dispatchClearEvent();
    }
  }

  /**
   * 触发搜索清除事件
   * 新增方法：独立触发事件，确保事件总是被触发
   */
  dispatchClearEvent () {
    try {
      // 触发一个自定义事件，通知需要刷新主视图
      const event = new CustomEvent('searchCleared', {
        bubbles: true,
        cancelable: true,
        detail: { time: new Date() }
      });

      // 确保事件能正确冒泡到文档
      if (this.element) {
        const dispatched = this.element.dispatchEvent(event);

        // 如果事件没有被成功分发，尝试在文档级别分发
        if (!dispatched) {
          document.dispatchEvent(event);
        }
      } else {
        // 如果元素不存在，直接在文档级别分发事件
        document.dispatchEvent(event);
      }
    } catch (error) {
      console.error('触发搜索清除事件失败:', error);
      // 尝试使用更简单的方式
      try {
        document.dispatchEvent(new Event('searchCleared'));
      } catch (e) {
        console.error('备用搜索清除事件触发也失败:', e);
      }
    }
  }

  /**
   * 清空搜索栏
   */
  clear () {
    const searchInput = this.element.querySelector('.search-input');
    const clearButton = this.element.querySelector('.clear-button');

    // 检查元素是否存在
    if (searchInput) {
      searchInput.value = '';
    }

    if (clearButton) {
      clearButton.style.display = 'none';
    }

    // 使用新的清除搜索方法
    this.clearSearch();
  }

  /**
   * 设置搜索关键字
   * @param {string} keyword - 搜索关键字
   */
  setKeyword (keyword) {
    const searchInput = this.element.querySelector('.search-input');
    const clearButton = this.element.querySelector('.clear-button');

    // 更新当前关键字
    this.currentKeyword = keyword;

    if (searchInput) {
      searchInput.value = keyword;
    }

    if (clearButton) {
      clearButton.style.display = keyword ? 'flex' : 'none';
    }

    this.onSearch(keyword);
  }
}