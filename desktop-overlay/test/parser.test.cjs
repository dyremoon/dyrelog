// Parser regression tests using realistic EverQuest Legends log lines.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const parserPath = fs.existsSync(path.join(__dirname, '../renderer/eqp-core.js'))
  ? path.join(__dirname, '../renderer/eqp-core.js')
  : path.join(__dirname, '../../frontend/js/eqp-core.js');
const ctx = { window: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(parserPath, 'utf8'), ctx);
const EQP = ctx.EQP || ctx.window.EQP;

function run(lines, opts = {}) {
  const state = EQP.newState(Object.assign({ characterName: 'Tester', knownBossNames: ['Lord Nagafen', 'Lady Vox'] }, opts));
  for (const line of lines) {
    const ev = EQP.parseLine(line);
    if (ev) EQP.ingest(state, ev);
  }
  EQP.closeEncounter(state);
  return state;
}
const row = (stats, name) => stats.rows.find(r => r.name === name);

const FIGHT = [
  "[Tue Sep 01 20:00:00 2026] You have entered Nagafen's Lair (Refined).",
  '[Tue Sep 01 20:00:01 2026] Bob hits Lord Nagafen for 70 points of damage.',
  '[Tue Sep 01 20:00:01 2026] You slash Lord Nagafen for 100 points of damage.',
  '[Tue Sep 01 20:00:02 2026] Lord Nagafen has taken 50 damage from your Poison Bolt.',
  '[Tue Sep 01 20:00:03 2026] Lord Nagafen has taken 40 damage from Poison Bolt by Tester.',
  '[Tue Sep 01 20:00:04 2026] Lord Nagafen hits Bob for 300 points of damage.',
  '[Tue Sep 01 20:00:04 2026] Lord Nagafen +2 hits YOU for 30 points of damage.',
  '[Tue Sep 01 20:00:05 2026] Tester`s warder bites Lord Nagafen for 20 points of damage.',
  '[Tue Sep 01 20:00:06 2026] You slash Lord Nagafen for 120 points of damage. (Critical)',
  '[Tue Sep 01 20:00:10 2026] You have slain Lord Nagafen!',
];

test('a boss fight locks onto the boss, not a groupmate who hit first', () => {
  const [enc] = run(FIGHT).encounters;
  assert.equal(enc.mobName, 'Lord Nagafen');
  assert.equal(enc.mobKilled, true);
});

test('difficulty comes from the zone-in line', () => {
  const [enc] = run(FIGHT).encounters;
  assert.equal(enc.difficultyKnown, true);
  assert.equal(enc.difficulty, 'D4');
});

test('"+N" tier suffix on the mob name does not split the fight or create a new mob', () => {
  const state = run(FIGHT);
  assert.equal(state.encounters.length, 1);
});

test('DoT/spell damage "by <you>" and "from your <spell>" count as your damage; pets fold into their owner', () => {
  const stats = EQP.computeStats(run(FIGHT).encounters[0]);
  const you = row(stats, 'You');
  assert.equal(you.damage, 100 + 50 + 40 + 120 + 20);
  assert.equal(JSON.stringify(you.pets.map(p => [p.name, p.damage])), JSON.stringify([['Tester`s warder', 20]]));
  assert.equal(row(stats, 'Lord Nagafen'), undefined, 'the boss never shows as a combatant');
});

test('DPS is damage divided by the fight duration in whole seconds', () => {
  const stats = EQP.computeStats(run(FIGHT).encounters[0]);
  assert.equal(stats.duration, 9);
  assert.equal(Math.round(row(stats, 'You').dps), Math.round(330 / 9));
});

test('the fight starts at your first action; boss damage to groupmates counts for no one', () => {
  // Bob's opening hit lands before you engage, so it isn't counted (existing behavior, shared with the server).
  const stats = EQP.computeStats(run(FIGHT).encounters[0]);
  assert.equal(stats.rows.reduce((n, r) => n + r.damage, 0), 330);
  const bobAfterYou = [FIGHT[0], FIGHT[2], FIGHT[1].replace('20:00:01', '20:00:02')].concat(FIGHT.slice(3));
  const stats2 = EQP.computeStats(run(bobAfterYou).encounters[0]);
  assert.equal(row(stats2, 'Bob').damage, 70);
  assert.equal(stats2.rows.reduce((n, r) => n + r.damage, 0), 330 + 70);
});

test('garbage and partial lines never throw', () => {
  for (const line of ['', '[', '[Tue Sep 01 20:00:00 2026]', 'You slash', '[bad date] You slash X for 5 points of damage.',
    '[Tue Sep 01 20:00:00 2026] You slash  for 99999999999999999999 points of damage.']) {
    assert.doesNotThrow(() => { const ev = EQP.parseLine(line); if (ev) EQP.ingest(EQP.newState({}), ev); });
  }
});
