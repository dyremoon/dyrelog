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
    if (user) {
      slot.innerHTML = `
        <a class="muted" href="./profile.html">${user.username}</a>
        <button class="btn" id="logout-btn">Log out</button>
      `;
      document.getElementById('logout-btn').addEventListener('click', async () => {
        await api('/api/auth/logout', { method: 'POST' });
        window.location.reload();
      });
    } else {
      slot.innerHTML = `<a class="btn btn-brass" href="${API_BASE}/api/auth/login">Log in with Discord</a>`;
    }
  } catch (err) {
    slot.innerHTML = `<span class="muted">Can't reach the API</span>`;
  }
}

function fmtNumber(n) {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString();
}

document.addEventListener('DOMContentLoaded', renderAuthNav);
