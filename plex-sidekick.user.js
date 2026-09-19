// ==UserScript==
// @name         Plex Sidekick 🔗▶️
// @namespace    pyro.plex.sidekick
// @version      5.0
// @description  Ton copilote Plex Web : boutons vers 20+ services (TMDB, IMDb, Letterboxd, JustWatch, Blu-ray.com, LDDb, DVDCompare, Criterion…) + lecture directe dans le lecteur de ton choix (IINA, Infuse, mpv, VLC, PotPlayer) + bouton épisode suivant + copie de l'URL directe. Panneau de réglages complet : ordre des boutons, taille, opacité, styles, animations, services personnalisés.
// @author       Pyro
// @match        https://app.plex.tv/*
// @match        http://*/web/*
// @match        https://*/web/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @connect      *
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-sidekick.user.js
// @updateURL    https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-sidekick.user.js
// ==/UserScript==

(function () {
  'use strict';

  const COL_ID = 'psk-col';
  const PANEL_ID = 'psk-panel';
  const STORE = 'pskSettings';

  /* ============================================================
     LECTEURS — préréglages multi-plateformes
     Rappel : un navigateur ne peut ouvrir un lecteur que si celui-ci
     (ou un helper) a enregistré un schéma d'URL auprès de l'OS.
     IINA / Infuse / PotPlayer le font nativement.
     mpv et VLC desktop ne le font PAS → helper, ou Raccourcis sur macOS.
     ============================================================ */
  const PLAYER_PRESETS = [
    // --- macOS ---
    { os: 'macOS', name: 'IINA',
      template: 'iina://weblink?url={url}',
      note: 'natif' },
    { os: 'macOS', name: 'Infuse',
      template: 'infuse://x-callback-url/play?url={url}',
      note: 'natif (aussi iOS / tvOS)' },
    { os: 'macOS', name: 'mpv',
      template: 'shortcuts://run-shortcut?name=mpv&input=text&text={url}',
      note: 'via Raccourcis — voir aide' },
    { os: 'macOS', name: 'VLC',
      template: 'shortcuts://run-shortcut?name=vlc&input=text&text={url}',
      note: 'via Raccourcis — voir aide' },
    { os: 'macOS', name: 'QuickTime',
      template: 'shortcuts://run-shortcut?name=quicktime&input=text&text={url}',
      note: 'via Raccourcis — voir aide' },

    // --- Windows ---
    { os: 'Windows', name: 'PotPlayer',
      template: 'potplayer://{rawurl}',
      note: 'natif' },

    // --- Windows / Linux (helpers) ---
    { os: 'Windows / Linux', name: 'mpv',
      template: 'mpv://play/{b64url}/',
      note: 'via mpv-handler' },
    { os: 'Windows / Linux', name: 'VLC',
      template: 'vlc://{rawurl}',
      note: 'via vlc-protocol' },

    // --- Mobile ---
    { os: 'iOS / Android', name: 'VLC mobile',
      template: 'vlc-x-callback://x-callback-url/stream?url={url}',
      note: 'natif' },
    { os: 'iOS / Android', name: 'Outplayer',
      template: 'outplayer://{rawurl}',
      note: 'natif (iOS)' },
  ];

  /* ============================================================
     SERVICES INTÉGRÉS — la liste complète
     link(d) retourne l'URL ou null (bouton grisé).
     ============================================================ */
  const fr = () => settings.frMode;
  const enc = s => encodeURIComponent(s || '');
  const q = d => enc(d.searchTitle || d.title || '');
  const site = (domain, d) => `https://duckduckgo.com/?q=${enc('site:' + domain + ' ' + (d.searchTitle || d.title || ''))}`;

  const SERVICES = {
    /* ---- Bases de données & notes ---- */
    tmdb: { label: 'TMDB', bg: '#01b4e4', fg: '#fff',
      link(d) {
        const l = fr() ? '?language=fr-FR' : '';
        if (d.kind === 'movie') return d.tmdbMovie ? `https://www.themoviedb.org/movie/${d.tmdbMovie}${l}` : null;
        if (!d.tmdbShow) return null;
        let u = `https://www.themoviedb.org/tv/${d.tmdbShow}`;
        if (d.kind === 'season' && d.season) u += `/season/${d.season}`;
        if (d.kind === 'episode' && d.season && d.episode) u += `/season/${d.season}/episode/${d.episode}`;
        return u + l;
      } },
    imdb: { label: 'IMDb', bg: '#f5c518', fg: '#000',
      link(d) {
        if (!d.imdb) return null;
        return fr() ? `https://www.imdb.com/fr/title/${d.imdb}/` : `https://www.imdb.com/title/${d.imdb}/`;
      } },
    letterboxd: { label: 'Letterboxd', bg: '#14181c', fg: '#00e054',
      link(d) {
        if (d.kind !== 'movie') return null;
        if (d.tmdbMovie) return `https://letterboxd.com/tmdb/${d.tmdbMovie}/`;
        if (d.imdb) return `https://letterboxd.com/imdb/${d.imdb}/`;
        return null;
      } },
    trakt: { label: 'Trakt', bg: '#ed1c24', fg: '#fff',
      link(d) {
        if (d.kind === 'movie') return d.tmdbMovie ? `https://trakt.tv/search/tmdb/${d.tmdbMovie}?id_type=movie` : null;
        return d.tmdbShow ? `https://trakt.tv/search/tmdb/${d.tmdbShow}?id_type=show` : null;
      } },
    tvdb: { label: 'TVDB', bg: '#6cd591', fg: '#0b3d2c',
      link(d) {
        if (d.kind === 'movie' && d.tvdbItem) return `https://www.thetvdb.com/dereferrer/movie/${d.tvdbItem}`;
        if (d.kind === 'episode' && d.tvdbItem) return `https://www.thetvdb.com/dereferrer/episode/${d.tvdbItem}`;
        if (d.tvdbShow) return `https://www.thetvdb.com/dereferrer/series/${d.tvdbShow}`;
        return null;
      } },
    mdblist: { label: 'MDBList', bg: '#24303e', fg: '#ffd166',
      link(d) {
        if (d.kind === 'movie') return d.imdb ? `https://mdblist.com/movie/${d.imdb}` : null;
        const i = d.imdbShow || (d.kind === 'show' ? d.imdb : null);
        return i ? `https://mdblist.com/show/${i}` : null;
      } },
    senscritique: { label: 'SensCritique', bg: '#111111', fg: '#ffb932',
      link(d) { return `https://www.senscritique.com/search?query=${q(d)}`; } },
    allocine: { label: 'AlloCiné', bg: '#fecc00', fg: '#111',
      link(d) { return `https://www.allocine.fr/rechercher/?q=${q(d)}`; } },
    rottentomatoes: { label: 'Rotten Tomatoes', bg: '#fa320a', fg: '#fff',
      link(d) { return `https://www.rottentomatoes.com/search?search=${q(d)}`; } },
    metacritic: { label: 'Metacritic', bg: '#000000', fg: '#ffcc33',
      link(d) { return `https://www.metacritic.com/search/${q(d)}/`; } },
    douban: { label: 'Douban 豆瓣', bg: '#007722', fg: '#fff',
      link(d) { return `https://search.douban.com/movie/subject_search?search_text=${q(d)}`; } },
    wikipedia: { label: 'Wikipédia', bg: '#eaecf0', fg: '#202122',
      link(d) {
        const lang = fr() ? 'fr' : 'en';
        return `https://${lang}.wikipedia.org/w/index.php?search=${q(d)}`;
      } },

    /* ---- Streaming ---- */
    justwatch: { label: 'JustWatch', bg: '#0e1421', fg: '#ffc400',
      link(d) {
        return fr()
          ? `https://www.justwatch.com/fr/recherche?q=${q(d)}`
          : `https://www.justwatch.com/us/search?q=${q(d)}`;
      } },

    /* ---- Physique : Blu-ray / DVD / LaserDisc ---- */
    bluray: { label: 'Blu-ray.com', bg: '#0058c0', fg: '#fff',
      link(d) { return `https://www.blu-ray.com/search/?quicksearch=1&quicksearch_country=all&quicksearch_keyword=${q(d)}&section=bluraymovies`; } },
    dvdcompare: { label: 'DVDCompare', bg: '#8e2b2b', fg: '#fff',
      link(d) { return `https://dvdcompare.net/comparisons/search.php?param=${q(d)}`; } },
    lddb: { label: 'LDDb 💿', bg: '#a67c00', fg: '#fff',
      link(d) { return site('lddb.com', d); } },
    dvdfr: { label: 'DVDFr', bg: '#003399', fg: '#fff',
      link(d) { return site('dvdfr.com', d); } },
    criterion: { label: 'Criterion', bg: '#000000', fg: '#ffffff',
      link(d) { return `https://www.criterion.com/search?q=${q(d)}`; } },

    /* ---- Extras ---- */
    youtube: { label: 'YouTube 🎬', bg: '#ff0000', fg: '#fff',
      link(d) {
        const kw = fr() ? 'bande annonce' : 'trailer';
        const y = d.kind === 'movie' && d.searchYear ? ' ' + d.searchYear : '';
        return `https://www.youtube.com/results?search_query=${enc((d.searchTitle || d.title || '') + y + ' ' + kw)}`;
      } },
    mediux: { label: 'Mediux', bg: '#6c5ce7', fg: '#fff',
      link(d) {
        if (d.kind === 'movie') return d.tmdbMovie ? `https://mediux.pro/movies/${d.tmdbMovie}` : null;
        return d.tmdbShow ? `https://mediux.pro/shows/${d.tmdbShow}` : null;
      } },
  };

  const DEFAULTS = {
    frMode: false,
    enabled: {
      player: true,
      nextEpisode: true,
      copyUrl: false,
      tmdb: true, imdb: true, letterboxd: true, justwatch: true, bluray: true,
      trakt: false, tvdb: false, mdblist: false, senscritique: false, allocine: false,
      rottentomatoes: false, metacritic: false, douban: false, wikipedia: false,
      dvdcompare: false, lddb: false, dvdfr: false, criterion: false,
      youtube: false, mediux: false,
    },
    player: { name: 'IINA', template: 'iina://weblink?url={url}' },
    custom: [],
    ui: { scale: 100, opacity: 100, style: 'classic', anim: true },
    order: null,
  };

  /* ============================================================
     RÉGLAGES : chargement, migrations, sauvegarde
     ============================================================ */
  function reconcileOrder(st) {
    const valid = ['player', 'nextEpisode', 'copyUrl', ...Object.keys(SERVICES), ...st.custom.map(c => c.id)];
    const seen = new Set();
    const out = [];
    for (const k of (st.order || [])) {
      if (valid.includes(k) && !seen.has(k)) { out.push(k); seen.add(k); }
    }
    for (const k of valid) if (!seen.has(k)) out.push(k);
    return out;
  }

  // Migration v4.x → v5 : les anciens schémas mpv cassés sont réparés
  const PLAYER_FIXES = {
    'mpv://play/{b64url}': 'mpv://play/{b64url}/',
    'mpv://{rawurl}': 'mpv://play/{b64url}/',
    'mpv://play/{url}': 'mpv://play/{b64url}/',
  };

  function loadSettings() {
    let s = null;
    try { s = JSON.parse(GM_getValue(STORE, 'null')); } catch (e) {}
    if (!s) { try { s = JSON.parse(GM_getValue('umgbSettings', 'null')); } catch (e) {} } // migration v3
    s = s || {};
    const st = {
      frMode: s.frMode !== undefined ? s.frMode : GM_getValue('frMode', false),      // migration v1/v2
      enabled: Object.assign({}, DEFAULTS.enabled, s.enabled || {}),
      player: Object.assign({}, DEFAULTS.player, s.player || {}),
      custom: Array.isArray(s.custom) ? s.custom : [],
      ui: Object.assign({}, DEFAULTS.ui, s.ui || {}),
      order: Array.isArray(s.order) ? s.order : null,
    };
    if (PLAYER_FIXES[st.player.template]) st.player.template = PLAYER_FIXES[st.player.template];
    st.order = reconcileOrder(st);
    return st;
  }
  function saveSettings() { GM_setValue(STORE, JSON.stringify(settings)); }

  let settings = loadSettings();
  const cache = {};
  let lastKey = null;
  let serverInfo = null;
  let currentData = null;
  let panelOpen = false;

  /* ============================================================
     ratingKey + serveur
     ============================================================ */
  function getRatingKey() {
    const m = location.hash.match(/key=([^&]+)/);
    if (!m) return null;
    const decoded = decodeURIComponent(m[1]);
    const km = decoded.match(/\/library\/metadata\/(\d+)/);
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

  /* ============================================================
     MÉTADONNÉES (type-aware)
     ============================================================ */
  function fetchXml(srv, path, cb) {
    const sep = path.includes('?') ? '&' : '?';
    GM_xmlhttpRequest({
      method: 'GET',
      url: `${srv.origin}${path}${sep}X-Plex-Token=${srv.token}`,
      headers: { Accept: 'application/xml' },
      onload: res => {
        try { cb(new DOMParser().parseFromString(res.responseText, 'text/xml')); }
        catch (e) { cb(null); }
      },
      onerror: () => cb(null),
    });
  }

  function parseItem(doc) {
    if (!doc) return null;
    const el = doc.querySelector('MediaContainer > Video, MediaContainer > Directory');
    if (!el) return null;
    const guids = [...el.children].filter(c => c.tagName === 'Guid').map(g => g.getAttribute('id') || '');
    const pick = p => { const g = guids.find(x => x.startsWith(p)); return g ? g.slice(p.length) : null; };
    const part = el.querySelector('Media > Part');
    return {
      type: el.getAttribute('type'),
      ratingKey: el.getAttribute('ratingKey'),
      title: el.getAttribute('title'),
      year: el.getAttribute('year'),
      index: el.getAttribute('index'),
      parentIndex: el.getAttribute('parentIndex'),
      parentKey: el.getAttribute('parentKey'),
      grandparentKey: el.getAttribute('grandparentKey'),
      grandparentTitle: el.getAttribute('grandparentTitle'),
      partKey: part ? part.getAttribute('key') : null,
      imdb: pick('imdb://'),
      tmdb: pick('tmdb://'),
      tvdb: pick('tvdb://'),
    };
  }

  /* ============================================================
     ÉPISODE SUIVANT
     ============================================================ */
  const pad2 = n => String(n).padStart(2, '0');

  function listEpisodes(doc) {
    if (!doc) return [];
    return [...doc.querySelectorAll('MediaContainer > Video')]
      .map(el => ({
        key: el.getAttribute('ratingKey'),
        index: parseInt(el.getAttribute('index'), 10),
        season: parseInt(el.getAttribute('parentIndex'), 10),
        title: el.getAttribute('title') || '',
      }))
      .filter(e => e.key && !isNaN(e.index))
      .sort((a, b) => a.index - b.index);
  }

  function epLabel(e) {
    const s = isNaN(e.season) ? '?' : pad2(e.season);
    return `S${s}E${pad2(e.index)}${e.title ? ' · ' + e.title : ''}`;
  }

  function findNextEpisode(srv, item, showKey, cb) {
    if (!item.parentKey) return cb(null);
    const curIdx = parseInt(item.index, 10);

    fetchXml(srv, `${item.parentKey}/children`, doc => {
      const next = listEpisodes(doc).find(e => e.index === curIdx + 1);
      if (next) return cb(next);

      // Fin de saison → 1er épisode de la saison suivante
      if (!showKey) return cb(null);
      fetchXml(srv, `${showKey}/children`, doc2 => {
        const seasons = doc2 ? [...doc2.querySelectorAll('MediaContainer > Directory')]
          .map(el => ({ key: el.getAttribute('ratingKey'), index: parseInt(el.getAttribute('index'), 10) }))
          .filter(s => s.key && !isNaN(s.index)) : [];
        const curSeason = parseInt(item.parentIndex, 10);
        const nextSeason = seasons.find(s => s.index === curSeason + 1);
        if (!nextSeason) return cb(null);
        fetchXml(srv, `/library/metadata/${nextSeason.key}/children`, doc3 => {
          cb(listEpisodes(doc3)[0] || null);
        });
      });
    });
  }

  function launchNextEpisode(nextKey) {
    const srv = getServerInfo();
    if (!srv || !nextKey) return;
    fetchXml(srv, `/library/metadata/${nextKey}`, doc => {
      const item = parseItem(doc);
      if (!item || !item.partKey) return;
      // On reconstruit un jeu de variables complet : les schémas personnalisés
      // qui utilisent {title}, {season}, {episode}… continuent de fonctionner.
      const vars = templateVars({
        kind: 'episode',
        title: item.title,
        searchTitle: item.grandparentTitle || item.title,
        partKey: item.partKey,
        imdb: item.imdb,
        tvdbItem: item.tvdb,
        season: item.parentIndex,
        episode: item.index,
      });
      const href = fillTemplate(settings.player.template, vars);
      if (href) openPlayerUrl(href);
    });
  }

  function resolve(srv, ratingKey, cb) {
    fetchXml(srv, `/library/metadata/${ratingKey}`, doc => {
      const item = parseItem(doc);
      if (!item) return cb(false);

      const base = {
        kind: item.type, title: item.title,
        imdb: item.imdb, tvdbItem: item.tvdb, partKey: item.partKey,
      };

      if (item.type === 'movie') {
        cb({ ...base, tmdbMovie: item.tmdb, searchTitle: item.title, searchYear: item.year });
      } else if (item.type === 'show') {
        cb({ ...base, tmdbShow: item.tmdb, tvdbShow: item.tvdb, imdbShow: item.imdb, searchTitle: item.title });
      } else if (item.type === 'season' || item.type === 'episode') {
        const showKey = item.type === 'season' ? item.parentKey : item.grandparentKey;
        const season  = item.type === 'season' ? item.index : item.parentIndex;
        const episode = item.type === 'episode' ? item.index : null;
        const searchTitle = item.grandparentTitle || item.title;
        if (!showKey) return cb({ ...base, season, episode, searchTitle });

        fetchXml(srv, showKey, doc2 => {
          const show = parseItem(doc2);
          const partial = {
            ...base,
            tmdbShow: show ? show.tmdb : null,
            tvdbShow: show ? show.tvdb : null,
            imdbShow: show ? show.imdb : null,
            imdb: item.imdb || (show ? show.imdb : null),
            season, episode,
            searchTitle: (show && show.title) || searchTitle,
          };
          // Rendu immédiat : la recherche de l'épisode suivant (1 à 3 requêtes)
          // ne bloque plus l'affichage de la colonne.
          cb(partial);
          if (item.type === 'episode') {
            findNextEpisode(srv, item, showKey, next => {
              if (next) cb({ ...partial, next });
            });
          }
        });
      } else {
        cb(false);
      }
    });
  }

  /* ============================================================
     TEMPLATES (lecteur + services personnalisés)
     ============================================================ */
  function b64url(s) {
    try {
      return btoa(unescape(encodeURIComponent(s)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) { return null; }
  }

  function directUrl(partKey) {
    return (partKey && serverInfo)
      ? `${serverInfo.origin}${partKey}?X-Plex-Token=${serverInfo.token}` : null;
  }

  function templateVars(d) {
    const direct = d ? directUrl(d.partKey) : null;
    const t = d ? (d.searchTitle || d.title || '') : '';
    return {
      tmdb: d ? (d.kind === 'movie' ? d.tmdbMovie : d.tmdbShow) : null,
      imdb: d ? d.imdb : null,
      imdbshow: d ? (d.imdbShow || null) : null,
      tvdb: d ? (d.tvdbItem || d.tvdbShow) : null,
      title: t ? encodeURIComponent(t) : null,
      rawtitle: t || null,
      year: d && d.searchYear ? d.searchYear : null,
      season: d && d.season ? d.season : null,
      episode: d && d.episode ? d.episode : null,
      type: d ? d.kind : null,
      url: direct ? encodeURIComponent(direct) : null,
      rawurl: direct,
      b64url: direct ? b64url(direct) : null,
    };
  }

  function fillTemplate(tpl, vars) {
    let missing = false;
    const out = String(tpl).replace(/\{(\w+)\}/g, (m, k) => {
      const v = vars[k];
      if (v === null || v === undefined || v === '') { missing = true; return ''; }
      return v;
    });
    return missing ? null : out;
  }

  /* Ouvre un schéma d'application sans quitter Plex ni casser l'historique.
     Un simple location.href fonctionne, mais laisse parfois une page blanche
     si l'app n'est pas installée : l'iframe jetable évite ça. */
  function openPlayerUrl(href) {
    try {
      const f = document.createElement('iframe');
      f.style.display = 'none';
      f.src = href;
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 1500);
    } catch (e) {
      location.href = href;
    }
  }

  function copyText(txt, done) {
    try {
      if (typeof GM_setClipboard === 'function') { GM_setClipboard(txt, 'text'); return done(true); }
    } catch (e) {}
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => done(true), () => done(false));
    } else {
      done(false);
    }
  }

  /* ============================================================
     COULEUR D'ACCENT (styles verre & contour)
     ============================================================ */
  function accentOf(bg, fg) {
    if (!bg || String(bg).startsWith('linear')) return '#9b8cff';
    const m = String(bg).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return fg || '#fff';
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum < 0.16 ? (fg || '#fff') : bg;   // fond quasi noir → l'accent est la couleur du texte
  }

  /* ============================================================
     DÉTECTION LECTURE VIDÉO
     ============================================================ */
  function isWatching() {
    if (document.fullscreenElement) return true;
    const v = document.querySelector('video');
    if (!v) return false;
    return v.getBoundingClientRect().width > window.innerWidth * 0.5;
  }

  setInterval(() => {
    const watching = isWatching();
    const c = document.getElementById(COL_ID);
    if (c) c.style.display = watching ? 'none' : 'flex';
    const p = document.getElementById(PANEL_ID);
    if (p) p.style.display = watching ? 'none' : 'block';
  }, 700);

  /* ============================================================
     STYLES
     ============================================================ */
  const style = document.createElement('style');
  style.textContent = `
    #${COL_ID} {
      position: fixed; top: 90px; right: 18px; z-index: 99999;
      display: flex; flex-direction: column; gap: calc(8px * var(--psk-scale, 1));
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      --psk-scale: 1; --psk-op: 1;
    }
    #${COL_ID} .psk-top { display: flex; gap: 6px; align-items: stretch; }
    #${COL_ID} .psk-fr {
      flex: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 5px 9px; border-radius: 6px; cursor: pointer; user-select: none;
      background: rgba(20,20,20,.85); box-shadow: 0 2px 6px rgba(0,0,0,.35);
      font-size: 11px; font-weight: 700; color: #ddd; height: 30px; box-sizing: border-box;
    }
    #${COL_ID} .psk-gear {
      width: 30px; height: 30px; border: none; border-radius: 6px; cursor: pointer;
      background: rgba(20,20,20,.85); color: #ccc; font-size: 17px; line-height: 1;
      box-shadow: 0 2px 6px rgba(0,0,0,.35); transition: transform .25s ease, color .15s ease;
      display: flex; align-items: center; justify-content: center; flex: 0 0 auto;
    }
    #${COL_ID} .psk-gear:hover { transform: rotate(60deg); color: #fff; }

    .psk-btn {
      display: block; box-sizing: border-box;
      padding: calc(7px * var(--psk-scale)) calc(12px * var(--psk-scale));
      border-radius: 6px;
      font-size: calc(13px * var(--psk-scale));
      font-weight: 700; text-align: center; text-decoration: none; cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,.35);
      opacity: var(--psk-op);
      max-width: calc(170px * var(--psk-scale));
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      will-change: transform;
    }
    #${COL_ID}[data-anim="1"] .psk-btn {
      transition: transform .16s ease, filter .16s ease, box-shadow .16s ease, opacity .16s ease;
      animation: psk-in .28s ease backwards;
    }
    @keyframes psk-in {
      from { transform: translateX(18px) scale(.92); }
      to   { transform: none; }
    }
    .psk-btn:hover {
      opacity: 1; transform: translateX(-4px) scale(1.04);
      filter: brightness(1.15); box-shadow: 0 6px 18px rgba(0,0,0,.5);
    }
    .psk-btn:active { transform: translateX(-4px) scale(.95); }
    .psk-btn.off { opacity: calc(var(--psk-op) * .35); pointer-events: none; }

    /* Styles de boutons */
    #${COL_ID}.st-pill .psk-btn { border-radius: 999px; }
    #${COL_ID}.st-square .psk-btn { border-radius: 0; box-shadow: 0 1px 3px rgba(0,0,0,.4); }
    #${COL_ID}.st-glass .psk-btn {
      background: rgba(15,17,23,.55) !important;
      backdrop-filter: blur(10px) saturate(1.4);
      -webkit-backdrop-filter: blur(10px) saturate(1.4);
      border: 1px solid rgba(255,255,255,.14);
      color: var(--psk-accent, #fff) !important;
    }
    #${COL_ID}.st-outline .psk-btn {
      background: rgba(10,12,16,.35) !important;
      border: 1.6px solid var(--psk-accent, #fff);
      color: var(--psk-accent, #fff) !important;
      box-shadow: none;
    }

    /* ---------- Panneau ---------- */
    #${PANEL_ID} {
      position: fixed; top: 80px; right: 240px; z-index: 100000;
      width: 306px; max-height: 80vh; overflow-y: auto;
      background: #16181d; color: #ddd; border: 1px solid #34363c;
      border-radius: 10px; padding: 14px;
      font: 12px -apple-system, Helvetica, Arial, sans-serif;
      box-shadow: 0 10px 34px rgba(0,0,0,.55);
    }
    #${PANEL_ID} .psk-head {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 13px; font-weight: 700; margin-bottom: 6px;
    }
    #${PANEL_ID} .psk-sec {
      margin: 14px 0 6px; font-size: 10.5px; font-weight: 700;
      letter-spacing: .08em; text-transform: uppercase; color: #9aa0aa;
      border-bottom: 1px solid #2a2c32; padding-bottom: 4px;
    }
    #${PANEL_ID} .psk-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
    #${PANEL_ID} .psk-row > label:first-child { flex: 0 0 66px; color: #9aa0aa; }
    #${PANEL_ID} input[type="text"], #${PANEL_ID} select {
      flex: 1; min-width: 0; background: #0e1013; color: #eee;
      border: 1px solid #34363c; border-radius: 6px; padding: 5px 7px;
      font: 11.5px ui-monospace, Menlo, monospace; outline: none;
    }
    #${PANEL_ID} select { font-family: inherit; }
    #${PANEL_ID} optgroup { background: #0e1013; color: #9aa0aa; font-style: normal; }
    #${PANEL_ID} option { background: #0e1013; color: #eee; }
    #${PANEL_ID} input[type="range"] { flex: 1; accent-color: #e5a00d; }
    #${PANEL_ID} input[type="color"] {
      width: 34px; height: 24px; padding: 0; border: 1px solid #34363c;
      border-radius: 5px; background: none; cursor: pointer;
    }
    #${PANEL_ID} input[type="checkbox"] { accent-color: #e5a00d; cursor: pointer; }
    #${PANEL_ID} .psk-val { flex: 0 0 40px; text-align: right; color: #9aa0aa; font-variant-numeric: tabular-nums; }
    #${PANEL_ID} .psk-hint { font-size: 10.5px; color: #7d838d; line-height: 1.55; margin-top: 4px; }
    #${PANEL_ID} .psk-hint code { background: #0e1013; padding: 0 3px; border-radius: 3px; color: #c9cdd4; }
    #${PANEL_ID} .psk-hint pre {
      background: #0e1013; color: #c9cdd4; padding: 6px 7px; border-radius: 5px;
      margin: 5px 0 0; overflow-x: auto; font: 10.5px ui-monospace, Menlo, monospace;
    }
    #${PANEL_ID} details.psk-help { margin-top: 6px; }
    #${PANEL_ID} details.psk-help > summary {
      cursor: pointer; color: #e5a00d; font-size: 11px; font-weight: 700;
      list-style: none; user-select: none;
    }
    #${PANEL_ID} details.psk-help > summary::-webkit-details-marker { display: none; }
    #${PANEL_ID} details.psk-help > summary::before { content: '▸ '; }
    #${PANEL_ID} details.psk-help[open] > summary::before { content: '▾ '; }
    #${PANEL_ID} .psk-item { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
    #${PANEL_ID} .psk-item .psk-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #${PANEL_ID} .psk-item .psk-dot {
      width: 10px; height: 10px; border-radius: 3px; flex: 0 0 auto;
      border: 1px solid rgba(255,255,255,.15);
    }
    #${PANEL_ID} button.psk-mv, #${PANEL_ID} button.psk-x {
      background: none; border: none; color: #777; cursor: pointer;
      font-size: 11px; padding: 0 2px; line-height: 1;
    }
    #${PANEL_ID} button.psk-mv:hover { color: #fff; }
    #${PANEL_ID} button.psk-x:hover { color: #ff5c5c; }
    #${PANEL_ID} button.psk-close { background: none; border: none; color: #aaa; cursor: pointer; font-size: 15px; }
    #${PANEL_ID} button.psk-add {
      width: 100%; margin-top: 8px; padding: 7px 0;
      background: #e5a00d; color: #1a1400; font-weight: 700;
      border: none; border-radius: 6px; cursor: pointer; font-size: 12px;
    }
    #${PANEL_ID} button.psk-test {
      width: 100%; margin-top: 6px; padding: 6px 0;
      background: #23262d; color: #ddd; border: 1px solid #34363c;
      border-radius: 6px; cursor: pointer; font-size: 11.5px; font-weight: 700;
    }
    #${PANEL_ID} button.psk-test:hover { background: #2c3038; color: #fff; }
  `;
  (document.head || document.documentElement).appendChild(style);

  /* ============================================================
     COLONNE DE BOUTONS
     ============================================================ */
  function ensureContainer() {
    let c = document.getElementById(COL_ID);
    if (!c) {
      c = document.createElement('div');
      c.id = COL_ID;
      document.body.appendChild(c);
    }
    applyAppearance(c);
    return c;
  }

  function applyAppearance(c) {
    c = c || document.getElementById(COL_ID);
    if (!c) return;
    const ui = settings.ui;
    c.style.setProperty('--psk-scale', (ui.scale || 100) / 100);
    c.style.setProperty('--psk-op', (ui.opacity || 100) / 100);
    c.className = 'st-' + (ui.style || 'classic');
    c.dataset.anim = ui.anim ? '1' : '0';
  }

  function removeContainer() {
    const c = document.getElementById(COL_ID);
    if (c) c.remove();
  }

  function makeTopRow() {
    const row = document.createElement('div');
    row.className = 'psk-top';

    const wrap = document.createElement('label');
    wrap.className = 'psk-fr';
    const label = document.createElement('span');
    label.textContent = settings.frMode ? 'FR' : 'Défaut';
    label.style.minWidth = '34px';
    const track = document.createElement('span');
    track.style.cssText = `
      position:relative; width:34px; height:18px; border-radius:9px;
      background:${settings.frMode ? '#01b4e4' : '#555'}; transition:background .15s;`;
    const knob = document.createElement('span');
    knob.style.cssText = `
      position:absolute; top:2px; left:${settings.frMode ? '18px' : '2px'};
      width:14px; height:14px; border-radius:50%; background:#fff; transition:left .15s;`;
    track.appendChild(knob);
    wrap.appendChild(label);
    wrap.appendChild(track);
    wrap.addEventListener('click', e => {
      e.preventDefault();
      settings.frMode = !settings.frMode;
      saveSettings();
      render(currentData);
    });

    const gear = document.createElement('button');
    gear.className = 'psk-gear';
    gear.textContent = '⚙';
    gear.title = 'Réglages Plex Sidekick';
    gear.addEventListener('click', openPanel);

    row.appendChild(wrap);
    row.appendChild(gear);
    return row;
  }

  function makeBtn(label, bg, fg, sameTab, animIndex) {
    const b = document.createElement('a');
    b.className = 'psk-btn';
    b.textContent = label;
    if (!sameTab) { b.target = '_blank'; b.rel = 'noopener'; }
    b.style.background = bg;
    b.style.color = fg;
    b.style.setProperty('--psk-accent', accentOf(bg, fg));
    if (settings.ui.anim) b.style.animationDelay = (animIndex * 35) + 'ms';
    return b;
  }

  function disable(b) { b.textContent += ' —'; b.classList.add('off'); }

  function render(data) {
    currentData = data;
    const c = ensureContainer();
    c.innerHTML = '';
    c.appendChild(makeTopRow());

    const vars = templateVars(data);
    let i = 0;

    for (const key of settings.order) {
      // --- lecteur ---
      if (key === 'player') {
        if (!settings.enabled.player) continue;
        const b = makeBtn('▶ ' + settings.player.name,
          'linear-gradient(135deg,#3a7bd5,#9b59f5)', '#fff', true, i++);
        const href = data ? fillTemplate(settings.player.template, vars) : null;
        if (href) {
          b.href = href;
          b.title = href;
          // Les schémas d'app sont ouverts via un iframe jetable :
          // aucune navigation, la page Plex reste intacte.
          b.addEventListener('click', e => { e.preventDefault(); openPlayerUrl(href); });
        } else disable(b);
        c.appendChild(b);
        continue;
      }
      // --- épisode suivant ---
      if (key === 'nextEpisode') {
        if (!settings.enabled.nextEpisode) continue;
        const b = makeBtn('⏭ Suivant', 'linear-gradient(135deg,#1f8a4c,#27ae60)', '#fff', true, i++);
        if (data && data.kind === 'episode' && data.next) {
          b.title = 'Lire ' + epLabel(data.next) + ' dans ' + settings.player.name;
          b.addEventListener('click', e => { e.preventDefault(); launchNextEpisode(data.next.key); });
        } else disable(b);
        c.appendChild(b);
        continue;
      }
      // --- copie de l'URL directe (utile pour déboguer un lecteur) ---
      if (key === 'copyUrl') {
        if (!settings.enabled.copyUrl) continue;
        const b = makeBtn('📋 URL directe', '#2f3640', '#dfe4ea', true, i++);
        if (vars.rawurl) {
          b.title = vars.rawurl;
          b.addEventListener('click', e => {
            e.preventDefault();
            copyText(vars.rawurl, ok => {
              const old = b.textContent;
              b.textContent = ok ? '✓ Copiée' : '✕ Échec';
              setTimeout(() => { b.textContent = old; }, 1300);
            });
          });
        } else disable(b);
        c.appendChild(b);
        continue;
      }
      // --- services intégrés ---
      if (SERVICES[key]) {
        if (!settings.enabled[key]) continue;
        const s = SERVICES[key];
        const b = makeBtn(s.label, s.bg, s.fg, false, i++);
        const href = data ? s.link(data) : null;
        if (href) { b.href = href; b.title = href; }
        else disable(b);
        c.appendChild(b);
        continue;
      }
      // --- services personnalisés ---
      const svc = settings.custom.find(x => x.id === key);
      if (svc && svc.enabled !== false) {
        const b = makeBtn(svc.name, svc.bg || '#333', svc.fg || '#fff', false, i++);
        const href = data ? fillTemplate(svc.template, vars) : null;
        if (href) { b.href = href; b.title = href; }
        else disable(b);
        c.appendChild(b);
      }
    }

    c.style.display = isWatching() ? 'none' : 'flex';
  }

  /* ============================================================
     PANNEAU DE RÉGLAGES ⚙️  (aperçu en direct : la colonne reste visible)
     ============================================================ */
  function buildPresetOptions() {
    const groups = [];
    PLAYER_PRESETS.forEach((pr, idx) => {
      let g = groups.find(x => x.os === pr.os);
      if (!g) { g = { os: pr.os, items: [] }; groups.push(g); }
      g.items.push({ idx, pr });
    });
    return groups.map(g =>
      `<optgroup label="${g.os}">` +
      g.items.map(({ idx, pr }) => `<option value="${idx}">${pr.name} — ${pr.note}</option>`).join('') +
      `</optgroup>`
    ).join('') + `<option value="-1">Personnalisé…</option>`;
  }

  function openPanel() {
    if (document.getElementById(PANEL_ID)) return;
    panelOpen = true;

    const p = document.createElement('div');
    p.id = PANEL_ID;

    p.innerHTML = `
      <div class="psk-head"><span>Plex Sidekick 🔗▶️ — Réglages</span>
        <button class="psk-close" title="Fermer">✕</button></div>

      <div class="psk-sec">Apparence</div>
      <div class="psk-row"><label>Taille</label>
        <input type="range" class="psk-scale" min="70" max="140" step="5">
        <span class="psk-val psk-scale-val"></span></div>
      <div class="psk-row"><label>Opacité</label>
        <input type="range" class="psk-opacity" min="30" max="100" step="5">
        <span class="psk-val psk-opacity-val"></span></div>
      <div class="psk-row"><label>Style</label>
        <select class="psk-style">
          <option value="classic">Classique</option>
          <option value="pill">Pilule</option>
          <option value="square">Carré</option>
          <option value="glass">Verre</option>
          <option value="outline">Contour</option>
        </select></div>
      <div class="psk-row"><label>Animations</label>
        <input type="checkbox" class="psk-anim"></div>
      <div class="psk-hint">Aperçu en direct sur la colonne à droite. L'icône ⚙ garde toujours sa taille — filet de sécurité en cas de réglage extrême.</div>

      <div class="psk-sec">Lecteur local</div>
      <div class="psk-row"><label>Préréglage</label><select class="psk-preset">${buildPresetOptions()}</select></div>
      <div class="psk-row"><label>Nom</label><input type="text" class="psk-pname"></div>
      <div class="psk-row"><label>Schéma</label><input type="text" class="psk-ptpl" spellcheck="false"></div>
      <button class="psk-test">▶ Tester avec l'élément affiché</button>
      <div class="psk-hint">Variables : <code>{url}</code> encodée · <code>{rawurl}</code> brute · <code>{b64url}</code> base64url.</div>

      <details class="psk-help">
        <summary>Aide : quel lecteur, quelle installation ?</summary>
        <div class="psk-hint">
          <b>Sans rien installer :</b> IINA, Infuse, PotPlayer et VLC mobile enregistrent
          leur schéma d'URL auprès du système. Ça marche immédiatement.<br><br>

          <b>mpv et VLC desktop n'enregistrent aucun schéma.</b> Un navigateur ne peut donc
          pas les appeler directement — c'est pour ça que <code>mpv://…</code> semblait
          « ne rien faire ».<br><br>

          <b>macOS — la voie fiable : Raccourcis.</b> Crée un raccourci nommé
          <code>mpv</code> (ou <code>vlc</code>, <code>quicktime</code>) contenant une action
          <i>Exécuter un script shell</i>, shell <code>/bin/zsh</code>,
          entrée <i>en tant qu'arguments</i> :
          <pre>open -na /Applications/mpv.app --args "$1"</pre>
          Pour VLC : <code>open -na /Applications/VLC.app --args "$1"</code><br>
          Pour un mpv Homebrew sans bundle :
          <pre>/opt/homebrew/bin/mpv "$1" &amp;>/dev/null &amp;
disown</pre>
          Le raccourci reçoit l'URL déjà décodée, aucun échappement à gérer.<br><br>

          <b>Windows / Linux — helpers :</b> <b>mpv-handler</b> enregistre
          <code>mpv://</code> (format <code>mpv://play/&lt;base64url&gt;/</code>, la barre
          oblique finale est obligatoire), <b>vlc-protocol</b> enregistre <code>vlc://</code>.<br><br>

          Si un bouton reste sans effet, active <b>📋 URL directe</b> plus bas et colle
          l'URL dans le lecteur : si la lecture marche, le problème vient du schéma, pas de Plex.
        </div>
      </details>

      <div class="psk-sec">Boutons — cocher pour afficher, ▲▼ pour classer</div>
      <div class="psk-list"></div>

      <div class="psk-sec">Ajouter un service</div>
      <div class="psk-row"><label>Nom</label><input type="text" class="psk-cname" placeholder="Radarr"></div>
      <div class="psk-row"><label>URL</label><input type="text" class="psk-ctpl" spellcheck="false"
        placeholder="http://mac-mini:7878/movie/{tmdb}"></div>
      <div class="psk-row"><label>Couleurs</label>
        <input type="color" class="psk-cbg" value="#333333" title="Fond">
        <input type="color" class="psk-cfg" value="#ffffff" title="Texte"></div>
      <button class="psk-add">+ Ajouter le service</button>
      <div class="psk-hint">Variables : <code>{tmdb}</code> <code>{imdb}</code> <code>{imdbshow}</code>
        <code>{tvdb}</code> <code>{title}</code> (encodé) <code>{rawtitle}</code> <code>{year}</code>
        <code>{season}</code> <code>{episode}</code> <code>{type}</code>.<br>
        Le bouton se grise si une variable manque pour l'élément affiché.</div>
    `;
    document.body.appendChild(p);

    /* --- Apparence : aperçu live --- */
    const scale = p.querySelector('.psk-scale');
    const scaleVal = p.querySelector('.psk-scale-val');
    const opac = p.querySelector('.psk-opacity');
    const opacVal = p.querySelector('.psk-opacity-val');
    const styleSel = p.querySelector('.psk-style');
    const anim = p.querySelector('.psk-anim');

    scale.value = settings.ui.scale; scaleVal.textContent = settings.ui.scale + ' %';
    opac.value = settings.ui.opacity; opacVal.textContent = settings.ui.opacity + ' %';
    styleSel.value = settings.ui.style;
    anim.checked = !!settings.ui.anim;

    scale.addEventListener('input', () => {
      settings.ui.scale = +scale.value; scaleVal.textContent = scale.value + ' %';
      saveSettings(); applyAppearance();
    });
    opac.addEventListener('input', () => {
      settings.ui.opacity = +opac.value; opacVal.textContent = opac.value + ' %';
      saveSettings(); applyAppearance();
    });
    styleSel.addEventListener('change', () => {
      settings.ui.style = styleSel.value; saveSettings(); applyAppearance();
    });
    anim.addEventListener('change', () => {
      settings.ui.anim = anim.checked; saveSettings(); applyAppearance(); render(currentData);
    });

    /* --- Lecteur --- */
    const preset = p.querySelector('.psk-preset');
    const pname = p.querySelector('.psk-pname');
    const ptpl = p.querySelector('.psk-ptpl');
    const syncPreset = () => {
      preset.value = String(PLAYER_PRESETS.findIndex(
        pr => pr.template === settings.player.template && pr.name === settings.player.name));
    };
    pname.value = settings.player.name;
    ptpl.value = settings.player.template;
    syncPreset();

    preset.addEventListener('change', () => {
      const idx = parseInt(preset.value, 10);
      if (idx >= 0) {
        pname.value = PLAYER_PRESETS[idx].name;
        ptpl.value = PLAYER_PRESETS[idx].template;
        settings.player = { name: pname.value, template: ptpl.value };
        saveSettings(); rebuildList(); render(currentData);
      }
    });
    const savePlayer = () => {
      settings.player = { name: pname.value.trim() || 'Lecteur', template: ptpl.value.trim() };
      syncPreset();
      saveSettings(); rebuildList(); render(currentData);
    };
    pname.addEventListener('input', savePlayer);
    ptpl.addEventListener('input', savePlayer);

    /* --- Test du schéma --- */
    const testBtn = p.querySelector('.psk-test');
    testBtn.addEventListener('click', () => {
      const href = currentData ? fillTemplate(settings.player.template, templateVars(currentData)) : null;
      const flash = txt => { testBtn.textContent = txt; setTimeout(() => { testBtn.textContent = '▶ Tester avec l\'élément affiché'; }, 1800); };
      if (!href) return flash('✕ Aucun fichier lisible ici');
      openPlayerUrl(href);
      flash('▶ Envoyé à ' + settings.player.name);
    });

    /* --- Liste ordonnée des boutons --- */
    const list = p.querySelector('.psk-list');

    function move(key, dir) {
      const o = settings.order;
      const i = o.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= o.length) return;
      [o[i], o[j]] = [o[j], o[i]];
      saveSettings(); rebuildList(); render(currentData);
    }

    function rebuildList() {
      list.innerHTML = '';
      for (const key of settings.order) {
        let name, dotBg, checked, onToggle, onDelete = null;

        if (key === 'player') {
          name = '▶ Lecteur (' + settings.player.name + ')';
          dotBg = 'linear-gradient(135deg,#3a7bd5,#9b59f5)';
          checked = settings.enabled.player;
          onToggle = v => { settings.enabled.player = v; };
        } else if (key === 'nextEpisode') {
          name = '⏭ Épisode suivant';
          dotBg = 'linear-gradient(135deg,#1f8a4c,#27ae60)';
          checked = settings.enabled.nextEpisode;
          onToggle = v => { settings.enabled.nextEpisode = v; };
        } else if (key === 'copyUrl') {
          name = '📋 URL directe';
          dotBg = '#2f3640';
          checked = settings.enabled.copyUrl;
          onToggle = v => { settings.enabled.copyUrl = v; };
        } else if (SERVICES[key]) {
          name = SERVICES[key].label;
          dotBg = SERVICES[key].bg;
          checked = !!settings.enabled[key];
          onToggle = v => { settings.enabled[key] = v; };
        } else {
          const svc = settings.custom.find(x => x.id === key);
          if (!svc) continue;
          name = svc.name;
          dotBg = svc.bg || '#333';
          checked = svc.enabled !== false;
          onToggle = v => { svc.enabled = v; };
          onDelete = () => {
            settings.custom = settings.custom.filter(x => x.id !== key);
            settings.order = settings.order.filter(k => k !== key);
            saveSettings(); rebuildList(); render(currentData);
          };
        }

        const row = document.createElement('div');
        row.className = 'psk-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = checked;
        cb.addEventListener('change', () => { onToggle(cb.checked); saveSettings(); render(currentData); });
        const up = document.createElement('button');
        up.className = 'psk-mv'; up.textContent = '▲'; up.title = 'Monter';
        up.addEventListener('click', () => move(key, -1));
        const dn = document.createElement('button');
        dn.className = 'psk-mv'; dn.textContent = '▼'; dn.title = 'Descendre';
        dn.addEventListener('click', () => move(key, +1));
        const dot = document.createElement('span');
        dot.className = 'psk-dot'; dot.style.background = dotBg;
        const nm = document.createElement('span');
        nm.className = 'psk-name'; nm.textContent = name;

        row.appendChild(cb); row.appendChild(up); row.appendChild(dn);
        row.appendChild(dot); row.appendChild(nm);
        if (onDelete) {
          const x = document.createElement('button');
          x.className = 'psk-x'; x.textContent = '✕'; x.title = 'Supprimer ce service';
          x.addEventListener('click', onDelete);
          row.appendChild(x);
        }
        list.appendChild(row);
      }
    }
    rebuildList();

    /* --- Ajout d'un service --- */
    p.querySelector('.psk-add').addEventListener('click', () => {
      const name = p.querySelector('.psk-cname').value.trim();
      const tpl = p.querySelector('.psk-ctpl').value.trim();
      if (!name || !tpl) return;
      const id = 'c_' + Date.now().toString(36);
      settings.custom.push({
        id, name, template: tpl,
        bg: p.querySelector('.psk-cbg').value,
        fg: p.querySelector('.psk-cfg').value,
        enabled: true,
      });
      settings.order.push(id);
      saveSettings();
      p.querySelector('.psk-cname').value = '';
      p.querySelector('.psk-ctpl').value = '';
      rebuildList(); render(currentData);
    });

    /* --- Fermeture --- */
    p.querySelector('.psk-close').addEventListener('click', () => {
      p.remove();
      panelOpen = false;
    });
  }

  /* ============================================================
     BOUCLE PRINCIPALE
     ============================================================ */
  function update(retries = 0) {
    const key = getRatingKey();
    if (!key) { removeContainer(); lastKey = null; return; }
    if (key === lastKey) return;

    const srv = getServerInfo();
    if (!srv && retries < 12) { setTimeout(() => update(retries + 1), 400); return; }

    lastKey = key;
    if (key in cache) {
      cache[key] ? render(cache[key]) : removeContainer();
      return;
    }

    render(null);
    if (!srv) return;
    // resolve() peut rappeler deux fois pour un épisode :
    // d'abord les métadonnées, puis l'épisode suivant une fois trouvé.
    resolve(srv, key, data => {
      cache[key] = data;
      if (getRatingKey() !== key) return;
      data ? render(data) : removeContainer();
    });
  }

  window.addEventListener('hashchange', () => update());
  new MutationObserver(() => update()).observe(document.body, { childList: true, subtree: true });
  update();
})();
