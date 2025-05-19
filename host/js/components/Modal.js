/**
 * 模态框组件
 * 提供弹窗功能，支持确认框和提示输入框
 */
export default class Modal {
  /**
   * 显示模态框
   * @param {Object} options - 模态框配置选项
   * @param {string} options.title - 标题
   * @param {string} options.message - 消息内容
   * @param {string} options.type - 模态框类型 ('confirm' | 'prompt')
   * @param {string} options.placeholder - 输入框占位文本
   * @param {string} options.defaultValue - 输入框默认值
   * @param {Function} options.onConfirm - 确认回调
   * @param {Function} options.onCancel - 取消回调
   */
  static show (options) {
    const { title, message, type = 'confirm', placeholder = '', defaultValue = '', onConfirm, onCancel } = options;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    // 头部
    const header = document.createElement('div');
    header.className = 'modal-header';
    const titleEl = document.createElement('h3');
    titleEl.className = 'modal-title';
    titleEl.textContent = title;
    header.appendChild(titleEl);

    // 主体
    const body = document.createElement('div');
    body.className = 'modal-body';

    if (type === 'prompt') {
      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      body.appendChild(messageEl);

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder;
      input.value = defaultValue;
      input.id = 'modal-input';
      body.appendChild(input);

      // 自动聚焦
      setTimeout(() => input.focus(), 100);
    } else {
      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      body.appendChild(messageEl);
    }

    // 底部
    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'button button-default';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      if (onCancel) onCancel();
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'button button-primary';
    confirmBtn.textContent = '确定';
    confirmBtn.addEventListener('click', () => {
      const value = type === 'prompt' ? document.getElementById('modal-input').value : true;
      document.body.removeChild(overlay);
      if (onConfirm) onConfirm(value);
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 输入回车键的处理
    if (type === 'prompt') {
      const input = document.getElementById('modal-input');
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          confirmBtn.click();
        }
      });
    }

    // ESC键处理
    document.addEventListener('keydown', function escapeHandler (e) {
      if (e.key === 'Escape') {
        document.body.removeChild(overlay);
        document.removeEventListener('keydown', escapeHandler);
        if (onCancel) onCancel();
      }
    });
  }

  /**
   * 显示确认对话框
   * @param {string} title - 标题
   * @param {string} message - 消息内容
   * @returns {Promise<boolean>} - 用户选择的结果
   */
  static confirm (title, message) {
    return new Promise((resolve) => {
      Modal.show({
        title,
        message,
        type: 'confirm',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  }

  /**
   * 显示输入对话框
   * @param {string} title - 标题
   * @param {string} message - 消息内容
   * @param {string} defaultValue - 默认值
   * @returns {Promise<string|null>} - 用户输入的结果
   */
  static prompt (title, message, defaultValue = '') {
    return new Promise((resolve) => {
      Modal.show({
        title,
        message,
        type: 'prompt',
        defaultValue,
        onConfirm: (value) => resolve(value),
        onCancel: () => resolve(null)
      });
    });
  }
}