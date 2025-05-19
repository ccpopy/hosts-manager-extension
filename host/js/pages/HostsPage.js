// js/pages/HostsPage.js
import StateService from '../services/StateService.js';
import { createNotice } from '../components/Notice.js';
import { createGroupElement } from '../components/GroupItem.js';
import { createAddGroupForm } from '../components/GroupForm.js';
import { createHostElement } from '../components/HostItem.js';
import SearchBar from '../components/SearchBar.js';

/**
 * Hosts页面类
 */
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

    // 订阅状态变化
    this.unsubscribe = StateService.subscribe(state => {
      // 如果有活跃搜索，更新搜索结果
      if (this.searchKeyword) {
        this.performSearch();
      } else {
        // 否则更新主视图
        this.refreshMainView();
      }

      // 更新添加分组表单区域
      this.updateAddGroupFormSection(state.showAddGroupForm);
    });
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
    const actionBar = document.createElement('div');
    actionBar.className = 'action-bar';

    // 添加分组按钮
    const addGroupButton = document.createElement('div');
    addGroupButton.className = 'add-group-button';
    addGroupButton.innerHTML = '<span class="add-group-button-icon">+</span> 添加分组';
    addGroupButton.addEventListener('click', () => {
      StateService.setShowAddGroupForm(true).then(() => {
        this.updateAddGroupFormSection(true);
      }).catch(error => {
        console.error('Failed to set showAddGroupForm:', error);
      });
    });

    actionBar.appendChild(addGroupButton);

    // 添加搜索栏
    this.searchBar = new SearchBar((keyword) => {
      this.searchKeyword = keyword;
      this.performSearch();
    });

    // 将搜索栏包装在一个容器中，以保持布局的一致性
    const searchBarWrapper = document.createElement('div');
    searchBarWrapper.style.display = 'flex';
    searchBarWrapper.style.alignItems = 'center';
    searchBarWrapper.appendChild(this.searchBar.getElement());

    actionBar.appendChild(searchBarWrapper);
    this.container.appendChild(actionBar);

    // 用于动态显示添加分组表单的区域
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

    // 分组列表
    this.renderGroupList();

    // 如果有搜索关键字，立即执行搜索
    if (this.searchKeyword) {
      this.searchBar.setKeyword(this.searchKeyword);
      this.performSearch();
    }
  }

  /**
   * 渲染分组列表
   */
  renderGroupList () {
    const state = StateService.getState();

    this.groupList = document.createElement('div');
    this.groupList.className = 'group-list';

    if (state.hostsGroups.length === 0 && !state.showAddGroupForm) {
      // 空状态
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
    } else {
      state.hostsGroups.forEach(group => {
        const isActive = state.activeGroups.includes(group.id);
        const groupItem = createGroupElement(
          group,
          isActive,
          // 更新回调
          async () => {
            // 不需显式刷新，StateService会通知所有订阅者
          },
          // 传递展开/收起的回调
          (groupId, isExpanded) => this.handleGroupExpandToggle(groupId, isExpanded)
        );
        this.groupList.appendChild(groupItem);

        // 应用保存的展开状态
        if (this.expandedGroups.has(group.id)) {
          const content = groupItem.querySelector('.group-content');
          if (content) {
            content.style.display = 'block';
          }
        }
      });
    }

    this.container.appendChild(this.groupList);
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
   */
  updateAddGroupFormSection (show) {
    const container = document.getElementById('add-group-form-container');
    if (!container) return;

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
 */
  performSearch () {
    // 使用 StateService 执行搜索
    const searchResult = StateService.search(this.searchKeyword);

    // 清空搜索结果容器
    this.searchResultsContainer.innerHTML = '';

    // 如果没有搜索关键字，隐藏搜索结果并显示分组列表
    if (!this.searchKeyword) {
      this.searchResultsContainer.style.display = 'none';
      this.groupList.style.display = 'block';

      // 清除搜索时，确保刷新主视图以反映任何变化
      this.refreshMainView();
      return;
    }

    // 显示搜索结果并隐藏分组列表
    this.searchResultsContainer.style.display = 'block';
    this.groupList.style.display = 'none';

    // 创建搜索结果头部
    const searchHeader = document.createElement('div');
    searchHeader.className = 'search-header';

    // 搜索结果标题
    const searchTitle = document.createElement('h3');
    searchTitle.className = 'search-title';

    // 使用与应用一致的状态标签样式
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

    // 显示搜索结果
    if (searchResult.totalMatches === 0) {
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
    } else {
      // 有结果时显示匹配项
      this.renderSearchResults(searchResult);
    }
  }

  /**
   * 渲染搜索结果
   * @param {Object} searchResult - 搜索结果对象
   */
  renderSearchResults (searchResult) {
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

      this.searchResultsContainer.appendChild(groupHeader);

      // 创建匹配的主机元素容器
      const hostsList = document.createElement('div');
      hostsList.className = 'search-result-hosts';
      hostsList.dataset.groupId = group.id;

      // 遍历并显示所有匹配的主机
      group.hosts.forEach(host => {
        // 创建更新回调
        const hostUpdateCallback = async (actionOrUpdatedHost) => {
          // 当搜索结果中的主机项被操作时，自动更新搜索结果
          if (actionOrUpdatedHost === 'deleted') {
            // 如果主机被删除，重新执行搜索
            this.performSearch();
          } else if (actionOrUpdatedHost === 'toggled') {
            // 如果主机状态被切换，不需特殊处理，因为复选框已更新
          } else if (typeof actionOrUpdatedHost === 'object') {
            // 如果主机被编辑，重新执行搜索以更新显示
            this.performSearch();
          }
        };

        // 创建主机项并设置回调
        const hostItem = createHostElement(
          group.id,
          host,
          hostUpdateCallback,
          this.searchKeyword
        );
        hostsList.appendChild(hostItem);
      });

      this.searchResultsContainer.appendChild(hostsList);
    });
  }

  /**
   * 刷新主视图
   */
  refreshMainView () {
    // 清空分组列表但保留扩展状态
    if (this.groupList) {
      this.container.removeChild(this.groupList);
    }

    // 重新渲染分组列表
    this.renderGroupList();
  }

  /**
   * 销毁组件
   */
  destroy () {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}