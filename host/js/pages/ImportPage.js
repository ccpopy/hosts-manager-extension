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
    importTitle.textContent = '批量导入 Hosts';
    this.container.appendChild(importTitle);

    // 提示信息
    const importNotice = createNotice(
      '可以一次性导入多条hosts规则，每行一条。支持 IP地址 域名 格式，# 开头的注释行会被忽略。导入后将立即更新网络请求规则。',
      'info',
      `<svg class="notice-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`
    );
    this.container.appendChild(importNotice);

    const batchImportSection = document.createElement('div');
    batchImportSection.className = 'batch-import-section';

    const importSectionTitle = document.createElement('h3');
    importSectionTitle.className = 'section-title';
    importSectionTitle.textContent = '导入规则';
    batchImportSection.appendChild(importSectionTitle);

    const importInstructions = document.createElement('p');
    importInstructions.className = 'instruction';
    importInstructions.textContent = '在下面输入 hosts 规则，每行一条。格式为：';
    batchImportSection.appendChild(importInstructions);

    const formatExample = document.createElement('div');
    formatExample.className = 'batch-format-hint';
    formatExample.innerHTML = `
      <code>192.168.1.1 example.com</code><br>
      <code>127.0.0.1 localhost</code><br>
      <code>10.0.0.1 api.example.com</code><br>
      <code># 注释行会被忽略</code>
    `;
    batchImportSection.appendChild(formatExample);

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
    batchImportSection.appendChild(importGroupSelect);

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

    batchImportSection.appendChild(this.batchTextarea);

    // 验证结果显示区域
    this.validationResults = document.createElement('div');
    this.validationResults.className = 'validation-results';
    this.validationResults.style.marginTop = '12px';
    this.validationResults.style.display = 'none';
    batchImportSection.appendChild(this.validationResults);

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

    batchImportSection.appendChild(importOptions);

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
      await this.handleImport();
    });

    importActions.appendChild(validateButton);
    importActions.appendChild(clearButton);
    importActions.appendChild(importButton);
    batchImportSection.appendChild(importActions);

    this.container.appendChild(batchImportSection);

    // 保存按钮引用
    this.importButton = importButton;
    this.validateButton = validateButton;
    this.clearButton = clearButton;
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
      // 只显示前10个错误
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
      // 只显示前5个警告
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
   * 处理导入
   */
  async handleImport () {
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
      this.importButton.textContent = '导入中...';

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

        Message.success(successMessage + '，网络请求规则已更新');

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
      this.importButton.textContent = '导入规则';
      this.isProcessing = false;
    }
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
    if (this.importButton) this.importButton.disabled = disabled;
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
    this.importButton = null;
    this.validateButton = null;
    this.clearButton = null;
  }
}