const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

const GAME_PROCESS = /^(eqgame|eqgame64|everquest)$/i;

// Electron's "floating" level parks windows just below the Windows taskbar, and Windows drops the taskbar
// beneath a borderless-fullscreen game while it's active, so the overlay would sink under EverQuest.
// Levels from "pop-up-menu" up stay above the taskbar.
const OVERLAY_LEVEL = 'screen-saver';
// Windows reorders the taskbar and the game's window just after activation; raising again once it settles.
const RAISE_AGAIN_MS = 300;

function nextGameContext(previous, foreground, appProcessId) {
  if (foreground.pid === appProcessId) return previous;
  return GAME_PROCESS.test(foreground.name);
}

// Keeps Dyrelog's windows above EverQuest while it's active. raise also moves them to the top of the
// z-order, for when the game was just activated and may have been placed above them.
function applyGameContext(windows, active, { raise = false } = {}) {
  windows.forEach((window) => {
    if (!window || window.isDestroyed()) return;
    window.setAlwaysOnTop(active, OVERLAY_LEVEL);
    if (active && raise && window.isVisible()) window.moveTop();
  });
}

// onChange(active) when EverQuest gains or loses the foreground; onGameActivated() every time EverQuest
// becomes the foreground window, including when the overlay was already on top.
function createForegroundTracker({ appProcessId, onChange, onGameActivated = () => {} }) {
  let context = false;
  return {
    // One "pid|processName" line from foreground-watch.ps1.
    line(text) {
      const [pid, name = ''] = String(text).split('|');
      const foreground = { pid: Number(pid), name };
      const next = nextGameContext(context, foreground, appProcessId);
      if (next !== context) { context = next; onChange(next); }
      if (foreground.pid !== appProcessId && GAME_PROCESS.test(name)) onGameActivated();
    },
    stop() {
      if (context) { context = false; onChange(false); }
    },
  };
}

function watchGameForeground({ appProcessId, onChange, onGameActivated, onError }) {
  const tracker = createForegroundTracker({ appProcessId, onChange, onGameActivated });
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'foreground-watch.ps1').replace(/\.asar([\\/])/g, '.asar.unpacked$1')], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', tracker.line);
  let errorText = '';
  child.stderr.on('data', data => { errorText = (errorText + data).slice(-2000); });
  child.on('error', err => { tracker.stop(); onError(err.message); });
  child.on('exit', code => {
    tracker.stop();
    if (code) onError(errorText || 'Foreground monitor stopped.');
  });
  return () => { lines.close(); child.kill(); };
}

module.exports = { nextGameContext, applyGameContext, createForegroundTracker, watchGameForeground, OVERLAY_LEVEL, RAISE_AGAIN_MS };
