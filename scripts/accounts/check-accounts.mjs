// Validates a Tobin account manifest (accounts/*.json) and prints which signer combinations meet each threshold.
//   node scripts/accounts/check-accounts.mjs [accounts/testnet-admin.json]
// Public data only: it reads one JSON file and never reads, asks for or prints a secret. Exit 1 when the manifest is invalid.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const ROLES = [['founder', 5], ['technical', 2], ['security', 1]];
const THRESHOLDS = { low: 5, medium: 6, high: 7 };
const STATUSES = ['PENDING_SIGNER_ADDRESSES', 'ACTIVE'];

function crc16(bytes) {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** True for a valid Stellar account public key: 56 characters, version byte for "G", checksum correct. */
export function isPublicKey(s) {
  if (typeof s !== 'string' || !/^G[A-Z2-7]{55}$/.test(s)) return false;
  let bits = 0, acc = 0;
  const out = [];
  for (const ch of s) {
    acc = (acc << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
  }
  if (out.length !== 35 || out[0] !== 6 << 3) return false;
  const payload = out.slice(0, 33);
  return crc16(payload) === (out[33] | (out[34] << 8));
}

/** Every signer subset (by role) with its total weight and the thresholds it meets. */
export function combinations(signers, thresholds) {
  const rows = [];
  for (let mask = 1; mask < 1 << signers.length; mask++) {
    const chosen = signers.filter((_, i) => mask & (1 << i));
    const weight = chosen.reduce((n, s) => n + s.weight, 0);
    rows.push({
      roles: chosen.map((s) => s.role),
      weight,
      low: weight >= thresholds.low,
      medium: weight >= thresholds.medium,
      high: weight >= thresholds.high,
    });
  }
  return rows;
}

/** Problems with a manifest (empty when valid). */
export function problems(m) {
  const out = [];
  if (!m || typeof m !== 'object') return ['not an object'];
  if (m.network !== 'testnet') out.push('network must be "testnet" (Mainnet manifests are not accepted by this checker)');
  if (m.networkPassphrase !== TESTNET_PASSPHRASE) out.push('networkPassphrase must be the Testnet passphrase');
  if (m.role !== 'administration') out.push('role must be "administration"');
  if (!STATUSES.includes(m.status)) out.push(`status must be one of ${STATUSES.join(', ')}`);
  const t = m.thresholds || {};
  for (const k of Object.keys(THRESHOLDS)) if (t[k] !== THRESHOLDS[k]) out.push(`threshold ${k} must be ${THRESHOLDS[k]}`);
  const signers = Array.isArray(m.signers) ? m.signers : [];
  if (signers.length !== ROLES.length) out.push(`exactly ${ROLES.length} signers are required`);
  ROLES.forEach(([role, weight], i) => {
    const s = signers[i];
    if (!s || s.role !== role) out.push(`signer ${i + 1} must be the ${role}`);
    else if (s.weight !== weight) out.push(`${role} weight must be ${weight}`);
  });
  const keys = signers.map((s) => s && s.publicKey).filter((k) => k !== null && k !== undefined);
  for (const k of keys) if (!isPublicKey(k)) out.push(`invalid Stellar public key: ${String(k).slice(0, 8)}...`);
  if (new Set(keys).size !== keys.length) out.push('signer public keys must be distinct');
  if (m.accountId !== null && !isPublicKey(m.accountId)) out.push('accountId must be null or a valid public key');
  if (m.accountId && keys.includes(m.accountId)) out.push('the account must not be one of its own signers: the master key is disabled');
  if (m.status === 'ACTIVE') {
    if (keys.length !== ROLES.length) out.push('ACTIVE needs all three signer public keys');
    if (!m.accountId) out.push('ACTIVE needs accountId');
    if (m.masterKeyWeight !== 0) out.push('ACTIVE needs masterKeyWeight 0 (the master key is disabled)');
    if (!Array.isArray(m.transactions) || m.transactions.length === 0) out.push('ACTIVE needs the confirmed transaction hashes');
    for (const h of m.transactions || []) if (!/^[0-9a-f]{64}$/.test(typeof h === 'string' ? h : h && h.hash)) out.push('transaction hashes must be 64 hex characters');
    if (!/^\d{4}-\d{2}-\d{2}/.test(m.recordedAt || '')) out.push('ACTIVE needs recordedAt');
  }
  if (m.status === 'PENDING_SIGNER_ADDRESSES' && (m.accountId || (m.transactions || []).length)) out.push('a PENDING manifest must not record an account or transactions');
  if (m.legacyDeployer && !isPublicKey(m.legacyDeployer.accountId)) out.push('legacyDeployer.accountId must be a valid public key');
  if (m.bootstrapAccount) {
    const b = m.bootstrapAccount.publicKey;
    if (!isPublicKey(b)) out.push('bootstrapAccount.publicKey must be a valid public key');
    if (keys.includes(b)) out.push('the bootstrap account must not be one of the three signers');
    if (m.legacyDeployer && b === m.legacyDeployer.accountId) out.push('the bootstrap account must not be the legacy deployer');
    if (m.accountId && m.accountId !== b) out.push('accountId must equal the bootstrap account once recorded');
  }
  // Safety properties of the weights themselves.
  const rows = combinations(ROLES.map(([role, weight]) => ({ role, weight })), THRESHOLDS);
  const tOnlyS = rows.find((r) => r.roles.join() === 'technical,security');
  if (tOnlyS && (tOnlyS.low || tOnlyS.medium || tOnlyS.high)) out.push('technical + security must not meet any threshold');
  return out;
}

function main() {
  const file = process.argv[2] || 'accounts/testnet-admin.json';
  const m = JSON.parse(readFileSync(file, 'utf8'));
  const p = problems(m);
  console.log(`${file}: status ${m.status}`);
  console.log('| signers | weight | low | medium | high |');
  for (const r of combinations(ROLES.map(([role, weight]) => ({ role, weight })), THRESHOLDS)) {
    console.log(`| ${r.roles.join(' + ')} | ${r.weight} | ${r.low ? 'yes' : 'no'} | ${r.medium ? 'yes' : 'no'} | ${r.high ? 'yes' : 'no'} |`);
  }
  if (p.length) { console.error(p.map((x) => `- ${x}`).join('\n')); process.exit(1); }
  console.log(m.status === 'ACTIVE' ? 'manifest valid' : 'manifest valid (pending: the signer public keys are still to be supplied)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
