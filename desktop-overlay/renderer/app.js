
(function () {
  "use strict";

  var RANK_COLORS = ["--rank1", "--rank2", "--rank3", "--rank4", "--rank5", "--rank6"];
  var DIFFICULTY_LABELS = { D1: "D1 · Awakened", D2: "D2 · Adaptive", D3: "D3 · Fused", D4: "D4 · Refined" };
  var TOP_N = 6;
  var BASE_WIDTH = 320, BASE_HEIGHT = 420;
  var PET_DEFAULT_COLOR = "#4fa8c9";
  var FONT_STACKS = {
    system: '-apple-system, "Segoe UI", "Inter", system-ui, sans-serif',
    serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    mono: 'Consolas, "SF Mono", "Cascadia Code", "Courier New", monospace',
    rounded: '"Segoe UI Rounded", -apple-system, system-ui, sans-serif',
    fantasy: '"Cinzel", Georgia, serif',
    medieval: '"MedievalSharp", "Segoe UI", sans-serif',
    scifi: '"Orbitron", -apple-system, sans-serif',
    pixel: '"Press Start 2P", "Courier New", monospace'
  };

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
  function classColorFor(className) {
    return (settings.classColorOverrides && settings.classColorOverrides[className]) || EQ_CLASS_COLORS[className];
  }

  var knownBossNames = null;
  var API_BASE = "https://dyrelog-api.dyremoon.workers.dev";

  function makeState(charName) {
    return EQP.newState({ gapSeconds: 9, soloMode: false, characterName: charName || null, knownBossNames: knownBossNames });
  }

  function applyKnownBossNames(names) {
    knownBossNames = names;
    if (state) {
      state.knownBossNames = knownBossNames;
      EQP.reconsiderCurrentMob(state);
    }
  }

  function bossNamesFromArray(arr) {
    var names = new Set();
    (arr || []).forEach(function (n) { if (n) names.add(n); });
    return names;
  }
  async function fetchKnownBosses() {
    try {
      var res = await fetch(API_BASE + "/api/bosses");
      if (!res.ok) return;
      var data = await res.json();
      var bosses = (data && Array.isArray(data.bosses)) ? data.bosses : [];
      var names = bossNamesFromArray(bosses.map(function (b) { return b && b.name; }));
      applyKnownBossNames(names);
      window.dyrelog.saveSettings({ cachedBossNames: Array.from(names), cachedBossNamesAt: Date.now() });
    } catch (err) {
    }
  }

  function stripTierSuffix(name) {
    return name ? name.replace(/\s*\+\d+\s*$/, "") : name;
  }

  function isKnownBoss(mobName) {
    if (!knownBossNames || !mobName) return false;
    return knownBossNames.has(mobName) || knownBossNames.has(stripTierSuffix(mobName));
  }

  var state = makeState(null);
  var lineBuffer = "";
  var settings = null;
  var miniMode = false;
  var preMiniBounds = null;
  var currentDisplayStyle = "bars";
  var preWatchBounds = null;
  var currentCircleScale = 1;
  var WATCH_BADGE_BASE = 132;
  var WATCH_MARGIN = 38;
  function watchWindowSizeFor(scale) {
    // Must never go below main.js's own MIN_W (170) — set-bounds clamps
    // width up to that floor regardless, and a width/height mismatch there
    // would stretch the "circle" into an oval instead of a true circle.
    return Math.max(170, Math.round(WATCH_BADGE_BASE * (scale || 1)) + WATCH_MARGIN);
  }
  var characterName = null;
  var realm = null;





  var rawLineBuffer = [];
  var RAW_BUFFER_MAX_AGE_MS = 2 * 60 * 60 * 1000;
  var lastSubmitPromptedStartTime = null;















  var combatSessionStart = null;
  var lastCombatActivityAt = 0;
  var idleTimer = null;
  var selectedRowKey = null;
  var selectedSessionKey = null;

  var els = {
    statusDot: document.getElementById("status-dot"),
    wordmark: document.getElementById("wordmark"),
    emptyState: document.getElementById("empty-state"),
    folderPick: document.getElementById("folder-pick"),
    folderSelect: document.getElementById("folder-select"),
    fightView: document.getElementById("fight-view"),
    fightSelect: document.getElementById("fight-select"),
    fightPopup: document.getElementById("fight-popup"),
    mobDiff: document.getElementById("mob-diff"),
    fightTotal: document.getElementById("fight-total"),
    fightTimer: document.getElementById("fight-timer"),
    barlist: document.getElementById("barlist"),
    submitRow: document.getElementById("submit-row"),
    btnSubmit: document.getElementById("btn-submit"),
    autoSubmitLine: document.getElementById("auto-submit-line"),
    autoSubmitToggles: document.getElementById("auto-submit-toggles"),
    miniBar: document.getElementById("mini-bar"),
    miniDot: document.getElementById("mini-dot"),
    miniTotal: document.getElementById("mini-total"),
    miniName: document.getElementById("mini-name"),
    miniDps: document.getElementById("mini-dps"),
    miniPetRow: document.getElementById("mini-pet-row"),
    miniPetName: document.getElementById("mini-pet-name"),
    miniPetDps: document.getElementById("mini-pet-dps"),
    miniPartyList: document.getElementById("mini-party-list"),
    watchBadge: document.getElementById("watch-badge"),
    watchMenuBtn: document.getElementById("watch-menu-btn"),
    watchMiniBtn: document.getElementById("watch-mini-btn"),
    watchBarsBtn: document.getElementById("watch-bars-btn"),
    watchPetsBtn: document.getElementById("watch-pets-btn"),
    watchDpsNum: document.getElementById("watch-dps-num"),
    watchPet: document.getElementById("watch-pet"),
    watchTimer: document.getElementById("watch-timer"),
    updateBanner: document.getElementById("update-banner"),
    updateBannerText: document.getElementById("update-banner-text"),
    updateBannerDismiss: document.getElementById("update-banner-dismiss"),
    iconTooltip: document.getElementById("icon-tooltip")
  };

  function wireIconTooltips() {
    var tip = els.iconTooltip;
    if (!tip) return;
    document.querySelectorAll("[data-tooltip]").forEach(function (el) {
      el.addEventListener("mouseenter", function () {
        var r = el.getBoundingClientRect();
        tip.textContent = el.getAttribute("data-tooltip");
        tip.hidden = false;
        var tipRect = tip.getBoundingClientRect();
        var left = Math.min(Math.max(4, r.left + r.width / 2 - tipRect.width / 2), window.innerWidth - tipRect.width - 4);
        var below = r.bottom + 6;
        var top = (below + tipRect.height > window.innerHeight) ? (r.top - tipRect.height - 6) : below;
        tip.style.left = left + "px";
        tip.style.top = top + "px";
      });
      el.addEventListener("mouseleave", function () { tip.hidden = true; });
      el.addEventListener("mousedown", function () { tip.hidden = true; });
    });
  }
  wireIconTooltips();

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtNum(n) {
    return Math.round(n).toLocaleString();
  }

  function fmtAbbrev(n) {
    n = Math.max(0, n || 0);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "m";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(Math.round(n));
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function parseCharacterFromFilename(filename) {
    var m = /^eqlog_([^_]+)_(.+)\.(txt|log)$/i.exec(filename || "");
    return m ? { characterName: m[1], realm: m[2] } : null;
  }

  function feedLines(text) {
    var chunk = lineBuffer + text;
    var lines = chunk.split("\n");
    lineBuffer = lines.pop();
    var lastKnownTime = rawLineBuffer.length ? rawLineBuffer[rawLineBuffer.length - 1].time : Date.now();
    lines.forEach(function (line) {
      if (!line) return;
      var ev = EQP.parseLine(line);
      if (ev) { EQP.ingest(state, ev); lastKnownTime = ev.time; }
      rawLineBuffer.push({ time: lastKnownTime, line: line });
    });
    var cutoff = Date.now() - RAW_BUFFER_MAX_AGE_MS;
    while (rawLineBuffer.length && rawLineBuffer[0].time < cutoff) rawLineBuffer.shift();
  }

  // Include two seconds of padding to retain boundary events in the encounter upload.
  function rawTextForEncounter(enc) {
    var padMs = 2000;
    var lines = rawLineBuffer
      .filter(function (r) { return r.time >= enc.startTime - padMs && r.time <= enc.endTime + padMs; })
      .map(function (r) { return r.line.replace(/\r$/, ""); });
    return EQP.encounterRawText(enc, lines);
  }

  function setActiveView(view) {
    els.emptyState.hidden = view !== "empty";
    els.folderPick.hidden = view !== "folder";
    els.fightView.hidden = view !== "fight";
  }

  function showFightView() {
    setActiveView("fight");
    els.statusDot.classList.remove("off");
  }

  function showEmptyState() {
    setActiveView("empty");
    els.statusDot.classList.add("off");
  }

  var THEME_NAMES = ["blue", "brass", "druidic", "magical", "girly", "hardcore", "metal"];

  function applySettings(s) {
    settings = s;
    s = Appearance.resolve(s, s.displayStyle === "circle" ? "circle" : miniMode ? "mini" : "bars");
    document.documentElement.setAttribute("data-theme", THEME_NAMES.indexOf(s.theme) !== -1 ? s.theme : "blue");
    document.documentElement.style.setProperty("--text-scale", String(s.textScale || 1));
    document.documentElement.style.setProperty("--icon-scale", String(s.iconScale || 1));
    document.documentElement.style.setProperty("--timer-text-scale", String(s.timerTextScale || 1));
    document.documentElement.style.setProperty("--panel-alpha", String(s.opacity));
    document.documentElement.style.setProperty("--bar-height-mult", String(s.barHeight || 1));
    document.documentElement.style.setProperty("--idle-ui-opacity", String(s.fadeIdleOpacity != null ? s.fadeIdleOpacity : 0.15));
    document.documentElement.style.setProperty("--font-family", FONT_STACKS[s.fontFamily] || FONT_STACKS.fantasy);
    if (s.bgColor) document.documentElement.style.setProperty("--bg-card", s.bgColor);
    else document.documentElement.style.removeProperty("--bg-card");
    if (s.borderColor) document.documentElement.style.setProperty("--row-border-color", s.borderColor);
    else document.documentElement.style.removeProperty("--row-border-color");
    if (s.textColor) document.documentElement.style.setProperty("--ink", s.textColor);
    else document.documentElement.style.removeProperty("--ink");
    if (s.secondaryTextColor) {
      document.documentElement.style.setProperty("--ink-2", s.secondaryTextColor);
      document.documentElement.style.setProperty("--ink-3", "color-mix(in srgb, " + s.secondaryTextColor + " 65%, transparent)");
    } else {
      document.documentElement.style.removeProperty("--ink-2");
      document.documentElement.style.removeProperty("--ink-3");
    }
    if (s.dpsTextColor) document.documentElement.style.setProperty("--dps-text-color", s.dpsTextColor);
    else document.documentElement.style.removeProperty("--dps-text-color");
    if (s.totalDpsColor) document.documentElement.style.setProperty("--total-dps-color", s.totalDpsColor);
    else document.documentElement.style.removeProperty("--total-dps-color");
    if (s.iconColor) document.documentElement.style.setProperty("--icon-color", s.iconColor);
    else document.documentElement.style.removeProperty("--icon-color");
    applyIconAngles(s.iconAngles || {});
    document.documentElement.style.setProperty("--mini-pet-scale", String(s.miniPetTextScale || 1));
    document.documentElement.style.setProperty("--secondary-text-scale", String(s.secondaryTextScale || 1));
    if (s.circleBgColor) document.documentElement.style.setProperty("--circle-bg-color", s.circleBgColor);
    else document.documentElement.style.removeProperty("--circle-bg-color");
    if (s.circleBorderColor) document.documentElement.style.setProperty("--circle-border-color", s.circleBorderColor);
    else document.documentElement.style.removeProperty("--circle-border-color");
    if (s.circleTextColor) document.documentElement.style.setProperty("--circle-text-color", s.circleTextColor);
    else document.documentElement.style.removeProperty("--circle-text-color");
    applyCircleScale(Appearance.resolve(settings, "circle").circleScale);
    applyDisplayStyle(s.displayStyle || "bars");
    scheduleIdleFade();
  }

  function displayName(rawName) {
    return rawName === "You" ? (characterName || "You") : rawName;
  }

  function colorForRow(ownerName, index, isPet) {
    if (isPet) return settings.petBarColor || PET_DEFAULT_COLOR;
    if (ownerName === "You") {
      if (settings.classColorsEnabled && settings.myClass) return classColorFor(settings.myClass);
      if (settings.myBarColor) return settings.myBarColor;
    }
    return "var(" + RANK_COLORS[index % RANK_COLORS.length] + ")";
  }

  function nameColorForRow(ownerName, isPet) {
    if (isPet) return settings.petNameTextColor || null;
    if (ownerName === "You") return settings.myNameTextColor || null;
    return null;
  }

  function buildDisplayRows(rows) {
    var out = [];
    var showPets = settings.showPets !== false;
    rows.forEach(function (r) {
      var pets = r.pets || [];
      var petDpsTotal = pets.reduce(function (sum, p) { return sum + p.dps; }, 0);
      var ownDps = showPets ? Math.max(0, r.dps - petDpsTotal) : r.dps;
      var ownDamage = showPets ? r.selfDamage : r.damage;
      out.push({ name: displayName(r.name), ownerName: r.name, dps: ownDps, damage: ownDamage, isPet: false, abilities: r.abilities });
      if (showPets) {
        pets.forEach(function (p) {
          out.push({ name: p.name, ownerName: r.name, dps: p.dps, damage: p.damage, isPet: true, abilities: p.abilities });
        });
      }
    });
    out.sort(function (a, b) { return b.dps - a.dps; });
    return out;
  }

  function rowKey(r) {
    return r.ownerName + (r.isPet ? "::pet::" + r.name : "");
  }
  function findDisplayRow(display, key) {
    for (var i = 0; i < display.length; i++) {
      if (rowKey(display[i]) === key) return display[i];
    }
    return null;
  }

  function amountHtml(dps, damage) {
    return '<b>' + fmtNum(dps) + '</b><span class="unit">dps</span>';
  }

  function renderBarList(rows) {
    var display = buildDisplayRows(rows);
    if (selectedRowKey) {
      var sel = findDisplayRow(display, selectedRowKey);
      if (sel) { renderDrillDown(sel); return; }
      selectedRowKey = null;
    }
    var top = display.slice(0, TOP_N);
    if (!top.length) {
      els.barlist.innerHTML = '<div style="color:var(--ink-3);font-size:0.88rem;padding:6px 2px">No damage recorded yet.</div>';
      return;
    }
    var maxDps = top[0] ? top[0].dps : 0;
    els.barlist.innerHTML = top.map(function (r, i) {
      var swatch = colorForRow(r.ownerName, i, r.isPet);
      var pct = maxDps > 0 ? Math.max(4, (r.dps / maxDps) * 100) : 0;
      var nameColor = nameColorForRow(r.ownerName, r.isPet);
      var nameStyle = nameColor ? ' style="color:' + esc(nameColor) + '"' : "";
      return (
        '<div class="bar-row" data-row-key="' + esc(rowKey(r)) + '" style="--swatch:' + swatch + ';--pct:' + pct.toFixed(1) + '%">' +
          '<div class="fill"></div>' +
          '<div class="rank">' + (i + 1) + "</div>" +
          '<div class="dot"></div>' +
          '<div class="name"' + nameStyle + ' title="' + esc(r.name) + '">' +
            '<span class="label">' + esc(r.name) + "</span>" +
            (r.isPet ? '<span class="pet-tag">Pet</span>' : "") +
          "</div>" +
          '<div class="amount">' + amountHtml(r.dps, r.damage) + "</div>" +
        "</div>"
      );
    }).join("");
  }

  function renderDrillDown(sel) {
    var abilities = (sel.abilities || []).slice().sort(function (a, b) { return b.dps - a.dps; });
    var maxDps = abilities.length ? abilities[0].dps : 0;
    var listHtml = abilities.length ?
      abilities.map(function (a, i) {
        var swatch = "var(" + RANK_COLORS[i % RANK_COLORS.length] + ")";
        var pct = maxDps > 0 ? Math.max(4, (a.dps / maxDps) * 100) : 0;
        return (
          '<div class="bar-row" style="--swatch:' + swatch + ';--pct:' + pct.toFixed(1) + '%">' +
            '<div class="fill"></div>' +
            '<div class="rank">' + (i + 1) + "</div>" +
            '<div class="dot"></div>' +
            '<div class="name" title="' + esc(a.name) + '"><span class="label">' + esc(a.name) + "</span></div>" +
            '<div class="amount">' + amountHtml(a.dps, a.damage) + "</div>" +
          "</div>"
        );
      }).join("") :
      '<div style="color:var(--ink-3);font-size:0.88rem;padding:6px 2px">No ability breakdown yet.</div>';
    els.barlist.innerHTML =
      '<div class="drill-header" data-drill-back="1">' +
        '<div class="drill-who"><button class="drill-back" title="Back">&#8249;</button>' +
          '<span class="drill-name">' + esc(sel.name) + "</span></div>" +
        '<span class="drill-total">' + fmtNum(sel.dps) + " dps · " + fmtNum(sel.damage) + "</span>" +
      "</div>" +
      '<div class="drill-list">' + listHtml + "</div>";
  }

  els.barlist.addEventListener("click", function (e) {
    if (e.target.closest("[data-drill-back]")) {
      selectedRowKey = null;
      renderBarList(lastRenderedRows);
      return;
    }
    var row = e.target.closest("[data-row-key]");
    if (row) {
      selectedRowKey = row.dataset.rowKey;
      renderBarList(lastRenderedRows);
    }
  });
  // renderBarList() needs the same `rows` render() last computed so the
  // click handler above can re-render immediately (drilling in, or backing
  // out) without waiting up to a second for the next setInterval tick.
  var lastRenderedRows = [];

  function selfSummary(stats) {
    var row = null;
    for (var i = 0; i < stats.rows.length; i++) {
      if (stats.rows[i].name === "You") { row = stats.rows[i]; break; }
    }
    if (!row) return { dps: 0, damage: 0, pet: null };
    var pet = (row.pets && row.pets[0]) ? { name: row.pets[0].name, dps: row.pets[0].dps } : null;
    return { dps: row.dps, damage: row.damage, pet: pet };
  }

  var visitCompletedKills = createCompletedKillQueue();
  function updateSubmitUI(finishedEnc, displayOnly) {
    var eligible = !!(finishedEnc && finishedEnc.mobKilled && isKnownBoss(finishedEnc.mobName));
    els.submitRow.hidden = true;
    els.autoSubmitLine.hidden = true;
    if (!eligible) {
      els.autoSubmitToggles.hidden = true;
      return;
    }
    els.autoSubmitToggles.hidden = true;
    if (displayOnly) return;
    if (!FirstRunPolicy.permitsSubmission(settings)) return;
    // updateSubmitUI() fires on every render tick while this stays the most
    // recently finished encounter — only actually ask/auto-submit once per
    // kill, keyed on its unique startTime.
    if (lastSubmitPromptedStartTime === finishedEnc.startTime) return;
    lastSubmitPromptedStartTime = finishedEnc.startTime;
    requestSubmitFor(finishedEnc, settings.autoSubmitMode);
  }

  function requestSubmitFor(finishedEnc, mode) {
    if (!characterName || !realm) return;
    var stats = EQP.computeStats(finishedEnc);
    var youRow = (stats.rows || []).find(function (r) { return r.name === "You"; });
    var rawText = rawTextForEncounter(finishedEnc);
    // Finalize the existing live submission with only its unsent tail to preserve streaming verification.
    var stream = liveStreams[finishedEnc.startTime];
    delete liveStreams[finishedEnc.startTime];
    var payload = {
      mode: mode,
      characterName: characterName,
      realm: realm,
      soloMode: false,
      mobName: finishedEnc.mobName,
      dps: youRow ? youRow.dps : 0,
      damage: youRow ? youRow.damage : 0,
      difficulty: finishedEnc.difficultyKnown ? finishedEnc.difficulty : null,
      startTime: finishedEnc.startTime
    };
    if (stream && stream.submissionId) {
      payload.existingSubmissionId = stream.submissionId;
      payload.finalChunk = rawText.slice(stream.sentLength);
    } else {
      // Never got a live stream going (too short, or the fight ended before
      // the /api/streams start call resolved) — same one-shot path as before.
      payload.rawText = rawText;
    }
    window.dyrelog.requestSubmit(payload);
  }

  var liveStreams = {};
  var STREAM_MIN_MS_BEFORE_START = 5000;
  function maybeStreamLiveFight(enc) {
    if (!FirstRunPolicy.permitsSubmission(settings)) return;
    if (!characterName || !realm) return;
    if (!enc || !isKnownBoss(enc.mobName)) return;
    if ((enc.endTime - enc.startTime) < STREAM_MIN_MS_BEFORE_START) return;
    var stream = liveStreams[enc.startTime];
    if (!stream) stream = liveStreams[enc.startTime] = { submissionId: null, sentLength: 0, starting: false };
    if (!stream.submissionId) {
      if (stream.starting) return;
      stream.starting = true;
      window.dyrelog.startLiveStream({ characterName: characterName, realm: realm, soloMode: false }).then(function (res) {
        stream.starting = false;
        if (res && res.ok) stream.submissionId = res.submissionId;
      });
      return;
    }
    var fullText = rawTextForEncounter(enc);
    if (fullText.length <= stream.sentLength) return;
    var chunk = fullText.slice(stream.sentLength);
    stream.sentLength = fullText.length;
    window.dyrelog.pushLiveBatch(stream.submissionId, chunk);
  }

  function currentSessionMembers() {
    if (combatSessionStart === null) return state.current ? [state.current] : [];
    var members = state.encounters.filter(function (enc) { return enc.startTime >= combatSessionStart; });
    if (state.current) members.push(state.current);
    return members;
  }

  function buildSessions() {
    var gapMs = state.gapMs || 9000;
    var sessions = [];
    (state.encounters || []).forEach(function (enc) {
      var last = sessions[sessions.length - 1];
      if (last && (enc.startTime - last.lastEndTime) <= gapMs) {
        last.members.push(enc);
        last.lastEndTime = enc.endTime;
      } else {
        sessions.push({ members: [enc], lastEndTime: enc.endTime, isLive: false });
      }
    });
    if (state.current) {
      var last2 = sessions[sessions.length - 1];
      if (last2 && (state.current.startTime - last2.lastEndTime) <= gapMs) {
        last2.members.push(state.current);
        last2.isLive = true;
      } else {
        sessions.push({ members: [state.current], lastEndTime: state.current.endTime, isLive: true });
      }
    }
    return sessions;
  }
  function sessionKeyOf(session) { return String(session.members[0].startTime); }

  function sessionShortLabel(session) {
    var merged = EQP.mergeEncounters(session.members);
    var stats = EQP.computeStats(merged);
    var byMob = stats.byMob || [];
    if (!byMob.length) return "Unknown target";
    var primary = byMob[0];
    var partyCount = (stats.rows || []).filter(function (r) { return r.name !== "You"; }).length;
    return primary.name +
      (primary.generation > 1 ? " (spawn " + primary.generation + ")" : "") +
      (partyCount > 0 ? " +" + partyCount : "");
  }

  function renderFightSelect(sessions) {
    var current = sessions[sessions.length - 1];
    if (selectedSessionKey && !sessions.some(function (s) { return sessionKeyOf(s) === selectedSessionKey; })) {
      selectedSessionKey = null;
    }
    var activeKey = selectedSessionKey || "";
    var activeSession = selectedSessionKey
      ? sessions.find(function (s) { return sessionKeyOf(s) === selectedSessionKey; })
      : current;
    els.fightSelect.textContent = activeSession ? sessionShortLabel(activeSession) : "Waiting for a fight…";
    if (!sessions.length) {
      els.fightPopup.innerHTML = '<div class="fight-popup-item" style="cursor:default;">Waiting for a fight…</div>';
      return;
    }
    els.fightPopup.innerHTML = sessions.map(function (s, i) {
      var isCurrent = i === sessions.length - 1;
      var key = isCurrent ? "" : sessionKeyOf(s);
      var label = isCurrent ? "Current Fight" : sessionShortLabel(s);
      return '<div class="fight-popup-item' + (key === activeKey ? " active" : "") + '" data-key="' + esc(key) + '">' + esc(label) + "</div>";
    }).join("");
  }
  function positionFightPopup() {
    var rect = els.fightSelect.getBoundingClientRect();
    els.fightPopup.style.left = Math.round(rect.left) + "px";
    els.fightPopup.style.bottom = Math.round(window.innerHeight - rect.top + 4) + "px";
  }
  function closeFightPopup() { els.fightPopup.hidden = true; }
  els.fightSelect.addEventListener("click", function (evt) {
    evt.stopPropagation();
    if (!els.fightPopup.hidden) { closeFightPopup(); return; }
    positionFightPopup();
    els.fightPopup.hidden = false;
  });
  els.fightPopup.addEventListener("click", function (evt) {
    var item = evt.target.closest(".fight-popup-item[data-key]");
    if (!item) return;
    selectedSessionKey = item.dataset.key || null;
    closeFightPopup();
    render();
  });
  document.addEventListener("click", closeFightPopup);
  window.addEventListener("resize", closeFightPopup);

  function renderPickedSession(session, now) {
    var members = session.members;
    if (session.isLive) {
      var liveMember = members[members.length - 1];
      members = members.slice(0, -1).concat([Object.assign({}, liveMember, { endTime: Math.max(liveMember.endTime, now - 2000) })]);
    }
    var merged = EQP.mergeEncounters(members);
    var stats = EQP.computeStats(merged);
    var self = selfSummary(stats);
    els.mobDiff.textContent = "· " + (DIFFICULTY_LABELS[merged.difficulty] || "Base");
    els.fightTotal.textContent = fmtNum(self.damage);
    els.fightTimer.textContent = fmtDur((merged.endTime - merged.startTime) / 1000);
    lastRenderedRows = stats.rows;
    renderBarList(stats.rows);
    updateSubmitUI(null);
    updateMiniBar(self.dps, self.damage, self.pet, stats.rows);
    updateWatchBadge(self.dps, els.fightTimer.textContent, self.pet);
  }

  function render() {
    EQP.checkTimeout(state, Date.now());
    if (knownBossNames && characterName && realm) {
      visitCompletedKills(state.encounters, function (enc) { updateSubmitUI(enc); });
    }
    if (state.current) maybeStreamLiveFight(state.current);
    var now = Date.now();

    var pushPayload = { current: state.current, encounters: state.encounters, characterName: characterName, gapMs: state.gapMs };

    var sessions = buildSessions();
    renderFightSelect(sessions);
    if (selectedSessionKey) {
      var picked = null;
      for (var si = 0; si < sessions.length; si++) {
        if (sessionKeyOf(sessions[si]) === selectedSessionKey) { picked = sessions[si]; break; }
      }
      if (picked) {
        renderPickedSession(picked, now);
        window.dyrelog.pushState(pushPayload);
        return;
      }
      selectedSessionKey = null;
    }

    if (state.current) {
      var enc = state.current;
      if (combatSessionStart === null || (now - lastCombatActivityAt) > state.gapMs) {
        combatSessionStart = enc.startTime;
      }
      lastCombatActivityAt = now;
      var members = currentSessionMembers();
      // Only the LIVE member's endTime gets the 2s grace extension (so
      // duration/dps don't read as artificially truncated between ticks)
      // — every earlier, already-finished member keeps its own real one.
      var extended = members.slice(0, -1).concat([Object.assign({}, enc, { endTime: Math.max(enc.endTime, now - 2000) })]);
      var merged = EQP.mergeEncounters(extended);
      var stats = EQP.computeStats(merged);
      var self = selfSummary(stats);
    els.mobDiff.textContent = "· " + (DIFFICULTY_LABELS[merged.difficulty] || "Base");
      els.fightTotal.textContent = fmtNum(self.damage);
      els.fightTimer.textContent = fmtDur((merged.endTime - merged.startTime) / 1000);
      lastRenderedRows = stats.rows;
      renderBarList(stats.rows);
      updateSubmitUI(null);
      updateMiniBar(self.dps, self.damage, self.pet, stats.rows);
      updateWatchBadge(self.dps, els.fightTimer.textContent, self.pet);
    } else if (state.encounters.length) {
      if (combatSessionStart !== null && (now - lastCombatActivityAt) > state.gapMs) {
        combatSessionStart = null;
      }
      var last = state.encounters[state.encounters.length - 1];
      var lastMembers = currentSessionMembers();
      if (!lastMembers.length) lastMembers = [last];
      var lastMerged = EQP.mergeEncounters(lastMembers);
      var lastStats = EQP.computeStats(lastMerged);
      var lastSelf = selfSummary(lastStats);
      els.mobDiff.textContent = "· " + (DIFFICULTY_LABELS[lastMerged.difficulty] || "Base");
      els.fightTotal.textContent = fmtNum(lastSelf.damage);
      els.fightTimer.textContent = fmtDur(lastStats.duration);
      lastRenderedRows = lastStats.rows;
      renderBarList(lastStats.rows);
      updateSubmitUI(last, true);
      updateMiniBar(lastSelf.dps, lastSelf.damage, lastSelf.pet, lastStats.rows);
      updateWatchBadge(lastSelf.dps, els.fightTimer.textContent, lastSelf.pet);
    } else {
      combatSessionStart = null;
      els.mobDiff.textContent = "";
      els.fightTotal.textContent = "";
      els.fightTimer.textContent = "";
      lastRenderedRows = [];
      renderBarList([]);
      updateSubmitUI(null);
      updateMiniBar(0, 0, null);
      updateWatchBadge(0, "0:00");
    }

    window.dyrelog.pushState(pushPayload);
  }

  function updateMiniBar(dps, damage, pet, rows) {
    var showPets = !(settings && settings.showPets === false);
    var petDps = pet && pet.dps > 0 ? pet.dps : 0;
    var ownDps = showPets ? Math.max(0, dps - petDps) : dps;
    if (!showPets) pet = null;
    document.getElementById("mini-timer").textContent = els.fightTimer.textContent || "0:00";
    els.miniTotal.textContent = fmtNum(damage) + " total dmg";
    els.miniName.textContent = characterName || "Dyrelog";
    els.miniDps.textContent = fmtNum(ownDps) + " dps";
    if (pet && pet.dps > 0) {
      els.miniPetRow.hidden = false;
      els.miniPetName.textContent = pet.name;
      els.miniPetDps.textContent = fmtNum(pet.dps) + " dps";
    } else {
      els.miniPetRow.hidden = true;
    }
    var party = (rows || []).filter(function (r) { return r.name !== "You"; });
    var maxDamage = party.reduce(function (max, r) { return Math.max(max, Number(r.damage) || 0); }, 0);
    els.miniPartyList.innerHTML = party.map(function (r, i) {
      var rank = Math.min(i + 1, 6), damage = Number(r.damage) || 0;
      var fill = maxDamage ? Math.round(damage / maxDamage * 100) : 0;
      return '<div class="mini-party-bar" style="--swatch:var(--rank' + rank + ');--fill:' + fill + '%"><span>' + esc(r.name) + '</span><b>' + fmtNum(r.dps) + ' dps</b><small>' + fmtNum(damage) + '</small></div>';
    }).join('');
  }

  function updateWatchBadge(dps, timerText, pet) {
    // Same self/pet split as updateMiniBar() above — merging the pet in has to
    // move the badge's own number, otherwise the toggle just deletes the pet
    // line. See that function's comment for why `dps` is always combined.
    var showPets = !(settings && settings.showPets === false);
    var petDps = pet && pet.dps > 0 ? pet.dps : 0;
    var ownDps = showPets ? Math.max(0, dps - petDps) : dps;
    els.watchDpsNum.textContent = fmtNum(ownDps);
    els.watchTimer.textContent = timerText || "0:00";
    var showPet = showPets && petDps > 0;
    els.watchPet.hidden = !showPet;
    els.watchPet.textContent = showPet ? fmtNum(petDps) : "";
  }

  function scheduleIdleFade() {
    clearTimeout(idleTimer);
    document.body.classList.remove("idle-faded");
    if (!settings || !settings.fadeIdleEnabled) return;
    idleTimer = setTimeout(function () {
      document.body.classList.add("idle-faded");
    }, (settings.fadeIdleSeconds || 10) * 1000);
  }
  document.addEventListener("mousemove", scheduleIdleFade);
  document.addEventListener("mousedown", scheduleIdleFade);

  function applySourceStatus(status) {
    if (!status || !status.ok) return;
    var identity = parseCharacterFromFilename(status.fileName);
    characterName = identity ? identity.characterName : null;
    realm = identity ? identity.realm : null;
    els.wordmark.textContent = characterName || "DYRELOG";
    state = makeState(characterName);
    lineBuffer = "";
    rawLineBuffer = [];
    selectedRowKey = null;
    selectedSessionKey = null;
    combatSessionStart = null;
    showFightView();
    render();
  }

  window.dyrelog.onSourceStatus(applySourceStatus);
  window.dyrelog.onLogChunk(function (text) {
    feedLines(text);
    render();
  });

  document.getElementById("btn-pick-file").addEventListener("click", async function () {
    var res = await window.dyrelog.pickFile();
    if (res) applySourceStatus({ ok: true, fileName: res.fileName });
  });

  document.getElementById("btn-pick-folder").addEventListener("click", async function () {
    var res = await window.dyrelog.pickFolder();
    if (!res) return;
    if (!res.matches.length) {
      alert("No eqlog_*.txt files found in that folder.");
      return;
    }
    if (res.chosen) {
      applySourceStatus({ ok: true, fileName: res.chosen });
      return;
    }
    setActiveView("folder");
    els.folderSelect.innerHTML = res.matches.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + "</option>"; }).join("");
    els.folderPick.dataset.dir = res.dir;
  });

  document.getElementById("btn-folder-use").addEventListener("click", async function () {
    var dir = els.folderPick.dataset.dir;
    var fileName = els.folderSelect.value;
    var res = await window.dyrelog.useFolderFile(dir, fileName);
    if (res) applySourceStatus({ ok: true, fileName: res.fileName });
  });

  document.querySelectorAll("#auto-submit-toggles .toggle-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      window.dyrelog.saveSettings({ autoSubmitMode: b.dataset.mode, autoSubmitChosen: true }).then(function (s) {
        applySettings(s);
        render();
      });
    });
  });

  document.getElementById("btn-settings").addEventListener("click", function () { window.dyrelog.openSettings(); });
  document.getElementById("btn-analysis").addEventListener("click", function () { window.dyrelog.openAnalysis(); });
  document.getElementById("btn-leaderboard").addEventListener("click", function () { window.dyrelog.openLeaderboard(); });
  document.getElementById("btn-close").addEventListener("click", function () { window.dyrelog.close(); });

  function toggleMini() {
    miniMode = !miniMode;
    document.body.classList.toggle("mini", miniMode);
    if (settings) applySettings(settings);
    scheduleIdleFade();
    if (miniMode) {
      window.dyrelog.getBounds().then(function (b) {
        preMiniBounds = b;
        window.dyrelog.setMiniMode(true);
        window.dyrelog.getMiniSize().then(function (size) {
          window.dyrelog.setBounds({ x: b.x, y: b.y, width: size.width, height: size.height }, { persist: false });
        });
      });
    } else {
      window.dyrelog.setMiniMode(false);
      if (preMiniBounds) {
        window.dyrelog.setBounds(preMiniBounds, { persist: false });
        preMiniBounds = null;
      }
    }
  }
  document.getElementById("btn-mini").addEventListener("click", toggleMini);
  // Mini's bars/restore control sits inside the mini-bar drag handle. Make
  // the interaction explicit on pointerdown as well as click so Electron's
  // frameless drag handling cannot swallow it before the click is generated.
  document.getElementById("btn-restore").addEventListener("pointerdown", function (evt) {
    evt.stopPropagation();
    evt.preventDefault();
  });
  document.getElementById("btn-restore").addEventListener("click", function (evt) {
    evt.stopPropagation();
    toggleMini();
  });
  document.getElementById("btn-mini-circle").addEventListener("click", function (evt) {
    evt.stopPropagation();
    switchMode("circle");
  });
  document.getElementById("btn-mini-settings").addEventListener("click", function (evt) {
    evt.stopPropagation();
    window.dyrelog.openSettings();
  });
  document.getElementById("btn-mini-pets").addEventListener("click", function (evt) {
    evt.stopPropagation();
    // Keyboard activation remains supported; mouse activation is handled by
    // pointerup below because the parent is an Electron drag region.
    if (evt.detail === 0) window.dyrelog.saveSettings({ showPets: !(settings.showPets !== false) }).then(applySettings);
  });
  document.getElementById("btn-mini-pets").addEventListener("pointerdown", function (evt) {
    evt.stopPropagation();
    evt.preventDefault();
  });
  document.getElementById("btn-mini-pets").addEventListener("pointerup", function (evt) {
    evt.stopPropagation();
    window.dyrelog.saveSettings({ showPets: !(settings.showPets !== false) }).then(applySettings);
  });

  function applyDisplayStyle(style) {
    if (style === currentDisplayStyle) return;
    var enteringCircle = style === "circle";
    currentDisplayStyle = style;
    document.body.classList.toggle("watch", enteringCircle);
    scheduleIdleFade();
    if (enteringCircle) {
      window.dyrelog.getBounds().then(function (b) {
        preWatchBounds = b;
        window.dyrelog.setWatchMode(true);
        var size = watchWindowSizeFor(currentCircleScale);
        window.dyrelog.setBounds({ x: b.x, y: b.y, width: size, height: size }, { persist: false });
      });
    } else {
      window.dyrelog.setWatchMode(false);
      if (preWatchBounds) {
        window.dyrelog.setBounds(preWatchBounds, { persist: false });
        preWatchBounds = null;
      }
    }
  }
  function applyCircleScale(scale) {
    scale = scale || 1;
    document.documentElement.style.setProperty("--circle-scale", String(scale));
    if (scale === currentCircleScale) return;
    var prevScale = currentCircleScale;
    currentCircleScale = scale;
    if (currentDisplayStyle !== "circle") return;
    var prevSize = watchWindowSizeFor(prevScale);
    var size = watchWindowSizeFor(scale);
    window.dyrelog.getBounds().then(function (b) {
      var delta = size - prevSize;
      window.dyrelog.setBounds({
        x: Math.round(b.x - delta / 2),
        y: Math.round(b.y - delta / 2),
        width: size,
        height: size
      }, { persist: false });
    });
  }
  function switchMode(target) {
    var goingMini = target === "mini";
    var goingCircle = target === "circle";
    if (miniMode && !goingMini) toggleMini();
    if (currentDisplayStyle === "circle" && !goingCircle) applyDisplayStyle("bars");
    if (goingCircle) applyDisplayStyle("circle");
    else if (goingMini && !miniMode) toggleMini();
    window.dyrelog.saveSettings({ displayStyle: goingCircle ? "circle" : "bars" });
  }
  document.getElementById("btn-circle").addEventListener("click", function () { switchMode("circle"); });
  function togglePets() {
    window.dyrelog.saveSettings({ showPets: !(settings.showPets !== false) }).then(applySettings);
  }
  document.getElementById("btn-pets").addEventListener("click", togglePets);
  wireBadgeIcon(els.watchPetsBtn, "pets", togglePets);

  function fightMenuSessions() {
    var sessions = buildSessions();
    var reversed = sessions.slice().reverse();
    var activeKey = selectedSessionKey || "";
    return reversed.map(function (s, i) {
      var isCurrent = i === 0;
      var key = isCurrent ? "" : sessionKeyOf(s);
      return { key: key, label: isCurrent ? "Current Fight" : sessionShortLabel(s), active: key === activeKey };
    });
  }
  els.watchBadge.addEventListener("click", function () { window.dyrelog.openSettings(); });
  els.watchBadge.addEventListener("contextmenu", function (evt) {
    evt.preventDefault();
    window.dyrelog.showWatchMenu(fightMenuSessions());
  });
  function applyIconAngles(angles) {
    [["menu", els.watchMenuBtn], ["mini", els.watchMiniBtn], ["bars", els.watchBarsBtn], ["pets", els.watchPetsBtn]].forEach(function (pair) {
      var deg = angles[pair[0]];
      if (deg != null) pair[1].style.setProperty("--btn-angle", deg + "deg");
      else pair[1].style.removeProperty("--btn-angle");
    });
  }
  function wireBadgeIcon(btn, angleKey, onActivate) {
    var dragging = false, moved = false, suppressClick = false, startX = 0, startY = 0, angle = 0;
    btn.addEventListener("mousedown", function (evt) {
      evt.stopPropagation();
      evt.preventDefault();
      dragging = true;
      moved = false;
      suppressClick = false;
      startX = evt.clientX;
      startY = evt.clientY;
    });
    btn.addEventListener("click", function (evt) {
      evt.stopPropagation();
      // Activate on the button's own click. Relying on document-level mouseup
      // is flaky in frameless Electron windows because Chromium may route that
      // event to the app-region drag handler instead of the renderer.
      if (!suppressClick) onActivate();
      suppressClick = false;
    });
    document.addEventListener("mousemove", function (evt) {
      if (!dragging) return;
      if (!moved && (Math.abs(evt.clientX - startX) > 4 || Math.abs(evt.clientY - startY) > 4)) moved = true;
      if (!moved) return;
      var rect = els.watchBadge.getBoundingClientRect();
      var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      angle = Math.atan2(evt.clientX - cx, -(evt.clientY - cy)) * 180 / Math.PI;
      if (angle < 0) angle += 360;
      btn.style.setProperty("--btn-angle", angle + "deg");
    });
    document.addEventListener("mouseup", function () {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        suppressClick = true;
        var next = Object.assign({}, settings.iconAngles || {});
        next[angleKey] = Math.round(angle);
        window.dyrelog.saveSettings({ iconAngles: next }).then(applySettings);
      }
    });
  }
  wireBadgeIcon(els.watchMenuBtn, "menu", function () { window.dyrelog.showWatchMenu(fightMenuSessions()); });
  wireBadgeIcon(els.watchMiniBtn, "mini", function () { switchMode("mini"); });
  wireBadgeIcon(els.watchBarsBtn, "bars", function () { switchMode("bars"); });
  window.dyrelog.onFightPicked(function (key) {
    selectedSessionKey = key || null;
    render();
  });

  els.btnSubmit.disabled = true;

  window.dyrelog.onSettingsUpdate(function (s) {
    applySettings(s);
    render();
  });

  var updateDismissed = false;
  var updaterBusy = false;
  function showUpdateBanner(info) {
    if (!info || updateDismissed || updaterBusy) return;
    els.updateBannerText.textContent = "Update available — v" + info.version;
    els.updateBanner.hidden = false;
  }
  els.updateBanner.addEventListener("click", function () {
    if (updaterBusy) return;
    updaterBusy = true;
    els.updateBannerDismiss.hidden = true;
    els.updateBannerText.textContent = "Checking for update…";
    window.dyrelog.checkForUpdatesNow();
  });
  els.updateBannerDismiss.addEventListener("click", function (evt) {
    evt.stopPropagation();
    updateDismissed = true;
    els.updateBanner.hidden = true;
  });
  window.dyrelog.onUpdateAvailable(showUpdateBanner);
  window.dyrelog.getUpdateInfo().then(showUpdateBanner);

  window.dyrelog.onUpdaterStatus(function (payload) {
    if (!updaterBusy) return;
    var state = payload && payload.state;
    if (state === "checking") {
      els.updateBannerText.textContent = "Checking for update…";
    } else if (state === "available") {
      els.updateBannerText.textContent = "Downloading v" + (payload.version || "") + "…";
      window.dyrelog.downloadAndInstallUpdate();
    } else if (state === "downloading") {
      els.updateBannerText.textContent = "Downloading update… " + Math.round(payload.percent || 0) + "%";
    } else if (state === "ready") {
      els.updateBannerText.textContent = "Update downloaded — relaunching…";
    } else if (state === "up-to-date") {
      // Shouldn't normally happen (the banner only shows once the lighter
      // GitHub-poll check already found something newer), but handle it
      // gracefully rather than leaving the banner stuck on "Checking…"
      // forever if the two checks ever disagree.
      updaterBusy = false;
      els.updateBannerDismiss.hidden = false;
      els.updateBannerText.textContent = "Already up to date";
    } else if (state === "error") {
      updaterBusy = false;
      els.updateBannerDismiss.hidden = false;
      els.updateBannerText.textContent = "Update failed — click to retry (" + (payload.message || "unknown error") + ")";
    }
  });

  (async function boot() {
    var loadedSettings = await window.dyrelog.getSettings();
    applySettings(loadedSettings);
    if (loadedSettings.cachedBossNames && loadedSettings.cachedBossNames.length) {
      applyKnownBossNames(bossNamesFromArray(loadedSettings.cachedBossNames));
    }
    fetchKnownBosses();

    var saved = await window.dyrelog.getSavedSource();
    if (saved && saved.path) {
      applySourceStatus({ ok: true, fileName: saved.fileName || (saved.path.split(/[\\/]/).pop()) });
    } else {
      showEmptyState();
    }
    setInterval(render, 1000);
  })();
})();
