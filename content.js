const DUBBED_ICON = chrome.runtime.getURL('assets/dubbed.svg');
const INCOMPLETE_ICON = chrome.runtime.getURL('assets/incomplete.svg');
const RAW_JSON_URL = 'https://raw.githubusercontent.com/Joelis57/MyDubList/main/final/dubbed_english.json';

function isValidAnimeLink(anchor) {
  const href = anchor.href.trim();
  const text = anchor.textContent.trim();
  const animePageRegex = /^https:\/\/myanimelist\.net\/anime\/(\d+)(\/[^\/]*)?\/?$/;

  if (!animePageRegex.test(href)) return false;
  if (!text || text.length < 2) return false;

  // Prevent duplicate insertion
  if (anchor.dataset.dubbedIcon === 'true') return false;

  // Exceptions: don't inject in known unwanted sections
  const excluded = [
    '#horiznav_nav',
    '.spaceit_pad',
    '[itemprop="itemListElement"]'
  ];
  for (const sel of excluded) {
    if (anchor.closest(sel)) return false;
  }

  return true;
}

function extractAnimeId(url) {
  const match = url.match(/^https:\/\/myanimelist\.net\/anime\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function createIcon(isIncomplete = false, isLink = false) {
  const icon = document.createElement('img');
  icon.src = isIncomplete ? INCOMPLETE_ICON : DUBBED_ICON;
  icon.alt = isIncomplete ? 'incomplete' : 'dubbed';
  icon.title = isIncomplete ? 'This anime is incomplete dubbed' : 'Dubbed anime';
  icon.className = 'mydub-icon';
  return icon;
}

async function fetchDubData() {
  try {
    const res = await fetch(RAW_JSON_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch: HTTP ${res.status}`);
    }
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
    anchor.appendChild(createIcon(isIncomplete, true));
  });

  // Add icon to <h1> title if it matches
  const titleEl = document.querySelector('.title-name strong');
  if (titleEl && !document.querySelector('.title-name .mydub-icon')) {
    const idMatch = window.location.href.match(/\/anime\/(\d+)/);
    if (idMatch) {
      const animeId = parseInt(idMatch[1], 10);
      const isIncomplete = incompleteSet.has(animeId);
      const isDubbed = dubbedSet.has(animeId);
      if (isIncomplete || isDubbed) {
        titleEl.insertAdjacentElement('afterend', createIcon(isIncomplete));
      }
    }
  }

  console.log('[MyDubList] Annotation complete.');
}

addDubIconsFromList();
