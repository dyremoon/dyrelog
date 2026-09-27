(function () {
  "use strict";

  var EQ_CLASSES = [
    "Berserker", "Warrior", "Cleric", "Bard", "Paladin", "Necromancer",
    "Ranger", "Druid", "Monk", "Beastlord", "Magician", "Shaman",
    "Rogue", "Shadow Knight", "Wizard", "Enchanter"
  ];
  var EQ_CLASS_COLORS = {
    Berserker: "#ce0016", Warrior: "#a74a2d", Cleric: "#ac913a", Bard: "#f55a02",
    Paladin: "#9c7c03", Necromancer: "#8c8309", Ranger: "#7ba208", Druid: "#09853d",
    Monk: "#019a98", Beastlord: "#04764c", Magician: "#08a2c4", Shaman: "#0b80c8",
    Rogue: "#5569ee", "Shadow Knight": "#7c49c9", Wizard: "#a138b1", Enchanter: "#dd4ca3"
  };

  var THEME_BG = {
    blue: "#14120f", brass: "#1c130b", druidic: "#10160f", magical: "#140f22",
    girly: "#1c1017", hardcore: "#0d0b0b", metal: "#15171a"
  };
  var THEME_INK = {
    blue: "#f2ede1", brass: "#f2e2c4", druidic: "#e8f0dd", magical: "#ece6fb",
    girly: "#fbe6ef", hardcore: "#f3e6e6", metal: "#e6e9ec"
  };
  var THEME_INK2 = {
    blue: "#a89f8d", brass: "#cbad83", druidic: "#9ec288", magical: "#b39cdf",
    girly: "#e2a0c0", hardcore: "#b87a7a", metal: "#9aa3ac"
  };
  var THEME_HAIR = {
    blue: "#2c2a24", brass: "#3a2a1a", druidic: "#253a20", magical: "#302352",
    girly: "#3d2430", hardcore: "#2e1414", metal: "#33373d"
  };
  var THEME_ACCENT = {
    blue: "#4c8bf5", brass: "#c9922e", druidic: "#7fb238", magical: "#9b6bf2",
    girly: "#f24ea0", hardcore: "#e31c1c", metal: "#7d92a8"
  };
  var SETTINGS_THEME_PALETTE = {
    blue: {
      bg: "#0e1015", bgCard: "#151922", bgElevated: "#1b202b",
      hair: "#262c39", hairStrong: "#333c4d",
      ink: "#f3f5f9", ink2: "#b3bcce", ink3: "#8992a6",
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
  var DEFAULT_MY_COLOR = "#b3423a";
  var DEFAULT_PET_COLOR = "#4fa8c9";






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
    iconColor: document.getElementById("set-iconcolor"),
    resetTextColors: document.getElementById("btn-reset-textcolors"),
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
    fadeIdleOpacity: document.getElementById("set-fadeidle-opacity"),
    fadeIdleOpacityVal: document.getElementById("fadeidle-opacity-val"),
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

  function activateTab(target) {
    document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === target); });
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      panel.hidden = panel.dataset.tabPanel !== target;
    });
  }
  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () { activateTab(btn.dataset.tab); });
  });

  (function jumpToInitialTab() {
    var requested = new URLSearchParams(location.search).get("tab");
    if (requested && document.querySelector('.tab[data-tab="' + requested + '"]')) activateTab(requested);
  })();

  var BASE_UI_FONT_PX = 13.5;
  els.uiScale.addEventListener("change", function () {
    var scale = parseFloat(els.uiScale.value);
    document.documentElement.style.fontSize = (BASE_UI_FONT_PX * scale) + "px";
    save({ settingsTextScale: scale });
  });

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

  els.myClass.innerHTML =
    '<option value="">None</option>' +
    EQ_CLASSES.map(function (c) { return '<option value="' + c + '">' + c + "</option>"; }).join("");

  var currentSettings = {};




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

  var PREVIEW_YOU_DPS = 842;
  var PREVIEW_PET_DPS = 211;
  function renderPreview(s) {
    var theme = s.theme || "blue";
    var myColor =
      s.classColorsEnabled && s.myClass
        ? (s.classColorOverrides || {})[s.myClass] || EQ_CLASS_COLORS[s.myClass] || DEFAULT_MY_COLOR
        : s.myBarColor || DEFAULT_MY_COLOR;
    var textColor = s.textColor || THEME_INK[theme];
    var myNameColor = s.myNameTextColor || textColor;
    var petNameColor = s.petNameTextColor || textColor;
    var accent = THEME_ACCENT[theme] || THEME_ACCENT.blue;
    var showPets = s.showPets !== false;
    var youDps = showPets ? PREVIEW_YOU_DPS : PREVIEW_YOU_DPS + PREVIEW_PET_DPS;
    var bgAlpha = s.opacity != null ? s.opacity : 1;

    [els.previewFrame, els.previewFrameMini, els.previewCircle].forEach(function (frame) {
      if (!frame) return;
      var s = Appearance.resolve(currentSettings, frame === els.previewCircle ? 'circle' : frame === els.previewFrameMini ? 'mini' : 'bars');
      var bgAlpha = s.opacity;
      frame.style.setProperty("--preview-bg-color", s.bgColor || THEME_BG[theme]);
      frame.style.setProperty("--preview-bg-alpha", String(bgAlpha));
      frame.style.setProperty("--preview-idle-opacity",
        String(s.fadeIdleOpacity != null ? s.fadeIdleOpacity : 0.15));
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
      frame.style.setProperty("--preview-iconscale", String(s.iconScale || 1));
      frame.style.setProperty("--preview-icon-color", s.iconColor || THEME_INK2[theme]);
      frame.style.setProperty("--preview-secondaryscale", String(s.secondaryTextScale != null ? s.secondaryTextScale : 1));
      frame.style.setProperty("--preview-timerscale", String(s.timerTextScale != null ? s.timerTextScale : 1));
      frame.style.setProperty("--preview-minipetscale", String(s.miniPetTextScale != null ? s.miniPetTextScale : 1));
      frame.style.setProperty("--preview-circlescale", String(s.circleScale != null ? s.circleScale : 1));
      frame.style.setProperty("--preview-font", FONT_STACKS[s.fontFamily || "system"] || "inherit");
    });
    if (els.previewCircle) {
      els.previewCircle.style.setProperty("--preview-circle-bg", s.circleBgColor || s.bgColor || THEME_BG[theme]);
      els.previewCircle.style.setProperty("--preview-circle-border", s.circleBorderColor || accent);
      els.previewCircle.style.setProperty("--preview-circle-text", s.circleTextColor || accent);
    }

    var defaultAngles = { menu: 45, mini: 315, bars: 135, pets: 180 };
    document.querySelectorAll('.preview-circle-icon').forEach(function(icon) {
      var key = icon.dataset.angleKey;
      var angle = s.iconAngles && s.iconAngles[key] != null ? s.iconAngles[key] : defaultAngles[key];
      icon.style.setProperty('--btn-angle', angle + 'deg');
    });
    document.getElementById('preview-circle-pet').hidden = !showPets;
    els.previewFillYou.style.width = "100%";
    els.previewDpsYou.textContent = String(youDps);
    els.previewTotal.textContent = "· " + (youDps * 27).toLocaleString();
    if (showPets) {
      els.previewRowPet.style.display = "";
      els.previewFillPet.style.width = Math.round((PREVIEW_PET_DPS / PREVIEW_YOU_DPS) * 100) + "%";
      els.previewDpsPet.textContent = String(PREVIEW_PET_DPS);
    } else {
      els.previewRowPet.style.display = "none";
    }

    els.previewMiniDps.textContent = String(youDps);
    if (showPets) {
      els.previewMiniPetRow.style.display = "";
      els.previewMiniPetDps.textContent = PREVIEW_PET_DPS + " dps";
    } else {
      els.previewMiniPetRow.style.display = "none";
    }

    els.previewCircleDpsNum.textContent = String(youDps);
  }

  var idleFadeTimer = null;
  function scheduleIdlePreviewFade() {
    clearTimeout(idleFadeTimer);
    [els.previewFrame, els.previewFrameMini, els.previewCircle].forEach(function(frame) { frame.classList.remove('preview-idle'); });
    if (!currentSettings.fadeIdleEnabled) return;
    var secs = currentSettings.fadeIdleSeconds != null ? currentSettings.fadeIdleSeconds : 10;
    idleFadeTimer = setTimeout(function () {
      [els.previewFrame, els.previewFrameMini, els.previewCircle].forEach(function(frame) { frame.classList.add('preview-idle'); });
    }, secs * 1000);
  }
  ["mousemove", "mousedown", "keydown", "input", "click"].forEach(function (evt) {
    document.addEventListener(evt, scheduleIdlePreviewFade, { passive: true });
  });

  var soundSelect = document.getElementById('submission-sound');
  var soundVolume = document.getElementById('submission-volume');
  var soundStatus = document.getElementById('submission-sound-status');
  var soundListVersion = 0;
  function applySoundSettings(s) {
    soundVolume.value = s.submissionSoundVolume == null ? 70 : s.submissionSoundVolume;
    document.getElementById('submission-volume-value').textContent = soundVolume.value + '%';
    var version = ++soundListVersion;
    window.dyrelog.getSubmissionSounds().then(function(choices) {
      if (version !== soundListVersion) return;
      soundSelect.replaceChildren();
      choices.forEach(function(choice) { soundSelect.add(new Option(choice.name, choice.id)); });
      soundSelect.value = s.submissionSound || 'none';
      if (!soundSelect.value) soundSelect.value = 'none';
      var hasGameSounds = choices.some(function(choice) { return choice.id.indexOf('eq:') === 0; });
      soundStatus.textContent = hasGameSounds ? '' : 'EverQuest sounds show up here once Dyrelog is reading a log from your EverQuest folder.';
      document.getElementById('test-submission-sound').disabled = soundSelect.value === 'none';
    }).catch(function(err) { soundStatus.textContent = err.message; });
  }
  soundSelect.addEventListener('change', function() { save({ submissionSound: soundSelect.value }); });
  soundVolume.addEventListener('input', function() {
    var volume = Number(soundVolume.value);
    SubmissionAudio.setVolume(volume);
    document.getElementById('submission-volume-value').textContent = volume + '%';
    save({ submissionSoundVolume: volume });
  });
  document.getElementById('upload-submission-sound').addEventListener('click', async function() {
    soundStatus.textContent = '';
    try {
      var result = await window.dyrelog.pickSubmissionSound();
      if (result.cancelled) return;
      if (result.ok) applyToUI(result.settings);
      else soundStatus.textContent = result.error;
    } catch (err) { soundStatus.textContent = err.message; }
  });
  document.getElementById('test-submission-sound').addEventListener('click', async function() {
    soundStatus.textContent = '';
    try {
      var result = await window.dyrelog.previewSubmissionSound();
      if (!result.ok) throw new Error(result.error);
      await SubmissionAudio.play(result.audio);
    } catch (err) { soundStatus.textContent = 'Could not play sound: ' + err.message; }
  });

  function applyToUI(s) {
    currentSettings = s;
    document.querySelectorAll('[data-appearance-mode]').forEach(function(input) {
      var field = input.dataset.appearanceField;
      var value = Appearance.resolve(s, input.dataset.appearanceMode)[field];
      input.value = value;
      input.nextElementSibling.textContent = field === 'opacity' ? Math.round(value * 100) + '%' : value.toFixed(2) + '×';
    });
    applySoundSettings(s);
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
    els.iconColor.value = s.iconColor || THEME_INK2[s.theme || "blue"];
    els.circleBgColor.value = s.circleBgColor || THEME_BG[s.theme || "blue"];
    els.circleBorderColor.value = s.circleBorderColor || THEME_ACCENT[s.theme || "blue"];
    els.circleTextColor.value = s.circleTextColor || THEME_ACCENT[s.theme || "blue"];
    els.font.value = s.fontFamily || "system";
    els.classColors.checked = !!s.classColorsEnabled;
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
    els.fadeIdleOpacity.value = s.fadeIdleOpacity != null ? s.fadeIdleOpacity : 0.15;
    els.fadeIdleOpacityVal.textContent = Math.round(Number(els.fadeIdleOpacity.value) * 100) + "%";
    els.keepInTray.checked = !!s.keepInTrayOnClose;
    els.keepInTrayHint.textContent = s.keepInTrayOnClose
      ? "Closing the meter keeps Dyrelog in the tray. Use the tray icon to reopen or quit."
      : "Closing the meter quits Dyrelog.";
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
    applyWindowTheme(s.theme || "blue");
    renderPreview(s);
    scheduleIdlePreviewFade();
  }

  document.querySelectorAll('[data-appearance-mode]').forEach(function(input) {
    input.addEventListener('input', function() {
      var partial = {};
      partial[Appearance.key(input.dataset.appearanceMode, input.dataset.appearanceField)] = Number(input.value);
      save(partial);
    });
  });

  function save(partial) {
    window.dyrelog.saveSettings(partial).then(applyToUI);
  }

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
  els.iconColor.addEventListener("input", function () { save({ iconColor: els.iconColor.value }); });
  els.resetTextColors.addEventListener("click", function () {
    save({ secondaryTextColor: null, myNameTextColor: null, petNameTextColor: null, dpsTextColor: null, totalDpsColor: null, iconColor: null });
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
    els.fadeIdleSecsVal.textContent = els.fadeIdleSecs.value + "s";
    save({ fadeIdleSeconds: parseInt(els.fadeIdleSecs.value, 10) });
  });
  els.fadeIdleOpacity.addEventListener("input", function () {
    els.fadeIdleOpacityVal.textContent = Math.round(Number(els.fadeIdleOpacity.value) * 100) + "%";
    save({ fadeIdleOpacity: parseFloat(els.fadeIdleOpacity.value) });
  });
  els.keepInTray.addEventListener("change", function () { save({ keepInTrayOnClose: els.keepInTray.checked }); });
  els.launchAtStartup.addEventListener("change", function () { save({ launchAtStartup: els.launchAtStartup.checked }); });
  document.querySelectorAll(".theme-swatch").forEach(function (b) {
    b.addEventListener("click", function () {
      save({ theme: b.dataset.theme, bgColor: null, textColor: null, circleBgColor: null, circleBorderColor: null, circleTextColor: null });
    });
  });
  document.querySelectorAll("#settings-display-style .segment").forEach(function (b) {
    b.addEventListener("click", function () { save({ displayStyle: b.dataset.style }); });
  });
  document.querySelectorAll("#settings-auto-toggles .segment").forEach(function (b) {
    b.addEventListener("click", function () { save({ autoSubmitMode: b.dataset.mode, autoSubmitChosen: true }); });
  });

  var NO_LOGS_FOUND_MESSAGE = "No EverQuest logs (eqlog_*.txt) in that folder.\n\nPick your EverQuest folder or its Logs folder. If you've never turned logging on, type /log on in game first.";
  function applySourceHint(cfg) {
    var active = !!(cfg && cfg.path);
    var name = active ? (cfg.fileName || String(cfg.path).split(/[\\/]/).pop()) : null;
    els.sourceHintText.textContent = active ? "Currently reading: " + name : "No log file picked yet.";
    els.sourceHint.classList.toggle("ok", active);
  }
  window.dyrelog.getSavedSource().then(applySourceHint);
  window.dyrelog.onSourceStatus(function (status) {
    if (!status || !status.waiting) return;
    els.sourceHintText.textContent = "Waiting for " + status.fileName + ". In EverQuest, type /log on.";
    els.sourceHint.classList.remove("ok");
  });
  els.pickFileBtn.addEventListener("click", async function () {
    var res = await window.dyrelog.pickFile();
    if (res) applySourceHint({ fileName: res.fileName, path: res.path });
  });
  els.pickFolderBtn.addEventListener("click", async function () {
    var res = await window.dyrelog.pickFolder();
    if (!res) return;
    if (!res.matches.length) {
      alert(NO_LOGS_FOUND_MESSAGE);
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

  function applyAccountState(authState) {
    if (authState) {
      els.accountHint.textContent = "Logged in as " + authState.username + ".";
      els.btnLogin.hidden = true;
      els.btnLogout.hidden = false;
    } else {
      els.accountHint.textContent = "Not logged in. Log in to submit kills.";
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
      els.accountHint.textContent = "Couldn't log in. Try again.";
    }
  });
  els.btnLogout.addEventListener("click", function () { window.dyrelog.logout(); });

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

  var FALLBACK_ITEMS = [
    "Couldn't load the release notes right now. Try again in a minute, or see the Releases page on GitHub."
  ];
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
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
  function parseReleaseItems(body) {
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

  (function () {
    var btnCheck = document.getElementById("btn-check-updates");
    var statusEl = document.getElementById("update-status");
    if (!btnCheck || !statusEl || !window.dyrelog.onUpdaterStatus) return;

    function renderChecking() {
      statusEl.innerHTML = '<span class="update-dot" style="background:var(--ink-3);"></span>Checking&hellip;';
    }
    function renderUpToDate() {
      statusEl.innerHTML = '<span class="update-dot ok"></span>You&rsquo;re up to date';
      btnCheck.disabled = false;
    }
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
      statusEl.innerHTML = '<span class="update-dot err"></span>Update failed &mdash; <span id="update-error-detail"></span>';
      document.getElementById("update-error-detail").textContent = message || "try again in a moment";
      btnCheck.disabled = false;
    }
    function renderDevMode() {
      statusEl.innerHTML = '<span style="color:var(--ink-3);">Updates only work in the installed app.</span>';
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

  (function () {
    var grid = document.querySelector(".tab-panel-appearance");
    var main = document.querySelector(".appearance-main");
    var handle = document.getElementById("appearance-split-handle");
    if (!grid || !main || !handle) return;
    var MIN_MAIN = 300;
    var MAX_MAIN = 760;
    var STORE_KEY = "dyrelog-settings-appearance-split-px";

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
