const DUBBED_ICON = chrome.runtime.getURL('assets/dubbed.svg');
const INCOMPLETE_ICON = chrome.runtime.getURL('assets/incomplete.svg');
const RAW_JSON_URL = 'https://raw.githubusercontent.com/Joelis57/MyDubList/main/final/dubbed_english.json';

const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = chrome.runtime.getURL('fonts/style.css');
document.head.appendChild(style);

function isValidAnimeLink(anchor) {
  const href = anchor.href.trim();
  const text = anchor.textContent.trim();
  const animePageRegex = /^https:\/\/myanimelist\.net\/anime\/(\d+)(\/[^\/]*)?\/?$/;

  if (!animePageRegex.test(href)) return false;
  if (!text || text.length < 2) return false;
  if (anchor.dataset.dubbedIcon === 'true') return false;

  const excluded = [
    '#horiznav_nav',
    '.spaceit_pad',
    '[itemprop="itemListElement"]'
  ];
  for (const sel of excluded) {
    if (anchor.closest(sel)) return false;
  }

  if (anchor.closest('.seasonal-anime') && anchor.closest('.title')) {
    return false;
  }

  return true;
}

function extractAnimeId(url) {
  const match = url.match(/^https:\/\/myanimelist\.net\/anime\/(\d+)/);
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
    console.error('[MyDubList] Failed to fetch dub data:', e);
    return null;
  }
}

async function addDubIconsFromList() {
  console.log('[MyDubList] Loading dub data...');
  const dubData = await fetchDubData();
  if (!dubData) return;

  const { dubbed = [], incomplete = [] } = dubData;
  const dubbedSet = new Set(dubbed);
  const incompleteSet = new Set(incomplete);

  console.log('[MyDubList] Scanning page for anime titles...');

  document.querySelectorAll('img.mydub-icon').forEach(img => img.remove());

  const anchors = document.querySelectorAll('a[href*="/anime/"]');
  anchors.forEach(anchor => {
    if (!isValidAnimeLink(anchor)) return;

    const id = extractAnimeId(anchor.href);
    if (!id) return;

    const isIncomplete = incompleteSet.has(id);
    const isDubbed = dubbedSet.has(id);
    if (!isIncomplete && !isDubbed) return;

    anchor.dataset.dubbedIcon = 'true';
    const isinRelatedSection = document.querySelector('.related-entries');
    if (!isinRelatedSection) anchor.insertAdjacentHTML('beforeend', '&nbsp;');
    anchor.appendChild(createIcon(isIncomplete, true));

    if (anchor.classList.contains('link-image')) {
      injectImageOverlayIcon(anchor, isIncomplete);
    }
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

  console.log('[MyDubList] Annotation complete.');
}

addDubIconsFromList();
