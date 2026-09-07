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

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, session, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

// Pin the app name explicitly, BEFORE any app.getPath("userData") call
// below. Without this, Electron derives the name from package.json: when
// run unpackaged ("npm start"), it falls back to the top-level "name"
// field ("dyrelog-desktop"), but the packaged/installed build picks up
// "productName" ("Dyrelog") from the generated package.json inside the
// asar instead. Those two names produce two DIFFERENT userData folders
// (%APPDATA%\dyrelog-desktop\ vs %APPDATA%\Dyrelog\), so anyone who tests
// via "npm start" and then also runs the installed .exe sees two separate,
// non-overlapping histories/settings/window-position files — this is
// exactly why kills tracked one way didn't show up in "My Kills" the other
// way. Pinning the name here makes both always use %APPDATA%\Dyrelog\.
app.setName("Dyrelog");

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
// Discord login + leaderboard submission (Sept 7) — same worker API the
// website and its login link use (frontend/js/app.js's API_BASE / the
// site's own "Log in with Discord" href), just driven from a real Electron
// BrowserWindow instead of a normal browser tab. See the auth section below.
const AUTH_PATH = path.join(app.getPath("userData"), "dyrelog-auth.json");
const API_BASE = "https://dyrelog-api.dyremoon.workers.dev";
const SITE_URL = "https://dyrelog.pages.dev"; // must match worker/wrangler.toml's SITE_URL — that's where a real login lands
const EQLOG_RE = /^eqlog_.+\.(txt|log)$/i;

const BASE_WIDTH = 320;
const BASE_HEIGHT = 420;
const MINI_WIDTH = 190;
const MINI_HEIGHT = 96; // tall enough for the total-damage line + pet sub-line — see index.html's #mini-total/#mini-pet-row
const MIN_W = 170, MAX_W = 900, MIN_H = 56, MAX_H = 900;

const DEFAULT_SETTINGS = {
  opacity: 1,
  // No more "scale" slider — manual corner/edge resize covers window size
  // now, and the size it's dragged to is persisted separately (see
  // WINDOW_PATH/loadWindowBoundsFor()/saveWindowBoundsFor() below) instead
  // of living in this settings file at all.
  barHeight: 1, // multiplies each bar row's height — see "Bar height" in Settings
  textScale: 1, // independent of barHeight — see "Text size" in Settings
  iconScale: 1, // header/drill-back/watch-menu icon buttons only — see "Icon Size" in Settings (item 6 — used to zoom right along with textScale)
  miniPetTextScale: 1, // mini mode's pet sub-line only — see "Mini pet text size" in Settings
  secondaryTextScale: 1, // status ("live"/"defeated") / "dps" unit label / dps number size — see "Info Text Size"
  timerTextScale: 1, // fight timer (Bars) / circle timer ONLY — see "Timer Text Size" in Settings (item 10)
  theme: "blue", // "blue" | "brass"
  bgColor: null, // explicit hex override for the panel background; null = use the theme's own
  textColor: null, // explicit hex override for all overlay text; null = the theme's own --ink
  // Secondary/muted text (the fight timer, "(defeated)"/"(live)" state,
  // the "dps" unit label, rank numbers, hints) rides --ink-2/--ink-3
  // rather than --ink — this recolors that whole tier at once instead of
  // needing a separate control per element. null = the theme's own.
  secondaryTextColor: null,
  dpsTextColor: null, // per-row "DPS" number color, bars + mini — see item 9 of the newest list; null = the theme's own
  totalDpsColor: null, // the top-line/mini-bar total-damage figure's color — independent of dpsTextColor
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
  // "make the default option 'ask before submit' for leaderboard options
  // instead of 'disabled'" (Sept 6) — was "off". Only affects a settings
  // file that's never had this key written to it (loadSettings() merges
  // this in as the fallback — see loadJson() below); anyone who already
  // has an explicit autoSubmitMode saved keeps whatever they picked.
  // "Add color options to edit the circle colors: border, background, text
  // colors" (Sept 6) — Circle display style previously always used the
  // theme's own --bg-card/--accent/--ink-3, with no way to override any of
  // the three independent of Bars mode's own Color section. null = keep
  // following the theme, same convention as bgColor/borderColor/textColor
  // above. See applySettings() in app.js and .watch-badge in style.css.
  circleBgColor: null,
  circleBorderColor: null,
  circleTextColor: null,
  autoSubmitMode: "ask", // "off" | "ask" | "auto"
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
let authWin = null;
let submitPopupWin = null;
// The one submission currently staged behind the submit popup's Submit/
// Discard buttons in "ask" mode — see request-submit below. Never more than
// one at a time; a second eligible kill arriving before this one is
// answered just replaces it (last kill wins), same as the popup's own
// content does.
let pendingSubmitPayload = null;
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

// ---- real in-app updater (Settings > What's New) ---------------------
// Separate from checkForUpdates()/updateInfo above, which only ever powers
// a small "a new version exists" banner that links out to the releases
// page. This is the actual "check for updates" button + "update now and
// relaunch" button DJ asked for — electron-updater against the same
// public GitHub Releases page, but able to download the installer and
// relaunch into it itself, no browser round-trip.
//
// Requires each GitHub release to also carry the latest.yml (and the
// installer's .blockmap) that electron-builder generates alongside the
// .exe once package.json's build.publish is set — see DYRELOG_GUIDE.md's
// release checklist. Only does anything in a packaged, installed build:
// electron-updater has no update feed to read from when running via
// `npm start` from source (app.isPackaged is false), so both handlers
// below short-circuit to a "dev-mode" status instead of throwing.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function sendUpdaterStatus(payload) {
  // Used to only ever reach settingsWin — fine while the real updater was
  // only driven from Settings > What's New. Now that the mini-mode
  // window's own "Update available" banner also drives this same
  // electron-updater flow (see app.js), it needs these events too, or its
  // banner text would just freeze on "Downloading..." forever with no way
  // to know progress/completion/failure. Same broadcast-to-every-window
  // pattern as the settings-update broadcast bug fixed earlier — see that
  // note in the CSS theming section above.
  [win, settingsWin].forEach(function (w) {
    if (w && !w.isDestroyed()) w.webContents.send("updater-status", payload);
  });
}

autoUpdater.on("checking-for-update", function () {
  sendUpdaterStatus({ state: "checking" });
});
autoUpdater.on("update-available", function (info) {
  // "Can the What's New tab show the patch notes before it's downloaded?"
  // — electron-updater's GitHub provider already reads them straight off
  // the release's own description on GitHub and puts them on info as
  // releaseNotes, no extra API call needed. It's usually a plain string,
  // but some electron-updater versions can hand back an array of
  // {version, note} objects when Squirrel-style multi-version feeds are in
  // play — normalize both shapes to one string so settings.js only ever
  // has to handle one.
  var notes = info && info.releaseNotes;
  if (Array.isArray(notes)) {
    notes = notes.map(function (n) { return n && n.note; }).filter(Boolean).join("\n\n");
  }
  sendUpdaterStatus({ state: "available", version: info && info.version, releaseNotes: notes || null });
});
autoUpdater.on("update-not-available", function () {
  sendUpdaterStatus({ state: "up-to-date" });
});
autoUpdater.on("error", function (err) {
  sendUpdaterStatus({ state: "error", message: (err && err.message) || String(err) });
});
autoUpdater.on("download-progress", function (progress) {
  sendUpdaterStatus({ state: "downloading", percent: Math.round((progress && progress.percent) || 0) });
});
autoUpdater.on("update-downloaded", function () {
  sendUpdaterStatus({ state: "ready" });
  // "automatically pull the update and relaunch" — no second click once
  // the download finishes. The short delay just lets the "Relaunching…"
  // status actually render before the app quits.
  setTimeout(function () { autoUpdater.quitAndInstall(); }, 900);
});

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

// Writes a successful submission's server-side id back onto the matching
// local history entry (matched by startTime — see the startTime field
// requestSubmitFor() now adds in app.js) so Combat Analysis' "Open full
// website" button can deep-link straight to that exact log instead of just
// the homepage — see the #btn-open-site handler in analysis.js.
function recordSubmission(startTime, submissionId) {
  if (startTime == null || submissionId == null) return;
  var enc = persistedHistory.find(function (e) { return e.startTime === startTime; });
  if (!enc) return;
  enc.submissionId = submissionId;
  saveHistory(persistedHistory);
  if (analysisWin && !analysisWin.isDestroyed()) analysisWin.webContents.send("state-update", lastKnownState);
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
// "main" and "mini" are two DIFFERENT remembered sizes for the SAME
// physical window (`win`) — item 3 ("I want them to keep their own
// independent sizes"). Whichever one is NOT the currently active mode is
// left alone entirely, and Circle (isWatchMode) never persists to either
// one, since its size is always transient/derived (see applyDisplayStyle()/
// applyCircleScale() in app.js, both of which always pass persist:false).
function makeBoundsPersister(key, getWin) {
  var timer = null;
  return function schedule() {
    if (key === "main" || key === "mini") {
      if (isWatchMode) return;
      if (key === "main" && isMiniMode) return;
      if (key === "mini" && !isMiniMode) return;
    }
    clearTimeout(timer);
    timer = setTimeout(function () {
      var w = getWin();
      if (w && !w.isDestroyed()) saveWindowBoundsFor(key, w.getBounds());
    }, 250);
  };
}

var schedulePersistBounds = makeBoundsPersister("main", function () { return win; });
var schedulePersistMiniBounds = makeBoundsPersister("mini", function () { return win; });
var schedulePersistSettingsBounds = makeBoundsPersister("settings", function () { return settingsWin; });
var schedulePersistAnalysisBounds = makeBoundsPersister("analysis", function () { return analysisWin; });
var schedulePersistLeaderboardBounds = makeBoundsPersister("leaderboard", function () { return leaderboardWin; });

// Also checks one level of subfolders (e.g. "Logs") so picking the EverQuest
// install root itself finds logs, not just a folder containing them directly.
function findEqLogFiles(baseDir) {
  var results = [];
  [baseDir].concat(
    fs.readdirSync(baseDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(baseDir, e.name))
  ).forEach(function (dir) {
    var entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    entries
      .filter((e) => e.isFile() && EQLOG_RE.test(e.name))
      .forEach((e) => results.push(path.relative(baseDir, path.join(dir, e.name))));
  });
  return results.sort();
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

  // Diagnostic aid (Sept 6) — F12 opens DevTools on this frameless/no-menu
  // window so a stuck-UI report can come with a real console error instead of a guess.
  win.webContents.on("before-input-event", function (event, input) {
    if (input.type === "keyDown" && input.key === "F12") win.webContents.toggleDevTools();
  });

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
  // Both persisters are called every time — each one's own guard above
  // decides whether THIS move actually belongs to it (main vs. mini vs.
  // neither, while Circle's transient size is active).
  win.on("moved", function () { schedulePersistBounds(); schedulePersistMiniBounds(); });

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
    [settingsWin, analysisWin, leaderboardWin, authWin, submitPopupWin].forEach(function (w) {
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
          [settingsWin, analysisWin, leaderboardWin, authWin, submitPopupWin].forEach(function (w) {
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
  // Same F12 DevTools diagnostic as the main window (Sept 6) — this window
  // hides its menu bar too, so there was no way to see a real console error here.
  analysisWin.webContents.on("before-input-event", function (event, input) {
    if (input.type === "keyDown" && input.key === "F12") analysisWin.webContents.toggleDevTools();
  });
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
  // Same F12 DevTools diagnostic as the main/Analysis windows (Sept 7).
  leaderboardWin.webContents.on("before-input-event", function (event, input) {
    if (input.type === "keyDown" && input.key === "F12") leaderboardWin.webContents.toggleDevTools();
  });
  leaderboardWin.on("resize", schedulePersistLeaderboardBounds);
  leaderboardWin.on("moved", schedulePersistLeaderboardBounds);
  leaderboardWin.on("closed", function () { leaderboardWin = null; });
}

// ---- Discord login + leaderboard submission (Sept 7) ----------------------
// Auth state on disk — { sessionCookie, userId, username, avatarUrl } once
// logged in, null otherwise. sessionCookie is the exact value of the
// worker's own dyrelog_session cookie (see worker/src/session.js) — we never
// decode or re-sign it ourselves, just hold onto it and send it back
// verbatim on every authenticated call. There's no local expiry tracking;
// a call that comes back 401 (the worker's cookie itself expired, 30 days —
// see session.js) just clears this and apiFetch's caller sees the failure.
function loadAuth() {
  try {
    return JSON.parse(fs.readFileSync(AUTH_PATH, "utf8"));
  } catch (e) {
    return null;
  }
}
function saveAuth(auth) {
  if (auth) fs.writeFileSync(AUTH_PATH, JSON.stringify(auth, null, 2));
  else { try { fs.unlinkSync(AUTH_PATH); } catch (e) {} }
}
// Only ever sends username/avatarUrl out to renderers — sessionCookie stays
// main-process-only, no reason for any web content to ever see it.
function broadcastAuthUpdate(auth) {
  var publicState = auth ? { username: auth.username, avatarUrl: auth.avatarUrl } : null;
  [win, settingsWin, analysisWin, leaderboardWin].forEach(function (w) {
    if (w && !w.isDestroyed()) w.webContents.send("auth-update", publicState);
  });
}

// Every authenticated call to the worker API goes through here. Node's own
// fetch has no browser cookie jar behind it, so the session cookie a real
// browser would send automatically (credentials:'include' — see frontend/
// js/app.js's api() helper) has to be attached by hand instead.
async function apiFetch(pathname, opts) {
  var auth = loadAuth();
  var headers = Object.assign({ "Content-Type": "application/json" }, (opts && opts.headers) || {});
  if (auth && auth.sessionCookie) headers.Cookie = "dyrelog_session=" + auth.sessionCookie;
  var res = await fetch(API_BASE + pathname, Object.assign({}, opts, { headers: headers }));
  if (res.status === 401) { saveAuth(null); broadcastAuthUpdate(null); }
  return res;
}

// Opens a real BrowserWindow and lets it run the exact same browser-facing
// OAuth dance the website's own "Log in with Discord" link does (GET
// /api/auth/login -> Discord's consent screen -> GET /api/auth/callback,
// which sets the session cookie and 302s to SITE_URL). We never see the
// Discord password or handle OAuth ourselves — we just let this window act
// like a browser tab would, then harvest the session cookie it's holding
// once it lands on SITE_URL, the same cookie a real browser would have kept.
// A dedicated persistent session partition keeps this cookie jar separate
// from anything else Electron might ever load.
function openLoginWindow() {
  return new Promise(function (resolve) {
    if (authWin && !authWin.isDestroyed()) { authWin.focus(); resolve({ ok: false, alreadyOpen: true }); return; }

    var authSession = session.fromPartition("persist:dyrelog-auth");
    authWin = new BrowserWindow({
      width: 460,
      height: 640,
      title: "Log in with Discord",
      alwaysOnTop: true,
      icon: path.join(__dirname, "renderer", "tray-icon.png"),
      webPreferences: { session: authSession, contextIsolation: true, nodeIntegration: false }
    });
    authWin.setMenuBarVisibility(false);
    authWin.loadURL(API_BASE + "/api/auth/login");
    authWin.webContents.on("before-input-event", function (event, input) {
      if (input.type === "keyDown" && input.key === "F12") authWin.webContents.toggleDevTools();
    });

    var settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      resolve(result);
    }

    async function handleNavigation(url) {
      if (settled || typeof url !== "string" || url.indexOf(SITE_URL) !== 0) return; // still mid-flow — keep waiting
      try {
        var cookies = await authSession.cookies.get({ url: API_BASE, name: "dyrelog_session" });
        var cookie = cookies[0];
        if (!cookie) { finish({ ok: false, error: "no_session_cookie" }); }
        else {
          var meRes = await fetch(API_BASE + "/api/me", { headers: { Cookie: "dyrelog_session=" + cookie.value } });
          var me = await meRes.json().catch(function () { return { user: null }; });
          if (!me.user) {
            finish({ ok: false, error: "no_user" });
          } else {
            var auth = {
              sessionCookie: cookie.value,
              userId: me.user.id,
              username: me.user.username,
              avatarUrl: me.user.avatar_url || null
            };
            saveAuth(auth);
            broadcastAuthUpdate(auth);
            finish({ ok: true, username: auth.username });
          }
        }
      } catch (err) {
        finish({ ok: false, error: String((err && err.message) || err) });
      }
      if (authWin && !authWin.isDestroyed()) authWin.close();
    }

    authWin.webContents.on("did-navigate", function (evt, url) { handleNavigation(url); });
    authWin.webContents.on("did-redirect-navigation", function (evt, url) { handleNavigation(url); });
    authWin.on("closed", function () {
      authWin = null;
      finish({ ok: false, cancelled: true }); // no-op if handleNavigation above already resolved this
    });
  });
}

function logout() {
  var auth = loadAuth();
  saveAuth(null);
  broadcastAuthUpdate(null);
  // Best-effort — from this app's own perspective we're already logged out
  // the moment the local cookie is gone, regardless of whether this reaches
  // the worker.
  if (auth && auth.sessionCookie) {
    fetch(API_BASE + "/api/auth/logout", { method: "POST", headers: { Cookie: "dyrelog_session=" + auth.sessionCookie } }).catch(function () {});
  }
  session.fromPartition("persist:dyrelog-auth").clearStorageData().catch(function () {});
}

// Small always-on-top notification window, positioned at a fixed screen
// corner rather than tied to whichever mode (bars/mini/circle) the main
// window is currently in — "perhaps a second overlay is best so that we can
// just call it regardless of mode we're in" (Sept 7). One instance reused
// for every kill; a new one showing while an old one is still up just
// replaces its content (see request-submit below).
const SUBMIT_POPUP_WIDTH = 300, SUBMIT_POPUP_HEIGHT = 140;
function ensureSubmitPopupWindow() {
  if (submitPopupWin && !submitPopupWin.isDestroyed()) return submitPopupWin;
  var area = screen.getPrimaryDisplay().workArea;
  submitPopupWin = new BrowserWindow({
    x: area.x + area.width - SUBMIT_POPUP_WIDTH - 20,
    y: area.y + area.height - SUBMIT_POPUP_HEIGHT - 20,
    width: SUBMIT_POPUP_WIDTH,
    height: SUBMIT_POPUP_HEIGHT,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  submitPopupWin.setAlwaysOnTop(true, "screen-saver");
  submitPopupWin.loadFile(path.join(__dirname, "renderer", "submit-popup.html"));
  submitPopupWin.webContents.on("before-input-event", function (event, input) {
    if (input.type === "keyDown" && input.key === "F12") submitPopupWin.webContents.toggleDevTools();
  });
  submitPopupWin.on("closed", function () { submitPopupWin = null; pendingSubmitPayload = null; });
  return submitPopupWin;
}
function sendToSubmitPopup(channel, data) {
  var w = ensureSubmitPopupWindow();
  var send = function () { w.webContents.send(channel, data); };
  if (w.webContents.isLoadingMainFrame()) w.webContents.once("did-finish-load", send);
  else send();
}

// The actual start -> batch -> finalize sequence against the worker API for
// one finished encounter (see streaming.js/submissions.js) — this ships the
// raw log text and lets the server re-derive every number itself, same as
// it would for the website; nothing client-computed is ever trusted.
async function performSubmit(payload) {
  var startRes = await apiFetch("/api/streams", {
    method: "POST",
    body: JSON.stringify({ characterName: payload.characterName, realm: payload.realm, soloMode: !!payload.soloMode })
  });
  var startBody = await startRes.json().catch(function () { return {}; });
  if (!startRes.ok) throw new Error(startBody.error || "Couldn't start the submission");

  var batchRes = await apiFetch("/api/streams/" + startBody.submissionId + "/batches", {
    method: "POST",
    body: JSON.stringify({ chunk: payload.rawText })
  });
  if (!batchRes.ok) {
    var batchBody = await batchRes.json().catch(function () { return {}; });
    throw new Error(batchBody.error || "Couldn't upload the log");
  }

  var finalizeRes = await apiFetch("/api/streams/" + startBody.submissionId + "/finalize", {
    method: "POST",
    body: JSON.stringify(payload.difficulty ? { difficulty: payload.difficulty } : {})
  });
  var finalizeBody = await finalizeRes.json().catch(function () { return {}; });
  if (!finalizeRes.ok) throw new Error(finalizeBody.error || "Couldn't finalize the submission");
  return finalizeBody;
}

ipcMain.handle("login-with-discord", function () { return openLoginWindow(); });
ipcMain.handle("logout", function () { logout(); return { ok: true }; });
ipcMain.handle("get-auth-state", function () {
  var auth = loadAuth();
  return auth ? { username: auth.username, avatarUrl: auth.avatarUrl } : null;
});

// Single entry point the mini-mode renderer calls for every eligible kill,
// regardless of which display mode (bars/mini/circle) it's currently in —
// app.js never calls this at all when autoSubmitMode is "off".
ipcMain.handle("request-submit", function (evt, payload) {
  if (!loadAuth()) {
    pendingSubmitPayload = null;
    sendToSubmitPopup("submit-popup:show", { needsLogin: true });
    return { ok: false, error: "not_logged_in" };
  }

  if (payload.mode === "auto") {
    sendToSubmitPopup("submit-popup:show", { pending: true, mobName: payload.mobName });
    performSubmit(payload).then(function (result) {
      recordSubmission(payload.startTime, result.submissionId);
      if (submitPopupWin && !submitPopupWin.isDestroyed()) submitPopupWin.webContents.send("submit-popup:result", { ok: true, status: result.status });
    }).catch(function (err) {
      if (submitPopupWin && !submitPopupWin.isDestroyed()) submitPopupWin.webContents.send("submit-popup:result", { ok: false, error: String((err && err.message) || err) });
    });
    return { ok: true };
  }

  // "ask" mode — stage the payload and wait for the popup's own Submit /
  // Discard click below.
  pendingSubmitPayload = payload;
  sendToSubmitPopup("submit-popup:show", { mobName: payload.mobName, dps: payload.dps, damage: payload.damage });
  return { ok: true };
});

ipcMain.on("submit-popup:confirm", function () {
  if (!pendingSubmitPayload) return;
  var payload = pendingSubmitPayload;
  pendingSubmitPayload = null;
  if (submitPopupWin && !submitPopupWin.isDestroyed()) submitPopupWin.webContents.send("submit-popup:show", { pending: true, mobName: payload.mobName });
  performSubmit(payload).then(function (result) {
    recordSubmission(payload.startTime, result.submissionId);
    if (submitPopupWin && !submitPopupWin.isDestroyed()) submitPopupWin.webContents.send("submit-popup:result", { ok: true, status: result.status });
  }).catch(function (err) {
    if (submitPopupWin && !submitPopupWin.isDestroyed()) submitPopupWin.webContents.send("submit-popup:result", { ok: false, error: String((err && err.message) || err) });
  });
});

ipcMain.on("submit-popup:discard", function () {
  pendingSubmitPayload = null;
  if (submitPopupWin && !submitPopupWin.isDestroyed()) submitPopupWin.close();
});

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
    // Widened again (was 390/340 min) so Appearance's live preview can sit
    // in its own sticky right-hand column next to the settings controls
    // instead of stacking above them — "as you go down to test [sizing
    // sliders], you have to scroll up to see the test bar." Below
    // minWidth's own two-column breakpoint (settings.css's 560px media
    // query) it collapses back to the original stacked layout, so a window
    // dragged down to minWidth still works, just without the side-by-side
    // preview.
    width: b ? Math.max(480, Math.round(b.width)) : 640,
    height: b ? Math.max(460, Math.round(b.height)) : 580,
    minWidth: 480,
    minHeight: 460,
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
  // Same F12 DevTools diagnostic as the main/Analysis windows (Sept 7) — the
  // new Account/login section is exactly the kind of thing worth being able
  // to actually debug here.
  settingsWin.webContents.on("before-input-event", function (event, input) {
    if (input.type === "keyDown" && input.key === "F12") settingsWin.webContents.toggleDevTools();
  });
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

// "make sure the what's new tab shows whatever patch notes were listed in
// the release notes, this still shows v1" (Sept 6) — settings.js used to
// render a CHANGELOG array hand-copied into its own source for whatever
// version was "current" at the time, which is exactly what went stale: it
// never updates itself just because a new version ships, only if someone
// remembers to go edit that array too. This instead reads the real
// releases straight off GitHub (the exact same public Releases page
// UPDATE_CHECK_URL/autoUpdater already pull from) every time the What's
// New tab loads, so it can never show anything other than what was
// actually typed into a release's own notes. Returns up to the 10 most
// recent releases as [{ version, body }, ...] newest-first, or null on any
// failure (offline, rate-limited, no releases yet) — settings.js falls
// back to a minimal built-in message in that case rather than an empty tab.
const RELEASE_HISTORY_URL = "https://api.github.com/repos/dyremoon/dyrelog/releases?per_page=10";
ipcMain.handle("get-release-notes", async function () {
  try {
    var res = await fetch(RELEASE_HISTORY_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    var data = await res.json();
    if (!Array.isArray(data)) return null;
    return data
      .filter(function (r) { return r && r.tag_name && !r.draft; })
      .map(function (r) {
        return { version: String(r.tag_name).replace(/^v/i, ""), body: r.body || "", publishedAt: r.published_at || null };
      });
  } catch (err) {
    return null; // offline, DNS hiccup, rate-limited — settings.js has its own fallback text
  }
});

// Real check/download/relaunch pair for the What's New tab's own buttons
// (see autoUpdater wiring above). Both short-circuit to "dev-mode" outside
// a packaged build — nothing to check against when running from source.
ipcMain.handle("check-for-updates-now", async function () {
  if (!app.isPackaged) {
    sendUpdaterStatus({ state: "dev-mode" });
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    sendUpdaterStatus({ state: "error", message: (err && err.message) || String(err) });
  }
});
ipcMain.handle("download-and-install-update", async function () {
  if (!app.isPackaged) {
    sendUpdaterStatus({ state: "dev-mode" });
    return;
  }
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    sendUpdaterStatus({ state: "error", message: (err && err.message) || String(err) });
  }
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
  if (!opts || opts.persist !== false) { schedulePersistBounds(); schedulePersistMiniBounds(); }
  return next;
});

// Mini mode's own remembered size (item 3) — falls back to the fixed
// MINI_WIDTH/MINI_HEIGHT defaults the very first time mini mode is ever
// entered, same convention loadWindowBoundsFor("main") already uses for
// BASE_WIDTH/BASE_HEIGHT below.
ipcMain.handle("get-mini-size", function () {
  var saved = loadWindowBoundsFor("mini");
  return {
    width: saved ? clamp(Math.round(saved.width), MIN_W, MAX_W) : MINI_WIDTH,
    height: saved ? clamp(Math.round(saved.height), MIN_H, MAX_H) : MINI_HEIGHT
  };
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
// sessions (from app.js's fightMenuSessions()) is [{key, label, active}] —
// Circle mode had no way to change fights at all before this (newest list,
// "we need a way to change fights from the circle mode as well"). Picking
// one sends its key back to the renderer, same selectedSessionKey the Bars
// popup sets directly — see the "fight-picked" listener in app.js.
ipcMain.on("show-watch-menu", function (evt, sessions) {
  if (!win) return;
  sessions = Array.isArray(sessions) ? sessions : [];
  var fightItems = sessions.length
    ? sessions.map(function (s) {
        return {
          label: s.label,
          type: "checkbox",
          checked: !!s.active,
          click: function () { win.webContents.send("fight-picked", s.key); }
        };
      })
    : [{ label: "Waiting for a fight…", enabled: false }];
  var menu = Menu.buildFromTemplate([
    { label: "Change Fight", submenu: fightItems },
    { type: "separator" },
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
