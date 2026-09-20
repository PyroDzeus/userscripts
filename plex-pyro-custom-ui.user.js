// ==UserScript==
// @name         Plex Pyro Custom UI 🔥
// @namespace    plex-pyro-custom-ui
// @version      1.3
// @author       Pyro
// @description  Theme Park themes + stable top bar + guaranteed custom logo + flags + Blu-ray/DVD/LaserDisc/4K UHD/WEB badges
// @match        https://app.plex.tv/*
// @match        http://*/web/*
// @match        https://*/web/*
// @match        http://127.0.0.1:32400/*
// @match        http://localhost:32400/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @downloadURL  https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-pyro-custom-ui.user.js
// @updateURL    https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-pyro-custom-ui.user.js
// ==/UserScript==

(function () {
  "use strict";

  // The @match lines are broad (Plex can be opened from any address), so make
  // sure this really is Plex Web before theming anything.
  const isPlex = /(^|\.)plex\.(tv|direct)$/.test(location.hostname) ||
                 location.port === "32400" || /plex/i.test(document.title);
  if (!isPlex) return;


/* ============================================================
   THEME SWITCH (CHANGE ONLY THIS)
   ============================================================ */

const THEME_NAME = "spacegray";
// aquamarine | dark | dracula | hotline | hotpink
// organizr | overseerr | spacegray | plex | nord | maroon

const THEMES = {
  aquamarine:   "https://theme-park.dev/css/base/plex/aquamarine.css",
  dark:         "https://theme-park.dev/css/base/plex/dark.css",
  dracula:      "https://theme-park.dev/css/base/plex/dracula.css",
  hotline:      "https://theme-park.dev/css/base/plex/hotline.css",
  hotpink:      "https://theme-park.dev/css/base/plex/hotpink.css",
  organizr:     "https://theme-park.dev/css/base/plex/organizr.css",
  overseerr:    "https://theme-park.dev/css/base/plex/overseerr.css",
  spacegray:    "https://theme-park.dev/css/base/plex/space-gray.css",
  plex:         "https://theme-park.dev/css/base/plex/plex.css",
  nord:         "https://theme-park.dev/css/base/plex/nord.css",
  maroon:       "https://theme-park.dev/css/base/plex/maroon.css"
};


/* ============================================================
   CUSTOM LOGO (CHANGE ONLY THE LINK)
   ============================================================ */

const CUSTOM_LOGO_URL =
  "https://media.discordapp.net/attachments/1452959865915047973/1455672798583324835/LHF_BLUE.png?ex=69559470&is=695442f0&hm=7b80e04f81c5831665abefd9624157d013b23bddcbec6c678962a0babe829c63&=&format=webp&quality=lossless&width=1578&height=1578";


/* ============================================================
   LOGO MODIFIABLE (URL ou fichier local)
   ============================================================ */

(function () {
  const LOGO_KEY   = "pyroLogoUrl";
  const LOGO_WIDTH = "110px";   // l'addon force 40px : à ajuster selon ton image

  let logoStyle = null;

  function applyLogo(url) {
    if (!logoStyle) {
      logoStyle = document.createElement("style");
      logoStyle.id = "pyro-logo-override";
      document.head.appendChild(logoStyle);
    }
    logoStyle.textContent = url
      ? `[class*="NavBar-logoContainer-"]{
           background-image:url("${url}") !important;
           background-size:contain !important;
           background-position:50% !important;
           background-repeat:no-repeat !important;
           width:${LOGO_WIDTH} !important;
         }
         [class*="NavBar-logoContainer-"] svg{display:none !important;}`
      : "";
    GM_setValue(LOGO_KEY, url || "");
  }

  function pickFile() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.style.display = "none";
    inp.addEventListener("change", () => {
      const f = inp.files && inp.files[0];
      if (f) {
        const r = new FileReader();
        r.onload = () => applyLogo(r.result);   // data:image/png;base64,...
        r.readAsDataURL(f);
      }
      inp.remove();
    });
    document.body.appendChild(inp);
    inp.click();
  }

  function build() {
    if (document.getElementById("pyro-logo-bar")) return;

    const bar = document.createElement("div");
    bar.id = "pyro-logo-bar";
    bar.style.cssText =
      "position:fixed;bottom:14px;left:120px;z-index:999999;display:flex;gap:6px;";

    const style =
      "background:#1c1c1c;color:#eee;border:1px solid #444;border-radius:6px;" +
      "padding:4px 8px;font:600 12px -apple-system,Helvetica,Arial,sans-serif;" +
      "cursor:pointer;outline:none;opacity:.3;transition:opacity .15s;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.4);";

    [["logo URL", () => {
        const url = prompt("URL de l'image (vide = logo du thème) :",
                           GM_getValue(LOGO_KEY, CUSTOM_LOGO_URL));
        if (url !== null) applyLogo(url.trim());
      }],
     ["logo 📁", pickFile]
    ].forEach(([label, fn]) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = style;
      b.addEventListener("mouseenter", () => (b.style.opacity = "1"));
      b.addEventListener("mouseleave", () => (b.style.opacity = ".3"));
      b.addEventListener("click", fn);
      bar.appendChild(b);
    });

    document.body.appendChild(bar);
  }

  applyLogo(GM_getValue(LOGO_KEY, CUSTOM_LOGO_URL));

  if (document.body) build();
  else window.addEventListener("DOMContentLoaded", build);
})();


/* ============================================================
   DISC ICONS
   ============================================================ */

const BLURAY_ICON    = "https://upload.wikimedia.org/wikipedia/commons/8/8c/Blu_ray_logo.png";
const DVD_ICON       = "https://upload.wikimedia.org/wikipedia/commons/8/85/Dvd_logo.svg";
const LASERDISC_ICON = "https://upload.wikimedia.org/wikipedia/commons/3/3b/LaserDisc_logo.svg";
const WEB_ICON = "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Icon_Download_White.svg/500px-Icon_Download_White.svg.png";

// Official Ultra HD Blu-ray logo. It's blue in the source file —
// it gets recolored to white by the .plex-disc-uhd CSS filter below.
const UHD_ICON =
  "https://upload.wikimedia.org/wikipedia/en/thumb/2/21/Ultra_HD_Blu-ray_%28logo%29.svg/512px-Ultra_HD_Blu-ray_%28logo%29.svg.png";

// Fallback if the 512px thumbnail isn't served (used automatically on error)
const UHD_ICON_FALLBACK =
  "https://thumb.wikimedia.org/wikipedia/en/thumb/2/21/Ultra_HD_Blu-ray_%28logo%29.svg/3840px-Ultra_HD_Blu-ray_%28logo%29.svg.png";


/* ============================================================
   THEME PARK ADDONS
   ============================================================ */

const ADDONS = [
  "https://theme-park.dev/css/addons/plex/overseerr-side-menu/overseerr-side-menu.css",
  "https://theme-park.dev/css/addons/plex/plex-alt-logo/plex-alt-logo.css"
];

const themeUrl = THEMES[THEME_NAME] || THEMES.overseerr;


/* ============================================================
   CSS INJECTION (safe)
   ============================================================ */

GM_addStyle(`
@import url("${themeUrl}");
@import url("${ADDONS[0]}");
@import url("${ADDONS[1]}");

/* Our injected logo image */
.plex-custom-logo-img {
  height: 32px !important;
  width: auto !important;
  max-width: 180px !important;
  object-fit: contain !important;
  display: block !important;
  opacity: 1 !important;
  visibility: visible !important;
  z-index: 99999 !important;
}

/* Flags */
.plex-audio-flag {
  margin-left: .35em;
  display: inline-block;
  transform: translateY(1px);
}

/* Disc badges */
.plex-disc-badge {
  margin-left: .45em;
  height: 14px;
  width: auto;
  vertical-align: middle;
  opacity: .92;
}

/* 4K UHD badge — recolored from blue to white */
.plex-disc-uhd {
  height: 18px;
  opacity: .95;
  filter: brightness(0) invert(1);
}

/* Added icons: never selectable / copied */
.plex-audio-flag, .plex-disc-badge { user-select: none; -webkit-user-select: none; }

/* WEB icon = yellow */
.plex-disc-web {
  filter: brightness(1.2) sepia(1) saturate(6) hue-rotate(15deg);
}
`);


/* ============================================================
   THEME SWITCHER (ADD-ON — ne touche à rien au-dessus)
   ============================================================ */

(function () {
  const STORE_KEY = "pyroThemeOverride";
  let overrideStyle = null;

  // applique un thème PAR-DESSUS le GM_addStyle (même @import, donc partout)
  function applyOverride(name) {
    if (!THEMES[name]) return;
    if (!overrideStyle) {
      overrideStyle = document.createElement("style");
      overrideStyle.id = "pyro-theme-override";
      document.head.appendChild(overrideStyle); // après GM_addStyle => priorité
    }
    overrideStyle.textContent = `@import url("${THEMES[name]}");`;
    GM_setValue(STORE_KEY, name);
  }

  function build() {
    if (document.getElementById("pyro-theme-switcher")) return;

    const sel = document.createElement("select");
    sel.id = "pyro-theme-switcher";
    sel.style.cssText =
      "position:fixed;bottom:14px;left:14px;z-index:999999;" +
      "background:#1c1c1c;color:#eee;border:1px solid #444;border-radius:6px;" +
      "padding:4px 8px;font:600 12px -apple-system,Helvetica,Arial,sans-serif;" +
      "cursor:pointer;outline:none;opacity:.3;transition:opacity .15s;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.4);";
    sel.addEventListener("mouseenter", () => (sel.style.opacity = "1"));
    sel.addEventListener("mouseleave", () => (sel.style.opacity = ".3"));

    const current = GM_getValue(STORE_KEY, null) || THEME_NAME;
    Object.keys(THEMES).forEach(name => {
      const o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      if (name === current) o.selected = true;
      sel.appendChild(o);
    });

    sel.addEventListener("change", () => applyOverride(sel.value));
    document.body.appendChild(sel);
  }

  // recharge le thème mémorisé (sinon le défaut du GM_addStyle reste)
  const saved = GM_getValue(STORE_KEY, null);
  if (saved && saved !== THEME_NAME) applyOverride(saved);

  if (document.body) build();
  else window.addEventListener("DOMContentLoaded", build);
})();


/* ============================================================
   FLAGS + DISC BADGES — one shared, throttled scanner
   ------------------------------------------------------------
   · Never touches other scripts' panels (NFO Viewer, Awards,
     Sidekick, Wheel…), text fields or preformatted text:
     anything inside IGNORE is skipped. Other scripts can opt
     out too by adding a data-pyro-ignore attribute.
   · Added icons are not selectable and have no alt text, so
     copying text from Plex never picks up "🇫🇷uhdweb".
   ============================================================ */

(function () {
  const IGNORE = [
    "[data-pyro-ignore]",
    "#pnfo-overlay", ".pnfo-inline",            // Plex NFO Viewer
    "#paw-card",                                // Plex Awards
    "#psk-col", "#psk-panel",                   // Plex Sidekick
    "#pwh-host", "#pwh-btn",                    // Plex Wheel
    "#pyro-logo-bar", "#pyro-theme-switcher",   // this script's own controls
    "pre", "code", "textarea", "input", "select", "script", "style", "[contenteditable]"
  ].join(",");

  /* ---------- audio language flags (same rules as before) ---------- */
  const FLAGS = {
    // Major
    english:"🇺🇸", french:"🇫🇷", german:"🇩🇪", spanish:"🇪🇸",
    italian:"🇮🇹", japanese:"🇯🇵", chinese:"🇨🇳", korean:"🇰🇷",
    russian:"🇷🇺", portuguese:"🇵🇹", brazilian:"🇧🇷",
    // Europe
    dutch:"🇳🇱", belgian:"🇧🇪", swedish:"🇸🇪", norwegian:"🇳🇴",
    danish:"🇩🇰", finnish:"🇫🇮", polish:"🇵🇱", czech:"🇨🇿",
    slovak:"🇸🇰", hungarian:"🇭🇺", romanian:"🇷🇴",
    bulgarian:"🇧🇬", croatian:"🇭🇷", serbian:"🇷🇸",
    slovenian:"🇸🇮", estonian:"🇪🇪", latvian:"🇱🇻",
    lithuanian:"🇱🇹", greek:"🇬🇷", ukrainian:"🇺🇦",
    icelandic:"🇮🇸", irish:"🇮🇪", welsh:"🏴",
    scottish:"🏴", basque:"🇪🇸", catalan:"🇪🇸",
    // Middle East
    arabic:"🇸🇦", hebrew:"🇮🇱", persian:"🇮🇷", kurdish:"🇹🇷",
    // Asia
    hindi:"🇮🇳", tamil:"🇮🇳", telugu:"🇮🇳", bengali:"🇧🇩",
    thai:"🇹🇭", vietnamese:"🇻🇳", indonesian:"🇮🇩",
    malay:"🇲🇾", filipino:"🇵🇭", tagalog:"🇵🇭",
    urdu:"🇵🇰", nepali:"🇳🇵", sinhala:"🇱🇰",
    burmese:"🇲🇲", khmer:"🇰🇭", lao:"🇱🇦",
    mongolian:"🇲🇳",
    // Africa
    swahili:"🇰🇪", zulu:"🇿🇦", afrikaans:"🇿🇦",
    amharic:"🇪🇹", hausa:"🇳🇬", yoruba:"🇳🇬",
    // Americas
    quechua:"🇵🇪", guarani:"🇵🇾",
    // Other / misc
    esperanto:"🌍", latin:"🏛️"
  };
  const LANG_RE = new RegExp("\\b(" + Object.keys(FLAGS).join("|") + ")\\b", "i");

  // Row-ish container, so a VFQ elsewhere on the page doesn't affect this item.
  function rowOf(el) {
    let cur = el;
    for (let i = 0; i < 10 && cur; i++, cur = cur.parentElement) {
      const role = cur.getAttribute && cur.getAttribute("role");
      const cls = (cur.className || "").toString();
      if (cur.tagName === "LI" || role === "menuitem" || role === "option" ||
          /MenuItem|AudioStreamsMenu|Subtitle|Stream/.test(cls)) return cur;
    }
    return el.closest("li,[role='menuitem'],[role='option']") || el;
  }

  function flagFor(langKey, row) {
    const key = langKey.toLowerCase();
    if (key === "french") {
      const ctx = [row.textContent, row.getAttribute("aria-label"), row.getAttribute("title")].join(" ").toUpperCase();
      return /\bVFQ\b/.test(ctx) ? "🇨🇦" : "🇫🇷";   // VFQ => 🇨🇦, VFF / default => 🇫🇷
    }
    return FLAGS[key] || null;
  }

  /* ---------- disc / source badges ---------- */
  // Physical-disc sources. "remux" is always disc-sourced.
  const BLURAY = /\b(bd|bdrip|bdremux|blu[\s\-]?ray|remux)\b/i;
  const DVD    = /\b(dvd|dvdrip|dvd[\s\-]?rip|dvd5|dvd9)\b/i;
  const LD     = /\b(laser[\s\-]?disc|ld)\b/i;
  // WEB sources: WEB-DL / WEBRip in any case, bare "WEB" only in capitals
  // (release style), so "Plex Web" in the interface is never badged.
  const WEB_ANY  = /\bweb[\s\-_.]?(dl|rip)\b/i;
  const WEB_BARE = /(^|[\s._\-(\[])WEB([\s._\-)\]]|$)/;
  const RES4K  = /\b(2160p|4k|uhd)\b/i;

  const isWeb = t => WEB_ANY.test(t) || WEB_BARE.test(t);

  function addBadge(p, cls, src) {
    if (p.querySelector(".plex-disc-" + cls)) return;
    const i = document.createElement("img");
    i.className = "plex-disc-badge plex-disc-" + cls;
    i.src = src;
    i.alt = "";                                // nothing ends up in copied text
    i.title = { uhd: "4K UHD Blu-ray", bluray: "Blu-ray", dvd: "DVD", laserdisc: "LaserDisc", web: "WEB" }[cls];
    i.draggable = false;
    i.referrerPolicy = "no-referrer";
    if (cls === "uhd") i.onerror = () => { i.onerror = null; i.src = UHD_ICON_FALLBACK; };
    p.appendChild(i);
  }

  function badges(t, p) {
    const web = isWeb(t);
    const disc = BLURAY.test(t) && !web;       // a WEB release is never a disc
    // 4K UHD Blu-ray ONLY for a 4K disc source. 4K/HDR alone (e.g. a 2160p
    // WEB-DL, or Plex's "4K HDR10" version label) says nothing about the source.
    if (disc && RES4K.test(t)) addBadge(p, "uhd", UHD_ICON);
    else if (disc)             addBadge(p, "bluray", BLURAY_ICON);
    if (DVD.test(t) && !web)   addBadge(p, "dvd", DVD_ICON);
    if (LD.test(t) && !web)    addBadge(p, "laserdisc", LASERDISC_ICON);
    if (web)                   addBadge(p, "web", WEB_ICON);
  }

  function flags(t, p) {
    if (p.querySelector(".plex-audio-flag")) return;
    const m = t.match(LANG_RE);
    if (!m) return;
    const flag = flagFor(m[1], rowOf(p));
    if (!flag) return;
    const span = document.createElement("span");
    span.className = "plex-audio-flag";
    span.setAttribute("aria-hidden", "true");
    span.textContent = flag;
    p.appendChild(span);
  }

  /* ---------- one walk for both, skipping ignored subtrees ---------- */
  function scan() {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1) {
          return n.matches(IGNORE) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const todo = [];
    let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue && n.nodeValue.trim();
      const p = n.parentElement;
      // don't append into deep structures (that's what used to break layouts)
      if (t && p && p.children.length <= 3) todo.push([t, p]);
    }
    for (const [t, p] of todo) { flags(t, p); badges(t, p); }  // modify after walking
  }

  // Plex mutates the DOM constantly: batch rescans instead of one per mutation.
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; scan(); }, 250);
  };

  scan();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
})();
