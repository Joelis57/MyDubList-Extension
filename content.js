const DUBBED_ICON = chrome.runtime.getURL('assets/dubbed.svg');
const INCOMPLETE_ICON = chrome.runtime.getURL('assets/incomplete.svg');
const IS_DEBUG = false;

const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = chrome.runtime.getURL('fonts/style.css');
document.head.appendChild(style);

function log(...args) {
  if (IS_DEBUG) console.log('[MyDubList]', ...args);
}

function isValidAnimeLink(anchor) {
  const href = anchor.href.trim();
  const url = new URL(href, window.location.origin);
  const animePageRegex = /^\/anime\/(\d+)(\/[^\/]*)?\/?$/;

  log(`Checking link: ${href}`);
  if (!animePageRegex.test(url.pathname)) return false;
  if (!anchor.textContent.trim()) return false;
  if (anchor.dataset.dubbedIcon === 'true') return false;

  const excluded = ['#horiznav_nav', '.spaceit_pad', '[itemprop="itemListElement"]', '.hoverinfo-contaniner'];
  for (const sel of excluded) {
    if (anchor.closest(sel)) return false;
  }

  if (anchor.closest('.seasonal-anime') && anchor.closest('.title')) return false;

  return true;
}

function extractAnimeId(url) {
  const path = new URL(url, window.location.origin).pathname;
  const match = path.match(/^\/anime\/(\d+)/);
  const id = match ? parseInt(match[1], 10) : null;
  log(`Extracted ID: ${id} from URL: ${url}`);
  return id;
}

function createIcon(isIncomplete = false, isLink = false) {
  const span = document.createElement('span');
  const baseClass = isIncomplete ? 'icon-dubs_incomplete' : 'icon-dubs';
  const styleClass = isLink ? 'icon-dubs-link' : 'icon-dubs-title';
  span.className = `${baseClass} ${styleClass}`;
  return span;
}

function injectImageOverlayIcon(anchor, isIncomplete) {
  const img = anchor.querySelector('img');
  if (!img) return;

  if (anchor.querySelector('.icon-dubs-image, .icon-dubs_incomplete-image')) return;

  const span = document.createElement('span');
  span.className = isIncomplete ? 'icon-dubs_incomplete-image' : 'icon-dubs-image';
  span.textContent = isIncomplete ? '\ue900' : '\ue901';

  if (getComputedStyle(anchor).position === 'static') {
    anchor.style.position = 'relative';
  }

  span.classList.add('icon-dubs-hover-hide');
  anchor.appendChild(span);
}

function injectImageOverlayIconSeasonal(anchor, isIncomplete) {
  const parent = anchor.closest('.image');
  if (!parent || parent.querySelector('.icon-dubs-image')) return;

  const span = document.createElement('span');
  span.className = 'icon-dubs-image';
  span.textContent = isIncomplete ? '\ue900' : '\ue901';
  parent.style.position = 'relative';
  parent.appendChild(span);
}

function applyFilter(anchor, isDubbed, isIncomplete, filter) {
  const shouldHide = (
    (filter === 'dubbed' && !isDubbed && !isIncomplete) ||
    (filter === 'undubbed' && (isDubbed || isIncomplete))
  );

  if (!shouldHide) return;

  const path = window.location.pathname;

  if (path.startsWith('/anime/season')) {
    const container = anchor.closest('.seasonal-anime');
    if (container) {
      log(`Hiding seasonal item for filter: ${filter}`);
      container.style.display = 'none';
    }
  } else if (path.startsWith('/topanime') || path.startsWith('/anime.php')) {
    const row = anchor.closest('tr');
    if (row) {
      log(`Hiding row for filter: ${filter}`);
      row.style.display = 'none';
    } else {
      const detail = anchor.closest('.detail');
      if (detail) {
        log(`Hiding detail for filter: ${filter}`);
        detail.style.display = 'none';
      }
    }
  }
}

async function fetchDubData(language) {
  const CACHE_KEY = `dubData_${language}`;
  const CACHE_TTL_MS = 60 * 60 * 1000;

  try {
    const cached = await new Promise((resolve) =>
      chrome.storage.local.get(CACHE_KEY, resolve)
    );

    const entry = cached[CACHE_KEY];
    const now = Date.now();

    if (entry && entry.timestamp && now - entry.timestamp < CACHE_TTL_MS) {
      log(`Using cached data for language: ${language}`);
      return entry.data;
    }

    const url = `https://raw.githubusercontent.com/Joelis57/MyDubList/main/final/dubbed_${language}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch: HTTP ${res.status}`);
    const json = await res.json();

    const saveObj = {};
    saveObj[CACHE_KEY] = { timestamp: now, data: json };
    chrome.storage.local.set(saveObj);

    log(`Fetched and cached data for language: ${language}`);
    return json;
  } catch (e) {
    console.error('Failed to fetch dub data:', e);
    return null;
  }
}

async function addDubIconsFromList(dubData, filter) {
  const { dubbed = [], incomplete = [] } = dubData;
  const dubbedSet = new Set(dubbed);
  const incompleteSet = new Set(incomplete);

  const anchors = [...document.querySelectorAll('a[href]')].filter(anchor => {
    try {
      const url = new URL(anchor.getAttribute('href'), window.location.origin);
      return url.pathname.startsWith('/anime/');
    } catch {
      return false;
    }
  });

  anchors.forEach(anchor => {
    const fullHref = new URL(anchor.getAttribute('href'), window.location.origin).href;

    if (!isValidAnimeLink(anchor)) return;

    const id = extractAnimeId(fullHref);
    if (!id) return;

    const isIncomplete = incompleteSet.has(id);
    const isDubbed = dubbedSet.has(id);

    applyFilter(anchor, isDubbed, isIncomplete, filter);

    if (!isIncomplete && !isDubbed) return;

    anchor.dataset.dubbedIcon = 'true';

    if (anchor.querySelector('img')) {
      injectImageOverlayIcon(anchor, isIncomplete);
    } else if (anchor.classList.contains('link-image')) {
      injectImageOverlayIconSeasonal(anchor, isIncomplete);
    } else {
      const anchorText = anchor.textContent || '';
      if (!/\s$/.test(anchorText)) {
        anchor.insertAdjacentHTML('beforeend', '&nbsp;');
      }
      anchor.appendChild(createIcon(isIncomplete, true));
    }

    log(`Icon added for ID: ${id}`);
  });

  const titleEl = document.querySelector('.title-name strong');
  if (titleEl && !document.querySelector('.title-name .icon-dubs, .title-name .icon-dubs_incomplete')) {
    const idMatch = window.location.href.match(/\/anime\/(\d+)/);
    if (idMatch) {
      const animeId = parseInt(idMatch[1], 10);
      const isIncomplete = incompleteSet.has(animeId);
      const isDubbed = dubbedSet.has(animeId);
      if (isIncomplete || isDubbed) {
        titleEl.insertAdjacentElement('afterend', createIcon(isIncomplete, false, true));
      }
    }
  }

  log('Annotation complete.');
}

chrome.storage.local.get(['mydublistEnabled', 'mydublistLanguage', 'mydublistFilter'], async (data) => {
  const isEnabled = data.mydublistEnabled ?? true;
  const filter = data.mydublistFilter || 'all';
  const language = data.mydublistLanguage;

  if (!language) {
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('fr')) language = 'french';
    else if (browserLang.startsWith('de')) language = 'german';
    else if (browserLang.startsWith('he')) language = 'hebrew';
    else if (browserLang.startsWith('hu')) language = 'hungarian';
    else if (browserLang.startsWith('it')) language = 'italian';
    else if (browserLang.startsWith('ja')) language = 'japanese';
    else if (browserLang.startsWith('ko')) language = 'korean';
    else if (browserLang.startsWith('zh')) language = 'mandarin';
    else if (browserLang.startsWith('pt')) language = 'portuguese_br';
    else if (browserLang.startsWith('es')) language = 'spanish';
    else language = 'english';

    chrome.storage.local.set({ mydublistLanguage: language });
    log(`Detected browser language, defaulting to: ${language}`);
  }

  if (!isEnabled) {
    log('MyDubList is disabled — skipping annotation');
    return;
  }

  const dubData = await fetchDubData(language);
  if (!dubData) return;

  addDubIconsFromList(dubData, filter);

  const observer = new MutationObserver(() => {
    addDubIconsFromList(dubData, filter);
  });
  observer.observe(document.body, { childList: true, subtree: true });
});
