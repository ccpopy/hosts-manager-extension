/**
 * Popup 页面脚本
 * 展示当前页面的映射解析结果（issue #8）、分组开关与 Socket 代理状态
 */

// 导入消息桥接工具
import('../js/utils/MessageBridge.js').then(module => {
  window.MessageBridge = module.default;
}).catch(error => {
  console.error('Failed to load MessageBridge:', error);
});

// 用于存储分组展开状态
const expandedGroups = new Set();

// 当前标签页信息
let currentTab = { hostname: null, valid: false };

// 操作状态管理
const operationState = {
  updating: false,
  warning: null
};

document.addEventListener('DOMContentLoaded', async () => {
  // 打开设置页面
  document.getElementById('open-settings').addEventListener('click', () => {
    chrome.tabs.create({ url: 'page.html' });
    window.close();
  });

  // 底部版本号
  try {
    const versionEl = document.getElementById('popup-version');
    if (versionEl) {
      versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
    }
  } catch (error) {
    // 保留 HTML 中的默认版本号
  }

  // 阻止代理开关的点击冒泡（只绑定一次）
  document.getElementById('proxy-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // 加载数据
  loadCurrentTab();
  loadGroups();
  loadProxyStatus();

  // 监听存储变化
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.activeGroups || changes.hostsGroups) {
      loadGroups();
      renderCurrentTab();
    }
    if (changes.socketProxy || changes.socketProxyStore) {
      if (!operationState.updating) loadProxyStatus();
      renderCurrentTab();
    }
  });
});

/* ============================================================
   当前页面解析（issue #8）
   ============================================================ */

// 获取当前活动标签页并解析域名
async function loadCurrentTab () {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab && tab.url ? tab.url : '';

    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        currentTab = { hostname: new URL(url).hostname.toLowerCase(), valid: true };
      } catch {
        currentTab = { hostname: null, valid: false };
      }
    } else {
      currentTab = { hostname: null, valid: false };
    }
  } catch (error) {
    currentTab = { hostname: null, valid: false };
  }

  renderCurrentTab();
}

// 构建「域名 -> {ip, groupName, rule}」映射（仅启用分组中的启用规则）
// 后写覆盖先写，与 PAC 脚本的对象语义保持一致
function buildActiveRuleMap (hostsGroups, activeGroups) {
  const map = new Map();
  hostsGroups.forEach(group => {
    if (!activeGroups.includes(group.id) || !Array.isArray(group.hosts)) return;
    group.hosts.forEach(host => {
      if (host.enabled && host.domain) {
        map.set(host.domain, { ip: host.ip, groupName: group.name, rule: host.domain });
      }
    });
  });
  return map;
}

// 与 PAC 相同的解析顺序：精确匹配优先，其次通配符父域
function resolveHostname (hostname, ruleMap) {
  if (ruleMap.has(hostname)) {
    return ruleMap.get(hostname);
  }

  let dotPos = hostname.indexOf('.');
  while (dotPos !== -1) {
    const candidate = '*.' + hostname.slice(dotPos + 1);
    if (ruleMap.has(candidate)) {
      return ruleMap.get(candidate);
    }
    dotPos = hostname.indexOf('.', dotPos + 1);
  }

  return null;
}

// 直连白名单检查（与 PAC 逻辑一致）
function isBypassed (hostname, socketProxy) {
  const list = socketProxy && Array.isArray(socketProxy.bypassList) ? socketProxy.bypassList : [];
  if (list.length === 0) return false;

  const exact = new Set();
  const suffixes = [];

  list.forEach(raw => {
    if (!raw || typeof raw !== 'string') return;
    const value = raw.trim().toLowerCase();
    if (!value) return;
    if (value.startsWith('*.')) {
      if (value.length > 2) suffixes.push(value.slice(2));
    } else {
      exact.add(value);
    }
  });

  if (exact.has(hostname)) return true;

  for (const suffix of suffixes) {
    if (hostname === suffix ||
      (hostname.length > suffix.length && hostname.slice(-suffix.length - 1) === '.' + suffix)) {
      return true;
    }
  }

  // 裸域名白名单同时覆盖其所有子域
  let dotPos = hostname.indexOf('.');
  while (dotPos !== -1) {
    if (exact.has(hostname.slice(dotPos + 1))) return true;
    dotPos = hostname.indexOf('.', dotPos + 1);
  }

  return false;
}

// 渲染当前页面卡片
async function renderCurrentTab () {
  const body = document.getElementById('current-tab-body');
  if (!body) return;

  if (!currentTab.valid || !currentTab.hostname) {
    body.innerHTML = '<div class="tab-state">此页面不适用 hosts 映射</div>';
    return;
  }

  try {
    const result = await chrome.storage.local.get(['hostsGroups', 'activeGroups', 'socketProxy']);
    const ruleMap = buildActiveRuleMap(result.hostsGroups || [], result.activeGroups || []);
    const matched = resolveHostname(currentTab.hostname, ruleMap);
    const bypassed = matched && isBypassed(currentTab.hostname, result.socketProxy);

    body.innerHTML = '';

    const resolution = document.createElement('div');
    resolution.className = 'resolution' + (matched && !bypassed ? '' : ' muted');

    const domainEl = document.createElement('span');
    domainEl.className = 'res-domain';
    domainEl.textContent = currentTab.hostname;
    domainEl.title = currentTab.hostname;
    resolution.appendChild(domainEl);

    const arrowEl = document.createElement('span');
    arrowEl.className = 'res-arrow';
    arrowEl.textContent = '→';
    resolution.appendChild(arrowEl);

    if (matched) {
      const ipEl = document.createElement('span');
      ipEl.className = 'res-ip';
      ipEl.textContent = matched.ip;
      ipEl.title = matched.ip;
      resolution.appendChild(ipEl);
    } else {
      const noneEl = document.createElement('span');
      noneEl.className = 'res-none';
      noneEl.textContent = '未命中映射';
      resolution.appendChild(noneEl);
    }

    body.appendChild(resolution);

    // 命中时展示来源分组等元信息
    if (matched) {
      const meta = document.createElement('div');
      meta.className = 'res-meta';

      const groupChip = document.createElement('span');
      groupChip.className = 'chip chip-pine';
      groupChip.textContent = matched.groupName;
      groupChip.title = `来自分组：${matched.groupName}`;
      meta.appendChild(groupChip);

      if (matched.rule.startsWith('*.')) {
        const ruleChip = document.createElement('span');
        ruleChip.className = 'chip';
        ruleChip.textContent = matched.rule;
        ruleChip.title = `通配符规则：${matched.rule}`;
        meta.appendChild(ruleChip);
      }

      if (bypassed) {
        const bypassChip = document.createElement('span');
        bypassChip.className = 'chip chip-warn';
        bypassChip.textContent = '已直连白名单，映射未生效';
        meta.appendChild(bypassChip);
      }

      body.appendChild(meta);
    }
  } catch (error) {
    body.innerHTML = '<div class="tab-state">加载失败，请重试</div>';
  }
}

/* ============================================================
   分组列表
   ============================================================ */

async function loadGroups () {
  try {
    const result = await chrome.storage.local.get(['hostsGroups', 'activeGroups']);
    const hostsGroups = result.hostsGroups || [];
    const activeGroups = result.activeGroups || [];

    const groupsList = document.getElementById('groups-list');

    if (hostsGroups.length === 0) {
      groupsList.innerHTML = '<div class="empty-state">暂无分组，点击右上角设置创建</div>';
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
      groupName.title = group.name;

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
          ruleContent.title = host.ip + ' ' + host.domain;

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
  } catch (error) {
    const groupsList = document.getElementById('groups-list');
    groupsList.innerHTML = '<div class="empty-state">加载失败，请重试</div>';
  }
}

/* ============================================================
   Socket 代理
   ============================================================ */

async function loadProxyStatus () {
  try {
    const result = await chrome.storage.local.get(['socketProxy', 'socketProxyStore']);
    const socketProxy = result.socketProxy || {};
    const proxyStore = normalizePopupProxyStore(result.socketProxyStore, socketProxy);
    const activeProfile = proxyStore.profiles.find(profile => profile.id === proxyStore.activeProfileId) || null;

    const proxyStatus = document.getElementById('proxy-status');
    const proxyItem = document.getElementById('proxy-item');
    const profilesContainer = document.getElementById('proxy-profiles');

    // 通过克隆移除旧的 change 监听器，再重新绑定
    let proxySwitch = document.getElementById('proxy-switch');
    const newSwitch = proxySwitch.cloneNode(true);
    proxySwitch.parentNode.replaceChild(newSwitch, proxySwitch);
    proxySwitch = newSwitch;

    renderProxyProfiles(profilesContainer, proxyStore);

    // 如果代理未配置，显示提示
    if (!activeProfile || !activeProfile.host || !activeProfile.port) {
      proxyStatus.textContent = '未配置，点击设置';
      proxyStatus.title = '前往设置页配置 Socket 代理';
      proxySwitch.checked = false;
      proxySwitch.disabled = true;

      proxyItem.classList.add('clickable');
      proxyItem.onclick = () => {
        chrome.tabs.create({ url: 'page.html' });
        window.close();
      };
    } else {
      // 优先显示配置名称，完整端点保留在悬浮提示中
      const authInfo = activeProfile.auth && activeProfile.auth.enabled ? ' · 已认证' : '';
      proxyStatus.textContent = activeProfile.name || `${activeProfile.host}:${activeProfile.port}`;
      proxyStatus.title = `${activeProfile.protocol || 'SOCKS5'} ${activeProfile.host}:${activeProfile.port}${authInfo}`;
      proxySwitch.checked = !!proxyStore.enabled;
      proxySwitch.disabled = operationState.updating;

      proxyItem.classList.remove('clickable');
      proxyItem.onclick = null;

      // 代理开关事件
      proxySwitch.addEventListener('change', async () => {
        await updateSocketProxyStatus(proxyStore, socketProxy, proxySwitch.checked);
      });
    }

    if (operationState.warning && !operationState.updating) {
      proxyStatus.textContent = operationState.warning;
      proxyStatus.title = operationState.warning;
    }
  } catch (error) {
    const proxyStatus = document.getElementById('proxy-status');
    proxyStatus.textContent = '加载失败';
  }
}

// 将新版配置仓库和旧版单配置统一为弹窗可渲染的结构
function normalizePopupProxyStore (store, socketProxy) {
  if (store && Array.isArray(store.profiles)) {
    const profiles = store.profiles.filter(profile => profile && profile.id).map(profile => ({
      ...profile,
      name: String(profile.name || '未命名代理'),
      auth: profile.auth || { enabled: false, username: '', password: '' },
      bypassList: Array.isArray(profile.bypassList) ? profile.bypassList : []
    }));

    return {
      schemaVersion: 2,
      enabled: !!store.enabled,
      activeProfileId: store.activeProfileId || null,
      profiles
    };
  }

  if (socketProxy && socketProxy.host && socketProxy.port) {
    return {
      schemaVersion: 1,
      enabled: !!socketProxy.enabled,
      activeProfileId: 'legacy',
      profiles: [{ ...socketProxy, id: 'legacy', name: '当前配置' }]
    };
  }

  return { schemaVersion: 2, enabled: false, activeProfileId: null, profiles: [] };
}

function renderProxyProfiles (container, proxyStore) {
  if (!container) return;

  container.innerHTML = '';
  container.classList.toggle('visible', proxyStore.profiles.length > 1);

  proxyStore.profiles.forEach(profile => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'proxy-profile-option';
    option.dataset.profileId = profile.id;
    option.setAttribute('role', 'radio');

    const isActive = profile.id === proxyStore.activeProfileId;
    option.classList.toggle('active', isActive);
    option.setAttribute('aria-checked', String(isActive));
    option.title = `切换到 ${profile.name}`;

    const marker = document.createElement('span');
    marker.className = 'proxy-profile-marker';
    marker.setAttribute('aria-hidden', 'true');

    const copy = document.createElement('span');
    copy.className = 'proxy-profile-copy';

    const name = document.createElement('span');
    name.className = 'proxy-profile-name';
    name.textContent = profile.name;

    const endpoint = document.createElement('span');
    endpoint.className = 'proxy-profile-endpoint';
    endpoint.textContent = `${profile.host || '—'}:${profile.port || '—'}`;

    copy.appendChild(name);
    copy.appendChild(endpoint);
    option.appendChild(marker);
    option.appendChild(copy);

    option.addEventListener('click', async () => {
      if (!isActive) await selectProxyProfile(profile.id);
    });

    container.appendChild(option);
  });
}

// 更新Socket代理状态
async function updateSocketProxyStatus (proxyStore, socketProxy, enabled) {
  if (operationState.updating) return;

  const proxySwitch = document.getElementById('proxy-switch');
  const proxyStatus = document.getElementById('proxy-status');

  try {
    operationState.updating = true;

    proxySwitch.disabled = true;
    proxyStatus.textContent = '更新中...';

    if (proxyStore.schemaVersion === 2) {
      const response = await sendProxyAction({ action: 'setProxyEnabled', enabled });
      operationState.warning = null;
      if (response.applied === false) {
        operationState.warning = response.warning || '配置已保存，但代理规则暂未应用';
        return;
      }
    } else {
      await chrome.storage.local.set({
        socketProxy: { ...socketProxy, enabled }
      });
      if (window.MessageBridge) await window.MessageBridge.updateProxySettings();
      operationState.warning = null;
    }

  } catch (error) {
    console.error('代理状态更新失败:', error);
  } finally {
    operationState.updating = false;
    await loadProxyStatus();
  }
}

async function selectProxyProfile (profileId) {
  if (operationState.updating) return;

  const proxyStatus = document.getElementById('proxy-status');

  try {
    operationState.updating = true;
    setProxyControlsDisabled(true);
    if (proxyStatus) proxyStatus.textContent = '切换中...';

    const response = await sendProxyAction({ action: 'setActiveProxyProfile', profileId });
    operationState.warning = null;
    if (response.applied === false) {
      operationState.warning = response.warning || '配置已保存，但代理规则暂未应用';
    }
    renderCurrentTab();
  } catch (error) {
    console.error('切换代理配置失败:', error);
  } finally {
    operationState.updating = false;
    await loadProxyStatus();
  }
}

function setProxyControlsDisabled (disabled) {
  const proxySwitch = document.getElementById('proxy-switch');
  if (proxySwitch) proxySwitch.disabled = disabled;
  document.querySelectorAll('.proxy-profile-option').forEach(option => {
    option.disabled = disabled;
  });
}

function sendProxyAction (message) {
  const requestId = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const payload = { ...message, requestId };

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || response.success !== true) {
        reject(new Error(response && response.error ? response.error : '代理操作失败'));
        return;
      }
      resolve(response);
    });
  });
}

/* ============================================================
   开关操作
   ============================================================ */

// 切换分组状态
async function toggleGroup (groupId, enabled) {
  try {
    // 防止重复操作
    if (operationState.updating) {
      return;
    }

    operationState.updating = true;

    // 显示更新中状态
    const groupSection = document.querySelector(`[data-group-id="${groupId}"]`);
    if (groupSection) {
      const toggle = groupSection.querySelector('input[type="checkbox"]');
      if (toggle) {
        toggle.disabled = true;
      }
    }

    const result = await chrome.storage.local.get(['activeGroups']);
    let activeGroups = result.activeGroups || [];

    if (enabled) {
      if (!activeGroups.includes(groupId)) {
        activeGroups.push(groupId);
      }
    } else {
      activeGroups = activeGroups.filter(id => id !== groupId);
    }

    await chrome.storage.local.set({ activeGroups });

    // 通知后台脚本更新代理设置
    if (window.MessageBridge) {
      await window.MessageBridge.updateProxySettings();
    }

    // 恢复开关状态
    if (groupSection) {
      const toggle = groupSection.querySelector('input[type="checkbox"]');
      if (toggle) {
        toggle.disabled = false;
      }
    }
  } catch (error) {
    console.error('切换分组状态失败:', error);

    // 恢复开关状态
    const groupSection = document.querySelector(`[data-group-id="${groupId}"]`);
    if (groupSection) {
      const toggle = groupSection.querySelector('input[type="checkbox"]');
      if (toggle) {
        toggle.checked = !enabled;
        toggle.disabled = false;
      }
    }
  } finally {
    operationState.updating = false;
  }
}

// 切换单个Host状态
async function toggleHost (groupId, hostId, enabled) {
  try {
    // 防止重复操作
    if (operationState.updating) {
      return;
    }

    operationState.updating = true;

    // 显示更新中状态
    const ruleToggleInput = document.querySelector(`input[data-host-id="${hostId}"]`);
    if (ruleToggleInput) {
      ruleToggleInput.disabled = true;
    }

    const result = await chrome.storage.local.get(['hostsGroups']);
    const hostsGroups = result.hostsGroups || [];
    const groupIndex = hostsGroups.findIndex(g => g.id === groupId);

    if (groupIndex !== -1) {
      const hostIndex = hostsGroups[groupIndex].hosts.findIndex(h => h.id === hostId);

      if (hostIndex !== -1) {
        hostsGroups[groupIndex].hosts[hostIndex].enabled = enabled;

        await chrome.storage.local.set({ hostsGroups });

        // 通知后台脚本更新代理设置
        if (window.MessageBridge) {
          await window.MessageBridge.updateProxySettings();
        }
      }
    }

    // 恢复开关状态
    if (ruleToggleInput) {
      ruleToggleInput.disabled = false;
    }
  } catch (error) {
    console.error('切换主机状态失败:', error);

    // 恢复开关状态
    const ruleToggleInput = document.querySelector(`input[data-host-id="${hostId}"]`);
    if (ruleToggleInput) {
      ruleToggleInput.checked = !enabled;
      ruleToggleInput.disabled = false;
    }
  } finally {
    operationState.updating = false;
  }
}
