const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../../Audio');
const destination = path.resolve(__dirname, '../renderer/sounds');
if (fs.existsSync(source)) {
  fs.mkdirSync(destination, { recursive: true });
  const presets = fs.readdirSync(source).filter(file => /\.(mp3|wav)$/i.test(file)).sort().map(file => {
    const id = file.replace(/\.[^.]+$/, '');
    const name = id.replace(/^sfx_emt_/, '').replace(/^arxmentis_one_shot_/, 'arx_mentis_')
      .replace(/^bird_/, '').replace(/_/g, ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase());
    fs.copyFileSync(path.join(source, file), path.join(destination, file));
    return { id, name, file };
  });
  fs.writeFileSync(path.join(destination, 'presets.json'), JSON.stringify(presets, null, 2) + '\n');
  console.log(`Synced ${presets.length} submission sound presets`);
}
