const { test } = require('node:test');
const assert = require('node:assert/strict');
const { groupBosses, rankRows } = require('../renderer/boss-browser.js');
test('boss picker merges difficulty and spacing variants without losing tier IDs', () => {
  const groups = groupBosses([{ id: 1, name: 'Cazic Thule', difficulty: null }, { id: 2, name: 'Cazic-Thule', difficulty: 'D4' }]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].tiers.map(b => b.id), [1, 2]);
});
test('boss rows filter across tiers and sort numerically by DPS or difficulty', () => {
  const rows = [{ difficulty: 'D0', dps: 900 }, { difficulty: 'D4', dps: 200 }, { difficulty: 'D2', dps: 500 }];
  assert.deepEqual(rankRows(rows, ['D0', 'D1', 'D2', 'D3', 'D4'], 'dps').map(r => r.dps), [900, 500, 200]);
  assert.deepEqual(rankRows(rows, ['D0', 'D2', 'D4'], 'difficulty').map(r => r.difficulty), ['D4', 'D2', 'D0']);
  assert.deepEqual(rankRows(rows, ['D0', 'D4'], 'dps').map(r => r.dps), [900, 200]);
  assert.equal(rankRows(rows, ['D4'], 'dps').length, 1);
  assert.equal(rankRows(rows, ['D3'], 'dps').length, 0);
  assert.equal(rankRows(rows, [], 'dps').length, 0);
});
