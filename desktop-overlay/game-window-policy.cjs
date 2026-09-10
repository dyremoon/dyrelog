const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

function nextGameContext(previous, foreground, appProcessId) {
  if (foreground.pid === appProcessId) return previous;
  return /^(eqgame|eqgame64|everquest)$/i.test(foreground.name);
}

function watchGameForeground({ appProcessId, onChange, onError }) {
  let context = false;
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'foreground-watch.ps1').replace(/\.asar([\\/])/g, '.asar.unpacked$1')], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    const [pid, name = ''] = line.split('|');
    const next = nextGameContext(context, { pid: Number(pid), name }, appProcessId);
    if (next !== context) { context = next; onChange(next); }
  });
  let errorText = '';
  child.stderr.on('data', data => { errorText = (errorText + data).slice(-2000); });
  child.on('error', err => { onChange(false); onError(err.message); });
  child.on('exit', code => {
    onChange(false);
    if (code) onError(errorText || 'Foreground monitor stopped.');
  });
  return () => { lines.close(); child.kill(); };
}

module.exports = { nextGameContext, watchGameForeground };
