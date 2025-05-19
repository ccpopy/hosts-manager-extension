import App from './app.js';
import StateService from './services/StateService.js';

/**
 * 当DOM加载完成时初始化应用
 */
document.addEventListener('DOMContentLoaded', async () => {
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    console.error('App container not found');
    return;
  }

  // 初始化状态服务
  await StateService.initialize();

  // 初始化应用
  const app = new App(appContainer);
  await app.init();
});