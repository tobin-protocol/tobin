'use strict';
// Tests of the integrity gate (baseline.cjs) and of the launcher (tst-signer.cjs): exact match, every kind of modification, missing and unexpected files, text rules,
// invalid approved hashes, bypass attempts, and the ORDER of events (verification happens before any application module is loaded).
// Everything runs in fresh temporary directories with copies of the real files. No key, no secret, no network, no real LOCALAPPDATA. The signer is never run:
// the application modules are replaced by canaries that only append a line to a marker file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const baseline = require('../baseline.cjs');
const REAL = path.resolve(__dirname, '..');
const REAL_SDK = path.resolve(REAL, '..', 'pk', 'x-stellar-stellar-sdk-17.4.0', 'package');
const CLOSURE = baseline.CLOSURE;
const APP_MODULES = ['authorization', 'dpapi-key', 'pinned', 'refusal', 'sdk-loader', 'state-store', 'tst-signer-core'];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'tst-bl-'));
test.after(() => { fs.rmSync(ROOT, { recursive: true, force: true }); });
let counter = 0;
function tree() {
  const root = path.join(ROOT, 't' + (++counter)); const signer = path.join(root, 'signer'); const pkg = path.join(root, 'pk', 'x-stellar-stellar-sdk-17.4.0', 'package');
  fs.mkdirSync(signer, { recursive: true }); fs.mkdirSync(path.join(pkg, 'dist'), { recursive: true });
  for (const f of [...CLOSURE, 'make-deployment-config.cjs']) fs.copyFileSync(path.join(REAL, f), path.join(signer, f));
  fs.copyFileSync(path.join(REAL_SDK, 'package.json'), path.join(pkg, 'package.json')); fs.copyFileSync(path.join(REAL_SDK, 'dist', 'stellar-sdk.js'), path.join(pkg, 'dist', 'stellar-sdk.js'));
  return { root, signer, pkg };
}
const hashOf = (t) => baseline.computeManifest({ signerDir: t.signer }).hash;
const edit = (file, fn) => fs.writeFileSync(file, fn(fs.readFileSync(file)));
const append = (file, s) => edit(file, (b) => Buffer.concat([b, Buffer.from(s)]));
const refuses = (fn, re, code) => assert.throws(fn, (e) => e instanceof baseline.IntegrityError && (!re || re.test(e.message)) && (!code || e.code === code), `expected an IntegrityError ${re || ''}`);

// An independent oracle for the manifest: written here from the specification, not by calling the gate.
function oracle(t, config) {
  const rows = [];
  for (const f of CLOSURE) rows.push([`file:${f}`, sha(fs.readFileSync(path.join(t.signer, f)))]);
  rows.push(['config:deployment-config.json', config === undefined ? 'ABSENT' : sha(Buffer.from(config))]);
  rows.push(['external:@stellar/stellar-sdk@17.4.0/package.json', sha(fs.readFileSync(path.join(t.pkg, 'package.json')))]);
  rows.push(['external:@stellar/stellar-sdk@17.4.0/dist/stellar-sdk.js', sha(fs.readFileSync(path.join(t.pkg, 'dist', 'stellar-sdk.js')))]);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const text = 'TOBIN-TST-SIGNER-BASELINE v1\n' + rows.map(([l, h]) => `${h}  ${l}\n`).join('');
  return { text, hash: sha(Buffer.from(text)) };
}

// ------------------------------------------------------------------------------------------------ exact match
test('gate: exact match against the oracle; manifest has the specified shape; verifyApproved accepts the right hash', () => {
  const t = tree(); const got = baseline.computeManifest({ signerDir: t.signer }); const o = oracle(t);
  assert.equal(got.manifest, o.text); assert.equal(got.hash, o.hash);
  assert.equal(got.manifest.split('\n').length, 1 + 10 + 1 + 2 + 1, 'header, 10 files, config, 2 SDK entries, trailing empty'); assert.ok(!got.manifest.includes('\r')); assert.ok(got.manifest.endsWith('\n'));
  assert.ok(got.manifest.includes('file:baseline.cjs') && got.manifest.includes('file:tst-signer-main.cjs') && got.manifest.includes('file:pinned.cjs'), 'the gate, the launcher parts and pinned.cjs are in the closure');
  assert.ok(!got.manifest.includes('make-deployment-config'), 'the configuration generator is not a runtime file');
  assert.ok(baseline.verifyApproved({ signerDir: t.signer, approved: got.hash }));
});
test('gate: the real signer directory computes the same hash as the oracle', () => {
  const real = { signer: REAL, pkg: REAL_SDK }; assert.equal(baseline.computeManifest({ signerDir: REAL }).hash, oracle(real).hash);
});

// ------------------------------------------------------------------------------------------------ modification
for (const f of CLOSURE) {
  test(`gate: a modified runtime file is refused: ${f}`, () => {
    const t = tree(); const approved = hashOf(t); append(path.join(t.signer, f), '\n// changed\n');
    refuses(() => baseline.verifyApproved({ signerDir: t.signer, approved }), /does not equal the approved baseline/, 'MISMATCH');
  });
  test(`gate: a missing runtime file is refused: ${f}`, () => {
    const t = tree(); const approved = hashOf(t); fs.rmSync(path.join(t.signer, f));
    refuses(() => baseline.verifyApproved({ signerDir: t.signer, approved }), /runtime file missing/);
  });
}
test('gate: a modified tolerated file (make-deployment-config.cjs) does not change the baseline, because it is never loaded by the signer', () => {
  const t = tree(); const a = hashOf(t); append(path.join(t.signer, 'make-deployment-config.cjs'), '\n// not runtime\n'); assert.equal(hashOf(t), a);
});
test('gate: SDK package.json and bundle modifications change the baseline; a wrong SDK identity is refused', () => {
  let t = tree(); let a = hashOf(t); append(path.join(t.pkg, 'dist', 'stellar-sdk.js'), '\n// x\n'); assert.notEqual(hashOf(t), a);
  refuses(() => baseline.verifyApproved({ signerDir: t.signer, approved: a }), undefined, 'MISMATCH');
  t = tree(); a = hashOf(t); edit(path.join(t.pkg, 'package.json'), (b) => Buffer.from(b.toString().replace(/\n$/, ' \n'))); assert.notEqual(hashOf(t), a);
  t = tree(); edit(path.join(t.pkg, 'package.json'), (b) => Buffer.from(b.toString().replace('"version": "17.4.0"', '"version": "17.4.1"'))); refuses(() => hashOf(t), /SDK identity/);
  t = tree(); edit(path.join(t.pkg, 'package.json'), (b) => Buffer.from(b.toString().replace('"name": "@stellar/stellar-sdk"', '"name": "@stellar/other"'))); refuses(() => hashOf(t), /SDK identity/);
  t = tree(); fs.writeFileSync(path.join(t.pkg, 'package.json'), '{ not json'); refuses(() => hashOf(t), /not valid JSON/);
});
test('gate: a missing SDK (package, bundle, dist, directory) is refused', () => {
  let t = tree(); fs.rmSync(path.join(t.pkg, 'dist', 'stellar-sdk.js')); refuses(() => hashOf(t), /SDK bundle/);
  t = tree(); fs.rmSync(path.join(t.pkg, 'package.json')); refuses(() => hashOf(t), /SDK package.json/);
  t = tree(); fs.rmSync(path.join(t.pkg, 'dist'), { recursive: true }); refuses(() => hashOf(t), /dist directory/);
  t = tree(); fs.rmSync(path.join(t.root, 'pk'), { recursive: true }); refuses(() => hashOf(t), /SDK/);
});
test('gate: the SDK directory may be given explicitly, and is then the one hashed', () => {
  const t = tree(); const other = tree(); append(path.join(other.pkg, 'dist', 'stellar-sdk.js'), '\n// other\n');
  assert.notEqual(baseline.computeManifest({ signerDir: t.signer, sdkDir: other.pkg }).hash, hashOf(t));
});

// ------------------------------------------------------------------------------------------------ approved hash validation
test('gate: invalid approved hashes are rejected (empty, short, long, upper case, prefixed, padded, non-hex, wrong type)', () => {
  const t = tree(); const good = hashOf(t);
  const bad = ['', 'abc', good.slice(1), good + '0', good.toUpperCase(), '0x' + good, ' ' + good, good + '\n', good.slice(0, 63) + 'g', 'x'.repeat(64), null, undefined, 12345, {}, [good]];
  for (const b of bad) refuses(() => baseline.verifyApproved({ signerDir: t.signer, approved: b }), /exactly 64 lowercase hexadecimal/, 'BAD_INPUT');
  for (const b of bad) refuses(() => baseline.parseApprovedHash(b), undefined, 'BAD_INPUT');
  assert.equal(baseline.parseApprovedHash(good), good);
});
test('gate: hashesEqual compares exactly', () => {
  const a = 'ab'.repeat(32); assert.equal(baseline.hashesEqual(a, a), true); assert.equal(baseline.hashesEqual(a, 'ac' + a.slice(2)), false); assert.equal(baseline.hashesEqual(a, a.slice(0, 62)), false);
});

// ------------------------------------------------------------------------------------------------ text rules (CRLF, BOM, UTF-8) and configuration
for (const f of ['tst-signer.cjs', 'baseline.cjs', 'pinned.cjs']) {
  test(`gate: CR, BOM and invalid UTF-8 in a runtime file are refused: ${f}`, () => {
    let t = tree(); edit(path.join(t.signer, f), (b) => Buffer.from(b.toString().replace(/\n/, '\r\n'))); refuses(() => hashOf(t), /CR byte/);
    t = tree(); edit(path.join(t.signer, f), (b) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), b])); refuses(() => hashOf(t), /byte order mark/);
    t = tree(); append(path.join(t.signer, f), Buffer.from([0xff, 0xfe, 0x41])); refuses(() => hashOf(t), /not valid UTF-8/);
  });
}
test('gate: the deployment configuration is included when present; CR, BOM, invalid UTF-8 and non-file configurations are refused', () => {
  const t = tree(); const absent = hashOf(t); const cfg = '{"example":true}\n';
  fs.writeFileSync(path.join(t.signer, 'deployment-config.json'), cfg);
  const got = baseline.computeManifest({ signerDir: t.signer }); assert.notEqual(got.hash, absent); assert.equal(got.hash, oracle(t, cfg).hash); assert.ok(got.manifest.includes(sha(Buffer.from(cfg)) + '  config:deployment-config.json'));
  refuses(() => baseline.verifyApproved({ signerDir: t.signer, approved: absent }), undefined, 'MISMATCH');
  fs.writeFileSync(path.join(t.signer, 'deployment-config.json'), '{\r\n}\r\n'); refuses(() => hashOf(t), /CR byte/);
  fs.writeFileSync(path.join(t.signer, 'deployment-config.json'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(cfg)])); refuses(() => hashOf(t), /byte order mark/);
  fs.writeFileSync(path.join(t.signer, 'deployment-config.json'), Buffer.from([0x7b, 0xff, 0x7d])); refuses(() => hashOf(t), /not valid UTF-8/);
  fs.rmSync(path.join(t.signer, 'deployment-config.json')); fs.mkdirSync(path.join(t.signer, 'deployment-config.json')); refuses(() => hashOf(t), /not a regular file/);
});
test('gate: modifying pinned.cjs changes the baseline, so the old pin value is not trusted as the baseline', () => {
  const t = tree(); const a = hashOf(t); fs.writeFileSync(path.join(t.signer, 'pinned.cjs'), "'use strict';\nmodule.exports = { PINNED_CONFIG_SHA256: '" + '0'.repeat(64) + "' };\n");
  refuses(() => baseline.verifyApproved({ signerDir: t.signer, approved: a }), undefined, 'MISMATCH');
});

// ------------------------------------------------------------------------------------------------ unexpected entries, links, traversal
test('gate: unexpected entries in the signer directory are refused (extra script, module folder, env file, hidden file, approval file)', () => {
  for (const [name, content] of [['extra.cjs', 'x'], ['index.js', 'x'], ['node_modules', null], ['.env', 'x'], ['desktop.ini', 'x'], ['approved-baseline.txt', 'x'], ['native.node', 'x']]) {
    const t = tree(); const p = path.join(t.signer, name); if (content === null) fs.mkdirSync(p); else fs.writeFileSync(p, content);
    refuses(() => hashOf(t), /unexpected entry|runtime file missing/, undefined);
  }
});
test('gate: the tolerated test folder is allowed', () => { const t = tree(); fs.mkdirSync(path.join(t.signer, 'test')); fs.writeFileSync(path.join(t.signer, 'test', 'x.test.cjs'), 'x'); assert.ok(hashOf(t)); });
test('gate: junctions are refused (signer directory, SDK parent, test folder)', (c) => {
  const t = tree(); const u = tree();
  try { fs.symlinkSync(u.signer, path.join(t.root, 'signer-link'), 'junction'); } catch { return c.skip('cannot create a junction here'); }
  refuses(() => baseline.computeManifest({ signerDir: path.join(t.root, 'signer-link') }), /symbolic link or junction/);
  const t2 = tree(); fs.rmSync(path.join(t2.root, 'pk'), { recursive: true }); fs.symlinkSync(path.join(u.root, 'pk'), path.join(t2.root, 'pk'), 'junction'); refuses(() => hashOf(t2), /symbolic link or junction/);
  const t3 = tree(); fs.symlinkSync(u.root, path.join(t3.signer, 'test'), 'junction'); refuses(() => hashOf(t3), /symbolic link or junction/);
});
test('gate: a symbolic link in place of a runtime file or the bundle is refused (skipped where links cannot be created)', (c) => {
  const t = tree(); const u = tree();
  try { fs.rmSync(path.join(t.signer, 'refusal.cjs')); fs.symlinkSync(path.join(u.signer, 'refusal.cjs'), path.join(t.signer, 'refusal.cjs'), 'file'); } catch { return c.skip('cannot create file symbolic links without privilege'); }
  refuses(() => hashOf(t), /symbolic link/);
});
test('gate: no signer directory, a file, and a missing directory are refused', () => {
  refuses(() => baseline.computeManifest({}), /no signer directory/); refuses(() => baseline.computeManifest({ signerDir: path.join(ROOT, 'does-not-exist') }), /missing or unreadable/);
  const t = tree(); refuses(() => baseline.computeManifest({ signerDir: path.join(t.signer, 'tst-signer.cjs') }), /not a directory/);
});

// ------------------------------------------------------------------------------------------------ process environment tripwire
test('gate: code-injection options are refused; harmless options are not', () => {
  for (const [env, argv] of [[{ NODE_OPTIONS: '--require ./x.js' }, []], [{ NODE_OPTIONS: '-r x' }, []], [{ NODE_OPTIONS: '--import x' }, []], [{ NODE_OPTIONS: '--experimental-loader x' }, []], [{ NODE_OPTIONS: '--inspect' }, []],
    [{}, ['--require', 'x']], [{}, ['-r', 'x']], [{}, ['--require=x']], [{}, ['--import=x']], [{}, ['--inspect-brk']], [{}, ['-e']], [{}, ['--eval=1']], [{}, ['-p']]]) refuses(() => baseline.checkProcessEnvironment(env, argv), /code-injection|NODE_OPTIONS/);
  assert.doesNotThrow(() => baseline.checkProcessEnvironment({ NODE_OPTIONS: '--max-old-space-size=4096' }, ['--no-warnings']));
  assert.doesNotThrow(() => baseline.checkProcessEnvironment({}, []));
});

// ------------------------------------------------------------------------------------------------ launcher: structure and order
test('launcher: its only imports are the gate, and the application is required after verification; the gate uses built-ins only', () => {
  const l = fs.readFileSync(path.join(REAL, 'tst-signer.cjs'), 'utf8'); const reqs = [...l.matchAll(/\brequire\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  assert.deepEqual(reqs, ['./baseline.cjs', './tst-signer-main.cjs']);
  assert.ok(l.indexOf("require('./tst-signer-main.cjs')") > l.indexOf('baseline.verifyApproved('), 'the application is required only after verifyApproved');
  assert.ok(l.indexOf("require('./tst-signer-main.cjs')") > l.indexOf('process.exit(4)'), 'the refusal path exits before the application is required');
  const b = fs.readFileSync(path.join(REAL, 'baseline.cjs'), 'utf8'); assert.deepEqual([...b.matchAll(/\brequire\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]).sort(), ['crypto', 'fs', 'path']);
  const m = fs.readFileSync(path.join(REAL, 'tst-signer-main.cjs'), 'utf8'); assert.ok(!/\bmain\(\)\.catch/.test(m) && /module\.exports = \{ run \}/.test(m), 'the application module does not run on load and exports only run');
});

// ------------------------------------------------------------------------------------------------ launcher: behaviour, with canary application modules
function canary(t) {
  for (const m of APP_MODULES) fs.writeFileSync(path.join(t.signer, `${m}.cjs`), `'use strict';\nrequire('fs').appendFileSync(process.env.TST_MARKER, 'loaded ${m}\\n');\nmodule.exports = {};\n`);
  fs.writeFileSync(path.join(t.signer, 'tst-signer-main.cjs'), `'use strict';\nconst fs = require('fs');\nfs.appendFileSync(process.env.TST_MARKER, 'loaded main\\n');\nfor (const m of ${JSON.stringify(APP_MODULES)}) require('./' + m + '.cjs');\nmodule.exports = { run(a, proof) { fs.appendFileSync(process.env.TST_MARKER, 'RUN ' + a.join(' ') + '\\n' + 'PROOF ' + require('./baseline.cjs').isVerified(proof) + '\\n'); } };\n`);
}
function launch(t, args, { env = {}, execArgv = [], expectNoApp = false } = {}) {
  const app = path.join(t.root, 'appdata-' + (++counter)); fs.mkdirSync(path.join(app, 'TobinTestKeys'), { recursive: true });
  const marker = path.join(t.root, 'marker-' + counter + '.txt');
  const r = spawnSync(process.execPath, [...execArgv, path.join(t.signer, 'tst-signer.cjs'), ...args], { encoding: 'utf8', cwd: t.root, timeout: 30000,
    env: { ...process.env, NODE_OPTIONS: '', LOCALAPPDATA: app, TST_MARKER: marker, ...env } });
  const m = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : null; void expectNoApp;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, marker: m, appFiles: fs.readdirSync(path.join(app, 'TobinTestKeys')) };
}
const OPS = ['deploy', 'mint-C', 'mint-D'];

test('launcher: with the CORRECT approved hash the application is loaded, after verification (control), and receives the arguments without the flag', () => {
  const t = tree(); canary(t); const h = hashOf(t);
  for (const args of [['init'], ['preview', 'deploy'], ['execute', 'mint-C']]) {
    const r = launch(t, ['--approved-baseline', h, ...args]); assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.marker.trim().split('\n'), ['loaded main', ...APP_MODULES.map((m) => `loaded ${m}`), `RUN ${args.join(' ')}`, 'PROOF true']);
  }
});
test('launcher: a WRONG approved hash refuses with exit 4 BEFORE any application module is loaded (no key module, no SDK, no state, no network code)', () => {
  const t = tree(); canary(t); const wrong = 'a'.repeat(64);
  for (const args of [['init'], ['preview', 'deploy'], ['execute', 'deploy'], ['execute', 'mint-C'], ['execute', 'mint-D']]) {
    const r = launch(t, ['--approved-baseline', wrong, ...args]); assert.equal(r.status, 4, args.join(' ')); assert.match(r.stderr, /REFUSED: the signer baseline does not equal the approved baseline/);
    assert.equal(r.marker, null, 'no application module (including dpapi-key and sdk-loader) was loaded'); assert.deepEqual(r.appFiles, []); assert.equal(r.stdout, '');
  }
});
test('launcher: every modification of a runtime file after approval is refused with exit 4 before the application loads', () => {
  for (const f of CLOSURE.filter((x) => x !== 'baseline.cjs' && x !== 'tst-signer.cjs')) {
    const t = tree(); canary(t); const h = hashOf(t); append(path.join(t.signer, f), '\n// changed after approval\n');
    const r = launch(t, ['--approved-baseline', h, 'execute', 'deploy']); assert.equal(r.status, 4, f); assert.equal(r.marker, null, f);
  }
});
test('launcher: SDK modification after approval is refused before the application loads', () => {
  const t = tree(); canary(t); const h = hashOf(t); append(path.join(t.pkg, 'dist', 'stellar-sdk.js'), '\n// x\n');
  const r = launch(t, ['--approved-baseline', h, 'execute', 'deploy']); assert.equal(r.status, 4); assert.equal(r.marker, null);
  const t2 = tree(); canary(t2); const h2 = hashOf(t2); fs.rmSync(path.join(t2.root, 'pk'), { recursive: true });
  const r2 = launch(t2, ['--approved-baseline', h2, 'execute', 'deploy']); assert.equal(r2.status, 4); assert.equal(r2.marker, null);
});
test('launcher: a configuration added after approval changes the baseline and is refused', () => {
  const t = tree(); canary(t); const h = hashOf(t); fs.writeFileSync(path.join(t.signer, 'deployment-config.json'), '{"x":1}\n');
  const r = launch(t, ['--approved-baseline', h, 'init']); assert.equal(r.status, 4); assert.equal(r.marker, null);
});
test('launcher: invalid approved hashes exit 2 and load nothing', () => {
  const t = tree(); canary(t); const good = hashOf(t);
  for (const b of ['', 'abc', good.toUpperCase(), '0x' + good, good + 'a', 'z'.repeat(64)]) { const r = launch(t, ['--approved-baseline', b, 'execute', 'deploy']); assert.equal(r.status, 2, JSON.stringify(b)); assert.equal(r.marker, null); }
});
test('launcher: init and execute without an approved hash exit 2; nothing is loaded or created', () => {
  const t = tree(); canary(t);
  for (const args of [['init'], ['execute', 'deploy'], ['execute', 'mint-D']]) { const r = launch(t, args); assert.equal(r.status, 2); assert.match(r.stderr, /requires --approved-baseline/); assert.equal(r.marker, null); assert.deepEqual(r.appFiles, []); }
});
test('launcher: preview WITHOUT an approved hash only displays the candidate baseline and stops (exit 3); it loads nothing and creates no state', () => {
  const t = tree(); canary(t); const h = hashOf(t);
  for (const op of OPS) { const r = launch(t, ['preview', op]); assert.equal(r.status, 3); assert.ok(r.stdout.includes(`candidate baseline: ${h}`)); assert.match(r.stderr, /UNPINNED: preview was not run/); assert.equal(r.marker, null); assert.deepEqual(r.appFiles, []); }
});
test('launcher: the baseline command prints the manifest and hash (exit 0), equal to the oracle, and loads nothing', () => {
  const t = tree(); canary(t); const r = launch(t, ['baseline']); assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(oracle(t).text.trimEnd())); assert.ok(r.stdout.includes(`candidate baseline: ${oracle(t).hash}`)); assert.equal(r.marker, null);
});
test('launcher: preview WITH the right approved hash runs the application (control)', () => {
  const t = tree(); canary(t); const r = launch(t, ['--approved-baseline', hashOf(t), 'preview', 'mint-C']); assert.equal(r.status, 0); assert.match(r.marker, /RUN preview mint-C/);
});
test('launcher: usage errors exit 2 with usage and load nothing, even with a correct hash', () => {
  const t = tree(); canary(t); const h = hashOf(t);
  for (const args of [[], ['sign'], ['preview'], ['execute'], ['execute', 'transfer'], ['execute', 'deploy', 'extra'], ['init', 'deploy'], ['baseline', 'deploy'], ['preview', 'mint-E'], ['--help'], ['--approved-baseline'], ['--approved-baseline', h],
    ['--approved-baseline', h, 'sign'], ['--approved-baseline', h, '--approved-baseline', h, 'init'], ['init', '--approved-baseline', h], ['execute', 'deploy', '--approved-baseline', h], [`--approved-baseline=${h}`, 'init']]) {
    const r = launch(t, args); assert.equal(r.status, 2, JSON.stringify(args)); assert.match(r.stderr, /usage:/); assert.equal(r.marker, null);
  }
});
test('launcher: bypass attempts do not work (environment variable, file in the signer directory, pinned.cjs value, flag order, options after the command)', () => {
  const t = tree(); canary(t); const h = hashOf(t);
  let r = launch(t, ['execute', 'deploy'], { env: { TOBIN_APPROVED_BASELINE: h, TST_APPROVED_BASELINE: h, APPROVED_BASELINE: h } }); assert.equal(r.status, 2); assert.equal(r.marker, null);
  r = launch(t, ['preview', 'deploy'], { env: { TOBIN_APPROVED_BASELINE: h } }); assert.equal(r.status, 3); assert.equal(r.marker, null);
  fs.writeFileSync(path.join(t.signer, 'approved-baseline.txt'), h + '\n'); r = launch(t, ['execute', 'deploy']); assert.equal(r.status, 2); assert.equal(r.marker, null);
  r = launch(t, ['--approved-baseline', h, 'execute', 'deploy']); assert.equal(r.status, 4, 'an approval file inside the signer directory is an unexpected entry and is refused'); assert.equal(r.marker, null);
  fs.rmSync(path.join(t.signer, 'approved-baseline.txt'));
  fs.writeFileSync(path.join(t.signer, 'pinned.cjs'), `'use strict';\nmodule.exports = { PINNED_CONFIG_SHA256: ${JSON.stringify(h)} };\n`);
  r = launch(t, ['--approved-baseline', h, 'execute', 'deploy']); assert.equal(r.status, 4, 'pinned.cjs is part of the closure and is not an approval'); assert.equal(r.marker, null);
});
test('launcher: a missing gate (baseline.cjs) cannot start the signer: exit is non-zero and nothing is loaded', () => {
  const t = tree(); canary(t); const h = hashOf(t); fs.rmSync(path.join(t.signer, 'baseline.cjs'));
  const r = launch(t, ['--approved-baseline', h, 'execute', 'deploy']); assert.notEqual(r.status, 0); assert.equal(r.marker, null);
});
test('launcher: a code-injection start option is refused (exit 4) before anything else', () => {
  const t = tree(); canary(t); fs.writeFileSync(path.join(t.root, 'preload.cjs'), '// harmless empty preload\n');
  const r = launch(t, ['--approved-baseline', hashOf(t), 'execute', 'deploy'], { execArgv: ['--require', path.join(t.root, 'preload.cjs')] }); assert.equal(r.status, 4); assert.match(r.stderr, /code-injection/); assert.equal(r.marker, null);
});
test('launcher: a corrupted gate or launcher that is still running cannot be detected by the gate itself (documented limit); the approved hash then no longer matches the external check', () => {
  // A launcher replaced by one that skips the gate would run the application without any hash. The gate cannot prevent that; the external tool detects it (see its tests).
  const t = tree(); const before = hashOf(t); append(path.join(t.signer, 'tst-signer.cjs'), '\n// skips nothing, but is different\n');
  assert.notEqual(hashOf(t), before, 'the launcher is part of the hashed closure, so a trusted copy of the gate or the external tool sees the change');
});

// ------------------------------------------------------------------------------------------------ the application cannot be started without the gate's proof
test('application: the entry function refuses to run without a proof from a successful verification (direct require, forged or merely computed objects)', () => {
  const app = require('../tst-signer-main.cjs');
  assert.deepEqual(Object.keys(app), ['run'], 'main is not exported');
  const computed = baseline.computeManifest({ signerDir: REAL });
  const forged = Object.freeze({ manifest: computed.manifest, hash: computed.hash, entries: computed.entries });
  for (const bad of [undefined, null, 0, 'yes', {}, [], { verified: true }, forged, computed, { ...computed }]) {
    assert.throws(() => app.run(['init'], bad), (e) => e instanceof baseline.IntegrityError && /without a verified baseline/.test(e.message));
  }
});
test('gate: only a successful verifyApproved produces a proof; copies, wrong hashes and plain manifests are not proofs', () => {
  const t = tree(); const h = hashOf(t); const proof = baseline.verifyApproved({ signerDir: t.signer, approved: h });
  assert.equal(baseline.isVerified(proof), true); assert.ok(Object.isFrozen(proof)); assert.equal(proof.hash, h);
  assert.equal(baseline.isVerified({ ...proof }), false); assert.equal(baseline.isVerified(baseline.computeManifest({ signerDir: t.signer })), false);
  assert.throws(() => baseline.verifyApproved({ signerDir: t.signer, approved: 'a'.repeat(64) })); assert.equal(baseline.isVerified(undefined), false);
});
