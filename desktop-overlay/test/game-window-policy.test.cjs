const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { nextGameContext, applyGameContext, createForegroundTracker, OVERLAY_LEVEL } = require('../game-window-policy.cjs');

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

test('the overlay is raised every time EverQuest is activated, even when it was already on top', () => {
  const changes = [];
  let activations = 0;
  const tracker = createForegroundTracker({ appProcessId: 100, onChange: (a) => changes.push(a), onGameActivated: () => activations++ });
  tracker.line('200|eqgame');   // into the game
  tracker.line('100|Dyrelog');  // clicked the overlay
  tracker.line('200|eqgame');   // clicked back into the game: still "on top", but the game was just brought forward
  tracker.line('300|chrome');
  tracker.line('200|eqgame');
  assert.deepEqual(changes, [true, false, true]);
  assert.equal(activations, 3);
  tracker.stop();
  assert.deepEqual(changes, [true, false, true, false], 'a stopped monitor drops the overlay back to normal');
});

function fakeWindow({ visible = true, destroyed = false } = {}) {
  const calls = [];
  return {
    calls,
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    setAlwaysOnTop: (flag, level) => calls.push(['top', flag, level]),
    moveTop: () => calls.push(['moveTop']),
  };
}

test('windows go above the taskbar level, not "floating" (which sits under a fullscreen game with the taskbar)', () => {
  assert.equal(OVERLAY_LEVEL, 'screen-saver');
  const shown = fakeWindow(), hidden = fakeWindow({ visible: false }), gone = fakeWindow({ destroyed: true });
  applyGameContext([shown, hidden, gone], true, { raise: true });
  assert.deepEqual(shown.calls, [['top', true, 'screen-saver'], ['moveTop']]);
  assert.deepEqual(hidden.calls, [['top', true, 'screen-saver']], 'hidden windows are not brought forward');
  assert.deepEqual(gone.calls, []);
  applyGameContext([shown], false, { raise: true });
  assert.deepEqual(shown.calls.at(-1), ['top', false, 'screen-saver'], 'leaving the game never raises');
});

test('every Dyrelog window uses the shared on-top policy, and the game activation re-raises after Windows settles', () => {
  const src = readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  assert.doesNotMatch(src, /setAlwaysOnTop\(/, 'no window sets its own level');
  for (const w of ['win', 'analysisWin', 'leaderboardWin', 'submitPopupWin', 'settingsWin', 'setupWin']) {
    assert.match(src, new RegExp(`applyGameContext\\(\\[${w}\\], gameForeground\\)`), w);
  }
  assert.match(src, /onGameActivated\(\) \{\s*applyGameContext\(BrowserWindow\.getAllWindows\(\), true, \{ raise: true \}\);[\s\S]*?setTimeout\([\s\S]*?RAISE_AGAIN_MS\)/);
});
