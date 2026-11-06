'use strict';
// Submission-reconciliation tests: every sendTransaction response class, thrown network errors, lost responses, polling outcomes,
// state-update failures, and interrupted execution. Each test asserts the resulting record (PENDING / FAILED / SUCCEEDED /
// EXPIRED), that the transaction was submitted exactly once, and what a later run does. Fake keys, mocked RPC, in-memory files only.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const H = require('./helpers.cjs');
const { S, x, core, cfg, STATE, realNow, makeDeps, memFs } = H;

const ops = (m) => JSON.parse(m.fs.files.get(STATE)).operations;
const last = (m) => ops(m)[ops(m).length - 1];
const run = (m, op = 'mint-C') => core.execute(m.deps, cfg, op);
const again = (m, rpcOver = {}, op = 'mint-C') => makeDeps(op, { fs: m.fs, initStore: false, rpcOver });
const age = (m) => { const s = JSON.parse(m.fs.files.get(STATE)); for (const o of s.operations) o.maxTime = realNow() - 1000; m.fs.files.set(STATE, JSON.stringify(s)); };
const seq = (...statuses) => { let i = 0; return async () => { const s = statuses[Math.min(i++, statuses.length - 1)]; return typeof s === 'string' ? { status: s, ledger: 55 } : s; }; };
const NF = 'NOT_FOUND';
// a NOT_FOUND answer that carries network-time evidence (latest ledger closed after the window; history reaches back days)
const nfNet = (o = {}) => ({ status: 'NOT_FOUND', latestLedger: 5000, oldestLedger: 1, latestLedgerCloseTime: String(realNow() + 5), oldestLedgerCloseTime: String(realNow() - 5 * 86400), ...o });
const errResult = { result: 'txBAD_SEQ' }; // stands for a decoded TransactionResult
const HASH = 'ab'.repeat(32);
const rej = (p, re) => assert.rejects(p, (e) => e instanceof core.Refusal && re.test(e.message), String(re));

// ---------------------------------------------------------------- classification of the submission answer
test('classifySubmission: every documented status and every malformed shape', () => {
  const c = (sent) => core.classifySubmission(sent, HASH);
  assert.deepEqual(c({ status: 'PENDING', hash: HASH }), { kind: 'ENQUEUED', label: 'ENQUEUED' });
  assert.deepEqual(c({ status: 'DUPLICATE', hash: HASH }), { kind: 'ENQUEUED', label: 'DUPLICATE' });
  assert.deepEqual(c({ status: 'TRY_AGAIN_LATER', hash: HASH }), { kind: 'NOT_ENQUEUED_NOW', label: 'TRY_AGAIN_LATER' });
  assert.deepEqual(c({ status: 'ERROR', hash: HASH, errorResult: errResult }), { kind: 'REJECTED', label: 'ERROR_RESPONSE' });
  assert.equal(c({ status: 'ERROR', hash: HASH }).kind, 'AMBIGUOUS');                    // ERROR without a decoded result is not a verdict
  for (const bad of [undefined, null, 'PENDING', 42, [], {}, { hash: HASH }, { status: 'PENDING' }, { status: 'FILTERED', hash: HASH }, { status: 'pending', hash: HASH },
    { status: 'PENDING', hash: 'xyz' }, { status: 'PENDING', hash: HASH.toUpperCase() }, { status: 'PENDING', hash: 12345 }]) assert.equal(c(bad).kind, 'AMBIGUOUS', JSON.stringify(bad));
  assert.deepEqual(c({ status: 'PENDING', hash: 'cd'.repeat(32) }), { kind: 'AMBIGUOUS', label: 'HASH_MISMATCH', detail: 'the RPC answered for a different transaction hash' });
});

test('pollTransaction: a thrown or malformed answer is UNKNOWN, never a verdict; NOT_FOUND is only "not seen"', async () => {
  const d = (getTransaction) => ({ rpc: { getTransaction }, sleep: async () => {} });
  assert.equal((await core.pollTransaction(d(async () => { throw new Error('x'); }), HASH)).state, 'UNKNOWN');
  for (const bad of [undefined, null, 'x', {}, { status: 7 }, { status: 'WEIRD' }]) assert.equal((await core.pollTransaction(d(async () => bad), HASH)).state, 'UNKNOWN');
  assert.equal((await core.pollTransaction(d(async () => ({ status: NF })), HASH, 3)).state, 'NOT_FOUND');
  assert.equal((await core.pollTransaction(d(seq(NF, NF, 'SUCCESS')), HASH)).state, 'SUCCESS');
  assert.equal((await core.pollTransaction(d(seq(NF, 'FAILED')), HASH)).state, 'FAILED');
});

// ---------------------------------------------------------------- PENDING
test('PENDING then not found, then successful: the operation becomes SUCCEEDED (one submission)', async () => {
  const m = makeDeps('mint-C', { rpcOver: { getTx: seq(NF, NF, NF, 'SUCCESS') } });
  const r = await run(m);
  assert.equal(r.status, 'SUCCEEDED'); assert.equal(last(m).status, 'SUCCEEDED'); assert.equal(last(m).ledger, 55); assert.equal(last(m).submission, 'ENQUEUED'); assert.equal(m.rpc.calls.sent, 1);
});

test('PENDING and never seen within the polling window: stays PENDING; the next run refuses while unknown, then marks EXPIRED after the window and allows a fresh attempt', async () => {
  const m = makeDeps('mint-C', { rpcOver: { getTx: seq(NF) } });
  await rej(run(m), /outcome is not known.*stays PENDING.*not and will not be submitted again/);
  assert.equal(last(m).status, 'PENDING'); assert.equal(m.rpc.calls.sent, 1);
  const inWindow = again(m, { getTx: seq(NF) });
  await rej(run(inWindow), /not known yet/); assert.equal(inWindow.rpc.calls.sent, 0); assert.equal(inWindow.counters.keyLoads, 0); assert.equal(last(m).status, 'PENDING');
  age(m);
  // call 1 reconciles the old record (still not found), call 2 polls the NEW transaction (mock hashes can collide within one second)
  const after = again(m, { getTx: seq(nfNet(), { status: 'SUCCESS', ledger: 66, returnValue: x.ScVal.scvVoid() }) });
  await run(after);
  assert.equal(ops(m)[0].status, 'EXPIRED'); assert.equal(ops(m)[0].reason, 'WINDOW_PASSED_NOT_FOUND'); assert.equal(ops(m)[1].status, 'SUCCEEDED'); assert.equal(after.rpc.calls.sent, 1);
});

test('PENDING then included and FAILED: recorded FAILED (on chain), never retried in the same run; a later attempt is allowed and uses a fresh transaction', async () => {
  const m = makeDeps('mint-C', { rpcOver: { getTx: seq(NF, { status: 'FAILED', ledger: 77 }) } });
  await rej(run(m), /included in a ledger and failed.*sequence number is consumed.*no retry/);
  assert.equal(last(m).status, 'FAILED'); assert.equal(last(m).reason, 'ON_CHAIN_FAILED'); assert.equal(last(m).ledger, 77); assert.equal(m.rpc.calls.sent, 1);
  const next = again(m); await run(next);
  assert.equal(ops(m)[0].status, 'FAILED'); assert.equal(ops(m)[1].status, 'SUCCEEDED'); assert.equal(next.rpc.calls.sent, 1);
});

// ---------------------------------------------------------------- DUPLICATE
test('DUPLICATE is "already enqueued": it is polled, never recorded as a failure, and the outcome decides', async () => {
  let m = makeDeps('mint-C', { rpcOver: { sendResponse: (h) => ({ status: 'DUPLICATE', hash: h }), getTx: seq(NF, 'SUCCESS') } });
  await run(m); assert.equal(last(m).status, 'SUCCEEDED'); assert.equal(last(m).submission, 'DUPLICATE'); assert.equal(m.rpc.calls.sent, 1);
  m = makeDeps('mint-C', { rpcOver: { sendResponse: (h) => ({ status: 'DUPLICATE', hash: h }), getTx: seq(NF) } });
  await rej(run(m), /outcome is not known.*DUPLICATE/); assert.equal(last(m).status, 'PENDING'); assert.equal(m.rpc.calls.sent, 1);
  m = makeDeps('mint-C', { rpcOver: { sendResponse: (h) => ({ status: 'DUPLICATE', hash: h }), getTx: seq({ status: 'FAILED', ledger: 3 }) } });
  await rej(run(m), /included in a ledger and failed/); assert.equal(last(m).status, 'FAILED'); assert.equal(last(m).reason, 'ON_CHAIN_FAILED');
});

// ---------------------------------------------------------------- TRY_AGAIN_LATER
test('TRY_AGAIN_LATER is "not accepted now", which is not proof it cannot land: stays PENDING, never resubmitted, resolved by getTransaction', async () => {
  let m = makeDeps('mint-C', { rpcOver: { sendResponse: (h) => ({ status: 'TRY_AGAIN_LATER', hash: h }), getTx: seq(NF) } });
  await rej(run(m), /outcome is not known.*TRY_AGAIN_LATER/);
  assert.equal(last(m).status, 'PENDING'); assert.equal(last(m).submission, 'TRY_AGAIN_LATER'); assert.equal(m.rpc.calls.sent, 1);
  const inWindow = again(m, { getTx: seq(NF) }); await rej(run(inWindow), /not known yet/); assert.equal(inWindow.rpc.calls.sent, 0);
  age(m); const after = again(m, { getTx: seq(nfNet(), 'SUCCESS') });
  await run(after); assert.equal(ops(m)[0].status, 'EXPIRED'); assert.equal(ops(m)[1].status, 'SUCCEEDED');
  // it landed through another path after all
  m = makeDeps('mint-C', { rpcOver: { sendResponse: (h) => ({ status: 'TRY_AGAIN_LATER', hash: h }), getTx: seq(NF, NF, 'SUCCESS') } });
  await run(m); assert.equal(last(m).status, 'SUCCEEDED'); assert.equal(m.rpc.calls.sent, 1);
});

// ---------------------------------------------------------------- ERROR
test('ERROR with a decoded result and no trace of the transaction: recorded FAILED (rejected), and a new attempt is blocked until its validity window has passed', async () => {
  const m = makeDeps('mint-C', { rpcOver: { sendResponse: (h) => ({ status: 'ERROR', hash: h, errorResult: errResult }), getTx: seq(NF) } });
  await rej(run(m), /rejected at submission.*recorded FAILED/);
  assert.equal(last(m).status, 'FAILED'); assert.equal(last(m).reason, 'SUBMISSION_REJECTED'); assert.equal(last(m).submission, 'ERROR_RESPONSE'); assert.equal(m.rpc.calls.sent, 1);
  const early = again(m, { getTx: seq(NF) }); await rej(run(early), /rejected and its window cannot yet be proven closed/); assert.equal(early.rpc.calls.sent, 0); assert.equal(early.counters.keyLoads, 0);
  age(m); const later = again(m, { getTx: seq(nfNet(), 'SUCCESS') }); await run(later);
  assert.equal(ops(m)[0].status, 'FAILED'); assert.equal(ops(m)[0].reason, 'SUBMISSION_REJECTED_WINDOW_CLOSED'); assert.equal(ops(m)[1].status, 'SUCCEEDED'); assert.equal(later.rpc.calls.sent, 1);
});

test('ERROR but getTransaction shows the transaction included: the chain wins (SUCCEEDED or FAILED on chain), never "rejected"', async () => {
  let m = makeDeps('mint-C', { rpcOver: { sendResponse: (h) => ({ status: 'ERROR', hash: h, errorResult: errResult }), getTx: seq('SUCCESS') } });
  await run(m); assert.equal(last(m).status, 'SUCCEEDED');
  m = makeDeps('mint-C', { rpcOver: { sendResponse: (h) => ({ status: 'ERROR', hash: h, errorResult: errResult }), getTx: seq({ status: 'FAILED', ledger: 9 }) } });
  await rej(run(m), /included in a ledger and failed/); assert.equal(last(m).status, 'FAILED'); assert.equal(last(m).reason, 'ON_CHAIN_FAILED');
});

test('ERROR where the confirming lookup itself fails or is malformed: no verdict, stays PENDING', async () => {
  for (const getTx of [async () => { throw new Error('rpc down'); }, async () => ({ status: 'WEIRD' }), async () => undefined]) {
    const m = makeDeps('mint-C', { rpcOver: { sendResponse: (h) => ({ status: 'ERROR', hash: h, errorResult: errResult }), getTx } });
    await rej(run(m), /outcome is not known/); assert.equal(last(m).status, 'PENDING'); assert.equal(m.rpc.calls.sent, 1);
  }
});

test('ERROR without a decoded error result is malformed, not a verdict: stays PENDING', async () => {
  const m = makeDeps('mint-C', { rpcOver: { sendResponse: (h) => ({ status: 'ERROR', hash: h }), getTx: seq(NF) } });
  await rej(run(m), /outcome is not known.*MALFORMED_RESPONSE/); assert.equal(last(m).status, 'PENDING'); assert.equal(last(m).submission, 'MALFORMED_RESPONSE');
});

// ---------------------------------------------------------------- missing or malformed responses
test('missing or malformed responses are ambiguous: stay PENDING while unseen, become SUCCEEDED when the chain shows success (response lost but accepted)', async () => {
  const bads = [undefined, null, 'ok', 7, [], {}, { status: 'PENDING' }, { status: 'FILTERED', hash: HASH }, { status: 'PENDING', hash: 'nothex' }];
  for (const bad of bads) {
    let m = makeDeps('mint-C', { rpcOver: { sendResponse: bad, getTx: seq(NF) } });
    await rej(run(m), /outcome is not known/); assert.equal(last(m).status, 'PENDING'); assert.equal(last(m).submission, 'MALFORMED_RESPONSE'); assert.equal(m.rpc.calls.sent, 1);
    m = makeDeps('mint-C', { rpcOver: { sendResponse: bad, getTx: seq(NF, 'SUCCESS') } });
    await run(m); assert.equal(last(m).status, 'SUCCEEDED'); assert.equal(m.rpc.calls.sent, 1);
  }
});

test('a response carrying a different transaction hash is ambiguous: the local hash is tracked, nothing is trusted from the answer', async () => {
  let m = makeDeps('mint-C', { rpcOver: { sendHash: 'cd'.repeat(32), getTx: seq(NF) } });
  await rej(run(m), /outcome is not known.*HASH_MISMATCH/); assert.equal(last(m).status, 'PENDING'); assert.equal(last(m).submission, 'HASH_MISMATCH');
  m = makeDeps('mint-C', { rpcOver: { sendHash: 'cd'.repeat(32), getTx: seq(NF, 'SUCCESS') } });
  await run(m); assert.equal(last(m).status, 'SUCCEEDED');
});

// ---------------------------------------------------------------- thrown errors, lost responses, timeouts
test('thrown network errors (timeout, reset, JSON-RPC error object, undefined result): stay PENDING, never resubmitted; success on the chain is recorded', async () => {
  const thrown = [Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }), new Error('socket hang up'), { code: -32602, message: 'invalid params' }, new TypeError("Cannot destructure property 'errorResultXdr' of 'raw' as it is undefined.")];
  for (const e of thrown) {
    let m = makeDeps('mint-C', { rpcOver: { sendThrows: e, getTx: seq(NF) } });
    await rej(run(m), /outcome is not known.*THROWN/); assert.equal(last(m).status, 'PENDING'); assert.equal(last(m).submission, 'THROWN'); assert.equal(m.rpc.calls.sent, 1);
    m = makeDeps('mint-C', { rpcOver: { sendThrows: e, getTx: seq(NF, NF, 'SUCCESS') } }); // accepted, response lost
    await run(m); assert.equal(last(m).status, 'SUCCEEDED'); assert.equal(m.rpc.calls.sent, 1);
    m = makeDeps('mint-C', { rpcOver: { sendThrows: e, getTx: seq({ status: 'FAILED', ledger: 4 }) } }); // accepted, response lost, then failed
    await rej(run(m), /included in a ledger and failed/); assert.equal(last(m).status, 'FAILED'); assert.equal(last(m).reason, 'ON_CHAIN_FAILED');
  }
});

test('timeout after submission and the lookup also failing: no verdict, PENDING, and the next run refuses until the RPC can answer', async () => {
  const down = async () => { throw new Error('ETIMEDOUT'); };
  const m = makeDeps('mint-C', { rpcOver: { sendThrows: new Error('ETIMEDOUT'), getTx: down } });
  await rej(run(m), /outcome is not known.*latest status UNKNOWN/); assert.equal(last(m).status, 'PENDING'); assert.equal(m.rpc.calls.sent, 1);
  const next = again(m, { getTx: down }); await rej(run(next), /cannot reach the RPC to reconcile/); assert.equal(next.rpc.calls.sent, 0); assert.equal(last(m).status, 'PENDING');
  const malformed = again(m, { getTx: async () => ({}) }); await rej(run(malformed), /malformed/); assert.equal(malformed.rpc.calls.sent, 0);
  const up = again(m, { getTx: seq('SUCCESS') }); await rej(run(up), /already recorded as done/); assert.equal(last(m).status, 'SUCCEEDED'); assert.equal(up.rpc.calls.sent, 0);
});

test('malformed answers while polling are UNKNOWN: the record stays PENDING (never completed, never failed)', async () => {
  for (const bad of [{ status: 'WEIRD' }, {}, null, undefined, 'SUCCESS']) {
    const m = makeDeps('mint-C', { rpcOver: { getTx: async () => bad } });
    await rej(run(m), /outcome is not known/); assert.equal(last(m).status, 'PENDING'); assert.equal(m.rpc.calls.sent, 1);
  }
});

test('secrets in thrown errors never reach messages or the state file', async () => {
  const sec = S.Keypair.random().secret();
  const m = makeDeps('mint-C', { rpcOver: { sendThrows: new Error(`boom ${sec}`), getTx: seq(NF) } });
  await assert.rejects(run(m), (e) => !e.message.includes(sec));
  assert.ok(!m.fs.files.get(STATE).includes(sec));
});

// ---------------------------------------------------------------- refusing further operations while unknown
test('while any outcome is unknown, every other operation is refused as well, and nothing is signed or sent', async () => {
  const m = makeDeps('mint-C', { rpcOver: { sendThrows: new Error('ETIMEDOUT'), getTx: seq(NF) } });
  await rej(run(m), /outcome is not known/);
  const other = again(m, { getTx: seq(NF) }, 'mint-D');
  await rej(core.execute(other.deps, cfg, 'mint-D'), /not known yet/);
  assert.equal(other.rpc.calls.sent, 0); assert.equal(other.counters.keyLoads, 0); assert.equal(other.rpc.calls.simulated, 0);
});

// ---------------------------------------------------------------- state-update failure after submission
test('state update failing after a successful submission: the error names the hash and says do not re-run; the record is PENDING on disk (never a false "completed"); the next run reconciles to SUCCEEDED', async () => {
  const m = makeDeps('mint-C', { rpcOver: { onSend: () => { m.fs.hooks.rename = () => { throw new Error('disk full'); }; } } });
  await assert.rejects(run(m), (e) => e instanceof core.Refusal && /outcome is SUCCEEDED but the local record could not be updated/.test(e.message) && /[0-9a-f]{64}/.test(e.message) && /do not re-run/.test(e.message));
  assert.equal(last(m).status, 'PENDING'); assert.equal(m.rpc.calls.sent, 1);
  delete m.fs.hooks.rename;
  const next = again(m, { getTx: seq('SUCCESS') }); await rej(run(next), /already recorded as done/);
  assert.equal(last(m).status, 'SUCCEEDED'); assert.equal(next.rpc.calls.sent, 0);
});

test('state update failing after an on-chain failure: PENDING on disk with the hash in the error; the next run reconciles to FAILED', async () => {
  const m = makeDeps('mint-C', { rpcOver: { getTx: seq({ status: 'FAILED', ledger: 5 }), onSend: () => { m.fs.hooks.rename = () => { throw new Error('disk full'); }; } } });
  await assert.rejects(run(m), (e) => e instanceof core.Refusal && /outcome is FAILED but the local record could not be updated/.test(e.message) && /do not re-run/.test(e.message));
  assert.equal(last(m).status, 'PENDING'); delete m.fs.hooks.rename;
  const next = again(m, { getTx: seq({ status: 'FAILED', ledger: 5 }, 'SUCCESS') });
  await run(next); assert.equal(ops(m)[0].status, 'FAILED'); assert.equal(ops(m)[0].reason, 'ON_CHAIN_FAILED'); assert.equal(ops(m)[1].status, 'SUCCEEDED');
});

test('the audit label cannot fail an operation: if annotating fails the record stays PENDING and the flow continues to the verdict from the chain', async () => {
  const m = makeDeps('mint-C', { rpcOver: { sendResponse: (h) => ({ status: 'PENDING', hash: h }), onSend: () => { m.store.annotate = () => { throw new Error('x'); }; } } });
  const r = await run(m); assert.equal(r.status, 'SUCCEEDED');
});

// ---------------------------------------------------------------- interrupted execution
test('process interrupted right after the PENDING record is written (before sending): the next run reconciles by hash and never double-submits', async () => {
  const m = makeDeps('mint-C');
  m.store.markPending(cfg, 'mint-C', { txHash: 'e'.repeat(64), maxTime: realNow() + 60, now: realNow() });   // simulates the crash point
  const next = again(m, { getTx: seq(NF) }); await rej(run(next), /not known yet/); assert.equal(next.rpc.calls.sent, 0);
  const found = again(m, { getTx: seq({ status: 'FAILED', ledger: 1 }) }); await run(found).catch(() => {});
  assert.equal(ops(m)[0].status, 'FAILED');                                                                      // the chain showed it landed and failed
  assert.equal(ops(m)[0].reason, 'ON_CHAIN_FAILED');
});

test('interrupted after sending, before any answer: a later run finds it by hash and records SUCCEEDED without sending again', async () => {
  const m = makeDeps('mint-C');
  m.store.markPending(cfg, 'mint-C', { txHash: 'f'.repeat(64), maxTime: realNow() + 60, now: realNow() });
  const next = again(m, { getTx: seq('SUCCESS') }); await rej(run(next), /already recorded as done/);
  assert.equal(ops(m)[0].status, 'SUCCEEDED'); assert.equal(next.rpc.calls.sent, 0);
});

// ---------------------------------------------------------------- schema of the new audit fields
test('state schema: reason is only allowed on FAILED/EXPIRED records, labels must be known', () => {
  const base = { version: 2, network: 'testnet', admin: cfg.F, saltHex: cfg.saltHex, predictedContractId: cfg.tokenId, configSha256: cfg.configSha256 };
  const rec = (o) => ({ ...base, operations: [{ operation: 'deploy', txHash: 'a'.repeat(64), ...o }] });
  const { validateState } = require('../state-store.cjs');
  validateState(rec({ status: 'FAILED', reason: 'SUBMISSION_REJECTED' })); validateState(rec({ status: 'EXPIRED', reason: 'WINDOW_PASSED_NOT_FOUND' })); validateState(rec({ status: 'PENDING', submission: 'THROWN' }));
  for (const bad of [{ status: 'SUCCEEDED', reason: 'ON_CHAIN_FAILED' }, { status: 'PENDING', reason: 'ON_CHAIN_FAILED' }, { status: 'FAILED', reason: 'WHATEVER' }, { status: 'PENDING', submission: 'MAYBE' }])
    assert.throws(() => validateState(rec(bad)), /state file invalid/);
});

// ---------------------------------------------------------------- exactly one submission, always
test('across every scenario above the transaction is submitted at most once per execute; no scenario resubmits', async () => {
  const cases = [{ sendThrows: new Error('x') }, { sendResponse: undefined }, { sendResponse: (h) => ({ status: 'TRY_AGAIN_LATER', hash: h }) }, { sendResponse: (h) => ({ status: 'DUPLICATE', hash: h }) },
    { sendResponse: (h) => ({ status: 'ERROR', hash: h, errorResult: errResult }) }, {}];
  for (const c of cases) { const m = makeDeps('mint-C', { rpcOver: { ...c, getTx: seq(NF) } }); await run(m).catch(() => {}); assert.equal(m.rpc.calls.sent, 1, JSON.stringify(Object.keys(c))); }
});
