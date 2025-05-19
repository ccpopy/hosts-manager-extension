import StorageService from '../services/StorageService.js';
import { createNotice } from '../components/Notice.js';
import { createGroupElement } from '../components/GroupItem.js';
import { createAddGroupForm } from '../components/GroupForm.js';

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
        this.render();
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

    // 添加分组按钮
    const addGroupButton = document.createElement('div');
    addGroupButton.className = 'add-group-button';
    addGroupButton.innerHTML = '<span class="add-group-button-icon">+</span> 添加分组';
    addGroupButton.addEventListener('click', () => {
      StorageService.set({ showAddGroupForm: true });
    });

    this.container.appendChild(addGroupButton);

    // 内联添加分组表单
    if (this.showAddGroupForm) {
      const addGroupForm = createAddGroupForm(
        async (newGroup) => {
          await StorageService.set({ showAddGroupForm: false });
          this.render();
        },
        () => {
          StorageService.set({ showAddGroupForm: false });
        }
      );
      this.container.appendChild(addGroupForm);
    }

    // 分组列表
    const groupList = document.createElement('div');
    groupList.className = 'group-list';

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
      groupList.appendChild(emptyState);
    } else {
      hostsGroups.forEach(group => {
        const groupItem = createGroupElement(
          group,
          activeGroups.includes(group.id),
          // 更新回调
          () => this.render()
        );
        groupList.appendChild(groupItem);
      });
    }

    this.container.appendChild(groupList);
  }
}