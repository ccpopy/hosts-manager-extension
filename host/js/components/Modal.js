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
   * @param {string} options.confirmText - 确认按钮文字
   * @param {boolean} options.danger - 确认按钮是否为危险操作样式
   * @param {Function} options.onConfirm - 确认回调
   * @param {Function} options.onCancel - 取消回调
   */
  static show (options) {
    const {
      title,
      message,
      type = 'confirm',
      placeholder = '',
      defaultValue = '',
      confirmText = '确定',
      danger = false,
      onConfirm,
      onCancel
    } = options;

    const previouslyFocused = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

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

    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    body.appendChild(messageEl);

    let input = null;
    if (type === 'prompt') {
      input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder;
      input.value = defaultValue;
      body.appendChild(input);
    }

    // 底部
    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'button button-default';
    cancelBtn.textContent = '取消';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = danger ? 'button button-danger' : 'button button-primary';
    confirmBtn.textContent = confirmText;

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 关闭逻辑：保证监听器一定被移除、元素只移除一次
    let closed = false;
    const close = (confirmed) => {
      if (closed) return;
      closed = true;

      document.removeEventListener('keydown', keyHandler, true);
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }

      // 恢复焦点
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try { previouslyFocused.focus(); } catch (e) { /* 元素可能已移除 */ }
      }

      if (confirmed) {
        if (onConfirm) onConfirm(type === 'prompt' ? input.value : true);
      } else {
        if (onCancel) onCancel();
      }
    };

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Enter' && (type !== 'prompt' || document.activeElement === input)) {
        e.preventDefault();
        close(true);
      }
    };

    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) {
        close(false);
      }
    });
    document.addEventListener('keydown', keyHandler, true);

    // 初始焦点
    setTimeout(() => {
      if (input) {
        input.focus();
        input.select();
      } else {
        confirmBtn.focus();
      }
    }, 50);
  }

  /**
   * 显示确认对话框
   * @param {string} title - 标题
   * @param {string} message - 消息内容
   * @param {Object} [options] - 额外选项（confirmText / danger）
   * @returns {Promise<boolean>} - 用户选择的结果
   */
  static confirm (title, message, options = {}) {
    return new Promise((resolve) => {
      Modal.show({
        title,
        message,
        type: 'confirm',
        ...options,
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
