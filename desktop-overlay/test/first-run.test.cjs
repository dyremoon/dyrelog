const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../renderer/first-run-policy.js');

test('new installs cannot submit until a choice is made; existing choices are preserved', () => {
  const fresh = { autoSubmitMode: 'ask', autoSubmitChosen: false };
  assert.equal(policy.needsSetup(fresh), true);
  assert.equal(policy.permitsSubmission(fresh), false);
  assert.equal(policy.needsSetup({ autoSubmitChosen: true }), false);
  const declined = policy.completion('off', false);
  assert.equal(policy.needsSetup(declined), false);
  assert.equal(policy.permitsSubmission(declined), false);
});

test('public onboarding requires Discord for both ask and automatic submission', () => {
  for (const mode of ['ask', 'auto']) {
    assert.throws(() => policy.completion(mode, false), /Discord/);
    const accepted = policy.completion(mode, true);
    assert.equal(policy.needsSetup(accepted), false);
    assert.equal(policy.permitsSubmission(accepted), true);
    assert.equal(JSON.parse(JSON.stringify(accepted)).autoSubmitMode, mode);
  }
  assert.throws(() => policy.completion('unknown', true), /Choose/);
});
