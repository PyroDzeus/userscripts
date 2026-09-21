// ==UserScript==
// @name         Plex Sidekick 🔗▶️
// @namespace    pyro.plex.sidekick
// @version      6.0.4
// @description  Ton copilote Plex Web : boutons (avec logos) vers 20+ services (TMDB, IMDb, Letterboxd, JustWatch, Blu-ray.com, LDDb, DVDCompare, Criterion…) + lecture directe dans le lecteur de ton choix (IINA, Infuse, mpv, VLC, PotPlayer) avec choix de la version (4K, 1080p…) + épisode suivant + copie de l'URL directe. Colonne réductible, 7 styles dont des icônes compactes (cercles / petits carrés).
// @author       Pyro
// @license      MIT
// @match        https://app.plex.tv/*
// @match        http://*/web/*
// @match        https://*/web/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @connect      plex.direct
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-sidekick.user.js
// @updateURL    https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-sidekick.user.js
// ==/UserScript==

(function () {
  'use strict';

  // One line in the console so you can tell at a glance that the script started.
  console.info('[Plex Sidekick] 6.0.4 loaded');

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

  /* Brand icons from Simple Icons v16.32.0 (simpleicons.org, CC0), embedded so they never break.
     24×24 SVG path + brand colour. Services without one there get a neutral monogram instead. */
  const ICONS = {
    imdb: ['#F5C518', 'M22.3781 0H1.6218C.7411.0583.0587.7437.0018 1.5953l-.001 20.783c.0585.8761.7125 1.543 1.5559 1.6191A.337.337 0 0 0 1.6016 24h20.7971a.4579.4579 0 0 0 .0437-.002c.8727-.0768 1.5568-.8271 1.5568-1.7085V1.7098c0-.8914-.696-1.6416-1.584-1.7078A.3294.3294 0 0 0 22.3781 0zm0 .496a1.2144 1.2144 0 0 1 1.1252 1.2139v20.5797c0 .6377-.4875 1.1602-1.1045 1.2145H1.6016c-.5967-.0543-1.0645-.5297-1.1053-1.1258V1.6284C.5371 1.0185 1.0184.5364 1.6217.496h20.7564zM4.7954 8.2603v7.3636H2.8899V8.2603h1.9055zm6.5367 0v7.3636H9.6707v-4.9704l-.6711 4.9704H7.813l-.6986-4.8618-.0066 4.8618h-1.668V8.2603h2.468c.0748.4476.1492.9694.2307 1.5734l.2712 1.8713.4407-3.4447h2.4817zm2.9772 1.3289c.0742.0404.122.108.1417.2034.0279.0953.0345.3118.0345.6442v2.8548c0 .4881-.0345.7867-.0955.8954-.0609.1152-.2304.1695-.5018.1695V9.5211c.204 0 .3457.0205.4211.0681zm-.0211 6.0347c.4543 0 .8006-.0265 1.0245-.0742.2304-.0477.4204-.1357.5694-.2648.1556-.1218.2642-.298.3251-.5219.0611-.2238.1021-.6648.1021-1.3224v-2.5832c0-.6986-.0271-1.1668-.0742-1.4039-.041-.237-.1431-.4543-.3126-.6437-.1695-.1973-.4198-.3324-.7456-.421-.3191-.0808-.8542-.1285-1.7694-.1285h-1.4244v7.3636h2.3051zm5.14-1.7827c0 .3523-.0199.5762-.0544.6708-.033.0947-.1894.1424-.3046.1424-.1086 0-.19-.0477-.2238-.1351-.041-.0887-.0609-.2986-.0609-.6238v-1.9469c0-.3324.0199-.5423.0543-.6237.0338-.0808.1086-.122.2171-.122.1153 0 .2709.0412.3114.1425.041.0947.0609.2986.0609.6032v1.8926zm-2.4747-5.5809v7.3636h1.7157l.1152-.4675c.1556.1894.3251.3324.5152.4271.1828.0881.4608.1357.678.1357.3047 0 .5629-.0748.7802-.237.2165-.1562.3589-.3462.4198-.5628.0543-.2173.0887-.543.0887-.9841v-2.0675c0-.4409-.0139-.7324-.0344-.8681-.0199-.1357-.0742-.2781-.1695-.4204-.1021-.1425-.2437-.251-.4272-.3325-.1834-.0742-.3999-.1152-.6576-.1152-.2172 0-.4952.0477-.6846.1285-.1835.0887-.353.2238-.5086.4007V8.2603h-1.8309z'],
    letterboxd: ['#202830', 'M8.224 14.352a4.447 4.447 0 0 1-3.775 2.092C1.992 16.444 0 14.454 0 12s1.992-4.444 4.45-4.444c1.592 0 2.988.836 3.774 2.092-.427.682-.673 1.488-.673 2.352s.246 1.67.673 2.352zM15.101 12c0-.864.247-1.67.674-2.352-.786-1.256-2.183-2.092-3.775-2.092s-2.989.836-3.775 2.092c.427.682.674 1.488.674 2.352s-.247 1.67-.674 2.352c.786 1.256 2.183 2.092 3.775 2.092s2.989-.836 3.775-2.092A4.42 4.42 0 0 1 15.1 12zm4.45-4.444a4.447 4.447 0 0 0-3.775 2.092c.427.682.673 1.488.673 2.352s-.246 1.67-.673 2.352a4.447 4.447 0 0 0 3.775 2.092C22.008 16.444 24 14.454 24 12s-1.992-4.444-4.45-4.444z'],
    trakt: ['#9F42C6', 'm15.082 15.107-.73-.73 9.578-9.583a4.499 4.499 0 0 0-.115-.575L13.662 14.382l1.08 1.08-.73.73-1.81-1.81L23.422 3.144c-.075-.15-.155-.3-.25-.44L11.508 14.377l2.154 2.155-.73.73-7.193-7.199.73-.73 4.309 4.31L22.546 1.86A5.618 5.618 0 0 0 18.362 0H5.635A5.637 5.637 0 0 0 0 5.634V18.37A5.632 5.632 0 0 0 5.635 24h12.732C21.477 24 24 21.48 24 18.37V6.19l-8.913 8.918zm-4.314-2.155L6.814 8.988l.73-.73 3.954 3.96zm1.075-1.084-3.954-3.96.73-.73 3.959 3.96zm9.853 5.688a4.141 4.141 0 0 1-4.14 4.14H6.438a4.144 4.144 0 0 1-4.139-4.14V6.438A4.141 4.141 0 0 1 6.44 2.3h10.387v1.04H6.438c-1.71 0-3.099 1.39-3.099 3.1V17.55c0 1.71 1.39 3.105 3.1 3.105h11.117c1.71 0 3.1-1.395 3.1-3.105v-1.754h1.04v1.754z'],
    rottentomatoes: ['#FA320A', 'M5.866 0L4.335 1.262l2.082 1.8c-2.629-.989-4.842 1.4-5.012 2.338 1.384-.323 2.24-.422 3.344-.335-7.042 4.634-4.978 13.148-1.434 16.094 5.784 4.612 13.77 3.202 17.91-1.316C27.26 13.363 22.993.65 10.86 2.766c.107-1.17.633-1.503 1.243-1.602-.89-1.493-3.67-.734-4.556 1.374C7.52 2.602 5.866 0 5.866 0zM4.422 7.217H6.9c2.673 0 2.898.012 3.55.202 1.06.307 1.868.973 2.313 1.904.05.106.092.206.13.305l7.623.008.027 2.912-2.745-.024v7.549l-2.982-.016v-7.522l-2.127.016a2.92 2.92 0 0 1-1.056 1.134c-.287.176-.3.19-.254.264.127.2 2.125 3.642 2.125 3.659l-3.39.019-2.013-3.376c-.034-.047-.122-.068-.344-.084l-.297-.02.037 3.48-3.075-.038zm3.016 2.288l.024.338c.014.186.024.729.024 1.206v.867l.582-.025c.32-.013.695-.049.833-.078.694-.146 1.048-.478 1.087-1.018.027-.378-.063-.636-.303-.87-.318-.309-.761-.416-1.733-.418Z'],
    metacritic: ['#000000', 'M11.99 0A12 12 0 1 0 24 12v-.014A12 12 0 0 0 11.99 0Zm-.055 2.564a9.399 9.399 0 0 1 9.407 9.389v.01a9.399 9.399 0 1 1-9.408-9.399Zm-1.61 17.198 2.046-2.046-3.94-3.94c-.165-.166-.345-.373-.442-.608-.221-.47-.318-1.203.221-1.742.664-.664 1.548-.387 2.406.47l3.788 3.788 2.046-2.046-3.954-3.954a2.48 2.48 0 0 1-.456-.622c-.263-.539-.25-1.216.235-1.7.677-.678 1.562-.429 2.544.553l3.677 3.677 2.046-2.046-3.982-3.982c-2.018-2.018-3.912-1.949-5.212-.65-.498.499-.802 1.024-.954 1.618a4.026 4.026 0 0 0-.055 1.686l-.027.028c-.996-.414-2.13-.166-3 .705-1.162 1.161-1.12 2.392-.982 3.11l-.042.043-1.009-.816-1.77 1.77a64.1 64.1 0 0 1 2.213 2.1z'],
    douban: ['#2D963D', 'M.51 3.06h22.98V.755H.51V3.06Zm20.976 2.537v9.608h-2.137l-1.669 5.76H24v2.28H0v-2.28h6.32l-1.67-5.76H2.515V5.597h18.972Zm-5.066 9.608H7.58l1.67 5.76h5.501l1.67-5.76ZM18.367 7.9H5.634v5.025h12.733V7.9Z'],
    wikipedia: ['#000000', 'M12.09 13.119c-.936 1.932-2.217 4.548-2.853 5.728-.616 1.074-1.127.931-1.532.029-1.406-3.321-4.293-9.144-5.651-12.409-.251-.601-.441-.987-.619-1.139-.181-.15-.554-.24-1.122-.271C.103 5.033 0 4.982 0 4.898v-.455l.052-.045c.924-.005 5.401 0 5.401 0l.051.045v.434c0 .119-.075.176-.225.176l-.564.031c-.485.029-.727.164-.727.436 0 .135.053.33.166.601 1.082 2.646 4.818 10.521 4.818 10.521l.136.046 2.411-4.81-.482-1.067-1.658-3.264s-.318-.654-.428-.872c-.728-1.443-.712-1.518-1.447-1.617-.207-.023-.313-.05-.313-.149v-.468l.06-.045h4.292l.113.037v.451c0 .105-.076.15-.227.15l-.308.047c-.792.061-.661.381-.136 1.422l1.582 3.252 1.758-3.504c.293-.64.233-.801.111-.947-.07-.084-.305-.22-.812-.24l-.201-.021c-.052 0-.098-.015-.145-.051-.045-.031-.067-.076-.067-.129v-.427l.061-.045c1.247-.008 4.043 0 4.043 0l.059.045v.436c0 .121-.059.178-.193.178-.646.03-.782.095-1.023.439-.12.186-.375.589-.646 1.039l-2.301 4.273-.065.135 2.792 5.712.17.048 4.396-10.438c.154-.422.129-.722-.064-.895-.197-.172-.346-.273-.857-.295l-.42-.016c-.061 0-.105-.014-.152-.045-.043-.029-.072-.075-.072-.119v-.436l.059-.045h4.961l.041.045v.437c0 .119-.074.18-.209.18-.648.03-1.127.18-1.443.421-.314.255-.557.616-.736 1.067 0 0-4.043 9.258-5.426 12.339-.525 1.007-1.053.917-1.503-.031-.571-1.171-1.773-3.786-2.646-5.71l.053-.036z'],
    youtube: ['#FF0000', 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'],
    mdblist: ['#4284CA', 'M1.928.029A2.47 2.47 0 0 0 .093 1.673c-.085.248-.09.629-.09 10.33s.005 10.08.09 10.33a2.51 2.51 0 0 0 1.512 1.558l.276.108h20.237l.277-.108a2.51 2.51 0 0 0 1.512-1.559c.085-.25.09-.63.09-10.33s-.005-10.08-.09-10.33A2.51 2.51 0 0 0 22.395.115l-.277-.109L12.117 0C6.615-.004 2.032.011 1.929.029m7.48 8.067 2.123 2.004v1.54c0 .897-.02 1.536-.043 1.527s-.92-.845-1.995-1.86c-1.071-1.01-1.962-1.84-1.977-1.84s-.024 1.91-.024 4.248v4.25H4.911V6.085h1.188l1.183.006zm9.729 3.93v5.94h-2.63l-.01-4.25-.013-4.25-1.907 1.795a367 367 0 0 1-1.98 1.864c-.076.056-.08-.047-.08-1.489v-1.555l2.127-1.995 2.122-1.995 1.187-.005h1.184z'],
    plex: ['#EBAF00', 'M3.987 8.409c-.96 0-1.587.28-2.12.933v-.72H0v8.88s.038.018.127.037c.138.03.821.187 1.331-.249.441-.377.542-.814.542-1.318v-1.283c.533.573 1.147.813 2 .813 1.84 0 3.253-1.493 3.253-3.48 0-2.12-1.36-3.613-3.266-3.613Zm16.748 5.595.406.591c.391.614.894.906 1.492.908.621-.012 1.064-.562 1.226-.755 0 0-.307-.27-.686-.72-.517-.614-1.214-1.755-1.24-1.803l-1.198 1.779Zm-3.205-1.955c0-2.08-1.52-3.64-3.52-3.64s-3.467 1.587-3.467 3.573a3.48 3.48 0 0 0 3.507 3.52c1.413 0 2.626-.84 3.253-2.293h-2.04l-.093.093c-.427.4-.72.533-1.227.533-.787 0-1.373-.506-1.453-1.266h4.986c.04-.214.054-.307.054-.52Zm-7.671-.219c0 .769.11 1.701.868 2.722l.056.069c-.306.526-.742.88-1.248.88-.399 0-.814-.211-1.138-.579a2.177 2.177 0 0 1-.538-1.441V6.409H9.86l-.001 5.421Zm9.283 3.46h-2.39l2.247-3.332-2.247-3.335h2.39l2.248 3.335-2.248 3.332Zm1.593-1.286Zm-17.162-.342c-.933 0-1.68-.773-1.68-1.72s.76-1.666 1.68-1.666c.92 0 1.68.733 1.68 1.68 0 .946-.733 1.706-1.68 1.706Zm18.361-1.974L24 8.622h-2.391l-.87 1.293 1.195 1.773Zm-9.404-.466c.16-.706.72-1.133 1.493-1.133.773 0 1.373.467 1.507 1.133h-3Z'],
    mpv: ['#691F69', 'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm.312 22.775c-6.153 0-11.142-4.988-11.142-11.142S6.16.491 12.312.491c6.154 0 11.142 4.989 11.142 11.142s-4.988 11.142-11.142 11.142zm.643-20.464a8.587 8.587 0 1 0 0 17.174 8.587 8.587 0 0 0 0-17.174zm-1.113 15.257a5.517 5.517 0 1 1 0-11.034 5.517 5.517 0 0 1 0 11.034zm-1.399-7.995L14.4 11.97l-3.957 2.518V9.573z'],
    infuse: ['#FF8000', 'M18.802 7.736c0 .502-.035.8-.146 1.24a5.1 5.1 0 0 1-.968 1.932c-.176.218-.574.61-.778.764-.077.06-2.619 1.894-5.65 4.077a842 842 0 0 0-5.638 4.077 2.6 2.6 0 0 0-.55.715 2.39 2.39 0 0 0 1.003 3.18c.703.379 1.622.372 2.293-.02a2322 2322 0 0 0 11.378-8.184 6 6 0 0 0 .845-.849 4.78 4.78 0 0 0 .76-4.416 4.86 4.86 0 0 0-1.354-2.068 15 15 0 0 0-.673-.518c-.257-.185-.48-.35-.497-.361-.02-.017-.025.089-.025.43M4.31 5.62c-.903.2-1.573.844-1.822 1.75l-.066.234v7.712l.064.227c.302 1.093 1.212 1.8 2.316 1.8 1.158 0 2.12-.794 2.349-1.945.044-.223.044-7.654 0-7.877a2.5 2.5 0 0 0-.23-.656A2.38 2.38 0 0 0 5.393 5.64a3 3 0 0 0-1.083-.02M6.642.03a4.79 4.79 0 0 0-4.126 3.777c-.054.263-.124.912-.1.936a1 1 0 0 0 .208-.12 4.2 4.2 0 0 1 1.393-.572c.335-.073 1.005-.09 1.366-.037.596.089 1.104.295 1.705.698.103.07 1.913 1.376 4.02 2.902 2.107 1.529 3.884 2.804 3.95 2.837.098.049.15.058.328.058.185 0 .228-.009.352-.068.187-.091.654-.555.834-.834.882-1.341.71-3.078-.41-4.185-.143-.143-.938-.726-3.273-2.417C11.196 1.779 9.706.716 9.584.645A4.8 4.8 0 0 0 6.642.03'],
    vlc: ['#FF8800', 'M12.0319 0c-.8823 0-1.0545.136-1.0545.136-.1738.056-.3556.255-.4105.43L9.683 3.3808c.4729.1729 1.3222.4266 2.2337.4266 1.0987 0 2.017-.3494 2.3763-.5075L13.4352.566c-.055-.1755-.237-.3707-.4067-.4374 0 0-.1142-.1286-.9966-.1286zm3.5645 7.455c-.3601.34-1.3276.9373-3.6797.9373-2.2929 0-3.189-.5678-3.5213-.9113l-1.3887 4.4227c.2272.3614 1.2539 1.5594 4.8847 1.5594 3.7569 0 4.8539-1.3467 5.0649-1.6737zm-8.5897 4.4487l-1.0025 3.1922H4.3428c-.2486 0-.5097.1932-.5826.4315l-2.334 7.6317a.3962.3962 0 0 0-.0169.1537c-.0008.0053-.002.0099-.002.016 0 .0839.0233.226.0233.226.0322.2456.2612.4452.5098.4452h20.1192c.2487 0 .4768-.1994.5098-.4453 0 0 .0234-.142.0234-.226a.0245.0245 0 0 0-.0025-.01.3201.3201 0 0 0 .0024-.0313.4096.4096 0 0 0-.019-.1282l-2.3339-7.6318c-.0729-.2383-.334-.4314-.5826-.4314h-1.6636l.2005.6391c-.2407.4854-1.4886 2.38-6.3027 2.38-4.6003 0-5.8288-1.73-6.1107-2.3072z'],
  };

  /* Services absents de Simple Icons : monogramme neutre (initiales), pas d'imitation de logo. */
  const MONO = { tmdb: 'TMDB', tvdb: 'TVDB', justwatch: 'JW', bluray: 'BD', dvdcompare: 'DVD', lddb: 'LD',
    dvdfr: 'DF', criterion: 'C', allocine: 'AC', senscritique: 'SC', mediux: 'MX' };

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
    lddb: { label: 'LDDb', bg: '#a67c00', fg: '#fff',
      link(d) { return site('lddb.com', d); } },
    dvdfr: { label: 'DVDFr', bg: '#003399', fg: '#fff',
      link(d) { return site('dvdfr.com', d); } },
    criterion: { label: 'Criterion', bg: '#000000', fg: '#ffffff',
      link(d) { return `https://www.criterion.com/search?q=${q(d)}`; } },

    /* ---- Extras ---- */
    youtube: { label: 'YouTube', bg: '#ff0000', fg: '#fff',
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
    ui: { scale: 100, opacity: 100, style: 'classic', anim: true, logos: true, collapsed: false },
    versionPref: 'best',          // best | small | ask  — version lue par ▶ quand il y en a plusieurs
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
      versionPref: ['best', 'small', 'ask'].includes(s.versionPref) ? s.versionPref : DEFAULTS.versionPref,
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

  const PLEX_TV = /(^|\.)plex\.tv$/i;
  const badServers = new Set();

  /* Every URL on the page that carries a token, newest first. Anything served
     by plex.tv is skipped: that's Plex's own metadata service, not your
     library, and asking it for /library/metadata/… answers nothing. Picking
     one of those was why the column stayed invisible. */
  function serverList() {
    const urls = [];
    document.querySelectorAll('img[src*="X-Plex-Token"]').forEach(i => urls.push(i.src));
    document.querySelectorAll('[style*="X-Plex-Token"]').forEach(el => {
      const m = (el.getAttribute('style') || '').match(/url\(["']?(.*?X-Plex-Token=.*?)["']?\)/);
      if (m) urls.push(m[1]);
    });
    try {
      performance.getEntriesByType('resource').forEach(e => {
        if (e.name.includes('X-Plex-Token') && /\/(library|photo|video)\//.test(e.name)) urls.push(e.name);
      });
    } catch (e) {}

    const out = [], seen = new Set();
    for (const u of urls.reverse()) {
      try {
        const url = new URL(u, location.href);
        const token = url.searchParams.get('X-Plex-Token');
        if (!token || PLEX_TV.test(url.hostname)) continue;
        const k = url.origin + '|' + token;
        if (seen.has(k) || badServers.has(k)) continue;
        seen.add(k);
        out.push({ origin: url.origin, token });
      } catch (e) {}
    }
    return out;
  }

  /* When Plex Web is served by the server itself (127.0.0.1:32400, /web/…),
     its own address is the shortest and most reliable way in — no VPN, no
     detour. The token is the same whichever address you use, so we take the
     first one the page offers and put the local address at the front. */
  function localFirst(list) {
    const servedByPlex = location.port === '32400' || /^\/web(\/|$)/.test(location.pathname);
    if (!servedByPlex || !list.length) return list;
    if (list.some(s => s.origin === location.origin)) {
      return [list.find(s => s.origin === location.origin), ...list.filter(s => s.origin !== location.origin)];
    }
    const here = { origin: location.origin, token: list[0].token };
    return badServers.has(here.origin + '|' + here.token) ? list : [here, ...list];
  }

  function getServerInfo() {
    if (!serverInfo) serverInfo = localFirst(serverList())[0] || null;
    return serverInfo;
  }

  /** The chosen address answered nothing useful: blacklist it and take the next. */
  function dropServerInfo() {
    if (!serverInfo) return false;
    badServers.add(serverInfo.origin + '|' + serverInfo.token);
    serverInfo = null;
    return !!getServerInfo();
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

  /* ============================================================
     VERSIONS — un film / épisode peut avoir plusieurs fichiers (4K, 1080p…)
     ============================================================ */
  const kids = (el, tag) => [...el.children].filter(c => c.tagName === tag);

  function versionsOf(el) {
    const out = [];
    kids(el, 'Media').forEach(m => {
      const parts = kids(m, 'Part');
      parts.forEach((p, pi) => {
        const streams = kids(p, 'Stream');
        const vs = streams.find(x => x.getAttribute('streamType') === '1');
        const as = streams.find(x => x.getAttribute('streamType') === '2' && x.getAttribute('selected') === '1')
          || streams.find(x => x.getAttribute('streamType') === '2');
        out.push({
          partKey: p.getAttribute('key'),
          file: (p.getAttribute('file') || '').split(/[\\/]/).pop(),
          size: +p.getAttribute('size') || 0,
          res: (m.getAttribute('videoResolution') || '').toLowerCase(),
          pixels: (+m.getAttribute('width') || 0) * (+m.getAttribute('height') || 0),
          bitrate: +m.getAttribute('bitrate') || 0,
          vcodec: (m.getAttribute('videoCodec') || '').toUpperCase(),
          video: vs ? (vs.getAttribute('displayTitle') || '') : '',
          audio: as ? (as.getAttribute('displayTitle') || '') : '',
          edition: m.getAttribute('editionTitle') || m.getAttribute('title') || '',
          part: parts.length > 1 ? `partie ${pi + 1}/${parts.length}` : '',
        });
      });
    });
    labelVersions(out);
    return out;
  }

  const resLabel = r => (r === '4k' ? '4K' : /^\d+$/.test(r) ? r + 'p' : (r || '').toUpperCase());
  const gb = b => (b ? (b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' Go' : Math.round(b / 1048576) + ' Mo') : '');

  /** Nom court de chaque version ; si deux se ressemblent, on ajoute ce qui diffère dans le nom de fichier. */
  function labelVersions(vs) {
    const toks = f => f.replace(/\.[^.]+$/, '').split(/[\s._\-\[\]()]+/).filter(Boolean);
    const common = vs.length > 1 ? toks(vs[0].file).filter(t => vs.every(v => toks(v.file).includes(t))) : [];
    vs.forEach(v => {
      const main = v.video && /\d|4k|sd/i.test(v.video) ? v.video.replace(/\s*\((.*)\)$/, ' · $1') : [resLabel(v.res), v.vcodec].filter(Boolean).join(' · ');
      v.label = [main, v.edition, v.part].filter(Boolean).join(' · ');
      v.diff = toks(v.file).filter(t => !common.includes(t)).slice(0, 4).join(' ');
      v.sub = [gb(v.size), v.bitrate ? (v.bitrate / 1000).toFixed(1) + ' Mb/s' : '', v.audio].filter(Boolean).join(' · ');
    });
    const seen = {};
    vs.forEach(v => { seen[v.label] = (seen[v.label] || 0) + 1; });
    vs.forEach(v => { if (seen[v.label] > 1 && v.diff) v.label += ` · ${v.diff}`; });   // mêmes caractéristiques : on précise
    vs.forEach(v => { v.short = resLabel(v.res) || v.vcodec || 'Fichier'; });
  }

  /** La version lue par défaut : meilleure qualité, ou la plus légère. */
  function pickVersion(vs, pref) {
    if (!vs || !vs.length) return null;
    const score = v => v.pixels * 1e6 + v.bitrate;
    return [...vs].sort((a, b) => (pref === 'small' ? (a.size || score(a)) - (b.size || score(b)) : score(b) - score(a)))[0];
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
      versions: versionsOf(el),
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
      const v = pickVersion(item.versions, settings.versionPref === 'small' ? 'small' : 'best');
      // On reconstruit un jeu de variables complet : les schémas personnalisés
      // qui utilisent {title}, {season}, {episode}… continuent de fonctionner.
      const vars = templateVars({
        kind: 'episode',
        title: item.title,
        searchTitle: item.grandparentTitle || item.title,
        partKey: item.partKey,
        versions: item.versions,
        imdb: item.imdb,
        tvdbItem: item.tvdb,
        season: item.parentIndex,
        episode: item.index,
      }, v);
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
        imdb: item.imdb, tvdbItem: item.tvdb, partKey: item.partKey, versions: item.versions,
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

  function templateVars(d, version) {
    const v = version || (d ? pickVersion(d.versions, settings.versionPref) : null);
    const direct = d ? directUrl(v ? v.partKey : d.partKey) : null;
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

    #${COL_ID} .psk-grid {
      display: flex; flex-direction: column; gap: calc(7px * var(--psk-scale));
      width: calc(172px * var(--psk-scale));
    }
    .psk-btn {
      display: flex; align-items: center; gap: .55em; box-sizing: border-box;
      padding: calc(7px * var(--psk-scale)) calc(11px * var(--psk-scale));
      min-height: calc(32px * var(--psk-scale));
      border-radius: 7px; border: 1px solid rgba(0,0,0,.18);
      font-size: calc(12.5px * var(--psk-scale)); font-weight: 700; letter-spacing: .01em;
      text-decoration: none; cursor: pointer; user-select: none;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.16), 0 2px 6px rgba(0,0,0,.35);
      opacity: var(--psk-op); position: relative; will-change: transform;
    }
    .psk-btn .psk-lb { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .psk-ic { width: 1.2em; height: 1.2em; flex: 0 0 auto; display: block; }
    .psk-mono {
      flex: 0 0 auto; min-width: 1.6em; height: 1.35em; padding: 0 .25em; box-sizing: border-box;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 4px; background: rgba(0,0,0,.2); font-size: .72em; font-weight: 800; letter-spacing: .02em;
    }
    .psk-mono.long { font-size: .6em; }
    #${COL_ID}[data-anim="1"] .psk-btn, #${COL_ID}[data-anim="1"] .psk-more {
      transition: transform .16s ease, filter .16s ease, box-shadow .16s ease, opacity .16s ease;
      animation: psk-in .28s ease backwards;
    }
    @keyframes psk-in { from { transform: translateX(18px) scale(.92); opacity: 0; } to { transform: none; } }
    .psk-btn:hover { opacity: 1; transform: translateX(-3px); filter: brightness(1.12);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.2), 0 6px 18px rgba(0,0,0,.5); }
    .psk-btn:active { transform: translateX(-3px) scale(.96); }
    .psk-btn:focus-visible, .psk-more:focus-visible, .psk-open:focus-visible { outline: 2px solid #e5a00d; outline-offset: 2px; }
    .psk-btn.off { opacity: calc(var(--psk-op) * .32); filter: grayscale(.7); cursor: not-allowed; box-shadow: none; }
    .psk-btn.off:hover { transform: none; filter: grayscale(.7); }
    .psk-btn.flash { filter: brightness(1.3); }

    /* bouton ▶ + choix de version */
    #${COL_ID} .psk-split { display: flex; position: relative; }
    #${COL_ID} .psk-split .psk-btn { flex: 1; min-width: 0; }
    #${COL_ID} .psk-split:has(.psk-more) .psk-btn { border-top-right-radius: 0; border-bottom-right-radius: 0; }
    .psk-more {
      flex: 0 0 auto; width: calc(26px * var(--psk-scale)); border: 1px solid rgba(0,0,0,.18); border-left: 1px solid rgba(255,255,255,.28);
      border-radius: 0 7px 7px 0; cursor: pointer; color: #fff; font-weight: 800; font-size: calc(12px * var(--psk-scale));
      background: linear-gradient(135deg,#5b54d6,#9b59f5); opacity: var(--psk-op);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.16), 0 2px 6px rgba(0,0,0,.35);
    }
    .psk-more:hover { filter: brightness(1.15); opacity: 1; }

    /* réduire / agrandir */
    #${COL_ID} .psk-min { font-size: 18px; font-weight: 700; }
    #${COL_ID} .psk-min:hover { transform: none; }
    .psk-open {
      width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(255,255,255,.14); cursor: pointer;
      background: rgba(20,20,20,.85); color: #e5a00d; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,.45); transition: transform .15s ease, background .15s ease;
    }
    .psk-open:hover { transform: scale(1.08); background: rgba(35,35,35,.95); }
    .psk-open .psk-ic { width: 18px; height: 18px; }

    /* ---------- styles « texte » ---------- */
    #${COL_ID}.st-pill .psk-btn { border-radius: 999px; }
    #${COL_ID}.st-pill .psk-split:has(.psk-more) .psk-btn { border-radius: 999px 0 0 999px; }
    #${COL_ID}.st-pill .psk-more { border-radius: 0 999px 999px 0; }
    #${COL_ID}.st-square .psk-btn, #${COL_ID}.st-square .psk-more { border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,.4); }
    #${COL_ID}.st-glass .psk-btn, #${COL_ID}.st-glass .psk-more {
      background: rgba(15,17,23,.55) !important;
      backdrop-filter: blur(12px) saturate(1.5); -webkit-backdrop-filter: blur(12px) saturate(1.5);
      border: 1px solid rgba(255,255,255,.14);
      color: var(--psk-accent, #fff) !important;
    }
    #${COL_ID}.st-glass .psk-btn:hover { background: rgba(25,28,36,.7) !important; }
    #${COL_ID}.st-outline .psk-btn, #${COL_ID}.st-outline .psk-more {
      background: rgba(10,12,16,.4) !important;
      border: 1.5px solid var(--psk-accent, #fff);
      color: var(--psk-accent, #fff) !important;
      box-shadow: none;
    }
    #${COL_ID}.st-outline .psk-more { border-color: #9b8cff; color: #9b8cff !important; }
    #${COL_ID}.st-glass .psk-mono, #${COL_ID}.st-outline .psk-mono { background: transparent; border: 1px solid currentColor; }

    /* ---------- styles compacts : icônes seules ---------- */
    #${COL_ID}.st-circle .psk-grid, #${COL_ID}.st-tile .psk-grid {
      --sz: calc(36px * var(--psk-scale));
      width: auto; display: grid; grid-template-columns: repeat(3, var(--sz)); gap: calc(7px * var(--psk-scale));
      justify-content: end;
    }
    #${COL_ID}.st-circle .psk-btn, #${COL_ID}.st-tile .psk-btn {
      width: var(--sz); height: var(--sz); min-height: 0; padding: 0; justify-content: center;
    }
    #${COL_ID}.st-circle .psk-btn { border-radius: 50%; }
    #${COL_ID}.st-tile .psk-btn { border-radius: 8px; }
    #${COL_ID}.st-circle .psk-lb, #${COL_ID}.st-tile .psk-lb { display: none; }
    #${COL_ID}.st-circle .psk-ic, #${COL_ID}.st-tile .psk-ic { width: 52%; height: 52%; }
    #${COL_ID}.st-circle .psk-mono, #${COL_ID}.st-tile .psk-mono { background: transparent; font-size: calc(10.5px * var(--psk-scale)); min-width: 0; padding: 0; }
    #${COL_ID}.st-circle .psk-mono.long, #${COL_ID}.st-tile .psk-mono.long { font-size: calc(8.5px * var(--psk-scale)); }
    #${COL_ID}.st-circle .psk-btn:hover, #${COL_ID}.st-tile .psk-btn:hover { transform: scale(1.1); }
    #${COL_ID}.st-circle .psk-split, #${COL_ID}.st-tile .psk-split { width: var(--sz); height: var(--sz); }
    #${COL_ID}.st-circle .psk-split .psk-btn, #${COL_ID}.st-tile .psk-split .psk-btn { border-radius: inherit; }
    #${COL_ID}.st-circle .psk-split { border-radius: 50%; }
    #${COL_ID}.st-tile .psk-split { border-radius: 8px; }
    #${COL_ID}.st-circle .psk-split:has(.psk-more) .psk-btn, #${COL_ID}.st-tile .psk-split:has(.psk-more) .psk-btn { border-radius: inherit; }
    #${COL_ID}.st-circle .psk-more, #${COL_ID}.st-tile .psk-more {
      position: absolute; right: -5px; bottom: -5px; width: 17px; height: 17px; padding: 0;
      border-radius: 50%; border: 2px solid #111; font-size: 9.5px; line-height: 1; z-index: 1;
    }
    #${COL_ID}.st-circle .psk-top, #${COL_ID}.st-tile .psk-top { justify-content: flex-end; }
    #${COL_ID}.st-circle .psk-fr, #${COL_ID}.st-tile .psk-fr { flex: 0 0 auto; }

    /* ---------- menu des versions ---------- */
    .psk-menu {
      position: fixed; z-index: 2147483000; min-width: 260px; max-width: 380px; padding: 6px;
      background: #16181d; border: 1px solid #34363c; border-radius: 10px;
      box-shadow: 0 12px 34px rgba(0,0,0,.6); font: 12px -apple-system, Helvetica, Arial, sans-serif;
      animation: psk-pop .14s ease;
    }
    @keyframes psk-pop { from { opacity: 0; transform: translateX(6px); } to { opacity: 1; transform: none; } }
    .psk-menu-h { padding: 5px 8px 7px; color: #9aa0aa; font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .psk-menu-i {
      display: flex !important; flex-direction: column !important; align-items: flex-start !important;
      gap: 2px; width: 100%; text-align: left; cursor: pointer; position: static !important;
      padding: 7px 9px; border: none; border-radius: 7px; background: none; color: #eee;
      height: auto !important; min-height: 0; line-height: 1.35 !important; white-space: normal;
    }
    .psk-menu-i > span { display: block !important; position: static !important; width: 100%; }
    .psk-menu-i:hover, .psk-menu-i:focus-visible { background: #262a33; outline: none; }
    .psk-menu-i.def .psk-menu-t::after { content: '  ★ par défaut'; color: #e5a00d; font-weight: 600; font-size: 10.5px; }
    .psk-menu-t { font-weight: 700; font-size: 12.5px; }
    .psk-menu-s { color: #8b919b; font-size: 11px; }

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
      width: 18px; height: 18px; border-radius: 4px; flex: 0 0 auto; font-size: 11px;
      display: flex; align-items: center; justify-content: center; box-sizing: border-box;
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

    const min = document.createElement('button');
    min.className = 'psk-gear psk-min';
    min.textContent = '–';
    min.title = 'Réduire la colonne';
    min.addEventListener('click', () => setCollapsed(true));

    row.appendChild(wrap);
    row.appendChild(gear);
    row.appendChild(min);
    return row;
  }

  const SVGNS = 'http://www.w3.org/2000/svg';
  const GLYPHS = {   // petites icônes maison pour les boutons « outils »
    play: 'M8 5.14v13.72a1 1 0 0 0 1.53.85l10.8-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z',
    next: 'M5 5.5v13a1 1 0 0 0 1.6.8l8.4-6.5a1 1 0 0 0 0-1.6L6.6 4.7A1 1 0 0 0 5 5.5ZM17 5h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
    copy: 'M8 3h9a3 3 0 0 1 3 3v11h-2V6a1 1 0 0 0-1-1H8V3Zm-3 4h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v10h9V9H5Z',
    link: 'M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0ZM7 17a3 3 0 0 1 0-4.2l2.1-2.1 1.4 1.4-2.1 2.1a1 1 0 0 0 1.4 1.4l2.1-2.1 1.4 1.4-2.1 2.1A3 3 0 0 1 7 17Zm10-10a3 3 0 0 1 0 4.2l-2.1 2.1-1.4-1.4 2.1-2.1a1 1 0 0 0-1.4-1.4l-2.1 2.1-1.4-1.4 2.1-2.1A3 3 0 0 1 17 7Z',
  };

  function svgIcon(path) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('psk-ic');
    const pth = document.createElementNS(SVGNS, 'path');
    pth.setAttribute('d', path);
    pth.setAttribute('fill', 'currentColor');
    svg.appendChild(pth);
    return svg;
  }

  /** Logo (Simple Icons), sinon monogramme, sinon initiales du nom. */
  function iconFor(key, label) {
    if (ICONS[key]) return svgIcon(ICONS[key][1]);
    if (GLYPHS[key]) return svgIcon(GLYPHS[key]);
    const m = document.createElement('span');
    m.className = 'psk-mono';
    m.textContent = MONO[key] || (label || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();
    m.setAttribute('aria-hidden', 'true');
    if (m.textContent.length >= 3) m.classList.add('long');
    return m;
  }

  const compact = () => ['circle', 'tile'].includes(settings.ui.style);

  function makeBtn(label, bg, fg, sameTab, animIndex, iconKey) {
    const b = document.createElement('a');
    b.className = 'psk-btn';
    if (settings.ui.logos || compact()) b.appendChild(iconFor(iconKey, label));
    const t = document.createElement('span');
    t.className = 'psk-lb';
    t.textContent = label;
    b.appendChild(t);
    b.setAttribute('aria-label', label);
    b.dataset.label = label;
    if (!sameTab) { b.target = '_blank'; b.rel = 'noopener'; }
    b.style.background = bg;
    b.style.color = fg;
    b.style.setProperty('--psk-accent', accentOf(bg, fg));
    if (settings.ui.anim) b.style.animationDelay = (animIndex * 30) + 'ms';
    return b;
  }

  const setTip = (b, extra) => { b.title = b.dataset.label + (extra ? ' — ' + extra : ''); };

  function disable(b, why) {
    b.classList.add('off');
    b.removeAttribute('href');
    setTip(b, why || 'indisponible pour cet élément');
  }

  function setCollapsed(v) {
    settings.ui.collapsed = v;
    saveSettings();
    closeMenu();
    render(currentData);
  }

  /* ---------- menu des versions ---------- */
  let menuEl = null;
  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onEsc, true);
  }
  function onOutside(e) { if (menuEl && !menuEl.contains(e.target) && !e.target.closest('.psk-more')) closeMenu(); }
  function onEsc(e) { if (e.key === 'Escape') closeMenu(); }

  function openVersionMenu(anchor, data) {
    if (menuEl) return closeMenu();
    const def = pickVersion(data.versions, settings.versionPref);
    menuEl = document.createElement('div');
    menuEl.className = 'psk-menu';
    menuEl.dataset.pyroIgnore = '';     // Custom UI & co: hands off this menu
    const h = document.createElement('div');
    h.className = 'psk-menu-h';
    h.textContent = `Lire dans ${settings.player.name}`;
    menuEl.appendChild(h);
    data.versions.forEach(v => {
      const it = document.createElement('button');
      it.className = 'psk-menu-i' + (v === def && settings.versionPref !== 'ask' ? ' def' : '');
      const a = document.createElement('span'); a.className = 'psk-menu-t'; a.textContent = v.label;
      const b = document.createElement('span'); b.className = 'psk-menu-s'; b.textContent = v.sub || v.file;
      it.title = v.file;
      it.append(a, b);
      it.addEventListener('click', () => {
        const href = fillTemplate(settings.player.template, templateVars(data, v));
        closeMenu();
        if (href) openPlayerUrl(href);
      });
      menuEl.appendChild(it);
    });
    document.body.appendChild(menuEl);
    const r = anchor.getBoundingClientRect();
    menuEl.style.top = Math.max(8, Math.min(r.top, innerHeight - menuEl.offsetHeight - 8)) + 'px';
    menuEl.style.right = (innerWidth - r.left + 8) + 'px';
    setTimeout(() => {
      document.addEventListener('mousedown', onOutside, true);
      document.addEventListener('keydown', onEsc, true);
    });
  }

  function render(data) {
    currentData = data;
    const c = ensureContainer();
    c.innerHTML = '';
    if (settings.ui.collapsed) {                   // colonne réduite : un seul petit bouton
      const open = document.createElement('button');
      open.className = 'psk-open';
      open.appendChild(svgIcon(GLYPHS.link));
      open.title = 'Afficher Plex Sidekick';
      open.addEventListener('click', () => setCollapsed(false));
      c.appendChild(open);
      c.style.display = isWatching() ? 'none' : 'flex';
      return;
    }
    c.appendChild(makeTopRow());
    const grid = document.createElement('div');
    grid.className = 'psk-grid';
    c.appendChild(grid);

    const vars = templateVars(data);
    let i = 0;

    for (const key of settings.order) {
      // --- lecteur ---
      if (key === 'player') {
        if (!settings.enabled.player) continue;
        const vs = (data && data.versions) || [];
        const def = pickVersion(vs, settings.versionPref);
        const many = vs.length > 1;
        const name = settings.player.name + (many && def && settings.versionPref !== 'ask' && !compact() ? ' · ' + def.short : '');
        const b = makeBtn(name, 'linear-gradient(135deg,#3a7bd5,#9b59f5)', '#fff', true, i++, 'play');
        const href = data ? fillTemplate(settings.player.template, vars) : null;
        const wrap = document.createElement('div');
        wrap.className = 'psk-split';
        wrap.appendChild(b);
        if (href) {
          b.href = href;
          setTip(b, def ? def.label : '');
          // Les schémas d'app sont ouverts via un iframe jetable :
          // aucune navigation, la page Plex reste intacte.
          b.addEventListener('click', e => {
            e.preventDefault();
            if (many && settings.versionPref === 'ask') openVersionMenu(wrap, data);
            else openPlayerUrl(href);
          });
          if (many) {
            const more = document.createElement('button');
            more.className = 'psk-more';
            more.textContent = compact() ? String(vs.length) : '▾';
            more.title = `Choisir la version (${vs.length})`;
            more.style.animationDelay = b.style.animationDelay;
            more.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openVersionMenu(wrap, data); });
            wrap.appendChild(more);
          }
        } else disable(b, data ? 'aucun fichier lisible' : 'chargement…');
        grid.appendChild(wrap);
        continue;
      }
      // --- épisode suivant ---
      if (key === 'nextEpisode') {
        if (!settings.enabled.nextEpisode) continue;
        const b = makeBtn('Suivant', 'linear-gradient(135deg,#1f8a4c,#27ae60)', '#fff', true, i++, 'next');
        if (data && data.kind === 'episode' && data.next) {
          setTip(b, 'lire ' + epLabel(data.next) + ' dans ' + settings.player.name);
          b.href = '#';
          b.addEventListener('click', e => { e.preventDefault(); launchNextEpisode(data.next.key); });
        } else disable(b, 'pas d\'épisode suivant');
        grid.appendChild(b);
        continue;
      }
      // --- copie de l'URL directe (utile pour déboguer un lecteur) ---
      if (key === 'copyUrl') {
        if (!settings.enabled.copyUrl) continue;
        const b = makeBtn('URL directe', '#2f3640', '#dfe4ea', true, i++, 'copy');
        if (vars.rawurl) {
          setTip(b, 'copier le lien du fichier');
          b.href = '#';
          b.addEventListener('click', e => {
            e.preventDefault();
            copyText(vars.rawurl, ok => {
              const lb = b.querySelector('.psk-lb');
              const old = lb.textContent;
              lb.textContent = ok ? '✓ Copiée' : '✕ Échec';
              b.classList.add('flash');
              setTimeout(() => { lb.textContent = old; b.classList.remove('flash'); }, 1300);
            });
          });
        } else disable(b);
        grid.appendChild(b);
        continue;
      }
      // --- services intégrés ---
      if (SERVICES[key]) {
        if (!settings.enabled[key]) continue;
        const s = SERVICES[key];
        const b = makeBtn(s.label, s.bg, s.fg, false, i++, key);
        const href = data ? s.link(data) : null;
        if (href) { b.href = href; setTip(b, href.replace(/^https?:\/\/(www\.)?/, '').split(/[/?]/)[0]); }
        else disable(b);
        grid.appendChild(b);
        continue;
      }
      // --- services personnalisés ---
      const svc = settings.custom.find(x => x.id === key);
      if (svc && svc.enabled !== false) {
        const b = makeBtn(svc.name, svc.bg || '#333', svc.fg || '#fff', false, i++, svc.id);
        const href = data ? fillTemplate(svc.template, vars) : null;
        if (href) { b.href = href; setTip(b, href); }
        else disable(b);
        grid.appendChild(b);
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
          <optgroup label="Boutons avec texte">
            <option value="classic">Classique</option>
            <option value="pill">Pilule</option>
            <option value="square">Carré</option>
            <option value="glass">Verre</option>
            <option value="outline">Contour</option>
          </optgroup>
          <optgroup label="Icônes seules (compact)">
            <option value="circle">Cercles</option>
            <option value="tile">Petits carrés</option>
          </optgroup>
        </select></div>
      <div class="psk-row"><label>Logos</label>
        <input type="checkbox" class="psk-logos"><span class="psk-hint" style="margin:0">dans les boutons avec texte</span></div>
      <div class="psk-row"><label>Animations</label>
        <input type="checkbox" class="psk-anim"></div>
      <div class="psk-hint">Aperçu en direct sur la colonne à droite. Le bouton <b>–</b> réduit la colonne à une pastille, un clic dessus la rouvre.
        Logos : <a href="https://simpleicons.org" target="_blank" rel="noopener" style="color:#c9cdd4">Simple Icons</a> (intégrés au script, ils ne peuvent pas disparaître) ; les autres services ont un monogramme.</div>

      <div class="psk-sec">Lecteur local</div>
      <div class="psk-row"><label>Préréglage</label><select class="psk-preset">${buildPresetOptions()}</select></div>
      <div class="psk-row"><label>Nom</label><input type="text" class="psk-pname"></div>
      <div class="psk-row"><label>Schéma</label><input type="text" class="psk-ptpl" spellcheck="false"></div>
      <div class="psk-row"><label>Version</label>
        <select class="psk-vpref">
          <option value="best">Meilleure qualité (4K avant 1080p)</option>
          <option value="small">La plus légère</option>
          <option value="ask">Demander à chaque fois</option>
        </select></div>
      <div class="psk-hint">Quand un film a plusieurs versions (4K, 1080p…), ▶ lit celle choisie ici ; la flèche ▾ à côté permet toujours d'en choisir une autre.</div>
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
        placeholder="http://localhost:7878/movie/{tmdb}"></div>
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
    const logos = p.querySelector('.psk-logos');
    const vpref = p.querySelector('.psk-vpref');
    logos.checked = settings.ui.logos !== false;
    vpref.value = settings.versionPref;
    logos.addEventListener('change', () => { settings.ui.logos = logos.checked; saveSettings(); render(currentData); });
    vpref.addEventListener('change', () => { settings.versionPref = vpref.value; saveSettings(); render(currentData); });

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
      settings.ui.style = styleSel.value; saveSettings(); applyAppearance(); render(currentData);
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
        dot.style.color = key === 'player' || key === 'nextEpisode' ? '#fff' : SERVICES[key] ? SERVICES[key].fg : '#fff';
        dot.appendChild(iconFor(key === 'player' ? 'play' : key === 'nextEpisode' ? 'next' : key === 'copyUrl' ? 'copy' : key, name));
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
  // Typing PSK() in the browser console says what the column is up to.
  window.PSK = () => JSON.stringify({
    version: "6.0.4",
    key: getRatingKey(),
    lastKey,
    server: !!getServerInfo(),
    data: currentData ? { kind: currentData.kind, versions: (currentData.versions || []).length } : currentData,
    cached: getRatingKey() in cache ? !!cache[getRatingKey()] : 'no',
    collapsed: !!settings.ui.collapsed,
    watching: isWatching(),
    column: (() => { const c = document.getElementById(COL_ID); return c ? (getComputedStyle(c).display + ' @' + Math.round(c.getBoundingClientRect().top)) : 'absent'; })(),
  });

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
      if (getRatingKey() !== key) return;
      if (!data) {                         // that address answered nothing: try the next one
        removeContainer();
        if (dropServerInfo()) { delete cache[key]; lastKey = null; update(); }
        else cache[key] = null;
        return;
      }
      cache[key] = data;
      render(data);
    });
  }

  window.addEventListener('hashchange', () => update());
  new MutationObserver(() => update()).observe(document.body, { childList: true, subtree: true });
  update();
})();
