'use strict';
// Tests of the offline SDK restoration: a simulated fresh clone (only the tracked files), fail-closed behaviour, and the strict tar parser.
// Temporary directories only; no network; the SDK is only unpacked, never executed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const R = require('./restore-sdk.cjs');

const HERE = __dirname;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'tst-rs-')); test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
let n = 0;
function clone() {   // exactly the files Git tracks for this folder that the restore needs
  const d = path.join(ROOT, 'c' + (++n)); fs.mkdirSync(path.join(d, 'pk'), { recursive: true });
  for (const f of ['restore-sdk.cjs', 'SDK-PACKAGE-INVENTORY.sha256']) fs.copyFileSync(path.join(HERE, f), path.join(d, f));
  fs.copyFileSync(path.join(HERE, 'pk', 'stellar-stellar-sdk-17.4.0.tgz'), path.join(d, 'pk', 'stellar-stellar-sdk-17.4.0.tgz'));
  return { d, target: path.join(d, 'pk', 'x-stellar-stellar-sdk-17.4.0', 'package'), tgz: path.join(d, 'pk', 'stellar-stellar-sdk-17.4.0.tgz') };
}
const run = (c, args = []) => spawnSync(process.execPath, [path.join(c.d, 'restore-sdk.cjs'), ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', NO_PROXY: '' } });
const fileHashes = (t) => Object.fromEntries(Object.keys(R.EXPECTED.files).map((rel) => [rel, sha(fs.readFileSync(path.join(t, ...rel.split('/'))))]));

test('restore: the tracked tarball, its inventory and the script are all a fresh clone needs; the extracted package is absent', () => {
  const c = clone(); assert.ok(!fs.existsSync(path.join(c.d, 'pk', 'x-stellar-stellar-sdk-17.4.0'))); assert.equal(sha(fs.readFileSync(c.tgz)), R.EXPECTED.tgzSha256);
});
test('restore: a fresh clone is restored offline; the three files equal the recorded hashes; the version is exactly 17.4.0; a second run is a no-op', () => {
  const c = clone(); let r = run(c, ['--verify-only']); assert.equal(r.status, 1); assert.match(r.stderr, /missing or unreadable/);
  r = run(c); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /SDK RESTORE: OK \(restored and verified/);
  assert.deepEqual(fileHashes(c.target), R.EXPECTED.files);
  assert.equal(JSON.parse(fs.readFileSync(path.join(c.target, 'package.json'), 'utf8')).version, '17.4.0');
  assert.deepEqual(fs.readdirSync(c.target).sort(), ['LICENSE', 'dist', 'package.json']); assert.deepEqual(fs.readdirSync(path.join(c.target, 'dist')), ['stellar-sdk.js']);
  r = run(c); assert.equal(r.status, 0); assert.match(r.stdout, /already restored/); r = run(c, ['--verify-only']); assert.equal(r.status, 0);
});
test('restore: the restored files equal the originals in the repository, the loader constants, and the inventory', () => {
  const c = clone(); assert.equal(run(c).status, 0);
  const loader = fs.readFileSync(path.join(HERE, 'signer', 'sdk-loader.cjs'), 'utf8');
  assert.equal(/EXPECTED_BUNDLE_SHA256 = '([0-9a-f]{64})'/.exec(loader)[1], R.EXPECTED.files['dist/stellar-sdk.js']); assert.equal(/EXPECTED_VERSION = '([^']+)'/.exec(loader)[1], R.EXPECTED.version);
  const inv = fs.readFileSync(path.join(HERE, 'SDK-PACKAGE-INVENTORY.sha256'), 'utf8');
  for (const [rel, h] of Object.entries(R.EXPECTED.files)) assert.ok(inv.includes(`${h}  package/${rel}`), rel);
  const orig = path.join(HERE, 'pk', 'x-stellar-stellar-sdk-17.4.0', 'package');
  if (fs.existsSync(path.join(orig, 'package.json'))) for (const rel of Object.keys(R.EXPECTED.files)) assert.ok(fs.readFileSync(path.join(orig, ...rel.split('/'))).equals(fs.readFileSync(path.join(c.target, ...rel.split('/')))), rel);
});
test('restore: the restored SDK works with the gate (a tree built from the signer files and the restored package has a computable baseline)', () => {
  const c = clone(); assert.equal(run(c).status, 0); const root = path.join(ROOT, 'integ'); const signer = path.join(root, 'signer'); fs.mkdirSync(signer, { recursive: true });
  const baseline = require('./signer/baseline.cjs'); for (const f of baseline.CLOSURE) fs.copyFileSync(path.join(HERE, 'signer', f), path.join(signer, f));
  fs.mkdirSync(path.join(root, 'pk'), { recursive: true }); fs.cpSync(path.join(c.d, 'pk', 'x-stellar-stellar-sdk-17.4.0'), path.join(root, 'pk', 'x-stellar-stellar-sdk-17.4.0'), { recursive: true });
  assert.equal(baseline.computeManifest({ signerDir: signer }).hash, baseline.computeManifest({ signerDir: path.join(HERE, 'signer') }).hash, 'restored SDK gives the same baseline as the original SDK');
});
test('restore: it needs no network: only fs, path, zlib and crypto are imported, and a dead proxy changes nothing', () => {
  const src = fs.readFileSync(path.join(HERE, 'restore-sdk.cjs'), 'utf8'); assert.deepEqual([...src.matchAll(/\brequire\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]).sort(), ['crypto', 'fs', 'path', 'zlib']);
  assert.ok(!/https?:|fetch\(|child_process|spawn|net\.|dns/.test(src.replace(/\/\/.*$/gm, '')));
});

// ------------------------------------------------------------------ fail closed
test('restore: a tampered tarball (one byte), a truncated tarball, a missing tarball and an empty tarball are refused before any extraction', () => {
  for (const mutate of [(b) => { const x = Buffer.from(b); x[200] ^= 1; return x; }, (b) => b.subarray(0, b.length - 100), () => Buffer.alloc(0), (b) => Buffer.concat([b, Buffer.from([0])])]) {
    const c = clone(); fs.writeFileSync(c.tgz, mutate(fs.readFileSync(c.tgz))); const r = run(c); assert.equal(r.status, 1); assert.match(r.stderr, /tarball SHA-256 does not equal/); assert.ok(!fs.existsSync(path.join(c.d, 'pk', 'x-stellar-stellar-sdk-17.4.0')), 'nothing written');
  }
  const c = clone(); fs.rmSync(c.tgz); const r = run(c); assert.equal(r.status, 1); assert.match(r.stderr, /cannot read the SDK tarball/);
});
test('restore: an inventory that is missing or altered is refused', () => {
  let c = clone(); fs.rmSync(path.join(c.d, 'SDK-PACKAGE-INVENTORY.sha256')); let r = run(c); assert.equal(r.status, 1);
  c = clone(); const p = path.join(c.d, 'SDK-PACKAGE-INVENTORY.sha256'); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/^[0-9a-f]/m, (m) => (m === 'a' ? 'b' : 'a')).replace('# SHA-256', '# SHA-256')); r = run(c);
  // the first changed line may be a comment-free hash line of any file: either the count or a hash comparison fails
  assert.equal(r.status, 1); assert.ok(!fs.existsSync(c.target));
  c = clone(); const p3 = path.join(c.d, 'SDK-PACKAGE-INVENTORY.sha256'); fs.writeFileSync(p3, fs.readFileSync(p3, 'utf8').split('\n').slice(0, 100).join('\n') + '\n'); r = run(c); assert.equal(r.status, 1); assert.match(r.stderr, /lists \d+ files, expected 6293/);
});
test('restore: existing files that differ are never overwritten; a partial restore completes only the missing files', () => {
  let c = clone(); fs.mkdirSync(c.target, { recursive: true }); fs.writeFileSync(path.join(c.target, 'package.json'), '{"name":"@stellar/stellar-sdk","version":"17.4.1"}\n');
  let r = run(c); assert.equal(r.status, 1); assert.match(r.stderr, /refusing to overwrite/); assert.equal(fs.readFileSync(path.join(c.target, 'package.json'), 'utf8'), '{"name":"@stellar/stellar-sdk","version":"17.4.1"}\n'); assert.ok(!fs.existsSync(path.join(c.target, 'LICENSE')));
  c = clone(); assert.equal(run(c).status, 0); fs.rmSync(path.join(c.target, 'LICENSE')); r = run(c); assert.equal(r.status, 0); assert.deepEqual(fileHashes(c.target), R.EXPECTED.files);
  c = clone(); assert.equal(run(c).status, 0); fs.appendFileSync(path.join(c.target, 'dist', 'stellar-sdk.js'), '//x'); r = run(c, ['--verify-only']); assert.equal(r.status, 1); assert.match(r.stderr, /differs from the recorded value/);
});
test('restore: a junction in the target path is refused', (t) => {
  const c = clone(); const other = path.join(ROOT, 'elsewhere' + n); fs.mkdirSync(other, { recursive: true });
  try { fs.symlinkSync(other, path.join(c.d, 'pk', 'x-stellar-stellar-sdk-17.4.0'), 'junction'); } catch { return t.skip('cannot create a junction here'); }
  const r = run(c); assert.equal(r.status, 1); assert.match(r.stderr, /symbolic link or junction/); assert.deepEqual(fs.readdirSync(other), []);
});
test('restore: usage errors exit 2', () => { const c = clone(); for (const a of [['--bogus'], ['--tgz'], ['--verify-only', 'x']]) assert.equal(run(c, a).status, 2); });

// ------------------------------------------------------------------ strict tar parser, with crafted archives
function header(name, size, { type = '0', magic = 'ustar\0', prefix = '', badSum = false, sizeText } = {}) {
  const h = Buffer.alloc(512); h.write(name, 0, 'latin1'); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write((sizeText !== undefined ? sizeText : size.toString(8).padStart(11, '0')) + '\0', 124); h.write('00000000000\0', 136); h.write('        ', 148); h.write(type, 156); h.write(magic, 257, 'latin1'); h.write('00', 263); if (prefix) h.write(prefix, 345);
  let sum = 0; for (const b of h) sum += b; h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148); if (badSum) h[148] = h[148] === 0x30 ? 0x31 : 0x30; return h;
}
const entry = (name, content, o) => { const b = Buffer.from(content); return Buffer.concat([header(name, b.length, o), b, Buffer.alloc((512 - (b.length % 512)) % 512)]); };
const end = Buffer.alloc(1024);
test('tar parser: accepts a well-formed archive of regular files', () => {
  const m = R.parseTar(Buffer.concat([entry('package/a.txt', 'hello'), entry('package/dir/b.txt', ''), end])); assert.equal(m.size, 2); assert.equal(m.get('package/a.txt').toString(), 'hello'); assert.equal(m.get('package/dir/b.txt').length, 0);
});
test('tar parser: refuses every malformed or unsafe archive', () => {
  const bad = {
    'bad checksum': [entry('package/a', 'x', { badSum: true }), end], symlink: [entry('package/a', 'x', { type: '2' }), end], 'hard link': [entry('package/a', 'x', { type: '1' }), end], directory: [entry('package/d', '', { type: '5' }), end],
    'pax header': [entry('package/a', 'x', { type: 'x' }), end], traversal: [entry('package/../evil', 'x'), end], 'outside package/': [entry('other/a', 'x'), end], absolute: [entry('/etc/x', 'x'), end], backslash: [entry('package\\a', 'x'), end],
    'drive letter': [entry('package/C:x', 'x'), end], 'double slash': [entry('package//a', 'x'), end], duplicate: [entry('package/a', 'x'), entry('package/a', 'y'), end], 'not ustar': [entry('package/a', 'x', { magic: 'GNU\0\0\0' }), end],
    prefix: [entry('package/a', 'x', { prefix: 'long/prefix' }), end], 'bad size field': [entry('package/a', 'x', { sizeText: 'zzzzzzzzzzz' }), end], truncated: [entry('package/a', 'x').subarray(0, 600)], 'no end marker': [entry('package/a', 'x')],
    'data after end': [entry('package/a', 'x'), end, Buffer.from('junk')], 'body past end': [header('package/a', 5000), Buffer.alloc(512), end],
  };
  for (const [name, parts] of Object.entries(bad)) assert.throws(() => R.parseTar(Buffer.concat(parts)), /./, name);
});
test('tar parser: the real tarball parses to exactly the expected number of entries, all regular files under package/', () => {
  const m = R.parseTar(zlib.gunzipSync(fs.readFileSync(path.join(HERE, 'pk', 'stellar-stellar-sdk-17.4.0.tgz')))); assert.equal(m.size, R.EXPECTED.entries); for (const k of m.keys()) assert.ok(k.startsWith('package/'));
});
