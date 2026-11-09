import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('@stellar/stellar-sdk'); const C = require('./public/core.js');
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const fx = JSON.parse(fs.readFileSync('evidence/fixture-create-tx.json', 'utf8'));
const tx = S.TransactionBuilder.fromXDR(fx.txXdr, cfg.passphrase);
const entry = tx.operations[0].auth[0];

test('expiry policy: current < exp <= current+10, fail closed', () => {
  assert.equal(C.checkExpiry(100, 101).ok, true);
  assert.equal(C.checkExpiry(100, 110).ok, true);
  for (const [c, e] of [[100, 100], [100, 99], [100, 111], [100, 0], [0, 5], [undefined, 5], [100, NaN], [100, 100.5]]) assert.equal(C.checkExpiry(c, e).ok, false, `${c},${e}`);
});

test('wallet state: every failure is distinct and none is a transaction state', () => {
  const ok = { available: true, address: cfg.accounts.A, networkPassphrase: cfg.passphrase };
  assert.equal(C.walletState(null, cfg).state, 'FREIGHTER_UNAVAILABLE');
  assert.equal(C.walletState({ available: false }, cfg).state, 'FREIGHTER_UNAVAILABLE');
  assert.equal(C.walletState({ available: true, address: null }, cfg).state, 'WALLET_DISCONNECTED');
  assert.equal(C.walletState({ ...ok, networkPassphrase: 'Public Global Stellar Network ; September 2015' }, cfg).state, 'WRONG_NETWORK');
  assert.equal(C.walletState({ ...ok, address: 'G' + 'A'.repeat(55) }, cfg).role, null);
  assert.equal(C.walletState(ok, cfg).state, 'TESTNET_VALIDATED');
  assert.equal(C.walletState({ ...ok, previousAddress: cfg.accounts.B }, cfg).state, 'ACCOUNT_CHANGED');
  for (const o of [null, { available: true }, ok]) assert.ok(!/CONFIRMED|SUBMISSION/.test(C.walletState(o, cfg).state));
});

test('only getTransaction SUCCESS is confirmed; nothing else can be', () => {
  assert.equal(C.classifyTx({ status: 'SUCCESS' }, 0, 60000).state, 'TRANSACTION_CONFIRMED');
  assert.equal(C.classifyTx({ status: 'FAILED' }, 0, 60000).state, 'SUBMISSION_FAILED');
  assert.equal(C.classifyTx({ status: 'NOT_FOUND' }, 1000, 60000).state, 'SUBMISSION_PENDING');
  assert.equal(C.classifyTx({ status: 'NOT_FOUND' }, 61000, 60000).state, 'TRANSACTION_UNCONFIRMED');
  for (const r of [undefined, null, {}, { status: 'ERROR' }, { status: 'PENDING' }, { status: 'success' }, { status: 'TIMEOUT' }]) assert.notEqual(C.classifyTx(r, 0, 60000).state, 'TRANSACTION_CONFIRMED');
  assert.equal(C.STATES.length, 15);
});

test('entries match the SDK intent (the recorded Testnet entry is AddressV2)', () => {
  assert.equal(entry.credentials.type, 'sorobanCredentialsAddressV2');
  assert.deepEqual(C.checkEntries(S, tx.operations[0].auth, fx.intent, cfg.passphrase), []);
});

test('tampered intents and entries are refused', () => {
  const bad = (f) => { const i = JSON.parse(JSON.stringify(fx.intent)); f(i); return C.checkEntries(S, tx.operations[0].auth, i, cfg.passphrase); };
  assert.ok(bad((i) => { i.entries[0].signer = cfg.accounts.B; }).length > 0, 'wrong signer');
  assert.ok(bad((i) => { i.entries[0].tree.fn = 'join_session'; }).length > 0, 'wrong function');
  assert.ok(bad((i) => { i.entries[0].tree.args[1].v = '00'.repeat(32); }).length > 0, 'wrong session id');
  assert.ok(bad((i) => { i.entries[0].tree.args[3].v = 4; }).length > 0, 'wrong capacity');
  assert.ok(bad((i) => { i.entries[0].tree.contract = cfg.token; }).length > 0, 'wrong contract');
  assert.ok(bad((i) => { i.entries.push(i.entries[0]); }).length > 0, 'extra expected entry');
  assert.ok(C.checkEntries(S, [], fx.intent, cfg.passphrase).length > 0, 'missing entry');
  assert.ok(C.checkEntries(S, tx.operations[0].auth, fx.intent, 'Public Global Stellar Network ; September 2015').length > 0, 'wrong network');
});

test('SIMULATED wallet round trip with a throwaway key; wrong key or wrong bytes are refused', async () => {
  const kp = S.Keypair.random();
  const unsigned = await S.authorizeInvocation({ signer: async () => ({ signatureScVal: S.xdr.ScVal.scvVoid() }), validUntilLedgerSeq: 1, invocation: entry.rootInvocation, networkPassphrase: cfg.passphrase, publicKey: kp.publicKey() }).catch((e) => { throw e; });
  let seen = null;
  const signed = await S.authorizeEntry(unsigned, async (pre, payload) => { seen = pre; return kp.sign(payload); }, 5000, cfg.passphrase);
  assert.ok(seen);
  assert.equal(C.addrCreds(signed.credentials).signatureExpirationLedger, 5000);
  assert.equal(C.isUnsigned(signed), false);
  const other = S.Keypair.random();
  await assert.rejects(S.authorizeEntry(unsigned, async (pre, payload) => other.sign(payload), 5000, cfg.passphrase));
  await assert.rejects(S.authorizeEntry(unsigned, async () => kp.sign(Buffer.alloc(32, 7)), 5000, cfg.passphrase));
  const re = C.rebuild(S, tx, [signed], cfg.passphrase);
  assert.equal(re.sequence, tx.sequence);
  assert.equal(re.operations[0].auth.length, 1);
  assert.equal(C.isUnsigned(S.TransactionBuilder.fromXDR(re.toXDR(), cfg.passphrase).operations[0].auth[0]), false);
});

test('helper server gating (needs the running helper on 8799)', async () => {
  const b = 'http://127.0.0.1:8799';
  const post = (body, headers = {}) => fetch(b + '/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  assert.equal((await post({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: {} })).status, 403);
  assert.equal((await post({ jsonrpc: '2.0', id: 1, method: 'getEvents', params: {} })).status, 403);
  assert.equal((await fetch(b + '/api/prepare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'settle' }) })).status, 400);
  assert.equal((await fetch(b + '/api/rpc', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await post('{}', { origin: 'http://evil.example' })).status, 403);
});
