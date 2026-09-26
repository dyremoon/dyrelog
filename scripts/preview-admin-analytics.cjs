const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

function demoData() {
  const days = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 8, i + 1)).toISOString().slice(0, 10),
    active: 12 + i * 2 + i % 5, new_installs: i % 4 + 1, downloads: i % 7 + 4,
  }));
  return {
    summary: { active_today: 74, active_yesterday: 71, average_7: 67, average_30: 43,
      monthly_active_installs: 186, weekly_active_installs: 112, known_installations: 240,
      downloads_today: 5, downloads_7: 49, downloads_30: 205, total_download_requests: 680 },
    daily: { days },
    versions: { versions: [{ version: '0.1.15', installs: 149, percentage: 80.1 }, { version: '0.1.14', installs: 37, percentage: 19.9 }] },
    downloads: { versions: [{ version: 'v0.1.15', requests: 520 }, { version: 'v0.1.14', requests: 160 }],
      github: { total: 1250, complete: true, versions: [{ version: 'v0.1.15', downloads: 900 }, { version: 'v0.1.14', downloads: 350 }] } },
  };
}

if (require.main === module) {
  const root = path.resolve(__dirname, '../frontend');
  const data = demoData();
  const allowed = new Set(['admin.html', 'js/app.js', 'js/admin-analytics.js', 'css/dyrelog.css', 'css/admin-analytics.css',
    'assets/favicon-32.png', 'assets/logo-180.png', 'assets/logo-64.png']);
  http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1:8788').pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (pathname.startsWith('/api/')) {
      const result = pathname === '/api/me' ? { user: { username: 'DEMO admin' }, isAdmin: true }
        : pathname === '/api/admin/queue' ? { items: [] } : data[pathname.replace('/api/admin/analytics/', '')];
      response.writeHead(result ? 200 : 404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result || { error: 'demo_only' }));
      return;
    }
    const file = pathname === '/' ? 'admin.html' : pathname.slice(1);
    if (!allowed.has(file)) { response.writeHead(404); response.end(); return; }
    try {
      let bytes = await fs.readFile(path.join(root, file));
      if (file === 'admin.html') bytes = Buffer.from(bytes.toString()
        .replace('https://dyrelog-api.dyremoon.workers.dev', 'http://127.0.0.1:8788')
        .replace('<main>', '<main><p class="plate">LOCAL DEMO — synthetic data. No production analytics access.</p>'));
      const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' }[path.extname(file)];
      response.writeHead(200, { 'Content-Type': type }); response.end(bytes);
    } catch { response.writeHead(500); response.end('Preview unavailable'); }
  }).listen(8788, '127.0.0.1', () => console.log('Synthetic analytics preview: http://127.0.0.1:8788/admin.html (Ctrl+C to stop)'));
}

module.exports = { demoData };
