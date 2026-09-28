// Shared helpers across all frontend pages. No build step/bundler — plain
// script tags, loaded after this file.

const API_BASE = window.DYRELOG_API_BASE || 'http://127.0.0.1:8787';

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
  } catch (err) {
    // Cloudflare's own limit pages carry no CORS headers, so they surface here as network errors.
    showServerNotice(false);
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`);
    err.limit = res.status === 429 || res.status === 503;
    if (err.limit) showServerNotice(true);
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const LOGIN_PROBLEMS = {
  cancelled: 'Discord login was cancelled. You can log in any time from the top of the page.',
  expired: 'That login link expired. Click "Log in with Discord" to try again.',
  failed: "Discord login didn't finish. Try again in a minute.",
};

// Shown once after the server sends a failed or cancelled login back here.
function showLoginProblem() {
  const params = new URLSearchParams(window.location.search);
  const text = LOGIN_PROBLEMS[params.get('login')];
  const main = document.querySelector('main');
  if (!text || !main) return;
  const notice = document.createElement('div');
  notice.className = 'server-notice';
  notice.setAttribute('role', 'status');
  notice.textContent = text;
  main.insertBefore(notice, main.firstChild);
  params.delete('login');
  const query = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
}
document.addEventListener('DOMContentLoaded', showLoginProblem);

// One banner per page, above the content, so pages never look blank or broken when the server is limited.
function showServerNotice(atLimit) {
  const main = document.querySelector('main');
  if (!main) return;
  let notice = document.getElementById('server-notice');
  if (notice && notice.dataset.limit === 'true') return;
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'server-notice';
    notice.className = 'server-notice';
    notice.setAttribute('role', 'status');
    main.insertBefore(notice, main.firstChild);
  }
  notice.dataset.limit = String(atLimit);
  notice.textContent = atLimit
    ? "Dyrelog's leaderboards are temporarily unavailable because the server is at its daily limit. They'll be back after midnight UTC. Kills from the app are saved and sent then."
    : "Dyrelog's leaderboards are temporarily unavailable. Check your connection or try again in a little while.";
}

// Several parts of a page need the signed-in user; they share one request.
let mePromise = null;
function getMe() {
  if (!mePromise) mePromise = api('/api/me').catch((err) => { mePromise = null; throw err; });
  return mePromise;
}

async function renderAuthNav() {
  const slot = document.getElementById('auth-slot');
  if (!slot) return;
  const adminLink = document.getElementById('nav-admin-link');
  try {
    const { user, isAdmin } = await getMe();
    if (adminLink) adminLink.hidden = !isAdmin;
    slot.innerHTML = user
      ? `<a href="./profile.html">My Profile (${esc(capitalizeName(user.username))})</a>`
      : `
        <a href="./profile.html">My Profile</a>
        <a class="btn btn-brass" href="${API_BASE}/api/auth/login">Log in with Discord</a>
      `;
  } catch (err) {
    slot.innerHTML = `<span class="muted">Can't reach the server</span>`;
  }
}

function capitalizeName(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Escapes text before it lands inside an innerHTML template literal. Every
// user-controlled or attacker-reachable string rendered anywhere on the
// site (character names, realms, class combos, Discord usernames, boss
// names, admin review notes, anti-cheat flag reasons) MUST go through this
// first — the worker only validates type/length on most of these fields,
// never HTML-safety, so escaping at render time is the actual boundary.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// A character's name linking to their public page (plain text if the row has no character ID).
function playerLink(row) {
  const name = esc(row.character_name);
  const link = Number.isInteger(row.character_id) ? `<a href="./player.html?id=${row.character_id}">${name}</a>` : name;
  return `${link} <span class="muted">(${esc(row.realm)})</span>`;
}

function fmtNumber(n) {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString();
}

// Date only, no time-of-day — used in leaderboard tables where the full
// timestamp was more precision than the row needed.
function fmtDateOnly(iso) {
  return new Date(iso).toLocaleDateString();
}

const DIFFICULTY_LABELS = { D1: 'D1 · Awakened', D2: 'D2 · Adaptive', D3: 'D3 · Fused', D4: 'D4 · Refined' };
function fmtDifficulty(difficulty) {
  return difficulty ? (DIFFICULTY_LABELS[difficulty] || difficulty) : 'D0';
}

const EQ_CLASSES = [
  'Berserker', 'Warrior', 'Cleric', 'Bard', 'Paladin', 'Necromancer',
  'Ranger', 'Druid', 'Monk', 'Beastlord', 'Magician', 'Shaman',
  'Rogue', 'Shadow Knight', 'Wizard', 'Enchanter'
];

document.addEventListener('DOMContentLoaded', renderAuthNav);

function renderSiteFooter() {
  const footer = document.querySelector('.site-footer');
  if (!footer) return;

  footer.innerHTML = `
    <div class="footer-row">
      <strong>Dyrelog</strong>
      <span>•</span>
      <a href="./index.html">Leaderboards</a>
      <span>•</span>
      <a href="./analyze.html">Analyze Log</a>
      <span>•</span>
      <a href="./about.html">About</a>
      <span>•</span>
      <a href="./download.html">Download Dyrelog</a>
      <span>•</span>
      <a href="./privacy.html">Privacy</a>
      <span id="footer-version"></span>
    </div>

    <div class="footer-row">
      Created by <strong>Dyremoon - Freeport</strong>
      <span>•</span>
      <a href="https://github.com/dyremoon/dyrelog" target="_blank" rel="noopener">GitHub</a>
      <span>•</span>
      <a href="https://ko-fi.com/dyremoon" target="_blank" rel="noopener">Buy me a coffee on Ko-fi</a>
      <span>•</span>
      <a href="https://github.com/dyremoon/dyrelog/issues/new" target="_blank" rel="noopener">
        Report a bug or submit feedback
      </a>
    </div>

    <div class="footer-row footer-disclaimer">
      Dyrelog is an unofficial project and is not affiliated with
      Daybreak Game Company or EverQuest Legends.
    </div>
  `;

  loadFooterVersion();
}

async function loadFooterVersion() {
  const slot = document.getElementById('footer-version');
  const downloadLabel = document.getElementById('download-version');
  if (!slot && !downloadLabel) return;
  try {
    const res = await fetch('https://api.github.com/repos/dyremoon/dyrelog/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return;
    const data = await res.json();
    const tag = data && typeof data.tag_name === 'string' ? data.tag_name : '';
    if (!/^v?\d+\.\d+\.\d+$/.test(tag)) return;
    if (slot) {
      slot.innerHTML = `
      <span>•</span>
      <a href="https://github.com/dyremoon/dyrelog/releases/latest" target="_blank" rel="noopener">${esc(tag)}</a>
    `;
    }
    if (downloadLabel) downloadLabel.textContent = 'Latest version: ' + (tag.startsWith('v') ? tag : 'v' + tag);
  } catch (err) {
    // Offline, DNS hiccup, no releases published yet — never worth surfacing.
  }
}

document.addEventListener('DOMContentLoaded', renderSiteFooter);
