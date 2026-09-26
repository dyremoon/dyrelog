const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '../scripts/release-check.js');
const version = require('../package.json').version;
const exe = `Dyrelog-Setup-${version}.exe`;

function makeDist({ ymlName = exe, size, sha } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyrelog-dist-'));
  const data = crypto.randomBytes(4096);
  const realSha = crypto.createHash('sha512').update(data).digest('base64');
  fs.writeFileSync(path.join(dir, exe), data);
  fs.writeFileSync(path.join(dir, exe + '.blockmap'), 'x');
  fs.writeFileSync(path.join(dir, 'latest.yml'), [
    `version: ${version}`, 'files:', `  - url: ${ymlName}`, `    sha512: ${sha || realSha}`, `    size: ${size || data.length}`,
    `path: ${ymlName}`, `sha512: ${sha || realSha}`, "releaseDate: '2026-09-26T00:00:00.000Z'", '',
  ].join('\n'));
  return dir;
}
const run = dir => spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });

test('release check passes for a matching build', () => {
  const r = run(makeDist());
  assert.equal(r.status, 0, r.stderr);
});

test('release check fails when latest.yml names a differently spelled installer (the v0.1.7 bug)', () => {
  const r = run(makeDist({ ymlName: `Dyrelog.Setup.${version}.exe` }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /path/);
});

test('release check fails on a wrong size or hash', () => {
  assert.equal(run(makeDist({ size: 1 })).status, 1);
  assert.equal(run(makeDist({ sha: 'AAAA' })).status, 1);
});

test('release check fails when an artifact is missing or an old installer is left behind', () => {
  const dir = makeDist();
  fs.unlinkSync(path.join(dir, exe + '.blockmap'));
  assert.equal(run(dir).status, 1);
  const dir2 = makeDist();
  fs.writeFileSync(path.join(dir2, 'Dyrelog-Setup-0.0.1.exe'), 'old');
  assert.match(run(dir2).stderr, /other versions/);
});
