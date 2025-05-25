/**
 * Hosts Manager background scripts
 * Handles hosts mapping using declarativeNetRequest API and proxy configuration
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

// declarativeNetRequest rule management
const RULE_MANAGEMENT = {
  RULE_ID_START: 1,
  // Chrome extension rule limit
  RULE_ID_MAX: 30000,
  currentRuleId: 1,
  activeRuleIds: new Set(),
  updating: false,
};

/**
 * Initialize extension
 */
/**
 * Initialize extension
 */
function initializeExtension () {
  // Clean up all existing rules on initialization
  clearAllHostsRules()
    .then(() => {
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

            // Delayed update mapping to ensure initialization is complete and avoid concurrency issues
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
    })
    .catch(error => {
      chrome.storage.local.get(['hostsGroups', 'activeGroups'], (result) => {
        console.warn('Proceeding with initialization despite rule clearing failure');

        if (result.activeGroups && Array.isArray(result.activeGroups)) {
          activeGroups = result.activeGroups;

          setTimeout(() => {
            updateActiveHostsMap()
              .catch(error => {
                console.error('Failed to update hosts mapping after failed cleanup:', error);
              });
          }, 500);
        }
      });
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
          // No configuration or active grouping, clear rules
          return clearAllHostsRules()
            .then(() => updateProxySettings())
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
          // Update declarativeNetRequest rules and proxy settings
          return Promise.all([
            updateDeclarativeNetRequestRules(),
            updateProxySettings()
          ])
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
 * Update declarativeNetRequest rules for hosts mapping
 * @returns {Promise<void>}
 */
function updateDeclarativeNetRequestRules () {
  return new Promise((resolve, reject) => {
    // Prevent concurrent updates
    if (RULE_MANAGEMENT.updating) {
      setTimeout(() => {
        updateDeclarativeNetRequestRules().then(resolve).catch(reject);
      }, 500);
      return;
    }

    RULE_MANAGEMENT.updating = true;

    try {
      // First, remove all existing rules
      clearAllHostsRules()
        .then(() => {
          // Create new rules for active hosts
          const newRules = [];
          const hostEntries = Object.keys(activeHostsMap);

          if (hostEntries.length === 0) {
            // No hosts to redirect
            RULE_MANAGEMENT.updating = false;
            resolve();
            return;
          }

          // Reset rule ID counter and clear active rule IDs
          RULE_MANAGEMENT.currentRuleId = RULE_MANAGEMENT.RULE_ID_START;
          RULE_MANAGEMENT.activeRuleIds.clear();

          hostEntries.forEach(domain => {
            const ip = activeHostsMap[domain];

            // Create rules for both HTTP and HTTPS
            const protocols = ['http', 'https'];

            protocols.forEach(protocol => {
              if (RULE_MANAGEMENT.currentRuleId > RULE_MANAGEMENT.RULE_ID_MAX) {
                console.warn('Reached maximum rule limit');
                return;
              }

              const ruleId = RULE_MANAGEMENT.currentRuleId++;

              // Create redirect rule
              const rule = {
                id: ruleId,
                priority: 1,
                action: {
                  type: 'redirect',
                  redirect: {
                    regexSubstitution: `${protocol}://${ip}\\2`
                  }
                },
                condition: {
                  regexFilter: `^${protocol}://${escapeRegExp(domain)}(:[0-9]+)?(/.*)?$`,
                  resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'other', 'websocket']
                }
              };

              newRules.push(rule);
              RULE_MANAGEMENT.activeRuleIds.add(ruleId);
            });
          });

          // Add all rules at once
          if (newRules.length > 0) {
            chrome.declarativeNetRequest.updateDynamicRules({
              addRules: newRules
            }, () => {
              RULE_MANAGEMENT.updating = false;

              if (chrome.runtime.lastError) {
                console.error('Failed to add declarativeNetRequest rules:', chrome.runtime.lastError);
                RULE_MANAGEMENT.activeRuleIds.clear();
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          } else {
            RULE_MANAGEMENT.updating = false;
            resolve();
          }
        })
        .catch(error => {
          RULE_MANAGEMENT.updating = false;
          reject(error);
        });
    } catch (error) {
      RULE_MANAGEMENT.updating = false;
      console.error('Error updating declarativeNetRequest rules:', error);
      reject(error);
    }
  });
}

/**
 * Clear all hosts-related declarativeNetRequest rules
 * @returns {Promise<void>}
 */
function clearAllHostsRules () {
  return new Promise((resolve, reject) => {
    // Get all current dynamic rules
    chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to get existing rules:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      // If there are no existing rules, a direct solution
      if (existingRules.length === 0 && RULE_MANAGEMENT.activeRuleIds.size === 0) {
        RULE_MANAGEMENT.activeRuleIds.clear();
        resolve();
        return;
      }

      // Collect all rule IDs to remove
      const ruleIdsToRemove = new Set();

      // Add existing rule IDs
      existingRules.forEach(rule => {
        ruleIdsToRemove.add(rule.id);
      });

      // Add active rule IDs
      RULE_MANAGEMENT.activeRuleIds.forEach(id => {
        ruleIdsToRemove.add(id);
      });

      if (ruleIdsToRemove.size === 0) {
        RULE_MANAGEMENT.activeRuleIds.clear();
        resolve();
        return;
      }

      const ruleIdsArray = Array.from(ruleIdsToRemove);

      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIdsArray
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Failed to remove declarativeNetRequest rules:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          RULE_MANAGEMENT.activeRuleIds.clear();
          resolve();
        }
      });
    });
  });
}

/**
 * Escape special characters for regex
 * @param {string} string - string to escape
 * @returns {string} escaped string
 */
function escapeRegExp (string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Update Chrome proxy settings (for SOCKS proxy only)
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

        // Only configure proxy if SOCKS proxy is enabled
        if (socketProxy.enabled && socketProxy.host && socketProxy.port) {
          // Generate PAC script for SOCKS proxy (for non-hosts traffic)
          config = {
            mode: "pac_script",
            pacScript: {
              data: generateSocksOnlyPacScript(socketProxy)
            }
          };
        } else {
          // Disable proxy completely
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
 * Generate PAC script for SOCKS proxy only (not for hosts mapping)
 * @param {object} socketProxy - Socket proxy configuration
 * @returns {string} PAC script
 */
function generateSocksOnlyPacScript (socketProxy) {
  // Check SOCKS proxy settings
  const sockEnabled = socketProxy && socketProxy.enabled;
  const sockHost = socketProxy && socketProxy.host;
  const sockPort = socketProxy && socketProxy.port;

  // Check authentication settings
  const authEnabled = socketProxy && socketProxy.auth && socketProxy.auth.enabled;
  const username = authEnabled ? socketProxy.auth.username : '';
  const password = authEnabled ? socketProxy.auth.password : '';

  // Create PAC script for SOCKS proxy only
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

    // Note: Hosts mapping is now handled by declarativeNetRequest
    // This PAC script only handles SOCKS proxy for other traffic
  `;

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