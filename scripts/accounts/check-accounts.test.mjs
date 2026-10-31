// Tests for the account manifest checker. Run with: node --test scripts/accounts/check-accounts.test.mjs
// The public keys below are public Stellar Testnet addresses of disposable accounts (no secrets).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { combinations, isPublicKey, problems } from './check-accounts.mjs';

const K1 = 'GB4WIKKCYDDQUKLTKBMMMCPLZJVXZWL36CJEGWXMKEYV7NNLS2MDE7G5';
const K2 = 'GC7YMNS3FEYD4GZ4RMLOX3QOSCWOURVLCFUPY5PDOJPBJTSS22HL23KC';
const K3 = 'GDJWXD5KEMKFCR5IA43WHNU2J4C5TYAKTA747UAQD2LAMOE7OYRWI3QY';
const ACCOUNT = 'GD5ESAZOA4RTEHWDJ4RVYH3TG4DJZFX7OGHXXNHVVDA7G77CD5DQNYPQ';

const pending = () => JSON.parse(readFileSync(new URL('../../accounts/testnet-admin.json', import.meta.url), 'utf8'));
const active = () => {
  const m = pending();
  m.status = 'ACTIVE';
  m.accountId = ACCOUNT;
  m.signers[0].publicKey = K1;
  m.signers[1].publicKey = K2;
  m.signers[2].publicKey = K3;
  m.masterKeyWeight = 0;
  m.transactions = ['a'.repeat(64)];
  m.recordedAt = '2026-11-01T00:00Z';
  return m;
};

test('the committed pending manifest is valid', () => {
  assert.deepEqual(problems(pending()), []);
});

test('public keys are checked for format and checksum', () => {
  for (const k of [K1, K2, K3, ACCOUNT]) assert.equal(isPublicKey(k), true);
  assert.equal(isPublicKey(K1.slice(0, 55) + (K1.endsWith('A') ? 'B' : 'A')), false); // wrong checksum
  assert.equal(isPublicKey('S' + K1.slice(1)), false);
  assert.equal(isPublicKey('G'), false);
  assert.equal(isPublicKey(null), false);
});

test('a complete ACTIVE manifest is valid', () => {
  assert.deepEqual(problems(active()), []);
});

test('weights and thresholds are fixed at 5/2/1 and 5/6/7', () => {
  const w = pending();
  w.signers[0].weight = 4;
  assert.notDeepEqual(problems(w), []);
  const t = pending();
  t.thresholds.high = 6;
  assert.notDeepEqual(problems(t), []);
  const r = pending();
  [r.signers[1], r.signers[2]] = [r.signers[2], r.signers[1]];
  assert.notDeepEqual(problems(r), []);
});

test('the signer combinations behave as specified', () => {
  const rows = combinations(pending().signers, pending().thresholds);
  const row = (...roles) => rows.find((x) => x.roles.join() === roles.join());
  assert.deepEqual([row('founder').low, row('founder').medium, row('founder').high], [true, false, false]);
  assert.deepEqual([row('technical', 'security').low, row('technical', 'security').medium, row('technical', 'security').high], [false, false, false]);
  assert.deepEqual([row('founder', 'security').medium, row('founder', 'security').high], [true, false]);
  assert.deepEqual([row('founder', 'technical').medium, row('founder', 'technical').high], [true, true]);
  for (const r of rows.filter((x) => x.roles.length === 1 && x.roles[0] !== 'founder')) assert.equal(r.low || r.medium || r.high, false);
});

test('Mainnet and other networks are rejected', () => {
  const a = pending();
  a.network = 'mainnet';
  a.networkPassphrase = 'Public Global Stellar Network ; September 2015';
  assert.ok(problems(a).length >= 2);
});

test('ACTIVE needs every key, a disabled master key and confirmed transactions', () => {
  for (const mutate of [
    (m) => { m.signers[1].publicKey = null; },
    (m) => { m.masterKeyWeight = 1; },
    (m) => { m.transactions = []; },
    (m) => { m.accountId = null; },
    (m) => { m.signers[2].publicKey = K1; }, // duplicate
    (m) => { m.signers[0].publicKey = 'GNOTAKEY'; },
    (m) => { m.accountId = K1; }, // the account listed as its own signer
  ]) {
    const m = active();
    mutate(m);
    assert.notDeepEqual(problems(m), []);
  }
});

test('a PENDING manifest cannot claim an account or transactions', () => {
  const a = pending();
  a.accountId = ACCOUNT;
  assert.notDeepEqual(problems(a), []);
  const b = pending();
  b.transactions = ['a'.repeat(64)];
  assert.notDeepEqual(problems(b), []);
});

test('the manifest holds the three validated signer keys and the history records the adopted submission', () => {
  const m = pending();
  const keys = m.signers.map((s) => s.publicKey);
  assert.ok(keys.every((k) => isPublicKey(k)));
  assert.equal(new Set(keys).size, 3);
  assert.equal(m.status, 'PENDING_SIGNER_ADDRESSES'); // no account exists yet
  assert.equal(m.accountId, null);
  assert.deepEqual(m.transactions, []);
  const history = JSON.parse(readFileSync(new URL('../../accounts/signers-history.json', import.meta.url), 'utf8'));
  const [first, second] = history.submissions;
  assert.equal(first.signers.find((s) => s.role === 'technical').publicKey.length, 55); // the superseded, invalid key is preserved
  assert.deepEqual(second.signers.map((s) => s.publicKey), keys);
});
