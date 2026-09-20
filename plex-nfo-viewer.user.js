// ==UserScript==
// @name         Plex NFO Viewer
// @namespace    https://github.com/PyroDzeus/userscripts
// @version      2.1.0
// @description  Shows the release .nfo of a film/episode in Plex Web (needs plex-nfo-server.py on the Plex machine)
// @author       Pyro
// @match        https://app.plex.tv/*
// @match        http://*/web/*
// @match        https://*/web/*
// @match        http://127.0.0.1:32400/*
// @match        http://localhost:32400/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      localhost
// @connect      *
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-nfo-viewer.user.js
// @updateURL    https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-nfo-viewer.user.js
// ==/UserScript==

(() => {
  'use strict';

  // plex-nfo-server.py runs on the same machine as Plex. Its address is found
  // at runtime, nothing personal is hard-coded:
  //   1. at home: derived from the Plex server this page talks to (LAN address)
  //   2. away:    the address you set once with "⚙ Server" in the NFO window
  //               (e.g. the Plex machine's Tailscale IP), stored in the browser only
  const NFO_PORT = 8764;
  const log = (...a) => console.info('[Plex NFO]', ...a);
  const store = {
    get: (k, d) => { try { return GM_getValue(k, d); } catch (_) { return d; } },
    set: (k, v) => { try { GM_setValue(k, v); } catch (_) {} },
  };

  /** Origin of the Plex Media Server the page is using, or null if not seen yet. */
  function plexOrigin() {
    if (/^\d+$/.test(location.port) && location.pathname.startsWith('/web')) return location.origin;
    if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return location.origin;
    const urls = [];
    document.querySelectorAll('img[src*="X-Plex-Token"]').forEach(i => urls.push(i.src));
    try {
      performance.getEntriesByType('resource').forEach(e => {
        if (/\/(library|photo|transcode)\//.test(e.name) && /X-Plex-Token/.test(e.name)) urls.push(e.name);
      });
    } catch (_) {}
    for (const u of urls.reverse()) {
      try {
        const url = new URL(u, location.href);
        if (!/plex\.tv$/.test(url.hostname)) return url.origin;
      } catch (_) {}
    }
    return null;
  }

  /** Host part of the Plex server address, with plex.direct names turned into their IP. */
  function plexHost() {
    const origin = plexOrigin();
    if (!origin) return null;
    let host = new URL(origin).hostname;
    const m = host.match(/^(\d{1,3})-(\d{1,3})-(\d{1,3})-(\d{1,3})\.[^.]+\.plex\.direct$/);
    if (m) host = m.slice(1, 5).join('.');
    return host;
  }

  function isHomeOrPrivate(h) {
    return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h)
      || /\.(local|lan|home|ts\.net)$/i.test(h) || /^\[?(fd|fe80)/i.test(h);
  }

  const savedServers = () => (store.get('nfoServer', '') || '')
    .split(/[\s,]+/).map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);

  /** Addresses to try, in order: LAN (derived from Plex) first, then the saved one(s). */
  function candidates() {
    const list = [];
    const h = plexHost();
    if (h && isHomeOrPrivate(h)) list.push(`http://${h.includes(':') && !h.startsWith('[') ? `[${h}]` : h}:${NFO_PORT}`);
    list.push(...savedServers());
    return [...new Set(list)];
  }

  function ping(base, timeout = 2500) {
    return new Promise(resolve => GM_xmlhttpRequest({
      method: 'GET', url: `${base}/ping`, timeout,
      onload: r => resolve(r.status === 200), onerror: () => resolve(false), ontimeout: () => resolve(false),
    }));
  }

  let chosen = null; // address that answered last time
  async function resolveServer() {
    if (chosen) return { server: chosen };
    for (let i = 0; i < 15 && !plexHost() && !savedServers().length; i++) {
      await new Promise(r => setTimeout(r, 400)); // page hasn't talked to Plex yet
    }
    const list = candidates();
    for (const c of list) {
      if (await ping(c)) { chosen = c; log('using', c); return { server: c }; }
    }
    const h = plexHost();
    if (!list.length && h) {
      return { error: `You're away from home: the NFO server isn't reachable through Plex's public address. Set the Plex machine's Tailscale address below.` };
    }
    if (!list.length) return { error: 'Plex server not detected yet — reload the page, or set the server address below.' };
    return { error: `NFO server not reachable (tried ${list.join(', ')}). Is plex-nfo-server.py running on the Plex machine?` + (savedServers().length ? '' : ' Away from home? Set its Tailscale address below.') };
  }

  const HOTKEY = 'n';
  const cache = new Map(); // ratingKey -> {data} | {none}
  let currentKey = null;
  let state = { kind: 'idle' }; // idle | loading | ok | none | error

  GM_addStyle(`
    .pnfo-inline{display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;
      height:var(--pnfo-h,40px);min-width:var(--pnfo-h,40px);padding:0 14px;margin-left:8px;flex:0 0 auto;
      border-radius:4px;border:1px solid rgba(255,255,255,.18);background:transparent;
      color:rgba(255,255,255,.75);font:700 12px/1 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.1em;
      cursor:pointer;transition:background .15s,color .15s,border-color .15s;vertical-align:middle}
    .pnfo-inline:hover{background:rgba(255,255,255,.12);color:#fff}
    .pnfo-inline[data-state="ok"]{color:#4cd07d;border-color:rgba(76,208,125,.6);background:rgba(76,208,125,.12)}
    .pnfo-inline[data-state="ok"]:hover{background:#4cd07d;color:#0b1f12}
    .pnfo-inline[data-state="loading"]{opacity:.5}
    .pnfo-inline[data-state="error"]{color:#e5534b;border-color:rgba(229,83,75,.55)}
    .pnfo-inline.pnfo-float{position:fixed;left:24px;bottom:24px;z-index:99998;margin:0;--pnfo-h:36px;
      background:rgba(18,18,18,.88);backdrop-filter:blur(6px)}
    #pnfo-overlay[hidden],#pnfo-settings[hidden],#pnfo-msg[hidden],#pnfo-pre[hidden]{display:none!important}
    #pnfo-overlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.78);display:flex;
      align-items:center;justify-content:center;backdrop-filter:blur(4px)}
    #pnfo-box{max-width:94vw;max-height:92vh;min-width:min(560px,94vw);display:flex;flex-direction:column;background:#0a0a0a;
      border:1px solid #2a2a2a;border-radius:8px;box-shadow:0 24px 70px rgba(0,0,0,.7);overflow:hidden;
      font:13px -apple-system,BlinkMacSystemFont,sans-serif;color:#bbb}
    #pnfo-head{display:flex;gap:8px;align-items:center;padding:9px 12px;border-bottom:1px solid #1f1f1f}
    #pnfo-tabs{display:flex;gap:6px;flex:1;overflow-x:auto;min-width:0}
    .pnfo-tab,.pnfo-act{background:#161616;border:1px solid #2a2a2a;color:#bbb;border-radius:4px;
      padding:4px 9px;font:12px -apple-system,sans-serif;cursor:pointer;white-space:nowrap}
    .pnfo-tab[aria-selected="true"],.pnfo-act[aria-pressed="true"]{border-color:#e5a00d;color:#e5a00d}
    .pnfo-act:hover,.pnfo-tab:hover{color:#fff;border-color:#555}
    .pnfo-act.primary{background:#e5a00d;border-color:#e5a00d;color:#111;font-weight:600}
    #pnfo-title{font-weight:600;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #pnfo-pre{margin:0;padding:18px 26px;overflow:auto;color:#d6d6d6;white-space:pre;line-height:1.12;
      font-family:"SF Mono",Menlo,"DejaVu Sans Mono",Consolas,monospace;font-variant-ligatures:none;
      tab-size:8;user-select:text}
    #pnfo-msg{padding:22px 26px;line-height:1.5;color:#bbb}
    #pnfo-msg.err{color:#e5534b}
    #pnfo-settings{padding:14px 16px;border-bottom:1px solid #1f1f1f;background:#101010;line-height:1.45}
    #pnfo-settings .row{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
    #pnfo-settings input{flex:1;min-width:220px;background:#000;border:1px solid #333;color:#eee;border-radius:4px;
      padding:6px 8px;font:12px "SF Mono",Menlo,monospace}
    #pnfo-settings .hint{font-size:11.5px;color:#888;margin-top:8px}
    #pnfo-settings code{color:#ccc}
    #pnfo-status{font-size:12px}
  `);

  // ---------- button ----------
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pnfo-inline';
  btn.textContent = 'NFO';
  btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open(); });

  const MORE_LABEL = /^(more|more actions|plus|plus d.actions|autres actions|mehr|más|altro)$/i;
  const PLAY_LABEL = /play|next episode|resume|lecture|lire|reprendre|épisode suivant|trailer/i;
  const visible = el => !!el && el.getClientRects().length > 0;
  const inChrome = el => !!el.closest('nav, aside, header, [role="navigation"], [data-testid*="sidebar" i], [class*="sidebar" i], [class*="SideBar" i], [class*="NavBar" i]');
  const iconOnly = el => !/[\p{L}\p{N}]/u.test(el.textContent || '');

  /** Plex's "⋯" button in the item's action row (Play · … · ⋯) — never the sidebar "More ›". */
  function findMoreButton() {
    const cands = [...document.querySelectorAll('button, [role="button"]')].filter(b =>
      visible(b) && iconOnly(b) && !inChrome(b) &&
      (MORE_LABEL.test((b.getAttribute('aria-label') || b.getAttribute('title') || '').trim()) ||
       /preplay-?more|more-?actions/i.test(b.getAttribute('data-testid') || '')));
    if (!cands.length) return null;
    // Prefer the one sharing a row with the Play / Next Episode button.
    for (const b of cands) {
      let row = b.parentElement;
      for (let i = 0; row && i < 5; i++, row = row.parentElement) {
        const hasPlay = [...row.querySelectorAll('button, [role="button"]')].some(x =>
          x !== b && PLAY_LABEL.test(`${x.getAttribute('aria-label') || ''} ${x.getAttribute('data-testid') || ''} ${x.textContent || ''}`));
        if (hasPlay) return b;
      }
    }
    return cands.length === 1 ? cands[0] : null;
  }

  /** Put the button right after the ⋯ button (outside any single-child wrapper). */
  function placeButton() {
    if (!currentKey) { btn.remove(); return; }
    const more = findMoreButton();
    if (more) {
      let anchor = more;
      while (anchor.parentElement && anchor.parentElement.childElementCount === 1 &&
             anchor.parentElement !== document.body) anchor = anchor.parentElement;
      btn.classList.remove('pnfo-float');
      btn.style.setProperty('--pnfo-h', `${Math.round(more.getBoundingClientRect().height) || 40}px`);
      if (anchor.nextElementSibling !== btn) anchor.insertAdjacentElement('afterend', btn);
    } else if (!btn.isConnected || !btn.classList.contains('pnfo-float')) {
      // details page without a recognisable ⋯ button: small fallback, bottom left
      btn.classList.add('pnfo-float');
      btn.style.removeProperty('--pnfo-h');
      document.body.append(btn);
    }
  }

  function paintButton() {
    btn.dataset.state = state.kind;
    btn.textContent = state.kind === 'error' ? 'NFO ⚠' : state.kind === 'loading' ? 'NFO…' : 'NFO';
    btn.title = {
      ok: `Show the NFO (${HOTKEY.toUpperCase()})`,
      none: 'No matching NFO for this item — click for details / server settings',
      error: `${state.error || 'Error'} — click for server settings`,
      loading: 'Looking for an NFO…',
    }[state.kind] || '';
  }

  // ---------- overlay ----------
  const overlay = document.createElement('div');
  overlay.id = 'pnfo-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div id="pnfo-box" role="dialog" aria-label="NFO">
      <div id="pnfo-head">
        <div id="pnfo-tabs"></div>
        <button class="pnfo-act" id="pnfo-copy">Copy</button>
        <button class="pnfo-act" id="pnfo-gear" aria-pressed="false" title="NFO server settings">⚙ Server</button>
        <button class="pnfo-act" id="pnfo-close" title="Close (Esc)">✕</button>
      </div>
      <div id="pnfo-settings" hidden>
        <div>In use: <code id="pnfo-inuse">—</code> <span id="pnfo-status"></span></div>
        <div class="row">
          <input id="pnfo-remote" spellcheck="false" autocomplete="off" placeholder="http://100.x.y.z:${NFO_PORT}">
          <button class="pnfo-act primary" id="pnfo-save">Save &amp; retry</button>
          <button class="pnfo-act" id="pnfo-test">Test</button>
        </div>
        <div class="hint">At home the server is found automatically from your Plex connection.
          The address above is used when that fails (away from home) — e.g. the Plex machine's Tailscale IP,
          from <code>tailscale ip -4</code>. Several allowed, comma-separated. Saved in this browser only.</div>
      </div>
      <div id="pnfo-msg" hidden></div>
      <pre id="pnfo-pre" hidden></pre>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.body.append(overlay);

  const $ = sel => overlay.querySelector(sel);
  const pre = $('#pnfo-pre'), msg = $('#pnfo-msg'), settings = $('#pnfo-settings'), gear = $('#pnfo-gear');
  $('#pnfo-close').addEventListener('click', close);
  $('#pnfo-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(pre.textContent).then(() => {
      $('#pnfo-copy').textContent = 'Copied';
      setTimeout(() => { $('#pnfo-copy').textContent = 'Copy'; }, 1200);
    });
  });
  gear.addEventListener('click', () => toggleSettings(settings.hidden));
  $('#pnfo-save').addEventListener('click', async () => {
    store.set('nfoServer', $('#pnfo-remote').value.trim());
    chosen = null; cache.clear();
    await refresh(true);
  });
  $('#pnfo-test').addEventListener('click', async () => {
    chosen = null;
    const saved = store.get('nfoServer', '');
    store.set('nfoServer', $('#pnfo-remote').value.trim()); // test what's typed…
    setStatus('testing…');
    const r = await resolveServer();
    store.set('nfoServer', saved);                          // …without saving it
    chosen = null;
    setStatus(r.server ? `✅ reachable: ${r.server}` : `❌ ${r.error}`);
  });

  function setStatus(t) { $('#pnfo-status').textContent = t; }
  function toggleSettings(on) {
    settings.hidden = !on;
    gear.setAttribute('aria-pressed', String(on));
    if (on) {
      $('#pnfo-remote').value = store.get('nfoServer', '') || '';
      $('#pnfo-inuse').textContent = chosen || 'none yet';
      setStatus('');
    }
  }

  function showFile(i) {
    const f = state.data.files[i];
    pre.hidden = false; msg.hidden = true;
    pre.textContent = f.text.replace(/\s+$/, '');
    overlay.querySelectorAll('.pnfo-tab').forEach((t, j) => t.setAttribute('aria-selected', String(i === j)));
    fitFont(f.text);
    pre.scrollTop = 0;
  }

  // Scale the font so the widest line fits the viewport (80-col NFOs stay intact).
  function fitFont(text) {
    const cols = Math.max(40, ...text.split('\n').map(l => [...l].length));
    const avail = window.innerWidth * 0.94 - 56;
    pre.style.fontSize = Math.max(7, Math.min(15, avail / (cols * 0.602))).toFixed(2) + 'px';
  }

  function render() {
    const tabs = $('#pnfo-tabs');
    tabs.textContent = '';
    $('#pnfo-copy').hidden = state.kind !== 'ok';
    if (state.kind === 'ok') {
      state.data.files.forEach((f, i) => {
        const t = document.createElement('button');
        t.className = 'pnfo-tab';
        t.textContent = (f.label || f.name) + (f.kind === 'kodi' ? ' (Kodi XML)' : '');
        t.addEventListener('click', () => showFile(i));
        tabs.append(t);
      });
      showFile(0);
      return;
    }
    const title = document.createElement('span');
    title.id = 'pnfo-title';
    title.textContent = 'NFO';
    tabs.append(title);
    pre.hidden = true; msg.hidden = false;
    msg.className = state.kind === 'error' ? 'err' : '';
    msg.textContent = {
      none: `No matching .nfo was found for this ${state.type || 'item'}.` +
            ' Episodes need <video name>.nfo or an NFO tagged with the same SxxEyy; seasons need season.nfo or an NFO tagged S01 / Season 1.',
      error: state.error || 'Unknown error',
      loading: 'Looking for an NFO…',
      idle: 'Open a film, a series, a season or an episode.',
    }[state.kind];
    if (state.kind === 'error') toggleSettings(true);
  }

  function open() {
    overlay.hidden = false;
    toggleSettings(state.kind === 'error');
    render();
  }
  function close() { overlay.hidden = true; }

  // ---------- data ----------
  // Resolves to {data} | {none, type} | {error}. Only results (found / not found) are cached.
  async function fetchNfo(key) {
    if (cache.has(key)) return cache.get(key);
    const { server, error } = await resolveServer();
    if (!server) return { error };
    const url = `${server}/nfo/${key}`;
    return new Promise(resolve => {
      GM_xmlhttpRequest({
        method: 'GET', url, timeout: 8000,
        onload: r => {
          let body = null;
          try { body = JSON.parse(r.responseText); } catch (_) {}
          log(key, r.status, body);
          if (r.status === 200 && body && body.files && body.files.length) {
            const res = { data: body };
            cache.set(key, res);
            return resolve(res);
          }
          if (r.status === 404 && body && Array.isArray(body.files)) {
            const res = { none: true, type: body.type };
            cache.set(key, res);
            return resolve(res);
          }
          resolve({ error: (body && body.error) || `HTTP ${r.status} from ${url}` });
        },
        onerror: e => { log('network error', e); chosen = null; resolve({ error: `Lost contact with ${server} — is plex-nfo-server.py still running?` }); },
        ontimeout: () => { chosen = null; resolve({ error: `Timed out reaching ${server}` }); },
      });
    });
  }

  // Works with old (#!/server/…/details?key=…) and newer Plex Web URLs.
  function keyFromLocation() {
    let h = location.href;
    try { h = decodeURIComponent(decodeURIComponent(h)); } catch (_) {}
    if (!/details|metadata/i.test(h)) return null;
    const m = h.match(/\/library\/metadata\/(\d+)/) || h.match(/[?&]key=(\d+)(?:&|$)/);
    return m ? m[1] : null;
  }

  async function refresh(force) {
    const key = keyFromLocation();
    if (key === currentKey && !force) return;
    currentKey = key;
    if (!key) { state = { kind: 'idle' }; btn.remove(); close(); return; }
    if (!force) close();
    state = { kind: 'loading' };
    paintButton(); placeButton();
    if (!overlay.hidden) render();
    const res = await fetchNfo(key);
    if (currentKey !== key) return; // navigated away meanwhile
    state = res.data ? { kind: 'ok', data: res.data }
      : res.none ? { kind: 'none', type: res.type }
      : { kind: 'error', error: res.error };
    paintButton();
    if (!overlay.hidden) { render(); if (state.kind === 'ok') toggleSettings(false); }
    if (!settings.hidden) $('#pnfo-inuse').textContent = chosen || 'none';
  }
  const onRoute = () => refresh(false);

  GM_registerMenuCommand('NFO server settings…', () => { open(); toggleSettings(true); });

  // ---------- routing & keys ----------
  window.addEventListener('hashchange', onRoute);
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) { lastHref = location.href; onRoute(); }
    if (currentKey) placeButton(); // Plex re-renders its page: keep the button in place
  }, 700);
  onRoute();

  window.addEventListener('resize', () => { if (!overlay.hidden && !pre.hidden) fitFont(pre.textContent); });

  document.addEventListener('keydown', e => {
    if (!overlay.hidden && e.key === 'Escape') {
      e.stopPropagation(); e.preventDefault(); close(); return;
    }
    const el = e.target;
    const typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.toLowerCase() === HOTKEY && currentKey) {
      e.stopPropagation(); e.preventDefault();
      overlay.hidden ? open() : close();
    }
  }, true);
})();
