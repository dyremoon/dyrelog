(function (root) {
  function createCompletedKillQueue() {
    var seen = new WeakSet();
    return function (encounters, visit) {
      encounters.forEach(function (encounter) {
        if (seen.has(encounter)) return;
        seen.add(encounter);
        visit(encounter);
      });
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createCompletedKillQueue };
  else root.createCompletedKillQueue = createCompletedKillQueue;
})(typeof window !== 'undefined' ? window : globalThis);
