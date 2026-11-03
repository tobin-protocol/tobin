// Offline tests for the secret-free signature checks, using an ephemeral key pair generated inside the test (never a real key).
// Run with: node --test scripts/multisig/signature-tools.test.mjs
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { isPublicKey } from '../accounts/check-accounts.mjs';
import { encodePublicKey, rawPublicKey, verifySignature } from './signature-tools.mjs';

function pair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return { g: encodePublicKey(raw), privateKey, raw };
}
const HASH = 'ab'.repeat(32);

test('a key encoded from raw bytes is a valid public key and decodes back', () => {
  const k = pair();
  assert.equal(isPublicKey(k.g), true);
  assert.deepEqual(rawPublicKey(k.g), k.raw);
});

test('a genuine signature verifies, in hex and base64, and only for its own key and hash', () => {
  const a = pair();
  const b = pair();
  const sig = sign(null, Buffer.from(HASH, 'hex'), a.privateKey);
  assert.equal(verifySignature(HASH, sig.toString('hex'), a.g), true);
  assert.equal(verifySignature(HASH, sig.toString('base64'), a.g), true);
  assert.equal(verifySignature(HASH, sig.toString('hex'), b.g), false); // wrong key
  assert.equal(verifySignature('cd'.repeat(32), sig.toString('hex'), a.g), false); // wrong transaction hash
  assert.equal(verifySignature(HASH, '00'.repeat(64), a.g), false); // garbage signature
  assert.equal(verifySignature(HASH, 'abcd', a.g), false); // wrong length
});

test('an invalid public key is refused', () => {
  assert.throws(() => rawPublicKey('GNOTAKEY'));
});

import { checkSignedEnvelope } from './signature-tools.mjs';

// A decoded envelope of the shape the Stellar CLI prints, signed with an ephemeral key.
function envelope(k, { hash = HASH, over = {}, sigFrom = k, hintFrom = k, sigs } = {}) {
  const s = sign(null, Buffer.from(hash, 'hex'), sigFrom.privateKey).toString('hex');
  const hint = rawPublicKey(hintFrom.g).subarray(-4).toString('hex');
  return {
    tx: {
      tx: { source_account: k.g, fee: 100, seq_num: '1', cond: 'none', memo: { text: 'tobin-sign-check-do-not-send' }, operations: [{ source_account: null, body: { bump_sequence: { bump_to: '0' } } }], ext: 'v0', ...over },
      signatures: sigs ?? [{ hint, signature: s }],
    },
  };
}
const failed = (rows) => rows.filter((r) => !r.ok).map((r) => r.check);

test('a correctly signed envelope passes every check', () => {
  const k = pair();
  const rows = checkSignedEnvelope(envelope(k), HASH, { publicKey: k.g, expectedHash: HASH });
  assert.deepEqual(failed(rows), []);
});

test('each property is enforced: hash, source, sequence, fee, memo, operation, signature presence, hint, validity, extra signatures', () => {
  const k = pair();
  const other = pair();
  const expect = { publicKey: k.g, expectedHash: HASH };
  const bad = (env, hash = HASH) => failed(checkSignedEnvelope(env, hash, expect));
  assert.ok(bad(envelope(k), 'cd'.repeat(32)).includes('transaction hash equals the expected hash'));
  assert.ok(bad(envelope(k, { over: { source_account: other.g } })).includes('source account is the expected key'));
  assert.ok(bad(envelope(k, { over: { seq_num: '2' } })).includes('sequence number'));
  assert.ok(bad(envelope(k, { over: { fee: 200 } })).includes('fee'));
  assert.ok(bad(envelope(k, { over: { memo: { text: 'other' } } })).includes('memo'));
  assert.ok(bad(envelope(k, { over: { operations: [{ source_account: null, body: { bump_sequence: { bump_to: '5' } } }] } })).includes('exactly one operation, of the expected kind and value'));
  assert.ok(bad(envelope(k, { over: { operations: [{ source_account: null, body: { bump_sequence: { bump_to: '0' } } }, { source_account: null, body: { bump_sequence: { bump_to: '0' } } }] } })).includes('exactly one operation, of the expected kind and value'));
  assert.ok(bad(envelope(k, { sigs: [] })).includes('the signature is attached to the envelope'));
  assert.ok(bad(envelope(k, { hintFrom: other })).includes('a signature hint resolves to the expected key')); // wrong hint
  assert.ok(bad(envelope(k, { sigFrom: other })).includes('that signature is cryptographically valid for the transaction hash')); // right hint, another key's signature
  const tampered = envelope(k);
  tampered.tx.signatures[0].signature = '00' + tampered.tx.signatures[0].signature.slice(2);
  assert.ok(bad(tampered).includes('that signature is cryptographically valid for the transaction hash'));
  const extra = envelope(k);
  extra.tx.signatures.push({ hint: rawPublicKey(other.g).subarray(-4).toString('hex'), signature: 'ab'.repeat(64) });
  assert.ok(bad(extra).includes('no signature in the envelope is invalid or from another key'));
  assert.ok(bad({ tx_v0: {} }).includes('decodes as a v1 transaction envelope'));
});
