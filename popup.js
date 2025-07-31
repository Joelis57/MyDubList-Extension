document.addEventListener('DOMContentLoaded', () => {
  const enabledCheckbox = document.getElementById('enabled');

  // Load saved state
  chrome.storage.local.get('mydublistEnabled', (data) => {
    enabledCheckbox.checked = data.mydublistEnabled ?? true;
  });

  // Save state when changed
  enabledCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ mydublistEnabled: enabledCheckbox.checked });
  });
});
  