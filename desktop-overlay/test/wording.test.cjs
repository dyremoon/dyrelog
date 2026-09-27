// Keeps the app and website using the same player-facing words.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const files = [
  ...fs.readdirSync(path.join(root, 'desktop-overlay', 'renderer')).filter((f) => /\.(html|js)$/.test(f) && f !== 'eqp-core.js').map((f) => path.join(root, 'desktop-overlay', 'renderer', f)),
  ...fs.readdirSync(path.join(root, 'frontend')).filter((f) => f.endsWith('.html') && f !== 'admin.html').map((f) => path.join(root, 'frontend', f)),
  path.join(root, 'frontend', 'js', 'app.js'),
  path.join(root, 'desktop-overlay', 'main.js'),
];
const text = files.map((f) => [path.relative(root, f), fs.readFileSync(f, 'utf8')]);

function assertNone(pattern, why) {
  const hits = text.filter(([, s]) => pattern.test(s)).map(([f]) => f);
  assert.deepEqual(hits, [], why);
}

test('no-difficulty kills are called "D0", the community name, never "Base"', () => {
  assertNone(/['">]Base['"<]|D4 to Base/, 'the no-difficulty tier is shown as D0');
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'frontend', 'js', 'leaderboard-sort.js'), 'utf8'), ctx);
  const sort = ctx.LeaderboardSort || ctx.window.LeaderboardSort;
  if (sort && sort.difficultyFilter) {
    const html = sort.difficultyFilter('');
    assert.match(html, />D0</);
    assert.doesNotMatch(html, />Base</);
  }
});

test('one name for each thing', () => {
  assertNone(/Minimal-Mode|Minimal Mode/, 'the small style is "Mini"');
  assertNone(/Sign in with Discord|Sign-in cancelled/, 'use "Log in"');
  assertNone(/[Uu]sage analytics/, 'players see "usage statistics"');
  assertNone(/leaderboard API|reach the API/, 'players see "the Dyrelog server"');
  assertNone(/mini-mode overlay/, 'the window is "the meter"');
});
