// Crash-safe JSON persistence: write to a temp file, fsync, then rename over the original.
const fs = require('node:fs');

function tryParse(file) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    return { ok: false, missing: err && err.code === 'ENOENT' };
  }
}

// Returns the parsed file, falling back to the last good backup, or undefined.
function readJson(file) {
  const main = tryParse(file);
  if (main.ok) return main.value;
  const backup = tryParse(file + '.bak');
  if (backup.ok) return backup.value;
  if (!main.missing) console.error('Ignoring unreadable file:', file);
  return undefined;
}

function renameWithRetry(from, to) {
  let lastErr;
  // Windows antivirus/indexers can briefly lock the target file.
  for (let i = 0; i < 4; i++) {
    try { fs.renameSync(from, to); return; } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

function writeJsonAtomic(file, value, space) {
  const text = JSON.stringify(value, null, space);
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (tryParse(file).ok) {
    try { fs.copyFileSync(file, file + '.bak'); } catch (_err) { /* backup is best effort */ }
  }
  try {
    renameWithRetry(tmp, file);
  } catch (err) {
    fs.writeFileSync(file, text);
    try { fs.unlinkSync(tmp); } catch (_err) { /* already gone */ }
  }
}

function removeJson(file) {
  for (const f of [file, file + '.bak', file + '.tmp']) {
    try { fs.unlinkSync(f); } catch (_err) { /* not present */ }
  }
}

module.exports = { readJson, writeJsonAtomic, removeJson };
