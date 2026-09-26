const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const LiveStream = require('../renderer/live-stream.js');

// The real parser, loaded the same way the app loads it.
const parserPath = fs.existsSync(path.join(__dirname, '../renderer/eqp-core.js'))
  ? path.join(__dirname, '../renderer/eqp-core.js')
  : path.join(__dirname, '../../frontend/js/eqp-core.js');
const ctx = { window: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(parserPath, 'utf8'), ctx);
const EQP = ctx.EQP || ctx.window.EQP;
const lineTime = line => { const ev = EQP.parseLine(line); return ev && ev.time != null ? ev.time : null; };

function stamp(sec) {
  const d = new Date(2026, 8, 1, 20, 0, sec);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = n => String(n).padStart(2, '0');
  return `[${days[d.getDay()]} ${months[d.getMonth()]} ${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${d.getFullYear()}]`;
}
const fight = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${stamp(from + i)} You slash Lady Vox for ${100 + i} points of damage.`);

test('every planned batch spans at most a few seconds of in-game time', () => {
  const text = fight(0, 30).join('\n');
  const batches = LiveStream.planBatches(text, LiveStream.newSentLines(), lineTime);
  assert.ok(batches.length >= 7);
  for (const b of batches) {
    const times = b.split('\n').map(lineTime).filter(t => t != null);
    assert.ok(Math.max(...times) - Math.min(...times) <= LiveStream.MAX_BATCH_GAME_SPAN_MS);
  }
  assert.equal(batches.join('\n'), text, 'nothing lost, order preserved');
});

test('an older line inserted ahead of the fight (pet evidence) gets its own batch instead of widening one', () => {
  const evidence = `${stamp(-300)} Vibarn told you, 'Attacking Lady Vox Master.'`;
  const sent = LiveStream.newSentLines();
  LiveStream.markSent(fight(0, 3).join('\n'), sent);
  const text = [evidence].concat(fight(0, 6)).join('\n');
  const batches = LiveStream.planBatches(text, sent, lineTime);
  assert.equal(batches[0], evidence);
  assert.equal(batches.slice(1).join('\n'), fight(0, 6).slice(4).join('\n'));
});

test('lines only count as sent after markSent, so a failed upload is retried', () => {
  const sent = LiveStream.newSentLines();
  const text = fight(0, 2).join('\n');
  const first = LiveStream.planBatches(text, sent, lineTime);
  assert.equal(first.join('\n'), text);
  assert.equal(LiveStream.planBatches(text, sent, lineTime).join('\n'), text, 'unmarked lines come back');
  first.forEach(b => LiveStream.markSent(b, sent));
  assert.deepEqual(LiveStream.planBatches(text, sent, lineTime), []);
});

test('identical repeated lines are counted, not collapsed', () => {
  const line = `${stamp(1)} You slash Lady Vox for 100 points of damage.`;
  const sent = LiveStream.newSentLines();
  LiveStream.markSent(line, sent);
  assert.deepEqual(LiveStream.unsentLines([line, line].join('\n'), sent), [line]);
});

test('batches respect the character cap', () => {
  const lines = fight(0, 0).concat(Array(50).fill(`${stamp(0)} ` + 'x'.repeat(100)));
  const batches = LiveStream.planBatches(lines.join('\n'), LiveStream.newSentLines(), lineTime, { maxChars: 1000 });
  assert.ok(batches.every(b => b.length <= 1000));
  assert.equal(batches.join('\n'), lines.join('\n'));
});
