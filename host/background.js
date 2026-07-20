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

// Debug logging toggle to avoid noisy console output in production
const DEBUG_LOGS_ENABLED = false;
const debugLog = (...args) => {
  if (DEBUG_LOGS_ENABLED) {
    console.log(...args);
  }
};

// Global state
const state = {
  activeHostsMap: {},
  activeRuleMeta: {},
  activeGroups: [],
  currentConfig: null,
  lastSocketProxy: null,
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

// Guards to keep initialization idempotent across activate/onInstalled/onStartup
let initialized = false;
let storageListenerAttached = false;

// startKeepAlive function to keep Service Worker alive
function startKeepAlive() {
  if (keepAliveInterval) {
    return;
  }
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
    if (initialized) {
      return;
    }
    initialized = true;

    startKeepAlive();
    await loadInitialState();
    await refreshActiveTabIndicators();
  } catch (error) {
    initialized = false;
    console.error('Failed to initialize extension:', error);
  }
}

// Load initial state from storage
async function loadInitialState() {
  try {
    const data = await getStorageData(['hostsGroups', 'activeGroups', 'socketProxy']);

    state.activeGroups = data.activeGroups || [];

    if (!data.hostsGroups) {
      await createDefaultGroups();
      return;
    }

    // Only activate all groups on first install (when activeGroups is undefined)
    // If activeGroups is an empty array [], it means user intentionally disabled all groups
    if (data.activeGroups === undefined && data.hostsGroups.length > 0) {
      await activateAllGroups(data.hostsGroups);
    } else {
      await updateActiveHostsMap();
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

// Setup storage change listener (idempotent)
function setupStorageListener() {
  if (storageListenerAttached) {
    return;
  }
  storageListenerAttached = true;

  chrome.storage.onChanged.addListener((changes) => {
    debugLog('[Storage] Changes detected:', Object.keys(changes));
    if (changes.socketProxy) {
      debugLog('[Storage] socketProxy changed:', {
        oldBypassList: changes.socketProxy.oldValue?.bypassList,
        newBypassList: changes.socketProxy.newValue?.bypassList
      });
    }
    if (shouldUpdateHostsMap(changes)) {
      debugLog('[Storage] Triggering hosts map update');
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

    const built = buildActiveHostsMap(data);
    state.activeHostsMap = built.hostsMap;
    state.activeRuleMeta = built.ruleMeta;
    state.activeGroups = data.activeGroups || [];

    await updateProxySettings();

    processUpdateQueue(true);

    // Keep per-tab IP indicators in sync with the new mapping
    refreshActiveTabIndicators();
  } catch (error) {
    processUpdateQueue(false, error);
    throw error;
  } finally {
    state.proxyState.updating = false;
  }
}

// Build active hosts map from storage data.
// Returns both the flat domain->ip map used by the PAC script and a metadata
// map (domain -> {ip, groupName, rule}) used by the toolbar tooltip.
// Later groups overwrite earlier ones, matching PAC object semantics.
function buildActiveHostsMap(data) {
  const hostsMap = {};
  const ruleMeta = {};
  const { hostsGroups = [], activeGroups = [] } = data;

  hostsGroups.forEach(group => {
    if (activeGroups.includes(group.id)) {
      group.hosts.forEach(host => {
        if (host.enabled) {
          hostsMap[host.domain] = host.ip;
          ruleMeta[host.domain] = {
            ip: host.ip,
            groupName: group.name || '',
            rule: host.domain
          };
        }
      });
    }
  });

  return { hostsMap, ruleMeta };
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
    state.lastSocketProxy = socketProxy;
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
    const configChanged = state.lastConfigHash !== configHash || !state.currentConfig;

    // Debug: log hash comparison
    debugLog('[Proxy] Config hash comparison:', {
      oldHash: state.lastConfigHash ? state.lastConfigHash.substring(0, 100) + '...' : 'null',
      newHash: configHash.substring(0, 100) + '...',
      changed: configChanged,
      bypassList: socketProxy.bypassList
    });

    if (!configChanged) {
      return;
    }

    // Always clear and re-apply to ensure Chrome picks up changes
    // Chrome's PAC script caching can be aggressive
    await clearProxySettings();

    // Delay to ensure Chrome processes the clear
    await new Promise(resolve => setTimeout(resolve, 100));

    await applyProxyConfig(config);
    state.currentConfig = config;
    state.lastConfigHash = configHash;

    debugLog('[Proxy] Config applied successfully, bypassList:', socketProxy.bypassList);

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
  debugLog('[PAC] Generating PAC script with bypass rules:', {
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

// Build proxy host for IPv6 literals
function formatProxyHost(host) {
  if (!host) return '';
  if (host.includes(':')) {
    if (host.startsWith('[') && host.endsWith(']')) {
      return host;
    }
    return `[${host}]`;
  }
  return host;
}

// Build proxy string based on configuration
// NOTE: PAC proxy directives do not support embedded credentials
// ("PROXY user:pass@host:port" is invalid and breaks proxy resolution).
// HTTP/HTTPS proxy credentials are supplied via webRequest.onAuthRequired.
// Chromium cannot perform SOCKS authentication at all (crbug.com/256785).
function buildProxyString(socketProxy) {
  if (!socketProxy || !socketProxy.enabled || !socketProxy.host || !socketProxy.port) {
    return '';
  }

  const { protocol = 'SOCKS5', host, port } = socketProxy;
  const proxyHost = formatProxyHost(host);

  switch (protocol) {
    case 'HTTP':
    case 'HTTPS':
      return `PROXY ${proxyHost}:${port}`;
    case 'SOCKS4':
      return `SOCKS4 ${proxyHost}:${port}`;
    case 'SOCKS':
      return `SOCKS5 ${proxyHost}:${port}; SOCKS ${proxyHost}:${port}`;
    default:
      return `SOCKS5 ${proxyHost}:${port}`;
  }
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
  const ipv6Pattern = /^(?:\[[0-9a-f:]+\](?::\d{1,5})?|[0-9a-f:]+)$/i;
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

    function splitHostAndPort(value, defaultPort) {
      var hostValue = value;
      var portValue = defaultPort;
      var isIpv6 = false;

      if (value && value.charAt(0) === '[') {
        var closeBracket = value.indexOf(']');
        if (closeBracket !== -1) {
          hostValue = value.substring(1, closeBracket);
          isIpv6 = true;
          if (value.length > closeBracket + 1 && value.charAt(closeBracket + 1) === ':') {
            portValue = value.substring(closeBracket + 2);
          }
        }
        return { host: hostValue, port: portValue, ipv6: isIpv6 };
      }

      var firstColon = value.indexOf(':');
      var lastColon = value.lastIndexOf(':');
      if (firstColon !== -1 && firstColon === lastColon) {
        hostValue = value.substring(0, lastColon);
        portValue = value.substring(lastColon + 1);
      }

      if (hostValue.indexOf(':') !== -1) {
        isIpv6 = true;
      }

      return { host: hostValue, port: portValue, ipv6: isIpv6 };
    }

    var hostInfo = splitHostAndPort(host, "80");
    var domainPart = hostInfo.host;

    domainPart = domainPart.toLowerCase();

    // Default target port comes from the URL authority when present
    // (the PAC host argument never carries a port).
    var urlPort = "80";
    var schemeEnd = url.indexOf('://');
    if (schemeEnd !== -1) {
      var afterScheme = url.slice(schemeEnd + 3);
      var slashPos = afterScheme.indexOf('/');
      var authority = slashPos === -1 ? afterScheme : afterScheme.slice(0, slashPos);
      var authorityInfo = splitHostAndPort(authority, "80");
      if (authorityInfo.port) {
        urlPort = String(authorityInfo.port);
      }
    }

    // Resolve mapping: exact match first, then wildcard parents
    // so a rule like "*.example.com" covers all of its subdomains.
    var mappedValue = hostsMapping[domainPart];
    if (!mappedValue) {
      var wildcardPos = domainPart.indexOf('.');
      while (wildcardPos !== -1 && !mappedValue) {
        mappedValue = hostsMapping['*.' + domainPart.slice(wildcardPos + 1)];
        wildcardPos = domainPart.indexOf('.', wildcardPos + 1);
      }
    }

    if (isBypassed(domainPart)) {
      return 'DIRECT';
    }

    if (mappedValue) {
      var mappingInfo = splitHostAndPort(mappedValue, urlPort);
      var mappedIP = mappingInfo.host;
      var mappedPort = mappingInfo.port;

      if (mappingInfo.ipv6) {
        mappedIP = '[' + mappedIP + ']';
      }

      if (url.indexOf('https://') === 0) {
        ${socksEnabled ? `return '${proxyString}';` : `return 'DIRECT';`}
      } else {
        return 'PROXY ' + mappedIP + ':' + mappedPort;
      }
    }

    // Unmapped local names never go through the proxy
    if (isPlainHostName(domainPart) ||
        domainPart === 'localhost' ||
        domainPart === '127.0.0.1' ||
        (domainPart.length > 6 && domainPart.slice(-6) === '.local')) {
      return 'DIRECT';
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

// ---------------------------------------------------------------------------
// Proxy authentication
// Chrome ignores credentials embedded in PAC directives, so HTTP/HTTPS proxy
// auth challenges are answered here instead. SOCKS auth is not supported by
// Chromium and cannot be provided through this API.
// ---------------------------------------------------------------------------

let authListenerAttached = false;
const authAttempts = new Map();
const MAX_AUTH_ATTEMPTS = 2;

function setupProxyAuthListener() {
  if (authListenerAttached) {
    return;
  }
  if (!chrome.webRequest || !chrome.webRequest.onAuthRequired) {
    return;
  }
  authListenerAttached = true;

  chrome.webRequest.onAuthRequired.addListener(
    handleAuthRequired,
    { urls: ['<all_urls>'] },
    ['asyncBlocking']
  );

  chrome.webRequest.onCompleted.addListener(clearAuthAttempt, { urls: ['<all_urls>'] });
  chrome.webRequest.onErrorOccurred.addListener(clearAuthAttempt, { urls: ['<all_urls>'] });
}

function clearAuthAttempt(details) {
  authAttempts.delete(details.requestId);
}

function handleAuthRequired(details, asyncCallback) {
  // Only answer proxy challenges. Origin-server authentication must never
  // receive the credentials configured for the upstream proxy.
  if (!details.isProxy) {
    asyncCallback({});
    return;
  }

  const attempts = authAttempts.get(details.requestId) || 0;
  if (attempts >= MAX_AUTH_ATTEMPTS) {
    // Wrong credentials: give up so Chrome can show its own prompt
    asyncCallback({});
    return;
  }

  getSocketProxyConfig().then((socketProxy) => {
    const usable = socketProxy &&
      socketProxy.enabled &&
      (socketProxy.protocol === 'HTTP' || socketProxy.protocol === 'HTTPS') &&
      socketProxy.auth &&
      socketProxy.auth.enabled &&
      socketProxy.auth.username &&
      socketProxy.auth.password &&
      isConfiguredProxyChallenge(details.challenger, socketProxy);

    if (!usable) {
      asyncCallback({});
      return;
    }

    authAttempts.set(details.requestId, attempts + 1);
    if (authAttempts.size > 500) {
      authAttempts.clear();
    }

    asyncCallback({
      authCredentials: {
        username: socketProxy.auth.username,
        password: socketProxy.auth.password
      }
    });
  }).catch(() => {
    asyncCallback({});
  });
}

// Match the authentication challenger to the configured upstream proxy before
// disclosing credentials. Brackets around IPv6 literals are ignored because
// Chrome may report the challenger with or without them.
function isConfiguredProxyChallenge(challenger, socketProxy) {
  if (!challenger || !socketProxy) {
    return false;
  }

  const normalizeHost = (value) => {
    let host = String(value || '').trim().toLowerCase();
    if (host.startsWith('[') && host.endsWith(']')) {
      host = host.slice(1, -1);
    }
    return host;
  };

  const challengerHost = normalizeHost(challenger.host);
  const configuredHost = normalizeHost(socketProxy.host);
  const challengerPort = Number(challenger.port);
  const configuredPort = Number(socketProxy.port);

  return challengerHost !== '' &&
    challengerHost === configuredHost &&
    Number.isInteger(challengerPort) &&
    challengerPort === configuredPort;
}

// ---------------------------------------------------------------------------
// Per-tab IP indicator (issue #8)
// When the active mapping covers the tab's domain, show a small "IP" badge on
// the toolbar icon and put "domain -> ip" into the icon tooltip, so the same
// domain can be told apart between production and a mapped local environment.
// ---------------------------------------------------------------------------

let tabListenersAttached = false;
const DEFAULT_ACTION_TITLE = 'Hosts Manager';
const BADGE_COLOR = '#1A6B5D';

function setupTabIndicatorListeners() {
  if (tabListenersAttached) {
    return;
  }
  if (!chrome.tabs || !chrome.action) {
    return;
  }
  tabListenersAttached = true;

  if (chrome.action.setBadgeBackgroundColor) {
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  }

  chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        return;
      }
      updateTabIndicator(tab.id, tab.url);
    });
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'loading' || changeInfo.status === 'complete') {
      updateTabIndicator(tabId, tab && tab.url);
    }
  });
}

// Extract a lowercase hostname from a http(s) URL, null otherwise
function extractHostname(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
    return null;
  }
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (error) {
    return null;
  }
}

// Resolve a hostname against the active mapping (exact first, then wildcards)
// Returns the rule metadata {ip, groupName, rule} or null
function resolveMappedRule(hostname) {
  if (!hostname) {
    return null;
  }

  const meta = state.activeRuleMeta || {};
  if (meta[hostname]) {
    return meta[hostname];
  }

  let dotPos = hostname.indexOf('.');
  while (dotPos !== -1) {
    const candidate = '*.' + hostname.slice(dotPos + 1);
    if (meta[candidate]) {
      return meta[candidate];
    }
    dotPos = hostname.indexOf('.', dotPos + 1);
  }

  return null;
}

// Check the cached bypass list the same way the PAC script does
function isHostnameBypassed(hostname) {
  const socketProxy = state.lastSocketProxy;
  if (!socketProxy) {
    return false;
  }

  const bypass = buildBypassRules(socketProxy);
  if (bypass.exact[hostname]) {
    return true;
  }
  for (const suffix of bypass.suffixes) {
    if (hostname === suffix ||
      (hostname.length > suffix.length && hostname.slice(-suffix.length - 1) === '.' + suffix)) {
      return true;
    }
  }
  let dotPos = hostname.indexOf('.');
  while (dotPos !== -1) {
    if (bypass.exact[hostname.slice(dotPos + 1)]) {
      return true;
    }
    dotPos = hostname.indexOf('.', dotPos + 1);
  }
  return false;
}

function updateTabIndicator(tabId, url) {
  if (typeof tabId !== 'number' || tabId < 0) {
    return;
  }

  const hostname = extractHostname(url);
  const rule = hostname && !isHostnameBypassed(hostname)
    ? resolveMappedRule(hostname)
    : null;

  try {
    if (rule) {
      // ZeroOmega-style tooltip: app name, resolution line, source group.
      // groupName / rule come from user data at runtime; source stays ASCII.
      const titleLines = [DEFAULT_ACTION_TITLE, hostname + ' -> ' + rule.ip];
      if (rule.rule && rule.rule !== hostname) {
        titleLines.push('(' + rule.rule + ')');
      }
      if (rule.groupName) {
        titleLines.push(rule.groupName);
      }
      chrome.action.setBadgeText({ tabId, text: 'IP' });
      chrome.action.setTitle({ tabId, title: titleLines.join('\n') });
    } else {
      chrome.action.setBadgeText({ tabId, text: '' });
      chrome.action.setTitle({ tabId, title: DEFAULT_ACTION_TITLE });
    }
  } catch (error) {
    // Tab may be gone; nothing to do
  }
}

// Refresh indicators for the active tab of every window
function refreshActiveTabIndicators() {
  if (!chrome.tabs) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs) {
        resolve();
        return;
      }
      tabs.forEach((tab) => updateTabIndicator(tab.id, tab.url));
      resolve();
    });
  });
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

// Register all event listeners synchronously at the top level so Chrome can
// wake this service worker for tab, storage, message and auth events (MV3
// requires listener registration in the first turn of the event loop).
setupStorageListener();
setupMessageListener();
setupProxyAuthListener();
setupTabIndicatorListeners();

// Start the extension initialization process
initializeExtension();
