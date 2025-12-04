# Hosts Manager Extension

<p align="center">
  <img src="host/images/icon128.png" alt="Logo">
</p>

<p align="center">Browser extension for managing hosts mappings by groups, with optional socket proxy support.</p>

<p align="center">
  <a href="https://github.com/ccpopy/hosts-manager-extension/releases"><img src="https://img.shields.io/github/v/release/ccpopy/hosts-manager-extension?style=flat-square" alt="GitHub release"></a>
  <a href="https://github.com/ccpopy/hosts-manager-extension/stargazers"><img src="https://img.shields.io/github/stars/ccpopy/hosts-manager-extension?style=flat-square" alt="GitHub stars"></a>
  <a href="https://github.com/ccpopy/hosts-manager-extension/issues"><img src="https://img.shields.io/github/issues/ccpopy/hosts-manager-extension?style=flat-square" alt="GitHub issues"></a>
  <a href="https://github.com/ccpopy/hosts-manager-extension/blob/main/LICENSE"><img src="https://img.shields.io/github/license/ccpopy/hosts-manager-extension?style=flat-square" alt="License"></a>
  <a href="https://chromewebstore.google.com/detail/hosts-manager/ekofkbkmenfagdkijaplfbdcdnlddjod" target="_blank"><img src="https://img.shields.io/chrome-web-store/v/ekofkbkmenfagdkijaplfbdcdnlddjod?style=flat-square" alt="Chrome Web Store Version"></a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/hosts-manager/apeejdinnfjjlajmihbpojcapdkghbki" target="_blank"><img src="https://img.shields.io/badge/dynamic/json?label=Edge%20Addons&prefix=v&query=$.version&url=https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/apeejdinnfjjlajmihbpojcapdkghbki&style=flat-square&color=0078D7" alt="Edge Addon"></a>
</p>

<p align="right"><a href="#english">English</a> | <a href="README.zh-CN.md">简体中文</a></p>

## English

### What is this?
Hosts Manager Extension lets you organize hosts mappings into reusable groups, toggle them with one click, and optionally route traffic through a socket proxy. All data stays local to your browser.

### Features
- Grouped rule management for different projects or environments
- One-click enable/disable for groups without re-editing
- Bulk import from files or clipboard in standard hosts format
- Built-in socket proxy configuration with bypass list support
- Local persistence; no data leaves your machine
- Clean, modern UI built for Chrome/Edge Manifest V3

### Screenshots
![Main interface](screenshots/hosts.png)
<p align="center">Main interface with grouped hosts</p>

### Installation
- From Releases (recommended)
  1. Download the latest `hosts-manager.zip` from [Releases](../../releases).
  2. Extract it locally.
  3. Open `chrome://extensions/`, enable "Developer mode", and choose "Load unpacked".
  4. Select the extracted folder.
- Via CRX
  1. Download `hosts-manager.crx`.
  2. Drag it onto the Chrome extensions page and confirm.
- From source
  ```bash
  git clone https://github.com/ccpopy/hosts-manager-extension.git
  cd hosts-manager-extension
  ```
  Then load the `host` directory via "Load unpacked" in Chrome/Edge.

### Usage
- Create a group and add rules (`IP domain`) under it.
- Toggle a group to enable/disable all rules inside it.
- Right-click a rule to edit or delete.
- Bulk import supports the standard hosts format:
  ```
  # Dev env
  192.168.1.100 dev.example.com
  192.168.1.101 api.example.com
  ```
- Socket proxy setup: open Settings → Socket Proxy, enter server, port, protocol, optional auth, and bypass list, then save.

### Tech Stack
- Vanilla JavaScript with Chrome/Edge Extensions API (Manifest V3)
- GitHub Actions for packaging releases

### Project Structure
```
host/
├── background.js              # Service worker: proxy/PAC and hosts mapping
├── css/
│   ├── page.css               # Options page styles
│   └── popup.css              # Popup styles
├── images/                    # Icons
├── js/
│   ├── app.js                 # App shell and navigation
│   ├── page.js                # Options entry
│   ├── popup.js               # Popup entry
│   ├── components/            # UI components
│   ├── pages/                 # Page-level modules
│   ├── services/              # State, proxy, search, storage
│   └── utils/                 # Messaging, validation, performance helpers
├── manifest.json              # Extension manifest (MV3)
├── page.html                  # Options page
└── popup.html                 # Toolbar popup
```

### Development
- Local dev: edit code, then click "Reload" in the extensions page after changes.
- Release: tag with `git tag vX.Y.Z && git push origin vX.Y.Z`; GitHub Actions builds ZIP/CRX and publishes a Release.

### Notes
- Requires Chrome/Edge 88+ (Manifest V3 support).
- Proxy features need proxy permissions and may conflict with other proxy extensions.
- HTTPS host overrides are not reliable because browsers validate TLS certificates against the original domain; use a proxy that both resolves the domain and presents a valid/accepted certificate if you need HTTPS mappings.
- Back up your configuration regularly.

### Roadmap
- [ ] Internationalization toggle in UI
- [x] Search within hosts rules
- [x] Export/import groups
- [ ] Performance optimizations for very large rule sets

### License
MIT License – see `LICENSE`.

### Contact
- GitHub: [@ccpopy](https://github.com/ccpopy)
- Issues: [Submit an issue](https://github.com/ccpopy/hosts-manager-extension/issues)

---

<p align="center">
  <strong>If this project helps you, please consider giving it a ⭐</strong>
</p>
