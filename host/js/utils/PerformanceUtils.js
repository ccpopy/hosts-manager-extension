/**
 * 性能优化工具
 */

/**
 * 创建防抖函数
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 等待时间(毫秒)
 * @returns {Function} 防抖后的函数
 */
export function debounce (func, wait) {
  let timeout;

  return function executedFunction (...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 创建节流函数
 * @param {Function} func - 要执行的函数
 * @param {number} limit - 间隔时间(毫秒)
 * @returns {Function} 节流后的函数
 */
export function throttle (func, limit) {
  let inThrottle;

  return function (...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 记忆化函数
 * @param {Function} func - 要记忆化的函数
 * @returns {Function} 记忆化后的函数
 */
export function memoize (func) {
  const cache = new Map();

  return function (...args) {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = func.apply(this, args);
    cache.set(key, result);

    return result;
  };
}

/**
 * 批处理DOM操作
 * @param {Function} callback - 批量操作的回调函数
 */
export function batchDOMOperations (callback) {
  // 使用requestAnimationFrame将DOM操作放在下一帧
  requestAnimationFrame(() => {
    // 使用文档片段减少重排
    const fragment = document.createDocumentFragment();

    // 执行回调，传入片段
    callback(fragment);

    // 一次性添加所有内容
    document.body.appendChild(fragment);
  });
}

/**
 * 延迟执行函数
 * @param {Function} func - 要执行的函数
 * @param {number} delay - 延迟时间(毫秒)
 */
export function delay (func, delay) {
  return setTimeout(func, delay);
}

/**
 * 检测浏览器是否支持被动事件监听
 * @returns {boolean|object} 如果支持返回{passive: true}，否则返回false
 */
export function supportsPassiveEvents () {
  let supportsPassive = false;
  try {
    const opts = Object.defineProperty({}, 'passive', {
      get: function () {
        supportsPassive = true;
        return true;
      }
    });
    window.addEventListener('test', null, opts);
    window.removeEventListener('test', null, opts);
  } catch (e) { }

  return supportsPassive ? { passive: true } : false;
}