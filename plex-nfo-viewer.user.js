// ==UserScript==
// @name         Plex NFO Viewer 📄
// @namespace    https://github.com/PyroDzeus/userscripts
// @version      3.2.0
// @description  Reads the .nfo of a film, series, season or episode in Plex Web, like Jellyfin — and builds a release-style NFO from mediainfo, with your own FIGlet ASCII header, when there is none. Nothing is written to disk unless you click Save. Needs plex-nfo-server.py on the Plex machine.
// @author       Pyro
// @license      MIT
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
// @connect      cdn.jsdelivr.net
// @connect      *
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-nfo-viewer.user.js
// @updateURL    https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-nfo-viewer.user.js
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================
     1. BASICS
     ============================================================ */
  const NFO_PORT = 8764;
  const HOTKEY = 'n';
  const WIDTH = 81;                                   // classic scene NFO width
  const FIGLET_CDN = 'https://cdn.jsdelivr.net/npm/figlet@1.11.4/fonts/';
  const log = (...a) => console.info('[Plex NFO]', ...a);
  const store = {
    get: (k, d) => { try { const v = GM_getValue(k, d); return v === undefined ? d : v; } catch (_) { return d; } },
    set: (k, v) => { try { GM_setValue(k, v); } catch (_) {} },
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function gmRequest(opts) {
    return new Promise(resolve => GM_xmlhttpRequest(Object.assign({ timeout: 8000 }, opts, {
      onload: r => resolve({ status: r.status, text: r.responseText }),
      onerror: () => resolve({ status: 0, text: '' }),
      ontimeout: () => resolve({ status: -1, text: '' }),
    })));
  }

  /* ---------- settings ---------- */
  const DEFAULTS = {
    layout: 'rules',          // see LAYOUTS
    asciiText: '{title}',     // {title} = film / show title, {group} = release group, or any text
    font: 'ANSI Regular',
    fontUrl: '',              // any .flf URL, overrides the list
    spacing: 'full',          // 'full' = letters spaced like the font draws them, 'fitted' = packed
    subtitle: '',             // optional line under the header
    greetz: '',               // optional notes / greetings section
    footer: '',               // optional closing line
    sceneLabels: false,       // RESOLUTiON-style labels
  };
  const stored = store.get('pnfoSettings', {});
  if (!stored.v) {            // settings saved by 3.0/3.1: the texts were pre-filled back then, start clean
    for (const k of ['subtitle', 'footer', 'asciiText', 'sceneLabels']) delete stored[k];
  }
  let settings = Object.assign({}, DEFAULTS, stored, { v: 2 });
  const saveSettings = () => store.set('pnfoSettings', settings);

  /* ============================================================
     2. PLEX — where the page's server is (to find the NFO server)
     ============================================================ */
  function pageTokenUrls() {
    const urls = [];
    document.querySelectorAll('img[src*="X-Plex-Token"]').forEach(i => urls.push(i.src));
    try {
      performance.getEntriesByType('resource').forEach(e => {
        if (/\/(library|photo|transcode)\//.test(e.name) && /X-Plex-Token/.test(e.name)) urls.push(e.name);
      });
    } catch (_) {}
    return urls.reverse();
  }

  /** Origin of the Plex Media Server the page is using, or null if not seen yet. */
  function plexOrigin() {
    if (/^\d+$/.test(location.port) && location.pathname.startsWith('/web')) return location.origin;
    if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return location.origin;
    for (const u of pageTokenUrls()) {
      try {
        const url = new URL(u, location.href);
        if (!/plex\.tv$/.test(url.hostname)) return url.origin;
      } catch (_) {}
    }
    return null;
  }

  /** Your Plex token — sent only when you click Save, so the server can check with Plex that you may see the item. */
  function plexToken() {
    try { const t = localStorage.getItem('myPlexAccessToken'); if (t) return t; } catch (_) {}
    for (const u of pageTokenUrls()) {
      try { const t = new URL(u, location.href).searchParams.get('X-Plex-Token'); if (t) return t; } catch (_) {}
    }
    return null;
  }

  /* ============================================================
     3. NFO SERVER (optional) — found at runtime, nothing personal hard-coded
       1. at home: derived from the Plex server this page talks to
       2. away:    address set in ⚙ Settings (e.g. a Tailscale IP), browser only
     ============================================================ */
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

  function candidates() {
    const list = [];
    const h = plexHost();
    if (h && isHomeOrPrivate(h)) list.push(`http://${h.includes(':') && !h.startsWith('[') ? `[${h}]` : h}:${NFO_PORT}`);
    list.push(...savedServers());
    return [...new Set(list)];
  }

  let chosen = null, caps = {};
  async function ping(base) {
    const r = await gmRequest({ method: 'GET', url: `${base}/ping`, timeout: 2500 });
    if (r.status !== 200) return null;
    try { return JSON.parse(r.text); } catch (_) { return { ok: true }; }
  }

  async function resolveServer() {
    if (chosen) return { server: chosen };
    for (let i = 0; i < 15 && !plexHost() && !savedServers().length; i++) await sleep(400);
    const list = candidates();
    for (const c of list) {
      const p = await ping(c);
      if (p) { chosen = c; caps = p; log('server', c, p); return { server: c }; }
    }
    if (!list.length && plexHost()) {
      return { error: "You're away from home: the NFO server isn't reachable through Plex's public address. Set the Plex machine's Tailscale address in ⚙ Settings." };
    }
    if (!list.length) return { error: 'Plex server not detected yet — reload the page, or set the server address in ⚙ Settings.' };
    return { error: `NFO server not reachable (tried ${list.join(', ')}). Is plex-nfo-server.py running on the Plex machine?` + (savedServers().length ? '' : ' Away from home? Set its Tailscale address in ⚙ Settings.') };
  }

  const nfoCache = new Map(); // ratingKey -> {files} | {none}
  async function fetchNfo(key) {
    if (nfoCache.has(key)) return nfoCache.get(key);
    const { server, error } = await resolveServer();
    if (!server) return { error };
    const r = await gmRequest({ method: 'GET', url: `${server}/nfo/${key}` });
    let body = null;
    try { body = JSON.parse(r.text); } catch (_) {}
    if (r.status === 200 && body && body.files && body.files.length) { const res = { files: body.files }; nfoCache.set(key, res); return res; }
    if (r.status === 404 && body && Array.isArray(body.files)) { const res = { none: true }; nfoCache.set(key, res); return res; }
    if (r.status <= 0) chosen = null;
    return { error: (body && body.error) || (r.status <= 0 ? `Lost contact with ${server} — is plex-nfo-server.py still running?` : `HTTP ${r.status} from ${server}`) };
  }

  async function saveNfo(key, file, text, overwrite) {
    const { server, error } = await resolveServer();
    if (!server) return { error };
    const r = await gmRequest({
      method: 'POST', url: `${server}/nfo/${key}`,
      headers: { 'Content-Type': 'application/json', 'X-Plex-Token': plexToken() || '' },
      data: JSON.stringify({ file, text, overwrite: !!overwrite }),
    });
    let body = {};
    try { body = JSON.parse(r.text); } catch (_) {}
    if (r.status === 200) return { ok: true, name: body.name };
    if (r.status === 409) return { exists: true, name: body.name };
    if (r.status === 404 || r.status === 405 || r.status === 501) return { error: 'This plex-nfo-server.py is too old to save files — update it on the Plex machine.' };
    return { error: body.error || `HTTP ${r.status || 'error'}` };
  }

  /* ============================================================
     4. FIGLET — tiny .flf renderer (matches `figlet -k` output)
     ============================================================ */
  const FONTS = ['ANSI Regular', 'ANSI Shadow', 'ANSI Compact', 'DOS Rebel', 'Delta Corps Priest 1', 'Bloody',
    'Calvin S', 'Electronic', 'Sub-Zero', 'Standard', 'Slant', 'Small', 'Big', 'Doom', 'Epic', 'Graffiti',
    'Larry 3D', '3D-ASCII', 'Colossal', 'Georgia11', 'Univers', 'Star Wars', 'Speed', 'Poison', 'Big Money-ne'];

  function parseFlf(src) {
    const lines = src.replace(/\r/g, '').split('\n');
    const m = lines[0].match(/^flf2a(\S)\s+(\d+)\s+\d+\s+\d+\s+-?\d+\s+(\d+)/);
    if (!m) throw new Error('not a FIGlet (.flf) font');
    const hard = m[1], height = +m[2];
    let i = 1 + (+m[3]);
    const glyph = () => {
      const rows = [];
      for (let r = 0; r < height; r++, i++) {
        let l = (lines[i] || '').replace(/\s+$/, '');
        const end = l.slice(-1);
        while (end && l.endsWith(end)) l = l.slice(0, -1);
        rows.push([...l]);
      }
      const w = Math.max(0, ...rows.map(r => r.length));
      return rows.map(r => r.concat(Array(w - r.length).fill(' ')));
    };
    const chars = {};
    for (let c = 32; c <= 126; c++) chars[c] = glyph();
    return { hard, height, chars };
  }

  function renderFig(font, text, mode) {
    let out = Array.from({ length: font.height }, () => []);
    for (const ch of text) {
      const g = font.chars[ch.codePointAt(0)] || font.chars[63] || font.chars[32];
      if (mode === 'fitted' && out[0].length) {
        let k = g[0].length;
        for (let r = 0; r < font.height; r++) {
          const L = out[r], R = g[r];
          let trail = 0; while (trail < L.length && L[L.length - 1 - trail] === ' ') trail++;
          let lead = 0; while (lead < R.length && R[lead] === ' ') lead++;
          k = Math.min(k, trail + lead);
        }
        out = out.map((L, r) => {
          const R = g[r], keep = L.slice(0, L.length - k);
          const over = L.slice(L.length - k).map((c, j) => (c === ' ' ? (R[j] || ' ') : c));
          return keep.concat(over, R.slice(k));
        });
      } else {
        out = out.map((L, r) => L.concat(g[r]));
      }
    }
    return out.map(r => r.join('').split(font.hard).join(' ').replace(/\s+$/, ''));
  }

  const fontMem = new Map();
  async function loadFont() {
    const url = settings.fontUrl.trim() || FIGLET_CDN + encodeURIComponent(settings.font) + '.flf';
    if (fontMem.has(url)) return fontMem.get(url);
    let src = store.get('pnfoFont:' + url, '');
    if (!src) {
      const r = await gmRequest({ method: 'GET', url, timeout: 10000 });
      if (r.status !== 200) throw new Error(`font download failed (${r.status || 'offline'})`);
      src = r.text;
      store.set('pnfoFont:' + url, src);
    }
    const font = parseFlf(src);
    fontMem.set(url, font);
    return font;
  }

  /** ASCII header lines (centred), falling back to plain text if too wide or no font. */
  async function asciiHeader(text, width = WIDTH) {
    text = (text || '').trim();
    if (!text) return { lines: [] };
    let font = null, warn = null;
    try { font = await loadFont(); } catch (e) { warn = e.message; }
    const fits = ls => ls.every(l => [...l].length <= width);
    let lines = null;
    if (font) {
      for (const mode of [settings.spacing, 'fitted']) {
        const one = renderFig(font, text, mode);
        if (fits(one)) { lines = one; break; }
        const words = text.split(/\s+/);
        if (words.length > 1) {
          const many = words.flatMap((w, i) => (i ? [''] : []).concat(renderFig(font, w, mode)));
          if (fits(many)) { lines = many; break; }
        }
      }
      if (!lines) warn = 'text too wide for this font — shown as plain text';
    }
    if (!lines) lines = [text.toUpperCase().split('').join(' ')];
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    while (lines.length && !lines[0].trim()) lines.shift();
    const w = Math.max(...lines.map(l => [...l].length));
    const pad = ' '.repeat(Math.max(0, Math.floor((width - w) / 2)));
    return { lines: lines.map(l => (pad + l).replace(/\s+$/, '')), warn };
  }

  /* ============================================================
     5. MEDIA MODEL — mediainfo (run by plex-nfo-server.py) + Plex details
     ============================================================ */
  const SERVICES = { AMZN: 'Amazon Prime Video', NF: 'Netflix', ATVP: 'Apple TV+', DSNP: 'Disney+', HMAX: 'HBO Max',
    MAX: 'Max', HULU: 'Hulu', PCOK: 'Peacock', PMTP: 'Paramount+', CRAV: 'Crave', CANALP: 'Canal+', MYCANAL: 'myCANAL',
    ADN: 'ADN', CR: 'Crunchyroll', IT: 'iTunes', STAN: 'Stan', MUBI: 'MUBI', ARTE: 'ARTE', TF1: 'TF1+', FTV: 'france.tv',
    SKST: 'SkyShowtime', RKTN: 'Rakuten TV', ROKU: 'Roku', TVNZ: 'TVNZ', BCORE: 'Bravia Core', PLAY: 'Google Play' };

  function sourceOf(name) {
    const t = name.replace(/[._]/g, ' ');
    const uhd = /\b(2160p|4k|uhd)\b/i.test(t);
    let kind = null;
    if (/\bremux\b/i.test(t)) kind = (uhd ? 'UHD Blu-ray' : 'Blu-ray') + ' Remux';
    else if (/\b(blu-?ray|bdrip|brrip|bd)\b/i.test(t)) kind = uhd ? 'UHD Blu-ray' : 'Blu-ray';
    else if (/\bweb-?rip\b/i.test(t)) kind = 'WEBRip';
    else if (/\b(web-?dl|web)\b/i.test(t)) kind = 'WEB-DL';
    else if (/\bhdtv\b/i.test(t)) kind = 'HDTV';
    else if (/\b(dvd(rip)?|dvd[59])\b/i.test(t)) kind = 'DVD';
    const svc = Object.keys(SERVICES).find(k => new RegExp(`\\b${k}\\b`, k === 'IT' ? '' : 'i').test(t));
    return [kind, svc && SERVICES[svc]].filter(Boolean).join(' · ') || null;
  }

  const langNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'language' }); } catch (_) { return null; } })();
  /** "fr" + "VFF" -> "French (VFF)", "en-US" -> "English (US)" */
  function language(code, title) {
    const [base, region] = String(code || '').split('-');
    let name = null;
    if (base && langNames) { try { const n = langNames.of(base); if (n && n.toLowerCase() !== base.toLowerCase()) name = n; } catch (_) {} }
    name = name || base || 'Unknown';
    const fr = (String(title || '').match(/\b(VFF|VFQ|VFI|VF2|VOF|VFB)\b/i) || [])[1];
    const tag = fr ? fr.toUpperCase() : (region || '').toUpperCase();
    return tag ? `${name} (${tag})` : name;
  }

  const rate = bps => (bps ? (bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} Mb/s` : `${Math.round(bps / 1000)} kb/s`) : null);
  const gib = b => (!b ? null : b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GiB` : `${(b / 1024 ** 2).toFixed(1)} MiB`);
  function duration(sec) {
    if (!sec) return null;
    const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s % 60).padStart(2, '0')} s`;
  }
  const two = n => String(n).padStart(2, '0');

  function buildModel(info, v) {
    const vid = v.video || {};
    return {
      file: v.file, release: v.release,
      group: (v.release.match(/-([A-Za-z0-9]+)$/) || [])[1] || '',
      titleLines: info.type === 'episode'
        ? [info.show, `S${two(info.season)}E${two(info.episode)} : ${info.title}`]
        : [`${info.title}${info.year ? ` (${info.year})` : ''}`],
      rows: [
        ['RELEASE SIZE', gib(v.size), 'NFO DATE', new Date().toISOString().slice(0, 10)],
        ['SOURCE', sourceOf(v.release)],
        [info.type === 'episode' ? 'AIR DATE' : 'RELEASED', info.airDate, 'RUNTIME', duration(v.duration)],
      ],
      video: [
        ['CODEC', vid.codec, 'BITRATE', rate(vid.bitrate)],
        ['RESOLUTION', vid.width ? `${vid.width} x ${vid.height}` : null, 'ASPECT RATIO', vid.aspect ? vid.aspect.toFixed(3) : null],
        ['FRAMERATE', vid.fps ? `${vid.fps.toFixed(3)} FPS` : null, 'BIT DEPTH', vid.bitDepth ? `${vid.bitDepth} bits` : null],
        ['COLOR PRIMARIES', vid.primaries],
        ['HDR FORMAT', vid.hdr],
      ],
      audio: (v.audio || []).map(a => [
        ['LANGUAGE', language(a.lang, a.title), 'TYPE', a.ad || /\b(AD|audio ?desc)/i.test(a.title || '') ? 'Audiodescription'
          : /comment/i.test(a.title || '') ? 'Commentary' : 'Normal'],
        ['CODEC', `${a.codec} ${a.channels}`.trim(), 'BITRATE', rate(a.bitrate)],
      ]),
      subs: (v.subs || []).map(t => [
        ['LANGUAGE', language(t.lang, t.title), 'TYPE', t.forced || /forc/i.test(t.title || '') ? 'Forced'
          : /\b(SDH|HI|CC)\b/i.test(t.title || '') ? 'SDH' : 'Full'],
        ['FORMAT', t.format, 'LINES', t.lines ? String(t.lines) : null],
      ]),
      links: info.links || [],
    };
  }

  /* ============================================================
     6. NFO LAYOUTS
     Every layout gets the same model: rows of [label, value, label2, value2].
     ============================================================ */
  const chars = s => [...String(s)];
  const len = s => chars(s).length;
  const padR = (s, w) => s + ' '.repeat(Math.max(0, w - len(s)));
  const center = (s, w) => { const l = Math.floor((w - len(s)) / 2); return padR(' '.repeat(Math.max(0, l)) + s, w); };
  const trimR = l => l.replace(/\s+$/, '');

  function wrap(text, w) {
    const out = [];
    let line = '';
    for (const word of String(text).split(/\s+/)) {
      if (!line) line = word;
      else if (len(line) + 1 + len(word) <= w) line += ' ' + word;
      else { out.push(line); line = word; }
      while (len(line) > w) { out.push(chars(line).slice(0, w).join('')); line = chars(line).slice(w).join(''); }
    }
    if (line) out.push(line);
    return out.length ? out : [''];
  }

  const has = v => v != null && v !== '';
  /** [[l1,v1,l2,v2], …] -> [[label, value], …] (one field per line) */
  const flat = rows => rows.flatMap(([a, b, c, d]) => [[a, b], [c, d]]).filter(([l, v]) => l && has(v));

  /** Label text: "Release size", or "RELEASE SiZE" with scene-style labels. */
  const ACRONYMS = /^(HDR|NFO|TMDB|TVDB|IMDB|FPS|SDH)$/i;
  function label(key, upper) {
    if (settings.sceneLabels) return key.toUpperCase().replace(/I/g, 'i');
    if (upper) return key.toUpperCase();
    return key.split(' ').map((w, i) => (ACRONYMS.test(w) ? w.toUpperCase()
      : i ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ');
  }

  /** Label/value lines, wrapped under the value column. */
  function kv(pairs, width, labelW, indent, sep = ' : ') {
    const out = [];
    for (const [l, v] of pairs) {
      const head = ' '.repeat(indent) + padR(label(l), labelW) + sep;
      wrap(v, Math.max(20, width - len(head))).forEach((x, i) => out.push((i ? ' '.repeat(len(head)) : head) + x));
    }
    return out;
  }

  function sections(m) {
    const list = [['Details', flat(m.rows)], ['Video', flat(m.video)]];
    m.audio.forEach((a, i) => list.push([m.audio.length > 1 ? `Audio #${i + 1}` : 'Audio', flat(a)]));
    m.subs.forEach((t, i) => list.push([m.subs.length > 1 ? `Subtitles #${i + 1}` : 'Subtitles', flat(t)]));
    return list;
  }

  const notes = () => [settings.greetz.trim(), settings.footer.trim()].filter(Boolean);
  const intro = (header, w) => {
    const out = [...header.lines];
    if (settings.subtitle.trim()) out.push('', center(settings.subtitle.trim(), w));
    if (out.length) out.push('');
    return out;
  };

  const LAYOUTS = {
    /* 1 — mediainfo-like list, no frame */
    minimal: { name: '1 - Minimalistic', width: 80, render(m, header) {
      const W = 80, out = intro(header, W);
      out.push(m.release, '');
      m.titleLines.forEach(t => out.push(t));
      for (const [title, pairs] of sections(m)) out.push('', label(title, true), ...kv(pairs, W, 20, 0));
      if (m.links.length) out.push('', label('Links', true), ...m.links.map(([, u]) => u));
      if (notes().length) out.push('', ...notes().flatMap(n => wrap(n, W)));
      return out;
    } },

    /* 2 — centred titles between double rules, tracks grouped under single rules */
    rules: { name: '2 - Clean rules', width: 80, render(m, header) {
      const W = 80;
      const rule = (t, ch) => { const x = t ? ` ${t} ` : ''; const l = Math.floor((W - len(x)) / 2); return ch.repeat(l) + x + ch.repeat(W - l - len(x)); };
      const out = intro(header, W);
      out.push(rule(label('Release', true), '═'), '');
      m.titleLines.forEach(t => wrap(t, W - 4).forEach(x => out.push(center(x, W))));
      wrap(m.release, W - 4).forEach(x => out.push(center(x, W)));
      out.push('', rule(label('Details', true), '═'), '', ...kv(flat(m.rows), W, 15, 3), '');
      out.push(rule(label('Tracks', true), '═'));
      for (const [title, pairs] of sections(m).slice(1)) out.push(rule(label(title), '─'), '', ...kv(pairs, W, 15, 3), '');
      if (m.links.length) out.push(rule(label('Links', true), '═'), '', ...m.links.map(([, u]) => '   ' + u), '');
      if (notes().length) out.push(rule(label('Notes', true), '═'), '', ...notes().flatMap(n => wrap(n, W - 4).map(x => center(x, W))), '');
      out.push('═'.repeat(W));
      return out;
    } },

    /* 3 — everything inside a # frame */
    hash: { name: '3 - Hash box', width: 80, render(m, header) {
      const W = 80, IN = W - 2;
      const line = t => `#${padR(t, IN)}#`, blank = line(''), full = '#'.repeat(W);
      const banner = t => [full, line(center(`[ ${t} ]`, IN)), full];
      const out = intro(header, W);
      out.push(...banner(label('Release', true)), blank);
      m.titleLines.forEach(t => wrap(t, IN - 6).forEach(x => out.push(line(center(x, IN)))));
      out.push(blank);
      wrap(m.release, IN - 6).forEach(x => out.push(line(center(x, IN))));
      out.push(blank);
      for (const [title, pairs] of sections(m)) {
        out.push(...banner(label(title, true)), blank, ...kv(pairs, IN - 3, 15, 3).map(line), blank);
      }
      if (m.links.length) out.push(...banner(label('Links', true)), blank, ...m.links.map(([, u]) => line('   ' + u)), blank);
      if (notes().length) out.push(...banner(label('Notes', true)), blank, ...notes().flatMap(n => wrap(n, IN - 6).map(x => line(center(x, IN)))), blank);
      out.push(full);
      return out;
    } },

    /* 4 — shaded block frame, fields side by side */
    shaded: { name: '4 - Shaded box', width: 81, render(m, header) {
      const W = 81, INNER = W - 4, COL1 = 39, COL2 = INNER - COL1, LABEL = 16;
      const L = t => label(t, true);
      const row = c => `█ ${padR(c, INNER)} █`;
      const head = l => { const lab = L(l); return `■ ${lab}${'.'.repeat(Math.max(0, LABEL - len(lab)))}: `; };
      const field = (l, v, w) => wrap(v, w - len(head(l))).map((x, i) => (i ? ' '.repeat(len(head(l))) : head(l)) + x);
      const rows = list => {
        const out = [row('')];
        for (const [l1, v1, l2, v2] of list) {
          const a1 = has(v1), a2 = l2 && has(v2);
          if (!a1 && !a2) continue;
          const A = a1 ? field(l1, v1, a2 ? COL1 : INNER) : [], B = a2 ? field(l2, v2, a1 ? COL2 : INNER) : [];
          if (a1 && a2 && (A.length > 1 || B.length > 1)) {
            field(l1, v1, INNER).forEach(x => out.push(row(x))); field(l2, v2, INNER).forEach(x => out.push(row(x)));
          } else if (a1 && a2) out.push(row(padR(A[0], COL1) + B[0]));
          else (A.length ? A : B).forEach(x => out.push(row(x)));
        }
        out.push(row(''));
        return out;
      };
      const bar = (t, pos) => {
        const l = pos === 'top' ? '█ ▄███▓▓▓▒▒▒░░░' : pos === 'end' ? '█ ▀███▓▓▓▒▒▒░░░' : '█ ████▓▓▓▒▒▒░░░';
        const r = pos === 'top' ? '░░░▒▒▒▓▓▓███▄ █' : pos === 'end' ? '░░░▒▒▒▓▓▓███▀ █' : '░░░▒▒▒▓▓▓████ █';
        return l + center(t, W - 30) + r;
      };
      const top = '▀'.repeat(W - 2), low = '▄'.repeat(W - 2);
      const section = (t, body) => [`█${top}█`, bar(L(t)), `█${low}█`, ...body];
      const out = intro(header, W);
      out.push(`▄█${'▀'.repeat(W - 4)}█▄`, bar(L('Release'), 'top'), `█${low}█`, row(''));
      m.titleLines.forEach(t => wrap(t, INNER).forEach(x => out.push(row(center(x, INNER)))));
      wrap(m.release, INNER).forEach(x => out.push(row(center(x, INNER))));
      out.push(...rows(m.rows), ...section('Video', rows(m.video)));
      m.audio.forEach((a, i) => out.push(...section(m.audio.length > 1 ? `Audio #${i + 1}` : 'Audio', rows(a))));
      m.subs.forEach((t, i) => out.push(...section(m.subs.length > 1 ? `Subtitles #${i + 1}` : 'Subtitles', rows(t))));
      if (m.links.length) out.push(...section('Links', rows(m.links)));
      if (settings.greetz.trim()) out.push(...section('Notes', [row(''), ...wrap(settings.greetz.trim(), INNER).map(x => row(center(x, INNER))), row('')]));
      out.push(`█${top}█`, bar(settings.footer.trim(), 'end'), `▀█${low.slice(2)}█▀`);
      return out;
    } },
  };

  function renderNfo(model, header) {
    const layout = LAYOUTS[settings.layout] || LAYOUTS[DEFAULTS.layout];
    return layout.render(model, header).map(trimR).join('\n');
  }

  /* ---------- generator entry points ---------- */
  const genCache = new Map(); // ratingKey -> info | {reason}

  /** mediainfo + Plex details from the NFO server. Nothing is written. */
  async function loadGenerator(key, fresh) {
    if (!fresh && genCache.has(key)) return genCache.get(key);
    const { server, error } = await resolveServer();
    if (!server) return { reason: error };
    if (caps.info === false || (!caps.info && !caps.write)) return { reason: 'Update plex-nfo-server.py on the Plex machine to generate NFOs.' };
    const r = await gmRequest({ method: 'GET', url: `${server}/info/${key}${fresh ? '?fresh=1' : ''}`, timeout: 130000 });
    let body = {};
    try { body = JSON.parse(r.text); } catch (_) {}
    let res;
    if (r.status === 200 && body.versions && body.versions.length) res = body;
    else if (r.status === 404 && !body.type && !/not found/.test(body.error || '')) res = { reason: 'Update plex-nfo-server.py on the Plex machine to generate NFOs.' };
    else res = { reason: body.error || `Couldn't read the file's details (${r.status || 'no answer'}).` };
    if (r.status > 0) genCache.set(key, res);
    return res;
  }

  async function generate(info, i) {
    const v = info.versions[i];
    const model = buildModel(info, v);
    const text = settings.asciiText.replace(/\{group\}/gi, model.group || 'NFO')
      .replace(/\{title\}/gi, info.type === 'episode' ? info.show : info.title);
    const layout = LAYOUTS[settings.layout] || LAYOUTS[DEFAULTS.layout];
    const header = text.trim() ? await asciiHeader(text, layout.width) : { lines: [] };
    return { text: renderNfo(model, header), file: model.file, release: model.release, warn: header.warn };
  }

  /* ============================================================
     7. UI
     ============================================================ */
  GM_addStyle(`
    .pnfo-inline{display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;
      height:var(--pnfo-h,40px);min-width:var(--pnfo-h,40px);padding:0 14px;margin-left:8px;flex:0 0 auto;
      border-radius:4px;border:1px solid rgba(255,255,255,.18);background:transparent;
      color:rgba(255,255,255,.75);font:700 12px/1 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.1em;
      cursor:pointer;transition:background .15s,color .15s,border-color .15s;vertical-align:middle}
    .pnfo-inline:hover{background:rgba(255,255,255,.12);color:#fff}
    .pnfo-inline[data-state="ok"]{color:#4cd07d;border-color:rgba(76,208,125,.6);background:rgba(76,208,125,.12)}
    .pnfo-inline[data-state="ok"]:hover{background:#4cd07d;color:#0b1f12}
    .pnfo-inline[data-state="gen"]{color:#f0c419;border-color:rgba(240,196,25,.6);background:rgba(240,196,25,.10)}
    .pnfo-inline[data-state="gen"]:hover{background:#f0c419;color:#1f1800}
    .pnfo-inline[data-state="loading"]{opacity:.5}
    .pnfo-inline[data-state="error"]{color:#e5534b;border-color:rgba(229,83,75,.55)}
    .pnfo-inline.pnfo-float{position:fixed;left:24px;bottom:24px;z-index:99998;margin:0;--pnfo-h:36px;
      background:rgba(18,18,18,.88);backdrop-filter:blur(6px)}
    #pnfo-overlay [hidden],#pnfo-overlay[hidden]{display:none!important}
    #pnfo-overlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.78);display:flex;
      align-items:center;justify-content:center;backdrop-filter:blur(4px)}
    #pnfo-box{max-width:94vw;max-height:92vh;min-width:min(620px,94vw);display:flex;flex-direction:column;background:#0a0a0a;
      border:1px solid #2a2a2a;border-radius:8px;box-shadow:0 24px 70px rgba(0,0,0,.7);overflow:hidden;
      font:13px -apple-system,BlinkMacSystemFont,sans-serif;color:#bbb}
    #pnfo-head{display:flex;gap:8px;align-items:center;padding:9px 12px;border-bottom:1px solid #1f1f1f}
    #pnfo-tabs{display:flex;gap:6px;flex:1;overflow-x:auto;min-width:0}
    #pnfo-actions{display:flex;gap:6px;align-items:center;padding:8px 12px;border-bottom:1px solid #1f1f1f;background:#0f0f0f;flex-wrap:wrap}
    .pnfo-tab,.pnfo-act{background:#161616;border:1px solid #2a2a2a;color:#bbb;border-radius:4px;
      padding:4px 9px;font:12px -apple-system,sans-serif;cursor:pointer;white-space:nowrap}
    .pnfo-tab[aria-selected="true"],.pnfo-act[aria-pressed="true"]{border-color:#e5a00d;color:#e5a00d}
    .pnfo-tab.gen{color:#f0c419}
    .pnfo-tab.gen[aria-selected="true"]{border-color:#f0c419}
    .pnfo-act:hover,.pnfo-tab:hover{color:#fff;border-color:#555}
    .pnfo-act.primary{background:#f0c419;border-color:#f0c419;color:#1f1800;font-weight:600}
    .pnfo-act:disabled{opacity:.4;cursor:default}
    #pnfo-title{font-weight:600;color:#ddd;white-space:nowrap}
    #pnfo-note{font-size:12px;color:#999}
    #pnfo-pre{margin:0;padding:18px 26px;overflow:auto;color:#d6d6d6;white-space:pre;line-height:1.12;
      font-family:"SF Mono",Menlo,"DejaVu Sans Mono",Consolas,monospace;font-variant-ligatures:none;
      tab-size:8;user-select:text}
    #pnfo-msg{padding:22px 26px;line-height:1.5;color:#bbb}
    #pnfo-msg.err{color:#e5534b}
    #pnfo-settings{padding:14px 16px;border-bottom:1px solid #1f1f1f;background:#101010;line-height:1.45;
      max-height:48vh;overflow:auto}
    #pnfo-settings h4{margin:4px 0 6px;font:600 12px -apple-system,sans-serif;color:#ddd;text-transform:uppercase;letter-spacing:.08em}
    #pnfo-settings h4:not(:first-child){margin-top:16px}
    #pnfo-settings .row{display:flex;gap:8px;align-items:center;margin-top:7px;flex-wrap:wrap}
    #pnfo-settings label.k{flex:0 0 120px;color:#999;font-size:12px}
    #pnfo-settings input[type=text],#pnfo-settings select{flex:1;min-width:200px;background:#000;border:1px solid #333;color:#eee;
      border-radius:4px;padding:6px 8px;font:12px "SF Mono",Menlo,monospace}
    #pnfo-settings input[type=checkbox]{accent-color:#f0c419}
    #pnfo-settings .hint{font-size:11.5px;color:#888;margin-top:6px}
    #pnfo-settings code{color:#ccc}
    #pnfo-preview{margin:8px 0 0;padding:8px;background:#000;border:1px solid #222;border-radius:4px;color:#d6d6d6;
      font:9px/1.1 "SF Mono",Menlo,monospace;white-space:pre;overflow:auto;max-height:160px}
    #pnfo-status,#pnfo-fontstatus{font-size:12px}
  `);

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- button next to Plex's ⋯ ---------- */
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pnfo-inline';
  btn.dataset.pyroIgnore = '';   // page-scanning scripts (Custom UI…) leave it alone
  btn.textContent = 'NFO';
  btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open(); });

  const MORE_LABEL = /^(more|more actions|plus|plus d.actions|autres actions|mehr|más|altro)$/i;
  const PLAY_LABEL = /play|next episode|resume|lecture|lire|reprendre|épisode suivant|trailer/i;
  const visible = el => !!el && el.getClientRects().length > 0;
  const inChrome = el => !!el.closest('nav, aside, header, [role="navigation"], [data-testid*="sidebar" i], [class*="sidebar" i], [class*="SideBar" i], [class*="NavBar" i]');
  const iconOnly = el => !/[\p{L}\p{N}]/u.test(el.textContent || '');

  function findMoreButton() {
    const cands = [...document.querySelectorAll('button, [role="button"]')].filter(b =>
      visible(b) && iconOnly(b) && !inChrome(b) &&
      (MORE_LABEL.test((b.getAttribute('aria-label') || b.getAttribute('title') || '').trim()) ||
       /preplay-?more|more-?actions/i.test(b.getAttribute('data-testid') || '')));
    if (!cands.length) return null;
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
      btn.classList.add('pnfo-float');
      btn.style.removeProperty('--pnfo-h');
      document.body.append(btn);
    }
  }

  /* ---------- state ----------
     kind: loading | ok (NFO found, green) | gen (none found, can generate, yellow)
           | none (nothing to show or generate, plain) | error (server unreachable, red) */
  let currentKey = null;
  let state = { kind: 'idle' };
  let tabIndex = 0;          // index in tabList()
  let genResult = null;      // last generated {text, file, release, warn}

  function paintButton() {
    btn.dataset.state = state.kind;
    btn.textContent = state.kind === 'error' ? 'NFO ⚠' : state.kind === 'loading' ? 'NFO…' : 'NFO';
    btn.title = {
      ok: `Show the NFO (${HOTKEY.toUpperCase()})`,
      gen: 'No NFO yet — click to see one generated from mediainfo (nothing is written)',
      none: (state.gen && state.gen.reason) || 'No NFO for this item',
      error: `${state.serverError || 'Error'} — click for details / settings`,
      loading: 'Looking for an NFO…',
    }[state.kind] || '';
  }

  /** Tabs: NFOs found on disk, then one "✨ Generate" tab per version. */
  function tabList() {
    const tabs = (state.files || []).map((f, i) => ({ type: 'file', i, label: (f.label || f.name) + (f.kind === 'kodi' ? ' (Kodi XML)' : '') }));
    const gen = state.gen;
    const verb = (state.files || []).length ? '✨ Regenerate' : '✨ Generate';
    if (state.kind === 'ok' && !gen) tabs.push({ type: 'lazy', i: 0, label: verb });
    if (gen && gen.versions) {
      gen.versions.forEach((v, i) => tabs.push({ type: 'gen', i,
        label: `${verb}${gen.versions.length > 1 && v.label ? ` · ${v.label}` : ''}` }));
    }
    return tabs;
  }

  /* ---------- overlay ---------- */
  const overlay = document.createElement('div');
  overlay.id = 'pnfo-overlay';
  overlay.dataset.pyroIgnore = '';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div id="pnfo-box" role="dialog" aria-label="NFO">
      <div id="pnfo-head">
        <div id="pnfo-tabs"></div>
        <button class="pnfo-act" id="pnfo-copy">Copy</button>
        <button class="pnfo-act" id="pnfo-gear" aria-pressed="false" title="Settings">⚙ Settings</button>
        <button class="pnfo-act" id="pnfo-close" title="Close (Esc)">✕</button>
      </div>
      <div id="pnfo-settings" hidden>
        <h4>NFO server</h4>
        <div class="row">In use: <code id="pnfo-inuse">—</code> <span id="pnfo-status"></span></div>
        <div class="row">
          <input type="text" id="pnfo-remote" spellcheck="false" autocomplete="off" placeholder="http://100.x.y.z:${NFO_PORT}">
          <button class="pnfo-act primary" id="pnfo-save">Save &amp; retry</button>
          <button class="pnfo-act" id="pnfo-test">Test</button>
        </div>
        <div class="hint">At home the server is found automatically from your Plex connection. The address above is used when
          that fails (away from home), e.g. the Plex machine's Tailscale IP from <code>tailscale ip -4</code>. Saved in this browser only.</div>

        <h4>NFO generator</h4>
        <div class="row"><label class="k" for="pnfo-g-layout">Layout</label><select id="pnfo-g-layout" data-k="layout">${Object.entries(LAYOUTS).map(([k, l]) => `<option value="${k}">${esc(l.name)}</option>`).join('')}</select></div>
        <div class="row"><label class="k" for="pnfo-g-text">ASCII text</label><input type="text" id="pnfo-g-text" data-k="asciiText" placeholder="optional — empty = no ASCII header"></div>
        <div class="row"><label class="k" for="pnfo-g-font">Font</label><select id="pnfo-g-font" data-k="font">${FONTS.map(f => `<option>${esc(f)}</option>`).join('')}</select></div>
        <div class="row"><label class="k" for="pnfo-g-url">Custom font URL</label><input type="text" id="pnfo-g-url" data-k="fontUrl" placeholder="https://…/MyFont.flf (optional, overrides the list)"></div>
        <div class="row"><label class="k" for="pnfo-g-spacing">Letter spacing</label>
          <select id="pnfo-g-spacing" data-k="spacing"><option value="full">Spaced (as drawn)</option><option value="fitted">Packed (figlet -k)</option></select></div>
        <div class="row"><label class="k" for="pnfo-g-sub">Line under it</label><input type="text" id="pnfo-g-sub" data-k="subtitle" placeholder="optional"></div>
        <div class="row"><label class="k" for="pnfo-g-greetz">Notes / greetz</label><input type="text" id="pnfo-g-greetz" data-k="greetz" placeholder="optional — adds a Notes section"></div>
        <div class="row"><label class="k" for="pnfo-g-footer">Footer</label><input type="text" id="pnfo-g-footer" data-k="footer" placeholder="optional — closing line"></div>
        <div class="row"><label><input type="checkbox" id="pnfo-g-scene" data-k="sceneLabels"> Scene-style labels (RESOLUTiON, AUDiO…)</label>
          <button class="pnfo-act" id="pnfo-g-reset" style="margin-left:auto">Reset generator</button></div>
        <div class="hint"><code>{title}</code> = film / show title, <code>{group}</code> = the release group from the file name. Fonts: any
          <a href="https://patorjk.com/software/taag/" target="_blank" rel="noopener" style="color:#ccc">FIGlet font</a>,
          downloaded once and cached. <span id="pnfo-fontstatus"></span></div>
        <pre id="pnfo-preview"></pre>
      </div>
      <div id="pnfo-actions" hidden>
        <button class="pnfo-act primary" id="pnfo-dl">⬇ Download .nfo</button>
        <button class="pnfo-act" id="pnfo-write">💾 Create the local .nfo file…</button>
        <select class="pnfo-act" id="pnfo-layout-quick" title="Layout">${Object.entries(LAYOUTS).map(([k, l]) => `<option value="${k}">${esc(l.name)}</option>`).join('')}</select>
        <button class="pnfo-act" id="pnfo-rerun" title="Read the video file again with mediainfo">↻ Re-run mediainfo</button>
        <span id="pnfo-note"></span>
      </div>
      <div id="pnfo-msg" hidden></div>
      <pre id="pnfo-pre" hidden></pre>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.body.append(overlay);

  const $ = sel => overlay.querySelector(sel);
  const pre = $('#pnfo-pre'), msg = $('#pnfo-msg'), settingsBox = $('#pnfo-settings'), gear = $('#pnfo-gear');
  const actions = $('#pnfo-actions'), note = $('#pnfo-note');

  $('#pnfo-close').addEventListener('click', close);
  $('#pnfo-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(pre.textContent).then(() => {
      $('#pnfo-copy').textContent = 'Copied';
      setTimeout(() => { $('#pnfo-copy').textContent = 'Copy'; }, 1200);
    });
  });
  gear.addEventListener('click', () => toggleSettings(settingsBox.hidden));

  /* ---------- settings panel ---------- */
  $('#pnfo-save').addEventListener('click', async () => {
    store.set('nfoServer', $('#pnfo-remote').value.trim());
    chosen = null; nfoCache.clear();
    await refresh(true);
  });
  $('#pnfo-test').addEventListener('click', async () => {
    chosen = null;
    const saved = store.get('nfoServer', '');
    store.set('nfoServer', $('#pnfo-remote').value.trim());   // test what's typed…
    setStatus('testing…');
    const r = await resolveServer();
    store.set('nfoServer', saved);                             // …without saving it
    chosen = null;
    setStatus(r.server ? `✅ reachable: ${r.server}${caps.info ? (caps.mediainfo === false ? ' — ⚠ mediainfo not installed there' : '') : ' (old version: reading only)'}` : `❌ ${r.error}`);
  });

  let previewTimer = null;
  overlay.querySelectorAll('[data-k]').forEach(el => {
    const ev = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      settings[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
      saveSettings();
      clearTimeout(previewTimer);
      previewTimer = setTimeout(updatePreview, 250);
    });
  });
  $('#pnfo-g-reset').addEventListener('click', () => {
    settings = Object.assign({}, DEFAULTS);
    saveSettings(); fillSettings(); updatePreview();
  });

  function fillSettings() {
    $('#pnfo-remote').value = store.get('nfoServer', '') || '';
    $('#pnfo-inuse').textContent = chosen || 'none yet';
    overlay.querySelectorAll('[data-k]').forEach(el => {
      const v = settings[el.dataset.k];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    });
  }

  async function updatePreview() {
    const group = (genResult && (genResult.release.match(/-([A-Za-z0-9]+)$/) || [])[1]) || 'PYRO';
    const title = state.gen && state.gen.title ? (state.gen.show || state.gen.title) : 'Title';
    const h = await asciiHeader(settings.asciiText.replace(/\{group\}/gi, group).replace(/\{title\}/gi, title));
    $('#pnfo-preview').textContent = [...h.lines, '', settings.subtitle ? `(${settings.subtitle})` : ''].join('\n').replace(/\s+$/, '');
    $('#pnfo-fontstatus').textContent = h.warn ? `⚠ ${h.warn}` : '';
    const t = tabList()[tabIndex];
    if (!overlay.hidden && t && t.type === 'gen') showTab(tabIndex);   // live update of the generated NFO
  }

  function setStatus(t) { $('#pnfo-status').textContent = t; }
  function toggleSettings(on) {
    settingsBox.hidden = !on;
    gear.setAttribute('aria-pressed', String(on));
    if (on) { fillSettings(); setStatus(''); updatePreview(); }
  }

  /* ---------- showing tabs ---------- */
  function fitFont(text) {
    const cols = Math.max(40, ...text.split('\n').map(l => [...l].length));
    const avail = window.innerWidth * 0.94 - 56;
    pre.style.fontSize = Math.max(7, Math.min(15, avail / (cols * 0.602))).toFixed(2) + 'px';
  }

  function showText(text) {
    pre.hidden = false; msg.hidden = true;
    pre.textContent = text.replace(/\s+$/, '');
    fitFont(text);
  }

  function showMessage(text, isErr) {
    pre.hidden = true; msg.hidden = false;
    msg.className = isErr ? 'err' : '';
    msg.textContent = text;
  }

  let showSeq = 0;
  async function showTab(i) {
    const tabs = tabList();
    tabIndex = i;
    overlay.querySelectorAll('.pnfo-tab').forEach((t, j) => t.setAttribute('aria-selected', String(i === j)));
    const t = tabs[i];
    actions.hidden = !t || t.type !== 'gen';
    $('#pnfo-copy').hidden = !t;
    if (!t) return;
    if (t.type === 'file') { showText(state.files[t.i].text); pre.scrollTop = 0; return; }
    const seq = ++showSeq;
    if (t.type === 'lazy') {                          // NFO exists: read the file only if asked
      actions.hidden = true;
      showMessage('Reading the file with mediainfo…');
      const key = currentKey, gen = await loadGenerator(key);
      if (seq !== showSeq || key !== currentKey) return;
      if (!gen.versions) { showMessage(gen.reason || 'Nothing to generate.', true); return; }
      state.gen = gen;
      tabIndex = (state.files || []).length;
      render();
      return;
    }
    if (!genResult) showMessage('Generating…');
    const r = await generate(state.gen, t.i);
    if (seq !== showSeq) return;
    genResult = Object.assign(r, { index: t.i });
    const keep = pre.scrollTop;
    showText(r.text);
    pre.scrollTop = keep;
    const target = `${r.release}.nfo`;
    const replacing = (state.files || []).some(f => f.name === target);
    $('#pnfo-write').textContent = replacing ? '♻ Replace the local .nfo with this one…' : '💾 Create the local .nfo file…';
    $('#pnfo-layout-quick').value = settings.layout;
    $('#pnfo-write').disabled = !(chosen && caps.write);
    $('#pnfo-write').title = chosen && caps.write ? `Asks first, then writes ${r.release}.nfo next to ${r.file} on the Plex machine`
      : 'Your plex-nfo-server.py is read-only — update it to create files';
    note.textContent = r.warn ? `⚠ ${r.warn}` : 'Preview only — nothing is written until you click Create.';
  }

  function render() {
    const tabsEl = $('#pnfo-tabs');
    tabsEl.textContent = '';
    const tabs = tabList();
    if (!tabs.length) {
      actions.hidden = true;
      $('#pnfo-copy').hidden = true;
      const title = document.createElement('span');
      title.id = 'pnfo-title';
      title.textContent = 'NFO';
      tabsEl.append(title);
      const reason = state.gen && state.gen.reason;
      if (state.kind === 'loading') showMessage('Looking for an NFO…');
      else if (state.kind === 'error') { showMessage(`${state.serverError}${reason ? `\n\n${reason}` : ''}`, true); toggleSettings(true); }
      else showMessage(`No NFO found for this item.${reason ? `\n\n${reason}` : ''}`);
      return;
    }
    tabs.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'pnfo-tab' + (t.type === 'gen' ? ' gen' : '');
      b.textContent = t.label;
      b.addEventListener('click', () => { genResult = null; showTab(i); });
      tabsEl.append(b);
    });
    showTab(Math.min(tabIndex, tabs.length - 1));
  }

  function open() {
    overlay.hidden = false;
    tabIndex = 0;
    genResult = null;
    toggleSettings(state.kind === 'error');
    render();
  }
  function close() { overlay.hidden = true; }

  /* ---------- layout switch / re-run ---------- */
  $('#pnfo-layout-quick').addEventListener('change', e => {
    settings.layout = e.target.value; saveSettings();
    const sel = $('#pnfo-g-layout'); if (sel) sel.value = settings.layout;
    showTab(tabIndex);
  });
  $('#pnfo-rerun').addEventListener('click', async () => {
    const key = currentKey, b = $('#pnfo-rerun');
    b.disabled = true; note.textContent = 'Reading the file again…';
    const gen = await loadGenerator(key, true);
    b.disabled = false;
    if (key !== currentKey) return;
    if (!gen.versions) { note.textContent = `❌ ${gen.reason}`; return; }
    state.gen = gen; genResult = null;
    render();
  });

  /* ---------- download / save ---------- */
  $('#pnfo-dl').addEventListener('click', () => {
    if (!genResult) return;
    const blob = new Blob([genResult.text.replace(/\n/g, '\r\n') + '\r\n'], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${genResult.release}.nfo`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  });

  $('#pnfo-write').addEventListener('click', async () => {
    if (!genResult || !currentKey) return;
    const b = $('#pnfo-write');
    const target = `${genResult.release}.nfo`;
    const replacing = (state.files || []).some(f => f.name === target);
    const question = replacing
      ? `Replace the existing "${target}" with this generated NFO?\n\nThe current file will be overwritten.`
      : `Create "${target}" next to "${genResult.file}" on the Plex machine?`;
    if (!confirm(question)) { note.textContent = 'Nothing was written.'; return; }
    b.disabled = true; note.textContent = 'Writing…';
    let r = await saveNfo(currentKey, genResult.file, genResult.text + '\n', replacing);
    if (r.exists) {
      if (!confirm(`"${r.name}" already exists next to the video. Replace it?`)) { b.disabled = false; note.textContent = 'Nothing was written.'; return; }
      r = await saveNfo(currentKey, genResult.file, genResult.text + '\n', true);
    }
    b.disabled = false;
    if (!r.ok) { note.textContent = `❌ ${r.error}`; return; }
    note.textContent = `✅ Created ${r.name}`;
    nfoCache.delete(currentKey);
    await refresh(true);
    tabIndex = 0; render();                          // show the saved file (button is now green)
  });

  /* ============================================================
     8. ROUTING
     ============================================================ */
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
    const srv = await fetchNfo(key);
    const files = (srv && srv.files) || [];
    const gen = !files.length && !srv.error ? await loadGenerator(key) : null;
    if (currentKey !== key) return;                  // navigated away meanwhile
    state = {
      files, gen, serverError: srv.error,
      kind: files.length ? 'ok' : srv.error ? 'error' : gen && gen.versions ? 'gen' : 'none',
    };
    paintButton();
    if (!overlay.hidden) render();
    if (!settingsBox.hidden) $('#pnfo-inuse').textContent = chosen || 'none';
  }
  const onRoute = () => refresh(false);

  GM_registerMenuCommand('NFO settings…', () => { open(); toggleSettings(true); });

  window.addEventListener('hashchange', onRoute);
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) { lastHref = location.href; onRoute(); }
    if (currentKey) placeButton();                    // Plex re-renders its page: keep the button in place
  }, 700);
  onRoute();

  window.addEventListener('resize', () => { if (!overlay.hidden && !pre.hidden) fitFont(pre.textContent); });

  document.addEventListener('keydown', e => {
    if (!overlay.hidden && e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
    const el = e.target;
    const typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.toLowerCase() === HOTKEY && currentKey) {
      e.stopPropagation(); e.preventDefault();
      overlay.hidden ? open() : close();
    }
  }, true);
})();
