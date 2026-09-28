// Appearance presets: saved locally, and shareable as a file or a text code. Shared presets come from
// other players, so only known appearance settings with valid values are ever applied.
const Appearance = require('./renderer/appearance.js');

const THEMES = ['blue', 'brass', 'druidic', 'magical', 'girly', 'hardcore', 'metal'];
const FONTS = ['system', 'serif', 'mono', 'rounded', 'fantasy', 'medieval', 'scifi', 'pixel'];
const STYLES = ['bars', 'mini', 'circle'];
const CLASSES = ['Berserker', 'Warrior', 'Cleric', 'Bard', 'Paladin', 'Necromancer', 'Ranger', 'Druid',
  'Monk', 'Beastlord', 'Magician', 'Shaman', 'Rogue', 'Shadow Knight', 'Wizard', 'Enchanter'];
const COLOR_KEYS = ['bgColor', 'textColor', 'secondaryTextColor', 'dpsTextColor', 'totalDpsColor', 'myNameTextColor',
  'petNameTextColor', 'myBarColor', 'petBarColor', 'borderColor', 'iconColor', 'circleBgColor', 'circleBorderColor', 'circleTextColor'];
const ICON_KEYS = ['menu', 'mini', 'bars', 'pets'];
const MODE_KEYS = [];
Object.keys(Appearance.modes).forEach((mode) => Appearance.modes[mode].forEach((field) => MODE_KEYS.push([Appearance.key(mode, field), field])));

const CODE_PREFIX = 'DYRELOG-LOOK:';
const MAX_NAME = 40;
const MAX_PRESETS = 50;
const MAX_CODE_CHARS = 20000;

const isColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const clampNum = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);

function cleanName(name) {
  const text = String(name == null ? '' : name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_NAME);
  return text || null;
}

// Keeps only known appearance settings with valid values. A full look: missing colors mean "theme default".
function sanitizeLook(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const look = {};
  look.theme = THEMES.includes(src.theme) ? src.theme : 'blue';
  look.fontFamily = FONTS.includes(src.fontFamily) ? src.fontFamily : 'system';
  if (STYLES.includes(src.displayStyle)) look.displayStyle = src.displayStyle;
  COLOR_KEYS.forEach((k) => { look[k] = isColor(src[k]) ? src[k].toLowerCase() : null; });
  look.showPets = src.showPets !== false;
  look.classColorsEnabled = src.classColorsEnabled === true;
  look.myClass = CLASSES.includes(src.myClass) ? src.myClass : null;
  look.classColorOverrides = {};
  if (src.classColorOverrides && typeof src.classColorOverrides === 'object') {
    CLASSES.forEach((c) => { if (isColor(src.classColorOverrides[c])) look.classColorOverrides[c] = src.classColorOverrides[c].toLowerCase(); });
  }
  look.fadeIdleEnabled = src.fadeIdleEnabled === true;
  look.fadeIdleSeconds = Math.round(clampNum(src.fadeIdleSeconds, 3, 30) ?? 10);
  look.fadeIdleOpacity = clampNum(src.fadeIdleOpacity, 0, 1) ?? 0.15;
  look.iconAngles = {};
  if (src.iconAngles && typeof src.iconAngles === 'object') {
    ICON_KEYS.forEach((k) => { const a = clampNum(src.iconAngles[k], 0, 360); if (a !== undefined) look.iconAngles[k] = Math.round(a); });
  }
  MODE_KEYS.forEach(([key, field]) => {
    const bounds = Appearance.fields[field];
    look[key] = clampNum(src[key], bounds.min, bounds.max) ?? bounds.default;
  });
  return look;
}

// The current look, from the full settings object.
function lookFromSettings(settings) {
  return sanitizeLook(Appearance.migrate(settings || {}));
}

function toBase64Url(text) { return Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fromBase64Url(text) { return Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }

function encodeShareCode(name, look) {
  return CODE_PREFIX + toBase64Url(JSON.stringify({ v: 1, name: cleanName(name) || 'Shared look', look: sanitizeLook(look) }));
}

// Accepts a share code or the contents of an exported file. Returns { name, look } or null.
function decodeShared(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw || raw.length > MAX_CODE_CHARS) return null;
  let data;
  try {
    data = JSON.parse(raw.startsWith(CODE_PREFIX) ? fromBase64Url(raw.slice(CODE_PREFIX.length).replace(/\s+/g, '')) : raw);
  } catch (_err) { return null; }
  if (!data || typeof data !== 'object' || data.v !== 1 || !data.look || typeof data.look !== 'object') return null;
  return { name: cleanName(data.name) || 'Imported look', look: sanitizeLook(data.look) };
}

function exportFileText(name, look) {
  return JSON.stringify({ v: 1, app: 'Dyrelog', name: cleanName(name) || 'My look', look: sanitizeLook(look) }, null, 2);
}

function createPresetStore({ file, readJson, writeJsonAtomic }) {
  function load() {
    const saved = readJson(file);
    const list = saved && Array.isArray(saved.presets) ? saved.presets : [];
    return list
      .map((p) => (p && typeof p === 'object' ? { name: cleanName(p.name), look: sanitizeLook(p.look), savedAt: typeof p.savedAt === 'string' ? p.savedAt : null } : null))
      .filter((p) => p && p.name)
      .slice(0, MAX_PRESETS);
  }
  function store(list) { writeJsonAtomic(file, { presets: list }); }
  return {
    list() { return load().map((p) => ({ name: p.name, savedAt: p.savedAt })); },
    get(name) { return load().find((p) => p.name === cleanName(name)) || null; },
    // Saving under an existing name replaces that preset.
    save(name, look) {
      const clean = cleanName(name);
      if (!clean) return { ok: false, error: 'Give the preset a name.' };
      const list = load().filter((p) => p.name !== clean);
      if (list.length >= MAX_PRESETS) return { ok: false, error: `You can keep up to ${MAX_PRESETS} presets. Delete one first.` };
      list.push({ name: clean, look: sanitizeLook(look), savedAt: new Date().toISOString() });
      list.sort((a, b) => a.name.localeCompare(b.name));
      store(list);
      return { ok: true, name: clean };
    },
    remove(name) {
      const clean = cleanName(name);
      store(load().filter((p) => p.name !== clean));
      return { ok: true };
    },
  };
}

module.exports = { sanitizeLook, lookFromSettings, encodeShareCode, decodeShared, exportFileText, createPresetStore, cleanName, CODE_PREFIX };
