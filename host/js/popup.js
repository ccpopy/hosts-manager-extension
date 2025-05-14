document.addEventListener('DOMContentLoaded', async () => {
  // 打开设置页面
  document.getElementById('open-settings').addEventListener('click', () => {
    chrome.tabs.create({ url: 'page.html' });
    window.close();
  });

  // 加载数据
  loadGroups();
  loadProxyStatus();

  // 监听存储变化
  chrome.storage.onChanged.addListener((changes, namespace) => {
    // 如果是 activeGroups 变化，重新加载整个列表
    if (changes.activeGroups) {
      loadGroups();
    }
    // 如果是 hostsGroups 变化，可能是单个规则的状态变化
    else if (changes.hostsGroups && !changes.activeGroups) {
      // 不重新加载整个列表
    }
    if (changes.socketProxy) {
      loadProxyStatus();
    }
  });
});

// 用于存储分组展开状态
const expandedGroups = new Set();

// 加载分组列表
async function loadGroups () {
  const result = await chrome.storage.local.get(['hostsGroups', 'activeGroups']);
  const hostsGroups = result.hostsGroups || [];
  const activeGroups = result.activeGroups || [];

  const groupsList = document.getElementById('groups-list');

  if (hostsGroups.length === 0) {
    groupsList.innerHTML = '<div class="empty-state">暂无分组，点击上方设置创建</div>';
    return;
  }

  groupsList.innerHTML = '';

  hostsGroups.forEach(group => {
    const isActive = activeGroups.includes(group.id);

    // 创建分组容器
    const groupSection = document.createElement('div');
    groupSection.className = 'group-section';
    groupSection.dataset.groupId = group.id;

    // 创建分组头
    const groupHeader = document.createElement('div');
    groupHeader.className = 'group-header';

    const arrow = document.createElement('div');
    arrow.className = 'arrow';

    const groupName = document.createElement('span');
    groupName.className = 'menu-text';
    groupName.textContent = group.name;

    // 分组开关
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle-switch';
    toggleLabel.addEventListener('click', (e) => e.stopPropagation());

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = isActive;
    toggleInput.addEventListener('change', () => {
      toggleGroup(group.id, toggleInput.checked);
    });

    const slider = document.createElement('span');
    slider.className = 'slider';

    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(slider);

    groupHeader.appendChild(arrow);
    groupHeader.appendChild(groupName);
    groupHeader.appendChild(toggleLabel);

    // 创建分组内容
    const groupContent = document.createElement('div');
    groupContent.className = 'group-content';

    // 如果之前是展开的，保持展开状态
    if (expandedGroups.has(group.id)) {
      arrow.classList.add('expanded');
      groupContent.classList.add('expanded');
    }

    // 添加规则列表
    if (group.hosts && group.hosts.length > 0) {
      group.hosts.forEach(host => {
        const ruleItem = document.createElement('div');
        ruleItem.className = 'rule-item';
        ruleItem.dataset.hostId = host.id;

        const ruleContent = document.createElement('div');
        ruleContent.className = 'rule-content';
        ruleContent.title = host.ip + " " + host.domain;

        const ruleIp = document.createElement('span');
        ruleIp.className = 'rule-ip';
        ruleIp.textContent = host.ip;

        const ruleDomain = document.createElement('span');
        ruleDomain.className = 'rule-domain';
        ruleDomain.textContent = host.domain;

        // 规则开关
        const ruleToggleLabel = document.createElement('label');
        ruleToggleLabel.className = 'toggle-switch';

        const ruleToggleInput = document.createElement('input');
        ruleToggleInput.type = 'checkbox';
        ruleToggleInput.checked = host.enabled;
        ruleToggleInput.dataset.groupId = group.id;
        ruleToggleInput.dataset.hostId = host.id;
        ruleToggleInput.addEventListener('change', () => {
          toggleHost(group.id, host.id, ruleToggleInput.checked);
        });

        const ruleSlider = document.createElement('span');
        ruleSlider.className = 'slider';

        ruleToggleLabel.appendChild(ruleToggleInput);
        ruleToggleLabel.appendChild(ruleSlider);

        ruleContent.appendChild(ruleIp);
        ruleContent.appendChild(ruleDomain);

        ruleItem.appendChild(ruleContent);
        ruleItem.appendChild(ruleToggleLabel);

        groupContent.appendChild(ruleItem);
      });
    } else {
      const emptyRules = document.createElement('div');
      emptyRules.className = 'empty-state';
      emptyRules.textContent = '暂无规则';
      groupContent.appendChild(emptyRules);
    }

    // 展开/收缩功能
    groupHeader.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT' && !e.target.closest('.toggle-switch')) {
        arrow.classList.toggle('expanded');
        groupContent.classList.toggle('expanded');

        // 记录展开状态
        if (arrow.classList.contains('expanded')) {
          expandedGroups.add(group.id);
        } else {
          expandedGroups.delete(group.id);
        }
      }
    });

    groupSection.appendChild(groupHeader);
    groupSection.appendChild(groupContent);
    groupsList.appendChild(groupSection);
  });
}

// 加载代理状态
async function loadProxyStatus () {
  const result = await chrome.storage.local.get(['socketProxy']);
  const socketProxy = result.socketProxy || {};

  const proxySwitch = document.getElementById('proxy-switch');
  const proxyStatus = document.getElementById('proxy-status');
  const proxyItem = document.getElementById('proxy-item');

  // 如果代理未配置，显示提示
  if (!socketProxy.host || !socketProxy.port) {
    proxyStatus.textContent = '未配置';
    proxySwitch.checked = false;
    proxySwitch.disabled = true;

    proxyItem.style.cursor = 'pointer';
    proxyItem.onclick = () => {
      chrome.tabs.create({ url: 'page.html' });
      window.close();
    };
  } else {
    proxyStatus.textContent = `${socketProxy.host}:${socketProxy.port}`;
    proxySwitch.checked = !!socketProxy.enabled;
    proxySwitch.disabled = false;

    // 移除点击事件
    proxyItem.style.cursor = 'default';
    proxyItem.onclick = null;

    // 代理开关事件
    proxySwitch.addEventListener('change', () => {
      chrome.storage.local.set({
        socketProxy: {
          ...socketProxy,
          enabled: proxySwitch.checked
        }
      });

      // 更新代理设置
      chrome.runtime.sendMessage({ action: 'updateProxySettings' });
    });
  }

  // 阻止事件冒泡
  document.getElementById('proxy-toggle').addEventListener('click', (e) => {
    if (!proxySwitch.disabled) {
      e.stopPropagation();
    }
  });
}

// 切换分组状态
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

// 切换单个Host状态
function toggleHost (groupId, hostId, enabled) {
  chrome.storage.local.get(['hostsGroups'], (result) => {
    const hostsGroups = result.hostsGroups || [];
    const groupIndex = hostsGroups.findIndex(g => g.id === groupId);

    if (groupIndex !== -1) {
      const hostIndex = hostsGroups[groupIndex].hosts.findIndex(h => h.id === hostId);

      if (hostIndex !== -1) {
        hostsGroups[groupIndex].hosts[hostIndex].enabled = enabled;
        chrome.storage.local.set({ hostsGroups }, () => {
          // 更新单个规则的状态而不重新加载整个组
          const ruleToggleInput = document.querySelector(`input[data-host-id="${hostId}"]`);
          if (ruleToggleInput) {
            ruleToggleInput.checked = enabled;
          }
        });
        chrome.runtime.sendMessage({ action: 'updateProxySettings' });
      }
    }
  });
}