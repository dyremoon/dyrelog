// Shared helpers across all frontend pages. No build step/bundler — plain
// script tags, loaded after this file.

const API_BASE = window.DYRELOG_API_BASE || 'http://127.0.0.1:8787';

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

async function renderAuthNav() {
  const slot = document.getElementById('auth-slot');
  if (!slot) return;
  try {
    const { user } = await api('/api/me');
    slot.innerHTML = user
      ? `<a href="./profile.html">My Profile (${capitalizeName(user.username)})</a>`
      : `
        <a href="./profile.html">My Profile</a>
        <a class="btn btn-brass" href="${API_BASE}/api/auth/login">Log in with Discord</a>
      `;
  } catch (err) {
    slot.innerHTML = `<span class="muted">Can't reach the API</span>`;
  }
}

function capitalizeName(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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
  return difficulty ? (DIFFICULTY_LABELS[difficulty] || difficulty) : 'Base';
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
      <span id="footer-version"></span>
    </div>

    <div class="footer-row">
      Created by <strong>Dyremoon - Freeport</strong>
      <span>•</span>
      <a href="https://github.com/dyremoon/dyrelog" target="_blank" rel="noopener">GitHub</a>
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
  if (!slot) return;
  try {
    const res = await fetch('https://api.github.com/repos/dyremoon/dyrelog/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return;
    const data = await res.json();
    const tag = data && data.tag_name;
    if (!tag) return;
    slot.innerHTML = `
      <span>•</span>
      <a href="https://github.com/dyremoon/dyrelog/releases/latest" target="_blank" rel="noopener">${tag}</a>
    `;
  } catch (err) {
    // Offline, DNS hiccup, no releases published yet — never worth surfacing.
  }
}

document.addEventListener('DOMContentLoaded', renderSiteFooter);