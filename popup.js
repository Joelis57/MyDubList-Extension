import './mwc/switch/switch.js';

window.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('enabled');
  chrome.storage.sync.get(['enabled'], ({ enabled }) => {
    toggle.selected = enabled ?? true;
  });

  toggle.addEventListener('input', () => {
    chrome.storage.sync.set({ enabled: toggle.selected });
  });
});
