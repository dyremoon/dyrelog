// Dyrelog desktop overlay — main process.
//
// Big picture vs. the browser overlay (overlay/dyrelog-overlay.html): the
// browser version has to jump through the File System Access API's
// permission handshake (IndexedDB-stored handles, a "Resume last log…"
// click after every browser restart — see that file's beginTailingHandle()
// / tryResumeLastSource()) because a web page is sandboxed away from the
// filesystem by design. Electron's main process is plain Node — it has
// real, unprompted filesystem access every time the app launches. So here
// "remember the log file" is just a JSON file in userData and a straight
// fs.stat/fs.open poll loop. No permission dance, ever.
//
// The main mini-mode window's renderer does the actual parsing, using the
// exact same eqp-core.js as the browser overlay (see
// scripts/sync-eqp-core.js) — this process only ever hands it raw text
// chunks over IPC. Keeping parsing out of the main process means the UI
// code doesn't have to be rewritten later if/when eqp-core.js changes; it
// just keeps working. The Analysis window doesn't parse anything itself —
// it's fed pre-computed stats the mini-mode renderer already produced,
// relayed through this process (see push-state/get-state/state-update).

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

const CONFIG_PATH = path.join(app.getPath("userData"), "dyrelog-source.json");
const SETTINGS_PATH = path.join(app.getPath("userData"), "dyrelog-settings.json");
const WINDOW_PATH = path.join(app.getPath("userData"), "dyrelog-window.json");
// Combat Analysis history — "save previous fights from the logs it has on
// file, saving the last 50 fights or so, so people can see." Before this,
// lastKnownState (below) only ever held whatever the mini-mode window had
// parsed THIS run, so a fresh launch always showed an empty Analysis
// window until a new fight happened. See loadHistory()/saveHistory() and
// the push-state handler, which merges each run's newly-closed encounters
// into this file instead of replacing it.
const HISTORY_PATH = path.join(app.getPath("userData"), "dyrelog-history.json");
const MAX_HISTORY_ENCOUNTERS = 50;
const EQLOG_RE = /^eqlog_.+\.(txt|log)$/i;

const BASE_WIDTH = 320;
const BASE_HEIGHT = 420;
const MINI_WIDTH = 190;
const MINI_HEIGHT = 76; // tall enough for the mini-mode pet sub-line — see index.html's #mini-pet-row
const MIN_W = 170, MAX_W = 900, MIN_H = 56, MAX_H = 900;

const DEFAULT_SETTINGS = {
  opacity: 1,
  // No more "scale" slider — manual corner/edge resize covers window size
  // now, and the size it's dragged to is persisted separately (see
  // WINDOW_PATH/loadWindowBoundsFor()/saveWindowBoundsFor() below) instead
  // of living in this settings file at all.
  barHeight: 1, // multiplies each bar row's height — see "Bar height" in Settings
  textScale: 1, // independent of barHeight — see "Text size" in Settings
  miniPetTextScale: 1, // mini mode's pet sub-line only — see "Mini pet text size" in Settings
  secondaryTextScale: 1, // fight timer / status ("live"/"defeated") / "dps" unit label size — see "Timer / dps / status size"
  theme: "blue", // "blue" | "brass"
  bgColor: null, // explicit hex override for the panel background; null = use the theme's own
  textColor: null, // explicit hex override for all overlay text; null = the theme's own --ink
  // Secondary/muted text (the fight timer, "(defeated)"/"(live)" state,
  // the "dps" unit label, rank numbers, hints) rides --ink-2/--ink-3
  // rather than --ink — this recolors that whole tier at once instead of
  // needing a separate control per element. null = the theme's own.
  secondaryTextColor: null,
  // Your own name's TEXT color specifically — independent of myBarColor
  // (which only colors the bar/dot, not the name string itself).
  myNameTextColor: null,
  petNameTextColor: null,
  myBarColor: null, // explicit hex override for your own bar; null = class color (if enabled) or rank1
  petBarColor: null, // explicit hex override for pet bars; null = the built-in pet default (distinct from rank1)
  borderColor: null, // explicit hex override for each bar row's outline; null = the theme's own --hair
  showPets: true, // false folds pet damage back into its owner's single bar instead of splitting it out
  fontFamily: "fantasy", // one of app.js's FONT_STACKS keys — Cinzel is the default look now
  displayStyle: "bars", // "bars" (the normal card, standard or mini) | "circle" (small round dps+timer badge, item 8)
  circleScale: 1, // Settings > Circle size — multiplies the circle badge's diameter (and the window sized to fit it) — see watchWindowSizeFor()/applyCircleScale() in app.js
  fadeIdleEnabled: false, // fades header/icons/timer/labels after fadeIdleSeconds of no mouse activity — see item 3.11
  fadeIdleSeconds: 10,
  // "Use class colors" — a convenience preset for your OWN bar (colorForRow()
  // in app.js prefers this over myBarColor when both a class is picked and
  // this is on), not a second/competing color system — see item 4.
  classColorsEnabled: false,
  myClass: null,
  // Per-class color customization, keyed by class name — only classes the
  // player has actually edited get an entry here; everything else falls
  // back to app.js's built-in EQ_CLASS_COLORS default — see item 4.1.
  classColorOverrides: {},
  // Settings window's OWN text size (item 6 — "Have a text size option for
  // the settings menu too") — separate from textScale above, which sizes
  // the in-game overlay itself, not this settings UI. One of 0.9/1/1.15/1.35
  // — see set-uiscale in settings.js.
  settingsTextScale: 1,
  // "an optional slider to keep the window open when closing the window" —
  // off by default (unchanged behavior: closing the main window quits the
  // app, after the confirm dialog). On, closing the window instead minimizes
  // it to the tray — see win's "close" handler and ensureTray() below.
  keepInTrayOnClose: false,
  // off by default. On, Dyrelog registers itself as a Windows startup item
  // (via app.setLoginItemSettings) so it's already running/in-tray by the
  // time you launch EverQuest — see applySettingsPartial() below.
  launchAtStartup: false,
  autoSubmitMode: "off", // "off" | "ask" | "auto"
  autoSubmitChosen: false, // first-run toggle row (see the fight-view) only ever shows until this flips true
  // A local cache of the curated leaderboard boss list (see
  // fetchKnownBosses() in app.js) — the app used to always wait on a
  // fresh network fetch at every boot before it knew ANY name was a
  // curated boss, which meant a fight that started (or even finished, on
  // a slow connection) before that fetch resolved never got the
  // Ask-before-submit prompt at all: "i killed vox again... and still no
  // popup to submit." Persisting the last successful fetch here means
  // there's a real (if possibly slightly stale) boss list available the
  // INSTANT the app launches, every time after the first; app.js still
  // refreshes it from the network in the background regardless.
  cachedBossNames: [],
  cachedBossNamesAt: 0
};

let win = null;
let analysisWin = null;
let leaderboardWin = null;
let settingsWin = null;
let tray = null;
// Set right before we deliberately tear the whole app down (see win's
// "close" handler below) so the SAME close event firing a second time
// (once we call win.close() again for real) doesn't re-show the confirm
// dialog or try to re-close the already-closing secondary windows.
let appIsQuitting = false;
let tailTimer = null;
let tailState = null; // { filePath, offset } — see startTailing()
// Loaded once at startup so the Analysis window has something to show
// immediately, even before the mini-mode renderer sends its first
// push-state of this run — see loadHistory()/saveHistory() above.
let persistedHistory = loadHistory();
let lastKnownState = { current: null, encounters: persistedHistory.slice(), characterName: null, gapMs: 9000 }; // relayed from the mini-mode renderer, see push-state
// Set by the renderer around every mini-mode toggle (see the "set-mini-mode"
// IPC message and toggleMini() in app.js) so the native "moved" listener
// below never persists mini mode's tiny 190x76 size as if it were the
// user's real window size.
let isMiniMode = false;
// Same idea, for Circle display style's own forced-fixed-square size
// (item 8) — see applyDisplayStyle()/setWatchMode() in app.js/preload.js.
let isWatchMode = false;
// "When I send updates, the overlay should inform the user to update" —
// checked once at launch and every 6h after (the app is meant to stay open
// for an entire play session), against the same public GitHub Releases page
// download.html already points people at. null until a real newer release
// is found; stays null forever on a network error/rate-limit, since this is
// a nice-to-have, not something worth ever showing an error for.
let updateInfo = null;
const UPDATE_CHECK_URL = "https://api.github.com/repos/dyremoon/dyrelog/releases/latest";
const RELEASES_PAGE_URL = "https://github.com/dyremoon/dyrelog/releases/latest";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function parseVersionParts(v) {
  return String(v || "").trim().replace(/^v/i, "").split(".").map(function (n) { return parseInt(n, 10) || 0; });
}

// Plain numeric-part comparison (1.2.0 vs 1.10.0 sorts correctly) — no
// semver dependency needed for something this simple.
function isNewerVersion(remoteTag, localVersion) {
  var remote = parseVersionParts(remoteTag);
  var local = parseVersionParts(localVersion);
  var len = Math.max(remote.length, local.length);
  for (var i = 0; i < len; i++) {
    var r = remote[i] || 0, l = local[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

async function checkForUpdates() {
  try {
    var res = await fetch(UPDATE_CHECK_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return; // no releases published yet, rate-limited, etc. — quietly skip, try again next interval
    var data = await res.json();
    var tag = data && data.tag_name;
    if (!tag || !isNewerVersion(tag, app.getVersion())) return;
    updateInfo = { version: tag.replace(/^v/i, ""), url: RELEASES_PAGE_URL };
    if (win && !win.isDestroyed()) win.webContents.send("update-available", updateInfo);
  } catch (err) {
    // Offline, DNS hiccup, whatever — never worth surfacing to the player.
  }
}

function loadJson(filePath, fallback) {
  try {
    return Object.assign({}, fallback, JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch (err) {
    return fallback ? Object.assign({}, fallback) : null;
  }
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    return null; // no saved source yet, or it's unreadable — same thing to the caller
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function clearConfig() {
  try { fs.unlinkSync(CONFIG_PATH); } catch (err) { /* already gone */ }
}

function loadSettings() {
  return loadJson(SETTINGS_PATH, DEFAULT_SETTINGS);
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function loadHistory() {
  try {
    var parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return []; // no history file yet, or it's unreadable — same thing to the caller
  }
}

function saveHistory(encounters) {
  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(encounters.slice(-MAX_HISTORY_ENCOUNTERS)));
  } catch (err) {
    console.error("Failed to save encounter history:", err);
  }
}

// Manual corner/edge resize (and dragging the window by its header) used
// to reset to BASE_WIDTH/BASE_HEIGHT every launch since only the old
// "Size" slider's multiplier was ever persisted — see item 1 of the
// newest feature list ("we don't need the size slider since I can just
// move it myself"). This is what makes a manual resize/move stick across
// restarts instead: whatever the window's real bounds were the last time
// it changed for a genuine reason gets written here and read back when
// each window is (re)created.
//
// WINDOW_PATH stores ONE JSON object keyed by window ("main", "settings",
// "analysis", "leaderboard") rather than a single flat {x,y,width,height}
// — Settings/Analysis/Leaderboards used to reopen at their fixed default
// size every launch even after you resized them, since only the main
// mini-mode card's bounds were ever remembered at all. See item 1 of the
// newest feature list ("make sure these windows save their size, position,
// and width/height too").
function loadAllWindowBounds() {
  try {
    var raw = JSON.parse(fs.readFileSync(WINDOW_PATH, "utf8"));
    // Migrate the old flat format (always the main window's own bounds)
    // into the new keyed shape the first time this runs post-update.
    if (raw && typeof raw.x === "number") return { main: raw };
    return raw || {};
  } catch (err) {
    return {};
  }
}

function loadWindowBoundsFor(key) {
  var all = loadAllWindowBounds();
  return all[key] || null;
}

function saveWindowBoundsFor(key, b) {
  try {
    var all = loadAllWindowBounds();
    all[key] = { x: b.x, y: b.y, width: b.width, height: b.height };
    fs.writeFileSync(WINDOW_PATH, JSON.stringify(all));
  } catch (err) {
    // not critical — worst case that window just opens at its default spot next time
  }
}

// One debounced persister per window, sharing the same fix: always read
// win.getBounds() FRESH at write time rather than trusting whatever
// bounds object a caller happened to have on hand — this is what actually
// fixes "it saves position but not size". A resize-from-edge interaction
// can also fire a native "moved" event mid-transition, and whichever
// write landed last (sometimes with stale pre-resize dimensions) used to
// silently clobber the correct one; reading live bounds only once
// activity has actually settled sidesteps that race entirely.
function makeBoundsPersister(key, getWin) {
  var timer = null;
  return function schedule() {
    if (key === "main" && (isMiniMode || isWatchMode)) return; // neither compact mode ever overwrites the main window's remembered real size
    clearTimeout(timer);
    timer = setTimeout(function () {
      var w = getWin();
      if (w && !w.isDestroyed()) saveWindowBoundsFor(key, w.getBounds());
    }, 250);
  };
}

var schedulePersistBounds = makeBoundsPersister("main", function () { return win; });
var schedulePersistSettingsBounds = makeBoundsPersister("settings", function () { return settingsWin; });
var schedulePersistAnalysisBounds = makeBoundsPersister("analysis", function () { return analysisWin; });
var schedulePersistLeaderboardBounds = makeBoundsPersister("leaderboard", function () { return leaderboardWin; });

function findEqLogFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && EQLOG_RE.test(e.name))
    .map((e) => e.name)
    .sort();
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// ---- tailing --------------------------------------------------------
// Mirrors pollFile() in the browser overlay: read only the bytes appended
// since the last check, on a 1s interval. fs.watch exists but its change
// events are unreliable enough across platforms/network drives that
// polling stat() is the same trade the browser version already made.
function stopTailing() {
  if (tailTimer) clearInterval(tailTimer);
  tailTimer = null;
  tailState = null;
}

function startTailing(filePath) {
  stopTailing();
  var stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    if (win) win.webContents.send("source-status", { ok: false, error: "Couldn't open " + filePath });
    return;
  }
  tailState = { filePath: filePath, offset: stat.size }; // start from "now" — skip existing history, same as the browser overlay
  if (win) win.webContents.send("source-status", { ok: true, filePath: filePath, fileName: path.basename(filePath) });

  tailTimer = setInterval(function () {
    fs.stat(filePath, function (err, st) {
      if (err || !tailState) return; // file missing this tick (log rotation, drive hiccup) — try again next tick
      if (st.size < tailState.offset) tailState.offset = 0; // file rotated/truncated
      if (st.size <= tailState.offset) return;
      var stream = fs.createReadStream(filePath, { start: tailState.offset, end: st.size - 1, encoding: "utf8" });
      var chunks = [];
      stream.on("data", function (c) { chunks.push(c); });
      stream.on("end", function () {
        tailState.offset = st.size;
        if (win) win.webContents.send("log-chunk", chunks.join(""));
      });
      stream.on("error", function () { /* try again next tick */ });
    });
  }, 1000);
}

// ---- windows ------------------------------------------------------------
function createWindow() {
  var savedBounds = loadWindowBoundsFor("main");
  win = new BrowserWindow({
    x: savedBounds ? savedBounds.x : undefined,
    y: savedBounds ? savedBounds.y : undefined,
    width: savedBounds ? clamp(Math.round(savedBounds.width), MIN_W, MAX_W) : BASE_WIDTH,
    height: savedBounds ? clamp(Math.round(savedBounds.height), MIN_H, MAX_H) : BASE_HEIGHT,
    minWidth: MIN_W,
    minHeight: MIN_H,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: true,
    // Opacity is a CSS concern now (--panel-alpha on .card::before — see
    // style.css), not a BrowserWindow-level fade: the OS-level opacity
    // this used to set faded the ENTIRE window, text/icons included,
    // which made "fully transparent" also erase the numbers you're
    // trying to read. The window itself always stays fully opaque; only
    // the panel's own background/border/shadow can fade to nothing.
    backgroundColor: "#00000000",
    // "We can use this image for the taskbar logo" — set directly here
    // (not just baked into a packaged build's exe via build/icon.ico) so
    // the taskbar shows it even running unpackaged via the launcher, on
    // every window, not just this one.
    icon: path.join(__dirname, "renderer", "tray-icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, "screen-saver"); // stays above fullscreen-bordered-window EQ, not just normal windows
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  win.webContents.once("did-finish-load", function () {
    var cfg = loadConfig();
    if (cfg && cfg.path) startTailing(cfg.path);
    // A check from an earlier launch (or one that finished between the
    // window closing and reopening — e.g. tray) already found something —
    // hand it over immediately rather than waiting on the next interval.
    if (updateInfo) win.webContents.send("update-available", updateInfo);
  });

  // Dragging the window by its header (a native OS move, not an IPC call)
  // never goes through set-bounds below, so it needs its own persistence
  // hook — schedulePersistBounds() itself handles the isMiniMode check.
  win.on("moved", schedulePersistBounds);

  // Closing the main window used to just close the main window — if
  // Settings (or Analysis/Leaderboards) was still open, THAT window kept
  // the whole Electron process alive in the background, invisible, since
  // "window-all-closed" below only fires once every last window is gone
  // (item 1: "it doesn't fully close the app"). Two fixes at once: a
  // confirmation prompt before the app actually exits (item 3 — "I
  // accidentally did that"), and once confirmed, every secondary window
  // closes right along with it (item 2) instead of being left orphaned.
  win.on("close", function (evt) {
    if (appIsQuitting) return; // this is the second, real close — let it through
    evt.preventDefault();

    // "an optional slider to keep the window open when closing the window"
    // — with it on, closing the main window just hides it to the tray
    // instead of asking to exit at all; Tray's own "Show Dyrelog"/"Quit"
    // menu is the way back (see ensureTray() below).
    if (loadSettings().keepInTrayOnClose) {
      win.hide();
      ensureTray();
      return;
    }

    var choice = dialog.showMessageBoxSync(win, {
      type: "question",
      buttons: ["Cancel", "Exit"],
      defaultId: 0,
      cancelId: 0,
      title: "Exit Dyrelog?",
      message: "Are you sure you want to exit Dyrelog?",
      noLink: true
    });
    if (choice !== 1) return; // Cancel (or dismissed) — stay open
    appIsQuitting = true;
    if (tray) { tray.destroy(); tray = null; }
    [settingsWin, analysisWin, leaderboardWin].forEach(function (w) {
      if (w && !w.isDestroyed()) w.close();
    });
    win.close(); // re-enters this same handler, but appIsQuitting is true now — falls through to a real close
  });

  win.on("closed", function () { win = null; });
}

// Tray icon — only ever created the first time "keep in tray" actually
// closes the window (not eagerly at launch), and left alive afterward so
// re-hiding doesn't rebuild it. "Show Dyrelog" un-hides the exact window
// that's still running in the background (nothing was torn down), and
// "Quit Dyrelog" is the one way out of tray mode straight to a real exit,
// skipping the normal close-confirm dialog since choosing Quit from the
// tray is already unambiguous.
function ensureTray() {
  if (tray) return;
  // Lives under renderer/ (not build/) so electron-builder's "files" list
  // (which already includes "renderer/**/*") actually ships it inside a
  // packaged app — build/icon.ico is a separate, build-time-only asset
  // electron-builder reads for the .exe's own icon, never copied into the
  // running app itself.
  var icon = nativeImage.createFromPath(path.join(__dirname, "renderer", "tray-icon.png"));
  tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Dyrelog");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show Dyrelog", click: function () { if (win) { win.show(); win.focus(); } } },
      { type: "separator" },
      {
        label: "Quit Dyrelog",
        click: function () {
          appIsQuitting = true;
          if (tray) { tray.destroy(); tray = null; }
          [settingsWin, analysisWin, leaderboardWin].forEach(function (w) {
            if (w && !w.isDestroyed()) w.close();
          });
          if (win) win.close();
        }
      }
    ])
  );
  tray.on("click", function () { if (win) { win.show(); win.focus(); } });
}

// All three secondary windows below get the same always-on-top treatment
// as the main mini-mode window (setAlwaysOnTop after creation, "screen-
// saver" level) — they used to fall behind the game (or Electron's own
// main window) the moment you clicked off them, which defeats the point
// of an overlay tool you're meant to glance at mid-fight.
function createAnalysisWindow() {
  // "Click the icon once, it opens the overlay; click it a second time, it
  // closes it" — the button always calls this same function either way
  // (see btn-analysis in app.js), so an already-open window closing here,
  // rather than just refocusing, is what makes that toggle happen.
  if (analysisWin && !analysisWin.isDestroyed()) { analysisWin.close(); return; }
  var b = loadWindowBoundsFor("analysis");
  analysisWin = new BrowserWindow({
    x: b ? b.x : undefined,
    y: b ? b.y : undefined,
    width: b ? Math.max(420, Math.round(b.width)) : 640,
    height: b ? Math.max(320, Math.round(b.height)) : 520,
    minWidth: 420,
    minHeight: 320,
    frame: true,
    alwaysOnTop: true,
    title: "Dyrelog — Combat Analysis",
    backgroundColor: "#14120f",
    icon: path.join(__dirname, "renderer", "tray-icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  analysisWin.setAlwaysOnTop(true, "screen-saver");
  analysisWin.setMenuBarVisibility(false);
  analysisWin.loadFile(path.join(__dirname, "renderer", "analysis.html"));
  analysisWin.on("resize", schedulePersistAnalysisBounds);
  analysisWin.on("moved", schedulePersistAnalysisBounds);
  analysisWin.on("closed", function () { analysisWin = null; });
}

function createLeaderboardWindow() {
  // Same open/close toggle as createAnalysisWindow() above.
  if (leaderboardWin && !leaderboardWin.isDestroyed()) { leaderboardWin.close(); return; }
  var b = loadWindowBoundsFor("leaderboard");
  leaderboardWin = new BrowserWindow({
    x: b ? b.x : undefined,
    y: b ? b.y : undefined,
    width: b ? Math.max(380, Math.round(b.width)) : 560,
    height: b ? Math.max(320, Math.round(b.height)) : 560,
    minWidth: 380,
    minHeight: 320,
    frame: true,
    alwaysOnTop: true,
    title: "Dyrelog — Leaderboards",
    backgroundColor: "#14120f",
    icon: path.join(__dirname, "renderer", "tray-icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  leaderboardWin.setAlwaysOnTop(true, "screen-saver");
  leaderboardWin.setMenuBarVisibility(false);
  leaderboardWin.loadFile(path.join(__dirname, "renderer", "leaderboard.html"));
  leaderboardWin.on("resize", schedulePersistLeaderboardBounds);
  leaderboardWin.on("moved", schedulePersistLeaderboardBounds);
  leaderboardWin.on("closed", function () { leaderboardWin = null; });
}

// A real popup window now (used to be an in-card panel swap inside win's
// own renderer — see the root README/commit history) — a normal titled,
// closable window is simpler than reinventing Done/Close semantics inside
// a frameless card, and it means Settings can be open at the same time as
// the mini-mode card without fighting it for space.
function createSettingsWindow() {
  // Same open/close toggle as createAnalysisWindow() above.
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.close(); return; }
  var b = loadWindowBoundsFor("settings");
  settingsWin = new BrowserWindow({
    x: b ? b.x : undefined,
    y: b ? b.y : undefined,
    // Widened from 360/320 now that the header carries a website link, a
    // text-size picker, and a search bar on top of the tabs, and Appearance
    // opens on a live preview card.
    width: b ? Math.max(340, Math.round(b.width)) : 390,
    height: b ? Math.max(420, Math.round(b.height)) : 520,
    minWidth: 340,
    minHeight: 420,
    frame: true,
    alwaysOnTop: true,
    title: "Dyrelog Settings",
    // Matches settings.css's own --bg now (its own cool-graphite palette,
    // separate from the overlay's warm near-black default) — this is just
    // what Electron paints for the first instant before that stylesheet
    // loads, so a mismatch here would show as a brief flash of the wrong
    // color on every open.
    backgroundColor: "#0e1015",
    icon: path.join(__dirname, "renderer", "tray-icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.setAlwaysOnTop(true, "screen-saver");
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWin.on("resize", schedulePersistSettingsBounds);
  settingsWin.on("moved", schedulePersistSettingsBounds);
  settingsWin.on("closed", function () { settingsWin = null; });
}

app.whenReady().then(function () {
  createWindow();
  // Give the window a moment to actually appear before spending a network
  // request — a few seconds' delay here is invisible to the player either way.
  setTimeout(checkForUpdates, 5000);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
});

app.on("window-all-closed", function () {
  stopTailing();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ---- IPC: log source ------------------------------------------------------
ipcMain.handle("get-saved-source", function () {
  return loadConfig();
});

// The Settings window's footer ("Dyrelog vX.Y.Z") — app.getVersion() reads
// straight from package.json's own "version" field, so there's nothing to
// keep in sync by hand; bumping that one number for a release is enough.
ipcMain.handle("get-app-version", function () {
  return app.getVersion();
});

// See updateInfo/checkForUpdates above — this is the pull side (a window
// asking "is there one already?" on load), the push side is the
// "update-available" send that happens the moment a check actually finds one.
ipcMain.handle("get-update-info", function () {
  return updateInfo;
});

ipcMain.handle("pick-file", async function () {
  var res = await dialog.showOpenDialog(win, {
    title: "Pick your EverQuest log file",
    filters: [{ name: "EverQuest log", extensions: ["txt", "log"] }],
    properties: ["openFile"]
  });
  if (res.canceled || !res.filePaths[0]) return null;
  var filePath = res.filePaths[0];
  saveConfig({ type: "file", path: filePath });
  startTailing(filePath);
  return { path: filePath, fileName: path.basename(filePath) };
});

ipcMain.handle("pick-folder", async function () {
  var res = await dialog.showOpenDialog(win, {
    title: "Pick your EverQuest Logs folder",
    properties: ["openDirectory"]
  });
  if (res.canceled || !res.filePaths[0]) return null;
  var dir = res.filePaths[0];
  var matches = findEqLogFiles(dir);
  if (matches.length === 0) return { dir: dir, matches: [] };
  if (matches.length === 1) {
    var filePath = path.join(dir, matches[0]);
    saveConfig({ type: "folder", dir: dir, path: filePath, fileName: matches[0] });
    startTailing(filePath);
    return { dir: dir, matches: matches, chosen: matches[0] };
  }
  // More than one character's log lives in this folder — hand the list
  // back to the renderer so it can ask, same as the browser overlay's
  // folder-log-picker row.
  return { dir: dir, matches: matches };
});

ipcMain.handle("use-folder-file", function (evt, dir, fileName) {
  var filePath = path.join(dir, fileName);
  saveConfig({ type: "folder", dir: dir, path: filePath, fileName: fileName });
  startTailing(filePath);
  return { path: filePath, fileName: fileName };
});

ipcMain.handle("clear-source", function () {
  stopTailing();
  clearConfig();
  return true;
});

// ---- IPC: settings ----------------------------------------------------
ipcMain.handle("get-settings", function () {
  return loadSettings();
});

// Shared by the "save-settings" IPC handler below (Settings window saves)
// AND the "Switch to Bars" item in Circle mode's escape-hatch menu (see
// show-watch-menu below) — both are "merge this partial into the saved
// settings, persist it, and tell the mini-mode window live" and previously
// only the first existed; rather than duplicating that logic, the menu
// action now just calls this directly.
function applySettingsPartial(partial) {
  var settings = Object.assign(loadSettings(), partial || {});
  saveSettings(settings);
  // Turning the tray toggle back off tears down the tray icon immediately
  // (not just next time the window closes) — otherwise it'd sit there
  // looking like it's still doing something.
  if (partial && partial.keepInTrayOnClose === false && tray) {
    tray.destroy();
    tray = null;
  }
  // Register/unregister Dyrelog as a Windows startup item. Electron/Windows
  // has no built-in way to say "launch when EverQuest launches" — this is
  // the closest real, supported hook: Dyrelog is already running (and, with
  // "keep in tray" on, already in the tray) by the time you open the game.
  if (partial && "launchAtStartup" in partial) {
    try {
      app.setLoginItemSettings({ openAtLogin: !!partial.launchAtStartup });
    } catch (err) {
      console.error("Failed to update startup launch setting:", err);
    }
  }
  // Settings now lives in its own window (see createSettingsWindow()), so
  // every OTHER open window only ever hears about the result, live, so
  // theme/text-size/class-color (pure renderer-side concerns opacity/scale
  // above don't cover) stay in sync — see onSettingsUpdate() in app.js/
  // analysis.js/leaderboard.js. This used to only message `win` (the main
  // mini-mode card), which is why changing the theme while Combat Analysis
  // or Leaderboards was ALREADY OPEN never repainted it — those two
  // windows only ever picked up a new theme by being closed and reopened
  // (their own getSettings() call on load). All three now get the same
  // live push.
  [win, analysisWin, leaderboardWin].forEach(function (w) {
    if (w && !w.isDestroyed()) w.webContents.send("settings-update", settings);
  });
  return settings;
}

ipcMain.handle("save-settings", function (evt, partial) {
  return applySettingsPartial(partial);
});

// ---- IPC: window bounds (mini-mode toggle + manual corner/edge drag) ----
ipcMain.handle("get-bounds", function () {
  return win ? win.getBounds() : { x: 0, y: 0, width: BASE_WIDTH, height: BASE_HEIGHT };
});

// opts.persist (default true) controls whether this resize gets written to
// WINDOW_PATH — the mini-mode toggle passes persist:false both ways (see
// toggleMini() in app.js) so entering/leaving mini mode never overwrites
// the user's real remembered size with mini's tiny 190x76 footprint; the
// manual corner/edge resize handles omit opts entirely, which defaults to
// persisting, since that IS the user deliberately choosing a new size now
// that there's no separate "Size" slider to fall back on (see item 1).
ipcMain.handle("set-bounds", function (evt, bounds, opts) {
  if (!win) return null;
  var next = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: clamp(Math.round(bounds.width), MIN_W, MAX_W),
    height: clamp(Math.round(bounds.height), MIN_H, MAX_H)
  };
  win.setBounds(next);
  if (!opts || opts.persist !== false) schedulePersistBounds();
  return next;
});

ipcMain.handle("get-mini-size", function () {
  return { width: MINI_WIDTH, height: MINI_HEIGHT };
});

ipcMain.on("set-mini-mode", function (evt, val) { isMiniMode = !!val; });
ipcMain.on("set-watch-mode", function (evt, val) { isWatchMode = !!val; });

// Circle display style's escape-hatch menu — click, right-click, or the
// gear button on the badge (see .watch-badge/.watch-menu-btn in style.css
// and their listeners in app.js) all land here. This exists because a
// single plain click on the badge turned out not to be a reliable way
// back out (it doubles as the window's drag handle — see the comment on
// -webkit-app-region:drag there), and because the user asked for direct
// access to Analysis/Leaderboards/Submit from Circle mode, not just a
// detour through Settings every time.
ipcMain.on("show-watch-menu", function () {
  if (!win) return;
  var menu = Menu.buildFromTemplate([
    { label: "Combat Analysis", click: function () { createAnalysisWindow(); } },
    { label: "Leaderboards", click: function () { createLeaderboardWindow(); } },
    { label: "Settings…", click: function () { createSettingsWindow(); } },
    { type: "separator" },
    // Goes straight back to Bars — including the fight card's own Submit
    // pill — without a Settings detour. Submit itself isn't a separate
    // menu item here: it's not wired up yet (see the README's "What's not
    // done yet"), and Bars is already exactly where it lives once it is.
    { label: "Switch to Bars", click: function () { applySettingsPartial({ displayStyle: "bars" }); } },
    { type: "separator" },
    { label: "Close Dyrelog", click: function () { win.close(); } } // reuses the normal exit-confirmation flow — see win's "close" handler
  ]);
  menu.popup({ window: win });
});

// ---- IPC: window controls -----------------------------------------------
ipcMain.on("window-close", function () { if (win) win.close(); });

// ---- IPC: secondary windows + state relay --------------------------------
ipcMain.on("open-analysis", function () { createAnalysisWindow(); });
ipcMain.on("open-leaderboard", function () { createLeaderboardWindow(); });
ipcMain.on("open-settings", function () { createSettingsWindow(); });
ipcMain.on("open-external", function (evt, url) {
  // Only ever Dyrelog's own hosts, its GitHub repo, and the fan-wiki
  // sources credited in Settings > About & Feedback — never an arbitrary
  // URL from renderer content, even though this renderer's own content is
  // trusted. github.com was missing here entirely before, which is the
  // real bug behind "github link isn't working or taking me anywhere" —
  // the click handler was firing fine, this allowlist was just silently
  // swallowing the call before shell.openExternal ever ran.
  if (
    /^https:\/\/(dyrelog\.pages\.dev|dyrelog-api\.dyremoon\.workers\.dev|github\.com\/dyremoon\/dyrelog|eqlwiki\.com|eqlegends\.com|(www\.)?loadoutlegends\.com)/.test(
      url
    )
  ) {
    shell.openExternal(url);
  }
});

ipcMain.on("push-state", function (evt, data) {
  // Merge this run's newly-closed encounters into the persisted rolling
  // history (deduped by startTime, which is unique per encounter) instead
  // of just replacing lastKnownState outright — the mini-mode renderer's
  // own "encounters" array only ever holds THIS run's fights (it starts
  // fresh from EQP.newState() every launch), so relaying it as-is would
  // wipe out everything loadHistory() restored the moment the first
  // push-state of a new run arrived.
  if (data && Array.isArray(data.encounters)) {
    var knownStarts = {};
    persistedHistory.forEach(function (e) { knownStarts[e.startTime] = true; });
    var added = false;
    data.encounters.forEach(function (e) {
      if (!knownStarts[e.startTime]) {
        persistedHistory.push(e);
        knownStarts[e.startTime] = true;
        added = true;
      }
    });
    if (added) {
      if (persistedHistory.length > MAX_HISTORY_ENCOUNTERS) {
        persistedHistory.splice(0, persistedHistory.length - MAX_HISTORY_ENCOUNTERS);
      }
      saveHistory(persistedHistory);
    }
    lastKnownState = Object.assign({}, data, { encounters: persistedHistory });
  } else {
    lastKnownState = data;
  }
  if (analysisWin && !analysisWin.isDestroyed()) analysisWin.webContents.send("state-update", lastKnownState);
});
ipcMain.handle("get-state", function () {
  return lastKnownState;
});
