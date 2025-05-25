/**
 * 主机项组件
 * 处理主机规则项的创建和交互
 */
import StateService from '../services/StateService.js';
import SearchService from '../services/SearchService.js';
import Modal from './Modal.js';
import { Message } from '../utils/MessageUtils.js';
import { isValidIp, isValidDomain, normalizeHostRule, parseHostRule } from '../utils/ValidationUtils.js';
import { debounce } from '../utils/PerformanceUtils.js';

// 节流控制常量
const THROTTLE_DELAY = 500;

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
  if (!host || !host.id) {
    console.error('创建主机元素失败：主机对象无效', host);
    // 创建一个错误提示元素代替
    const errorEl = document.createElement('div');
    errorEl.className = 'host-item error';
    errorEl.textContent = '无效的主机规则';
    return errorEl;
  }

  // 验证主机规则的完整性
  if (!isValidIp(host.ip) || !isValidDomain(host.domain)) {
    console.warn('主机规则验证失败:', host);
    const warningEl = document.createElement('div');
    warningEl.className = 'host-item warning';
    warningEl.textContent = `无效规则: ${host.ip} ${host.domain}`;
    warningEl.style.backgroundColor = 'var(--warning-light)';
    warningEl.style.color = 'var(--warning-dark)';
    return warningEl;
  }

  // 生成唯一ID
  const uniqueId = `host-item-${++hostItemCounter}`;

  const hostItem = document.createElement('div');
  hostItem.className = 'host-item';
  hostItem.id = uniqueId;
  hostItem.dataset.hostId = host.id;
  hostItem.dataset.groupId = groupId;
  // 添加额外标记是否为搜索结果中的元素
  hostItem.dataset.isSearchResult = !!searchKeyword;

  try {
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

    // IP地址验证
    if (host.ip && !isValidIp(host.ip)) {
      ipSpan.style.color = 'var(--error-color)';
      ipSpan.title = 'IP地址格式无效';
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

    // 域名验证
    if (host.domain && !isValidDomain(host.domain)) {
      domainSpan.style.color = 'var(--error-color)';
      domainSpan.title = '域名格式无效';
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

    // 添加状态标记，用于识别启用/禁用状态
    hostItem.dataset.enabled = String(!!host.enabled);

    return hostItem;
  } catch (error) {
    console.error('创建主机元素时发生错误:', error);
    // 创建一个错误提示元素代替
    const errorEl = document.createElement('div');
    errorEl.className = 'host-item error';
    errorEl.textContent = '加载规则失败';
    return errorEl;
  }
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
  enabledCheckbox.checked = !!host.enabled;

  // 使用防抖函数包装切换事件，增加延迟时间
  const handleToggle = debounce(async () => {
    try {
      // 显示处理中状态
      enabledCheckbox.disabled = true;
      const hostItem = checkboxContainer.closest('.host-item');
      if (hostItem) {
        hostItem.style.opacity = '0.6';
      }

      await StateService.toggleHost(groupId, host.id, enabledCheckbox.checked);

      // 同步更新DOM
      if (hostItem) {
        hostItem.dataset.enabled = String(enabledCheckbox.checked);
        hostItem.style.opacity = '1';
      }

      // 触发自定义事件通知状态变化
      dispatchHostModifiedEvent(host.id, groupId, 'toggled');

      if (onUpdate) {
        // 传递具体的操作类型
        onUpdate('toggled');
      }
    } catch (error) {
      console.error('切换主机状态失败:', error);
      // 恢复原始状态
      enabledCheckbox.checked = !enabledCheckbox.checked;
      Message.error('切换状态失败，请重试');

      // 恢复UI状态
      const hostItem = checkboxContainer.closest('.host-item');
      if (hostItem) {
        hostItem.style.opacity = '1';
      }
    } finally {
      // 恢复复选框
      enabledCheckbox.disabled = false;
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
      '确定要删除此规则吗？此操作无法撤销，将立即更新网络请求规则。'
    );

    if (confirmed) {
      // 添加删除中状态
      hostItem.classList.add('deleting');
      hostItem.style.opacity = '0.5';

      // 禁用所有按钮
      const buttons = hostItem.querySelectorAll('button');
      buttons.forEach(btn => btn.disabled = true);

      // 执行删除操作
      const success = await StateService.deleteHost(groupId, hostId);

      if (success) {
        // 触发自定义事件通知删除状态变化
        dispatchHostModifiedEvent(hostId, groupId, 'deleted');

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

        // 动画完成后移除元素，300ms 与 CSS 动画时长匹配
        setTimeout(() => {
          if (hostItem.parentNode) {
            hostItem.parentNode.removeChild(hostItem);
          }

          // 通知上层组件主机已删除
          if (onUpdate) {
            onUpdate('deleted');
          }
        }, 300);
      } else {
        // 恢复状态
        hostItem.classList.remove('deleting');
        hostItem.style.opacity = '1';
        buttons.forEach(btn => btn.disabled = false);
        Message.error('删除规则失败，请重试');
      }
    }
  } catch (error) {
    console.error('删除主机失败:', error);
    hostItem.classList.remove('deleting');
    hostItem.style.opacity = '1';

    // 恢复按钮状态
    const buttons = hostItem.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = false);

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
  editForm.dataset.groupId = groupId;
  editForm.dataset.hostId = hostId;
  editForm.dataset.isSearchResult = hostItem.dataset.isSearchResult;

  // IP输入框
  const ipInput = document.createElement('input');
  ipInput.type = 'text';
  ipInput.value = currentIp;
  ipInput.placeholder = 'IP 地址';
  ipInput.style.flex = '0 0 140px';
  ipInput.setAttribute('aria-label', 'IP 地址');

  // 添加实时验证
  ipInput.addEventListener('input', () => {
    const value = ipInput.value.trim();
    if (value && !isValidIp(value)) {
      ipInput.style.borderColor = 'var(--error-color)';
      ipInput.title = 'IP地址格式无效';
    } else {
      ipInput.style.borderColor = '';
      ipInput.title = '';
    }
  });

  // 域名输入框
  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.value = currentDomain;
  domainInput.placeholder = '域名';
  domainInput.style.flex = '1';
  domainInput.setAttribute('aria-label', '域名');

  // 添加实时验证
  domainInput.addEventListener('input', () => {
    const value = domainInput.value.trim();
    if (value && !isValidDomain(value)) {
      domainInput.style.borderColor = 'var(--error-color)';
      domainInput.title = '域名格式无效';
    } else {
      domainInput.style.borderColor = '';
      domainInput.title = '';
    }
  });

  // IP输入容器
  const ipContainer = document.createElement('div');
  ipContainer.style.display = 'flex';
  ipContainer.style.alignItems = 'center';
  ipContainer.appendChild(ipInput);

  // 域名输入容器
  const domainContainer = document.createElement('div');
  domainContainer.style.display = 'flex';
  domainContainer.style.alignItems = 'center';
  domainContainer.appendChild(domainInput);

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
      // 禁用保存按钮，显示处理中状态
      saveButton.disabled = true;
      saveButton.textContent = '保存中...';

      // 规范化主机规则
      const normalized = normalizeHostRule(newIp, newDomain);
      if (!normalized) {
        Message.error('规则格式无效');
        return;
      }

      // 使用 StateService 更新主机
      const updatedHost = await StateService.updateHost(groupId, hostId, normalized);

      if (updatedHost) {
        // 触发自定义事件通知更新状态变化
        dispatchHostModifiedEvent(hostId, groupId, 'updated');

        // 判断是否为搜索结果中的编辑
        const isSearchResult = editForm.dataset.isSearchResult === 'true';

        // 创建更新后的主机元素
        const newHostItem = createHostElement(
          groupId,
          updatedHost,
          onUpdate,
          // 保留搜索关键字高亮
          isSearchResult ? editForm.dataset.searchKeyword : ''
        );

        // 替换编辑表单
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
          onUpdate('updated');
        }

        Message.success('规则更新成功，网络请求规则已更新');
      } else {
        Message.error('IP和域名组合已存在，无法更新');
      }
    } catch (error) {
      console.error('更新主机失败:', error);
      Message.error('更新规则失败：' + error.message);
    } finally {
      // 恢复按钮状态
      saveButton.disabled = false;
      saveButton.textContent = '保存';
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
          // 判断是否为搜索结果中的编辑
          const isSearchResult = editForm.dataset.isSearchResult === 'true';

          // 创建原始主机元素
          const originalHostItem = createHostElement(
            groupId,
            host,
            onUpdate,
            isSearchResult ? editForm.dataset.searchKeyword : '' // 保留搜索关键字高亮
          );

          // 替换编辑表单
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
        // 判断是否为搜索结果中的编辑
        const isSearchResult = editForm.dataset.isSearchResult === 'true';

        const originalHostItem = createHostElement(
          groupId,
          { id: hostId, ip: currentIp, domain: currentDomain, enabled: true },
          onUpdate,
          isSearchResult ? editForm.dataset.searchKeyword : ''
        );

        if (editForm.parentNode) {
          editForm.parentNode.replaceChild(originalHostItem, editForm);
        }
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

  // 保存搜索关键字，用于取消时恢复高亮
  if (hostItem.dataset.isSearchResult === 'true') {
    // 尝试从当前元素获取搜索关键字
    const ipSpan = hostItem.querySelector('.host-ip');
    const domainSpan = hostItem.querySelector('.host-domain');

    if (ipSpan && ipSpan.innerHTML.includes('highlight') &&
      domainSpan && domainSpan.innerHTML.includes('highlight')) {
      // 尝试提取搜索关键字
      try {
        const highlightMatch = ipSpan.innerHTML.match(/<span class="highlight">(.+?)<\/span>/);
        if (highlightMatch && highlightMatch[1]) {
          editForm.dataset.searchKeyword = highlightMatch[1];
        }
      } catch (error) {
        // 忽略提取错误
      }
    }
  }

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

  // 添加实时验证
  ruleInput.addEventListener('input', () => {
    const value = ruleInput.value.trim();
    if (value) {
      const parsed = parseHostRule(value);
      if (!parsed || !isValidIp(parsed.ip) || !isValidDomain(parsed.domain)) {
        ruleInput.style.borderColor = 'var(--error-color)';
        ruleInput.title = '规则格式无效，请使用格式：IP地址 域名';
      } else {
        ruleInput.style.borderColor = 'var(--success-color)';
        ruleInput.title = '规则格式正确';
      }
    } else {
      ruleInput.style.borderColor = '';
      ruleInput.title = '';
    }
  });

  inputBox.appendChild(ruleInput);

  // 使用防抖函数处理添加规则，增加延迟时间
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
        ruleInput.style.borderColor = '';
        ruleInput.title = '';

        // 触发自定义事件通知添加状态变化
        dispatchHostModifiedEvent(result.host.id, groupId, 'added');

        // 通知上层组件
        if (onAdd) {
          onAdd(result.host);
        }

        Message.success('规则添加成功，网络请求规则已更新');
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

  // 添加实时验证
  ipInput.addEventListener('input', () => {
    const value = ipInput.value.trim();
    if (value && !isValidIp(value)) {
      ipInput.style.borderColor = 'var(--error-color)';
      ipInput.title = 'IP地址格式无效';
    } else if (value) {
      ipInput.style.borderColor = 'var(--success-color)';
      ipInput.title = 'IP地址格式正确';
    } else {
      ipInput.style.borderColor = '';
      ipInput.title = '';
    }
  });

  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.placeholder = '域名';
  domainInput.setAttribute('aria-label', '域名');

  // 添加实时验证
  domainInput.addEventListener('input', () => {
    const value = domainInput.value.trim();
    if (value && !isValidDomain(value)) {
      domainInput.style.borderColor = 'var(--error-color)';
      domainInput.title = '域名格式无效';
    } else if (value) {
      domainInput.style.borderColor = 'var(--success-color)';
      domainInput.title = '域名格式正确';
    } else {
      domainInput.style.borderColor = '';
      domainInput.title = '';
    }
  });

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

  // 使用防抖函数处理添加按钮点击，增加延迟时间
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
        // 触发自定义事件通知添加状态变化
        dispatchHostModifiedEvent(newHost.id, groupId, 'added');

        // 清空输入框
        ipInput.value = '';
        domainInput.value = '';
        ipInput.style.borderColor = '';
        domainInput.style.borderColor = '';
        ipInput.title = '';
        domainInput.title = '';

        if (onAdd) {
          onAdd(newHost);
        }

        Message.success('规则添加成功，网络请求规则已更新');
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
  const parsedRule = parseHostRule(ruleText);

  if (!parsedRule) {
    return {
      success: false,
      message: '请输入有效的规则格式: [IP地址] [域名]'
    };
  }

  const { ip, domain } = parsedRule;

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

/**
 * 触发主机修改事件
 * 用于在视图之间同步状态变更
 * @param {string} hostId - 主机ID
 * @param {string} groupId - 分组ID
 * @param {string} action - 操作类型 ('added'|'deleted'|'updated'|'toggled')
 */
function dispatchHostModifiedEvent (hostId, groupId, action) {
  try {
    const event = new CustomEvent('hostModified', {
      bubbles: true,
      detail: {
        hostId,
        groupId,
        action
      }
    });
    document.dispatchEvent(event);
  } catch (error) {
    console.error('触发主机修改事件失败:', error);
  }
}