const IS_DEBUG = false;

function log(...args) {
  if (IS_DEBUG) console.log('[MyDubList]', ...args);
}

// ---------------------------------------------------------------------------
// Shared config
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.mydublist.com';


// ------------------------------------------------------
// MyDubList API helpers (dedupe + caching to avoid spam)
// ------------------------------------------------------
const __mdlSourcesCache = new Map(); // key -> { ts, data }
const __mdlSourcesInFlight = new Map(); // key -> Promise<data|null>
const __MDL_SOURCES_TTL_OK = 10 * 60 * 1000;   // 10 minutes
const __MDL_SOURCES_TTL_NEG = 30 * 1000;       // 30 seconds (avoid hammering on failures)

async function mdlGetAnimeSources(malId, language) {
  const key = `${malId}|${language}`;
  const now = Date.now();

  const cached = __mdlSourcesCache.get(key);
  if (cached) {
    const ttl = cached.data ? __MDL_SOURCES_TTL_OK : __MDL_SOURCES_TTL_NEG;
    if (now - cached.ts < ttl) return cached.data;
  }

  const inflight = __mdlSourcesInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const url = `${API_BASE}/api/anime/${malId}?lang=${encodeURIComponent(language)}`;
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  })()
    .then((data) => {
      __mdlSourcesCache.set(key, { ts: Date.now(), data });
      __mdlSourcesInFlight.delete(key);
      return data;
    })
    .catch(() => {
      __mdlSourcesCache.set(key, { ts: Date.now(), data: null });
      __mdlSourcesInFlight.delete(key);
      return null;
    });

  __mdlSourcesInFlight.set(key, p);
  return p;
}

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
const PROVIDER_COLOR = {
  MAL: '#2E51A2e0',
  AniList: '#02A9FFE0',
  ANN: '#d5eb9a',
  aniSearch: '#fd945bff',
  AnimeSchedule: '#4078c5',
  Kitsu: '#fb7460',
  HiAnime: '#2f2b4f',
  Kenny: '#2E51A2e0',
  Manual: '#6B7280e0',
  NSFW: '#EF4444e0'
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

// Extra site-specific CSS (safe no-ops on other sites)
(function ensureMyDubListExtraCss() {
  if (document.getElementById('mydublist-extra-style')) return;
  const style = document.createElement('style');
  style.id = 'mydublist-extra-style';
  style.textContent = `
.media-preview-card.small.mydublist-hide-neighbor-icons .mydublist-icon.icon-dubs-image {
  opacity: 0 !important;
  pointer-events: none !important;
}
`;
  document.head.appendChild(style);
})();

// ------------------------------------------------------
// AniList hover helper: hide neighbor badges for small preview cards
// ------------------------------------------------------
(function setupAniListPreviewNeighborHide() {
  if (window.__mydublistPreviewNeighborHideSetup) return;
  window.__mydublistPreviewNeighborHideSetup = true;

  const HIDE_CLASS = 'mydublist-hide-neighbor-icons';
  let currentCard = null;
  let hiddenCards = [];

  function clearHidden() {
    for (const c of hiddenCards) c.classList.remove(HIDE_CLASS);
    hiddenCards = [];
  }

  function collectNeighborSmallCards(card, count) {
    const out = [];
    const goLeft = card.classList.contains('info-left'); // <-- key change
    let node = card;

    while (out.length < count) {
      node = goLeft ? node.previousElementSibling : node.nextElementSibling;
      if (!node) break;

      if (node.classList?.contains('media-preview-card') && node.classList.contains('small')) {
        out.push(node);
      }
    }
    return out;
  }

  function isEntering(el, relatedTarget) {
    return !relatedTarget || (relatedTarget !== el && !el.contains(relatedTarget));
  }

  function onOver(e) {
    const card = e.target && e.target.closest ? e.target.closest('.media-preview-card.small') : null;
    if (!card) return;
    if (!isEntering(card, e.relatedTarget)) return;

    if (currentCard && currentCard !== card) {
      clearHidden();
    }
    currentCard = card;

    const neighbors = collectNeighborSmallCards(card, 2);
    clearHidden();
    for (const n of neighbors) n.classList.add(HIDE_CLASS);
    hiddenCards = neighbors;
  }

  function onOut(e) {
    const card = e.target && e.target.closest ? e.target.closest('.media-preview-card.small') : null;
    if (!card) return;
    if (!isEntering(card, e.relatedTarget)) return; // leaving to a child; ignore

    if (currentCard === card) {
      clearHidden();
      currentCard = null;
    }
  }

  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('mouseout', onOut, true);
})();

function ensureAniListSourcesPlacement(block, tries = 25) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || !block) return;

  const tags = sidebar.querySelector(':scope > .tags');
  if (tags) {
    // Move it right before tags (even if it already exists elsewhere)
    if (block.nextElementSibling !== tags) {
      sidebar.insertBefore(block, tags);
    }
    return;
  }

  // Tags might not exist yet on first navigation; retry a bit.
  if (tries > 0) {
    setTimeout(() => ensureAniListSourcesPlacement(block, tries - 1), 120);
  }
}

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
  minFont: 16,
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
  // Default target is the anchor itself, but some AniList layouts (recommendation cards)
  // put the background-image on a parent ".cover" div while the clickable link is a child
  // <a class="cover-link">. In that case we append the badge to the parent so it sits
  // above other overlays (rating-wrap), and we still bind hover behavior to the link.
  let target = anchor;

  const isRecCoverLink =
    anchor instanceof HTMLAnchorElement &&
    anchor.classList.contains('cover-link') &&
    anchor.closest('.recommendation-card');

  if (isRecCoverLink) {
    const coverDiv = anchor.closest('.cover');
    if (coverDiv && coverDiv !== anchor) target = coverDiv;
  }

  // Prevent duplicates (check both the link and the target container)
  if (anchor.querySelector('.mydublist-icon')) return;
  if (target !== anchor && target.querySelector(':scope > .mydublist-icon')) return;

  const span = createOverlayIconSpan(isPartial, style);

  if (getComputedStyle(target).position === 'static') target.style.position = 'relative';

  // Ensure the badge renders above AniList overlays inside covers.
  span.style.zIndex = '1000';

  maybeHideOnHover(anchor, span);
  target.appendChild(span);

  // Make sure sizing works even if the link itself has no intrinsic size.
  ensureMeasurableAnchor(target);

  const box = pickSizingBoxForBackground(target);

  sizeIcon(span, box, null);
  scheduleFinalSizing(box, span, null);
  mdlIconRO.observe(box);
  if (box !== target) mdlIconRO.observe(target);
}


// ---------------------------------------------------------------------------
// JSONL mapping helper (shared)
// ---------------------------------------------------------------------------

/**
 * Fetch a JSONL mapping file and return a Map<fromId, toId> for the requested ids.
 * The JSONL is expected to be one JSON object per line, e.g.:
 *   {"mal_id":1,"anilist_id":1}
 *
 * This is optimized for "lookup a small set of ids":
 * - It streams the response line-by-line when possible
 * - It stops early (aborts the request) once all requested ids have been found
 */
async function fetchJsonlIdMap(url, fromField, toField, ids, label = 'JSONL mapping') {
  const want = new Set((ids || []).filter((n) => Number.isFinite(n)));
  const out = new Map();
  if (!want.size) return out;

  const controller = new AbortController();

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);

    // Streaming path (preferred)
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (let line of lines) {
          line = line.trim();
          if (!line) continue;

          try {
            const obj = JSON.parse(line);
            const from = obj?.[fromField];
            const to = obj?.[toField];

            if (want.has(from) && Number.isFinite(to) && to > 0) {
              out.set(from, to);
              want.delete(from);

              if (!want.size) {
                controller.abort(); // stop download early
                break;
              }
            }
          } catch {
            // ignore malformed lines
          }
        }

        if (!want.size) break;
      }

      // Flush remaining buffer
      const last = buf.trim();
      if (want.size && last) {
        try {
          const obj = JSON.parse(last);
          const from = obj?.[fromField];
          const to = obj?.[toField];
          if (want.has(from) && Number.isFinite(to) && to > 0) out.set(from, to);
        } catch {
          // ignore
        }
      }

      return out;
    }

    // Fallback (no streaming available)
    const txt = await res.text();
    for (const rawLine of txt.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;

      try {
        const obj = JSON.parse(line);
        const from = obj?.[fromField];
        const to = obj?.[toField];

        if (want.has(from) && Number.isFinite(to) && to > 0) {
          out.set(from, to);
          want.delete(from);
          if (!want.size) break;
        }
      } catch {
        // ignore malformed lines
      }
    }

    return out;
  } catch (e) {
    // If we aborted intentionally, treat as success.
    if (controller.signal.aborted) return out;
    log(`${label} fetch failed`, e);
    return out;
  }
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

  _sourcesLock: null,
  _sourcesKey: null,

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

      const key = `mal:${malId}|lang:${String(language || '').toLowerCase()}`;

      // If the correct block is already present, bail.
      const existing = document.getElementById('mydublist-sources-block');
      if (existing && existing.getAttribute('data-mdl-key') === key) return;

      // If we're already building this exact key, reuse the in-flight promise.
      if (this._sourcesLock && this._sourcesKey === key) return this._sourcesLock;

      // Mark what we're building now.
      this._sourcesKey = key;

      // Lock to prevent concurrent inserts (race on refresh / fast re-entry).
      this._sourcesLock = (async () => {
        try {
          // Re-check after yielding (another call might have inserted already).
          const again = document.getElementById('mydublist-sources-block');
          if (again && again.getAttribute('data-mdl-key') === key) return;

          const res = await fetch(`${API_BASE}/api/anime/${malId}?lang=${encodeURIComponent(language)}`);
          if (!res.ok) return;

          const data = await res.json();
          const keys = Object.keys(data).filter((k) => !k.startsWith('_'));
          if (!keys.length) return;

          const left = document.querySelector('.leftside');
          if (!left) return;

          const infoH2 = Array.from(left.querySelectorAll('h2')).find(
            (h) => h.textContent.trim() === 'Information'
          );
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

          // Key the block so we can detect "correct vs stale".
          block.setAttribute('data-mdl-key', key);

          block.appendChild(h2);
          block.appendChild(wrap);
          block.appendChild(br);

          // Final de-dupe: remove any block that slipped in while we were fetching.
          const old = document.getElementById('mydublist-sources-block');
          if (old) old.remove();

          left.insertBefore(block, infoH2);
        } catch (e) {
          log('maybeInsertSourcesSection error', e);
        } finally {
          // Release the lock so future attempts can retry if DOM wasn't ready yet.
          if (this._sourcesKey === key) this._sourcesLock = null;
        }
      })();

      return this._sourcesLock;
    } catch (e) {
      log('maybeInsertSourcesSection error', e);
    }
  }

};

/**
 * AniList rule
 */
const ANILIST_RULE = {
  id: 'AniList',
  hosts: [/^(?:.*\.)?anilist\.co$/],

  // URL patterns
  // Examples:
  //   /anime/167152/Some-Title/
  //   /anime/172463/Some-Title/characters
  animePathRegex: /^\/anime\/(\d+)(\/[^\/]*)?\/?$/,
  animeAnyTabRegex: /^\/anime\/(\d+)(?:\/[^\/]*)?(?:\/.*)?\/?$/,
  animeIdRegex: /^\/anime\/(\d+)/,

  // Internal cache: AniList id -> MAL id
  _idMap: new Map(),
  _storageKeyPrefix: 'mydublist_anilist_to_mal_',
  _prefetchLock: null,

  // Sources section state (per SPA navigation)
  _sourcesLock: null,
  _sourcesLastKey: null,

  hasBackgroundImage(anchor) {
  const hasBg = (el) => {
    if (!el) return false;
    const inlineBg = el.style && el.style.backgroundImage;
    if (inlineBg && inlineBg !== 'none' && inlineBg.includes('url')) return true;

    const computedBg = getComputedStyle(el).backgroundImage;
    if (computedBg && computedBg !== 'none' && computedBg.includes('url')) return true;

    if (el.hasAttribute && el.hasAttribute('data-src')) return true;
    return false;
  };

  if (hasBg(anchor)) return true;

  // AniList recommendation cards: the image is on a parent ".cover" div, while the clickable link is ".cover-link".
  if (anchor instanceof HTMLElement && anchor.classList.contains('cover-link')) {
    const cover = anchor.closest('.cover');
    if (cover && cover !== anchor && hasBg(cover)) return true;
  }

  return false;
},

  getCurrentPageAnimeId() {
    const m = window.location.pathname.match(this.animeAnyTabRegex);
    return m ? parseInt(m[1], 10) : null;
  },

  isValidAnimeLink(anchor, url) {
    // Only match base anime pages (no /characters, /staff, etc.) for link injection.
    if (!this.animePathRegex.test(url.pathname)) return false;

    if (anchor.dataset.dubbedIcon === 'true') return false;

    // Avoid annotating UI nav links (if they ever match in the future)
    if (anchor.closest('.nav')) return false;

    return true;
  },

  extractAnimeId(url) {
    const path = new URL(url, window.location.origin).pathname;
    const m = path.match(this.animeIdRegex);
    return m ? parseInt(m[1], 10) : null;
  },

  resolveLookupId(anilistId) {
    return this._idMap.get(anilistId) || null;
  },

  // JSONL mapping file (AniList id -> MAL id)
  _mappingsUrl: 'https://raw.githubusercontent.com/Joelis57/MyDubList/main/dubs/mappings/mappings_anilist.jsonl',

  async _fetchMappingsFromJsonl(ids) {
    return fetchJsonlIdMap(this._mappingsUrl, 'anilist_id', 'mal_id', ids, 'AniList mappings');
  },

  async prefetchLookupIds(anilistIds) {
    // Serialize prefetches so overlapping scans don't double-fetch.
    const run = async () => {
      const unique = [...new Set(anilistIds)].filter((n) => Number.isFinite(n));
      if (!unique.length) return;

      const missing = unique.filter((id) => !this._idMap.has(id));
      if (!missing.length) return;

      // Load from storage first
      const keys = missing.map((id) => this._storageKeyPrefix + id);
      const stored = await browser.storage.local.get(keys);
      for (const id of missing) {
        const v = stored[this._storageKeyPrefix + id];
        if (Number.isFinite(v) && v > 0) this._idMap.set(id, v);
      }

      const stillMissing = missing.filter((id) => !this._idMap.has(id));
      if (!stillMissing.length) return;

      const fetched = await this._fetchMappingsFromJsonl(stillMissing);
      if (!fetched.size) return;

      const toStore = {};
      for (const [aid, mid] of fetched.entries()) {
        this._idMap.set(aid, mid);
        toStore[this._storageKeyPrefix + aid] = mid;
      }
      await browser.storage.local.set(toStore);
    };

    this._prefetchLock = (this._prefetchLock || Promise.resolve()).then(run, run);
    return this._prefetchLock;
  },

  chooseOverlayMode(anchor) {
    if (anchor.querySelector('img')) return 'img';
    if (this.hasBackgroundImage(anchor)) return 'background';
    return 'text';
  },

  injectForAnchor(anchor, isPartial, style) {
    const mode = this.chooseOverlayMode(anchor);
    if (mode === 'img') {
      injectImageOverlayIcon(anchor, isPartial, style);
      return;
    }
    if (mode === 'background') {
      injectImageOverlayIconBackground(anchor, isPartial, style);
      return;
    }

    // Text link
    // Avoid duplicates on card layouts where we already overlay the badge on the cover image.
    const previewCard = anchor.closest('.media-preview-card');
    if (previewCard) {
      const cover = previewCard.querySelector('a.cover[href^="/anime/"], a.cover[href^="https://anilist.co/anime/"]');
      if (cover) return;
    }
    const recCard = anchor.closest('.recommendation-card');
    if (recCard) {
      const coverLink = recCard.querySelector('a.cover-link[href^="/anime/"], a.cover-link[href^="https://anilist.co/anime/"]');
      if (coverLink) return;
    }

    if (!anchor.textContent.trim()) return;
    if (!/[ \s]$/.test(anchor.textContent)) anchor.appendChild(document.createTextNode('\u00A0'));
    anchor.appendChild(createTitleIcon(isPartial, true, style));
  },

  annotateTitle(dubbedSet, partialSet, style) {
    const anilistId = this.getCurrentPageAnimeId();
    if (!anilistId) return;

    const malId = this.resolveLookupId(anilistId);
    if (!malId) return;

    // Only add once
    const h1 =
      document.querySelector('.media .header .content h1') ||
      document.querySelector('.media .content h1') ||
      document.querySelector('h1');
    if (!h1) return;
    if (h1.querySelector('.mydublist-icon')) return;

    const isPartial = partialSet.has(malId);
    const isDubbed = dubbedSet.has(malId);
    if (!isPartial && !isDubbed) return;

    if (!/[ \s]$/.test(h1.textContent || '')) h1.appendChild(document.createTextNode('\u00A0'));
    const titleIcon = createTitleIcon(isPartial, false, style);
    titleIcon.style.setProperty('font-size', '1em', 'important');
    h1.appendChild(titleIcon);

    h1.style.display = 'inline-flex';
    h1.style.alignItems = 'center';
    h1.style.gap = '0px';
  },

  async maybeInsertSourcesSection(language) {
  try {
    const anilistId = this.getCurrentPageAnimeId();
    if (!anilistId) return;

    // Ensure we have a MAL id (SPA navigations can land on a page before the mapping is cached)
    await this.prefetchLookupIds([anilistId]);
    const malId = this.resolveLookupId(anilistId);
    if (!malId) return;

    const key = `${language}:${malId}`;
    const existing = document.getElementById('mydublist-sources-anilist');
    if (existing && existing.getAttribute('data-mdl-key') === key) {
      ensureAniListSourcesPlacement(existing);
      return;
    }

    // Serialize updates so repeated DOM mutations don't trigger repeated fetches.
    const run = async () => {
      const ex = document.getElementById('mydublist-sources-anilist');
      if (ex && ex.getAttribute('data-mdl-key') === key) return;

      // Fetch (cached + de-duped) — prevents spamming when CORS/network fails.
      const data = await mdlGetAnimeSources(malId, language);
      if (!data) return;

      const providerKeys = Object.keys(data).filter((k) => !k.startsWith('_') && !!data[k]);
      if (!providerKeys.length) return;

      const sidebar = document.querySelector('.sidebar');
      if (!sidebar) return;

      // Build a block that matches AniList's "External & Streaming links" styling.
      // AniList uses scoped CSS (data-v-xxxx attributes), so we clone an existing block if available.
      const externalTpl = sidebar.querySelector(':scope > .external-links');
      let block, wrap, h2, linkTpl;

      if (externalTpl) {
        block = externalTpl.cloneNode(true);
        block.id = 'mydublist-sources-anilist';
        block.setAttribute('data-mdl-sources', 'true');
        block.classList.add('mydublist-sources');

        h2 = block.querySelector('h2') || block.querySelector(':scope > h2');
        if (h2) h2.textContent = 'MyDubList Sources';

        wrap = block.querySelector('.external-links-wrap') || block.querySelector(':scope > .external-links-wrap');
        if (wrap) wrap.innerHTML = '';

        linkTpl = externalTpl.querySelector('.external-links-wrap .external-link');
      } else {
        // Fallback (should be rare)
        block = document.createElement('div');
        block.id = 'mydublist-sources-anilist';
        block.setAttribute('data-mdl-sources', 'true');
        block.className = 'external-links mydublist-sources';

        h2 = document.createElement('h2');
        h2.textContent = 'MyDubList Sources';
        block.appendChild(h2);

        wrap = document.createElement('div');
        wrap.className = 'external-links-wrap';
        block.appendChild(wrap);

        linkTpl = null;
      }

      let sourceCount = 0;

      for (const prov of PROVIDER_ORDER) {
        if (!(prov in data)) continue;
        const url = data[prov];
        if (!url) continue;

        sourceCount++;
        const label = PROVIDER_LABEL[prov] || prov;
        const ico = faviconUrlFor(prov);

        let a;
        if (linkTpl) {
          a = linkTpl.cloneNode(true);
        } else {
          a = document.createElement('a');
          a.className = 'external-link';
        }

        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        // Do not annotate icons inside the MyDubList Sources block
        a.setAttribute('data-mdl-no-annotate', 'true');

        // Make these links behave like AniList external links (hover color from --link-color)
        a.classList.add('external-link');
        a.classList.remove('no-color');
        const linkColor = (typeof PROVIDER_COLOR !== 'undefined' && PROVIDER_COLOR[prov]) ? PROVIDER_COLOR[prov] : 'nulle0';
        a.style.setProperty('--link-color', linkColor);


        const iconWrap = a.querySelector('.icon-wrap') || a.querySelector(':scope > div');
        if (iconWrap) {
          iconWrap.innerHTML = '';

          // Ensure no permanent background color behind favicons (use --link-color hover styling instead)
          iconWrap.style.setProperty('background', 'transparent', 'important');
          iconWrap.style.setProperty('background-color', 'transparent', 'important');

          if (ico) {
            const img = document.createElement('img');
            img.className = 'icon';
            img.alt = label;
            img.src = ico;

            // Force a sane icon size in case scoped CSS doesn't apply to our injected nodes.
            img.style.width = '16px';
            img.style.height = '16px';
            img.style.objectFit = 'contain';

            iconWrap.appendChild(img);
          } else {
            iconWrap.textContent = '🔗';
            iconWrap.style.display = 'flex';
            iconWrap.style.alignItems = 'center';
            iconWrap.style.justifyContent = 'center';
          }
        }

        const nameEl = a.querySelector('.name') || a.querySelector('span');
        if (nameEl) {
          nameEl.textContent = label;
        } else {
          const name = document.createElement('span');
          name.className = 'name';
          name.textContent = label;
          a.appendChild(name);
        }

        wrap.appendChild(a);
      }

      if (!sourceCount) return;

      if (h2) h2.textContent = `MyDubList Sources (${sourceCount})`;

      // Replace any previous block (e.g., after SPA navigation or setting change)
      const old = document.getElementById('mydublist-sources-anilist');
      if (old) old.remove();

      block.setAttribute('data-mdl-key', key);

      // Insert specifically between "data" and "tags" (or just before tags if structure changes).
      const tags = sidebar.querySelector(':scope > .tags');
      if (tags) sidebar.insertBefore(block, tags);
      else sidebar.appendChild(block);

      ensureAniListSourcesPlacement(block);

      this._sourcesLastKey = key;
    };

    this._sourcesLock = (this._sourcesLock || Promise.resolve()).then(run, run);
    return this._sourcesLock;
  } catch (e) {
    log('AniList maybeInsertSourcesSection error', e);
  }
},

  queryAnimeAnchors(root) {
    const scope = root && root.nodeType === Node.ELEMENT_NODE ? root : document;

    // Common AniList patterns:
    // - cards & relations: <a class="cover" href="/anime/<id>/<slug>/"> ...
    // - text links: <a href="/anime/<id>/<slug>/">Title</a>
    const candidates = scope.querySelectorAll('a[href^="/anime/"], a[href^="https://anilist.co/anime/"]');
    return [...candidates].filter(a => !a.closest('[data-mdl-sources]'));

  }
};

/**
 * aniSearch rule
 */
const ANISEARCH_RULE = {
  id: 'aniSearch',
  hosts: [/^(?:.*\.)?anisearch\.[a-z]{2,}$/i],

  _sourcesLock: null,
  _sourcesLastKey: null,

  // URL patterns
  animeIdRegex: /^\/anime\/(\d+)/i,

  // JSONL mapping file (AniSearch id -> MAL id)
  _mappingsUrl: 'https://raw.githubusercontent.com/Joelis57/MyDubList/main/dubs/mappings/mappings_anisearch.jsonl',

  // Internal cache: AniSearch id -> MAL id
  _idMap: new Map(),
  _storageKeyPrefix: 'mydublist_anisearch_to_mal_',
  _prefetchLock: null,

  // Debug: log counts once
  _didLogAnchorStats: false,

  // -------------------------
  // Page ID helpers
  // -------------------------
  getCurrentPageAnimeId() {
    const m = window.location.pathname.match(this.animeIdRegex);
    return m ? parseInt(m[1], 10) : null;
  },

  // -------------------------
  // URL -> AniSearch anime id
  // -------------------------
  extractAnimeId(url) {
    const path = new URL(url, window.location.origin).pathname;
    const m = path.match(this.animeIdRegex);
    return m ? parseInt(m[1], 10) : null;
  },

  // -------------------------
  // Whitelist logic
  // -------------------------
  _isTrailerUrl(url) {
    // /anime/<id>,<slug>/trailer/...  or  /anime/<id>,<slug>/trailer
    return /\/trailer(?:\/|$)/i.test(url.pathname);
  },

  _isImageAnchor(anchor) {
    return !!anchor.querySelector('img');
  },

  _isTextWhitelisted(anchor) {
    // 1) Description
    if (anchor.closest('#description .details-text')) return true;

    // 2) Anime calendars (your table)
    if (anchor.closest('table.responsive-table')) return true;

    return false;
  },

  // Engine calls this to decide if an anchor should be processed at all
  isValidAnimeLink(anchor, url) {
    if (!(anchor instanceof HTMLAnchorElement)) return false;
    if (anchor.dataset.dubbedIcon === 'true') return false;

    // Only /anime/<id> links
    const rawId = this.extractAnimeId(url.href);
    if (!Number.isFinite(rawId)) return false;

    // Never annotate trailers
    if (this._isTrailerUrl(url)) return false;

    const isImg = this._isImageAnchor(anchor);

    // Never add image overlays inside trailers section
    if (isImg && anchor.closest('#trailers')) return false;

    // For TEXT anchors: whitelist ONLY
    if (!isImg && !this._isTextWhitelisted(anchor)) return false;

    return true;
  },

  // Keep scanning cheap, but also aligned with your whitelist:
  // return anime anchors that either:
  // - contain an image (overlay case)
  // - OR are inside text whitelist (description/calendar)
  queryAnimeAnchors(root) {
    const scope = root && root.nodeType === Node.ELEMENT_NODE ? root : document;

    const candidates = scope.querySelectorAll(
      "a[href^='anime/'], a[href^='/anime/'], a[href^='https://www.anisearch.'], a[href^='https://anisearch.']"
    );

    const out = [];
    let total = 0, kept = 0, keptImg = 0, keptText = 0;

    for (const a of candidates) {
      if (!(a instanceof HTMLAnchorElement)) continue;
      total++;

      // Fast prefilter before isValidAnimeLink():
      const isImg = !!a.querySelector('img');
      const isTextOk = !isImg && this._isTextWhitelisted(a);
      if (!isImg && !isTextOk) continue; // text not whitelisted
      if (isImg && a.closest('#trailers')) continue; // trailer image section

      out.push(a);
      kept++;
      if (isImg) keptImg++;
      else keptText++;
    }

    if (IS_DEBUG && !this._didLogAnchorStats) {
      this._didLogAnchorStats = true;
      log(`[aniSearch] queryAnimeAnchors: candidates=${total}, kept=${kept} (image=${keptImg}, text=${keptText})`);
    }

    return out;
  },

  // -------------------------
  // Mapping (prefetch + sync lookup) — same pattern as AniList
  // -------------------------
  resolveLookupId(anisearchId /*, href */) {
    return this._idMap.get(anisearchId) || null;
  },

  async _fetchMappingsFromJsonl(ids) {
    // JSONL line: {"mal_id":1,"anisearch_id":1572}
    return fetchJsonlIdMap(this._mappingsUrl, 'anisearch_id', 'mal_id', ids, 'aniSearch mappings');
  },

  async prefetchLookupIds(anisearchIds) {
    const run = async () => {
      const unique = [...new Set(anisearchIds)].filter((n) => Number.isFinite(n));
      if (!unique.length) return;

      const missing = unique.filter((id) => !this._idMap.has(id));
      if (!missing.length) return;

      if (IS_DEBUG) log(`[aniSearch] prefetch: want=${unique.length}, missing=${missing.length}`);

      // 1) Load from storage
      const keys = missing.map((id) => this._storageKeyPrefix + id);
      const stored = await browser.storage.local.get(keys);

      let loadedFromStorage = 0;
      for (const id of missing) {
        const v = stored[this._storageKeyPrefix + id];
        if (Number.isFinite(v) && v > 0) {
          this._idMap.set(id, v);
          loadedFromStorage++;
        }
      }

      const stillMissing = missing.filter((id) => !this._idMap.has(id));
      if (IS_DEBUG) log(`[aniSearch] prefetch: loadedFromStorage=${loadedFromStorage}, stillMissing=${stillMissing.length}`);
      if (!stillMissing.length) return;

      // 2) Fetch from JSONL (streamed + early abort)
      const fetched = await this._fetchMappingsFromJsonl(stillMissing);
      if (!fetched.size) {
        if (IS_DEBUG) log('[aniSearch] prefetch: fetched=0 (no mappings found)');
        return;
      }

      const toStore = {};
      for (const [aid, mid] of fetched.entries()) {
        this._idMap.set(aid, mid);
        toStore[this._storageKeyPrefix + aid] = mid;
      }

      await browser.storage.local.set(toStore);

      if (IS_DEBUG) log(`[aniSearch] prefetch: fetched=${fetched.size}, totalCachedNow=${this._idMap.size}`);
    };

    // Serialize overlapping prefetches (same as AniList)
    this._prefetchLock = (this._prefetchLock || Promise.resolve()).then(run, run);
    return this._prefetchLock;
  },

  // -------------------------
  // Injection
  // -------------------------
  hasBackgroundImage(anchor) {
    const inlineBg = anchor.style.backgroundImage;
    if (inlineBg && inlineBg !== 'none' && inlineBg.includes('url')) return true;

    const computedBg = getComputedStyle(anchor).backgroundImage;
    if (computedBg && computedBg !== 'none' && computedBg.includes('url')) return true;

    if (anchor.hasAttribute('data-bg') || anchor.hasAttribute('data-src')) return true;
    return false;
  },

  chooseOverlayMode(anchor) {
    if (anchor.querySelector('img')) return 'img';
    if (this.hasBackgroundImage(anchor)) return 'background';
    return 'text';
  },

  injectForAnchor(anchor, isPartial, style) {
    const mode = this.chooseOverlayMode(anchor);

    if (mode === 'img') {
      injectImageOverlayIcon(anchor, isPartial, style);
      return;
    }
    if (mode === 'background') {
      injectImageOverlayIconBackground(anchor, isPartial, style);
      return;
    }

    // Text link icon
    if (!anchor.textContent.trim()) return;
    if (!/[ \u00A0]$/.test(anchor.textContent)) {
      anchor.appendChild(document.createTextNode('\u00A0'));
    }
    anchor.appendChild(createTitleIcon(isPartial, true, style));
  },

  annotateTitle(dubbedSet, partialSet, style) {
    const aniId = this.getCurrentPageAnimeId();
    if (!Number.isFinite(aniId)) return;

    const malId = this.resolveLookupId(aniId);
    if (!Number.isFinite(malId)) return;

    const h1 = document.querySelector('h1');
    if (!h1) return;
    if (h1.querySelector('.mydublist-icon')) return;

    const isPartial = partialSet.has(malId);
    const isDubbed = dubbedSet.has(malId);
    if (!isPartial && !isDubbed) return;
    
    if (!/[ \u00A0]$/.test(h1.textContent || '')) h1.appendChild(document.createTextNode('\u00A0'));
    const titleIcon = createTitleIcon(isPartial, false, style);
    titleIcon.style.setProperty('font-size', '0.9em', 'important');
    h1.appendChild(titleIcon);

    h1.style.alignItems = 'center';
    h1.style.gap = '0px';
  },

  async maybeInsertSourcesSection(language, tries = 20) {
    try {
      // Only on the main anime page (avoid ratings/other tabs)
      const p = window.location.pathname;
      if (!/^\/anime\/\d+(?:,[^\/]+)?\/?$/i.test(p)) return;

      const aniId = this.getCurrentPageAnimeId?.();
      if (!Number.isFinite(aniId)) return;

      // Be defensive: ensure mapping exists (SPA timing)
      if (typeof this.prefetchLookupIds === 'function') {
        try { await this.prefetchLookupIds([aniId]); } catch {}
      }

      const malId = this.resolveLookupId?.(aniId);
      if (!Number.isFinite(malId)) {
        if (IS_DEBUG) log(`[aniSearch] sources: missing mapping for anisearch_id=${aniId}`);
        return;
      }

      const key = `anisearch|${String(language || '').toLowerCase()}|${malId}`;

      const status = document.querySelector('section#status');
      if (!status) {
        if (tries > 0) {
          setTimeout(() => this.maybeInsertSourcesSection(language, tries - 1), 120);
        } else if (IS_DEBUG) {
          log('[aniSearch] sources: #status not found, giving up');
        }
        return;
      }

      // If already present & correct, just ensure placement right after #status
      const existing = document.getElementById('mydublist-sources-anisearch');
      if (existing && existing.getAttribute('data-mdl-key') === key) {
        if (existing.previousElementSibling !== status) status.insertAdjacentElement('afterend', existing);
        return;
      }

      // Serialize builds (avoid multiple fetches on mutations)
      const run = async () => {
        const ex = document.getElementById('mydublist-sources-anisearch');
        if (ex && ex.getAttribute('data-mdl-key') === key) {
          if (ex.previousElementSibling !== status) status.insertAdjacentElement('afterend', ex);
          return;
        }

        const data = await mdlGetAnimeSources(malId, language);
        if (!data) {
          if (IS_DEBUG) log(`[aniSearch] sources: no API data for mal_id=${malId}`);
          return;
        }

        const providers = PROVIDER_ORDER
          .filter((prov) => !String(prov).startsWith('_') && !!data[prov]);

        if (!providers.length) return;

        const section = document.createElement('section');
        section.id = 'mydublist-sources-anisearch';
        section.setAttribute('data-mdl-sources', 'true');
        section.setAttribute('data-mdl-key', key);

        const h2 = document.createElement('h2');
        h2.textContent = `MyDubList Sources (${providers.length})`;
        section.appendChild(h2);

        const div = document.createElement('div');
        const ul = document.createElement('ul');
        ul.className = 'xlist row';

        for (const prov of providers) {
          const href = data[prov];
          if (!href) continue;

          const label = PROVIDER_LABEL[prov] || prov;
          const ico = faviconUrlFor(prov);

          let host = '';
          try { host = new URL(href).hostname; } catch {}

          const li = document.createElement('li');

          // 1) icon link (like contributors avatar)
          const aImg = document.createElement('a');
          aImg.href = href;
          aImg.target = '_blank';
          aImg.rel = 'nofollow noopener noreferrer';
          aImg.setAttribute('data-mdl-no-annotate', 'true');

          const img = document.createElement('img');
          img.loading = 'lazy';
          img.src = ico || '';
          img.alt = label;
          img.title = label;
          img.className = 'avatar';

          // Favicons can be tiny; keep them legible in the avatar slot
          img.style.objectFit = 'contain';
          img.style.background = 'transparent';

          aImg.appendChild(img);
          li.appendChild(aImg);

          // 2) provider name link
          const aName = document.createElement('a');
          aName.href = href;
          aName.target = '_blank';
          aName.rel = 'nofollow noopener noreferrer';
          aName.textContent = label;
          aName.setAttribute('data-mdl-no-annotate', 'true');
          li.appendChild(aName);

          // 3) small “meta” text like contributors' Cookies
          const meta = document.createElement('span');
          meta.textContent = host || 'External link';
          li.appendChild(meta);

          ul.appendChild(li);
        }

        div.appendChild(ul);
        section.appendChild(div);

        // Replace old block if any
        const old = document.getElementById('mydublist-sources-anisearch');
        if (old) old.remove();

        // Insert right after Member Statistics
        status.insertAdjacentElement('afterend', section);

        if (IS_DEBUG) log(`[aniSearch] sources inserted: mal_id=${malId}, count=${providers.length}`);
        this._sourcesLastKey = key;
      };

      this._sourcesLock = (this._sourcesLock || Promise.resolve()).then(run, run);
      return this._sourcesLock;
    } catch (e) {
      log('[aniSearch] maybeInsertSourcesSection error', e);
    }
  }
};

const ANN_RULE = {
  id: 'ANN',
  hosts: [/^(?:.*\.)?animenewsnetwork\.com$/],
  _mappingsUrl: 'https://raw.githubusercontent.com/Joelis57/MyDubList/main/dubs/mappings/mappings_ann.jsonl'

  // Implement later.
};

const SITE_RULES = [MAL_RULE, ANILIST_RULE, ANISEARCH_RULE, ANN_RULE];

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

      if (activeRule?.id === 'AniList' && typeof activeRule.maybeInsertSourcesSection === 'function') {
        try { activeRule.maybeInsertSourcesSection(language); } catch {}
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

          // Skip any anchors explicitly marked as non-annotatable (e.g., MyDubList Sources block)
          if (anchor.hasAttribute('data-mdl-no-annotate') || anchor.closest('[data-mdl-sources]')) {
            processed.add(anchor);
            continue;
          }

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

          if (!activeRule.isValidAnimeLink(anchor, url)) {
            processed.add(anchor);
            continue;
          }

          // Extract the site's id (MAL id on MAL, AniList id on AniList, etc.)
          const rawId = activeRule.extractAnimeId(url.href);
          if (!rawId) {
            processed.add(anchor);
            continue;
          }

          // Some sites need an additional mapping step (e.g., AniList -> MAL).
          const lookupId = typeof activeRule.resolveLookupId === 'function' ? activeRule.resolveLookupId(rawId, url.href) : rawId;
          if (!lookupId) {
            // If mapping is unavailable, treat as processed for this run.
            processed.add(anchor);
            continue;
          }

          // From this point on, treat this anchor as stable for the current run.
          processed.add(anchor);

          const isDubbed = dubbedSet.has(lookupId);
          const isPartial = partialSet.has(lookupId);
          log(`Checking anime id: ${lookupId} (isDubbed: ${isDubbed}, isPartial: ${isPartial})`);

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

      async function scan(root) {
        const anchors = activeRule.queryAnimeAnchors(root);

        // Some sites need to prefetch id mappings before we can check dub lists.
        if (typeof activeRule.prefetchLookupIds === 'function') {
          const ids = new Set();

          for (const a of anchors) {
            if (!(a instanceof HTMLAnchorElement)) continue;
            if (processed.has(a)) continue;
            if (a.hasAttribute('data-dubbed-icon')) continue;

            const href = a.getAttribute('href');
            if (!href) continue;

            try {
              const u = new URL(href, window.location.origin);
              const rid = activeRule.extractAnimeId(u.href);
              if (Number.isFinite(rid)) ids.add(rid);
            } catch {
              // ignore
            }
          }

          // Also prefetch mapping for the current page's anime (so annotateTitle can work).
          if (typeof activeRule.getCurrentPageAnimeId === 'function') {
            const pageId = activeRule.getCurrentPageAnimeId();
            if (Number.isFinite(pageId)) ids.add(pageId);
          }

          if (ids.size) {
            try {
              await activeRule.prefetchLookupIds([...ids]);
            } catch (e) {
              log('prefetchLookupIds failed', e);
            }
          }
        }

        // Keep per-site sidebar extras in sync on SPAs (e.g., AniList navigation)
        if (typeof activeRule.maybeInsertSourcesSection === 'function') {
          try {
            activeRule.maybeInsertSourcesSection(language);
          } catch (e) {
            // ignore
          }
        }

        annotateAnchors(anchors);
      }

      // Initial scan
      await scan(document);

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
