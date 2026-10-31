// npm run validate:signers [-- --candidates accounts/testnet-admin.signers-submitted.json]
// Validates the proposed signer public keys (format and checksum, duplicates, the legacy deployer) and looks each up on Testnet (read-only).
// A key that is valid but has no account yet is reported as "not activated", not as invalid. Exit 1 if any key is invalid.
import { arg, isPublicKey, LEGACY_DEPLOYER, lookup, MANIFEST, readJson } from './lib.mjs';

const file = arg('--candidates') || MANIFEST;
const m = readJson(file);
const rows = [];
for (const s of m.signers) {
  const key = s.publicKey;
  const valid = isPublicKey(key);
  const notes = [];
  if (key && !valid) {
    notes.push(`INVALID: ${String(key).length} characters (a public key has 56), or the checksum fails`);
  }
  let exists = 'n/a';
  if (valid) {
    const r = await lookup(key);
    if (r.state === 'exists') {
      exists = 'yes';
      const a = r.account;
      notes.push(`sequence ${a.sequence}, thresholds ${a.thresholds.low_threshold}/${a.thresholds.med_threshold}/${a.thresholds.high_threshold}, ${a.signers.length} signer(s)`);
    } else if (r.state === 'not-found') {
      exists = 'no';
      notes.push('not activated on Testnet (a valid key with no account yet; not an error)');
    } else {
      exists = '?';
      notes.push(`lookup failed: ${r.detail}`);
    }
  }
  rows.push({ role: s.role, key, valid, exists, notes });
}
const keys = rows.map((r) => r.key).filter(Boolean);
const issues = [];
if (rows.some((r) => !r.valid)) issues.push('at least one signer key is missing or invalid');
if (new Set(keys).size !== keys.length) issues.push('duplicate signer keys');
if (keys.includes(LEGACY_DEPLOYER)) issues.push('a signer is the legacy deployer');
// Keys that share a long suffix are almost certainly not independent random keys; flag it for a human to check.
for (let i = 0; i < keys.length; i++) {
  for (let j = i + 1; j < keys.length; j++) {
    let n = 0;
    while (n < 40 && keys[i].at(-1 - n) === keys[j].at(-1 - n)) n++;
    if (n >= 8) issues.push(`${rows[i].role} and ${rows[j].role} keys share a ${n}-character ending: genuine keys never do; re-copy them from the wallets`);
  }
}
console.log('| Role | Public key | Format valid | Testnet account exists | Notes |');
console.log('|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.role} | ${r.key ?? '(none)'} | ${r.valid ? 'yes' : 'NO'} | ${r.exists} | ${r.notes.join('; ')} |`);
if (issues.length) {
  console.error(issues.map((x) => `- ${x}`).join('\n'));
  process.exitCode = 1;
} else console.log('all signer keys valid');
