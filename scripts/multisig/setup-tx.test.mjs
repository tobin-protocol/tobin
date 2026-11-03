// Offline tests for the setup-transaction checker, using an ephemeral key pair (never a real key). Run: node --test scripts/multisig/setup-tx.test.mjs
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { checkSetupEnvelope, expectedOperations } from './setup-tx.mjs';
import { readJson, MANIFEST } from './lib.mjs';
import { encodePublicKey, rawPublicKey } from './signature-tools.mjs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const ACCOUNT = encodePublicKey(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
const HASH = 'ab'.repeat(32);
const expected = expectedOperations(readJson(MANIFEST));
const nulls = { inflation_dest: null, clear_flags: null, set_flags: null, master_weight: null, low_threshold: null, med_threshold: null, high_threshold: null, home_domain: null, signer: null };
const setOp = (fields) => ({ source_account: null, body: { set_options: { ...nulls, ...fields } } });

function envelope({ ops, fee = 400, seq = '10', memo = 'none', sigs, hash = HASH } = {}) {
  const s = sign(null, Buffer.from(hash, 'hex'), privateKey).toString('hex');
  return {
    tx: {
      tx: {
        source_account: ACCOUNT, fee, seq_num: seq, cond: 'none', memo, ext: 'v0',
        operations: ops ?? [
          ...expected.signers.map((x) => setOp({ signer: { key: x.key, weight: x.weight } })),
          setOp({ low_threshold: 5, med_threshold: 6, high_threshold: 7 }),
        ],
      },
      signatures: sigs ?? [{ hint: rawPublicKey(ACCOUNT).subarray(-4).toString('hex'), signature: s }],
    },
  };
}
const opts = { account: ACCOUNT, expected, expectedHash: HASH, expectedSequence: 10n };
const failed = (env, o = opts) => checkSetupEnvelope(env, HASH, o).filter((r) => !r.ok).map((r) => r.check);

test('the approved, correctly signed setup envelope passes every check', () => {
  assert.deepEqual(failed(envelope()), []);
});

test('the approved configuration is the manifest: three signers at 5, 2, 1 and thresholds 5, 6, 7', () => {
  assert.deepEqual(expected.signers.map((s) => [s.role, s.weight]), [['founder', 5], ['technical', 2], ['security', 1]]);
  assert.deepEqual(expected.thresholds, { low: 5, medium: 6, high: 7 });
});

test('any deviation from the approved configuration is rejected', () => {
  const ops = (mut) => { const e = envelope(); mut(e.tx.tx.operations); return e; };
  assert.ok(failed(ops((o) => { o[0].body.set_options.signer.weight = 6; })).some((c) => /operation 1/.test(c))); // wrong weight
  assert.ok(failed(ops((o) => { o[1].body.set_options.signer.key = ACCOUNT; })).some((c) => /operation 2/.test(c))); // wrong signer
  assert.ok(failed(ops((o) => { o[2].body.set_options.master_weight = 0; })).some((c) => /operation 3/.test(c))); // smuggled master-key change
  assert.ok(failed(ops((o) => { o[3].body.set_options.high_threshold = 6; })).some((c) => /operation 4/.test(c))); // wrong threshold
  assert.ok(failed(ops((o) => { o[3].body.set_options.master_weight = 0; })).some((c) => /operation 4/.test(c))); // disables the master key
  assert.ok(failed(ops((o) => { o[3].body.set_options.home_domain = 'evil.example'; })).some((c) => /operation 4/.test(c))); // unrelated change
  assert.ok(failed(ops((o) => { o.push(setOp({ master_weight: 0 })); })).includes('exactly four operations')); // an extra operation
  assert.ok(failed(ops((o) => { o[0].source_account = ACCOUNT; })).some((c) => /operation 1/.test(c))); // operation with its own source
});

test('envelope-level properties are enforced', () => {
  assert.ok(failed(envelope({ fee: 100 })).includes('fee is 100 stroops per operation (400 in total)'));
  assert.ok(failed(envelope({ seq: '11' })).includes('sequence number is the account sequence + 1'));
  assert.ok(failed(envelope({ memo: { text: 'x' } })).includes('no memo, no time bounds or other preconditions'));
  assert.ok(failed(envelope(), { ...opts, expectedHash: 'cd'.repeat(32) }).includes('transaction hash equals the expected hash (Testnet passphrase)'));
  assert.ok(failed(envelope(), { ...opts, account: encodePublicKey(Buffer.alloc(32, 1)) }).includes('source account is the administrative account'));
});

test('the signature must be present, genuine and the only one', () => {
  assert.ok(failed(envelope({ sigs: [] })).includes('exactly one signature, attached to the envelope'));
  const other = generateKeyPairSync('ed25519');
  const forged = sign(null, Buffer.from(HASH, 'hex'), other.privateKey).toString('hex');
  const hint = rawPublicKey(ACCOUNT).subarray(-4).toString('hex');
  assert.ok(failed(envelope({ sigs: [{ hint, signature: forged }] })).includes('it is a valid ed25519 signature of the transaction hash by the master key'));
  const good = envelope().tx.signatures[0];
  assert.ok(failed(envelope({ sigs: [good, { hint: '00000000', signature: 'ab'.repeat(64) }] })).includes('exactly one signature, attached to the envelope'));
});
