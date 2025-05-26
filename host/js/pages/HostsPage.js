import StateService from '../services/StateService.js';
import { createNotice } from '../components/Notice.js';
import { createGroupElement } from '../components/GroupItem.js';
import { createAddGroupForm } from '../components/GroupForm.js';
import { createHostElement } from '../components/HostItem.js';
import SearchBar from '../components/SearchBar.js';
import { debounce } from '../utils/PerformanceUtils.js';

// 虚拟化列表配置
const VIRTUALIZATION = {
  enabled: true,          // 启用虚拟化
  itemHeight: 42,         // 每项高度(px)
  bufferSize: 10,         // 可视区域外的缓冲项数
  renderThreshold: 100    // 启用虚拟化的最小项数
};

// 适配declarativeNetRequest的延迟配置
const DECLARATIVE_NET_REQUEST_CONFIG = {
  searchDebounceDelay: 500,    // 搜索防抖延迟，增加以适应更新时间
  updateDebounceDelay: 800,    // 状态更新防抖延迟
  maxRetries: 3,               // 最大重试次数
  retryDelay: 1000            // 重试延迟
};

export default class HostsPage {
  /**
   * 构造函数
   * @param {HTMLElement} container - 页面容器
   */
  constructor(container) {
    this.container = container;
    this.searchKeyword = '';
    this.searchBar = null;
    this.searchResultsContainer = null;
    this.groupList = null;

    // 跟踪展开状态的分组
    this.expandedGroups = new Set();

    // 缓存已渲染的组件 - 这些将被清理以确保视图同步
    this.renderedGroups = new Map(); // groupId -> DOM元素
    this.renderedHosts = new Map();  // hostId -> DOM元素
    this.searchResultHosts = new Map(); // 搜索结果中的主机缓存

    // 虚拟化列表状态
    this.virtualScroll = {
      container: null,      // 滚动容器
      totalHeight: 0,       // 总高度
      visibleItems: [],     // 可见项
      scrollPosition: 0,    // 滚动位置
      viewportHeight: 0     // 视口高度
    };

    // 性能优化: 防抖搜索，增加延迟时间
    this.performSearch = debounce(this._performSearch.bind(this), DECLARATIVE_NET_REQUEST_CONFIG.searchDebounceDelay);

    // 状态更新防抖
    this.handleStateChangeDebounced = debounce(this.handleStateChange.bind(this), DECLARATIVE_NET_REQUEST_CONFIG.updateDebounceDelay);

    // 订阅状态变化
    this.unsubscribe = StateService.subscribe(this.handleStateChangeDebounced);

    // 跟踪修改的主机和分组，用于同步视图
    this.modifiedEntities = {
      hosts: new Set(),
      groups: new Set()
    };

    // declarativeNetRequest状态监控
    this.networkRequestState = {
      updating: false,
      lastUpdateTime: 0,
      failureCount: 0
    };

    // 添加页面级事件监听器
    this.setupEventListeners();
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners () {
    // 监听搜索清除事件
    this._searchClearedHandler = this.handleSearchCleared.bind(this);
    document.addEventListener('searchCleared', this._searchClearedHandler);

    // 监听主机操作事件
    this._hostModifiedHandler = this.handleHostModified.bind(this);
    document.addEventListener('hostModified', this._hostModifiedHandler);

    // 监听网络请求更新状态
    this._networkRequestUpdateHandler = this.handleNetworkRequestUpdate.bind(this);
    document.addEventListener('networkRequestUpdate', this._networkRequestUpdateHandler);
  }

  /**
   * 处理网络请求更新事件
   * @param {CustomEvent} event - 网络请求更新事件
   */
  handleNetworkRequestUpdate (event) {
    if (event && event.detail) {
      const { status, error } = event.detail;

      this.networkRequestState.updating = status === 'updating';
      this.networkRequestState.lastUpdateTime = Date.now();

      if (error) {
        this.networkRequestState.failureCount++;
        if (this.networkRequestState.failureCount >= DECLARATIVE_NET_REQUEST_CONFIG.maxRetries) {
          this.showNetworkRequestWarning();
        }
      } else if (status === 'completed') {
        this.networkRequestState.failureCount = 0;
      }
    }
  }

  /**
   * 显示网络请求警告
   */
  showNetworkRequestWarning () {
    const existingWarning = document.querySelector('.network-request-warning');
    if (existingWarning) return; // 避免重复显示

    const warningElement = document.createElement('div');
    warningElement.className = 'network-request-warning notice-box warning';
    warningElement.style.position = 'fixed';
    warningElement.style.top = '20px';
    warningElement.style.left = '50%';
    warningElement.style.transform = 'translateX(-50%)';
    warningElement.style.zIndex = '1000';
    warningElement.style.maxWidth = '400px';
    warningElement.innerHTML = `
      <svg class="notice-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>
      <div>
        <strong>网络请求更新异常</strong><br>
        部分hosts规则可能未生效，请刷新页面重试
      </div>
      <button onclick="this.parentNode.remove()" style="margin-left: auto; background: none; border: none; font-size: 18px; cursor: pointer;">×</button>
    `;

    document.body.appendChild(warningElement);

    // 5秒后自动移除
    setTimeout(() => {
      if (warningElement.parentNode) {
        warningElement.parentNode.removeChild(warningElement);
      }
    }, 5000);
  }

  /**
   * 处理搜索清除事件
   */
  handleSearchCleared () {
    if (this.modifiedEntities.hosts.size > 0 || this.modifiedEntities.groups.size > 0) {
      this.clearElementCache();
      this.refreshMainView();
      this.modifiedEntities.hosts.clear();
      this.modifiedEntities.groups.clear();
    }
  }

  /**
   * 处理主机修改事件
   * @param {CustomEvent} event - 自定义事件
   */
  handleHostModified (event) {
    if (event && event.detail) {
      const { hostId, groupId, action } = event.detail;

      if (hostId) {
        this.modifiedEntities.hosts.add(hostId);
        this.renderedHosts.delete(hostId);
        this.searchResultHosts.delete(`search-${groupId}-${hostId}`);
      }

      if (groupId) {
        this.modifiedEntities.groups.add(groupId);
      }

      if (this.searchKeyword && hostId) {
        if (action === 'deleted') {
          this.performSearch();
        } else if (action === 'updated' || action === 'toggled') {
          this.updateSearchResultItem(groupId, hostId);
        }
      }
    }
  }

  /**
   * 更新搜索结果中的特定项
   * @param {string} groupId - 分组ID
   * @param {string} hostId - 主机ID
   */
  updateSearchResultItem (groupId, hostId) {
    if (!this.searchKeyword || !this.searchResultsContainer) return;

    try {
      // 获取最新状态
      const state = StateService.getState();
      const group = state.hostsGroups.find(g => g.id === groupId);
      if (!group) return;

      const host = group.hosts.find(h => h.id === hostId);
      if (!host) return;

      // 查找搜索结果中的元素
      const hostElement = this.searchResultsContainer.querySelector(`[data-host-id="${hostId}"][data-group-id="${groupId}"]`);
      if (!hostElement) return;

      // 创建新元素
      const updatedElement = createHostElement(
        groupId,
        host,
        this.handleHostUpdateInSearch.bind(this, groupId, hostId),
        this.searchKeyword
      );

      // 替换元素
      if (hostElement.parentNode) {
        hostElement.parentNode.replaceChild(updatedElement, hostElement);
      }
    } catch (error) {
      console.error('更新搜索结果项失败:', error);
    }
  }

  /**
   * 清除元素缓存
   * 确保下次渲染时使用最新数据
   */
  clearElementCache () {
    // 清除分组和主机的缓存
    this.renderedGroups.clear();
    this.renderedHosts.clear();
    this.searchResultHosts.clear();
  }

  /**
   * 处理状态变化
   * @param {object} state - 应用状态
   */
  handleStateChange (state) {
    try {
      if (this.searchKeyword) {
        this.performSearch();
      } else {
        this.updateMainView(state);
      }
      this.updateAddGroupFormSection(state.showAddGroupForm);
    } catch (error) {
      console.error('状态变化处理失败:', error);
      this.showErrorNotification('状态更新失败，部分内容可能不是最新的');
    }
  }

  /**
   * 显示错误通知
   * @param {string} message - 错误消息
   */
  showErrorNotification (message) {
    // 创建临时错误提示
    const errorNotification = document.createElement('div');
    errorNotification.className = 'error-notification notice-box error';
    errorNotification.style.position = 'fixed';
    errorNotification.style.top = '70px';
    errorNotification.style.right = '20px';
    errorNotification.style.zIndex = '1001';
    errorNotification.style.maxWidth = '300px';
    errorNotification.innerHTML = `
      <svg class="notice-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>
      <span>${message}</span>
    `;

    document.body.appendChild(errorNotification);

    // 3秒后自动移除
    setTimeout(() => {
      if (errorNotification.parentNode) {
        errorNotification.parentNode.removeChild(errorNotification);
      }
    }, 3000);
  }

  /**
   * 初始化页面
   */
  async init () {
    try {
      await StateService.initialize();
      const state = StateService.getState();
      this.showAddGroupForm = state.showAddGroupForm;

      // 渲染页面
      await this.render();

      // 初始化虚拟滚动
      this.initVirtualScroll();
    } catch (error) {
      console.error('初始化Hosts页面失败:', error);
      this.renderError('初始化页面失败，请刷新重试');
    }
  }

  /**
   * 渲染页面
   */
  async render () {
    const state = StateService.getState();
    this.container.innerHTML = '';

    // 标题
    const hostsTitle = document.createElement('h2');
    hostsTitle.className = 'page-title';
    hostsTitle.textContent = 'Hosts 配置管理';
    this.container.appendChild(hostsTitle);

    // 提示信息
    const notice = createNotice(
      '可以创建多个分组，每个分组可以独立启用或禁用。Chrome扩展通过PAC脚本实现hosts映射，存在一定技术限制。',
      'info',
      `<svg class="notice-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`
    );
    this.container.appendChild(notice);

    // 操作栏（添加分组和搜索）
    const actionBar = this.createActionBar();
    this.container.appendChild(actionBar);

    // 添加分组表单容器
    const addGroupFormContainer = document.createElement('div');
    addGroupFormContainer.id = 'add-group-form-container';
    this.container.appendChild(addGroupFormContainer);

    // 更新添加分组表单区域
    this.updateAddGroupFormSection(state.showAddGroupForm);

    // 搜索结果容器
    this.searchResultsContainer = document.createElement('div');
    this.searchResultsContainer.className = 'search-results';
    this.searchResultsContainer.style.display = 'none';
    this.container.appendChild(this.searchResultsContainer);

    // 分组列表容器
    this.groupListContainer = document.createElement('div');
    this.groupListContainer.className = 'group-list-container';
    this.container.appendChild(this.groupListContainer);

    // 初始渲染分组列表
    this.renderGroupList();

    // 如果有搜索关键字，立即执行搜索
    if (this.searchKeyword) {
      this.searchBar.setKeyword(this.searchKeyword);
      this.performSearch();
    }
  }

  /**
   * 渲染错误状态
   * @param {string} message - 错误消息
   */
  renderError (message) {
    this.container.innerHTML = '';

    const errorContainer = document.createElement('div');
    errorContainer.className = 'page-error-container';
    errorContainer.style.textAlign = 'center';
    errorContainer.style.padding = '64px 20px';
    errorContainer.style.color = 'var(--error-dark)';
    errorContainer.style.backgroundColor = 'var(--error-light)';
    errorContainer.style.borderRadius = 'var(--rounded-xl)';

    const errorIcon = document.createElement('div');
    errorIcon.style.fontSize = '48px';
    errorIcon.style.marginBottom = '16px';
    errorIcon.innerHTML = '⚠️';
    errorContainer.appendChild(errorIcon);

    const errorTitle = document.createElement('h3');
    errorTitle.textContent = '页面加载失败';
    errorTitle.style.marginBottom = '8px';
    errorContainer.appendChild(errorTitle);

    const errorMessage = document.createElement('p');
    errorMessage.textContent = message;
    errorMessage.style.marginBottom = '24px';
    errorContainer.appendChild(errorMessage);

    const retryButton = document.createElement('button');
    retryButton.className = 'button button-primary';
    retryButton.textContent = '重新加载';
    retryButton.addEventListener('click', () => {
      this.init();
    });
    errorContainer.appendChild(retryButton);

    this.container.appendChild(errorContainer);
  }

  /**
   * 创建操作栏
   * @returns {HTMLElement} 操作栏元素
   */
  createActionBar () {
    const actionBar = document.createElement('div');
    actionBar.className = 'action-bar';

    // 添加分组按钮
    const addGroupButton = document.createElement('div');
    addGroupButton.className = 'add-group-button';
    addGroupButton.innerHTML = '<span class="add-group-button-icon">+</span> 添加分组';
    addGroupButton.addEventListener('click', async () => {
      try {
        await StateService.setShowAddGroupForm(true);
      } catch (error) {
        console.error('Failed to set showAddGroupForm:', error);
        this.showErrorNotification('显示添加分组表单失败');
      }
    });

    actionBar.appendChild(addGroupButton);

    // 添加搜索栏
    this.searchBar = new SearchBar(keyword => {
      this.searchKeyword = keyword;
      this.performSearch();
    });

    // 搜索栏容器
    const searchBarWrapper = document.createElement('div');
    searchBarWrapper.style.display = 'flex';
    searchBarWrapper.style.alignItems = 'center';
    searchBarWrapper.appendChild(this.searchBar.getElement());

    actionBar.appendChild(searchBarWrapper);

    return actionBar;
  }

  /**
   * 初始化虚拟滚动
   */
  initVirtualScroll () {
    if (!VIRTUALIZATION.enabled) return;

    this.virtualScroll.container = this.groupListContainer;

    // 计算视口高度
    this.virtualScroll.viewportHeight = window.innerHeight -
      this.groupListContainer.getBoundingClientRect().top;

    // 添加滚动监听
    this.virtualScroll.container.addEventListener('scroll', this.handleScroll.bind(this));

    // 添加窗口大小变化监听
    window.addEventListener('resize', this.handleResize.bind(this));

    // 初始更新可见项
    this.updateVisibleItems();
  }

  /**
   * 处理滚动事件
   */
  handleScroll () {
    if (!VIRTUALIZATION.enabled) return;

    requestAnimationFrame(() => {
      this.virtualScroll.scrollPosition = this.virtualScroll.container.scrollTop;
      this.updateVisibleItems();
    });
  }

  /**
   * 处理窗口大小变化
   */
  handleResize () {
    if (!VIRTUALIZATION.enabled) return;

    this.virtualScroll.viewportHeight = window.innerHeight -
      this.virtualScroll.container.getBoundingClientRect().top;
    this.updateVisibleItems();
  }

  /**
   * 更新可见项目
   */
  updateVisibleItems () {
    if (!VIRTUALIZATION.enabled || !this.virtualScroll.container) return;

    const state = StateService.getState();
    const items = state.hostsGroups;

    // 如果总项数少于阈值，禁用虚拟化
    if (items.length < VIRTUALIZATION.renderThreshold) {
      this.renderAllGroups();
      return;
    }

    const { scrollPosition, viewportHeight } = this.virtualScroll;
    const { itemHeight, bufferSize } = VIRTUALIZATION;

    // 计算可见范围
    const startIndex = Math.max(0, Math.floor(scrollPosition / itemHeight) - bufferSize);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollPosition + viewportHeight) / itemHeight) + bufferSize
    );

    // 更新可见项
    this.virtualScroll.visibleItems = items.slice(startIndex, endIndex + 1);

    // 更新滚动容器高度
    this.virtualScroll.totalHeight = items.length * itemHeight;
    this.virtualScroll.container.style.height = `${this.virtualScroll.totalHeight}px`;

    // 渲染可见项
    this.renderVisibleGroups();
  }

  /**
   * 渲染所有分组
   */
  renderAllGroups () {
    const state = StateService.getState();
    this.renderGroups(state.hostsGroups);
  }

  /**
   * 渲染可见分组
   */
  renderVisibleGroups () {
    this.renderGroups(this.virtualScroll.visibleItems);
  }

  /**
   * 渲染分组列表
   */
  renderGroupList () {
    const state = StateService.getState();

    this.groupList = document.createElement('div');
    this.groupList.className = 'group-list';
    this.groupListContainer.appendChild(this.groupList);

    if (state.hostsGroups.length === 0 && !state.showAddGroupForm) {
      // 空状态
      this.renderEmptyState();
    } else {
      // 判断是否需要使用虚拟化
      if (VIRTUALIZATION.enabled && state.hostsGroups.length >= VIRTUALIZATION.renderThreshold) {
        // 设置容器样式
        this.groupList.style.position = 'relative';
        this.groupList.style.height = `${state.hostsGroups.length * VIRTUALIZATION.itemHeight}px`;

        // 初始渲染可见项
        this.updateVisibleItems();
      } else {
        // 直接渲染所有分组
        this.renderGroups(state.hostsGroups);
      }
    }
  }

  /**
   * 渲染空状态
   */
  renderEmptyState () {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';

    const emptyIcon = document.createElement('div');
    emptyIcon.className = 'empty-state-icon';
    emptyIcon.innerHTML = '📝';

    const emptyText = document.createElement('p');
    emptyText.textContent = '还没有任何分组，点击"添加分组"创建一个新分组开始管理hosts规则。';

    const emptyHint = document.createElement('p');
    emptyHint.style.fontSize = '14px';
    emptyHint.style.color = 'var(--gray-500)';
    emptyHint.style.marginTop = '8px';
    emptyHint.textContent = '请先添加分组。';

    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(emptyText);
    emptyState.appendChild(emptyHint);
    this.groupList.appendChild(emptyState);
  }

  /**
   * 渲染分组
   * @param {Array} groups - 分组数组
   */
  renderGroups (groups) {
    const state = StateService.getState();

    // 清空当前内容
    this.groupList.innerHTML = '';

    groups.forEach(group => {
      // 检查分组是否已修改，如果已修改则强制重新渲染
      const isModified = this.modifiedEntities.groups.has(group.id);

      // 检查缓存中是否已有该分组的DOM元素
      let groupItem = isModified ? null : this.renderedGroups.get(group.id);
      const isActive = state.activeGroups.includes(group.id);

      // 如果不存在或状态已改变，重新创建
      if (!groupItem || groupItem.dataset.active !== String(isActive)) {
        groupItem = createGroupElement(
          group,
          isActive,
          // 更新回调
          this.handleGroupUpdate.bind(this),
          // 传递展开/收起的回调
          this.handleGroupExpandToggle.bind(this)
        );

        // 存储到缓存
        this.renderedGroups.set(group.id, groupItem);
      }

      // 应用保存的展开状态
      if (this.expandedGroups.has(group.id)) {
        const content = groupItem.querySelector('.group-content');
        if (content) {
          content.style.display = 'block';

          // 展开时检查是否需要更新主机列表
          const hostElementsContainer = content.querySelector('.hosts-container');
          if (hostElementsContainer && isModified) {
            this.updateGroupHosts(group, hostElementsContainer);
          }
        }
      }

      this.groupList.appendChild(groupItem);
    });
  }

  /**
   * 更新分组内的主机列表内容
   * @param {Object} group - 分组对象
   * @param {HTMLElement} container - 主机列表容器
   */
  updateGroupHosts (group, container) {
    try {
      // 清空容器
      container.innerHTML = '';

      // 渲染主机列表
      if (group.hosts && group.hosts.length > 0) {
        group.hosts.forEach(host => {
          // 主机是否已修改
          const isHostModified = this.modifiedEntities.hosts.has(host.id);

          // 如果主机已修改，强制重新渲染
          if (isHostModified) {
            this.renderedHosts.delete(host.id);
          }

          // 主机更新回调
          const hostUpdateCallback = (action) => {
            // 触发一个自定义事件，通知主机已修改
            const event = new CustomEvent('hostModified', {
              bubbles: true,
              detail: {
                hostId: host.id,
                groupId: group.id,
                action: action
              }
            });
            document.dispatchEvent(event);

            // 处理特定操作
            if (action === 'deleted') {
              this.updateGroupHosts(group, container);
            }
          };

          try {
            const hostItem = createHostElement(group.id, host, hostUpdateCallback);
            container.appendChild(hostItem);
          } catch (err) {
            console.error(`创建主机元素失败 (ID: ${host.id}):`, err);
            // 添加错误提示元素
            const errorItem = document.createElement('div');
            errorItem.className = 'host-item error';
            errorItem.textContent = `加载规则失败: ${host.ip || ''} ${host.domain || ''}`;
            errorItem.style.backgroundColor = 'var(--error-light)';
            errorItem.style.color = 'var(--error-dark)';
            container.appendChild(errorItem);
          }
        });
      } else {
        // 空状态
        const emptyHosts = document.createElement('div');
        emptyHosts.className = 'empty-state';
        emptyHosts.style.padding = '16px 0';
        emptyHosts.style.color = 'var(--gray-500)';
        emptyHosts.textContent = '该分组还没有hosts条目';
        container.appendChild(emptyHosts);
      }

      // 更新主机数量标签
      const groupElement = container.closest('.group-item');
      if (groupElement) {
        const hostsCountTag = groupElement.querySelector('.group-header .status-tag:nth-child(3)');
        if (hostsCountTag) {
          const hostsCount = Array.isArray(group.hosts) ? group.hosts.length : 0;
          const enabledCount = Array.isArray(group.hosts) ? group.hosts.filter(h => h.enabled).length : 0;
          hostsCountTag.textContent = `${enabledCount}/${hostsCount} 条规则`;
          hostsCountTag.title = `${enabledCount} 条启用规则，共 ${hostsCount} 条规则`;
        }
      }
    } catch (error) {
      console.error('更新分组主机列表失败:', error);
    }
  }

  /**
   * 处理分组更新
   * @param {string} groupId - 分组ID
   * @param {string} action - 更新类型
   */
  handleGroupUpdate (groupId, action) {
    // 记录修改的分组
    this.modifiedEntities.groups.add(groupId);

    // 移除缓存中的分组元素，下次渲染时重新创建
    this.renderedGroups.delete(groupId);

    // 如果是删除操作，也移除对应的主机元素缓存
    if (action === 'deleted') {
      const state = StateService.getState();
      const group = state.hostsGroups.find(g => g.id === groupId);
      if (group) {
        group.hosts.forEach(host => {
          // 记录修改的主机
          this.modifiedEntities.hosts.add(host.id);

          // 清除缓存
          this.renderedHosts.delete(host.id);
          this.searchResultHosts.delete(`search-${groupId}-${host.id}`);
        });
      }

      // 如果当前在搜索模式，刷新搜索结果
      if (this.searchKeyword) {
        this.performSearch();
      }
    }

    // 如果是主机相关操作，可能需要刷新搜索结果
    if (action === 'hostAdded' || action === 'hostUpdated') {
      if (this.searchKeyword) {
        // 刷新搜索结果
        this.performSearch();
      }
    }
  }

  /**
   * 处理分组展开/收起事件
   * @param {string} groupId - 分组ID
   * @param {boolean} isExpanded - 是否展开
   */
  handleGroupExpandToggle (groupId, isExpanded) {
    if (isExpanded) {
      this.expandedGroups.add(groupId);

      // 如果分组或其中的主机有修改，需要更新主机列表
      if (this.modifiedEntities.groups.has(groupId)) {
        const groupItem = this.renderedGroups.get(groupId);
        if (groupItem) {
          const content = groupItem.querySelector('.group-content');
          const hostsContainer = content.querySelector('.hosts-container');

          if (hostsContainer) {
            // 获取最新的分组数据
            const state = StateService.getState();
            const group = state.hostsGroups.find(g => g.id === groupId);

            if (group) {
              this.updateGroupHosts(group, hostsContainer);
            }
          }
        }
      }
    } else {
      this.expandedGroups.delete(groupId);
    }
  }

  /**
   * 更新添加分组表单区域
   * @param {boolean} show - 是否显示表单
   */
  updateAddGroupFormSection (show) {
    const container = document.getElementById('add-group-form-container');
    if (!container) return;

    // 如果状态未变，则跳过更新
    if ((container.childNodes.length > 0) === show) return;

    // 清空容器
    container.innerHTML = '';

    // 如果需要显示添加分组表单，则创建并添加
    if (show) {
      const addGroupForm = createAddGroupForm(
        async (newGroup) => {
          // 添加分组成功后的回调
          try {
            const success = await StateService.addGroup(newGroup, true);
            if (success) {
              await StateService.setShowAddGroupForm(false);
            }
          } catch (error) {
            console.error('添加分组失败:', error);
            this.showErrorNotification('添加分组失败，请重试');
          }
        },
        async () => {
          // 取消添加分组的回调
          try {
            await StateService.setShowAddGroupForm(false);
          } catch (error) {
            console.error('取消添加分组失败:', error);
          }
        }
      );
      container.appendChild(addGroupForm);
    }
  }

  /**
   * 执行搜索
   * 使用防抖函数包装
   */
  _performSearch () {
    try {
      // 使用 StateService 执行搜索
      const searchResult = StateService.search(this.searchKeyword);

      // 清空搜索结果容器
      this.searchResultsContainer.innerHTML = '';

      // 如果没有搜索关键字，隐藏搜索结果并显示分组列表
      if (!this.searchKeyword) {
        this.searchResultsContainer.style.display = 'none';
        this.groupListContainer.style.display = 'block';

        // 清除搜索时，确保刷新主视图以反映任何变化
        this.refreshMainView();
        return;
      }

      // 显示搜索结果并隐藏分组列表
      this.searchResultsContainer.style.display = 'block';
      this.groupListContainer.style.display = 'none';

      // 渲染搜索头部和结果
      this.renderSearchHeader(searchResult);

      // 显示搜索结果
      if (searchResult.totalMatches === 0) {
        this.renderEmptySearchResult();
      } else {
        this.renderSearchResults(searchResult);
      }
    } catch (error) {
      console.error('执行搜索失败:', error);
      this.showErrorNotification('搜索失败，请重试');
    }
  }

  /**
   * 渲染搜索头部
   * @param {object} searchResult - 搜索结果对象
   */
  renderSearchHeader (searchResult) {
    // 创建搜索结果头部
    const searchHeader = document.createElement('div');
    searchHeader.className = 'search-header';

    // 搜索结果标题
    const searchTitle = document.createElement('h3');
    searchTitle.className = 'search-title';

    // 状态标签
    let statusClass = 'status-tag';
    if (searchResult.totalMatches > 0) {
      statusClass += ' status-tag-success';
    } else {
      statusClass += ' status-tag-default';
    }

    searchTitle.innerHTML = `搜索结果 <span class="${statusClass}">${searchResult.totalMatches} 条匹配</span>`;
    searchHeader.appendChild(searchTitle);

    // 清除搜索按钮
    const clearSearchButton = document.createElement('button');
    clearSearchButton.className = 'button button-default';
    clearSearchButton.textContent = '清除搜索';
    clearSearchButton.addEventListener('click', () => {
      this.searchBar.clear();
    });
    searchHeader.appendChild(clearSearchButton);

    this.searchResultsContainer.appendChild(searchHeader);
  }

  /**
   * 渲染空搜索结果
   */
  renderEmptySearchResult () {
    // 无结果时显示空状态
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';

    const emptyIcon = document.createElement('div');
    emptyIcon.className = 'empty-state-icon';
    emptyIcon.innerHTML = '🔍';

    const emptyText = document.createElement('p');
    emptyText.textContent = `没有找到与 "${this.searchKeyword}" 匹配的规则`;

    const emptyHint = document.createElement('p');
    emptyHint.style.fontSize = '14px';
    emptyHint.style.color = 'var(--gray-500)';
    emptyHint.style.marginTop = '8px';
    emptyHint.textContent = '尝试使用不同的关键字或检查拼写';

    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(emptyText);
    emptyState.appendChild(emptyHint);
    this.searchResultsContainer.appendChild(emptyState);
  }

  /**
   * 渲染搜索结果
   * @param {Object} searchResult - 搜索结果对象
   */
  renderSearchResults (searchResult) {
    try {
      // 使用文档片段减少DOM重绘
      const fragment = document.createDocumentFragment();

      searchResult.matchedGroups.forEach(group => {
        // 创建分组标题
        const groupHeader = document.createElement('div');
        groupHeader.className = 'search-result-group-header';
        groupHeader.dataset.groupId = group.id;

        const groupNameContainer = document.createElement('div');
        groupNameContainer.style.display = 'flex';
        groupNameContainer.style.alignItems = 'center';

        const groupName = document.createElement('div');
        groupName.className = 'search-result-group-name';
        groupName.textContent = group.name;

        // 添加状态标签
        const statusTag = document.createElement('span');
        statusTag.className = 'status-tag status-tag-success';
        statusTag.textContent = `${group.matchCount} 条匹配`;

        groupNameContainer.appendChild(groupName);
        groupNameContainer.appendChild(statusTag);
        groupHeader.appendChild(groupNameContainer);

        fragment.appendChild(groupHeader);

        // 创建匹配的主机元素容器
        const hostsList = document.createElement('div');
        hostsList.className = 'search-result-hosts';
        hostsList.dataset.groupId = group.id;

        // 遍历并显示所有匹配的主机
        group.hosts.forEach(host => {
          const cacheKey = `search-${group.id}-${host.id}`;

          // 检查主机是否已修改
          const isHostModified = this.modifiedEntities.hosts.has(host.id);

          // 使用缓存提高性能，但如果主机已修改则强制重新渲染
          let hostItem = isHostModified ? null : this.searchResultHosts.get(cacheKey);

          if (!hostItem) {
            // 创建更新回调
            const hostUpdateCallback = (action) => this.handleHostUpdateInSearch(group.id, host.id, action);

            // 创建主机项并设置回调
            try {
              hostItem = createHostElement(
                group.id,
                host,
                hostUpdateCallback,
                this.searchKeyword
              );

              // 将搜索视图中的元素标记为搜索结果
              hostItem.dataset.isSearchResult = 'true';

              // 缓存搜索结果中的主机元素
              this.searchResultHosts.set(cacheKey, hostItem);
            } catch (error) {
              console.error('创建搜索结果主机元素失败:', error);
              // 创建错误元素
              hostItem = document.createElement('div');
              hostItem.className = 'host-item error';
              hostItem.textContent = `加载规则失败: ${host.ip || ''} ${host.domain || ''}`;
              hostItem.style.backgroundColor = 'var(--error-light)';
              hostItem.style.color = 'var(--error-dark)';
            }
          }

          hostsList.appendChild(hostItem);
        });

        fragment.appendChild(hostsList);
      });

      // 一次性添加所有结果
      this.searchResultsContainer.appendChild(fragment);
    } catch (error) {
      console.error('渲染搜索结果失败:', error);
      this.showErrorNotification('渲染搜索结果失败');
    }
  }

  /**
   * 处理搜索结果中的主机更新
   * @param {string} groupId - 分组ID
   * @param {string} hostId - 主机ID
   * @param {string} action - 操作类型
   */
  handleHostUpdateInSearch (groupId, hostId, action) {
    // 触发一个自定义事件，通知主机已修改
    const event = new CustomEvent('hostModified', {
      bubbles: true,
      detail: {
        hostId: hostId,
        groupId: groupId,
        action: action
      }
    });
    document.dispatchEvent(event);

    // 根据操作类型处理搜索结果
    if (action === 'deleted') {
      // 如果主机被删除，重新执行搜索
      this.performSearch();
    } else if (action === 'toggled' || action === 'updated') {
      // 更新搜索结果中的对应元素
      this.updateSearchResultItem(groupId, hostId);
    }
  }

  /**
   * 更新主视图
   * @param {object} state - 应用状态
   */
  updateMainView (state) {
    // 如果搜索结果正在显示，不更新主视图
    if (this.searchKeyword) return;

    try {
      // 计算是否需要完全重新渲染
      const needFullRerender = this.needFullRerender(state);

      if (needFullRerender) {
        // 重新渲染整个分组列表
        this.refreshMainView();
      } else {
        // 仅更新已变更的部分
        this.updateChangedGroups(state);
      }
    } catch (error) {
      console.error('更新主视图失败:', error);
      this.showErrorNotification('更新视图失败，请刷新页面');
    }
  }

  /**
   * 判断是否需要完全重新渲染
   * @param {object} state - 应用状态
   * @returns {boolean} 是否需要完全重新渲染
   */
  needFullRerender (state) {
    // 如果没有渲染过，需要完全渲染
    if (!this.groupList) return true;

    // 如果分组数量变化，需要完全渲染
    const renderedGroupCount = this.renderedGroups.size;
    if (renderedGroupCount !== state.hostsGroups.length) return true;

    // 虚拟化模式下，总高度变化时需要重新渲染
    if (VIRTUALIZATION.enabled &&
      this.virtualScroll.totalHeight !== state.hostsGroups.length * VIRTUALIZATION.itemHeight) {
      return true;
    }

    // 如果有修改的实体，需要检查是否需要完全重新渲染
    if (this.modifiedEntities.groups.size > 0) {
      // 如果修改的分组数量超过一定比例，完全重新渲染更高效
      const modifiedRatio = this.modifiedEntities.groups.size / state.hostsGroups.length;
      if (modifiedRatio > 0.3) { // 如果超过30%的分组被修改，完全重新渲染
        return true;
      }
    }

    return false;
  }

  /**
   * 更新已变更的分组
   * @param {object} state - 应用状态
   */
  updateChangedGroups (state) {
    try {
      // 获取激活状态变化的分组和被修改的分组
      state.hostsGroups.forEach(group => {
        const isActive = state.activeGroups.includes(group.id);
        const groupElement = this.renderedGroups.get(group.id);
        const isModified = this.modifiedEntities.groups.has(group.id);

        // 如果分组状态已改变或已被修改，更新元素
        if ((groupElement && groupElement.dataset.active !== String(isActive)) || isModified) {
          const newGroupElement = createGroupElement(
            group,
            isActive,
            this.handleGroupUpdate.bind(this),
            this.handleGroupExpandToggle.bind(this)
          );

          // 保存展开状态
          if (this.expandedGroups.has(group.id)) {
            const content = newGroupElement.querySelector('.group-content');
            if (content) {
              content.style.display = 'block';
            }
          }

          // 替换元素
          if (groupElement && groupElement.parentNode) {
            groupElement.parentNode.replaceChild(newGroupElement, groupElement);
          }

          // 更新缓存
          this.renderedGroups.set(group.id, newGroupElement);

          // 从修改列表中移除
          this.modifiedEntities.groups.delete(group.id);
        }

        // 检查是否有被修改的主机需要更新
        const modifiedHostsInGroup = group.hosts.filter(h => this.modifiedEntities.hosts.has(h.id));
        if (modifiedHostsInGroup.length > 0 && groupElement) {
          // 如果有修改的主机且分组是展开的，更新主机列表
          if (this.expandedGroups.has(group.id)) {
            const content = groupElement.querySelector('.group-content');
            if (content) {
              const hostsContainer = content.querySelector('.hosts-container');
              if (hostsContainer) {
                this.updateGroupHosts(group, hostsContainer);

                // 清除已处理的主机修改记录
                modifiedHostsInGroup.forEach(host => {
                  this.modifiedEntities.hosts.delete(host.id);
                });
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('更新分组视图时出错:', error);
      // 发生错误时尝试完全刷新
      this.refreshMainView();
    }
  }

  /**
   * 刷新主视图
   */
  refreshMainView () {
    try {
      // 清空分组列表但保留展开状态
      if (this.groupListContainer) {
        this.groupListContainer.innerHTML = '';
      }

      // 清空缓存的元素，确保重新渲染
      this.clearElementCache();

      // 清空修改追踪
      this.modifiedEntities.hosts.clear();
      this.modifiedEntities.groups.clear();

      // 重新渲染分组列表
      this.renderGroupList();
    } catch (error) {
      console.error('刷新主视图失败:', error);
      // 尝试完全重新渲染页面
      this.render().catch(err => console.error('重新渲染页面失败:', err));
    }
  }

  /**
   * 销毁组件
   */
  destroy () {
    try {
      // 取消状态订阅
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }

      // 移除事件监听器
      if (VIRTUALIZATION.enabled && this.virtualScroll.container) {
        this.virtualScroll.container.removeEventListener('scroll', this.handleScroll);
        window.removeEventListener('resize', this.handleResize);
      }

      // 移除自定义事件监听器
      if (this._searchClearedHandler) {
        document.removeEventListener('searchCleared', this._searchClearedHandler);
        this._searchClearedHandler = null;
      }

      if (this._hostModifiedHandler) {
        document.removeEventListener('hostModified', this._hostModifiedHandler);
        this._hostModifiedHandler = null;
      }

      if (this._networkRequestUpdateHandler) {
        document.removeEventListener('networkRequestUpdate', this._networkRequestUpdateHandler);
        this._networkRequestUpdateHandler = null;
      }

      // 清空缓存
      this.clearElementCache();
      this.modifiedEntities.hosts.clear();
      this.modifiedEntities.groups.clear();
      this.expandedGroups.clear();

      // 清空视图
      if (this.container) {
        this.container.innerHTML = '';
      }

      // 清空引用
      this.searchBar = null;
      this.searchResultsContainer = null;
      this.groupList = null;
      this.groupListContainer = null;
      this.virtualScroll.container = null;
    } catch (error) {
      console.error('销毁HostsPage组件时出错:', error);
    }
  }
}