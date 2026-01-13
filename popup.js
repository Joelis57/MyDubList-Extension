const REQUIRED_ORIGINS = [
  "https://myanimelist.net/*",
  "https://anilist.co/*",
  "https://api.mydublist.com/*",
  "https://raw.githubusercontent.com/*",
  "https://icons.duckduckgo.com/*"
];

function originLabel(origin) {
  return origin.replace("https://", "").replace("/*", "");
}

async function getMissingOrigins() {
  if (!browser.permissions?.contains) return [...REQUIRED_ORIGINS];

  const missing = [];
  for (const origin of REQUIRED_ORIGINS) {
    try {
      const ok = await browser.permissions.contains({ origins: [origin] });
      if (!ok) missing.push(origin);
    } catch {
      // If the browser rejects the check (e.g., not requestable), treat as missing.
      missing.push(origin);
    }
  }
  return missing;
}

async function refreshPermissionsUI() {
  const banner = document.getElementById("permBanner");
  const list = document.getElementById("permList");
  const btn = document.getElementById("permGrant");
  const err = document.getElementById("permError");

  if (!banner || !list || !btn || !err) return;

  const missing = await getMissingOrigins();

  if (!missing.length) {
    banner.hidden = true;
    return;
  }

  // Render missing list
  list.innerHTML = "";
  for (const o of missing) {
    const li = document.createElement("li");
    li.textContent = originLabel(o);
    list.appendChild(li);
  }

  err.hidden = true;
  err.textContent = "";
  banner.hidden = false;

  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const granted = await browser.permissions.request({ origins: missing });
      if (granted) {
        banner.hidden = true;
        reloadActiveTab();
      } else {
        err.hidden = false;
        err.textContent =
          "Permission was not granted. In Firefox: Extensions → MyDubList → Permissions / Site access.";
      }
    } catch (e) {
      err.hidden = false;
      err.textContent =
        "Could not request permissions automatically. In Firefox: Extensions → MyDubList → Permissions / Site access.";
    } finally {
      btn.disabled = false;
    }
  };
}


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

  refreshPermissionsUI();

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
