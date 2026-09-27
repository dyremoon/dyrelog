const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 20 * 1024 * 1024;

// EverQuest sounds are played from the player's own game install (EverQuest\sounds), never shipped with Dyrelog.
const GAME_SOUNDS = [
  ['arxmentis_one_shot_01', 'EQ Arx Mentis 1'], ['arxmentis_one_shot_03', 'EQ Arx Mentis 3'],
  ['cave_drips_02', 'EQ Cave Drips 2'], ['cave_drips_04', 'EQ Cave Drips 4'], ['cave_drips_05', 'EQ Cave Drips 5'],
  ['sfx_emt_bird_blackbird_01', 'EQ Blackbird 1'], ['sfx_emt_bird_blackbird_02', 'EQ Blackbird 2'],
  ['sfx_emt_bird_robin_01', 'EQ Robin 1'], ['sfx_emt_bird_robin_02', 'EQ Robin 2'], ['sfx_emt_bird_robin_03', 'EQ Robin 3'],
  ['sfx_emt_crow_01', 'EQ Crow 1'], ['sfx_emt_crow_02', 'EQ Crow 2'], ['sfx_emt_crow_03', 'EQ Crow 3'],
  ['sfx_emt_fart_01', 'EQ Fart 1'], ['sfx_emt_fart_02', 'EQ Fart 2'], ['sfx_emt_fart_03', 'EQ Fart 3'],
].map(([id, name]) => ({ id, name, file: id + '.wav' }));

// Earlier versions shipped these EverQuest sounds as "preset:EQ_<id>"; the same sounds now come from the game.
function migrateChoice(choice) {
  const old = /^preset:EQ_(.+)$/.exec(choice || '');
  return old && GAME_SOUNDS.some(s => s.id === old[1]) ? 'eq:' + old[1] : choice;
}

function createSubmissionSounds({ userDir, presetDir, getSettings, saveSettings, send, getGameSoundsDir = () => null }) {
  const customFile = path.join(userDir, 'submission-sound.mp3');
  const played = new Set();

  function presets() {
    const entries = JSON.parse(fs.readFileSync(path.join(presetDir, 'presets.json'), 'utf8'));
    return entries.filter(entry => typeof entry.id === 'string' && typeof entry.name === 'string' &&
      typeof entry.file === 'string' && path.basename(entry.file) === entry.file && /\.(mp3|wav)$/i.test(entry.file) &&
      fs.existsSync(path.join(presetDir, entry.file)));
  }

  function gameSounds() {
    const dir = getGameSoundsDir();
    if (!dir) return [];
    return GAME_SOUNDS.filter(sound => fs.existsSync(path.join(dir, sound.file)));
  }

  function list() {
    const choices = [{ id: 'none', name: 'No sound' }];
    for (const preset of presets()) choices.push({ id: 'preset:' + preset.id, name: preset.name });
    for (const sound of gameSounds()) choices.push({ id: 'eq:' + sound.id, name: sound.name });
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

  function fileFor(choice) {
    if (choice === 'custom') return customFile;
    if (choice.startsWith('eq:')) {
      const sound = GAME_SOUNDS.find(s => 'eq:' + s.id === choice);
      const dir = getGameSoundsDir();
      return sound && dir && fs.existsSync(path.join(dir, sound.file)) ? path.join(dir, sound.file) : null;
    }
    const preset = presets().find(entry => 'preset:' + entry.id === choice);
    return preset ? path.join(presetDir, preset.file) : null;
  }

  function audio() {
    const settings = getSettings();
    const choice = migrateChoice(settings.submissionSound || 'none');
    const volume = Number.isFinite(settings.submissionSoundVolume) ? Math.max(0, Math.min(100, settings.submissionSoundVolume)) / 100 : 0.7;
    if (choice === 'none' || volume === 0) return null;
    const file = fileFor(choice);
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

module.exports = { createSubmissionSounds, migrateChoice, GAME_SOUNDS };
