const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAuthStore } = require('../auth-store.cjs');

// Reversible stand-in for OS encryption; the real DPAPI round trip is covered by a separate Electron check.
const fakeSafeStorage = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from('enc:' + Buffer.from(s).toString('hex')),
  decryptString: (b) => {
    const t = b.toString();
    if (!t.startsWith('enc:')) throw new Error('bad');
    return Buffer.from(t.slice(4), 'hex').toString();
  },
});
const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dyrelog-auth-')), 'dyrelog-auth.json');
const LOGIN = { sessionCookie: 'secret-cookie-value', userId: '1', username: 'dyremoon', avatarUrl: null };

test('the cookie is never written in plain text', () => {
  const f = file();
  createAuthStore({ file: f, safeStorage: fakeSafeStorage() }).save(LOGIN);
  const text = fs.readFileSync(f, 'utf8');
  assert.ok(!text.includes('secret-cookie-value'));
  assert.ok(JSON.parse(text).sessionCookieEncrypted);
  assert.deepEqual(createAuthStore({ file: f, safeStorage: fakeSafeStorage() }).load(), LOGIN, 'restart keeps you logged in');
});

test('an existing plain-text login is kept and converted, including its backup copy', () => {
  const f = file();
  fs.writeFileSync(f, JSON.stringify(LOGIN));
  fs.writeFileSync(f + '.bak', JSON.stringify(LOGIN));
  const loaded = createAuthStore({ file: f, safeStorage: fakeSafeStorage() }).load();
  assert.deepEqual(loaded, LOGIN, 'not logged out by the upgrade');
  assert.ok(!fs.readFileSync(f, 'utf8').includes('secret-cookie-value'));
  assert.ok(!fs.existsSync(f + '.bak'), 'old plain-text backup removed');
});

test('a login that cannot be decrypted (another Windows account) just logs out', () => {
  const f = file();
  fs.writeFileSync(f, JSON.stringify({ version: 2, userId: '1', username: 'x', sessionCookieEncrypted: Buffer.from('garbage').toString('base64') }));
  assert.equal(createAuthStore({ file: f, safeStorage: fakeSafeStorage() }).load(), null);
  assert.ok(!fs.existsSync(f));
});

test('logout removes the file and backups', () => {
  const f = file();
  const store = createAuthStore({ file: f, safeStorage: fakeSafeStorage() });
  store.save(LOGIN);
  store.save(null);
  assert.equal(store.load(), null);
  assert.ok(!fs.existsSync(f) && !fs.existsSync(f + '.bak'));
});

test('without OS encryption it still works instead of failing', () => {
  const f = file();
  createAuthStore({ file: f, safeStorage: fakeSafeStorage(false) }).save(LOGIN);
  assert.deepEqual(createAuthStore({ file: f, safeStorage: fakeSafeStorage(false) }).load(), LOGIN);
});
