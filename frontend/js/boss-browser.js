(function (root) {
  function key(name) { return String(name || '').trim().toLowerCase().replace(/[-\s]+/g, ' '); }
  function groupBosses(bosses) {
    var groups = new Map();
    bosses.forEach(function (boss) {
      var nameKey = key(boss.name);
      if (!groups.has(nameKey)) groups.set(nameKey, Object.assign({}, boss, { difficulty: null, tiers: [], entrant_count: 0 }));
      var group = groups.get(nameKey);
      if (group.tiers.some(function (tier) { return tier.id === boss.id; })) return;
      group.tiers.push(boss);
      group.entrant_count += Math.min(50, Number(boss.entrant_count) || 0);
      if (!group.category && boss.category) group.category = boss.category;
    });
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
  function rankRows(rows, difficulties, sort) {
    return uniqueRows(rows).filter(row => difficulties.includes(row.difficulty || 'D0'))
      .slice().sort(function (a, b) {
        var tier = Number((b.difficulty || 'D0').slice(1)) - Number((a.difficulty || 'D0').slice(1));
        return (sort === 'difficulty' ? tier : 0) || b.dps - a.dps || Number(a.encounter_id) - Number(b.encounter_id);
      });
  }
  function uniqueRows(rows) {
    var best = new Map();
    rows.forEach(function (row, index) {
      var identity = row.character_name ? JSON.stringify([key(row.character_name), key(row.realm), key(row.boss_name), row.difficulty || 'D0']) : 'unknown:' + index;
      var old = best.get(identity);
      if (!old || Number(row.dps) > Number(old.dps) || (Number(row.dps) === Number(old.dps) && Number(row.encounter_id) > Number(old.encounter_id))) best.set(identity, row);
    });
    return Array.from(best.values());
  }
  function wikiUrl(name) {
    var title = String(name || '').trim().replace(/\s*\+\d+\s*$/, '');
    if (key(title) === 'cazic thule') title = 'Cazic-Thule';
    return 'https://eqlwiki.com/index.php?search=' + encodeURIComponent(title) + '&title=Special%3ASearch&go=Go';
  }
  var api = { key, groupBosses, rankRows, uniqueRows, wikiUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BossBrowser = api;
})(typeof window !== 'undefined' ? window : globalThis);
