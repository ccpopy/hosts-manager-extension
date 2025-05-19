import StorageService from '../services/StorageService.js';
import ProxyService from '../services/ProxyService.js';
import Modal from './Modal.js';
import { showMessage } from '../utils/MessageUtils.js';

/**
 * 创建主机元素
 * @param {string} groupId - 分组ID
 * @param {Object} host - 主机对象
 * @param {Function} onUpdate - 更新回调
 * @returns {HTMLElement} - 主机DOM元素
 */
export function createHostElement (groupId, host, onUpdate = null) {
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
    await StorageService.toggleHost(groupId, host.id, enabledCheckbox.checked);
    await ProxyService.updateProxySettings();
    if (onUpdate) onUpdate();
  });

  const ipSpan = document.createElement('span');
  ipSpan.className = 'host-ip';
  ipSpan.textContent = host.ip;

  const domainSpan = document.createElement('span');
  domainSpan.className = 'host-domain';
  domainSpan.textContent = host.domain;

  const editButton = document.createElement('button');
  editButton.className = 'button button-default button-small';
  editButton.style.marginRight = '8px';
  editButton.textContent = '编辑';
  editButton.addEventListener('click', () => {
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
      await StorageService.deleteHost(groupId, host.id);
      await ProxyService.updateProxySettings();
      hostItem.remove();

      // 检查是否需要显示空状态
      const groupContent = hostItem.closest('.group-content');
      if (groupContent) {
        const remainingHosts = groupContent.querySelectorAll('.host-item');
        if (remainingHosts.length === 0) {
          const emptyHosts = document.createElement('div');
          emptyHosts.className = 'empty-state';
          emptyHosts.style.padding = '16px 0';
          emptyHosts.style.color = 'var(--gray-500)';
          emptyHosts.textContent = '该分组还没有hosts条目';

          // 插入到添加表单之前
          const formTitle = groupContent.querySelector('.section-title');
          if (formTitle) {
            groupContent.insertBefore(emptyHosts, formTitle);
          }
        }
      }

      if (onUpdate) onUpdate();
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
      const updatedHost = await StorageService.updateHost(groupId, hostId, { ip: newIp, domain: newDomain });
      await ProxyService.updateProxySettings();

      if (updatedHost) {
        const newHostItem = createHostElement(groupId, updatedHost, onUpdate);
        editForm.parentNode.replaceChild(newHostItem, editForm);
        if (onUpdate) onUpdate();
      }
    } else {
      showMessage(editForm, 'IP和域名不能为空', 'error');
    }
  });

  const cancelButton = document.createElement('button');
  cancelButton.className = 'button button-default button-small';
  cancelButton.textContent = '取消';
  cancelButton.addEventListener('click', async () => {
    // 恢复原始的host元素
    const { hostsGroups } = await StorageService.get('hostsGroups');
    const group = hostsGroups.find(g => g.id === groupId);
    if (group) {
      const host = group.hosts.find(h => h.id === hostId);
      if (host) {
        const originalHostItem = createHostElement(groupId, host, onUpdate);
        editForm.parentNode.replaceChild(originalHostItem, editForm);
      }
    }
  });

  editForm.appendChild(ipInput);
  editForm.appendChild(domainInput);
  editForm.appendChild(saveButton);
  editForm.appendChild(cancelButton);

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
        await addHost(groupId, ip, domain, container, onAdd);
        ruleInput.value = '';
      } else {
        showMessage(fullRuleDiv, '请输入有效的规则格式: [IP地址] [域名]', 'error');
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
      await addHost(groupId, ip, domain, container, onAdd);
      ipInput.value = '';
      domainInput.value = '';
    } else {
      showMessage(addHostForm, 'IP地址和域名都不能为空', 'error');
    }
  });

  formRow.appendChild(ipInput);
  formRow.appendChild(domainInput);
  formRow.appendChild(addButton);
  addHostForm.appendChild(formRow);
  container.appendChild(addHostForm);
}

/**
 * 添加主机
 * @param {string} groupId - 分组ID
 * @param {string} ip - IP地址
 * @param {string} domain - 域名
 * @param {HTMLElement} container - 容器元素
 * @param {Function} onAdd - 添加成功后回调
 */
async function addHost (groupId, ip, domain, container, onAdd) {
  const newHost = {
    id: Date.now().toString(),
    ip,
    domain,
    enabled: true
  };

  const success = await StorageService.addHost(groupId, newHost);

  if (success) {
    await ProxyService.updateProxySettings();

    // 移除空状态提示（如果存在）
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    // 找到添加host表单之前的位置
    const formTitle = container.querySelector('.section-title');
    if (formTitle) {
      // 创建新的host元素并插入到表单之前
      const hostItem = createHostElement(groupId, newHost, onAdd);
      container.insertBefore(hostItem, formTitle);
    }

    if (onAdd) onAdd();
  }
}