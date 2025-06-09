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
    }
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

// Initialize extension
function initializeExtension () {
  loadInitialState()
    .then(setupStorageListener)
    .then(setupMessageListener)
    .catch(handleInitializationError);
}

// Load initial state from storage
async function loadInitialState () {
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
async function createDefaultGroups () {
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
async function activateAllGroups (hostsGroups) {
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
function setupStorageListener () {
  chrome.storage.onChanged.addListener((changes) => {
    if (shouldUpdateHostsMap(changes)) {
      throttledUpdateHostsMap();
    }
  });
}

// Setup message listener
function setupMessageListener () {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateProxySettings') {
      handleUpdateProxyMessage(sendResponse);
      return true;
    }
  });
}

// Handle update proxy message
async function handleUpdateProxyMessage (sendResponse) {
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
function shouldUpdateHostsMap (changes) {
  return changes.hostsGroups || changes.activeGroups || changes.socketProxy;
}

// Throttled update hosts map
function throttledUpdateHostsMap () {
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
async function updateActiveHostsMap () {
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
function buildActiveHostsMap (data) {
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
function enqueueUpdate () {
  return new Promise((resolve, reject) => {
    state.proxyState.updateQueue.push({ resolve, reject });
  });
}

// Process update queue
function processUpdateQueue (success, error) {
  while (state.proxyState.updateQueue.length > 0) {
    const { resolve, reject } = state.proxyState.updateQueue.shift();
    success ? resolve() : reject(error);
  }
}

// Update Chrome proxy settings
async function updateProxySettings () {
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
    const configHash = generateConfigHash(config);

    if (state.lastConfigHash === configHash) {
      return;
    }

    await applyProxyConfig(config);
    state.currentConfig = config;
    state.lastConfigHash = configHash;

  } catch (error) {
    handleProxyError(error);
    throw error;
  }
}

// Force clear proxy settings with retry
async function forceClearProxySettings () {
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
function generateConfigHash (config) {
  if (!config) return 'empty';

  // Create a simplified version for hashing
  const simplified = {
    mode: config.mode,
    hosts: Object.keys(state.activeHostsMap).sort().join(','),
    pacData: config.pacScript ? config.pacScript.data.length : 0
  };

  return JSON.stringify(simplified);
}

// Check if update should continue based on error count
function shouldContinueUpdate () {
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
async function getSocketProxyConfig () {
  const result = await getStorageData(['socketProxy']);
  return result.socketProxy || CONSTANTS.DEFAULT_PROXY_CONFIG;
}

// Generate proxy configuration
function generateProxyConfig (hostsMapping, socketProxy) {
  return {
    mode: "pac_script",
    pacScript: {
      data: generatePacScript(hostsMapping, socketProxy),
      mandatory: false
    }
  };
}

// Clear proxy settings
async function clearProxySettings () {
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
async function applyProxyConfig (config) {
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
function generatePacScript (hostsMapping, socketProxy) {
  const pacComponents = {
    hostsMap: JSON.stringify(hostsMapping || {}),
    socksEnabled: socketProxy && socketProxy.enabled,
    proxyString: buildProxyString(socketProxy),
    timestamp: Date.now()
  };

  return buildPacScriptContent(pacComponents);
}

// Build proxy string based on configuration
function buildProxyString (socketProxy) {
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
function buildAuthString (auth) {
  if (!auth || !auth.enabled || !auth.username || !auth.password) {
    return '';
  }
  return `${auth.username}:${auth.password}`;
}

// Build PAC script content with dynamic generation
function buildPacScriptContent ({ hostsMap, socksEnabled, proxyString, timestamp }) {
  // Add timestamp comment to ensure script is unique
  return `
  // Generated at: ${timestamp}
  function FindProxyForURL(url, host) {
    var hostsMapping = ${hostsMap};
    
    var domainPart = host;
    var port = "80";
    
    var colonPos = host.indexOf(":");
    if (colonPos !== -1) {
      domainPart = host.substring(0, colonPos);
      port = host.substring(colonPos + 1);
    }
    
    domainPart = domainPart.toLowerCase();
    
    // Direct connection for local addresses
    if (isPlainHostName(domainPart) || 
        domainPart === 'localhost' || 
        domainPart === '127.0.0.1' ||
        domainPart.indexOf('.local') !== -1) {
      return 'DIRECT';
    }
    
    // Check hosts mapping
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
    
    // Default proxy behavior
    ${socksEnabled ? `return '${proxyString}';` : `return 'DIRECT';`}
  }`;
}

// Handle proxy update errors
function handleProxyError (error) {
  state.proxyState.errorCount++;

  if (state.proxyState.errorCount >= CONSTANTS.MAX_ERROR_COUNT) {
    const resetTime = CONSTANTS.ERROR_RESET_TIME / 1000;
    console.warn(`Proxy settings update failed ${state.proxyState.errorCount} times, will retry after ${resetTime} seconds`);
  }
}

// Handle initialization error
function handleInitializationError (error) {
  console.error('Extension initialization failed:', error);
}

// Utility functions
function isSocketProxyConfigured (socketProxy) {
  return socketProxy &&
    socketProxy.enabled &&
    socketProxy.host &&
    socketProxy.port;
}

// Storage helpers with promise wrappers
function getStorageData (keys) {
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

function setStorageData (data) {
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

// Initialize on extension installation/update
chrome.runtime.onInstalled.addListener(initializeExtension);

// Initialize on browser startup
initializeExtension();