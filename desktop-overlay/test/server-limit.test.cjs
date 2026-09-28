const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const LimitPolicy = require('../limit-policy.cjs');

const NOW = Date.UTC(2026, 8, 27, 18, 30, 0);
const MIDNIGHT = Date.UTC(2026, 8, 28);
const noJitter = () => 0;

test('recognizes the Worker daily-limit answer and waits until just after midnight UTC', () => {
  const body = JSON.stringify({ error: 'daily_limit', retryAfter: (MIDNIGHT - NOW) / 1000 });
  const limit = LimitPolicy.parseLimit(503, body, null, NOW, noJitter);
  assert.deepEqual(limit, { until: MIDNIGHT, daily: true });
  const jittered = LimitPolicy.parseLimit(503, body, null, NOW, () => 0.999);
  assert.ok(jittered.until > MIDNIGHT && jittered.until <= MIDNIGHT + 10 * 60000, 'retries are spread over ten minutes');
});

test('recognizes Cloudflare 1027 and 1015 pages and plain 429s', () => {
  const daily = LimitPolicy.parseLimit(429, '<title>Worker exceeded resource limits</title> error code: 1027', null, NOW, noJitter);
  assert.equal(daily.daily, true);
  assert.equal(daily.until, MIDNIGHT + 60000);
  const burst = LimitPolicy.parseLimit(429, 'error code: 1015', '120', NOW, noJitter);
  assert.deepEqual(burst, { until: NOW + 120000, daily: false });
  assert.equal(LimitPolicy.parseLimit(429, '', null, NOW).until, NOW + 60000, 'defaults to a minute');
  assert.equal(LimitPolicy.parseLimit(429, '', '999999', NOW).until, NOW + 3600000, 'never waits more than an hour on a 429');
});

test('ordinary errors are not treated as a limit', () => {
  assert.equal(LimitPolicy.parseLimit(500, '{"error":"internal_error"}', null, NOW), null);
  assert.equal(LimitPolicy.parseLimit(503, 'Service Unavailable', null, NOW), null);
  assert.equal(LimitPolicy.parseLimit(403, '{"error":"cross_site_origin_rejected"}', null, NOW), null);
});

test('decides which kills can still pass anti-cheat when sent later', () => {
  assert.equal(LimitPolicy.canSubmitLater({ startTime: 0, endTime: 15000 }).ok, true, 'short fights need no live upload');
  assert.equal(LimitPolicy.canSubmitLater({ startTime: 0, endTime: 180000, existingSubmissionId: 5, liveBatches: 40 }).ok, true, 'a long fight that streamed can finish later');
  const never = LimitPolicy.canSubmitLater({ startTime: 0, endTime: 180000, existingSubmissionId: null, liveBatches: 0 });
  assert.equal(never.ok, false);
  assert.match(never.reason, /daily limit/);
  assert.match(never.reason, /still in your fight history/);
  assert.equal(LimitPolicy.canSubmitLater({ startTime: 0, endTime: 180000, existingSubmissionId: 5, liveBatches: 0 }).ok, false, 'an opened but empty stream does not count as live');
});

// Runs main.js's real limit code (apiFetch, submit, pending queue, stream IPC) with Electron and the network stubbed out.
function mainHarness({ responses = [], stored = null } = {}) {
  const source = readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const code = source.slice(source.indexOf('// Thrown instead of calling the server'), source.indexOf('ipcMain.handle("login-with-discord"'))
    + source.slice(source.indexOf('// startTimes already sent this session'), source.indexOf('function createSettingsWindow('));
  const calls = [], popup = [], results = [], timers = [], files = {};
  const handlers = {}, listeners = {};
  let now = NOW;
  const queue = responses.slice();
  const ctx = {
    console: { error() {}, log() {} }, Promise, Set, Error, JSON, Math, Number, Array, String, Object, AbortSignal,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    app: { getPath: () => 'C:/userData', getVersion: () => '0.1.20' }, path,
    readJson: (p) => (p in files ? files[p] : stored),
    writeJsonAtomic: (p, v) => { files[p] = JSON.parse(JSON.stringify(v)); },
    isPlainObject: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
    LimitPolicy: Object.assign({}, LimitPolicy, { parseLimit: (st, body, ra) => LimitPolicy.parseLimit(st, body, ra, now, noJitter) }),
    API_BASE: 'https://api.test',
    loadAuth: () => ({ sessionCookie: 'c' }), saveAuth() {}, broadcastAuthUpdate() {},
    fetch: async (url, opts) => {
      calls.push(url.replace('https://api.test', ''));
      const r = queue.shift() || { status: 200, body: {} };
      if (r.hang) return new Promise(() => {});
      if (r.offline) throw new TypeError('fetch failed');
      const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
      const res = {
        ok: r.status < 400, status: r.status,
        headers: { get: (h) => (r.headers || {})[h] || null },
        text: async () => text, json: async () => JSON.parse(text),
      };
      res.clone = () => res;
      return res;
    },
    askQueue: [], loginQueue: [], popupState: null, uploadsInFlight: 0,
    loadSettings: () => ({}), FirstRunPolicy: { permitsSubmission: () => true },
    normalizeSubmitPayload: (p) => p,
    recordSubmission() {}, submissionSounds: { notify() {} },
    friendlyNetworkError: (e) => String((e && e.message) || e),
    sendToSubmitPopup: (channel, data) => popup.push({ channel, data }),
    submitPopupWin: { isDestroyed: () => false, close() {}, webContents: { send: (c, d) => results.push(d) } },
    ipcMain: { handle: (n, fn) => { handlers[n] = fn; }, on: (n, fn) => { listeners[n] = fn; } },
  };
  vm.createContext(ctx);
  vm.runInContext(code +'\nthis.pendingState = () => pending; this.loadPending = loadPending; this.sendPendingKills = sendPendingKills;', ctx);
  // The slice also defines the real popup window helpers; keep the stubs.
  ctx.sendToSubmitPopup = (channel, data) => popup.push({ channel, data });
  ctx.normalizeSubmitPayload = (p) => p;
  const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
  return { ctx, calls, popup, results, timers, files, handlers, listeners, flush, advance: (ms) => { now += ms; } };
}

const LIMIT = { status: 503, body: { error: 'daily_limit', retryAfter: (MIDNIGHT - NOW) / 1000 }, headers: { 'Retry-After': String((MIDNIGHT - NOW) / 1000) } };
const shortKill = { mode: 'auto', mobName: 'Lady Vox', characterName: 'Tester', realm: 'freeport', startTime: 1000, endTime: 16000, liveBatches: 0, existingSubmissionId: null, batches: ['a', 'b'] };

test('a short kill that hits the daily limit is saved and the player is told in plain words', async () => {
  const h = mainHarness({ responses: [LIMIT] });
  h.handlers['request-submit']({}, Object.assign({}, shortKill, { batches: shortKill.batches.slice() }));
  await h.flush();
  const shown = h.results.at(-1);
  assert.equal(shown.queued, true);
  assert.match(shown.error, /^Dyrelog's server is at its daily limit\. Your kill is saved and will be sent after /);
  assert.equal(h.ctx.pendingState().kills.length, 1);
  assert.ok(h.files['C:\\userData\\dyrelog-pending-kills.json'] || Object.values(h.files)[0], 'saved to disk');
  assert.ok(h.timers.at(-1).ms >= MIDNIGHT - NOW, 'retry waits until the reset');
});

test('while paused, nothing is sent to the server, even for new kills or live streams', async () => {
  const h = mainHarness({ responses: [LIMIT] });
  h.handlers['request-submit']({}, Object.assign({}, shortKill, { batches: ['a'] }));
  await h.flush();
  assert.equal(h.calls.length, 1);
  h.handlers['request-submit']({}, Object.assign({}, shortKill, { startTime: 2000, endTime: 9000, batches: ['c'] }));
  const stream = await h.handlers['start-live-stream']({}, { characterName: 'Tester', realm: 'freeport' });
  const batch = await h.handlers['push-live-batch']({}, 7, 'chunk');
  await h.flush();
  assert.equal(h.calls.length, 1, 'no further requests');
  assert.equal(JSON.stringify(stream), '{"ok":false,"error":"server_limit"}');
  assert.equal(JSON.stringify(batch), '{"ok":false,"error":"server_limit"}');
  assert.equal(h.ctx.pendingState().kills.length, 2);
});

test('the same kill is only saved once', async () => {
  const h = mainHarness({ responses: [LIMIT] });
  h.handlers['request-submit']({}, Object.assign({}, shortKill, { batches: ['a'] }));
  await h.flush();
  h.handlers['request-submit']({}, Object.assign({}, shortKill, { batches: ['a'] }));
  await h.flush();
  assert.equal(h.ctx.pendingState().kills.length, 1);
});

test('a long fight that never streamed is not saved, and the popup says why', async () => {
  const h = mainHarness({ responses: [LIMIT] });
  h.handlers['request-submit']({}, Object.assign({}, shortKill, { endTime: 181000, batches: ['a'] }));
  await h.flush();
  const shown = h.results.at(-1);
  assert.notEqual(shown.queued, true);
  assert.match(shown.error, /Long fights have to be uploaded while they happen/);
  assert.equal(h.ctx.pendingState().kills.length, 0);
});

test('a live-streamed kill interrupted mid-upload resumes where it stopped after the reset', async () => {
  const OK = { status: 200, body: { ok: true } };
  const h = mainHarness({ responses: [OK, LIMIT] });
  h.handlers['request-submit']({}, { mode: 'auto', mobName: 'Cazic-Thule', characterName: 'T', realm: 'r', startTime: 5000, endTime: 185000, existingSubmissionId: 9, liveBatches: 40, batches: ['x', 'y'] });
  await h.flush();
  assert.deepEqual(h.calls, ['/api/streams/9/batches', '/api/streams/9/batches']);
  const saved = h.ctx.pendingState().kills[0];
  assert.deepEqual(Array.from(saved.batches), ['y'], 'the accepted chunk is not sent again');

  h.listeners['submit-popup:done']();
  h.advance(MIDNIGHT - NOW + 11 * 60000);
  h.calls.length = 0;
  await h.ctx.sendPendingKills();
  assert.deepEqual(h.calls, ['/api/streams/9/batches', '/api/streams/9/finalize']);
  assert.equal(h.ctx.pendingState().kills.length, 0);
  assert.equal(h.popup.at(-1).data.title, 'Saved kill sent');
});

test('saved kills survive a restart and are retried only after the pause, one limit answer stops the run', async () => {
  const stored = { pauseUntil: MIDNIGHT + 60000, kills: [Object.assign({}, shortKill, { batches: ['a'] }), Object.assign({}, shortKill, { startTime: 3000, batches: ['b'] })] };
  const h = mainHarness({ stored, responses: [LIMIT] });
  h.ctx.loadPending();
  await h.ctx.sendPendingKills();
  assert.equal(h.calls.length, 0, 'still paused, so no requests');

  h.advance(MIDNIGHT - NOW + 2 * 60000);
  await h.ctx.sendPendingKills();
  assert.equal(h.calls.length, 1, 'stopped at the first limit answer instead of trying every kill');
  assert.equal(h.ctx.pendingState().kills.length, 2);
  assert.ok(h.ctx.pendingState().pauseUntil > MIDNIGHT + 2 * 60000, 'paused again');
});

test('a saved kill the server no longer accepts is dropped with a message instead of retrying forever', async () => {
  const stored = { pauseUntil: 0, kills: [{ mode: 'auto', mobName: 'Lady Vox', startTime: 1, endTime: 200000, existingSubmissionId: 4, liveBatches: 10, batches: [] }] };
  const h = mainHarness({ stored, responses: [{ status: 404, body: { error: 'not_found' } }] });
  h.ctx.loadPending();
  await h.ctx.sendPendingKills();
  assert.equal(h.ctx.pendingState().kills.length, 0);
  assert.equal(h.popup.at(-1).data.ok, false);
  assert.match(h.popup.at(-1).data.error, /Lady Vox/);
});

test('the live stream stops for the rest of the fight once the server reports its limit', () => {
  const app = readFileSync(path.join(__dirname, '../renderer/app.js'), 'utf8');
  assert.match(app, /res\.error === "server_limit" \|\| res\.error === "update_required"\)\) stream\.limited = true/);
  assert.match(app, /if \(stream\.limited \|\|/);
  assert.match(app, /liveBatches: stream \? stream\.accepted : 0/);
});

test('limit-policy.cjs is packaged', () => {
  assert.ok(require('../package.json').build.files.includes('limit-policy.cjs'));
});

// The website's shared api() helper, with a fake page.
function site(fetchImpl) {
  const src = readFileSync(path.join(__dirname, '../../frontend/js/app.js'), 'utf8');
  const main = { children: [], insertBefore(el) { this.children.unshift(el); }, firstChild: null };
  const byId = {};
  const document = {
    querySelector: (s) => (s === 'main' ? main : null),
    getElementById: (id) => byId[id] || null,
    createElement: () => { const el = { dataset: {}, setAttribute() {} }; return new Proxy(el, { set(t, k, v) { t[k] = v; if (k === 'id') byId[v] = t; return true; } }); },
    addEventListener() {},
  };
  const context = { window: { location: { pathname: '/index.html' } }, document, fetch: fetchImpl };
  vm.createContext(context);
  vm.runInContext(src, context);
  return { context, main };
}

test('website shows a friendly banner instead of a blank page when the server is at its limit', async () => {
  const { context, main } = site(async () => ({ ok: false, status: 503, json: async () => ({ error: 'daily_limit' }) }));
  await assert.rejects(context.api('/api/bosses'), (err) => err.limit === true);
  await assert.rejects(context.api('/api/leaderboard/highlights'));
  assert.equal(main.children.length, 1, 'one banner, not one per request');
  assert.match(main.children[0].textContent, /leaderboards are temporarily unavailable/);
  assert.match(main.children[0].textContent, /midnight UTC/);
});

test('website shows the banner when Cloudflare blocks the request outright', async () => {
  const { context, main } = site(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(context.api('/api/bosses'));
  assert.match(main.children[0].textContent, /temporarily unavailable/);
});

test('website errors that are not limits show no banner', async () => {
  const { context, main } = site(async () => ({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) }));
  await assert.rejects(context.api('/api/encounters/1'), (err) => !err.limit);
  assert.equal(main.children.length, 0);
});

test('a kill that was uploading when the app closed is kept on disk with its progress and resumed on the next start', async () => {
  const OK = { status: 200, body: { ok: true } };
  const h = mainHarness({ responses: [{ status: 200, body: { submissionId: 12 } }, OK, { hang: true }] });
  h.handlers['request-submit']({}, Object.assign({}, shortKill, { batches: ['a', 'b', 'c'] }));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  // The app "closes" here: whatever was last written to disk is what the next start sees.
  const onDisk = JSON.parse(JSON.stringify(Object.values(h.files).at(-1)));
  assert.equal(onDisk.inflight.length, 1);
  assert.equal(onDisk.inflight[0].existingSubmissionId, 12);
  assert.ok(onDisk.inflight[0].batches.length < 3, 'accepted chunks are not kept for resending');

  const next = mainHarness({ stored: onDisk });
  next.ctx.loadPending();
  assert.equal(next.ctx.pendingState().kills.length, 1);
  await next.ctx.sendPendingKills();
  assert.ok(next.calls.every((c) => c.startsWith('/api/streams/12/')), 'resumes the same upload: ' + next.calls.join(','));
  assert.equal(next.calls.at(-1), '/api/streams/12/finalize');
  assert.equal(next.ctx.pendingState().kills.length, 0);
});

test('a saved kill the server already finished is dropped quietly, not reported as a failure', async () => {
  const stored = { pauseUntil: 0, kills: [{ mode: 'auto', mobName: 'Lady Vox', characterName: 'T', realm: 'r', startTime: 1, endTime: 9000, existingSubmissionId: 4, liveBatches: 0, batches: [] }] };
  const h = mainHarness({ stored, responses: [{ status: 409, body: { error: 'already_finalized' } }] });
  h.ctx.loadPending();
  await h.ctx.sendPendingKills();
  assert.equal(h.ctx.pendingState().kills.length, 0);
  assert.ok(!h.popup.some((p) => p.data && p.data.ok === false), 'no error popup');
});

test('a corrupted saved-kills file is ignored instead of crashing the app', () => {
  for (const stored of ['garbage', 42, { kills: 'nope' }, { kills: [null, 5, { mode: 'x' }] }]) {
    const h = mainHarness({ stored });
    h.ctx.normalizeSubmitPayload = (p) => (p && typeof p === 'object' && p.characterName ? p : null);
    h.ctx.loadPending();
    assert.equal(h.ctx.pendingState().kills.length, 0);
  }
});

test('every request tells the server which app version sent it', () => {
  const src = readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  assert.match(src, /headers\["X-Dyrelog-Version"\] = app\.getVersion\(\);/);
});

test('a kill whose login expired mid-upload waits for the player to log back in', async () => {
  const h = mainHarness({ responses: [{ status: 401, body: { error: 'unauthorized' } }] });
  let loggedIn = true;
  h.ctx.loadAuth = () => (loggedIn ? { sessionCookie: 'c' } : null);
  h.ctx.saveAuth = () => { loggedIn = false; };
  h.handlers['request-submit']({}, Object.assign({}, shortKill, { batches: ['a'] }));
  await h.flush();
  assert.equal(h.ctx.loginQueue.length, 1);
  assert.equal(h.popup.at(-1).data.needsLogin, true);
});

test('no internet: the kill is saved and retried with growing gaps, not dropped', async () => {
  const h = mainHarness({ responses: [{ offline: true }, { offline: true }, { status: 200, body: { submissionId: 3 } }, { status: 200, body: {} }, { status: 200, body: { submissionId: 3, status: 'verified' } }] });
  h.handlers['request-submit']({}, Object.assign({}, shortKill, { batches: ['a'] }));
  await h.flush();
  assert.equal(h.results.at(-1).queued, true);
  assert.match(h.results.at(-1).error, /Couldn't reach the Dyrelog server\. Your kill is saved/);
  assert.equal(h.ctx.pendingState().kills.length, 1);
  assert.equal(h.timers.at(-1).ms, 60000, 'first retry after a minute');
  await h.ctx.sendPendingKills();
  assert.equal(h.ctx.pendingState().kills.length, 1, 'still offline: kept');
  assert.equal(h.timers.at(-1).ms, 120000, 'then waits longer');
  await h.ctx.sendPendingKills();
  assert.equal(h.ctx.pendingState().kills.length, 0, 'sent once the connection is back');
});

test('a server error (Worker or database down) saves the kill instead of losing it', async () => {
  const h = mainHarness({ responses: [{ status: 502, body: '<html>Bad gateway</html>' }] });
  h.handlers['request-submit']({}, Object.assign({}, shortKill, { batches: ['a'] }));
  await h.flush();
  assert.equal(h.results.at(-1).queued, true);
  assert.equal(h.ctx.pendingState().kills.length, 1);
});

test('a long fight that could not stream because the server was unreachable says so plainly', async () => {
  const h = mainHarness({ responses: [{ offline: true }] });
  h.handlers['request-submit']({}, Object.assign({}, shortKill, { endTime: 200000, batches: ['a'] }));
  await h.flush();
  assert.notEqual(h.results.at(-1).queued, true);
  assert.match(h.results.at(-1).error, /couldn't reach its server while this fight was happening/);
});
