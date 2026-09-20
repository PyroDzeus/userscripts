// ==UserScript==
// @name         Plex Awards 🏆
// @namespace    plex.awards
// @version      2.1
// @description  IMDb awards & nominations shown directly on the Plex page — ranked by prestige, summarised in one line, expandable, with a link to the title's /awards/ page. Fully bilingual: in French the data itself is pulled from IMDb's French pages.
// @match        https://app.plex.tv/*
// @match        http://*/web/*
// @match        https://*/web/*
// @match        http://127.0.0.1:32400/*
// @match        http://localhost:32400/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @connect      imdb.com
// @connect      api.graphql.imdb.com
// @connect      *
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-awards.user.js
// @updateURL    https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-awards.user.js
// ==/UserScript==

(function () {
  'use strict';

  const CARD_ID = 'paw-card';
  const STORE = 'pawSettings';
  const CACHE_KEY = 'pawCache';
  const CACHE_VERSION = 3;   // bump to invalidate every cached entry at once

  /* ============================================================
     1. SETTINGS
     ============================================================ */
  const DEFAULTS = {
    lang: 'auto',          // 'auto' (follows the browser) | 'en' | 'fr'
    placement: 'title',    // 'title' | 'summary' | 'float'
    corner: 'br',          // floating mode only: 'br' | 'bl' | 'tr' | 'tl'
    floatPos: null,        // {left, top} once dragged — overrides `corner`
    expanded: false,       // open the detail panel automatically
    majorOnly: false,      // only show prestige ceremonies (tier >= 4)
    sort: 'prestige',      // 'prestige' | 'year'
    maxGroups: 8,          // ceremonies listed before the "+ N more" button
    chips: 3,              // highlighted wins shown in the collapsed bar
    localized: true,       // in French, read IMDb's French pages rather than the default ones
    source: 'auto',        // 'auto' | 'page' (force the HTML page) | 'api' (force GraphQL)
    cacheDays: 30,
  };

  function loadSettings() {
    let s = null;
    try { s = JSON.parse(GM_getValue(STORE, 'null')); } catch (e) {}
    return Object.assign({}, DEFAULTS, s || {});
  }
  function saveSettings() { GM_setValue(STORE, JSON.stringify(settings)); }
  let settings = loadSettings();

  /* ============================================================
     2. I18N — interface strings only.
     The award texts themselves come from IMDb, in the matching
     language: see LOCALE / fetchAwards below.
     ============================================================ */
  const I18N = {
    en: {
      wins: n => n + (n > 1 ? ' wins' : ' win'),
      noms: n => n + (n > 1 ? ' nominations' : ' nomination'),
      loading: 'Awards…',
      unavailable: 'Awards unavailable',
      retry: 'Retry',
      none: 'No awards on record',
      filteredOut: 'No major awards for this title — untick “Major awards only” to see everything.',
      failedHint: 'IMDb did not answer. Retry, or open the page directly.',
      razzT: n => n + (n > 1 ? ' entries' : ' entry') + ' from a “worst of” ceremony — counted above, listed last.',
      detailsT: 'Show / hide the detail',
      settingsT: 'Settings',
      imdbT: 'Open the awards page on IMDb',
      langT: 'Switch language (also switches the IMDb source)',
      seriesNote: t => 'Awards for the series: ' + t,
      more: n => '+ ' + n + ' more ceremonies',
      less: 'Collapse',
      award: 'Award',
      awardsWord: 'Awards',
      winner: 'Winner',
      nominee: 'Nominee',
      sPosition: 'Position',
      sCorner: 'Corner',
      sLanguage: 'Language',
      sSort: 'Sort by',
      sMajor: 'Major awards only',
      sExpanded: 'Expanded by default',
      sMax: 'Ceremonies',
      sLocalized: 'French data from IMDb FR',
      sSource: 'Source',
      posTitle: 'Under the title',
      posSummary: 'Under the synopsis',
      posFloat: 'Floating card',
      cBR: 'Bottom right', cBL: 'Bottom left', cTR: 'Top right', cTL: 'Top left',
      sortPrestige: 'Prestige', sortYear: 'Most recent',
      langAuto: 'Auto', langEn: 'English', langFr: 'Français',
      srcAuto: 'Auto', srcPage: 'IMDb page', srcApi: 'IMDb API',
      copyMd: 'Copy as Markdown',
      copied: '✓ Copied',
      copyFail: '✕ Copy failed',
      resetPos: 'Reset position',
      clearCache: 'Clear IMDb cache',
      cacheCleared: '✓ Cache cleared',
      logConsole: 'Log raw data to console',
      logged: '✓ See the console',
      dragHint: 'Tip: drag the bar to move the card.',
    },
    fr: {
      wins: n => n + (n > 1 ? ' victoires' : ' victoire'),
      noms: n => n + (n > 1 ? ' nominations' : ' nomination'),
      loading: 'Palmarès…',
      unavailable: 'Palmarès indisponible',
      retry: 'Réessayer',
      none: 'Aucune récompense référencée',
      filteredOut: 'Aucun prix majeur pour ce titre — décoche « Prix majeurs seulement » pour tout voir.',
      failedHint: 'IMDb n’a pas répondu. Réessaie, ou ouvre la page directement.',
      razzT: n => n + (n > 1 ? ' entrées issues' : ' entrée issue') + ' d’une cérémonie « anti-prix » — comptée ci-dessus, listée en dernier.',
      detailsT: 'Afficher / masquer le détail',
      settingsT: 'Réglages',
      imdbT: 'Ouvrir la page des récompenses sur IMDb',
      langT: 'Changer de langue (change aussi la source IMDb)',
      seriesNote: t => 'Palmarès de la série : ' + t,
      more: n => '+ ' + n + ' autres cérémonies',
      less: 'Réduire',
      award: 'Récompense',
      awardsWord: 'Palmarès',
      winner: 'Lauréat',
      nominee: 'Nommé',
      sPosition: 'Position',
      sCorner: 'Coin',
      sLanguage: 'Langue',
      sSort: 'Trier par',
      sMajor: 'Prix majeurs seulement',
      sExpanded: 'Déplié par défaut',
      sMax: 'Cérémonies',
      sLocalized: 'Données FR depuis IMDb FR',
      sSource: 'Source',
      posTitle: 'Sous le titre',
      posSummary: 'Sous le synopsis',
      posFloat: 'Carte flottante',
      cBR: 'En bas à droite', cBL: 'En bas à gauche', cTR: 'En haut à droite', cTL: 'En haut à gauche',
      sortPrestige: 'Prestige', sortYear: 'Plus récent',
      langAuto: 'Auto', langEn: 'English', langFr: 'Français',
      srcAuto: 'Auto', srcPage: 'Page IMDb', srcApi: 'API IMDb',
      copyMd: 'Copier en Markdown',
      copied: '✓ Copié',
      copyFail: '✕ Échec de la copie',
      resetPos: 'Réinitialiser la position',
      clearCache: 'Vider le cache IMDb',
      cacheCleared: '✓ Cache vidé',
      logConsole: 'Afficher les données brutes',
      logged: '✓ Voir la console',
      dragHint: 'Astuce : glisse la barre pour déplacer la carte.',
    },
  };

  /** Resolved UI language: explicit choice, otherwise the browser's. */
  function lang() {
    if (settings.lang === 'en' || settings.lang === 'fr') return settings.lang;
    return /^fr/i.test(navigator.language || '') ? 'fr' : 'en';
  }
  function T() { return I18N[lang()]; }

  /** True when we should be reading IMDb's French pages. */
  function wantFrench() { return lang() === 'fr' && settings.localized; }

  /** Locale hints sent with every IMDb request. */
  function localeHeaders() {
    return wantFrench()
      ? { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.4', 'x-imdb-user-language': 'fr-FR', 'x-imdb-user-country': 'FR' }
      : { 'Accept-Language': 'en-US,en;q=0.9', 'x-imdb-user-language': 'en-US', 'x-imdb-user-country': 'US' };
  }

  /* ============================================================
     3. DISK CACHE
     Entries are keyed by title *and* locale, so switching language
     never serves you the other language's text.
     ============================================================ */
  let cache = (() => {
    try {
      const raw = JSON.parse(GM_getValue(CACHE_KEY, '{}')) || {};
      return raw.__v === CACHE_VERSION ? raw : { __v: CACHE_VERSION };
    } catch (e) { return { __v: CACHE_VERSION }; }
  })();

  function cacheKey(id) { return id + '@' + (wantFrench() ? 'fr' : 'en'); }

  function cacheGet(id) {
    const e = cache[cacheKey(id)];
    if (!e) return null;
    if (Date.now() - e.t > settings.cacheDays * 864e5) { delete cache[cacheKey(id)]; return null; }
    return e.v.map(a => ({ event: a[0], year: a[1] || null, category: a[2] || '', isWinner: !!a[3] }));
  }
  /** True when we stored English text under a French key (the FR page didn't answer). */
  function cachePartial(id) {
    const e = cache[cacheKey(id)];
    return !!e && e.p === 0;
  }
  function cacheSet(id, items, localised) {
    cache[cacheKey(id)] = {
      t: Date.now(),
      p: localised === false ? 0 : 1,
      v: items.slice(0, 150).map(i => [i.event, i.year || 0, i.category || '', i.isWinner ? 1 : 0]),
    };
    const keys = Object.keys(cache).filter(k => k !== '__v');
    if (keys.length > 300) keys.sort((a, b) => cache[a].t - cache[b].t).slice(0, 80).forEach(k => delete cache[k]);
    try { GM_setValue(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
  }

  /* ============================================================
     4. PLEX SIDE — rating key, server credentials, metadata
     ============================================================ */
  let serverInfo = null;

  function getRatingKey() {
    const m = location.hash.match(/key=([^&]+)/);
    if (!m) return null;
    const km = decodeURIComponent(m[1]).match(/\/library\/metadata\/(\d+)/);
    return km ? km[1] : null;
  }

  function getServerInfo() {
    if (serverInfo) return serverInfo;
    const candidates = [];
    document.querySelectorAll('img[src*="X-Plex-Token"]').forEach(i => candidates.push(i.src));
    document.querySelectorAll('[style*="X-Plex-Token"]').forEach(el => {
      const m = (el.getAttribute('style') || '').match(/url\(["']?(.*?X-Plex-Token=.*?)["']?\)/);
      if (m) candidates.push(m[1]);
    });
    try {
      performance.getEntriesByType('resource').forEach(e => {
        if (e.name.includes('X-Plex-Token') && e.name.includes('/library/')) candidates.push(e.name);
      });
    } catch (e) {}
    for (const c of candidates) {
      try {
        const u = new URL(c, location.href);
        const token = u.searchParams.get('X-Plex-Token');
        if (token) { serverInfo = { origin: u.origin, token }; return serverInfo; }
      } catch (e) {}
    }
    return null;
  }

  function fetchXml(srv, path, cb) {
    const sep = path.includes('?') ? '&' : '?';
    GM_xmlhttpRequest({
      method: 'GET',
      url: `${srv.origin}${path}${sep}X-Plex-Token=${srv.token}`,
      headers: { Accept: 'application/xml' },
      onload: res => {
        try { cb(new DOMParser().parseFromString(res.responseText, 'text/xml')); } catch (e) { cb(null); }
      },
      onerror: () => cb(null),
    });
  }

  /** Pull the few fields we need out of a Plex metadata document. */
  function parseItem(doc) {
    if (!doc) return null;
    const el = doc.querySelector('MediaContainer > Video, MediaContainer > Directory');
    if (!el) return null;
    const guids = [...el.children].filter(c => c.tagName === 'Guid').map(g => g.getAttribute('id') || '');
    const g = guids.find(x => x.startsWith('imdb://'));
    return {
      type: el.getAttribute('type'),
      title: el.getAttribute('title'),
      year: el.getAttribute('year'),
      parentKey: el.getAttribute('parentKey'),
      grandparentKey: el.getAttribute('grandparentKey'),
      grandparentTitle: el.getAttribute('grandparentTitle'),
      imdb: g ? g.slice(7) : null,
    };
  }

  /** Episodes and seasons have no awards page of their own: climb to the series. */
  function resolveTarget(srv, key, cb) {
    fetchXml(srv, `/library/metadata/${key}`, doc => {
      const it = parseItem(doc);
      if (!it) return cb(null);
      if (it.type === 'movie' || it.type === 'show') {
        return cb({ imdb: it.imdb, title: it.title, kind: it.type, viaShow: false });
      }
      const showKey = it.type === 'season' ? it.parentKey : it.grandparentKey;
      if (!showKey) return cb({ imdb: it.imdb, title: it.title, kind: it.type, viaShow: false });
      fetchXml(srv, showKey, d2 => {
        const sh = parseItem(d2);
        cb({
          imdb: (sh && sh.imdb) || it.imdb,
          title: (sh && sh.title) || it.grandparentTitle || it.title,
          kind: it.type,
          viaShow: true,
        });
      });
    });
  }

  /* ============================================================
     5. IMDB SIDE
     Two independent sources, tried in the order that best matches
     the requested language:
       · the /awards/ HTML page — always in the language of its URL
         (/fr/title/... gives French categories), so it is the first
         choice in French because it mirrors exactly what you read
         on imdb.com;
       · the public GraphQL endpoint — faster and structurally more
         stable, first choice in English.
     ============================================================ */
  const GQL_URL = 'https://api.graphql.imdb.com/';

  const GQL_FULL = `query TitleAwards($id: ID!) {
    title(id: $id) {
      awardNominations(first: 250) {
        total
        edges { node {
          isWinner
          award { text category { text } event { text } eventEdition { year } }
        } }
      }
    }
  }`;

  const GQL_MIN = `query TitleAwards($id: ID!) {
    title(id: $id) {
      awardNominations(first: 250) {
        total
        edges { node { isWinner award { text event { text } eventEdition { year } } } }
      }
    }
  }`;

  function awardsUrl(id) {
    return `https://www.imdb.com/${wantFrench() ? 'fr/' : ''}title/${id}/awards/?ref_=tt_awd`;
  }

  /** Flatten one GraphQL / embedded-JSON node into our own shape. */
  function normNode(n) {
    const a = n.award || {};
    return {
      event: (a.event && a.event.text) || a.text || T().award,
      year: (a.eventEdition && a.eventEdition.year) || null,
      category: (a.category && a.category.text) || (n.category && n.category.text) || a.text || '',
      isWinner: !!n.isWinner,     // authoritative: never inferred from text here
    };
  }

  /** Remove exact duplicates — IMDb occasionally lists the same line twice. */
  function dedupe(items) {
    const seen = new Set();
    return items.filter(i => {
      const k = i.event + '|' + i.year + '|' + i.category + '|' + i.isWinner;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /* IMDb answers a background request with 403 (bot check) or 429 (too many
     requests) far more often than it actually fails. Those deserve another
     try a moment later; a clean answer with no awards does not. Every source
     below therefore reports { ok, items } or { ok:false, retry }.            */
  const SOFT_STATUS = new Set([0, 403, 408, 425, 429, 500, 502, 503, 504]);
  const softFail = status => ({ ok: false, retry: SOFT_STATUS.has(status === undefined ? 0 : status) });

  function gql(id, query, cb) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: GQL_URL,
      headers: Object.assign({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-imdb-client-name': 'imdb-web-next',
      }, localeHeaders()),
      data: JSON.stringify({ query, variables: { id } }),
      timeout: 12000,
      onload: res => {
        if (res.status && (res.status < 200 || res.status >= 300)) return cb(softFail(res.status));
        try {
          const j = JSON.parse(res.responseText);
          if (j && j.errors && j.errors.length) return cb({ ok: false, retry: true });
          const noms = j && j.data && j.data.title && j.data.title.awardNominations;
          if (!noms || !Array.isArray(noms.edges)) return cb({ ok: false, retry: false });
          cb({ ok: true, items: dedupe(noms.edges.map(e => normNode(e.node))) });
        } catch (e) { cb({ ok: false, retry: true }); }   // an error page instead of JSON
      },
      onerror: () => cb({ ok: false, retry: true }),
      ontimeout: () => cb({ ok: false, retry: true }),
    });
  }

  /** The full query first, then the lighter one if IMDb rejects a field. */
  function fromApi(id, cb) {
    gql(id, GQL_FULL, r => {
      if (r.ok) return cb(r);
      gql(id, GQL_MIN, r2 => cb(r2.ok ? r2 : { ok: false, retry: r.retry || r2.retry }));
    });
  }

  /**
   * Walk the page's embedded JSON for any object carrying an `isWinner`
   * boolean. This is the preferred way to read the HTML page: the text
   * is already localised and the win/nomination flag is explicit.
   */
  function fromEmbeddedJson(html) {
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    let data;
    try { data = JSON.parse(m[1]); } catch (e) { return null; }
    const out = [];
    (function walk(n, depth) {
      if (!n || depth > 14 || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(x => walk(x, depth + 1));
      if (typeof n.isWinner === 'boolean' && (n.award || n.event || n.awardName)) out.push(normNode(n));
      for (const k in n) walk(n[k], depth + 1);
    })(data, 0);
    return out.length ? dedupe(out) : null;
  }

  /* --- Winner vs nominee, the careful way -----------------------
     Both languages, both genders, singular and plural. When a row
     somehow contains both markers, the one appearing FIRST wins:
     IMDb always prints the status badge before the category, so an
     award literally named "…Winner…" further down cannot flip it.   */
  const WIN_WORDS = /\b(winner|winners|won|gagnant|gagnante|gagnants|laur[ée]at|laur[ée]ate|laur[ée]ats|r[ée]compens[ée]|r[ée]compens[ée]e)\b/i;
  const NOM_WORDS = /\b(nominee|nominees|nominated|nomination|nominations|nomin[ée]|nomin[ée]e|nomin[ée]s|nomm[ée]|nomm[ée]e|nomm[ée]s)\b/i;

  function statusOf(text) {
    const w = text.search(WIN_WORDS);
    const n = text.search(NOM_WORDS);
    if (w < 0 && n < 0) return null;   // neither marker: not an award row
    if (w < 0) return false;
    if (n < 0) return true;
    return w < n;
  }

  /** Last resort: read the rendered list items of the awards page. */
  function fromDom(html) {
    let doc;
    try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (e) { return null; }
    const out = [];
    doc.querySelectorAll('li[class*="ipc-metadata-list-summary-item"]').forEach(li => {
      const txt = (li.textContent || '').replace(/\s+/g, ' ').trim();
      // The status badge sits at the very start of the row; look there
      // first and only widen the search if nothing was found.
      let status = statusOf(txt.slice(0, 60));
      if (status === null) status = statusOf(txt);
      if (status === null) return;

      const sec = li.closest('section, [data-testid]');
      const head = sec ? sec.querySelector('h3, h4, .ipc-title__text') : null;
      const event = ((head && head.textContent) || T().award).replace(/\s+/g, ' ').trim();
      const ym = txt.match(/\b(19|20)\d{2}\b/);
      const cat = txt
        .replace(/\b(19|20)\d{2}\b/, '')
        .replace(WIN_WORDS, '').replace(NOM_WORDS, '')
        .replace(/\s+/g, ' ').trim().split(/\s{2,}|·/)[0].slice(0, 90);

      out.push({ event, year: ym ? parseInt(ym[0], 10) : null, category: cat, isWinner: status });
    });
    return out.length ? dedupe(out) : null;
  }

  function fromPage(id, cb) {
    GM_xmlhttpRequest({
      method: 'GET',
      url: awardsUrl(id),
      headers: Object.assign({ Accept: 'text/html' }, localeHeaders()),
      timeout: 20000,
      onload: res => {
        if (res.status && (res.status < 200 || res.status >= 300)) return cb(softFail(res.status));
        const html = res.responseText || '';
        const items = fromEmbeddedJson(html) || fromDom(html);
        // A page we can't read at all is usually a consent or bot-check page.
        cb(items ? { ok: true, items } : { ok: false, retry: true });
      },
      onerror: () => cb({ ok: false, retry: true }),
      ontimeout: () => cb({ ok: false, retry: true }),
    });
  }

  /**
   * Cache-first orchestration.
   *
   * The API comes first: it answers a small JSON, where the page weighs
   * several megabytes and is the one IMDb blocks most readily. In French
   * the page is still read, but afterwards and in the background, only to
   * replace the text with IMDb's French wording — so a refused page costs
   * you the translation, never the awards themselves.
   *
   * When IMDb refuses (403 / 429 / timeout…) the whole thing is tried again
   * twice, a couple of seconds apart. The card keeps saying "Awards…" in the
   * meantime, and only gives up once those attempts are spent.
   */
  const RETRY_DELAYS = [1500, 4000];

  function fetchAwards(id, cb, force) {
    if (!force) {
      const hit = cacheGet(id);
      if (hit) {
        cb(hit, false);
        // English text stored under a French key: try the translation again, quietly.
        if (cachePartial(id) && wantFrench() && settings.source !== 'api') localise(id, cb);
        return;
      }
    }

    const PAGE = next => fromPage(id, r => (r.ok ? done(r.items, true) : next(r)));
    const API = next => fromApi(id, r => (r.ok ? done(r.items, !wantFrench()) : next(r)));

    let chain;
    if (settings.source === 'page') chain = [PAGE, API];
    else chain = [API, PAGE];      // the API leads, even in French

    (function attempt(round) {
      let i = 0, soft = false;
      (function next(r) {
        if (r && r.retry) soft = true;
        if (i < chain.length) return chain[i++](next);
        // every source failed
        if (soft && round < RETRY_DELAYS.length) return setTimeout(() => attempt(round + 1), RETRY_DELAYS[round]);
        cb([], true);
      })(null);
    })(0);

    function done(items, localised) {
      cacheSet(id, items, localised);
      cb(items, false);
      if (!localised && wantFrench() && settings.source !== 'api') localise(id, cb);
    }
  }

  /** Background pass: swap English text for IMDb's French wording, if it answers. */
  function localise(id, cb) {
    fromPage(id, r => {
      if (!r.ok) return;                 // keep what we already show
      cacheSet(id, r.items, true);
      cb(r.items, false);
    });
  }

  /* ============================================================
     6. PRESTIGE RANKING
     Ceremony names are matched in both languages where IMDb
     translates them (Cannes, Venise/Mostra, Berlin, César…).
     ============================================================ */
  const NEGATIVE_RE = /golden raspberry|razzie|stinkers|\bworst\b|navet|pire /i;

  const TIERS = [
    { t: 5, re: /academy awards|\boscars?\b|golden globes?|british academy|\bbafta\b|cannes|venice film festival|mostra|venise|berlin international|berlinale|c[eé]sar|primetime emmy|screen actors guild/i },
    { t: 4, re: /directors guild|writers guild|producers guild|critics.{0,4}choice|broadcast film critics|european film awards|prix du cin[ée]ma europ[ée]en|independent spirit|sundance|locarno|san sebasti|karlovy vary|goya|david di donatello|lumi[eè]res?|louis[- ]delluc|jean vigo|toronto international|hong kong film awards|golden horse|japan academy|asian film awards|annie awards|bodil|guldbagge|ariel awards|deutscher filmpreis|magritte/i },
    { t: 3, re: /film critics|critics (association|circle|society)|national board of review|national society|satellite awards|saturn awards|online film|golden reel|american cinema editors|art directors guild|costume designers guild|cinema audio society|visual effects society|society of cinematographers|grammy|tony awards|peabody/i },
  ];

  function tierOf(event) {
    if (NEGATIVE_RE.test(event)) return 0;
    for (const t of TIERS) if (t.re.test(event)) return t.t;
    return 2;
  }

  // Headline categories weigh more than crafts — English and French wording.
  const CAT_MAJOR = /best (motion picture|picture|film|director|directing|actor|actress|screenplay|writing|original screenplay|adapted screenplay|foreign|international|animated feature|documentary)|palme d'or|golden lion|lion d'or|golden bear|ours d'or|grand (jury )?prize|grand prix|jury prize|prix du jury|best (drama|comedy) series|outstanding (drama|comedy|limited) series|meilleur (film|r[ée]alisateur|acteur|sc[ée]nario|premier film)|meilleure (actrice|r[ée]alisation|r[ée]alisatrice)/i;
  const CAT_CRAFT = /cinematograph|editing|\bscore\b|music|sound|visual effects|production design|art direction|costume|makeup|hair|\bsong\b|photographie|montage|musique|d[ée]cors|effets|maquillage|chanson|son\b/i;

  function scoreOf(it) {
    let s = tierOf(it.event) * 1000;
    if (it.isWinner) s += 400;
    if (CAT_MAJOR.test(it.category)) s += 200;
    else if (CAT_CRAFT.test(it.category)) s += 60;
    return s;
  }

  // Long official names are unreadable in a chip; these are the short forms.
  const SHORT = [
    [/academy awards|\boscars?\b/i, 'Oscars'],
    [/golden globes?/i, 'Golden Globes'],
    [/british academy|bafta/i, 'BAFTA'],
    [/c[eé]sar/i, 'César'],
    [/cannes/i, 'Cannes'],
    [/venice|mostra|venise/i, 'Venise'],
    [/berlin/i, 'Berlin'],
    [/primetime emmy|emmy/i, 'Emmy'],
    [/screen actors guild/i, 'SAG'],
    [/directors guild/i, 'DGA'],
    [/writers guild/i, 'WGA'],
    [/producers guild/i, 'PGA'],
    [/european film awards|cin[ée]ma europ[ée]en/i, 'European Film Awards'],
    [/independent spirit/i, 'Spirit Awards'],
    [/national board of review/i, 'NBR'],
    [/golden raspberry|razzie/i, 'Razzies'],
  ];

  function shortName(event) {
    for (const [re, name] of SHORT) if (re.test(event)) return name;
    return event.replace(/,\s*(USA|UK|France|Italy|Spain|Germany|Japan|[ÉE]tats-Unis|Royaume-Uni)$/i, '').trim();
  }

  /**
   * Group by ceremony, count, sort, pick the highlight chips.
   * Counting rule: every single entry lands in exactly one of `wins`
   * or `noms`, so the headline always adds up to what the detail
   * lists — and matches IMDb's own totals. `negs` is only a flag
   * telling how many of those entries come from a "worst of"
   * ceremony; it never removes them from the totals.
   */
  function organise(items) {
    const map = new Map();
    let wins = 0, noms = 0, negs = 0;

    for (const raw of items) {
      const it = Object.assign({}, raw);
      it.tier = tierOf(it.event);
      it.neg = it.tier === 0;
      it.score = scoreOf(it);

      if (it.isWinner) wins++; else noms++;
      if (it.neg) negs++;

      const key = shortName(it.event);
      let g = map.get(key);
      if (!g) { g = { name: key, tier: it.tier, neg: it.neg, years: new Set(), wins: [], noms: [], score: 0, last: 0 }; map.set(key, g); }
      (it.isWinner ? g.wins : g.noms).push(it);
      if (it.year) { g.years.add(it.year); g.last = Math.max(g.last, it.year); }
      g.score = Math.max(g.score, it.score);
      g.tier = Math.max(g.tier, it.tier);
      g.neg = g.neg && it.neg;
    }

    const groups = [...map.values()].sort((a, b) => {
      if (a.neg !== b.neg) return a.neg ? 1 : -1;              // "worst of" ceremonies always last
      if (settings.sort === 'year' && b.last !== a.last) return b.last - a.last;
      if (b.score !== a.score) return b.score - a.score;
      return (b.wins.length + b.noms.length) - (a.wins.length + a.noms.length);
    });
    groups.forEach(g => {
      g.wins.sort((a, b) => b.score - a.score);
      g.noms.sort((a, b) => b.score - a.score);
    });

    const chips = items
      .map(i => Object.assign({}, i, { tier: tierOf(i.event), score: scoreOf(i) }))
      .filter(i => i.isWinner && i.tier >= 4)          // only real wins are highlighted
      .sort((a, b) => b.score - a.score)
      .slice(0, settings.chips);

    return { groups, wins, noms, negs, chips, total: items.length };
  }

  /** "4 🏆 - 10 nominations" — spaced out, never abbreviated. */
  function countLabel(g) {
    const t = T();
    const parts = [];
    if (g.wins.length) parts.push(g.wins.length + ' 🏆');
    if (g.noms.length) parts.push(t.noms(g.noms.length));
    return parts.join(' - ');
  }

  /* ============================================================
     7. STYLES
     ============================================================ */
  const GOLD = '#f5c518';
  const style = document.createElement('style');
  style.textContent = `
    #${CARD_ID} {
      --paw-gold: ${GOLD};
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      color: #e8dcae; box-sizing: border-box;
      border: 1px solid rgba(245,197,24,.28);
      border-left: 3px solid var(--paw-gold);
      border-radius: 8px;
      background: linear-gradient(100deg, rgba(245,197,24,.10), rgba(245,197,24,.03) 45%, rgba(0,0,0,.18));
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      overflow: hidden;
    }
    #${CARD_ID}.paw-inline { margin: 12px 0 4px; width: 100%; max-width: 680px; align-self: stretch; }
    #${CARD_ID}.paw-float {
      position: fixed; width: 340px; z-index: 99998;
      background: #14161a; box-shadow: 0 10px 30px rgba(0,0,0,.55);
      transition: top .18s ease, bottom .18s ease, left .18s ease, right .18s ease;
    }
    #${CARD_ID}.paw-float.dragging { transition: none; opacity: .92; }

    #${CARD_ID} .paw-bar {
      display: flex; align-items: center; gap: 8px; padding: 7px 10px;
      cursor: pointer; user-select: none;
    }
    #${CARD_ID}.paw-float .paw-bar { cursor: grab; }
    #${CARD_ID}.paw-float.dragging .paw-bar { cursor: grabbing; }
    #${CARD_ID} .paw-bar:hover { background: rgba(245,197,24,.07); }
    #${CARD_ID} .paw-cup { font-size: 14px; line-height: 1; flex: 0 0 auto; }
    #${CARD_ID} .paw-head {
      font-size: 12.5px; font-weight: 700; color: var(--paw-gold);
      white-space: nowrap; flex: 0 0 auto;
    }
    #${CARD_ID} .paw-razz { font-size: 11px; color: #8d8262; flex: 0 0 auto; cursor: help; }
    #${CARD_ID} .paw-chips { display: flex; gap: 5px; flex: 1 1 auto; min-width: 0; overflow: hidden; }
    #${CARD_ID} .paw-chip {
      font-size: 10.5px; font-weight: 600; padding: 2px 7px; border-radius: 999px;
      background: rgba(245,197,24,.14); border: 1px solid rgba(245,197,24,.25);
      color: #f0dda0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 210px; text-decoration: none;
    }
    #${CARD_ID} .paw-chip:hover { background: rgba(245,197,24,.24); color: #fff3cd; }
    #${CARD_ID} .paw-act { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; }
    #${CARD_ID} .paw-imdb {
      font-size: 10.5px; font-weight: 800; letter-spacing: .02em;
      background: var(--paw-gold); color: #111; text-decoration: none;
      padding: 3px 8px; border-radius: 4px; white-space: nowrap;
    }
    #${CARD_ID} .paw-imdb:hover { filter: brightness(1.12); }
    #${CARD_ID} .paw-lang {
      font-size: 9.5px; font-weight: 800; letter-spacing: .04em;
      background: none; border: 1px solid rgba(245,197,24,.3); color: #b09a56;
      border-radius: 4px; padding: 2px 5px; cursor: pointer; line-height: 1.25;
    }
    #${CARD_ID} .paw-lang:hover { color: var(--paw-gold); border-color: rgba(245,197,24,.6); }
    #${CARD_ID} .paw-btn {
      background: none; border: none; color: #b09a56; cursor: pointer;
      font-size: 12px; padding: 2px 3px; line-height: 1;
    }
    #${CARD_ID} .paw-btn:hover { color: var(--paw-gold); }
    #${CARD_ID} .paw-toggle { transition: transform .18s ease; }
    #${CARD_ID}.open .paw-toggle { transform: rotate(180deg); }

    #${CARD_ID} .paw-body {
      display: none; padding: 2px 10px 10px; max-height: 330px; overflow-y: auto;
      border-top: 1px solid rgba(245,197,24,.14);
    }
    #${CARD_ID}.open .paw-body { display: block; }
    #${CARD_ID} .paw-body::-webkit-scrollbar { width: 6px; }
    #${CARD_ID} .paw-body::-webkit-scrollbar-thumb { background: rgba(245,197,24,.25); border-radius: 3px; }

    #${CARD_ID} .paw-grp { margin-top: 9px; }
    #${CARD_ID} .paw-grp-h {
      display: flex; align-items: baseline; gap: 7px;
      font-size: 11.5px; font-weight: 700; color: #f0dda0;
      border-bottom: 1px solid rgba(245,197,24,.12); padding-bottom: 3px;
    }
    #${CARD_ID} .paw-rank { flex: 0 0 auto; width: 6px; height: 6px; border-radius: 50%; background: var(--paw-gold); opacity: .85; }
    #${CARD_ID} .paw-rank.t4 { opacity: .6; }
    #${CARD_ID} .paw-rank.t3 { opacity: .38; }
    #${CARD_ID} .paw-rank.t2 { opacity: .22; }
    #${CARD_ID} .paw-rank.neg { background: #8a8a8a; opacity: .5; }
    #${CARD_ID} .paw-y { font-size: 10.5px; font-weight: 500; color: #8d8262; }
    #${CARD_ID} .paw-cnt { margin-left: auto; font-size: 10.5px; color: #8d8262; font-variant-numeric: tabular-nums; white-space: nowrap; }
    #${CARD_ID} ul.paw-list { list-style: none; margin: 4px 0 0; padding: 0; }
    #${CARD_ID} ul.paw-list li {
      font-size: 11.5px; line-height: 1.5; color: #a9a08a;
      display: flex; gap: 6px; align-items: baseline;
    }
    #${CARD_ID} ul.paw-list li.win { color: #efe0b0; font-weight: 600; }
    #${CARD_ID} ul.paw-list li .mk { flex: 0 0 12px; text-align: center; opacity: .9; }
    #${CARD_ID} .paw-note { font-size: 11px; color: #8d8262; line-height: 1.5; margin-top: 8px; }
    #${CARD_ID} .paw-more {
      margin-top: 9px; font-size: 11px; color: #8d8262; cursor: pointer;
      background: none; border: none; padding: 0; text-decoration: underline dotted;
    }
    #${CARD_ID} .paw-more:hover { color: var(--paw-gold); }

    #${CARD_ID} .paw-set {
      border-top: 1px solid rgba(245,197,24,.14); padding: 9px 10px; display: none;
      font-size: 11.5px; color: #a9a08a;
    }
    #${CARD_ID}.settings .paw-set { display: block; }
    #${CARD_ID} .paw-set .r { display: flex; align-items: center; gap: 8px; margin: 5px 0; }
    #${CARD_ID} .paw-set label { flex: 0 0 118px; color: #8d8262; }
    #${CARD_ID} .paw-set select, #${CARD_ID} .paw-set input[type="number"] {
      background: rgba(0,0,0,.35); color: #e8dcae; border: 1px solid rgba(245,197,24,.25);
      border-radius: 5px; padding: 3px 6px; font: inherit; flex: 1; min-width: 0;
    }
    #${CARD_ID} .paw-set input[type="checkbox"] { accent-color: var(--paw-gold); cursor: pointer; }
    #${CARD_ID} .paw-set button.act {
      background: rgba(245,197,24,.12); border: 1px solid rgba(245,197,24,.25);
      color: #e8dcae; border-radius: 5px; padding: 4px 8px; cursor: pointer; font: inherit;
      width: 100%; margin-top: 6px;
    }
    #${CARD_ID} .paw-set button.act:hover { background: rgba(245,197,24,.2); }
    #${CARD_ID} .paw-set .hint { font-size: 10.5px; color: #7a7157; margin-top: 7px; line-height: 1.45; }

    @media (prefers-reduced-motion: reduce) {
      #${CARD_ID}, #${CARD_ID} * { transition: none !important; }
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  /* ============================================================
     8. PLACEMENT
     ============================================================ */

  /** The block holding the media title — our alignment reference. */
  function titleBlock() {
    const h1s = [...document.querySelectorAll('h1')]
      .filter(h => h.offsetParent !== null && (h.textContent || '').trim().length > 0);
    if (!h1s.length) return null;
    let el = h1s[h1s.length - 1];
    while (el.parentElement && el.parentElement.childElementCount === 1 && el.parentElement !== document.body) {
      el = el.parentElement;
    }
    return el;
  }

  /** The synopsis: the longest visible run of text that is not a heading. */
  function summaryBlock() {
    let best = null, bestLen = 0;
    const scope = document.querySelector('main') || document.body;
    for (const el of scope.querySelectorAll('div, span, p')) {
      if (el.childElementCount > 1 || el.offsetParent === null) continue;
      if (el.closest('#' + CARD_ID)) continue;
      const len = (el.textContent || '').trim().length;
      if (len < 140 || len > 3000) continue;
      if (len > bestLen) { best = el; bestLen = len; }
    }
    return best;
  }

  /**
   * A synopsis is often a deeply nested inline element, so inserting
   * right after it leaves the card hugging the left edge of a narrow
   * wrapper. We climb until we find the ancestor that shares the left
   * edge and roughly the width of the title block — i.e. the real
   * content column — so the card lines up with everything else.
   */
  function alignedAnchor(anchor) {
    const ref = titleBlock();
    if (!ref || !anchor || anchor === ref) return anchor;
    const target = ref.getBoundingClientRect();
    let cur = anchor;
    for (let i = 0; i < 6 && cur && cur.parentElement && cur.parentElement !== document.body; i++) {
      const r = cur.getBoundingClientRect();
      const aligned = Math.abs(r.left - target.left) <= 8;
      const sane = r.width >= target.width * 0.6 && r.width <= target.width * 2.5;
      if (aligned && sane) return cur;
      cur = cur.parentElement;
    }
    return anchor;
  }

  const CORNER_MARGIN = 18;

  /** Apply corner or dragged coordinates to the floating card. */
  function positionFloat(card, extraOffset) {
    card.style.left = card.style.right = card.style.top = card.style.bottom = '';
    if (settings.floatPos) {
      card.style.left = settings.floatPos.left + 'px';
      card.style.top = settings.floatPos.top + 'px';
      return;
    }
    const off = CORNER_MARGIN + (extraOffset || 0);
    const c = settings.corner;
    if (c === 'bl' || c === 'br') card.style.bottom = off + 'px'; else card.style.top = off + 'px';
    if (c === 'bl' || c === 'tl') card.style.left = CORNER_MARGIN + 'px'; else card.style.right = CORNER_MARGIN + 'px';
  }

  /** Nudge the card away from other fixed widgets (theme switcher, button column…). */
  function avoidOverlap(card) {
    if (settings.floatPos) return;          // the user placed it by hand: respect that
    const bottom = settings.corner === 'bl' || settings.corner === 'br';
    let offset = 0;

    for (let pass = 0; pass < 4; pass++) {
      const r = card.getBoundingClientRect();
      let push = 0;
      for (const other of document.body.children) {
        if (other === card || other.nodeType !== 1) continue;
        const cs = getComputedStyle(other);
        if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        const o = other.getBoundingClientRect();
        if (!o.width || !o.height) continue;
        if (o.width * o.height > innerWidth * innerHeight * 0.35) continue;   // ignore full-screen overlays
        const overlap = !(r.right < o.left || r.left > o.right || r.bottom < o.top || r.top > o.bottom);
        if (!overlap) continue;
        push = Math.max(push, bottom ? (r.bottom - o.top) : (o.bottom - r.top));
      }
      if (push <= 0) break;
      offset += push + 12;
      positionFloat(card, offset);
    }
  }

  function mount(card) {
    const open = card.dataset.open === '1' ? ' open' : '';
    const set = card.dataset.set === '1' ? ' settings' : '';

    if (settings.placement === 'title' || settings.placement === 'summary') {
      let anchor = settings.placement === 'summary' ? (summaryBlock() || titleBlock()) : titleBlock();
      anchor = alignedAnchor(anchor);
      if (anchor && anchor.parentElement) {
        card.className = 'paw-inline' + open + set;
        anchor.insertAdjacentElement('afterend', card);
        return;
      }
    }
    card.className = 'paw-float' + open + set;
    document.body.appendChild(card);
    positionFloat(card, 0);
    avoidOverlap(card);
    enableDrag(card);
  }

  /** Drag the floating card by its bar; a real click still toggles. */
  function enableDrag(card) {
    const bar = card.querySelector('.paw-bar');
    if (!bar) return;
    bar.addEventListener('mousedown', e => {
      if (e.button !== 0 || e.target.closest('a, button')) return;
      const start = { x: e.clientX, y: e.clientY };
      const r = card.getBoundingClientRect();
      let moved = false;

      const onMove = ev => {
        if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
        if (!moved) { moved = true; card.classList.add('dragging'); card.dataset.drag = '1'; }
        const left = Math.min(Math.max(0, r.left + ev.clientX - start.x), innerWidth - r.width);
        const top = Math.min(Math.max(0, r.top + ev.clientY - start.y), innerHeight - r.height);
        card.style.right = card.style.bottom = '';
        card.style.left = left + 'px';
        card.style.top = top + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        card.classList.remove('dragging');
        if (moved) {
          const rr = card.getBoundingClientRect();
          settings.floatPos = { left: Math.round(rr.left), top: Math.round(rr.top) };
          saveSettings();
          setTimeout(() => { delete card.dataset.drag; }, 0);   // swallow the click that follows
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  /* ============================================================
     9. PLAYBACK DETECTION — the card gets out of the way
     ============================================================ */
  function isWatching() {
    if (document.fullscreenElement) return true;
    const v = document.querySelector('video');
    return !!v && v.getBoundingClientRect().width > window.innerWidth * 0.5;
  }

  /* ============================================================
     10. RENDERING
     ============================================================ */
  let state = null;     // { imdb, title, kind, viaShow, items, failed, loading }
  let showAll = false;

  function removeCard() {
    const c = document.getElementById(CARD_ID);
    if (c) c.remove();
  }

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }

  /** Re-fetch the current title, e.g. after the language changed. */
  function reload() {
    if (!state || !state.imdb) return render();
    const id = state.imdb;
    state.items = null; state.failed = false; state.loading = true;
    render();
    fetchAwards(id, (items, failed) => {
      if (!state || state.imdb !== id) return;
      state.items = items; state.failed = failed; state.loading = false;
      render();
    }, true);
  }

  function render() {
    if (!state || !state.imdb) { removeCard(); return; }
    const t = T();

    const raw = state.items || [];
    const shownItems = settings.majorOnly ? raw.filter(i => tierOf(i.event) >= 4) : raw;
    const org = state.items ? organise(shownItems) : null;

    // Nothing at all on IMDb: stay silent rather than showing an empty shell.
    if (!state.loading && !state.failed && raw.length === 0) { removeCard(); return; }

    const prev = document.getElementById(CARD_ID);
    const wasOpen = prev ? prev.dataset.open === '1' : settings.expanded;
    const wasSet = prev ? prev.dataset.set === '1' : false;
    if (prev) prev.remove();

    const card = el('div');
    card.id = CARD_ID;
    card.dataset.open = wasOpen ? '1' : '0';
    card.dataset.set = wasSet ? '1' : '0';

    /* ---------- collapsed summary bar ---------- */
    const bar = el('div', 'paw-bar');
    bar.appendChild(el('span', 'paw-cup', '🏆'));

    let headline;
    if (state.loading) headline = t.loading;
    else if (state.failed) headline = t.unavailable;
    else {
      const bits = [];
      if (org.wins) bits.push(t.wins(org.wins));
      if (org.noms) bits.push(t.noms(org.noms));
      headline = bits.join(' · ') || t.none;
    }
    const head = el('span', 'paw-head', headline);
    if (state.viaShow) head.title = t.seriesNote(state.title);
    bar.appendChild(head);

    // The 😬 marker flags "worst of" entries. They stay inside the
    // totals above — this is only a warning, not a separate count.
    if (org && org.negs) {
      const razz = el('span', 'paw-razz', '😬 ' + org.negs);
      razz.title = t.razzT(org.negs);
      bar.appendChild(razz);
    }

    const chips = el('span', 'paw-chips');
    if (org && !state.loading) {
      for (const c of org.chips) {
        const chip = el('a', 'paw-chip', shortName(c.event) + (c.category ? ' · ' + c.category : ''));
        chip.href = awardsUrl(state.imdb);
        chip.target = '_blank';
        chip.rel = 'noopener';
        chip.title = t.winner + ' — ' + c.event + (c.year ? ' ' + c.year : '') + (c.category ? ' — ' + c.category : '');
        chip.addEventListener('click', e => e.stopPropagation());
        chips.appendChild(chip);
      }
    }
    bar.appendChild(chips);

    const act = el('div', 'paw-act');

    const link = el('a', 'paw-imdb', 'IMDb');
    link.href = awardsUrl(state.imdb);
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = t.imdbT;
    link.addEventListener('click', e => e.stopPropagation());
    act.appendChild(link);

    // Quick EN/FR switch — the button shows the language you switch *to*.
    // Changing it also changes the IMDb source, hence the reload.
    const langBtn = el('button', 'paw-lang', lang() === 'fr' ? 'EN' : 'FR');
    langBtn.title = t.langT;
    langBtn.addEventListener('click', e => {
      e.stopPropagation();
      settings.lang = lang() === 'fr' ? 'en' : 'fr';
      saveSettings();
      reload();
    });
    act.appendChild(langBtn);

    const gear = el('button', 'paw-btn', '⚙');
    gear.title = t.settingsT;
    gear.addEventListener('click', e => {
      e.stopPropagation();
      const on = card.dataset.set !== '1';
      card.dataset.set = on ? '1' : '0';
      card.classList.toggle('settings', on);
    });
    act.appendChild(gear);

    const tog = el('button', 'paw-btn paw-toggle', '▾');
    tog.title = t.detailsT;
    act.appendChild(tog);
    bar.appendChild(act);

    bar.addEventListener('click', () => {
      if (card.dataset.drag === '1') return;      // this "click" was the end of a drag
      const on = card.dataset.open !== '1';
      card.dataset.open = on ? '1' : '0';
      card.classList.toggle('open', on);
    });
    card.appendChild(bar);

    /* ---------- detail panel ---------- */
    const body = el('div', 'paw-body');
    if (state.failed) {
      body.appendChild(el('div', 'paw-note', t.failedHint));
      const again = el('button', 'paw-more', t.retry);
      again.addEventListener('click', e => { e.stopPropagation(); reload(); });
      body.appendChild(again);
    } else if (org && org.total === 0 && raw.length) {
      body.appendChild(el('div', 'paw-note', t.filteredOut));
    } else if (org) {
      const shown = showAll ? org.groups : org.groups.slice(0, settings.maxGroups);
      for (const g of shown) {
        const grp = el('div', 'paw-grp');
        const h = el('div', 'paw-grp-h');
        h.appendChild(el('span', 'paw-rank ' + (g.neg ? 'neg' : 't' + g.tier)));
        h.appendChild(el('span', null, g.name));
        const years = [...g.years].sort();
        if (years.length) {
          h.appendChild(el('span', 'paw-y', years.length > 1 ? years[0] + '–' + years[years.length - 1] : String(years[0])));
        }
        h.appendChild(el('span', 'paw-cnt', countLabel(g)));
        grp.appendChild(h);

        const ul = el('ul', 'paw-list');
        for (const it of g.wins.concat(g.noms)) {
          const li = el('li', it.isWinner ? 'win' : '');
          const mk = el('span', 'mk', it.isWinner ? '🏆' : '·');
          mk.title = it.isWinner ? t.winner : t.nominee;    // no ambiguity on hover
          li.appendChild(mk);
          li.appendChild(el('span', null, (it.category || t.award) + (it.year && g.years.size > 1 ? '  (' + it.year + ')' : '')));
          ul.appendChild(li);
        }
        grp.appendChild(ul);
        body.appendChild(grp);
      }
      if (org.groups.length > shown.length) {
        const more = el('button', 'paw-more', t.more(org.groups.length - shown.length));
        more.addEventListener('click', e => { e.stopPropagation(); showAll = true; render(); });
        body.appendChild(more);
      } else if (showAll && org.groups.length > settings.maxGroups) {
        const less = el('button', 'paw-more', t.less);
        less.addEventListener('click', e => { e.stopPropagation(); showAll = false; render(); });
        body.appendChild(less);
      }
    }
    card.appendChild(body);

    card.appendChild(buildSettings(org));
    mount(card);
    card.style.display = isWatching() ? 'none' : '';
  }

  /* ============================================================
     11. SETTINGS PANEL
     ============================================================ */
  function buildSettings(org) {
    const t = T();
    const s = el('div', 'paw-set');
    const row = (labelTxt, node) => {
      const r = el('div', 'r');
      r.appendChild(el('label', null, labelTxt));
      r.appendChild(node);
      s.appendChild(r);
      return r;
    };
    const select = (opts, value, onChange) => {
      const sel = el('select');
      opts.forEach(([v, label]) => { const o = el('option', null, label); o.value = v; sel.appendChild(o); });
      sel.value = value;
      sel.addEventListener('change', () => onChange(sel.value));
      return sel;
    };
    const check = (value, onChange) => {
      const c = el('input'); c.type = 'checkbox'; c.checked = value;
      c.addEventListener('change', () => onChange(c.checked));
      return c;
    };

    // Language and source both change what IMDb sends back → reload.
    row(t.sLanguage, select(
      [['auto', t.langAuto], ['en', t.langEn], ['fr', t.langFr]],
      settings.lang, v => { settings.lang = v; saveSettings(); reload(); }));

    row(t.sLocalized, check(settings.localized, v => { settings.localized = v; saveSettings(); reload(); }));

    row(t.sSource, select(
      [['auto', t.srcAuto], ['page', t.srcPage], ['api', t.srcApi]],
      settings.source, v => { settings.source = v; saveSettings(); reload(); }));

    row(t.sPosition, select(
      [['title', t.posTitle], ['summary', t.posSummary], ['float', t.posFloat]],
      settings.placement, v => { settings.placement = v; saveSettings(); render(); }));

    if (settings.placement === 'float') {
      row(t.sCorner, select(
        [['br', t.cBR], ['bl', t.cBL], ['tr', t.cTR], ['tl', t.cTL]],
        settings.corner, v => { settings.corner = v; settings.floatPos = null; saveSettings(); render(); }));
    }

    row(t.sSort, select(
      [['prestige', t.sortPrestige], ['year', t.sortYear]],
      settings.sort, v => { settings.sort = v; saveSettings(); render(); }));

    row(t.sMajor, check(settings.majorOnly, v => { settings.majorOnly = v; saveSettings(); render(); }));
    row(t.sExpanded, check(settings.expanded, v => { settings.expanded = v; saveSettings(); }));

    const max = el('input');
    max.type = 'number'; max.min = 3; max.max = 40; max.value = settings.maxGroups;
    max.addEventListener('change', () => {
      settings.maxGroups = Math.max(3, Math.min(40, +max.value || 8));
      saveSettings(); render();
    });
    row(t.sMax, max);

    // Markdown export — handy for pasting a palmarès into notes.
    if (org && org.total) {
      const copy = el('button', 'act', t.copyMd);
      copy.addEventListener('click', e => {
        e.stopPropagation();
        copyText(toMarkdown(org, state.title, awardsUrl(state.imdb)), ok => {
          copy.textContent = ok ? t.copied : t.copyFail;
          setTimeout(() => { copy.textContent = t.copyMd; }, 1500);
        });
      });
      s.appendChild(copy);
    }

    if (settings.placement === 'float' && settings.floatPos) {
      const reset = el('button', 'act', t.resetPos);
      reset.addEventListener('click', e => {
        e.stopPropagation();
        settings.floatPos = null; saveSettings(); render();
      });
      s.appendChild(reset);
    }

    const clr = el('button', 'act', t.clearCache);
    clr.addEventListener('click', e => {
      e.stopPropagation();
      cache = { __v: CACHE_VERSION };
      GM_setValue(CACHE_KEY, JSON.stringify(cache));
      clr.textContent = t.cacheCleared;
      setTimeout(() => { clr.textContent = t.clearCache; }, 1500);
    });
    s.appendChild(clr);

    // Cross-checking the totals against IMDb should never require guesswork.
    const log = el('button', 'act', t.logConsole);
    log.addEventListener('click', e => {
      e.stopPropagation();
      const items = state.items || [];
      console.log('[Plex Awards]', state.title, state.imdb, awardsUrl(state.imdb));
      console.log('[Plex Awards] wins:', items.filter(i => i.isWinner).length,
        '· nominations:', items.filter(i => !i.isWinner).length,
        '· total:', items.length, '· locale:', wantFrench() ? 'fr' : 'en');
      console.table(items);
      log.textContent = t.logged;
      setTimeout(() => { log.textContent = t.logConsole; }, 1500);
    });
    s.appendChild(log);

    if (settings.placement === 'float') s.appendChild(el('div', 'hint', t.dragHint));

    s.addEventListener('click', e => e.stopPropagation());
    return s;
  }

  function copyText(txt, done) {
    try {
      if (typeof GM_setClipboard === 'function') { GM_setClipboard(txt, 'text'); return done(true); }
    } catch (e) {}
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => done(true), () => done(false));
    } else done(false);
  }

  /** Markdown rendering of the whole palmarès, ready to paste into notes. */
  function toMarkdown(org, title, url) {
    const t = T();
    const L = [`## ${t.awardsWord} — ${title}`, '', `[IMDb](${url})`, '',
      `${t.wins(org.wins)} · ${t.noms(org.noms)}`, ''];
    for (const g of org.groups) {
      const years = [...g.years].sort();
      const span = years.length ? ' (' + (years.length > 1 ? years[0] + '–' + years[years.length - 1] : years[0]) + ')' : '';
      L.push(`### ${g.name}${span}`);
      for (const it of g.wins) L.push(`- 🏆 **${it.category || t.award}**${it.year && g.years.size > 1 ? ` — ${it.year}` : ''}`);
      for (const it of g.noms) L.push(`- ${it.category || t.award}${it.year && g.years.size > 1 ? ` — ${it.year}` : ''}`);
      L.push('');
    }
    return L.join('\n');
  }

  /* ============================================================
     12. MAIN LOOP
     ============================================================ */
  let lastKey = null;

  function update(retries = 0) {
    const key = getRatingKey();
    if (!key) { removeCard(); lastKey = null; state = null; return; }
    if (key === lastKey) return;

    const srv = getServerInfo();
    if (!srv && retries < 12) { setTimeout(() => update(retries + 1), 400); return; }
    if (!srv) return;

    lastKey = key;
    state = null;
    showAll = false;
    removeCard();

    resolveTarget(srv, key, target => {
      if (getRatingKey() !== key) return;
      if (!target || !target.imdb) { state = null; removeCard(); return; }

      state = Object.assign({}, target, { items: null, failed: false, loading: true });
      render();

      fetchAwards(target.imdb, (items, failed) => {
        if (getRatingKey() !== key || !state) return;
        state.items = items;
        state.failed = failed;
        state.loading = false;
        const c = document.getElementById(CARD_ID);
        if (settings.expanded && c) c.dataset.open = '1';
        render();
      });
    });
  }

  // Plex constantly re-renders its React tree: if our card gets swept
  // away we put it straight back, without firing a single new request.
  setInterval(() => {
    if (document.hidden) return;              // nothing to do in a background tab
    const watching = isWatching();
    const c = document.getElementById(CARD_ID);
    if (c) { c.style.display = watching ? 'none' : ''; return; }
    if (!watching && state && state.imdb && getRatingKey() === lastKey) render();
  }, 1200);

  // Corner-anchored cards re-check their neighbours when the window changes.
  window.addEventListener('resize', () => {
    const c = document.getElementById(CARD_ID);
    if (c && c.classList.contains('paw-float')) { positionFloat(c, 0); avoidOverlap(c); }
  });

  window.addEventListener('hashchange', () => update());

  // Plex mutates the DOM constantly: coalesce those bursts into one check.
  let moQueued = false;
  new MutationObserver(() => {
    if (moQueued) return;
    moQueued = true;
    setTimeout(() => { moQueued = false; update(); }, 200);
  }).observe(document.body, { childList: true, subtree: true });
  update();
})();
