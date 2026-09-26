const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { readJson, writeJsonAtomic, removeJson } = require('../json-store.cjs');
const { createLogTailer } = require('../log-tailer.cjs');
const { isAllowedExternalUrl, isAllowedAuthNavigation } = require('../link-policy.cjs');

const mainSource = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'dyrelog-test-')); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

test('external links: exact hosts only, https only, repo path checked', () => {
  for (const ok of [
    'https://dyrelog.pages.dev/', 'https://dyrelog.pages.dev/profile.html?submissionId=4',
    'https://github.com/dyremoon/dyrelog', 'https://github.com/dyremoon/dyrelog/issues/new',
    'https://github.com/dyremoon/dyrelog/releases/latest', 'https://eqlwiki.com/index.php?search=Lady%20Vox',
    'https://eqlegends.com/wiki', 'https://www.loadoutlegends.com', 'https://dyrelog-api.dyremoon.workers.dev/api/auth/login',
  ]) assert.ok(isAllowedExternalUrl(ok), ok);
  for (const bad of [
    'https://dyrelog.pages.dev.evil.com/', 'https://github.com/dyremoon/dyrelog-anything', 'https://github.com/dyremoon/other',
    'http://dyrelog.pages.dev/', 'https://evil.com/?https://dyrelog.pages.dev', 'https://user@dyrelog.pages.dev/',
    'https://dyrelog.pages.dev:8443/', 'file:///C:/Windows/system32/calc.exe', 'javascript:alert(1)', '', null, 42,
    'https://eqlwiki.com.evil.net/',
  ]) assert.ok(!isAllowedExternalUrl(bad), String(bad));
});

test('login window may only visit Discord, the API and the site', () => {
  assert.ok(isAllowedAuthNavigation('https://discord.com/oauth2/authorize?client_id=1'));
  assert.ok(isAllowedAuthNavigation('https://discord.com/login?redirect_to=x'));
  assert.ok(isAllowedAuthNavigation('https://dyrelog-api.dyremoon.workers.dev/api/auth/callback?code=1'));
  assert.ok(isAllowedAuthNavigation('https://dyrelog.pages.dev/'));
  assert.ok(!isAllowedAuthNavigation('https://discord.com.evil.io/'));
  assert.ok(!isAllowedAuthNavigation('http://discord.com/'));
  assert.ok(!isAllowedAuthNavigation('https://example.com/'));
});

test('json store writes atomically, keeps a backup and survives a corrupted file', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'settings.json');
  assert.equal(readJson(file), undefined);
  writeJsonAtomic(file, { a: 1 });
  writeJsonAtomic(file, { a: 2 });
  assert.deepEqual(readJson(file), { a: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')), { a: 1 });
  assert.ok(!fs.existsSync(file + '.tmp'));
  fs.writeFileSync(file, '{"a": 3, "trunc');
  assert.deepEqual(readJson(file), { a: 1 }, 'falls back to the last good backup');
  writeJsonAtomic(file, { a: 4 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')), { a: 1 }, 'a corrupt file never replaces the backup');
  removeJson(file);
  assert.ok(!fs.existsSync(file) && !fs.existsSync(file + '.bak'));
});

test('main.js persists every settings/history/auth/window file through the atomic store', () => {
  assert.ok(!/fs\.writeFileSync\((CONFIG|SETTINGS|WINDOW|HISTORY|AUTH)_PATH/.test(mainSource));
  for (const call of ['writeJsonAtomic(CONFIG_PATH', 'writeJsonAtomic(SETTINGS_PATH', 'writeJsonAtomic(HISTORY_PATH', 'writeJsonAtomic(AUTH_PATH', 'writeJsonAtomic(WINDOW_PATH']) {
    assert.ok(mainSource.includes(call), call);
  }
});

test('log tailer waits for a missing file, then reads it from the start once it appears', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'eqlog_Tester_legends.txt');
  const chunks = [], statuses = [];
  const tailer = createLogTailer({ filePath: file, intervalMs: 20, onChunk: c => chunks.push(c), onStatus: s => statuses.push(s) });
  await wait(60);
  assert.deepEqual(statuses[0], { ok: false, waiting: true });
  assert.equal(statuses.length, 1, 'waiting is reported once, not every poll');
  fs.writeFileSync(file, 'line one\n');
  await wait(100);
  fs.appendFileSync(file, 'line two\n');
  await wait(100);
  tailer.stop();
  assert.ok(statuses.some(s => s.ok), 'reports ok once the file exists');
  assert.equal(chunks.join(''), 'line one\nline two\n');
});

test('log tailer skips history already in the file and never overlaps reads', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'eqlog_Tester_legends.txt');
  fs.writeFileSync(file, 'old history\n');
  let active = 0, maxActive = 0;
  const fsImpl = {
    stat: fs.stat,
    createReadStream(p, opts) {
      active++; maxActive = Math.max(maxActive, active);
      const real = fs.createReadStream(p, opts);
      const slow = new EventEmitter();
      const data = [];
      real.on('data', c => data.push(c));
      real.on('end', () => setTimeout(() => { data.forEach(c => slow.emit('data', c)); active--; slow.emit('end'); }, 80));
      return slow;
    },
  };
  const chunks = [];
  const tailer = createLogTailer({ filePath: file, intervalMs: 10, fsImpl, onChunk: c => chunks.push(c), onStatus() {} });
  await wait(30);
  fs.appendFileSync(file, 'new 1\n');
  await wait(30);
  fs.appendFileSync(file, 'new 2\n');
  await wait(300);
  tailer.stop();
  assert.equal(maxActive, 1);
  assert.equal(chunks.join(''), 'new 1\nnew 2\n');
});

test('a stopped tailer never delivers a late read (switching files cannot leak old data)', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'a.txt');
  fs.writeFileSync(file, '');
  let release;
  const fsImpl = {
    stat: fs.stat,
    createReadStream(p, opts) {
      const e = new EventEmitter();
      release = () => { e.emit('data', fs.readFileSync(p).subarray(opts.start, opts.end + 1)); e.emit('end'); };
      return e;
    },
  };
  const chunks = [];
  const tailer = createLogTailer({ filePath: file, intervalMs: 10, fsImpl, onChunk: c => chunks.push(c), onStatus() {} });
  await wait(20);
  fs.appendFileSync(file, 'from file A\n');
  await wait(40);
  tailer.stop();
  release();
  assert.deepEqual(chunks, []);
});

test('update quit path: before-quit and update-downloaded both bypass the exit prompt', () => {
  assert.match(mainSource, /app\.on\('before-quit', function \(\) \{\s*appIsQuitting = true;/);
  const downloaded = mainSource.slice(mainSource.indexOf('autoUpdater.on("update-downloaded"'), mainSource.indexOf('function isPlainObject'));
  assert.ok(downloaded.indexOf('appIsQuitting = true') !== -1 && downloaded.indexOf('appIsQuitting = true') < downloaded.indexOf('quitAndInstall'));
  assert.equal((mainSource.match(/quitAndInstall\(/g) || []).length, 1, 'only one install path to audit');
});

test('single instance lock focuses the existing window', () => {
  assert.match(mainSource, /app\.requestSingleInstanceLock\(\)/);
  const handler = mainSource.slice(mainSource.indexOf('app.on("second-instance"'), mainSource.indexOf('app.whenReady()'));
  for (const call of ['restore()', 'show()', 'focus()']) assert.ok(handler.includes(call), call);
  assert.match(mainSource, /app\.whenReady\(\)\.then\(function \(\) \{\s*if \(!hasInstanceLock\) return;/);
});

test('navigation guard and window-open handler are installed for every window', () => {
  const guard = mainSource.slice(mainSource.indexOf('app.on("web-contents-created"'));
  assert.ok(guard.includes('setWindowOpenHandler'));
  assert.ok(guard.includes('will-navigate'));
  assert.ok(guard.includes('isAllowedAuthNavigation'));
  assert.ok(!/\/\^https:\\\/\\\/\(dyrelog/.test(mainSource), 'old prefix regex is gone');
});

test('update polling is hourly and first check runs a few seconds after launch', () => {
  assert.match(mainSource, /UPDATE_CHECK_INTERVAL_MS = 60 \* 60 \* 1000/);
  assert.match(mainSource, /setTimeout\(checkForUpdates, 5000\)/);
});

test('version comparison handles v-prefixes and multi-digit parts', () => {
  const start = mainSource.indexOf('function parseVersionParts');
  const end = mainSource.indexOf('async function checkForUpdates');
  const ctx = {};
  vm.runInNewContext(mainSource.slice(start, end), ctx);
  assert.equal(ctx.isNewerVersion('v0.1.17', '0.1.16'), true);
  assert.equal(ctx.isNewerVersion('v0.1.10', '0.1.9'), true);
  assert.equal(ctx.isNewerVersion('0.1.17', '0.1.17'), false);
  assert.equal(ctx.isNewerVersion('v0.1.7', '0.1.17'), false);
  assert.equal(ctx.isNewerVersion('v0.2.0', '0.1.99'), true);
});

test('use-folder-file only accepts a log the folder picker itself returned', () => {
  const handler = mainSource.slice(mainSource.indexOf('ipcMain.handle("use-folder-file"'), mainSource.indexOf('ipcMain.handle("clear-source"'));
  assert.ok(handler.includes('lastPickedFolder.matches.indexOf(fileName) === -1'));
  assert.ok(handler.includes('EQLOG_RE.test'));
});

test('public clone fallback: parser sync works without the private worker folder', () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'desktop-overlay', 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'desktop-overlay', 'renderer'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'frontend', 'js'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../scripts/sync-eqp-core.js'), path.join(dir, 'desktop-overlay', 'scripts', 'sync-eqp-core.js'));
  fs.writeFileSync(path.join(dir, 'desktop-overlay', 'renderer', 'boss-browser.js'), '// boss');
  fs.writeFileSync(path.join(dir, 'frontend', 'js', 'eqp-core.js'), 'var EQP = 1;\n');
  require('node:child_process').execFileSync(process.execPath, [path.join(dir, 'desktop-overlay', 'scripts', 'sync-eqp-core.js')]);
  assert.equal(fs.readFileSync(path.join(dir, 'desktop-overlay', 'renderer', 'eqp-core.js'), 'utf8'), 'var EQP = 1;\n');
});

test('package.json has a public description and ships the new main-process modules', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  assert.ok(!/README art spec/i.test(pkg.description));
  assert.match(pkg.description, /EverQuest Legends/);
  for (const f of ['json-store.cjs', 'log-tailer.cjs', 'link-policy.cjs']) assert.ok(pkg.build.files.includes(f), f);
  assert.equal(pkg.build.artifactName, '${productName}-Setup-${version}.${ext}');
});
