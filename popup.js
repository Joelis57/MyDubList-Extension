function reloadActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.reload(tabs[0].id);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const enabledCheckbox = document.getElementById('enabled');
  const languageSelect = document.getElementById('language');
  const styleSelect = document.getElementById('style');
  const filterSelect = document.getElementById('filter');

  chrome.storage.local.get(
    ['mydublistEnabled', 'mydublistLanguage', 'mydublistStyle', 'mydublistFilter'],
    (data) => {
      enabledCheckbox.checked = data.mydublistEnabled ?? true;
      languageSelect.value = data.mydublistLanguage || 'english';
      styleSelect.value = data.mydublistStyle || 'style_1';
      filterSelect.value = data.mydublistFilter || 'all';
    }
  );

  enabledCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ mydublistEnabled: enabledCheckbox.checked });
  });

  languageSelect.addEventListener('change', () => {
    const newLang = languageSelect.value;

    chrome.storage.local.get('mydublistLanguage', (data) => {
      const oldLang = data.mydublistLanguage;
      if (oldLang && oldLang !== newLang) {
        chrome.storage.local.remove(`dubData_${oldLang}`);
      }
    });

    chrome.storage.local.set({ mydublistLanguage: newLang }, reloadActiveTab);
    languageSelect.blur();
  });

  styleSelect.addEventListener('change', () => {
    chrome.storage.local.set({ mydublistStyle: styleSelect.value });
    styleSelect.blur();
  });

  filterSelect.addEventListener('change', () => {
    chrome.storage.local.set({ mydublistFilter: filterSelect.value }, reloadActiveTab);
    filterSelect.blur();
  });
});
