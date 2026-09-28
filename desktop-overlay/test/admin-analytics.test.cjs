const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { demoData } = require('../../scripts/preview-admin-analytics.cjs');
const source = readFileSync(path.join(__dirname, '../../frontend/js/admin-analytics.js'), 'utf8');

test('admin page includes analytics assets and matches the site theme protection', () => {
  const html = readFileSync(path.join(__dirname, '../../frontend/admin.html'), 'utf8');
  for (const text of ['id="admin-analytics"', './js/admin-analytics.js', './css/admin-analytics.css', 'name="darkreader-lock"']) assert.ok(html.includes(text), text);
});

test('shared navigation shows the Admin link only to admins, and never renders raw usernames', async () => {
  const appSource = readFileSync(path.join(__dirname, '../../frontend/js/app.js'), 'utf8');
  for (const isAdmin of [true, false]) {
    const slot = {};
    const adminLink = { hidden: true };
    const context = { window: { location: { pathname: '/index.html' } },
      document: { getElementById: id => id === 'nav-admin-link' ? adminLink : slot, addEventListener() {}, querySelector: () => null },
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ user: { username: '<user>' }, isAdmin }) }) };
    vm.createContext(context);
    vm.runInContext(appSource, context);
    await context.renderAuthNav();
    assert.equal(adminLink.hidden, !isAdmin);
    assert.ok(!slot.innerHTML.includes('<user>'));
  }
  for (const page of ['index', 'about', 'analyze', 'boss', 'download', 'parse', 'player', 'privacy', 'profile', 'admin']) {
    const html = readFileSync(path.join(__dirname, '../../frontend/' + page + '.html'), 'utf8');
    assert.match(html, /id="nav-admin-link"[^>]*hidden/, page + '.html admin link starts hidden');
  }
});

async function render(isAdmin, data = demoData()) {
  const elements = new Map();
  const calls = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: true, innerHTML: '', listeners: {},
      addEventListener(event, fn) { this.listeners[event] = fn; },
      replaceChildren() { this.innerHTML = ''; } });
    return elements.get(id);
  };
  let failure = false;
  await vm.runInNewContext(source, { document: { getElementById: element }, api: async url => {
    calls.push(url);
    if (failure) throw new Error('forbidden');
    if (url === '/api/me') return { isAdmin };
    return data[url.split('/').at(-1).split('?')[0]];
  } });
  return { element, calls, fail: () => { failure = true; } };
}

test('normal visitors never see analytics or request aggregate endpoints', async () => {
  const ui = await render(false);
  assert.equal(ui.element('admin-analytics').hidden, true);
  assert.deepEqual(ui.calls, ['/api/me']);
});

test('admin renders charts, daily table and safely escaped version names; revocation clears data', async () => {
  const data = demoData();
  data.versions.versions[0].version = '<img src=x onerror=alert(1)>';
  const ui = await render(true, data);
  assert.equal(ui.element('admin-analytics').hidden, false);
  const html = ui.element('analytics-content').innerHTML;
  assert.match(html, /Daily Active Installs/);
  assert.match(html, /Daily totals \(UTC\)/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img src=x/);
  ui.fail();
  await ui.element('analytics-refresh').listeners.click();
  assert.equal(ui.element('analytics-content').innerHTML, '');
  assert.equal(ui.element('admin-analytics').hidden, true);
});

test('empty metrics show zero charts and unavailable GitHub is not displayed as zero', async () => {
  const data = demoData();
  data.daily.days.forEach(row => { row.active = 0; row.downloads = 0; row.new_installs = 0; });
  data.versions.versions = [];
  data.downloads = { versions: [], github: null };
  const ui = await render(true, data);
  const html = ui.element('analytics-content').innerHTML;
  assert.match(html, /No activity recorded yet/);
  assert.match(html, /temporarily unavailable/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
