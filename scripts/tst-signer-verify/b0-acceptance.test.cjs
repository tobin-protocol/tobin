'use strict';
// B0 acceptance tests. They exercise ONLY the external verifier, the SDK restore script and (in-process, with fs instrumented) the gate module's
// computeManifest. They NEVER start the signer launcher or any application module: every child process goes through run(), which allows exactly two
// scripts. No key, DPAPI blob, state, network, signing or deployment is involved; all mutation happens on copies in a temporary directory.
//
//   node --test scripts/tst-signer-verify/b0-acceptance.test.cjs     (needs the restored SDK: node scripts/tst-signer/restore-sdk.cjs)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const VERIFIER = path.join(__dirname, 'verify-signer-baseline.cjs');
const RESTORE = path.join(ROOT, 'scripts', 'tst-signer', 'restore-sdk.cjs');
const B0_SRC = path.join(ROOT, 'docs', 'product', 'architecture', 'phase-2c', 'milestone-1-configuration-freeze', 'revision-6-3', 'runtime-sources');
const B0_MANIFEST = path.join(ROOT, 'docs', 'product', 'architecture', 'phase-2c', 'milestone-1-configuration-freeze', 'revision-6-3', 'b0', 'baseline-manifest-B0-revision-6-3.txt');
const B1_MANIFEST = path.join(ROOT, 'docs', 'product', 'architecture', 'phase-2c', 'tst-signer-b1', 'baseline-manifest-B1.txt');
const LIVE_SIGNER = path.join(ROOT, 'scripts', 'tst-signer', 'signer');
const LIVE_SDK = path.join(ROOT, 'scripts', 'tst-signer', 'pk', 'x-stellar-stellar-sdk-17.4.0', 'package');

const B0 = '9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7';
const B1 = '83f11a7f5ca4dce244dde39f69b19442711902137b8cba8ba3beb7f446c8733e';
const HIST = 'ccea8b5b94bf3358f295ec8dd85435f34505714ef927764e5f58c557c567aa92';
const B0_FILES = ['authorization.cjs', 'dpapi-key.cjs', 'pinned.cjs', 'refusal.cjs', 'sdk-loader.cjs', 'state-store.cjs', 'tst-signer-core.cjs', 'tst-signer.cjs'];
const B1_FILES = ['authorization.cjs', 'baseline.cjs', 'dpapi-key.cjs', 'pinned.cjs', 'refusal.cjs', 'sdk-loader.cjs', 'state-store.cjs', 'tst-signer-core.cjs', 'tst-signer-main.cjs', 'tst-signer.cjs'];

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const tmps = [];
const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tobin-b0-')); tmps.push(d); return d; };
test.after(() => { for (const d of tmps) fs.rmSync(d, { recursive: true, force: true }); });

/** The only way this file starts a process. Anything but the verifier or the restore script is a test failure. */
function run(script, args, opts = {}) {
  assert.ok([VERIFIER, RESTORE, ...(opts.allow ?? [])].includes(script), `a test tried to start ${script}`);
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 60000, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir(), TMP: os.tmpdir() }, ...(opts.cwd ? { cwd: opts.cwd } : {}) });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const verify = (dir, expected, profile, extra = []) => run(VERIFIER, ['--signer-dir', dir, '--sdk-dir', extra.sdk ?? LIVE_SDK, '--profile', profile, '--expected', expected, ...(extra.args ?? [])]);

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const n of fs.readdirSync(src)) {
    const s = path.join(src, n); const d = path.join(dst, n);
    if (fs.statSync(s).isDirectory()) { if (n !== 'test' && n !== 'fixtures') copyTree(s, d); } else fs.copyFileSync(s, d);
  }
}
const b0tree = () => { const d = path.join(mk(), 'signer'); copyTree(B0_SRC, d); return d; };
const b1tree = () => { const d = path.join(mk(), 'signer'); copyTree(LIVE_SIGNER, d); return d; };
const sdkCopy = () => { const d = path.join(mk(), 'package'); copyTree(LIVE_SDK, d); return d; };

test('precondition: the restored SDK is present (run restore-sdk.cjs first); this is a failure, not a skip', () => {
  assert.ok(fs.existsSync(path.join(LIVE_SDK, 'dist', 'stellar-sdk.js')), 'SDK not restored: node scripts/tst-signer/restore-sdk.cjs');
});

// ---------- approved definitions ----------
test('approved B0 (8 runtime files incl. pinned.cjs, absent config, SDK 17.4.0) is reproduced exactly', () => {
  const r = verify(B0_SRC, B0, 'b0');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /VERIFY: MATCH/);
  assert.match(r.out, new RegExp(`computed baseline : ${B0}`));
});
test('approved B1 is verified on the live signer directory', () => {
  const r = verify(LIVE_SIGNER, B1, 'b1');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /VERIFY: MATCH/);
});
test('the recorded approved manifests hash to exactly the approved values (immutability evidence)', () => {
  assert.equal(sha(fs.readFileSync(B0_MANIFEST)), B0);
  assert.equal(sha(fs.readFileSync(B1_MANIFEST)), B1);
});
test('the computed manifests are byte-identical to the recorded approved manifests, and are canonical (header, LF, final LF, ordinal order, ABSENT config)', () => {
  for (const [dir, profile, hash, rec] of [[B0_SRC, 'b0', B0, B0_MANIFEST], [LIVE_SIGNER, 'b1', B1, B1_MANIFEST]]) {
    const r = run(VERIFIER, ['--signer-dir', dir, '--sdk-dir', LIVE_SDK, '--profile', profile, '--expected', hash, '--print-manifest']);
    const manifest = r.out.slice(0, r.out.indexOf('computed baseline'));
    assert.equal(manifest, fs.readFileSync(rec, 'utf8'));
    assert.ok(manifest.startsWith('TOBIN-TST-SIGNER-BASELINE v1\n') && manifest.endsWith('\n') && !manifest.includes('\r'));
    assert.match(manifest, / {2}config:deployment-config\.json\n/);
    assert.match(manifest, /^ABSENT {2}config:deployment-config\.json$/m);
    const labels = manifest.trimEnd().split('\n').slice(1).map((l) => l.slice(66));
    assert.deepEqual(labels, [...labels].sort());
  }
});
test('the historical definition (no pinned.cjs) is not silently substituted: the Node verifier refuses it because its closure is incomplete', () => {
  const r = verify(B0_SRC, HIST, 'historical-b0');
  assert.equal(r.code, 2);
  assert.match(r.err, /requires \.\/pinned\.cjs, which is not in the runtime closure/);
  assert.notEqual(B0, HIST);
});
test('verification is deterministic: repeated runs and runs from different working directories give identical output', () => {
  const a = verify(B0_SRC, B0, 'b0').out; const b = verify(B0_SRC, B0, 'b0').out;
  const c = run(VERIFIER, ['--signer-dir', B0_SRC, '--sdk-dir', LIVE_SDK, '--profile', 'b0', '--expected', B0], { cwd: os.tmpdir() }).out;
  assert.equal(a, b); assert.equal(a, c);
});
test('a profile never supplies the expected hash: B0 files against the B1 hash (and the reverse) are mismatches or refusals', () => {
  assert.equal(verify(B0_SRC, B1, 'b0').code, 1);
  assert.equal(verify(LIVE_SIGNER, B0, 'b1').code, 1);
  assert.equal(verify(LIVE_SIGNER, B1, 'b0').code, 2); // the B1 tree has files that are not in the B0 definition
  assert.equal(run(VERIFIER, ['--signer-dir', B0_SRC, '--expected', B0, '--profile', 'nonsense']).code, 3);
});

// ---------- protected bytes ----------
for (const [profile, files, make, hash] of [['b0', B0_FILES, b0tree, B0], ['b1', B1_FILES, b1tree, B1]]) {
  for (const f of files) {
    test(`${profile}: one added byte in ${f} is a MISMATCH (exit 1), never a match`, () => {
      const t = make(); fs.appendFileSync(path.join(t, f), ' ');
      const r = verify(t, hash, profile);
      assert.equal(r.code, 1, r.err); assert.ok(!/VERIFY: MATCH/.test(r.out));
    });
    test(`${profile}: one changed byte in ${f} is detected`, () => {
      const t = make(); const p = path.join(t, f); const b = fs.readFileSync(p); b[b.length - 2] = b[b.length - 2] ^ 0x01; fs.writeFileSync(p, b);
      const r = verify(t, hash, profile);
      assert.ok(r.code === 1 || r.code === 2, `exit ${r.code}`); assert.ok(!/VERIFY: MATCH/.test(r.out));
    });
    test(`${profile}: a missing ${f} is REFUSED (exit 2)`, () => {
      const t = make(); fs.rmSync(path.join(t, f));
      assert.equal(verify(t, hash, profile).code, 2);
    });
  }
}

// ---------- closure, unexpected files, dependency additions ----------
test('b0: an unexpected file, a hidden file, a directory and an extra script are REFUSED', () => {
  for (const make of [
    (t) => fs.writeFileSync(path.join(t, 'extra.cjs'), '1\n'),
    (t) => fs.writeFileSync(path.join(t, '.hidden'), '1\n'),
    (t) => fs.mkdirSync(path.join(t, 'sub')),
    (t) => fs.writeFileSync(path.join(t, 'approved-hash.txt'), B0 + '\n'), // an expected-hash file inside the signer dir is never trusted or read
  ]) {
    const t = b0tree(); make(t);
    assert.equal(verify(t, B0, 'b0').code, 2);
  }
});
test('b0: dependency additions cannot bypass the closure (extra relative require, unapproved built-in, non-literal require, dynamic import, eval)', () => {
  const adds = ["require('./extra.cjs');", "require('net');", "require('node:child_process');", "const m = './x'; require(m);", "import('./x.mjs');", "eval('1');", "new Function('1');"];
  for (const line of adds) {
    const t = b0tree(); fs.appendFileSync(path.join(t, 'refusal.cjs'), '\n' + line + '\n');
    const r = verify(t, B0, 'b0');
    assert.equal(r.code, 2, `${line} -> ${r.code}`);
  }
});
test('b0: the deployment configuration changes the baseline when present and is validated', () => {
  const t = b0tree(); fs.writeFileSync(path.join(t, 'deployment-config.json'), '{"x":1}\n');
  assert.equal(verify(t, B0, 'b0').code, 1);
  fs.writeFileSync(path.join(t, 'deployment-config.json'), '{"x":1}\r\n');
  assert.equal(verify(t, B0, 'b0').code, 2);
});

// ---------- text policy ----------
test('b0: CRLF, BOM and invalid UTF-8 in any protected runtime file are REFUSED', () => {
  for (const f of B0_FILES) {
    for (const mutate of [(b) => Buffer.concat([b, Buffer.from('\r\n')]), (b) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), b]), (b) => Buffer.concat([b, Buffer.from([0xff, 0xfe, 0x0a])])]) {
      const t = b0tree(); const p = path.join(t, f); fs.writeFileSync(p, mutate(fs.readFileSync(p)));
      assert.equal(verify(t, B0, 'b0').code, 2, f);
    }
  }
});

// ---------- SDK ----------
test('SDK: modified package.json, modified bundle, missing files, wrong identity, wrong version', () => {
  let s = sdkCopy(); fs.appendFileSync(path.join(s, 'package.json'), ' ');
  assert.equal(verify(B0_SRC, B0, 'b0', { sdk: s }).code, 1);
  s = sdkCopy(); fs.appendFileSync(path.join(s, 'dist', 'stellar-sdk.js'), ' ');
  assert.equal(verify(B0_SRC, B0, 'b0', { sdk: s }).code, 1);
  s = sdkCopy(); fs.rmSync(path.join(s, 'dist', 'stellar-sdk.js'));
  assert.equal(verify(B0_SRC, B0, 'b0', { sdk: s }).code, 2);
  s = sdkCopy(); fs.rmSync(path.join(s, 'package.json'));
  assert.equal(verify(B0_SRC, B0, 'b0', { sdk: s }).code, 2);
  s = sdkCopy(); const pj = JSON.parse(fs.readFileSync(path.join(s, 'package.json'), 'utf8')); pj.version = '17.4.1'; fs.writeFileSync(path.join(s, 'package.json'), JSON.stringify(pj));
  assert.equal(verify(B0_SRC, B0, 'b0', { sdk: s }).code, 2);
  s = sdkCopy(); fs.writeFileSync(path.join(s, 'package.json'), JSON.stringify({ name: '@stellar/other', version: '17.4.0' }));
  assert.equal(verify(B0_SRC, B0, 'b0', { sdk: s }).code, 2);
  assert.equal(verify(B0_SRC, B0, 'b0', { sdk: path.join(mk(), 'nowhere') }).code, 2);
});

// ---------- approved hash handling ----------
test('the approved hash is mandatory and strict: missing, malformed and wrong values never match', () => {
  assert.equal(run(VERIFIER, ['--signer-dir', B0_SRC, '--profile', 'b0']).code, 3); // missing
  for (const bad of ['', 'abc', B0.toUpperCase(), B0.slice(1), B0 + '0', ' ' + B0, B0 + '\n', 'g'.repeat(64), '../approved'])
    assert.equal(verify(B0_SRC, bad, 'b0').code, 2, JSON.stringify(bad));
  const wrong = verify(B0_SRC, 'a'.repeat(64), 'b0');
  assert.equal(wrong.code, 1); assert.ok(!/VERIFY: MATCH/.test(wrong.out));
});
test('the verifier cannot be fooled by a hash inside the signer directory: it reads --expected only', () => {
  const t = b0tree(); fs.appendFileSync(path.join(t, 'refusal.cjs'), ' ');
  const r = verify(t, 'f'.repeat(64), 'b0');
  assert.equal(r.code, 1);
});

// ---------- machine-readable output ----------
test('--json prints exactly one parseable object with stable fields and the documented exit codes', () => {
  const j = (r) => { assert.equal(r.out.trim().split('\n').length, 1); return JSON.parse(r.out); };
  const ok = j(verify(B0_SRC, B0, 'b0', { args: ['--json'] }));
  assert.deepEqual(Object.keys(ok), ['result', 'exitCode', 'profile', 'computed', 'expected', 'reason']);
  assert.deepEqual([ok.result, ok.exitCode, ok.profile, ok.computed, ok.expected, ok.reason], ['MATCH', 0, 'b0', B0, B0, null]);
  const mm = j(verify(B0_SRC, 'a'.repeat(64), 'b0', { args: ['--json'] }));
  assert.deepEqual([mm.result, mm.exitCode, mm.computed], ['MISMATCH', 1, B0]);
  assert.ok(mm.reason);
  const rf = verify(B0_SRC, 'zz', 'b0', { args: ['--json'] });
  const rj = j(rf);
  assert.deepEqual([rj.result, rj.exitCode, rj.expected], ['REFUSED', 2, null]);
  assert.ok(rj.reason && rf.code === 2);
  const t = b0tree(); fs.rmSync(path.join(t, 'pinned.cjs'));
  const miss = j(verify(t, B0, 'b0', { args: ['--json'] }));
  assert.equal(miss.result, 'REFUSED'); assert.match(miss.reason, /pinned\.cjs/);
});

// ---------- unreadable files (NTFS ignores chmod, so inject the failure in-process) ----------
test('unreadable files are REFUSED: runtime file, configuration, SDK package.json, SDK bundle (fs failure injected in-process)', async (c) => {
  const mod = require(VERIFIER);
  const realRead = fs.readFileSync;
  const stderr = c.mock.method(process.stderr, 'write', () => true);
  c.mock.method(process.stdout, 'write', () => true);
  const cfgTree = b0tree(); fs.writeFileSync(path.join(cfgTree, 'deployment-config.json'), '{}\n');
  const cases = [[B0_SRC, path.join(B0_SRC, 'dpapi-key.cjs')], [B0_SRC, path.join(B0_SRC, 'tst-signer.cjs')], [cfgTree, path.join(cfgTree, 'deployment-config.json')], [B0_SRC, path.join(LIVE_SDK, 'package.json')], [B0_SRC, path.join(LIVE_SDK, 'dist', 'stellar-sdk.js')]];
  for (const [dir, victim] of cases) {
    const m = c.mock.method(fs, 'readFileSync', (p, ...rest) => { if (path.resolve(String(p)) === path.resolve(victim)) { const e = new Error('EACCES: permission denied'); e.code = 'EACCES'; throw e; } return realRead.call(fs, p, ...rest); });
    const code = mod.main(['--signer-dir', dir, '--sdk-dir', LIVE_SDK, '--profile', 'b0', '--expected', B0]);
    m.mock.restore();
    assert.equal(code, 2, victim);
  }
  assert.ok(stderr.mock.calls.length >= cases.length);
});
test('the in-signer gate also refuses unreadable files (fs failure injected in-process; no application module is loaded)', (c) => {
  const gate = require(path.join(LIVE_SIGNER, 'baseline.cjs'));
  const realRead = fs.readFileSync;
  for (const victim of [path.join(LIVE_SIGNER, 'state-store.cjs'), path.join(LIVE_SDK, 'dist', 'stellar-sdk.js')]) {
    const m = c.mock.method(fs, 'readFileSync', (p, ...rest) => { if (path.resolve(String(p)) === path.resolve(victim)) { const e = new Error('EACCES'); e.code = 'EACCES'; throw e; } return realRead.call(fs, p, ...rest); });
    assert.throws(() => gate.computeManifest({ signerDir: LIVE_SIGNER, sdkDir: LIVE_SDK }), (e) => e instanceof gate.IntegrityError && /cannot be read/.test(e.message), victim);
    m.mock.restore();
  }
  assert.equal(gate.computeManifest({ signerDir: LIVE_SIGNER, sdkDir: LIVE_SDK }).hash, B1); // control, after the mocks are removed
});

// ---------- fresh clone ----------
function tracked(...dirs) {
  const r = spawnSync('git', ['ls-files', '-z', '--', ...dirs], { cwd: ROOT, encoding: 'buffer' });
  assert.equal(r.status, 0, 'git ls-files failed');
  return r.stdout.toString('utf8').split('\0').filter(Boolean);
}
function freshClone() {
  const dst = mk();
  for (const rel of tracked('scripts/tst-signer', 'scripts/tst-signer-verify')) {
    const to = path.join(dst, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), to);
  }
  return dst;
}
test('fresh clone (only tracked files): the extracted SDK is absent, restore works offline, the verifier then matches B1, and a second restore is a no-op', () => {
  const clone = freshClone();
  const pkg = path.join(clone, 'scripts', 'tst-signer', 'pk', 'x-stellar-stellar-sdk-17.4.0', 'package');
  assert.ok(!fs.existsSync(pkg), 'the extracted SDK must not be tracked');
  assert.ok(fs.existsSync(path.join(clone, 'scripts', 'tst-signer', 'pk', 'stellar-stellar-sdk-17.4.0.tgz')));
  const script = path.join(clone, 'scripts', 'tst-signer', 'restore-sdk.cjs');
  const r1 = run(script, [], { allow: [script] });
  assert.equal(r1.code, 0, r1.err + r1.out);
  const hashes = ['package.json', 'LICENSE', 'dist/stellar-sdk.js'].map((f) => sha(fs.readFileSync(path.join(pkg, f))));
  assert.equal(run(script, ['--verify-only'], { allow: [script] }).code, 0);
  assert.equal(run(script, [], { allow: [script] }).code, 0);
  assert.deepEqual(['package.json', 'LICENSE', 'dist/stellar-sdk.js'].map((f) => sha(fs.readFileSync(path.join(pkg, f)))), hashes);
  const v = path.join(clone, 'scripts', 'tst-signer-verify', 'verify-signer-baseline.cjs');
  const r = run(v, ['--signer-dir', path.join(clone, 'scripts', 'tst-signer', 'signer'), '--expected', B1], { allow: [v] });
  assert.equal(r.code, 0, r.err); assert.match(r.out, /VERIFY: MATCH/);
});
test('fresh clone: a tampered tarball is refused before extraction and nothing is created; the pristine tarball is untouched in the working repository', () => {
  const clone = freshClone();
  const tgz = path.join(clone, 'scripts', 'tst-signer', 'pk', 'stellar-stellar-sdk-17.4.0.tgz');
  const b = fs.readFileSync(tgz); b[Math.floor(b.length / 2)] ^= 0x01; fs.writeFileSync(tgz, b);
  const script = path.join(clone, 'scripts', 'tst-signer', 'restore-sdk.cjs');
  const r = run(script, [], { allow: [script] });
  assert.equal(r.code, 1);
  assert.ok(!fs.existsSync(path.join(clone, 'scripts', 'tst-signer', 'pk', 'x-stellar-stellar-sdk-17.4.0', 'package', 'dist')));
  assert.equal(sha(fs.readFileSync(path.join(ROOT, 'scripts', 'tst-signer', 'pk', 'stellar-stellar-sdk-17.4.0.tgz'))), '455fcadd817f4a30e5f8d0f15162f43a616f72dcbff499c8aa186abe6650a21c');
});

// ---------- packaging and provenance ----------
test('packaging: every protected runtime file, the tarball, the inventories and the restore script are tracked by Git', () => {
  const t = new Set(tracked('scripts/tst-signer', 'scripts/tst-signer-verify'));
  for (const f of B1_FILES) assert.ok(t.has(`scripts/tst-signer/signer/${f}`), f);
  for (const f of ['scripts/tst-signer/pk/stellar-stellar-sdk-17.4.0.tgz', 'scripts/tst-signer/SDK-PACKAGE-INVENTORY.sha256', 'scripts/tst-signer/SOURCE-INVENTORY.sha256', 'scripts/tst-signer/restore-sdk.cjs', 'scripts/tst-signer-verify/verify-signer-baseline.cjs']) assert.ok(t.has(f), f);
});
test('packaging: nothing secret or local is tracked (no deployment config, key, DPAPI blob, state file, extracted SDK or wallet material)', () => {
  const all = tracked('scripts', 'docs/product/architecture/phase-2c');
  const bad = all.filter((f) => /(^|\/)deployment-config\.json$|\.dpapi$|\.blob$|(^|\/)state\.json$|(^|\/)keys?\/|\.pem$|\.key$|\.p12$|\.pfx$|\.env$|x-stellar-stellar-sdk-17\.4\.0\/package\//i.test(f));
  assert.deepEqual(bad, []);
  const ig = spawnSync('git', ['check-ignore', '--no-index', ...B1_FILES.map((f) => `scripts/tst-signer/signer/${f}`), 'scripts/tst-signer/pk/stellar-stellar-sdk-17.4.0.tgz'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ig.stdout.trim(), '', 'a required runtime input is ignored by .gitignore'); // exit 1 with no output means nothing is ignored
});
test('packaging: no tracked signer, restore or verifier source refers to an absolute local path, scratchpad, Downloads or temporary location', () => {
  const files = tracked('scripts/tst-signer', 'scripts/tst-signer-verify').filter((f) => /\.cjs$/.test(f) && !/\/test\//.test(f) && !/\.test\.cjs$/.test(f));
  assert.equal(files.length, 13); // 10 protected runtime files + make-deployment-config.cjs + restore-sdk.cjs + the verifier
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // code only: comments may say "never downloads"
    const m = /[A-Za-z]:[\\/]|\/(?:home|Users|tmp)\/|Downloads|scratchpad|\.claude|AppData[\\/]Local[\\/]Temp/i.exec(src);
    assert.ok(!m, `${f} contains ${m && m[0]}`);
  }
});
test('isolation: this file starts processes only through run() (verifier and restore script) and git, never the launcher or an application module', () => {
  const src = fs.readFileSync(__filename, 'utf8');
  const spawns = [...src.matchAll(/spawnSync\(([^,]*),/g)].map((m) => m[1].trim());
  assert.deepEqual(spawns.sort(), ["'git'", "'git'", 'process.execPath'].sort());
  assert.throws(() => run(path.join(LIVE_SIGNER, 'tst-signer.cjs'), ['baseline']), /a test tried to start/);
  assert.throws(() => run(path.join(LIVE_SIGNER, 'tst-signer-main.cjs'), []), /a test tried to start/);
});

// ---------- module-loading order (static proof from the launcher source; the dynamic proof is in signer/test/baseline.test.cjs) ----------
test('launcher source: the only module required before verification is the gate; the application is required once, after verifyApproved, from the same function', () => {
  const src = fs.readFileSync(path.join(LIVE_SIGNER, 'tst-signer.cjs'), 'utf8').replace(/\/\/.*$/gm, '');
  const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => ({ target: m[1], at: m.index }));
  assert.deepEqual(requires.map((r) => r.target), ['./baseline.cjs', './tst-signer-main.cjs']);
  assert.ok(requires[1].at > src.indexOf('verifyApproved('), 'the application is required before verifyApproved');
  assert.ok(requires[1].at > src.indexOf('process.exit(4)'), 'the application is required before the refusal path');
  for (const mod of ['dpapi-key', 'state-store', 'sdk-loader', 'tst-signer-core', 'pinned', 'authorization']) assert.ok(!src.includes(mod), `${mod} is referenced by the launcher`);
  const gate = fs.readFileSync(path.join(LIVE_SIGNER, 'baseline.cjs'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.deepEqual([...gate.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]), ['fs', 'path', 'crypto']); // the gate itself loads no application module
});
