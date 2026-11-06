'use strict';
// Integrity gate for the restricted TST signer (Phase 2C, Part B). Uses ONLY Node built-ins, so it can run before any application module is loaded.
//
// It hashes the exact runtime closure of the signer, the SDK identity files and the deployment configuration (when present), builds the
// baseline manifest and compares its SHA-256 with an APPROVED hash that the operator supplies from outside the signer directory.
// It fails closed: any missing, unexpected, unreadable, linked or malformed input is a refusal.
//
// This file is itself part of the protected closure, but it cannot vouch for itself: code that is already running cannot prove it was not
// altered. Its own bytes (and tst-signer.cjs, the launcher) are protected only by the EXTERNAL tool, verify-signer-baseline.cjs, run from a
// trusted copy. See docs/product/architecture/phase-2c/tst-signer-security-architecture.md for the trust boundary.
//
// Manifest (canonical procedure version 1, unchanged from B0): header "TOBIN-TST-SIGNER-BASELINE v1", then one line per input
// "<sha256>  <label>" in ordinal order of the label, LF line ends, final LF. Baseline hash = SHA-256 of the manifest bytes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CLOSURE = Object.freeze(['authorization.cjs', 'baseline.cjs', 'dpapi-key.cjs', 'pinned.cjs', 'refusal.cjs', 'sdk-loader.cjs', 'state-store.cjs',
  'tst-signer-core.cjs', 'tst-signer-main.cjs', 'tst-signer.cjs']);
// Present in the signer directory but never loaded by the signer: not part of the closure, not hashed.
const TOLERATED = Object.freeze(['make-deployment-config.cjs', 'test']);
const CONFIG_NAME = 'deployment-config.json';
const SDK = Object.freeze({
  name: '@stellar/stellar-sdk', version: '17.4.0',
  dirParts: Object.freeze(['..', 'pk', 'x-stellar-stellar-sdk-17.4.0', 'package']),
  files: Object.freeze(['package.json', 'dist/stellar-sdk.js']),
});
const HEADER = 'TOBIN-TST-SIGNER-BASELINE v1';

class IntegrityError extends Error {
  constructor(message, code = 'INTEGRITY') { super(message); this.name = 'IntegrityError'; this.code = code; }
}
const refuse = (m, code) => { throw new IntegrityError(m, code); };
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);

/** The approved hash must be exactly 64 lowercase hexadecimal characters. Nothing is trimmed, case-folded or prefixed. */
function parseApprovedHash(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) refuse('the approved baseline hash must be exactly 64 lowercase hexadecimal characters', 'BAD_INPUT');
  return value;
}

/** Best-effort refusal of ways to inject code before this file runs (preload flags). A preload already ran before us, so this is a tripwire, not a boundary. */
function checkProcessEnvironment(env = process.env, execArgv = process.execArgv) {
  const bad = /^(-r|--require|--import|--loader|--experimental-loader|--inspect|--inspect-brk|--inspect-wait|--eval|-e|--print|-p)(=|$)/;
  for (const a of execArgv) if (bad.test(a)) refuse(`the Node process was started with a code-injection option (${a.split('=')[0]})`);
  const opts = env.NODE_OPTIONS;
  if (typeof opts === 'string' && /(^|\s)(-r|--require|--import|--loader|--experimental-loader|--inspect|--inspect-brk|--inspect-wait)(=|\s|$)/.test(opts)) refuse('NODE_OPTIONS contains a code-injection option');
}

function lstatOrRefuse(p, what) {
  let st; try { st = fs.lstatSync(p); } catch { refuse(`${what} is missing or unreadable`); }
  if (st.isSymbolicLink()) refuse(`${what} is a symbolic link or junction`);
  return st;
}

function readTextFile(p, what) {
  const st = lstatOrRefuse(p, what);
  if (!st.isFile()) refuse(`${what} is not a regular file`);
  let b; try { b = fs.readFileSync(p); } catch { refuse(`${what} cannot be read`); }
  if (b.includes(13)) refuse(`${what} contains a CR byte (line ends must be LF)`);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) refuse(`${what} starts with a UTF-8 byte order mark`);
  try { new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { refuse(`${what} is not valid UTF-8`); }
  return b;
}

function readRawFile(p, what) {
  const st = lstatOrRefuse(p, what);
  if (!st.isFile()) refuse(`${what} is not a regular file`);
  try { return fs.readFileSync(p); } catch { refuse(`${what} cannot be read`); }
}

function realInside(file, realDir, what) {
  let rp; try { rp = fs.realpathSync.native(file); } catch { refuse(`${what} cannot be resolved`); }
  const parent = path.dirname(rp);
  if (norm(parent) !== norm(realDir)) refuse(`${what} resolves outside its directory`);
}

/**
 * Builds the manifest for a signer directory. Throws IntegrityError on anything unexpected.
 * @param {{signerDir: string, sdkDir?: string}} o  sdkDir defaults to <signerDir>/../pk/x-stellar-stellar-sdk-17.4.0/package (where sdk-loader.cjs reads it)
 */
function computeManifest({ signerDir, sdkDir } = {}) {
  if (typeof signerDir !== 'string' || !signerDir) refuse('no signer directory given');
  const dir = path.resolve(signerDir);
  const dst = lstatOrRefuse(dir, 'the signer directory');
  if (!dst.isDirectory()) refuse('the signer directory is not a directory');
  let realDir; try { realDir = fs.realpathSync.native(dir); } catch { refuse('the signer directory cannot be resolved'); }

  // 1. exact directory listing: every closure file present, nothing unexpected
  let names; try { names = fs.readdirSync(dir); } catch { refuse('the signer directory cannot be listed'); }
  const allowed = new Set([...CLOSURE, ...TOLERATED, CONFIG_NAME]);
  for (const n of names) if (!allowed.has(n)) refuse(`unexpected entry in the signer directory: ${JSON.stringify(n)}`);
  for (const f of CLOSURE) if (!names.includes(f)) refuse(`runtime file missing: ${f}`);
  for (const t of TOLERATED) if (names.includes(t)) lstatOrRefuse(path.join(dir, t), `signer directory entry ${t}`);

  const entries = new Map();
  // 2. runtime closure (text rules)
  for (const f of CLOSURE) {
    const p = path.join(dir, f);
    const b = readTextFile(p, `runtime file ${f}`);
    realInside(p, realDir, `runtime file ${f}`);
    entries.set(`file:${f}`, sha256(b));
  }
  // 3. deployment configuration: hashed when it exists, ABSENT when it does not
  if (names.includes(CONFIG_NAME)) {
    const p = path.join(dir, CONFIG_NAME);
    const b = readTextFile(p, CONFIG_NAME);
    realInside(p, realDir, CONFIG_NAME);
    entries.set(`config:${CONFIG_NAME}`, sha256(b));
  } else entries.set(`config:${CONFIG_NAME}`, 'ABSENT');

  // 4. SDK identity and the file the loader executes
  const sdk = path.resolve(sdkDir || path.join(dir, ...SDK.dirParts));
  const pkgDir = sdk; const xDir = path.dirname(pkgDir); const pkDir = path.dirname(xDir);
  for (const [p, w] of [[pkDir, 'the SDK parent directory'], [xDir, 'the SDK directory'], [pkgDir, 'the SDK package directory']]) { if (!lstatOrRefuse(p, w).isDirectory()) refuse(`${w} is not a directory`); }
  let realPkg; try { realPkg = fs.realpathSync.native(pkgDir); } catch { refuse('the SDK package directory cannot be resolved'); }
  const distDir = path.join(pkgDir, 'dist');
  if (!lstatOrRefuse(distDir, 'the SDK dist directory').isDirectory()) refuse('the SDK dist directory is not a directory');
  const pjPath = path.join(pkgDir, 'package.json'); const bundlePath = path.join(pkgDir, 'dist', 'stellar-sdk.js');
  const pj = readRawFile(pjPath, 'SDK package.json'); const bundle = readRawFile(bundlePath, 'SDK bundle dist/stellar-sdk.js');
  realInside(pjPath, realPkg, 'SDK package.json'); realInside(bundlePath, path.join(realPkg, 'dist'), 'SDK bundle');
  let meta; try { meta = JSON.parse(pj.toString('utf8')); } catch { refuse('SDK package.json is not valid JSON'); }
  if (!meta || meta.name !== SDK.name || meta.version !== SDK.version) refuse(`SDK identity is not ${SDK.name}@${SDK.version}`);
  entries.set(`external:${SDK.name}@${SDK.version}/package.json`, sha256(pj));
  entries.set(`external:${SDK.name}@${SDK.version}/dist/stellar-sdk.js`, sha256(bundle));

  const labels = [...entries.keys()].sort();   // default sort = UTF-16 code unit order = ordinal
  const manifest = HEADER + '\n' + labels.map((l) => `${entries.get(l)}  ${l}\n`).join('');
  return { manifest, hash: sha256(Buffer.from(manifest, 'utf8')), entries: Object.fromEntries(labels.map((l) => [l, entries.get(l)])) };
}

/** Constant-time comparison of two 64-hex strings that have already been validated. */
function hashesEqual(a, b) {
  const x = Buffer.from(a, 'hex'); const y = Buffer.from(b, 'hex');
  return x.length === 32 && y.length === 32 && crypto.timingSafeEqual(x, y);
}

// Proofs of a successful verification. Only verifyApproved() can add to this set (it is private to this module), so the application can require
// proof that it was started through the gate, and a direct call of the application's entry function without one is refused.
const VERIFIED = new WeakSet();

/** Verifies the signer directory against the operator-supplied approved hash. Returns a frozen proof object on a match; throws IntegrityError otherwise. */
function verifyApproved({ signerDir, sdkDir, approved }) {
  const want = parseApprovedHash(approved);
  const got = computeManifest({ signerDir, sdkDir });
  if (!hashesEqual(got.hash, want)) refuse(`the signer baseline does not equal the approved baseline (computed ${got.hash})`, 'MISMATCH');
  const proof = Object.freeze({ ...got });
  VERIFIED.add(proof);
  return proof;
}

/** True only for an object returned by a successful verifyApproved() in this process. */
function isVerified(proof) { return typeof proof === 'object' && proof !== null && VERIFIED.has(proof); }

module.exports = { CLOSURE, TOLERATED, CONFIG_NAME, SDK, HEADER, IntegrityError, parseApprovedHash, checkProcessEnvironment, computeManifest, verifyApproved, isVerified, hashesEqual };
