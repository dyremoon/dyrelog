// The main process tails logs and relays raw text to the renderer, which owns parsing.

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, session, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { watchGameForeground } = require("./game-window-policy.cjs");
const { createWindowGesture } = require("./window-gesture.cjs");
let gameForeground = false;
let stopForegroundWatch = null;
const Appearance = require("./renderer/appearance.js");
const FirstRunPolicy = require("./renderer/first-run-policy.js");
const { createSubmissionSounds } = require("./submission-sounds.cjs");
const { autoUpdater } = require("electron-updater");
const Analytics = require('./analytics.cjs');
let stopAnalytics = null;

app.setName("Dyrelog");

const CONFIG_PATH = path.join(app.getPath("userData"), "dyrelog-source.json");
const SETTINGS_PATH = path.join(app.getPath("userData"), "dyrelog-settings.json");
const WINDOW_PATH = path.join(app.getPath("userData"), "dyrelog-window.json");
const HISTORY_PATH = path.join(app.getPath("userData"), "dyrelog-history.json");
const MAX_HISTORY_ENCOUNTERS = 50;
const AUTH_PATH = path.join(app.getPath("userData"), "dyrelog-auth.json");
const API_BASE = "https://dyrelog-api.dyremoon.workers.dev";
const SITE_URL = "https://dyrelog.pages.dev"; // must match worker/wrangler.toml's SITE_URL — that's where a real login lands
const EQLOG_RE = /^eqlog_.+\.(txt|log)$/i;

const BASE_WIDTH = 320;
const BASE_HEIGHT = 420;
const MINI_WIDTH = 190;
const MINI_HEIGHT = 120;
const MIN_W = 170, MAX_W = 900, MIN_H = 56, MAX_H = 900;

const DEFAULT_SETTINGS = {
  opacity: 1,
  barHeight: 1,
  textScale: 1, // independent of barHeight — see "Text size" in Settings
  iconScale: 1,
  miniPetTextScale: 1, // mini mode's pet sub-line only — see "Mini pet text size" in Settings
  secondaryTextScale: 1,
  timerTextScale: 1, // fight timer (Bars) / circle timer ONLY — see "Timer Text Size" in Settings (item 10)
  theme: "blue",
  bgColor: null,
  textColor: null,




  secondaryTextColor: null,
  dpsTextColor: null,
  totalDpsColor: null, // the top-line/mini-bar total-damage figure's color — independent of dpsTextColor
  // Your own name's TEXT color specifically — independent of myBarColor
  // (which only colors the bar/dot, not the name string itself).
  myNameTextColor: null,
  petNameTextColor: null,
  myBarColor: null,
  petBarColor: null,
  borderColor: null,
  showPets: true,
  fontFamily: "fantasy",
  displayStyle: "bars",
  circleScale: 1,
  fadeIdleEnabled: false,
  fadeIdleSeconds: 10,
  fadeIdleOpacity: 0.15,
  classColorsEnabled: false,
  myClass: null,
  classColorOverrides: {},
  settingsTextScale: 1,
  keepInTrayOnClose: false,
  launchAtStartup: false,
  circleBgColor: null,
  circleBorderColor: null,
  circleTextColor: null,
  iconColor: null,
  iconAngles: {},
  autoSubmitMode: "ask",
  firstRunSetupComplete: false,
  autoSubmitChosen: false,










  cachedBossNames: [],
  cachedBossNamesAt: 0
};

let win = null;
let analysisWin = null;
let pendingAnalysisFightKey = null;
let leaderboardWin = null;
let settingsWin = null;
let setupWin = null;
let authWin = null;
let submitPopupWin = null;
let pendingSubmitPayload = null;
let pendingLoginSubmitPayload = null;
let tray = null;
let appIsQuitting = false;
let tailTimer = null;
let tailState = null;



let persistedHistory = loadHistory();
let lastKnownState = { current: null, encounters: persistedHistory.slice(), characterName: null, gapMs: 9000 };




let isMiniMode = false;
let isWatchMode = false;
let updateInfo = null;
const UPDATE_CHECK_URL = "https://api.github.com/repos/dyremoon/dyrelog/releases/latest";
const RELEASES_PAGE_URL = "https://github.com/dyremoon/dyrelog/releases/latest";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function parseVersionParts(v) {
  return String(v || "").trim().replace(/^v/i, "").split(".").map(function (n) { return parseInt(n, 10) || 0; });
}

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
    if (!res.ok) return;
    var data = await res.json();
    var tag = data && data.tag_name;
    if (!tag || !isNewerVersion(tag, app.getVersion())) return;
    updateInfo = { version: tag.replace(/^v/i, ""), url: RELEASES_PAGE_URL };
    if (win && !win.isDestroyed()) win.webContents.send("update-available", updateInfo);
  } catch (err) {
    // Offline, DNS hiccup, whatever — never worth surfacing to the player.
  }
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function sendUpdaterStatus(payload) {
  [win, settingsWin].forEach(function (w) {
    if (w && !w.isDestroyed()) w.webContents.send("updater-status", payload);
  });
}

autoUpdater.on("checking-for-update", function () {
  sendUpdaterStatus({ state: "checking" });
});
autoUpdater.on("update-available", function (info) {
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
    return null;
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function clearConfig() {
  try { fs.unlinkSync(CONFIG_PATH); } catch (err) {   }
}

function loadSettings() {
  return Appearance.migrate(loadJson(SETTINGS_PATH, DEFAULT_SETTINGS));
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function loadHistory() {
  try {
    var parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function saveHistory(encounters) {
  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(encounters.slice(-MAX_HISTORY_ENCOUNTERS)));
  } catch (err) {
    console.error("Failed to save encounter history:", err);
  }
}

function recordSubmission(startTime, submissionId, status, visibility) {
  if (startTime == null || submissionId == null) return;
  var enc = persistedHistory.find(function (e) { return e.startTime === startTime; });
  if (!enc) return;
  enc.submissionId = submissionId;
  enc.submissionStatus = status || null;
  enc.submissionVisibility = visibility || null;
  saveHistory(persistedHistory);
  broadcastHistoryState();
}

function broadcastHistoryState() {
  [analysisWin, leaderboardWin].forEach(function (w) {
    if (w && !w.isDestroyed()) w.webContents.send("state-update", lastKnownState);
  });
}

function loadAllWindowBounds() {
  try {
    var raw = JSON.parse(fs.readFileSync(WINDOW_PATH, "utf8"));
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

// Read live bounds after movement settles. Bars and Mini persist separate sizes; Circle sizing is transient.
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
  tailState = { filePath: filePath, offset: stat.size };
  if (win) win.webContents.send("source-status", { ok: true, filePath: filePath, fileName: path.basename(filePath) });

  tailTimer = setInterval(function () {
    fs.stat(filePath, function (err, st) {
      if (err || !tailState) return;
      if (st.size < tailState.offset) tailState.offset = 0;
      if (st.size <= tailState.offset) return;
      var stream = fs.createReadStream(filePath, { start: tailState.offset, end: st.size - 1, encoding: "utf8" });
      var chunks = [];
      stream.on("data", function (c) { chunks.push(c); });
      stream.on("end", function () {
        tailState.offset = st.size;
        if (win) win.webContents.send("log-chunk", chunks.join(""));
      });
      stream.on("error", function () {   });
    });
  }, 1000);
}

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
    alwaysOnTop: false,
    resizable: true,
    backgroundColor: "#00000000",
    icon: path.join(__dirname, "renderer", "tray-icon.png"),
    webPreferences: {
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(gameForeground, "floating");
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.on("blur", function () { windowGesture.cancel(); });

  win.webContents.on("before-input-event", function (event, input) {
    if (input.type === "keyDown" && input.key === "F12") win.webContents.toggleDevTools();
  });

  win.webContents.once("did-finish-load", function () {
    var cfg = loadConfig();
    if (cfg && cfg.path) startTailing(cfg.path);
    if (updateInfo) win.webContents.send("update-available", updateInfo);
  });

  win.on("moved", function () { schedulePersistBounds(); schedulePersistMiniBounds(); });

  win.on("close", function (evt) {
    if (appIsQuitting) return;
    evt.preventDefault();

    if (loadSettings().keepInTrayOnClose) {
      win.hide();
      ensureTray();
      return;
    }

    var choice = dialog.showMessageBoxSync(win, {
      type: "question",
      buttons: ["Exit", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Exit Dyrelog?",
      message: "Are you sure you want to exit Dyrelog?",
      noLink: true
    });
    if (choice !== 0) return;
    appIsQuitting = true;
    if (tray) { tray.destroy(); tray = null; }
    [setupWin, settingsWin, analysisWin, leaderboardWin, authWin, submitPopupWin].forEach(function (w) {
      if (w && !w.isDestroyed()) w.close();
    });
    win.close();
  });

  win.on("closed", function () { win = null; });
}

function ensureTray() {
  if (tray) return;
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
          [setupWin, settingsWin, analysisWin, leaderboardWin, authWin, submitPopupWin].forEach(function (w) {
            if (w && !w.isDestroyed()) w.close();
          });
          if (win) win.close();
        }
      }
    ])
  );
  tray.on("click", function () { if (win) { win.show(); win.focus(); } });
}

function createAnalysisWindow() {
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
    alwaysOnTop: false,
    title: "Dyrelog — Combat Analysis",
    backgroundColor: "#14120f",
    icon: path.join(__dirname, "renderer", "tray-icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  analysisWin.setAlwaysOnTop(gameForeground, "floating");
  analysisWin.setMenuBarVisibility(false);
  analysisWin.loadFile(path.join(__dirname, "renderer", "analysis.html"));
  analysisWin.webContents.on("before-input-event", function (event, input) {
    if (input.type === "keyDown" && input.key === "F12") analysisWin.webContents.toggleDevTools();
  });
  analysisWin.webContents.on("did-finish-load", function () {
    if (pendingAnalysisFightKey != null) {
      analysisWin.webContents.send("fight-picked", pendingAnalysisFightKey);
      pendingAnalysisFightKey = null;
    }
  });
  analysisWin.on("resize", schedulePersistAnalysisBounds);
  analysisWin.on("moved", schedulePersistAnalysisBounds);
  analysisWin.on("closed", function () { analysisWin = null; });
}

function createLeaderboardWindow() {
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
    alwaysOnTop: false,
    title: "Dyrelog — Leaderboards",
    backgroundColor: "#14120f",
    icon: path.join(__dirname, "renderer", "tray-icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  leaderboardWin.setAlwaysOnTop(gameForeground, "floating");
  leaderboardWin.setMenuBarVisibility(false);
  leaderboardWin.loadFile(path.join(__dirname, "renderer", "leaderboard.html"));
  leaderboardWin.webContents.on("before-input-event", function (event, input) {
    if (input.type === "keyDown" && input.key === "F12") leaderboardWin.webContents.toggleDevTools();
  });
  leaderboardWin.on("resize", schedulePersistLeaderboardBounds);
  leaderboardWin.on("moved", schedulePersistLeaderboardBounds);
  leaderboardWin.on("closed", function () { leaderboardWin = null; });
}

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
  [win, setupWin, settingsWin, analysisWin, leaderboardWin].forEach(function (w) {
    if (w && !w.isDestroyed()) w.webContents.send("auth-update", publicState);
  });
}

async function apiFetch(pathname, opts) {
  var auth = loadAuth();
  var headers = Object.assign({ "Content-Type": "application/json" }, (opts && opts.headers) || {});
  if (auth && auth.sessionCookie) headers.Cookie = "dyrelog_session=" + auth.sessionCookie;
  var res = await fetch(API_BASE + pathname, Object.assign({}, opts, { headers: headers }));
  if (res.status === 401) { saveAuth(null); broadcastAuthUpdate(null); }
  return res;
}

function openLoginWindow() {
  return new Promise(function (resolve) {
    if (authWin && !authWin.isDestroyed()) { authWin.focus(); resolve({ ok: false, alreadyOpen: true }); return; }

    var authSession = session.fromPartition("persist:dyrelog-auth");
    authWin = new BrowserWindow({
      width: 460,
      height: 640,
      title: "Log in with Discord",
      parent: setupWin || undefined,
      modal: !!setupWin,
      alwaysOnTop: false,
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
            if (pendingLoginSubmitPayload) {
              var resumePayload = pendingLoginSubmitPayload;
              pendingLoginSubmitPayload = null;
              beginSubmitFlow(resumePayload);
            }
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
      finish({ ok: false, cancelled: true });
    });
  });
}

function logout() {
  var auth = loadAuth();
  saveAuth(null);
  broadcastAuthUpdate(null);
  pendingLoginSubmitPayload = null;



  if (auth && auth.sessionCookie) {
    fetch(API_BASE + "/api/auth/logout", { method: "POST", headers: { Cookie: "dyrelog_session=" + auth.sessionCookie } }).catch(function () {});
  }
  session.fromPartition("persist:dyrelog-auth").clearStorageData().catch(function () {});
}

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
    alwaysOnTop: false,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  submitPopupWin.setAlwaysOnTop(gameForeground, "floating");
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

async function performSubmit(payload) {
  var submissionId = payload.existingSubmissionId;
  if (!submissionId) {
    var startRes = await apiFetch("/api/streams", {
      method: "POST",
      body: JSON.stringify({ characterName: payload.characterName, realm: payload.realm, soloMode: !!payload.soloMode })
    });
    var startBody = await startRes.json().catch(function () { return {}; });
    if (!startRes.ok) throw new Error(startBody.error || "Couldn't start the submission");
    submissionId = startBody.submissionId;
  }

  var chunk = payload.existingSubmissionId ? payload.finalChunk : payload.rawText;
  if (chunk) {
    var batchRes = await apiFetch("/api/streams/" + submissionId + "/batches", {
      method: "POST",
      body: JSON.stringify({ chunk: chunk })
    });
    if (!batchRes.ok) {
      var batchBody = await batchRes.json().catch(function () { return {}; });
      throw new Error(batchBody.error || "Couldn't upload the log");
    }
  }

  var finalizeRes = await apiFetch("/api/streams/" + submissionId + "/finalize", {
    method: "POST",
    body: JSON.stringify(payload.difficulty ? { difficulty: payload.difficulty } : {})
  });
  var finalizeBody = await finalizeRes.json().catch(function () { return {}; });
  if (!finalizeRes.ok) throw new Error(finalizeBody.error || "Couldn't finalize the submission");
  return finalizeBody;
}

ipcMain.handle("start-live-stream", async function (evt, payload) {
  if (!FirstRunPolicy.permitsSubmission(loadSettings())) return { ok: false, error: "submissions_disabled" };
  if (!loadAuth()) return { ok: false, error: "not_logged_in" };
  try {
    var res = await apiFetch("/api/streams", {
      method: "POST",
      body: JSON.stringify({ characterName: payload.characterName, realm: payload.realm, soloMode: !!payload.soloMode })
    });
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok) return { ok: false, error: body.error || "Couldn't start streaming" };
    return { ok: true, submissionId: body.submissionId };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle("push-live-batch", async function (evt, submissionId, chunk) {
  if (!chunk) return { ok: true };
  try {
    var res = await apiFetch("/api/streams/" + submissionId + "/batches", {
      method: "POST",
      body: JSON.stringify({ chunk: chunk })
    });
    if (!res.ok) {
      var body = await res.json().catch(function () { return {}; });
      return { ok: false, error: body.error || "Couldn't upload chunk" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle("login-with-discord", function () { return openLoginWindow(); });
ipcMain.handle("logout", function () { logout(); return { ok: true }; });
ipcMain.handle("get-submission-statuses", async function (_evt, ids) {
  if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) {
    return { ok: false };
  }
  var auth = loadAuth();
  if (!auth) return { ok: false };
  try {
    var res = await apiFetch("/api/me/submissions/status", {
      method: "POST", body: JSON.stringify({ submissionIds: ids }), signal: AbortSignal.timeout(10000)
    });
    var currentAuth = loadAuth();
    if (!res.ok || !currentAuth || currentAuth.sessionCookie !== auth.sessionCookie) return { ok: false };
    return { ok: true, submissions: (await res.json()).submissions };
  } catch (_err) { return { ok: false }; }
});
ipcMain.handle("get-auth-state", function () {
  var auth = loadAuth();
  return auth ? { username: auth.username, avatarUrl: auth.avatarUrl } : null;
});

function beginSubmitFlow(payload) {
  if (payload.mode === "auto") {
    sendToSubmitPopup("submit-popup:show", { pending: true, mobName: payload.mobName });
    performSubmit(payload).then(function (result) {
      recordSubmission(payload.startTime, result.submissionId, result.status, result.visibility);
      submissionSounds.notify(result);
      if (submitPopupWin && !submitPopupWin.isDestroyed()) submitPopupWin.webContents.send("submit-popup:result", { ok: true, status: result.status });
    }).catch(function (err) {
      if (submitPopupWin && !submitPopupWin.isDestroyed()) submitPopupWin.webContents.send("submit-popup:result", { ok: false, error: String((err && err.message) || err) });
    });
    return;
  }

  pendingSubmitPayload = payload;
  sendToSubmitPopup("submit-popup:show", { mobName: payload.mobName, dps: payload.dps, damage: payload.damage });
}

// Single entry point the mini-mode renderer calls for every eligible kill,
// regardless of which display mode (bars/mini/circle) it's currently in —
// app.js never calls this at all when autoSubmitMode is "off".
ipcMain.handle("request-submit", function (evt, payload) {
  if (!FirstRunPolicy.permitsSubmission(loadSettings())) return { ok: false, error: "submissions_disabled" };
  if (!loadAuth()) {
    pendingLoginSubmitPayload = payload;
    sendToSubmitPopup("submit-popup:show", { needsLogin: true });
    return { ok: false, error: "not_logged_in" };
  }

  beginSubmitFlow(payload);
  return { ok: true };
});

ipcMain.on("submit-popup:confirm", function () {
  if (!pendingSubmitPayload) return;
  var payload = pendingSubmitPayload;
  pendingSubmitPayload = null;
  if (submitPopupWin && !submitPopupWin.isDestroyed()) submitPopupWin.webContents.send("submit-popup:show", { pending: true, mobName: payload.mobName });
  performSubmit(payload).then(function (result) {
    recordSubmission(payload.startTime, result.submissionId, result.status, result.visibility);
      submissionSounds.notify(result);
    if (submitPopupWin && !submitPopupWin.isDestroyed()) submitPopupWin.webContents.send("submit-popup:result", { ok: true, status: result.status });
  }).catch(function (err) {
    if (submitPopupWin && !submitPopupWin.isDestroyed()) submitPopupWin.webContents.send("submit-popup:result", { ok: false, error: String((err && err.message) || err) });
  });
});

ipcMain.on("submit-popup:discard", function () {
  pendingSubmitPayload = null;
  pendingLoginSubmitPayload = null;
  if (submitPopupWin && !submitPopupWin.isDestroyed()) submitPopupWin.close();
});

function createSettingsWindow(initialTab) {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.close(); return; }
  var b = loadWindowBoundsFor("settings");
  settingsWin = new BrowserWindow({
    x: b ? b.x : undefined,
    y: b ? b.y : undefined,
    width: b ? Math.max(480, Math.round(b.width)) : 640,
    height: b ? Math.max(460, Math.round(b.height)) : 580,
    minWidth: 480,
    minHeight: 460,
    frame: true,
    alwaysOnTop: false,
    title: "Dyrelog Settings",
    backgroundColor: "#0e1015",
    icon: path.join(__dirname, "renderer", "tray-icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.setAlwaysOnTop(gameForeground, "floating");
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(
    path.join(__dirname, "renderer", "settings.html"),
    initialTab ? { search: "tab=" + encodeURIComponent(initialTab) } : undefined
  );
  settingsWin.webContents.on("before-input-event", function (event, input) {
    if (input.type === "keyDown" && input.key === "F12") settingsWin.webContents.toggleDevTools();
  });
  settingsWin.on("resize", schedulePersistSettingsBounds);
  settingsWin.on("moved", schedulePersistSettingsBounds);
  settingsWin.on("closed", function () { settingsWin = null; });
}

function showFirstRunSetup() {
  if (!FirstRunPolicy.needsSetup(loadSettings()) || setupWin) return;
  setupWin = new BrowserWindow({
    width: 560, height: 480, minWidth: 460, minHeight: 400,
    title: 'Welcome to Dyrelog', parent: win, modal: true,
    alwaysOnTop: gameForeground,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  setupWin.setMenuBarVisibility(false);
  setupWin.loadFile(path.join(__dirname, 'renderer', 'setup.html'));
  setupWin.on('closed', function() { setupWin = null; });
}

function syncAnalyticsConsent() {
  if (stopAnalytics) { stopAnalytics(); stopAnalytics = null; }
  if (!app.isPackaged || process.env.DYRELOG_DISABLE_ANALYTICS === '1' || !Analytics.hasConsent(loadSettings())) return;
  stopAnalytics = Analytics.startAnalytics({
    directory: app.getPath('userData'), version: app.getVersion(), platform: process.platform, apiBase: API_BASE,
    isAllowed: () => Analytics.hasConsent(loadSettings()),
  });
}

function saveAnalyticsConsent(enabled) {
  if (typeof enabled !== 'boolean') throw new Error('Choose whether to allow usage analytics.');
  const settings = loadSettings();
  settings.analyticsConsent = { version: Analytics.CONSENT_VERSION, enabled, decidedAt: new Date().toISOString() };
  saveSettings(settings);
  syncAnalyticsConsent();
  return settings;
}

async function showAnalyticsConsent() {
  const consent = loadSettings().analyticsConsent;
  if (consent?.version === Analytics.CONSENT_VERSION && typeof consent.enabled === 'boolean') return;
  if (!win || win.isDestroyed()) return;
  try {
    let result;
    do {
      result = await dialog.showMessageBox(win, {
        type: 'question', title: 'Usage statistics',
        message: 'Allow Usage Statistics?',
        detail: 'Help improve Dyrelog by sharing statistics using a random installation ID. No account identity, location, personal files, game data, or identifying data is are collected. Optional - change your choice in settings at any time. Thank you!',
        buttons: ['Allow', 'Learn More', 'No thanks'], defaultId: 0, cancelId: 2, noLink: true,
      });
      if (result.response === 1) {
        await dialog.showMessageBox(win, {
          type: 'info', title: 'About usage statistics', message: 'What you’re opting into',
          detail: 'If you allow it, Dyrelog sends a random installation ID, app version, and platform to Dyrelog’s Cloudflare-hosted service when the app starts and every 15 minutes while running, including idle time. Server observation dates are recorded. This helps measure active installations and supported versions.\n\nNo account identity, Windows username, machine name, hardware ID, location, game data, or personal files are sent by usage analytics. Dyrelog does not store IP addresses in analytics. The hosting provider processes normal network traffic. Records currently have no automatic expiry.\n\nYour choice does not affect app features. Change it any time in Settings → Options → Usage analytics. Turning it off stops future reports; it does not erase records already received.',
          buttons: ['Back'], defaultId: 0, cancelId: 0, noLink: true,
        });
      }
    } while (result.response === 1 && win && !win.isDestroyed());
    // A Settings choice made while the prompt is open takes precedence.
    const latest = loadSettings().analyticsConsent;
    if (latest?.version !== Analytics.CONSENT_VERSION || typeof latest.enabled !== 'boolean') saveAnalyticsConsent(result.response === 0);
  } catch { /* Consent failures leave reporting disabled. */ }
}

ipcMain.handle('set-analytics-consent', function(event, enabled) {
  if (!settingsWin || settingsWin.isDestroyed() || event.sender !== settingsWin.webContents) throw new Error('Open Settings to change analytics consent.');
  return saveAnalyticsConsent(enabled);
});

ipcMain.handle('complete-first-run', function(event, mode) {
  if (!setupWin || setupWin.isDestroyed() || event.sender !== setupWin.webContents) return { ok: false, error: 'Setup is not open.' };
  try {
    applySettingsPartial(FirstRunPolicy.completion(mode, !!loadAuth()));
    setupWin.close();
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

app.whenReady().then(function () {
  if (process.platform === 'win32') {
    stopForegroundWatch = watchGameForeground({
      appProcessId: process.pid,
      onChange(active) {
        gameForeground = active;
        BrowserWindow.getAllWindows().forEach(window => {
          if (!window.isDestroyed()) window.setAlwaysOnTop(active, 'floating');
        });
      },
      onError(message) { console.error('EverQuest foreground detection:', message); }
    });
  }
  createWindow();
  showFirstRunSetup();
  syncAnalyticsConsent();
  if (setupWin) setupWin.once('closed', () => { void showAnalyticsConsent(); });
  else void showAnalyticsConsent();
  setTimeout(checkForUpdates, 5000);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
});

app.on('before-quit', function () { if (stopForegroundWatch) stopForegroundWatch(); if (stopAnalytics) stopAnalytics(); });

app.on("window-all-closed", function () {
  stopTailing();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("get-saved-source", function () {
  return loadConfig();
});

// The Settings window's footer ("Dyrelog vX.Y.Z") — app.getVersion() reads
// straight from package.json's own "version" field, so there's nothing to
// keep in sync by hand; bumping that one number for a release is enough.
ipcMain.handle("get-app-version", function () {
  return app.getVersion();
});

ipcMain.handle("get-update-info", function () {
  return updateInfo;
});

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


const submissionSounds = createSubmissionSounds({
  userDir: app.getPath('userData'),
  presetDir: path.join(__dirname, 'renderer', 'sounds'),
  getSettings: loadSettings,
  saveSettings: applySettingsPartial,
  send: function(payload) { if (win && !win.isDestroyed()) win.webContents.send('submission-sound', payload); }
});
ipcMain.handle('get-submission-sounds', function() { return submissionSounds.list(); });
ipcMain.handle('pick-submission-sound', async function() {
  var picked = await dialog.showOpenDialog({ title: 'Choose submission sound', properties: ['openFile'], filters: [{ name: 'MP3 audio', extensions: ['mp3'] }] });
  if (picked.canceled || !picked.filePaths.length) return { cancelled: true };
  try { return { ok: true, settings: submissionSounds.importFile(picked.filePaths[0]) }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('preview-submission-sound', function() {
  try { return { ok: true, audio: submissionSounds.audio() }; }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle("get-settings", function () {
  return loadSettings();
});

function applySettingsPartial(partial) {
  partial = { ...partial };
  delete partial.analyticsConsent;
  var settings = Object.assign(loadSettings(), partial || {});
  saveSettings(settings);
  // Turning the tray toggle back off tears down the tray icon immediately
  // (not just next time the window closes) — otherwise it'd sit there
  // looking like it's still doing something.
  if (partial && partial.keepInTrayOnClose === false && tray) {
    tray.destroy();
    tray = null;
  }
  if (partial && "launchAtStartup" in partial) {
    try {
      app.setLoginItemSettings({ openAtLogin: !!partial.launchAtStartup });
    } catch (err) {
      console.error("Failed to update startup launch setting:", err);
    }
  }
  [win, analysisWin, leaderboardWin].forEach(function (w) {
    if (w && !w.isDestroyed()) w.webContents.send("settings-update", settings);
  });
  return settings;
}

ipcMain.handle("save-settings", function (evt, partial) {
  return applySettingsPartial(partial);
});

// Cursor coordinates come from Electron in desktop DIPs, including mixed-DPI monitors.
const windowGesture = createWindowGesture(() => win, () => screen.getCursorScreenPoint(),
  { minWidth: MIN_W, maxWidth: MAX_W, minHeight: MIN_H, maxHeight: MAX_H },
  () => { schedulePersistBounds(); schedulePersistMiniBounds(); });
['drag', 'resize'].forEach(function (kind) {
  ipcMain.on(kind + '-window', function (event, phase, axes) {
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
    windowGesture.handle(kind, phase, axes);
  });
});

ipcMain.handle("get-bounds", function () {
  return win ? win.getBounds() : { x: 0, y: 0, width: BASE_WIDTH, height: BASE_HEIGHT };
});

ipcMain.handle("set-bounds", function (evt, bounds, opts) {
  if (!win) return null;
  if (evt.sender !== win.webContents || windowGesture.isActive()) return win.getBounds();
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

ipcMain.handle("get-mini-size", function () {
  var saved = loadWindowBoundsFor("mini");
  return {
    width: saved ? clamp(Math.round(saved.width), MIN_W, MAX_W) : MINI_WIDTH,
    height: saved ? clamp(Math.round(saved.height), MIN_H, MAX_H) : MINI_HEIGHT
  };
});

ipcMain.on("set-mini-mode", function (evt, val) { isMiniMode = !!val; });
ipcMain.on("set-watch-mode", function (evt, val) { isWatchMode = !!val; });

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
    { label: "Switch to Bars", click: function () { applySettingsPartial({ displayStyle: "bars" }); } },
    { type: "separator" },
    { label: "Close Dyrelog", click: function () { win.close(); } }
  ]);
  menu.popup({ window: win });
});

ipcMain.on("window-close", function () { if (win) win.close(); });

ipcMain.on("open-analysis", function () { createAnalysisWindow(); });
ipcMain.on("open-analysis-fight", function (_event, key) {
  pendingAnalysisFightKey = String(key || '');
  if (!analysisWin || analysisWin.isDestroyed()) createAnalysisWindow();
  else analysisWin.webContents.send("fight-picked", pendingAnalysisFightKey);
});
ipcMain.on("open-leaderboard", function () { createLeaderboardWindow(); });
ipcMain.on("open-settings", function (evt, tab) { createSettingsWindow(tab); });
ipcMain.on("open-external", function (evt, url) {
  if (
    /^https:\/\/(dyrelog\.pages\.dev|dyrelog-api\.dyremoon\.workers\.dev|github\.com\/dyremoon\/dyrelog|eqlwiki\.com|eqlegends\.com|(www\.)?loadoutlegends\.com)/.test(
      url
    )
  ) {
    shell.openExternal(url);
  }
});

ipcMain.on("push-state", function (evt, data) {
  // Merge encounters by start time to preserve history from previous application sessions.
  if (data && Array.isArray(data.encounters)) {
    var knownStarts = {};
    persistedHistory.forEach(function (e) { knownStarts[e.startTime] = e; });
    var added = false;
    data.encounters.forEach(function (e) {
      if (!knownStarts[e.startTime]) {
        persistedHistory.push(e);
        knownStarts[e.startTime] = e;
        added = true;
      } else if ((e.petAttributionRevision || 0) > (knownStarts[e.startTime].petAttributionRevision || 0)) {
        Object.assign(knownStarts[e.startTime], e);
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
  broadcastHistoryState();
});
ipcMain.handle("get-state", function () {
  return lastKnownState;
});
