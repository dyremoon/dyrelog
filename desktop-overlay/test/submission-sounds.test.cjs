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
