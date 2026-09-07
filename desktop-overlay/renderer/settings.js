// Settings window — the ONE place these controls live now (see the gear
// icon in index.html, which just calls window.dyrelog.openSettings()
// instead of swapping to an in-card panel). Every change here calls
// save-settings immediately (no Done/Save button, there's nothing to
// commit, each control applies itself as you move it) and main.js
// broadcasts the result back out to the mini-mode window over
// "settings-update" so it stays in sync live, see onSettingsUpdate() in
// app.js.
(function () {
  "use strict";

  // Mirrors class-colors.csv at the project root, same list app.js uses
  // for its own color lookup, see the "Your class" / class-color settings.
  // "" (None) is a real, selectable choice, not just a placeholder, since
  // not everyone wants to declare a class at all.
  var EQ_CLASSES = [
    "Berserker", "Warrior", "Cleric", "Bard", "Paladin", "Necromancer",
    "Ranger", "Druid", "Monk", "Beastlord", "Magician", "Shaman",
    "Rogue", "Shadow Knight", "Wizard", "Enchanter"
  ];
  // Mirrors EQ_CLASS_COLORS in app.js, the built-in default for any class
  // whose color hasn't been manually customized below.
  var EQ_CLASS_COLORS = {
    Berserker: "#ce0016", Warrior: "#a74a2d", Cleric: "#ac913a", Bard: "#f55a02",
    Paladin: "#9c7c03", Necromancer: "#8c8309", Ranger: "#7ba208", Druid: "#09853d",
    Monk: "#019a98", Beastlord: "#04764c", Magician: "#08a2c4", Shaman: "#0b80c8",
    Rogue: "#5569ee", "Shadow Knight": "#7c49c9", Wizard: "#a138b1", Enchanter: "#dd4ca3"
  };

  // Mirrors style.css's --pet-default and app.js's colorForRow() defaults,
  // used only to show a sensible starting swatch in the three color
  // pickers below when no override is saved yet; the actual fallback
  // logic (rank1 vs. class color vs. this) still lives in app.js.
  var THEME_BG = {
    blue: "#14120f", brass: "#1c130b", druidic: "#10160f", magical: "#140f22",
    girly: "#1c1017", hardcore: "#0d0b0b", metal: "#15171a"
  };
  var THEME_INK = {
    blue: "#f2ede1", brass: "#f2e2c4", druidic: "#e8f0dd", magical: "#ece6fb",
    girly: "#fbe6ef", hardcore: "#f3e6e6", metal: "#e6e9ec"
  };
  // Mirrors each theme's own --ink-2 in style.css, the sensible starting
  // swatch for the "Timer / dps / status" picker, which overrides
  // --ink-2/--ink-3 together (see applySettings() in app.js).
  var THEME_INK2 = {
    blue: "#a89f8d", brass: "#cbad83", druidic: "#9ec288", magical: "#b39cdf",
    girly: "#e2a0c0", hardcore: "#b87a7a", metal: "#9aa3ac"
  };
  // Mirrors each theme's own --hair in style.css, the sensible starting
  // swatch for the Border color picker.
  var THEME_HAIR = {
    blue: "#2c2a24", brass: "#3a2a1a", druidic: "#253a20", magical: "#302352",
    girly: "#3d2430", hardcore: "#2e1414", metal: "#33373d"
  };
  // Mirrors each theme's own --accent in style.css — the real overlay's
  // dps-number/circle-badge color, which is NOT the same thing as this
  // Settings window's own chrome accent (--accent in settings.css, a fixed
  // gold #f3d17e used for tab underlines/buttons regardless of overlay
  // theme, matching the website's own dusk gold/purple pass). The live
  // preview's dps numbers and Circle border need the OVERLAY's accent to
  // actually look like what each theme produces in-game.
  var THEME_ACCENT = {
    blue: "#4c8bf5", brass: "#c9922e", druidic: "#7fb238", magical: "#9b6bf2",
    girly: "#f24ea0", hardcore: "#e31c1c", metal: "#7d92a8"
  };
  // "i'd want the entire window to change themes, not just the text" — this
  // window's whole palette (background, cards, borders, ink, accent) now
  // switches with whichever theme is picked in Appearance > Color, not just
  // the accent. Each theme's tokens are hand-picked to fit its own hue (a
  // warm brass brown, a green druidic dark, etc.) while keeping the same
  // ink-on-dark contrast relationships the "blue" default already had —
  // "blue" here matches settings.css's own :root defaults exactly, so
  // nothing changes if a fresh install never touches the theme picker.
  var SETTINGS_THEME_PALETTE = {
    blue: {
      bg: "#0e1015", bgCard: "#151922", bgElevated: "#1b202b",
      hair: "#262c39", hairStrong: "#333c4d",
      ink: "#f3f5f9", ink2: "#b3bcce", ink3: "#8992a6",
      // Gold/purple (gold-2/arcane-2), same tokens the website's dusk pass
      // uses, in place of the old blue/teal — "apply similar color
      // scheming to the overlay settings/leaderboards/options etc."
      accent: "#f3d17e", accent2: "#c9b6f2", accentInk: "#241703"
    },
    brass: {
      bg: "#15100a", bgCard: "#1e160d", bgElevated: "#271d10",
      hair: "#3a2c17", hairStrong: "#4d3b1e",
      ink: "#f7efe0", ink2: "#d3bd97", ink3: "#a68c65",
      accent: "#e0a53f", accent2: "#c9922e", accentInk: "#1f1206"
    },
    druidic: {
      bg: "#0b100a", bgCard: "#111a0e", bgElevated: "#182513",
      hair: "#233a1c", hairStrong: "#2e4a24",
      ink: "#eef7e6", ink2: "#b9d1a8", ink3: "#8fac7c",
      accent: "#7fc23f", accent2: "#4fd18a", accentInk: "#0a1406"
    },
    magical: {
      bg: "#0f0c17", bgCard: "#171227", bgElevated: "#1f1832",
      hair: "#2e2547", hairStrong: "#3c305c",
      ink: "#f2eefc", ink2: "#c7b9e8", ink3: "#9c8bc4",
      accent: "#a778f5", accent2: "#c98af0", accentInk: "#140b24"
    },
    girly: {
      bg: "#150c11", bgCard: "#20121a", bgElevated: "#2b1723",
      hair: "#452132", hairStrong: "#5c2b41",
      ink: "#fdeef5", ink2: "#e8b8d0", ink3: "#c98cab",
      accent: "#f2549e", accent2: "#ffa5cf", accentInk: "#2b0a18"
    },
    hardcore: {
      bg: "#0d0a0a", bgCard: "#160f0f", bgElevated: "#1f1414",
      hair: "#3a1e1e", hairStrong: "#4d2727",
      ink: "#fbeaea", ink2: "#e0a5a5", ink3: "#b87a7a",
      accent: "#e6483f", accent2: "#ff7a5c", accentInk: "#210808"
    },
    metal: {
      bg: "#0f1113", bgCard: "#181b1e", bgElevated: "#212528",
      hair: "#2d3236", hairStrong: "#3c4348",
      ink: "#f2f4f5", ink2: "#c3ccd2", ink3: "#93a0a8",
      accent: "#8ea3ba", accent2: "#5fd3c4", accentInk: "#0c1114"
    }
  };
  function applyWindowTheme(themeKey) {
    var p = SETTINGS_THEME_PALETTE[themeKey] || SETTINGS_THEME_PALETTE.blue;
    var root = document.documentElement.style;
    root.setProperty("--bg", p.bg);
    root.setProperty("--bg-card", p.bgCard);
    root.setProperty("--bg-elevated", p.bgElevated);
    root.setProperty("--hair", p.hair);
    root.setProperty("--hair-strong", p.hairStrong);
    root.setProperty("--ink", p.ink);
    root.setProperty("--ink-2", p.ink2);
    root.setProperty("--ink-3", p.ink3);
    root.setProperty("--accent", p.accent);
    root.setProperty("--accent-2", p.accent2);
    root.setProperty("--accent-ink", p.accentInk);
  }
  var DEFAULT_MY_COLOR = "#b3423a"; // --rank1
  var DEFAULT_PET_COLOR = "#4fa8c9"; // --pet-default

  // Rough visual stand-ins for app.js's own FONT_STACKS, just for the live
  // preview below, not loaded as real web fonts here (Settings has no font
  // <link> tags), so anything beyond the system default falls back to its
  // generic family if the exact face isn't already on the machine, which
  // is still enough to show "this looks different" at a glance.
  var FONT_STACKS = {
    system: "inherit",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "'IBM Plex Mono', Consolas, monospace",
    rounded: "'Varela Round', 'Segoe UI', sans-serif",
    fantasy: "Cinzel, Georgia, serif",
    medieval: "MedievalSharp, Georgia, serif",
    scifi: "Orbitron, 'Segoe UI', sans-serif",
    pixel: "'Press Start 2P', monospace"
  };

  var GITHUB_URL = "https://github.com/dyremoon/dyrelog";
  var WEBSITE_URL = "https://dyrelog.pages.dev";
  var FEEDBACK_URL = "https://github.com/dyremoon/dyrelog/issues/new";

  var els = {
    opacity: document.getElementById("set-opacity"),
    barHeight: document.getElementById("set-barheight"),
    textScale: document.getElementById("set-textscale"),
    iconScale: document.getElementById("set-iconscale"),
    miniPetScale: document.getElementById("set-minipetscale"),
    secondaryTextScale: document.getElementById("set-secondarytextscale"),
    timerTextScale: document.getElementById("set-timertextscale"),
    circleScale: document.getElementById("set-circlescale"),
    bgColor: document.getElementById("set-bgcolor"),
    textColor: document.getElementById("set-textcolor"),
    myBarColor: document.getElementById("set-mybarcolor"),
    petBarColor: document.getElementById("set-petbarcolor"),
    borderColor: document.getElementById("set-bordercolor"),
    resetColors: document.getElementById("btn-reset-colors"),
    secondaryTextColor: document.getElementById("set-secondarytextcolor"),
    myNameTextColor: document.getElementById("set-mynametextcolor"),
    petNameTextColor: document.getElementById("set-petnametextcolor"),
    dpsTextColor: document.getElementById("set-dpstextcolor"),
    totalDpsColor: document.getElementById("set-totaldpscolor"),
    resetTextColors: document.getElementById("btn-reset-textcolors"),
    // "Add color options to edit the circle colors: border, background,
    // text colors" (Sept 6) — Circle display style never had any color
    // customization at all before this, always the theme's own --bg-card/
    // --accent/--ink-3, unlike Bars above. See circleBgColor/
    // circleBorderColor/circleTextColor in main.js's DEFAULT_SETTINGS.
    circleBgColor: document.getElementById("set-circlebgcolor"),
    circleBorderColor: document.getElementById("set-circlebordercolor"),
    circleTextColor: document.getElementById("set-circletextcolor"),
    resetCircleColors: document.getElementById("btn-reset-circlecolors"),
    font: document.getElementById("set-font"),
    classColors: document.getElementById("set-classcolors"),
    myClass: document.getElementById("set-myclass"),
    classColorGrid: document.getElementById("class-color-grid"),
    resetClassColors: document.getElementById("btn-reset-classcolors"),
    showPets: document.getElementById("set-showpets"),
    fadeIdle: document.getElementById("set-fadeidle"),
    fadeIdleRow: document.getElementById("fadeidle-row"),
    fadeIdleSecs: document.getElementById("set-fadeidle-secs"),
    fadeIdleSecsVal: document.getElementById("fadeidle-secs-val"),
    keepInTray: document.getElementById("set-keepintray"),
    keepInTrayHint: document.getElementById("keepintray-hint"),
    launchAtStartup: document.getElementById("set-launchatstartup"),
    changelog: document.getElementById("changelog"),
    whatsnewVersion: document.getElementById("whatsnew-version"),
    whatsnewGithub: document.getElementById("whatsnew-github"),
    footerVersion: document.getElementById("footer-version"),
    footerGithub: document.getElementById("footer-github"),
    uiScale: document.getElementById("set-uiscale"),
    siteLink: document.getElementById("header-website"),
    feedbackLink: document.getElementById("feedback-link"),
    search: document.getElementById("settings-search"),
    previewFrame: document.getElementById("preview-frame"),
    previewFrameMini: document.getElementById("preview-frame-mini"),
    previewCircle: document.getElementById("preview-circle"),
    previewFillYou: document.getElementById("preview-fill-you"),
    previewFillPet: document.getElementById("preview-fill-pet"),
    previewRowPet: document.getElementById("preview-row-pet"),
    previewDpsYou: document.getElementById("preview-dps-you"),
    previewDpsPet: document.getElementById("preview-dps-pet"),
    previewTotal: document.getElementById("preview-total"),
    previewMiniDps: document.getElementById("preview-mini-dps"),
    previewMiniPetRow: document.getElementById("preview-mini-pet-row"),
    previewMiniPetDps: document.getElementById("preview-mini-pet-dps"),
    previewCircleDpsNum: document.getElementById("preview-circle-dps-num"),
    sourceHint: document.getElementById("source-hint"),
    sourceHintText: document.getElementById("source-hint-text"),
    pickFileBtn: document.getElementById("btn-settings-pick-file"),
    pickFolderBtn: document.getElementById("btn-settings-pick-folder"),
    folderPickRow: document.getElementById("settings-folder-pick"),
    folderSelect: document.getElementById("settings-folder-select"),
    folderUseBtn: document.getElementById("btn-settings-folder-use"),
    accountHint: document.getElementById("account-hint"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout")
  };

  // ---- tabs -----------------------------------------------------------
  // Wired FIRST, before anything below that could throw and leave the rest
  // of this file never running, tabs not switching turned out to be
  // exactly that failure mode once before, so nothing about tab-switching
  // depends on any later code in this file succeeding.
  //
  // Plain show/hide, no per-tab state to preserve (every control here
  // saves itself immediately, see save() below), so there's nothing more
  // to it than swapping which <section> is visible.
  function activateTab(target) {
    document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === target); });
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      panel.hidden = panel.dataset.tabPanel !== target;
    });
  }
  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () { activateTab(btn.dataset.tab); });
  });

  // "Have a text size option for the settings menu too" — scales every
  // font-size in settings.css at once (they're all in rem now) by setting
  // the root font-size; nothing else about layout changes. Separate from,
  // and doesn't affect, the main overlay's own Text size slider under
  // Appearance below (that one sizes the in-game overlay itself).
  var BASE_UI_FONT_PX = 13.5;
  els.uiScale.addEventListener("change", function () {
    var scale = parseFloat(els.uiScale.value);
    document.documentElement.style.fontSize = (BASE_UI_FONT_PX * scale) + "px";
    save({ settingsTextScale: scale });
  });

  // External links, gated the same way main.js's own allowlist is, this is
  // just belt-and-suspenders on the renderer side; main.js is what
  // actually enforces it.
  function wireExternalLink(el, url) {
    el.href = url;
    el.addEventListener("click", function (e) {
      e.preventDefault();
      window.dyrelog.openExternal(url);
    });
  }
  wireExternalLink(els.siteLink, WEBSITE_URL);
  wireExternalLink(els.feedbackLink, FEEDBACK_URL);
  document.querySelectorAll(".credit-link").forEach(function (a) {
    wireExternalLink(a, a.dataset.url);
  });

  // "None" first, then every real class, plain text, not a typed field,
  // per the same "we dont want manually typing" instinct behind the
  // website's own class picker.
  els.myClass.innerHTML =
    '<option value="">None</option>' +
    EQ_CLASSES.map(function (c) { return '<option value="' + c + '">' + c + "</option>"; }).join("");

  var currentSettings = {}; // kept around so the class-color grid's per-swatch handler can merge into it

  // One swatch per class, built once; applyToUI() below just updates each
  // input's .value on every settings refresh rather than rebuilding this
  // grid from scratch.
  els.classColorGrid.innerHTML = EQ_CLASSES.map(function (c) {
    var id = "classcolor-" + c.replace(/\s+/g, "");
    return (
      '<label class="class-color-row" for="' + id + '">' + c +
      '<input type="color" id="' + id + '" data-class="' + c + '"></label>'
    );
  }).join("");
  els.classColorGrid.querySelectorAll("input[type=color]").forEach(function (input) {
    input.addEventListener("input", function () {
      var overrides = Object.assign({}, currentSettings.classColorOverrides || {});
      overrides[input.dataset.class] = input.value;
      save({ classColorOverrides: overrides });
    });
  });

  // "I want to be able to test the visuals without having a log in" — two
  // made-up rows (Bars and Mini-bar), redrawn from the same settings object
  // every real bar already reads, so every slider and color pick shows a
  // visible result immediately, even with no log loaded and no fight in
  // progress. The mock numbers themselves are fixed (You 842 dps, Pet 211
  // dps), only the styling reacts to settings — this is a look-and-feel
  // preview, not a fight simulator.
  var PREVIEW_YOU_DPS = 842;
  var PREVIEW_PET_DPS = 211;
  function renderPreview(s) {
    var theme = s.theme || "blue";
    var myColor =
      s.classColorsEnabled && s.myClass
        ? (s.classColorOverrides || {})[s.myClass] || EQ_CLASS_COLORS[s.myClass] || DEFAULT_MY_COLOR
        : s.myBarColor || DEFAULT_MY_COLOR;
    var textColor = s.textColor || THEME_INK[theme];
    // Name TEXT color is its own separate setting from the bar/dot color
    // above (see app.js's colorForRow() vs. nameColorForRow()) — defaults
    // to the same neutral text every other row uses, only overridden by
    // Text colors > My name / Pet name. The old preview conflated these
    // two (colored the name with the bar color), which never matched what
    // the real overlay actually shows.
    var myNameColor = s.myNameTextColor || textColor;
    var petNameColor = s.petNameTextColor || textColor;
    var accent = THEME_ACCENT[theme] || THEME_ACCENT.blue;
    var showPets = s.showPets !== false;
    // Off folds the pet's mock damage back into You's own number, same as
    // the real meter does, so the preview actually demonstrates the toggle
    // instead of just hiding a row that still doesn't add up.
    var youDps = showPets ? PREVIEW_YOU_DPS : PREVIEW_YOU_DPS + PREVIEW_PET_DPS;
    var bgAlpha = s.opacity != null ? s.opacity : 1;

    [els.previewFrame, els.previewFrameMini, els.previewCircle].forEach(function (frame) {
      if (!frame) return;
      // Only the background fades with the Background slider (--preview-bg-alpha,
      // consumed by settings.css's color-mix()) — text/bars/icons stay fully
      // opaque, same as the real overlay's own panel opacity behavior. The
      // Circle preview reads several of these too (accent, secondary color,
      // circle scale) even though it ignores bar/text-scale ones entirely.
      frame.style.setProperty("--preview-bg-color", s.bgColor || THEME_BG[theme]);
      frame.style.setProperty("--preview-bg-alpha", String(bgAlpha));
      frame.style.setProperty("--preview-text", textColor);
      frame.style.setProperty("--preview-border", s.borderColor || THEME_HAIR[theme]);
      frame.style.setProperty("--preview-my-color", myColor);
      frame.style.setProperty("--preview-pet-color", s.petBarColor || DEFAULT_PET_COLOR);
      frame.style.setProperty("--preview-my-name-color", myNameColor);
      frame.style.setProperty("--preview-pet-name-color", petNameColor);
      frame.style.setProperty("--preview-secondary-color", s.secondaryTextColor || THEME_INK2[theme]);
      frame.style.setProperty("--preview-dps-color", s.dpsTextColor || textColor);
      frame.style.setProperty("--preview-total-color", s.totalDpsColor || accent);
      frame.style.setProperty("--preview-accent", accent);
      frame.style.setProperty("--preview-barheight", String(s.barHeight != null ? s.barHeight : 1));
      frame.style.setProperty("--preview-textscale", String(s.textScale || 1));
      frame.style.setProperty("--preview-secondaryscale", String(s.secondaryTextScale != null ? s.secondaryTextScale : 1));
      frame.style.setProperty("--preview-timerscale", String(s.timerTextScale != null ? s.timerTextScale : 1));
      frame.style.setProperty("--preview-minipetscale", String(s.miniPetTextScale != null ? s.miniPetTextScale : 1));
      frame.style.setProperty("--preview-circlescale", String(s.circleScale != null ? s.circleScale : 1));
      frame.style.setProperty("--preview-font", FONT_STACKS[s.fontFamily || "system"] || "inherit");
    });
    // Circle's own colors (Sept 6) — separate variables from the shared
    // --preview-bg-color/--preview-accent/--preview-secondary-color above,
    // which is what Bars/Mini-bar still use unchanged; falls back to those
    // same three so the Circle preview looks exactly as it did before until
    // one of its own three pickers is actually touched.
    if (els.previewCircle) {
      els.previewCircle.style.setProperty("--preview-circle-bg", s.circleBgColor || s.bgColor || THEME_BG[theme]);
      els.previewCircle.style.setProperty("--preview-circle-border", s.circleBorderColor || accent);
      els.previewCircle.style.setProperty("--preview-circle-text", s.circleTextColor || accent);
    }

    // Bars preview — You is rank 1, so its fill spans the full row; Pet's
    // fill is scaled to its actual share of You's dps (roughly a quarter
    // width here, not a copy-pasted full bar), and its row disappears
    // entirely (rather than sitting at 0 width) when Show pets is off. The
    // "dps"/"total" unit labels are static markup now (see settings.html),
    // so only the bare numbers get written here.
    els.previewFillYou.style.width = "100%";
    els.previewDpsYou.textContent = String(youDps);
    // Total damage is now the mob-line's ONLY figure (item 3 — bar rows are
    // dps-only, see .preview-row's amount below), flat-formatted same as
    // the real fmtNum() — a representative mock total, not derived from
    // any real fight length.
    els.previewTotal.textContent = "· " + (youDps * 27).toLocaleString();
    if (showPets) {
      els.previewRowPet.style.display = "";
      els.previewFillPet.style.width = Math.round((PREVIEW_PET_DPS / PREVIEW_YOU_DPS) * 100) + "%";
      els.previewDpsPet.textContent = String(PREVIEW_PET_DPS);
    } else {
      els.previewRowPet.style.display = "none";
    }

    // Mini-bar preview — same fold-together behavior for the pet sub-line,
    // and (unlike the old code) only the number gets rewritten, not the
    // whole row's textContent, which used to wipe out the name span next
    // to it.
    els.previewMiniDps.textContent = String(youDps);
    if (showPets) {
      els.previewMiniPetRow.style.display = "";
      els.previewMiniPetDps.textContent = PREVIEW_PET_DPS + " dps";
    } else {
      els.previewMiniPetRow.style.display = "none";
    }

    // Circle preview — always your own combined number, same as the real
    // watch-badge, which has no separate pet display at all.
    els.previewCircleDpsNum.textContent = String(youDps);
  }

  // "Live preview doesn't get affected by Fade UI when idle, it should" —
  // mirrors the real overlay's own idle-fade exactly: any mouse movement,
  // click, or control interaction anywhere in this window resets the
  // clock, and once fadeIdleSeconds pass with no activity, .preview-idle
  // goes on both preview frames (settings.css fades their header/rank
  // numbers, same as the live overlay). Keyed off idle TIME, not a hover
  // pseudo-class, since that's what the real feature does too.
  // Only the Bars preview participates — the real overlay's idle-fade
  // never touches mini mode or the Circle badge either (see style.css's
  // body.idle-faded rule, which only targets .header/.mob-line/.fight-
  // timer/.dps-number/.bar-row .rank/.pet-tag, none of which mini or
  // watch mode show in the first place).
  var idleFadeTimer = null;
  function scheduleIdlePreviewFade() {
    clearTimeout(idleFadeTimer);
    if (els.previewFrame) els.previewFrame.classList.remove("preview-idle");
    if (!currentSettings.fadeIdleEnabled) return;
    var secs = currentSettings.fadeIdleSeconds != null ? currentSettings.fadeIdleSeconds : 10;
    idleFadeTimer = setTimeout(function () {
      if (els.previewFrame) els.previewFrame.classList.add("preview-idle");
    }, secs * 1000);
  }
  ["mousemove", "mousedown", "keydown", "input", "click"].forEach(function (evt) {
    document.addEventListener(evt, scheduleIdlePreviewFade, { passive: true });
  });

  function applyToUI(s) {
    currentSettings = s;
    els.opacity.value = s.opacity;
    els.barHeight.value = s.barHeight != null ? s.barHeight : 1;
    els.textScale.value = s.textScale;
    els.iconScale.value = s.iconScale != null ? s.iconScale : 1;
    els.miniPetScale.value = s.miniPetTextScale != null ? s.miniPetTextScale : 1;
    els.secondaryTextScale.value = s.secondaryTextScale != null ? s.secondaryTextScale : 1;
    els.timerTextScale.value = s.timerTextScale != null ? s.timerTextScale : 1;
    els.circleScale.value = s.circleScale != null ? s.circleScale : 1;
    els.bgColor.value = s.bgColor || THEME_BG[s.theme || "blue"];
    els.textColor.value = s.textColor || THEME_INK[s.theme || "blue"];
    els.myBarColor.value = s.myBarColor || DEFAULT_MY_COLOR;
    els.petBarColor.value = s.petBarColor || DEFAULT_PET_COLOR;
    els.borderColor.value = s.borderColor || THEME_HAIR[s.theme || "blue"];
    els.secondaryTextColor.value = s.secondaryTextColor || THEME_INK2[s.theme || "blue"];
    els.myNameTextColor.value = s.myNameTextColor || THEME_INK[s.theme || "blue"];
    els.petNameTextColor.value = s.petNameTextColor || THEME_INK[s.theme || "blue"];
    els.dpsTextColor.value = s.dpsTextColor || THEME_INK[s.theme || "blue"];
    els.totalDpsColor.value = s.totalDpsColor || THEME_ACCENT[s.theme || "blue"];
    els.circleBgColor.value = s.circleBgColor || THEME_BG[s.theme || "blue"];
    els.circleBorderColor.value = s.circleBorderColor || THEME_ACCENT[s.theme || "blue"];
    els.circleTextColor.value = s.circleTextColor || THEME_ACCENT[s.theme || "blue"];
    els.font.value = s.fontFamily || "system";
    els.classColors.checked = !!s.classColorsEnabled;
    // The class dropdown used to be disabled unless "Use class colors" was
    // on, item 1 asks for a real "select your class" section, which only
    // makes sense if picking a class works on its own, so it's always
    // enabled now; the checkbox below it just decides whether that class
    // also recolors your bar.
    els.myClass.value = s.myClass || "";
    var overrides = s.classColorOverrides || {};
    els.classColorGrid.querySelectorAll("input[type=color]").forEach(function (input) {
      input.value = overrides[input.dataset.class] || EQ_CLASS_COLORS[input.dataset.class];
    });
    els.showPets.checked = s.showPets !== false;
    els.fadeIdle.checked = !!s.fadeIdleEnabled;
    els.fadeIdleRow.hidden = !s.fadeIdleEnabled;
    els.fadeIdleSecs.value = s.fadeIdleSeconds != null ? s.fadeIdleSeconds : 10;
    els.fadeIdleSecsVal.textContent = els.fadeIdleSecs.value + "s";
    els.keepInTray.checked = !!s.keepInTrayOnClose;
    els.keepInTrayHint.textContent = s.keepInTrayOnClose
      ? "Closing the window keeps Dyrelog running in the system tray, use its icon to reopen or quit for real."
      : "Closing the window quits Dyrelog and closes its overlays.";
    els.launchAtStartup.checked = !!s.launchAtStartup;
    document.querySelectorAll(".theme-swatch").forEach(function (b) {
      b.classList.toggle("active", b.dataset.theme === (s.theme || "blue"));
    });
    document.querySelectorAll("#settings-display-style .segment").forEach(function (b) {
      b.classList.toggle("active", b.dataset.style === (s.displayStyle || "bars"));
    });
    document.querySelectorAll("#settings-auto-toggles .segment").forEach(function (b) {
      b.classList.toggle("active", b.dataset.mode === s.autoSubmitMode);
    });
    var uiScale = s.settingsTextScale || 1;
    els.uiScale.value = String(uiScale);
    document.documentElement.style.fontSize = (BASE_UI_FONT_PX * uiScale) + "px";
    // "i'd want the entire window to change themes, not just the text" —
    // this window's whole palette (background, cards, borders, ink, accent)
    // now follows the picked theme, not just the accent. (Leaderboards/
    // Analysis windows aren't wired to this yet, that's still open, see the
    // chat reply this shipped with.)
    applyWindowTheme(s.theme || "blue");
    renderPreview(s);
    scheduleIdlePreviewFade(); // any settings refresh counts as activity, same as touching a control
  }

  function save(partial) {
    window.dyrelog.saveSettings(partial).then(applyToUI);
  }

  els.opacity.addEventListener("input", function () { save({ opacity: parseFloat(els.opacity.value) }); });
  els.barHeight.addEventListener("input", function () { save({ barHeight: parseFloat(els.barHeight.value) }); });
  els.textScale.addEventListener("input", function () { save({ textScale: parseFloat(els.textScale.value) }); });
  els.iconScale.addEventListener("input", function () { save({ iconScale: parseFloat(els.iconScale.value) }); });
  els.miniPetScale.addEventListener("input", function () { save({ miniPetTextScale: parseFloat(els.miniPetScale.value) }); });
  els.secondaryTextScale.addEventListener("input", function () { save({ secondaryTextScale: parseFloat(els.secondaryTextScale.value) }); });
  els.timerTextScale.addEventListener("input", function () { save({ timerTextScale: parseFloat(els.timerTextScale.value) }); });
  els.circleScale.addEventListener("input", function () { save({ circleScale: parseFloat(els.circleScale.value) }); });
  els.bgColor.addEventListener("input", function () { save({ bgColor: els.bgColor.value }); });
  els.textColor.addEventListener("input", function () { save({ textColor: els.textColor.value }); });
  els.myBarColor.addEventListener("input", function () { save({ myBarColor: els.myBarColor.value }); });
  els.petBarColor.addEventListener("input", function () { save({ petBarColor: els.petBarColor.value }); });
  els.borderColor.addEventListener("input", function () { save({ borderColor: els.borderColor.value }); });
  els.resetColors.addEventListener("click", function () {
    save({ bgColor: null, textColor: null, myBarColor: null, petBarColor: null, borderColor: null, theme: "blue" });
  });
  els.secondaryTextColor.addEventListener("input", function () { save({ secondaryTextColor: els.secondaryTextColor.value }); });
  els.myNameTextColor.addEventListener("input", function () { save({ myNameTextColor: els.myNameTextColor.value }); });
  els.petNameTextColor.addEventListener("input", function () { save({ petNameTextColor: els.petNameTextColor.value }); });
  els.dpsTextColor.addEventListener("input", function () { save({ dpsTextColor: els.dpsTextColor.value }); });
  els.totalDpsColor.addEventListener("input", function () { save({ totalDpsColor: els.totalDpsColor.value }); });
  els.resetTextColors.addEventListener("click", function () {
    save({ secondaryTextColor: null, myNameTextColor: null, petNameTextColor: null, dpsTextColor: null, totalDpsColor: null });
  });
  els.circleBgColor.addEventListener("input", function () { save({ circleBgColor: els.circleBgColor.value }); });
  els.circleBorderColor.addEventListener("input", function () { save({ circleBorderColor: els.circleBorderColor.value }); });
  els.circleTextColor.addEventListener("input", function () { save({ circleTextColor: els.circleTextColor.value }); });
  els.resetCircleColors.addEventListener("click", function () {
    save({ circleBgColor: null, circleBorderColor: null, circleTextColor: null });
  });
  els.font.addEventListener("change", function () { save({ fontFamily: els.font.value }); });
  els.classColors.addEventListener("change", function () { save({ classColorsEnabled: els.classColors.checked }); });
  els.myClass.addEventListener("change", function () { save({ myClass: els.myClass.value || null }); });
  els.resetClassColors.addEventListener("click", function () { save({ classColorOverrides: {} }); });
  els.showPets.addEventListener("change", function () { save({ showPets: els.showPets.checked }); });
  els.fadeIdle.addEventListener("change", function () { save({ fadeIdleEnabled: els.fadeIdle.checked }); });
  els.fadeIdleSecs.addEventListener("input", function () {
    els.fadeIdleSecsVal.textContent = els.fadeIdleSecs.value + "s"; // instant feedback while dragging, before the save round-trip
    save({ fadeIdleSeconds: parseInt(els.fadeIdleSecs.value, 10) });
  });
  els.keepInTray.addEventListener("change", function () { save({ keepInTrayOnClose: els.keepInTray.checked }); });
  els.launchAtStartup.addEventListener("change", function () { save({ launchAtStartup: els.launchAtStartup.checked }); });
  document.querySelectorAll(".theme-swatch").forEach(function (b) {
    b.addEventListener("click", function () {
      // Picking a preset theme clears any custom background/text override,
      // otherwise the swatch would visibly "not work" while a custom color
      // is still set. A custom bgColor/textColor pick (above) always wins
      // over whichever theme is active until it's cleared, here or via
      // "Reset to default colors".
      save({ theme: b.dataset.theme, bgColor: null, textColor: null });
    });
  });
  document.querySelectorAll("#settings-display-style .segment").forEach(function (b) {
    b.addEventListener("click", function () { save({ displayStyle: b.dataset.style }); });
  });
  document.querySelectorAll("#settings-auto-toggles .segment").forEach(function (b) {
    b.addEventListener("click", function () { save({ autoSubmitMode: b.dataset.mode, autoSubmitChosen: true }); });
  });

  // ---- log source ---------------------------------------------------
  // Same pick-file/pick-folder calls the mini-mode card's own first-run
  // empty state uses (see app.js) — picking here just re-saves and
  // restarts tailing in main.js, which pushes the change to the
  // mini-mode window live, no separate "forget" step needed.
  function applySourceHint(cfg) {
    var active = !!(cfg && cfg.path);
    var name = active ? (cfg.fileName || String(cfg.path).split(/[\\/]/).pop()) : null;
    els.sourceHintText.textContent = active ? "Currently reading: " + name : "No log source set yet.";
    els.sourceHint.classList.toggle("ok", active);
  }
  window.dyrelog.getSavedSource().then(applySourceHint);
  els.pickFileBtn.addEventListener("click", async function () {
    var res = await window.dyrelog.pickFile();
    if (res) applySourceHint({ fileName: res.fileName, path: res.path });
  });
  els.pickFolderBtn.addEventListener("click", async function () {
    var res = await window.dyrelog.pickFolder();
    if (!res) return;
    if (!res.matches.length) {
      alert("No eqlog_*.txt files found in that folder.");
      return;
    }
    if (res.chosen) {
      applySourceHint({ fileName: res.chosen, path: res.chosen });
      return;
    }
    els.folderPickRow.hidden = false;
    els.folderSelect.innerHTML = res.matches.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + "</option>"; }).join("");
    els.folderPickRow.dataset.dir = res.dir;
  });
  els.folderUseBtn.addEventListener("click", async function () {
    var dir = els.folderPickRow.dataset.dir;
    var fileName = els.folderSelect.value;
    var res = await window.dyrelog.useFolderFile(dir, fileName);
    if (res) {
      applySourceHint({ fileName: res.fileName, path: res.path });
      els.folderPickRow.hidden = true;
    }
  });

  // ---- account (Sept 7) --------------------------------------------------
  // Discord login for the desktop app itself — see the auth section of
  // main.js for how openLoginWindow() actually runs the OAuth flow. This is
  // the one settings section every other window's submit prompt (see the
  // submit-popup window) depends on being filled in.
  function applyAccountState(authState) {
    if (authState) {
      els.accountHint.textContent = "Logged in as " + authState.username + ".";
      els.btnLogin.hidden = true;
      els.btnLogout.hidden = false;
    } else {
      els.accountHint.textContent = "Not logged in — required before any kill can be submitted to the leaderboard.";
      els.btnLogin.hidden = false;
      els.btnLogout.hidden = true;
    }
  }
  window.dyrelog.getAuthState().then(applyAccountState);
  window.dyrelog.onAuthUpdate(applyAccountState);
  els.btnLogin.addEventListener("click", async function () {
    els.btnLogin.disabled = true;
    var result = await window.dyrelog.loginWithDiscord();
    els.btnLogin.disabled = false;
    if (!result.ok && !result.cancelled && !result.alreadyOpen) {
      els.accountHint.textContent = "Login failed — try again.";
    }
  });
  els.btnLogout.addEventListener("click", function () { window.dyrelog.logout(); });

  // ---- search -----------------------------------------------------------
  // "a search bar at the top for people to find an option they're looking
  // for by searching" — matches across every tab at once (each section
  // carries a data-searchable string of extra keywords, plus its own
  // visible label/hint text), then jumps to the first tab that still has a
  // match so the result is actually visible, not just un-hidden on a tab
  // you're not looking at.
  var allSections = Array.prototype.slice.call(document.querySelectorAll(".settings-section"));
  els.search.addEventListener("input", function () {
    var query = els.search.value.trim().toLowerCase();
    var firstMatchingTab = null;
    allSections.forEach(function (section) {
      var haystack = (section.dataset.searchable || "") + " " + section.textContent;
      var matches = !query || haystack.toLowerCase().indexOf(query) !== -1;
      section.classList.toggle("search-hidden", !matches);
      if (matches && !firstMatchingTab) {
        firstMatchingTab = section.closest(".tab-panel").dataset.tabPanel;
      }
    });
    if (query && firstMatchingTab) {
      var activePanel = document.querySelector(".tab-panel:not([hidden])");
      var activeHasMatch = !!(activePanel && activePanel.querySelector(".settings-section:not(.search-hidden)"));
      if (!activeHasMatch) activateTab(firstMatchingTab);
    }
  });

  // ---- version + What's New -----------------------------------------
  // "make sure the what's new tab shows whatever patch notes were listed
  // in the release notes, this still shows v1" (Sept 6) — this used to be
  // a hardcoded CHANGELOG array hand-copied into this file, which is
  // exactly what went stale: it only ever showed whatever text someone
  // last pasted in here, with no connection at all to what actually
  // shipped. Now it reads the real release notes straight off GitHub every
  // time this tab loads (get-release-notes in main.js) — the same public
  // Releases page the auto-updater itself already reads from — so this tab
  // can never drift from what a release's own notes actually say again.
  // FALLBACK_ITEMS only ever shows up if that fetch fails outright
  // (offline, GitHub rate-limiting, no releases published yet), so the tab
  // is never left blank.
  var FALLBACK_ITEMS = [
    "Couldn't load the real patch notes just now (offline, or GitHub is " +
      "rate-limiting) — see github.com/dyremoon/dyrelog/releases directly, or try again in a moment."
  ];
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Same numeric-part comparison as isNewerVersion() in main.js (no shared
  // module system between the two processes, so this is its own small
  // copy) — tags whichever release matches the running app "Current",
  // anything numerically ahead of it "Available now" (already published on
  // GitHub but not yet installed here), everything else "Previous".
  function releaseTag(version, currentVersion) {
    if (version === currentVersion) return "Current";
    var vp = String(version).split(".").map(function (n) { return parseInt(n, 10) || 0; });
    var cp = String(currentVersion).split(".").map(function (n) { return parseInt(n, 10) || 0; });
    for (var i = 0; i < Math.max(vp.length, cp.length); i++) {
      var v = vp[i] || 0, c = cp[i] || 0;
      if (v > c) return "Available now";
      if (v < c) return "Previous";
    }
    return "Current";
  }
  // A release's own "body" (its notes, as typed into GitHub) is free-form
  // markdown — this only ever needs the bullet list back out of it, so it
  // strips a leading "-"/"*"/"•" off each line and drops anything blank,
  // same normalization renderAvailablePreview() used to do for just the
  // one "not yet installed" preview entry below.
  function parseReleaseItems(body) {
    // Some release bodies come through as HTML (<p>...</p> etc.) instead of
    // plain Markdown lines — turn block/line-break tags into real newlines
    // first, then strip whatever tags are left, so "<p>foo</p>" doesn't show
    // up as literal text in the list.
    var text = String(body || "")
      .replace(/<\/(p|li|div)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    return text
      .split("\n")
      .map(function (line) { return line.replace(/^[\s*\-•]+/, "").trim(); })
      .filter(Boolean);
  }
  function renderChangelog(releases, currentVersion) {
    var blocks = (releases || [])
      .map(function (r) { return { version: r.version, tag: releaseTag(r.version, currentVersion), items: parseReleaseItems(r.body) }; })
      .filter(function (b) { return b.items.length; });
    if (!blocks.length) blocks = [{ version: currentVersion, tag: "Current", items: FALLBACK_ITEMS }];
    els.changelog.innerHTML = blocks.map(function (block) {
      return (
        '<div class="changelog-entry">' +
          '<div class="changelog-head">' +
            (block.version ? '<span class="changelog-title">v' + esc(block.version) + "</span>" : "") +
            '<span class="changelog-tag">' + esc(block.tag) + "</span>" +
          "</div>" +
          '<ul class="changelog-list">' + block.items.map(function (item) { return "<li>" + esc(item) + "</li>"; }).join("") + "</ul>" +
        "</div>"
      );
    }).join("");
  }
  [els.whatsnewGithub, els.footerGithub].forEach(function (a) { wireExternalLink(a, GITHUB_URL); });
  window.dyrelog.getAppVersion().then(function (version) {
    var label = "Dyrelog v" + version;
    els.whatsnewVersion.textContent = label;
    els.footerVersion.textContent = label;
    window.dyrelog.getReleaseNotes().then(function (releases) { renderChangelog(releases, version); });
  });

  // ---- What's New: real "check for updates" / "update now and relaunch" -
  // Separate from onUpdateAvailable() above (the read-only "a new version
  // exists" banner) — this drives the actual electron-updater download +
  // relaunch flow. See "updater-status" in main.js for every state.
  (function () {
    var btnCheck = document.getElementById("btn-check-updates");
    var statusEl = document.getElementById("update-status");
    if (!btnCheck || !statusEl || !window.dyrelog.onUpdaterStatus) return;

    // Used to also insert its own separate "Available now" preview entry
    // here, built from payload.releaseNotes the moment electron-updater's
    // own check found something newer. Now redundant: renderChangelog()
    // above already fetches every recent release from GitHub directly
    // (including anything newer than the installed version) and tags it
    // "Available now" itself via releaseTag() — one real source of every
    // entry instead of two separate mechanisms that could show slightly
    // different things.
    function renderChecking() {
      statusEl.innerHTML = '<span class="update-dot" style="background:var(--ink-3);"></span>Checking&hellip;';
    }
    function renderUpToDate() {
      statusEl.innerHTML = '<span class="update-dot ok"></span>You&rsquo;re up to date';
      btnCheck.disabled = false;
    }
    // "I want both of these to just start the update to the latest version
    // and reboot the application" (Sept 6) — used to stop here and wait for
    // a separate "Update now and relaunch" click, the same two-step shape
    // Settings has always had. Now a found update starts downloading
    // immediately, no second click, matching the mini-mode banner's own
    // one-click flow in app.js.
    function renderAvailable(version) {
      statusEl.innerHTML =
        '<span>Update available' + (version ? " &mdash; v" + version : "") + " &mdash; downloading&hellip;</span>";
      window.dyrelog.downloadAndInstallUpdate();
    }
    function renderDownloading(percent) {
      var pct = Math.max(0, Math.min(100, percent || 0));
      statusEl.innerHTML =
        "<span>Downloading update&hellip; " + pct + "%</span>" +
        '<span class="update-progress-track"><span class="update-progress-fill" style="width:' + pct + '%"></span></span>';
    }
    function renderReady() {
      statusEl.innerHTML = '<span class="update-dot ok"></span>Update downloaded &mdash; relaunching&hellip;';
    }
    function renderError(message) {
      // Used to always show the same generic "couldn't check for updates"
      // text no matter what actually failed — including a failure during
      // the DOWNLOAD/install step, which is a different, more actionable
      // problem than the initial check failing. Now shows electron-updater's
      // real error message (see main.js's autoUpdater.on("error", ...) and
      // the two ipcMain.handle() catch blocks, both of which already send
      // payload.message — this just stopped throwing it away) so DJ (or a
      // future session) can actually tell what went wrong instead of
      // guessing blind.
      // No HTML-escaping helper lives in this file (settings.js has never
      // needed one) — build the message as a text node instead of via
      // innerHTML so an odd error string can't be mis-rendered as markup.
      statusEl.innerHTML = '<span class="update-dot err"></span>Update failed &mdash; <span id="update-error-detail"></span>';
      document.getElementById("update-error-detail").textContent = message || "try again in a moment";
      // The whole flow (check, then immediately download+install — see
      // renderAvailable() above) runs off this one button now, so a retry
      // after any failure just means re-enabling it, not resetting a
      // separate "Update now" button that no longer exists.
      btnCheck.disabled = false;
    }
    function renderDevMode() {
      statusEl.innerHTML = '<span style="color:var(--ink-3);">Only checks in the installed app &mdash; not while running from source.</span>';
      btnCheck.disabled = false;
    }

    btnCheck.addEventListener("click", function () {
      btnCheck.disabled = true;
      renderChecking();
      window.dyrelog.checkForUpdatesNow();
    });

    window.dyrelog.onUpdaterStatus(function (payload) {
      var state = payload && payload.state;
      if (state === "checking") renderChecking();
      else if (state === "up-to-date") renderUpToDate();
      else if (state === "available") {
        renderAvailable(payload.version);
        btnCheck.disabled = true;
      }
      else if (state === "downloading") renderDownloading(payload.percent);
      else if (state === "ready") renderReady();
      else if (state === "error") renderError(payload && payload.message);
      else if (state === "dev-mode") renderDevMode();
    });
  })();

  window.dyrelog.getSettings().then(applyToUI);

  // ---- Appearance split resize ------------------------------------------
  // "I also would love if the user could resize these windows to their
  // liking within the overlay" — a plain drag handle between the settings
  // column and the live preview. Only .appearance-main's width is ever
  // touched (max-width/flex-basis inline overrides its settings.css
  // default); the preview column is flex:1 and just absorbs whatever's
  // left, so there's nothing to fight over between this and a window
  // resize. Persisted in localStorage — a real per-machine desktop window
  // setting, not the in-chat preview sandbox this code never runs in, so
  // localStorage is the right durable place for it (see settings.css's own
  // comment on the same layout for why the columns' flex roles are what
  // they are).
  (function () {
    var grid = document.querySelector(".tab-panel-appearance");
    var main = document.querySelector(".appearance-main");
    var handle = document.getElementById("appearance-split-handle");
    if (!grid || !main || !handle) return;
    var MIN_MAIN = 300;
    var MAX_MAIN = 760;
    var STORE_KEY = "dyrelog-settings-appearance-split-px";

    // The split width lives on the GRID container's own first track (see
    // settings.css) rather than on .appearance-main itself — sticky
    // positioning on the preview column only actually works with grid's
    // row-stretch behavior, not flexbox's (a real Chromium quirk hit while
    // building this: the exact same layout as a flex row silently broke
    // position:sticky the moment align-items:stretch gave the sticky item
    // its height).
    function applyWidth(px) {
      var clamped = Math.max(MIN_MAIN, Math.min(MAX_MAIN, px));
      grid.style.gridTemplateColumns = clamped + "px 11px minmax(190px, 1fr)";
      return clamped;
    }

    try {
      var saved = parseFloat(localStorage.getItem(STORE_KEY));
      if (saved) applyWidth(saved);
    } catch (err) {
      // Private window / storage disabled — the layout just falls back to
      // settings.css's own 460px default, never worth surfacing an error.
    }

    var dragging = false;
    var startX = 0;
    var startWidth = 0;
    handle.addEventListener("mousedown", function (e) {
      dragging = true;
      handle.classList.add("dragging");
      startX = e.clientX;
      startWidth = main.getBoundingClientRect().width;
      document.body.style.userSelect = "none";
      e.preventDefault();
    });
    window.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      applyWidth(startWidth + (e.clientX - startX));
    });
    window.addEventListener("mouseup", function () {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("dragging");
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(STORE_KEY, String(Math.round(main.getBoundingClientRect().width)));
      } catch (err) {
        // Same private-window fallback as above — just don't persist it.
      }
    });
  })();
})();
