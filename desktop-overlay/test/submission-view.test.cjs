const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'America/Los_Angeles';
const { describeSubmission } = require('../renderer/submission-view.js');

const kill = { submissionId: 7, startTime: 1000 };
const row = { submission_id: 7, encounter_id: 42, start_time: new Date(1000).toISOString(), visibility: 'public', status: 'verified' };

test('local, inaccessible, and offline kills never claim to be private or link publicly', () => {
  assert.equal(describeSubmission({}, null).visibility, 'Local only');
  for (const rows of [null, []]) {
    assert.equal(describeSubmission(kill, rows).visibility, 'Unknown');
    assert.equal(describeSubmission(kill, rows).encounterId, null);
  }
});

test('only verified public submissions link using encounter IDs', () => {
  assert.equal(describeSubmission(kill, [row]).encounterId, 42);
  assert.equal(describeSubmission(kill, [{ ...row, visibility: 'private' }]).encounterId, null);
  for (const status of ['pending_review', 'flagged', 'removed', 'streaming']) {
    assert.equal(describeSubmission(kill, [{ ...row, status }]).encounterId, null);
  }
});

test('multi-encounter submissions select the exact start time and never guess on ambiguity', () => {
  const other = { ...row, encounter_id: 99, start_time: new Date(5000).toISOString() };
  assert.equal(describeSubmission(kill, [other, row]).encounterId, 42);
  assert.equal(describeSubmission({ ...kill, startTime: 9000 }, [other, row]).encounterId, null);
});

test('Protector of Sky matches its UTC-parsed log clock within a multi-encounter submission', () => {
  const localKill = { submissionId: 23, startTime: 1788993778000 };
  const protector = { ...row, submission_id: 23, encounter_id: 14, start_time: '2026-09-09T15:42:58.000Z' };
  const add = { ...protector, encounter_id: 15, start_time: '2026-09-09T15:43:31.000Z' };
  assert.equal(describeSubmission(localKill, [add, protector]).encounterId, 14);
  assert.equal(describeSubmission(localKill, [protector, { ...protector, encounter_id: 16 }]).encounterId, null);
});

test('clock matching uses the encounter date offset, including winter standard time', () => {
  const winter = { submissionId: 23, startTime: new Date(2026, 0, 15, 15, 0, 0).getTime() };
  const target = { ...row, submission_id: 23, start_time: '2026-01-15T15:00:00.000Z' };
  assert.equal(describeSubmission(winter, [target, { ...target, encounter_id: 99, start_time: '2026-01-15T16:00:00.000Z' }]).encounterId, 42);
});
