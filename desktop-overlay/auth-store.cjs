// Stores the Discord login with the session cookie encrypted by the OS (Windows DPAPI via Electron safeStorage).
const fs = require('node:fs');
const { readJson, writeJsonAtomic, removeJson } = require('./json-store.cjs');

function createAuthStore({ file, safeStorage }) {
  let cache;

  function canEncrypt() {
    try { return safeStorage.isEncryptionAvailable(); } catch (_err) { return false; }
  }

  function write(auth) {
    const record = { version: 2, userId: auth.userId, username: auth.username, avatarUrl: auth.avatarUrl || null };
    if (canEncrypt()) {
      record.sessionCookieEncrypted = safeStorage.encryptString(auth.sessionCookie).toString('base64');
    } else {
      // No OS encryption available (rare); keep the user logged in rather than failing.
      record.sessionCookie = auth.sessionCookie;
    }
    writeJsonAtomic(file, record, 2);
    // The backup would hold the previous record, possibly a plain-text cookie.
    try { fs.unlinkSync(file + '.bak'); } catch (_err) { /* none */ }
  }

  function load() {
    if (cache !== undefined) return cache;
    const raw = readJson(file);
    cache = null;
    if (!raw || typeof raw !== 'object') return cache;
    let cookie = null;
    if (typeof raw.sessionCookieEncrypted === 'string') {
      try { cookie = safeStorage.decryptString(Buffer.from(raw.sessionCookieEncrypted, 'base64')); }
      catch (_err) { cookie = null; }
      // Unreadable (e.g. copied from another Windows account): treat as logged out.
      if (!cookie) { removeJson(file); return cache; }
    } else if (typeof raw.sessionCookie === 'string' && raw.sessionCookie) {
      cookie = raw.sessionCookie;
    } else {
      return cache;
    }
    cache = { sessionCookie: cookie, userId: raw.userId, username: raw.username, avatarUrl: raw.avatarUrl || null };
    // Older versions stored the cookie in plain text; re-save it encrypted.
    if (typeof raw.sessionCookie === 'string' && canEncrypt()) write(cache);
    return cache;
  }

  function save(auth) {
    if (!auth) { cache = null; removeJson(file); return; }
    write(auth);
    cache = { sessionCookie: auth.sessionCookie, userId: auth.userId, username: auth.username, avatarUrl: auth.avatarUrl || null };
  }

  return { load, save };
}

module.exports = { createAuthStore };
