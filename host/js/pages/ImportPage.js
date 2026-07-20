import StateService from '../services/StateService.js';
import ProxyService from '../services/ProxyService.js';
import Modal from '../components/Modal.js';
import { createNotice } from '../components/Notice.js';
import { Message } from '../utils/MessageUtils.js';
import { parseHostRule, normalizeHostRule } from '../utils/ValidationUtils.js';

// 预览显示的最大行数
const PREVIEW_MAX_ROWS = 50;

export default class ImportPage {
  constructor(container) {
    this.container = container;
    // 防止重复处理
    this.isProcessing = false;
    // 预览防抖定时器
    this.previewTimeout = null;

    // 订阅状态变化
    this.unsubscribe = StateService.subscribe(state => {
      // 当分组变化时重新渲染
      this.renderGroupSelect(state.hostsGroups);
      this.renderExportGroupSelect(state.hostsGroups);
      this.updateExportProxyHint(state.socketProxy);
    });
  }

  async init () {
    await StateService.initialize();
    await this.render();
  }

  async render () {
    this.container.innerHTML = '';

    const state = StateService.getState();

    // 标题
    const eyebrow = document.createElement('div');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'hosts.d / import-export';
    this.container.appendChild(eyebrow);

    const importTitle = document.createElement('h2');
    importTitle.className = 'page-title';
    importTitle.textContent = 'Hosts 批处理';
    this.container.appendChild(importTitle);

    // 提示信息
    const importNotice = createNotice(
      '批量导入、导出 Hosts 规则。导入支持文本粘贴与文件上传（.txt / .json）；JSON 导出可包含完整分组与 Socket 代理设置，便于在设备之间迁移。',
      'info',
      `<svg class="notice-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`
    );
    this.container.appendChild(importNotice);

    // 导入功能区域
    await this.renderImportSection(state);

    // 导出功能区域
    await this.renderExportSection(state);
  }

  /**
   * 渲染导入功能区域
   */
  async renderImportSection (state) {
    const batchImportSection = document.createElement('div');
    batchImportSection.className = 'batch-import-section';

    const importSectionTitle = document.createElement('h3');
    importSectionTitle.className = 'section-title';
    importSectionTitle.textContent = '导入规则';
    batchImportSection.appendChild(importSectionTitle);

    // 导入方式：分段切换控件
    const methodSegment = document.createElement('div');
    methodSegment.className = 'segmented';
    methodSegment.setAttribute('role', 'tablist');

    this.methodTextButton = document.createElement('button');
    this.methodTextButton.type = 'button';
    this.methodTextButton.className = 'segmented-item active';
    this.methodTextButton.textContent = '文本导入';
    this.methodTextButton.addEventListener('click', () => this.switchImportMethod('text'));

    this.methodFileButton = document.createElement('button');
    this.methodFileButton.type = 'button';
    this.methodFileButton.className = 'segmented-item';
    this.methodFileButton.textContent = '文件导入';
    this.methodFileButton.addEventListener('click', () => this.switchImportMethod('file'));

    methodSegment.appendChild(this.methodTextButton);
    methodSegment.appendChild(this.methodFileButton);
    batchImportSection.appendChild(methodSegment);

    // 文本导入区域
    this.textImportArea = document.createElement('div');
    this.textImportArea.className = 'text-import-area';
    this.renderTextImportArea(state);
    batchImportSection.appendChild(this.textImportArea);

    // 文件导入区域
    this.fileImportArea = document.createElement('div');
    this.fileImportArea.className = 'file-import-area';
    this.fileImportArea.style.display = 'none';
    this.renderFileImportArea(state);
    batchImportSection.appendChild(this.fileImportArea);

    this.container.appendChild(batchImportSection);

    // 设置默认方法
    this.currentImportMethod = 'text';
  }

  /**
   * 渲染文本导入区域
   */
  renderTextImportArea (state) {
    this.textImportArea.innerHTML = '';

    const importInstructions = document.createElement('p');
    importInstructions.className = 'instruction';
    importInstructions.textContent = '每行一条规则，格式为「IP 域名」（IPv6 带端口写作 [IPv6]:端口）。输入后下方会实时预览解析结果：';
    this.textImportArea.appendChild(importInstructions);

    const formatExample = document.createElement('div');
    formatExample.className = 'batch-format-hint';
    formatExample.innerHTML = `
      <code>192.168.1.1 example.com</code><br>
      <code>10.0.0.1 api.example.com</code><br>
      <code>10.0.0.2 *.dev.example.com</code><br>
      <code># 注释行会被忽略</code>
    `;
    this.textImportArea.appendChild(formatExample);

    // 分组选择
    const importGroupSelect = document.createElement('div');
    importGroupSelect.className = 'form-group';
    importGroupSelect.style.marginTop = '20px';

    const groupLabel = document.createElement('label');
    groupLabel.textContent = '导入到分组:';
    importGroupSelect.appendChild(groupLabel);

    this.groupSelect = document.createElement('select');
    this.groupSelect.id = 'import-group-select';
    this.groupSelect.addEventListener('change', () => {
      // 换分组后重复检测结果会变化，刷新预览
      this.renderTextPreview();
    });

    // 渲染分组选项
    this.renderGroupSelect(state.hostsGroups);

    importGroupSelect.appendChild(this.groupSelect);
    this.textImportArea.appendChild(importGroupSelect);

    // 批量导入文本框
    this.batchTextarea = document.createElement('textarea');
    this.batchTextarea.className = 'batch-textarea';
    this.batchTextarea.placeholder = `192.168.1.1 example.com
10.0.0.1 api.example.com
# 这是注释`;

    // 输入时实时刷新预览（防抖）
    this.batchTextarea.addEventListener('input', () => {
      this.schedulePreview();
    });

    this.textImportArea.appendChild(this.batchTextarea);

    // 导入预览区域
    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'import-preview';
    this.previewContainer.style.display = 'none';
    this.textImportArea.appendChild(this.previewContainer);

    // 导入选项
    const importOptions = document.createElement('div');
    importOptions.className = 'import-options';
    importOptions.style.marginTop = '16px';

    // 跳过重复规则选项
    const skipDuplicatesOption = document.createElement('div');
    skipDuplicatesOption.className = 'form-row';
    skipDuplicatesOption.style.alignItems = 'center';

    const skipDuplicatesLabel = document.createElement('label');
    skipDuplicatesLabel.textContent = '跳过重复规则:';
    skipDuplicatesLabel.style.marginBottom = '0';
    skipDuplicatesLabel.style.marginRight = '12px';

    const skipDuplicatesToggle = document.createElement('label');
    skipDuplicatesToggle.className = 'toggle-switch';

    this.skipDuplicatesCheckbox = document.createElement('input');
    this.skipDuplicatesCheckbox.type = 'checkbox';
    this.skipDuplicatesCheckbox.checked = true;

    const skipDuplicatesSlider = document.createElement('span');
    skipDuplicatesSlider.className = 'slider';

    skipDuplicatesToggle.appendChild(this.skipDuplicatesCheckbox);
    skipDuplicatesToggle.appendChild(skipDuplicatesSlider);

    skipDuplicatesOption.appendChild(skipDuplicatesLabel);
    skipDuplicatesOption.appendChild(skipDuplicatesToggle);
    importOptions.appendChild(skipDuplicatesOption);

    this.textImportArea.appendChild(importOptions);

    // 导入按钮
    const importActions = document.createElement('div');
    importActions.className = 'form-actions';

    const clearButton = document.createElement('button');
    clearButton.className = 'button button-default';
    clearButton.textContent = '清空';
    clearButton.addEventListener('click', () => {
      this.batchTextarea.value = '';
      this.hidePreview();
    });

    const importButton = document.createElement('button');
    importButton.className = 'button button-primary';
    importButton.textContent = '导入规则';
    importButton.addEventListener('click', async () => {
      await this.handleTextImport();
    });

    importActions.appendChild(clearButton);
    importActions.appendChild(importButton);
    this.textImportArea.appendChild(importActions);

    // 保存按钮引用（注意与顶部“文本导入”切换按钮区分）
    this.importActionButton = importButton;
    this.clearButton = clearButton;
  }

  /**
   * 安排预览刷新（防抖）
   */
  schedulePreview () {
    if (this.previewTimeout) {
      clearTimeout(this.previewTimeout);
    }
    this.previewTimeout = setTimeout(() => {
      this.renderTextPreview();
    }, 400);
  }

  /**
   * 解析文本框内容，返回预览数据
   * @returns {{rows: Array, stats: Object}}
   */
  analyzeTextRules () {
    const text = this.batchTextarea ? this.batchTextarea.value : '';
    const lines = text.split('\n');

    const state = StateService.getState();
    const selectedGroup = state.hostsGroups.find(g => g.id === this.groupSelect?.value);
    const existingKeys = new Set(
      (selectedGroup?.hosts || []).map(h => `${h.ip}|${h.domain}`)
    );

    const seenInBatch = new Set();
    const rows = [];
    const stats = { valid: 0, invalid: 0, duplicate: 0, skipped: 0 };

    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        if (line) stats.skipped++;
        return;
      }

      const parsed = parseHostRule(line);
      const normalized = parsed ? normalizeHostRule(parsed.ip, parsed.domain) : null;

      if (!normalized) {
        stats.invalid++;
        rows.push({ lineNo: index + 1, status: 'invalid', raw: line });
        return;
      }

      const key = `${normalized.ip}|${normalized.domain}`;
      if (existingKeys.has(key) || seenInBatch.has(key)) {
        stats.duplicate++;
        rows.push({ lineNo: index + 1, status: 'duplicate', ip: normalized.ip, domain: normalized.domain });
      } else {
        stats.valid++;
        rows.push({ lineNo: index + 1, status: 'valid', ip: normalized.ip, domain: normalized.domain });
      }
      seenInBatch.add(key);
    });

    return { rows, stats };
  }

  /**
   * 渲染文本导入预览
   */
  renderTextPreview () {
    if (!this.previewContainer || !this.batchTextarea) return;

    const text = this.batchTextarea.value.trim();
    if (!text) {
      this.hidePreview();
      return;
    }

    const { rows, stats } = this.analyzeTextRules();

    this.previewContainer.innerHTML = '';
    this.previewContainer.style.display = 'block';

    // 头部：统计信息
    const header = document.createElement('div');
    header.className = 'import-preview-header';

    const title = document.createElement('span');
    title.className = 'eyebrow';
    title.textContent = '导入预览';
    header.appendChild(title);

    const chips = document.createElement('div');
    chips.className = 'preview-chips';

    const addChip = (text, cls) => {
      const chip = document.createElement('span');
      chip.className = `status-tag ${cls}`;
      chip.textContent = text;
      chips.appendChild(chip);
    };

    addChip(`将导入 ${stats.valid}`, 'status-tag-success');
    if (stats.duplicate > 0) addChip(`重复 ${stats.duplicate}`, 'status-tag-warning');
    if (stats.invalid > 0) addChip(`无效 ${stats.invalid}`, 'status-tag-error');
    if (stats.skipped > 0) addChip(`注释 ${stats.skipped}`, 'status-tag-default');

    header.appendChild(chips);
    this.previewContainer.appendChild(header);

    // 规则列表
    const table = document.createElement('div');
    table.className = 'preview-table';

    rows.slice(0, PREVIEW_MAX_ROWS).forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = `preview-row preview-${row.status}`;

      const dot = document.createElement('span');
      dot.className = `status-dot dot-${row.status}`;
      rowEl.appendChild(dot);

      const lineNo = document.createElement('span');
      lineNo.className = 'preview-line-no';
      lineNo.textContent = row.lineNo;
      rowEl.appendChild(lineNo);

      if (row.status === 'invalid') {
        const raw = document.createElement('span');
        raw.className = 'preview-raw';
        raw.textContent = row.raw;
        raw.title = row.raw;
        rowEl.appendChild(raw);

        const note = document.createElement('span');
        note.className = 'preview-note';
        note.textContent = '格式无效';
        rowEl.appendChild(note);
      } else {
        const ip = document.createElement('span');
        ip.className = 'preview-ip';
        ip.textContent = row.ip;
        ip.title = row.ip;
        rowEl.appendChild(ip);

        const domain = document.createElement('span');
        domain.className = 'preview-domain';
        domain.textContent = row.domain;
        domain.title = row.domain;
        rowEl.appendChild(domain);

        if (row.status === 'duplicate') {
          const note = document.createElement('span');
          note.className = 'preview-note';
          note.textContent = '重复';
          rowEl.appendChild(note);
        }
      }

      table.appendChild(rowEl);
    });

    this.previewContainer.appendChild(table);

    if (rows.length > PREVIEW_MAX_ROWS) {
      const more = document.createElement('div');
      more.className = 'preview-more';
      more.textContent = `还有 ${rows.length - PREVIEW_MAX_ROWS} 行未显示`;
      this.previewContainer.appendChild(more);
    }

    // 没有可导入内容时禁用导入按钮
    if (this.importActionButton) {
      this.importActionButton.disabled = stats.valid === 0 && stats.duplicate === 0;
    }
  }

  /**
   * 隐藏预览
   */
  hidePreview () {
    if (this.previewContainer) {
      this.previewContainer.style.display = 'none';
      this.previewContainer.innerHTML = '';
    }
    if (this.importActionButton) {
      this.importActionButton.disabled = false;
    }
  }

  /**
   * 渲染文件导入区域
   */
  renderFileImportArea (state) {
    this.fileImportArea.innerHTML = '';

    const fileInstructions = document.createElement('p');
    fileInstructions.className = 'instruction';
    fileInstructions.textContent = '选择要导入的文件。纯文本（.txt）按行解析规则；JSON（.json）可包含完整的分组与 Socket 代理设置。';
    this.fileImportArea.appendChild(fileInstructions);

    // 文件选择区域
    const fileSelectContainer = document.createElement('div');
    fileSelectContainer.className = 'file-select-container';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.txt,.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    const fileSelectText = document.createElement('div');
    fileSelectText.innerHTML = `
      <div class="file-select-icon">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" width="28" height="28">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"></path>
        </svg>
      </div>
      <div class="file-select-text">
        点击选择文件或拖拽文件到此处<br>
        <small>支持 .txt 和 .json 格式</small>
      </div>
    `;

    // 点击事件
    fileSelectContainer.addEventListener('click', () => {
      fileInput.click();
    });

    // 拖拽功能
    fileSelectContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileSelectContainer.classList.add('dragging');
    });

    fileSelectContainer.addEventListener('dragleave', (e) => {
      e.preventDefault();
      fileSelectContainer.classList.remove('dragging');
    });

    fileSelectContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      fileSelectContainer.classList.remove('dragging');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        fileInput.files = files;
        this.handleFileSelect({ target: fileInput });
      }
    });

    fileSelectContainer.appendChild(fileInput);
    fileSelectContainer.appendChild(fileSelectText);
    this.fileImportArea.appendChild(fileSelectContainer);

    // 文件信息显示区域
    this.fileInfoArea = document.createElement('div');
    this.fileInfoArea.className = 'file-info-area';
    this.fileInfoArea.style.marginTop = '16px';
    this.fileInfoArea.style.display = 'none';
    this.fileImportArea.appendChild(this.fileInfoArea);

    // 文件导入选项
    const fileImportOptions = document.createElement('div');
    fileImportOptions.className = 'file-import-options';
    fileImportOptions.style.marginTop = '16px';
    fileImportOptions.style.display = 'none';

    // 导入模式选择
    const importModeContainer = document.createElement('div');
    importModeContainer.className = 'form-group';

    const importModeLabel = document.createElement('label');
    importModeLabel.textContent = '导入模式:';
    importModeContainer.appendChild(importModeLabel);

    this.importModeSelect = document.createElement('select');

    const mergeOption = document.createElement('option');
    mergeOption.value = 'merge';
    mergeOption.textContent = '合并模式 - 更新现有分组，新增缺失分组';

    const replaceOption = document.createElement('option');
    replaceOption.value = 'replace';
    replaceOption.textContent = '替换模式 - 完全替换现有配置';

    const newGroupOption = document.createElement('option');
    newGroupOption.value = 'newGroup';
    newGroupOption.textContent = '新建分组 - 导入到新建分组';

    this.importModeSelect.appendChild(mergeOption);
    this.importModeSelect.appendChild(replaceOption);
    this.importModeSelect.appendChild(newGroupOption);

    importModeContainer.appendChild(this.importModeSelect);
    fileImportOptions.appendChild(importModeContainer);

    // 新建分组名称输入（当选择新建分组时显示）
    this.newGroupNameContainer = document.createElement('div');
    this.newGroupNameContainer.className = 'form-group';
    this.newGroupNameContainer.style.marginTop = '12px';
    this.newGroupNameContainer.style.display = 'none';

    const newGroupNameLabel = document.createElement('label');
    newGroupNameLabel.textContent = '新分组名称:';
    this.newGroupNameContainer.appendChild(newGroupNameLabel);

    this.newGroupNameInput = document.createElement('input');
    this.newGroupNameInput.type = 'text';
    this.newGroupNameInput.placeholder = '输入新分组名称';
    this.newGroupNameContainer.appendChild(this.newGroupNameInput);

    fileImportOptions.appendChild(this.newGroupNameContainer);

    // 监听导入模式变化
    this.importModeSelect.addEventListener('change', () => {
      const showNewGroupName = this.importModeSelect.value === 'newGroup';
      this.newGroupNameContainer.style.display = showNewGroupName ? 'block' : 'none';
    });

    this.fileImportOptions = fileImportOptions;
    this.fileImportArea.appendChild(fileImportOptions);

    // 文件导入按钮
    const fileImportActions = document.createElement('div');
    fileImportActions.className = 'form-actions';
    fileImportActions.style.marginTop = '16px';
    fileImportActions.style.display = 'none';

    const fileImportButton = document.createElement('button');
    fileImportButton.className = 'button button-primary';
    fileImportButton.textContent = '导入文件';
    fileImportButton.addEventListener('click', async () => {
      await this.handleFileImport();
    });

    fileImportActions.appendChild(fileImportButton);
    this.fileImportArea.appendChild(fileImportActions);

    // 保存引用
    this.fileImportActions = fileImportActions;
    this.fileImportButton = fileImportButton;
    this.selectedFile = null;
    this.selectedFileContent = null;
  }

  /**
   * 渲染导出功能区域
   */
  async renderExportSection (state) {
    const exportSection = document.createElement('div');
    exportSection.className = 'batch-import-section';
    exportSection.style.marginTop = '32px';

    const exportSectionTitle = document.createElement('h3');
    exportSectionTitle.className = 'section-title';
    exportSectionTitle.textContent = '导出规则';
    exportSection.appendChild(exportSectionTitle);

    const exportInstructions = document.createElement('p');
    exportInstructions.className = 'instruction';
    exportInstructions.textContent = '选择要导出的分组和格式。JSON 格式可用于完整备份，并可选择把 Socket 代理设置一并导出。';
    exportSection.appendChild(exportInstructions);

    // 导出分组选择
    const exportGroupSelect = document.createElement('div');
    exportGroupSelect.className = 'form-group';
    exportGroupSelect.style.marginTop = '20px';

    const exportGroupLabel = document.createElement('label');
    exportGroupLabel.textContent = '导出分组:';
    exportGroupSelect.appendChild(exportGroupLabel);

    this.exportGroupSelect = document.createElement('select');
    this.exportGroupSelect.id = 'export-group-select';

    // 添加"全部分组"选项
    const allGroupsOption = document.createElement('option');
    allGroupsOption.value = '';
    allGroupsOption.textContent = '全部分组';
    this.exportGroupSelect.appendChild(allGroupsOption);

    // 渲染导出分组选项
    this.renderExportGroupSelect(state.hostsGroups);

    exportGroupSelect.appendChild(this.exportGroupSelect);
    exportSection.appendChild(exportGroupSelect);

    // 导出格式选择
    const exportFormatContainer = document.createElement('div');
    exportFormatContainer.className = 'form-group';
    exportFormatContainer.style.marginTop = '16px';

    const exportFormatLabel = document.createElement('label');
    exportFormatLabel.textContent = '导出格式:';
    exportFormatContainer.appendChild(exportFormatLabel);

    this.exportFormatSelect = document.createElement('select');

    const textFormatOption = document.createElement('option');
    textFormatOption.value = 'text';
    textFormatOption.textContent = '纯文本格式 (.txt) - 仅包含规则';

    const jsonFormatOption = document.createElement('option');
    jsonFormatOption.value = 'json';
    jsonFormatOption.textContent = 'JSON格式 (.json) - 包含完整分组信息';

    this.exportFormatSelect.appendChild(textFormatOption);
    this.exportFormatSelect.appendChild(jsonFormatOption);

    exportFormatContainer.appendChild(this.exportFormatSelect);
    exportSection.appendChild(exportFormatContainer);

    // 导出选项
    const exportOptions = document.createElement('div');
    exportOptions.className = 'export-options';
    exportOptions.style.marginTop = '16px';

    // 包含已禁用规则选项
    const includeDisabledOption = document.createElement('div');
    includeDisabledOption.className = 'form-row';
    includeDisabledOption.style.alignItems = 'center';

    const includeDisabledLabel = document.createElement('label');
    includeDisabledLabel.textContent = '包含已禁用规则:';
    includeDisabledLabel.style.marginBottom = '0';
    includeDisabledLabel.style.marginRight = '12px';

    const includeDisabledToggle = document.createElement('label');
    includeDisabledToggle.className = 'toggle-switch';

    this.includeDisabledCheckbox = document.createElement('input');
    this.includeDisabledCheckbox.type = 'checkbox';
    this.includeDisabledCheckbox.checked = false;

    const includeDisabledSlider = document.createElement('span');
    includeDisabledSlider.className = 'slider';

    includeDisabledToggle.appendChild(this.includeDisabledCheckbox);
    includeDisabledToggle.appendChild(includeDisabledSlider);

    includeDisabledOption.appendChild(includeDisabledLabel);
    includeDisabledOption.appendChild(includeDisabledToggle);
    exportOptions.appendChild(includeDisabledOption);

    // 包含分组标题选项（仅文本格式）
    const includeGroupHeadersOption = document.createElement('div');
    includeGroupHeadersOption.className = 'form-row';
    includeGroupHeadersOption.style.alignItems = 'center';
    includeGroupHeadersOption.style.marginTop = '12px';

    const includeGroupHeadersLabel = document.createElement('label');
    includeGroupHeadersLabel.textContent = '包含分组标题:';
    includeGroupHeadersLabel.style.marginBottom = '0';
    includeGroupHeadersLabel.style.marginRight = '12px';

    const includeGroupHeadersToggle = document.createElement('label');
    includeGroupHeadersToggle.className = 'toggle-switch';

    this.includeGroupHeadersCheckbox = document.createElement('input');
    this.includeGroupHeadersCheckbox.type = 'checkbox';
    this.includeGroupHeadersCheckbox.checked = true;

    const includeGroupHeadersSlider = document.createElement('span');
    includeGroupHeadersSlider.className = 'slider';

    includeGroupHeadersToggle.appendChild(this.includeGroupHeadersCheckbox);
    includeGroupHeadersToggle.appendChild(includeGroupHeadersSlider);

    includeGroupHeadersOption.appendChild(includeGroupHeadersLabel);
    includeGroupHeadersOption.appendChild(includeGroupHeadersToggle);
    exportOptions.appendChild(includeGroupHeadersOption);

    this.includeGroupHeadersOption = includeGroupHeadersOption;

    // 包含 Socket 代理设置选项（始终可见，仅 JSON 格式可用）
    const includeProxyOption = document.createElement('div');
    includeProxyOption.className = 'form-row';
    includeProxyOption.style.alignItems = 'center';
    includeProxyOption.style.marginTop = '12px';

    const includeProxyLabel = document.createElement('label');
    includeProxyLabel.textContent = '包含 Socket 代理设置:';
    includeProxyLabel.style.marginBottom = '0';
    includeProxyLabel.style.marginRight = '12px';

    const includeProxyToggle = document.createElement('label');
    includeProxyToggle.className = 'toggle-switch';

    this.includeProxyCheckbox = document.createElement('input');
    this.includeProxyCheckbox.type = 'checkbox';
    this.includeProxyCheckbox.checked = true;
    // 默认导出格式是纯文本，此时该选项不可用
    this.includeProxyCheckbox.disabled = true;
    this.includeProxyCheckbox.addEventListener('change', () => {
      this.updateExportProxyHint(StateService.getState().socketProxy);
    });

    const includeProxySlider = document.createElement('span');
    includeProxySlider.className = 'slider';

    includeProxyToggle.appendChild(this.includeProxyCheckbox);
    includeProxyToggle.appendChild(includeProxySlider);

    this.includeProxyNote = document.createElement('span');
    this.includeProxyNote.className = 'option-note';
    this.includeProxyNote.textContent = '仅 JSON 格式可用';

    includeProxyOption.appendChild(includeProxyLabel);
    includeProxyOption.appendChild(includeProxyToggle);
    includeProxyOption.appendChild(this.includeProxyNote);
    exportOptions.appendChild(includeProxyOption);

    this.includeProxyOption = includeProxyOption;
    includeProxyOption.classList.add('option-disabled');

    // 代理密码明文提示
    this.exportProxyHint = document.createElement('p');
    this.exportProxyHint.className = 'field-hint export-proxy-hint';
    this.exportProxyHint.style.display = 'none';
    this.exportProxyHint.textContent = '注意：导出文件将以明文包含代理账号密码，请妥善保管。';
    exportOptions.appendChild(this.exportProxyHint);

    exportSection.appendChild(exportOptions);

    // 监听格式变化，控制选项显示
    this.exportFormatSelect.addEventListener('change', () => {
      const isTextFormat = this.exportFormatSelect.value === 'text';
      this.includeGroupHeadersOption.style.display = isTextFormat ? 'flex' : 'none';
      this.includeProxyCheckbox.disabled = isTextFormat;
      this.includeProxyNote.style.display = isTextFormat ? 'inline' : 'none';
      this.includeProxyOption.classList.toggle('option-disabled', isTextFormat);
      this.updateExportProxyHint(StateService.getState().socketProxy);
    });

    // 导出按钮
    const exportActions = document.createElement('div');
    exportActions.className = 'form-actions';

    const exportButton = document.createElement('button');
    exportButton.className = 'button button-primary';
    exportButton.textContent = '导出规则';
    exportButton.addEventListener('click', async () => {
      await this.handleExport();
    });

    exportActions.appendChild(exportButton);
    exportSection.appendChild(exportActions);

    this.container.appendChild(exportSection);

    // 保存导出按钮引用
    this.exportButton = exportButton;
  }

  /**
   * 根据当前状态更新“导出包含代理密码”提示的可见性
   */
  updateExportProxyHint (socketProxy) {
    if (!this.exportProxyHint || !this.includeProxyCheckbox || !this.exportFormatSelect) return;

    const isJson = this.exportFormatSelect.value === 'json';
    const includeProxy = this.includeProxyCheckbox.checked;
    const hasPassword = !!(socketProxy && socketProxy.auth && socketProxy.auth.enabled && socketProxy.auth.password);

    this.exportProxyHint.style.display = isJson && includeProxy && hasPassword ? 'block' : 'none';
  }

  /**
   * 切换导入方法
   */
  switchImportMethod (method) {
    this.currentImportMethod = method;

    const isText = method === 'text';
    this.methodTextButton.classList.toggle('active', isText);
    this.methodFileButton.classList.toggle('active', !isText);
    this.textImportArea.style.display = isText ? 'block' : 'none';
    this.fileImportArea.style.display = isText ? 'none' : 'block';
  }

  /**
   * 处理文件选择
   */
  async handleFileSelect (event) {
    const file = event.target.files[0];
    if (!file) return;

    this.selectedFile = file;

    // 显示文件信息
    this.fileInfoArea.innerHTML = '';
    this.fileInfoArea.style.display = 'block';

    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';

    const fileName = document.createElement('div');
    fileName.className = 'file-info-name';
    fileName.textContent = file.name;

    const fileMeta = document.createElement('div');
    fileMeta.className = 'file-info-meta';
    fileMeta.textContent = `${(file.size / 1024).toFixed(2)} KB · ${file.type || '未知类型'}`;

    fileInfo.appendChild(fileName);
    fileInfo.appendChild(fileMeta);
    this.fileInfoArea.appendChild(fileInfo);

    try {
      // 读取文件内容
      const content = await this.readFileContent(file);
      this.selectedFileContent = content;

      // 检测文件格式并显示预览
      const isJsonFormat = this.detectFileFormat(content);
      await this.showFilePreview(content, isJsonFormat);

      // 显示导入选项
      this.fileImportOptions.style.display = 'block';
      this.fileImportActions.style.display = 'flex';

      // 根据文件格式调整选项
      if (isJsonFormat) {
        this.importModeSelect.disabled = false;
      } else {
        this.importModeSelect.value = 'newGroup';
        this.importModeSelect.disabled = true;
        this.newGroupNameContainer.style.display = 'block';
      }

    } catch (error) {
      Message.error('读取文件失败: ' + error.message);
      this.selectedFile = null;
      this.selectedFileContent = null;
    }
  }

  /**
   * 读取文件内容
   */
  readFileContent (file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }

  /**
   * 检测文件格式
   */
  detectFileFormat (content) {
    try {
      JSON.parse(content);
      return true; // JSON格式
    } catch {
      return false; // 纯文本格式
    }
  }

  /**
   * 显示文件预览
   */
  async showFilePreview (content, isJsonFormat) {
    const previewContainer = document.createElement('div');
    previewContainer.className = 'file-preview';
    previewContainer.style.marginTop = '12px';

    const previewTitle = document.createElement('div');
    previewTitle.className = 'eyebrow';
    previewTitle.textContent = `文件预览 · ${isJsonFormat ? 'JSON' : '纯文本'}`;
    previewTitle.style.marginBottom = '8px';
    previewContainer.appendChild(previewTitle);

    // JSON 文件展示内容摘要，便于导入前确认
    if (isJsonFormat) {
      try {
        const jsonData = JSON.parse(content);
        const groups = Array.isArray(jsonData.hostsGroups) ? jsonData.hostsGroups : [];
        const ruleCount = groups.reduce((sum, g) => sum + (Array.isArray(g.hosts) ? g.hosts.length : 0), 0);

        const summary = document.createElement('div');
        summary.className = 'preview-chips';
        summary.style.marginBottom = '8px';

        const addChip = (text, cls = 'status-tag-default') => {
          const chip = document.createElement('span');
          chip.className = `status-tag ${cls}`;
          chip.textContent = text;
          summary.appendChild(chip);
        };

        addChip(`${groups.length} 个分组`, 'status-tag-success');
        addChip(`${ruleCount} 条规则`, 'status-tag-success');
        if (jsonData.socketProxy) {
          addChip('含 Socket 代理设置', 'status-tag-warning');
        }
        if (jsonData.version) {
          addChip(`v${jsonData.version}`);
        }

        previewContainer.appendChild(summary);
      } catch {
        // 摘要生成失败不影响原文预览
      }
    }

    const previewContent = document.createElement('div');
    previewContent.className = 'file-preview-content';

    if (isJsonFormat) {
      try {
        const jsonData = JSON.parse(content);
        const formatted = JSON.stringify(jsonData, null, 2);
        previewContent.textContent = formatted.substring(0, 1000) + (formatted.length > 1000 ? '\n...' : '');
      } catch {
        previewContent.textContent = '无效的JSON格式';
      }
    } else {
      const lines = content.split('\n');
      const preview = lines.slice(0, 20).join('\n') + (lines.length > 20 ? '\n...' : '');
      previewContent.textContent = preview;
    }

    previewContainer.appendChild(previewContent);
    this.fileInfoArea.appendChild(previewContainer);
  }

  /**
   * 渲染分组选择器
   * @param {Array} groups - 分组数组
   */
  renderGroupSelect (groups) {
    if (!this.groupSelect) return;

    // 保存当前选中的值
    const currentValue = this.groupSelect.value;

    // 清空选项
    this.groupSelect.innerHTML = '';

    if (groups.length === 0) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = '暂无分组，请先创建分组';
      emptyOption.disabled = true;
      this.groupSelect.appendChild(emptyOption);
      return;
    }

    // 添加分组选项
    groups.forEach(group => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = `${group.name} (${group.hosts.length} 条规则)`;
      this.groupSelect.appendChild(option);
    });

    // 如果之前有选中的值且仍然存在，则保持选中
    if (currentValue && groups.some(g => g.id === currentValue)) {
      this.groupSelect.value = currentValue;
    }
  }

  /**
   * 渲染导出分组选择器
   * @param {Array} groups - 分组数组
   */
  renderExportGroupSelect (groups) {
    if (!this.exportGroupSelect) return;

    // 保存当前选中的值
    const currentValue = this.exportGroupSelect.value;

    // 清空除了"全部分组"之外的选项
    while (this.exportGroupSelect.children.length > 1) {
      this.exportGroupSelect.removeChild(this.exportGroupSelect.lastChild);
    }

    if (groups.length === 0) {
      // 禁用导出功能
      this.exportGroupSelect.disabled = true;
      return;
    }

    this.exportGroupSelect.disabled = false;

    // 添加分组选项
    groups.forEach(group => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = `${group.name} (${group.hosts.length} 条规则)`;
      this.exportGroupSelect.appendChild(option);
    });

    // 如果之前有选中的值且仍然存在，则保持选中
    if (currentValue && (currentValue === '' || groups.some(g => g.id === currentValue))) {
      this.exportGroupSelect.value = currentValue;
    }
  }

  /**
   * 处理文本导入
   */
  async handleTextImport () {
    if (this.isProcessing) {
      Message.warning('正在处理中，请稍候...');
      return;
    }

    const rules = this.batchTextarea.value.trim();
    const selectedGroupId = this.groupSelect.value;

    if (!rules) {
      Message.error('请输入要导入的规则');
      return;
    }

    if (!selectedGroupId) {
      Message.error('请选择一个分组');
      return;
    }

    // 有无效规则时先确认
    const { stats } = this.analyzeTextRules();
    if (stats.invalid > 0) {
      const confirmed = await Modal.confirm(
        '存在无效规则',
        `检测到 ${stats.invalid} 条无效规则、${stats.valid} 条有效规则。继续导入将跳过无效规则（可在预览中查看详情）。`,
        { confirmText: '继续导入' }
      );
      if (!confirmed) {
        return;
      }
    }

    this.isProcessing = true;

    try {
      // 禁用按钮并显示处理中状态
      this.setButtonsDisabled(true);
      this.importActionButton.textContent = '导入中...';

      // 获取导入选项
      const options = {
        skipDuplicates: this.skipDuplicatesCheckbox.checked,
        enableRules: true,
        updateProxyImmediately: true
      };

      // 使用ProxyService进行导入
      const result = await ProxyService.parseAndImportRules(rules, selectedGroupId, options);

      if (result.success) {
        // 显示详细的成功消息
        let successMessage = `成功导入 ${result.imported} 条规则`;
        if (result.skipped > 0) {
          successMessage += `，跳过 ${result.skipped} 条`;
        }

        Message.success(successMessage + '，代理规则已更新');

        // 清空文本框
        this.batchTextarea.value = '';
        this.hidePreview();
      } else {
        Message.error(result.message || '导入失败');

        if (result.errors && result.errors.length > 0) {
          console.error('导入错误详情:', result.errors);
        }
      }
    } catch (error) {
      console.error('导入规则失败:', error);
      Message.error('导入规则失败: ' + error.message);
    } finally {
      // 恢复按钮状态
      this.setButtonsDisabled(false);
      this.importActionButton.textContent = '导入规则';
      this.isProcessing = false;
    }
  }

  /**
   * 处理文件导入
   */
  async handleFileImport () {
    if (this.isProcessing || !this.selectedFileContent) {
      Message.warning('请先选择要导入的文件');
      return;
    }

    this.isProcessing = true;

    try {
      this.fileImportButton.disabled = true;
      this.fileImportButton.textContent = '导入中...';

      const importMode = this.importModeSelect.value;
      const isJsonFormat = this.detectFileFormat(this.selectedFileContent);

      let result;

      if (isJsonFormat) {
        // JSON格式导入
        result = await this.importJsonFile(this.selectedFileContent, importMode);
      } else {
        // 纯文本格式导入
        result = await this.importTextFile(this.selectedFileContent, importMode);
      }

      if (result.success) {
        Message.success(result.message);

        // 清除文件选择
        this.clearFileSelection();
      } else {
        Message.error(result.message);
      }

    } catch (error) {
      console.error('文件导入失败:', error);
      Message.error('文件导入失败: ' + error.message);
    } finally {
      this.fileImportButton.disabled = false;
      this.fileImportButton.textContent = '导入文件';
      this.isProcessing = false;
    }
  }

  /**
   * 导入JSON文件
   */
  async importJsonFile (content, importMode) {
    try {
      const data = JSON.parse(content);

      // 验证JSON格式
      if (!this.validateJsonFormat(data)) {
        return { success: false, message: 'JSON格式不正确，缺少必要的字段' };
      }

      const state = StateService.getState();
      let totalImported = 0;
      let totalSkipped = 0;
      let groupsProcessed = 0;

      switch (importMode) {
        case 'merge': {
          // 合并模式：更新现有分组，新增缺失分组
          for (const importGroup of data.hostsGroups || []) {
            const existingGroup = state.hostsGroups.find(g => g.name === importGroup.name);

            if (existingGroup) {
              // 更新现有分组
              const importResult = await this.mergeGroupHosts(existingGroup.id, importGroup.hosts || []);
              totalImported += importResult.imported;
              totalSkipped += importResult.skipped;
              groupsProcessed++;
            } else {
              // 创建新分组
              const newGroup = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: importGroup.name,
                hosts: (importGroup.hosts || []).map(host => ({
                  ...host,
                  id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
                })),
                enabled: true
              };

              const success = await StateService.addGroup(newGroup, true);
              if (success) {
                totalImported += newGroup.hosts.length;
                groupsProcessed++;
              }
            }
          }

          // 文件中带有代理设置时一并应用
          let proxyNote = '';
          if (data.socketProxy) {
            const proxyApplied = await StateService.updateSocketProxy(data.socketProxy);
            proxyNote = proxyApplied ? '，Socket 代理设置已应用' : '，Socket 代理设置应用失败';
          }

          return {
            success: true,
            message: `合并完成：处理 ${groupsProcessed} 个分组，导入 ${totalImported} 条规则，跳过 ${totalSkipped} 条${proxyNote}`
          };
        }

        case 'replace': {
          // 替换模式：完全替换现有配置
          const newGroups = (data.hostsGroups || []).map(group => ({
            ...group,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            hosts: (group.hosts || []).map(host => ({
              ...host,
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
            }))
          }));

          // 替换所有数据
          await chrome.storage.local.set({
            hostsGroups: newGroups,
            activeGroups: newGroups.map(g => g.id),
            socketProxy: data.socketProxy
              ? StateService.normalizeSocketProxyConfig(data.socketProxy)
              : state.socketProxy
          });

          await StateService.forceRefresh();

          const proxyNote = data.socketProxy ? '，Socket 代理设置已替换' : '';
          return {
            success: true,
            message: `替换完成：导入 ${newGroups.length} 个分组，共 ${newGroups.reduce((sum, g) => sum + g.hosts.length, 0)} 条规则${proxyNote}`
          };
        }

        case 'newGroup': {
          // 新建分组模式
          const newGroupName = this.newGroupNameInput.value.trim();
          if (!newGroupName) {
            return { success: false, message: '请输入新分组名称' };
          }

          // 合并所有规则到一个新分组
          const allHosts = [];
          for (const group of data.hostsGroups || []) {
            allHosts.push(...(group.hosts || []));
          }

          const newGroup = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: newGroupName,
            hosts: allHosts.map(host => ({
              ...host,
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
            })),
            enabled: true
          };

          const success = await StateService.addGroup(newGroup, true);
          if (success) {
            const proxyNote = data.socketProxy ? '（该模式不导入 Socket 代理设置）' : '';
            return {
              success: true,
              message: `创建新分组 "${newGroupName}"，导入 ${allHosts.length} 条规则${proxyNote}`
            };
          } else {
            return { success: false, message: '创建分组失败，可能存在同名分组' };
          }
        }
      }

    } catch (error) {
      return { success: false, message: 'JSON解析失败: ' + error.message };
    }
  }

  /**
   * 导入文本文件
   */
  async importTextFile (content, importMode) {
    const newGroupName = this.newGroupNameInput.value.trim();
    if (!newGroupName) {
      return { success: false, message: '请输入新分组名称' };
    }

    // 检查分组名称是否已存在
    const state = StateService.getState();
    const nameExists = state.hostsGroups.some(g => g.name === newGroupName);
    if (nameExists) {
      return { success: false, message: '分组名称已存在，请使用其他名称' };
    }

    // 创建新分组
    const newGroup = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      name: newGroupName,
      hosts: [],
      enabled: true
    };

    const addSuccess = await StateService.addGroup(newGroup, true);
    if (!addSuccess) {
      return { success: false, message: '创建分组失败' };
    }

    // 导入规则到新分组
    const options = {
      skipDuplicates: true,
      enableRules: true,
      updateProxyImmediately: true
    };

    const result = await ProxyService.parseAndImportRules(content, newGroup.id, options);

    if (result.success) {
      return {
        success: true,
        message: `创建新分组 "${newGroupName}"，导入 ${result.imported} 条规则，跳过 ${result.skipped} 条`
      };
    } else {
      // 如果导入失败，删除创建的分组
      await StateService.deleteGroup(newGroup.id);
      return { success: false, message: result.message };
    }
  }

  /**
   * 验证JSON格式
   */
  validateJsonFormat (data) {
    return data &&
      typeof data === 'object' &&
      Array.isArray(data.hostsGroups) &&
      data.hostsGroups.every(group =>
        group.name &&
        Array.isArray(group.hosts)
      );
  }

  /**
   * 合并分组主机规则
   */
  async mergeGroupHosts (groupId, newHosts) {
    let imported = 0;
    let skipped = 0;

    for (const host of newHosts) {
      const normalized = normalizeHostRule(host.ip, host.domain);
      if (normalized) {
        const newHost = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          ip: normalized.ip,
          domain: normalized.domain,
          enabled: host.enabled !== false
        };

        const success = await StateService.addHost(groupId, newHost);
        if (success) {
          imported++;
        } else {
          skipped++; // 可能是重复规则
        }
      } else {
        skipped++;
      }
    }

    return { imported, skipped };
  }

  /**
   * 清除文件选择
   */
  clearFileSelection () {
    this.selectedFile = null;
    this.selectedFileContent = null;
    this.fileInfoArea.style.display = 'none';
    this.fileImportOptions.style.display = 'none';
    this.fileImportActions.style.display = 'none';

    // 重置文件输入
    const fileInput = this.fileImportArea.querySelector('input[type="file"]');
    if (fileInput) {
      fileInput.value = '';
    }
  }

  /**
   * 处理导出
   */
  async handleExport () {
    if (this.isProcessing) {
      Message.warning('正在处理中，请稍候...');
      return;
    }

    this.isProcessing = true;

    try {
      // 禁用导出按钮并显示处理中状态
      this.exportButton.disabled = true;
      this.exportButton.textContent = '导出中...';

      const selectedGroupId = this.exportGroupSelect.value;
      const exportFormat = this.exportFormatSelect.value;

      let exportedContent, fileName, mimeType;

      if (exportFormat === 'json') {
        // JSON格式导出
        const includeProxy = this.includeProxyCheckbox.checked;
        const result = await this.exportAsJson(selectedGroupId, includeProxy);
        exportedContent = result.content;
        fileName = result.fileName;
        mimeType = 'application/json';
      } else {
        // 纯文本格式导出
        const options = {
          includeDisabled: this.includeDisabledCheckbox.checked,
          includeGroupHeaders: this.includeGroupHeadersCheckbox.checked,
          includeComments: true
        };

        exportedContent = await ProxyService.exportRules(selectedGroupId || null, options);

        // 生成文件名
        const timestamp = new Date().toISOString().split('T')[0];
        const groupName = selectedGroupId ?
          this.exportGroupSelect.options[this.exportGroupSelect.selectedIndex].text.split(' (')[0] :
          '全部分组';
        fileName = `hosts-${groupName}-${timestamp}.txt`;
        mimeType = 'text/plain';
      }

      if (exportedContent) {
        // 创建下载链接
        const blob = new Blob([exportedContent], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = fileName;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 清理URL对象
        URL.revokeObjectURL(url);

        Message.success(`规则导出成功！文件已保存为 ${fileName}`);
      } else {
        Message.error('导出规则失败，没有可导出的内容');
      }
    } catch (error) {
      console.error('导出规则失败:', error);
      Message.error('导出规则失败: ' + error.message);
    } finally {
      // 恢复按钮状态
      this.exportButton.disabled = false;
      this.exportButton.textContent = '导出规则';
      this.isProcessing = false;
    }
  }

  /**
   * 导出为JSON格式
   * @param {string} groupId - 分组ID，空表示全部分组
   * @param {boolean} includeProxy - 是否包含 Socket 代理设置
   */
  async exportAsJson (groupId, includeProxy = true) {
    const state = StateService.getState();

    let exportData;
    let fileName;
    const timestamp = new Date().toISOString().split('T')[0];
    const manifest = chrome.runtime.getManifest();

    if (groupId) {
      // 导出单个分组
      const group = state.hostsGroups.find(g => g.id === groupId);
      if (!group) {
        throw new Error('未找到指定的分组');
      }

      exportData = {
        version: `${manifest.version || '1.0.0'}`,
        exportDate: new Date().toISOString(),
        type: 'single-group',
        hostsGroups: [group],
        activeGroups: state.activeGroups.includes(groupId) ? [groupId] : []
      };

      fileName = `hosts-${group.name}-${timestamp}.json`;
    } else {
      // 导出全部分组
      exportData = {
        version: `${manifest.version || '1.0.0'}`,
        exportDate: new Date().toISOString(),
        type: 'full-config',
        hostsGroups: state.hostsGroups,
        activeGroups: state.activeGroups
      };

      fileName = `hosts-全部分组-${timestamp}.json`;
    }

    // 按需附带 Socket 代理设置
    if (includeProxy) {
      exportData.socketProxy = state.socketProxy;
    }

    return {
      content: JSON.stringify(exportData, null, 2),
      fileName
    };
  }

  /**
   * 设置按钮禁用状态
   * @param {boolean} disabled - 是否禁用
   */
  setButtonsDisabled (disabled) {
    if (this.importActionButton) this.importActionButton.disabled = disabled;
    if (this.clearButton) this.clearButton.disabled = disabled;
    if (this.groupSelect) this.groupSelect.disabled = disabled;
    if (this.batchTextarea) this.batchTextarea.disabled = disabled;
  }

  /**
   * 销毁组件时取消订阅
   */
  destroy () {
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    // 清除预览定时器
    if (this.previewTimeout) {
      clearTimeout(this.previewTimeout);
    }

    // 清空引用
    this.groupSelect = null;
    this.batchTextarea = null;
    this.previewContainer = null;
    this.importActionButton = null;
    this.clearButton = null;
    this.methodTextButton = null;
    this.methodFileButton = null;
    this.exportGroupSelect = null;
    this.exportButton = null;
    this.includeDisabledCheckbox = null;
    this.includeGroupHeadersCheckbox = null;
    this.includeProxyCheckbox = null;
    this.includeProxyNote = null;
    this.exportProxyHint = null;
    this.exportFormatSelect = null;
    this.fileImportButton = null;
    this.importModeSelect = null;
    this.newGroupNameInput = null;
    this.selectedFile = null;
    this.selectedFileContent = null;
  }
}
