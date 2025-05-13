// Global variables to store active hosts mappings and groups
let activeHostsMap = {};
let activeGroups = [];

// Initialize when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  // Get stored groups and active groups
  chrome.storage.local.get(['hostsGroups', 'activeGroups'], (result) => {
    if (!result.hostsGroups) {
      const defaultGroups = [
        {
          id: 'default',
          name: 'Default Group',
          hosts: [],
          enabled: true
        }
      ];
      chrome.storage.local.set({ hostsGroups: defaultGroups });
    }

    if (result.activeGroups) {
      activeGroups = result.activeGroups;
      updateActiveHostsMap();
    } else {
      // Activate all groups by default
      chrome.storage.local.get(['hostsGroups'], (data) => {
        if (data.hostsGroups) {
          const allGroupIds = data.hostsGroups.map(group => group.id);
          chrome.storage.local.set({ activeGroups: allGroupIds });
          activeGroups = allGroupIds;
          updateActiveHostsMap();
        }
      });
    }
  });
});

// Listen for storage changes to update active hosts map
chrome.storage.onChanged.addListener((changes) => {
  if (changes.hostsGroups || changes.activeGroups) {
    updateActiveHostsMap();
  }
});

// Update the active hosts map based on enabled groups
function updateActiveHostsMap () {
  chrome.storage.local.get(['hostsGroups', 'activeGroups'], (result) => {
    activeHostsMap = {};
    const { hostsGroups, activeGroups } = result;

    if (hostsGroups && activeGroups) {
      hostsGroups.forEach(group => {
        if (activeGroups.includes(group.id)) {
          group.hosts.forEach(hostEntry => {
            if (hostEntry.enabled) {
              activeHostsMap[hostEntry.domain] = hostEntry.ip;
            }
          });
        }
      });
    }

    // Update proxy settings
    updateProxySettings();
  });
}

// Configure Chrome proxy settings
function updateProxySettings () {
  const hostEntries = Object.keys(activeHostsMap);

  if (hostEntries.length === 0) {
    // If no entries, check if SOCKS proxy is enabled
    chrome.storage.local.get(['socketProxy'], (result) => {
      const socketProxy = result.socketProxy || {};

      if (socketProxy.enabled && socketProxy.host && socketProxy.port) {
        // Use only SOCKS proxy
        const config = {
          mode: "pac_script",
          pacScript: {
            data: generatePacScript(activeHostsMap, socketProxy)
          }
        };
        chrome.proxy.settings.set({ value: config, scope: 'regular' });
      } else {
        // Disable proxy completely
        chrome.proxy.settings.clear({ scope: 'regular' });
      }
    });
    return;
  }

  // Get SOCKS proxy settings
  chrome.storage.local.get(['socketProxy'], (result) => {
    const socketProxy = result.socketProxy || {};

    const config = {
      mode: "pac_script",
      pacScript: {
        data: generatePacScript(activeHostsMap, socketProxy)
      }
    };

    chrome.proxy.settings.set({ value: config, scope: 'regular' });
  });
}

// Generate PAC script for proxy configuration (ASCII only)
// Enhanced version with port support
function generatePacScript (hostsMap, socketProxy) {
  // Convert the hosts map to a JSON string
  const hostsMapJson = JSON.stringify(hostsMap);

  // Check SOCKS proxy settings
  const sockEnabled = socketProxy && socketProxy.enabled;
  const sockHost = socketProxy && socketProxy.host;
  const sockPort = socketProxy && socketProxy.port;

  // Create PAC script with only ASCII characters
  // Enhanced to support custom ports in URLs
  let pacScript = `
  function FindProxyForURL(url, host) {
    // Extract domain and port from host
    let domainPart = host;
    let port = "80";
    
    // Check if host includes port
    if (host.indexOf(":") !== -1) {
      const parts = host.split(":");
      domainPart = parts[0];
      port = parts[1];
    }
    
    // Convert hostname to lowercase
    domainPart = domainPart.toLowerCase();
    
    // Direct connection for simple hostnames and localhost
    if (isPlainHostName(domainPart) || domainPart === 'localhost' || domainPart === '127.0.0.1') {
      return 'DIRECT';
    }
    
    // Host mapping rules
    const hostMap = ${hostsMapJson};
    
    // Check for host matches
    for (const domain in hostMap) {
      if (domainPart === domain || domainPart.endsWith('.' + domain)) {
        const ip = hostMap[domain];
        // Use the original port from the URL
        return 'PROXY ' + ip + ':' + port;
      }
    }
    
    // Use SOCKS proxy for other requests if enabled
    ${sockEnabled ? `return 'SOCKS ${sockHost}:${sockPort}';` : 'return "DIRECT";'}
  }
  `;

  return pacScript;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateProxySettings') {
    updateActiveHostsMap();
    if (sendResponse) {
      sendResponse({ success: true });
    }
    return true;
  }
});