(function(root) {
  function needsSetup(settings) {
    return !settings.firstRunSetupComplete && !settings.autoSubmitChosen;
  }
  function permitsSubmission(settings) {
    return !!settings.autoSubmitChosen && ['ask', 'auto'].includes(settings.autoSubmitMode);
  }
  function completion(mode, authenticated) {
    if (!['off', 'ask', 'auto'].includes(mode)) throw new Error('Choose a submission option.');
    if (mode !== 'off' && !authenticated) throw new Error('Sign in with Discord to enable public submissions.');
    return { firstRunSetupComplete: true, autoSubmitChosen: true, autoSubmitMode: mode };
  }
  const api = { needsSetup, permitsSubmission, completion };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FirstRunPolicy = api;
})(typeof window !== 'undefined' ? window : globalThis);
