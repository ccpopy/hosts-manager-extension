import StorageService from '../services/StorageService.js';
import ProxyService from '../services/ProxyService.js';
import { createNotice } from '../components/Notice.js';
import { showMessage } from '../utils/MessageUtils.js';

/**
 * 导入页面类
 */
export default class ImportPage {
  /**
   * 构造函数
   * @param {HTMLElement} container - 页面容器
   */
  constructor(container) {
    this.container = container;
  }

  /**
   * 初始化页面
   */
  async init () {
    await this.render();
  }

  /**
   * 渲染页面
   */
  async render () {
    this.container.innerHTML = '';

    const hostsGroups = await StorageService.getGroups();

    // 标题
    const importTitle = document.createElement('h2');
    importTitle.className = 'page-title';
    importTitle.textContent = '批量导入 Hosts';
    this.container.appendChild(importTitle);

    // 提示信息
    const importNotice = createNotice(
      '可以一次性导入多条hosts规则，每行一条。支持 IP地址 域名 格式，# 开头的注释行会被忽略。',
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

    const groupSelect = document.createElement('select');
    groupSelect.id = 'import-group-select';

    // 添加分组选项
    hostsGroups.forEach(group => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      groupSelect.appendChild(option);
    });

    importGroupSelect.appendChild(groupSelect);
    batchImportSection.appendChild(importGroupSelect);

    // 批量导入文本框
    const batchTextarea = document.createElement('textarea');
    batchTextarea.className = 'batch-textarea';
    batchTextarea.placeholder = '192.168.1.1 example.com\n127.0.0.1 localhost\n# 这是注释';
    batchImportSection.appendChild(batchTextarea);

    // 导入按钮
    const importActions = document.createElement('div');
    importActions.className = 'form-actions';

    const clearButton = document.createElement('button');
    clearButton.className = 'button button-default';
    clearButton.textContent = '清空';
    clearButton.addEventListener('click', () => {
      batchTextarea.value = '';
    });

    const importButton = document.createElement('button');
    importButton.className = 'button button-primary';
    importButton.textContent = '导入规则';
    importButton.addEventListener('click', async () => {
      const rules = batchTextarea.value.trim();
      const selectedGroupId = groupSelect.value;

      if (!rules) {
        showMessage(importActions, '请输入要导入的规则', 'error');
        return;
      }

      if (!selectedGroupId) {
        showMessage(importActions, '请选择一个分组', 'error');
        return;
      }

      const result = await ProxyService.parseAndImportRules(rules, selectedGroupId);
      if (result.success) {
        showMessage(importActions, `成功导入 ${result.imported} 条规则，${result.skipped} 条被跳过`, 'success');
        batchTextarea.value = '';
      } else {
        showMessage(importActions, result.message, 'error');
      }
    });

    importActions.appendChild(clearButton);
    importActions.appendChild(importButton);
    batchImportSection.appendChild(importActions);

    this.container.appendChild(batchImportSection);
  }
}