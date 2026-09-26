const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWindowGesture } = require('../window-gesture.cjs');

function setup(sizeDrift = 0) {
  let bounds = { x: -200, y: 40, width: 320, height: 180 };
  let cursor = { x: -190, y: 50 }, saved = 0;
  const calls = [];
  const win = { isDestroyed: () => false, getBounds: () => ({ ...bounds }),
    setPosition(x, y) { calls.push('position'); bounds = { x, y,
      width: bounds.width + sizeDrift, height: bounds.height + sizeDrift }; },
    setBounds(next) { calls.push('bounds'); bounds = { ...next,
      width: next.width + sizeDrift, height: next.height + sizeDrift }; },
    setSize(width, height) { calls.push('size'); bounds = { ...bounds, width, height }; } };
  const gesture = createWindowGesture(() => win, () => ({ ...cursor }),
    { minWidth: 170, maxWidth: 900, minHeight: 56, maxHeight: 900 }, () => saved++);
  return { gesture, calls, move(x, y) { cursor = { x, y }; },
    get bounds() { return bounds; }, get saved() { return saved; } };
}

test('continuous dragging changes only position, never dimensions', () => {
  const t = setup(); t.gesture.handle('drag', 'start');
  for (let i = 0; i < 1000; i++) {
    t.move(i - 500, i % 400); t.gesture.handle('drag', 'move');
    assert.equal(t.bounds.width, 320); assert.equal(t.bounds.height, 180);
  }
  assert.ok(t.calls.every(call => call === 'bounds'));
  t.gesture.handle('drag', 'end');
  assert.equal(t.saved, 1);
});

test('native size rounding does not accumulate across drag moves', () => {
  const t = setup(1); t.gesture.handle('drag', 'start');
  for (let i = 0; i < 1000; i++) {
    t.move(i - 500, i % 400); t.gesture.handle('drag', 'move');
    assert.deepEqual(t.bounds, { x: i - 510, y: i % 400 - 10, width: 321, height: 181 });
  }
});

test('right, bottom and corner resize change only their dimensions', () => {
  for (const axes of [{ width: true }, { height: true }, { width: true, height: true }]) {
    const t = setup(); t.gesture.handle('resize', 'start', axes);
    t.move(-90, 110); t.gesture.handle('resize', 'move');
    assert.deepEqual(t.bounds, { x: -200, y: 40, width: axes.width ? 420 : 320, height: axes.height ? 240 : 180 });
    assert.deepEqual(t.calls, ['size']);
  }
});

test('drag and resize cannot overlap or terminate each other', () => {
  for (const kind of ['drag', 'resize']) {
    const other = kind === 'drag' ? 'resize' : 'drag';
    const t = setup(); t.gesture.handle(kind, 'start', { width: true });
    t.gesture.handle(other, 'start', { width: true });
    t.move(200, 200); t.gesture.handle(other, 'move'); t.gesture.handle(other, 'end');
    assert.deepEqual(t.calls, []); assert.ok(t.gesture.isActive());
    t.gesture.handle(kind, 'move');
    assert.deepEqual(t.calls, [kind === 'drag' ? 'bounds' : 'size']);
  }
});

test('release or cancellation makes later movement inert', () => {
  const t = setup();
  t.gesture.handle('resize', 'start', { width: true, height: true });
  t.gesture.handle('resize', 'end');
  t.move(400, 400); t.gesture.handle('resize', 'move');
  t.gesture.handle('drag', 'start'); t.gesture.cancel(); t.gesture.handle('drag', 'move');
  assert.deepEqual(t.calls, []);
  assert.equal(t.gesture.isActive(), false);
});

test('resizing clamps at limits without moving the origin', () => {
  const t = setup(); t.gesture.handle('resize', 'start', { width: true, height: true });
  t.move(10000, -10000); t.gesture.handle('resize', 'move');
  assert.deepEqual(t.bounds, { x: -200, y: 40, width: 900, height: 56 });
});
