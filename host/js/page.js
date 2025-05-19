import App from './app.js';
import StorageService from './services/StorageService.js';

/**
 * 当DOM加载完成时初始化应用
 */
document.addEventListener('DOMContentLoaded', async () => {
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    console.error('App container not found');
    return;
  }

  // 初始化应用
  const app = new App(appContainer);
  await app.init();

  // 监听存储变化
  StorageService.onChanged((changes, namespace) => {
    // 只有在非hosts相关的变化时才重新渲染整个页面
    if (changes.showAddGroupForm || changes.socketProxy) {
      // 对于添加分组表单和Socket代理的变化由各自的页面处理，不需要在这里额外处理
    }
  });
});