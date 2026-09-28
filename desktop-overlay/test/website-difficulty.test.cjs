const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filterDifficulty, sort } = require('../../frontend/js/leaderboard-sort.js');

test('difficulty filtering includes untiered kills as D0 and restores every row with All', () => {
  const rows = [{ difficulty: null, dps: 200 }, { difficulty: 'D0', dps: 100 }, { difficulty: 'D4', dps: 300 }];
  assert.equal(filterDifficulty(rows, 'D0').length, 2);
  assert.deepEqual(filterDifficulty(rows, 'D1'), []);
  assert.equal(filterDifficulty(rows, '').length, 3);
  assert.deepEqual(sort(filterDifficulty(rows, 'D0'), { key: 'dps', dir: -1 }).map(r => r.dps), [200, 100]);
  assert.equal(rows.length, 3);
});

test('player names link to the public player page and are escaped', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const ctx = { window: { location: { pathname: '/', search: '' }, history: {} }, document: { addEventListener() {}, querySelector: () => null, getElementById: () => null } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../frontend/js/app.js'), 'utf8'), ctx);
  assert.equal(ctx.playerLink({ character_id: 7, character_name: 'Dyremoon', realm: 'freeport' }),
    '<a href="./player.html?id=7">Dyremoon</a> <span class="muted">(freeport)</span>');
  const bad = ctx.playerLink({ character_id: '7"><script>', character_name: '<b>x</b>', realm: 'r' });
  assert.ok(!bad.includes('<a ') && !bad.includes('<b>'), 'no link for a non-numeric ID, and names are escaped');
});
