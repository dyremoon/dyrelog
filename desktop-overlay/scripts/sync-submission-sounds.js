const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../../Audio');
const destination = path.resolve(__dirname, '../renderer/sounds');
const AUDIO = /\.(mp3|wav)$/i;
if (fs.existsSync(source)) {
  fs.mkdirSync(destination, { recursive: true });
  const files = fs.readdirSync(source).filter(file => AUDIO.test(file)).sort();
  // Drop copies left behind by renamed or removed sounds so the installer only ships the current set.
  for (const file of fs.readdirSync(destination)) {
    if (AUDIO.test(file) && !files.includes(file)) fs.unlinkSync(path.join(destination, file));
  }
  const presets = files.map(file => {
    const id = file.replace(/\.[^.]+$/, '');
    const name = id.replace(/\.ogg$/i, '').replace(/sfx_emt_(bird_)?/, '').replace(/arxmentis_one_shot_/, 'arx_mentis_')
      .replace(/_/g, ' ').replace(/\b0(\d)\b/g, '$1').replace(/\b[a-z]/g, letter => letter.toUpperCase());
    fs.copyFileSync(path.join(source, file), path.join(destination, file));
    return { id, name, file };
  });
  fs.writeFileSync(path.join(destination, 'presets.json'), JSON.stringify(presets, null, 2) + '\n');
  console.log(`Synced ${presets.length} submission sound presets`);
}
