/**
 * Hosts Manager background scripts
 * Handles hosts mapping using PAC script and proxy configuration
 */

// Global variables store active host mapping and grouping
let activeHostsMap = {};
let activeGroups = [];
let currentConfig = null;

// Proxy settings state
const proxyState = {
  updating: false,
  lastUpdateTime: 0,
  updateQueue: [],
  errorCount: 0,
  MAX_ERROR_COUNT: 3,
  ERROR_RESET_TIME: 60000,
};

/**
 * Initialize extension
 */
function initializeExtension () {
  // Get stored groups and active groups
  chrome.storage.local.get(['hostsGroups', 'activeGroups'], (result) => {
    try {
      // If there are no groups, create default groups
      if (!result.hostsGroups) {
        const defaultGroups = [
          {
            id: 'default',
            name: 'Default Group',
            hosts: [],
            enabled: true
          }
        ];

        chrome.storage.local.set({ hostsGroups: defaultGroups }).catch(error => {
          console.error('Failed to initialize default grouping:', error);
        });
      }

      // If there are active groups, update mapping
      if (result.activeGroups && Array.isArray(result.activeGroups)) {
        activeGroups = result.activeGroups;

        // Delayed update mapping to ensure initialization is complete
        setTimeout(() => {
          updateActiveHostsMap().catch(error => {
            console.error('Failed to update initial hosts mapping:', error);
          });
        }, 200);
      } else {
        // Otherwise, activate all groups
        chrome.storage.local.get(['hostsGroups'], (data) => {
          if (data.hostsGroups && Array.isArray(data.hostsGroups)) {
            const allGroupIds = data.hostsGroups.map(group => group.id);

            chrome.storage.local.set({ activeGroups: allGroupIds })
              .then(() => {
                activeGroups = allGroupIds;

                setTimeout(() => {
                  updateActiveHostsMap().catch(error => {
                    console.error('Failed to update all groups hosts mapping:', error);
                  });
                }, 200);
              })
              .catch(error => {
                console.error('Failed to activate all groups:', error);
              });
          } else {
            console.log('No groups found to activate');
          }
        });
      }
    } catch (error) {
      console.error('Error during groups initialization:', error);
    }
  });

  // Adding a storage change listener
  chrome.storage.onChanged.addListener((changes) => {
    try {
      if (changes.hostsGroups || changes.activeGroups) {
        // Anti-shake updates to avoid frequent rule updates
        if (updateActiveHostsMap.timeoutId) {
          clearTimeout(updateActiveHostsMap.timeoutId);
        }

        updateActiveHostsMap.timeoutId = setTimeout(() => {
          updateActiveHostsMap().catch(error => {
            console.error('Failed to update hosts mapping due to storage change:', error);
          });
        }, 300);
      }
    } catch (error) {
      console.error('Error in storage change listener:', error);
    }
  });

  // Adding a message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (message.action === 'updateProxySettings') {
        updateActiveHostsMap()
          .then(() => {
            if (sendResponse) {
              sendResponse({ success: true });
            }
          })
          .catch(error => {
            console.error('Failed to process updateProxySettings message:', error);
            if (sendResponse) {
              sendResponse({
                success: false,
                error: error.message || 'Unknown error occurred'
              });
            }
          });

        return true;
      }
    } catch (error) {
      console.error('Error in message listener:', error);
      if (sendResponse) {
        sendResponse({
          success: false,
          error: 'Message processing failed: ' + error.message
        });
      }
    }
  });
}

/**
 * Update host mapping based on active grouping
 * @returns {Promise<void>}
 */
function updateActiveHostsMap () {
  // Prevent concurrent updates
  if (proxyState.updating) {
    return new Promise((resolve, reject) => {
      proxyState.updateQueue.push({ resolve, reject });
    });
  }

  proxyState.updating = true;
  proxyState.lastUpdateTime = Date.now();

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['hostsGroups', 'activeGroups'])
      .then(result => {
        const previousMapping = { ...activeHostsMap };
        activeHostsMap = {};
        activeGroups = result.activeGroups || [];

        const { hostsGroups } = result;
        if (!hostsGroups || !activeGroups) {
          // No configuration or active grouping, clear proxy settings
          return updateProxySettings()
            .then(() => {
              proxyState.updating = false;
              processUpdateQueue(true);
              resolve();
            })
            .catch(error => {
              proxyState.updating = false;
              processUpdateQueue(false, error);
              reject(error);
            });
        }

        // Fill active host mapping
        hostsGroups.forEach(group => {
          if (activeGroups.includes(group.id)) {
            group.hosts.forEach(hostEntry => {
              if (hostEntry.enabled) {
                activeHostsMap[hostEntry.domain] = hostEntry.ip;
              }
            });
          }
        });

        // Check if mapping has changed
        const hasChanges = !isEqual(previousMapping, activeHostsMap);

        if (hasChanges) {
          // Update proxy settings with new hosts mapping
          return updateProxySettings()
            .then(() => {
              proxyState.updating = false;
              processUpdateQueue(true);
              resolve();
            })
            .catch(error => {
              proxyState.updating = false;
              processUpdateQueue(false, error);
              reject(error);
            });
        } else {
          // No changes, skip update
          proxyState.updating = false;
          processUpdateQueue(true);
          resolve();
        }
      })
      .catch(error => {
        console.error('Failed to get storage data:', error);
        proxyState.updating = false;
        processUpdateQueue(false, error);
        reject(error);
      });
  });
}

/**
 * Handle the update queue
 * @param {boolean} success - whether the update was successful or not
 * @param {Error} [error] - error object
 */
function processUpdateQueue (success, error) {
  // Process all pending updates in the queue
  while (proxyState.updateQueue.length > 0) {
    const { resolve, reject } = proxyState.updateQueue.shift();
    if (success) {
      resolve();
    } else {
      reject(error);
    }
  }
}

/**
 * Depth comparison of two objects for equality
 * @param {object} obj1 - object1
 * @param {object} obj2 - object2
 * @returns {boolean} whether or not they are equal.
 */
function isEqual (obj1, obj2) {
  if (obj1 === obj2) return true;

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) return false;
  }

  return true;
}

/**
 * Update Chrome proxy settings using PAC script for both hosts mapping and SOCKS proxy
 * @returns {Promise<void>}
 */
function updateProxySettings () {
  return new Promise((resolve, reject) => {
    // Check for excessive errors
    const now = Date.now();
    if (proxyState.errorCount >= proxyState.MAX_ERROR_COUNT) {
      if (now - proxyState.lastUpdateTime < proxyState.ERROR_RESET_TIME) {
        console.warn('Proxy update error count is too high, pausing updates');
        return resolve();
      } else {
        // Reset error count
        proxyState.errorCount = 0;
      }
    }

    proxyState.lastUpdateTime = now;

    // Getting SOCKS proxy settings
    chrome.storage.local.get(['socketProxy'])
      .then(result => {
        const socketProxy = result.socketProxy || {};
        let config;

        // Generate PAC script that handles both hosts mapping and SOCKS proxy
        const pacScriptData = generateComprehensivePacScript(activeHostsMap, socketProxy);

        // Use PAC script if we have hosts mapping OR SOCKS proxy is enabled
        // This ensures SOCKS proxy works even without hosts rules
        if (Object.keys(activeHostsMap).length > 0 || (socketProxy.enabled && socketProxy.host && socketProxy.port)) {
          config = {
            mode: "pac_script",
            pacScript: {
              data: pacScriptData
            }
          };
        } else {
          // Only clear proxy if both hosts mapping is empty AND SOCKS proxy is disabled
          return chrome.proxy.settings.clear({ scope: 'regular' })
            .then(() => {
              currentConfig = null;
              resolve();
            })
            .catch(error => {
              handleProxyError(error);
              reject(error);
            });
        }

        // Check if configuration has changed
        if (currentConfig && JSON.stringify(currentConfig) === JSON.stringify(config)) {
          return resolve();
        }

        // Update configuration
        chrome.proxy.settings.set({ value: config, scope: 'regular' })
          .then(() => {
            currentConfig = config;
            resolve();
          })
          .catch(error => {
            handleProxyError(error);
            reject(error);
          });
      })
      .catch(error => {
        console.error('Failed to get Socket proxy settings:', error);
        reject(error);
      });
  });
}

/**
 * Generate comprehensive PAC script that handles both hosts mapping and SOCKS proxy
 * @param {object} hostsMapping - hosts mapping object
 * @param {object} socketProxy - Socket proxy configuration
 * @returns {string} PAC script
 */
function generateComprehensivePacScript (hostsMapping, socketProxy) {
  // Check SOCKS proxy settings
  const sockEnabled = socketProxy && socketProxy.enabled;
  const sockHost = socketProxy && socketProxy.host;
  const sockPort = socketProxy && socketProxy.port;
  const protocol = socketProxy && socketProxy.protocol || 'SOCKS5'; // 获取协议类型

  // Check authentication settings
  const authEnabled = socketProxy && socketProxy.auth && socketProxy.auth.enabled;
  const username = authEnabled ? socketProxy.auth.username : '';
  const password = authEnabled ? socketProxy.auth.password : '';

  // Convert hosts mapping to PAC script format
  const hostsMapString = JSON.stringify(hostsMapping || {});

  // 根据协议类型生成代理字符串
  let proxyString = '';
  switch (protocol) {
    case 'HTTP':
    case 'HTTPS':
      proxyString = authEnabled ?
        `PROXY ${username}:${password}@${sockHost}:${sockPort}` :
        `PROXY ${sockHost}:${sockPort}`;
      break;
    case 'SOCKS4':
      proxyString = `SOCKS4 ${sockHost}:${sockPort}`;
      break;
    case 'SOCKS':
      // 自动模式：先尝试SOCKS5，再尝试SOCKS4
      proxyString = authEnabled ?
        `SOCKS5 ${username}:${password}@${sockHost}:${sockPort}; SOCKS ${sockHost}:${sockPort}` :
        `SOCKS5 ${sockHost}:${sockPort}; SOCKS ${sockHost}:${sockPort}`;
      break;
    case 'SOCKS5':
    default:
      proxyString = authEnabled ?
        `SOCKS5 ${username}:${password}@${sockHost}:${sockPort}` :
        `SOCKS5 ${sockHost}:${sockPort}`;
      break;
  }

  // Create comprehensive PAC script with correct hosts mapping logic
  let pacScript = `
  function FindProxyForURL(url, host) {
    // Hosts mapping configuration
    var hostsMapping = ${hostsMapString};
    
    // Extract domain and port from host
    var domainPart = host;
    var port = "80";

    // Check if host contains port
    var colonPos = host.indexOf(":");
    if (colonPos !== -1) {
      domainPart = host.substring(0, colonPos);
      port = host.substring(colonPos + 1);
    }

    // Convert to lowercase for case-insensitive matching
    domainPart = domainPart.toLowerCase();

    // Always use direct connection for localhost and local addresses
    if (isPlainHostName(domainPart) || 
        domainPart === 'localhost' || 
        domainPart === '127.0.0.1' ||
        domainPart.indexOf('.local') !== -1) {
      return 'DIRECT';
    }

    // Check hosts mapping first - CORE LOGIC FOR HOSTS RULES
    if (hostsMapping[domainPart]) {
      var mappedIP = hostsMapping[domainPart];
      
      // Extract port from mapped IP if present
      var mappedPort = port;
      if (mappedIP.indexOf(':') !== -1) {
        var parts = mappedIP.split(':');
        mappedIP = parts[0];
        mappedPort = parts[1];
      }
      
      // Handle different protocols for hosts mapping
      if (url.indexOf('https://') === 0) {
        // HTTPS requests with hosts mapping
        // Due to SSL certificate validation, direct IP proxy won't work properly
        // If SOCKS proxy is available, use it to handle HTTPS with hosts mapping
        // Otherwise, fall back to direct connection (browser will use normal DNS)
        if (${sockEnabled}) {
          return '${proxyString}';
        } else {
          // HTTPS without SOCKS proxy - cannot work properly due to SSL certificate
          // Browser will use normal DNS resolution
          return 'DIRECT';
        }
      } else {
        // HTTP requests with hosts mapping work fine with PROXY directive
        return 'PROXY ' + mappedIP + ':' + mappedPort;
      }
    }

    // For all non-mapped traffic, use SOCKS proxy if enabled
    // This ensures SOCKS proxy works as a global proxy when no hosts rules match
    ${sockEnabled ? `return '${proxyString}';` : `return 'DIRECT';`}
  }`;

  return pacScript;
}

/**
 * Handle proxy update errors
 * @param {Error} error - error object
 */
function handleProxyError (error) {
  proxyState.errorCount++;

  // If there are too many errors, print a warning
  if (proxyState.errorCount >= proxyState.MAX_ERROR_COUNT) {
    console.warn(`Proxy settings update failed too many times (${proxyState.errorCount} times), will retry after ${proxyState.ERROR_RESET_TIME / 1000} seconds`);
  }
}

// Initialize on extension installation/update
chrome.runtime.onInstalled.addListener(initializeExtension);

// Initialize on browser startup
initializeExtension();