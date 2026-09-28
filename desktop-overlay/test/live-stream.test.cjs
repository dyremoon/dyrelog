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

test('only combat lines are uploaded; chat and other log lines stay on the PC', () => {
  const lines = [
    `${stamp(1)} You slash Lady Vox for 120 points of damage.`,
    `${stamp(1)} Bob tells you, 'meet me at the bank'`,
    `${stamp(1)} Bob tells the guild, 'nice damage everyone'`,
    `${stamp(2)} Fido told you, 'Attacking Lady Vox Master.'`,
    `${stamp(2)} You say, 'hello'`,
    `${stamp(3)} You have slain Lady Vox!`,
    `${stamp(3)} --You have looted a Shiny Ring.--`,
  ];
  assert.deepEqual(LiveStream.combatLines(lines, EQP.parseLine), [lines[0], lines[3], lines[5]]);
});

// The server's streaming check lives in the private worker repo, which GitHub's build doesn't check out.
const SERVER_CHECK = fs.existsSync(path.join(__dirname, '../../worker/src/anticheat.js'))
  ? {} : { skip: 'needs the private worker code (runs on the developer machine)' };

// Plays a real-time fight through the app's 5 s push schedule and runs the server's own streaming check on the result.
async function simulateLiveFight({ seconds, linesPerSecond = 15, latencyMs = 150, startAfterMs = 5000, remainderDelayMs = 0 }) {
  const { checkStreamingPattern } = await import('../../worker/src/anticheat.js');
  const all = [];
  for (let s = 0; s <= seconds; s++) {
    for (let k = 0; k < linesPerSecond; k++) all.push({ at: s * 1000, line: `${stamp(s)} You slash Lady Vox for ${100 + ((s * 7 + k * 13) % 90)} points of damage.` });
  }
  all.push({ at: seconds * 1000, line: `${stamp(seconds)} You have slain Lady Vox!` });
  const T0 = Date.UTC(2026, 8, 1, 20, 0, 0);
  const sent = LiveStream.newSentLines();
  const received = [];
  let clock = startAfterMs + latencyMs; // stream start request
  let nextPushAt = 0;
  const upload = (chunk) => { clock += latencyMs; received.push({ received_at: new Date(T0 + clock).toISOString(), raw_chunk_text: chunk }); LiveStream.markSent(chunk, sent); };
  // Render ticks every second while the fight runs.
  for (; clock < seconds * 1000; clock = Math.ceil((clock + 1) / 1000) * 1000) {
    if (clock < nextPushAt) continue;
    const text = all.filter((l) => l.at <= clock).map((l) => l.line).join('\n');
    const batches = LiveStream.planBatches(text, sent, lineTime, { firstSpanMs: LiveStream.LIVE_FIRST_BATCH_GAME_SPAN_MS });
    batches.forEach(upload);
    nextPushAt = clock + LiveStream.LIVE_PUSH_INTERVAL_MS;
  }
  // Kill: the remaining lines go up at the default span, back to back.
  clock = seconds * 1000 + remainderDelayMs;
  LiveStream.planBatches(all.map((l) => l.line).join('\n'), sent, lineTime).forEach(upload);
  const spans = received.map((b) => {
    const times = b.raw_chunk_text.split('\n').map(lineTime).filter((t) => t != null);
    return times.length ? { min: Math.min(...times), max: Math.max(...times) } : null;
  });
  return { batches: received.length, check: checkStreamingPattern(received, seconds * 1000, spans) };
}

test('a 3-minute fight at the 5 s cadence passes the server streaming check with about a fifth of the uploads', SERVER_CHECK, async () => {
  const r = await simulateLiveFight({ seconds: 180 });
  assert.equal(r.check.flagged, false, r.check.reason);
  assert.ok(r.batches <= 40, `${r.batches} uploads`);
});

test('short, slow-network and ask-mode fights still pass the server streaming check', SERVER_CHECK, async () => {
  for (const opts of [{ seconds: 20 }, { seconds: 25 }, { seconds: 60, latencyMs: 900 }, { seconds: 90, linesPerSecond: 60 }, { seconds: 120, remainderDelayMs: 30000 }]) {
    const r = await simulateLiveFight(opts);
    assert.equal(r.check.flagged, false, JSON.stringify(opts) + ' ' + r.check.reason);
  }
});

test('the simulation can fail: a fight uploaded only after the kill is still flagged', SERVER_CHECK, async () => {
  const r = await simulateLiveFight({ seconds: 60, startAfterMs: 60000 });
  assert.equal(r.check.flagged, true);
});
