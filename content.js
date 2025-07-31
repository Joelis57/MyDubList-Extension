const DUBBED_ICON = chrome.runtime.getURL('assets/dubbed.svg');
const INCOMPLETE_ICON = chrome.runtime.getURL('assets/incomplete.svg');
const RAW_JSON_URL = 'https://raw.githubusercontent.com/Joelis57/MyDubList/main/final/dubbed_english.json';
const IS_DEBUG = false;

const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = chrome.runtime.getURL('fonts/style.css');
document.head.appendChild(style);

function log(...args) {
  if (IS_DEBUG) {
    console.log('[MyDubList]', ...args);
  }
}

function isValidAnimeLink(anchor) {
  const href = anchor.href.trim();
  const url = new URL(href, window.location.origin);
  const animePageRegex = /^\/anime\/(\d+)(\/[^\/]*)?\/?$/;

  log(`Checking link: ${href}`);
  if (!animePageRegex.test(url.pathname)) {
    log(`Invalid anime link: ${href}`);
    return false;
  }
  if (!anchor.textContent.trim()) {
    log(`Empty link text: ${href}`);
    return false;
  }
  if (anchor.dataset.dubbedIcon === 'true') {
    log(`Already processed link: ${href}`);
    return false;
  }

  const excluded = [
    '#horiznav_nav',
    '.spaceit_pad',
    '[itemprop="itemListElement"]',
    '.hoverinfo-contaniner'
  ];
  for (const sel of excluded) {
    if (anchor.closest(sel)) {
      log(`Excluded link: ${href} due to selector: ${sel}`);
      return false;
    }
  }

  if (anchor.closest('.seasonal-anime') && anchor.closest('.title')) {
    log(`Excluded seasonal anime link: ${href}`);
    return false;
  }

  return true;
}

function extractAnimeId(url) {
  const path = new URL(url, window.location.origin).pathname;
  const match = path.match(/^\/anime\/(\d+)/);
  log(`Extracted ID: ${match ? match[1] : 'none'} from URL: ${url}`);
  return match ? parseInt(match[1], 10) : null;
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
  if (!img) {
    log(`No image found for anchor: ${anchor.href}`);
    return;
  }

  if (anchor.querySelector('.icon-dubs-image, .icon-dubs_incomplete-image')) {
    log(`Image overlay already exists for anchor: ${anchor.href}`);
    return;
  }

  const span = document.createElement('span');
  span.className = isIncomplete ? 'icon-dubs_incomplete-image' : 'icon-dubs-image';
  span.textContent = isIncomplete ? '\ue900' : '\ue901';

  if (getComputedStyle(anchor).position === 'static') {
    anchor.style.position = 'relative';
  }

  span.classList.add('icon-dubs-hover-hide');
  anchor.appendChild(span);
  log(`Injected image overlay icon for anchor: ${anchor.href}`);
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

async function fetchDubData() {
  try {
    const res = await fetch(RAW_JSON_URL);
    if (!res.ok) throw new Error(`Failed to fetch: HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to fetch dub data:', e);
    return null;
  }
}
async function addDubIconsFromList() {
  log('Loading dub data...');
  const dubData = await fetchDubData();
  if (!dubData) return;

  const { dubbed = [], incomplete = [] } = dubData;
  const dubbedSet = new Set(dubbed);
  const incompleteSet = new Set(incomplete);

  log('Scanning page for anime titles...');

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
    log(`Processing anchor: ${fullHref}`);

    if (!isValidAnimeLink(anchor)) return;

    const id = extractAnimeId(fullHref);
    if (!id) return;

    const isIncomplete = incompleteSet.has(id);
    const isDubbed = dubbedSet.has(id);
    if (!isIncomplete && !isDubbed) return;

    anchor.dataset.dubbedIcon = 'true';

    if (anchor.querySelector('img')) {
      log(`ID ${id} has an image`);
      injectImageOverlayIcon(anchor, isIncomplete);
    } else if (anchor.classList.contains('link-image')) {
      log(`ID ${id} has a seasonal image`);
      injectImageOverlayIconSeasonal(anchor, isIncomplete);
    } else {
      const isinRelatedSection = document.querySelector('.related-entries');
      if (!isinRelatedSection) anchor.insertAdjacentHTML('beforeend', '&nbsp;');
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

chrome.storage.local.get('mydublistEnabled', (data) => {
  const isEnabled = data.mydublistEnabled ?? true;
  if (!isEnabled) {
    log('MyDubList is disabled — skipping annotation');
    return;
  }

  addDubIconsFromList();

  const observer = new MutationObserver(() => {
    addDubIconsFromList();
  });
  observer.observe(document.body, { childList: true, subtree: true });
});
