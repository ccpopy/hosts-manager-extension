/**
 * Hosts Manager background scripts
 * Handles hosts mapping using PAC script and proxy configuration
 */

// Constants
const CONSTANTS = {
  PROXY_UPDATE_THROTTLE: 300,
  MAX_ERROR_COUNT: 3,
  ERROR_RESET_TIME: 60000,
  UPDATE_TIMEOUT: 15000,
  PROXY_CLEAR_DELAY: 100,
  DEFAULT_PROXY_CONFIG: {
    host: '',
    port: '',
    enabled: false,
    protocol: 'SOCKS5',
    auth: {
      enabled: false,
      username: '',
      password: ''
    },
    bypassList: []
  }
};

// Global state
const state = {
  activeHostsMap: {},
  activeGroups: [],
  currentConfig: null,
  proxyState: {
    updating: false,
    lastUpdateTime: 0,
    updateQueue: [],
    errorCount: 0,
    clearTimeout: null
  },
  updateThrottleTimer: null,
  lastConfigHash: null
};

// Service Worker Revitalization Mechanism
let keepAliveInterval = null;

// startKeepAlive function to keep Service Worker alive
function startKeepAlive() {
  keepAliveInterval = setInterval(() => {
    chrome.storage.local.get(null, () => {
      // Simple storage access to keep Service Worker alive
    });
  }, 20000);
}

// Stop keep-alive
function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// Service Worker Revitalization Mechanism
self.addEventListener('activate', event => {
  event.waitUntil(initializeExtension());
});

// Listen for extension installation/updates
chrome.runtime.onInstalled.addListener(details => {
  initializeExtension();
});

// Listen for startup events
chrome.runtime.onStartup.addListener(() => {
  initializeExtension();
});

// Initialize extension
async function initializeExtension() {
  try {
    startKeepAlive();
    await loadInitialState();
    setupStorageListener();
    setupMessageListener();
  } catch (error) {
    console.error('Failed to initialize extension:', error);
  }
}

// Load initial state from storage
async function loadInitialState() {
  try {
    const data = await getStorageData(['hostsGroups', 'activeGroups', 'socketProxy']);

    state.activeGroups = data.activeGroups || [];
    const hasSocketProxy = isSocketProxyConfigured(data.socketProxy);

    if (!data.hostsGroups) {
      await createDefaultGroups();
      return;
    }

    if (hasSocketProxy || (state.activeGroups.length > 0)) {
      await updateActiveHostsMap();
    } else if (data.hostsGroups.length > 0) {
      await activateAllGroups(data.hostsGroups);
    }
  } catch (error) {
    console.error('Failed to load initial state:', error);
    throw error;
  }
}

// Create default groups if none exist
async function createDefaultGroups() {
  const defaultGroups = [{
    id: 'default',
    name: 'Default Group',
    hosts: [],
    enabled: true
  }];

  try {
    await setStorageData({ hostsGroups: defaultGroups });
  } catch (error) {
    console.error('Failed to create default groups:', error);
  }
}

// Activate all groups
async function activateAllGroups(hostsGroups) {
  const allGroupIds = hostsGroups.map(group => group.id);

  try {
    await setStorageData({ activeGroups: allGroupIds });
    state.activeGroups = allGroupIds;
    await updateActiveHostsMap();
  } catch (error) {
    console.error('Failed to activate all groups:', error);
  }
}

// Setup storage change listener
function setupStorageListener() {
  chrome.storage.onChanged.addListener((changes) => {
    console.log('[Storage] Changes detected:', Object.keys(changes));
    if (changes.socketProxy) {
      console.log('[Storage] socketProxy changed:', {
        oldBypassList: changes.socketProxy.oldValue?.bypassList,
        newBypassList: changes.socketProxy.newValue?.bypassList
      });
    }
    if (shouldUpdateHostsMap(changes)) {
      console.log('[Storage] Triggering hosts map update');
      throttledUpdateHostsMap();
    }
  });
}

// Setup message listener with error handling
function setupMessageListener() {
  chrome.runtime.onMessage.removeListener(handleMessage);

  chrome.runtime.onMessage.addListener(handleMessage);
}

// Unified message handling function
function handleMessage(message, sender, sendResponse) {
  // Immediately return true to indicate asynchronous response
  if (message.action === 'updateProxySettings') {
    handleUpdateProxyMessage(message, sender, sendResponse);
    return true;
  }

  // For unknown messages, respond immediately
  sendResponse({ success: false, error: 'Unknown action' });
  return false;
}

// Handle update proxy message
async function handleUpdateProxyMessage(message, sender, sendResponse) {
  try {
    await updateActiveHostsMap();
    sendResponse({ success: true });
  } catch (error) {
    console.error('Failed to update proxy settings:', error);
    sendResponse({
      success: false,
      error: error.message || 'Unknown error occurred'
    });
  }
}

// Check if storage changes require hosts map update
function shouldUpdateHostsMap(changes) {
  return changes.hostsGroups || changes.activeGroups || changes.socketProxy;
}

// Throttled update hosts map
function throttledUpdateHostsMap() {
  if (state.updateThrottleTimer) {
    clearTimeout(state.updateThrottleTimer);
  }

  state.updateThrottleTimer = setTimeout(() => {
    updateActiveHostsMap().catch(error => {
      console.error('Failed to update hosts mapping:', error);
    });
  }, CONSTANTS.PROXY_UPDATE_THROTTLE);
}

// Update active hosts map
async function updateActiveHostsMap() {
  if (state.proxyState.updating) {
    return enqueueUpdate();
  }

  state.proxyState.updating = true;
  state.proxyState.lastUpdateTime = Date.now();

  try {
    const data = await getStorageData(['hostsGroups', 'activeGroups']);

    state.activeHostsMap = buildActiveHostsMap(data);
    state.activeGroups = data.activeGroups || [];

    await updateProxySettings();

    processUpdateQueue(true);
  } catch (error) {
    processUpdateQueue(false, error);
    throw error;
  } finally {
    state.proxyState.updating = false;
  }
}

// Build active hosts map from storage data
function buildActiveHostsMap(data) {
  const hostsMap = {};
  const { hostsGroups = [], activeGroups = [] } = data;

  hostsGroups.forEach(group => {
    if (activeGroups.includes(group.id)) {
      group.hosts.forEach(host => {
        if (host.enabled) {
          hostsMap[host.domain] = host.ip;
        }
      });
    }
  });

  return hostsMap;
}

// Enqueue update request
function enqueueUpdate() {
  return new Promise((resolve, reject) => {
    state.proxyState.updateQueue.push({ resolve, reject });
  });
}

// Process update queue
function processUpdateQueue(success, error) {
  while (state.proxyState.updateQueue.length > 0) {
    const { resolve, reject } = state.proxyState.updateQueue.shift();
    success ? resolve() : reject(error);
  }
}

// Update Chrome proxy settings
async function updateProxySettings() {
  if (!shouldContinueUpdate()) {
    return;
  }

  state.proxyState.lastUpdateTime = Date.now();

  try {
    const socketProxy = await getSocketProxyConfig();
    const hasActiveHosts = Object.keys(state.activeHostsMap).length > 0;
    const hasSocketProxy = isSocketProxyConfigured(socketProxy);

    // Clear any pending clear timeout
    if (state.proxyState.clearTimeout) {
      clearTimeout(state.proxyState.clearTimeout);
      state.proxyState.clearTimeout = null;
    }

    // If neither hosts nor socket proxy is active, clear proxy immediately
    if (!hasActiveHosts && !hasSocketProxy) {
      await forceClearProxySettings();
      return;
    }

    const config = generateProxyConfig(state.activeHostsMap, socketProxy);

    // Generate config hash to detect real changes
    const configHash = generateConfigHash(state.activeHostsMap, socketProxy);

    // Debug: log hash comparison
    console.log('[Proxy] Config hash comparison:', {
      oldHash: state.lastConfigHash ? state.lastConfigHash.substring(0, 100) + '...' : 'null',
      newHash: configHash.substring(0, 100) + '...',
      changed: state.lastConfigHash !== configHash,
      bypassList: socketProxy.bypassList
    });

    // Always clear and re-apply to ensure Chrome picks up changes
    // Chrome's PAC script caching can be aggressive
    await clearProxySettings();

    // Delay to ensure Chrome processes the clear
    await new Promise(resolve => setTimeout(resolve, 100));

    await applyProxyConfig(config);
    state.currentConfig = config;
    state.lastConfigHash = configHash;

    console.log('[Proxy] Config applied successfully, bypassList:', socketProxy.bypassList);

  } catch (error) {
    handleProxyError(error);
    throw error;
  }
}

// Force clear proxy settings with retry
async function forceClearProxySettings() {
  try {
    // First attempt: clear proxy settings
    await clearProxySettings();

    // Second attempt: ensure it's really cleared
    state.proxyState.clearTimeout = setTimeout(async () => {
      try {
        await clearProxySettings();
      } catch (error) {
        console.error('Failed to clear proxy settings on retry:', error);
      }
    }, CONSTANTS.PROXY_CLEAR_DELAY);

  } catch (error) {
    console.error('Failed to clear proxy settings:', error);
    throw error;
  }
}

// Generate configuration hash for change detection
function generateConfigHash(hostsMap, socketProxy) {
  if (!hostsMap && !socketProxy) return 'empty';

  const normalizedHosts = Object.keys(hostsMap || {})
    .sort()
    .map(domain => `${domain}:${hostsMap[domain]}`)
    .join('|');

  // Normalize bypass rules the same way as buildBypassRules does
  const bypassList = socketProxy && Array.isArray(socketProxy.bypassList)
    ? socketProxy.bypassList
    : [];
  const normalizedBypass = bypassList
    .map(rule => normalizeBypassRule(rule))
    .filter(Boolean)
    .sort();

  const normalizedProxy = {
    enabled: !!(socketProxy && socketProxy.enabled),
    host: socketProxy?.host || '',
    port: socketProxy?.port || '',
    protocol: socketProxy?.protocol || 'SOCKS5',
    auth: {
      enabled: !!(socketProxy && socketProxy.auth && socketProxy.auth.enabled),
      username: socketProxy?.auth?.username || '',
      password: socketProxy?.auth?.password || ''
    },
    bypass: normalizedBypass
  };

  return JSON.stringify({
    hosts: normalizedHosts,
    proxy: normalizedProxy
  });
}

// Ensure PAC script data is ASCII-only to satisfy Chrome requirements
function safeJsonStringify(obj) {
  const json = JSON.stringify(obj || {});
  return json.replace(/[\u007F-\uFFFF]/g, (ch) => {
    const code = ch.charCodeAt(0).toString(16);
    return '\\u' + ('0000' + code).slice(-4);
  });
}

// Check if update should continue based on error count
function shouldContinueUpdate() {
  const now = Date.now();

  if (state.proxyState.errorCount >= CONSTANTS.MAX_ERROR_COUNT) {
    if (now - state.proxyState.lastUpdateTime < CONSTANTS.ERROR_RESET_TIME) {
      console.warn('Proxy update error count is too high, pausing updates');
      return false;
    }
    state.proxyState.errorCount = 0;
  }

  return true;
}

// Get socket proxy configuration
async function getSocketProxyConfig() {
  const result = await getStorageData(['socketProxy']);
  return result.socketProxy || CONSTANTS.DEFAULT_PROXY_CONFIG;
}

// Generate proxy configuration
function generateProxyConfig(hostsMapping, socketProxy) {
  return {
    mode: "pac_script",
    pacScript: {
      data: generatePacScript(hostsMapping, socketProxy),
      mandatory: false
    }
  };
}

// Clear proxy settings
async function clearProxySettings() {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.clear({ scope: 'regular' }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        state.currentConfig = null;
        state.lastConfigHash = null;
        resolve();
      }
    });
  });
}

// Apply proxy configuration
async function applyProxyConfig(config) {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

// Generate PAC script with cache busting
function generatePacScript(hostsMapping, socketProxy) {
  const hostsJson = safeJsonStringify(hostsMapping || {});
  const bypass = buildBypassRules(socketProxy);
  const bypassExactJson = safeJsonStringify(bypass.exact || {});
  const bypassSuffixJson = safeJsonStringify(bypass.suffixes || []);

  // Debug: log bypass rules being applied
  console.log('[PAC] Generating PAC script with bypass rules:', {
    exact: bypass.exact,
    suffixes: bypass.suffixes,
    rawBypassList: socketProxy?.bypassList
  });

  const pacComponents = {
    hostsJson,
    socksEnabled: socketProxy && socketProxy.enabled,
    proxyString: buildProxyString(socketProxy),
    bypassExactJson,
    bypassSuffixJson,
    timestamp: Date.now()
  };

  return buildPacScriptContent(pacComponents);
}

// Build proxy string based on configuration
function buildProxyString(socketProxy) {
  if (!socketProxy || !socketProxy.enabled || !socketProxy.host || !socketProxy.port) {
    return '';
  }

  const { protocol = 'SOCKS5', host, port, auth } = socketProxy;
  const authString = buildAuthString(auth);

  switch (protocol) {
    case 'HTTP':
    case 'HTTPS':
      return authString
        ? `PROXY ${authString}@${host}:${port}`
        : `PROXY ${host}:${port}`;
    case 'SOCKS4':
      return `SOCKS4 ${host}:${port}`;
    case 'SOCKS':
      return authString
        ? `SOCKS5 ${authString}@${host}:${port}; SOCKS ${host}:${port}`
        : `SOCKS5 ${host}:${port}; SOCKS ${host}:${port}`;
    default:
      return authString
        ? `SOCKS5 ${authString}@${host}:${port}`
        : `SOCKS5 ${host}:${port}`;
  }
}

// Build authentication string
function buildAuthString(auth) {
  if (!auth || !auth.enabled || !auth.username || !auth.password) {
    return '';
  }
  return `${auth.username}:${auth.password}`;
}

// Normalize bypass rule for PAC usage
function normalizeBypassRule(rule) {
  if (!rule || typeof rule !== 'string') return null;

  let value = rule.trim().toLowerCase();
  if (!value) return null;

  const isWildcard = value.startsWith('*.');
  if (isWildcard) {
    value = value.slice(2);
    if (!value) return null;
  }

  if (value === 'localhost') {
    return isWildcard ? null : 'localhost';
  }

  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?$/;
  const ipv6Pattern = /^\[?[0-9a-f:]+\]?$/i;
  const domainPattern = /^([a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
  const singleLabelPattern = /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?$/;

  if (!(ipv4Pattern.test(value) || ipv6Pattern.test(value) || domainPattern.test(value) || singleLabelPattern.test(value))) {
    return null;
  }

  return isWildcard ? `*.${value}` : value;
}

// Build bypass rules for PAC script
function buildBypassRules(socketProxy) {
  const bypassList = socketProxy && Array.isArray(socketProxy.bypassList)
    ? socketProxy.bypassList
    : [];

  const exact = {};
  const suffixes = [];
  const seenExact = new Set();
  const seenSuffix = new Set();

  bypassList.forEach(rawRule => {
    const rule = normalizeBypassRule(rawRule);
    if (!rule) return;

    if (rule.startsWith('*.')) {
      const suffix = rule.slice(2);
      if (seenSuffix.has(suffix)) return;
      seenSuffix.add(suffix);
      suffixes.push(suffix);
    } else {
      if (seenExact.has(rule)) return;
      seenExact.add(rule);
      exact[rule] = true;
    }
  });

  return { exact, suffixes };
}

// Build PAC script content with dynamic generation (ASCII only)
function buildPacScriptContent({ hostsJson, socksEnabled, proxyString, bypassExactJson, bypassSuffixJson, timestamp }) {
  // All comments must be ASCII only to satisfy Chrome PAC script requirements
  return `
  function FindProxyForURL(url, host) {
    var _ts = ${timestamp};
    var hostsMapping = ${hostsJson};
    var bypassExact = ${bypassExactJson};
    var bypassSuffixes = ${bypassSuffixJson};

    function isBypassed(target) {
      if (bypassExact[target]) {
        return true;
      }
      for (var i = 0; i < bypassSuffixes.length; i++) {
        var suffix = bypassSuffixes[i];
        if (target === suffix || (target.length > suffix.length && target.slice(-suffix.length - 1) === '.' + suffix)) {
          return true;
        }
      }

      // Allow bare domains (e.g. example.com) to bypass all of their subdomains
      var dotPos = target.indexOf('.');
      while (dotPos !== -1) {
        var parent = target.slice(dotPos + 1);
        if (bypassExact[parent]) {
          return true;
        }
        dotPos = target.indexOf('.', dotPos + 1);
      }

      return false;
    }

    var domainPart = host;
    var port = "80";

    var colonPos = host.indexOf(":");
    if (colonPos !== -1) {
      domainPart = host.substring(0, colonPos);
      port = host.substring(colonPos + 1);
    }

    domainPart = domainPart.toLowerCase();

    if (isPlainHostName(domainPart) ||
        domainPart === 'localhost' ||
        domainPart === '127.0.0.1' ||
        domainPart.indexOf('.local') !== -1) {
      return 'DIRECT';
    }

    if (isBypassed(domainPart)) {
      return 'DIRECT';
    }

    if (hostsMapping[domainPart]) {
      var mappedIP = hostsMapping[domainPart];
      var mappedPort = port;

      if (mappedIP.indexOf(':') !== -1) {
        var parts = mappedIP.split(':');
        mappedIP = parts[0];
        mappedPort = parts[1];
      }

      if (url.indexOf('https://') === 0) {
        ${socksEnabled ? `return '${proxyString}';` : `return 'DIRECT';`}
      } else {
        return 'PROXY ' + mappedIP + ':' + mappedPort;
      }
    }

    ${socksEnabled ? `return '${proxyString}';` : `return 'DIRECT';`}
  }`;
}

// Handle proxy update errors
function handleProxyError(error) {
  state.proxyState.errorCount++;

  if (state.proxyState.errorCount >= CONSTANTS.MAX_ERROR_COUNT) {
    const resetTime = CONSTANTS.ERROR_RESET_TIME / 1000;
    console.warn(`Proxy settings update failed ${state.proxyState.errorCount} times, will retry after ${resetTime} seconds`);
  }
}

// Utility functions
function isSocketProxyConfigured(socketProxy) {
  return socketProxy &&
    socketProxy.enabled &&
    socketProxy.host &&
    socketProxy.port;
}

// Storage helpers with promise wrappers
function getStorageData(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

function setStorageData(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

// Start the extension initialization process
initializeExtension();
