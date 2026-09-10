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
