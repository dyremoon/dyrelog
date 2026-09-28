const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Presets = require('../presets.cjs');
const { readJson, writeJsonAtomic } = require('../json-store.cjs');

const mine = {
  theme: 'druidic', fontFamily: 'medieval', displayStyle: 'mini', bgColor: '#06140A', myBarColor: '#1f9e3a',
  classColorsEnabled: true, myClass: 'Druid', classColorOverrides: { Druid: '#00ff00' }, showPets: false,
  barsBarHeight: 1.4, miniIconScale: 1.3, circleCircleScale: 1.2, iconAngles: { menu: 90, pets: 200 },
  fadeIdleEnabled: true, fadeIdleSeconds: 12, fadeIdleOpacity: 0.3,
  // Not appearance: must never travel with a preset.
  autoSubmitMode: 'auto', firstRunSetupComplete: true, launchAtStartup: true, analyticsConsent: { enabled: true },
};

test('a look keeps every appearance setting and nothing else', () => {
  const look = Presets.lookFromSettings(mine);
  assert.equal(look.theme, 'druidic');
  assert.equal(look.fontFamily, 'medieval');
  assert.equal(look.displayStyle, 'mini');
  assert.equal(look.bgColor, '#06140a');
  assert.equal(look.myBarColor, '#1f9e3a');
  assert.equal(look.textColor, null, 'unset colors mean "theme default"');
  assert.deepEqual(look.classColorOverrides, { Druid: '#00ff00' });
  assert.equal(look.barsBarHeight, 1.4);
  assert.equal(look.miniIconScale, 1.3);
  assert.deepEqual(look.iconAngles, { menu: 90, pets: 200 });
  for (const key of ['autoSubmitMode', 'firstRunSetupComplete', 'launchAtStartup', 'analyticsConsent']) assert.ok(!(key in look), key);
});

test('a share code round-trips, and so does an exported file', () => {
  const code = Presets.encodeShareCode('Swamp Druid', Presets.lookFromSettings(mine));
  assert.ok(code.startsWith('DYRELOG-LOOK:'));
  assert.ok(!/[+/=\s]/.test(code.slice(13)), 'safe to paste in chat');
  const back = Presets.decodeShared(code);
  assert.equal(back.name, 'Swamp Druid');
  assert.deepEqual(back.look, Presets.lookFromSettings(mine));
  assert.deepEqual(Presets.decodeShared('  ' + code.slice(0, 40) + '\n' + code.slice(40) + '  ').look, back.look, 'survives line breaks from chat apps');
  const file = Presets.decodeShared(Presets.exportFileText('Swamp Druid', back.look));
  assert.deepEqual(file, back);
});

test('a tampered or hostile shared preset can only ever change the look, within the normal limits', () => {
  const hostile = {
    v: 1, name: '<img src=x onerror=alert(1)>' + 'x'.repeat(200),
    look: {
      theme: 'javascript:alert(1)', fontFamily: '../../evil', bgColor: 'red; background:url(x)', textColor: '#12345',
      barsBarHeight: 999, miniIconScale: -5, fadeIdleSeconds: 1e9, fadeIdleOpacity: 'lots', myClass: 'Admin',
      classColorOverrides: { Druid: 'url(x)', Hacker: '#ffffff' }, iconAngles: { menu: 'x', evil: 5 },
      autoSubmitMode: 'auto', firstRunSetupComplete: true, keepInTrayOnClose: true, __proto__: { polluted: true },
    },
  };
  const shared = Presets.decodeShared(JSON.stringify(hostile));
  const look = shared.look;
  assert.ok(!shared.name.includes('<') && shared.name.length <= 40);
  assert.equal(look.theme, 'blue');
  assert.equal(look.fontFamily, 'system');
  assert.equal(look.bgColor, null);
  assert.equal(look.textColor, null);
  assert.equal(look.barsBarHeight, 3.5, 'clamped to the slider range');
  assert.equal(look.miniIconScale, 0.7);
  assert.equal(look.fadeIdleSeconds, 30);
  assert.equal(look.fadeIdleOpacity, 0.15);
  assert.equal(look.myClass, null);
  assert.deepEqual(look.classColorOverrides, {});
  assert.deepEqual(look.iconAngles, {});
  for (const key of ['autoSubmitMode', 'firstRunSetupComplete', 'keepInTrayOnClose', 'polluted']) assert.ok(!(key in look), key);
  assert.equal({}.polluted, undefined);
});

test('junk is rejected instead of half-applied', () => {
  for (const junk of ['', 'hello', 'DYRELOG-LOOK:@@@', 'DYRELOG-LOOK:' + Buffer.from('{"v":2,"look":{}}').toString('base64'),
    '{"v":1}', '[]', 'null', 'x'.repeat(30000)]) {
    assert.equal(Presets.decodeShared(junk), null, junk.slice(0, 30));
  }
});

test('presets are saved, replaced by name, listed alphabetically, and deleted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyrelog-presets-'));
  const store = Presets.createPresetStore({ file: path.join(dir, 'p.json'), readJson, writeJsonAtomic });
  assert.deepEqual(store.list(), []);
  assert.equal(store.save('  ', {}).ok, false);
  store.save('Raid night', Presets.lookFromSettings(mine));
  store.save('Clean', {});
  store.save('Raid night', { theme: 'metal' });
  assert.deepEqual(store.list().map((p) => p.name), ['Clean', 'Raid night']);
  assert.equal(store.get('Raid night').look.theme, 'metal', 'same name replaces');
  store.remove('Clean');
  assert.deepEqual(store.list().map((p) => p.name), ['Raid night']);
});

test('a corrupted presets file is ignored, and the list has a limit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyrelog-presets-'));
  const file = path.join(dir, 'p.json');
  fs.writeFileSync(file, '{not json');
  const store = Presets.createPresetStore({ file, readJson, writeJsonAtomic });
  assert.deepEqual(store.list(), []);
  for (let i = 0; i < 50; i++) assert.equal(store.save('Look ' + String(i).padStart(2, '0'), {}).ok, true);
  const full = store.save('One too many', {});
  assert.equal(full.ok, false);
  assert.match(full.error, /up to 50/);
});

test('presets.cjs is packaged and wired to the Settings window', () => {
  assert.ok(require('../package.json').build.files.includes('presets.cjs'));
  const preload = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8');
  for (const fn of ['listPresets', 'savePreset', 'applyPreset', 'deletePreset', 'copyPresetCode', 'importPresetCode', 'exportPreset', 'importPresetFile']) {
    assert.ok(preload.includes(fn + ':'), fn);
  }
});

test('the settings preview sizes icons the same way the meter does (no extra scaling)', () => {
  const css = fs.readFileSync(path.join(__dirname, '../renderer/settings.css'), 'utf8');
  assert.doesNotMatch(css, /transform:\s*scale\(var\(--preview-iconscale/);
});

test('the Settings window stays in sync with changes made on the meter', () => {
  const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  assert.match(main, /\[win, analysisWin, leaderboardWin, settingsWin\]\.forEach\(function \(w\) \{\s*if \(w && !w\.isDestroyed\(\)\) w\.webContents\.send\("settings-update"/);
  const settingsJs = fs.readFileSync(path.join(__dirname, '../renderer/settings.js'), 'utf8');
  assert.match(settingsJs, /window\.dyrelog\.onSettingsUpdate\(applyToUI\)/);
});

test('with class colors on, the My bar picker edits your class color', () => {
  const settingsJs = fs.readFileSync(path.join(__dirname, '../renderer/settings.js'), 'utf8');
  assert.match(settingsJs, /overrides\[s\.myClass\] = els\.myBarColor\.value;/);
});
