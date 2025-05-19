/**
 * 消息通知工具
 * 实现类似 Ant Design Vue 的消息通知效果
 */

// 消息容器，用于存放所有通知
let messageContainer = null;

// 当前显示的消息队列
const messages = [];

// 消息默认配置
const defaultConfig = {
  duration: 3000,   // 默认显示时间（毫秒）
  maxCount: 5,      // 最大显示数量
  top: 24,          // 距离顶部位置
  gap: 8            // 通知之间的间隔（调整为8px，更紧凑）
};

/**
 * 创建消息容器
 * @returns {HTMLElement} 消息容器
 */
function createMessageContainer () {
  if (messageContainer) return messageContainer;

  messageContainer = document.createElement('div');
  messageContainer.className = 'ant-message';
  document.body.appendChild(messageContainer);
  return messageContainer;
}

/**
 * 格式化消息内容
 * @param {any} content - 消息内容
 * @returns {string} 格式化后的消息内容
 */
function formatContent (content) {
  if (content === null || content === undefined) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return JSON.stringify(content, null, 2);
  }

  if (typeof content === 'object') {
    return JSON.stringify(content, null, 2);
  }

  return String(content);
}

/**
 * 创建单个消息元素
 * @param {any} content - 消息内容
 * @param {string} type - 消息类型 ('info' | 'success' | 'error' | 'warning')
 * @param {number} duration - 显示时间
 * @returns {HTMLElement} 消息元素
 */
function createMessageElement (content, type, duration) {
  const messageId = 'message-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

  // 创建消息元素
  const messageElement = document.createElement('div');
  messageElement.className = 'ant-message-notice';
  messageElement.id = messageId;

  // 创建消息内容容器
  const messageContent = document.createElement('div');
  messageContent.className = 'ant-message-notice-content';

  // 创建消息内容
  const messageInner = document.createElement('div');
  messageInner.className = `ant-message-custom-content ant-message-${type}`;

  // 添加图标
  const icon = document.createElement('span');
  icon.className = 'ant-message-icon';

  switch (type) {
    case 'success':
      icon.innerHTML = `
        <svg viewBox="64 64 896 896" fill="currentColor" width="1em" height="1em">
          <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm193.5 301.7l-210.6 292a31.8 31.8 0 01-51.7 0L318.5 484.9c-3.8-5.3 0-12.7 6.5-12.7h46.9c10.2 0 19.9 4.9 25.9 13.3l71.2 98.8 157.2-218c6-8.3 15.6-13.3 25.9-13.3H699c6.5 0 10.3 7.4 6.5 12.7z"></path>
        </svg>
      `;
      break;
    case 'error':
      icon.innerHTML = `
        <svg viewBox="64 64 896 896" fill="currentColor" width="1em" height="1em">
          <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm165.4 618.2l-66-.3L512 563.4l-99.3 118.4-66.1.3c-4.4 0-8-3.5-8-8 0-1.9.7-3.7 1.9-5.2l130.1-155L340.5 359a8.32 8.32 0 01-1.9-5.2c0-4.4 3.6-8 8-8l66.1.3L512 464.6l99.3-118.4 66-.3c4.4 0 8 3.5 8 8 0 1.9-.7 3.7-1.9 5.2L553.5 514l130 155c1.2 1.5 1.9 3.3 1.9 5.2 0 4.4-3.6 8-8 8z"></path>
        </svg>
      `;
      break;
    case 'warning':
      icon.innerHTML = `
        <svg viewBox="64 64 896 896" fill="currentColor" width="1em" height="1em">
          <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm-32 232c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V296zm32 440a48.01 48.01 0 010-96 48.01 48.01 0 010 96z"></path>
        </svg>
      `;
      break;
    default:
      icon.innerHTML = `
        <svg viewBox="64 64 896 896" fill="currentColor" width="1em" height="1em">
          <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm32 664c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v48zm0-232c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V280c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v216z"></path>
        </svg>
      `;
  }

  // 格式化消息内容
  const formattedContent = formatContent(content);

  // 添加消息文本
  const text = document.createElement('span');

  // 检查是否为对象或数组（格式化后的JSON字符串）
  if (
    (typeof content === 'object' && content !== null) ||
    Array.isArray(content)
  ) {
    // 为对象或数组创建预格式化文本元素
    text.className = 'ant-message-text pre-formatted';
    text.textContent = formattedContent;
  } else {
    text.className = 'ant-message-text';
    text.textContent = formattedContent;
  }

  // 组装消息
  messageInner.appendChild(icon);
  messageInner.appendChild(text);
  messageContent.appendChild(messageInner);
  messageElement.appendChild(messageContent);

  // 将消息添加到消息队列
  messages.push({
    id: messageId,
    element: messageElement,
    timer: null,
    height: 0
  });

  // 设置自动关闭定时器
  if (duration > 0) {
    const timer = setTimeout(() => {
      removeMessage(messageId);
    }, duration);

    // 保存定时器ID
    const messageObj = messages.find(msg => msg.id === messageId);
    if (messageObj) {
      messageObj.timer = timer;
    }
  }

  return messageElement;
}

/**
 * 移除消息
 * @param {string} messageId - 消息ID
 */
function removeMessage (messageId) {
  const index = messages.findIndex(msg => msg.id === messageId);

  if (index === -1) return;

  const messageObj = messages[index];
  const { element, timer, height } = messageObj;

  // 清除定时器
  if (timer) {
    clearTimeout(timer);
  }

  // 添加离开动画
  element.classList.add('ant-message-notice-leave');

  // 移除元素
  setTimeout(() => {
    if (messageContainer && messageContainer.contains(element)) {
      messageContainer.removeChild(element);
    }

    // 从消息队列移除
    messages.splice(index, 1);

    // 调整其他消息的位置
    updateMessagesPosition();
  }, 300); // 动画持续时间
}

/**
 * 更新所有消息的位置
 */
function updateMessagesPosition () {
  let offset = defaultConfig.top;

  messages.forEach(msg => {
    msg.element.style.top = offset + 'px';

    // 获取元素高度（包括margin）
    if (!msg.height) {
      const style = window.getComputedStyle(msg.element);
      const marginTop = parseInt(style.marginTop) || 0;
      const marginBottom = parseInt(style.marginBottom) || 0;
      msg.height = msg.element.offsetHeight + marginTop + marginBottom;
    }

    offset += msg.height + defaultConfig.gap;
  });
}

/**
 * 显示消息
 * @param {any} content - 消息内容
 * @param {string} type - 消息类型 ('info' | 'success' | 'error' | 'warning')
 * @param {number} [duration=3000] - 显示时间
 */
function showMessage (content, type = 'info', duration = defaultConfig.duration) {
  // 创建消息容器
  const container = createMessageContainer();

  // 检查消息数量是否超出限制
  if (messages.length >= defaultConfig.maxCount) {
    // 移除最早的消息
    const oldestMessage = messages[0];
    removeMessage(oldestMessage.id);
  }

  // 创建消息元素
  const messageElement = createMessageElement(content, type, duration);

  // 添加到容器
  container.appendChild(messageElement);

  // 延迟获取高度，确保DOM已渲染
  setTimeout(() => {
    // 获取该消息在队列中的索引
    const index = messages.findIndex(msg => msg.id === messageElement.id);
    if (index !== -1) {
      // 计算元素高度
      const style = window.getComputedStyle(messageElement);
      const marginTop = parseInt(style.marginTop) || 0;
      const marginBottom = parseInt(style.marginBottom) || 0;
      messages[index].height = messageElement.offsetHeight + marginTop + marginBottom;

      // 更新所有消息位置
      updateMessagesPosition();
    }
  }, 50);

  // 触发进入动画
  setTimeout(() => {
    messageElement.classList.add('ant-message-notice-enter');
  }, 10);

  return messageElement.id;
}

/**
 * 导出消息函数
 */
export const Message = {
  // 普通消息
  info (content, duration) {
    return showMessage(content, 'info', duration);
  },

  // 成功消息
  success (content, duration) {
    return showMessage(content, 'success', duration);
  },

  // 警告消息
  warning (content, duration) {
    return showMessage(content, 'warning', duration);
  },

  // 错误消息
  error (content, duration) {
    return showMessage(content, 'error', duration);
  },

  // 移除指定消息
  remove (messageId) {
    removeMessage(messageId);
  },

  // 移除所有消息
  clear () {
    [...messages].forEach(msg => {
      removeMessage(msg.id);
    });
  },

  // 配置消息组件
  config (options) {
    Object.assign(defaultConfig, options);
  }
};

// 导出为默认模块
export default Message;