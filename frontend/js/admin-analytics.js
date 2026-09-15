(async function () {
  const section = document.getElementById('admin-analytics');
  const content = document.getElementById('analytics-content');
  const status = document.getElementById('analytics-status');
  const button = document.getElementById('analytics-refresh');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
  function chart(days, key, title) {
    const max = Math.max(1, ...days.map(day => day[key]));
    return `<div><h3>${title}</h3><p class="muted">Peak: ${number(Math.max(...days.map(day => day[key])))}</p>
      <div class="analytics-bars" role="img" aria-label="${title}; exact values in the daily table below">${days.map(day =>
        `<div class="analytics-bar ${key === 'downloads' ? 'analytics-download-bar' : ''}" style="height:${day[key] / max * 100}%" title="${day.date}: ${day[key]}"></div>`).join('')}</div>
      <div class="analytics-axis"><span>${days[0].date}</span><span>${days.at(-1).date}</span></div></div>`;
  }
  async function refresh() {
    button.disabled = true;
    status.textContent = 'Loading analytics…';
    try {
      const [s, daily, v, d] = await Promise.all(['summary', 'daily?days=30', 'versions', 'downloads'].map(name => api('/api/admin/analytics/' + name)));
      const cards = [['Active today', s.active_today], ['Active yesterday', s.active_yesterday], ['7-day average', s.average_7],
        ['30-day active installs', s.monthly_active_installs], ['Download requests today', s.downloads_today], ['Total download requests', s.total_download_requests]];
      content.innerHTML = `<div class="analytics-cards">${cards.map(([label, value]) => `<div class="analytics-card"><strong>${number(value)}</strong><span>${label}</span></div>`).join('')}</div>
        <p>7-day active installs: <strong>${number(s.weekly_active_installs)}</strong> · 30-day average: <strong>${number(s.average_30)}</strong> · Known installations: <strong>${number(s.known_installations)}</strong></p>
        <p>Download requests: last 7 days <strong>${number(s.downloads_7)}</strong> · last 30 days <strong>${number(s.downloads_30)}</strong></p>
        <div class="analytics-charts">${chart(daily.days, 'active', 'Daily Active Installs — last 30 days')}${chart(daily.days, 'downloads', 'Download requests — last 30 days')}</div>
        <h3>Active app versions</h3><p class="muted">Latest reported version per installation active in the last 30 UTC days.</p>
        ${v.versions.length ? v.versions.map(row => `<div class="analytics-version"><span>${escape(row.version)}</span><meter min="0" max="100" value="${row.percentage}" aria-label="${escape(row.version)} share"></meter><span>${number(row.percentage)}% · ${number(row.installs)}</span></div>`).join('') : '<p class="muted">No activity recorded yet.</p>'}
        <h3>Downloads by version</h3><p class="muted">Requests through the website redirect, not unique people or completed downloads. GitHub counts include direct downloads and updates; never add the two sources together.</p>
        <div class="analytics-table"><table><thead><tr><th>Version</th><th>Website requests</th></tr></thead><tbody>${d.versions.map(row => `<tr><td>${escape(row.version)}</td><td>${number(row.requests)}</td></tr>`).join('') || '<tr><td colspan="2">No requests recorded yet.</td></tr>'}</tbody></table></div>
        <h3>GitHub installer downloads</h3>${d.github ? `<p>${d.github.complete ? 'Cumulative' : 'Partial'} installer asset count: <strong>${number(d.github.total)}</strong> · cached up to 5 minutes.</p><div class="analytics-table"><table><thead><tr><th>Version</th><th>GitHub downloads</th></tr></thead><tbody>${d.github.versions.map(row => `<tr><td>${escape(row.version)}</td><td>${number(row.downloads)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">GitHub counts are temporarily unavailable.</p>'}
        <div class="analytics-table"><table><caption>Daily totals (UTC)</caption><thead><tr><th>Date</th><th>Active installs</th><th>Newly observed installs</th><th>Download requests</th></tr></thead><tbody>${[...daily.days].reverse().map(row => `<tr><td>${row.date}</td><td>${number(row.active)}</td><td>${number(row.new_installs)}</td><td>${number(row.downloads)}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted">Today is incomplete. Averages include today and zero-activity dates. Newly observed installs include existing users upgrading to analytics-enabled releases. Offline use is not counted; reset IDs and fabricated IDs can affect totals.</p>`;
      status.textContent = 'Updated ' + new Date().toLocaleTimeString();
    } catch (error) {
      content.replaceChildren();
      if (['unauthorized', 'forbidden'].includes(error.message)) section.hidden = true;
      status.textContent = 'Analytics unavailable. Try refreshing.';
    } finally { button.disabled = false; }
  }
  try {
    const me = await api('/api/me');
    if (!me.isAdmin) return;
    section.hidden = false;
    button.addEventListener('click', refresh);
    await refresh();
  } catch { /* The moderation area handles sign-in and connectivity errors. */ }
})();
