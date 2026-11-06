'use strict';
// Restores the three SDK files the TST signer reads from the TRACKED npm tarball, offline, with every step verified. Fails closed.
//
//   node scripts/tst-signer/restore-sdk.cjs [--verify-only] [--tgz <file>] [--target <package dir>]
//
// What it does (nothing else): reads the tarball, checks its SHA-256 against the pinned value BEFORE decompressing, parses the whole tar
// strictly (ustar, regular files only, safe names, valid header checksums, exactly 6293 entries), checks the SHA-256 of EVERY entry against
// SDK-PACKAGE-INVENTORY.sha256, checks package name/version, then writes only package.json, LICENSE and dist/stellar-sdk.js into the target
// directory that sdk-loader.cjs reads, and re-reads them to verify. It never downloads, rebuilds, minifies or edits anything, never runs
// SDK code, and never touches a key, state or network. It is not part of the signer's runtime closure.
//
// Exit codes: 0 restored (or already correct); 1 refused (any failure); 2 usage.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const HERE = __dirname;
const EXPECTED = Object.freeze({
  tgzSha256: '455fcadd817f4a30e5f8d0f15162f43a616f72dcbff499c8aa186abe6650a21c',
  entries: 6293,
  name: '@stellar/stellar-sdk',
  version: '17.4.0',
  files: Object.freeze({
    'package.json': 'ee981053db93fce5c81310620d8198a493aa134ecd35d3e64540296687d72a62',
    'LICENSE': '82eb82e7d82d08075087715bc92cf587fe4fe53d881da42061aa214720c19cba',
    'dist/stellar-sdk.js': 'de18071d1f64bf6aa1806a4eb250b3be7c1811a8e8ecdfc3c103013cf1d9b92f',
  }),
});
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
class Refused extends Error {}
const refuse = (m) => { throw new Refused(m); };

function parseArgs(argv) {
  const a = { verifyOnly: false, tgz: path.join(HERE, 'pk', 'stellar-stellar-sdk-17.4.0.tgz'), target: path.join(HERE, 'pk', 'x-stellar-stellar-sdk-17.4.0', 'package') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--verify-only') a.verifyOnly = true;
    else if ((argv[i] === '--tgz' || argv[i] === '--target') && argv[i + 1] !== undefined) a[argv[i].slice(2)] = path.resolve(argv[++i]);
    else { const e = new Error('usage: restore-sdk.cjs [--verify-only] [--tgz <file>] [--target <package dir>]'); e.usage = true; throw e; }
  }
  return a;
}

function parseTar(buf) {
  const entries = new Map();
  let off = 0;
  while (true) {
    if (off + 512 > buf.length) refuse('malformed archive: truncated before the end marker');
    const h = buf.subarray(off, off + 512);
    if (h.every((x) => x === 0)) {
      if (!buf.subarray(off, Math.min(buf.length, off + 1024)).every((x) => x === 0)) refuse('malformed archive: data after the end marker');
      if (!buf.subarray(off).every((x) => x === 0)) refuse('malformed archive: non-zero bytes after the end marker');
      break;
    }
    const field = (s, e) => h.subarray(s, e).toString('latin1').replace(/\0.*$/s, '');
    const name = field(0, 100);
    const sizeText = field(124, 136).trim();
    if (!/^[0-7]+$/.test(sizeText)) refuse(`malformed archive: bad size field for an entry (${name})`);
    const size = parseInt(sizeText, 8);
    let sum = 0; for (let i = 0; i < 512; i++) sum += (i >= 148 && i < 156) ? 32 : h[i];
    const stored = parseInt(field(148, 156).trim() || 'x', 8);
    if (!Number.isFinite(stored) || stored !== sum) refuse(`malformed archive: header checksum mismatch (${name})`);
    const type = String.fromCharCode(h[156] || 48);
    if (type !== '0') refuse(`unsupported archive entry type "${type}" (${name}): only regular files are accepted`);
    if (h.subarray(257, 263).toString('latin1') !== 'ustar\0') refuse(`unsupported archive format (${name})`);
    if (h.subarray(345, 500).some((x) => x !== 0)) refuse(`unsupported long-name prefix (${name})`);
    if (!name.startsWith('package/') || name.includes('..') || name.includes('\\') || name.includes(':') || name.startsWith('/') || name.endsWith('/') || name.includes('//')) refuse(`unsafe entry name: ${JSON.stringify(name)}`);
    if (entries.has(name)) refuse(`duplicate entry: ${name}`);
    const start = off + 512;
    if (start + size > buf.length) refuse(`malformed archive: entry runs past the end (${name})`);
    entries.set(name, buf.subarray(start, start + size));
    off = start + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function readInventory() {
  const text = fs.readFileSync(path.join(HERE, 'SDK-PACKAGE-INVENTORY.sha256'), 'utf8');
  const m = new Map();
  for (const l of text.split('\n')) { const x = /^([0-9a-f]{64})  (package\/.+)$/.exec(l); if (x) m.set(x[2], x[1]); }
  return m;
}

function checkTargetDir(target) {
  // no symlink or junction anywhere on the three levels below pk/ (fail closed if the path cannot be examined)
  let p = target; const chain = [];
  for (let i = 0; i < 3; i++) { chain.push(p); p = path.dirname(p); }
  for (const d of chain) { if (fs.existsSync(d) && fs.lstatSync(d).isSymbolicLink()) refuse(`target path contains a symbolic link or junction: ${d}`); }
}

function verifyTarget(target) {
  const problems = [];
  for (const [rel, want] of Object.entries(EXPECTED.files)) {
    const p = path.join(target, ...rel.split('/'));
    let b; try { if (fs.lstatSync(p).isSymbolicLink()) { problems.push(`${rel}: is a link`); continue; } b = fs.readFileSync(p); } catch { problems.push(`${rel}: missing or unreadable`); continue; }
    if (sha256(b) !== want) problems.push(`${rel}: SHA-256 differs from the recorded value`);
  }
  if (!problems.length) {
    let pj; try { pj = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8')); } catch { problems.push('package.json: not valid JSON'); }
    if (pj && (pj.name !== EXPECTED.name || pj.version !== EXPECTED.version)) problems.push(`package.json: identity is ${pj.name}@${pj.version}`);
  }
  return problems;
}

function restore(args) {
  let raw; try { raw = fs.readFileSync(args.tgz); } catch { refuse(`cannot read the SDK tarball: ${args.tgz}`); }
  if (sha256(raw) !== EXPECTED.tgzSha256) refuse('the SDK tarball SHA-256 does not equal the recorded value (no extraction attempted)');
  let tar; try { tar = zlib.gunzipSync(raw); } catch { refuse('the SDK tarball is not a valid gzip stream'); }
  const entries = parseTar(tar);
  if (entries.size !== EXPECTED.entries) refuse(`the archive has ${entries.size} entries, expected ${EXPECTED.entries}`);
  const inv = readInventory();
  if (inv.size !== EXPECTED.entries) refuse(`SDK-PACKAGE-INVENTORY.sha256 lists ${inv.size} files, expected ${EXPECTED.entries}`);
  for (const [name, data] of entries) { const want = inv.get(name); if (!want) refuse(`archive entry not in the inventory: ${name}`); if (sha256(data) !== want) refuse(`archive entry differs from the inventory: ${name}`); }
  const out = {};
  for (const [rel, want] of Object.entries(EXPECTED.files)) {
    const data = entries.get('package/' + rel); if (!data) refuse(`the archive does not contain ${rel}`);
    if (sha256(data) !== want) refuse(`${rel} in the archive differs from the recorded hash`);
    out[rel] = data;
  }
  let pj; try { pj = JSON.parse(out['package.json'].toString('utf8')); } catch { refuse('package.json in the archive is not valid JSON'); }
  if (pj.name !== EXPECTED.name || pj.version !== EXPECTED.version) refuse(`package identity is ${pj.name}@${pj.version}, expected ${EXPECTED.name}@${EXPECTED.version}`);
  checkTargetDir(args.target);
  const existing = verifyTarget(args.target);
  if (!existing.length) return 'already restored and verified';
  const present = Object.keys(EXPECTED.files).filter((rel) => fs.existsSync(path.join(args.target, ...rel.split('/'))));
  const wrong = existing.filter((p) => !/missing or unreadable/.test(p));
  if (wrong.length) refuse(`existing files in the target do not match (refusing to overwrite): ${wrong.join('; ')}`);
  void present;
  for (const [rel, data] of Object.entries(out)) {
    const dest = path.join(args.target, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    checkTargetDir(args.target);
    const tmp = dest + '.restore-' + process.pid + '.tmp';
    try { fs.writeFileSync(tmp, data, { flag: 'wx' }); fs.renameSync(tmp, dest); } finally { try { fs.unlinkSync(tmp); } catch { /* already renamed */ } }
  }
  const after = verifyTarget(args.target);
  if (after.length) refuse(`verification after writing failed: ${after.join('; ')}`);
  return 'restored and verified';
}

function main(argv) {
  let args;
  try { args = parseArgs(argv); } catch (e) { if (e.usage) { console.error(e.message); return 2; } throw e; }
  try {
    if (args.verifyOnly) {
      checkTargetDir(args.target);
      const p = verifyTarget(args.target);
      if (p.length) { console.error('SDK VERIFY: REFUSED\n  ' + p.join('\n  ')); return 1; }
      console.log('SDK VERIFY: OK (package.json, LICENSE, dist/stellar-sdk.js equal the recorded hashes; @stellar/stellar-sdk 17.4.0)');
      return 0;
    }
    const r = restore(args);
    console.log(`SDK RESTORE: OK (${r}; @stellar/stellar-sdk 17.4.0)`);
    return 0;
  } catch (e) {
    if (e instanceof Refused) { console.error('SDK RESTORE: REFUSED: ' + e.message); return 1; }
    console.error('SDK RESTORE: REFUSED: unexpected error: ' + (e && e.message ? e.message : String(e)));
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main, parseTar, EXPECTED, verifyTarget };
