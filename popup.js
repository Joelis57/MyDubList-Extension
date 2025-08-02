function reloadActiveTab() {
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs[0]?.id) {
      browser.tabs.reload(tabs[0].id);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const enabledCheckbox = document.getElementById('enabled');
  const languageSelect = document.getElementById('language');
  const styleSelect = document.getElementById('style');
  const filterSelect = document.getElementById('filter');

  browser.storage.local.get(
    ['mydublistEnabled', 'mydublistLanguage', 'mydublistStyle', 'mydublistFilter']
    .then((data) => {
      enabledCheckbox.checked = data.mydublistEnabled ?? true;
      languageSelect.value = data.mydublistLanguage || 'english';
      styleSelect.value = data.mydublistStyle || 'style_1';
      filterSelect.value = data.mydublistFilter || 'all';
    }
  );

  enabledCheckbox.addEventListener('change', () => {
    browser.storage.local.set({ mydublistEnabled: enabledCheckbox.checked }, reloadActiveTab);
  });

  languageSelect.addEventListener('change', () => {
    const newLang = languageSelect.value;

    browser.storage.local.get('mydublistLanguage').then((data) => {
      const oldLang = data.mydublistLanguage;
      if (oldLang && oldLang !== newLang) {
        browser.storage.local.remove(`dubData_${oldLang}`);
      }
    });

    browser.storage.local.set({ mydublistLanguage: newLang }, reloadActiveTab);
    languageSelect.blur();
  });

  styleSelect.addEventListener('change', () => {
    browser.storage.local.set({ mydublistStyle: styleSelect.value }, reloadActiveTab);
    styleSelect.blur();
  });

  filterSelect.addEventListener('change', () => {
    browser.storage.local.set({ mydublistFilter: filterSelect.value }, reloadActiveTab);
    filterSelect.blur();
  });
});
