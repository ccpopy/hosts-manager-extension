import StorageService from '../services/StorageService.js';
import SearchService from '../services/SearchService.js';
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
    this.showAddGroupForm = false;
    this.searchKeyword = '';
    this.searchBar = null;
    this.searchResultsContainer = null;
    this.groupList = null;
    // 跟踪展开状态的分组
    this.expandedGroups = new Set();

    // 添加自定义事件监听
    this.container.addEventListener('hostsManagerSearchUpdate', async (e) => {
      if (e.detail && e.detail.needsUpdate && this.searchKeyword) {
        const groups = await StorageService.getGroups();
        this.performSearch(groups);
      }
    });

    // 添加搜索清除事件监听
    this.container.addEventListener('searchCleared', async () => {
      await this.refreshMainView();
    });
  }

  /**
   * 初始化页面
   */
  async init () {
    const { showAddGroupForm = false } = await StorageService.get('showAddGroupForm');
    this.showAddGroupForm = showAddGroupForm;

    await this.render();

    // 监听存储变化
    StorageService.onChanged((changes) => {
      if (changes.showAddGroupForm) {
        this.showAddGroupForm = changes.showAddGroupForm.newValue;
        // 不重新渲染整个页面，只更新添加分组表单区域
        this.updateAddGroupFormSection();
      }
    });
  }

  /**
   * 渲染页面
   */
  async render () {
    this.container.innerHTML = '';

    const hostsGroups = await StorageService.getGroups();
    const activeGroups = await StorageService.getActiveGroups();

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
      StorageService.set({ showAddGroupForm: true });
    });

    actionBar.appendChild(addGroupButton);

    // 添加搜索栏
    this.searchBar = new SearchBar((keyword) => {
      this.searchKeyword = keyword;
      this.performSearch(hostsGroups);
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
    this.updateAddGroupFormSection();

    // 搜索结果容器
    this.searchResultsContainer = document.createElement('div');
    this.searchResultsContainer.className = 'search-results';
    this.searchResultsContainer.style.display = 'none';
    this.container.appendChild(this.searchResultsContainer);

    // 分组列表
    this.groupList = document.createElement('div');
    this.groupList.className = 'group-list';

    if (hostsGroups.length === 0 && !this.showAddGroupForm) {
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
      hostsGroups.forEach(group => {
        const groupItem = createGroupElement(
          group,
          activeGroups.includes(group.id),
          // 更新回调 - 不再传递完整重渲染的回调
          // 而是传递更新单个分组的回调
          (updatedGroup) => this.updateSingleGroup(updatedGroup),
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

    // 如果有搜索关键字，立即执行搜索
    if (this.searchKeyword) {
      this.searchBar.setKeyword(this.searchKeyword);
      this.performSearch(hostsGroups);
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
   */
  async updateAddGroupFormSection () {
    const container = document.getElementById('add-group-form-container');
    if (!container) return;

    // 清空容器
    container.innerHTML = '';

    // 如果需要显示添加分组表单，则创建并添加
    if (this.showAddGroupForm) {
      const addGroupForm = createAddGroupForm(
        async (newGroup) => {
          // 添加分组成功后的回调
          await StorageService.set({ showAddGroupForm: false });
          // 添加新分组到DOM，不重新渲染整页
          this.addNewGroupToDOM(newGroup);
        },
        () => {
          // 取消添加分组的回调
          StorageService.set({ showAddGroupForm: false });
        }
      );
      container.appendChild(addGroupForm);
    }
  }

  /**
   * 添加新分组到DOM
   * @param {Object} newGroup - 新分组对象
   */
  async addNewGroupToDOM (newGroup, updateSearch = true) {
    const activeGroups = await StorageService.getActiveGroups();
    const isActive = activeGroups.includes(newGroup.id);

    // 检查分组列表中是否有空状态
    const emptyState = this.groupList.querySelector('.empty-state');
    if (emptyState) {
      // 如果有空状态，则移除它
      emptyState.remove();
    }

    // 创建新分组元素并添加到列表
    const groupItem = createGroupElement(
      newGroup,
      isActive,
      (updatedGroup) => this.updateSingleGroup(updatedGroup),
      (groupId, isExpanded) => this.handleGroupExpandToggle(groupId, isExpanded)
    );

    // 添加到分组列表最前面
    if (this.groupList.firstChild) {
      this.groupList.insertBefore(groupItem, this.groupList.firstChild);
    } else {
      this.groupList.appendChild(groupItem);
    }

    // 新添加的分组默认保持展开状态
    this.expandedGroups.add(newGroup.id);
    const content = groupItem.querySelector('.group-content');
    if (content) {
      content.style.display = 'block';
    }

    // 如果有搜索关键词且需要更新搜索结果，则重新执行搜索
    if (updateSearch && this.searchKeyword) {
      const groups = await StorageService.getGroups();
      this.performSearch(groups);
    }
  }

  /**
   * 更新单个分组的DOM
   * @param {Object} group - 分组对象
   */
  async updateSingleGroup (group) {
    if (!group || !group.id) return;

    const groupItem = this.groupList.querySelector(`.group-item:has([data-group-id="${group.id}"])`);
    if (!groupItem) return;

    const activeGroups = await StorageService.getActiveGroups();
    const isActive = activeGroups.includes(group.id);

    // 记录当前分组是否展开
    const isExpanded = groupItem.querySelector('.group-content').style.display === 'block';

    // 创建更新后的分组元素
    const updatedGroupItem = createGroupElement(
      group,
      isActive,
      (updatedGroup) => this.updateSingleGroup(updatedGroup),
      (groupId, isExpanded) => this.handleGroupExpandToggle(groupId, isExpanded)
    );

    // 如果当前分组是展开的，保持更新后的分组也是展开的
    if (isExpanded) {
      const content = updatedGroupItem.querySelector('.group-content');
      if (content) {
        content.style.display = 'block';
      }
    }

    // 替换DOM中的分组元素
    groupItem.parentNode.replaceChild(updatedGroupItem, groupItem);
  }

  // pages/HostsPage.js 中的 performSearch 方法 - 再次优化版本

  /**
   * 执行搜索
   * @param {Array} groups - 分组数组
   */
  performSearch (groups) {
    // 清空搜索结果容器
    this.searchResultsContainer.innerHTML = '';

    // 如果没有搜索关键字，隐藏搜索结果并显示分组列表
    if (!this.searchKeyword) {
      this.searchResultsContainer.style.display = 'none';
      this.groupList.style.display = 'block';

      // 当清除搜索时，我们应该确保主视图是最新的
      this.refreshMainView();
      return;
    }

    // 执行搜索
    const searchResult = SearchService.search(groups, this.searchKeyword);

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
          // 创建即时更新回调，确保搜索结果中的操作立即生效
          const updateCallback = async (updatedHostOrAction) => {
            // 判断是否是删除操作
            if (updatedHostOrAction === 'deleted') {
              // 立即从DOM中移除对应的主机项
              const hostElements = hostsList.querySelectorAll('.host-item');
              hostElements.forEach(element => {
                const hostId = element.querySelector('[data-host-id]')?.dataset.hostId;
                if (hostId === host.id) {
                  element.remove();
                }
              });

              // 更新搜索结果计数
              this.updateSearchResultCounter(group.id);

              // 同时更新主视图中的对应主机项
              this.updateMainViewForHostAction(group.id, host.id, 'deleted');

              return;
            }

            // 判断是否是启用/禁用操作
            if (updatedHostOrAction === 'toggled') {
              // 在搜索结果中不需要特殊处理，因为toggle checkbox已经更新了视觉状态
              // 但需要更新主视图中的对应主机项
              this.updateMainViewForHostAction(group.id, host.id, 'toggled');
              return;
            }

            // 处理编辑更新操作
            if (updatedHostOrAction && typeof updatedHostOrAction === 'object') {
              const updatedHost = updatedHostOrAction;

              // 检查是否仍然匹配搜索条件
              const ipMatch = updatedHost.ip.toLowerCase().includes(this.searchKeyword.toLowerCase());
              const domainMatch = updatedHost.domain.toLowerCase().includes(this.searchKeyword.toLowerCase());

              if (ipMatch || domainMatch) {
                // 如果仍然匹配，更新当前搜索结果中的主机项DOM
                const hostElements = hostsList.querySelectorAll('.host-item');
                hostElements.forEach(element => {
                  const hostId = element.querySelector('[data-host-id]')?.dataset.hostId;
                  if (hostId === updatedHost.id) {
                    const newHostItem = createHostElement(group.id, updatedHost, updateCallback, this.searchKeyword);
                    element.replaceWith(newHostItem);
                  }
                });

                // 同时更新主视图中的对应主机项
                this.updateMainViewForHostAction(group.id, host.id, 'updated', updatedHost);
              } else {
                // 如果不再匹配搜索条件，从搜索结果中移除
                const hostElements = hostsList.querySelectorAll('.host-item');
                hostElements.forEach(element => {
                  const hostId = element.querySelector('[data-host-id]')?.dataset.hostId;
                  if (hostId === updatedHost.id) {
                    element.remove();
                  }
                });

                // 更新搜索结果计数
                this.updateSearchResultCounter(group.id);

                // 同时更新主视图中的对应主机项
                this.updateMainViewForHostAction(group.id, host.id, 'updated', updatedHost);
              }
            }
          };

          // 创建主机项并添加到列表
          const hostItem = createHostElement(group.id, host, updateCallback, this.searchKeyword);
          hostsList.appendChild(hostItem);
        });

        this.searchResultsContainer.appendChild(hostsList);
      });
    }
  }

  /**
   * 刷新主视图
   */
  async refreshMainView () {
    const groups = await StorageService.getGroups();
    const activeGroups = await StorageService.getActiveGroups();

    // 清空分组列表但保留扩展状态
    const expandedGroups = new Set(this.expandedGroups);
    this.groupList.innerHTML = '';

    if (groups.length === 0) {
      // 空状态处理...
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
      // 重新创建所有分组元素
      groups.forEach(group => {
        const groupItem = createGroupElement(
          group,
          activeGroups.includes(group.id),
          (updatedGroup) => this.updateSingleGroup(updatedGroup),
          (groupId, isExpanded) => this.handleGroupExpandToggle(groupId, isExpanded)
        );
        this.groupList.appendChild(groupItem);

        // 应用保存的展开状态
        if (expandedGroups.has(group.id)) {
          const content = groupItem.querySelector('.group-content');
          if (content) {
            content.style.display = 'block';
          }
        }
      });
    }
  }

  /**
   * 更新主视图中的主机项
   * @param {string} groupId - 分组ID
   * @param {string} hostId - 主机ID
   * @param {string} action - 操作类型：'deleted'|'toggled'|'updated'
   * @param {Object} updatedHost - 更新后的主机对象(仅当action为'updated'时使用)
   */
  updateMainViewForHostAction (groupId, hostId, action, updatedHost = null) {
    // 查找主视图中的分组内容容器
    const groupItem = this.groupList.querySelector(`.group-item:has([data-group-id="${groupId}"])`);
    if (!groupItem) return;

    const groupContent = groupItem.querySelector('.group-content');
    if (!groupContent) return;

    // 查找主视图中对应的主机项
    const hostItem = groupContent.querySelector(`.host-item:has([data-host-id="${hostId}"])`);
    if (!hostItem && action !== 'deleted') return;

    switch (action) {
      case 'deleted':
        // 从主视图中删除主机项
        if (hostItem) {
          hostItem.remove();
        }

        // 检查是否需要显示空状态
        const remainingHosts = groupContent.querySelectorAll('.host-item');
        if (remainingHosts.length === 0) {
          const emptyHosts = document.createElement('div');
          emptyHosts.className = 'empty-state';
          emptyHosts.style.padding = '16px 0';
          emptyHosts.style.color = 'var(--gray-500)';
          emptyHosts.textContent = '该分组还没有hosts条目';

          // 找到添加表单之前的位置
          const formTitle = groupContent.querySelector('.section-title');
          if (formTitle) {
            // 创建或使用现有的hosts容器
            let hostsContainer = groupContent.querySelector('.hosts-container');
            if (!hostsContainer) {
              hostsContainer = document.createElement('div');
              hostsContainer.className = 'hosts-container';
              groupContent.insertBefore(hostsContainer, formTitle);
            }
            hostsContainer.innerHTML = '';
            hostsContainer.appendChild(emptyHosts);
          }
        }

        // 如果有搜索关键词，重新执行搜索以更新匹配计数
        if (this.searchKeyword) {
          StorageService.getGroups().then(groups => {
            this.performSearch(groups);
          });
        }
        break;

      case 'toggled':
        // 切换主视图中主机项的启用状态
        const checkbox = hostItem.querySelector('.host-enabled');
        if (checkbox) {
          // 获取当前搜索结果中的启用状态
          const searchResultHost = this.searchResultsContainer.querySelector(`.host-item:has([data-host-id="${hostId}"]) .host-enabled`);
          if (searchResultHost) {
            checkbox.checked = searchResultHost.checked;
          } else {
            // 如果在搜索结果中找不到，则直接通过存储服务获取最新状态
            StorageService.getGroups().then(groups => {
              const group = groups.find(g => g.id === groupId);
              if (group) {
                const host = group.hosts.find(h => h.id === hostId);
                if (host) {
                  checkbox.checked = host.enabled;
                }
              }
            });
          }
        }
        break;

      case 'updated':
        if (updatedHost) {
          // 创建新的主机项，保持与搜索结果中一致
          const newHostItem = createHostElement(
            groupId,
            updatedHost,
            // 为主视图中的主机项创建一个回调，确保对主视图的操作也会反映到搜索结果中
            (actionOrHost) => {
              // 更新搜索结果中对应的主机项
              this.updateSearchResultForHostAction(groupId, hostId, actionOrHost);
            }
          );

          if (hostItem) {
            hostItem.replaceWith(newHostItem);
          } else {
            // 如果在主视图中找不到但有更新的主机，则可能需要添加到主视图
            const insertPosition = groupContent.querySelector('.section-title');
            if (insertPosition) {
              groupContent.insertBefore(newHostItem, insertPosition);
            }
          }

          // 如果有搜索关键词，重新执行搜索以更新匹配计数
          if (this.searchKeyword) {
            StorageService.getGroups().then(groups => {
              this.performSearch(groups);
            });
          }
        }
        break;
    }
  }

  /**
   * 更新搜索结果中的主机项
   * @param {string} groupId - 分组ID
   * @param {string} hostId - 主机ID
   * @param {Object|string} actionOrHost - 操作类型或更新后的主机对象
   */
  updateSearchResultForHostAction (groupId, hostId, actionOrHost) {
    // 如果没有搜索结果或关键词，直接返回
    if (!this.searchKeyword || this.searchResultsContainer.style.display === 'none') {
      return;
    }

    // 查找搜索结果中对应分组的主机列表
    const hostsList = this.searchResultsContainer.querySelector(`.search-result-hosts[data-group-id="${groupId}"]`);
    if (!hostsList) return;

    // 查找搜索结果中对应的主机项
    const hostItem = hostsList.querySelector(`.host-item:has([data-host-id="${hostId}"])`);

    // 根据操作类型处理
    if (actionOrHost === 'deleted') {
      // 从搜索结果中删除主机项
      if (hostItem) {
        hostItem.remove();
      }
      // 更新搜索结果计数
      this.updateSearchResultCounter(groupId);

      // 重新执行搜索以获取最新数据
      StorageService.getGroups().then(groups => {
        this.performSearch(groups);
      });
    } else if (actionOrHost === 'toggled') {
      // 切换搜索结果中主机项的启用状态
      if (hostItem) {
        const checkbox = hostItem.querySelector('.host-enabled');
        if (checkbox) {
          // 获取主视图中的启用状态
          const mainViewHost = this.groupList.querySelector(`.host-item:has([data-host-id="${hostId}"]) .host-enabled`);
          if (mainViewHost) {
            checkbox.checked = mainViewHost.checked;
          }
        }
      }
    } else if (actionOrHost && typeof actionOrHost === 'object') {
      // 更新搜索结果中的主机项
      const updatedHost = actionOrHost;

      // 检查是否仍然匹配搜索条件
      const ipMatch = updatedHost.ip.toLowerCase().includes(this.searchKeyword.toLowerCase());
      const domainMatch = updatedHost.domain.toLowerCase().includes(this.searchKeyword.toLowerCase());

      if (ipMatch || domainMatch) {
        // 如果仍然匹配，创建更新后的主机项并替换
        if (hostItem) {
          const newHostItem = createHostElement(
            groupId,
            updatedHost,
            (action) => this.updateMainViewForHostAction(groupId, hostId, action),
            this.searchKeyword
          );
          hostItem.replaceWith(newHostItem);
        } else {
          // 如果找不到主机项但应该匹配，重新执行搜索
          StorageService.getGroups().then(groups => {
            this.performSearch(groups);
          });
        }
      } else {
        // 如果不再匹配，从搜索结果中移除
        if (hostItem) {
          hostItem.remove();
        }
        // 更新搜索结果计数
        this.updateSearchResultCounter(groupId);
      }
    }
  }

  /**
   * 更新搜索结果中的计数器
   * @param {string} groupId - 分组ID
   */
  updateSearchResultCounter (groupId) {
    // 查找对应的分组标题
    const groupHeader = this.searchResultsContainer.querySelector(`.search-result-group-header[data-group-id="${groupId}"]`);
    if (!groupHeader) return;

    // 查找分组下的主机列表
    const hostsList = this.searchResultsContainer.querySelector(`.search-result-hosts[data-group-id="${groupId}"]`);
    if (!hostsList) return;

    // 计算剩余的主机项数量
    const remainingHosts = hostsList.querySelectorAll('.host-item').length;

    // 更新状态标签
    const statusTag = groupHeader.querySelector('.status-tag');
    if (statusTag) {
      statusTag.textContent = `${remainingHosts} 条匹配`;

      // 如果没有匹配项了，移除整个分组
      if (remainingHosts === 0) {
        groupHeader.remove();
        hostsList.remove();

        // 检查是否还有其他分组
        const remainingGroups = this.searchResultsContainer.querySelectorAll('.search-result-group-header');
        if (remainingGroups.length === 0) {
          // 如果没有其他分组了，显示空状态
          const emptyState = document.createElement('div');
          emptyState.className = 'empty-state';

          const emptyIcon = document.createElement('div');
          emptyIcon.className = 'empty-state-icon';
          emptyIcon.innerHTML = '🔍';

          const emptyText = document.createElement('p');
          emptyText.textContent = `没有找到与 "${this.searchKeyword}" 匹配的规则`;

          emptyState.appendChild(emptyIcon);
          emptyState.appendChild(emptyText);

          // 清除搜索头部后的内容并添加空状态
          const searchHeader = this.searchResultsContainer.querySelector('.search-header');
          if (searchHeader) {
            // 保留搜索头部，移除后面的内容
            while (searchHeader.nextSibling) {
              searchHeader.nextSibling.remove();
            }
            this.searchResultsContainer.appendChild(emptyState);

            // 更新搜索结果总数
            const searchTitle = searchHeader.querySelector('.search-title');
            if (searchTitle) {
              searchTitle.innerHTML = `搜索结果 <span class="status-tag status-tag-default">0 条匹配</span>`;
            }
          }
        }
      }
    }

    // 更新搜索结果总数
    const totalMatches = this.searchResultsContainer.querySelectorAll('.host-item').length;
    const searchHeader = this.searchResultsContainer.querySelector('.search-header');
    if (searchHeader) {
      const searchTitle = searchHeader.querySelector('.search-title');
      if (searchTitle) {
        const statusClass = totalMatches > 0 ? 'status-tag status-tag-success' : 'status-tag status-tag-default';
        searchTitle.innerHTML = `搜索结果 <span class="${statusClass}">${totalMatches} 条匹配</span>`;
      }
    }
  }
}