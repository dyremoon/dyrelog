const test = require('node:test');
const assert = require('node:assert/strict');
const Appearance = require('../renderer/appearance.js');

test('legacy appearance migrates once and mode changes survive saving and reopening independently', () => {
  let settings = Appearance.migrate({ opacity: .15, textScale: 1.4, secondaryTextScale: 1.2, miniPetTextScale: 1.5 });
  settings.barsOpacity = .8;
  settings.miniTextScale = 1.8;
  settings.circleMiniPetTextScale = 2;
  settings = Appearance.migrate(JSON.parse(JSON.stringify(settings)));
  assert.equal(Appearance.resolve(settings, 'bars').opacity, .8);
  assert.equal(Appearance.resolve(settings, 'mini').opacity, .15);
  assert.equal(Appearance.resolve(settings, 'circle').opacity, .15);
  assert.equal(Appearance.resolve(settings, 'bars').textScale, 1.4);
  assert.equal(Appearance.resolve(settings, 'mini').textScale, 1.8);
  assert.equal(Appearance.resolve(settings, 'circle').textScale, 1.2);
  assert.equal(Appearance.resolve(settings, 'circle').miniPetTextScale, 2);
  assert.equal(Appearance.resolve(settings, 'mini').miniPetTextScale, 1.5);
});

test('zero background opacity survives migration and malformed sizes are bounded', () => {
  const settings = Appearance.migrate({ opacity: 0, miniIconScale: 100, circleTextScale: 'bad' });
  assert.equal(Appearance.resolve(settings, 'bars').opacity, 0);
  assert.equal(Appearance.resolve(settings, 'mini').iconScale, 1.6);
  assert.equal(Appearance.resolve(settings, 'circle').textScale, 1);
});
