import StorageService from '../services/StorageService.js';
import ProxyService from '../services/ProxyService.js';
import { createNotice } from '../components/Notice.js';
import { showMessage } from '../utils/MessageUtils.js';

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
    this.proxySettings = {
      host: '',
      port: '',
      enabled: false
    };
  }

  /**
   * 初始化页面
   */
  async init () {
    this.proxySettings = await StorageService.getSocketProxy();
    await this.render();
  }

  /**
   * 渲染页面
   */
  async render () {
    this.container.innerHTML = '';

    // 标题
    const proxyTitle = document.createElement('h2');
    proxyTitle.className = 'page-title';
    proxyTitle.textContent = 'Socket 代理设置';
    this.container.appendChild(proxyTitle);

    // 提示信息
    const proxyNotice = createNotice(
      '可选配置一个SOCKS代理，用于不匹配hosts规则的请求。',
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

    const hostInput = document.createElement('input');
    hostInput.type = 'text';
    hostInput.id = 'proxy-host';
    hostInput.placeholder = '例如: 127.0.0.1';
    hostInput.value = this.proxySettings.host || '';

    hostFormGroup.appendChild(hostLabel);
    hostFormGroup.appendChild(hostInput);

    // 端口输入
    const portFormGroup = document.createElement('div');
    portFormGroup.className = 'form-group';

    const portLabel = document.createElement('label');
    portLabel.textContent = '端口:';

    const portInput = document.createElement('input');
    portInput.type = 'text';
    portInput.id = 'proxy-port';
    portInput.placeholder = '例如: 8080';
    portInput.value = this.proxySettings.port || '';

    portFormGroup.appendChild(portLabel);
    portFormGroup.appendChild(portInput);

    // 表单行
    const proxyForm = document.createElement('div');
    proxyForm.className = 'form-row';
    proxyForm.appendChild(hostFormGroup);
    proxyForm.appendChild(portFormGroup);
    proxySection.appendChild(proxyForm);

    // 启用代理切换
    const enableGroup = document.createElement('div');
    enableGroup.className = 'form-row';

    const enableLabel = document.createElement('label');
    enableLabel.textContent = '启用 Socket 代理:';
    enableLabel.style.marginBottom = '0';

    const toggleSwitch = document.createElement('label');
    toggleSwitch.className = 'toggle-switch';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'proxy-enabled';
    checkbox.checked = !!this.proxySettings.enabled;

    const slider = document.createElement('span');
    slider.className = 'slider';

    toggleSwitch.appendChild(checkbox);
    toggleSwitch.appendChild(slider);

    enableGroup.appendChild(enableLabel);
    enableGroup.appendChild(toggleSwitch);
    proxySection.appendChild(enableGroup);

    // 保存代理按钮
    const formActions = document.createElement('div');
    formActions.className = 'form-actions';

    const saveProxyBtn = document.createElement('button');
    saveProxyBtn.className = 'button button-primary';
    saveProxyBtn.textContent = '保存设置';
    saveProxyBtn.addEventListener('click', async () => {
      const host = document.getElementById('proxy-host').value;
      const port = document.getElementById('proxy-port').value;
      const enabled = document.getElementById('proxy-enabled').checked;

      await StorageService.saveSocketProxy({ host, port, enabled });
      await ProxyService.updateProxySettings();

      showMessage(formActions, '设置已保存', 'success');
      this.proxySettings = { host, port, enabled };
    });

    formActions.appendChild(saveProxyBtn);
    proxySection.appendChild(formActions);
    this.container.appendChild(proxySection);
  }
}