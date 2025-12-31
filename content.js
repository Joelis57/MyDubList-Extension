const IS_DEBUG = false;

const API_BASE = 'https://api.mydublist.com';
const PROVIDER_ORDER = ['MAL','AniList','ANN','aniSearch','AnimeSchedule','Kitsu','HiAnime','Kenny','Manual','NSFW'];
const PROVIDER_LABEL = { MAL:'MyAnimeList', AniList:'AniList', ANN:'Anime News Network', aniSearch:'aniSearch', AnimeSchedule:'AnimeSchedule', Kitsu:'Kitsu', HiAnime:'HiAnime', Kenny:'Kenny Forum', Manual:'Manual', NSFW:'NSFW' };
const FAVICON_DOMAIN = { HiAnime:'hianime.to', AniList:'anilist.co', ANN:'animenewsnetwork.com', aniSearch:'anisearch.com', AnimeSchedule:'animeschedule.net', Kitsu:'kitsu.io', MAL:'myanimelist.net', Kenny:'myanimelist.net', Manual:'mydublist.com', NSFW:null };
const NSFW_ICON = "data:image/svg+xml;utf8, <svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'> <circle cx='32' cy='32' r='30' fill='%23e11d48'/> <g transform='translate(33.5,32)'> <text x='0' y='0' dy='.35em' text-anchor='middle' font-size='26' font-weight='700' fill='white' font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif'>18+</text> </g> </svg>";
function faviconUrlFor(prov){ const d=FAVICON_DOMAIN[prov]; if(prov==='NSFW') return NSFW_ICON; return d?`https://icons.duckduckgo.com/ip3/${d}.ico`:null; }

const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = browser.runtime.getURL('fonts/style.css');
document.head.appendChild(style);

function log(...args) {
  if (IS_DEBUG) console.log('[MyDubList]', ...args);
}

function isValidAnimeLink(anchor) {
  const href = anchor.href.trim();
  const url = new URL(href, window.location.origin);
  const animePageRegex = /^\/anime\/(\d+)(\/[^\/]*)?\/?$/;
  const animePhpRegex = /^\/anime\.php\?id=(\d+)/;

  log(`Checking link: ${href}`);
  if (!animePageRegex.test(url.pathname) && !animePhpRegex.test(url.pathname + url.search)) return false;
  if (!anchor.textContent.trim() && !isTileUnit(anchor)) return false; // has to have text except for tile units
  if (anchor.dataset.dubbedIcon === 'true') return false;
  log(`Basic checks passed: ${href}`);

  const excluded = ['#horiznav_nav', '.spaceit_pad', '[itemprop="itemListElement"]', '.hoverinfo-contaniner'];
  for (const sel of excluded) {
    if (anchor.closest(sel)) {
      log(`Excluded because of ${sel}: ${href}`);
      return false;
    }
  }

  if (anchor.closest('.seasonal-anime') && anchor.closest('.title')) {
    log(`Excluded seasonal: ${href}`);
    return false;
  }

  return true;
}

function extractAnimeId(url) {
  const urlObj = new URL(url, window.location.origin);
  const match = urlObj.pathname.match(/^\/anime\/(\d+)/) ?? (urlObj.pathname + urlObj.search).match(/^\/anime\.php\?id=(\d+)/);
  const id = match ? parseInt(match[1], 10) : null;
  log(`Extracted ID: ${id} from URL: ${url}`);
  return id;
}

function createIcon(isIncomplete = false, isLink = false, style = 'style_1') {
  const base = isIncomplete ? `icon-incomplete_${style}` : `icon-dubs_${style}`;
  const typeClass = isLink ? 'icon-dubs-link' : 'icon-dubs-title';
  const span = document.createElement('span');
  span.className = `mydublist-icon ${base} ${typeClass}`;
  return span;
}

// Icon badge sizing and helpers

const ICON_CFG = {
  minFont: 13,
  maxFont: 50,
  perPx: 0.14,
  widthCap: 220, // cap for container-based width (row anchors can be very wide)
  defaultW: 167, // last-resort width when all reads are 0
  minUsableW: 40, // used by background sizing box chooser

  padYEm: 0.17,
  padXEm: 0.24,
  offsetEm: 0.30,
  radiusEm: 0.30
};

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function getRenderedImgWidth(img) {
  // Prefer the displayed width
  let w = img.getBoundingClientRect().width;
  if (!w) w = img.clientWidth;
  if (!w) {
    // HTML width attribute (often present on MAL thumbs)
    const aw = parseFloat(img.getAttribute('width') || '');
    if (aw) w = aw;
  }
  return w || 0;
}

function getRenderedElWidth(el) {
  return el.getBoundingClientRect().width || el.clientWidth || parseFloat(getComputedStyle(el).width) || 0;
}

//if there is an <img>, use its width; otherwise use the container width
function sizeIcon(span, container, img) {
  let w = img ? getRenderedImgWidth(img) : 0;

  if (!w) w = getRenderedElWidth(container);
  if (w > ICON_CFG.widthCap) w = ICON_CFG.widthCap;
  if (w < 1) w = ICON_CFG.defaultW; // last resort

  const fs = clamp(Math.round(w * ICON_CFG.perPx), ICON_CFG.minFont, ICON_CFG.maxFont);

  span.style.fontSize = fs + 'px';
  span.style.padding  = `${Math.round(fs * ICON_CFG.padYEm)}px ${Math.round(fs * ICON_CFG.padXEm)}px`;
  const offset = Math.round(fs * ICON_CFG.offsetEm);
  span.style.top = offset + 'px';
  span.style.right = offset + 'px';
  span.style.borderRadius = Math.round(fs * ICON_CFG.radiusEm) + 'px';
}

function createIconSpan(isIncomplete, style) {
  const span = document.createElement('span');
  span.className = 'icon-dubs-image mydublist-icon';
  span.classList.add(isIncomplete ? `icon-incomplete_${style}` : `icon-dubs_${style}`);
  return span;
}

// Observe containers (.image or anchor) for resize
const mdlIconRO = new ResizeObserver(entries => {
  for (const entry of entries) {
    const container = entry.target;
    const spans = container.querySelectorAll(':scope .mydublist-icon');
    if (!spans.length) continue;
    const img = container.querySelector('img');
    spans.forEach(span => sizeIcon(span, container, img));
  }
});

// Observe <img> elements so width changes (lazyload, density swap) rescale the badge
const mdlImgRO = new ResizeObserver(entries => {
  for (const entry of entries) {
    const img = entry.target;
    const container = img.closest('.image') || img.closest('a') || img.parentElement;
    if (!container) continue;

    const span =
      container.querySelector('.mydublist-icon') ||
      container.parentElement?.querySelector('.mydublist-icon');

    if (!span) continue;

    sizeIcon(span, container, img);
  }
});

function maybeHideOnHover(anchor, span) {
  if (anchor.querySelector('span.users, span.info')) {
    span.classList.add('icon-dubs-hover-hide');
  }
}

// Retry until size stabilizes (helps with lazyload / layout settling)
function scheduleFinalSizing(container, span, img) {
  let tries = 8;
  let lastFs = 0;

  const tick = () => {
    sizeIcon(span, container, img);
    const fs = parseFloat(span.style.fontSize) || 0;

    if (--tries > 0 && Math.abs(fs - lastFs) >= 0.5) {
      lastFs = fs;
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
  setTimeout(() => sizeIcon(span, container, img), 150);
  setTimeout(() => sizeIcon(span, container, img), 300);
}

// Background sizing helpers
function pickSizingBoxForBackground(anchor) {
  // Prefer a wrapper that actually has the thumbnail’s size
  const candidates = [
    anchor,
    anchor.closest('.image'),
    anchor.closest('.picSurround'),
    anchor.parentElement
  ].filter(Boolean);

  for (const el of candidates) {
    const w = el.getBoundingClientRect().width;
    const h = el.getBoundingClientRect().height;
    if (Math.max(w, h) >= ICON_CFG.minUsableW) return el;
  }
  // Fallback: climb a little
  let el = anchor.parentElement, steps = 0;
  while (el && steps++ < 4) {
    const w = el.getBoundingClientRect().width;
    const h = el.getBoundingClientRect().height;
    if (Math.max(w, h) >= ICON_CFG.minUsableW) return el;
    el = el.parentElement;
  }
  return anchor;
}

// Make inline anchors measurable without changing flow too much
function ensureMeasurableAnchor(anchor) {
  const cs = getComputedStyle(anchor);
  if (cs.display === 'inline') {
    anchor.style.display = 'inline-block'; // lets width/height/computed width take effect
  }
}

// 1) Generic image-in-anchor
function injectImageOverlayIcon(anchor, isIncomplete, style = 'style_1') {
  const img = anchor.querySelector('img');
  if (!img) return;
  if (anchor.querySelector('.mydublist-icon')) return;

  const span = createIconSpan(isIncomplete, style);

  if (getComputedStyle(anchor).position === 'static') {
    anchor.style.position = 'relative';
  }

  maybeHideOnHover(anchor, span);
  anchor.appendChild(span);

  // Prefer the .image wrapper for sizing/observing if available
  const box = anchor.closest('.image') || anchor;

  sizeIcon(span, box, img);

  if (!img.complete) {
    img.addEventListener('load', () => sizeIcon(span, box, img), { once: true });
  }

  scheduleFinalSizing(box, span, img);
  mdlIconRO.observe(box);
  if (box !== anchor) mdlIconRO.observe(anchor);
  mdlImgRO.observe(img);
}

// 2) Seasonal (.image wrapper as container)
function injectImageOverlayIconSeasonal(anchor, isIncomplete, style = 'style_1') {
  const parent = anchor.closest('.image');
  if (!parent || parent.querySelector('.icon-dubs-image')) return;

  const span = createIconSpan(isIncomplete, style);
  parent.style.position = 'relative';

  maybeHideOnHover(anchor, span);
  parent.appendChild(span);

  const img = anchor.querySelector('img') || parent.querySelector('img') || null;

  sizeIcon(span, parent, img);
  if (img && !img.complete) {
    img.addEventListener('load', () => sizeIcon(span, parent, img), { once: true });
  }
  scheduleFinalSizing(parent, span, img);
  mdlIconRO.observe(parent);
  if (img) mdlImgRO.observe(img);
}

// 3) Background-image case (anchor as container)
function injectImageOverlayIconBackground(anchor, isIncomplete, style = 'style_1') {
  if (anchor.querySelector('.mydublist-icon')) return;

  const span = createIconSpan(isIncomplete, style);

  if (getComputedStyle(anchor).position === 'static') {
    anchor.style.position = 'relative';
  }
  maybeHideOnHover(anchor, span);
  anchor.appendChild(span);

  ensureMeasurableAnchor(anchor);

  const box = pickSizingBoxForBackground(anchor);

  sizeIcon(span, box, null);
  scheduleFinalSizing(box, span, null);
  mdlIconRO.observe(box);
  if (box !== anchor) mdlIconRO.observe(anchor);
}

function applyFilter(anchor, isDubbed, isIncomplete, filter) {
  const shouldHide = (
    (filter === 'dubbed' && !isDubbed && !isIncomplete) ||
    (filter === 'undubbed' && (isDubbed || isIncomplete))
  );

  if (!shouldHide) return;

  const path = window.location.pathname;
  if (path.startsWith('/anime/season') || path.startsWith('/anime/genre')) {
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
  } else if (path === '/') {
    const container = anchor.closest('li');
    if (container) {
      log(`Hiding homepage item for filter: ${filter}`);
      container.style.display = 'none';
    } else if (hasBackgroundImage(anchor)) {
      log(`Hiding homepage anchor for filter: ${filter}`);
      anchor.style.display = 'none';
    }
  }
}

async function fetchDubData(language, confidence = 'low') {
  const CACHE_KEY = `dubData_${language}_${confidence}`;
  const OLD_CACHE_KEY = `dubData_${language}`;
  const CACHE_TTL_MS = 60 * 60 * 1000;

  try {
    const cached = await browser.storage.local.get(CACHE_KEY);
    const entry = cached[CACHE_KEY];
    const now = Date.now();

    if (entry && entry.timestamp && now - entry.timestamp < CACHE_TTL_MS) {
      log(`Using cached data for language=${language}, confidence=${confidence}`);
      return entry.data;
    }

    const url = `https://raw.githubusercontent.com/Joelis57/MyDubList/main/dubs/confidence/${confidence}/dubbed_${language}.json`;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to fetch: HTTP ${res.status}`);
    const json = await res.json();

    await browser.storage.local.set({
      [CACHE_KEY]: { timestamp: now, data: json }
    });

    browser.storage.local.remove(OLD_CACHE_KEY).catch(() => {});

    log(`Fetched and cached for language=${language}, confidence=${confidence}`);
    return json;
  } catch (e) {
    console.error('Failed to fetch dub data:', e);
    return null;
  }
}

function isTileUnit(anchor) {
  return anchor.parentElement && anchor.parentElement.classList.contains('tile-unit');
}

function hasBackgroundImage(anchor) {
  // Check for inline style
  const inlineBg = anchor.style.backgroundImage;
  if (inlineBg && inlineBg !== 'none') return true;

  // Check computed style
  const computedBg = getComputedStyle(anchor).backgroundImage;
  if (computedBg && computedBg !== 'none' && computedBg.includes('url')) return true;

  // Check for data-bg attribute (common in lazy-loaded images)
  if (anchor.hasAttribute('data-bg')) return true;

  // Check for tile units used in the mobile version of MAL
  if (isTileUnit(anchor)) return true;
  return false;
}

async function insertMdlSourcesSection(language){
  try{
    const m = window.location.pathname.match(/^\/anime\/(\d+)/) ?? (window.location.pathname + window.location.search).match(/^\/anime\.php\?id=(\d+)/);
    if(!m) return;
    const malId = parseInt(m[1],10);
    if (document.getElementById('mydublist-sources-block')) return;

    const res = await fetch(`${API_BASE}/api/anime/${malId}?lang=${encodeURIComponent(language)}`);
    if(!res.ok) return;
    const data = await res.json();
    const keys = Object.keys(data).filter(k => !k.startsWith('_'));
    if(!keys.length) return;

    const left = document.querySelector('.leftside');
    if(!left) return;
    const infoH2 = Array.from(left.querySelectorAll('h2')).find(h=>h.textContent.trim()==='Information');
    if(!infoH2) return;

    let sourceCount = 0;

    const h2 = document.createElement('h2');

    const wrap = document.createElement('div');
    wrap.className = 'external_links';
    for(const prov of PROVIDER_ORDER){
      if(!(prov in data)) continue;
      const url = data[prov];
      const label = PROVIDER_LABEL[prov] || prov;
      const ico = faviconUrlFor(prov);
      if(url){
        sourceCount++;
        const a = document.createElement('a');
        a.href = url;
        a.className = 'link ga-click';
        a.setAttribute('data-dubbed-icon','true');
        const img = document.createElement('img');
        img.className = 'link_icon';
        img.alt = 'icon';
        img.src = ico || 'https://cdn.myanimelist.net/img/common/pc/arrow_right_blue.svg';
        a.appendChild(img);
        const cap = document.createElement('div');
        cap.className='caption';
        cap.textContent = label;
        a.appendChild(cap);
        wrap.appendChild(a);
      }else{
        const span = document.createElement('span');
        span.className = 'link';
        span.setAttribute('data-dubbed-icon','true');
        const img = document.createElement('img');
        img.className = 'link_icon';
        img.alt = 'icon';
        img.src = ico || 'https://cdn.myanimelist.net/img/common/pc/arrow_right_blue.svg';
        span.appendChild(img);
        const cap = document.createElement('div');
        cap.className='caption';
        cap.textContent = label;
        span.appendChild(cap);
        wrap.appendChild(span);
      }
    }

    h2.textContent = `MyDubList Sources (${sourceCount})`;

    const br = document.createElement('br');
    const block = document.createElement('div');
    block.id = 'mydublist-sources-block';
    block.appendChild(h2);
    block.appendChild(wrap);
    block.appendChild(br);
    left.insertBefore(block, infoH2);
  }catch(e){ log('insertMdlSourcesSection error', e); }
}

function addDubIconsFromList(dubData, filter, style) {
  const { dubbed = [], incomplete = [] } = dubData;
  const dubbedSet = new Set(dubbed);
  const incompleteSet = new Set(incomplete);

  const anchors = [...document.querySelectorAll('a[href]')].filter(anchor => {
    if (anchor.hasAttribute('data-dubbed-icon')) return false;
    try {
      const url = new URL(anchor.getAttribute('href'), window.location.origin);
      return url.pathname.startsWith('/anime/') || (url.pathname + url.search).startsWith('/anime.php?id=');
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

    if ([...anchor.children].some(child => child.tagName.toLocaleLowerCase() === 'img')) {
      injectImageOverlayIcon(anchor, isIncomplete, style);
    } else if (anchor.classList.contains('link-image')) {
      injectImageOverlayIconSeasonal(anchor, isIncomplete, style);
    } else if (hasBackgroundImage(anchor)) {
      injectImageOverlayIconBackground(anchor, isIncomplete, style);
    } else {
      const textContainer = anchor.querySelector('.name') || anchor.querySelector('.text') || anchor.querySelector('.title-name');
      if (textContainer) {
        if (!/[\s\u00A0]$/.test(textContainer.textContent || '')) {
          // Do not add space in search results as they add it dynamically
          if (!anchor.querySelector('.name ')) {
            textContainer.insertAdjacentText('beforeend', '\u00A0');
          }
        }
        textContainer.appendChild(createIcon(isIncomplete, true, style));
      } else {
        const anchorText = anchor.textContent || '';
        if (!/[\s\u00A0]$/.test(anchorText)) {
          anchor.insertAdjacentHTML('beforeend', '&nbsp;');
        }
        anchor.appendChild(createIcon(isIncomplete, true, style));
      }
    }

    log(`Icon added for ID: ${id}`);
  });

  const titleEl = document.querySelector('.title-name strong');
  if (titleEl && !document.querySelector('.title-name .mydublist-icon')) {
    const idMatch = window.location.href.match(/\/anime\/(\d+)/) ?? (window.location.pathname + window.location.search).match(/^\/anime\.php\?id=(\d+)/);;
    if (idMatch) {
      const animeId = parseInt(idMatch[1], 10);
      const isIncomplete = incompleteSet.has(animeId);
      const isDubbed = dubbedSet.has(animeId);
      if (isIncomplete || isDubbed) {
        titleEl.insertAdjacentElement('afterend', createIcon(isIncomplete, false, style));
      }
      const titleContainer = document.querySelector('.h1-title');
      if (titleContainer) {
        titleContainer.style.display = 'flex';
        titleContainer.style.alignItems = 'center';
      }
    }
  }

  log('Annotation complete.');
}

browser.storage.local.get(['mydublistEnabled', 'mydublistLanguage', 'mydublistFilter', 'mydublistConfidence'])
  .then(async (data) => {
    const isEnabled = data.mydublistEnabled ?? true;
    const filter = data.mydublistFilter || 'all';
    let language = data.mydublistLanguage;

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
      else if (browserLang.startsWith('pt')) language = 'portuguese';
      else if (browserLang.startsWith('es')) language = 'spanish';
      else if (browserLang.startsWith('tl')) language = 'tagalog';
      else if (browserLang.startsWith('ru')) language = 'russian';
      else language = 'english';

      browser.storage.local.set({ mydublistLanguage: language });
      log(`Detected browser language, defaulting to: ${language}`);
    }

    if (!isEnabled) {
      log('MyDubList is disabled — skipping annotation');
      return;
    }

    const confidence = data.mydublistConfidence || 'low';
    const dubData = await fetchDubData(language, confidence);
    insertMdlSourcesSection(language);
    if (!dubData) return;

    const styleSetting = await browser.storage.local.get('mydublistStyle');
    const style = styleSetting.mydublistStyle || 'style_1';

    addDubIconsFromList(dubData, filter, style);

    // Debounced mutation observer for infinite scroll / dynamic inserts
    let mutationTimeout = null;
    const observer = new MutationObserver(() => {
      if (mutationTimeout !== null) return;
      mutationTimeout = setTimeout(() => {
        mutationTimeout = null;
        addDubIconsFromList(dubData, filter, style);
      }, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

// Lazyload hook
document.addEventListener('lazyloaded', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;

  // Find the container we measure against
  const container =
    img.closest('.image') ||
    img.closest('a') ||
    img.parentElement;

  if (!container) return;

  // Find the matching badge
  const span =
    container.querySelector('.mydublist-icon') ||
    container.parentElement?.querySelector('.mydublist-icon');

  if (!span) return;

  sizeIcon(span, container, img);
  scheduleFinalSizing(container, span, img);

  mdlImgRO.observe(img);
  mdlIconRO.observe(container);
}, true);
