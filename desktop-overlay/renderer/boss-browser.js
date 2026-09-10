(function (root) {
  function key(name) { return String(name || '').trim().toLowerCase().replace(/[-\s]+/g, ' '); }
  function groupBosses(bosses) {
    var groups = new Map();
    bosses.forEach(function (boss) {
      var nameKey = key(boss.name);
      if (!groups.has(nameKey)) groups.set(nameKey, Object.assign({}, boss, { difficulty: null, tiers: [], entrant_count: 0 }));
      var group = groups.get(nameKey);
      group.tiers.push(boss);
      group.entrant_count += Number(boss.entrant_count) || 0;
      if (!group.category && boss.category) group.category = boss.category;
    });
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
  function rankRows(rows, difficulties, sort) {
    return rows.filter(row => difficulties.includes(row.difficulty || 'D0'))
      .slice().sort(function (a, b) {
        var tier = Number((b.difficulty || 'D0').slice(1)) - Number((a.difficulty || 'D0').slice(1));
        return (sort === 'difficulty' ? tier : 0) || b.dps - a.dps || Number(a.encounter_id) - Number(b.encounter_id);
      });
  }
  var api = { key, groupBosses, rankRows };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BossBrowser = api;
})(typeof window !== 'undefined' ? window : globalThis);
