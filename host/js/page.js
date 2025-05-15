// Modal functionality
class Modal {
  static show (options) {
    const { title, message, type = 'confirm', placeholder = '', defaultValue = '', onConfirm, onCancel } = options;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    const titleEl = document.createElement('h3');
    titleEl.className = 'modal-title';
    titleEl.textContent = title;
    header.appendChild(titleEl);

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';

    if (type === 'prompt') {
      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      body.appendChild(messageEl);

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder;
      input.value = defaultValue;
      input.id = 'modal-input';
      body.appendChild(input);

      // Auto focus
      setTimeout(() => input.focus(), 100);
    } else {
      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      body.appendChild(messageEl);
    }

    // Footer
    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'button button-default';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      if (onCancel) onCancel();
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'button button-primary';
    confirmBtn.textContent = '确定';
    confirmBtn.addEventListener('click', () => {
      const value = type === 'prompt' ? document.getElementById('modal-input').value : true;
      document.body.removeChild(overlay);
      if (onConfirm) onConfirm(value);
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Handle Enter key for prompt
    if (type === 'prompt') {
      const input = document.getElementById('modal-input');
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          confirmBtn.click();
        }
      });
    }

    // Handle Escape key
    document.addEventListener('keydown', function escapeHandler (e) {
      if (e.key === 'Escape') {
        document.body.removeChild(overlay);
        document.removeEventListener('keydown', escapeHandler);
        if (onCancel) onCancel();
      }
    });
  }

  static confirm (title, message) {
    return new Promise((resolve) => {
      Modal.show({
        title,
        message,
        type: 'confirm',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  }

  static prompt (title, message, defaultValue = '') {
    return new Promise((resolve) => {
      Modal.show({
        title,
        message,
        type: 'prompt',
        defaultValue,
        onConfirm: (value) => resolve(value),
        onCancel: () => resolve(null)
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  renderApp();

  // 监听存储变化，但只更新必要的部分
  chrome.storage.onChanged.addListener((changes, namespace) => {
    // 只有在非hosts相关的变化时才重新渲染整个页面
    if (changes.showAddGroupForm || changes.socketProxy) {
      renderApp();
    }
    // 对于hosts的变化，我们已经在各个操作中手动处理了DOM
  });
});

function renderApp () {
  chrome.storage.local.get(['hostsGroups', 'activeGroups', 'showAddGroupForm'], (result) => {
    const { hostsGroups = [], activeGroups = [], showAddGroupForm = false } = result;

    const container = document.createElement('div');
    container.className = 'container';

    // 顶部标题栏
    const header = document.createElement('div');
    header.className = 'header';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'Hosts Manager';

    header.appendChild(title);
    container.appendChild(header);

    // 内容区域
    const contentArea = document.createElement('div');
    contentArea.className = 'content-area';

    // 侧边栏菜单
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';

    const hostsMenuItem = createMenuItem('Hosts 配置', 'hosts', true, `
      <svg class="menu-icon" style="vertical-align: middle;fill: currentColor;overflow: hidden;" viewBox="0 0 1069 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M746.027944 190.083832q-11.241517 0-18.906188-7.664671t-12.774451-17.884232-7.664671-20.9501-2.55489-17.884232l0-125.700599 2.043912 0q9.197605 0 17.373253 2.043912t19.928144 9.708583 28.61477 21.461078 42.411178 36.279441q27.592814 24.526946 43.944112 41.389222t25.037924 28.61477 10.730539 19.928144 2.043912 14.307385l0 16.351297-150.227545 0zM1063.856287 671.42515q3.065868 8.175649 4.087824 20.439122t-10.219561 23.50499q-5.10978 5.10978-9.197605 9.708583t-7.153693 7.664671q-4.087824 4.087824-7.153693 6.131737l-86.866267-85.844311q6.131737-5.10978 13.796407-12.263473t12.774451-11.241517q12.263473-11.241517 26.570858-9.708583t23.50499 6.642715q10.219561 5.10978 21.972056 17.884232t17.884232 27.081836zM703.105788 766.467066q22.483034 0 37.812375-12.263473l-198.259481 206.43513-282.05988 0q-19.417166 0-42.411178-11.241517t-42.922156-29.636727-33.213573-42.411178-13.285429-49.56487l0-695.952096q0-21.461078 9.708583-44.966068t26.570858-42.411178 38.323353-31.680639 44.966068-12.774451l391.409182 0 0 127.744511q0 19.417166 6.131737 41.9002t18.906188 41.389222 33.213573 31.680639 49.053892 12.774451l149.205589 0 0 338.267465-140.007984 145.117764q11.241517-16.351297 11.241517-35.768463 0-26.570858-18.906188-45.477046t-45.477046-18.906188l-383.233533 0q-26.570858 0-44.966068 18.906188t-18.39521 45.477046 18.39521 44.966068 44.966068 18.39521l383.233533 0zM319.872255 383.233533q-26.570858 0-44.966068 18.906188t-18.39521 45.477046 18.39521 44.966068 44.966068 18.39521l383.233533 0q26.570858 0 45.477046-18.39521t18.906188-44.966068-18.906188-45.477046-45.477046-18.906188l-383.233533 0zM705.149701 895.233533l13.285429-13.285429 25.548902-25.548902q15.329341-15.329341 33.724551-34.235529t36.790419-37.301397q43.944112-43.944112 99.129741-98.107784l85.844311 85.844311-99.129741 99.129741-36.790419 36.790419-33.724551 33.724551q-14.307385 14.307385-24.015968 24.526946t-10.730539 11.241517q-5.10978 4.087824-11.241517 8.686627t-12.263473 7.664671-18.906188 7.664671-26.05988 8.686627-25.548902 7.153693-18.39521 4.087824q-12.263473 2.043912-16.351297-3.065868t-2.043912-17.373253q1.021956-6.131737 4.087824-18.39521t7.153693-25.037924 7.664671-24.015968 5.620758-15.329341q6.131737-13.285429 16.351297-23.50499z"></path></svg>
    `);

    const batchImportMenuItem = createMenuItem('批量导入', 'import', false, `
      <svg class="menu-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-5L9 2H4z" clip-rule="evenodd"/>
      </svg>
    `);

    const proxyMenuItem = createMenuItem('Socket 代理', 'proxy', false, `
      <svg class="menu-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
      </svg>
    `);

    sidebar.appendChild(hostsMenuItem);
    sidebar.appendChild(batchImportMenuItem);
    sidebar.appendChild(proxyMenuItem);
    contentArea.appendChild(sidebar);

    // 主内容区
    const mainContent = document.createElement('div');
    mainContent.className = 'main-content';

    // Hosts 配置内容
    const hostsContent = document.createElement('div');
    hostsContent.className = 'tab-content hosts-tab active';

    const hostsTitle = document.createElement('h2');
    hostsTitle.className = 'page-title';
    hostsTitle.textContent = 'Hosts 配置管理';
    hostsContent.appendChild(hostsTitle);

    // 提示信息
    const notice = createNotice(
      '可以创建多个分组，每个分组可以独立启用或禁用，方便管理不同场景的hosts配置。',
      'info',
      `<svg class="notice-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`
    );
    hostsContent.appendChild(notice);

    // 添加分组按钮
    const addGroupButton = document.createElement('div');
    addGroupButton.className = 'add-group-button';
    addGroupButton.innerHTML = '<span class="add-group-button-icon">+</span> 添加分组';
    addGroupButton.addEventListener('click', () => {
      chrome.storage.local.set({ showAddGroupForm: true });
    });

    hostsContent.appendChild(addGroupButton);

    // 内联添加分组表单
    if (showAddGroupForm) {
      const addGroupForm = createAddGroupForm();
      hostsContent.appendChild(addGroupForm);
    }

    // 分组列表
    const groupList = document.createElement('div');
    groupList.className = 'group-list';

    if (hostsGroups.length === 0 && !showAddGroupForm) {
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
        const groupItem = createGroupElement(group, activeGroups.includes(group.id));
        groupList.appendChild(groupItem);
      });
    }

    hostsContent.appendChild(groupList);
    mainContent.appendChild(hostsContent);

    // 批量导入内容
    const importContent = document.createElement('div');
    importContent.className = 'tab-content import-tab';

    const importTitle = document.createElement('h2');
    importTitle.className = 'page-title';
    importTitle.textContent = '批量导入 Hosts';
    importContent.appendChild(importTitle);

    // 提示信息
    const importNotice = createNotice(
      '可以一次性导入多条hosts规则，每行一条。支持 IP地址 域名 格式，# 开头的注释行会被忽略。',
      'info',
      `<svg class="notice-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`
    );
    importContent.appendChild(importNotice);

    const batchImportSection = document.createElement('div');
    batchImportSection.className = 'batch-import-section';

    const importSectionTitle = document.createElement('h3');
    importSectionTitle.className = 'section-title';
    importSectionTitle.textContent = '导入规则';
    batchImportSection.appendChild(importSectionTitle);

    const importInstructions = document.createElement('p');
    importInstructions.className = 'instruction';
    importInstructions.textContent = '在下面输入 hosts 规则，每行一条。格式为：';
    batchImportSection.appendChild(importInstructions);

    const formatExample = document.createElement('div');
    formatExample.className = 'batch-format-hint';
    formatExample.innerHTML = `
      <code>192.168.1.1 example.com</code><br>
      <code>127.0.0.1 localhost</code><br>
      <code># 注释行会被忽略</code>
    `;
    batchImportSection.appendChild(formatExample);

    // 分组选择
    const importGroupSelect = document.createElement('div');
    importGroupSelect.className = 'form-group';
    importGroupSelect.style.marginTop = '20px';

    const groupLabel = document.createElement('label');
    groupLabel.textContent = '导入到分组:';
    importGroupSelect.appendChild(groupLabel);

    const groupSelect = document.createElement('select');
    groupSelect.id = 'import-group-select';

    // 添加分组选项
    hostsGroups.forEach(group => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      groupSelect.appendChild(option);
    });

    importGroupSelect.appendChild(groupSelect);
    batchImportSection.appendChild(importGroupSelect);

    // 批量导入文本框
    const batchTextarea = document.createElement('textarea');
    batchTextarea.className = 'batch-textarea';
    batchTextarea.placeholder = '192.168.1.1 example.com\n127.0.0.1 localhost\n# 这是注释';
    batchImportSection.appendChild(batchTextarea);

    // 导入按钮
    const importActions = document.createElement('div');
    importActions.className = 'form-actions';

    const clearButton = document.createElement('button');
    clearButton.className = 'button button-default';
    clearButton.textContent = '清空';
    clearButton.addEventListener('click', () => {
      batchTextarea.value = '';
    });

    const importButton = document.createElement('button');
    importButton.className = 'button button-primary';
    importButton.textContent = '导入规则';
    importButton.addEventListener('click', async () => {
      const rules = batchTextarea.value.trim();
      const selectedGroupId = groupSelect.value;

      if (!rules) {
        showMessage(importActions, '请输入要导入的规则', 'error');
        return;
      }

      if (!selectedGroupId) {
        showMessage(importActions, '请选择一个分组', 'error');
        return;
      }

      const result = await parseAndImportRules(rules, selectedGroupId);
      if (result.success) {
        showMessage(importActions, `成功导入 ${result.imported} 条规则，${result.skipped} 条被跳过`, 'success');
        batchTextarea.value = '';
      } else {
        showMessage(importActions, result.message, 'error');
      }
    });

    importActions.appendChild(clearButton);
    importActions.appendChild(importButton);
    batchImportSection.appendChild(importActions);

    importContent.appendChild(batchImportSection);
    mainContent.appendChild(importContent);

    // Socket 代理内容
    const proxyContent = document.createElement('div');
    proxyContent.className = 'tab-content proxy-tab';

    const proxyTitle = document.createElement('h2');
    proxyTitle.className = 'page-title';
    proxyTitle.textContent = 'Socket 代理设置';
    proxyContent.appendChild(proxyTitle);

    // 提示信息
    const proxyNotice = createNotice(
      '可选配置一个SOCKS代理，用于不匹配hosts规则的请求。',
      'info',
      `<svg class="notice-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`
    );
    proxyContent.appendChild(proxyNotice);

    const proxySection = document.createElement('div');
    proxySection.className = 'proxy-section';

    // 主机输入
    const hostFormGroup = document.createElement('div');
    hostFormGroup.className = 'form-group';

    const hostLabel = document.createElement('label');
    hostLabel.textContent = '代理主机:';

    const hostInput = document.createElement('input');
    hostInput.type = 'text';
    hostInput.id = 'proxy-host';
    hostInput.placeholder = '例如: 127.0.0.1';

    hostFormGroup.appendChild(hostLabel);
    hostFormGroup.appendChild(hostInput);

    // 端口输入
    const portFormGroup = document.createElement('div');
    portFormGroup.className = 'form-group';

    const portLabel = document.createElement('label');
    portLabel.textContent = '端口:';

    const portInput = document.createElement('input');
    portInput.type = 'text';
    portInput.id = 'proxy-port';
    portInput.placeholder = '例如: 8080';

    portFormGroup.appendChild(portLabel);
    portFormGroup.appendChild(portInput);

    // 表单行
    const proxyForm = document.createElement('div');
    proxyForm.className = 'form-row';
    proxyForm.appendChild(hostFormGroup);
    proxyForm.appendChild(portFormGroup);
    proxySection.appendChild(proxyForm);

    // 启用代理切换
    const enableGroup = document.createElement('div');
    enableGroup.className = 'form-row';

    const enableLabel = document.createElement('label');
    enableLabel.textContent = '启用 Socket 代理:';
    enableLabel.style.marginBottom = '0';

    const toggleSwitch = document.createElement('label');
    toggleSwitch.className = 'toggle-switch';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'proxy-enabled';

    const slider = document.createElement('span');
    slider.className = 'slider';

    toggleSwitch.appendChild(checkbox);
    toggleSwitch.appendChild(slider);

    enableGroup.appendChild(enableLabel);
    enableGroup.appendChild(toggleSwitch);
    proxySection.appendChild(enableGroup);

    // 保存代理按钮
    const formActions = document.createElement('div');
    formActions.className = 'form-actions';

    const saveProxyBtn = document.createElement('button');
    saveProxyBtn.className = 'button button-primary';
    saveProxyBtn.textContent = '保存设置';
    saveProxyBtn.addEventListener('click', () => {
      const host = document.getElementById('proxy-host').value;
      const port = document.getElementById('proxy-port').value;
      const enabled = document.getElementById('proxy-enabled').checked;

      chrome.storage.local.set({
        socketProxy: { host, port, enabled }
      });

      // 重新加载代理设置
      chrome.runtime.sendMessage({ action: 'updateProxySettings' });

      showMessage(formActions, '设置已保存', 'success');
    });

    formActions.appendChild(saveProxyBtn);
    proxySection.appendChild(formActions);
    proxyContent.appendChild(proxySection);
    mainContent.appendChild(proxyContent);

    // 加载代理设置
    chrome.storage.local.get(['socketProxy'], (data) => {
      if (data.socketProxy) {
        document.getElementById('proxy-host').value = data.socketProxy.host || '';
        document.getElementById('proxy-port').value = data.socketProxy.port || '';
        document.getElementById('proxy-enabled').checked = !!data.socketProxy.enabled;
      }
    });

    contentArea.appendChild(mainContent);
    container.appendChild(contentArea);

    // 清除应用并附加新内容
    app.innerHTML = '';
    app.appendChild(container);

    // 设置菜单切换功能
    setupMenuNavigation();
  });
}

// 创建菜单项
function createMenuItem (text, tab, isActive, iconSvg) {
  const menuItem = document.createElement('div');
  menuItem.className = isActive ? 'menu-item active' : 'menu-item';
  menuItem.dataset.tab = tab;
  menuItem.innerHTML = iconSvg + `<span>${text}</span>`;
  return menuItem;
}

// 创建提示框
function createNotice (message, type, iconSvg) {
  const notice = document.createElement('div');
  notice.className = `notice-box ${type}`;
  notice.innerHTML = iconSvg + `<span>${message}</span>`;
  return notice;
}

// 设置菜单导航
function setupMenuNavigation () {
  const menuItems = document.querySelectorAll('.menu-item');
  const contentEls = document.querySelectorAll('.tab-content');

  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      // 移除所有活动状态
      menuItems.forEach(i => i.classList.remove('active'));
      contentEls.forEach(c => c.classList.remove('active'));

      // 设置当前活动选项卡
      item.classList.add('active');
      const tabName = item.dataset.tab;
      document.querySelector(`.${tabName}-tab`).classList.add('active');
    });
  });
}

// 解析并导入规则
async function parseAndImportRules (rulesText, groupId) {
  const lines = rulesText.split('\n');
  let imported = 0;
  let skipped = 0;

  return new Promise((resolve) => {
    chrome.storage.local.get(['hostsGroups'], (result) => {
      const hostsGroups = result.hostsGroups || [];
      const groupIndex = hostsGroups.findIndex(g => g.id === groupId);

      if (groupIndex === -1) {
        resolve({ success: false, message: '未找到指定的分组' });
        return;
      }

      const group = hostsGroups[groupIndex];
      const newHosts = [];

      lines.forEach(line => {
        line = line.trim();

        // 跳过空行和注释
        if (!line || line.startsWith('#')) {
          skipped++;
          return;
        }

        // 解析规则
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const ip = parts[0];
          const domain = parts[1];

          // 验证IP格式（简单验证）
          const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
          if (ipRegex.test(ip)) {
            // 检查是否已存在
            const exists = group.hosts.some(h => h.ip === ip && h.domain === domain);
            if (!exists) {
              newHosts.push({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                ip,
                domain,
                enabled: true
              });
              imported++;
            } else {
              skipped++;
            }
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
      });

      // 添加新的hosts条目
      if (newHosts.length > 0) {
        group.hosts.push(...newHosts);
        chrome.storage.local.set({ hostsGroups }, () => {
          // 发送消息到后台脚本更新代理设置
          chrome.runtime.sendMessage({ action: 'updateProxySettings' });
          resolve({ success: true, imported, skipped });
        });
      } else {
        resolve({ success: true, imported, skipped });
      }
    });
  });
}

// 显示消息提示
function showMessage (container, message, type = 'info') {
  const msgEl = document.createElement('div');
  msgEl.textContent = message;
  msgEl.className = 'message-temp';

  switch (type) {
    case 'error':
      msgEl.style.color = 'var(--error-color)';
      break;
    case 'success':
      msgEl.style.color = 'var(--success-color)';
      break;
    default:
      msgEl.style.color = 'var(--gray-700)';
  }

  // 移除现有消息
  const existingMsg = container.querySelector('.message-temp');
  if (existingMsg) {
    container.removeChild(existingMsg);
  }

  container.appendChild(msgEl);

  setTimeout(() => {
    if (container.contains(msgEl)) {
      container.removeChild(msgEl);
    }
  }, 3000);
}

// 创建内联添加分组表单
function createAddGroupForm () {
  const formContainer = document.createElement('div');
  formContainer.className = 'batch-import-section';
  formContainer.style.marginBottom = '24px';

  const formTitle = document.createElement('h3');
  formTitle.className = 'section-title';
  formTitle.textContent = '添加新分组';
  formContainer.appendChild(formTitle);

  // 分组名称输入
  const nameFormGroup = document.createElement('div');
  nameFormGroup.className = 'form-group';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = '分组名称:';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'group-name';
  nameInput.placeholder = '输入分组名称';

  nameFormGroup.appendChild(nameLabel);
  nameFormGroup.appendChild(nameInput);
  formContainer.appendChild(nameFormGroup);

  // 启用分组切换
  const enableGroup = document.createElement('div');
  enableGroup.className = 'form-row';
  enableGroup.style.marginTop = '16px';

  const enableLabel = document.createElement('label');
  enableLabel.textContent = '启用分组:';
  enableLabel.style.marginBottom = '0';

  const toggleSwitch = document.createElement('label');
  toggleSwitch.className = 'toggle-switch';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'group-enabled';
  checkbox.checked = true;

  const slider = document.createElement('span');
  slider.className = 'slider';

  toggleSwitch.appendChild(checkbox);
  toggleSwitch.appendChild(slider);

  enableGroup.appendChild(enableLabel);
  enableGroup.appendChild(toggleSwitch);
  formContainer.appendChild(enableGroup);

  // 表单操作按钮
  const formActions = document.createElement('div');
  formActions.className = 'form-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'button button-default';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => {
    chrome.storage.local.set({ showAddGroupForm: false });
  });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'button button-primary';
  saveBtn.textContent = '保存';
  saveBtn.addEventListener('click', () => {
    const name = document.getElementById('group-name').value.trim();
    const enabled = document.getElementById('group-enabled').checked;

    if (!name) {
      showMessage(formActions, '请输入分组名称', 'error');
      return;
    }

    // 保存新分组
    chrome.storage.local.get(['hostsGroups', 'activeGroups'], (result) => {
      const hostsGroups = result.hostsGroups || [];
      const activeGroups = result.activeGroups || [];

      const newGroup = {
        id: Date.now().toString(),
        name,
        hosts: [],
        enabled: true
      };

      hostsGroups.push(newGroup);

      // 如果启用，添加到活动分组
      if (enabled && !activeGroups.includes(newGroup.id)) {
        activeGroups.push(newGroup.id);
      }

      chrome.storage.local.set({
        hostsGroups,
        activeGroups,
        showAddGroupForm: false
      });
    });
  });

  formActions.appendChild(cancelBtn);
  formActions.appendChild(saveBtn);
  formContainer.appendChild(formActions);

  return formContainer;
}

// 创建分组元素
function createGroupElement (group, isActive) {
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
  checkbox.addEventListener('change', () => {
    toggleGroup(group.id, checkbox.checked);
    statusTag.className = checkbox.checked ? 'status-tag status-tag-success' : 'status-tag status-tag-default';
    statusTag.textContent = checkbox.checked ? '已启用' : '已禁用';
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
      const hostItem = createHostElement(group.id, host);
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
  addRuleBtn.addEventListener('click', () => {
    const ruleText = ruleInput.value.trim();
    if (ruleText) {
      const parts = ruleText.split(/\s+/);
      if (parts.length >= 2) {
        const ip = parts[0];
        const domain = parts[1];
        addHost(group.id, ip, domain);
        ruleInput.value = '';
      } else {
        showMessage(fullRuleDiv, '请输入有效的规则格式: [IP地址] [域名]', 'error');
      }
    }
  });
  inputBox.appendChild(addRuleBtn);
  fullRuleDiv.appendChild(inputBox);
  groupContent.appendChild(fullRuleDiv);

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
  addButton.addEventListener('click', () => {
    const ip = ipInput.value.trim();
    const domain = domainInput.value.trim();

    if (ip && domain) {
      addHost(group.id, ip, domain);
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
  groupContent.appendChild(addHostForm);

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
      renameGroup(group.id, newName.trim());
    }
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'button button-danger';
  deleteButton.textContent = '删除分组';
  deleteButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    const confirmed = await Modal.confirm('删除分组', `确定要删除分组 "${group.name}" 吗?`);
    if (confirmed) {
      deleteGroup(group.id);
    }
  });

  actionButtons.appendChild(editButton);
  actionButtons.appendChild(deleteButton);
  groupContent.appendChild(actionButtons);

  groupItem.appendChild(groupHeader);
  groupItem.appendChild(groupContent);

  return groupItem;
}

// 创建主机元素
function createHostElement (groupId, host) {
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
  enabledCheckbox.addEventListener('change', () => {
    toggleHost(groupId, host.id, enabledCheckbox.checked);
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
    editHost(groupId, host.id, host.ip, host.domain);
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
      deleteHost(groupId, host.id);
    }
  });

  hostItem.appendChild(enabledCheckbox);
  hostItem.appendChild(ipSpan);
  hostItem.appendChild(domainSpan);
  hostItem.appendChild(editButton);
  hostItem.appendChild(deleteButton);

  return hostItem;
}

// 分组操作
function renameGroup (groupId, newName) {
  chrome.storage.local.get(['hostsGroups'], (result) => {
    const hostsGroups = result.hostsGroups || [];
    const groupIndex = hostsGroups.findIndex(g => g.id === groupId);

    if (groupIndex !== -1) {
      hostsGroups[groupIndex].name = newName;
      chrome.storage.local.set({ hostsGroups });

      // 直接更新DOM中的分组名称
      const groupNameElement = document.querySelector(`.group-item:has([data-group-id="${groupId}"]) .group-name`);
      if (groupNameElement) {
        groupNameElement.textContent = newName;
      }
    }
  });
}

function deleteGroup (groupId) {
  chrome.storage.local.get(['hostsGroups', 'activeGroups'], (result) => {
    const hostsGroups = result.hostsGroups || [];
    const activeGroups = result.activeGroups || [];

    const newHostsGroups = hostsGroups.filter(g => g.id !== groupId);
    const newActiveGroups = activeGroups.filter(id => id !== groupId);

    chrome.storage.local.set({
      hostsGroups: newHostsGroups,
      activeGroups: newActiveGroups
    }, () => {
      // 从 DOM 中移除分组元素
      const groupItem = document.querySelector(`.group-item:has([data-group-id="${groupId}"])`);
      if (groupItem) {
        groupItem.remove();

        // 检查是否需要显示空状态
        const groupList = document.querySelector('.group-list');
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

      // 发送消息到后台脚本更新代理设置
      chrome.runtime.sendMessage({ action: 'updateProxySettings' });
    });
  });
}

function toggleGroup (groupId, enabled) {
  chrome.storage.local.get(['activeGroups'], (result) => {
    let activeGroups = result.activeGroups || [];

    if (enabled) {
      if (!activeGroups.includes(groupId)) {
        activeGroups.push(groupId);
      }
    } else {
      activeGroups = activeGroups.filter(id => id !== groupId);
    }

    chrome.storage.local.set({ activeGroups });
    chrome.runtime.sendMessage({ action: 'updateProxySettings' });
  });
}

// 主机操作
function addHost (groupId, ip, domain) {
  chrome.storage.local.get(['hostsGroups'], (result) => {
    const hostsGroups = result.hostsGroups || [];
    const groupIndex = hostsGroups.findIndex(g => g.id === groupId);

    if (groupIndex !== -1) {
      const newHost = {
        id: Date.now().toString(),
        ip,
        domain,
        enabled: true
      };

      hostsGroups[groupIndex].hosts.push(newHost);
      chrome.storage.local.set({ hostsGroups });

      chrome.runtime.sendMessage({ action: 'updateProxySettings' });

      // 直接在DOM中添加新的host元素，而不是重新渲染整个分组
      const groupContent = document.querySelector(`.group-item:has([data-group-id="${groupId}"]) .group-content`);
      if (groupContent) {
        // 移除空状态提示（如果存在）
        const emptyState = groupContent.querySelector('.empty-state');
        if (emptyState) {
          emptyState.remove();
        }

        // 找到添加host表单之前的位置
        const formTitle = groupContent.querySelector('.section-title');
        if (formTitle) {
          // 创建新的host元素并插入到表单之前
          const hostItem = createHostElement(groupId, newHost);
          groupContent.insertBefore(hostItem, formTitle);
        }

        // 清空输入框
        const ruleInput = groupContent.querySelector('.rule-input');
        const ipInputs = groupContent.querySelectorAll('input[placeholder="IP 地址"]');
        const domainInputs = groupContent.querySelectorAll('input[placeholder="域名"]');

        if (ruleInput) ruleInput.value = '';
        ipInputs.forEach(input => input.value = '');
        domainInputs.forEach(input => input.value = '');
      }
    }
  });
}

function toggleHost (groupId, hostId, enabled) {
  chrome.storage.local.get(['hostsGroups'], (result) => {
    const hostsGroups = result.hostsGroups || [];
    const groupIndex = hostsGroups.findIndex(g => g.id === groupId);

    if (groupIndex !== -1) {
      const hostIndex = hostsGroups[groupIndex].hosts.findIndex(h => h.id === hostId);

      if (hostIndex !== -1) {
        hostsGroups[groupIndex].hosts[hostIndex].enabled = enabled;
        chrome.storage.local.set({ hostsGroups });
        chrome.runtime.sendMessage({ action: 'updateProxySettings' });
      }
    }
  });
}

function deleteHost (groupId, hostId) {
  chrome.storage.local.get(['hostsGroups'], (result) => {
    const hostsGroups = result.hostsGroups || [];
    const groupIndex = hostsGroups.findIndex(g => g.id === groupId);

    if (groupIndex !== -1) {
      hostsGroups[groupIndex].hosts = hostsGroups[groupIndex].hosts.filter(h => h.id !== hostId);
      chrome.storage.local.set({ hostsGroups });
      chrome.runtime.sendMessage({ action: 'updateProxySettings' });

      // 直接从DOM中移除host元素
      const hostItem = document.querySelector(`.host-item:has([data-host-id="${hostId}"])`);
      if (hostItem && hostItem.parentNode) {
        const groupContent = hostItem.closest('.group-content');
        hostItem.remove();

        // 检查是否需要显示空状态
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
      }
    }
  });
}

// 编辑主机
function editHost (groupId, hostId, currentIp, currentDomain) {
  const hostItem = document.querySelector(`.host-item:has([data-host-id="${hostId}"])`);

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
  saveButton.addEventListener('click', () => {
    const newIp = ipInput.value.trim();
    const newDomain = domainInput.value.trim();

    if (newIp && newDomain) {
      updateHost(groupId, hostId, newIp, newDomain);
    } else {
      showMessage(editForm, 'IP和域名不能为空', 'error');
    }
  });

  const cancelButton = document.createElement('button');
  cancelButton.className = 'button button-default button-small';
  cancelButton.textContent = '取消';
  cancelButton.addEventListener('click', () => {
    // 恢复原始的host元素
    chrome.storage.local.get(['hostsGroups'], (result) => {
      const hostsGroups = result.hostsGroups || [];
      const group = hostsGroups.find(g => g.id === groupId);
      if (group) {
        const host = group.hosts.find(h => h.id === hostId);
        if (host) {
          const originalHostItem = createHostElement(groupId, host);
          editForm.parentNode.replaceChild(originalHostItem, editForm);
        }
      }
    });
  });

  editForm.appendChild(ipInput);
  editForm.appendChild(domainInput);
  editForm.appendChild(saveButton);
  editForm.appendChild(cancelButton);

  const parentNode = hostItem.parentNode;
  parentNode.replaceChild(editForm, hostItem);
}

// 更新主机
function updateHost (groupId, hostId, newIp, newDomain) {
  chrome.storage.local.get(['hostsGroups'], (result) => {
    const hostsGroups = result.hostsGroups || [];
    const groupIndex = hostsGroups.findIndex(g => g.id === groupId);

    if (groupIndex !== -1) {
      const hostIndex = hostsGroups[groupIndex].hosts.findIndex(h => h.id === hostId);

      if (hostIndex !== -1) {
        hostsGroups[groupIndex].hosts[hostIndex].ip = newIp;
        hostsGroups[groupIndex].hosts[hostIndex].domain = newDomain;

        chrome.storage.local.set({ hostsGroups });
        chrome.runtime.sendMessage({ action: 'updateProxySettings' });

        // 替换DOM中的编辑表单为更新后的host元素
        const editForm = document.querySelector('.host-edit-form');
        if (editForm) {
          const updatedHost = hostsGroups[groupIndex].hosts[hostIndex];
          const newHostItem = createHostElement(groupId, updatedHost);
          editForm.parentNode.replaceChild(newHostItem, editForm);
        }
      }
    }
  });
}

// 重新渲染单个分组
function reRenderGroupOnly (groupId, forceExpanded = false) {
  chrome.storage.local.get(['hostsGroups', 'activeGroups'], (result) => {
    const hostsGroups = result.hostsGroups || [];
    const activeGroups = result.activeGroups || [];

    const groupIndex = hostsGroups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return;

    const group = hostsGroups[groupIndex];
    const isActive = activeGroups.includes(group.id);

    const existingGroupItem = document.querySelector(`.group-item:has([data-group-id="${groupId}"])`);
    if (!existingGroupItem) return;

    const newGroupItem = createGroupElement(group, isActive);

    // 判断是否需要保持展开状态
    const wasExpanded = existingGroupItem.querySelector('.group-content').style.display === 'block';
    if (wasExpanded || forceExpanded) {
      newGroupItem.querySelector('.group-content').style.display = 'block';
    }

    existingGroupItem.parentNode.replaceChild(newGroupItem, existingGroupItem);
  });
}