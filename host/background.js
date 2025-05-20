/**
 * Hosts Manager background scripts
 * Handles proxy configuration and host mapping
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
 * Initialization extensions
 */
function initializeExtension () {
  // Get stored groups and active groups
  chrome.storage.local.get(['hostsGroups', 'activeGroups'], (result) => {
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
      chrome.storage.local.set({ hostsGroups: defaultGroups })
        .catch(error => console.error('Failed to initialize default grouping:', error));
    }

    // If there are active groups, update mapping
    if (result.activeGroups) {
      activeGroups = result.activeGroups;
      updateActiveHostsMap();
    } else {
      // Otherwise, activate all groups
      chrome.storage.local.get(['hostsGroups'], (data) => {
        if (data.hostsGroups) {
          const allGroupIds = data.hostsGroups.map(group => group.id);
          chrome.storage.local.set({ activeGroups: allGroupIds })
            .then(() => {
              activeGroups = allGroupIds;
              updateActiveHostsMap();
            })
            .catch(error => console.error('Failed to activate all groups:', error));
        }
      });
    }
  });

  // Adding a storage change listener
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.hostsGroups || changes.activeGroups) {
      updateActiveHostsMap();
    }
  });

  // Adding a message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
            sendResponse({ success: false, error: error.message });
          }
        });
      return true;
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

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['hostsGroups', 'activeGroups'])
      .then(result => {
        const previousMapping = { ...activeHostsMap };
        activeHostsMap = {};
        activeGroups = result.activeGroups || [];

        const { hostsGroups } = result;
        if (!hostsGroups || !activeGroups) {
          // No configuration or active grouping, reset agent
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
          // Update proxy settings
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
 * Update Chrome proxy settings
 * @returns {Promise<void>}
 */
function updateProxySettings () {
  return new Promise((resolve, reject) => {
    const hostEntries = Object.keys(activeHostsMap);

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

        if (hostEntries.length === 0) {
          // If there are no host entries, check if SOCKS proxy is enabled
          if (socketProxy.enabled && socketProxy.host && socketProxy.port) {
            // Only use SOCKS proxy
            config = {
              mode: "pac_script",
              pacScript: {
                data: generatePacScript(activeHostsMap, socketProxy)
              }
            };
          } else {
            // Completely disable proxy
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
        } else {
          // There are host entries that configure PAC scripts
          config = {
            mode: "pac_script",
            pacScript: {
              data: generatePacScript(activeHostsMap, socketProxy)
            }
          };
        }

        // Check if configuration has changed
        if (currentConfig && JSON.stringify(currentConfig) === JSON.stringify(config)) {
          console.log('Proxy configuration has not changed, skipping update');
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

/**
 * Generate PAC script for proxy configuration
 * @param {object} hostsMap - host mapping
 * @param {object} socketProxy - Socket proxy configuration
 * @returns {string} PAC script
 */
function generatePacScript (hostsMap, socketProxy) {
  // Optimized PAC script generation logic
  const hostsMapJson = JSON.stringify(hostsMap);
  const hostsMapEntries = Object.keys(hostsMap).length;

  // Check SOCKS proxy settings
  const sockEnabled = socketProxy && socketProxy.enabled;
  const sockHost = socketProxy && socketProxy.host;
  const sockPort = socketProxy && socketProxy.port;

  // Check authentication settings
  const authEnabled = socketProxy && socketProxy.auth && socketProxy.auth.enabled;
  const username = authEnabled ? socketProxy.auth.username : '';
  const password = authEnabled ? socketProxy.auth.password : '';

  // Create a more efficient PAC script
  // Optimizing Domain Matching with Binary Lookups
  let pacScript = `
  function FindProxyForURL(url, host) {
    // Extract domain and port
    let domainPart = host;
    let port = "80";

    // Check if host contains port
    const colonPos = host.indexOf(":");
    if (colonPos !== -1) {
      domainPart = host.substring(0, colonPos);
      port = host.substring(colonPos + 1);
    }

    // Convert to lowercase
    domainPart = domainPart.toLowerCase();

    // Direct connection to localhost
    if (isPlainHostName(domainPart) || domainPart === 'localhost' || domainPart === '127.0.0.1') {
      return 'DIRECT';
    }

    // Host mapping rules
    const hostMap = ${hostsMapJson};
  `;

  // Using more efficient matching algorithms
  if (hostsMapEntries > 50) {
    // For a large number of rules, use partitioned search
    pacScript += `
    // Optimization algorithm for a large number of mappings
    const domains = Object.keys(hostMap);

    // Direct match
    if (hostMap[domainPart]) {
      return 'PROXY ' + hostMap[domainPart] + ':' + port;
    }

    // Subdomain matching
    for (let i = 0; i < domains.length; i++) {
      const domain = domains[i];
      if (domainPart.endsWith('.' + domain)) {
        return 'PROXY ' + hostMap[domain] + ':' + port;
      }
    }
    `;
  } else {
    // For a small number of rules, use a simple loop
    pacScript += `
    // Host mapping matching
    for (const domain in hostMap) {
      if (domainPart === domain || domainPart.endsWith('.' + domain)) {
        return 'PROXY ' + hostMap[domain] + ':' + port;
      }
    }
    `;
  }

  // SOCKS proxy configuration
  if (sockEnabled) {
    if (authEnabled) {
      pacScript += `return 'SOCKS5 ${username}:${password}@${sockHost}:${sockPort}';`;
    } else {
      pacScript += `return 'SOCKS ${sockHost}:${sockPort}';`;
    }
  } else {
    pacScript += `return 'DIRECT';`;
  }

  pacScript += `\n}`;
  return pacScript;
}

// Initialized on extension installation/update
chrome.runtime.onInstalled.addListener(initializeExtension);

// Initialize on browser startup
initializeExtension();