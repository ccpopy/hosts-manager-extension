/**
 * 显示临时消息提示
 * @param {HTMLElement} container - 容器元素
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型 ('info' | 'success' | 'error')
 * @param {number} duration - 显示时长(毫秒)
 */
export function showMessage (container, message, type = 'info', duration = 3000) {
  const msgEl = document.createElement('div');
  msgEl.textContent = message;
  msgEl.className = 'message-temp';

  switch (type) {
    case 'error':
      msgEl.style.color = 'var(--error-color)';
      break;
    case 'success':
      msgEl.style.color = 'var(--success-color)';
      break;
    default:
      msgEl.style.color = 'var(--gray-700)';
  }

  // 移除现有消息
  const existingMsg = container.querySelector('.message-temp');
  if (existingMsg) {
    container.removeChild(existingMsg);
  }

  container.appendChild(msgEl);

  setTimeout(() => {
    if (container.contains(msgEl)) {
      container.removeChild(msgEl);
    }
  }, duration);
}