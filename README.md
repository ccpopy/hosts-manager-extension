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

<p align="right"><a href="#english">English</a> | <a href="#zh-cn">简体中文</a></p>

<a id="english"></a>

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

<a id="zh-cn"></a>

## 简体中文

### 简介
Hosts Manager 是一款用于按分组管理 hosts 映射的浏览器扩展，可一键启用/禁用分组，并支持内置 Socket 代理。所有数据仅存储在本地浏览器。

### 功能特点
- 分组管理：按项目或环境组织规则
- 一键切换：启用/禁用分组无需重复编辑
- 批量导入：支持标准 hosts 格式
- Socket 代理：内置代理配置与白名单
- 本地存储：数据不出本地
- 现代界面：基于 Manifest V3 的 Chrome/Edge 扩展

### 界面截图
![主界面](screenshots/hosts.png)
<p align="center">主界面 - 分组管理</p>

### 安装方法
- 从 Release 安装（推荐）
  1. 前往 [Releases](../../releases) 下载最新 `hosts-manager.zip`
  2. 解压后在 `chrome://extensions/` 中开启“开发者模式”，点击“加载已解压的扩展程序”
  3. 选择解压后的目录
- 使用 CRX 文件
  1. 下载 `hosts-manager.crx`
  2. 拖拽到扩展管理页并确认安装
- 从源码加载
  ```bash
  git clone https://github.com/ccpopy/hosts-manager-extension.git
  cd hosts-manager-extension
  ```
  在扩展管理页选择 `host` 目录加载。

### 使用说明
- 新建分组并添加规则（格式 `IP 域名`）
- 开关分组以批量启用/禁用内部规则
- 右键规则可编辑或删除
- 批量导入示例：
  ```
  # 开发环境
  192.168.1.100 dev.example.com
  192.168.1.101 api.example.com
  ```
- Socket 代理：设置页 → Socket 代理，填写服务器、端口、协议、认证和白名单后保存。

### 技术栈
- 原生 JavaScript + Chrome/Edge Extensions API (Manifest V3)
- GitHub Actions 自动构建发布

### 项目结构
```
host/
├── background.js              # 后台脚本：代理/PAC 与 hosts 映射
├── css/                       # 样式文件
├── images/                    # 图标资源
├── js/                        # 逻辑代码（组件、页面、服务、工具）
├── manifest.json              # 扩展清单 (MV3)
├── page.html                  # 设置页面
└── popup.html                 # 弹出窗口
```

### 开发与发布
- 本地开发：修改代码后在扩展管理页点击“重新加载”。
- 发布：执行 `git tag vX.Y.Z` 并推送，GitHub Actions 会自动打包 ZIP/CRX 并创建 Release。

### 注意事项
- 需 Chrome/Edge 88+；代理权限可能与其他代理扩展冲突
- 建议定期备份配置

### 待办
- [ ] 国际化 UI 切换
- [x] 搜索功能
- [x] 导出/导入分组
- [ ] 大量规则下的性能优化

### 许可证
MIT 许可证，详见 `LICENSE`。

### 联系作者
- GitHub: [@ccpopy](https://github.com/ccpopy)
- Issues: [提交 Issue](https://github.com/ccpopy/hosts-manager-extension/issues)

---

<p align="center">
  <strong>If this project helps you, please consider giving it a ⭐</strong>
</p>
