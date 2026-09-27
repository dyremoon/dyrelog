const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSubmissionSounds } = require('../submission-sounds.cjs');

test('custom audio survives moving the source; only successful public uploads notify once', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyrelog-sound-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'presets.json'), '[]');
  const source = path.join(dir, 'original.mp3');
  fs.writeFileSync(source, 'test audio bytes');
  let settings = { submissionSoundVolume: 35 };
  const sent = [];
  const service = createSubmissionSounds({ userDir: path.join(dir, 'user'), presetDir: dir,
    getSettings: () => settings, saveSettings: partial => (settings = { ...settings, ...partial }), send: audio => sent.push(audio) });
  assert.equal(service.audio(), null);
  service.importFile(source);
  fs.unlinkSync(source);
  assert.equal(service.audio().volume, .35);
  for (const [status, visibility] of [['pending_review', 'public'], ['flagged', 'public'], ['verified', 'private'], ['verified', undefined]]) {
    service.notify({ submissionId: 1, status, visibility });
  }
  assert.equal(sent.length, 0);
  const success = { submissionId: 1, status: 'verified', visibility: 'public' };
  service.notify(success);
  service.notify(success);
  assert.equal(sent.length, 1);
  settings.submissionSoundVolume = 0;
  service.notify({ ...success, submissionId: 2 });
  assert.equal(sent.length, 1);
  settings.submissionSound = 'none';
  settings.submissionSoundVolume = 100;
  assert.equal(service.audio(), null);
});

test('preset catalog selects bundled audio and ignores paths outside the preset folder', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyrelog-preset-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'level.mp3'), 'preset bytes');
  fs.writeFileSync(path.join(dir, 'presets.json'), JSON.stringify([
    { id: 'level', name: 'Level Up', file: 'level.mp3' }, { id: 'bad', name: 'Bad', file: '../elsewhere.mp3' }
  ]));
  const service = createSubmissionSounds({ userDir: dir, presetDir: dir,
    getSettings: () => ({ submissionSound: 'preset:level', submissionSoundVolume: 100 }) });
  assert.deepEqual(service.list().map(item => item.id), ['none', 'preset:level']);
  assert.equal(service.audio().volume, 1);
});

test('EverQuest sounds play from the player\'s own game folder, never from outside the fixed list', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyrelog-eq-sound-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const game = path.join(dir, 'EverQuest', 'sounds');
  fs.mkdirSync(game, { recursive: true });
  fs.writeFileSync(path.join(game, 'sfx_emt_bird_robin_01.wav'), 'robin bytes');
  fs.writeFileSync(path.join(game, 'secret.wav'), 'not on the list');
  fs.writeFileSync(path.join(dir, 'presets.json'), '[]');
  let settings = { submissionSound: 'eq:sfx_emt_bird_robin_01', submissionSoundVolume: 100 };
  let gameDir = game;
  const service = createSubmissionSounds({ userDir: dir, presetDir: dir, getSettings: () => settings, getGameSoundsDir: () => gameDir });
  assert.deepEqual(service.list().map(c => c.id), ['none', 'eq:sfx_emt_bird_robin_01'], 'only sounds present in the install are offered');
  assert.match(service.audio().src, /^data:audio\/wav;base64,/);
  settings.submissionSound = 'eq:secret';
  assert.equal(service.audio(), null, 'files outside the fixed list are never read');
  settings.submissionSound = 'eq:../../x';
  assert.equal(service.audio(), null);
  settings.submissionSound = 'preset:EQ_sfx_emt_bird_robin_01';
  assert.ok(service.audio(), 'a choice saved by an older version still plays');
  gameDir = null;
  assert.equal(service.audio(), null, 'no game folder found: silent, no error');
});

test('old bundled EverQuest choices map to the game-folder sounds', () => {
  const { migrateChoice } = require('../submission-sounds.cjs');
  assert.equal(migrateChoice('preset:EQ_sfx_emt_crow_02'), 'eq:sfx_emt_crow_02');
  assert.equal(migrateChoice('preset:Giggle'), 'preset:Giggle');
  assert.equal(migrateChoice('preset:EQ_not_a_real_sound'), 'preset:EQ_not_a_real_sound');
});

test('shipped sounds are limited to ones with known rights', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../renderer/sounds/presets.json'), 'utf8')).map(p => p.file);
  assert.deepEqual(shipped, ['Giggle.mp3']);
  const audio = fs.readdirSync(path.join(__dirname, '../../Audio')).filter(f => /\.(mp3|wav|ogg)$/i.test(f));
  assert.deepEqual(audio, ['Giggle.mp3']);
});
