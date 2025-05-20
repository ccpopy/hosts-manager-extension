/**
 * 分组项组件
 * 处理分组的创建和交互
 */
import StateService from '../services/StateService.js';
import Modal from './Modal.js';
import { createHostElement, createAddHostForm } from './HostItem.js';
import { throttle } from '../utils/PerformanceUtils.js';

// 分组项计数器 - 用于生成唯一ID
let groupItemCounter = 0;

/**
 * 创建分组元素
 * @param {Object} group - 分组对象
 * @param {boolean} isActive - 是否激活
 * @param {Function} onUpdate - 更新回调
 * @param {Function} onExpandToggle - 展开/收起回调
 * @returns {HTMLElement} - 分组DOM元素
 */
export function createGroupElement (group, isActive, onUpdate = null, onExpandToggle = null) {
  // 生成唯一ID
  const uniqueId = `group-item-${++groupItemCounter}`;

  const groupItem = document.createElement('div');
  groupItem.className = 'group-item';
  groupItem.id = uniqueId;
  groupItem.dataset.groupId = group.id;
  groupItem.dataset.active = String(isActive);

  // 分组标题
  const groupHeader = createGroupHeader(group, isActive, uniqueId, onUpdate);
  groupItem.appendChild(groupHeader);

  // 分组内容区域
  const groupContent = document.createElement('div');
  groupContent.className = 'group-content';
  groupContent.style.display = 'none';
  groupContent.id = `${uniqueId}-content`;

  // 折叠/展开功能
  groupHeader.addEventListener('click', (e) => {
    // 避免点击切换开关时触发折叠
    if (e.target.tagName === 'INPUT' || e.target.className === 'slider' ||
      e.target.closest('.toggle-switch')) {
      return;
    }

    const isExpanded = groupContent.style.display === 'none';
    groupContent.style.display = isExpanded ? 'block' : 'none';

    // 更新图标
    const expandIcon = groupHeader.querySelector('.expand-icon');
    if (expandIcon) {
      expandIcon.innerHTML = isExpanded ?
        '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>' :
        '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>';
    }

    // 触发展开/收起回调
    if (onExpandToggle) {
      onExpandToggle(group.id, isExpanded);
    }
  });

  // 渲染主机列表
  renderHosts(group, groupContent, onUpdate);

  // 添加主机表单
  const formTitle = document.createElement('div');
  formTitle.className = 'section-title';
  formTitle.style.marginTop = '16px';
  formTitle.textContent = '添加新规则';
  groupContent.appendChild(formTitle);

  // 添加主机表单，包含回调
  createAddHostForm(group.id, groupContent, async (newHost) => {
    // 添加后更新主机列表
    await updateHostsList(group.id, groupContent, onUpdate);

    // 通知上层组件
    if (onUpdate) {
      onUpdate(group.id, 'hostAdded');
    }
  });

  // 分组编辑/删除操作
  const actionButtons = createGroupActions(group, groupItem, onUpdate);
  groupContent.appendChild(actionButtons);

  groupItem.appendChild(groupContent);

  return groupItem;
}

/**
 * 创建分组头部
 * @param {Object} group - 分组对象
 * @param {boolean} isActive - 是否激活
 * @param {string} uniqueId - 唯一ID
 * @param {Function} onUpdate - 更新回调
 * @returns {HTMLElement} - 分组头部元素
 */
function createGroupHeader (group, isActive, uniqueId, onUpdate) {
  const groupHeader = document.createElement('div');
  groupHeader.className = 'group-header';
  groupHeader.dataset.groupId = group.id;

  // 展开/折叠图标
  const expandIcon = document.createElement('div');
  expandIcon.className = 'expand-icon';
  expandIcon.style.width = '20px';
  expandIcon.style.height = '20px';
  expandIcon.style.marginRight = '8px';
  expandIcon.innerHTML = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>';

  // 分组名称和状态标签
  const groupNameContainer = document.createElement('div');
  groupNameContainer.style.display = 'flex';
  groupNameContainer.style.alignItems = 'center';
  groupNameContainer.style.flex = '1';

  const groupName = document.createElement('div');
  groupName.className = 'group-name';
  groupName.textContent = group.name;

  // 添加状态标签
  const statusTag = document.createElement('span');
  statusTag.className = isActive ? 'status-tag status-tag-success' : 'status-tag status-tag-default';
  statusTag.textContent = isActive ? '已启用' : '已禁用';

  // 主机数量标签
  const hostsCountTag = document.createElement('span');
  hostsCountTag.className = 'status-tag status-tag-default';
  hostsCountTag.style.marginLeft = '8px';
  hostsCountTag.textContent = `${group.hosts.length} 条规则`;

  groupNameContainer.appendChild(groupName);
  groupNameContainer.appendChild(statusTag);
  groupNameContainer.appendChild(hostsCountTag);

  // 分组开关
  const groupActions = document.createElement('div');
  groupActions.className = 'group-actions';

  const toggleSwitch = document.createElement('label');
  toggleSwitch.className = 'toggle-switch';
  toggleSwitch.setAttribute('aria-label', '启用或禁用分组');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = isActive;

  // 使用节流函数处理状态切换
  const handleToggle = throttle(async (e) => {
    // 阻止事件冒泡，避免触发分组展开/收起
    e.stopPropagation();

    try {
      // 使用 StateService 切换分组状态
      await StateService.toggleGroup(group.id, checkbox.checked);

      // 立即更新 UI 状态
      statusTag.className = checkbox.checked ? 'status-tag status-tag-success' : 'status-tag status-tag-default';
      statusTag.textContent = checkbox.checked ? '已启用' : '已禁用';

      // 更新分组元素的激活状态
      const groupItem = groupHeader.closest('.group-item');
      if (groupItem) {
        groupItem.dataset.active = String(checkbox.checked);
      }

      // 如果提供了更新回调，则调用
      if (onUpdate) {
        onUpdate(group.id, 'toggled');
      }
    } catch (error) {
      console.error('切换分组状态失败:', error);
      // 恢复复选框状态
      checkbox.checked = !checkbox.checked;
    }
  }, 300);

  checkbox.addEventListener('change', handleToggle);

  const slider = document.createElement('span');
  slider.className = 'slider';

  toggleSwitch.appendChild(checkbox);
  toggleSwitch.appendChild(slider);
  groupActions.appendChild(toggleSwitch);

  // 组装头部
  groupHeader.appendChild(expandIcon);
  groupHeader.appendChild(groupNameContainer);
  groupHeader.appendChild(groupActions);

  return groupHeader;
}

/**
 * 渲染主机列表
 * @param {Object} group - 分组对象
 * @param {HTMLElement} container - 容器元素
 * @param {Function} onUpdate - 更新回调
 */
function renderHosts (group, container, onUpdate) {
  // 创建主机列表容器
  const hostsContainer = document.createElement('div');
  hostsContainer.className = 'hosts-container';

  if (group.hosts && group.hosts.length > 0) {
    group.hosts.forEach(host => {
      // 创建主机更新回调
      const hostUpdateCallback = async (actionOrUpdatedHost) => {
        // 处理特定操作
        if (actionOrUpdatedHost === 'deleted') {
          // 刷新列表
          await updateHostsList(group.id, container, onUpdate);
        } else if (typeof actionOrUpdatedHost === 'object') {
          // 主机更新，不需要刷新列表
        }

        // 通知上层组件
        if (onUpdate) {
          onUpdate(group.id, 'hostUpdated');
        }
      };

      // 创建主机元素
      const hostItem = createHostElement(group.id, host, hostUpdateCallback);
      hostsContainer.appendChild(hostItem);
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

  // 添加到容器
  container.appendChild(hostsContainer);
}

/**
 * 更新主机列表
 * @param {string} groupId - 分组ID
 * @param {HTMLElement} container - 容器元素
 * @param {Function} onUpdate - 更新回调
 */
async function updateHostsList (groupId, container, onUpdate) {
  try {
    // 获取最新状态
    const state = await StateService.getState();
    const group = state.hostsGroups.find(g => g.id === groupId);

    if (!group) return;

    // 查找并更新主机列表容器
    const hostsContainer = container.querySelector('.hosts-container');
    if (hostsContainer) {
      // 移除旧内容
      hostsContainer.innerHTML = '';

      // 重新渲染主机
      if (group.hosts && group.hosts.length > 0) {
        group.hosts.forEach(host => {
          const hostUpdateCallback = async (actionOrUpdatedHost) => {
            if (actionOrUpdatedHost === 'deleted') {
              await updateHostsList(groupId, container, onUpdate);
            }

            if (onUpdate) {
              onUpdate(groupId, 'hostUpdated');
            }
          };

          const hostItem = createHostElement(groupId, host, hostUpdateCallback);
          hostsContainer.appendChild(hostItem);
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
      const groupItem = container.closest('.group-item');
      if (groupItem) {
        const hostsCountTag = groupItem.querySelector('.group-header .status-tag:nth-child(3)');
        if (hostsCountTag) {
          hostsCountTag.textContent = `${group.hosts.length} 条规则`;
        }
      }
    }
  } catch (error) {
    console.error('更新主机列表失败:', error);
  }
}

/**
 * 创建分组操作按钮
 * @param {Object} group - 分组对象
 * @param {HTMLElement} groupItem - 分组元素
 * @param {Function} onUpdate - 更新回调
 * @returns {HTMLElement} - 操作按钮容器
 */
function createGroupActions (group, groupItem, onUpdate) {
  const actionButtons = document.createElement('div');
  actionButtons.className = 'form-actions';
  actionButtons.style.marginTop = '24px';

  // 重命名按钮
  const editButton = document.createElement('button');
  editButton.className = 'button button-default';
  editButton.textContent = '重命名';
  editButton.addEventListener('click', async (e) => {
    e.stopPropagation();

    try {
      const newName = await Modal.prompt('重命名分组', '输入新的分组名称:', group.name);
      if (newName && newName.trim()) {
        // 使用 StateService 更新分组名称
        const success = await StateService.updateGroup(group.id, { name: newName.trim() });
        if (success) {
          // 本地更新分组名称
          const groupName = groupItem.querySelector('.group-name');
          if (groupName) {
            groupName.textContent = newName.trim();
          }

          // 通知上层组件
          if (onUpdate) {
            onUpdate(group.id, 'renamed');
          }
        }
      }
    } catch (error) {
      console.error('重命名分组失败:', error);
    }
  });

  // 删除按钮
  const deleteButton = document.createElement('button');
  deleteButton.className = 'button button-danger';
  deleteButton.textContent = '删除分组';
  deleteButton.addEventListener('click', async (e) => {
    e.stopPropagation();

    try {
      const confirmed = await Modal.confirm(
        '删除分组',
        `确定要删除分组 "${group.name}" 吗? 分组中的所有规则都将被删除。`
      );

      if (confirmed) {
        // 添加删除中状态
        groupItem.classList.add('deleting');

        // 使用 StateService 删除分组
        await StateService.deleteGroup(group.id);

        // 添加动画效果
        groupItem.style.height = `${groupItem.offsetHeight}px`;
        groupItem.style.opacity = '1';

        // 触发重绘以启动动画
        groupItem.offsetHeight;

        // 应用删除动画
        groupItem.style.height = '0';
        groupItem.style.opacity = '0';
        groupItem.style.padding = '0';
        groupItem.style.margin = '0';
        groupItem.style.overflow = 'hidden';

        // 动画完成后移除元素
        setTimeout(() => {
          // 从DOM中移除分组元素
          if (groupItem.parentNode) {
            groupItem.parentNode.removeChild(groupItem);
          }

          // 通知上层组件
          if (onUpdate) {
            onUpdate(group.id, 'deleted');
          }
        }, 300);
      }
    } catch (error) {
      console.error('删除分组失败:', error);
      groupItem.classList.remove('deleting');
    }
  });

  actionButtons.appendChild(editButton);
  actionButtons.appendChild(deleteButton);

  return actionButtons;
}