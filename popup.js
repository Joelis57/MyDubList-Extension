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
  const confidenceSelect = document.getElementById('confidence');

  browser.storage.local.get(['mydublistEnabled', 'mydublistLanguage', 'mydublistStyle', 'mydublistFilter', 'mydublistConfidence'])
    .then((data) => {
      enabledCheckbox.checked = data.mydublistEnabled ?? true;
      languageSelect.value = data.mydublistLanguage || 'english';
      filterSelect.value = data.mydublistFilter || 'all';
      confidenceSelect.value = data.mydublistConfidence || 'low';
      styleSelect.value = data.mydublistStyle || 'style_1';
    });

  enabledCheckbox.addEventListener('change', () => {
    browser.storage.local.set({ mydublistEnabled: enabledCheckbox.checked })
      .then(reloadActiveTab);
  });

  languageSelect.addEventListener('change', () => {
    const newLang = languageSelect.value;

    browser.storage.local.get('mydublistLanguage').then((data) => {
      const oldLang = data.mydublistLanguage;
      if (oldLang && oldLang !== newLang) {
        browser.storage.local.get(null).then((all) => {
          const keysToRemove = Object.keys(all).filter((k) =>
            k === `dubData_${oldLang}` || k.startsWith(`dubData_${oldLang}_`)
          );
          if (keysToRemove.length) browser.storage.local.remove(keysToRemove);
        });
      }
    });

    browser.storage.local.set({ mydublistLanguage: newLang })
      .then(reloadActiveTab);
    languageSelect.blur();
  });

  styleSelect.addEventListener('change', () => {
    browser.storage.local.set({ mydublistStyle: styleSelect.value })
      .then(reloadActiveTab);
    styleSelect.blur();
  });

  filterSelect.addEventListener('change', () => {
    browser.storage.local.set({ mydublistFilter: filterSelect.value })
      .then(reloadActiveTab);
    filterSelect.blur();
  });

  confidenceSelect.addEventListener('change', () => {
    browser.storage.local.set({ mydublistConfidence: confidenceSelect.value })
      .then(reloadActiveTab);
    confidenceSelect.blur();
  });
});
