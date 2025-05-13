# Hosts Manager Extension

一个用于管理 hosts 映射的 Chrome 扩展，支持分组功能。

## 功能特点

- 📁 分组管理 hosts 规则
- 🔄 快速切换启用/禁用分组
- 📝 批量导入 hosts 规则
- 🌐 支持 Socket 代理配置
- 💾 本地存储，数据安全
- 🎨 现代化的用户界面

## 安装方法

### 方法一：从 Release 安装（推荐）

1. 前往 [Releases](../../releases) 页面
2. 下载最新版本的 `hosts-manager-*.zip` 文件
3. 解压到本地文件夹
4. 打开 Chrome 浏览器，访问 `chrome://extensions/`
5. 开启右上角的"开发者模式"
6. 点击"加载已解压的扩展程序"
7. 选择解压后的文件夹

### 方法二：从源码安装

1. 克隆本仓库：

   ```bash
   git clone https://github.com/ccpopy/hosts-manager-extension.git
   cd hosts-manager-extension
   ```

2. 在 Chrome 中加载扩展：
   - 打开 `chrome://extensions/`
   - 开启"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目根目录

## 使用说明

1. 点击扩展图标打开管理界面
2. 创建分组并添加 hosts 规则
3. 通过开关快速启用/禁用分组
4. 支持批量导入规则，格式如下：
   ```
   192.168.1.1 example.com
   127.0.0.1 localhost
   # 注释会被忽略
   ```

## 开发

### 项目结构

```
hosts-manager-extension/
├── manifest.json          # 扩展清单文件
├── background.js          # 后台脚本
├── popup.html            # 弹出窗口
├── page.html             # 主页面
├── css/
│   └── page.css          # 样式文件
├── js/
│   ├── page.js           # 主页面脚本
│   └── popup.js          # 弹出窗口脚本
└── images/               # 图标文件
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 构建发布

本项目使用 GitHub Actions 自动构建。当创建新的 tag 时会自动发布：

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 注意事项

- 此扩展需要代理权限来修改系统 hosts
- 可能与其他代理类扩展冲突
- 请确保 Chrome 版本支持 Manifest V3

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
