const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseReleaseNotes } = require('../renderer/release-notes.js');

test('real release notes show headings and items without Markdown marks or install steps', () => {
  const body = fs.readFileSync(path.join(__dirname, '../../docs/release-notes/v0.1.22.md'), 'utf8');
  const items = parseReleaseNotes(body);
  assert.deepEqual(items[0], { kind: 'intro', text: 'Save and share your look.' });
  assert.deepEqual(items.filter((i) => i.kind === 'heading').map((i) => i.text), ["What's new", 'Fixes and polish']);
  assert.ok(items.every((i) => !/\*\*|`/.test(i.text)), 'no leftover ** or backticks');
  assert.ok(items.some((i) => i.kind === 'item' && i.text.startsWith('Presets. In Settings')));
  assert.ok(!items.some((i) => /How to install|Dyrelog-Setup/.test(i.text)), 'install instructions are left out');
});

test('older plain release notes still work', () => {
  const items = parseReleaseNotes('Fixed a bug.\n- Faster start\n* Smaller installer\n<p>From HTML</p>');
  assert.deepEqual(items.map((i) => i.text), ['Fixed a bug.', 'Faster start', 'Smaller installer', 'From HTML']);
  assert.deepEqual(parseReleaseNotes(''), []);
  assert.deepEqual(parseReleaseNotes(null), []);
});

test('checking for updates in Settings never installs until the player chooses to', () => {
  const src = fs.readFileSync(path.join(__dirname, '../renderer/settings.js'), 'utf8');
  const available = src.slice(src.indexOf('function renderAvailable'), src.indexOf('function renderDownloading'));
  assert.ok(available.includes('Install and restart'));
  const beforeClick = available.slice(0, available.indexOf('addEventListener("click"'));
  assert.ok(!beforeClick.includes('downloadAndInstallUpdate'), 'no download until the button is clicked');
  const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  assert.match(main, /autoUpdater\.autoDownload = false;/);
});
