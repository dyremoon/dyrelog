const { test } = require('node:test');
const assert = require('node:assert/strict');
const { groupBosses, rankRows } = require('../renderer/boss-browser.js');

test('group counts add each tier once and duplicate attempts keep the best character/tier row', () => {
  assert.equal(groupBosses([{ id: 1, name: 'Yael', entrant_count: 1 }])[0].entrant_count, 1);
  const rows = [
    { character_name: 'A', realm: 'freeport', difficulty: 'D0', dps: 100 },
    { character_name: 'A', realm: 'freeport', difficulty: 'D0', dps: 200 },
    { character_name: 'A', realm: 'freeport', difficulty: 'D4', dps: 90 },
    { character_name: 'B', realm: 'freeport', difficulty: 'D0', dps: 70 }
  ];
  assert.deepEqual(rankRows(rows, ['D0', 'D4'], 'dps').map(r => r.dps), [200, 90, 70]);
});
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
