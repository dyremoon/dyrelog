// Dyrelog desktop overlay — mini-mode window renderer. Parsing is EQP
// (eqp-core.js, synced from overlay/eqp-core.js — see
// scripts/sync-eqp-core.js), identical to the browser overlay; this file's
// job is the mini-mode UI, resize/mini-mode window control, and wiring raw
// text chunks from main (see main.js's startTailing()) into it. The
// Settings UI itself lives in its own popup window (renderer/settings.js) —
// this window only reads settings, live, over IPC — see applySettings().
//
// NOT wired up yet, on purpose: Discord login and the Submit pill's actual
// POST to the worker API. The Submit button renders per the auto-submit
// preference but stays disabled — see the TODO near btn-submit. Local
// tracking (mob identity, pet folding, difficulty auto-detect, the
// last-spell-caster heuristic for DoT ticks, the self/pet damage split)
// is already fully live here, same as the browser overlay, because it all
// comes from eqp-core.js unchanged.

(function () {
  "use strict";

  var RANK_COLORS = ["--rank1", "--rank2", "--rank3", "--rank4", "--rank5", "--rank6"];
  var DIFFICULTY_LABELS = { D1: "D1 · Awakened", D2: "D2 · Adaptive", D3: "D3 · Fused", D4: "D4 · Refined" };
  var TOP_N = 6; // mini mode shows a party-sized card, not a raid wall — see README art spec
  var BASE_WIDTH = 320, BASE_HEIGHT = 420;
  // Mirrors --pet-default in style.css — a pet's default bar color when
  // Settings > Pet bar isn't overridden, deliberately distinct from every
  // rank hue (not just "whichever rank index the pet happens to sort
  // into") so it never coincidentally matches its owner's color — see
  // colorForRow() below and item 3.5 of the newest feature list.
  var PET_DEFAULT_COLOR = "#4fa8c9";
  var FONT_STACKS = {
    system: '-apple-system, "Segoe UI", "Inter", system-ui, sans-serif',
    serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    mono: 'Consolas, "SF Mono", "Cascadia Code", "Courier New", monospace',
    rounded: '"Segoe UI Rounded", -apple-system, system-ui, sans-serif',
    // The four below are loaded from Google Fonts in index.html — see
    // item 3 ("some gamer ones, some cool ones, some fancy ones").
    fantasy: '"Cinzel", Georgia, serif',
    medieval: '"MedievalSharp", "Segoe UI", sans-serif',
    scifi: '"Orbitron", -apple-system, sans-serif',
    pixel: '"Press Start 2P", "Courier New", monospace'
  };

  // Mirrors class-colors.csv at the project root — the 16 EverQuest
  // classes with their established colors. Used only for the optional
  // "Use class colors" setting (applies to your own row; every other
  // combatant still uses the fixed rank hues, since we have no way to
  // know a groupmate's class from the log).
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
  // A player's own saved override (Settings > Use class colors > pick a
  // class > its own color swatch) wins over the built-in default above —
  // see item 4.1 ("adjust and save our own class colors manually, but
  // have a default... if they don't want to make their own").
  function classColorFor(className) {
    return (settings.classColorOverrides && settings.classColorOverrides[className]) || EQ_CLASS_COLORS[className];
  }

  // The curated leaderboard boss list, fetched once at boot — see
  // fetchKnownBosses() near the bottom of this file. Gates the Submit
  // prompt so it only ever shows after a real leaderboard-eligible kill,
  // not every trash mob — see item 4.3 ("It seems to show up after every
  // fight regardless of even if its a trash mob"). Also fed into eqp-core
  // via EQP.newState()'s knownBossNames (see makeState() below), which
  // the desktop app was never actually passing before this — a latent
  // gap that also means trash-preceding-a-boss identity promotion
  // (considerMobIdentity() in eqp-core.js) now genuinely works here too.
  var knownBossNames = null;
  var API_BASE = "https://dyrelog-api.dyremoon.workers.dev"; // mirrors leaderboard.js

  function makeState(charName) {
    return EQP.newState({ gapSeconds: 9, soloMode: false, characterName: charName || null, knownBossNames: knownBossNames });
  }

  // Feeds a fresh Set of boss names into both the module-level var and the
  // live parser state, then RE-checks every mob already confirmed within
  // whatever fight is currently open against it — see
  // EQP.reconsiderCurrentMob()'s own comment for why the second step
  // matters: just assigning state.knownBossNames only ever affects mobs
  // considerMobIdentity() sees FOR THE FIRST TIME after this point, not
  // ones already sitting in the current encounter (e.g. Lady Vox showed
  // up and got confirmed before this resolved, but never got promoted to
  // the fight's primary identity because the boss list wasn't loaded yet
  // at that exact moment) — which used to mean a fight that started (or
  // even finished, on a slow connection) before the fetch below resolved
  // could NEVER get the Ask-before-submit prompt, for its entire
  // duration. See "i killed vox again... and still no popup to submit."
  function applyKnownBossNames(names) {
    knownBossNames = names;
    if (state) {
      state.knownBossNames = knownBossNames;
      EQP.reconsiderCurrentMob(state);
    }
  }

  // Populates knownBossNames from the same public endpoint the Leaderboards
  // window already hits. Called once from boot() — first from whatever was
  // cached on disk from the LAST successful fetch (near-instant, no network
  // round trip needed — see Settings' cachedBossNames in main.js), then
  // again from a fresh network request, so the list is both immediately
  // available AND kept current. If neither the cache nor the network has
  // ever produced a list, knownBossNames stays null, and isKnownBoss()
  // below treats that as "don't know yet, don't show the Submit prompt"
  // rather than guessing.
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
      // The endpoint's real shape is { bosses: [...] } (see handleBossList()
      // in worker/src/leaderboard.js — leaderboard.js's own fetch of this
      // same endpoint already unwraps it the same way, via `data.bosses`).
      // This used to check Array.isArray(bosses) on the raw response
      // object itself, which is never true for a plain object — so this
      // always fell through to the empty-array fallback and knownBossNames
      // was silently an empty (but non-null, so "known, and empty") Set
      // forever. isKnownBoss() then reported every mob, Lady Vox included,
      // as not a curated boss — no exception, no network error, just a
      // Submit prompt ("Ask before submit") that could never fire for
      // anyone. See the "Bar is fixed" thread — "I killed lady vox with
      // ask to submit on, and it didn't ask me after she died."
      var bosses = (data && Array.isArray(data.bosses)) ? data.bosses : [];
      var names = bossNamesFromArray(bosses.map(function (b) { return b && b.name; }));
      applyKnownBossNames(names);
      // Cache this successful fetch to disk (fire-and-forget) so the NEXT
      // launch has a real boss list from the instant the app starts,
      // instead of racing a fresh network request every single time.
      window.dyrelog.saveSettings({ cachedBossNames: Array.from(names), cachedBossNamesAt: Date.now() });
    } catch (err) {
      // Offline/worker down — whatever applyKnownBossNames() was already
      // called with (the on-disk cache, if any — see boot()) stays in
      // effect rather than getting cleared; no broken fetch loop either.
    }
  }

  // Gates the Submit prompt (item 4.3) — only a curated, leaderboard-eligible
  // boss should ever trigger it, never a trash mob. Unknown-yet (fetch still
  // in flight, or failed) errs toward NOT showing the prompt.
  function isKnownBoss(mobName) {
    return !!(knownBossNames && mobName && knownBossNames.has(mobName));
  }

  var state = makeState(null);
  var lineBuffer = "";
  var settings = null; // loaded on boot — see applySettings()
  var miniMode = false;
  // Display style (Bars vs. Circle — item 8), driven entirely by Settings >
  // Display style now — see applyDisplayStyle() further down. Circle forces
  // a fixed small square window while active (a round badge only reads as
  // a "watch" at a small, roughly-square size); preWatchBounds remembers
  // whatever real size/position you were at so switching back to Bars in
  // Settings restores it exactly.
  var currentDisplayStyle = "bars";
  var preWatchBounds = null;
  // Settings > Circle size (item: "resize the scale of the circle") — how
  // big the badge itself is drawn (see --circle-scale in style.css) AND,
  // via watchWindowSizeFor() below, how big the window it lives in is.
  var currentCircleScale = 1;
  var WATCH_BADGE_BASE = 132; // the badge's diameter in style.css at scale 1
  var WATCH_MARGIN = 38; // fixed breathing room around the badge inside its window
  function watchWindowSizeFor(scale) {
    // Must never go below main.js's own MIN_W (170) — set-bounds clamps
    // width up to that floor regardless, and a width/height mismatch there
    // would stretch the "circle" into an oval instead of a true circle.
    return Math.max(170, Math.round(WATCH_BADGE_BASE * (scale || 1)) + WATCH_MARGIN);
  }
  var characterName = null;
  // Combat-session continuity for the live fight timer — see item 3 of
  // the newest feature list ("it resets the duration of the fight every
  // time I select a different target"). eqp-core.js still locks one mob
  // per encounter (see considerMobIdentity() there), so killing add #1
  // and immediately tabbing to add #2 genuinely does create a brand-new
  // encounter object with a fresh startTime — that part is unchanged.
  // What changes here is purely the displayed timer: as long as the gap
  // between one encounter ending and the next one starting is shorter
  // than eqp-core's own gapMs (state.gapMs, 9s), it's read as the SAME
  // continuous pull rather than a reset, so the timer keeps counting up
  // instead of dropping back to 0:00 at every kill. This doesn't change
  // what damage gets attributed to which target (that's a deeper
  // eqp-core change — true concurrent multi-target tracking — that's
  // deliberately not part of this pass, see the chat for why), just how
  // long the header says you've been fighting.
  var combatSessionStart = null;
  var lastCombatActivityAt = 0;
  var idleTimer = null;
  // In-place spell/ability drill-down — which display row (see rowKey())
  // is currently swapped into view, or null for the normal ranked list.
  // "I like that when i click on my name in his dps meter, it swaps to my
  // breakdown, i want ours to do that instead of opening the analysis
  // window." See renderBarList()/renderDrillDown() below.
  var selectedRowKey = null;
  // "the dps meter in that companion has a dropdown to show which fight,
  // we should add that to our section too" — which recent fight the
  // #fight-select dropdown has explicitly pinned the view to, or null to
  // auto-follow whatever the existing live/last logic below would show
  // anyway (the default). See buildSessions()/renderFightSelect()/
  // renderPickedSession() further down.
  var selectedSessionKey = null;
  // A short rolling-window "current" dps, separate from the header's own
  // cumulative running average (self.dps below) — that number trends
  // toward the fight's overall average and rarely spikes, so it can't
  // answer "what was my best burst" the way a peak callout can. This is a
  // small ring buffer of {time, total damage} samples fed once a second
  // from render() (which already ticks that often); the peak is the
  // highest (damage delta / time delta) seen over any ROLLING_WINDOW_MS
  // stretch this combat session — see trackPeakDps()/resetDpsTracking().
  // "id also like to see Peak DPS like this graph does."
  var dpsSamples = [];
  var ROLLING_WINDOW_MS = 5000;
  var peakRollingDps = 0;

  var els = {
    statusDot: document.getElementById("status-dot"),
    wordmark: document.getElementById("wordmark"),
    emptyState: document.getElementById("empty-state"),
    folderPick: document.getElementById("folder-pick"),
    folderSelect: document.getElementById("folder-select"),
    fightView: document.getElementById("fight-view"),
    fightIcon: document.getElementById("fight-icon"),
    fightSelect: document.getElementById("fight-select"),
    mobDiff: document.getElementById("mob-diff"),
    mobState: document.getElementById("mob-state"),
    dpsNumber: document.getElementById("dps-number"),
    fightTimer: document.getElementById("fight-timer"),
    barlist: document.getElementById("barlist"),
    submitRow: document.getElementById("submit-row"),
    btnSubmit: document.getElementById("btn-submit"),
    autoSubmitLine: document.getElementById("auto-submit-line"),
    autoSubmitToggles: document.getElementById("auto-submit-toggles"),
    miniBar: document.getElementById("mini-bar"),
    miniDot: document.getElementById("mini-dot"),
    miniName: document.getElementById("mini-name"),
    miniDps: document.getElementById("mini-dps"),
    miniPetRow: document.getElementById("mini-pet-row"),
    miniPetName: document.getElementById("mini-pet-name"),
    miniPetDps: document.getElementById("mini-pet-dps"),
    watchBadge: document.getElementById("watch-badge"),
    watchMenuBtn: document.getElementById("watch-menu-btn"),
    watchDpsNum: document.getElementById("watch-dps-num"),
    watchTimer: document.getElementById("watch-timer"),
    peakDps: document.getElementById("peak-dps"),
    updateBanner: document.getElementById("update-banner"),
    updateBannerText: document.getElementById("update-banner-text"),
    updateBannerDismiss: document.getElementById("update-banner-dismiss")
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtNum(n) {
    return Math.round(n).toLocaleString();
  }

  // Companion-style abbreviated totals ("4.1k", "2.0k", "620") for the new
  // "dps · total dmg" amount format — see item "I also want our meter to
  // show DPS - Total dmg done... 322 - 12.2k". A whole number under 1,000
  // is shown as-is (matching how ability-level damage reads in their own
  // screenshots — "620", not "0.6k").
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

  // Same convention as the browser overlay's parseCharacterFromFilename()
  // — "eqlog_<Character>_<Realm>.txt" — so pet-folding (resolveCombatant()
  // in eqp-core.js) has an identity to fold your own pet's damage onto
  // without asking you to type your own name in.
  function parseCharacterFromFilename(filename) {
    var m = /^eqlog_([^_]+)_(.+)\.(txt|log)$/i.exec(filename || "");
    return m ? { characterName: m[1], realm: m[2] } : null;
  }

  function feedLines(text) {
    var chunk = lineBuffer + text;
    var lines = chunk.split("\n");
    lineBuffer = lines.pop();
    lines.forEach(function (line) {
      if (!line) return;
      var ev = EQP.parseLine(line);
      if (ev) EQP.ingest(state, ev);
    });
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

  // ---- settings ------------------------------------------------------
  // The actual Settings UI now lives in its own popup window (see
  // btn-settings below and main.js's createSettingsWindow()) — this
  // window only ever *reads* settings: once at boot (getSettings()) and
  // live from then on (onSettingsUpdate(), fed by every save the Settings
  // window makes — see the "settings-update" broadcast in main.js). Scale
  // is applied at the Electron BrowserWindow level by main.js; opacity,
  // theme, and text-size are pure CSS/render concerns only this window's
  // own DOM can apply to itself — see --panel-alpha below and
  // style.css's .card::before.
  // Every theme swatch Settings offers — see THEME_NAMES' use in
  // applySettings() below and the matching :root[data-theme="X"] palette
  // block each one needs in style.css. "blue"/"brass" are the original
  // pair; the rest are the newest curated presets (item 9 — "some that are
  // druidic, magical, girly, hardcore, metal, etc.").
  var THEME_NAMES = ["blue", "brass", "druidic", "magical", "girly", "hardcore", "metal"];

  function applySettings(s) {
    settings = s;
    document.documentElement.setAttribute("data-theme", THEME_NAMES.indexOf(s.theme) !== -1 ? s.theme : "blue");
    // Rounded to a whole pixel — a fractional root size (e.g. 13.125px)
    // is what was making every font, decorative ones especially, read as
    // faintly blurry: subpixel positioning forces the renderer to
    // antialias glyph edges that would otherwise land clean. See also the
    // -webkit-font-smoothing rule on body in style.css, the other half of
    // this fix.
    document.documentElement.style.fontSize = Math.round(12.5 * s.textScale) + "px";
    // Background-only opacity — see the long comment on --panel-alpha in
    // style.css. Unitless so it plugs into the bar-row fill's calc().
    document.documentElement.style.setProperty("--panel-alpha", String(s.opacity));
    document.documentElement.style.setProperty("--bar-height-mult", String(s.barHeight || 1));
    document.documentElement.style.setProperty("--font-family", FONT_STACKS[s.fontFamily] || FONT_STACKS.fantasy);
    // An explicit background color always wins over the theme's own — see
    // the "Reset to default colors" button and the theme-swatch click
    // handler in settings.js, which are what clear this back to null.
    if (s.bgColor) document.documentElement.style.setProperty("--bg-card", s.bgColor);
    else document.documentElement.style.removeProperty("--bg-card");
    // Each bar row's own outline — deliberately its own override, separate
    // from --hair (used elsewhere for icon buttons, dividers, etc.), and
    // no longer scaled down by the Background opacity slider the way it
    // used to be (see .bar-row in style.css) — "it would be nice if there
    // were some borders or some sort of structure within the graph,
    // lightweight borders at least... with their own color selector." A
    // low panel opacity used to fade this out right along with the
    // background tint, which is exactly what read as "not much of a
    // difference between minimal mode and bar mode" — structure, not just
    // color, is the point.
    if (s.borderColor) document.documentElement.style.setProperty("--row-border-color", s.borderColor);
    else document.documentElement.style.removeProperty("--row-border-color");
    // Custom text color — overrides --ink everywhere; unset means "use the
    // theme's own ink color" same as bgColor above.
    if (s.textColor) document.documentElement.style.setProperty("--ink", s.textColor);
    else document.documentElement.style.removeProperty("--ink");
    // Secondary/muted text (timer, "(defeated)"/"(live)" state, the "dps"
    // unit label, rank numbers, hints) rides --ink-2/--ink-3, not --ink —
    // recoloring those two is what actually reaches every one of those
    // elements at once. --ink-3 is derived as a dimmer version of the same
    // color rather than asked for separately, mirroring how the theme
    // presets already relate their own --ink-2/--ink-3 to each other.
    if (s.secondaryTextColor) {
      document.documentElement.style.setProperty("--ink-2", s.secondaryTextColor);
      document.documentElement.style.setProperty("--ink-3", "color-mix(in srgb, " + s.secondaryTextColor + " 65%, transparent)");
    } else {
      document.documentElement.style.removeProperty("--ink-2");
      document.documentElement.style.removeProperty("--ink-3");
    }
    // Mini mode's pet sub-line gets its own size control (item 5) instead of
    // riding the main textScale, which the pet line was too small under.
    document.documentElement.style.setProperty("--mini-pet-scale", String(s.miniPetTextScale || 1));
    // The fight timer / "(live)"/"(defeated)" status / "dps" unit label get
    // their own size control too — separate from the main Text size slider,
    // which never touched these specifically (item 7 of the newest list —
    // "there still doesn't seem to be a text font slider for dps/timer/
    // status").
    document.documentElement.style.setProperty("--secondary-text-scale", String(s.secondaryTextScale || 1));
    // Circle size BEFORE display style, so that if this save is what's
    // actually turning Circle on, the window opens at the right size the
    // first time instead of at the old scale for one frame.
    applyCircleScale(s.circleScale || 1);
    // Bars vs. Circle (item 8) — only ever changes from a Settings save now,
    // never a header-icon click; see applyDisplayStyle() further down, which
    // no-ops if this isn't actually a change from what's already applied.
    applyDisplayStyle(s.displayStyle || "bars");
    scheduleIdleFade(); // fadeIdleEnabled/fadeIdleSeconds may have just changed
  }

  // ---- rendering -------------------------------------------------------
  // A row's internal key is always "You" (eqp-core.js/submissions rely on
  // that literal string) — this only swaps what gets *displayed*, once we
  // know the log's own character name (see parseCharacterFromFilename()).
  function displayName(rawName) {
    return rawName === "You" ? (characterName || "You") : rawName;
  }

  // isPet matters here, not just ownerName — buildDisplayRows() below
  // gives a pet row the SAME ownerName as its owner's own row (both are
  // "You" for your own pet), so without this a pet used to silently pick
  // up your class color too, making it read as the exact same color as
  // you — see item 3.5 of the earlier feature list. A custom Settings >
  // Pet bar color (or the built-in --pet-default) always takes priority
  // for a pet row instead, and is never influenced by class-color at all.
  //
  // Precedence for your OWN (non-pet) row, per item 4's rework: "Use
  // class colors" is a convenience PRESET, not a second competing color
  // system — when it's on and a class is picked, that class's color
  // (your own saved override if you've customized it, else the built-in
  // default — see classColorFor()) wins; only when it's off does the
  // separate Settings > "My bar" custom color picker apply; failing
  // both, it's the plain rank1 hue like anyone else's top bar.
  function colorForRow(ownerName, index, isPet) {
    if (isPet) return settings.petBarColor || PET_DEFAULT_COLOR;
    if (ownerName === "You") {
      if (settings.classColorsEnabled && settings.myClass) return classColorFor(settings.myClass);
      if (settings.myBarColor) return settings.myBarColor;
    }
    return "var(" + RANK_COLORS[index % RANK_COLORS.length] + ")";
  }

  // The NAME text's own color — separate from colorForRow() above, which
  // only colors the bar/dot/fill. Item 8 ("can we get a 'my name text
  // color' and 'my pet text color'"): null means "just inherit --ink like
  // every other row's name already does", so this only ever narrows to a
  // row that's genuinely yours (or your pet's).
  function nameColorForRow(ownerName, isPet) {
    if (isPet) return settings.petNameTextColor || null;
    if (ownerName === "You") return settings.myNameTextColor || null;
    return null;
  }

  // Splits each combatant row into its own bar plus one bar per pet — a
  // pet no longer hides folded inside its owner's number, UNLESS Settings
  // > "Show pets as separate bars" is off, in which case a pet's damage
  // stays folded into its owner's single bar the way computeStats()
  // already computes it (r.dps is always the combined total regardless —
  // see item 10). Either way, ownerName carries the raw ("You") key
  // through for class-color/identity purposes, while name is what
  // actually gets shown.
  function buildDisplayRows(rows) {
    var out = [];
    var showPets = settings.showPets !== false;
    rows.forEach(function (r) {
      var pets = r.pets || [];
      var petDpsTotal = pets.reduce(function (sum, p) { return sum + p.dps; }, 0);
      var ownDps = showPets ? Math.max(0, r.dps - petDpsTotal) : r.dps;
      // r.selfDamage/r.damage are computeStats()'s own self-only/combined
      // totals (see eqp-core.js) — used directly here rather than derived
      // by subtraction, same relationship ownDps above has to r.dps, so
      // this row's "total dmg" figure (see fmtAbbrev() and the new amount
      // markup below) always agrees with its own dps number.
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

  // Stable per-render identity for a display row — a pet gets its owner's
  // name folded in too, so "your pet" and "a groupmate's same-named pet"
  // (rare, but the log can't tell them apart by name alone either) don't
  // collide. Used to remember which row is currently drilled into across
  // re-renders (see selectedRowKey) without needing DOM state to survive
  // #barlist's innerHTML getting fully replaced every tick.
  function rowKey(r) {
    return r.ownerName + (r.isPet ? "::pet::" + r.name : "");
  }
  function findDisplayRow(display, key) {
    for (var i = 0; i < display.length; i++) {
      if (rowKey(display[i]) === key) return display[i];
    }
    return null;
  }

  // Shared by both the ranked list and the drill-down list below, so the
  // "dps · total dmg" format ("I also want our meter to show DPS - Total
  // dmg done... 322 - 12.2k") only ever needs writing once.
  function amountHtml(dps, damage) {
    return '<b>' + fmtNum(dps) + '</b><span class="unit">dps</span><span class="sub-total">· ' + fmtAbbrev(damage) + "</span>";
  }

  function renderBarList(rows) {
    var display = buildDisplayRows(rows);
    if (selectedRowKey) {
      var sel = findDisplayRow(display, selectedRowKey);
      if (sel) { renderDrillDown(sel); return; }
      selectedRowKey = null; // that row's gone (e.g. a pet despawned) — fall back to the normal list below
    }
    var top = display.slice(0, TOP_N);
    if (!top.length) {
      els.barlist.innerHTML = '<div style="color:var(--ink-3);font-size:0.88rem;padding:6px 2px">No damage recorded yet.</div>';
      return;
    }
    // Bar width is relative to the TOP row's dps (a relative bar chart,
    // like a classic EQ parser's meter — not a % of the raid total, which
    // would make every bar tiny in a big group). Re-rendered fresh every
    // second from render()'s setInterval, and .fill's CSS transition (see
    // style.css) is what makes that read as the bar growing/shrinking
    // instead of jumping — see item 6 of the request that added this.
    var maxDps = top[0] ? top[0].dps : 0;
    els.barlist.innerHTML = top.map(function (r, i) {
      var swatch = colorForRow(r.ownerName, i, r.isPet);
      var pct = maxDps > 0 ? Math.max(4, (r.dps / maxDps) * 100) : 0;
      var nameColor = nameColorForRow(r.ownerName, r.isPet);
      var nameStyle = nameColor ? ' style="color:' + esc(nameColor) + '"' : "";
      // Every row is clickable now, not just your own — clicking swaps the
      // list in place to that combatant's own spell/ability breakdown (see
      // renderDrillDown() below and the delegated click listener further
      // down) rather than opening Combat Analysis, so a groupmate's or a
      // pet's row is just as valid a door in — see item 6 ("clicking on
      // someones pet... should open their analytics as well").
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

  // "i like that when i click on my name in his dps meter, it swaps to my
  // breakdown, i want ours to do that instead of opening the analysis
  // window... I Want to see the DPS and the damage done by each spell like
  // that." sel.abilities is already computed by eqp-core's computeStats()
  // (same field Combat Analysis' own deep dive reads — see
  // renderAbilityTable() in analysis.js) — this just lays it out as the
  // same style of ranked bar list the top-level view already uses, scoped
  // to one combatant/pet.
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
        '<span class="drill-total">' + fmtNum(sel.dps) + " dps · " + fmtAbbrev(sel.damage) + "</span>" +
      "</div>" +
      '<div class="drill-list">' + listHtml + "</div>";
  }

  // Delegated (not re-attached every render — #barlist's innerHTML gets
  // replaced every tick, but the container itself never does). A row click
  // drills in; the header of the drill-down view itself is the way back
  // out — see data-drill-back above.
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

  // The player's own combined (self + pet) total — what the header DPS
  // number and mini mode show, per item 2 of the newest feature list
  // ("I don't want it to be raid dps, including other players"). The
  // "You" row's own .damage/.dps already has pet damage folded in (see
  // eqp-core.js's ingest()), so this is just picking that one row out
  // rather than stats.raidDps, which sums every combatant including any
  // groupmates who happen to be in the same log.
  function selfSummary(stats) {
    var row = null;
    for (var i = 0; i < stats.rows.length; i++) {
      if (stats.rows[i].name === "You") { row = stats.rows[i]; break; }
    }
    if (!row) return { dps: 0, damage: 0, pet: null };
    var pet = (row.pets && row.pets[0]) ? { name: row.pets[0].name, dps: row.pets[0].dps } : null;
    return { dps: row.dps, damage: row.damage, pet: pet };
  }

  // See dpsSamples/peakRollingDps' declaration near the top of this file.
  // Called once a second from render(), only while a fight is actually
  // live — damage isn't progressing once a fight's over, so there's
  // nothing new to sample, and the already-tracked peak just stays
  // displayed (same "keep showing the last real number" convention the
  // header dps/timer already follow between fights).
  function trackPeakDps(now, damage) {
    dpsSamples.push({ t: now, damage: damage });
    var cutoff = now - ROLLING_WINDOW_MS - 1000;
    while (dpsSamples.length > 1 && dpsSamples[0].t < cutoff) dpsSamples.shift();
    var oldest = dpsSamples[0];
    for (var i = 0; i < dpsSamples.length; i++) {
      if (now - dpsSamples[i].t <= ROLLING_WINDOW_MS) { oldest = dpsSamples[i]; break; }
    }
    var elapsed = (now - oldest.t) / 1000;
    var rollingDps = elapsed > 0.5 ? (damage - oldest.damage) / elapsed : 0;
    if (rollingDps > peakRollingDps) peakRollingDps = rollingDps;
    return peakRollingDps;
  }
  // Called wherever combatSessionStart gets reset to a genuinely fresh
  // pull (or cleared entirely) — a new fight's burst has nothing to do
  // with the last one's, so the rolling sample buffer and its peak start
  // clean rather than comparing across a gap.
  function resetDpsTracking() {
    dpsSamples = [];
    peakRollingDps = 0;
  }
  function updatePeakDisplay() {
    if (peakRollingDps > 1) {
      els.peakDps.hidden = false;
      els.peakDps.textContent = "peak " + fmtNum(peakRollingDps);
    } else {
      els.peakDps.hidden = true;
    }
  }

  // finishedEnc is the just-ended encounter object (or null while a fight
  // is live / nothing has happened yet). Per item 4.3, this whole row of
  // UI should only ever appear after a REAL leaderboard-eligible boss kill
  // — not after every trash mob you happen to stop fighting.
  function updateSubmitUI(finishedEnc) {
    var eligible = !!(finishedEnc && finishedEnc.mobKilled && isKnownBoss(finishedEnc.mobName));
    if (!eligible) {
      els.submitRow.hidden = true;
      els.autoSubmitLine.hidden = true;
      els.autoSubmitToggles.hidden = true;
      return;
    }
    // Auto mode: nothing to click, no button at all — see item 4. Off/ask:
    // still a manual Submit button (disabled until login exists — see the
    // TODO near btn-submit below).
    els.submitRow.hidden = settings.autoSubmitMode === "auto";
    els.autoSubmitLine.hidden = false;
    els.autoSubmitLine.textContent =
      settings.autoSubmitMode === "auto" ? "Auto-submitting… (login not set up yet)" :
      settings.autoSubmitMode === "ask" ? "Submit " + esc(finishedEnc.mobName) + " to the leaderboard?" :
      "Leaderboard submission is off";
    // The first-run toggle row only ever shows until you've picked once —
    // see item 2. After that, Settings > Auto-submit is the only control.
    els.autoSubmitToggles.hidden = !!settings.autoSubmitChosen;
  }

  // Every finished encounter that belongs to the SAME continuous combat
  // session as combatSessionStart, plus the live one if there is one — see
  // combatSessionStart's comment near the top of this file. This is what
  // makes the header dps number and timer agree with each other (both
  // span the exact same window) instead of the timer counting a
  // continuous multi-kill pull while dps quietly resets to just the
  // latest target's own number: "I would like the dps total to be the
  // average for the entire fight in combat... I dont want separate
  // analytics per mob." Analysis gets the SAME grouping (see analysis.js'
  // buildSessions()) so the live header and the history list always agree
  // on what counts as "one fight."
  function currentSessionMembers() {
    if (combatSessionStart === null) return state.current ? [state.current] : [];
    var members = state.encounters.filter(function (enc) { return enc.startTime >= combatSessionStart; });
    if (state.current) members.push(state.current);
    return members;
  }

  // ---- fight-selector dropdown -------------------------------------------
  // Mirrors buildSessions()/sessionKey()/sessionLabel() in analysis.js
  // exactly (same gap-based continuity grouping) so the dropdown lists the
  // exact same fights, with the exact same labels, as Combat Analysis' own
  // history list. Duplicated rather than shared — each renderer window
  // loads its own plain <script> files, same reason eqp-core.js itself is
  // a synced copy instead of an actual shared module.
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
    return sessions; // oldest-first
  }
  function sessionKeyOf(session) { return String(session.members[0].startTime); }

  // Same "<primary mob>[ (generation)][ +party]" format as analysis.js's
  // own sessionLabel() — see its comment there for the full rationale.
  function sessionShortLabel(session) {
    var merged = EQP.mergeEncounters(session.members);
    var stats = EQP.computeStats(merged);
    var byMob = stats.byMob || [];
    if (!byMob.length) return "Unknown target";
    var primary = byMob[0];
    var partyCount = (stats.rows || []).filter(function (r) { return r.name !== "You"; }).length;
    return primary.name +
      (primary.generation > 1 ? " (" + primary.generation + ")" : "") +
      (partyCount > 0 ? " +" + partyCount : "");
  }

  // Rebuilt every render() tick (like the bar list) so the default entry
  // always reflects whatever fight is actually live/last right now, and
  // any brand-new fight shows up in the list immediately. The default
  // (auto-follow) option's own label IS the current mob name — nothing
  // else needs to separately display it any more (see .fight-select in
  // style.css and the now-removed #mob-name span).
  function renderFightSelect(sessions) {
    var reversed = sessions.slice().reverse(); // newest-first
    var autoTarget = reversed[0];
    var autoLabel = autoTarget ? sessionShortLabel(autoTarget) : "Waiting for a fight…";
    var optionsHtml = '<option value="">' + esc(autoLabel) + "</option>" +
      reversed.map(function (s, i) {
        if (i === 0) return ""; // same fight the auto option above already represents
        return '<option value="' + esc(sessionKeyOf(s)) + '">' + esc(sessionShortLabel(s)) + "</option>";
      }).join("");
    els.fightSelect.innerHTML = optionsHtml;
    els.fightSelect.value = selectedSessionKey || "";
    if (els.fightSelect.value !== (selectedSessionKey || "")) selectedSessionKey = null; // stale key — no matching option any more
  }
  els.fightSelect.addEventListener("change", function () {
    selectedSessionKey = els.fightSelect.value || null;
    render();
  });

  // An explicitly picked (not auto-followed) past fight — frozen, since
  // nothing about an already-closed fight changes tick to tick. Picking
  // the CURRENTLY live fight from the dropdown still works (isLive stays
  // true and this keeps updating normally), it's just reached through the
  // same code path as any other pick instead of the auto-follow branches
  // below.
  function renderPickedSession(session, now) {
    var members = session.members;
    if (session.isLive) {
      var liveMember = members[members.length - 1];
      members = members.slice(0, -1).concat([Object.assign({}, liveMember, { endTime: Math.max(liveMember.endTime, now - 2000) })]);
    }
    var merged = EQP.mergeEncounters(members);
    var stats = EQP.computeStats(merged);
    var self = selfSummary(stats);
    if (session.isLive) trackPeakDps(now, self.damage);
    els.fightIcon.classList.toggle("pulse", session.isLive);
    els.mobDiff.textContent = merged.difficultyKnown ? "· " + (DIFFICULTY_LABELS[merged.difficulty] || "Base") : "";
    var lastMember = session.members[session.members.length - 1];
    els.mobState.textContent = session.isLive ? "(live)" : (lastMember.mobKilled ? "(defeated)" : "(ended)");
    els.dpsNumber.textContent = fmtNum(self.dps) + " dps · " + fmtAbbrev(self.damage);
    els.fightTimer.textContent = fmtDur((merged.endTime - merged.startTime) / 1000);
    updatePeakDisplay();
    lastRenderedRows = stats.rows;
    renderBarList(stats.rows);
    // No submit prompt while explicitly browsing history — that's not "the
    // fight that just ended," and resurfacing it for something already
    // decided on (or a much older kill) would just be confusing.
    updateSubmitUI(null);
    updateMiniBar(self.dps, self.damage, self.pet);
    updateWatchBadge(self.dps, els.fightTimer.textContent);
  }

  function render() {
    EQP.checkTimeout(state, Date.now());
    var now = Date.now();

    // Raw data straight through to Analysis — it has its own copy of EQP
    // (see analysis.html) and does its own session-grouping/merging with
    // EQP.mergeEncounters(), rather than receiving pre-computed stats
    // shaped around a single encounter at a time the way it used to.
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
      selectedSessionKey = null; // stale — fall through to the normal auto-follow logic below
    }

    if (state.current) {
      var enc = state.current;
      // Combat-session continuity — only treat this as a genuinely fresh
      // pull (reset the timer to enc's own startTime) if there was a real
      // gap since the last time any fight was live; a same-continuous-pull
      // retarget (eqp-core swapping its locked mob right after a kill)
      // lands well inside that gap and keeps the clock running.
      if (combatSessionStart === null || (now - lastCombatActivityAt) > state.gapMs) {
        combatSessionStart = enc.startTime;
        resetDpsTracking(); // a genuinely fresh pull — see its own comment above
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
      trackPeakDps(now, self.damage);
      els.fightIcon.classList.add("pulse"); // only actually spins while a fight is truly live — see item 4
      els.mobDiff.textContent = merged.difficultyKnown ? "· " + (DIFFICULTY_LABELS[merged.difficulty] || "Base") : "";
      els.mobState.textContent = "(live)";
      els.dpsNumber.textContent = fmtNum(self.dps) + " dps · " + fmtAbbrev(self.damage);
      els.fightTimer.textContent = fmtDur((merged.endTime - merged.startTime) / 1000);
      updatePeakDisplay();
      lastRenderedRows = stats.rows;
      renderBarList(stats.rows);
      updateSubmitUI(null);
      updateMiniBar(self.dps, self.damage, self.pet);
      updateWatchBadge(self.dps, els.fightTimer.textContent);
    } else if (state.encounters.length) {
      // No live fight right now, but don't treat a brief natural gap
      // between one kill and the next target's first hit as "combat
      // ended" — only actually clear the session clock once it's been
      // quiet at least as long as eqp-core's own encounter-closing gap.
      if (combatSessionStart !== null && (now - lastCombatActivityAt) > state.gapMs) {
        combatSessionStart = null;
      }
      var last = state.encounters[state.encounters.length - 1];
      // combatSessionStart may have just been cleared above (right at the
      // "combat truly ended" boundary) — currentSessionMembers() would
      // return [] in that same tick, so fall back to just the last
      // encounter for display continuity rather than showing nothing.
      var lastMembers = currentSessionMembers();
      if (!lastMembers.length) lastMembers = [last];
      var lastMerged = EQP.mergeEncounters(lastMembers);
      var lastStats = EQP.computeStats(lastMerged);
      var lastSelf = selfSummary(lastStats);
      els.fightIcon.classList.remove("pulse");
      els.mobDiff.textContent = lastMerged.difficultyKnown ? "· " + (DIFFICULTY_LABELS[lastMerged.difficulty] || "Base") : "";
      els.mobState.textContent = last.mobKilled ? "(defeated)" : "(ended)";
      els.dpsNumber.textContent = fmtNum(lastSelf.dps) + " dps · " + fmtAbbrev(lastSelf.damage);
      els.fightTimer.textContent = fmtDur(lastStats.duration);
      updatePeakDisplay(); // no new samples once the fight's over — just keeps showing whatever peak was already tracked
      lastRenderedRows = lastStats.rows;
      renderBarList(lastStats.rows);
      // Submission is still gated on the specific individual kill (a
      // curated boss, not the session average) — see updateSubmitUI()'s
      // own comment, so this stays `last`, not the merged session.
      updateSubmitUI(last);
      updateMiniBar(lastSelf.dps, lastSelf.damage, lastSelf.pet);
      updateWatchBadge(lastSelf.dps, els.fightTimer.textContent);
    } else {
      combatSessionStart = null;
      resetDpsTracking();
      els.fightIcon.classList.remove("pulse");
      els.mobDiff.textContent = "";
      els.mobState.textContent = "";
      els.dpsNumber.textContent = "0 dps";
      els.fightTimer.textContent = "";
      updatePeakDisplay();
      lastRenderedRows = [];
      renderBarList([]);
      updateSubmitUI(null);
      updateMiniBar(0, 0, null);
      updateWatchBadge(0, "0:00");
    }

    window.dyrelog.pushState(pushPayload);
  }

  // Always the player's own character name, never the mob's — see item 5.
  // Mini mode is "just my dps" by design (per the very first ask that
  // added it); showing whatever's being fought instead of who's fighting
  // it undercut that at a glance.
  // pet is { name, dps } or null — see selfSummary(). Only shown when your
  // pet has actually dealt damage this fight, per item 3.9 of the newest
  // feature list.
  function updateMiniBar(dps, damage, pet) {
    els.miniDps.textContent = fmtNum(dps) + " dps · " + fmtAbbrev(damage);
    els.miniName.textContent = characterName || "Dyrelog";
    if (pet && pet.dps > 0) {
      els.miniPetRow.hidden = false;
      els.miniPetName.textContent = pet.name;
      els.miniPetDps.textContent = fmtNum(pet.dps) + " dps";
    } else {
      els.miniPetRow.hidden = true;
    }
  }

  // Watch mode's own tiny circular badge (item 8 — "a theme that is a
  // circle and it just has a dps number in it... almost like a watch") —
  // just your own dps and the current fight's duration, nothing else, so
  // it only ever needs these two values regardless of which render()
  // branch is live right now.
  function updateWatchBadge(dps, timerText) {
    els.watchDpsNum.textContent = fmtNum(dps);
    els.watchTimer.textContent = timerText || "0:00";
  }

  // ---- fade UI when idle -------------------------------------------------
  // Settings > "Fade UI when idle" — see the body.idle-faded rules in
  // style.css and item 3.11 of the newest feature list. Skipped entirely
  // in mini mode, which is already just name/dps(/pet) with nothing left
  // to fade.
  function scheduleIdleFade() {
    clearTimeout(idleTimer);
    document.body.classList.remove("idle-faded");
    if (!settings || !settings.fadeIdleEnabled || miniMode || currentDisplayStyle === "circle") return;
    idleTimer = setTimeout(function () {
      document.body.classList.add("idle-faded");
    }, (settings.fadeIdleSeconds || 10) * 1000);
  }
  document.addEventListener("mousemove", scheduleIdleFade);
  document.addEventListener("mousedown", scheduleIdleFade);

  // ---- log source wiring -------------------------------------------------
  function applySourceStatus(status) {
    if (!status || !status.ok) return;
    var identity = parseCharacterFromFilename(status.fileName);
    characterName = identity ? identity.characterName : null;
    els.wordmark.textContent = characterName || "DYRELOG";
    state = makeState(characterName);
    lineBuffer = "";
    selectedRowKey = null;
    selectedSessionKey = null;
    resetDpsTracking();
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

  // First-run auto-submit row on the fight card itself (see item 2 of the
  // original feature list) — the ONLY place this choice can be made from
  // now that Settings is its own window; Settings still shows the same
  // tri-state control for changing your mind later (see settings.js),
  // there just aren't two copies of it live in the same place at once
  // anymore.
  document.querySelectorAll("#auto-submit-toggles .toggle-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      window.dyrelog.saveSettings({ autoSubmitMode: b.dataset.mode, autoSubmitChosen: true }).then(function (s) {
        applySettings(s);
        render();
      });
    });
  });

  // ---- header icons ---------------------------------------------------
  document.getElementById("btn-settings").addEventListener("click", function () { window.dyrelog.openSettings(); });
  document.getElementById("btn-analysis").addEventListener("click", function () { window.dyrelog.openAnalysis(); });
  document.getElementById("btn-leaderboard").addEventListener("click", function () { window.dyrelog.openLeaderboard(); });
  document.getElementById("btn-change-source").addEventListener("click", async function () {
    if (!confirm("Forget the current log source and pick a different one?")) return;
    await window.dyrelog.clearSource();
    characterName = null;
    els.wordmark.textContent = "DYRELOG";
    state = makeState(null);
    lineBuffer = "";
    selectedRowKey = null;
    selectedSessionKey = null;
    resetDpsTracking();
    combatSessionStart = null;
    showEmptyState();
  });
  document.getElementById("btn-close").addEventListener("click", function () { window.dyrelog.close(); });

  // ---- mini mode --------------------------------------------------------
  // Mini mode no longer shrinks the window to a fixed tiny footprint — it
  // now just hides the header icon row, the mob-name/timer subhead, and
  // the submit UI, while keeping the SAME ranked bar list standard mode
  // shows (see body.mini rules in style.css) — "can we keep the dps bars
  // of standard mode?" The window stays whatever size you left it at, and
  // resizing while mini persists normally like any other resize, so
  // there's nothing left to save/restore around the toggle itself.
  function toggleMini() {
    miniMode = !miniMode;
    document.body.classList.toggle("mini", miniMode);
    scheduleIdleFade(); // re-evaluate now that miniMode changed
  }
  document.getElementById("btn-mini").addEventListener("click", toggleMini);
  document.getElementById("btn-restore").addEventListener("click", toggleMini);

  // ---- display style (Settings > Display style: Bars / Circle) ------------
  // Circle (item 8's "watch" look) used to be its own header icon you could
  // click into and out of live — turns out that read as the app randomly
  // "opening in watch mode," and there was no way back to Settings once in
  // it (the header, gear icon included, is hidden while it's active). Circle
  // is a persisted Settings choice now, exactly like Theme or Font: it only
  // ever changes when you pick it in Settings, it's remembered across
  // restarts the same deliberate way, and the badge itself just opens
  // Settings on click so there's always a way back. See applySettings()
  // above, which calls this whenever settings.displayStyle changes; the
  // currentDisplayStyle/preWatchBounds/WATCH_SIZE vars it uses live up top
  // with miniMode.
  function applyDisplayStyle(style) {
    if (style === currentDisplayStyle) return; // no-op on every render()-driven re-apply once it's already set
    var enteringCircle = style === "circle";
    currentDisplayStyle = style;
    document.body.classList.toggle("watch", enteringCircle);
    scheduleIdleFade();
    if (enteringCircle) {
      // A fixed square (sized off the current Circle-size setting — see
      // watchWindowSizeFor()) is what makes the badge actually read as a
      // circle — see preWatchBounds' comment above. persist:false (plus
      // setWatchMode(true), which tells main.js's bounds persister to
      // ignore this window entirely while active) keeps this transient
      // size from ever being saved as your real remembered window size.
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
  // Settings > Circle size — resizes the badge itself (--circle-scale, read
  // by style.css) and, whenever Circle is the active display style, the
  // window it lives in too, so the window always exactly fits the badge
  // with no dead transparent margin or clipped edge. Works live even while
  // Circle mode is already on (no need to bounce back to Bars and in again)
  // by growing/shrinking the window from its current center rather than its
  // top-left corner, so the badge doesn't appear to drift while you drag
  // the slider.
  function applyCircleScale(scale) {
    scale = scale || 1;
    document.documentElement.style.setProperty("--circle-scale", String(scale));
    if (scale === currentCircleScale) return;
    var prevScale = currentCircleScale;
    currentCircleScale = scale;
    if (currentDisplayStyle !== "circle") return; // applyDisplayStyle() will size the window correctly whenever Circle is next turned on
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
  // Three independent ways back out to a menu with Settings / Combat
  // Analysis / Leaderboards / Switch to Bars — see the comment on
  // .watch-badge in style.css for why a single plain click isn't trusted
  // alone. showWatchMenu() pops a real native context menu (main.js).
  els.watchBadge.addEventListener("click", function () { window.dyrelog.openSettings(); });
  els.watchBadge.addEventListener("contextmenu", function (evt) {
    evt.preventDefault();
    window.dyrelog.showWatchMenu();
  });
  els.watchMenuBtn.addEventListener("click", function (evt) {
    evt.stopPropagation(); // don't also fire the badge's own click-to-Settings handler above
    window.dyrelog.showWatchMenu();
  });

  // ---- manual corner/edge resize ----------------------------------------
  // Anchored at the window's current top-left — only width/height change,
  // x/y never do, so this can't accidentally drag the window somewhere
  // else while you're just trying to resize it (see item 7).
  function wireResizeHandle(el, growsWidth, growsHeight) {
    el.addEventListener("mousedown", function (e) {
      e.preventDefault();
      var startX = e.screenX, startY = e.screenY;
      window.dyrelog.getBounds().then(function (startBounds) {
        function onMove(ev) {
          var dx = ev.screenX - startX;
          var dy = ev.screenY - startY;
          var next = { x: startBounds.x, y: startBounds.y, width: startBounds.width, height: startBounds.height };
          if (growsWidth) next.width = clamp(startBounds.width + dx, 170, 900);
          if (growsHeight) next.height = clamp(startBounds.height + dy, 56, 900);
          window.dyrelog.setBounds(next);
        }
        function onUp() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    });
  }
  wireResizeHandle(document.getElementById("rh-right"), true, false);
  wireResizeHandle(document.getElementById("rh-bottom"), false, true);
  wireResizeHandle(document.getElementById("rh-corner"), true, true);

  // TODO(next milestone): wire this to the same worker endpoints the
  // browser overlay uses (POST /api/streams, .../finalize) once Discord
  // login exists in the desktop shell. Disabled rather than removed so the
  // mini-mode layout is already final — only the plumbing behind it isn't.
  els.btnSubmit.disabled = true;
  els.btnSubmit.title = "Login isn't wired up in the desktop app yet — coming next.";

  // Live updates from the Settings window (see main.js's "settings-update"
  // broadcast, sent after every save-settings call regardless of which
  // window made it) — this is what keeps theme/text-size/class-color in
  // sync here without this window owning any settings controls itself.
  window.dyrelog.onSettingsUpdate(function (s) {
    applySettings(s);
    render();
  });

  // "when I send updates, the overlay should inform the user to update" —
  // dismissing just hides the banner for the rest of this run (nothing is
  // persisted), so a player who ignores it still sees it again next launch
  // until they actually update. See checkForUpdates() in main.js.
  //
  // "I'd like it to auto install if possible" — this banner used to just
  // openExternal() the releases page, leaving the actual download/install
  // to the player's browser. It now drives the SAME real electron-updater
  // flow as Settings > What's New's "Check for updates" button (see
  // main.js's check-for-updates-now/download-and-install-update handlers)
  // — one click here checks, and the instant a newer version is confirmed
  // it starts the download itself, no second click, matching "automatically
  // pull the update and relaunch." Settings' own button was a genuine
  // two-click flow until Sept 6 (check, then a separate "Update now and
  // relaunch" button) — collapsed to match this banner's one click after
  // DJ found the two-step version confusing ("the button isn't immediately
  // installing... its a failure point").
  var updateDismissed = false;
  var updaterBusy = false; // this window's own click started a real update — see the updaterStatus guard below
  function showUpdateBanner(info) {
    if (!info || updateDismissed || updaterBusy) return;
    els.updateBannerText.textContent = "Update available — v" + info.version;
    els.updateBanner.hidden = false;
  }
  els.updateBanner.addEventListener("click", function () {
    if (updaterBusy) return;
    updaterBusy = true;
    els.updateBannerDismiss.hidden = true; // don't let it get dismissed mid-download
    els.updateBannerText.textContent = "Checking for update…";
    window.dyrelog.checkForUpdatesNow();
  });
  els.updateBannerDismiss.addEventListener("click", function (evt) {
    evt.stopPropagation(); // don't also trigger the banner's own click-to-update
    updateDismissed = true;
    els.updateBanner.hidden = true;
  });
  window.dyrelog.onUpdateAvailable(showUpdateBanner);
  window.dyrelog.getUpdateInfo().then(showUpdateBanner);

  // sendUpdaterStatus() in main.js now broadcasts to this window too (it
  // used to only reach Settings), since this banner needs the same
  // checking/available/downloading/ready/error states Settings shows. The
  // updaterBusy guard means this window only reacts when ITS OWN click
  // started the flow — not, say, a check the player ran from an open
  // Settings window at the same time, which would otherwise make the
  // banner jump around for no reason the player did in this window.
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
      // main.js calls autoUpdater.quitAndInstall() itself shortly after
      // this — nothing else to do here.
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

  // ---- boot ---------------------------------------------------------------
  (async function boot() {
    var loadedSettings = await window.dyrelog.getSettings();
    applySettings(loadedSettings);
    // Seed from whatever was cached on disk from the last successful fetch
    // BEFORE applySourceStatus() below builds the real parser state (which
    // reads the knownBossNames module var at that moment) — this is what
    // makes the boss list available from literally the first parsed line
    // on every launch after the first, instead of racing a fresh network
    // request. See applyKnownBossNames()'s own comment.
    if (loadedSettings.cachedBossNames && loadedSettings.cachedBossNames.length) {
      applyKnownBossNames(bossNamesFromArray(loadedSettings.cachedBossNames));
    }
    fetchKnownBosses(); // fire-and-forget — refreshes from the network regardless; see its own comment above

    var saved = await window.dyrelog.getSavedSource();
    if (saved && saved.path) {
      // main.js already started tailing this on app launch (see
      // createWindow()'s did-finish-load handler) — just reflect it here.
      applySourceStatus({ ok: true, fileName: saved.fileName || (saved.path.split(/[\\/]/).pop()) });
    } else {
      showEmptyState();
    }
    setInterval(render, 1000);
  })();
})();
