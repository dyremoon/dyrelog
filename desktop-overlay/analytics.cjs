const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function installId(directory) {
  const file = path.join(directory, 'dyrelog-install-id');
  try {
    const id = (await fs.readFile(file, 'utf8')).trim();
    return UUID.test(id) ? id : null;
  } catch (error) {
    if (error.code !== 'ENOENT') return null;
  }
  const id = randomUUID();
  try { await fs.writeFile(file, id, { flag: 'wx', mode: 0o600 }); return id; }
  catch (error) {
    if (error.code === 'EEXIST') return installId(directory);
    return null;
  }
}

const CONSENT_VERSION = 1;
function hasConsent(settings) {
  return settings?.analyticsConsent?.version === CONSENT_VERSION && settings.analyticsConsent.enabled === true;
}

function createReporter({ directory, version, platform, apiBase, fetchImpl = fetch, isAllowed = () => false }) {
  let pending = false;
  let id;
  let stopped = false;
  let controller;
  async function report() {
    if (pending || stopped) return;
    pending = true;
    try {
      if (!isAllowed()) return;
      id ||= await installId(directory);
      if (!id || stopped || !isAllowed()) return;
      controller = new AbortController();
      await fetchImpl(apiBase + '/api/analytics/active', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ install_id: id, app_version: version, platform }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
      });
    } catch { /* Telemetry must never interrupt the application. */ }
    finally { pending = false; controller = null; }
  }
  report.stop = () => { stopped = true; controller?.abort(); };
  return report;
}

function startAnalytics(options) {
  const report = createReporter(options);
  void report();
  const timer = setInterval(() => { void report(); }, 15 * 60 * 1000);
  timer.unref();
  return () => { clearInterval(timer); report.stop(); };
}

module.exports = { createReporter, startAnalytics, hasConsent, CONSENT_VERSION };
