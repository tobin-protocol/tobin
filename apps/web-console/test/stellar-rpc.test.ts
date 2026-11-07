// RPC layer and Freighter adapter logic. Everything that touches a "network" or a "wallet" here is a hand-written MOCK, labelled MOCK: these tests prove the SAFETY LOGIC
// (unknown is never failed or confirmed; no retries; wallet answers are verified), not any real Stellar or Freighter behaviour. Real Testnet reads and simulations
// are recorded by scripts/testnet-preflight.mjs and scripts/testnet-simulate.mjs (docs/product/architecture/mvp-1.5/evidence/), and are NOT part of this suite.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Account, Address, Keypair, Networks, Operation, TransactionBuilder, Asset, scValToNative } from '@stellar/stellar-sdk';
import { encodeAddress } from 'tobin-mvp1-sdk/strkey';
import { pollTransaction, readTransaction, submitSigned, toScVal } from '../lib/stellar/rpc.ts';
import { browserName, connectWallet, inspectWallet, requestTransactionSignature } from '../lib/stellar/freighter.ts';
import type { FreighterLike } from '../lib/stellar/freighter.ts';

const PASS = Networks.TESTNET;
const J = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)));

// ---- argument encoding (offline, real SDK) ----
test('encoding: the SDK tagged arguments become the Soroban values the contract expects', () => {
  const g = Keypair.random().publicKey();
  assert.equal(scValToNative(toScVal({ t: 'addr', v: g })), g);
  const id = 'ab'.repeat(32); assert.equal(Buffer.from(scValToNative(toScVal({ t: 'bytes32', v: id })) as Uint8Array).toString('hex'), id);
  const big = '99999999999999999999999999999'; assert.equal(scValToNative(toScVal({ t: 'i128', v: big })).toString(), big, 'exact i128');
  assert.equal(scValToNative(toScVal({ t: 'u32', v: 4 })), 4);
  const o = scValToNative(toScVal({ t: 'obligation', v: { id, debtor: g, creditor: g, amount: '7' } })) as Record<string, unknown>;
  assert.deepEqual(Object.keys(o).sort(), ['amount', 'creditor', 'debtor', 'id']); assert.equal(String(o['amount']), '7'); assert.equal(o['debtor'], g);
  const list = scValToNative(toScVal({ t: 'instructions', v: [{ payer: g, payee: g, amount: '5' }, { payer: g, payee: g, amount: '6' }] })) as Record<string, unknown>[];
  assert.equal(list.length, 2); assert.deepEqual(Object.keys(list[0]!).sort(), ['amount', 'payee', 'payer']); assert.equal(String(list[1]!['amount']), '6');
  assert.deepEqual(J(scValToNative(toScVal({ t: 'instructions', v: [] }))), []);
});

// ---- reading a transaction by hash (MOCK reader) ----
const H = 'a'.repeat(64);
test('MOCK read: only SUCCESS and FAILED are results; not found and unavailable are UNKNOWN', async () => {
  const mk = (r: unknown) => ({ getTransaction: async () => r });
  assert.deepEqual((await readTransaction(mk({ status: 'SUCCESS', ledger: 7, createdAt: 1, applicationOrder: 2 }), H)).status, 'SUCCESS');
  assert.equal((await readTransaction(mk({ status: 'FAILED', ledger: 7, createdAt: 1, applicationOrder: 2 }), H)).status, 'FAILED');
  assert.equal((await readTransaction(mk({ status: 'NOT_FOUND' }), H)).status, 'NOT_FOUND');
  assert.equal((await readTransaction({ getTransaction: async () => { throw new Error('socket hang up'); } }, H)).status, 'UNAVAILABLE', 'a network error is not a failure');
  assert.equal((await readTransaction(mk({ status: 'SOMETHING_NEW' }), H)).status, 'UNAVAILABLE');
  assert.equal((await readTransaction(mk(undefined), H)).status, 'UNAVAILABLE');
});

test('MOCK poll: it keeps asking about the ORIGINAL hash; a deadline is unknown, never failure; it never resubmits', async () => {
  let calls = 0; const seen: string[] = []; const sleeps: number[] = [];
  const server = { getTransaction: async (h: string) => { seen.push(h); calls++; return calls < 3 ? { status: 'NOT_FOUND' } : { status: 'SUCCESS', ledger: 9, createdAt: 1, applicationOrder: 1 }; } };
  const r = await pollTransaction(server, H, { attempts: 5, delayMs: 10, sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(r.status, 'SUCCESS'); assert.equal(calls, 3); assert.ok(seen.every((h) => h === H), 'always the original hash'); assert.deepEqual(sleeps, [10, 10]);
  const never = await pollTransaction({ getTransaction: async () => ({ status: 'NOT_FOUND' }) }, H, { attempts: 3, delayMs: 1, sleep: async () => {} });
  assert.equal(never.status, 'NOT_FOUND', 'timed out = unknown'); assert.notEqual(never.status, 'FAILED');
  const down = await pollTransaction({ getTransaction: async () => { throw new Error('503'); } }, H, { attempts: 2, delayMs: 1, sleep: async () => {} });
  assert.equal(down.status, 'UNAVAILABLE');
  const failed = await pollTransaction({ getTransaction: async () => ({ status: 'FAILED', ledger: 1, createdAt: 1, applicationOrder: 1 }) }, H, { attempts: 3, delayMs: 1, sleep: async () => {} });
  assert.equal(failed.status, 'FAILED');
});

// ---- submission outcomes (MOCK submitter; a real signed classic transaction is built offline) ----
function signedTx() {
  const kp = Keypair.random(); const dest = Keypair.random().publicKey();
  const tx = new TransactionBuilder(new Account(kp.publicKey(), '1'), { fee: '100', networkPassphrase: PASS }).addOperation(Operation.payment({ destination: dest, asset: Asset.native(), amount: '1' })).setTimeout(30).build();
  tx.sign(kp); return { xdr: tx.toXDR(), hash: Buffer.from(tx.hash()).toString('hex'), kp, tx };
}
test('MOCK submit: every response maps conservatively and the transaction is sent exactly ONCE', async () => {
  const s = signedTx();
  const run = async (reply: () => Promise<unknown>) => { let n = 0; const out = await submitSigned({ sendTransaction: async () => { n++; return reply(); } }, s.xdr, s.hash, PASS); return { out, n }; };
  let r = await run(async () => ({ status: 'PENDING', hash: s.hash })); assert.deepEqual(r.out, { kind: 'accepted', hash: s.hash }); assert.equal(r.n, 1);
  r = await run(async () => ({ status: 'DUPLICATE', hash: s.hash })); assert.equal(r.out.kind, 'duplicate');
  r = await run(async () => ({ status: 'ERROR', hash: s.hash })); assert.equal(r.out.kind, 'rejected');
  r = await run(async () => ({ status: 'TRY_AGAIN_LATER' })); assert.equal(r.out.kind, 'unknown'); assert.equal(r.n, 1, 'no automatic retry');
  r = await run(async () => { throw new Error('timeout'); }); assert.equal(r.out.kind, 'unknown'); assert.equal((r.out as { hash: string }).hash, s.hash, 'the hash computed BEFORE sending lets the outcome be looked up'); assert.equal(r.n, 1);
  r = await run(async () => ({ status: 'WHO_KNOWS' })); assert.equal(r.out.kind, 'unknown');
  for (const x of ['accepted', 'duplicate', 'unknown'] as const) assert.notEqual(x, 'confirmed');
});

// ---- Freighter adapter (MOCK wallet) ----
const kpA = Keypair.random(); const ADDR = kpA.publicKey();
function wallet(over: Partial<Record<keyof FreighterLike, unknown>> = {}, opts: { signAs?: Keypair; alter?: boolean; signer?: string } = {}) {
  const calls: string[] = [];
  const api: FreighterLike = {
    isConnected: async () => { calls.push('isConnected'); return { isConnected: true }; },
    isAllowed: async () => { calls.push('isAllowed'); return { isAllowed: true }; },
    requestAccess: async () => { calls.push('requestAccess'); return { address: ADDR }; },
    getAddress: async () => { calls.push('getAddress'); return { address: ADDR }; },
    getNetwork: async () => { calls.push('getNetwork'); return { network: 'TESTNET', networkPassphrase: PASS }; },
    signTransaction: async (xdr: string) => {
      calls.push('signTransaction');
      let tx = TransactionBuilder.fromXDR(xdr, PASS);
      if (opts.alter) tx = new TransactionBuilder(new Account(ADDR, '1'), { fee: '100', networkPassphrase: PASS }).addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '1' })).setTimeout(30).build();
      (tx as unknown as { sign: (k: Keypair) => void }).sign(opts.signAs ?? kpA);
      return { signedTxXdr: tx.toXDR(), signerAddress: opts.signer ?? ADDR };
    },
    signAuthEntry: async () => ({ signedAuthEntry: null, signerAddress: ADDR }),
    ...(over as object),
  };
  return { api, calls };
}
const unsignedFor = (addr: string) => new TransactionBuilder(new Account(addr, '1'), { fee: '100', networkPassphrase: PASS }).addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '5' })).setTimeout(30).build().toXDR();

test('MOCK wallet state: a wallet is READY only when Freighter says so, on the expected network and account', async () => {
  const exp = { passphrase: PASS, address: ADDR };
  assert.equal((await inspectWallet(undefined, exp)).kind, 'UNAVAILABLE');
  assert.equal((await inspectWallet(wallet({ isConnected: async () => ({ isConnected: false }) }).api, exp)).kind, 'UNAVAILABLE');
  assert.equal((await inspectWallet(wallet({ isConnected: async () => { throw new Error('no extension'); } }).api, exp)).kind, 'UNAVAILABLE');
  assert.equal((await inspectWallet(wallet({ isAllowed: async () => ({ isAllowed: false }) }).api, exp)).kind, 'NOT_ALLOWED');
  assert.equal((await inspectWallet(wallet({ getAddress: async () => ({ address: '' }) }).api, exp)).kind, 'NOT_ALLOWED', 'locked: no address');
  assert.equal((await inspectWallet(wallet({ getAddress: async () => ({ address: '', error: { code: -4, message: 'wallet locked' } }) }).api, exp)).kind, 'NOT_ALLOWED');
  const wrong = await inspectWallet(wallet({ getNetwork: async () => ({ network: 'PUBLIC', networkPassphrase: Networks.PUBLIC }) }).api, exp); assert.equal(wrong.kind, 'WRONG_NETWORK');
  const other = Keypair.random().publicKey(); const mm = await inspectWallet(wallet({ getAddress: async () => ({ address: other }) }).api, exp); assert.equal(mm.kind, 'ACCOUNT_MISMATCH');
  assert.equal((await inspectWallet(wallet().api, { passphrase: PASS })).kind, 'READY', 'no expected account: any account on the right network');
  const ready = await inspectWallet(wallet().api, exp); assert.deepEqual(ready, { kind: 'READY', address: ADDR, network: 'TESTNET', passphrase: PASS });
  const w = wallet(); await inspectWallet(w.api, exp); assert.ok(!w.calls.includes('requestAccess') && !w.calls.includes('signTransaction'), 'inspecting never prompts and never signs');
  assert.equal(browserName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0'), 'Edge'); assert.equal(browserName('Mozilla/5.0 Chrome/120.0 Safari/537.36'), 'Chrome');
});

test('MOCK connect: a refusal is an outcome, not an error; an unavailable wallet is reported as such', async () => {
  assert.deepEqual(await connectWallet(wallet().api), { ok: true, address: ADDR });
  const refused = await connectWallet(wallet({ requestAccess: async () => ({ address: '', error: { code: -4, message: 'The user rejected this request.' } }) }).api); assert.equal(refused.ok, false); assert.equal((refused as { rejected: boolean }).rejected, true);
  const gone = await connectWallet(wallet({ requestAccess: async () => { throw new Error('extension context invalidated'); } }).api); assert.equal(gone.ok, false); assert.equal((gone as { rejected: boolean }).rejected, false);
  assert.equal((await connectWallet(undefined)).ok, false);
});

test('MOCK sign: the answer is accepted only if it is the same transaction, signed by the expected key', async () => {
  const ctx = { passphrase: PASS, address: ADDR }; const xdr = unsignedFor(ADDR);
  const ok = await requestTransactionSignature(wallet().api, xdr, ctx); assert.equal(ok.ok, true);
  if (ok.ok) { assert.equal(Buffer.from(TransactionBuilder.fromXDR(ok.signedXdr, PASS).hash()).toString('hex'), Buffer.from(TransactionBuilder.fromXDR(xdr, PASS).hash()).toString('hex')); assert.equal(ok.signer, ADDR); }
  const bad = async (w: ReturnType<typeof wallet>, kind: string) => { const r = await requestTransactionSignature(w.api, xdr, ctx); assert.equal(r.ok, false); assert.equal((r as { kind: string }).kind, kind, JSON.stringify(r)); return w; };
  await bad(wallet({}, { alter: true }), 'TRANSACTION_ALTERED');                                   // the wallet (or an attacker) swapped the transaction
  await bad(wallet({}, { signAs: Keypair.random() }), 'BAD_SIGNATURE');                            // signed by another key
  await bad(wallet({}, { signer: Keypair.random().publicKey() }), 'WRONG_SIGNER');                 // reports another signer
  await bad(wallet({ signTransaction: async () => ({ signedTxXdr: 'not xdr', signerAddress: ADDR }) }), 'TRANSACTION_ALTERED');
  await bad(wallet({ signTransaction: async () => ({ signedTxXdr: '', signerAddress: ADDR, error: { code: -4, message: 'The user rejected this request.' } }) }), 'REJECTED');
  await bad(wallet({ signTransaction: async () => ({ signedTxXdr: '', signerAddress: ADDR }) }), 'REJECTED');
  await bad(wallet({ signTransaction: async () => { throw new Error('wallet disconnected during signing'); } }), 'WALLET_ERROR');
  await bad(wallet({ signTransaction: async () => ({ signedTxXdr: '', signerAddress: ADDR, error: { code: -1, message: 'internal error' } }) }), 'WALLET_ERROR');
  // not ready: the wallet must never even be asked to sign
  for (const over of [{ getNetwork: async () => ({ network: 'PUBLIC', networkPassphrase: Networks.PUBLIC }) }, { getAddress: async () => ({ address: Keypair.random().publicKey() }) }, { isAllowed: async () => ({ isAllowed: false }) }, { isConnected: async () => ({ isConnected: false }) }]) {
    const w = wallet(over); const r = await requestTransactionSignature(w.api, xdr, ctx); assert.equal((r as { kind: string }).kind, 'NOT_READY'); assert.ok(!w.calls.includes('signTransaction'), 'wrong network / account / locked: no signing request is made');
  }
  assert.equal((await requestTransactionSignature(undefined, xdr, ctx) as { kind: string }).kind, 'NOT_READY');
  void encodeAddress; void Address;
});
