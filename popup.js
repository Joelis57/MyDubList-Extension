document.addEventListener('DOMContentLoaded', () => {
  const enabledCheckbox = document.getElementById('enabled');
  const languageSelect = document.getElementById('language');
  const styleSelect = document.getElementById('style');
  const filterSelect = document.getElementById('filter');

  // Load all saved settings
  chrome.storage.local.get(
    ['mydublistEnabled', 'mydublistLanguage', 'mydublistStyle', 'mydublistFilter'],
    (data) => {
      enabledCheckbox.checked = data.mydublistEnabled ?? true;
      languageSelect.value = data.mydublistLanguage || 'english';
      styleSelect.value = data.mydublistStyle || 'style_1';
      filterSelect.value = data.mydublistFilter || 'all';
    }
  );

  // Save enabled toggle
  enabledCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ mydublistEnabled: enabledCheckbox.checked });
  });

  // Save language selection
  languageSelect.addEventListener('change', () => {
    const newLang = languageSelect.value;

    // Remove old cached language data if needed
    chrome.storage.local.get('mydublistLanguage', (data) => {
      const oldLang = data.mydublistLanguage;
      if (oldLang && oldLang !== newLang) {
        chrome.storage.local.remove(`dubData_${oldLang}`);
      }
    });

    // Save new language setting
    chrome.storage.local.set({ mydublistLanguage: newLang }, () => {
      // Reload the active tab to apply changes
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.reload(tabs[0].id);
        }
      });
    });

    languageSelect.blur(); // remove focus glow
  });


  // Save style selection
  styleSelect.addEventListener('change', () => {
    chrome.storage.local.set({ mydublistStyle: styleSelect.value });
    styleSelect.blur();
  });

  // Save filter selection
  filterSelect.addEventListener('change', () => {
    chrome.storage.local.set({ mydublistFilter: filterSelect.value });
    filterSelect.blur();
  });
});
