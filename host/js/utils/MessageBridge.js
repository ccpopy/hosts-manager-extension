/**
 * 消息传递桥接工具
 * 处理与 Service Worker 的通信，包含重试机制
 */
export default class MessageBridge {
  static MAX_RETRIES = 3;
  static RETRY_DELAY = 1000;
  static TIMEOUT = 10000;

  /**
   * 发送消息到 Service Worker
   * @param {Object} message - 消息对象
   * @param {Object} options - 选项
   * @returns {Promise<Object>} - 响应对象
   */
  static async sendMessage(message, options = {}) {
    const {
      maxRetries = this.MAX_RETRIES,
      retryDelay = this.RETRY_DELAY,
      timeout = this.TIMEOUT
    } = options;

    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 尝试激活 Service Worker
        await this.ensureServiceWorkerActive();
        
        // 发送消息
        const response = await this.sendMessageWithTimeout(message, timeout);
        
        if (response && response.success) {
          return response;
        }
        
        if (response && response.error) {
          throw new Error(response.error);
        }
        
        throw new Error('Invalid response from background script');
      } catch (error) {
        lastError = error;
        
        // 如果不是最后一次尝试，等待后重试
        if (attempt < maxRetries - 1) {
          await this.delay(retryDelay * (attempt + 1));
        }
      }
    }

    throw new Error(`Failed to send message after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * 确保 Service Worker 处于活跃状态
   */
  static async ensureServiceWorkerActive() {
    try {
      // 尝试获取 Service Worker
      const registration = await navigator.serviceWorker?.ready;
      
      if (registration?.active) {
        return;
      }
    } catch (error) {
      // 忽略错误，继续尝试
    }

    // 通过访问存储来激活 Service Worker
    return new Promise((resolve) => {
      chrome.storage.local.get(null, () => {
        setTimeout(resolve, 100);
      });
    });
  }

  /**
   * 发送消息
   */
  static sendMessageWithTimeout(message, timeout) {
    return new Promise((resolve, reject) => {
      let timeoutId;
      let resolved = false;

      // 设置超时
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Message timeout'));
        }
      }, timeout);

      // 发送消息
      chrome.runtime.sendMessage(message, (response) => {
        if (resolved) return;
        
        resolved = true;
        clearTimeout(timeoutId);

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * 延迟函数
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 更新代理设置的专用方法
   */
  static async updateProxySettings() {
    try {
      const response = await this.sendMessage(
        { action: 'updateProxySettings' },
        { 
          maxRetries: 5,
          retryDelay: 1500,
          timeout: 15000
        }
      );

      return response;
    } catch (error) {
      throw new Error(`代理更新失败: ${error.message}`);
    }
  }
}