const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dyrelog", {
  getSubmissionSounds: () => ipcRenderer.invoke('get-submission-sounds'),
  pickSubmissionSound: () => ipcRenderer.invoke('pick-submission-sound'),
  previewSubmissionSound: () => ipcRenderer.invoke('preview-submission-sound'),
  onSubmissionSound: (cb) => ipcRenderer.on('submission-sound', (_evt, audio) => cb(audio)),
  pickFile: () => ipcRenderer.invoke("pick-file"),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  useFolderFile: (dir, fileName) => ipcRenderer.invoke("use-folder-file", dir, fileName),
  getSavedSource: () => ipcRenderer.invoke("get-saved-source"),
  clearSource: () => ipcRenderer.invoke("clear-source"),
  onLogChunk: (cb) => ipcRenderer.on("log-chunk", (_evt, text) => cb(text)),
  onSourceStatus: (cb) => ipcRenderer.on("source-status", (_evt, status) => cb(status)),

  completeFirstRun: (mode) => ipcRenderer.invoke('complete-first-run', mode),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setAnalyticsConsent: (enabled) => ipcRenderer.invoke('set-analytics-consent', enabled),
  saveSettings: (partial) => ipcRenderer.invoke("save-settings", partial),
  onSettingsUpdate: (cb) => ipcRenderer.on("settings-update", (_evt, settings) => cb(settings)),
  // Settings window footer only — see get-app-version in main.js.
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getReleaseNotes: () => ipcRenderer.invoke("get-release-notes"),
  getUpdateInfo: () => ipcRenderer.invoke("get-update-info"),
  onUpdateAvailable: (cb) => ipcRenderer.on("update-available", (_evt, info) => cb(info)),
  checkForUpdatesNow: () => ipcRenderer.invoke("check-for-updates-now"),
  downloadAndInstallUpdate: () => ipcRenderer.invoke("download-and-install-update"),
  onUpdaterStatus: (cb) => ipcRenderer.on("updater-status", (_evt, payload) => cb(payload)),

  dragWindow: (phase) => ipcRenderer.send('drag-window', phase),
  resizeWindow: (phase, axes) => ipcRenderer.send('resize-window', phase, axes),
  getBounds: () => ipcRenderer.invoke("get-bounds"),
  setBounds: (bounds, opts) => ipcRenderer.invoke("set-bounds", bounds, opts),
  getMiniSize: () => ipcRenderer.invoke("get-mini-size"),
  setMiniMode: (isMini) => ipcRenderer.send("set-mini-mode", isMini),
  setWatchMode: (isWatch) => ipcRenderer.send("set-watch-mode", isWatch),

  close: () => ipcRenderer.send("window-close"),

  openAnalysis: () => ipcRenderer.send("open-analysis"),
  openAnalysisFight: (key) => ipcRenderer.send("open-analysis-fight", key),
  openLeaderboard: () => ipcRenderer.send("open-leaderboard"),
  openSettings: (tab) => ipcRenderer.send("open-settings", tab),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  showWatchMenu: (sessions) => ipcRenderer.send("show-watch-menu", sessions),
  onFightPicked: (cb) => ipcRenderer.on("fight-picked", (_evt, key) => cb(key)),

  pushState: (data) => ipcRenderer.send("push-state", data),
  getState: () => ipcRenderer.invoke("get-state"),
  onStateUpdate: (cb) => ipcRenderer.on("state-update", (_evt, data) => cb(data)),

  loginWithDiscord: () => ipcRenderer.invoke("login-with-discord"),
  logout: () => ipcRenderer.invoke("logout"),
  getAuthState: () => ipcRenderer.invoke("get-auth-state"),
  getSubmissionStatuses: (submissionIds) => ipcRenderer.invoke("get-submission-statuses", submissionIds),
  onAuthUpdate: (cb) => ipcRenderer.on("auth-update", (_evt, authState) => cb(authState)),

  requestSubmit: (payload) => ipcRenderer.invoke("request-submit", payload),
  startLiveStream: (payload) => ipcRenderer.invoke("start-live-stream", payload),
  pushLiveBatch: (submissionId, chunk) => ipcRenderer.invoke("push-live-batch", submissionId, chunk),

  // submit-popup window only (renderer/submit-popup.js).
  onSubmitPopupShow: (cb) => ipcRenderer.on("submit-popup:show", (_evt, payload) => cb(payload)),
  onSubmitPopupResult: (cb) => ipcRenderer.on("submit-popup:result", (_evt, result) => cb(result)),
  confirmSubmit: () => ipcRenderer.send("submit-popup:confirm"),
  discardSubmit: () => ipcRenderer.send("submit-popup:discard")
});
