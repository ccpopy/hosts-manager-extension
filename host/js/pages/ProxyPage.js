import StateService from '../services/StateService.js';
import ProxyService from '../services/ProxyService.js';
import { createNotice } from '../components/Notice.js';
import { Message } from '../utils/MessageUtils.js';
import { isValidIp, isValidDomain, isValidPort } from '../utils/ValidationUtils.js';

export default class ProxyPage {
  /**
   * 构造函数
   * @param {HTMLElement} container - 页面容器
   */
  constructor(container) {
    this.container = container;
    this.isSubmitting = false;
    this.formElement = null;
    this.validationTimeouts = new Map();

    // 表单元素引用
    this.elements = {
      hostInput: null,
      portInput: null,
      enabledCheckbox: null,
      authEnabledCheckbox: null,
      usernameInput: null,
      passwordInput: null,
      saveButton: null
    };

    // 订阅状态变化
    this.unsubscribe = StateService.subscribe(state => {
      // 当代理设置变化时更新UI
      this.updateProxyUI(state.socketProxy);
    });
  }

  /**
   * 初始化页面
   */
  async init () {
    try {
      await StateService.initialize();
      await this.render();
    } catch (error) {
      console.error('初始化代理页面失败:', error);
      this.renderError('初始化页面失败，请刷新重试');
    }
  }

  /**
   * 渲染页面
   */
  async render () {
    const state = StateService.getState();
    this.container.innerHTML = '';

    // 标题
    const proxyTitle = document.createElement('h2');
    proxyTitle.className = 'page-title';
    proxyTitle.textContent = 'Socket 代理设置';
    this.container.appendChild(proxyTitle);

    // 提示信息
    const proxyNotice = createNotice(
      'Socket代理配置用于处理所有非hosts规则匹配的流量。当没有hosts规则时，启用的Socket代理将作为全局代理。代理也可用于处理https网站的hosts映射需求（通过代理服务器处理SSL证书问题）',
      'info',
      `<svg class="notice-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`
    );
    this.container.appendChild(proxyNotice);

    // 创建设置表单
    const proxyForm = this.createProxyForm(state.socketProxy);
    this.container.appendChild(proxyForm);

    // 初始化表单
    this.updateFormState();
  }

  /**
   * 创建代理表单
   * @param {Object} proxySettings - 代理设置
   * @returns {HTMLElement} - 表单元素
   */
  createProxyForm (proxySettings) {
    const proxySection = document.createElement('div');
    proxySection.className = 'proxy-section';

    // 表单容器
    const formContainer = document.createElement('form');
    formContainer.className = 'proxy-form';

    // 保存表单引用，用于后续移除事件监听器
    this.formElement = formContainer;

    // 使用绑定的方法，确保this指向正确
    const boundSaveHandler = this.handleSaveProxy.bind(this);
    formContainer.addEventListener('submit', e => {
      e.preventDefault();
      boundSaveHandler();
    });

    // 主机和端口
    const basicSettingsSection = document.createElement('div');
    basicSettingsSection.className = 'form-section';

    const basicSettingsTitle = document.createElement('h3');
    basicSettingsTitle.className = 'section-title';
    basicSettingsTitle.textContent = '代理服务器';
    basicSettingsSection.appendChild(basicSettingsTitle);

    // 主机输入
    const hostFormGroup = document.createElement('div');
    hostFormGroup.className = 'form-group';

    const hostLabel = document.createElement('label');
    hostLabel.textContent = '代理主机:';
    hostLabel.htmlFor = 'proxy-host';

    this.elements.hostInput = document.createElement('input');
    this.elements.hostInput.type = 'text';
    this.elements.hostInput.id = 'proxy-host';
    this.elements.hostInput.placeholder = '例如: 127.0.0.1 或 proxy.example.com';
    this.elements.hostInput.value = proxySettings.host || '';

    // 添加实时验证
    this.elements.hostInput.addEventListener('input', () => {
      this.scheduleValidation('host', this.elements.hostInput);
    });

    hostFormGroup.appendChild(hostLabel);
    hostFormGroup.appendChild(this.elements.hostInput);

    // 端口输入
    const portFormGroup = document.createElement('div');
    portFormGroup.className = 'form-group';

    const portLabel = document.createElement('label');
    portLabel.textContent = '端口:';
    portLabel.htmlFor = 'proxy-port';

    this.elements.portInput = document.createElement('input');
    this.elements.portInput.type = 'number';
    this.elements.portInput.id = 'proxy-port';
    this.elements.portInput.placeholder = '例如: 8080';
    this.elements.portInput.value = proxySettings.port || '';
    this.elements.portInput.min = '1';
    this.elements.portInput.max = '65535';

    // 添加实时验证
    this.elements.portInput.addEventListener('input', () => {
      this.scheduleValidation('port', this.elements.portInput);
    });

    portFormGroup.appendChild(portLabel);
    portFormGroup.appendChild(this.elements.portInput);

    // 协议选择
    const protocolFormGroup = document.createElement('div');
    protocolFormGroup.className = 'form-group';

    const protocolLabel = document.createElement('label');
    protocolLabel.textContent = '协议类型:';
    protocolLabel.htmlFor = 'proxy-protocol';

    this.elements.protocolSelect = document.createElement('select');
    this.elements.protocolSelect.id = 'proxy-protocol';
    this.elements.protocolSelect.title = 'SOCKS5: 支持v2rayN、Shadowsocks等; SOCKS4: 旧版代理软件; HTTP/HTTPS: HTTP代理服务器';
    this.elements.protocolSelect.innerHTML = `
      <option value="SOCKS5">SOCKS5 (推荐)</option>
      <option value="SOCKS4">SOCKS4</option>
      <option value="SOCKS">SOCKS</option>
      <option value="HTTP">HTTP</option>
      <option value="HTTPS">HTTPS</option>
    `;
    this.elements.protocolSelect.value = proxySettings.protocol || 'SOCKS5';

    protocolFormGroup.appendChild(protocolLabel);
    protocolFormGroup.appendChild(this.elements.protocolSelect);

    // 表单行
    const proxyForm = document.createElement('div');
    proxyForm.className = 'form-row';
    proxyForm.appendChild(hostFormGroup);
    proxyForm.appendChild(portFormGroup);
    proxyForm.appendChild(protocolFormGroup);
    basicSettingsSection.appendChild(proxyForm);

    // 启用代理切换
    const enableGroup = document.createElement('div');
    enableGroup.className = 'form-row';
    enableGroup.style.marginTop = '16px';

    const enableLabel = document.createElement('label');
    enableLabel.textContent = '启用 Socket 代理:';
    enableLabel.htmlFor = 'proxy-enabled';
    enableLabel.style.marginBottom = '0';

    const toggleSwitch = document.createElement('label');
    toggleSwitch.className = 'toggle-switch';

    this.elements.enabledCheckbox = document.createElement('input');
    this.elements.enabledCheckbox.type = 'checkbox';
    this.elements.enabledCheckbox.id = 'proxy-enabled';
    this.elements.enabledCheckbox.checked = !!proxySettings.enabled;

    // 监听启用状态变化
    this.elements.enabledCheckbox.addEventListener('change', () => {
      this.updateFormState();
    });

    const slider = document.createElement('span');
    slider.className = 'slider';

    toggleSwitch.appendChild(this.elements.enabledCheckbox);
    toggleSwitch.appendChild(slider);

    enableGroup.appendChild(enableLabel);
    enableGroup.appendChild(toggleSwitch);
    basicSettingsSection.appendChild(enableGroup);

    formContainer.appendChild(basicSettingsSection);

    // 认证部分
    const authSection = document.createElement('div');
    authSection.className = 'form-section';
    authSection.style.marginTop = '24px';

    // 认证部分的标题
    const authTitle = document.createElement('h3');
    authTitle.className = 'section-title';
    authTitle.textContent = '认证设置';
    authSection.appendChild(authTitle);

    // 启用认证切换
    const authEnableGroup = document.createElement('div');
    authEnableGroup.className = 'form-row';
    authEnableGroup.style.marginTop = '16px';

    const authEnableLabel = document.createElement('label');
    authEnableLabel.textContent = '启用认证:';
    authEnableLabel.htmlFor = 'auth-enabled';
    authEnableLabel.style.marginBottom = '0';

    const authToggleSwitch = document.createElement('label');
    authToggleSwitch.className = 'toggle-switch';

    this.elements.authEnabledCheckbox = document.createElement('input');
    this.elements.authEnabledCheckbox.type = 'checkbox';
    this.elements.authEnabledCheckbox.id = 'auth-enabled';
    this.elements.authEnabledCheckbox.checked = proxySettings.auth ? !!proxySettings.auth.enabled : false;

    // 监听认证开关变化以启用/禁用认证输入框
    this.elements.authEnabledCheckbox.addEventListener('change', () => {
      this.updateAuthFormState();
    });

    const authSlider = document.createElement('span');
    authSlider.className = 'slider';

    authToggleSwitch.appendChild(this.elements.authEnabledCheckbox);
    authToggleSwitch.appendChild(authSlider);

    authEnableGroup.appendChild(authEnableLabel);
    authEnableGroup.appendChild(authToggleSwitch);
    authSection.appendChild(authEnableGroup);

    // 认证用户名和密码输入
    const authForm = document.createElement('div');
    authForm.style.marginTop = '16px';

    // 用户名输入
    const usernameFormGroup = document.createElement('div');
    usernameFormGroup.className = 'form-group';

    const usernameLabel = document.createElement('label');
    usernameLabel.textContent = '用户名:';
    usernameLabel.htmlFor = 'auth-username';

    this.elements.usernameInput = document.createElement('input');
    this.elements.usernameInput.type = 'text';
    this.elements.usernameInput.id = 'auth-username';
    this.elements.usernameInput.placeholder = '输入用户名';
    this.elements.usernameInput.value = proxySettings.auth ? (proxySettings.auth.username || '') : '';

    // 添加实时验证
    this.elements.usernameInput.addEventListener('input', () => {
      this.scheduleValidation('username', this.elements.usernameInput);
    });

    usernameFormGroup.appendChild(usernameLabel);
    usernameFormGroup.appendChild(this.elements.usernameInput);
    authForm.appendChild(usernameFormGroup);

    // 密码输入
    const passwordFormGroup = document.createElement('div');
    passwordFormGroup.className = 'form-group';
    passwordFormGroup.style.marginTop = '16px';

    const passwordLabel = document.createElement('label');
    passwordLabel.textContent = '密码:';
    passwordLabel.htmlFor = 'auth-password';

    this.elements.passwordInput = document.createElement('input');
    this.elements.passwordInput.type = 'password';
    this.elements.passwordInput.id = 'auth-password';
    this.elements.passwordInput.placeholder = '输入密码';
    this.elements.passwordInput.value = proxySettings.auth ? (proxySettings.auth.password || '') : '';

    // 添加实时验证
    this.elements.passwordInput.addEventListener('input', () => {
      this.scheduleValidation('password', this.elements.passwordInput);
    });

    passwordFormGroup.appendChild(passwordLabel);
    passwordFormGroup.appendChild(this.elements.passwordInput);
    authForm.appendChild(passwordFormGroup);

    authSection.appendChild(authForm);
    formContainer.appendChild(authSection);

    // 测试连接按钮
    const testSection = document.createElement('div');
    testSection.className = 'form-section';
    testSection.style.marginTop = '24px';

    const testButton = document.createElement('button');
    testButton.type = 'button';
    testButton.className = 'button button-default';
    testButton.textContent = '测试连接';
    testButton.addEventListener('click', () => {
      this.testProxyConnection();
    });

    testSection.appendChild(testButton);
    formContainer.appendChild(testSection);

    // 保存按钮
    const formActions = document.createElement('div');
    formActions.className = 'form-actions';
    formActions.style.marginTop = '24px';

    this.elements.saveButton = document.createElement('button');
    this.elements.saveButton.type = 'submit';
    this.elements.saveButton.className = 'button button-primary';
    this.elements.saveButton.textContent = '保存设置';

    formActions.appendChild(this.elements.saveButton);
    formContainer.appendChild(formActions);

    // 添加表单到容器
    proxySection.appendChild(formContainer);

    return proxySection;
  }

  /**
   * 安排验证（防抖）
   * @param {string} field - 字段名
   * @param {HTMLElement} input - 输入元素
   */
  scheduleValidation (field, input) {
    // 清除之前的定时器
    if (this.validationTimeouts.has(field)) {
      clearTimeout(this.validationTimeouts.get(field));
    }

    // 设置新的定时器
    const timeoutId = setTimeout(() => {
      this.validateField(field, input);
      this.validationTimeouts.delete(field);
    }, 500);

    this.validationTimeouts.set(field, timeoutId);
  }

  /**
   * 验证单个字段
   * @param {string} field - 字段名
   * @param {HTMLElement} input - 输入元素
   */
  validateField (field, input) {
    const value = input.value.trim();
    let isValid = true;
    let errorMessage = '';

    switch (field) {
      case 'host':
        if (value && !isValidIp(value) && !isValidDomain(value)) {
          isValid = false;
          errorMessage = '请输入有效的IP地址或域名';
        }
        break;
      case 'port':
        if (value && !isValidPort(value)) {
          isValid = false;
          errorMessage = '端口必须是1-65535之间的数字';
        }
        break;
      case 'username':
        if (this.elements.authEnabledCheckbox.checked && this.elements.enabledCheckbox.checked && !value) {
          isValid = false;
          errorMessage = '启用认证时用户名不能为空';
        }
        break;
      case 'password':
        if (this.elements.authEnabledCheckbox.checked && this.elements.enabledCheckbox.checked && !value) {
          isValid = false;
          errorMessage = '启用认证时密码不能为空';
        }
        break;
    }

    // 更新输入框样式
    if (value) {
      if (isValid) {
        input.style.borderColor = 'var(--success-color)';
        input.title = '';
      } else {
        input.style.borderColor = 'var(--error-color)';
        input.title = errorMessage;
      }
    } else {
      input.style.borderColor = '';
      input.title = '';
    }
  }

  /**
   * 测试代理连接
   */
  async testProxyConnection () {
    const host = this.elements.hostInput ? this.elements.hostInput.value.trim() : '';
    const port = this.elements.portInput ? this.elements.portInput.value.trim() : '';

    if (!host || !port) {
      Message.error('请先填写代理主机和端口');
      return;
    }

    if (!isValidIp(host) && !isValidDomain(host)) {
      Message.error('代理主机格式无效');
      return;
    }

    if (!isValidPort(port)) {
      Message.error('代理端口格式无效');
      return;
    }

    try {
      Message.info('正在测试代理连接...');

      // 创建临时代理配置进行验证
      const testConfig = {
        host,
        port,
        enabled: true,
        auth: {
          enabled: this.elements.authEnabledCheckbox.checked,
          username: this.elements.usernameInput.value.trim(),
          password: this.elements.passwordInput.value.trim()
        }
      };

      // 使用ProxyService验证配置
      const validation = ProxyService.validateProxyConfig(testConfig);

      if (validation.valid) {
        Message.success('代理配置验证通过！注意：这只是格式验证，实际连通性需要保存后测试。');
      } else {
        Message.error('代理配置验证失败：' + validation.message);
      }
    } catch (error) {
      console.error('测试代理连接失败:', error);
      Message.error('测试连接失败：' + error.message);
    }
  }

  /**
   * 根据启用状态更新表单
   */
  updateFormState () {
    // 防止在元素不存在时调用
    if (!this.elements || !this.elements.enabledCheckbox) return;

    const enabled = this.elements.enabledCheckbox.checked;

    if (this.elements.hostInput) {
      this.elements.hostInput.disabled = !enabled;
      // 确保字段没有required属性，除非代理启用
      if (enabled) {
        this.elements.hostInput.setAttribute('required', 'required');
      } else {
        this.elements.hostInput.removeAttribute('required');
        this.elements.hostInput.style.borderColor = '';
        this.elements.hostInput.title = '';
      }
    }

    if (this.elements.portInput) {
      this.elements.portInput.disabled = !enabled;
      // 确保字段没有required属性，除非代理启用
      if (enabled) {
        this.elements.portInput.setAttribute('required', 'required');
      } else {
        this.elements.portInput.removeAttribute('required');
        this.elements.portInput.style.borderColor = '';
        this.elements.portInput.title = '';
      }
    }

    if (this.elements.protocolSelect) {
      this.elements.protocolSelect.disabled = !enabled;
      // 确保协议选择没有required属性，除非代理启用
      if (enabled) {
        this.elements.protocolSelect.setAttribute('required', 'required');
      } else {
        this.elements.protocolSelect.removeAttribute('required');
        this.elements.protocolSelect.style.borderColor = '';
        this.elements.protocolSelect.title = '';
      }
    }

    // 启用/禁用认证部分
    if (this.elements.authEnabledCheckbox) {
      this.elements.authEnabledCheckbox.disabled = !enabled;
    }

    // 更新认证输入框状态
    this.updateAuthFormState();
  }

  /**
   * 更新认证表单状态
   */
  updateAuthFormState () {
    // 防止在元素不存在时调用
    if (!this.elements || !this.elements.authEnabledCheckbox || !this.elements.enabledCheckbox) return;

    const authEnabled = this.elements.authEnabledCheckbox.checked && this.elements.enabledCheckbox.checked;

    // 启用/禁用认证输入框
    if (this.elements.usernameInput) {
      this.elements.usernameInput.disabled = !authEnabled;
      // 只有当认证启用时才需要验证
      if (authEnabled) {
        this.elements.usernameInput.setAttribute('required', 'required');
      } else {
        this.elements.usernameInput.removeAttribute('required');
        this.elements.usernameInput.style.borderColor = '';
        this.elements.usernameInput.title = '';
      }
    }

    if (this.elements.passwordInput) {
      this.elements.passwordInput.disabled = !authEnabled;
      // 只有当认证启用时才需要验证
      if (authEnabled) {
        this.elements.passwordInput.setAttribute('required', 'required');
      } else {
        this.elements.passwordInput.removeAttribute('required');
        this.elements.passwordInput.style.borderColor = '';
        this.elements.passwordInput.title = '';
      }
    }
  }

  /**
   * 处理保存代理设置
   */
  async handleSaveProxy () {
    // 防止在元素不存在时调用
    if (!this.elements) {
      console.error('表单元素不存在，无法保存设置');
      return;
    }

    // 防止重复提交
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    // 获取保存按钮引用 - 安全检查
    const saveButton = this.elements.saveButton;
    if (!saveButton) {
      console.error('保存按钮不存在');
      this.isSubmitting = false;
      return;
    }

    try {
      // 禁用保存按钮
      saveButton.disabled = true;
      saveButton.textContent = '保存中...';

      // 安全地获取表单值
      const host = this.elements.hostInput ? this.elements.hostInput.value.trim() : '';
      const port = this.elements.portInput ? this.elements.portInput.value.trim() : '';
      const enabled = this.elements.enabledCheckbox ? this.elements.enabledCheckbox.checked : false;
      const authEnabled = this.elements.authEnabledCheckbox ? this.elements.authEnabledCheckbox.checked : false;
      const username = this.elements.usernameInput ? this.elements.usernameInput.value.trim() : '';
      const password = this.elements.passwordInput ? this.elements.passwordInput.value.trim() : '';
      const protocol = this.elements.protocolSelect ? this.elements.protocolSelect.value : 'SOCKS5';

      // 构建代理配置
      const proxyConfig = {
        host,
        port,
        enabled,
        protocol,
        auth: {
          enabled: authEnabled,
          username,
          password
        }
      };

      // 使用ProxyService验证配置
      const validation = ProxyService.validateProxyConfig(proxyConfig);
      if (!validation.valid) {
        Message.error(validation.message);
        return;
      }

      // 更新代理设置
      const success = await StateService.updateSocketProxy(proxyConfig);

      if (success) {
        // 显示成功消息
        Message.success('代理设置已保存并应用，代理规则已更新');
      } else {
        Message.error('保存代理设置失败，请重试');
      }
    } catch (error) {
      console.error('保存代理设置失败:', error);
      Message.error(`保存设置失败: ${error.message}`);
    } finally {
      // 恢复按钮状态，安全检查
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = '保存设置';
      }
      this.isSubmitting = false;
    }
  }

  /**
   * 更新代理UI
   * @param {Object} proxySettings - 代理设置
   */
  updateProxyUI (proxySettings) {
    // 检查元素是否存在
    if (!this.elements) return;

    try {
      // 更新基本设置 - 添加安全检查
      if (this.elements.hostInput) this.elements.hostInput.value = proxySettings.host || '';
      if (this.elements.portInput) this.elements.portInput.value = proxySettings.port || '';
      if (this.elements.enabledCheckbox) this.elements.enabledCheckbox.checked = !!proxySettings.enabled;

      // 更新认证设置 - 添加安全检查
      if (this.elements.authEnabledCheckbox && proxySettings.auth) {
        this.elements.authEnabledCheckbox.checked = !!proxySettings.auth.enabled;
      }

      if (this.elements.usernameInput && proxySettings.auth) {
        this.elements.usernameInput.value = proxySettings.auth.username || '';
      }

      if (this.elements.passwordInput && proxySettings.auth) {
        this.elements.passwordInput.value = proxySettings.auth.password || '';
      }

      // 更新表单状态
      this.updateFormState();
    } catch (error) {
      console.error('更新代理UI失败:', error);
    }
  }

  /**
   * 渲染错误状态
   * @param {string} message - 错误消息
   */
  renderError (message) {
    // 清空容器
    this.container.innerHTML = '';

    // 创建错误容器
    const errorContainer = document.createElement('div');
    errorContainer.className = 'page-error-container';
    errorContainer.style.textAlign = 'center';
    errorContainer.style.padding = '64px 20px';
    errorContainer.style.color = 'var(--error-dark)';
    errorContainer.style.backgroundColor = 'var(--error-light)';
    errorContainer.style.borderRadius = 'var(--rounded-xl)';

    // 错误图标
    const errorIcon = document.createElement('div');
    errorIcon.style.fontSize = '48px';
    errorIcon.style.marginBottom = '16px';
    errorIcon.innerHTML = '⚠️';
    errorContainer.appendChild(errorIcon);

    // 错误标题
    const errorTitle = document.createElement('h3');
    errorTitle.textContent = '发生错误';
    errorTitle.style.marginBottom = '8px';
    errorContainer.appendChild(errorTitle);

    // 错误消息
    const errorMessage = document.createElement('p');
    errorMessage.textContent = message;
    errorMessage.style.marginBottom = '16px';
    errorContainer.appendChild(errorMessage);

    // 重试按钮
    const retryButton = document.createElement('button');
    retryButton.className = 'button button-primary';
    retryButton.textContent = '重试';
    retryButton.addEventListener('click', () => {
      this.init();
    });
    errorContainer.appendChild(retryButton);

    this.container.appendChild(errorContainer);
  }

  /**
   * 销毁组件
   */
  destroy () {
    try {
      // 取消状态订阅
      if (this.unsubscribe) {
        this.unsubscribe();
      }

      // 清除所有验证定时器
      for (const [field, timeoutId] of this.validationTimeouts.entries()) {
        clearTimeout(timeoutId);
      }
      this.validationTimeouts.clear();

      // 移除表单事件监听器
      if (this.formElement) {
        // 使用克隆替换元素以移除所有事件监听器
        const newForm = this.formElement.cloneNode(true);
        if (this.formElement.parentNode) {
          this.formElement.parentNode.replaceChild(newForm, this.formElement);
        }
        this.formElement = null;
      }

      // 移除elements引用前记录页面是否正在处理提交
      const isSubmitting = this.isSubmitting;

      // 清空元素引用 - 保留一个空对象而不是设为null
      this.elements = {};

      // 如果页面正在提交，显示警告
      if (isSubmitting) {
        console.warn('组件在提交过程中被销毁');
      }
    } catch (error) {
      console.error('销毁代理页面失败:', error);
    }
  }
}