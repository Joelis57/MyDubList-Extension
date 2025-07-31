const ICON_URL = chrome.runtime.getURL('assets/dubbed.svg');

function isValidAnimeLink(anchor) {
  const href = anchor.href.trim();
  const text = anchor.textContent.trim();
  const animePageRegex = /^https:\/\/myanimelist\.net\/anime\/\d+(\/[^\/]*)?\/?$/;

  if (!animePageRegex.test(href)) return false;
  if (!text || text.length < 2) return false;

  // Prevent duplicate insertion
  if (anchor.dataset.dubbedIcon === 'true') return false;

  // Exceptions: don't inject in known unwanted sections
  const excluded = [
    '#horiznav_nav',               // nav menus (corrected ID)
    '.spaceit_pad',                // info block items like genres, studios
    '[itemprop="itemListElement"]' // breadcrumbs
  ];
  for (const sel of excluded) {
    if (anchor.closest(sel)) return false;
  }

  return true;
}

function addDubIcons() {
  console.log('[MyDubList] Scanning page for anime titles...');

  // Remove all existing icons
  document.querySelectorAll('img.mydub-icon').forEach(img => img.remove());

  // Scan all anchor tags
  const anchors = document.querySelectorAll('a[href*="/anime/"]');
  anchors.forEach(anchor => {
    if (!isValidAnimeLink(anchor)) return;

    anchor.dataset.dubbedIcon = 'true';
    const icon = document.createElement('img');
    icon.src = ICON_URL;
    icon.alt = 'dubbed';
    icon.title = 'Dubbed anime';
    icon.className = 'mydub-icon';
    anchor.appendChild(icon);
  });

  // Add icon next to the <h1> title
  const titleEl = document.querySelector('.title-name strong');
  if (titleEl && !document.querySelector('.title-name .mydub-icon')) {
    const icon = document.createElement('img');
    icon.src = ICON_URL;
    icon.alt = 'dubbed';
    icon.title = 'Dubbed anime';
    icon.className = 'mydub-icon';
    titleEl.insertAdjacentElement('afterend', icon);
  }
}

addDubIcons();
