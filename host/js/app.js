/**
 * 应用程序类
 * 主要负责应用初始化、页面导航和生命周期管理
 */
import { setupMenuNavigation } from './components/MenuItem.js';
import StateService from './services/StateService.js';
import { Message } from './utils/MessageUtils.js';

// 页面类懒加载导入
const pageModules = {
  hosts: () => import('./pages/HostsPage.js').then(m => m.default),
  import: () => import('./pages/ImportPage.js').then(m => m.default),
  proxy: () => import('./pages/ProxyPage.js').then(m => m.default)
};

export default class App {
  /**
   * 构造函数
   * @param {HTMLElement} appContainer - 应用容器
   */
  constructor(appContainer) {
    this.appContainer = appContainer;
    this.currentPage = 'hosts';

    // 页面实例缓存
    this.pages = {
      hosts: null,
      import: null,
      proxy: null
    };

    // 页面容器缓存
    this.pageContainers = {
      hosts: null,
      import: null,
      proxy: null
    };

    // 当前活跃的页面实例
    this.activePage = null;

    // 应用状态
    this.state = {
      initialized: false,
      loading: false,
      error: null,
      pageTransitionInProgress: false,
      pendingNavigations: []
    };

    // 页面历史
    this.history = [];

    // 创建错误边界
    this.setupErrorBoundary();
  }

  /**
   * 设置错误边界
   * 捕获应用级别的错误
   */
  setupErrorBoundary () {
    window.addEventListener('error', (event) => {
      console.error('应用错误:', event.error);
      this.handleAppError(event.error);
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('未处理的 Promise 拒绝:', event.reason);
      this.handleAppError(event.reason);
    });
  }

  /**
   * 处理应用错误
   * @param {Error} error - 错误对象
   */
  handleAppError (error) {
    // 设置应用错误状态
    this.state.error = error;

    // 显示错误提示
    Message.error(`应用发生错误: ${error.message || '未知错误'}`);

    // 如果应用已初始化，显示错误UI
    if (this.state.initialized) {
      this.renderErrorUI();
    }
  }

  /**
   * 渲染错误UI
   */
  renderErrorUI () {
    // 只有在容器有效时才渲染
    if (!this.appContainer) return;

    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-container';
    errorContainer.style.padding = '32px';
    errorContainer.style.textAlign = 'center';
    errorContainer.style.color = 'var(--error-dark)';
    errorContainer.style.backgroundColor = 'var(--error-light)';
    errorContainer.style.borderRadius = 'var(--rounded-xl)';
    errorContainer.style.margin = '24px';

    const errorTitle = document.createElement('h2');
    errorTitle.textContent = '应用发生错误';
    errorTitle.style.marginBottom = '16px';

    const errorMessage = document.createElement('p');
    errorMessage.textContent = this.state.error.message || '未知错误';
    errorMessage.style.marginBottom = '24px';

    const reloadButton = document.createElement('button');
    reloadButton.className = 'button button-primary';
    reloadButton.textContent = '重新加载应用';
    reloadButton.addEventListener('click', () => {
      window.location.reload();
    });

    errorContainer.appendChild(errorTitle);
    errorContainer.appendChild(errorMessage);
    errorContainer.appendChild(reloadButton);

    // 保留头部，替换内容区域
    const contentArea = this.appContainer.querySelector('.content-area');
    if (contentArea) {
      contentArea.innerHTML = '';
      contentArea.appendChild(errorContainer);
    } else {
      this.appContainer.innerHTML = '';
      this.appContainer.appendChild(errorContainer);
    }
  }

  /**
   * 初始化应用程序
   * @returns {Promise<void>}
   */
  async init () {
    try {
      this.state.loading = true;

      // 显示加载指示器
      this.showLoadingIndicator();

      // 初始化状态服务
      await StateService.initialize();

      // 创建基础布局
      await this.createLayout();

      // 初始化当前页面
      await this.initCurrentPage();

      // 设置菜单导航
      setupMenuNavigation();

      // 监听菜单点击事件
      this.setupMenuEvents();

      // 添加弹窗层容器
      this.setupOverlayContainer();

      // 监听浏览器历史
      this.setupHistoryTracking();

      // 移除加载指示器
      this.hideLoadingIndicator();

      // 更新应用状态
      this.state.initialized = true;
      this.state.loading = false;

      // 处理任何挂起的导航请求
      this.processPendingNavigations();
    } catch (error) {
      console.error('初始化应用失败:', error);
      this.handleAppError(error);
    }
  }

  /**
   * 显示加载指示器
   */
  showLoadingIndicator () {
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'app-loading-indicator';
    loadingIndicator.style.position = 'fixed';
    loadingIndicator.style.top = '0';
    loadingIndicator.style.left = '0';
    loadingIndicator.style.width = '100%';
    loadingIndicator.style.height = '3px';
    loadingIndicator.style.backgroundColor = 'var(--primary-color)';
    loadingIndicator.style.zIndex = '9999';
    loadingIndicator.style.animation = 'loading-bar 2s infinite';

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes loading-bar {
        0% { width: 0; left: 0; }
        50% { width: 30%; left: 30%; }
        100% { width: 0; left: 100%; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(loadingIndicator);
  }

  /**
   * 隐藏加载指示器
   */
  hideLoadingIndicator () {
    const loadingIndicator = document.getElementById('app-loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.animation = 'loading-bar-complete 0.5s forwards';

      // 添加完成动画
      const style = document.createElement('style');
      style.textContent = `
        @keyframes loading-bar-complete {
          0% { width: 30%; left: 30%; }
          100% { width: 100%; left: 0; opacity: 0; }
        }
      `;
      document.head.appendChild(style);

      // 动画完成后移除元素
      setTimeout(() => {
        if (loadingIndicator.parentNode) {
          loadingIndicator.parentNode.removeChild(loadingIndicator);
        }
      }, 500);
    }
  }

  /**
   * 创建弹窗层容器
   */
  setupOverlayContainer () {
    // 检查是否已存在
    if (document.getElementById('app-overlay-container')) return;

    const overlayContainer = document.createElement('div');
    overlayContainer.id = 'app-overlay-container';
    overlayContainer.style.position = 'fixed';
    overlayContainer.style.top = '0';
    overlayContainer.style.left = '0';
    overlayContainer.style.width = '100%';
    overlayContainer.style.height = '100%';
    overlayContainer.style.pointerEvents = 'none';
    overlayContainer.style.zIndex = '1000';

    document.body.appendChild(overlayContainer);
  }

  /**
   * 设置历史跟踪
   */
  setupHistoryTracking () {
    // 监听 popstate 事件，处理浏览器的后退/前进
    window.addEventListener('popstate', (event) => {
      if (event.state && event.state.page) {
        this.switchPage(event.state.page, false);
      }
    });

    // 初始推送当前页面到历史
    window.history.replaceState({ page: this.currentPage }, '', '');
  }

  /**
   * 创建应用布局
   */
  async createLayout () {
    // 清空容器
    this.appContainer.innerHTML = '';

    // 创建容器
    const container = document.createElement('div');
    container.className = 'container';

    // 顶部标题栏
    const header = document.createElement('div');
    header.className = 'header';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'Hosts Manager';

    const versionInfo = document.createElement('span');
    versionInfo.className = 'version-info';
    versionInfo.textContent = 'v1.0.3';
    versionInfo.style.fontSize = '12px';
    versionInfo.style.marginLeft = '8px';
    versionInfo.style.color = 'var(--gray-500)';
    title.appendChild(versionInfo);

    header.appendChild(title);

    // 添加顶部操作按钮
    const headerActions = document.createElement('div');
    headerActions.className = 'header-actions';
    headerActions.style.display = 'flex';
    headerActions.style.gap = '16px';

    // GitHub 链接
    const githubLink = document.createElement('a');
    githubLink.href = 'https://github.com/ccpopy/hosts-manager-extension';
    githubLink.target = '_blank';
    githubLink.className = 'header-action-link';
    githubLink.title = '查看项目源码';
    githubLink.innerHTML = `
      <svg height="20" width="20" viewBox="0 0 16 16" version="1.1" style="fill: var(--gray-600)">
        <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
      </svg>
    `;
    headerActions.appendChild(githubLink);

    header.appendChild(headerActions);
    container.appendChild(header);

    // 内容区域
    const contentArea = document.createElement('div');
    contentArea.className = 'content-area';

    // 侧边栏菜单
    const sidebar = this.createSidebar();
    contentArea.appendChild(sidebar);

    // 主内容区
    const mainContent = document.createElement('div');
    mainContent.className = 'main-content';

    // 创建各页面容器
    for (const pageId of Object.keys(this.pageContainers)) {
      const pageContainer = document.createElement('div');
      pageContainer.className = `tab-content ${pageId}-tab`;
      pageContainer.style.display = pageId === this.currentPage ? 'block' : 'none';
      pageContainer.style.height = '100%';
      pageContainer.style.opacity = '1';
      pageContainer.style.transition = 'opacity 0.3s ease';

      this.pageContainers[pageId] = pageContainer;
      mainContent.appendChild(pageContainer);
    }

    contentArea.appendChild(mainContent);
    container.appendChild(contentArea);

    // 添加容器到应用容器
    this.appContainer.appendChild(container);
  }

  /**
   * 创建侧边栏
   * @returns {HTMLElement} 侧边栏元素
   */
  createSidebar () {
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';

    // Hosts配置菜单项
    const hostsMenuItem = document.createElement('div');
    hostsMenuItem.className = 'menu-item' + (this.currentPage === 'hosts' ? ' active' : '');
    hostsMenuItem.dataset.tab = 'hosts';
    hostsMenuItem.innerHTML = `
      <svg class="menu-icon" style="vertical-align: middle;fill: currentColor;overflow: hidden;" viewBox="0 0 1069 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M746.027944 190.083832q-11.241517 0-18.906188-7.664671t-12.774451-17.884232-7.664671-20.9501-2.55489-17.884232l0-125.700599 2.043912 0q9.197605 0 17.373253 2.043912t19.928144 9.708583 28.61477 21.461078 42.411178 36.279441q27.592814 24.526946 43.944112 41.389222t25.037924 28.61477 10.730539 19.928144 2.043912 14.307385l0 16.351297-150.227545 0zM1063.856287 671.42515q3.065868 8.175649 4.087824 20.439122t-10.219561 23.50499q-5.10978 5.10978-9.197605 9.708583t-7.153693 7.664671q-4.087824 4.087824-7.153693 6.131737l-86.866267-85.844311q6.131737-5.10978 13.796407-12.263473t12.774451-11.241517q12.263473-11.241517 26.570858-9.708583t23.50499 6.642715q10.219561 5.10978 21.972056 17.884232t17.884232 27.081836zM703.105788 766.467066q22.483034 0 37.812375-12.263473l-198.259481 206.43513-282.05988 0q-19.417166 0-42.411178-11.241517t-42.922156-29.636727-33.213573-42.411178-13.285429-49.56487l0-695.952096q0-21.461078 9.708583-44.966068t26.570858-42.411178 38.323353-31.680639 44.966068-12.774451l391.409182 0 0 127.744511q0 19.417166 6.131737 41.9002t18.906188 41.389222 33.213573 31.680639 49.053892 12.774451l149.205589 0 0 338.267465-140.007984 145.117764q11.241517-16.351297 11.241517-35.768463 0-26.570858-18.906188-45.477046t-45.477046-18.906188l-383.233533 0q-26.570858 0-44.966068 18.906188t-18.39521 45.477046 18.39521 44.966068 44.966068 18.39521l383.233533 0zM319.872255 383.233533q-26.570858 0-44.966068 18.906188t-18.39521 45.477046 18.39521 44.966068 44.966068 18.39521l383.233533 0q26.570858 0 45.477046-18.39521t18.906188-44.966068-18.906188-45.477046-45.477046-18.906188l-383.233533 0zM705.149701 895.233533l13.285429-13.285429 25.548902-25.548902q15.329341-15.329341 33.724551-34.235529t36.790419-37.301397q43.944112-43.944112 99.129741-98.107784l85.844311 85.844311-99.129741 99.129741-36.790419 36.790419-33.724551 33.724551q-14.307385 14.307385-24.015968 24.526946t-10.730539 11.241517q-5.10978 4.087824-11.241517 8.686627t-12.263473 7.664671-18.906188 7.664671-26.05988 8.686627-25.548902 7.153693-18.39521 4.087824q-12.263473 2.043912-16.351297-3.065868t-2.043912-17.373253q1.021956-6.131737 4.087824-18.39521t7.153693-25.037924 7.664671-24.015968 5.620758-15.329341q6.131737-13.285429 16.351297-23.50499z"></path></svg>
      <span>Hosts 配置</span>
    `;

    // Hosts 批处理菜单项
    const batchImportMenuItem = document.createElement('div');
    batchImportMenuItem.className = 'menu-item' + (this.currentPage === 'import' ? ' active' : '');
    batchImportMenuItem.dataset.tab = 'import';
    batchImportMenuItem.innerHTML = `
      <svg class="menu-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-5L9 2H4z" clip-rule="evenodd"/>
      </svg>
      <span>Hosts 批处理</span>
    `;

    // Socket代理菜单项
    const proxyMenuItem = document.createElement('div');
    proxyMenuItem.className = 'menu-item' + (this.currentPage === 'proxy' ? ' active' : '');
    proxyMenuItem.dataset.tab = 'proxy';
    proxyMenuItem.innerHTML = `
      <svg class="menu-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
      </svg>
      <span>Socket 代理</span>
    `;

    // 添加菜单项到侧边栏
    sidebar.appendChild(hostsMenuItem);
    sidebar.appendChild(batchImportMenuItem);
    sidebar.appendChild(proxyMenuItem);

    return sidebar;
  }

  /**
   * 初始化当前页面
   */
  async initCurrentPage () {
    try {
      await this.switchPage(this.currentPage);
    } catch (error) {
      console.error(`初始化页面 "${this.currentPage}" 失败:`, error);
      this.handleAppError(error);
    }
  }

  /**
   * 切换到指定页面
   * @param {string} pageName - 页面名称
   * @param {boolean} [addToHistory=true] - 是否添加到历史记录
   * @returns {Promise<void>}
   */
  async switchPage (pageName, addToHistory = true) {
    // 如果页面切换正在进行，将导航添加到挂起队列
    if (this.state.pageTransitionInProgress) {
      this.state.pendingNavigations.push({ pageName, addToHistory });
      return;
    }

    try {
      this.state.pageTransitionInProgress = true;

      // 如果当前页面是 hosts 页面，并且有搜索状态，清除搜索
      if (this.currentPage === 'hosts' && this.pages.hosts && this.pages.hosts.searchKeyword) {
        if (this.pages.hosts.searchBar) {
          this.pages.hosts.searchBar.clear();
        }
      }

      // 清除错误状态
      this.state.error = null;

      // 获取当前页面和目标页面的容器
      const currentContainer = this.pageContainers[this.currentPage];
      const targetContainer = this.pageContainers[pageName];

      if (!currentContainer || !targetContainer) {
        throw new Error(`找不到页面容器: ${!currentContainer ? this.currentPage : pageName}`);
      }

      // 淡出当前页面
      currentContainer.style.opacity = '0';

      // 使用Promise确保淡出动画完成
      await new Promise(resolve => {
        // 设置淡出动画完成回调
        const onTransitionEnd = () => {
          currentContainer.removeEventListener('transitionend', onTransitionEnd);
          resolve();
        };

        // 监听动画结束事件
        currentContainer.addEventListener('transitionend', onTransitionEnd);

        // 设置超时作为备选方案（防止事件没有触发）
        setTimeout(() => {
          currentContainer.removeEventListener('transitionend', onTransitionEnd);
          resolve();
        }, 300);
      });

      // 隐藏当前页面
      currentContainer.style.display = 'none';

      // 如果有活跃页面，销毁它
      if (this.activePage && typeof this.activePage.destroy === 'function') {
        try {
          // 尝试调用destroy方法
          await Promise.resolve(this.activePage.destroy());
        } catch (destroyError) {
          console.error('页面销毁时发生错误:', destroyError);
        }

        // 确保页面实例被正确标记为已销毁
        if (this.activePage) {
          this.activePage._destroyed = true;
        }
      }

      // 更新当前页面
      this.currentPage = pageName;

      // 初始化新页面
      await this.initPage(pageName);

      // 更新活跃页面引用
      this.activePage = this.pages[pageName];

      // 显示新页面，但初始透明度为0
      targetContainer.style.display = 'block';
      targetContainer.style.opacity = '0';

      // 等待DOM更新
      await new Promise(resolve => setTimeout(resolve, 50));

      // 淡入新页面
      targetContainer.style.opacity = '1';

      // 更新菜单项高亮
      this.updateMenuHighlight(pageName);

      // 如果需要，添加到历史记录
      if (addToHistory) {
        window.history.pushState({ page: pageName }, '', '');
        this.history.push(pageName);
      }
    } catch (error) {
      console.error(`切换到页面 "${pageName}" 失败:`, error);
      this.handlePageSwitchError(error, pageName);
    } finally {
      // 标记页面切换已完成
      this.state.pageTransitionInProgress = false;

      // 处理任何挂起的导航
      this.processPendingNavigations();
    }
  }

  /**
   * 处理挂起的导航请求
   */
  processPendingNavigations () {
    if (this.state.pendingNavigations.length > 0) {
      const { pageName, addToHistory } = this.state.pendingNavigations.shift();
      this.switchPage(pageName, addToHistory);
    }
  }

  /**
   * 处理页面切换错误
   * @param {Error} error - 错误对象
   * @param {string} pageName - 页面名称
   */
  handlePageSwitchError (error, pageName) {
    // 显示错误消息
    Message.error(`切换到页面 "${pageName}" 失败: ${error.message}`);

    // 重置为上一个有效页面
    const lastValidPage = this.history.length > 0 ? this.history[this.history.length - 1] : 'hosts';

    // 尝试显示上次的有效页面
    try {
      const pageContainer = this.pageContainers[lastValidPage];
      if (pageContainer) {
        pageContainer.style.display = 'block';
        pageContainer.style.opacity = '1';

        // 更新活跃页面和当前页面
        this.currentPage = lastValidPage;
        this.activePage = this.pages[lastValidPage];

        // 更新菜单高亮
        this.updateMenuHighlight(lastValidPage);
      }
    } catch (e) {
      console.error('恢复到上一个有效页面失败:', e);
      // 如果恢复失败，显示通用错误UI
      this.renderErrorUI();
    }
  }

  /**
   * 更新菜单高亮
   * @param {string} pageName - 要高亮的页面名称
   */
  updateMenuHighlight (pageName) {
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
      if (item.dataset.tab === pageName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  /**
   * 初始化指定页面
   * @param {string} pageName - 页面名称
   * @returns {Promise<void>}
   */
  async initPage (pageName) {
    // 如果页面已经初始化且没有被销毁，重新初始化它
    if (this.pages[pageName]) {
      if (!this.pages[pageName]._destroyed) {
        try {
          // 尝试调用destroy方法（如果存在）
          if (typeof this.pages[pageName].destroy === 'function') {
            await Promise.resolve(this.pages[pageName].destroy());
          }
        } catch (destroyError) {
          console.error(`销毁页面 "${pageName}" 时发生错误:`, destroyError);
        }
      }

      // 确保页面实例被重置
      this.pages[pageName] = null;
    }

    try {
      const container = this.pageContainers[pageName];

      // 清空容器，移除可能存在的错误UI
      container.innerHTML = '';

      // 显示页面加载指示器
      this.showPageLoadingIndicator(container);

      // 模拟网络延迟以展示过渡动画
      await new Promise(resolve => setTimeout(resolve, 300));

      // 动态导入页面组件
      if (!pageModules[pageName]) {
        throw new Error(`未找到页面模块: ${pageName}`);
      }

      const PageClass = await pageModules[pageName]();

      // 创建页面实例
      this.pages[pageName] = new PageClass(container);

      // 移除页面加载指示器
      this.hidePageLoadingIndicator(container);

      // 初始化页面
      await this.pages[pageName].init();

      // 标记页面为活跃状态
      this.pages[pageName]._destroyed = false;
    } catch (error) {
      console.error(`初始化页面 "${pageName}" 失败:`, error);

      // 移除页面加载指示器
      this.hidePageLoadingIndicator(this.pageContainers[pageName]);

      // 渲染页面级错误UI
      this.renderPageErrorUI(this.pageContainers[pageName], error);

      throw error;
    }
  }

  /**
   * 显示页面加载指示器
   * @param {HTMLElement} container - 页面容器
   */
  showPageLoadingIndicator (container) {
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'page-loading-indicator';
    loadingIndicator.style.textAlign = 'center';
    loadingIndicator.style.padding = '64px 0';
    loadingIndicator.style.color = 'var(--gray-500)';

    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.margin = '0 auto 16px';
    spinner.style.border = '3px solid var(--gray-200)';
    spinner.style.borderTop = '3px solid var(--primary-color)';
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'spin 1s linear infinite';

    const loadingText = document.createElement('div');
    loadingText.textContent = '加载中...';

    // 添加动画样式
    if (!document.getElementById('loading-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'loading-spinner-style';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    loadingIndicator.appendChild(spinner);
    loadingIndicator.appendChild(loadingText);
    container.appendChild(loadingIndicator);
  }

  /**
   * 隐藏页面加载指示器
   * @param {HTMLElement} container - 页面容器
   */
  hidePageLoadingIndicator (container) {
    const loadingIndicator = container.querySelector('.page-loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
  }

  /**
   * 渲染页面级错误UI
   * @param {HTMLElement} container - 页面容器
   * @param {Error} error - 错误对象
   */
  renderPageErrorUI (container, error) {
    container.innerHTML = '';

    const errorContainer = document.createElement('div');
    errorContainer.className = 'page-error-container';
    errorContainer.style.padding = '32px';
    errorContainer.style.textAlign = 'center';
    errorContainer.style.color = 'var(--error-dark)';
    errorContainer.style.backgroundColor = 'var(--error-light)';
    errorContainer.style.borderRadius = 'var(--rounded-xl)';

    const errorTitle = document.createElement('h3');
    errorTitle.textContent = '页面加载失败';
    errorTitle.style.marginBottom = '16px';

    const errorMessage = document.createElement('p');
    errorMessage.textContent = error.message || '未知错误';
    errorMessage.style.marginBottom = '24px';

    const retryButton = document.createElement('button');
    retryButton.className = 'button button-primary';
    retryButton.textContent = '重试';
    retryButton.addEventListener('click', () => {
      // 重新初始化当前页面
      this.initPage(this.currentPage);
    });

    errorContainer.appendChild(errorTitle);
    errorContainer.appendChild(errorMessage);
    errorContainer.appendChild(retryButton);

    container.appendChild(errorContainer);
  }

  /**
   * 设置菜单事件
   */
  setupMenuEvents () {
    const menuItems = document.querySelectorAll('.menu-item');

    menuItems.forEach(item => {
      item.addEventListener('click', async () => {
        const targetPage = item.dataset.tab;

        // 如果点击当前页面，不做任何操作
        if (targetPage === this.currentPage) return;

        try {
          await this.switchPage(targetPage);
        } catch (error) {
          console.error(`菜单切换到 "${targetPage}" 失败:`, error);
        }
      });
    });
  }
}