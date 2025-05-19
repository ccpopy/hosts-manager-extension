import StateService from '../services/StateService.js';
import SearchService from '../services/SearchService.js';
import Modal from './Modal.js';
import { Message } from '../utils/MessageUtils.js';

/**
 * 创建主机元素
 * @param {string} groupId - 分组ID
 * @param {Object} host - 主机对象
 * @param {Function} onUpdate - 更新回调
 * @param {string} searchKeyword - 搜索关键字，用于高亮显示
 * @returns {HTMLElement} - 主机DOM元素
 */
export function createHostElement (groupId, host, onUpdate = null, searchKeyword = '') {
  const hostItem = document.createElement('div');
  hostItem.className = 'host-item';

  const hostIdAttr = document.createElement('span');
  hostIdAttr.style.display = 'none';
  hostIdAttr.dataset.hostId = host.id;
  hostItem.appendChild(hostIdAttr);

  const enabledCheckbox = document.createElement('input');
  enabledCheckbox.type = 'checkbox';
  enabledCheckbox.className = 'host-enabled';
  enabledCheckbox.checked = host.enabled;
  enabledCheckbox.addEventListener('change', async () => {
    // 使用 StateService 切换主机状态
    await StateService.toggleHost(groupId, host.id, enabledCheckbox.checked);

    if (onUpdate) {
      onUpdate('toggled');
    }
  });

  const ipSpan = document.createElement('span');
  ipSpan.className = 'host-ip';

  // 如果有搜索关键字，则高亮显示
  if (searchKeyword) {
    ipSpan.innerHTML = SearchService.highlightText(host.ip, searchKeyword);
  } else {
    ipSpan.textContent = host.ip;
  }

  const domainSpan = document.createElement('span');
  domainSpan.className = 'host-domain';

  // 如果有搜索关键字，则高亮显示
  if (searchKeyword) {
    domainSpan.innerHTML = SearchService.highlightText(host.domain, searchKeyword);
  } else {
    domainSpan.textContent = host.domain;
  }

  const editButton = document.createElement('button');
  editButton.className = 'button button-default button-small';
  editButton.style.marginRight = '8px';
  editButton.textContent = '编辑';
  editButton.addEventListener('click', () => {
    // 创建编辑表单替换当前主机项
    createHostEditForm(groupId, host.id, host.ip, host.domain, hostItem, onUpdate);
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'button button-danger button-small';
  deleteButton.textContent = '删除';
  deleteButton.addEventListener('click', async () => {
    const confirmed = await Modal.confirm(
      '删除规则',
      `确定要删除规则 "${host.ip} ${host.domain}" 吗？`
    );
    if (confirmed) {
      // 使用 StateService 删除主机
      await StateService.deleteHost(groupId, host.id);

      // 从DOM中移除主机项
      hostItem.remove();

      // 立即通知上层组件主机已删除
      if (onUpdate) {
        onUpdate('deleted');
      }
    }
  });

  hostItem.appendChild(enabledCheckbox);
  hostItem.appendChild(ipSpan);
  hostItem.appendChild(domainSpan);
  hostItem.appendChild(editButton);
  hostItem.appendChild(deleteButton);

  return hostItem;
}

/**
 * 创建主机编辑表单
 * @param {string} groupId - 分组ID
 * @param {string} hostId - 主机ID
 * @param {string} currentIp - 当前IP
 * @param {string} currentDomain - 当前域名
 * @param {HTMLElement} hostItem - 主机元素
 * @param {Function} onUpdate - 更新回调
 */
function createHostEditForm (groupId, hostId, currentIp, currentDomain, hostItem, onUpdate) {
  const editForm = document.createElement('div');
  editForm.className = 'host-edit-form';

  const ipInput = document.createElement('input');
  ipInput.type = 'text';
  ipInput.value = currentIp;
  ipInput.placeholder = 'IP 地址';
  ipInput.style.flex = '0 0 140px';

  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.value = currentDomain;
  domainInput.placeholder = '域名';
  domainInput.style.flex = '1';

  const saveButton = document.createElement('button');
  saveButton.className = 'button button-primary button-small';
  saveButton.textContent = '保存';
  saveButton.addEventListener('click', async () => {
    const newIp = ipInput.value.trim();
    const newDomain = domainInput.value.trim();

    if (newIp && newDomain) {
      // 使用 StateService 更新主机
      const updatedHost = await StateService.updateHost(groupId, hostId, { ip: newIp, domain: newDomain });

      if (updatedHost) {
        // 创建更新后的主机元素并替换编辑表单
        const newHostItem = createHostElement(groupId, updatedHost, onUpdate);
        editForm.parentNode.replaceChild(newHostItem, editForm);

        // 立即通知上层组件主机已更新
        if (onUpdate) {
          onUpdate(updatedHost);
        }
      } else {
        Message.error('IP和域名组合已存在，无法更新');
      }
    } else {
      Message.error('IP和域名不能为空');
    }
  });

  const cancelButton = document.createElement('button');
  cancelButton.className = 'button button-default button-small';
  cancelButton.textContent = '取消';
  cancelButton.addEventListener('click', async () => {
    // 获取最新的主机数据
    const state = StateService.getState();
    const group = state.hostsGroups.find(g => g.id === groupId);

    if (group) {
      const host = group.hosts.find(h => h.id === hostId);
      if (host) {
        // 创建原始主机元素并替换编辑表单
        const originalHostItem = createHostElement(groupId, host, onUpdate);
        editForm.parentNode.replaceChild(originalHostItem, editForm);
      }
    }
  });

  editForm.appendChild(ipInput);
  editForm.appendChild(domainInput);
  editForm.appendChild(saveButton);
  editForm.appendChild(cancelButton);

  // 替换DOM中的主机元素为编辑表单
  const parentNode = hostItem.parentNode;
  parentNode.replaceChild(editForm, hostItem);
}

/**
 * 创建添加主机表单
 * @param {string} groupId - 分组ID
 * @param {HTMLElement} container - 容器元素
 * @param {Function} onAdd - 添加成功后回调
 */
export function createAddHostForm (groupId, container, onAdd) {
  // 方式1: 完整规则文本框
  const fullRuleDiv = document.createElement('div');
  fullRuleDiv.className = 'full-rule-input';

  const ruleLabel = document.createElement('div');
  ruleLabel.className = 'instruction';
  ruleLabel.textContent = '输入完整规则:';
  fullRuleDiv.appendChild(ruleLabel);

  const inputBox = document.createElement('div');
  inputBox.className = 'rule-input-box';

  const ruleInput = document.createElement('input');
  ruleInput.type = 'text';
  ruleInput.className = 'rule-input';
  ruleInput.placeholder = '例如: 192.168.1.1 example.com';
  inputBox.appendChild(ruleInput);

  const addRuleBtn = document.createElement('button');
  addRuleBtn.className = 'button button-primary';
  addRuleBtn.textContent = '添加';
  addRuleBtn.addEventListener('click', async () => {
    const ruleText = ruleInput.value.trim();
    if (ruleText) {
      const parts = ruleText.split(/\s+/);
      if (parts.length >= 2) {
        const ip = parts[0];
        const domain = parts[1];

        // 创建新主机对象
        const newHost = {
          id: Date.now().toString(),
          ip,
          domain,
          enabled: true
        };

        // 使用 StateService 添加主机
        const success = await StateService.addHost(groupId, newHost);

        if (success) {
          // 清空输入框
          ruleInput.value = '';

          if (onAdd) {
            onAdd(newHost);
          }
        } else {
          Message.error('规则已存在或格式无效');
        }
      } else {
        Message.error('请输入有效的规则格式: [IP地址] [域名]');
      }
    }
  });
  inputBox.appendChild(addRuleBtn);
  fullRuleDiv.appendChild(inputBox);
  container.appendChild(fullRuleDiv);

  // 方式2: 分开的IP和域名输入
  const addHostForm = document.createElement('div');
  addHostForm.className = 'add-host';

  const separateTitle = document.createElement('div');
  separateTitle.className = 'instruction';
  separateTitle.textContent = '或者分别输入:';
  addHostForm.appendChild(separateTitle);

  const formRow = document.createElement('div');
  formRow.className = 'form-row';

  const ipInput = document.createElement('input');
  ipInput.type = 'text';
  ipInput.placeholder = 'IP 地址';

  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.placeholder = '域名';

  const addButton = document.createElement('button');
  addButton.className = 'button button-primary';
  addButton.textContent = '添加';
  addButton.addEventListener('click', async () => {
    const ip = ipInput.value.trim();
    const domain = domainInput.value.trim();

    if (ip && domain) {
      // 创建新主机对象
      const newHost = {
        id: Date.now().toString(),
        ip,
        domain,
        enabled: true
      };

      // 使用 StateService 添加主机
      const success = await StateService.addHost(groupId, newHost);

      if (success) {
        // 清空输入框
        ipInput.value = '';
        domainInput.value = '';

        if (onAdd) {
          onAdd(newHost);
        }
      } else {
        Message.error('规则已存在或格式无效');
      }
    } else {
      Message.error('IP地址和域名不能为空');
    }
  });

  formRow.appendChild(ipInput);
  formRow.appendChild(domainInput);
  formRow.appendChild(addButton);
  addHostForm.appendChild(formRow);
  container.appendChild(addHostForm);
}