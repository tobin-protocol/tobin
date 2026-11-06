'use strict';
// Expiry reconciliation: a PENDING record may become EXPIRED only on NETWORK-TIME evidence in the NOT_FOUND answer itself
// (a ledger that closed after the validity window, and history that reaches back before the submission). The local clock
// never establishes expiry. SUCCESS and FAILED stay authoritative. Anything else leaves the record PENDING and resubmits nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.cjs');
const { core, cfg, STATE, realNow, makeDeps } = H;

const ops = (m) => JSON.parse(m.fs.files.get(STATE)).operations;
const rec = (m) => ops(m)[0];
const run = (m, op = 'mint-C') => core.execute(m.deps, cfg, op);
const again = (m, rpcOver) => makeDeps('mint-C', { fs: m.fs, initStore: false, rpcOver });
const rej = (p, re) => assert.rejects(p, (e) => e instanceof core.Refusal && re.test(e.message), String(re));
const seq = (...s) => { let i = 0; return async () => { const v = s[Math.min(i++, s.length - 1)]; return typeof v === 'string' ? { status: v, ledger: 9 } : v; }; };
const HASH = 'c'.repeat(64);

// A pending record whose validity window ended at `maxTime`, submitted at `submittedAtSec`.
function pendingAt(maxTime, submittedAtSec = realNow() - 2000) {
  const m = makeDeps('mint-C');
  m.store.markPending(cfg, 'mint-C', { txHash: HASH, maxTime, now: submittedAtSec });
  return m;
}
const MAX = () => realNow() - 1000;                         // window ended 1000 s ago by the local clock
const nf = (o = {}) => ({ status: 'NOT_FOUND', latestLedger: 5000, oldestLedger: 1, latestLedgerCloseTime: String(MAX() + 600), oldestLedgerCloseTime: String(realNow() - 5 * 86400), ...o });
const stays = async (m, getTx, re = /not known yet/) => {
  const n = again(m, { getTx });
  await rej(run(n), re);
  assert.equal(rec(m).status, 'PENDING'); assert.equal(n.rpc.calls.sent, 0); assert.equal(n.counters.keyLoads, 0); assert.equal(n.rpc.calls.simulated, 0);
};

// ---------------- pure function ----------------
test('windowClosedByNetwork: the exact boundaries', () => {
  const now = realNow(); const maxTime = now - 1000; const sub = now - 2000;
  const r = { submittedAt: new Date(sub * 1000).toISOString(), maxTime };
  const f = (g, rr = r) => core.windowClosedByNetwork(rr, g, now);
  const base = { status: 'NOT_FOUND', latestLedgerCloseTime: String(maxTime + 31), oldestLedgerCloseTime: String(sub - 61) };
  assert.equal(f(base).closed, true);
  assert.equal(f({ ...base, latestLedgerCloseTime: String(maxTime + 30) }).closed, false);    // not strictly past maxTime + 30
  assert.equal(f({ ...base, latestLedgerCloseTime: String(maxTime) }).closed, false);         // exactly at the end of the window
  assert.equal(f({ ...base, latestLedgerCloseTime: String(maxTime - 900) }).closed, false);   // stale
  assert.equal(f({ ...base, oldestLedgerCloseTime: String(sub - 60) }).closed, true);         // exactly the required margin: covered
  assert.equal(f({ ...base, oldestLedgerCloseTime: String(sub - 59) }).closed, false);        // history starts too close to the submission
  assert.equal(f({ ...base, oldestLedgerCloseTime: String(sub) }).closed, false);
  assert.equal(f({ ...base, latestLedgerCloseTime: String(now + 301) }).closed, false);       // implausibly in the future
  assert.equal(f({ ...base, latestLedgerCloseTime: now, oldestLedgerCloseTime: sub - 61 }).closed, true); // numbers are accepted too
  for (const g of [undefined, null, 'NOT_FOUND', {}, { status: 'SUCCESS', latestLedgerCloseTime: String(now), oldestLedgerCloseTime: '1' }, { status: 'FAILED' }]) assert.equal(f(g).closed, false);
  assert.equal(f(base, { ...r, submittedAt: 'garbage' }).closed, false);
  assert.equal(f(base, { ...r, submittedAt: undefined }).closed, false);
});

test('windowClosedByNetwork: contradictory evidence (latest ledger earlier than oldest) never closes the window, even when every other condition holds', () => {
  // a record with an early window so that "latest after the window" and "history before the submission" both hold
  const now = realNow(); const r = { submittedAt: new Date((now - 2000) * 1000).toISOString(), maxTime: 100 };
  const consistent = { status: 'NOT_FOUND', latestLedgerCloseTime: '200', oldestLedgerCloseTime: '10' };
  assert.equal(core.windowClosedByNetwork(r, consistent, now).closed, true);
  const contradictory = { status: 'NOT_FOUND', latestLedgerCloseTime: '200', oldestLedgerCloseTime: '300' };
  const v = core.windowClosedByNetwork(r, contradictory, now);
  assert.equal(v.closed, false); assert.match(v.why, /inconsistent/);
});

test('windowClosedByNetwork: malformed network-time evidence never closes the window', () => {
  const now = realNow(); const r = { submittedAt: new Date((now - 2000) * 1000).toISOString(), maxTime: now - 1000 };
  const ok = { status: 'NOT_FOUND', latestLedgerCloseTime: String(now - 500), oldestLedgerCloseTime: '5' };
  assert.equal(core.windowClosedByNetwork(r, ok, now).closed, true);
  for (const bad of [undefined, null, '', 'abc', '12x', '-5', '1.5', 1.5, -1, NaN, Infinity, {}, [], true, '0x10', ' 1000100']) {
    assert.equal(core.windowClosedByNetwork(r, { ...ok, latestLedgerCloseTime: bad }, now).closed, false, `latest=${String(bad)}`);
    assert.equal(core.windowClosedByNetwork(r, { ...ok, oldestLedgerCloseTime: bad }, now).closed, false, `oldest=${String(bad)}`);
  }
  assert.equal(core.windowClosedByNetwork(r, { ...ok, latestLedgerCloseTime: '4', oldestLedgerCloseTime: '5' }, now).closed, false); // latest before oldest
});

// ---------------- reconciliation behaviour ----------------
test('confirmed expiry: network time past the window and history covering the submission -> EXPIRED, nothing resubmitted by reconcile, a fresh attempt may then proceed', async () => {
  const m = pendingAt(MAX());
  const n = again(m, { getTx: seq(nf(), { status: 'SUCCESS', ledger: 70, returnValue: undefined }) });
  await run(n);
  assert.equal(ops(m)[0].status, 'EXPIRED'); assert.equal(ops(m)[0].reason, 'WINDOW_PASSED_NOT_FOUND'); assert.equal(ops(m)[1].status, 'SUCCEEDED');
  assert.equal(n.rpc.calls.sent, 1);                                  // exactly the one NEW submission; the old envelope was never resent
});

test('NOT_FOUND alone is not expiry, even when the local clock says the window is long past', async () => {
  const m = pendingAt(MAX());
  await stays(m, seq({ status: 'NOT_FOUND' }), /evidence is missing or malformed/);
  await stays(m, seq({ status: 'NOT_FOUND', latestLedger: 5000 }), /evidence is missing or malformed/);
  await stays(m, seq('NOT_FOUND'), /evidence is missing or malformed/);
});

test('lagging RPC: its newest ledger closed before or at the end of the window -> PENDING', async () => {
  const m = pendingAt(MAX());
  await stays(m, seq(nf({ latestLedgerCloseTime: String(MAX() - 500) })), /has not passed the end of the validity window/);
  await stays(m, seq(nf({ latestLedgerCloseTime: String(MAX()) })), /has not passed the end/);
  await stays(m, seq(nf({ latestLedgerCloseTime: String(MAX() + 30) })), /has not passed the end/);   // inside the 30 s margin
});

test('stale ledger information: history that does not reach back before the submission, or a ledger far in the future -> PENDING', async () => {
  const m = pendingAt(MAX(), realNow() - 2000);
  await stays(m, seq(nf({ latestLedgerCloseTime: String(realNow()), oldestLedgerCloseTime: String(realNow() - 2000) })), /does not clearly cover the submission/);
  await stays(m, seq(nf({ latestLedgerCloseTime: String(realNow()), oldestLedgerCloseTime: String(realNow() - 100) })), /does not clearly cover/);
  await stays(m, seq(nf({ latestLedgerCloseTime: String(realNow() + 100000) })), /implausibly far in the future/);
});

test('malformed network-time evidence leaves the record PENDING', async () => {
  const m = pendingAt(MAX());
  for (const bad of [{ latestLedgerCloseTime: 'soon' }, { latestLedgerCloseTime: null }, { oldestLedgerCloseTime: undefined }, { oldestLedgerCloseTime: '-1' },
    { latestLedgerCloseTime: '1.5' }, { latestLedgerCloseTime: '3', oldestLedgerCloseTime: '9' }]) await stays(m, seq(nf(bad)));
});

test('RPC errors and malformed answers leave the record PENDING and refuse', async () => {
  const m = pendingAt(MAX());
  await stays(m, async () => { throw new Error('ETIMEDOUT'); }, /cannot reach the RPC/);
  await stays(m, async () => { throw { code: -32603, message: 'internal' }; }, /cannot reach the RPC/);
  for (const bad of [undefined, null, 'x', {}, { status: 7 }]) await stays(m, async () => bad, /malformed/);
  await stays(m, async () => ({ status: 'WEIRD' }), /not known yet \(status WEIRD\)/);
});

test('SUCCESS and FAILED remain authoritative, with or without usable network-time evidence', async () => {
  let m = pendingAt(MAX());
  await rej(run(again(m, { getTx: seq('SUCCESS') })), /already recorded as done/); assert.equal(rec(m).status, 'SUCCEEDED');
  m = pendingAt(MAX());
  const n = again(m, { getTx: seq({ status: 'FAILED', ledger: 8, latestLedgerCloseTime: 'garbage' }, 'SUCCESS') }); await run(n);
  assert.equal(ops(m)[0].status, 'FAILED'); assert.equal(ops(m)[0].reason, 'ON_CHAIN_FAILED');
  m = pendingAt(MAX());   // included inside the window although the RPC now also shows a later ledger: the inclusion wins
  await rej(run(again(m, { getTx: seq({ status: 'SUCCESS', ledger: 5, latestLedgerCloseTime: String(MAX() + 600), oldestLedgerCloseTime: '1' }) })), /already recorded as done/);
  assert.equal(rec(m).status, 'SUCCEEDED');
});

test('while a record is unresolved no other operation runs, and nothing is ever resubmitted', async () => {
  const m = pendingAt(MAX());
  const other = makeDeps('mint-D', { fs: m.fs, initStore: false, rpcOver: { getTx: seq(nf({ latestLedgerCloseTime: String(MAX() - 10) })) } });
  await rej(core.execute(other.deps, cfg, 'mint-D'), /not known yet/);
  assert.equal(other.rpc.calls.sent, 0); assert.equal(other.counters.keyLoads, 0); assert.equal(other.rpc.calls.simulated, 0); assert.equal(rec(m).status, 'PENDING');
});

// ---------------- rejected-attempt block lifts only on network evidence ----------------
const rejected = async (getTx = seq(nf())) => {
  const m = makeDeps('mint-C', { rpcOver: { sendResponse: (h) => ({ status: 'ERROR', hash: h, errorResult: { result: 'txBAD_SEQ' } }), getTx: seq({ status: 'NOT_FOUND' }) } });
  await rej(run(m), /rejected at submission/);
  const s = JSON.parse(m.fs.files.get(STATE)); s.operations[0].maxTime = MAX(); s.operations[0].submittedAt = new Date((realNow() - 2000) * 1000).toISOString(); m.fs.files.set(STATE, JSON.stringify(s));
  return m;
};

test('a rejected envelope blocks a new attempt until the network shows its window closed; the lift is recorded once', async () => {
  const m = await rejected();
  const a = again(m, { getTx: seq({ status: 'NOT_FOUND' }) });                         // no evidence
  await rej(run(a), /cannot yet be proven closed/); assert.equal(a.rpc.calls.sent, 0); assert.equal(a.counters.keyLoads, 0);
  const b = again(m, { getTx: seq(nf({ latestLedgerCloseTime: String(MAX() + 5) })) }); // lagging
  await rej(run(b), /cannot yet be proven closed/); assert.equal(b.rpc.calls.sent, 0);
  const down = again(m, { getTx: async () => { throw new Error('down'); } });
  await rej(run(down), /cannot reach the RPC to verify/); assert.equal(down.rpc.calls.sent, 0);
  const included = again(m, { getTx: seq('SUCCESS') });
  await rej(run(included), /shows the rejected mint-C transaction as included/); assert.equal(included.rpc.calls.sent, 0);
  assert.equal(rec(m).reason, 'SUBMISSION_REJECTED');
  const c = again(m, { getTx: seq(nf(), 'SUCCESS') }); await run(c);                   // evidence arrives: lifted, then a fresh attempt
  assert.equal(ops(m)[0].reason, 'SUBMISSION_REJECTED_WINDOW_CLOSED'); assert.equal(ops(m)[1].status, 'SUCCEEDED'); assert.equal(c.rpc.calls.sent, 1);
});

test('after the lift is recorded it is not re-checked against the network again', async () => {
  const m = await rejected();
  await run(again(m, { getTx: seq(nf(), { status: 'FAILED', ledger: 3 }) })).catch(() => {});   // lifted, new attempt failed on chain
  assert.equal(ops(m)[0].reason, 'SUBMISSION_REJECTED_WINDOW_CLOSED');
  const n = again(m, { getTx: seq('SUCCESS') }); await run(n);                                    // no NOT_FOUND evidence needed any more
  assert.equal(ops(m)[ops(m).length - 1].status, 'SUCCEEDED');
});
