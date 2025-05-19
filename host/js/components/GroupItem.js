import StorageService from '../services/StorageService.js';
import ProxyService from '../services/ProxyService.js';
import Modal from './Modal.js';
import { createHostElement, createAddHostForm } from './HostItem.js';

/**
 * 创建分组元素
 * @param {Object} group - 分组对象
 * @param {boolean} isActive - 是否激活
 * @param {Function} onUpdate - 更新回调
 * @param {Function} onExpandToggle - 展开/收起回调
 * @returns {HTMLElement} - 分组DOM元素
 */
export function createGroupElement (group, isActive, onUpdate = null, onExpandToggle = null) {
  const groupItem = document.createElement('div');
  groupItem.className = 'group-item';

  // 分组标题
  const groupHeader = document.createElement('div');
  groupHeader.className = 'group-header';
  groupHeader.dataset.groupId = group.id;

  const groupNameContainer = document.createElement('div');
  groupNameContainer.style.display = 'flex';
  groupNameContainer.style.alignItems = 'center';

  const groupName = document.createElement('div');
  groupName.className = 'group-name';
  groupName.textContent = group.name;

  // 添加状态标签
  const statusTag = document.createElement('span');
  statusTag.className = isActive ? 'status-tag status-tag-success' : 'status-tag status-tag-default';
  statusTag.textContent = isActive ? '已启用' : '已禁用';

  groupNameContainer.appendChild(groupName);
  groupNameContainer.appendChild(statusTag);

  const groupActions = document.createElement('div');
  groupActions.className = 'group-actions';

  // 分组开关
  const toggleSwitch = document.createElement('label');
  toggleSwitch.className = 'toggle-switch';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = isActive;
  checkbox.addEventListener('change', async (e) => {
    // 阻止事件冒泡，避免触发分组展开/收起
    e.stopPropagation();

    await StorageService.toggleGroup(group.id, checkbox.checked);
    await ProxyService.updateProxySettings();

    statusTag.className = checkbox.checked ? 'status-tag status-tag-success' : 'status-tag status-tag-default';
    statusTag.textContent = checkbox.checked ? '已启用' : '已禁用';

    // 通知父组件这个分组需要更新
    if (onUpdate) {
      // 更新完成后获取最新的分组对象并传递给回调
      const groups = await StorageService.getGroups();
      const updatedGroup = groups.find(g => g.id === group.id);
      if (updatedGroup) {
        onUpdate(updatedGroup);
      }
    }
  });

  const slider = document.createElement('span');
  slider.className = 'slider';

  toggleSwitch.appendChild(checkbox);
  toggleSwitch.appendChild(slider);
  groupActions.appendChild(toggleSwitch);

  groupHeader.appendChild(groupNameContainer);
  groupHeader.appendChild(groupActions);

  // 折叠/展开功能
  const groupContent = document.createElement('div');
  groupContent.className = 'group-content';
  groupContent.style.display = 'none';

  groupHeader.addEventListener('click', (e) => {
    if (e.target !== checkbox && e.target !== slider) {
      const isExpanded = groupContent.style.display === 'none';
      groupContent.style.display = isExpanded ? 'block' : 'none';

      // 触发展开/收起回调
      if (onExpandToggle) {
        onExpandToggle(group.id, isExpanded);
      }
    }
  });

  // 主机列表
  if (group.hosts && group.hosts.length > 0) {
    group.hosts.forEach(host => {
      // 使用主机元素更新回调来避免整个分组重新渲染
      const hostUpdateCallback = async (updatedHost) => {
        if (!updatedHost) return;

        // 如果是删除操作触发的更新
        if (updatedHost === 'deleted') {
          // 检查分组是否还有其他主机
          const updatedGroups = await StorageService.getGroups();
          const currentGroup = updatedGroups.find(g => g.id === group.id);

          if (currentGroup && currentGroup.hosts.length === 0) {
            // 如果没有主机了，添加空状态
            const hostsContainer = groupContent.querySelector('.hosts-container');
            if (hostsContainer) {
              hostsContainer.innerHTML = '';

              const emptyHosts = document.createElement('div');
              emptyHosts.className = 'empty-state';
              emptyHosts.style.padding = '16px 0';
              emptyHosts.style.color = 'var(--gray-500)';
              emptyHosts.textContent = '该分组还没有hosts条目';

              hostsContainer.appendChild(emptyHosts);
            }
          }

          return;
        }

        // 如果传入的是具体主机对象，说明是编辑操作
        // 这里什么都不做，因为HostItem组件内部已经处理了DOM更新
      };

      const hostItem = createHostElement(group.id, host, hostUpdateCallback);
      groupContent.appendChild(hostItem);
    });
  } else {
    const emptyHosts = document.createElement('div');
    emptyHosts.className = 'empty-state';
    emptyHosts.style.padding = '16px 0';
    emptyHosts.style.color = 'var(--gray-500)';
    emptyHosts.textContent = '该分组还没有hosts条目';

    // 包装一个容器，方便后续更新
    const hostsContainer = document.createElement('div');
    hostsContainer.className = 'hosts-container';
    hostsContainer.appendChild(emptyHosts);

    groupContent.appendChild(hostsContainer);
  }

  // 添加主机表单
  const formTitle = document.createElement('div');
  formTitle.className = 'section-title';
  formTitle.style.marginTop = '16px';
  formTitle.textContent = '添加新规则';
  groupContent.appendChild(formTitle);

  // 添加主机表单
  // 定义单个主机添加完成后的回调，避免整个分组重新渲染
  const hostAddCallback = async (newHost) => {
    if (!newHost) return;

    // 检查是否存在空状态，如果存在则移除
    const hostsContainer = groupContent.querySelector('.hosts-container');
    if (hostsContainer) {
      hostsContainer.innerHTML = '';
    }

    // 获取正确的位置添加新主机
    const insertPosition = groupContent.querySelector('.section-title');
    if (insertPosition) {
      const hostItem = createHostElement(group.id, newHost, hostAddCallback);
      groupContent.insertBefore(hostItem, insertPosition);
    }
  };

  createAddHostForm(group.id, groupContent, hostAddCallback);

  // 分组编辑/删除操作
  const actionButtons = document.createElement('div');
  actionButtons.className = 'form-actions';
  actionButtons.style.marginTop = '24px';

  const editButton = document.createElement('button');
  editButton.className = 'button button-default';
  editButton.textContent = '重命名';
  editButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    const newName = await Modal.prompt('重命名分组', '输入新的分组名称:', group.name);
    if (newName && newName.trim()) {
      // 本地更新分组名称
      groupName.textContent = newName.trim();

      // 保存到存储中
      await StorageService.updateGroup(group.id, { name: newName.trim() });

      // 更新完成后获取最新的分组对象并传递给回调
      if (onUpdate) {
        const groups = await StorageService.getGroups();
        const updatedGroup = groups.find(g => g.id === group.id);
        if (updatedGroup) {
          onUpdate(updatedGroup);
        }
      }
    }
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'button button-danger';
  deleteButton.textContent = '删除分组';
  deleteButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    const confirmed = await Modal.confirm('删除分组', `确定要删除分组 "${group.name}" 吗?`);
    if (confirmed) {
      await StorageService.deleteGroup(group.id);
      await ProxyService.updateProxySettings();

      // 从DOM中移除分组元素
      groupItem.remove();

      // 检查是否需要显示空状态
      const groupList = groupItem.closest('.group-list');
      if (groupList) {
        const remainingGroups = groupList.querySelectorAll('.group-item');

        if (remainingGroups.length === 0) {
          // 如果没有分组了，显示空状态
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
        }
      }
    }
  });

  actionButtons.appendChild(editButton);
  actionButtons.appendChild(deleteButton);
  groupContent.appendChild(actionButtons);

  groupItem.appendChild(groupHeader);
  groupItem.appendChild(groupContent);

  return groupItem;
}