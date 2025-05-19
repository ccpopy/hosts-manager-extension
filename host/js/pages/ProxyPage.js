import StateService from '../services/StateService.js';
import { createNotice } from '../components/Notice.js';
import { Message } from '../utils/MessageUtils.js';

/**
 * 代理页面类
 */
export default class ProxyPage {
  /**
   * 构造函数
   * @param {HTMLElement} container - 页面容器
   */
  constructor(container) {
    this.container = container;

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
    await StateService.initialize();
    await this.render();
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
      '可选配置一个SOCKS代理，用于不匹配hosts规则的请求。支持用户名和密码认证。',
      'info',
      `<svg class="notice-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`
    );
    this.container.appendChild(proxyNotice);

    const proxySection = document.createElement('div');
    proxySection.className = 'proxy-section';

    // 主机输入
    const hostFormGroup = document.createElement('div');
    hostFormGroup.className = 'form-group';

    const hostLabel = document.createElement('label');
    hostLabel.textContent = '代理主机:';

    this.hostInput = document.createElement('input');
    this.hostInput.type = 'text';
    this.hostInput.id = 'proxy-host';
    this.hostInput.placeholder = '例如: 127.0.0.1';
    this.hostInput.value = state.socketProxy.host || '';

    hostFormGroup.appendChild(hostLabel);
    hostFormGroup.appendChild(this.hostInput);

    // 端口输入
    const portFormGroup = document.createElement('div');
    portFormGroup.className = 'form-group';

    const portLabel = document.createElement('label');
    portLabel.textContent = '端口:';

    this.portInput = document.createElement('input');
    this.portInput.type = 'text';
    this.portInput.id = 'proxy-port';
    this.portInput.placeholder = '例如: 8080';
    this.portInput.value = state.socketProxy.port || '';

    portFormGroup.appendChild(portLabel);
    portFormGroup.appendChild(this.portInput);

    // 表单行
    const proxyForm = document.createElement('div');
    proxyForm.className = 'form-row';
    proxyForm.appendChild(hostFormGroup);
    proxyForm.appendChild(portFormGroup);
    proxySection.appendChild(proxyForm);

    // 启用代理切换
    const enableGroup = document.createElement('div');
    enableGroup.className = 'form-row';
    enableGroup.style.marginTop = '16px';

    const enableLabel = document.createElement('label');
    enableLabel.textContent = '启用 Socket 代理:';
    enableLabel.style.marginBottom = '0';

    const toggleSwitch = document.createElement('label');
    toggleSwitch.className = 'toggle-switch';

    this.checkbox = document.createElement('input');
    this.checkbox.type = 'checkbox';
    this.checkbox.id = 'proxy-enabled';
    this.checkbox.checked = !!state.socketProxy.enabled;

    const slider = document.createElement('span');
    slider.className = 'slider';

    toggleSwitch.appendChild(this.checkbox);
    toggleSwitch.appendChild(slider);

    enableGroup.appendChild(enableLabel);
    enableGroup.appendChild(toggleSwitch);
    proxySection.appendChild(enableGroup);

    // 认证部分的标题
    const authTitle = document.createElement('h3');
    authTitle.className = 'section-title';
    authTitle.style.marginTop = '24px';
    authTitle.textContent = '认证设置';
    proxySection.appendChild(authTitle);

    // 启用认证切换
    const authEnableGroup = document.createElement('div');
    authEnableGroup.className = 'form-row';
    authEnableGroup.style.marginTop = '16px';

    const authEnableLabel = document.createElement('label');
    authEnableLabel.textContent = '启用认证:';
    authEnableLabel.style.marginBottom = '0';

    const authToggleSwitch = document.createElement('label');
    authToggleSwitch.className = 'toggle-switch';

    this.authCheckbox = document.createElement('input');
    this.authCheckbox.type = 'checkbox';
    this.authCheckbox.id = 'auth-enabled';
    this.authCheckbox.checked = state.socketProxy.auth ? !!state.socketProxy.auth.enabled : false;

    // 监听认证开关变化以启用/禁用认证输入框
    this.authCheckbox.addEventListener('change', () => {
      this.usernameInput.disabled = !this.authCheckbox.checked;
      this.passwordInput.disabled = !this.authCheckbox.checked;
    });

    const authSlider = document.createElement('span');
    authSlider.className = 'slider';

    authToggleSwitch.appendChild(this.authCheckbox);
    authToggleSwitch.appendChild(authSlider);

    authEnableGroup.appendChild(authEnableLabel);
    authEnableGroup.appendChild(authToggleSwitch);
    proxySection.appendChild(authEnableGroup);

    // 认证用户名和密码输入
    const authForm = document.createElement('div');
    authForm.style.marginTop = '16px';

    // 用户名输入
    const usernameFormGroup = document.createElement('div');
    usernameFormGroup.className = 'form-group';

    const usernameLabel = document.createElement('label');
    usernameLabel.textContent = '用户名:';

    this.usernameInput = document.createElement('input');
    this.usernameInput.type = 'text';
    this.usernameInput.id = 'auth-username';
    this.usernameInput.placeholder = '输入用户名';
    this.usernameInput.value = state.socketProxy.auth ? (state.socketProxy.auth.username || '') : '';
    this.usernameInput.disabled = !this.authCheckbox.checked;

    usernameFormGroup.appendChild(usernameLabel);
    usernameFormGroup.appendChild(this.usernameInput);
    authForm.appendChild(usernameFormGroup);

    // 密码输入
    const passwordFormGroup = document.createElement('div');
    passwordFormGroup.className = 'form-group';
    passwordFormGroup.style.marginTop = '16px';

    const passwordLabel = document.createElement('label');
    passwordLabel.textContent = '密码:';

    this.passwordInput = document.createElement('input');
    this.passwordInput.type = 'password';
    this.passwordInput.id = 'auth-password';
    this.passwordInput.placeholder = '输入密码';
    this.passwordInput.value = state.socketProxy.auth ? (state.socketProxy.auth.password || '') : '';
    this.passwordInput.disabled = !this.authCheckbox.checked;

    passwordFormGroup.appendChild(passwordLabel);
    passwordFormGroup.appendChild(this.passwordInput);
    authForm.appendChild(passwordFormGroup);

    proxySection.appendChild(authForm);

    // 保存代理按钮
    const formActions = document.createElement('div');
    formActions.className = 'form-actions';
    formActions.style.marginTop = '24px';

    const saveProxyBtn = document.createElement('button');
    saveProxyBtn.className = 'button button-primary';
    saveProxyBtn.textContent = '保存设置';
    saveProxyBtn.addEventListener('click', async () => {
      const host = this.hostInput.value.trim();
      const port = this.portInput.value.trim();
      const enabled = this.checkbox.checked;
      const authEnabled = this.authCheckbox.checked;
      const username = this.usernameInput.value.trim();
      const password = this.passwordInput.value.trim();

      // 如果启用了认证，但未提供用户名或密码，则提示错误
      if (authEnabled && (!username || !password)) {
        Message.error('请输入用户名和密码');
        return;
      }

      // 更新代理设置
      await StateService.updateSocketProxy({
        host,
        port,
        enabled,
        auth: {
          enabled: authEnabled,
          username,
          password
        }
      });

      Message.success('设置已保存');
    });

    formActions.appendChild(saveProxyBtn);
    proxySection.appendChild(formActions);
    this.container.appendChild(proxySection);
  }

  /**
   * 更新代理UI
   * @param {Object} proxySettings - 代理设置
   */
  updateProxyUI (proxySettings) {
    if (!this.hostInput || !this.portInput || !this.checkbox ||
      !this.authCheckbox || !this.usernameInput || !this.passwordInput) return;

    this.hostInput.value = proxySettings.host || '';
    this.portInput.value = proxySettings.port || '';
    this.checkbox.checked = !!proxySettings.enabled;

    if (proxySettings.auth) {
      this.authCheckbox.checked = !!proxySettings.auth.enabled;
      this.usernameInput.value = proxySettings.auth.username || '';
      this.passwordInput.value = proxySettings.auth.password || '';
      this.usernameInput.disabled = !proxySettings.auth.enabled;
      this.passwordInput.disabled = !proxySettings.auth.enabled;
    } else {
      this.authCheckbox.checked = false;
      this.usernameInput.value = '';
      this.passwordInput.value = '';
      this.usernameInput.disabled = true;
      this.passwordInput.disabled = true;
    }
  }

  /**
   * 销毁组件时取消订阅
   */
  destroy () {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}