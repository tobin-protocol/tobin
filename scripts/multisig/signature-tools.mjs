// Helpers to check, WITHOUT any secret, that a signed Stellar transaction envelope carries a valid ed25519 signature from a given public key.
// The founder signs locally (hardware wallet, Stellar Lab or their own CLI identity); this code only ever sees the public key and the signed envelope.
import { createPublicKey, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { crc16, isPublicKey } from '../accounts/check-accounts.mjs';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
export const PASSPHRASE = 'Test SDF Network ; September 2015';

/** The 32 raw bytes of a "G..." public key. */
export function rawPublicKey(g) {
  if (!isPublicKey(g)) throw new Error('not a valid public key');
  let bits = 0, acc = 0;
  const out = [];
  for (const ch of g) {
    acc = (acc << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
  }
  return Buffer.from(out.slice(1, 33));
}

/** Encode 32 raw bytes as a "G..." public key (used by tests with an ephemeral key pair). */
export function encodePublicKey(raw) {
  const payload = Buffer.concat([Buffer.from([6 << 3]), raw]);
  const c = crc16(payload);
  const bytes = Buffer.concat([payload, Buffer.from([c & 0xff, c >> 8])]);
  let bits = 0, acc = 0, s = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) { bits -= 5; s += B32[(acc >> bits) & 31]; }
  }
  return s;
}

/** True when `signature` (hex or base64, 64 bytes) is a valid ed25519 signature of `hashHex` (32 bytes) by `publicKey`. */
export function verifySignature(hashHex, signature, publicKey) {
  const sig = /^[0-9a-f]{128}$/i.test(signature) ? Buffer.from(signature, 'hex') : Buffer.from(signature, 'base64');
  if (sig.length !== 64) return false;
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey(publicKey)]), format: 'der', type: 'spki' });
  return verify(null, Buffer.from(hashHex, 'hex'), key, sig);
}

const stellar = (args, input) => execFileSync('stellar', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

/** Decode an envelope (base64 XDR) to JSON with the Stellar CLI. Offline. */
export const decodeEnvelope = (xdr) => JSON.parse(stellar(['xdr', 'decode', '--type', 'TransactionEnvelope', '--input', 'single-base64', '--output', 'json'], xdr));

/** The transaction hash (hex) for the Testnet passphrase. Offline. */
export const envelopeHash = (xdr) => stellar(['tx', 'hash', '--network-passphrase', PASSPHRASE], xdr);

/** Which of `publicKeys` have a valid signature on the envelope (by actually verifying, not by trusting the hint). */
export function signersOf(xdr, publicKeys) {
  const env = decodeEnvelope(xdr);
  const sigs = (env.tx || env.tx_v0 || {}).signatures || [];
  const hash = envelopeHash(xdr);
  return publicKeys.filter((k) => sigs.some((s) => verifySignature(hash, s.signature, k)));
}

/** The properties of the inert signing-check envelope (see signing-check.mjs build). */
export const SIGN_CHECK = { sequence: '1', fee: 100, memo: 'tobin-sign-check-do-not-send', operation: 'bump_sequence', bumpTo: '0' };

/**
 * Checks a DECODED envelope (the Stellar CLI's JSON), its hash and the expected signer. Pure: no network, no secrets, no CLI.
 * Returns a list of { check, ok, detail }. Every signature is verified cryptographically against the expected key and the hash, the signature
 * hint (last 4 bytes of the key) must match, and the signature must sit inside the envelope, not be supplied on its own.
 */
export function checkSignedEnvelope(env, hash, { publicKey, expectedHash, source = publicKey, props = SIGN_CHECK }) {
  const rows = [];
  const add = (check, ok, detail) => rows.push({ check, ok: Boolean(ok), detail });
  const v1 = env && env.tx && env.tx.tx ? env.tx : null;
  add('decodes as a v1 transaction envelope', v1, v1 ? 'envelope type tx' : 'not a v1 transaction envelope');
  if (!v1) return rows;
  const t = v1.tx;
  add('transaction hash equals the expected hash', hash === expectedHash, `computed ${hash}, expected ${expectedHash}`);
  add('source account is the expected key', t.source_account === source, t.source_account);
  add('sequence number', String(t.seq_num) === props.sequence, `${t.seq_num}, expected ${props.sequence}`);
  add('fee', t.fee === props.fee, `${t.fee} stroops, expected ${props.fee}`);
  add('memo', t.memo && t.memo.text === props.memo, JSON.stringify(t.memo));
  const ops = t.operations || [];
  const op = ops[0] && ops[0].body && ops[0].body[props.operation];
  add('exactly one operation, of the expected kind and value', ops.length === 1 && Boolean(op) && String(op.bump_to) === props.bumpTo && ops[0].source_account === null, `${ops.length} operation(s): ${JSON.stringify(ops[0] && ops[0].body)}`);
  add('no time bounds or other preconditions', t.cond === 'none', JSON.stringify(t.cond));
  const sigs = v1.signatures || [];
  add('the signature is attached to the envelope', sigs.length >= 1, `${sigs.length} signature(s) in the envelope`);
  const hint = rawPublicKey(publicKey).subarray(-4).toString('hex');
  const mine = sigs.filter((s) => s.hint === hint);
  add('a signature hint resolves to the expected key', mine.length === 1, `expected hint ${hint}; envelope hints: ${sigs.map((s) => s.hint).join(', ') || 'none'}`);
  add('that signature is cryptographically valid for the transaction hash', mine.length === 1 && verifySignature(hash, mine[0].signature, publicKey), mine[0] ? `signature ${mine[0].signature.slice(0, 16)}...` : 'no matching signature');
  add('no signature in the envelope is invalid or from another key', sigs.length === 1 && mine.length === 1, `${sigs.length} signature(s) present`);
  return rows;
}
