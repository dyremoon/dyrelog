const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createReporter, startAnalytics, hasConsent } = require('../analytics.cjs');

async function options(t, fetchImpl) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dyrelog-analytics-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, version: '0.1.15', platform: 'win32', apiBase: 'https://api.test', fetchImpl, isAllowed: () => true };
}

test('install ID survives launches and only the allowed fields are sent', async t => {
  const events = [];
  const opts = await options(t, async (url, request) => {
    assert.equal(url, 'https://api.test/api/analytics/active');
    assert.ok(request.signal);
    events.push(JSON.parse(request.body));
    return { ok: true };
  });
  await createReporter(opts)();
  await createReporter(opts)();
  assert.equal(events.length, 2);
  assert.equal(events[0].install_id, events[1].install_id);
  assert.match(events[0].install_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(Object.keys(events[0]).sort(), ['app_version', 'install_id', 'platform']);
});

test('network and backend errors never escape and later reports can retry', async t => {
  let count = 0;
  const report = createReporter(await options(t, async () => {
    count++;
    if (count === 1) throw new Error('network offline');
    return { ok: false, status: 503 };
  }));
  await assert.doesNotReject(report());
  await assert.doesNotReject(report());
  assert.equal(count, 2);
});

test('unwritable storage and corrupt IDs suppress telemetry without breaking app', async t => {
  let count = 0;
  const opts = await options(t, async () => { count++; });
  await fs.writeFile(path.join(opts.directory, 'dyrelog-install-id'), 'corrupt');
  await assert.doesNotReject(createReporter(opts)());
  await assert.doesNotReject(createReporter({ ...opts, directory: path.join(opts.directory, 'missing', 'child') })());
  assert.equal(count, 0);
});

test('startup is synchronous and nonblocking even when backend never responds', async t => {
  const opts = await options(t, async () => new Promise(() => {}));
  const stop = startAnalytics(opts);
  assert.equal(typeof stop, 'function');
  stop();
});

test('missing, declined, stale and malformed consent never count as opt-in', () => {
  for (const settings of [{}, { analyticsConsent: true }, { analyticsConsent: { enabled: true } },
    { analyticsConsent: { version: 0, enabled: true } }, { analyticsConsent: { version: 1, enabled: 'true' } },
    { analyticsConsent: { version: 1, enabled: false } }]) assert.equal(hasConsent(settings), false);
  assert.equal(hasConsent({ analyticsConsent: { version: 1, enabled: true } }), true);
});

test('without consent neither an installation ID nor a network request is created', async t => {
  let calls = 0;
  const opts = await options(t, async () => { calls++; });
  const report = createReporter({ ...opts, isAllowed: undefined });
  await report();
  await assert.rejects(fs.stat(path.join(opts.directory, 'dyrelog-install-id')), { code: 'ENOENT' });
  assert.equal(calls, 0);
});

test('withdrawal aborts an in-flight report and permanently stops that reporter', async t => {
  let calls = 0;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  let signal;
  const opts = await options(t, async (url, request) => {
    calls++;
    signal = request.signal;
    started();
    await new Promise((resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  });
  const report = createReporter(opts);
  const pending = report();
  await ready;
  report.stop();
  await pending;
  await report();
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
});

test('a changed consent preference is checked before each new report', async t => {
  let allowed = true;
  let calls = 0;
  const report = createReporter({ ...await options(t, async () => { calls++; }), isAllowed: () => allowed });
  await report();
  allowed = false;
  await report();
  assert.equal(calls, 1);
});
