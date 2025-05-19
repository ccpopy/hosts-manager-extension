import StorageService from '../services/StorageService.js';
import ProxyService from '../services/ProxyService.js';
import Modal from './Modal.js';
import { createHostElement, createAddHostForm } from './HostItem.js';

/**
 * 创建分组元素
 * @param {Object} group - 分组对象
 * @param {boolean} isActive - 是否激活
 * @param {Function} onUpdate - 更新回调
 * @returns {HTMLElement} - 分组DOM元素
 */
export function createGroupElement (group, isActive, onUpdate = null) {
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
  checkbox.addEventListener('change', async () => {
    await StorageService.toggleGroup(group.id, checkbox.checked);
    await ProxyService.updateProxySettings();
    statusTag.className = checkbox.checked ? 'status-tag status-tag-success' : 'status-tag status-tag-default';
    statusTag.textContent = checkbox.checked ? '已启用' : '已禁用';
    if (onUpdate) onUpdate();
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
      groupContent.style.display = groupContent.style.display === 'none' ? 'block' : 'none';
    }
  });

  // 主机列表
  if (group.hosts && group.hosts.length > 0) {
    group.hosts.forEach(host => {
      const hostItem = createHostElement(group.id, host, onUpdate);
      groupContent.appendChild(hostItem);
    });
  } else {
    const emptyHosts = document.createElement('div');
    emptyHosts.className = 'empty-state';
    emptyHosts.style.padding = '16px 0';
    emptyHosts.style.color = 'var(--gray-500)';
    emptyHosts.textContent = '该分组还没有hosts条目';
    groupContent.appendChild(emptyHosts);
  }

  // 添加主机表单
  const formTitle = document.createElement('div');
  formTitle.className = 'section-title';
  formTitle.style.marginTop = '16px';
  formTitle.textContent = '添加新规则';
  groupContent.appendChild(formTitle);

  // 添加主机表单
  createAddHostForm(group.id, groupContent, onUpdate);

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
      await StorageService.updateGroup(group.id, { name: newName.trim() });
      groupName.textContent = newName.trim();
      if (onUpdate) onUpdate();
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

      if (onUpdate) onUpdate();
    }
  });

  actionButtons.appendChild(editButton);
  actionButtons.appendChild(deleteButton);
  groupContent.appendChild(actionButtons);

  groupItem.appendChild(groupHeader);
  groupItem.appendChild(groupContent);

  return groupItem;
}