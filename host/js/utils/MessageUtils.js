/**
 * 消息通知工具
 * 提供轻量级、可自定义的通知功能
 */

// 消息容器引用
let messageContainer = null;

// 当前显示的消息队列
let messages = [];

// 消息ID计数器
let messageIdCounter = 0;

// 默认配置
const defaultConfig = {
  duration: 3000,           // 默认显示时间（毫秒）
  maxCount: 5,              // 最大显示数量
  top: 24,                  // 距离顶部位置
  gap: 8,                   // 通知之间的间隔
  width: 'auto',            // 消息宽度
  maxWidth: '80%',          // 最大宽度
  zIndex: 1000,             // 层级
  animationDuration: 300,   // 动画时长（毫秒）
  closeButton: false,       // 是否显示关闭按钮
  position: 'top-center',   // 位置: top-center, top-right, top-left, bottom-center, bottom-right, bottom-left
  escapeHTML: true,         // 是否转义HTML
  showIcon: true,           // 是否显示图标
  container: null           // 自定义容器
};

/**
 * 安全地检查字符串是否包含某个子串
 * @param {string} str - 要检查的字符串
 * @param {string} searchStr - 要搜索的子串
 * @returns {boolean} - 是否包含该子串
 */
function safeIncludes (str, searchStr) {
  if (!str || typeof str !== 'string') return false;
  return str.includes(searchStr);
}

/**
 * 创建或获取消息容器
 * @param {object} options - 配置项
 * @returns {HTMLElement} 消息容器
 */
function getMessageContainer (options = {}) {
  // 合并配置，确保所有属性都有值
  const config = { ...defaultConfig, ...options };

  // 如果已经有容器且没有指定自定义容器，直接返回
  if (messageContainer && !config.container) return messageContainer;

  // 如果指定了自定义容器，使用自定义容器
  if (config.container) {
    messageContainer = typeof config.container === 'string' ?
      document.querySelector(config.container) : config.container;

    // 确保容器存在，如果不存在则创建默认容器
    if (!messageContainer) {
      console.warn('未找到指定的消息容器，使用默认容器');
      messageContainer = createDefaultContainer(config);
    } else {
      // 确保容器有合适的样式
      messageContainer.style.position = messageContainer.style.position || 'relative';
    }
  } else {
    // 创建默认容器
    messageContainer = createDefaultContainer(config);
  }

  return messageContainer;
}

/**
 * 创建默认消息容器
 * @param {object} config - 配置项
 * @returns {HTMLElement} 消息容器
 */
function createDefaultContainer (config) {
  try {
    const container = document.createElement('div');
    container.className = 'ant-message';

    // 设置容器样式
    Object.assign(container.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      pointerEvents: 'none',
      zIndex: config.zIndex,
      transition: 'all 0.3s'
    });

    // 根据位置设置不同的样式
    const position = config.position || 'top-center';

    if (safeIncludes(position, 'bottom')) {
      container.style.top = 'auto';
      container.style.bottom = '0';
    }

    document.body.appendChild(container);
    return container;
  } catch (error) {
    console.error('创建消息容器失败:', error);
    // 创建一个最简单的容器作为后备
    const fallbackContainer = document.createElement('div');
    fallbackContainer.style.position = 'fixed';
    fallbackContainer.style.top = '0';
    fallbackContainer.style.left = '0';
    fallbackContainer.style.width = '100%';
    fallbackContainer.style.zIndex = '9999';
    document.body.appendChild(fallbackContainer);
    return fallbackContainer;
  }
}

/**
 * 转义HTML特殊字符
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHTML (text) {
  if (typeof text !== 'string') return '';

  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 格式化消息内容
 * @param {any} content - 消息内容
 * @param {boolean} shouldEscapeHTML - 是否转义HTML
 * @returns {string} 格式化后的消息内容
 */
function formatContent (content, shouldEscapeHTML = true) {
  if (content === null || content === undefined) {
    return '';
  }

  if (typeof content === 'string') {
    return shouldEscapeHTML ? escapeHTML(content) : content;
  }

  try {
    if (Array.isArray(content) || typeof content === 'object') {
      const jsonString = JSON.stringify(content, null, 2);
      return shouldEscapeHTML ? escapeHTML(jsonString) : jsonString;
    }
  } catch (error) {
    console.error('格式化消息内容失败:', error);
    return String(content);
  }

  return String(content);
}

/**
 * 获取消息图标
 * @param {string} type - 消息类型
 * @returns {string} SVG图标HTML
 */
function getMessageIcon (type) {
  switch (type) {
    case 'success':
      return `
        <svg viewBox="64 64 896 896" fill="currentColor" width="1em" height="1em">
          <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm193.5 301.7l-210.6 292a31.8 31.8 0 01-51.7 0L318.5 484.9c-3.8-5.3 0-12.7 6.5-12.7h46.9c10.2 0 19.9 4.9 25.9 13.3l71.2 98.8 157.2-218c6-8.3 15.6-13.3 25.9-13.3H699c6.5 0 10.3 7.4 6.5 12.7z"></path>
        </svg>
      `;
    case 'error':
      return `
        <svg viewBox="64 64 896 896" fill="currentColor" width="1em" height="1em">
          <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm165.4 618.2l-66-.3L512 563.4l-99.3 118.4-66.1.3c-4.4 0-8-3.5-8-8 0-1.9.7-3.7 1.9-5.2l130.1-155L340.5 359a8.32 8.32 0 01-1.9-5.2c0-4.4 3.6-8 8-8l66.1.3L512 464.6l99.3-118.4 66-.3c4.4 0 8 3.5 8 8 0 1.9-.7 3.7-1.9 5.2L553.5 514l130 155c1.2 1.5 1.9 3.3 1.9 5.2 0 4.4-3.6 8-8 8z"></path>
        </svg>
      `;
    case 'warning':
      return `
        <svg viewBox="64 64 896 896" fill="currentColor" width="1em" height="1em">
          <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm-32 232c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V296zm32 440a48.01 48.01 0 010-96 48.01 48.01 0 010 96z"></path>
        </svg>
      `;
    case 'loading':
      return `
        <svg viewBox="0 0 1024 1024" fill="currentColor" width="1em" height="1em" class="loading-icon">
          <path d="M512 1024c-69.1 0-136.2-13.5-199.3-40.2C251.7 958 197 921 150 874c-47-47-84-101.7-109.8-162.7C13.5 648.2 0 581.1 0 512c0-19.9 16.1-36 36-36s36 16.1 36 36c0 59.4 11.6 117 34.6 171.3 22.2 52.4 53.9 99.5 94.3 139.9 40.4 40.4 87.5 72.2 139.9 94.3C395 940.4 452.6 952 512 952c59.4 0 117-11.6 171.3-34.6 52.4-22.2 99.5-53.9 139.9-94.3 40.4-40.4 72.2-87.5 94.3-139.9C940.4 629 952 571.4 952 512c0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 00-94.3-139.9 437.71 437.71 0 00-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.2C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3s-13.5 136.2-40.2 199.3C958 772.3 921 827 874 874c-47 47-101.8 83.9-162.7 109.7-63.1 26.8-130.2 40.3-199.3 40.3z"></path>
        </svg>
      `;
    default:
      return `
        <svg viewBox="64 64 896 896" fill="currentColor" width="1em" height="1em">
          <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm32 664c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v48zm0-232c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V280c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v216z"></path>
        </svg>
      `;
  }
}

/**
 * 创建单个消息元素
 * @param {any} content - 消息内容
 * @param {string} type - 消息类型
 * @param {object} options - 自定义选项
 * @returns {object} 消息对象
 */
function createMessage (content, type, options = {}) {
  try {
    // 合并配置
    const config = { ...defaultConfig, ...options };

    // 生成唯一ID
    const messageId = `message-${++messageIdCounter}-${Date.now()}`;

    // 创建消息元素
    const messageElement = document.createElement('div');
    messageElement.className = 'ant-message-notice';
    messageElement.id = messageId;

    // 根据位置设置样式
    positionMessageElement(messageElement, config);

    // 创建消息内容容器
    const messageContent = document.createElement('div');
    messageContent.className = 'ant-message-notice-content';

    // 设置消息内容样式
    Object.assign(messageContent.style, {
      padding: '10px 16px',
      backgroundColor: '#fff',
      borderRadius: '8px',
      boxShadow: '0 3px 6px -4px rgba(0,0,0,0.12), 0 6px 16px 0 rgba(0,0,0,0.08), 0 9px 28px 8px rgba(0,0,0,0.05)',
      pointerEvents: 'auto',
      display: 'inline-block',
      maxWidth: config.maxWidth,
      width: config.width === 'auto' ? 'auto' : config.width,
      transition: 'all 0.3s',
      lineHeight: '1.5'
    });

    // 创建消息内容
    const messageInner = document.createElement('div');
    messageInner.className = `ant-message-custom-content ant-message-${type}`;
    messageInner.style.display = 'flex';
    messageInner.style.alignItems = 'center';

    // 添加图标
    if (config.showIcon) {
      const icon = document.createElement('span');
      icon.className = 'ant-message-icon';
      icon.style.marginRight = '8px';
      icon.innerHTML = getMessageIcon(type);

      // 添加加载动画
      if (type === 'loading') {
        const styleId = 'message-loading-style';
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = `
            .loading-icon {
              animation: loadingCircle 1s infinite linear;
            }
            @keyframes loadingCircle {
              100% {
                transform: rotate(360deg);
              }
            }
          `;
          document.head.appendChild(style);
        }
      }

      messageInner.appendChild(icon);
    }

    // 格式化消息内容
    const formattedContent = formatContent(content, config.escapeHTML);

    // 添加消息文本
    const text = document.createElement('span');
    text.className = 'ant-message-text';

    // 检查是否为对象或数组
    if ((typeof content === 'object' && content !== null) || Array.isArray(content)) {
      text.className += ' pre-formatted';
      text.style.whiteSpace = 'pre-wrap';
      text.style.fontFamily = 'monospace';
      text.style.fontSize = '13px';
    }

    text.innerHTML = formattedContent;
    messageInner.appendChild(text);

    // 添加关闭按钮
    if (config.closeButton) {
      const closeBtn = document.createElement('span');
      closeBtn.className = 'ant-message-close';
      closeBtn.innerHTML = '×';
      closeBtn.style.marginLeft = '12px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.fontSize = '14px';
      closeBtn.style.color = 'rgba(0,0,0,0.45)';
      closeBtn.style.fontWeight = '700';
      closeBtn.addEventListener('click', () => removeMessage(messageId));
      messageInner.appendChild(closeBtn);
    }

    messageContent.appendChild(messageInner);
    messageElement.appendChild(messageContent);

    // 创建消息对象
    const messageObj = {
      id: messageId,
      element: messageElement,
      timer: null,
      height: 0,
      options: config,
      type
    };

    // 添加到消息队列
    messages.push(messageObj);

    // 检查是否超出最大数量
    if (messages.length > config.maxCount) {
      const oldestMessage = messages[0];
      removeMessage(oldestMessage.id);
    }

    // 设置自动关闭定时器
    if (config.duration > 0 && type !== 'loading') {
      messageObj.timer = setTimeout(() => {
        removeMessage(messageId);
      }, config.duration);
    }

    return messageObj;
  } catch (error) {
    console.error('创建消息元素失败:', error);
    // 返回一个空消息对象，避免引发更多错误
    return { id: 'error-message', element: document.createElement('div') };
  }
}

/**
 * 根据配置设置消息元素位置
 * @param {HTMLElement} element - 消息元素
 * @param {object} config - 配置项
 */
function positionMessageElement (element, config) {
  try {
    // 确保配置有效
    const position = config && config.position ? config.position : 'top-center';

    // 基础样式
    Object.assign(element.style, {
      position: 'absolute',
      transition: `all ${config.animationDuration || 300}ms`,
      opacity: '0',
      overflow: 'hidden',
      textAlign: 'center',
      width: '100%'
    });

    // 根据位置设置样式
    if (safeIncludes(position, 'top')) {
      element.style.top = '0';
    } else if (safeIncludes(position, 'bottom')) {
      element.style.bottom = '0';
    }

    if (safeIncludes(position, 'center')) {
      element.style.display = 'flex';
      element.style.justifyContent = 'center';
    } else if (safeIncludes(position, 'left')) {
      element.style.textAlign = 'left';
      element.style.paddingLeft = '24px';
    } else if (safeIncludes(position, 'right')) {
      element.style.textAlign = 'right';
      element.style.paddingRight = '24px';
    }
  } catch (error) {
    console.error('设置消息元素位置失败:', error);
    // 设置默认样式以确保至少消息是可见的
    element.style.position = 'absolute';
    element.style.top = '20px';
    element.style.left = '50%';
    element.style.transform = 'translateX(-50%)';
    element.style.textAlign = 'center';
  }
}

/**
 * 移除消息
 * @param {string} messageId - 消息ID
 */
function removeMessage (messageId) {
  try {
    const index = messages.findIndex(msg => msg.id === messageId);

    if (index === -1) return;

    const messageObj = messages[index];
    const { element, timer, options } = messageObj;

    // 清除定时器
    if (timer) {
      clearTimeout(timer);
    }

    // 应用离开动画
    element.style.opacity = '0';

    // 确保options存在且有position属性
    const position = options && options.position ? options.position : 'top-center';

    // 设置变换
    if (safeIncludes(position, 'top')) {
      element.style.transform = 'translateY(-100%)';
    } else {
      element.style.transform = 'translateY(100%)';
    }

    // 动画完成后移除元素
    const animationDuration = options && options.animationDuration ? options.animationDuration : 300;

    setTimeout(() => {
      if (messageContainer && messageContainer.contains(element)) {
        messageContainer.removeChild(element);
      }

      // 从消息队列移除
      messages = messages.filter(msg => msg.id !== messageId);

      // 调整其他消息的位置
      updateMessagesPosition();
    }, animationDuration);
  } catch (error) {
    console.error('移除消息失败:', error);
    // 尝试强制清理
    try {
      const msg = messages.find(m => m.id === messageId);
      if (msg && msg.element && messageContainer) {
        messageContainer.removeChild(msg.element);
      }
      messages = messages.filter(msg => msg.id !== messageId);
    } catch (e) {
      // 忽略进一步的错误
    }
  }
}

/**
 * 更新所有消息的位置
 */
function updateMessagesPosition () {
  try {
    const container = messageContainer;
    if (!container || messages.length === 0) return;

    // 获取第一个消息的配置
    const firstMsg = messages[0];
    const config = firstMsg && firstMsg.options ? firstMsg.options : defaultConfig;
    let offset = config.top || 24;

    // 决定排序方向
    const position = config.position || 'top-center';

    // 按照位置排序消息
    if (safeIncludes(position, 'bottom')) {
      messages.sort((a, b) => (a.id > b.id ? 1 : -1));
      offset = config.top || 24;
    } else {
      messages.sort((a, b) => (a.id < b.id ? 1 : -1));
      offset = config.top || 24;
    }

    messages.forEach(msg => {
      const { element, options } = msg;
      let height = msg.height;

      // 如果没有高度，计算元素高度
      if (!height) {
        const styles = window.getComputedStyle(element);
        const marginTop = parseInt(styles.marginTop) || 0;
        const marginBottom = parseInt(styles.marginBottom) || 0;
        height = element.offsetHeight + marginTop + marginBottom;
        msg.height = height;
      }

      // 设置位置
      const msgPosition = options && options.position ? options.position : 'top-center';

      if (safeIncludes(msgPosition, 'top')) {
        element.style.top = `${offset}px`;
      } else {
        element.style.bottom = `${offset}px`;
      }

      // 更新透明度和变换
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';

      // 更新下一个消息的偏移量
      const gap = options && options.gap !== undefined ? options.gap : 8;
      offset += height + gap;
    });
  } catch (error) {
    console.error('更新消息位置失败:', error);
  }
}

/**
 * 显示消息
 * @param {any} content - 消息内容
 * @param {string} type - 消息类型
 * @param {object|number} options - 自定义选项或显示时间
 * @returns {string} 消息ID
 */
function showMessage (content, type = 'info', options = {}) {
  try {
    // 如果options是数字，视为duration
    if (typeof options === 'number') {
      options = { duration: options };
    }

    // 获取消息容器
    const container = getMessageContainer(options);

    // 创建消息元素
    const messageObj = createMessage(content, type, options);

    // 添加到容器
    container.appendChild(messageObj.element);

    // 延迟获取高度，确保DOM已渲染
    setTimeout(() => {
      // 更新所有消息位置
      updateMessagesPosition();
    }, 10);

    return messageObj.id;
  } catch (error) {
    console.error('显示消息失败:', error);
    return '';
  }
}

/**
 * 加载消息 CSS 样式
 */
function loadStyles () {
  try {
    // 检查是否已加载样式
    if (document.getElementById('ant-message-style')) return;

    const style = document.createElement('style');
    style.id = 'ant-message-style';
    style.textContent = `
      .ant-message {
        position: fixed;
        top: 8px;
        left: 0;
        width: 100%;
        pointer-events: none;
        z-index: 1010;
      }
      
      .ant-message-notice {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        background: transparent;
        margin-bottom: 8px;
        padding: 0;
        text-align: center;
        opacity: 0;
        pointer-events: none;
        max-width: 80%;
      }
      
      .ant-message-notice-content {
        display: inline-block;
        padding: 10px 16px;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 3px 6px -4px rgba(0,0,0,0.12), 0 6px 16px 0 rgba(0,0,0,0.08), 0 9px 28px 8px rgba(0,0,0,0.05);
        pointer-events: auto;
      }
      
      .ant-message-custom-content {
        display: flex;
        align-items: center;
        white-space: nowrap;
      }
      
      .ant-message-icon {
        display: inline-block;
        margin-right: 8px;
        font-size: 16px;
        line-height: 1;
        flex-shrink: 0;
      }
      
      .ant-message-text {
        display: inline-block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .ant-message-text.pre-formatted {
        white-space: pre-wrap;
        font-family: monospace;
        font-size: 13px;
        text-overflow: clip;
        overflow: visible;
      }
      
      .ant-message-info .ant-message-icon {
        color: #3b82f6;
      }
      
      .ant-message-success .ant-message-icon {
        color: #10b981;
      }
      
      .ant-message-warning .ant-message-icon {
        color: #f59e0b;
      }
      
      .ant-message-error .ant-message-icon {
        color: #ef4444;
      }
      
      .ant-message-loading .ant-message-icon {
        color: #3b82f6;
      }
      
      .loading-icon {
        animation: loadingCircle 1s infinite linear;
      }
      
      @keyframes loadingCircle {
        100% {
          transform: rotate(360deg);
        }
      }
    `;

    document.head.appendChild(style);
  } catch (error) {
    console.error('加载消息样式失败:', error);
  }
}

// 安全地加载样式
try {
  loadStyles();
} catch (error) {
  console.error('初始化消息组件失败:', error);
}

/**
 * 导出消息函数
 */
export const Message = {
  // 普通消息
  info (content, options) {
    try {
      return showMessage(content, 'info', options);
    } catch (error) {
      console.error('显示信息消息失败:', error);
      return '';
    }
  },

  // 成功消息
  success (content, options) {
    try {
      return showMessage(content, 'success', options);
    } catch (error) {
      console.error('显示成功消息失败:', error);
      return '';
    }
  },

  // 警告消息
  warning (content, options) {
    try {
      return showMessage(content, 'warning', options);
    } catch (error) {
      console.error('显示警告消息失败:', error);
      return '';
    }
  },

  // 错误消息
  error (content, options) {
    try {
      return showMessage(content, 'error', options);
    } catch (error) {
      console.error('显示错误消息失败:', error);
      // 尝试使用原生 alert 作为后备
      try {
        alert(`错误: ${content}`);
      } catch (e) {
        // 忽略
      }
      return '';
    }
  },

  // 加载消息
  loading (content, options) {
    try {
      return showMessage(content, 'loading', options);
    } catch (error) {
      console.error('显示加载消息失败:', error);
      return '';
    }
  },

  // 移除指定消息
  remove (messageId) {
    try {
      removeMessage(messageId);
    } catch (error) {
      console.error('移除消息失败:', error);
    }
  },

  // 移除所有消息
  clear () {
    try {
      const messagesToClear = [...messages];
      messagesToClear.forEach(msg => {
        removeMessage(msg.id);
      });
    } catch (error) {
      console.error('清除所有消息失败:', error);
    }
  },

  // 配置消息组件
  config (options) {
    try {
      if (options && typeof options === 'object') {
        Object.assign(defaultConfig, options);
      }
    } catch (error) {
      console.error('配置消息组件失败:', error);
    }
  },

  // 自定义消息类型
  custom (content, options = {}) {
    try {
      const customOptions = {
        ...options,
        showIcon: false
      };
      return showMessage(content, 'custom', customOptions);
    } catch (error) {
      console.error('显示自定义消息失败:', error);
      return '';
    }
  }
};

// 导出为默认模块
export default Message;