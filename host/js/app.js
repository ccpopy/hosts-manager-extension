import { setupMenuNavigation } from './components/MenuItem.js';
import HostsPage from './pages/HostsPage.js';
import ImportPage from './pages/ImportPage.js';
import ProxyPage from './pages/ProxyPage.js';
import StateService from './services/StateService.js';

/**
 * 应用程序类
 */
export default class App {
  /**
   * 构造函数
   * @param {HTMLElement} appContainer - 应用容器
   */
  constructor(appContainer) {
    this.appContainer = appContainer;
    this.currentPage = 'hosts';

    // 页面实例
    this.pages = {
      hosts: null,
      import: null,
      proxy: null
    };

    // 页面容器
    this.pageContainers = {
      hosts: null,
      import: null,
      proxy: null
    };

    // 当前活跃的页面实例
    this.activePage = null;
  }

  /**
   * 初始化应用程序
   */
  async init () {
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

    header.appendChild(title);
    container.appendChild(header);

    // 内容区域
    const contentArea = document.createElement('div');
    contentArea.className = 'content-area';

    // 侧边栏菜单
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';

    // Hosts配置菜单项
    const hostsMenuItem = document.createElement('div');
    hostsMenuItem.className = 'menu-item active';
    hostsMenuItem.dataset.tab = 'hosts';
    hostsMenuItem.innerHTML = `
      <svg class="menu-icon" style="vertical-align: middle;fill: currentColor;overflow: hidden;" viewBox="0 0 1069 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M746.027944 190.083832q-11.241517 0-18.906188-7.664671t-12.774451-17.884232-7.664671-20.9501-2.55489-17.884232l0-125.700599 2.043912 0q9.197605 0 17.373253 2.043912t19.928144 9.708583 28.61477 21.461078 42.411178 36.279441q27.592814 24.526946 43.944112 41.389222t25.037924 28.61477 10.730539 19.928144 2.043912 14.307385l0 16.351297-150.227545 0zM1063.856287 671.42515q3.065868 8.175649 4.087824 20.439122t-10.219561 23.50499q-5.10978 5.10978-9.197605 9.708583t-7.153693 7.664671q-4.087824 4.087824-7.153693 6.131737l-86.866267-85.844311q6.131737-5.10978 13.796407-12.263473t12.774451-11.241517q12.263473-11.241517 26.570858-9.708583t23.50499 6.642715q10.219561 5.10978 21.972056 17.884232t17.884232 27.081836zM703.105788 766.467066q22.483034 0 37.812375-12.263473l-198.259481 206.43513-282.05988 0q-19.417166 0-42.411178-11.241517t-42.922156-29.636727-33.213573-42.411178-13.285429-49.56487l0-695.952096q0-21.461078 9.708583-44.966068t26.570858-42.411178 38.323353-31.680639 44.966068-12.774451l391.409182 0 0 127.744511q0 19.417166 6.131737 41.9002t18.906188 41.389222 33.213573 31.680639 49.053892 12.774451l149.205589 0 0 338.267465-140.007984 145.117764q11.241517-16.351297 11.241517-35.768463 0-26.570858-18.906188-45.477046t-45.477046-18.906188l-383.233533 0q-26.570858 0-44.966068 18.906188t-18.39521 45.477046 18.39521 44.966068 44.966068 18.39521l383.233533 0zM319.872255 383.233533q-26.570858 0-44.966068 18.906188t-18.39521 45.477046 18.39521 44.966068 44.966068 18.39521l383.233533 0q26.570858 0 45.477046-18.39521t18.906188-44.966068-18.906188-45.477046-45.477046-18.906188l-383.233533 0zM705.149701 895.233533l13.285429-13.285429 25.548902-25.548902q15.329341-15.329341 33.724551-34.235529t36.790419-37.301397q43.944112-43.944112 99.129741-98.107784l85.844311 85.844311-99.129741 99.129741-36.790419 36.790419-33.724551 33.724551q-14.307385 14.307385-24.015968 24.526946t-10.730539 11.241517q-5.10978 4.087824-11.241517 8.686627t-12.263473 7.664671-18.906188 7.664671-26.05988 8.686627-25.548902 7.153693-18.39521 4.087824q-12.263473 2.043912-16.351297-3.065868t-2.043912-17.373253q1.021956-6.131737 4.087824-18.39521t7.153693-25.037924 7.664671-24.015968 5.620758-15.329341q6.131737-13.285429 16.351297-23.50499z"></path></svg>
      <span>Hosts 配置</span>
    `;

    // 批量导入菜单项
    const batchImportMenuItem = document.createElement('div');
    batchImportMenuItem.className = 'menu-item';
    batchImportMenuItem.dataset.tab = 'import';
    batchImportMenuItem.innerHTML = `
      <svg class="menu-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-5L9 2H4z" clip-rule="evenodd"/>
      </svg>
      <span>批量导入</span>
    `;

    // Socket代理菜单项
    const proxyMenuItem = document.createElement('div');
    proxyMenuItem.className = 'menu-item';
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
    contentArea.appendChild(sidebar);

    // 主内容区
    const mainContent = document.createElement('div');
    mainContent.className = 'main-content';

    // Hosts 配置内容
    const hostsContent = document.createElement('div');
    hostsContent.className = 'tab-content hosts-tab active';
    this.pageContainers.hosts = hostsContent;

    // 批量导入内容
    const importContent = document.createElement('div');
    importContent.className = 'tab-content import-tab';
    this.pageContainers.import = importContent;

    // Socket 代理内容
    const proxyContent = document.createElement('div');
    proxyContent.className = 'tab-content proxy-tab';
    this.pageContainers.proxy = proxyContent;

    // 添加内容到主内容区
    mainContent.appendChild(hostsContent);
    mainContent.appendChild(importContent);
    mainContent.appendChild(proxyContent);
    contentArea.appendChild(mainContent);

    // 添加内容区到容器
    container.appendChild(contentArea);

    // 添加容器到应用容器
    this.appContainer.appendChild(container);
  }

  /**
   * 初始化当前页面
   */
  async initCurrentPage () {
    await this.switchPage(this.currentPage);
  }

  /**
 * 切换到指定页面
 * @param {string} pageName - 页面名称
 */
  async switchPage (pageName) {
    // 如果当前页面是 hosts 页面，并且有搜索状态，清除搜索
    if (this.currentPage === 'hosts' && this.pages.hosts) {
      if (this.pages.hosts.searchKeyword) {
        // 如果有搜索栏，清除搜索
        if (this.pages.hosts.searchBar) {
          this.pages.hosts.searchBar.clear();
        }
      }
    }

    // 如果有活跃页面，销毁它
    if (this.activePage && typeof this.activePage.destroy === 'function') {
      this.activePage.destroy();
    }
    // 确保切换页面时清除之前的页面实例
    this.pages[this.currentPage] = null;

    this.currentPage = pageName;
    await this.initPage(pageName);

    // 更新活跃页面引用
    this.activePage = this.pages[pageName];

    // 更新UI
    const menuItems = document.querySelectorAll('.menu-item');
    const contentEls = document.querySelectorAll('.tab-content');

    menuItems.forEach(i => i.classList.remove('active'));
    contentEls.forEach(c => c.classList.remove('active'));

    document.querySelector(`.menu-item[data-tab="${pageName}"]`).classList.add('active');
    document.querySelector(`.${pageName}-tab`).classList.add('active');
  }

  /**
   * 初始化指定页面
   * @param {string} pageName - 页面名称
   */
  async initPage (pageName) {
    if (!this.pages[pageName]) {
      const container = this.pageContainers[pageName];

      switch (pageName) {
        case 'hosts':
          this.pages.hosts = new HostsPage(container);
          await this.pages.hosts.init();
          break;
        case 'import':
          this.pages.import = new ImportPage(container);
          await this.pages.import.init();
          break;
        case 'proxy':
          this.pages.proxy = new ProxyPage(container);
          await this.pages.proxy.init();
          break;
      }
    }
  }

  /**
   * 设置菜单事件
   */
  setupMenuEvents () {
    const menuItems = document.querySelectorAll('.menu-item');

    menuItems.forEach(item => {
      item.addEventListener('click', async () => {
        await this.switchPage(item.dataset.tab);
      });
    });
  }
}