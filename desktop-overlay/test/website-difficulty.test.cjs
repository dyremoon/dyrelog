const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filterDifficulty, sort } = require('../../frontend/js/leaderboard-sort.js');

test('difficulty filtering includes Base as D0 and restores every row with All', () => {
  const rows = [{ difficulty: null, dps: 200 }, { difficulty: 'D0', dps: 100 }, { difficulty: 'D4', dps: 300 }];
  assert.equal(filterDifficulty(rows, 'D0').length, 2);
  assert.deepEqual(filterDifficulty(rows, 'D1'), []);
  assert.equal(filterDifficulty(rows, '').length, 3);
  assert.deepEqual(sort(filterDifficulty(rows, 'D0'), { key: 'dps', dir: -1 }).map(r => r.dps), [200, 100]);
  assert.equal(rows.length, 3);
});
