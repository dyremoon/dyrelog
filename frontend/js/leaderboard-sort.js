(function (root) {
  function value(row, key) {
    if (key === 'difficulty') return Number(String(row.difficulty || 'D0').replace(/^D/, '')) || 0;
    if (key === 'date') return Date.parse(row.start_time || row.end_time || '') || 0;
    const fields = { character: 'character_name', boss: 'boss_name', class: 'class_combo' };
    if (fields[key]) return String(row[fields[key]] || '').toLowerCase();
    if (key === 'visibility' || key === 'status') return String(row[key] || '').toLowerCase();
    return Number(row[key]) || 0;
  }
  function sort(rows, state) {
    return rows.slice().sort((a, b) => {
      const av = value(a, state.key), bv = value(b, state.key);
      return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * state.dir;
    });
  }
  function toggle(state, key) {
    if (state.key === key) state.dir *= -1;
    else { state.key = key; state.dir = ['dps', 'damage', 'date', 'difficulty', 'killed'].includes(key) ? -1 : 1; }
  }
  function header(label, key, state) {
    return `<button type="button" class="table-sort" data-sort-key="${key}">${label}${state.key === key ? (state.dir < 0 ? ' ↓' : ' ↑') : ''}</button>`;
  }
  function wire(container, state, render) {
    container.querySelectorAll('[data-sort-key]').forEach(button => {
      const active = button.dataset.sortKey === state.key;
      button.closest('th').setAttribute('aria-sort', active ? (state.dir < 0 ? 'descending' : 'ascending') : 'none');
      button.addEventListener('click', () => { toggle(state, button.dataset.sortKey); render(); });
    });
  }
  function difficultyFilter(selected) {
    return '<select class="column-difficulty" aria-label="Filter by difficulty">' +
      ['', 'D0', 'D1', 'D2', 'D3', 'D4'].map(value => `<option value="${value}"${value === selected ? ' selected' : ''}>${value || 'All difficulties'}</option>`).join('') + '</select>';
  }
  function filterDifficulty(rows, selected) {
    return selected ? rows.filter(row => (row.difficulty || 'D0') === selected) : rows.slice();
  }
  function wireDifficulty(container, change) {
    container.querySelector('.column-difficulty').addEventListener('change', event => change(event.target.value));
  }
  const api = { sort, toggle, header, wire, difficultyFilter, filterDifficulty, wireDifficulty };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LeaderboardSort = api;
})(typeof window !== 'undefined' ? window : globalThis);
