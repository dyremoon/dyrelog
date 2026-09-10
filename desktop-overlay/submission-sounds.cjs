const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 20 * 1024 * 1024;

function createSubmissionSounds({ userDir, presetDir, getSettings, saveSettings, send }) {
  const customFile = path.join(userDir, 'submission-sound.mp3');
  const played = new Set();

  function presets() {
    const entries = JSON.parse(fs.readFileSync(path.join(presetDir, 'presets.json'), 'utf8'));
    return entries.filter(entry => typeof entry.id === 'string' && typeof entry.name === 'string' &&
      typeof entry.file === 'string' && path.basename(entry.file) === entry.file && /\.(mp3|wav)$/i.test(entry.file) &&
      fs.existsSync(path.join(presetDir, entry.file)));
  }

  function list() {
    const choices = [{ id: 'none', name: 'No sound' }];
    for (const preset of presets()) choices.push({ id: 'preset:' + preset.id, name: preset.name });
    if (fs.existsSync(customFile)) choices.push({ id: 'custom', name: getSettings().submissionSoundName || 'Custom MP3' });
    return choices;
  }

  function readAudio(file) {
    const size = fs.statSync(file).size;
    if (!size || size > MAX_BYTES) throw new Error('Choose an MP3 smaller than 20 MB.');
    return fs.readFileSync(file);
  }

  function importFile(file) {
    if (!/\.mp3$/i.test(file)) throw new Error('Choose an MP3 file.');
    const data = readAudio(file);
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(customFile, data);
    return saveSettings({ submissionSound: 'custom', submissionSoundName: path.basename(file) });
  }

  function audio() {
    const settings = getSettings();
    const choice = settings.submissionSound || 'none';
    const volume = Number.isFinite(settings.submissionSoundVolume) ? Math.max(0, Math.min(100, settings.submissionSoundVolume)) / 100 : 0.7;
    if (choice === 'none' || volume === 0) return null;
    const preset = presets().find(entry => 'preset:' + entry.id === choice);
    const file = choice === 'custom' ? customFile : preset ? path.join(presetDir, preset.file) : null;
    if (!file) return null;
    const mime = /\.wav$/i.test(file) ? 'audio/wav' : 'audio/mpeg';
    return { src: 'data:' + mime + ';base64,' + readAudio(file).toString('base64'), volume };
  }

  function notify(result) {
    if (!result || result.status !== 'verified' || result.visibility !== 'public' || !result.submissionId) return;
    if (played.has(String(result.submissionId))) return;
    played.add(String(result.submissionId));
    if (played.size > 1000) played.delete(played.values().next().value);
    try {
      const payload = audio();
      if (payload) send(payload);
    } catch (err) {
      // Audio failure must never turn a successful upload into an error.
      console.error('Submission sound unavailable:', err.message);
    }
  }

  return { list, importFile, audio, notify };
}

module.exports = { createSubmissionSounds };
