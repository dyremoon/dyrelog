const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Analytics = require('../analytics.cjs');

function consentHarness(initial = {}) {
  const source = readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  let stored = structuredClone(initial);
  const handlers = {};
  const state = { prompts: 0, starts: 0, stops: 0, response: 0, failSave: false };
  const sender = {};
  const context = {
    Analytics: { ...Analytics, startAnalytics() { state.starts++; return () => { state.stops++; }; } },
    app: { isPackaged: true, getPath: () => '/test', getVersion: () => '1.0.0' },
    process: { env: {}, platform: 'win32' }, API_BASE: 'https://api.test', stopAnalytics: null,
    loadSettings: () => structuredClone(stored), saveSettings(value) { if (state.failSave) throw Error('disk'); stored = structuredClone(value); },
    win: { isDestroyed: () => false }, settingsWin: { isDestroyed: () => false, webContents: sender },
    dialog: { async showMessageBox(parent, options) { state.prompts++; state.options = options; return { response: state.response }; } },
    ipcMain: { handle(name, fn) { handlers[name] = fn; } },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function syncAnalyticsConsent()'), source.indexOf("ipcMain.handle('complete-first-run'")), context);
  return { context, state, stored: () => stored, set: enabled => handlers['set-analytics-consent']({ sender }, enabled), handlers };
}

test('existing installs with no consent stay off; declining is persisted and never nagged again', async () => {
  const h = consentHarness({ firstRunSetupComplete: true });
  h.state.response = 2;
  h.context.syncAnalyticsConsent();
  assert.equal(h.state.starts, 0);
  await h.context.showAnalyticsConsent();
  assert.equal(h.state.options.defaultId, 2, 'Enter must decline, not opt in');
  assert.equal(h.state.options.cancelId, 2);
  assert.equal(h.stored().analyticsConsent.enabled, false);
  await h.context.showAnalyticsConsent();
  assert.equal(h.state.prompts, 1);
  assert.equal(h.state.starts, 0);
});

test('explicit Allow starts reporting and Settings withdrawal stops it; preference survives relaunch', async () => {
  const h = consentHarness();
  h.state.response = 0;
  await h.context.showAnalyticsConsent();
  assert.equal(h.state.starts, 1);
  assert.equal(h.stored().analyticsConsent.version, 1);
  assert.ok(h.stored().analyticsConsent.decidedAt);
  h.set(false);
  assert.equal(h.state.stops, 1);
  const relaunched = consentHarness(h.stored());
  relaunched.context.syncAnalyticsConsent();
  await relaunched.context.showAnalyticsConsent();
  assert.equal(relaunched.state.starts, 0);
  assert.equal(relaunched.state.prompts, 0);
});

test('saving consent failure cannot activate telemetry and only the Settings sender may change it', async () => {
  const h = consentHarness();
  h.state.response = 0;
  h.state.failSave = true;
  await h.context.showAnalyticsConsent();
  assert.equal(h.state.starts, 0);
  assert.equal(h.stored().analyticsConsent, undefined);
  assert.throws(() => h.handlers['set-analytics-consent']({ sender: {} }, true), /Open Settings/);
  assert.throws(() => h.set('true'), /Choose whether/);
});

test('development launches and environment override stay off even after consent', () => {
  const h = consentHarness({ analyticsConsent: { version: 1, enabled: true } });
  h.context.app.isPackaged = false;
  h.context.syncAnalyticsConsent();
  assert.equal(h.state.starts, 0);
  h.context.app.isPackaged = true;
  h.context.process.env.DYRELOG_DISABLE_ANALYTICS = '1';
  h.context.syncAnalyticsConsent();
  assert.equal(h.state.starts, 0);
});

test('Learn More shows the full notice without consenting, then returns to the short choice', async () => {
  const h = consentHarness();
  const prompts = [];
  const responses = [1, 2, 0];
  h.context.dialog.showMessageBox = async (parent, options) => {
    prompts.push(options);
    assert.equal(h.state.starts, 0);
    assert.equal(h.stored().analyticsConsent, undefined);
    return { response: responses.shift() };
  };
  await h.context.showAnalyticsConsent();
  assert.equal(prompts.length, 3);
  assert.equal(prompts[0].message, 'Share usage statistics?');
  assert.match(prompts[0].detail, /random install ID/);
  assert.ok(prompts[0].detail.length < 300);
  assert.ok(prompts[0].buttons.includes('Learn More'));
  assert.equal(JSON.stringify(prompts[0].buttons), JSON.stringify(['Allow', 'Learn More', 'No thanks']));
  assert.match(prompts[1].detail, /hardware ID/);
  assert.match(prompts[1].detail, /no automatic expiry/);
  assert.equal(prompts[2].message, prompts[0].message);
  assert.equal(h.stored().analyticsConsent.enabled, true);
  assert.equal(h.state.starts, 1);
});

test('Settings checkbox loads off and requires a user change to opt in, then supports withdrawal', async () => {
  let stored = {};
  let writes = 0;
  const checkbox = { disabled: true, addEventListener(event, fn) { this.change = fn; } };
  const status = {};
  const source = readFileSync(path.join(__dirname, '../renderer/analytics-settings.js'), 'utf8');
  await vm.runInNewContext(source, {
    document: { getElementById: id => id === 'allow-usage-analytics' ? checkbox : status },
    window: { dyrelog: { getSettings: async () => stored, setAnalyticsConsent: async enabled => {
      writes++; stored = { analyticsConsent: { version: 1, enabled } }; return stored;
    } } },
  });
  assert.equal(checkbox.checked, false);
  assert.equal(writes, 0);
  checkbox.checked = true;
  await checkbox.change();
  assert.equal(stored.analyticsConsent.enabled, true);
  checkbox.checked = false;
  await checkbox.change();
  assert.equal(stored.analyticsConsent.enabled, false);
  assert.match(status.textContent, /Off/);
});
