const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Runs main.js's real submit-popup code with Electron and the network stubbed out.
function harness({ loggedIn = true } = {}) {
  const source = readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const code = source.slice(source.indexOf('// startTimes already sent this session'), source.indexOf('function createSettingsWindow('));
  const shown = [], results = [], submitted = [];
  const handlers = {}, listeners = {};
  let closed = 0;
  let resolveUpload;
  const ctx = {
    console, Promise, Set,
    askQueue: [], loginQueue: [], popupState: null, uploadsInFlight: 0,
    pending: { inflight: [], kills: [], pauseUntil: 0 }, savePending() {},
    loadSettings: () => ({}), FirstRunPolicy: { permitsSubmission: () => true },
    normalizeSubmitPayload: (p) => p, loadAuth: () => (ctx.auth ? {} : null), auth: loggedIn,
    performSubmit: (p) => { submitted.push(p.mobName); return new Promise((r) => { resolveUpload = () => r({ submissionId: 1, status: 'verified', visibility: 'public' }); }); },
    recordSubmission() {}, submissionSounds: { notify() {} }, friendlyNetworkError: (e) => String(e),
    sendToSubmitPopup: (channel, data) => shown.push(data),
    submitPopupWin: { isDestroyed: () => false, close: () => { closed++; }, webContents: { send: (c, d) => results.push(d) } },
    ipcMain: { handle: (n, fn) => { handlers[n] = fn; }, on: (n, fn) => { listeners[n] = fn; } },
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const kill = (name, t) => handlers['request-submit']({}, { mode: 'ask', mobName: name, startTime: t });
  const flush = () => new Promise((r) => setImmediate(r));
  return { ctx, shown, results, submitted, listeners, kill, flush, closed: () => closed, finishUpload: () => resolveUpload() };
}

test('a second kill waits instead of replacing the unanswered first one', () => {
  const h = harness();
  h.kill('Lady Vox', 1);
  h.kill('Lord Nagafen', 2);
  assert.equal(h.shown.at(-1).mobName, 'Lady Vox', 'still asking about the first kill');
  assert.equal(h.shown.at(-1).waiting, 1, 'and says one more is waiting');
  h.listeners['submit-popup:discard']();
  assert.equal(h.shown.at(-1).mobName, 'Lord Nagafen', 'next kill shown after discarding the first');
  assert.equal(h.shown.at(-1).waiting, 0);
  h.listeners['submit-popup:discard']();
  assert.equal(h.closed(), 1, 'popup closes when nothing is left');
});

test('submitting the first kill shows the second once the result is done', async () => {
  const h = harness();
  h.kill('Lady Vox', 1);
  h.listeners['submit-popup:confirm']();
  h.kill('Lord Nagafen', 2); // arrives while the first is uploading
  assert.ok(h.shown.at(-1).pending, 'upload in progress is not interrupted');
  h.finishUpload();
  await h.flush();
  assert.equal(h.results.at(-1).waiting, 1);
  h.listeners['submit-popup:done']();
  assert.equal(h.shown.at(-1).mobName, 'Lord Nagafen');
  assert.deepEqual([...h.submitted], ['Lady Vox']);
});

test('confirm can only submit each kill once', async () => {
  const h = harness();
  h.kill('Lady Vox', 1);
  h.listeners['submit-popup:confirm']();
  h.listeners['submit-popup:confirm']();
  assert.equal(h.submitted.length, 1);
});

test('kills that finish while logged out are all kept for after login', () => {
  const h = harness({ loggedIn: false });
  h.kill('Lady Vox', 1);
  h.kill('Lord Nagafen', 2);
  assert.equal(h.ctx.loginQueue.length, 2);
  assert.equal(h.shown.at(-1).needsLogin, true);
  assert.equal(h.shown.at(-1).waiting, 2);
});
