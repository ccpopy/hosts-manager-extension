/**
 * Hosts 配置页面
 * 显示和管理hosts规则分组
 */
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

    // 缓存已渲染的组件
    this.renderedGroups = new Map(); // groupId -> DOM元素
    this.renderedHosts = new Map();  // hostId -> DOM元素

    // 虚拟化列表状态
    this.virtualScroll = {
      container: null,      // 滚动容器
      totalHeight: 0,       // 总高度
      visibleItems: [],     // 可见项
      scrollPosition: 0,    // 滚动位置
      viewportHeight: 0     // 视口高度
    };

    // 性能优化: 防抖搜索
    this.performSearch = debounce(this._performSearch.bind(this), 300);

    // 订阅状态变化
    this.unsubscribe = StateService.subscribe(this.handleStateChange.bind(this));

    // 追踪最近修改的主机，用于同步视图
    this.recentlyModifiedHosts = new Set();

    // 添加搜索清除事件监听器
    this._searchClearedHandler = this.handleSearchCleared.bind(this);
    document.addEventListener('searchCleared', this._searchClearedHandler);
  }

  /**
   * 处理搜索清除事件
   */
  handleSearchCleared () {
    // 如果有最近修改的主机，强制刷新主视图
    if (this.recentlyModifiedHosts.size > 0) {
      // 清除缓存的主机元素，确保重新渲染
      this.recentlyModifiedHosts.forEach(hostId => {
        this.renderedHosts.delete(hostId);
      });

      // 强制刷新主视图
      this.refreshMainView();

      // 清空最近修改的主机集合
      this.recentlyModifiedHosts.clear();
    }
  }

  /**
   * 处理状态变化
   * @param {object} state - 应用状态
   */
  handleStateChange (state) {
    // 如果有活跃搜索，更新搜索结果
    if (this.searchKeyword) {
      this.performSearch();
    } else {
      // 否则更新主视图，避免全部重新渲染
      this.updateMainView(state);
    }

    // 更新添加分组表单区域
    this.updateAddGroupFormSection(state.showAddGroupForm);
  }

  /**
   * 初始化页面
   */
  async init () {
    await StateService.initialize();
    const state = StateService.getState();
    this.showAddGroupForm = state.showAddGroupForm;

    // 渲染页面
    await this.render();

    // 初始化虚拟滚动
    this.initVirtualScroll();
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
      '可以创建多个分组，每个分组可以独立启用或禁用，方便管理不同场景的hosts配置。',
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
    addGroupButton.addEventListener('click', () => {
      StateService.setShowAddGroupForm(true).catch(error => {
        console.error('Failed to set showAddGroupForm:', error);
      });
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
    emptyText.textContent = '还没有任何分组，点击"添加分组"创建一个新分组。';

    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(emptyText);
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
      // 检查缓存中是否已有该分组的DOM元素
      let groupItem = this.renderedGroups.get(group.id);
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
        }
      }

      this.groupList.appendChild(groupItem);
    });
  }

  /**
   * 处理分组更新
   * @param {string} groupId - 分组ID
   * @param {string} action - 更新类型
   */
  async handleGroupUpdate (groupId, action) {
    // 移除缓存中的分组元素，下次渲染时重新创建
    this.renderedGroups.delete(groupId);

    // 如果是删除操作，也移除对应的主机元素缓存
    if (action === 'deleted') {
      const state = StateService.getState();
      const group = state.hostsGroups.find(g => g.id === groupId);
      if (group) {
        group.hosts.forEach(host => {
          this.renderedHosts.delete(host.id);
          // 同时从搜索结果缓存中移除
          this.renderedHosts.delete(`search-${groupId}-${host.id}`);
        });
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
          const success = await StateService.addGroup(newGroup, true);
          if (success) {
            await StateService.setShowAddGroupForm(false);
          }
        },
        () => {
          // 取消添加分组的回调
          StateService.setShowAddGroupForm(false);
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

    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(emptyText);
    this.searchResultsContainer.appendChild(emptyState);
  }

  /**
   * 渲染搜索结果
   * @param {Object} searchResult - 搜索结果对象
   */
  renderSearchResults (searchResult) {
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
        // 使用缓存提高性能
        let hostItem = this.renderedHosts.get(`search-${group.id}-${host.id}`);

        if (!hostItem) {
          // 创建更新回调
          const hostUpdateCallback = this.handleHostUpdateInSearch.bind(this, group.id, host.id);

          // 创建主机项并设置回调
          hostItem = createHostElement(
            group.id,
            host,
            hostUpdateCallback,
            this.searchKeyword
          );

          // 缓存搜索结果中的主机元素
          this.renderedHosts.set(`search-${group.id}-${host.id}`, hostItem);
        }

        hostsList.appendChild(hostItem);
      });

      fragment.appendChild(hostsList);
    });

    // 一次性添加所有结果
    this.searchResultsContainer.appendChild(fragment);
  }

  /**
   * 处理搜索结果中的主机更新
   * @param {string} groupId - 分组ID
   * @param {string} hostId - 主机ID
   * @param {string|object} actionOrUpdatedHost - 操作类型或更新后的主机对象
   */
  handleHostUpdateInSearch (groupId, hostId, actionOrUpdatedHost) {
    // 移除缓存的搜索结果中的主机元素
    this.renderedHosts.delete(`search-${groupId}-${hostId}`);

    // 同时移除主视图中的缓存，强制下次重新渲染
    this.renderedHosts.delete(hostId);

    // 记录主机已被修改，用于在搜索清除时同步视图
    this.recentlyModifiedHosts.add(hostId);

    // 根据操作类型处理
    if (actionOrUpdatedHost === 'deleted') {
      // 如果主机被删除，重新执行搜索
      this.performSearch();
    } else if (actionOrUpdatedHost === 'toggled') {
      // 如果主机状态被切换，现在不需特殊处理，因为在搜索清除时会强制刷新
    } else if (typeof actionOrUpdatedHost === 'object') {
      // 如果主机被编辑，重新执行搜索以更新显示
      this.performSearch();
    }
  }

  /**
   * 更新主视图
   * @param {object} state - 应用状态
   */
  updateMainView (state) {
    // 如果搜索结果正在显示，不更新主视图
    if (this.searchKeyword) return;

    // 计算是否需要完全重新渲染
    const needFullRerender = this.needFullRerender(state);

    if (needFullRerender) {
      // 重新渲染整个分组列表
      this.refreshMainView();
    } else {
      // 仅更新已变更的部分
      this.updateChangedGroups(state);
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

    // 如果有最近修改的主机，需要重新渲染
    if (this.recentlyModifiedHosts.size > 0) return true;

    return false;
  }

  /**
   * 更新已变更的分组
   * @param {object} state - 应用状态
   */
  updateChangedGroups (state) {
    try {
      // 获取激活状态变化的分组
      state.hostsGroups.forEach(group => {
        const isActive = state.activeGroups.includes(group.id);
        const groupElement = this.renderedGroups.get(group.id);

        if (groupElement && groupElement.dataset.active !== String(isActive)) {
          // 如果分组状态已改变，更新元素
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
          if (groupElement.parentNode) {
            groupElement.parentNode.replaceChild(newGroupElement, groupElement);
          }

          // 更新缓存
          this.renderedGroups.set(group.id, newGroupElement);
        }

        // 检查是否有最近修改的主机，需更新对应的分组内容
        if (this.recentlyModifiedHosts.size > 0) {
          const groupHosts = group.hosts || [];
          const modifiedHostsInGroup = groupHosts.filter(h => this.recentlyModifiedHosts.has(h.id));

          if (modifiedHostsInGroup.length > 0) {
            // 如果有修改的主机属于当前分组，更新该分组
            this.updateGroupHosts(group.id);
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
   * 更新分组内的主机列表
   * 新增方法：用于刷新特定分组内的主机列表
   * @param {string} groupId - 分组ID
   */
  updateGroupHosts (groupId) {
    try {
      const state = StateService.getState();
      const group = state.hostsGroups.find(g => g.id === groupId);
      if (!group) return;

      // 查找分组元素
      const groupElement = this.renderedGroups.get(groupId);
      if (!groupElement) return;

      // 查找主机容器
      const hostsContainer = groupElement.querySelector('.hosts-container');
      if (!hostsContainer) return;

      // 清空主机容器
      hostsContainer.innerHTML = '';

      // 重新渲染所有主机
      if (group.hosts && group.hosts.length > 0) {
        group.hosts.forEach(host => {
          // 删除缓存，确保重新渲染
          this.renderedHosts.delete(host.id);

          const hostUpdateCallback = async (actionOrUpdatedHost) => {
            try {
              if (actionOrUpdatedHost === 'deleted') {
                await this.updateGroupHosts(groupId);
              }

              // 通知状态更新
              this.handleGroupUpdate(groupId, 'hostUpdated');
            } catch (error) {
              console.error('处理主机更新回调失败:', error);
            }
          };

          try {
            const hostItem = createHostElement(groupId, host, hostUpdateCallback);
            hostsContainer.appendChild(hostItem);
          } catch (hostError) {
            console.error(`创建主机元素失败 (ID: ${host.id}):`, hostError);
            // 添加一个错误占位元素
            const errorItem = document.createElement('div');
            errorItem.className = 'host-item error';
            errorItem.textContent = `加载规则失败: ${host.ip || ''} ${host.domain || ''}`;
            hostsContainer.appendChild(errorItem);
          }
        });
      } else {
        // 空状态
        const emptyHosts = document.createElement('div');
        emptyHosts.className = 'empty-state';
        emptyHosts.style.padding = '16px 0';
        emptyHosts.style.color = 'var(--gray-500)';
        emptyHosts.textContent = '该分组还没有hosts条目';
        hostsContainer.appendChild(emptyHosts);
      }

      // 更新主机数量标签
      const hostsCountTag = groupElement.querySelector('.group-header .status-tag:nth-child(3)');
      if (hostsCountTag) {
        const hostsCount = Array.isArray(group.hosts) ? group.hosts.length : 0;
        hostsCountTag.textContent = `${hostsCount} 条规则`;
      }
    } catch (error) {
      console.error('更新分组主机列表失败:', error);
    }
  }

  /**
   * 刷新主视图
   */
  refreshMainView () {
    try {
      // 如果有最近修改的主机，确保缓存被清除
      if (this.recentlyModifiedHosts.size > 0) {
        this.recentlyModifiedHosts.forEach(hostId => {
          this.renderedHosts.delete(hostId);
        });
        // 清空最近修改的主机集合
        this.recentlyModifiedHosts.clear();
      }

      // 清空分组列表但保留展开状态
      if (this.groupListContainer) {
        this.groupListContainer.innerHTML = '';
      }

      // 清空缓存的分组元素，确保重新渲染
      this.renderedGroups.clear();

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

      // 移除搜索清除事件监听器
      if (this._searchClearedHandler) {
        document.removeEventListener('searchCleared', this._searchClearedHandler);
        this._searchClearedHandler = null;
      }

      // 清空缓存
      this.renderedGroups.clear();
      this.renderedHosts.clear();
      this.recentlyModifiedHosts.clear();
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