document.addEventListener('DOMContentLoaded', () => {
  const openSettingsBtn = document.getElementById('open-settings');

  openSettingsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'page.html' });
    window.close();
  });
});