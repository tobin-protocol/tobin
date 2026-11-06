'use strict';
// Tests of the external hash-only verifier. Temporary copies of the real files, no key, no secret, no network; the signer is never run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const TOOL = path.join(__dirname, 'verify-signer-baseline.cjs');
const SIGNER = path.resolve(__dirname, '..', 'tst-signer', 'signer');
const SDK = path.resolve(__dirname, '..', 'tst-signer', 'pk', 'x-stellar-stellar-sdk-17.4.0', 'package');
const RUNTIME = ['authorization.cjs', 'baseline.cjs', 'dpapi-key.cjs', 'pinned.cjs', 'refusal.cjs', 'sdk-loader.cjs', 'state-store.cjs', 'tst-signer-core.cjs', 'tst-signer-main.cjs', 'tst-signer.cjs'];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'tst-vf-')); test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
let n = 0;
function tree() {
  const root = path.join(ROOT, 't' + (++n)); const signer = path.join(root, 'signer'); const pkg = path.join(root, 'pk', 'x-stellar-stellar-sdk-17.4.0', 'package');
  fs.mkdirSync(signer, { recursive: true }); fs.mkdirSync(path.join(pkg, 'dist'), { recursive: true });
  for (const f of [...RUNTIME, 'make-deployment-config.cjs']) fs.copyFileSync(path.join(SIGNER, f), path.join(signer, f));
  fs.copyFileSync(path.join(SDK, 'package.json'), path.join(pkg, 'package.json')); fs.copyFileSync(path.join(SDK, 'dist', 'stellar-sdk.js'), path.join(pkg, 'dist', 'stellar-sdk.js'));
  return { root, signer, pkg };
}
// Oracle written for the tests from the specification (independent of both the tool and the in-signer gate).
function expected(t, cfg) {
  const rows = RUNTIME.map((f) => [`file:${f}`, sha(fs.readFileSync(path.join(t.signer, f)))]);
  rows.push(['config:deployment-config.json', cfg === undefined ? 'ABSENT' : sha(Buffer.from(cfg))]);
  rows.push(['external:@stellar/stellar-sdk@17.4.0/package.json', sha(fs.readFileSync(path.join(t.pkg, 'package.json')))]);
  rows.push(['external:@stellar/stellar-sdk@17.4.0/dist/stellar-sdk.js', sha(fs.readFileSync(path.join(t.pkg, 'dist', 'stellar-sdk.js')))]);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const text = 'TOBIN-TST-SIGNER-BASELINE v1\n' + rows.map(([l, h]) => `${h}  ${l}\n`).join('');
  return { text, hash: sha(Buffer.from(text)) };
}
const run = (args, opts = {}) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', timeout: 30000, ...opts });
const verify = (t, hash, extra = []) => run(['--signer-dir', t.signer, '--expected', hash, ...extra]);
const append = (file, s) => fs.writeFileSync(file, Buffer.concat([fs.readFileSync(file), Buffer.from(s)]));

test('tool: exact match prints VERIFY: MATCH and exits 0; the hash equals the independent oracle', () => {
  const t = tree(); const o = expected(t); const r = verify(t, o.hash); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /^VERIFY: MATCH$/m); assert.ok(r.stdout.includes(o.hash));
  const p = verify(t, o.hash, ['--print-manifest']); assert.ok(p.stdout.startsWith(o.text), 'the printed manifest equals the oracle manifest byte for byte');
});
test('tool: the real signer directory verifies against the oracle hash', () => {
  const real = { signer: SIGNER, pkg: SDK }; const r = run(['--signer-dir', SIGNER, '--expected', expected(real).hash]); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /VERIFY: MATCH/);
});
test('tool: a wrong expected hash is a MISMATCH (exit 1) and never prints MATCH', () => {
  const t = tree(); const r = verify(t, 'c'.repeat(64)); assert.equal(r.status, 1); assert.match(r.stdout, /VERIFY: MISMATCH/); assert.doesNotMatch(r.stdout, /VERIFY: MATCH/);
});
test('tool: invalid expected hashes are REFUSED (exit 2), never accepted', () => {
  const t = tree(); const good = expected(t).hash;
  for (const b of ['', 'abc', good.toUpperCase(), '0x' + good, good + ' ', ' ' + good, good.slice(1), good + '0', 'g'.repeat(64)]) { const r = verify(t, b); assert.equal(r.status, 2, JSON.stringify(b)); assert.doesNotMatch(r.stdout, /MATCH/); }
});
for (const f of RUNTIME) {
  test(`tool: a modified runtime file is a MISMATCH: ${f}`, () => { const t = tree(); const h = expected(t).hash; append(path.join(t.signer, f), '\n// changed\n'); const r = verify(t, h); assert.equal(r.status, 1, r.stderr + r.stdout); assert.doesNotMatch(r.stdout, /VERIFY: MATCH/); });
  test(`tool: a missing runtime file is REFUSED: ${f}`, () => { const t = tree(); const h = expected(t).hash; fs.rmSync(path.join(t.signer, f)); const r = verify(t, h); assert.equal(r.status, 2); assert.match(r.stderr, /runtime file missing/); });
}
test('tool: the launcher and the gate (the bootstrap) are covered: modifying either is detected from outside, which the in-signer gate cannot do for itself', () => {
  for (const f of ['tst-signer.cjs', 'baseline.cjs']) { const t = tree(); const h = expected(t).hash; fs.writeFileSync(path.join(t.signer, f), "'use strict';\n// replacement that skips verification\nrequire('./tst-signer-main.cjs').run(process.argv.slice(2));\n"); const r = verify(t, h); assert.equal(r.status, 1, f); }
});
test('tool: SDK modification, wrong SDK identity, missing SDK are all refused or mismatched', () => {
  let t = tree(); let h = expected(t).hash; append(path.join(t.pkg, 'dist', 'stellar-sdk.js'), '\n// x\n'); assert.equal(verify(t, h).status, 1);
  t = tree(); h = expected(t).hash; append(path.join(t.pkg, 'package.json'), ' '); assert.equal(verify(t, h).status, 1);
  t = tree(); fs.writeFileSync(path.join(t.pkg, 'package.json'), fs.readFileSync(path.join(t.pkg, 'package.json'), 'utf8').replace('"version": "17.4.0"', '"version": "17.4.1"')); let r = verify(t, 'd'.repeat(64)); assert.equal(r.status, 2); assert.match(r.stderr, /SDK identity/);
  t = tree(); fs.rmSync(path.join(t.pkg, 'dist', 'stellar-sdk.js')); r = verify(t, 'd'.repeat(64)); assert.equal(r.status, 2);
  t = tree(); fs.rmSync(path.join(t.root, 'pk'), { recursive: true }); r = verify(t, 'd'.repeat(64)); assert.equal(r.status, 2);
});
test('tool: --sdk-dir selects the SDK that is hashed', () => {
  const t = tree(); const u = tree(); append(path.join(u.pkg, 'dist', 'stellar-sdk.js'), '\n// other\n');
  const h = expected(t).hash; const r = run(['--signer-dir', t.signer, '--expected', h, '--sdk-dir', u.pkg]); assert.equal(r.status, 1);
});
test('tool: CR, BOM and invalid UTF-8 are refused in runtime files and in the configuration', () => {
  let t = tree(); fs.writeFileSync(path.join(t.signer, 'pinned.cjs'), fs.readFileSync(path.join(t.signer, 'pinned.cjs'), 'utf8').replace(/\n/g, '\r\n')); assert.equal(verify(t, 'e'.repeat(64)).status, 2);
  t = tree(); fs.writeFileSync(path.join(t.signer, 'pinned.cjs'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fs.readFileSync(path.join(t.signer, 'pinned.cjs'))])); assert.equal(verify(t, 'e'.repeat(64)).status, 2);
  t = tree(); append(path.join(t.signer, 'pinned.cjs'), Buffer.from([0xff, 0xfe])); assert.equal(verify(t, 'e'.repeat(64)).status, 2);
  for (const bad of [Buffer.from('{\r\n}\r\n'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{}\n')]), Buffer.from([0x7b, 0xff, 0x7d])]) { t = tree(); fs.writeFileSync(path.join(t.signer, 'deployment-config.json'), bad); assert.equal(verify(t, 'e'.repeat(64)).status, 2); }
});
test('tool: the deployment configuration is included when present (and the baseline then differs from the ABSENT baseline)', () => {
  const t = tree(); const absent = expected(t).hash; const cfg = '{"example":true}\n'; fs.writeFileSync(path.join(t.signer, 'deployment-config.json'), cfg);
  assert.equal(verify(t, expected(t, cfg).hash).status, 0); assert.equal(verify(t, absent).status, 1);
});
test('tool: unexpected entries are refused (including an expected-hash file placed inside the signer directory, which is never read)', () => {
  for (const [name, c] of [['extra.cjs', 'x'], ['expected-hash.txt', 'x'], ['approved-baseline.txt', 'x'], ['.env', 'x'], ['node_modules', null]]) {
    const t = tree(); const h = expected(t).hash; const p = path.join(t.signer, name); if (c === null) fs.mkdirSync(p); else fs.writeFileSync(p, c);
    const r = verify(t, h); assert.equal(r.status, 2, name); assert.match(r.stderr, /unexpected entry/);
  }
});
test('tool: the expected hash comes only from --expected: it is mandatory and is not looked up anywhere else', () => {
  const t = tree(); const h = expected(t).hash;
  let r = run(['--signer-dir', t.signer], { env: { ...process.env, TOBIN_APPROVED_BASELINE: h, EXPECTED: h } }); assert.equal(r.status, 3);
  r = run(['--signer-dir', t.signer, '--expected', h, '--expected', h]); assert.equal(r.status, 3);
  assert.ok(!/readFileSync\([^)]*(expected|approved)/i.test(fs.readFileSync(TOOL, 'utf8')), 'the tool never reads an expected-hash file');
});
test('tool: a runtime dependency cannot be omitted: relative requires outside the closure, non-literal requires, unapproved built-ins, dynamic import and eval are refused', () => {
  for (const [code, re] of [["require('./extra.cjs');", /not in the runtime closure/], ["const n = 'fs'; require(n);", /non-literal/], ["require('http');", /not an approved built-in/], ["require('child_process').exec;", null], ["import('x');", /dynamic import/], ["eval('1');", /eval/]]) {
    const t = tree(); append(path.join(t.signer, 'state-store.cjs'), '\n' + code + '\n'); const r = verify(t, 'f'.repeat(64));
    if (code.startsWith("require('child_process')")) assert.equal(r.status, 1, 'an approved built-in is not itself refused (the hash catches the change)'); else { assert.equal(r.status, 2, code); assert.match(r.stderr, re); }
  }
});
test('tool: junctions are refused where they can be created', (c) => {
  const t = tree(); const u = tree();
  try { fs.symlinkSync(u.signer, path.join(t.root, 'signer-link'), 'junction'); } catch { return c.skip('cannot create a junction here'); }
  assert.equal(run(['--signer-dir', path.join(t.root, 'signer-link'), '--expected', 'a'.repeat(64)]).status, 2);
  const t2 = tree(); fs.rmSync(path.join(t2.root, 'pk'), { recursive: true }); fs.symlinkSync(path.join(u.root, 'pk'), path.join(t2.root, 'pk'), 'junction'); assert.equal(verify(t2, 'a'.repeat(64)).status, 2);
});
test('tool: --manifest accepts the exact manifest and rejects malformed or different manifests', () => {
  const t = tree(); const o = expected(t); const f = path.join(t.root, 'm.txt');
  fs.writeFileSync(f, o.text); assert.equal(verify(t, o.hash, ['--manifest', f]).status, 0);
  const lines = o.text.split('\n');
  const variants = { crlf: o.text.replace(/\n/g, '\r\n'), nofinal: o.text.slice(0, -1), header: o.text.replace('v1', 'v2'), unsorted: [lines[0], lines[2], lines[1], ...lines.slice(3)].join('\n'), dup: [lines[0], lines[1], lines[1], ...lines.slice(2)].join('\n'),
    garbage: o.text + 'not a manifest line\n', short: o.text.replace(/^[0-9a-f]{64}/m, 'abc'), bom: '﻿' + o.text };
  for (const [name, text] of Object.entries(variants)) { fs.writeFileSync(f, text); const r = verify(t, o.hash, ['--manifest', f]); assert.equal(r.status, 2, name); assert.doesNotMatch(r.stdout, /VERIFY: MATCH/); }
  fs.writeFileSync(f, o.text.replace(/^[0-9a-f]{64}/m, (m) => (m[0] === 'a' ? 'b' : 'a') + m.slice(1)).replace(/\n$/, '\n')); const bad = verify(t, o.hash, ['--manifest', f]); assert.equal(bad.status, 1); assert.match(bad.stdout, /MISMATCH/);
  assert.equal(verify(t, o.hash, ['--manifest', path.join(t.root, 'nope.txt')]).status, 2);
});
test('tool: usage errors exit 3 (missing, unknown or repeated arguments)', () => {
  const t = tree(); const h = 'a'.repeat(64);
  for (const args of [[], ['--signer-dir', t.signer], ['--expected', h], ['--signer-dir', t.signer, '--expected'], ['--signer-dir', t.signer, '--expected', h, '--bogus'], ['--signer-dir', t.signer, '--signer-dir', t.signer, '--expected', h], ['--print-manifest', '--print-manifest', '--signer-dir', t.signer, '--expected', h]]) assert.equal(run(args).status, 3, JSON.stringify(args));
});
test('tool: an unreadable or missing signer directory is refused; a file is not a directory', () => {
  assert.equal(run(['--signer-dir', path.join(ROOT, 'nope'), '--expected', 'a'.repeat(64)]).status, 2);
  const t = tree(); assert.equal(run(['--signer-dir', path.join(t.signer, 'tst-signer.cjs'), '--expected', 'a'.repeat(64)]).status, 2);
});
test('tool: it is independent code: it imports nothing from the signer and only Node built-ins', () => {
  const src = fs.readFileSync(TOOL, 'utf8'); assert.deepEqual([...src.matchAll(/\brequire\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]).sort(), ['crypto', 'fs', 'path']);
  assert.ok(!/require\([^)]*(baseline|tst-signer|dpapi|state-store|sdk-loader)/.test(src), 'no require of any signer file');
});
test('tool and in-signer gate agree on the same trees (two implementations, same author: a consistency check, not independent verification)', () => {
  const gate = require('../tst-signer/signer/baseline.cjs');
  for (const cfg of [undefined, '{"a":1}\n']) { const t = tree(); if (cfg !== undefined) fs.writeFileSync(path.join(t.signer, 'deployment-config.json'), cfg); const g = gate.computeManifest({ signerDir: t.signer }).hash; assert.equal(g, expected(t, cfg).hash); assert.equal(verify(t, g).status, 0); }
});
