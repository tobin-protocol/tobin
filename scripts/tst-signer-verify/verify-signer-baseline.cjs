'use strict';
// EXTERNAL, hash-only verifier for the restricted TST signer baseline (Phase 2C, Part A).
//
//   node verify-signer-baseline.cjs --signer-dir <dir> --expected <64 lowercase hex> [--sdk-dir <dir>] [--manifest <file>] [--print-manifest]
//
// Use it from a FRESH, TRUSTED copy of this file (never from the signer directory being checked), and give --expected from a record kept
// independently of that directory. It is an independent implementation: it does NOT import baseline.cjs or anything from the signer. It reads
// files and prints hashes. It cannot load a key, run the signer, open a network connection, or modify anything.
//
// It prints "VERIFY: MATCH" and exits 0 only when EVERY check passes:
//   * --expected is exactly 64 lowercase hex characters (it is never read from the signer directory);
//   * the signer directory has no unexpected entries and every closure file is a regular, non-linked, LF-only, BOM-free, valid UTF-8 file;
//   * every relative require() in the closure targets a closure file, no require() has a non-literal argument, and only approved built-ins are used
//     (so a runtime dependency cannot be omitted from the closure without this tool noticing);
//   * the SDK is @stellar/stellar-sdk 17.4.0 and its package.json and dist/stellar-sdk.js are readable regular files;
//   * deployment-config.json (when present) is a valid text file; it is hashed, or the label is ABSENT;
//   * with --manifest, the supplied manifest is well formed and byte-identical to the computed one;
//   * the SHA-256 of the computed manifest equals --expected.
// Exit codes: 0 MATCH; 1 MISMATCH (everything was readable but the hash differs); 2 REFUSED (malformed or missing input, unreadable file,
// unexpected entry, link, policy violation); 3 usage.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RUNTIME = ['authorization.cjs', 'baseline.cjs', 'dpapi-key.cjs', 'pinned.cjs', 'refusal.cjs', 'sdk-loader.cjs', 'state-store.cjs', 'tst-signer-core.cjs',
  'tst-signer-main.cjs', 'tst-signer.cjs'];
const NOT_RUNTIME_BUT_ALLOWED = ['make-deployment-config.cjs', 'test'];
const CONFIG = 'deployment-config.json';
const BUILTINS_OK = new Set(['fs', 'path', 'crypto', 'vm', 'child_process', 'readline']);
const SDK_NAME = '@stellar/stellar-sdk';
const SDK_VERSION = '17.4.0';
const HEADER = 'TOBIN-TST-SIGNER-BASELINE v1';

class Refused extends Error {}
const no = (m) => { throw new Refused(m); };
const digest = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function parseArgs(argv) {
  const known = { '--signer-dir': 'signerDir', '--expected': 'expected', '--sdk-dir': 'sdkDir', '--manifest': 'manifestFile' };
  const a = { printManifest: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--print-manifest') { if (a.printManifest) return null; a.printManifest = true; continue; }
    const key = known[t];
    if (!key || a[key] !== undefined || argv[i + 1] === undefined) return null;
    a[key] = argv[++i];
  }
  if (a.signerDir === undefined || a.expected === undefined) return null;
  return a;
}

function statNoLink(p, what) {
  let st; try { st = fs.lstatSync(p); } catch { no(`${what}: missing or unreadable`); }
  if (st.isSymbolicLink()) no(`${what}: is a symbolic link or junction`);
  return st;
}

function textFile(p, what) {
  if (!statNoLink(p, what).isFile()) no(`${what}: not a regular file`);
  let b; try { b = fs.readFileSync(p); } catch { no(`${what}: cannot be read`); }
  if (b.indexOf(0x0d) !== -1) no(`${what}: contains a CR (line feed required)`);
  if (b.length > 2 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) no(`${what}: starts with a BOM`);
  try { new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { no(`${what}: is not valid UTF-8`); }
  return b;
}

function rawFile(p, what) {
  if (!statNoLink(p, what).isFile()) no(`${what}: not a regular file`);
  try { return fs.readFileSync(p); } catch { no(`${what}: cannot be read`); }
}

function sameDir(file, expectedParent, what) {
  let r; try { r = fs.realpathSync.native(file); } catch { no(`${what}: cannot be resolved`); }
  const f = (s) => (process.platform === 'win32' ? s.toLowerCase() : s);
  if (f(path.dirname(r)) !== f(expectedParent)) no(`${what}: resolves to a different directory`);
}

function checkRequires(name, source) {
  // The closure is only complete if every require() is a string literal that is a closure file or an approved built-in.
  const calls = [...source.matchAll(/\brequire\s*\(([^)]*)\)/g)];
  for (const m of calls) {
    const arg = m[1].trim();
    const lit = /^'([^']*)'$|^"([^"]*)"$/.exec(arg);
    if (!lit) no(`${name}: require() with a non-literal argument`);
    const target = lit[1] !== undefined ? lit[1] : lit[2];
    if (target.startsWith('.')) {
      const rel = target.replace(/^\.\//, '');
      if (!RUNTIME.includes(rel)) no(`${name}: requires ${target}, which is not in the runtime closure`);
    } else if (!BUILTINS_OK.has(target)) no(`${name}: requires "${target}", which is not an approved built-in`);
  }
  if (/\bimport\s*\(/.test(source)) no(`${name}: dynamic import()`);
  if (/\beval\s*\(|\bnew\s+Function\b/.test(source)) no(`${name}: eval or the Function constructor`);
}

function compute(signerDir, sdkDirArg) {
  const dir = path.resolve(signerDir);
  if (!statNoLink(dir, 'signer directory').isDirectory()) no('signer directory: not a directory');
  const realDir = fs.realpathSync.native(dir);
  let names; try { names = fs.readdirSync(dir); } catch { no('signer directory: cannot be listed'); }
  const allowed = new Set([...RUNTIME, ...NOT_RUNTIME_BUT_ALLOWED, CONFIG]);
  for (const n of names) if (!allowed.has(n)) no(`unexpected entry in the signer directory: ${JSON.stringify(n)}`);
  for (const f of RUNTIME) if (!names.includes(f)) no(`runtime file missing: ${f}`);
  for (const t of NOT_RUNTIME_BUT_ALLOWED) if (names.includes(t)) statNoLink(path.join(dir, t), `entry ${t}`);

  const rows = [];
  for (const f of RUNTIME) {
    const p = path.join(dir, f); const b = textFile(p, `runtime file ${f}`); sameDir(p, realDir, `runtime file ${f}`);
    checkRequires(f, b.toString('utf8'));
    rows.push([`file:${f}`, digest(b)]);
  }
  if (names.includes(CONFIG)) { const p = path.join(dir, CONFIG); const b = textFile(p, CONFIG); sameDir(p, realDir, CONFIG); rows.push([`config:${CONFIG}`, digest(b)]); }
  else rows.push([`config:${CONFIG}`, 'ABSENT']);

  const sdk = path.resolve(sdkDirArg !== undefined ? sdkDirArg : path.join(dir, '..', 'pk', 'x-stellar-stellar-sdk-17.4.0', 'package'));
  for (const d of [path.dirname(path.dirname(sdk)), path.dirname(sdk), sdk, path.join(sdk, 'dist')]) { if (!statNoLink(d, `SDK directory ${path.basename(d)}`).isDirectory()) no(`SDK directory ${path.basename(d)}: not a directory`); }
  const realSdk = fs.realpathSync.native(sdk);
  const pjP = path.join(sdk, 'package.json'); const bdP = path.join(sdk, 'dist', 'stellar-sdk.js');
  const pj = rawFile(pjP, 'SDK package.json'); const bd = rawFile(bdP, 'SDK dist/stellar-sdk.js');
  sameDir(pjP, realSdk, 'SDK package.json'); sameDir(bdP, path.join(realSdk, 'dist'), 'SDK dist/stellar-sdk.js');
  let meta; try { meta = JSON.parse(pj.toString('utf8')); } catch { no('SDK package.json: not valid JSON'); }
  if (!meta || meta.name !== SDK_NAME || meta.version !== SDK_VERSION) no(`SDK identity is not ${SDK_NAME}@${SDK_VERSION}`);
  rows.push([`external:${SDK_NAME}@${SDK_VERSION}/package.json`, digest(pj)]);
  rows.push([`external:${SDK_NAME}@${SDK_VERSION}/dist/stellar-sdk.js`, digest(bd)]);

  rows.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  const text = HEADER + '\n' + rows.map(([l, h]) => `${h}  ${l}\n`).join('');
  return { text, hash: digest(Buffer.from(text, 'utf8')) };
}

function checkSuppliedManifest(file, computed) {
  let b; try { b = fs.readFileSync(file); } catch { no('manifest file: cannot be read'); }
  if (b.indexOf(0x0d) !== -1) no('manifest: contains a CR (LF line ends required)');
  if (b.length > 2 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) no('manifest: starts with a BOM');
  let t; try { t = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { no('manifest: not valid UTF-8'); }
  if (!t.endsWith('\n')) no('manifest: no final line feed');
  const lines = t.slice(0, -1).split('\n');
  if (lines[0] !== HEADER) no('manifest: wrong or missing header');
  const labels = [];
  for (const l of lines.slice(1)) {
    const m = /^([0-9a-f]{64}|ABSENT)  (file:[A-Za-z0-9._-]+|config:[A-Za-z0-9._-]+|external:[^\s]+)$/.exec(l);
    if (!m) no(`manifest: malformed line ${JSON.stringify(l.slice(0, 80))}`);
    labels.push(m[2]);
  }
  if (new Set(labels).size !== labels.length) no('manifest: duplicate label');
  if (labels.join('\n') !== [...labels].sort().join('\n')) no('manifest: lines are not in ordinal order');
  return t === computed.text;
}

function main(argv) {
  const a = parseArgs(argv);
  if (!a) {
    process.stderr.write('usage: verify-signer-baseline.cjs --signer-dir <dir> --expected <64 lowercase hex> [--sdk-dir <dir>] [--manifest <file>] [--print-manifest]\n');
    return 3;
  }
  try {
    if (!/^[0-9a-f]{64}$/.test(a.expected)) no('--expected must be exactly 64 lowercase hexadecimal characters');
    const c = compute(a.signerDir, a.sdkDir);
    if (a.printManifest) process.stdout.write(c.text);
    if (a.manifestFile !== undefined && !checkSuppliedManifest(a.manifestFile, c)) {
      process.stdout.write(`computed baseline : ${c.hash}\nVERIFY: MISMATCH (the supplied manifest differs from the computed manifest)\n`); return 1;
    }
    const equal = crypto.timingSafeEqual(Buffer.from(c.hash, 'hex'), Buffer.from(a.expected, 'hex'));
    process.stdout.write(`computed baseline : ${c.hash}\nexpected baseline : ${a.expected}\n`);
    if (!equal) { process.stdout.write('VERIFY: MISMATCH\n'); return 1; }
    process.stdout.write('VERIFY: MATCH\n');
    return 0;
  } catch (e) {
    process.stderr.write(`VERIFY: REFUSED: ${e instanceof Refused ? e.message : 'unexpected error: ' + (e && e.message ? e.message : String(e))}\n`);
    return 2;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main, compute };
