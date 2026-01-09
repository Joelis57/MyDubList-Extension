const IS_DEBUG = false;

function log(...args) {
  if (IS_DEBUG) console.log('[MyDubList]', ...args);
}

// ---------------------------------------------------------------------------
// Shared config
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.mydublist.com';

const PROVIDER_ORDER = ['MAL', 'AniList', 'ANN', 'aniSearch', 'AnimeSchedule', 'Kitsu', 'HiAnime', 'Kenny', 'Manual', 'NSFW'];
const PROVIDER_LABEL = {
  MAL: 'MyAnimeList',
  AniList: 'AniList',
  ANN: 'Anime News Network',
  aniSearch: 'aniSearch',
  AnimeSchedule: 'AnimeSchedule',
  Kitsu: 'Kitsu',
  HiAnime: 'HiAnime',
  Kenny: 'Kenny Forum',
  Manual: 'Manual',
  NSFW: 'NSFW'
};

const FAVICON_DOMAIN = {
  HiAnime: 'hianime.to',
  AniList: 'anilist.co',
  ANN: 'animenewsnetwork.com',
  aniSearch: 'anisearch.com',
  AnimeSchedule: 'animeschedule.net',
  Kitsu: 'kitsu.io',
  MAL: 'myanimelist.net',
  Kenny: 'myanimelist.net',
  Manual: 'mydublist.com',
  NSFW: null
};

const NSFW_ICON = "data:image/svg+xml;utf8, <svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'> <circle cx='32' cy='32' r='30' fill='%23e11d48'/> <g transform='translate(33.5,32)'> <text x='0' y='0' dy='.35em' text-anchor='middle' font-size='26' font-weight='700' fill='white' font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif'>18+</text> </g> </svg>";

function faviconUrlFor(prov) {
  const d = FAVICON_DOMAIN[prov];
  if (prov === 'NSFW') return NSFW_ICON;
  return d ? `https://icons.duckduckgo.com/ip3/${d}.ico` : null;
}

// Font icon stylesheet
const mdlFontStyle = document.createElement('link');
mdlFontStyle.rel = 'stylesheet';
mdlFontStyle.href = browser.runtime.getURL('fonts/style.css');
document.head.appendChild(mdlFontStyle);

// ---------------------------------------------------------------------------
// Badge UI (shared)
// ---------------------------------------------------------------------------

function createTitleIcon(isPartial = false, isLink = false, style = 'style_1') {
  const base = isPartial ? `icon-partial_${style}` : `icon-dubs_${style}`;
  const typeClass = isLink ? 'icon-dubs-link' : 'icon-dubs-title';
  const span = document.createElement('span');
  span.className = `mydublist-icon ${base} ${typeClass}`;
  return span;
}

function createOverlayIconSpan(isPartial, style) {
  const span = document.createElement('span');
  span.className = 'icon-dubs-image mydublist-icon';
  span.classList.add(isPartial ? `icon-partial_${style}` : `icon-dubs_${style}`);
  return span;
}

const ICON_CFG = {
  minFont: 13,
  maxFont: 50,
  perPx: 0.14,
  widthCap: 220,
  defaultW: 167,
  minUsableW: 40,

  padYEm: 0.17,
  padXEm: 0.24,
  offsetEm: 0.30,
  radiusEm: 0.30
};

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function getRenderedImgWidth(img) {
  let w = img.getBoundingClientRect().width;
  if (!w) w = img.clientWidth;
  if (!w) {
    const aw = parseFloat(img.getAttribute('width') || '');
    if (aw) w = aw;
  }
  return w || 0;
}

function getRenderedElWidth(el) {
  return el.getBoundingClientRect().width || el.clientWidth || parseFloat(getComputedStyle(el).width) || 0;
}

// If there is an <img>, use its width; otherwise use the container width
function sizeIcon(span, container, img) {
  let w = img ? getRenderedImgWidth(img) : 0;

  if (!w) w = getRenderedElWidth(container);
  if (w > ICON_CFG.widthCap) w = ICON_CFG.widthCap;
  if (w < 1) w = ICON_CFG.defaultW;

  const fs = clamp(Math.round(w * ICON_CFG.perPx), ICON_CFG.minFont, ICON_CFG.maxFont);

  span.style.fontSize = fs + 'px';
  span.style.padding = `${Math.round(fs * ICON_CFG.padYEm)}px ${Math.round(fs * ICON_CFG.padXEm)}px`;
  const offset = Math.round(fs * ICON_CFG.offsetEm);
  span.style.top = offset + 'px';
  span.style.right = offset + 'px';
  span.style.borderRadius = Math.round(fs * ICON_CFG.radiusEm) + 'px';
}

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

// Observe containers (.image or anchor) for resize
const mdlIconRO = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const container = entry.target;
    const spans = container.querySelectorAll(':scope .mydublist-icon');
    if (!spans.length) continue;
    const img = container.querySelector('img');
    spans.forEach((span) => sizeIcon(span, container, img));
  }
});

// Observe <img> elements so width changes (lazyload, density swap) rescale the badge
const mdlImgRO = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const img = entry.target;
    const container = img.closest('.image') || img.closest('a') || img.parentElement;
    if (!container) continue;

    const span = container.querySelector('.mydublist-icon') || container.parentElement?.querySelector('.mydublist-icon');
    if (!span) continue;

    sizeIcon(span, container, img);
  }
});

// ---------------------------------------------------------------------------
// Overlay injection helpers (shared)
// ---------------------------------------------------------------------------

function ensureMeasurableAnchor(anchor) {
  const cs = getComputedStyle(anchor);
  if (cs.display === 'inline') anchor.style.display = 'inline-block';
}

function pickSizingBoxForBackground(anchor) {
  const candidates = [anchor, anchor.closest('.image'), anchor.closest('.picSurround'), anchor.parentElement].filter(Boolean);
  for (const el of candidates) {
    const w = el.getBoundingClientRect().width;
    const h = el.getBoundingClientRect().height;
    if (Math.max(w, h) >= ICON_CFG.minUsableW) return el;
  }
  let el = anchor.parentElement, steps = 0;
  while (el && steps++ < 4) {
    const w = el.getBoundingClientRect().width;
    const h = el.getBoundingClientRect().height;
    if (Math.max(w, h) >= ICON_CFG.minUsableW) return el;
    el = el.parentElement;
  }
  return anchor;
}

// 1) Generic image-in-anchor
function injectImageOverlayIcon(anchor, isPartial, style = 'style_1') {
  const img = anchor.querySelector('img');
  if (!img) return;
  if (anchor.querySelector('.mydublist-icon')) return;

  const span = createOverlayIconSpan(isPartial, style);

  if (getComputedStyle(anchor).position === 'static') anchor.style.position = 'relative';

  maybeHideOnHover(anchor, span);
  anchor.appendChild(span);

  const box = anchor.closest('.image') || anchor;

  sizeIcon(span, box, img);
  if (!img.complete) img.addEventListener('load', () => sizeIcon(span, box, img), { once: true });

  scheduleFinalSizing(box, span, img);
  mdlIconRO.observe(box);
  if (box !== anchor) mdlIconRO.observe(anchor);
  mdlImgRO.observe(img);
}

// 2) Seasonal (.image wrapper as container)
function injectImageOverlayIconSeasonal(anchor, isPartial, style = 'style_1') {
  const parent = anchor.closest('.image');
  if (!parent || parent.querySelector('.icon-dubs-image')) return;

  const span = createOverlayIconSpan(isPartial, style);
  parent.style.position = 'relative';

  maybeHideOnHover(anchor, span);
  parent.appendChild(span);

  const img = anchor.querySelector('img') || parent.querySelector('img') || null;

  sizeIcon(span, parent, img);
  if (img && !img.complete) img.addEventListener('load', () => sizeIcon(span, parent, img), { once: true });

  scheduleFinalSizing(parent, span, img);
  mdlIconRO.observe(parent);
  if (img) mdlImgRO.observe(img);
}

// 3) Background-image case
function injectImageOverlayIconBackground(anchor, isPartial, style = 'style_1') {
  if (anchor.querySelector('.mydublist-icon')) return;

  const span = createOverlayIconSpan(isPartial, style);

  if (getComputedStyle(anchor).position === 'static') anchor.style.position = 'relative';

  maybeHideOnHover(anchor, span);
  anchor.appendChild(span);

  ensureMeasurableAnchor(anchor);

  const box = pickSizingBoxForBackground(anchor);

  sizeIcon(span, box, null);
  scheduleFinalSizing(box, span, null);
  mdlIconRO.observe(box);
  if (box !== anchor) mdlIconRO.observe(anchor);
}

// ---------------------------------------------------------------------------
// Site rules
// ---------------------------------------------------------------------------

function hostMatches(host, patterns) {
  return patterns.some((p) => (p instanceof RegExp ? p.test(host) : host === p || host.endsWith('.' + p)));
}

/**
 * MyAnimeList rule
 */
const MAL_RULE = {
  id: 'MAL',
  hosts: [/^(?:.*\.)?myanimelist\.net$/],

  // URL patterns
  animePathRegex: /^\/anime\/(\d+)(\/[^\/]*)?\/?$/,
  animeIdRegex: /^\/anime\/(\d+)/,

  // DOM rules / heuristics
  excludedAnchorClosestSelectors: ['#horiznav_nav', '.spaceit_pad', '[itemprop="itemListElement"]', '.hoverinfo-contaniner'],

  isTileUnit(anchor) {
    return anchor.parentElement && anchor.parentElement.classList.contains('tile-unit');
  },

  hasBackgroundImage(anchor) {
    const inlineBg = anchor.style.backgroundImage;
    if (inlineBg && inlineBg !== 'none') return true;

    const computedBg = getComputedStyle(anchor).backgroundImage;
    if (computedBg && computedBg !== 'none' && computedBg.includes('url')) return true;

    if (anchor.hasAttribute('data-bg')) return true;

    // Mobile tiles
    if (this.isTileUnit(anchor)) return true;

    return false;
  },

  /**
   * When the anchor is "not ready" (e.g., text is still empty while MAL is rendering),
   * we avoid marking it as processed so a later mutation can retry.
   */
  isProcessingReady(anchor, url) {
    // If it's a tile unit, it often has no text by design.
    if (this.isTileUnit(anchor)) return true;

    // If MAL hasn't filled the title text yet, retry later.
    if (!anchor.textContent.trim()) return false;

    // Everything else is ready.
    return true;
  },

  isValidAnimeLink(anchor, url) {
    // Must match /anime/<id>[/title]
    if (!this.animePathRegex.test(url.pathname)) return false;

    // Avoid empty anchors unless they are tiles (thumbnail-only units)
    if (!anchor.textContent.trim() && !this.isTileUnit(anchor)) return false;

    // Already processed
    if (anchor.dataset.dubbedIcon === 'true') return false;

    // Exclusions
    for (const sel of this.excludedAnchorClosestSelectors) {
      if (anchor.closest(sel)) return false;
    }

    // Seasonal title anchors inside the seasonal tiles can cause duplicates
    if (anchor.closest('.seasonal-anime') && anchor.closest('.title')) return false;

    return true;
  },

  extractAnimeId(url) {
    const path = new URL(url, window.location.origin).pathname;
    const m = path.match(this.animeIdRegex);
    return m ? parseInt(m[1], 10) : null;
  },

  /**
   * Decide *how* to annotate an anchor.
   */
  chooseOverlayMode(anchor) {
    if ([...anchor.children].some((c) => c.tagName?.toLowerCase() === 'img')) return 'img';
    if (anchor.classList.contains('link-image')) return 'seasonal';
    if (this.hasBackgroundImage(anchor)) return 'background';
    return 'text';
  },

  injectForAnchor(anchor, isPartial, style) {
    const mode = this.chooseOverlayMode(anchor);

    if (mode === 'img') {
      injectImageOverlayIcon(anchor, isPartial, style);
      return;
    }
    if (mode === 'seasonal') {
      injectImageOverlayIconSeasonal(anchor, isPartial, style);
      return;
    }
    if (mode === 'background') {
      injectImageOverlayIconBackground(anchor, isPartial, style);
      return;
    }

    // Text case
    const textContainer = anchor.querySelector('.name') || anchor.querySelector('.text') || anchor.querySelector('.title-name');
    if (textContainer) {
      if (!/[\s\u00A0]$/.test(textContainer.textContent || '')) {
        // MAL sometimes adds spaces dynamically; avoid messing with search results
        if (!anchor.querySelector('.name ')) textContainer.insertAdjacentText('beforeend', '\u00A0');
      }
      textContainer.appendChild(createTitleIcon(isPartial, true, style));
    } else {
      const anchorText = anchor.textContent || '';
      if (!/[\s\u00A0]$/.test(anchorText)) anchor.insertAdjacentHTML('beforeend', '&nbsp;');
      anchor.appendChild(createTitleIcon(isPartial, true, style));
    }
  },

  applyFilter(anchor, isDubbed, isPartial, filter) {
    const shouldHide = (filter === 'dubbed' && !isDubbed && !isPartial) || (filter === 'undubbed' && (isDubbed || isPartial));
    if (!shouldHide) return;

    const path = window.location.pathname;

    if (path.startsWith('/anime/season') || path.startsWith('/anime/genre')) {
      const container = anchor.closest('.seasonal-anime');
      if (container) container.style.display = 'none';
      return;
    }

    if (path.startsWith('/topanime') || path.startsWith('/anime.php')) {
      const row = anchor.closest('tr');
      if (row) row.style.display = 'none';
      else {
        const detail = anchor.closest('.detail');
        if (detail) detail.style.display = 'none';
      }
      return;
    }

    if (path === '/') {
      const container = anchor.closest('li');
      if (container) container.style.display = 'none';
      else if (this.hasBackgroundImage(anchor)) anchor.style.display = 'none';
    }
  },

  annotateTitle(dubbedSet, partialSet, style) {
    const titleEl = document.querySelector('.title-name strong');
    if (!titleEl) return;
    if (document.querySelector('.title-name .mydublist-icon')) return;

    const idMatch = window.location.href.match(/\/anime\/(\d+)/);
    if (!idMatch) return;

    const animeId = parseInt(idMatch[1], 10);
    const isDubbed = dubbedSet.has(animeId);
    const isPartial = partialSet.has(animeId);

    log(`Checking anime title annotation: ${animeId} (isDubbed: ${isDubbed}, isPartial: ${isPartial})`);
    if (isPartial || isDubbed) {
      titleEl.insertAdjacentElement('afterend', createTitleIcon(isPartial, false, style));
      const titleContainer = document.querySelector('.h1-title');
      if (titleContainer) {
        titleContainer.style.display = 'flex';
        titleContainer.style.alignItems = 'center';
      }
    }
  },

  // Only annotate anchors that are relevant on MAL.
  queryAnimeAnchors(root) {
    const scope = root && root.nodeType === Node.ELEMENT_NODE ? root : document;

    // Heuristic selectors to avoid scanning every anchor on large pages.
    const candidates = scope.querySelectorAll(
      'a[href^="/anime/"], a[href^="https://myanimelist.net/anime/"], a[href^="http://myanimelist.net/anime/"]'
    );

    return [...candidates];
  },

  async maybeInsertSourcesSection(language) {
    try {
      const m = window.location.pathname.match(this.animeIdRegex);
      if (!m) return;
      const malId = parseInt(m[1], 10);
      if (document.getElementById('mydublist-sources-block')) return;

      const res = await fetch(`${API_BASE}/api/anime/${malId}?lang=${encodeURIComponent(language)}`);
      if (!res.ok) return;
      const data = await res.json();
      const keys = Object.keys(data).filter((k) => !k.startsWith('_'));
      if (!keys.length) return;

      const left = document.querySelector('.leftside');
      if (!left) return;
      const infoH2 = Array.from(left.querySelectorAll('h2')).find((h) => h.textContent.trim() === 'Information');
      if (!infoH2) return;

      let sourceCount = 0;

      const h2 = document.createElement('h2');
      const wrap = document.createElement('div');
      wrap.className = 'external_links';

      for (const prov of PROVIDER_ORDER) {
        if (!(prov in data)) continue;
        const url = data[prov];
        const label = PROVIDER_LABEL[prov] || prov;
        const ico = faviconUrlFor(prov);

        if (url) {
          sourceCount++;
          const a = document.createElement('a');
          a.href = url;
          a.className = 'link ga-click';
          a.setAttribute('data-dubbed-icon', 'true');
          const img = document.createElement('img');
          img.className = 'link_icon';
          img.alt = 'icon';
          img.src = ico || 'https://cdn.myanimelist.net/img/common/pc/arrow_right_blue.svg';
          a.appendChild(img);
          const cap = document.createElement('div');
          cap.className = 'caption';
          cap.textContent = label;
          a.appendChild(cap);
          wrap.appendChild(a);
        } else {
          const span = document.createElement('span');
          span.className = 'link';
          span.setAttribute('data-dubbed-icon', 'true');
          const img = document.createElement('img');
          img.className = 'link_icon';
          img.alt = 'icon';
          img.src = ico || 'https://cdn.myanimelist.net/img/common/pc/arrow_right_blue.svg';
          span.appendChild(img);
          const cap = document.createElement('div');
          cap.className = 'caption';
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
    } catch (e) {
      log('maybeInsertSourcesSection error', e);
    }
  }
};

/**
 * Placeholder rules for future sites.
 *
 * To enable these, add them to manifest.json:
 *   - host_permissions
 *   - content_scripts.matches
 */
const ANILIST_RULE = {
  id: 'AniList',
  hosts: [/^(?:.*\.)?anilist\.co$/]
  // Implement later.
};

const ANN_RULE = {
  id: 'ANN',
  hosts: [/^(?:.*\.)?animenewsnetwork\.com$/]
  // Implement later.
};

const SITE_RULES = [MAL_RULE, ANILIST_RULE, ANN_RULE];

function getActiveSiteRule() {
  const host = window.location.hostname;
  return SITE_RULES.find((r) => hostMatches(host, r.hosts)) || null;
}

// ---------------------------------------------------------------------------
// Dub data
// ---------------------------------------------------------------------------

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

    // cleanup legacy cache key
    browser.storage.local.remove(OLD_CACHE_KEY).catch(() => {});

    log(`Fetched and cached for language=${language}, confidence=${confidence}`);
    return json;
  } catch (e) {
    console.error('Failed to fetch dub data:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Annotation engine (site-agnostic)
// ---------------------------------------------------------------------------

const activeRule = getActiveSiteRule();
if (!activeRule) {
  log('No rule for this site — skipping.');
} else if (!activeRule.queryAnimeAnchors || !activeRule.isValidAnimeLink || !activeRule.extractAnimeId || !activeRule.injectForAnchor) {
  log(`Rule '${activeRule.id}' is present but not fully implemented — skipping.`);
} else {
  browser.storage.local
    .get(['mydublistEnabled', 'mydublistLanguage', 'mydublistFilter', 'mydublistConfidence'])
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
        log('MyDubList is disabled — skipping annotation.');
        return;
      }

      const confidence = data.mydublistConfidence || 'low';
      const dubData = await fetchDubData(language, confidence);
      if (!dubData) return;

      const styleSetting = await browser.storage.local.get('mydublistStyle');
      const style = styleSetting.mydublistStyle || 'style_1';

      // Optional per-site extra UI (MAL sources block)
      if (typeof activeRule.maybeInsertSourcesSection === 'function') {
        // do not await — keep annotation fast
        activeRule.maybeInsertSourcesSection(language);
      }

      const { dubbed = [], partial = [] } = dubData;
      const dubbedSet = new Set(dubbed);
      const partialSet = new Set(partial);

      // Avoid reprocessing the same anchors (MutationObserver can cause repeats)
      const processed = new WeakSet();

      function annotateAnchors(anchors) {
        for (const anchor of anchors) {
          if (!(anchor instanceof HTMLAnchorElement)) continue;
          if (processed.has(anchor)) continue;

          // Already annotated by us
          if (anchor.hasAttribute('data-dubbed-icon')) {
            processed.add(anchor);
            continue;
          }

          const href = anchor.getAttribute('href');
          if (!href) continue;

          let url;
          try {
            url = new URL(href, window.location.origin);
          } catch {
            continue;
          }

          // Some sites render anchors first and fill text later; let rules opt-in to retry.
          if (typeof activeRule.isProcessingReady === 'function' && !activeRule.isProcessingReady(anchor, url)) {
            continue;
          }

          // From this point on, treat this anchor as stable for the current run.
          processed.add(anchor);

          if (!activeRule.isValidAnimeLink(anchor, url)) continue;

          const id = activeRule.extractAnimeId(url.href);
          if (!id) continue;

          const isDubbed = dubbedSet.has(id);
          const isPartial = partialSet.has(id);
          log(`Checking anime id: ${id} (isDubbed: ${isDubbed}, isPartial: ${isPartial})`);

          if (typeof activeRule.applyFilter === 'function') {
            activeRule.applyFilter(anchor, isDubbed, isPartial, filter);
          }

          if (!isPartial && !isDubbed) continue;

          anchor.dataset.dubbedIcon = 'true';
          activeRule.injectForAnchor(anchor, isPartial, style);
        }

        // Optional: annotate the anime page title
        if (typeof activeRule.annotateTitle === 'function') {
          activeRule.annotateTitle(dubbedSet, partialSet, style);
        }
      }

      function scan(root) {
        const anchors = activeRule.queryAnimeAnchors(root);
        annotateAnchors(anchors);
      }

      // Initial scan
      scan(document);

      // Debounced + scoped MutationObserver for dynamic pages
      let mutationTimeout = null;
      const pendingRoots = new Set();

      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const n of m.addedNodes) {
            if (n.nodeType === Node.ELEMENT_NODE) pendingRoots.add(n);
          }
        }

        if (mutationTimeout !== null) return;
        mutationTimeout = setTimeout(() => {
          mutationTimeout = null;

          const roots = [...pendingRoots];
          pendingRoots.clear();

          // If too much changed, fallback to a full scan (rare)
          if (roots.length > 50) {
            scan(document);
            return;
          }

          for (const r of roots) scan(r);
        }, 100);
      });

      observer.observe(document.body, { childList: true, subtree: true });

      log(`Annotation active for site rule: ${activeRule.id}`);
    });
}

// Lazyload hook (keeps overlay badge sized correctly)
document.addEventListener(
  'lazyloaded',
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;

    const container = img.closest('.image') || img.closest('a') || img.parentElement;
    if (!container) return;

    const span = container.querySelector('.mydublist-icon') || container.parentElement?.querySelector('.mydublist-icon');
    if (!span) return;

    sizeIcon(span, container, img);
    scheduleFinalSizing(container, span, img);

    mdlImgRO.observe(img);
    mdlIconRO.observe(container);
  },
  true
);
