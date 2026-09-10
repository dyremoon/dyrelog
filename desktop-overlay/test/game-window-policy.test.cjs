const test = require('node:test');
const assert = require('node:assert/strict');
const { nextGameContext } = require('../game-window-policy.cjs');

test('overlay stays above EverQuest and its own controls, but yields to other applications', () => {
  let context = false;
  const update = (pid, name) => (context = nextGameContext(context, { pid, name }, 100));
  assert.equal(update(200, 'eqgame'), true);
  assert.equal(update(100, 'Dyrelog'), true);
  assert.equal(update(300, 'chrome'), false);
  assert.equal(update(100, 'Dyrelog'), false);
  assert.equal(update(200, 'EQGAME'), true);
  assert.equal(update(400, 'explorer'), false);
  assert.equal(update(500, 'some-eqgame-tool'), false);
});
