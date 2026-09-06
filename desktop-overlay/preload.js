// Narrow, explicit bridge between the sandboxed renderer and main — the
// renderer never gets direct fs/dialog/shell access, only these specific
// calls. Shared by every window this app opens (mini-mode, Analysis,
// Leaderboards, Settings) — a given window just never calls the APIs it
// has no use for.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dyrelog", {
  // log source
  pickFile: () => ipcRenderer.invoke("pick-file"),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  useFolderFile: (dir, fileName) => ipcRenderer.invoke("use-folder-file", dir, fileName),
  getSavedSource: () => ipcRenderer.invoke("get-saved-source"),
  clearSource: () => ipcRenderer.invoke("clear-source"),
  onLogChunk: (cb) => ipcRenderer.on("log-chunk", (_evt, text) => cb(text)),
  onSourceStatus: (cb) => ipcRenderer.on("source-status", (_evt, status) => cb(status)),

  // settings — the Settings window (renderer/settings.js) is where all of
  // these live; the mini-mode card only ever calls saveSettings() itself
  // for its one first-run auto-submit row (see app.js), and otherwise just
  // listens with onSettingsUpdate(), fed by main.js's broadcast after
  // every save — see save-settings in main.js.
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (partial) => ipcRenderer.invoke("save-settings", partial),
  onSettingsUpdate: (cb) => ipcRenderer.on("settings-update", (_evt, settings) => cb(settings)),
  // Settings window footer only — see get-app-version in main.js.
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  // "when I send updates, the overlay should inform the user to update" —
  // getUpdateInfo() covers a window that opened after the check already
  // found something; onUpdateAvailable() covers the live push the instant
  // a periodic check finds one. See checkForUpdates() in main.js.
  getUpdateInfo: () => ipcRenderer.invoke("get-update-info"),
  onUpdateAvailable: (cb) => ipcRenderer.on("update-available", (_evt, info) => cb(info)),
  // Real check/download/relaunch flow for Settings > What's New's own
  // "Check for updates" / "Update now and relaunch" buttons — a separate,
  // heavier mechanism from the read-only banner above (electron-updater,
  // not the GitHub API poll). See the "updater-status" events in main.js
  // for every state this can report (checking/available/up-to-date/
  // downloading/ready/error/dev-mode).
  checkForUpdatesNow: () => ipcRenderer.invoke("check-for-updates-now"),
  downloadAndInstallUpdate: () => ipcRenderer.invoke("download-and-install-update"),
  onUpdaterStatus: (cb) => ipcRenderer.on("updater-status", (_evt, payload) => cb(payload)),

  // window bounds — mini-mode toggle and the manual corner/edge resize
  // handles both go through these two calls (see renderer/app.js). opts
  // is optional ({ persist: false } is what the mini-mode toggle passes
  // so its tiny bounds never get written as if they were your real window
  // size — see set-bounds in main.js).
  getBounds: () => ipcRenderer.invoke("get-bounds"),
  setBounds: (bounds, opts) => ipcRenderer.invoke("set-bounds", bounds, opts),
  getMiniSize: () => ipcRenderer.invoke("get-mini-size"),
  setMiniMode: (isMini) => ipcRenderer.send("set-mini-mode", isMini),
  // Watch mode (item 8) forces a fixed small square while active — this is
  // the same "don't persist this transient forced size as the user's real
  // window size" flag setMiniMode used to guard, just its own separate one
  // (see isWatchMode in main.js).
  setWatchMode: (isWatch) => ipcRenderer.send("set-watch-mode", isWatch),

  // window controls
  close: () => ipcRenderer.send("window-close"),

  // secondary windows
  openAnalysis: () => ipcRenderer.send("open-analysis"),
  openLeaderboard: () => ipcRenderer.send("open-leaderboard"),
  openSettings: () => ipcRenderer.send("open-settings"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  // Circle display style's escape-hatch menu (Settings/Analysis/
  // Leaderboards/Switch to Bars/Close) — see showWatchMenu() in main.js
  // and its click/right-click/gear-button wiring in app.js.
  showWatchMenu: () => ipcRenderer.send("show-watch-menu"),

  // state relay: the mini-mode window pushes its computed stats out on
  // every render tick; the Analysis window reads the latest snapshot on
  // load and then listens for live updates.
  pushState: (data) => ipcRenderer.send("push-state", data),
  getState: () => ipcRenderer.invoke("get-state"),
  onStateUpdate: (cb) => ipcRenderer.on("state-update", (_evt, data) => cb(data))
});
