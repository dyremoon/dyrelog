const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCompletedKillQueue } = require('../renderer/completed-kills.js');
test('every completed encounter is handled once even when an add follows a boss between renders', () => {
  const visit = createCompletedKillQueue();
  const boss = { mobName: 'Gorgalosk', mobKilled: true };
  const add = { mobName: 'an add', mobKilled: true };
  const handled = [];
  visit([boss, add], e => handled.push(e.mobName));
  visit([boss, add], e => handled.push(e.mobName));
  assert.deepEqual(handled, ['Gorgalosk', 'an add']);
});
