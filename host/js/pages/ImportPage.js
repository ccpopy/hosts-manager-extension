import StateService from '../services/StateService.js';
import ProxyService from '../services/ProxyService.js';
import { createNotice } from '../components/Notice.js';
import { Message } from '../utils/MessageUtils.js';
import { parseBatchRules, isValidIp, isValidDomain } from '../utils/ValidationUtils.js';

export default class ImportPage {
  constructor(container) {
    this.container = container;
    // 防止重复处理
    this.isProcessing = false;
    // 验证防抖定时器
    this.validationTimeout = null;

    // 订阅状态变化
    this.unsubscribe = StateService.subscribe(state => {
      // 当分组变化时重新渲染
      this.renderGroupSelect(state.hostsGroups);
      this.renderExportGroupSelect(state.hostsGroups);
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
    const importTitle = document.createElement('h2');
    importTitle.className = 'page-title';
    importTitle.textContent = 'Hosts 批处理';
    this.container.appendChild(importTitle);

    // 提示信息
    const importNotice = createNotice(
      '支持批量导入和导出Hosts规则。导入：支持文本输入和文件上传，可导入纯文本或JSON格式。导出：可选择特定分组或全部分组，支持纯文本和JSON格式。所有操作将立即更新代理规则。',
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

    // 导入方式选择
    const importMethodContainer = document.createElement('div');
    importMethodContainer.className = 'import-method-container';
    importMethodContainer.style.marginBottom = '20px';

    const methodTitle = document.createElement('h4');
    methodTitle.textContent = '导入方式:';
    methodTitle.style.marginBottom = '12px';
    methodTitle.style.fontSize = '14px';
    methodTitle.style.fontWeight = '600';
    importMethodContainer.appendChild(methodTitle);

    // 方式选择按钮组
    const methodButtonGroup = document.createElement('div');
    methodButtonGroup.className = 'method-button-group';
    methodButtonGroup.style.display = 'flex';
    methodButtonGroup.style.gap = '8px';
    methodButtonGroup.style.marginBottom = '16px';

    this.textImportButton = document.createElement('button');
    this.textImportButton.type = 'button';
    this.textImportButton.className = 'button button-primary';
    this.textImportButton.textContent = '文本导入';
    this.textImportButton.addEventListener('click', () => this.switchImportMethod('text'));

    this.fileImportButton = document.createElement('button');
    this.fileImportButton.type = 'button';
    this.fileImportButton.className = 'button button-default';
    this.fileImportButton.textContent = '文件导入';
    this.fileImportButton.addEventListener('click', () => this.switchImportMethod('file'));

    methodButtonGroup.appendChild(this.textImportButton);
    methodButtonGroup.appendChild(this.fileImportButton);
    importMethodContainer.appendChild(methodButtonGroup);
    batchImportSection.appendChild(importMethodContainer);

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
    importInstructions.textContent = '在下面输入 hosts 规则，每行一条。格式为：';
    this.textImportArea.appendChild(importInstructions);

    const formatExample = document.createElement('div');
    formatExample.className = 'batch-format-hint';
    formatExample.innerHTML = `
      <code>192.168.1.1 example.com</code><br>
      <code>127.0.0.1 localhost</code><br>
      <code>10.0.0.1 api.example.com</code><br>
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

    // 渲染分组选项
    this.renderGroupSelect(state.hostsGroups);

    importGroupSelect.appendChild(this.groupSelect);
    this.textImportArea.appendChild(importGroupSelect);

    // 批量导入文本框
    this.batchTextarea = document.createElement('textarea');
    this.batchTextarea.className = 'batch-textarea';
    this.batchTextarea.placeholder = `192.168.1.1 example.com
127.0.0.1 localhost
10.0.0.1 api.example.com
# 这是注释`;

    // 添加实时验证
    this.batchTextarea.addEventListener('input', () => {
      this.scheduleValidation();
    });

    this.textImportArea.appendChild(this.batchTextarea);

    // 验证结果显示区域
    this.validationResults = document.createElement('div');
    this.validationResults.className = 'validation-results';
    this.validationResults.style.marginTop = '12px';
    this.validationResults.style.display = 'none';
    this.textImportArea.appendChild(this.validationResults);

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

    const validateButton = document.createElement('button');
    validateButton.className = 'button button-default';
    validateButton.textContent = '验证规则';
    validateButton.addEventListener('click', () => {
      this.validateRules(true);
    });

    const clearButton = document.createElement('button');
    clearButton.className = 'button button-default';
    clearButton.textContent = '清空';
    clearButton.addEventListener('click', () => {
      this.batchTextarea.value = '';
      this.hideValidationResults();
    });

    const importButton = document.createElement('button');
    importButton.className = 'button button-primary';
    importButton.textContent = '导入规则';
    importButton.addEventListener('click', async () => {
      await this.handleTextImport();
    });

    importActions.appendChild(validateButton);
    importActions.appendChild(clearButton);
    importActions.appendChild(importButton);
    this.textImportArea.appendChild(importActions);

    // 保存按钮引用
    this.textImportButton = importButton;
    this.validateButton = validateButton;
    this.clearButton = clearButton;
  }

  /**
   * 渲染文件导入区域
   */
  renderFileImportArea (state) {
    this.fileImportArea.innerHTML = '';

    const fileInstructions = document.createElement('p');
    fileInstructions.className = 'instruction';
    fileInstructions.textContent = '选择要导入的文件。支持纯文本格式（.txt）和JSON格式（.json）。JSON格式可包含完整的分组信息。';
    this.fileImportArea.appendChild(fileInstructions);

    // 文件选择区域
    const fileSelectContainer = document.createElement('div');
    fileSelectContainer.className = 'file-select-container';
    fileSelectContainer.style.marginTop = '16px';
    fileSelectContainer.style.padding = '20px';
    fileSelectContainer.style.border = '2px dashed var(--gray-300)';
    fileSelectContainer.style.borderRadius = 'var(--rounded-lg)';
    fileSelectContainer.style.textAlign = 'center';
    fileSelectContainer.style.backgroundColor = 'var(--gray-50)';
    fileSelectContainer.style.cursor = 'pointer';
    fileSelectContainer.style.transition = 'all 0.2s ease';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.txt,.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    const fileSelectText = document.createElement('div');
    fileSelectText.innerHTML = `
      <div style="font-size: 24px; margin-bottom: 8px;">📁</div>
      <div style="font-size: 14px; color: var(--gray-600);">
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
      fileSelectContainer.style.borderColor = 'var(--primary-color)';
      fileSelectContainer.style.backgroundColor = 'var(--primary-light)';
    });

    fileSelectContainer.addEventListener('dragleave', (e) => {
      e.preventDefault();
      fileSelectContainer.style.borderColor = 'var(--gray-300)';
      fileSelectContainer.style.backgroundColor = 'var(--gray-50)';
    });

    fileSelectContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      fileSelectContainer.style.borderColor = 'var(--gray-300)';
      fileSelectContainer.style.backgroundColor = 'var(--gray-50)';

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
    exportInstructions.textContent = '选择要导出的分组和格式，然后点击导出按钮。可以选择导出特定分组或全部分组的规则。';
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
    exportSection.appendChild(exportOptions);

    // 监听格式变化，控制选项显示
    this.exportFormatSelect.addEventListener('change', () => {
      const isTextFormat = this.exportFormatSelect.value === 'text';
      this.includeGroupHeadersOption.style.display = isTextFormat ? 'flex' : 'none';
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
   * 切换导入方法
   */
  switchImportMethod (method) {
    this.currentImportMethod = method;

    if (method === 'text') {
      this.textImportButton.className = 'button button-primary';
      this.fileImportButton.className = 'button button-default';
      this.textImportArea.style.display = 'block';
      this.fileImportArea.style.display = 'none';
    } else {
      this.textImportButton.className = 'button button-default';
      this.fileImportButton.className = 'button button-primary';
      this.textImportArea.style.display = 'none';
      this.fileImportArea.style.display = 'block';
    }
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
    fileInfo.style.padding = '12px';
    fileInfo.style.backgroundColor = 'var(--gray-50)';
    fileInfo.style.borderRadius = 'var(--rounded)';
    fileInfo.style.border = '1px solid var(--gray-300)';

    const fileName = document.createElement('div');
    fileName.style.fontWeight = '600';
    fileName.style.marginBottom = '4px';
    fileName.textContent = `文件名: ${file.name}`;

    const fileSize = document.createElement('div');
    fileSize.style.fontSize = '14px';
    fileSize.style.color = 'var(--gray-600)';
    fileSize.textContent = `大小: ${(file.size / 1024).toFixed(2)} KB`;

    const fileType = document.createElement('div');
    fileType.style.fontSize = '14px';
    fileType.style.color = 'var(--gray-600)';
    fileType.textContent = `类型: ${file.type || '未知'}`;

    fileInfo.appendChild(fileName);
    fileInfo.appendChild(fileSize);
    fileInfo.appendChild(fileType);
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
      this.fileImportActions.style.display = 'block';

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

    const previewTitle = document.createElement('h5');
    previewTitle.textContent = `文件预览 (${isJsonFormat ? 'JSON格式' : '纯文本格式'}):`;
    previewTitle.style.marginBottom = '8px';
    previewContainer.appendChild(previewTitle);

    const previewContent = document.createElement('div');
    previewContent.style.maxHeight = '200px';
    previewContent.style.overflowY = 'auto';
    previewContent.style.padding = '12px';
    previewContent.style.backgroundColor = '#1e293b';
    previewContent.style.border = '1px solid #334155';
    previewContent.style.borderRadius = 'var(--rounded)';
    previewContent.style.fontFamily = '"SF Mono", Monaco, "Cascadia Mono", "Roboto Mono", monospace';
    previewContent.style.fontSize = '13px';
    previewContent.style.color = '#e2e8f0';
    previewContent.style.lineHeight = '1.6';

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
   * 安排验证任务（防抖）
   */
  scheduleValidation () {
    // 清除之前的定时器
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
    }

    // 设置新的定时器
    this.validationTimeout = setTimeout(() => {
      this.validateRules(false);
    }, 1000); // 1秒后执行验证
  }

  /**
   * 验证规则
   * @param {boolean} showResults - 是否显示验证结果
   */
  async validateRules (showResults = true) {
    const rulesText = this.batchTextarea.value.trim();

    if (!rulesText) {
      this.hideValidationResults();
      return;
    }

    try {
      // 使用ProxyService进行验证
      const validationResult = await ProxyService.validateBatchRules(rulesText);

      if (showResults) {
        this.showValidationResults(validationResult);
      }

      return validationResult;
    } catch (error) {
      console.error('验证规则失败:', error);
      if (showResults) {
        Message.error('验证规则时发生错误: ' + error.message);
      }
    }
  }

  /**
   * 显示验证结果
   * @param {Object} result - 验证结果
   */
  showValidationResults (result) {
    this.validationResults.innerHTML = '';
    this.validationResults.style.display = 'block';

    // 统计信息
    const summary = document.createElement('div');
    summary.className = 'validation-summary';
    summary.style.marginBottom = '16px';

    const summaryTitle = document.createElement('h4');
    summaryTitle.textContent = '验证结果';
    summaryTitle.style.marginBottom = '8px';
    summary.appendChild(summaryTitle);

    const statsContainer = document.createElement('div');
    statsContainer.style.display = 'flex';
    statsContainer.style.gap = '16px';
    statsContainer.style.flexWrap = 'wrap';

    // 有效规则数
    const validCount = document.createElement('span');
    validCount.className = 'status-tag status-tag-success';
    validCount.textContent = `有效: ${result.valid}`;
    statsContainer.appendChild(validCount);

    // 无效规则数
    if (result.invalid > 0) {
      const invalidCount = document.createElement('span');
      invalidCount.className = 'status-tag status-tag-default';
      invalidCount.textContent = `无效: ${result.invalid}`;
      statsContainer.appendChild(invalidCount);
    }

    // 警告数
    if (result.warnings && result.warnings.length > 0) {
      const warningCount = document.createElement('span');
      warningCount.className = 'status-tag';
      warningCount.style.backgroundColor = 'var(--warning-light)';
      warningCount.style.color = 'var(--warning-dark)';
      warningCount.textContent = `警告: ${result.warnings.length}`;
      statsContainer.appendChild(warningCount);
    }

    summary.appendChild(statsContainer);
    this.validationResults.appendChild(summary);

    // 错误详情
    if (result.errors && result.errors.length > 0) {
      const errorsSection = document.createElement('div');
      errorsSection.className = 'validation-errors';
      errorsSection.style.marginTop = '16px';

      const errorsTitle = document.createElement('h5');
      errorsTitle.textContent = '错误详情:';
      errorsTitle.style.color = 'var(--error-color)';
      errorsTitle.style.marginBottom = '8px';
      errorsSection.appendChild(errorsTitle);

      const errorsList = document.createElement('div');
      errorsList.style.maxHeight = '200px';
      errorsList.style.overflowY = 'auto';
      errorsList.style.border = '1px solid var(--error-color)';
      errorsList.style.borderRadius = 'var(--rounded)';
      errorsList.style.padding = '8px';
      errorsList.style.backgroundColor = 'var(--error-light)';

      result.errors.slice(0, 10).forEach(error => {
        const errorItem = document.createElement('div');
        errorItem.style.fontSize = '13px';
        errorItem.style.marginBottom = '4px';
        errorItem.style.color = 'var(--error-dark)';
        errorItem.textContent = `第 ${error.line} 行: ${error.error}`;
        errorsList.appendChild(errorItem);
      });

      if (result.errors.length > 10) {
        const moreErrors = document.createElement('div');
        moreErrors.style.fontSize = '13px';
        moreErrors.style.fontStyle = 'italic';
        moreErrors.style.color = 'var(--error-dark)';
        moreErrors.textContent = `... 还有 ${result.errors.length - 10} 个错误`;
        errorsList.appendChild(moreErrors);
      }

      errorsSection.appendChild(errorsList);
      this.validationResults.appendChild(errorsSection);
    }

    // 警告详情
    if (result.warnings && result.warnings.length > 0) {
      const warningsSection = document.createElement('div');
      warningsSection.className = 'validation-warnings';
      warningsSection.style.marginTop = '16px';

      const warningsTitle = document.createElement('h5');
      warningsTitle.textContent = '警告信息:';
      warningsTitle.style.color = 'var(--warning-color)';
      warningsTitle.style.marginBottom = '8px';
      warningsSection.appendChild(warningsTitle);

      const warningsList = document.createElement('div');
      warningsList.style.maxHeight = '100px';
      warningsList.style.overflowY = 'auto';
      warningsList.style.border = '1px solid var(--warning-color)';
      warningsList.style.borderRadius = 'var(--rounded)';
      warningsList.style.padding = '8px';
      warningsList.style.backgroundColor = 'var(--warning-light)';

      result.warnings.slice(0, 5).forEach(warning => {
        const warningItem = document.createElement('div');
        warningItem.style.fontSize = '13px';
        warningItem.style.marginBottom = '4px';
        warningItem.style.color = 'var(--warning-dark)';
        warningItem.textContent = `第 ${warning.line} 行: ${warning.warning}`;
        warningsList.appendChild(warningItem);
      });

      warningsSection.appendChild(warningsList);
      this.validationResults.appendChild(warningsSection);
    }
  }

  /**
   * 隐藏验证结果
   */
  hideValidationResults () {
    if (this.validationResults) {
      this.validationResults.style.display = 'none';
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

    // 先验证规则
    const validationResult = await this.validateRules(false);
    if (validationResult && validationResult.invalid > 0) {
      const confirmed = await this.confirmImportWithErrors(validationResult);
      if (!confirmed) {
        this.showValidationResults(validationResult);
        return;
      }
    }

    this.isProcessing = true;

    try {
      // 禁用按钮并显示处理中状态
      this.setButtonsDisabled(true);
      this.textImportButton.textContent = '导入中...';

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
        if (result.duplicates && result.duplicates.length > 0) {
          successMessage += `（包含 ${result.duplicates.length} 条重复规则）`;
        }

        Message.success(successMessage + '，代理规则已更新');

        // 清空文本框
        this.batchTextarea.value = '';
        this.hideValidationResults();
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
      this.textImportButton.textContent = '导入规则';
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
        case 'merge':
          // 合并模式：更新现有分组，新增缺失分组
          for (const importGroup of data.hostsGroups || []) {
            const existingGroup = state.hostsGroups.find(g => g.name === importGroup.name);

            if (existingGroup) {
              // 更新现有分组
              const importResult = await this.mergeGroupHosts(existingGroup.id, importGroup.hosts || []);
              totalImported += importResult.imported;
              totalSkipped += importResult.skipped;
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

          return {
            success: true,
            message: `合并完成：处理 ${groupsProcessed} 个分组，导入 ${totalImported} 条规则，跳过 ${totalSkipped} 条`
          };

        case 'replace':
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
            socketProxy: data.socketProxy || state.socketProxy
          });

          await StateService.forceRefresh();

          return {
            success: true,
            message: `替换完成：导入 ${newGroups.length} 个分组，共 ${newGroups.reduce((sum, g) => sum + g.hosts.length, 0)} 条规则`
          };

        case 'newGroup':
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
            return {
              success: true,
              message: `创建新分组 "${newGroupName}"，导入 ${allHosts.length} 条规则`
            };
          } else {
            return { success: false, message: '创建分组失败，可能存在同名分组' };
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
      if (isValidIp(host.ip) && isValidDomain(host.domain)) {
        const newHost = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          ip: host.ip,
          domain: host.domain,
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
        const result = await this.exportAsJson(selectedGroupId);
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
   */
  async exportAsJson (groupId) {
    const state = StateService.getState();

    let exportData;
    let fileName;
    const timestamp = new Date().toISOString().split('T')[0];

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
        activeGroups: state.activeGroups,
        socketProxy: state.socketProxy
      };

      fileName = `hosts-全部分组-${timestamp}.json`;
    }

    return {
      content: JSON.stringify(exportData, null, 2),
      fileName
    };
  }

  /**
   * 确认导入有错误的规则
   * @param {Object} validationResult - 验证结果
   * @returns {Promise<boolean>} - 用户是否确认导入
   */
  async confirmImportWithErrors (validationResult) {
    const errorCount = validationResult.invalid;
    const validCount = validationResult.valid;

    return new Promise((resolve) => {
      const confirmed = confirm(
        `检测到 ${errorCount} 条无效规则，${validCount} 条有效规则。\n\n` +
        `是否继续导入有效规则？无效规则将被跳过。\n\n` +
        `点击"取消"查看详细错误信息。`
      );
      resolve(confirmed);
    });
  }

  /**
   * 设置按钮禁用状态
   * @param {boolean} disabled - 是否禁用
   */
  setButtonsDisabled (disabled) {
    if (this.textImportButton) this.textImportButton.disabled = disabled;
    if (this.validateButton) this.validateButton.disabled = disabled;
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

    // 清除验证定时器
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
    }

    // 清空引用
    this.groupSelect = null;
    this.batchTextarea = null;
    this.validationResults = null;
    this.textImportButton = null;
    this.validateButton = null;
    this.clearButton = null;
    this.exportGroupSelect = null;
    this.exportButton = null;
    this.includeDisabledCheckbox = null;
    this.includeGroupHeadersCheckbox = null;
    this.exportFormatSelect = null;
    this.fileImportButton = null;
    this.importModeSelect = null;
    this.newGroupNameInput = null;
    this.selectedFile = null;
    this.selectedFileContent = null;
  }
}