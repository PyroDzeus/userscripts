// ==UserScript==
// @name         Plex Wheel 🎡
// @namespace    pyro.plex.wheel
// @version      1.0
// @author       Pyro
// @description  Roue de la chance intégrée à Plex Web : tire un titre au hasard dans la vue affichée (bibliothèque avec filtres, collection, watchlist, playlist). Animation dans la page, ouverture directe de la fiche, copie de la liste.
// @match        https://app.plex.tv/*
// @match        http://*/web/*
// @match        https://*/web/*
// @match        http://127.0.0.1:32400/*
// @match        http://localhost:32400/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-wheel.user.js
// @updateURL    https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-wheel.user.js
// ==/UserScript==

(function () {
  'use strict';

  const BTN_ID      = 'pwh-btn';
  const HOST_ID     = 'pwh-host';
  const MAX_SLICES  = 48;    // au-delà, la roue affiche un échantillon (le tirage reste fait sur TOUTE la liste)
  const PAGE_SIZE   = 500;   // taille des pages demandées au serveur
  const MAX_ITEMS   = 20000; // garde-fou
  const STEP_DELAY  = 220;   // secours DOM : attente après chaque saut de scroll
  const MAX_STEPS   = 400;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const prefs = (() => {
    let p = {};
    try { p = JSON.parse(GM_getValue('pwhPrefs', '{}')) || {}; } catch (e) {}
    return Object.assign({ sound: true }, p);
  })();
  const savePrefs = () => { try { GM_setValue('pwhPrefs', JSON.stringify(prefs)); } catch (e) {} };

  /* ============================================================
     1. ÉCOUTE DES REQUÊTES DE PLEX
     Plex Web charge chaque grille (bibliothèque filtrée, collection,
     watchlist, playlist) par une requête paginée. On mémorise ces
     requêtes : il suffit ensuite de rejouer la dernière, sans
     pagination, pour obtenir EXACTEMENT la vue affichée — filtres et
     tri compris — sans rien scroller.
     ============================================================ */
  const LIST_RE = /\/library\/sections\/[^/?]+\/all\b|\/library\/collections\/\d+\/children\b|\/library\/metadata\/\d+\/children\b|\/playlists\/\d+\/items\b/;
  const seen = [];          // { url, t }
  let navT = 0;             // performance.now() du dernier changement de page

  function record(e) {
    const n = e.name || '';
    if (!LIST_RE.test(n) || /\/hubs\//.test(n)) return;
    seen.push({ url: n, t: e.startTime });
    if (seen.length > 200) seen.splice(0, seen.length - 200);
  }
  try { performance.setResourceTimingBufferSize(5000); } catch (e) {}
  try { performance.getEntriesByType('resource').forEach(record); } catch (e) {}
  try {
    new PerformanceObserver(list => list.getEntries().forEach(record))
      .observe({ type: 'resource', buffered: true });
  } catch (e) {}
  window.addEventListener('hashchange', () => { navT = performance.now(); });

  /** La requête de liste la plus récente depuis l'arrivée sur la page. */
  function currentListRequest() {
    for (let i = seen.length - 1; i >= 0; i--) {
      if (seen[i].t >= navT - 1500) return seen[i].url;
    }
    return null;
  }

  /* ============================================================
     2. JETONS & SERVEUR
     ============================================================ */
  let serverTok = null;
  function pmsToken() {
    if (serverTok) return serverTok;
    const c = [];
    document.querySelectorAll('img[src*="X-Plex-Token"]').forEach(i => c.push(i.src));
    try {
      performance.getEntriesByType('resource').forEach(e => {
        if (e.name.includes('X-Plex-Token') && e.name.includes('/library/')) c.push(e.name);
      });
    } catch (e) {}
    for (const s of c) {
      try {
        const u = new URL(s, location.href);
        const t = u.searchParams.get('X-Plex-Token');
        if (t && !/plex\.tv$/.test(u.hostname)) { serverTok = { origin: u.origin, token: t }; return serverTok; }
      } catch (e) {}
    }
    return null;
  }
  function accountToken() {
    try { return localStorage.getItem('myPlexAccessToken') || null; } catch (e) { return null; }
  }
  function machineId() {
    const m = location.hash.match(/\/(?:server|media)\/([0-9a-f]{20,})/i);
    return m ? m[1] : null;
  }
  const onWatchlist = () => /source=watchlist/i.test(location.hash);

  /* ============================================================
     3. RÉCUPÉRATION VIA LE SERVEUR
     ============================================================ */
  function getJson(url, token) {
    return new Promise(resolve => {
      const headers = { Accept: 'application/json' };
      if (token) headers['X-Plex-Token'] = token;
      GM_xmlhttpRequest({
        method: 'GET', url, headers, timeout: 20000,
        onload: r => { try { resolve(JSON.parse(r.responseText)); } catch (e) { resolve(null); } },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }

  function tokenFor(u) {
    const inUrl = u.searchParams.get('X-Plex-Token');
    if (inUrl) return inUrl;
    if (/plex\.tv$/.test(u.hostname)) return accountToken();
    const s = pmsToken();
    return (s && s.origin === u.origin) ? s.token : (s ? s.token : accountToken());
  }

  function toItem(m, u, token) {
    const discover = /plex\.tv$/.test(u.hostname);
    let thumb = m.thumb || (m.Image && m.Image[0] && m.Image[0].url) || null;
    if (thumb && !/^https?:/.test(thumb)) {
      thumb = `${u.origin}/photo/:/transcode?width=240&height=360&minSize=1&upscale=1&url=${encodeURIComponent(thumb)}` +
              (token ? `&X-Plex-Token=${token}` : '');
    }
    return {
      title: m.title || '?',
      year: m.year || null,
      type: m.type || null,
      key: m.key ? String(m.key).replace(/\/children$/, '') : (m.ratingKey ? `/library/metadata/${m.ratingKey}` : null),
      thumb,
      discover,
      href: null,
    };
  }

  async function fetchFromServer(rawUrl, progress) {
    const u = new URL(rawUrl, location.href);
    const token = tokenFor(u);
    const out = [];
    let start = 0, total = Infinity;
    while (start < total && start < MAX_ITEMS) {
      u.searchParams.set('X-Plex-Container-Start', String(start));
      u.searchParams.set('X-Plex-Container-Size', String(PAGE_SIZE));
      const j = await getJson(u.toString(), token);
      const mc = j && j.MediaContainer;
      if (!mc) return out.length ? out : null;
      const md = mc.Metadata || [];
      md.forEach(m => out.push(toItem(m, u, token)));
      total = Number.isFinite(+mc.totalSize) ? +mc.totalSize : (md.length < PAGE_SIZE ? start + md.length : Infinity);
      progress(out.length, Number.isFinite(total) ? total : null);
      if (!md.length) break;
      start += md.length;
    }
    // Une bibliothèque peut mélanger films et collections : on garde les titres,
    // sauf si la vue ne contient QUE des collections (onglet Collections).
    const real = out.filter(i => i.type !== 'collection');
    return real.length ? real : out;
  }

  function watchlistUrl() {
    return 'https://discover.provider.plex.tv/library/sections/watchlist/all?includeFields=title,type,year,ratingKey,key,thumb&includeElements=Image';
  }

  /* ============================================================
     4. SECOURS : lecture de la grille affichée (scroll automatique)
     ============================================================ */
  function harvest(into) {
    document.querySelectorAll('[data-testid="metadataTitleLink"]').forEach(a => {
      const title = (a.getAttribute('title') || a.textContent || '').trim();
      if (!title) return;
      const href = a.getAttribute('href') || null;
      const k = href || title;
      if (into.has(k)) return;
      const cell = a.closest('[data-testid="cellItem"]');
      const img = cell && cell.querySelector('img');
      into.set(k, { title, year: null, type: null, key: null, thumb: img ? img.src : null, discover: false, href });
    });
  }
  function expectedTotal() {
    const b = document.querySelector('[data-testid="badgeElement"]');
    const n = b && parseInt((b.textContent || '').replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  function findScroller() {
    let el = document.querySelector('[data-testid="cellItem"]');
    while (el) {
      if (el.scrollHeight > el.clientHeight + 50) {
        const o = getComputedStyle(el).overflowY;
        if (o === 'auto' || o === 'scroll') return el;
      }
      el = el.parentElement;
    }
    return null;
  }
  async function fetchFromDom(progress) {
    const found = new Map();
    harvest(found);
    const sc = findScroller();
    const total = expectedTotal();
    if (sc) {
      const startY = sc.scrollTop;
      sc.scrollTop = 0;
      await sleep(STEP_DELAY);
      for (let i = 0; i < MAX_STEPS; i++) {
        harvest(found);
        progress(found.size, total);
        if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) break;
        const before = sc.scrollTop;
        sc.scrollTop = before + sc.clientHeight * 0.8;
        await sleep(STEP_DELAY);
        if (sc.scrollTop <= before + 1) break;
      }
      await sleep(STEP_DELAY);
      harvest(found);
      sc.scrollTop = startY;
    }
    return [...found.values()];
  }

  /** Point d'entrée : serveur d'abord, grille en secours. */
  async function collect(progress) {
    const req = currentListRequest() || (onWatchlist() && accountToken() ? watchlistUrl() : null);
    if (req) {
      const items = await fetchFromServer(req, progress);
      if (items && items.length) return { items, source: 'serveur' };
    }
    return { items: await fetchFromDom(progress), source: 'page' };
  }

  /* ============================================================
     5. OUVRIR LA FICHE DU GAGNANT
     ============================================================ */
  function openItem(it) {
    if (it.href) { location.hash = it.href.replace(/^.*#/, '#'); return; }
    if (!it.key) return;
    const k = encodeURIComponent(it.key);
    if (it.discover) location.hash = `#!/provider/tv.plex.provider.discover/details?key=${k}`;
    else {
      const mid = machineId();
      if (mid) location.hash = `#!/server/${mid}/details?key=${k}`;
    }
  }

  /* ============================================================
     6. HASARD ÉQUITABLE
     ============================================================ */
  function randInt(n) {
    if (n <= 1) return 0;
    const a = new Uint32Array(1), lim = Math.floor(0x100000000 / n) * n;
    do crypto.getRandomValues(a); while (a[0] >= lim);
    return a[0] % n;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ============================================================
     7. SON (petit « tic » à chaque case)
     ============================================================ */
  let actx = null;
  function tick() {
    if (!prefs.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle'; o.frequency.value = 1400;
      g.gain.setValueAtTime(0.05, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.05);
      o.connect(g).connect(actx.destination);
      o.start(); o.stop(actx.currentTime + 0.06);
    } catch (e) {}
  }

  /* ============================================================
     8. INTERFACE (Shadow DOM : le thème Plex ne peut rien casser)
     ============================================================ */
  const PALETTE = ['#e5a00d', '#1f2a36', '#c0392b', '#2d3e50', '#16a085', '#34495e', '#8e44ad', '#263340', '#d35400', '#2c3e50', '#2980b9', '#3b4a5a'];

  const CSS = `
    :host { all: initial; }
    .bd { position: fixed; inset: 0; z-index: 2147483000; background: rgba(6,8,12,.72);
          backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center; gap: 34px;
          font: 13px -apple-system, Helvetica, Arial, sans-serif; color: #e8e8e8;
          animation: fade .18s ease; flex-wrap: wrap; padding: 20px; box-sizing: border-box; }
    @keyframes fade { from { opacity: 0 } }
    .top { position: absolute; top: 16px; right: 18px; display: flex; gap: 8px; }
    .ic { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); color: #ddd;
          border-radius: 8px; height: 32px; min-width: 32px; padding: 0 10px; cursor: pointer; font: inherit; font-size: 13px; }
    .ic:hover { background: rgba(255,255,255,.16); color: #fff; }
    .wrap { position: relative; }
    canvas { display: block; cursor: pointer; border-radius: 50%;
             box-shadow: 0 0 0 6px rgba(229,160,13,.9), 0 0 0 10px rgba(0,0,0,.5), 0 24px 70px rgba(0,0,0,.6); }
    .ptr { position: absolute; left: 50%; top: -18px; transform: translateX(-50%);
           width: 0; height: 0; border-left: 17px solid transparent; border-right: 17px solid transparent;
           border-top: 32px solid #fff; filter: drop-shadow(0 3px 4px rgba(0,0,0,.6)); pointer-events: none; }
    .info { position: absolute; left: 0; right: 0; bottom: -34px; text-align: center; color: #9aa0aa; font-size: 12px; }
    .side { width: 290px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; }
    .poster { width: 200px; aspect-ratio: 2/3; border-radius: 8px; background: #1b1e24 center/cover no-repeat;
              box-shadow: 0 14px 40px rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center;
              font-size: 54px; color: #3a3f48; }
    .ttl { font-size: 20px; font-weight: 800; color: #fff; line-height: 1.25; }
    .yr { color: #9aa0aa; font-weight: 600; font-size: 14px; }
    .hint { color: #9aa0aa; font-size: 12.5px; line-height: 1.5; }
    .btns { display: flex; flex-direction: column; gap: 7px; width: 100%; }
    .b { border: none; border-radius: 7px; padding: 9px 12px; font: 700 13px -apple-system, Helvetica, Arial, sans-serif; cursor: pointer; }
    .b.pri { background: #e5a00d; color: #1a1400; }
    .b.pri:hover { filter: brightness(1.1); }
    .b.sec { background: rgba(255,255,255,.09); color: #e8e8e8; border: 1px solid rgba(255,255,255,.14); }
    .b.sec:hover { background: rgba(255,255,255,.16); }
    .b:disabled { opacity: .4; cursor: default; }
    .win { animation: pop .45s cubic-bezier(.2,1.6,.4,1); }
    @keyframes pop { from { transform: scale(.7); opacity: 0 } }
    .load { color: #ccc; font-size: 15px; text-align: center; line-height: 1.7; }
    .spin { width: 38px; height: 38px; border: 4px solid rgba(255,255,255,.15); border-top-color: #e5a00d;
            border-radius: 50%; animation: rot .8s linear infinite; margin: 0 auto 12px; }
    @keyframes rot { to { transform: rotate(360deg) } }
  `;

  let ui = null;   // état de la fenêtre ouverte

  function closeUi() {
    if (!ui) return;
    ui.closed = true;
    cancelAnimationFrame(ui.raf);
    document.removeEventListener('keydown', ui.onKey, true);
    ui.host.remove();
    ui = null;
  }

  async function openUi() {
    if (ui) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="bd"><div class="top">
        <button class="ic snd" title="Son"></button>
        <button class="ic x" title="Fermer (Échap)">✕</button></div>
        <div class="load"><div class="spin"></div><span class="lt">Récupération des titres…</span></div></div>`;
    document.body.appendChild(host);

    const bd = root.querySelector('.bd');
    ui = { host, root, bd, closed: false, raf: 0, rot: 0, spinning: false };
    const setSnd = () => { root.querySelector('.snd').textContent = prefs.sound ? '🔊' : '🔇'; };
    setSnd();
    root.querySelector('.snd').addEventListener('click', e => { e.stopPropagation(); prefs.sound = !prefs.sound; savePrefs(); setSnd(); });
    root.querySelector('.x').addEventListener('click', closeUi);
    bd.addEventListener('mousedown', e => { if (e.target === bd && !ui.spinning) closeUi(); });
    ui.onKey = e => {
      if (!ui) return;
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (!ui.spinning) closeUi(); }
      else if (e.key === ' ' && ui.items) { e.stopPropagation(); e.preventDefault(); spin(); }
    };
    document.addEventListener('keydown', ui.onKey, true);

    const me = ui;
    const lt = root.querySelector('.lt');
    let res;
    try {
      res = await collect((n, tot) => { lt.textContent = `Récupération des titres… ${n}${tot ? ' / ' + tot : ''}`; });
    } catch (e) {
      console.error('[Plex Wheel]', e);
      res = { items: [], source: 'erreur' };
    }
    if (me.closed) return;

    if (!res.items.length) {
      root.querySelector('.load').innerHTML = 'Aucun titre trouvé dans cette vue.<br><span style="color:#9aa0aa;font-size:12.5px">Ouvre une bibliothèque, une collection ou ta watchlist, puis réessaie.</span>';
      return;
    }
    ui.items = res.items;
    ui.source = res.source;
    buildWheel();
  }

  function buildWheel() {
    const { root, bd } = ui;
    root.querySelector('.load').remove();

    const size = Math.round(Math.min(560, window.innerHeight * 0.74, window.innerWidth * 0.55));
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML = `<canvas></canvas><div class="ptr"></div><div class="info"></div>`;
    const side = document.createElement('div');
    side.className = 'side';
    bd.appendChild(wrap);
    bd.appendChild(side);

    const cv = wrap.querySelector('canvas');
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.height = size * dpr;
    cv.style.width = cv.style.height = size + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);

    ui.cv = cv; ui.ctx = ctx; ui.size = size; ui.side = side; ui.info = wrap.querySelector('.info');
    ui.order = shuffle(ui.items);
    prepareSlices(null);
    draw();
    idle();
    cv.addEventListener('click', spin);
  }

  /** Construit les cases affichées. Si la liste est longue, échantillon aléatoire contenant le gagnant. */
  function prepareSlices(winner) {
    const all = ui.order;
    if (all.length <= MAX_SLICES) { ui.slices = all; return; }
    const pick = new Set();
    if (winner) pick.add(winner);
    while (pick.size < MAX_SLICES) pick.add(all[randInt(all.length)]);
    ui.slices = shuffle([...pick]);
  }

  function fitText(ctx, txt, max) {
    if (ctx.measureText(txt).width <= max) return txt;
    let s = txt;
    while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }

  function draw(hl) {
    const { ctx, size, slices, rot } = ui;
    const R = size / 2, n = slices.length, arc = (Math.PI * 2) / n;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(R, R);
    for (let i = 0; i < n; i++) {
      const a0 = rot + i * arc;
      let col = PALETTE[i % PALETTE.length];
      if (n % PALETTE.length === 1 && i === n - 1) col = PALETTE[5];   // évite deux couleurs identiques côte à côte
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, a0, a0 + arc);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      if (hl === i) { ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fill(); }
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Libellé
      ctx.save();
      ctx.rotate(a0 + arc / 2);
      const fs = Math.max(9, Math.min(16, arc * R * 0.4));
      ctx.font = `700 ${fs}px -apple-system, Helvetica, Arial, sans-serif`;
      ctx.fillStyle = (col === '#e5a00d') ? '#1a1400' : '#f4f4f4';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitText(ctx, slices[i].title, R * 0.62), R - 14, 0);
      ctx.restore();
    }
    // Moyeu
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = '#14161a';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#e5a00d';
    ctx.stroke();
    ctx.fillStyle = '#e5a00d';
    ctx.font = `800 ${Math.round(R * 0.075)}px -apple-system, Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ui.spinning ? '…' : 'GO', 0, 1);
    ctx.restore();
  }

  function infoLine() {
    const N = ui.items.length, n = ui.slices.length;
    const unit = N > 1 ? 'titres' : 'titre';
    return n < N
      ? `Tirage parmi ${N.toLocaleString('fr-FR')} ${unit} · la roue en montre ${n} au hasard`
      : `${N.toLocaleString('fr-FR')} ${unit} sur la roue`;
  }

  function copyList() {
    const txt = ui.items.map(i => i.title).join('\n');
    try { GM_setClipboard(txt, 'text'); return true; } catch (e) {}
    try { navigator.clipboard.writeText(txt); return true; } catch (e) { return false; }
  }

  function sideButtons(extra) {
    const btns = document.createElement('div');
    btns.className = 'btns';
    extra.forEach(([label, cls, fn]) => {
      const b = document.createElement('button');
      b.className = 'b ' + cls;
      b.textContent = label;
      b.addEventListener('click', e => { e.stopPropagation(); fn(b); });
      btns.appendChild(b);
    });
    return btns;
  }

  function copyBtn() {
    return [`📋 Copier la liste (${ui.items.length})`, 'sec', b => {
      const ok = copyList();
      const old = b.textContent;
      b.textContent = ok ? '✓ Copiée' : '✕ Échec';
      setTimeout(() => { b.textContent = old; }, 1400);
    }];
  }

  function idle() {
    ui.info.textContent = infoLine();
    ui.side.innerHTML = `<div class="poster">🎡</div><div class="hint">Clique sur la roue ou appuie sur <b>Espace</b> pour la lancer.<br>Source : ${ui.source}.</div>`;
    ui.side.appendChild(sideButtons([['🎡 Lancer', 'pri', () => spin()], copyBtn()]));
  }

  function showWinner(w) {
    const s = ui.side;
    s.innerHTML = '';
    const p = document.createElement('div');
    p.className = 'poster win';
    if (w.thumb) { p.style.backgroundImage = `url("${w.thumb}")`; } else p.textContent = '🎬';
    const t = document.createElement('div');
    t.className = 'ttl win';
    t.textContent = w.title;
    if (w.year) { const y = document.createElement('div'); y.className = 'yr'; y.textContent = w.year; t.appendChild(y); }
    s.appendChild(p);
    s.appendChild(t);
    const canOpen = !!(w.href || (w.key && (w.discover || machineId())));
    const acts = [];
    if (canOpen) acts.push(['▶ Ouvrir la fiche', 'pri', () => { closeUi(); openItem(w); }]);
    acts.push(['🔁 Relancer', canOpen ? 'sec' : 'pri', () => spin()]);
    if (ui.items.length > 1) acts.push(['✂ Retirer et relancer', 'sec', () => {
      ui.items = ui.items.filter(x => x !== w);
      ui.order = ui.order.filter(x => x !== w);
      prepareSlices(null);
      draw();
      spin();
    }]);
    acts.push(copyBtn());
    s.appendChild(sideButtons(acts));
  }

  function spin() {
    if (!ui || ui.spinning || !ui.items || !ui.items.length) return;
    ui.spinning = true;

    const winner = ui.order[randInt(ui.order.length)];       // tirage équitable sur toute la liste
    if (ui.order.length > MAX_SLICES) prepareSlices(winner);
    const n = ui.slices.length, arc = (Math.PI * 2) / n;
    const wi = ui.slices.indexOf(winner);

    ui.info.textContent = infoLine();
    ui.side.innerHTML = `<div class="poster">🎡</div><div class="hint">La roue tourne…</div>`;

    const TAU = Math.PI * 2;
    const jitter = (Math.random() - 0.5) * arc * 0.7;
    const target = -Math.PI / 2 - (wi + 0.5) * arc + jitter;
    const turns = 6 + randInt(3);
    const from = ui.rot;
    const to = from + turns * TAU + (((target - from) % TAU) + TAU) % TAU;
    const dur = 5200 + randInt(1600);
    const t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 4);
    const under = r => Math.floor(((((-Math.PI / 2 - r) % TAU) + TAU) % TAU) / arc);
    let last = under(from);

    const frame = now => {
      if (!ui) return;
      const k = Math.min(1, (now - t0) / dur);
      ui.rot = from + (to - from) * ease(k);
      const cur = under(ui.rot);
      if (cur !== last) { last = cur; tick(); }
      draw();
      if (k < 1) { ui.raf = requestAnimationFrame(frame); return; }
      ui.rot = ((ui.rot % TAU) + TAU) % TAU;
      ui.spinning = false;
      draw(wi);
      showWinner(winner);
    };
    ui.raf = requestAnimationFrame(frame);
  }

  /* ============================================================
     9. BOUTON FLOTTANT
     ============================================================ */
  function isWatching() {
    if (document.fullscreenElement) return true;
    const v = document.querySelector('video');
    return !!v && v.getBoundingClientRect().width > window.innerWidth * 0.5;
  }
  function onGridPage() {
    return document.querySelectorAll('[data-testid="cellItem"]').length >= 2 || onWatchlist();
  }

  function build() {
    const ex = document.getElementById(BTN_ID);
    const want = document.body && onGridPage() && !isWatching();
    if (!want) { if (ex) ex.remove(); return; }
    if (ex) return;

    const b = document.createElement('button');
    b.id = BTN_ID;
    b.textContent = '🎡 Roue';
    b.title = 'Tirer un titre au hasard dans cette vue (filtres compris)';
    b.style.cssText =
      'position:fixed;bottom:14px;right:18px;z-index:999999;' +
      'background:#1c1c1c;color:#eee;border:1px solid #444;border-radius:6px;' +
      'padding:6px 10px;font:600 12px -apple-system,Helvetica,Arial,sans-serif;' +
      'cursor:pointer;outline:none;opacity:.35;transition:opacity .15s;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.4);';
    b.addEventListener('mouseenter', () => (b.style.opacity = '1'));
    b.addEventListener('mouseleave', () => (b.style.opacity = '.35'));
    b.addEventListener('click', openUi);
    document.body.appendChild(b);
  }

  build();
  window.addEventListener('hashchange', build);
  setInterval(build, 1500);   // Plex remonte son DOM en permanence
})();
