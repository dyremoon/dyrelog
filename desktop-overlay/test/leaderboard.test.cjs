const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SubmissionView = require('../renderer/submission-view.js');

test('My Kills renders current visibility, opens the encounter permalink, and reacts to moderation', async () => {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', hidden: false, listeners: {}, dataset: {},
      querySelectorAll() { return ['D0', 'D1', 'D2', 'D3', 'D4'].map(value => ({ value, addEventListener() {} })); },
      querySelector() { return { addEventListener() {} }; },
      addEventListener(event, handler) { this.listeners[event] = handler; }
    });
    return elements.get(id);
  };
  let timer;
  let stateListener;
  let authListener;
  let opened;
  let rows = [{ submission_id: 7, encounter_id: 42, start_time: new Date(1000).toISOString(), visibility: 'public', status: 'verified' }];
  const state = { encounters: [{ mobKilled: true, mobName: 'Master Yael', startTime: 1000, submissionId: 7 }] };
  const context = {
    document: { hidden: false, getElementById: getElement, documentElement: { setAttribute() {} } },
    EQP: { computeStats: () => ({ rows: [{ name: 'You', dps: 100, damage: 950 }] }) },
    SubmissionView,
    BossBrowser: require('../renderer/boss-browser.js'),
    fetch: async () => ({ ok: true, json: async () => ({ bosses: [{ id: 1, name: 'Master Yael' }], boss: { id: 1, name: 'Master Yael' }, highlights: [], encounter: { boss_name: 'Master Yael', start_time: new Date(1000).toISOString(), raid_dps: 100, killed: true }, parses: [{ character_name: 'You', realm: 'povar', dps: 100, damage: 950 }] }) }),
    setTimeout: callback => { timer = callback; }, clearTimeout() {}, setInterval() {},
    window: {
      addEventListener() {},
      dyrelog: {
        getState: async () => state,
        onStateUpdate: callback => { stateListener = callback; },
        onAuthUpdate: callback => { authListener = callback; },
        getSubmissionStatuses: async () => ({ ok: true, submissions: rows }),
        getSettings: async () => ({}), onSettingsUpdate() {},
        openExternal: url => { opened = url; }, openAnalysisFight: key => { opened = 'analysis:' + key; }
      }
    }
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, '../renderer/leaderboard.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  await timer();
  const list = getElement('personal-list');
  assert.match(list.innerHTML, /data-sort-key="visibility">Visibility/);
  assert.match(list.innerHTML, /<td>Public<\/td>/);
  assert.match(list.innerHTML, /data-fight-key="1000"/);
  list.listeners.click({ target: { closest: selector => selector.startsWith('.view-lb-link') ? { dataset: { fightKey: '1000' } } : null } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(opened, 'analysis:1000');
  assert.equal(opened, 'analysis:1000');
  rows = [{ ...rows[0], status: 'removed' }];
  await timer();
  assert.match(list.innerHTML, /Removed/);
  assert.doesNotMatch(list.innerHTML, /data-encounter-id/);
  stateListener({ encounters: [{ ...state.encounters[0], submissionId: null }] });
  assert.match(list.innerHTML, /Local only/);
  stateListener(state);
  authListener(null);
  assert.match(list.innerHTML, /Unknown/);
});

test('My Kills difficulty dropdown stays open while the meter sends its once-a-second updates', async () => {
  const elements = new Map();
  let writes = 0;
  const select = { tagName: 'SELECT', blur() {}, addEventListener(event, handler) { this.onchange = handler; } };
  const getElement = id => {
    if (!elements.has(id)) {
      let html = '';
      elements.set(id, {
        get innerHTML() { return html; }, set innerHTML(v) { html = v; if (id === 'personal-list') writes++; },
        hidden: false, listeners: {}, dataset: {},
        contains: node => node === select,
        querySelectorAll() { return []; },
        querySelector() { return select; },
        addEventListener(event, handler) { this.listeners[event] = handler; }
      });
    }
    return elements.get(id);
  };
  const document = { hidden: false, activeElement: null, getElementById: getElement, documentElement: { setAttribute() {} } };
  let stateListener;
  const kill = (startTime, difficulty, mobName = 'Master Yael') => ({ mobKilled: true, mobName, startTime, difficulty, difficultyKnown: true });
  const context = {
    document,
    EQP: { computeStats: () => ({ rows: [{ name: 'You', dps: 100, damage: 950 }] }) },
    SubmissionView, BossBrowser: require('../renderer/boss-browser.js'),
    fetch: async () => ({ ok: true, json: async () => ({ bosses: [{ id: 1, name: 'Master Yael' }, { id: 2, name: 'Lord of Ire' }], highlights: [] }) }),
    setTimeout: callback => { callback(); }, clearTimeout() {}, setInterval() {},
    window: {
      addEventListener() {},
      dyrelog: {
        getState: async () => ({ encounters: [kill(1000, 'D1')] }),
        onStateUpdate: callback => { stateListener = callback; }, onAuthUpdate() {},
        getSubmissionStatuses: async () => ({ ok: true, submissions: [] }),
        getSettings: async () => ({}), onSettingsUpdate() {}, openExternal() {}, openAnalysisFight() {}
      }
    }
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, '../renderer/leaderboard.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  const list = getElement('personal-list');
  const settled = writes;

  for (let i = 0; i < 5; i++) stateListener({ encounters: [kill(1000, 'D1')] });
  assert.equal(writes, settled, 'an unchanged list is not rebuilt every second');

  document.activeElement = select; // the player opened the dropdown
  stateListener({ encounters: [kill(1000, 'D1'), kill(2000, 'D2', 'Lord of Ire')] });
  assert.equal(writes, settled, 'a new kill does not tear down the open dropdown');

  document.activeElement = null; // closed it without choosing
  list.listeners.focusout();
  assert.equal(writes, settled + 1, 'the update shows once the dropdown closes');
  assert.match(list.innerHTML, /Lord of Ire/);

  document.activeElement = select;
  select.onchange({ target: { value: 'D2', blur() { document.activeElement = null; } } });
  assert.match(list.innerHTML, /Lord of Ire/);
  assert.doesNotMatch(list.innerHTML, /Master Yael/, 'picking a difficulty filters the list');
});

test('player names in the leaderboard window open their page on the website', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../renderer/leaderboard.js'), 'utf8');
  assert.match(src, /data-player-id="' \+ row\.character_id/);
  assert.match(src, /openExternal\(SITE_BASE \+ '\/player\.html\?id=' \+ Number\(button\.dataset\.playerId\)\)/);
  assert.ok(require('../link-policy.cjs').isAllowedExternalUrl('https://dyrelog.pages.dev/player.html?id=7'));
});
