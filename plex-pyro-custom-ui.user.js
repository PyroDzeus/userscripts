// ==UserScript==
// @name         Plex Pyro Custom UI 🔥
// @namespace    plex-pyro-custom-ui
// @version      1.5
// @author       Pyro
// @description  Theme Park themes + stable top bar + guaranteed custom logo + flags + Blu-ray/DVD/LaserDisc/4K UHD/WEB badges + studio logos
// @match        https://app.plex.tv/*
// @match        http://*/web/*
// @match        https://*/web/*
// @match        http://127.0.0.1:32400/*
// @match        http://localhost:32400/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      en.wikipedia.org
// @connect      www.wikidata.org
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


/* ============================================================
   STUDIO LOGO — movie pages only (not in library grids)
   ------------------------------------------------------------
   · Reads the movie's studio from your Plex server.
   · A few logos are built in (Simple Icons, CC0). The others
     come from Wikipedia / Wikidata the first time a studio is
     seen, then they're cached in your browser. Studios that
     aren't in the list below just show their name.
   ============================================================ */

(function () {
  const BOX_ID = "pyro-studio";
  const PANEL_ID = "pyro-studio-panel";
  const CACHE_KEY = "pyroStudioLogos";
  const WEEK = 7 * 864e5;

  // Built-in logos (Simple Icons v16, CC0): 24×24 paths.
  const SI = {
    sony: 'M8.5505 9.8881c.921 0 1.6574.2303 2.2209.7423.3848.3485.5999.8454.5939 1.3665a1.9081 1.9081 0 0 1-.5939 1.3726c-.5272.4848-1.3483.7423-2.221.7423-.8725 0-1.6785-.2575-2.2148-.7423-.3908-.3485-.609-.8484-.603-1.3726 0-.518.2182-1.015.603-1.3665.5-.4545 1.3847-.7423 2.2149-.7423zm.003 3.6692c.4606 0 .8878-.1606 1.1878-.4575.2999-.2999.4332-.6605.4332-1.1029 0-.4242-.1484-.821-.4333-1.1029-.2938-.2908-.7332-.4545-1.1877-.4545s-.8938.1637-1.1907.4545c-.2848.2818-.4333.6787-.4333 1.103-.006.409.1485.806.4333 1.1029.2969.2939.7332.4575 1.1907.4575zm-4.8418-1.9665c.1605.0424.315.094.4666.1636a1.352 1.352 0 0 1 .3787.2576c.197.206.309.4817.306.7665a.9643.9643 0 0 1-.3787.7788 2.0662 2.0662 0 0 1-.709.3485 3.7231 3.7231 0 0 1-1.1938.1697c-.352 0-.5467-.0406-.8138-.0962l-.077-.016c-.294-.0666-.5817-.1575-.8575-.2787a.0695.0695 0 0 0-.0424-.0121c-.0454 0-.0818.0394-.0818.0848v.203H.1212v-1.4786h.5242a.7559.7559 0 0 0 .1363.418c.2121.2607.4394.3607.6575.4395.3666.1212.7514.1848 1.1362.1969.5526 0 .8756-.134.9455-.163l.009-.0037.0062-.0023c.0616-.0226.3119-.1143.3119-.3916 0-.2743-.2338-.334-.387-.373l-.022-.0058c-.1708-.046-.562-.0872-.9897-.1323l-.1526-.016c-.4848-.0515-.9696-.1273-1.1968-.1758-.4977-.1097-.6942-.2917-.816-.4045l-.0082-.0076A1.0192 1.0192 0 0 1 0 11.1608c0-.497.3394-.797.7575-.9817.4454-.2.9756-.288 1.4392-.288.8211.0031 1.4877.2697 1.727.394.097.0515.1455-.0121.1455-.0606v-.1484h.5272v1.2876h-.4727a.9056.9056 0 0 0-.2939-.4909 1.289 1.289 0 0 0-.297-.1787c-.3968-.1667-.821-.2515-1.2513-.2455-.4423 0-.8665.085-1.0786.2153-.1333.0818-.2.1848-.2.306 0 .1727.1454.2424.2182.2636.1967.0597.6328.103.972.1369.0736.0073.1426.0142.2036.0206.3272.0334 1.012.1243 1.315.2zm18.1673-.9966v-.4787H24v.4696h-.4757c-.1727 0-.2424.0334-.3727.1788l-1.4271 1.63a.098.098 0 0 0-.0182.0698v.7423a1.106 1.106 0 0 0 .0121.103.1496.1496 0 0 0 .1.0909.9368.9368 0 0 0 .1303.009h.4848v.4698h-2.5724v-.4697h.4606a.9343.9343 0 0 0 .1302-.0091.1627.1627 0 0 0 .1031-.091.5626.5626 0 0 0 .009-.1v-.7422c0-.0242 0-.0242-.0333-.0636a606.7592 606.7592 0 0 0-1.4119-1.6028c-.0758-.0788-.2061-.2061-.406-.2061h-.4576v-.4696h2.5876v.4696h-.3121c-.0697 0-.1182.0697-.0576.1455 0 0 .8696 1.0392.8787 1.0513.0091.0122.0152.0122.0273.003.0121-.009.8938-1.0453.8999-1.0543a.0912.0912 0 0 0-.0182-.1273.1095.1095 0 0 0-.0606-.0182zm-6.284-.0031h.4848c.2212 0 .2606.0848.2636.2909l.0273 1.5664-2.5815-2.324H11.944v.4697h.412c.297 0 .3182.1636.3182.309v2.2138c.0004.1285.0009.295-.1818.295h-.506v.4667h2.1634v-.4697h-.5273c-.212 0-.2211-.097-.2242-.303v-1.8816l2.9724 2.6511h.7575l-.0394-2.9966c.003-.218.0182-.2908.2424-.2908h.4726v-.4697H15.595Z',
    hbo: 'M7.042 16.896H4.414v-3.754H2.708v3.754H.01L0 7.22h2.708v3.6h1.706v-3.6h2.628zm12.043.046C21.795 16.94 24 14.689 24 11.978a4.89 4.89 0 0 0-4.915-4.92c-2.707-.002-4.09 1.991-4.432 2.795.003-1.207-1.187-2.632-2.58-2.634H7.59v9.674l4.181.001c1.686 0 2.886-1.46 2.888-2.713.385.788 1.72 2.762 4.427 2.76zm-7.665-3.936c.387 0 .692.382.692.817 0 .435-.305.817-.692.817h-1.33v-1.634zm.005-3.633c.387 0 .692.382.692.817 0 .436-.305.818-.692.818h-1.33V9.373zm1.77 2.607c.305-.039.813-.387.992-.61-.063.276-.068 1.074.006 1.35-.204-.314-.688-.701-.998-.74zm3.43 0a2.462 2.462 0 1 1 4.924 0 2.462 2.462 0 0 1-4.925 0zm2.462 1.936a1.936 1.936 0 1 0 0-3.872 1.936 1.936 0 0 0 0 3.872Z',
    netflix: 'm5.398 0 8.348 23.602c2.346.059 4.856.398 4.856.398L10.113 0H5.398zm8.489 0v9.172l4.715 13.33V0h-4.715zM5.398 1.5V24c1.873-.225 2.81-.312 4.715-.398V14.83L5.398 1.5z',
    appletv: 'M20.57 17.735h-1.815l-3.34-9.203h1.633l2.02 5.987c.075.231.273.9.586 2.012l.297-.997.33-1.006 2.094-6.004H24zm-5.344-.066a5.76 5.76 0 0 1-1.55.207c-1.23 0-1.84-.693-1.84-2.087V9.646h-1.063V8.532h1.121V7.081l1.476-.602v2.062h1.707v1.113H13.38v5.805c0 .446.074.75.214.932.14.182.396.264.75.264.207 0 .495-.041.883-.115zm-7.29-5.343c.017 1.764 1.55 2.358 1.567 2.366-.017.042-.248.842-.808 1.658-.487.71-.99 1.418-1.79 1.435-.783.016-1.03-.462-1.93-.462-.89 0-1.17.445-1.913.478-.758.025-1.344-.775-1.838-1.484-.998-1.451-1.765-4.098-.734-5.88.51-.89 1.426-1.451 2.416-1.46.75-.016 1.468.512 1.93.512.461 0 1.327-.627 2.234-.536.38.016 1.452.157 2.136 1.154-.058.033-1.278.743-1.27 2.219M6.468 7.988c.404-.495.685-1.18.61-1.864-.585.025-1.294.388-1.723.883-.38.437-.71 1.138-.619 1.806.652.05 1.328-.338 1.732-.825Z',
    dcentertainment: 'M5.215 8.787h2.154c.601 0 1.088.487 1.088 1.088v4.954c0 .6-.487 1.088-1.088 1.088H6.05V9.475a.159.159 0 00-.066-.129zM12 23.099a11.078 11.078 0 01-8.659-4.155.046.046 0 01.036-.074h5.936a.26.26 0 00.153-.05l2.27-1.648a.159.159 0 00.064-.128V7.616a.159.159 0 00-.065-.129L9.466 5.84a.261.261 0 00-.153-.05H2.886a.046.046 0 01-.037-.071A11.087 11.087 0 0112 .9c3.798 0 7.15 1.907 9.151 4.817a.046.046 0 01-.038.071h-1.597c-.052 0-.1.03-.123.079l-.353.757-1.082-.786a.26.26 0 00-.153-.05h-2.553a.261.261 0 00-.154.05L12.83 7.487a.159.159 0 00-.065.129v9.428c0 .05.024.098.065.128l2.27 1.648a.26.26 0 00.153.05h5.371c.038 0 .06.045.036.074A11.078 11.078 0 0112 23.1zM1.602 8.3l1.038.755c.043.03.068.08.068.132v8.73c0 .046-.06.063-.084.025A11.046 11.046 0 01.901 12c0-1.289.22-2.526.624-3.677a.05.05 0 01.077-.024zm13.67.488h3.225v1.776c0 .046.038.084.084.084h2.701a.098.098 0 00.096-.083l.535-3.374c.007-.044.066-.053.086-.013a11.053 11.053 0 011.1 4.823 11.05 11.05 0 01-1.39 5.382c-.022.04-.084.024-.084-.023v-3.084a.084.084 0 00-.084-.084h-2.96a.084.084 0 00-.084.084v1.642h-1.301a1.089 1.089 0 01-1.089-1.088V9.475a.159.159 0 00-.065-.129zM12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0Z',
    mubi: 'M3.357.033A3.357 3.357 0 0 0 0 3.39a3.357 3.357 0 0 0 3.357 3.357A3.357 3.357 0 0 0 6.713 3.39 3.357 3.357 0 0 0 3.357.033Zm8.643 0A3.357 3.357 0 0 0 8.645 3.39 3.357 3.357 0 0 0 12 6.746a3.357 3.357 0 0 0 3.357-3.357A3.357 3.357 0 0 0 12 .033Zm-8.643 8.61A3.357 3.357 0 0 0 0 12a3.357 3.357 0 0 0 3.357 3.355A3.357 3.357 0 0 0 6.713 12a3.357 3.357 0 0 0-3.356-3.357Zm8.643 0A3.357 3.357 0 0 0 8.645 12 3.357 3.357 0 0 0 12 15.355 3.357 3.357 0 0 0 15.357 12 3.357 3.357 0 0 0 12 8.643zm8.643 0A3.357 3.357 0 0 0 17.287 12a3.357 3.357 0 0 0 3.356 3.355A3.357 3.357 0 0 0 24 12a3.357 3.357 0 0 0-3.357-3.357Zm-17.286 8.61A3.357 3.357 0 0 0 0 20.612a3.357 3.357 0 0 0 3.357 3.356 3.357 3.357 0 0 0 3.356-3.356 3.357 3.357 0 0 0-3.356-3.357Zm8.643 0a3.357 3.357 0 0 0-3.355 3.358A3.357 3.357 0 0 0 12 23.967a3.357 3.357 0 0 0 3.357-3.356A3.357 3.357 0 0 0 12 17.254z',
    crunchyroll: 'M2.909 13.436C2.914 7.61 7.642 2.893 13.468 2.898c5.576.005 10.137 4.339 10.51 9.819q.021-.351.022-.706C24.007 5.385 18.64.006 12.012 0S.007 5.36 0 11.988 5.36 23.994 11.988 24q.412 0 .815-.027c-5.526-.338-9.9-4.928-9.894-10.538Zm16.284.155a4.1 4.1 0 0 1-4.095-4.103 4.1 4.1 0 0 1 2.712-3.855 8.95 8.95 0 0 0-4.187-1.037 9.007 9.007 0 1 0 8.997 9.016q-.001-.847-.15-1.651a4.1 4.1 0 0 1-3.278 1.63Z',
    showtime: 'M16.99 12.167c0-4.808 1.779-7.84 3.903-8.16C18.769 1.397 15.221 0 11.999 0 8.451 0 5.265 1.54 3.07 3.985c2.094.416 2.806 2.174 2.806 4.892H3.314c0-1.605-.334-2.436-1.284-2.436-.427 0-.758.217-.954.587-.027.06-.057.122-.084.184a2.115 2.115 0 0 0-.114.71c0 3.324 5.46 3.159 5.46 8.27 0 1.995-1.53 3.855-3.252 3.855C5.35 22.52 8.441 24 12 24c3.46 0 6.577-1.464 8.766-3.808-2.018-.509-3.776-3.413-3.776-8.025zm-1.142 7.921h-2.746V13.26h-2.967v6.83H7.384V4.327h2.746v6.348h2.972V4.327h2.746v15.761zM2.372 17.58c-1.32 0-2.399-2.32-2.372-5.8 1.905 1.72 3.681 2.11 3.681 4.145 0 .981-.543 1.655-1.309 1.655zM24 12.002c0 2.844-.896 5.409-2.1 5.409-1.445 0-2.181-2.703-2.181-5.498 0-2.654.771-5.308 2.181-5.308 1.676 0 2.1 4.102 2.1 5.397z',
    starz: 'M2.2695 9.2832C.3784 9.2832.131 10.4706.131 10.834c0 2.1989 2.9316 1.3955 2.9316 2.2363 0 .2073-.1641.4277-.7363.4277-.6317 0-.7598-.2895-.7598-.5097H0c.0054.4022.1675 1.7285 2.3262 1.7285 1.5989 0 2.287-.7516 2.287-1.7031 0-2.1804-2.996-1.3552-2.996-2.1797 0-.1628.1284-.4082.6308-.4082.5025 0 .631.2454.631.4082H4.369c0-.3917-.2084-1.5508-2.0996-1.5508zm2.2774.1465v1.4043h1.4199v3.7363h1.5488V10.834h1.4395V9.4297Zm5.6191 0L8.131 14.5703h1.6425l.1836-.5586h1.7989l.1855.5586h1.6406L11.547 9.4297Zm3.7422 0v5.1406h1.5488v-2.164l1.289 2.164h1.836l-1.3125-1.9023c.6997-.3145.9922-.9294.9922-1.5567h-.002c0-.928-.6126-1.6816-2.121-1.6816h-.002zm4.9297 0v1.4043h2.0371l-2.2246 3.7363h4.1816l.7793-1.4043h-2.4531l2.2227-3.7363Zm-3.3809 1.2656h.6817c.4166 0 .58.225.58.504 0 .2788-.1636.5058-.58.5058v-.002h-.6817zm-4.6015.6094.5586 1.6777h-1.1153zm12.836 2.7148c-.1708 0-.3087.1398-.3087.3106 0 .1707.1379.3086.3086.3086A.3082.3082 0 0 0 24 14.33c0-.1708-.1379-.3106-.3086-.3106zm-.0138.0606c.0042-.0002.0094 0 .0137 0 .1373 0 .248.1127.248.25a.2477.2477 0 0 1-.248.248c-.1372 0-.25-.1108-.25-.248 0-.133.105-.2433.2363-.25zm-.0937.084v.33h.0605v-.1289h.047l.0702.129h.0703l-.0781-.1368a.0987.0987 0 0 0 .0469-.0332.0949.0949 0 0 0 .0195-.0605c0-.059-.0416-.0996-.1055-.0996zm.0605.0625h.0645c.0314 0 .0488.013.0488.039 0 .026-.0174.039-.0488.039h-.0645z',
    zdf: 'M7.014 4.987A7.02 7.02 0 000 12.005a7.017 7.017 0 0013.271 3.174h2.915c.696 0 1.324-.044 1.962-.553.461-.365.749-.884.883-1.56v2.103h1.336v-2.473h3.153v-1.1h-3.16l.02-.445c.005-.724.226-1.162 1.277-1.162H24V8.876h-2.818c-1.517 0-2.141.85-2.141 2.18v.129c-.254-1.565-1.185-2.31-2.889-2.31h-2.855a7.018 7.018 0 00-6.283-3.888zM8.02 8.876h3.436c1.742 0 1.992 1.219 1.992 1.9 0 .725-.298 1.873-1.992 1.873h-.844c-1.056 0-1.281.38-1.281 1.104v.336h3.945v1.074H7.982v-1.558c0-1.335.625-2.123 2.137-2.123h.873c.691 0 1.1-.14 1.1-.725 0-.605-.409-.772-1.12-.772h-2.95v-1.11zm6.63 1.113h1.472c1.157 0 1.574.496 1.574 2.04 0 1.542-.412 2.036-1.574 2.036H14.65z'
  };

  // Brand colours (Simple Icons). Black ones are drawn white so they show on Plex's dark UI.
  const SI_COLOR = { sony:"#FFFFFF", hbo:"#FFFFFF", netflix:"#E50914", appletv:"#FFFFFF", dcentertainment:"#0078F0",
                     mubi:"#FFFFFF", crunchyroll:"#FF5E00", showtime:"#B10000", starz:"#FFFFFF", zdf:"#FA7D19" };

  // [name pattern, Wikipedia search OR { si: built-in logo }]. First match wins.
  const STUDIOS = [
    // ---- USA ----
    [/^warner bro(s|thers)/,                "Warner Bros. Pictures"],
    [/^new line/,                           "New Line Cinema"],
    [/^castle rock/,                        "Castle Rock Entertainment"],
    [/^universal( pictures| studios)?$/,    "Universal Pictures"],
    [/^focus features/,                     "Focus Features"],
    [/^illumination/,                       "Illumination (company)"],
    [/^dreamworks animation/,               "DreamWorks Animation"],
    [/^dreamworks/,                         "DreamWorks Pictures"],
    [/^amblin/,                             "Amblin Entertainment"],
    [/^paramount( pictures| animation)?$/,  "Paramount Pictures"],
    [/^walt disney animation/,              "Walt Disney Animation Studios"],
    [/^(walt )?disney( pictures)?$/,        "Walt Disney Pictures"],
    [/^pixar/,                              "Pixar"],
    [/^marvel/,                             "Marvel Studios"],
    [/^lucasfilm/,                          "Lucasfilm"],
    [/^touchstone/,                         "Touchstone Pictures"],
    [/^20th century studios/,               "20th Century Studios"],
    [/^(20th|twentieth) century.?fox/,      "20th Century Fox"],
    [/searchlight/,                         "Searchlight Pictures"],
    [/^columbia( pictures)?$/,              "Columbia Pictures"],
    [/^tri.?star/,                          "TriStar Pictures"],
    [/^screen gems/,                        "Screen Gems"],
    [/^sony pictures/,                      { si: "sony" }],
    [/^amazon/,                             "Amazon MGM Studios"],
    [/^(mgm|metro.goldwyn.mayer)/,          "Metro-Goldwyn-Mayer"],
    [/^united artists/,                     "United Artists"],
    [/^orion pictures/,                     "Orion Pictures"],
    [/^lions ?gate/,                        "Lionsgate Films"],
    [/^summit entertainment/,               "Summit Entertainment"],
    [/^a24\b/,                              "A24 (company)"],
    [/^neon$/,                              "Neon (distributor)"],
    [/^blumhouse/,                          "Blumhouse Productions"],
    [/^legendary/,                          "Legendary Pictures"],
    [/^miramax/,                            "Miramax"],
    [/^dimension films/,                    "Dimension Films"],
    [/^annapurna/,                          "Annapurna Pictures"],
    [/^skydance/,                           "Skydance Media"],
    [/^village roadshow/,                   "Village Roadshow Pictures"],
    [/^stx/,                                "STX Entertainment"],
    [/^dc( films| studios| entertainment| comics)?$/, { si: "dcentertainment" }],
    [/^netflix/,                            { si: "netflix" }],
    [/^apple( original films| studios| tv)?/, { si: "appletv" }],
    [/^hbo( films| max)?$/,                 { si: "hbo" }],
    [/^showtime/,                           { si: "showtime" }],
    [/^starz/,                              { si: "starz" }],
    // ---- France ----
    [/^gaumont/,                            "Gaumont (film company)"],
    [/^path[eé]/,                           "Pathé (company)"],
    [/^studio ?canal/,                      "StudioCanal"],
    [/^europacorp/,                         "EuropaCorp"],
    [/^ugc\b/,                              "UGC (company) French film distributor"],
    [/^wild bunch/,                         "Wild Bunch (company)"],
    [/^(snd|soci[eé]t[eé] nouvelle de distribution)\b/, "Société Nouvelle de Distribution"],
    [/^canal\+|^canal plus/,                "Canal+"],
    [/^france 2 cin[eé]ma/,                 "France 2 Cinéma"],
    [/^france 3 cin[eé]ma/,                 "France 3 Cinéma"],
    [/^france t[eé]l[eé]visions/,           "France Télévisions"],
    [/^tf1/,                                "TF1 Films Production"],
    [/^m6\b/,                               "M6 Films"],
    [/^arte\b/,                             "Arte France Cinéma"],
    [/^le pacte/,                           "Le Pacte film distributor"],
    [/^mars (films|distribution)/,          "Mars Films"],
    [/^orange studio/,                      "Orange Studio"],
    [/^metropolitan filmexport/,            "Metropolitan Filmexport"],
    [/^mk2/,                                "MK2 (company)"],
    [/^les films du losange/,               "Les Films du Losange"],
    [/^haut et court/,                      "Haut et Court"],
    [/^diaphana/,                           "Diaphana Films"],
    // ---- World ----
    [/^toho\b/,                             "Toho"],
    [/^studio ghibli/,                      "Studio Ghibli"],
    [/^toei animation/,                     "Toei Animation"],
    [/^toei/,                               "Toei Company"],
    [/^shochiku/,                           "Shochiku"],
    [/^kadokawa/,                           "Kadokawa Corporation"],
    [/^madhouse/,                           "Madhouse (company)"],
    [/^crunchyroll/,                        { si: "crunchyroll" }],
    [/^cj (entertainment|e&m|enm)/,         "CJ Entertainment"],
    [/^yash raj/,                           "Yash Raj Films"],
    [/^bbc/,                                "BBC Film"],
    [/^working title/,                      "Working Title Films"],
    [/^film ?4/,                            "Film4 Productions"],
    [/^aardman/,                            "Aardman Animations"],
    [/^constantin/,                         "Constantin Film"],
    [/^studio babelsberg/,                  "Studio Babelsberg"],
    [/^zdf/,                                { si: "zdf" }],
    [/^rai cinema/,                         "Rai Cinema"],
    [/^nordisk film/,                       "Nordisk Film"],
    [/^(entertainment one|eone)/,           "Entertainment One"],
    [/^mubi/,                               { si: "mubi" }],
  ];

  GM_addStyle(`
    #${BOX_ID} { display:inline-flex; align-items:center; gap:6px; margin-left:.8em; vertical-align:middle;
                 cursor:pointer; border-radius:6px; padding:2px 4px; transition:background .15s;
                 user-select:none; -webkit-user-select:none; }
    #${BOX_ID}:hover, #${BOX_ID}:focus-visible { background:rgba(255,255,255,.12); outline:none; }
    #${BOX_ID}.pyro-studio-block { display:flex; width:max-content; margin:8px 0 4px; }
    #${BOX_ID} img { height:40px; width:auto; max-width:200px; object-fit:contain; }
    #${BOX_ID} svg { height:28px; width:28px; }
    /* a dark logo on Plex's dark background gets a light backing so it stays readable */
    #${BOX_ID} img.pyro-studio-dark { background:rgba(255,255,255,.92); border-radius:6px; padding:3px 7px; }
    #${BOX_ID} .pyro-studio-name { font:600 13px/1.2 -apple-system,Helvetica,Arial,sans-serif;
                 color:rgba(255,255,255,.75); letter-spacing:.02em; }

    #${PANEL_ID} { position:fixed; inset:0; z-index:999998; background:rgba(0,0,0,.72);
                   display:flex; align-items:flex-start; justify-content:center; padding:6vh 16px;
                   font:13px/1.35 -apple-system,Helvetica,Arial,sans-serif; color:#eee; }
    #${PANEL_ID} .pss-card { background:#1b1d20; border:1px solid #333; border-radius:12px; width:min(1100px,100%);
                   max-height:88vh; display:flex; flex-direction:column; box-shadow:0 12px 40px rgba(0,0,0,.6); }
    #${PANEL_ID} .pss-head { display:flex; align-items:center; gap:12px; padding:14px 18px; border-bottom:1px solid #2c2c2c; }
    #${PANEL_ID} .pss-head img { height:30px; width:auto; max-width:160px; object-fit:contain; }
    #${PANEL_ID} .pss-head img.pyro-studio-dark { background:rgba(255,255,255,.92); border-radius:4px; padding:3px 6px; }
    #${PANEL_ID} .pss-title { font-weight:700; font-size:16px; }
    #${PANEL_ID} .pss-count { color:#999; }
    #${PANEL_ID} .pss-native { display:flex; gap:6px; margin-left:auto; flex-wrap:wrap; }
    #${PANEL_ID} .pss-native a { background:#e5a00d; color:#1b1d20; font-weight:700; border-radius:6px;
                   padding:5px 10px; text-decoration:none; white-space:nowrap; }
    #${PANEL_ID} .pss-native a:hover { background:#f0b53a; }
    #${PANEL_ID} .pss-close { margin-left:4px; background:none; border:0; color:#aaa; font-size:22px; cursor:pointer; }
    #${PANEL_ID} .pss-close:hover { color:#fff; }
    #${PANEL_ID} .pss-grid { overflow:auto; padding:16px 18px; display:grid; gap:16px;
                   grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); }
    #${PANEL_ID} .pss-item { cursor:pointer; text-decoration:none; color:inherit; }
    #${PANEL_ID} .pss-item img { width:100%; aspect-ratio:2/3; object-fit:cover; border-radius:6px; background:#2a2a2a;
                   display:block; transition:transform .15s, box-shadow .15s; }
    #${PANEL_ID} .pss-item:hover img { transform:translateY(-2px); box-shadow:0 0 0 2px #e5a00d; }
    #${PANEL_ID} .pss-item.pss-here img { box-shadow:0 0 0 2px rgba(255,255,255,.5); }
    #${PANEL_ID} .pss-name { margin-top:6px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #${PANEL_ID} .pss-year { color:#999; font-size:12px; }
    #${PANEL_ID} .pss-msg { padding:30px 18px; color:#aaa; }
  `);

  /* ---------- helpers ---------- */
  const norm = s => (s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
  const lookup = name => { const n = norm(name); const hit = STUDIOS.find(([re]) => re.test(n)); return hit ? hit[1] : null; };

  function gmJson(url) {
    return new Promise(res => GM_xmlhttpRequest({
      method: "GET", url, timeout: 10000,
      onload: r => { try { res(JSON.parse(r.responseText)); } catch (_) { res(null); } },
      onerror: () => res(null), ontimeout: () => res(null)
    }));
  }

  // Plex server + token, taken from the images the page already loaded.
  function server() {
    const urls = [...document.querySelectorAll('img[src*="X-Plex-Token"]')].map(i => i.src);
    try { performance.getEntriesByType("resource").forEach(e => { if (/X-Plex-Token/.test(e.name)) urls.push(e.name); }); } catch (_) {}
    for (const u of urls.reverse()) {
      try {
        const url = new URL(u, location.href);
        if (/plex\.tv$/.test(url.hostname)) continue;
        return { origin: url.origin, token: url.searchParams.get("X-Plex-Token") };
      } catch (_) {}
    }
    if (location.pathname.startsWith("/web")) {
      let t = null; try { t = localStorage.getItem("myPlexAccessToken"); } catch (_) {}
      return { origin: location.origin, token: t };
    }
    return null;
  }

  const ratingKey = () => {
    const m = decodeURIComponent(location.hash).match(/\/details\?key=\/library\/metadata\/(\d+)/);
    return m ? m[1] : null;
  };

  const meta = {};   // ratingKey -> { type, studio }
  async function metadata(key) {
    if (meta[key]) return meta[key];
    const s = server();
    if (!s) return null;
    try {
      const r = await fetch(`${s.origin}/library/metadata/${key}` + (s.token ? `?X-Plex-Token=${encodeURIComponent(s.token)}` : ""),
                            { headers: { Accept: "application/json" } });
      const m = (await r.json()).MediaContainer.Metadata[0];
      return (meta[key] = { type: m.type, studio: m.studio || "", year: m.year || null });
    } catch (_) { return null; }
  }

  // Wikipedia search -> Wikidata "logo image" (P154), else the article's image if it's a logo.
  async function wikiLogo(query) {
    const cache = GM_getValue(CACHE_KEY, {});
    const hit = cache[query];
    if (hit && (hit.url || Date.now() - hit.t < WEEK)) return hit.url;
    let url = null;
    const w = await gmJson("https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=1" +
      "&prop=pageimages|pageprops&piprop=thumbnail|name&pithumbsize=400&pilicense=any&ppprop=wikibase_item&gsrsearch=" +
      encodeURIComponent(query));
    const page = w && w.query && Object.values(w.query.pages)[0];
    if (page) {
      const qid = page.pageprops && page.pageprops.wikibase_item;
      if (qid) {
        const c = await gmJson(`https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&property=P154&entity=${qid}`);
        const claims = (c && c.claims && c.claims.P154) || [];
        const pick = claims.find(x => x.rank === "preferred") ||
                     claims.find(x => !(x.qualifiers && x.qualifiers.P582)) || claims[0];
        const file = pick && pick.mainsnak.datavalue && pick.mainsnak.datavalue.value;
        if (file) url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(file) + "?width=400";
      }
      if (!url && page.thumbnail && /logo|wordmark/i.test(page.pageimage || "")) url = page.thumbnail.source;
    }
    cache[query] = { url, t: Date.now() };
    GM_setValue(CACHE_KEY, cache);
    return url;
  }

  /** True when a logo is mostly dark ink on a transparent background (unreadable on dark UI). */
  function isDark(img) {
    try {
      const c = document.createElement("canvas");
      const w = c.width = 64, h = c.height = Math.max(1, Math.round(64 * img.naturalHeight / img.naturalWidth));
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data;
      let lum = 0, n = 0, clear = 0;
      for (let k = 0; k < d.length; k += 4) {
        if (d[k + 3] < 80) { clear++; continue; }
        lum += (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) / 255; n++;
      }
      if (!n || clear < (w * h) * 0.1) return false;   // opaque image = has its own background
      return lum / n < 0.35;
    } catch (_) { return false; }
  }

  /* ---------- the badge ---------- */
  function titleBlock() {
    const h = [...document.querySelectorAll('h1, [data-testid="metadata-title"]')]
      .filter(e => e.offsetParent !== null && !e.closest("#" + BOX_ID)).pop();
    if (!h) return null;
    let el = h;
    while (el.parentElement && el.parentElement.childElementCount === 1 && el.parentElement !== document.body) el = el.parentElement;
    return el;
  }

  function build(studio, logo) {
    const box = document.createElement("div");
    box.id = BOX_ID;
    box.dataset.pyroIgnore = "";      // the flag/badge scanner leaves it alone
    box.dataset.studio = studio;
    box.title = `All your films from ${studio}`;
    box.setAttribute("role", "button");
    box.tabIndex = 0;
    const go = e => { e.preventDefault(); e.stopPropagation(); openStudio(studio, logo); };
    box.addEventListener("click", go);
    box.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") go(e); });
    const name = () => {
      const s = document.createElement("span");
      s.className = "pyro-studio-name";
      s.textContent = studio;
      box.replaceChildren(s);
    };
    if (logo && logo.si) {
      box.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="${SI_COLOR[logo.si] || "#fff"}"><path d="${SI[logo.si]}"/></svg>`;
      const s = document.createElement("span");
      s.className = "pyro-studio-name";
      s.textContent = studio;
      box.appendChild(s);
    } else if (logo) {
      const i = document.createElement("img");
      i.alt = ""; i.draggable = false; i.referrerPolicy = "no-referrer";
      i.crossOrigin = "anonymous";       // lets us check how dark the logo is
      i.onload = () => { if (isDark(i)) i.classList.add("pyro-studio-dark"); };
      i.onerror = () => {                // no CORS: show it anyway, just without the check
        if (i.crossOrigin) { i.removeAttribute("crossorigin"); i.src = logo; } else name();
      };
      i.src = logo;
      box.appendChild(i);
    } else name();
    return box;
  }

  /* The "2021 · 2h 28m · PG-13" line: the text holding the film's year, just below
     the title, together with the runtime next to it (their closest common parent). */
  const RUNTIME = /^\d+\s?(h|hr|min|m)\b/i;
  function infoLine(year) {
    const title = titleBlock();
    if (!title || !year) return null;
    const top = title.getBoundingClientRect().top;
    const scope = title.parentElement.parentElement || title.parentElement;
    const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentElement.closest("#" + BOX_ID + ",h1,[data-testid='metadata-title'],button,a[role='button']")
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    for (let n; (n = w.nextNode()) && nodes.length < 400;) if (n.nodeValue.trim()) nodes.push(n);
    const i = nodes.findIndex(n => {
      const t = n.nodeValue.trim();
      return t.length < 40 && t.includes(String(year)) && n.parentElement.offsetParent !== null &&
             n.parentElement.getBoundingClientRect().top >= top;
    });
    if (i < 0) return null;
    let line = nodes[i].parentElement;
    const rt = nodes.slice(i + 1, i + 8).find(n => RUNTIME.test(n.nodeValue.trim()));
    if (rt) { while (line && !line.contains(rt)) line = line.parentElement; }
    return line && line.getBoundingClientRect().height < 80 ? line : nodes[i].parentElement;
  }

  let token = 0, current = null;   // current = { key, studio, logo, year }
  function place() {
    const old = document.getElementById(BOX_ID);
    if (!current) { if (old) old.remove(); return; }
    const line = infoLine(current.year);
    const anchor = line ? null : titleBlock();
    if (!line && !anchor) return;
    if (old && old.dataset.studio === current.studio &&
        (line ? old.parentElement === line && old === line.lastElementChild : old.previousElementSibling === anchor)) return;
    if (old) old.remove();
    const box = build(current.studio, current.logo);
    if (line) line.appendChild(box);
    else { box.classList.add("pyro-studio-block"); anchor.insertAdjacentElement("afterend", box); }
  }

  /* ---------- click: every film with EXACTLY this studio ----------
     "Warner Bros." and "Warner Bros. Pictures", or "Pathé" and "Pathé Films",
     are different studios for Plex, so only the exact same name counts
     (case and extra spaces aside; accents do count). */
  const same = (a, b) => (a || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase() ===
                         (b || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

  async function plexJson(s, path) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(s.origin + path + (s.token ? `${sep}X-Plex-Token=${encodeURIComponent(s.token)}` : ""),
                          { headers: { Accept: "application/json" } });
    return (await r.json()).MediaContainer || {};
  }

  function closeStudio() { const p = document.getElementById(PANEL_ID); if (p) p.remove(); }

  async function openStudio(studio, logo) {
    closeStudio();
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.dataset.pyroIgnore = "";
    panel.innerHTML = `<div class="pss-card"><div class="pss-head"><span class="pss-logo"></span>
      <span class="pss-title"></span><span class="pss-count"></span><span class="pss-native"></span>
      <button class="pss-close" title="Close">✕</button></div>
      <div class="pss-grid"><div class="pss-msg">Searching…</div></div></div>`;
    panel.querySelector(".pss-title").textContent = studio;
    const head = document.getElementById(BOX_ID);
    const img = head && head.querySelector("img, svg");
    if (img) panel.querySelector(".pss-logo").appendChild(img.cloneNode(true));
    panel.addEventListener("click", e => { if (e.target === panel || e.target.closest(".pss-close")) closeStudio(); });
    document.body.appendChild(panel);
    const grid = panel.querySelector(".pss-grid");
    const msg = t => { grid.innerHTML = ""; const d = document.createElement("div"); d.className = "pss-msg"; d.textContent = t; grid.appendChild(d); };

    const s = server();
    if (!s) return msg("Plex server not found yet — try again in a second.");
    let films = [];
    const found = [];   // movie libraries holding this studio
    try {
      const secs = ((await plexJson(s, "/library/sections")).Directory || []).filter(d => d.type === "movie");
      for (const sec of secs) {
        const mc = await plexJson(s, `/library/sections/${sec.key}/all?type=1&studio=${encodeURIComponent(studio)}`);
        const hits = (mc.Metadata || []).filter(m => same(m.studio, studio));
        films.push(...hits);
        if (hits.length) found.push(sec);
      }
    } catch (_) { return msg("Plex didn't answer."); }
    if (!document.body.contains(panel)) return;

    const seen = new Set();
    films = films.filter(m => !seen.has(m.ratingKey) && seen.add(m.ratingKey))
                 .sort((a, b) => (b.year || 0) - (a.year || 0) || (a.titleSort || a.title).localeCompare(b.titleSort || b.title));
    panel.querySelector(".pss-count").textContent = `· ${films.length} film${films.length > 1 ? "s" : ""}`;
    if (!films.length) return msg("No other film with this exact studio.");

    const server_id = (location.hash.match(/\/server\/([^/]+)\//) || [])[1];

    // Plex Web's own filtered library view (same link Plex builds for Filter › Studio).
    const native = panel.querySelector(".pss-native");
    const enc = v => encodeURIComponent(v).replace(/[!'()*.]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    for (const sec of found) {
      const key = `/library/sections/${sec.key}/all?type=1&sort=${encodeURIComponent("addedAt:desc")}&studio=${encodeURIComponent(enc(studio))}`;
      const a = document.createElement("a");
      a.href = `#!/media/${server_id}/com.plexapp.plugins.library?source=${sec.key}&key=${encodeURIComponent(key)}`;
      a.textContent = found.length > 1 ? `Open in Plex · ${sec.title}` : "Open in Plex ↗";
      a.title = "Plex's own library view, filtered on this studio";
      a.addEventListener("click", closeStudio);
      native.appendChild(a);
    }
    grid.innerHTML = "";
    for (const m of films) {
      const a = document.createElement("a");
      a.className = "pss-item" + (current && current.key === String(m.ratingKey) ? " pss-here" : "");
      const detail = `/server/${server_id}/details?key=${encodeURIComponent("/library/metadata/" + m.ratingKey)}`;
      a.href = "#!" + detail;
      a.addEventListener("click", closeStudio);
      const poster = document.createElement("img");
      poster.loading = "lazy"; poster.alt = "";
      if (m.thumb) poster.src = `${s.origin}/photo/:/transcode?width=240&height=360&minSize=1&upscale=1&url=${encodeURIComponent(m.thumb)}` +
                                (s.token ? `&X-Plex-Token=${encodeURIComponent(s.token)}` : "");
      const n = document.createElement("div"); n.className = "pss-name"; n.textContent = m.title;
      const y = document.createElement("div"); y.className = "pss-year"; y.textContent = m.year || "";
      a.append(poster, n, y);
      grid.appendChild(a);
    }
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeStudio(); });

  async function update() {
    const key = ratingKey();
    if (!key) { current = null; place(); closeStudio(); return; }
    if (current && current.key === key) { place(); return; }
    const mine = ++token;
    current = null; place();
    const m = await metadata(key);
    if (mine !== token || !m || m.type !== "movie" || !m.studio) return;
    const entry = lookup(m.studio);
    const logo = !entry ? null : typeof entry === "object" ? entry : await wikiLogo(entry);
    if (mine !== token) return;
    current = { key, studio: m.studio, logo, year: m.year };
    place();
  }

  let queued = false;
  const schedule = () => { if (!queued) { queued = true; setTimeout(() => { queued = false; update(); }, 300); } };
  window.addEventListener("hashchange", schedule);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  update();
})();
})();
