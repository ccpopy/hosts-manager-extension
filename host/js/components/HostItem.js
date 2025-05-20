/**
 * 主机项组件
 * 处理主机规则项的创建和交互
 */
import StateService from '../services/StateService.js';
import SearchService from '../services/SearchService.js';
import Modal from './Modal.js';
import { Message } from '../utils/MessageUtils.js';
import { isValidIp, isValidDomain, normalizeHostRule } from '../utils/ValidationUtils.js';
import { debounce } from '../utils/PerformanceUtils.js';

// 节流控制常量
const THROTTLE_DELAY = 300; // 毫秒

// 主机项计数器 - 用于生成唯一ID
let hostItemCounter = 0;

/**
 * 创建主机元素
 * @param {string} groupId - 分组ID
 * @param {Object} host - 主机对象
 * @param {Function} onUpdate - 更新回调
 * @param {string} searchKeyword - 搜索关键字，用于高亮显示
 * @returns {HTMLElement} - 主机DOM元素
 */
export function createHostElement (groupId, host, onUpdate = null, searchKeyword = '') {
  // 生成唯一ID
  const uniqueId = `host-item-${++hostItemCounter}`;

  const hostItem = document.createElement('div');
  hostItem.className = 'host-item';
  hostItem.id = uniqueId;
  hostItem.dataset.hostId = host.id;
  hostItem.dataset.groupId = groupId;

  // 添加启用/禁用复选框
  const enabledCheckbox = createEnabledCheckbox(groupId, host, uniqueId, onUpdate);
  hostItem.appendChild(enabledCheckbox);

  // IP地址显示
  const ipSpan = document.createElement('span');
  ipSpan.className = 'host-ip';

  // 如果有搜索关键字，则高亮显示
  if (searchKeyword) {
    ipSpan.innerHTML = SearchService.highlightText(host.ip, searchKeyword);
  } else {
    ipSpan.textContent = host.ip;
  }
  hostItem.appendChild(ipSpan);

  // 域名显示
  const domainSpan = document.createElement('span');
  domainSpan.className = 'host-domain';

  // 如果有搜索关键字，则高亮显示
  if (searchKeyword) {
    domainSpan.innerHTML = SearchService.highlightText(host.domain, searchKeyword);
  } else {
    domainSpan.textContent = host.domain;
  }
  hostItem.appendChild(domainSpan);

  // 操作按钮容器
  const actionContainer = document.createElement('div');
  actionContainer.className = 'host-actions';
  actionContainer.style.display = 'flex';
  actionContainer.style.gap = '8px';

  // 编辑按钮
  const editButton = createButton('编辑', 'button-default', () => {
    createHostEditForm(groupId, host.id, host.ip, host.domain, hostItem, onUpdate);
  });
  actionContainer.appendChild(editButton);

  // 删除按钮
  const deleteButton = createButton('删除', 'button-danger', async () => {
    await handleDeleteHost(groupId, host.id, hostItem, onUpdate);
  });
  actionContainer.appendChild(deleteButton);

  hostItem.appendChild(actionContainer);

  return hostItem;
}

/**
 * 创建启用/禁用复选框
 * @param {string} groupId - 分组ID
 * @param {Object} host - 主机对象
 * @param {string} uniqueId - 唯一ID
 * @param {Function} onUpdate - 更新回调
 * @returns {HTMLElement} - 复选框元素
 */
function createEnabledCheckbox (groupId, host, uniqueId, onUpdate) {
  const checkboxId = `${uniqueId}-checkbox`;

  const checkboxContainer = document.createElement('div');
  checkboxContainer.className = 'checkbox-container';

  const enabledCheckbox = document.createElement('input');
  enabledCheckbox.type = 'checkbox';
  enabledCheckbox.id = checkboxId;
  enabledCheckbox.className = 'host-enabled';
  enabledCheckbox.checked = host.enabled;

  // 使用防抖函数包装切换事件
  const handleToggle = debounce(async () => {
    try {
      await StateService.toggleHost(groupId, host.id, enabledCheckbox.checked);
      if (onUpdate) {
        onUpdate('toggled');
      }
    } catch (error) {
      console.error('切换主机状态失败:', error);
      // 恢复原始状态
      enabledCheckbox.checked = !enabledCheckbox.checked;
      Message.error('切换状态失败，请重试');
    }
  }, THROTTLE_DELAY);

  // 添加事件监听器
  enabledCheckbox.addEventListener('change', handleToggle);

  checkboxContainer.appendChild(enabledCheckbox);

  // 添加标签提高点击区域
  const label = document.createElement('label');
  label.htmlFor = checkboxId;
  label.className = 'checkbox-label';
  label.setAttribute('aria-label', '启用或禁用规则');
  checkboxContainer.appendChild(label);

  return checkboxContainer;
}

/**
 * 创建按钮
 * @param {string} text - 按钮文字
 * @param {string} className - 额外的类名
 * @param {Function} onClick - 点击事件处理函数
 * @returns {HTMLElement} - 按钮元素
 */
function createButton (text, className, onClick) {
  const button = document.createElement('button');
  button.className = `button button-small ${className}`;
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

/**
 * 处理删除主机
 * @param {string} groupId - 分组ID
 * @param {string} hostId - 主机ID
 * @param {HTMLElement} hostItem - 主机元素
 * @param {Function} onUpdate - 更新回调
 */
async function handleDeleteHost (groupId, hostId, hostItem, onUpdate) {
  try {
    const confirmed = await Modal.confirm(
      '删除规则',
      '确定要删除此规则吗？此操作无法撤销。'
    );

    if (confirmed) {
      // 添加删除中状态
      hostItem.classList.add('deleting');

      // 执行删除操作
      const success = await StateService.deleteHost(groupId, hostId);

      if (success) {
        // 添加动画效果
        hostItem.style.height = `${hostItem.offsetHeight}px`;
        hostItem.style.opacity = '1';

        // 触发重绘以启动动画
        hostItem.offsetHeight;

        // 应用删除动画
        hostItem.style.height = '0';
        hostItem.style.opacity = '0';
        hostItem.style.padding = '0';
        hostItem.style.margin = '0';
        hostItem.style.overflow = 'hidden';

        // 动画完成后移除元素
        setTimeout(() => {
          if (hostItem.parentNode) {
            hostItem.parentNode.removeChild(hostItem);
          }

          // 通知上层组件主机已删除
          if (onUpdate) {
            onUpdate('deleted');
          }
        }, 300); // 300ms 与 CSS 动画时长匹配
      } else {
        hostItem.classList.remove('deleting');
        Message.error('删除规则失败，请重试');
      }
    }
  } catch (error) {
    console.error('删除主机失败:', error);
    hostItem.classList.remove('deleting');
    Message.error('删除规则失败：' + error.message);
  }
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
  // 创建编辑表单容器
  const editForm = document.createElement('div');
  editForm.className = 'host-edit-form';

  // IP输入框
  const ipInput = document.createElement('input');
  ipInput.type = 'text';
  ipInput.value = currentIp;
  ipInput.placeholder = 'IP 地址';
  ipInput.style.flex = '0 0 140px';
  ipInput.setAttribute('aria-label', 'IP 地址');

  // 域名输入框
  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.value = currentDomain;
  domainInput.placeholder = '域名';
  domainInput.style.flex = '1';
  domainInput.setAttribute('aria-label', '域名');

  // IP输入容器
  const ipContainer = document.createElement('div');
  ipContainer.style.display = 'flex';
  ipContainer.style.alignItems = 'center';
  ipContainer.appendChild(ipInput);
  // 移除对验证指示器的添加
  // ipContainer.appendChild(ipValidIndicator);

  // 域名输入容器
  const domainContainer = document.createElement('div');
  domainContainer.style.display = 'flex';
  domainContainer.style.alignItems = 'center';
  domainContainer.appendChild(domainInput);
  // 移除对验证指示器的添加
  // domainContainer.appendChild(domainValidIndicator);

  // 保存按钮
  const saveButton = createButton('保存', 'button-primary', async () => {
    // 获取并验证输入值
    const newIp = ipInput.value.trim();
    const newDomain = domainInput.value.trim();

    if (!newIp || !newDomain) {
      Message.error('IP地址和域名不能为空');
      return;
    }

    if (!isValidIp(newIp)) {
      Message.error('IP地址格式无效');
      ipInput.focus();
      return;
    }

    if (!isValidDomain(newDomain)) {
      Message.error('域名格式无效');
      domainInput.focus();
      return;
    }

    try {
      // 规范化主机规则
      const normalized = normalizeHostRule(newIp, newDomain);
      if (!normalized) {
        Message.error('规则格式无效');
        return;
      }

      // 使用 StateService 更新主机
      const updatedHost = await StateService.updateHost(groupId, hostId, normalized);

      if (updatedHost) {
        // 创建更新后的主机元素并替换编辑表单
        const newHostItem = createHostElement(groupId, updatedHost, onUpdate);
        if (editForm.parentNode) {
          editForm.parentNode.replaceChild(newHostItem, editForm);
        }

        // 添加高亮效果表示更新成功
        newHostItem.classList.add('updated');
        setTimeout(() => {
          newHostItem.classList.remove('updated');
        }, 2000);

        // 通知上层组件主机已更新
        if (onUpdate) {
          onUpdate(updatedHost);
        }
      } else {
        Message.error('IP和域名组合已存在，无法更新');
      }
    } catch (error) {
      console.error('更新主机失败:', error);
      Message.error('更新规则失败：' + error.message);
    }
  });

  // 取消按钮
  const cancelButton = createButton('取消', 'button-default', async () => {
    try {
      // 获取最新的主机数据
      const state = StateService.getState();
      const group = state.hostsGroups.find(g => g.id === groupId);

      if (group) {
        const host = group.hosts.find(h => h.id === hostId);
        if (host) {
          // 创建原始主机元素并替换编辑表单
          const originalHostItem = createHostElement(groupId, host, onUpdate);
          if (editForm.parentNode) {
            editForm.parentNode.replaceChild(originalHostItem, editForm);
          }
        }
      }
    } catch (error) {
      console.error('取消编辑失败:', error);
      Message.error('取消编辑失败，请重试');

      // 回退方案 - 尝试直接替换为原始元素
      try {
        const originalHostItem = createHostElement(
          groupId,
          { id: hostId, ip: currentIp, domain: currentDomain, enabled: true },
          onUpdate
        );
        editForm.parentNode.replaceChild(originalHostItem, editForm);
      } catch (e) {
        console.error('回退方案失败:', e);
      }
    }
  });

  // 将输入框和按钮添加到表单
  editForm.appendChild(ipContainer);
  editForm.appendChild(domainContainer);
  editForm.appendChild(saveButton);
  editForm.appendChild(cancelButton);

  // 替换DOM中的主机元素为编辑表单
  if (hostItem.parentNode) {
    hostItem.parentNode.replaceChild(editForm, hostItem);

    // 设置焦点
    setTimeout(() => {
      ipInput.focus();
      ipInput.select();
    }, 50);
  }
}

/**
 * 创建添加主机表单
 * @param {string} groupId - 分组ID
 * @param {HTMLElement} container - 容器元素
 * @param {Function} onAdd - 添加成功后回调
 */
export function createAddHostForm (groupId, container, onAdd) {
  // 创建表单容器
  const formContainer = document.createElement('div');
  formContainer.className = 'add-host-form-container';

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
  ruleInput.setAttribute('aria-label', '完整规则');
  inputBox.appendChild(ruleInput);

  // 使用防抖函数处理添加规则
  const handleAddRule = debounce(async () => {
    const ruleText = ruleInput.value.trim();
    if (!ruleText) {
      Message.error('请输入规则');
      return;
    }

    try {
      const result = await addRule(groupId, ruleText);
      if (result.success) {
        // 清空输入框
        ruleInput.value = '';

        // 通知上层组件
        if (onAdd) {
          onAdd(result.host);
        }
      } else {
        Message.error(result.message);
      }
    } catch (error) {
      console.error('添加规则失败:', error);
      Message.error('添加规则失败: ' + error.message);
    }
  }, THROTTLE_DELAY);

  const addRuleBtn = createButton('添加', 'button-primary', handleAddRule);
  inputBox.appendChild(addRuleBtn);

  // 添加回车键监听
  ruleInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleAddRule();
    }
  });

  fullRuleDiv.appendChild(inputBox);
  formContainer.appendChild(fullRuleDiv);

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
  ipInput.setAttribute('aria-label', 'IP 地址');

  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.placeholder = '域名';
  domainInput.setAttribute('aria-label', '域名');

  // IP输入容器
  const ipContainer = document.createElement('div');
  ipContainer.style.display = 'flex';
  ipContainer.style.alignItems = 'center';
  ipContainer.style.flex = '0 0 140px';
  ipContainer.appendChild(ipInput);

  // 域名输入容器
  const domainContainer = document.createElement('div');
  domainContainer.style.display = 'flex';
  domainContainer.style.alignItems = 'center';
  domainContainer.style.flex = '1';
  domainContainer.appendChild(domainInput);

  // 使用防抖函数处理添加按钮点击
  const handleAddSeparate = debounce(async () => {
    const ip = ipInput.value.trim();
    const domain = domainInput.value.trim();

    if (!ip || !domain) {
      Message.error('IP地址和域名不能为空');
      return;
    }

    if (!isValidIp(ip)) {
      Message.error('IP地址格式无效');
      ipInput.focus();
      return;
    }

    if (!isValidDomain(domain)) {
      Message.error('域名格式无效');
      domainInput.focus();
      return;
    }

    try {
      // 规范化主机规则
      const normalized = normalizeHostRule(ip, domain);
      if (!normalized) {
        Message.error('规则格式无效');
        return;
      }

      // 构建主机对象
      const newHost = {
        id: Date.now().toString(),
        ...normalized,
        enabled: true
      };

      // 使用 StateService 添加主机
      const success = await StateService.addHost(groupId, newHost);

      if (success) {
        // 清空输入框
        ipInput.value = '';
        domainInput.value = '';

        // 移除验证指示器代码
        // 原代码删除开始
        /*
        // 重置验证指示器
        ipValidIndicator.style.backgroundColor = '#d1d5db';
        domainValidIndicator.style.backgroundColor = '#d1d5db';
        */
        // 原代码删除结束

        if (onAdd) {
          onAdd(newHost);
        }
      } else {
        Message.error('规则已存在或格式无效');
      }
    } catch (error) {
      console.error('添加主机失败:', error);
      Message.error('添加规则失败: ' + error.message);
    }
  }, THROTTLE_DELAY);

  const addButton = createButton('添加', 'button-primary', handleAddSeparate);

  // 添加回车键监听
  domainInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleAddSeparate();
    }
  });

  ipInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      // 如果IP有效，聚焦到域名
      if (isValidIp(ipInput.value.trim())) {
        domainInput.focus();
      } else {
        // 否则尝试添加（会显示错误消息）
        handleAddSeparate();
      }
    }
  });

  formRow.appendChild(ipContainer);
  formRow.appendChild(domainContainer);
  formRow.appendChild(addButton);
  addHostForm.appendChild(formRow);
  formContainer.appendChild(addHostForm);

  // 将表单容器添加到指定容器
  container.appendChild(formContainer);
}

/**
 * 添加规则
 * @param {string} groupId - 分组ID
 * @param {string} ruleText - 规则文本
 * @returns {Promise<object>} - 结果对象
 */
async function addRule (groupId, ruleText) {
  // 解析规则
  const parts = ruleText.split(/\s+/);
  if (parts.length < 2) {
    return {
      success: false,
      message: '请输入有效的规则格式: [IP地址] [域名]'
    };
  }

  const ip = parts[0];
  const domain = parts[1];

  // 验证IP和域名
  if (!isValidIp(ip)) {
    return {
      success: false,
      message: 'IP地址格式无效'
    };
  }

  if (!isValidDomain(domain)) {
    return {
      success: false,
      message: '域名格式无效'
    };
  }

  // 规范化主机规则
  const normalized = normalizeHostRule(ip, domain);
  if (!normalized) {
    return {
      success: false,
      message: '规则格式无效'
    };
  }

  // 创建新主机对象
  const newHost = {
    id: Date.now().toString(),
    ...normalized,
    enabled: true
  };

  // 使用 StateService 添加主机
  const success = await StateService.addHost(groupId, newHost);

  if (success) {
    return {
      success: true,
      host: newHost
    };
  } else {
    return {
      success: false,
      message: '规则已存在或格式无效'
    };
  }
}