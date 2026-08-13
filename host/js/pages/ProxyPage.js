import StateService from '../services/StateService.js';
import ProxyService from '../services/ProxyService.js';
import { createNotice } from '../components/Notice.js';
import Modal from '../components/Modal.js';
import { Message } from '../utils/MessageUtils.js';
import { isValidIpAddress, isValidDomain, isValidPort } from '../utils/ValidationUtils.js';

const EMPTY_PROFILE = {
  id: null,
  name: '',
  host: '',
  port: '',
  protocol: 'SOCKS5',
  auth: {
    enabled: false,
    username: '',
    password: ''
  },
  bypassList: []
};

export default class ProxyPage {
  /**
   * 构造函数
   * @param {HTMLElement} container - 页面容器
   */
  constructor (container) {
    this.container = container;
    this.isSubmitting = false;
    this.isDirty = false;
    this.isCreating = false;
    this.selectedProfileId = null;
    this.store = null;
    this.formElement = null;
    this.initialFormDraft = '';
    this.loadedProfileSignature = '';
    this.validationTimeouts = new Map();

    this.elements = {};
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);

    this.unsubscribe = StateService.subscribe(state => {
      this.handleStoreUpdate(state);
    });
  }

  /**
   * 初始化页面
   */
  async init () {
    try {
      await StateService.initialize();
      window.addEventListener('beforeunload', this.handleBeforeUnload);
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
    this.store = this.getProxyStore(StateService.getState());
    this.selectedProfileId = this.store.activeProfileId || null;
    this.container.innerHTML = '';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'hosts.d / proxy';
    this.container.appendChild(eyebrow);

    const proxyTitle = document.createElement('h2');
    proxyTitle.className = 'page-title';
    proxyTitle.textContent = 'Socket 代理设置';
    this.container.appendChild(proxyTitle);

    const proxyNotice = createNotice(
      '可以保存多套代理配置，并在需要时快速切换。当前选中的配置会处理所有未命中 hosts 规则的流量；全局开关关闭时，配置仍会保留且可以继续编辑。',
      'info',
      `<svg class="notice-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`
    );
    this.container.appendChild(proxyNotice);

    this.container.appendChild(this.createGlobalControl());

    const workspace = document.createElement('div');
    workspace.className = 'proxy-workspace';
    workspace.appendChild(this.createProfilePanel());

    this.elements.editorRegion = document.createElement('section');
    this.elements.editorRegion.className = 'proxy-editor';
    workspace.appendChild(this.elements.editorRegion);
    this.container.appendChild(workspace);

    this.renderProfileList();
    const activeProfile = this.findProfile(this.selectedProfileId);
    if (activeProfile) {
      this.loadProfile(activeProfile);
    } else {
      this.renderEmptyEditor();
    }
  }

  /**
   * 从状态中读取代理配置仓库。兼容迁移完成前的旧状态，避免页面空白。
   * @param {Object} state - 全局状态
   * @returns {Object} 规范化后的配置仓库
   */
  getProxyStore (state) {
    if (state && state.socketProxyStore && Array.isArray(state.socketProxyStore.profiles)) {
      const profiles = state.socketProxyStore.profiles.map(profile => this.normalizeProfile(profile));
      const activeExists = profiles.some(profile => profile.id === state.socketProxyStore.activeProfileId);
      return {
        ...state.socketProxyStore,
        enabled: !!state.socketProxyStore.enabled,
        activeProfileId: activeExists ? state.socketProxyStore.activeProfileId : null,
        profiles
      };
    }

    const legacy = state && state.socketProxy ? state.socketProxy : {};
    const fallback = this.normalizeProfile({
      ...legacy,
      id: 'default',
      name: '默认代理'
    });
    return {
      schemaVersion: 2,
      enabled: !!legacy.enabled,
      activeProfileId: fallback.id,
      profiles: [fallback]
    };
  }

  /**
   * 规范化配置，防止缺失字段导致表单渲染异常。
   * @param {Object} profile - 原始配置
   * @returns {Object} 配置副本
   */
  normalizeProfile (profile = {}) {
    return {
      ...EMPTY_PROFILE,
      ...profile,
      id: profile.id || null,
      name: typeof profile.name === 'string' ? profile.name : '',
      host: typeof profile.host === 'string' ? profile.host : '',
      port: profile.port === undefined || profile.port === null ? '' : String(profile.port),
      protocol: profile.protocol || 'SOCKS5',
      auth: {
        ...EMPTY_PROFILE.auth,
        ...(profile.auth || {})
      },
      bypassList: Array.isArray(profile.bypassList) ? [...profile.bypassList] : []
    };
  }

  /**
   * 创建全局开关区域。
   * @returns {HTMLElement} 全局控制栏
   */
  createGlobalControl () {
    const control = document.createElement('section');
    control.className = 'proxy-global-control';

    const copy = document.createElement('div');
    copy.className = 'proxy-global-copy';

    const label = document.createElement('div');
    label.className = 'proxy-global-title';
    label.textContent = '全局 Socket 代理';
    copy.appendChild(label);

    this.elements.globalStatus = document.createElement('p');
    this.elements.globalStatus.className = 'proxy-global-status';
    copy.appendChild(this.elements.globalStatus);

    const switchLabel = document.createElement('label');
    switchLabel.className = 'toggle-switch proxy-global-switch';
    switchLabel.title = '启用或关闭当前代理配置';

    this.elements.globalEnabledCheckbox = document.createElement('input');
    this.elements.globalEnabledCheckbox.type = 'checkbox';
    this.elements.globalEnabledCheckbox.checked = !!this.store.enabled;
    this.elements.globalEnabledCheckbox.setAttribute('aria-label', '启用全局 Socket 代理');
    this.elements.globalEnabledCheckbox.addEventListener('change', () => this.handleGlobalToggle());

    const slider = document.createElement('span');
    slider.className = 'slider';
    switchLabel.appendChild(this.elements.globalEnabledCheckbox);
    switchLabel.appendChild(slider);

    control.appendChild(copy);
    control.appendChild(switchLabel);
    this.updateGlobalControl();
    return control;
  }

  /**
   * 创建配置列表面板。
   * @returns {HTMLElement} 配置面板
   */
  createProfilePanel () {
    const panel = document.createElement('aside');
    panel.className = 'proxy-profile-panel';

    const header = document.createElement('div');
    header.className = 'proxy-profile-panel-header';

    const titleWrap = document.createElement('div');
    const eyebrow = document.createElement('div');
    eyebrow.className = 'proxy-panel-eyebrow';
    eyebrow.textContent = 'PROFILES';
    titleWrap.appendChild(eyebrow);

    this.elements.profileCount = document.createElement('div');
    this.elements.profileCount.className = 'proxy-profile-count';
    titleWrap.appendChild(this.elements.profileCount);

    this.elements.addProfileButton = document.createElement('button');
    this.elements.addProfileButton.type = 'button';
    this.elements.addProfileButton.className = 'icon-button proxy-add-profile-button';
    this.elements.addProfileButton.title = '新建代理配置';
    this.elements.addProfileButton.setAttribute('aria-label', '新建代理配置');
    this.elements.addProfileButton.innerHTML = `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      </svg>`;
    this.elements.addProfileButton.addEventListener('click', () => this.handleStartCreate());

    header.appendChild(titleWrap);
    header.appendChild(this.elements.addProfileButton);

    this.elements.profileList = document.createElement('div');
    this.elements.profileList.className = 'proxy-profile-list';
    this.elements.profileList.setAttribute('role', 'list');

    const hint = document.createElement('p');
    hint.className = 'proxy-profile-panel-hint';
    hint.textContent = '选择配置会立即将它设为当前代理。';

    panel.appendChild(header);
    panel.appendChild(this.elements.profileList);
    panel.appendChild(hint);
    return panel;
  }

  /**
   * 更新配置列表。
   */
  renderProfileList () {
    if (!this.elements.profileList || !this.store) return;

    this.elements.profileList.innerHTML = '';
    this.elements.profileCount.textContent = `${this.store.profiles.length} 套配置`;

    if (this.store.profiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'proxy-profile-list-empty';
      empty.textContent = '还没有保存的配置';
      this.elements.profileList.appendChild(empty);
      return;
    }

    this.store.profiles.forEach(profile => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'proxy-profile-item';
      item.dataset.profileId = profile.id;
      item.setAttribute('role', 'listitem');
      item.setAttribute('aria-current', profile.id === this.store.activeProfileId ? 'true' : 'false');

      if (profile.id === this.store.activeProfileId) item.classList.add('active');
      if (!this.isCreating && profile.id === this.selectedProfileId) item.classList.add('editing');

      const itemMain = document.createElement('span');
      itemMain.className = 'proxy-profile-item-main';

      const name = document.createElement('span');
      name.className = 'proxy-profile-name';
      name.textContent = profile.name || '未命名配置';
      itemMain.appendChild(name);

      const endpoint = document.createElement('span');
      endpoint.className = 'proxy-profile-endpoint';
      endpoint.textContent = profile.host && profile.port
        ? `${profile.protocol} · ${profile.host}:${profile.port}`
        : '尚未完成配置';
      itemMain.appendChild(endpoint);
      item.appendChild(itemMain);

      if (profile.id === this.store.activeProfileId) {
        const badge = document.createElement('span');
        badge.className = 'proxy-active-badge';
        badge.textContent = '当前';
        item.appendChild(badge);
      }

      item.addEventListener('click', () => this.handleSelectProfile(profile.id));
      this.elements.profileList.appendChild(item);
    });
  }

  /**
   * 加载配置到编辑器。
   * @param {Object} profile - 要编辑的配置
   * @param {Object} options - 渲染选项
   */
  loadProfile (profile, options = {}) {
    const normalized = this.normalizeProfile(profile);
    this.isCreating = !!options.creating;
    this.selectedProfileId = this.isCreating ? null : normalized.id;
    this.isDirty = false;
    this.loadedProfileSignature = this.getProfileSignature(normalized);
    this.renderEditor(normalized);
    this.renderProfileList();
  }

  /**
   * 渲染配置编辑器。
   * @param {Object} profile - 配置数据
   */
  renderEditor (profile) {
    if (!this.elements.editorRegion) return;

    this.elements.editorRegion.innerHTML = `
      <div class="proxy-editor-header">
        <div>
          <div class="proxy-panel-eyebrow">${this.isCreating ? 'NEW PROFILE' : 'EDIT PROFILE'}</div>
          <h3 class="proxy-editor-title">${this.isCreating ? '新建代理配置' : '编辑代理配置'}</h3>
        </div>
        <span class="proxy-edit-status" aria-live="polite"></span>
      </div>
      <form class="proxy-form" novalidate>
        <div class="form-section proxy-form-section">
          <h3 class="section-title">配置名称</h3>
          <div class="form-group">
            <label for="proxy-profile-name">名称:</label>
            <input type="text" id="proxy-profile-name" maxlength="50" autocomplete="off" placeholder="例如: 公司网络、家庭代理">
          </div>
        </div>

        <div class="form-section proxy-form-section">
          <h3 class="section-title">代理服务器</h3>
          <div class="form-row proxy-server-row">
            <div class="form-group proxy-host-group">
              <label for="proxy-host">代理主机:</label>
              <input type="text" id="proxy-host" placeholder="例如: 127.0.0.1 或 proxy.example.com">
            </div>
            <div class="form-group proxy-port-group">
              <label for="proxy-port">端口:</label>
              <input type="number" id="proxy-port" min="1" max="65535" placeholder="例如: 8080">
            </div>
            <div class="form-group proxy-protocol-group">
              <label for="proxy-protocol">协议类型:</label>
              <select id="proxy-protocol" title="SOCKS5: 支持 v2rayN、Shadowsocks 等；SOCKS4: 旧版代理软件；HTTP/HTTPS: HTTP 代理服务器">
                <option value="SOCKS5">SOCKS5 (推荐)</option>
                <option value="SOCKS4">SOCKS4</option>
                <option value="SOCKS">SOCKS</option>
                <option value="HTTP">HTTP</option>
                <option value="HTTPS">HTTPS</option>
              </select>
            </div>
          </div>
        </div>

        <div class="form-section proxy-form-section">
          <h3 class="section-title">认证设置</h3>
          <p class="field-hint proxy-auth-hint"></p>
          <div class="form-row proxy-toggle-row">
            <label for="auth-enabled">启用认证:</label>
            <label class="toggle-switch">
              <input type="checkbox" id="auth-enabled">
              <span class="slider"></span>
            </label>
          </div>
          <div class="proxy-auth-fields">
            <div class="form-group">
              <label for="auth-username">用户名:</label>
              <input type="text" id="auth-username" autocomplete="username" placeholder="输入用户名">
            </div>
            <div class="form-group">
              <label for="auth-password">密码:</label>
              <input type="password" id="auth-password" autocomplete="current-password" placeholder="输入密码">
            </div>
          </div>
        </div>

        <div class="form-section proxy-form-section">
          <h3 class="section-title">直连白名单</h3>
          <p class="field-hint">命中下列域名或 IP 时不经过 Socket 代理（支持 *.example.com），一行一条规则。</p>
          <div class="form-group">
            <label for="proxy-bypass-list">不走代理的规则:</label>
            <textarea id="proxy-bypass-list" rows="6" placeholder="例如：&#10;localhost&#10;*.internal.test&#10;10.0.0.1&#10;api.local"></textarea>
          </div>
          <div class="field-hint proxy-bypass-footer"><span class="proxy-bypass-counter">0 条规则</span></div>
        </div>

        <div class="form-section proxy-form-section">
          <h3 class="section-title">连接测试</h3>
          <div class="form-row proxy-test-row">
            <div class="form-group">
              <label for="test-url">测试地址:</label>
              <input type="text" id="test-url" value="google.com" placeholder="输入要测试的域名">
            </div>
            <button type="button" class="button button-default proxy-test-button">测试连接</button>
          </div>
        </div>

        <div class="form-actions proxy-form-actions">
          <button type="button" class="button button-danger button-small proxy-delete-button">删除配置</button>
          <span class="proxy-actions-spacer"></span>
          <button type="button" class="button button-default proxy-reset-button">${this.isCreating ? '取消' : '撤销更改'}</button>
          <button type="submit" class="button button-primary proxy-save-button">${this.isCreating ? '创建配置' : '保存更改'}</button>
        </div>
      </form>`;

    this.formElement = this.elements.editorRegion.querySelector('.proxy-form');
    this.elements.profileNameInput = this.formElement.querySelector('#proxy-profile-name');
    this.elements.hostInput = this.formElement.querySelector('#proxy-host');
    this.elements.portInput = this.formElement.querySelector('#proxy-port');
    this.elements.protocolSelect = this.formElement.querySelector('#proxy-protocol');
    this.elements.authEnabledCheckbox = this.formElement.querySelector('#auth-enabled');
    this.elements.usernameInput = this.formElement.querySelector('#auth-username');
    this.elements.passwordInput = this.formElement.querySelector('#auth-password');
    this.elements.bypassInput = this.formElement.querySelector('#proxy-bypass-list');
    this.elements.bypassCounter = this.formElement.querySelector('.proxy-bypass-counter');
    this.elements.testUrlInput = this.formElement.querySelector('#test-url');
    this.elements.authHint = this.formElement.querySelector('.proxy-auth-hint');
    this.elements.saveButton = this.formElement.querySelector('.proxy-save-button');
    this.elements.resetButton = this.formElement.querySelector('.proxy-reset-button');
    this.elements.deleteButton = this.formElement.querySelector('.proxy-delete-button');
    this.elements.editStatus = this.elements.editorRegion.querySelector('.proxy-edit-status');

    this.elements.profileNameInput.value = profile.name || '';
    this.elements.hostInput.value = profile.host || '';
    this.elements.portInput.value = profile.port || '';
    this.elements.protocolSelect.value = profile.protocol || 'SOCKS5';
    this.elements.authEnabledCheckbox.checked = !!profile.auth.enabled;
    this.elements.usernameInput.value = profile.auth.username || '';
    this.elements.passwordInput.value = profile.auth.password || '';
    this.elements.bypassInput.value = (profile.bypassList || []).join('\n');

    const trackedFields = [
      this.elements.profileNameInput,
      this.elements.hostInput,
      this.elements.portInput,
      this.elements.protocolSelect,
      this.elements.authEnabledCheckbox,
      this.elements.usernameInput,
      this.elements.passwordInput,
      this.elements.bypassInput
    ];
    trackedFields.forEach(field => {
      field.addEventListener('input', () => this.syncDirtyState());
      field.addEventListener('change', () => this.syncDirtyState());
    });

    this.elements.hostInput.addEventListener('input', () => this.scheduleValidation('host', this.elements.hostInput));
    this.elements.portInput.addEventListener('input', () => this.scheduleValidation('port', this.elements.portInput));
    this.elements.usernameInput.addEventListener('input', () => this.scheduleValidation('username', this.elements.usernameInput));
    this.elements.passwordInput.addEventListener('input', () => this.scheduleValidation('password', this.elements.passwordInput));
    this.elements.bypassInput.addEventListener('input', () => {
      this.updateBypassCounter();
      this.scheduleValidation('bypass', this.elements.bypassInput);
    });
    this.elements.authEnabledCheckbox.addEventListener('change', () => this.updateAuthFormState());
    this.elements.protocolSelect.addEventListener('change', () => this.updateAuthProtocolHint());

    this.formElement.addEventListener('submit', event => {
      event.preventDefault();
      this.handleSaveProfile();
    });
    this.formElement.querySelector('.proxy-test-button').addEventListener('click', () => this.testProxyConnection());
    this.elements.resetButton.addEventListener('click', () => this.handleResetProfile());
    this.elements.deleteButton.addEventListener('click', () => this.handleDeleteProfile());

    this.elements.deleteButton.hidden = this.isCreating;
    this.updateAuthFormState();
    this.updateAuthProtocolHint();
    this.updateBypassCounter();
    this.initialFormDraft = this.captureFormDraft();
    this.updateDirtyIndicator();

    if (this.isCreating) {
      setTimeout(() => this.elements.profileNameInput && this.elements.profileNameInput.focus(), 0);
    }
  }

  /**
   * 渲染没有配置时的引导。
   */
  renderEmptyEditor () {
    this.formElement = null;
    this.isCreating = false;
    this.isDirty = false;
    this.selectedProfileId = null;
    this.elements.editorRegion.innerHTML = `
      <div class="proxy-empty-editor">
        <div class="proxy-empty-mark" aria-hidden="true">proxy</div>
        <h3>还没有代理配置</h3>
        <p>新建一套配置后，即可在设置页和扩展弹窗中快速切换。</p>
        <button type="button" class="button button-primary">新建配置</button>
      </div>`;
    this.elements.editorRegion.querySelector('button').addEventListener('click', () => this.handleStartCreate());
    this.renderProfileList();
  }

  /**
   * 切换当前配置。
   * @param {string} profileId - 配置 ID
   */
  async handleSelectProfile (profileId) {
    if (!profileId || (
      !this.isCreating &&
      profileId === this.selectedProfileId &&
      profileId === this.store.activeProfileId
    )) return;
    if (!(await this.confirmDiscardChanges('切换配置'))) return;

    const previousDirty = this.isDirty;
    const previousCreating = this.isCreating;
    this.isDirty = false;
    this.isCreating = false;

    try {
      const result = await StateService.selectSocketProxyProfile(profileId);
      if (!result) throw new Error('未能切换配置');

      this.store = this.getProxyStore(StateService.getState());
      const profile = this.findProfile(profileId) || this.findProfile(this.store.activeProfileId);
      if (profile) this.loadProfile(profile);
      this.showMutationResult(result, `已切换到「${profile ? profile.name : '所选配置'}」`);
    } catch (error) {
      this.isDirty = previousDirty;
      this.isCreating = previousCreating;
      console.error('切换代理配置失败:', error);
      Message.error(`切换配置失败: ${error.message}`);
      this.updateDirtyIndicator();
    }
  }

  /**
   * 进入新建模式。
   */
  async handleStartCreate () {
    if (this.isCreating) {
      if (this.elements.profileNameInput) this.elements.profileNameInput.focus();
      return;
    }
    if (!(await this.confirmDiscardChanges('新建配置'))) return;
    this.loadProfile(EMPTY_PROFILE, { creating: true });
  }

  /**
   * 保存新配置或当前配置。
   */
  async handleSaveProfile () {
    if (this.isSubmitting || !this.formElement) return;

    const profile = this.collectProfileFromForm();
    const validationMessage = this.validateProfile(profile);
    if (validationMessage) {
      Message.error(validationMessage);
      return;
    }

    const duplicate = this.store.profiles.find(item =>
      item.id !== this.selectedProfileId &&
      item.name.trim().toLocaleLowerCase() === profile.name.toLocaleLowerCase()
    );
    if (duplicate) {
      Message.error('配置名称不能重复');
      this.elements.profileNameInput.focus();
      return;
    }

    this.isSubmitting = true;
    this.elements.saveButton.disabled = true;
    this.elements.saveButton.textContent = this.isCreating ? '创建中...' : '保存中...';

    try {
      const creating = this.isCreating;
      let result;
      if (creating) {
        result = await StateService.addSocketProxyProfile(profile);
        if (!result) throw new Error('未能创建配置');
      } else {
        result = await StateService.updateSocketProxyProfile(this.selectedProfileId, profile);
        if (!result) throw new Error('未能保存配置');
      }

      this.isDirty = false;
      this.isCreating = false;
      this.store = this.getProxyStore(StateService.getState());

      let savedId = this.selectedProfileId;
      if (creating) {
        savedId = result.id;
        if (!savedId) throw new Error('配置已创建，但未返回配置 ID');
        if (savedId && this.store.activeProfileId !== savedId) {
          const selected = await StateService.selectSocketProxyProfile(savedId);
          if (!selected) throw new Error('配置已创建，但未能设为当前配置');
          result = selected;
          this.store = this.getProxyStore(StateService.getState());
        }
      }

      const savedProfile = this.findProfile(savedId || this.store.activeProfileId);
      if (savedProfile) this.loadProfile(savedProfile);
      else await this.render();

      this.showMutationResult(result, creating ? '代理配置已创建并设为当前配置' : '代理配置已保存');
    } catch (error) {
      console.error('保存代理配置失败:', error);
      Message.error(`保存配置失败: ${error.message}`);
    } finally {
      this.isSubmitting = false;
      if (this.elements.saveButton) {
        this.elements.saveButton.disabled = false;
        this.elements.saveButton.textContent = this.isCreating ? '创建配置' : '保存更改';
      }
    }
  }

  /**
   * 删除当前配置。
   */
  async handleDeleteProfile () {
    if (this.isCreating) {
      this.handleResetProfile();
      return;
    }

    const profile = this.findProfile(this.selectedProfileId);
    if (!profile) return;

    const isCurrent = profile.id === this.store.activeProfileId;
    const suffix = isCurrent && this.store.enabled
      ? '删除后代理会关闭，其他配置仍会保留，需重新选择后再启用。'
      : '此操作不会删除其他配置。';
    const confirmed = await Modal.confirm(
      '删除代理配置',
      `确定删除「${profile.name || '未命名配置'}」吗？${this.isDirty ? '未保存的修改也会丢失。' : ''}${suffix}`,
      { confirmText: '删除配置', danger: true }
    );
    if (!confirmed) return;

    try {
      const result = await StateService.deleteSocketProxyProfile(profile.id);
      if (!result) throw new Error('未能删除配置');

      this.isDirty = false;
      this.store = this.getProxyStore(StateService.getState());
      const nextProfile = this.findProfile(this.store.activeProfileId) || this.store.profiles[0];
      if (nextProfile) this.loadProfile(nextProfile);
      else this.renderEmptyEditor();
      this.showMutationResult(result, '代理配置已删除');
    } catch (error) {
      console.error('删除代理配置失败:', error);
      Message.error(`删除配置失败: ${error.message}`);
    }
  }

  /**
   * 撤销编辑或退出新建模式。
   */
  handleResetProfile () {
    this.store = this.getProxyStore(StateService.getState());
    const profile = this.findProfile(this.isCreating ? this.store.activeProfileId : this.selectedProfileId);
    if (profile) this.loadProfile(profile);
    else this.renderEmptyEditor();
  }

  /**
   * 即时切换全局代理开关。
   */
  async handleGlobalToggle () {
    const checkbox = this.elements.globalEnabledCheckbox;
    if (!checkbox) return;

    const enabled = checkbox.checked;
    if (enabled && (!this.store.activeProfileId || !this.findProfile(this.store.activeProfileId))) {
      checkbox.checked = false;
      Message.warning('请先新建一套代理配置，再启用全局代理');
      return;
    }

    checkbox.disabled = true;
    try {
      const result = await StateService.setSocketProxyEnabled(enabled);
      if (!result) throw new Error('未能更新代理开关');
      this.store = this.getProxyStore(StateService.getState());
      this.updateGlobalControl();
      this.showMutationResult(result, enabled ? 'Socket 代理已启用' : 'Socket 代理已关闭');
    } catch (error) {
      checkbox.checked = !enabled;
      console.error('更新代理开关失败:', error);
      Message.error(`更新代理开关失败: ${error.message}`);
    } finally {
      checkbox.disabled = false;
    }
  }

  /**
   * 处理状态服务推送，避免覆盖未保存的表单。
   * @param {Object} state - 最新状态
   */
  handleStoreUpdate (state) {
    const nextStore = this.getProxyStore(state);
    this.store = nextStore;
    this.updateGlobalControl();
    this.renderProfileList();

    if (!this.elements.editorRegion || this.isSubmitting || this.isCreating || this.isDirty) return;

    const activeProfile = this.findProfile(nextStore.activeProfileId);
    if (!activeProfile) {
      if (nextStore.profiles.length === 0) this.renderEmptyEditor();
      return;
    }

    const signature = this.getProfileSignature(activeProfile);
    if (this.selectedProfileId !== activeProfile.id || signature !== this.loadedProfileSignature) {
      this.loadProfile(activeProfile);
    }
  }

  /**
   * 更新全局开关的文案和状态。
   */
  updateGlobalControl () {
    if (!this.store) return;
    if (this.elements.globalEnabledCheckbox && !this.elements.globalEnabledCheckbox.disabled) {
      this.elements.globalEnabledCheckbox.checked = !!this.store.enabled;
    }
    if (this.elements.globalStatus) {
      const active = this.findProfile(this.store.activeProfileId);
      this.elements.globalStatus.textContent = this.store.enabled
        ? `已启用 · 当前使用「${active ? active.name : '无可用配置'}」`
        : '已关闭 · 浏览器流量将不经过 Socket 代理';
      this.elements.globalStatus.classList.toggle('enabled', !!this.store.enabled);
    }
  }

  /**
   * 展示代理写操作结果。配置可能已经提交，但 Chrome 暂时未能应用 PAC；
   * 此时保留已保存状态并明确提示，不能把写操作当作失败重试。
   * @param {Object} result - 当前写操作的提交/应用结果
   * @param {string} successMessage - 正常成功文案
   */
  showMutationResult (result, successMessage) {
    if (result && result.applied === false) {
      Message.warning(result.warning || '配置已保存，但代理规则暂未应用');
      return;
    }
    Message.success(successMessage);
  }

  /**
   * 返回指定 ID 的配置。
   * @param {string|null} id - 配置 ID
   * @returns {Object|null} 配置
   */
  findProfile (id) {
    if (!this.store || !id) return null;
    return this.store.profiles.find(profile => profile.id === id) || null;
  }

  /**
   * 从表单采集配置。
   * @returns {Object} 配置数据
   */
  collectProfileFromForm () {
    const { rules: bypassList } = ProxyService.normalizeBypassRules(this.elements.bypassInput.value);
    return {
      name: this.elements.profileNameInput.value.trim(),
      host: this.elements.hostInput.value.trim(),
      port: this.elements.portInput.value.trim(),
      protocol: this.elements.protocolSelect.value,
      auth: {
        enabled: this.elements.authEnabledCheckbox.checked,
        username: this.elements.usernameInput.value.trim(),
        password: this.elements.passwordInput.value
      },
      bypassList
    };
  }

  /**
   * 校验完整配置。
   * @param {Object} profile - 待保存配置
   * @returns {string} 错误文案，为空表示通过
   */
  validateProfile (profile) {
    if (!profile.name) return '请输入配置名称';
    if (!profile.host) return '代理主机不能为空';
    if (!isValidIpAddress(profile.host) && !isValidDomain(profile.host)) return '请输入有效的 IP 地址或域名';
    if (!isValidPort(profile.port)) return '端口必须是 1-65535 之间的数字';

    const { invalid } = ProxyService.normalizeBypassRules(this.elements.bypassInput.value);
    if (invalid.length > 0) return `白名单存在无效规则，例如: ${invalid[0]}`;

    const validation = ProxyService.validateProxyConfig({ ...profile, enabled: true });
    return validation.valid ? '' : validation.message;
  }

  /**
   * 表单字段实时验证。
   * @param {string} field - 字段名
   * @param {HTMLElement} input - 输入元素
   */
  scheduleValidation (field, input) {
    if (this.validationTimeouts.has(field)) clearTimeout(this.validationTimeouts.get(field));
    const timeoutId = setTimeout(() => {
      this.validateField(field, input);
      this.validationTimeouts.delete(field);
    }, 500);
    this.validationTimeouts.set(field, timeoutId);
  }

  /**
   * 验证单个字段。
   * @param {string} field - 字段名
   * @param {HTMLElement} input - 输入元素
   */
  validateField (field, input) {
    const value = input.value.trim();
    let isValid = true;
    let errorMessage = '';

    switch (field) {
      case 'host':
        if (value && !isValidIpAddress(value) && !isValidDomain(value)) {
          isValid = false;
          errorMessage = '请输入有效的 IP 地址或域名';
        }
        break;
      case 'port':
        if (value && !isValidPort(value)) {
          isValid = false;
          errorMessage = '端口必须是 1-65535 之间的数字';
        }
        break;
      case 'username':
        if (this.elements.authEnabledCheckbox.checked && !value) {
          isValid = false;
          errorMessage = '启用认证时用户名不能为空';
        }
        break;
      case 'password':
        if (this.elements.authEnabledCheckbox.checked && !value) {
          isValid = false;
          errorMessage = '启用认证时密码不能为空';
        }
        break;
      case 'bypass': {
        const { rules, invalid } = ProxyService.normalizeBypassRules(value);
        if (invalid.length > 0) {
          isValid = false;
          errorMessage = `发现 ${invalid.length} 条无效规则，例如: ${invalid[0]}`;
        } else {
          input.title = `${rules.length} 条白名单规则`;
        }
        break;
      }
    }

    if (value) {
      input.style.borderColor = isValid ? 'var(--success-color)' : 'var(--error-color)';
      input.title = isValid ? '' : errorMessage;
    } else {
      input.style.borderColor = '';
      input.title = '';
    }
  }

  /**
   * 更新认证字段可编辑状态。
   */
  updateAuthFormState () {
    if (!this.elements.authEnabledCheckbox) return;
    const authEnabled = this.elements.authEnabledCheckbox.checked;
    [this.elements.usernameInput, this.elements.passwordInput].forEach(input => {
      if (!input) return;
      input.disabled = !authEnabled;
      input.required = authEnabled;
      if (!authEnabled) {
        input.style.borderColor = '';
        input.title = '';
      }
    });
  }

  /**
   * 根据协议更新认证限制说明。
   */
  updateAuthProtocolHint () {
    if (!this.elements.authHint || !this.elements.protocolSelect) return;
    const supportsAuth = ['HTTP', 'HTTPS'].includes(this.elements.protocolSelect.value);
    this.elements.authHint.textContent = supportsAuth
      ? '账号密码用于自动应答 HTTP/HTTPS 代理的认证质询。'
      : '受 Chrome 限制，SOCKS 代理无法进行账号密码认证；需要认证时请改用 HTTP/HTTPS 协议。';
    this.elements.authHint.classList.toggle('warning', !supportsAuth);
  }

  /**
   * 更新白名单计数。
   */
  updateBypassCounter () {
    if (!this.elements.bypassInput || !this.elements.bypassCounter) return;
    const { rules, invalid } = ProxyService.normalizeBypassRules(this.elements.bypassInput.value);
    const invalidText = invalid.length ? `，${invalid.length} 条无效` : '';
    this.elements.bypassCounter.textContent = `${rules.length} 条规则${invalidText}`;
    this.elements.bypassCounter.style.color = invalid.length ? 'var(--error-color)' : 'var(--gray-600)';
  }

  /**
   * 捕获表单原始值，用于判断是否有未保存更改。
   * @returns {string} 序列化草稿
   */
  captureFormDraft () {
    if (!this.formElement) return '';
    return JSON.stringify({
      name: this.elements.profileNameInput.value,
      host: this.elements.hostInput.value,
      port: this.elements.portInput.value,
      protocol: this.elements.protocolSelect.value,
      authEnabled: this.elements.authEnabledCheckbox.checked,
      username: this.elements.usernameInput.value,
      password: this.elements.passwordInput.value,
      bypass: this.elements.bypassInput.value
    });
  }

  /**
   * 同步未保存状态。
   */
  syncDirtyState () {
    this.isDirty = this.captureFormDraft() !== this.initialFormDraft;
    this.updateDirtyIndicator();
  }

  /**
   * 更新保存按钮与草稿提示。
   */
  updateDirtyIndicator () {
    if (!this.elements.editStatus) return;
    if (this.isDirty) {
      this.elements.editStatus.textContent = '有未保存的更改';
      this.elements.editStatus.classList.add('dirty');
    } else if (this.isCreating) {
      this.elements.editStatus.textContent = '填写后创建';
      this.elements.editStatus.classList.remove('dirty');
    } else {
      this.elements.editStatus.textContent = '已保存';
      this.elements.editStatus.classList.remove('dirty');
    }
    if (this.elements.resetButton) this.elements.resetButton.disabled = !this.isDirty && !this.isCreating;
  }

  /**
   * 在会丢失草稿的操作前确认。
   * @param {string} action - 即将执行的动作
   * @returns {Promise<boolean>} 是否继续
   */
  async confirmDiscardChanges (action) {
    if (!this.isDirty && !this.isCreating) return true;
    return Modal.confirm(
      '放弃未保存的更改',
      `${action}会丢失当前${this.isCreating ? '尚未创建的配置' : '尚未保存的修改'}，是否继续？`,
      { confirmText: '放弃更改', danger: true }
    );
  }

  /**
   * 页面关闭时提示草稿尚未保存。
   * @param {BeforeUnloadEvent} event - 浏览器事件
   */
  handleBeforeUnload (event) {
    if (!this.isDirty && !this.isCreating) return;
    event.preventDefault();
    event.returnValue = '';
  }

  /**
   * 生成稳定的配置签名。
   * @param {Object} profile - 配置
   * @returns {string} 签名
   */
  getProfileSignature (profile) {
    const normalized = this.normalizeProfile(profile);
    return JSON.stringify({
      id: normalized.id,
      name: normalized.name,
      host: normalized.host,
      port: normalized.port,
      protocol: normalized.protocol,
      auth: normalized.auth,
      bypassList: normalized.bypassList
    });
  }

  /**
   * 测试当前配置的连接。
   */
  async testProxyConnection () {
    const host = this.elements.hostInput ? this.elements.hostInput.value.trim() : '';
    const port = this.elements.portInput ? this.elements.portInput.value.trim() : '';
    const testUrl = this.elements.testUrlInput ? this.elements.testUrlInput.value.trim() : 'google.com';

    if (!host || !port) {
      Message.error('请先填写代理主机和端口');
      return;
    }
    if (!isValidIpAddress(host) && !isValidDomain(host)) {
      Message.error('代理主机格式无效');
      return;
    }
    if (!isValidPort(port)) {
      Message.error('代理端口格式无效');
      return;
    }
    if (!testUrl) {
      Message.error('请输入测试地址');
      return;
    }
    if (this.isCreating || this.isDirty || this.selectedProfileId !== this.store.activeProfileId) {
      Message.warning('请先保存并选用当前配置，再测试实际连通性。');
      return;
    }
    if (!this.store.enabled) {
      Message.warning('请先打开全局 Socket 代理开关，再测试实际连通性。');
      return;
    }

    const validation = ProxyService.validateProxyConfig({
      ...this.collectProfileFromForm(),
      enabled: true
    });
    if (!validation.valid) {
      Message.error(`代理配置验证失败：${validation.message}`);
      return;
    }

    let fullTestUrl = testUrl;
    if (!/^https?:\/\//i.test(testUrl)) fullTestUrl = `https://${testUrl}`;

    try {
      Message.info(`正在测试连接 ${testUrl}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        await fetch(fullTestUrl, {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        Message.success('连接测试成功！代理工作正常。');
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          Message.error('连接测试超时（10秒），请检查代理设置或网络连接。');
        } else {
          Message.warning('连接测试完成，但无法确认结果。请在浏览器中访问目标网站验证。');
        }
      }
    } catch (error) {
      console.error('测试代理连接失败:', error);
      Message.error(`测试连接失败：${error.message}`);
    }
  }

  /**
   * 兼容旧页面测试与调用入口。
   * @returns {Promise<void>}
   */
  async handleSaveProxy () {
    return this.handleSaveProfile();
  }

  /**
   * 兼容旧页面调用：多配置模式下仅同步当前编辑器。
   * @param {Object} profile - 最新配置
   */
  updateProxyUI (profile) {
    if (!this.isDirty && !this.isCreating && profile) this.loadProfile(profile);
  }

  /**
   * 兼容旧页面调用：全局关闭不再锁定配置表单。
   */
  updateFormState () {
    this.updateAuthFormState();
  }

  /**
   * 渲染错误状态。
   * @param {string} message - 错误消息
   */
  renderError (message) {
    this.container.innerHTML = '';
    const errorContainer = document.createElement('div');
    errorContainer.className = 'page-error-container';
    errorContainer.innerHTML = `
      <div class="page-error-icon" aria-hidden="true">!</div>
      <h3>发生错误</h3>
      <p></p>
      <button type="button" class="button button-primary">重试</button>`;
    errorContainer.querySelector('p').textContent = message;
    errorContainer.querySelector('button').addEventListener('click', () => this.init());
    this.container.appendChild(errorContainer);
  }

  /**
   * 销毁组件。
   */
  destroy () {
    if (this.unsubscribe) this.unsubscribe();
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    this.validationTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.validationTimeouts.clear();
    this.formElement = null;
    this.elements = {};
  }
}
