// SDK unit tests that need no bridge: the ABI and error tables are checked mechanically against the Rust source, the authorization requirements
// are checked as data, and a recording fake transport checks the client\'s own logic. (Behaviour against the real contract: sdk.test.ts.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EngineError, I128_MAX } from '../src/amount.ts';
import {
  CLEARING_ERRORS,
  CLEARING_FUNCTIONS,
  NetworkTransportNotAuthorized,
  TOKEN_ERRORS,
  TOKEN_FUNCTIONS,
  TobinClient,
  TobinError,
  debtorAuthorizations,
  prepareApprove,
  prepareFinalize,
  prepareJoin,
  prepareMint,
  preparePropose,
  prepareSettle,
  prepareSubmitObligation,
  toTobinError,
} from '../src/sdk/index.ts';
import type { InvocationResult, InvokeOptions, PreparedCall, Transport } from '../src/sdk/index.ts';
import { addr, oid } from './helpers.ts';

const CLEARING = addr(200, 'contract');
const TOKEN = addr(201, 'contract');
const A = addr(11);
const B = addr(12);
const C = addr(13);
const S = oid(7);
const DIGEST = 'ab'.repeat(32);

const rust = (p: string): string => readFileSync(new URL(`../../core/${p}`, import.meta.url), 'utf8');

test('the SDK\'s function list is exactly the contract\'s exported functions (no invented ABI)', () => {
  const src = rust('clearing/src/lib.rs');
  const block = src.slice(src.indexOf('#[contractimpl]\nimpl TobinClearingV1 {'), src.indexOf('// ---------------------------------------------------------------------------------------------------------------------------------\n// storage helpers'));
  const exported = [...block.matchAll(/^    pub fn (\w+)\(/gm)].map((m) => m[1] as string).sort();
  assert.deepEqual([...CLEARING_FUNCTIONS].sort(), exported);
  const tok = rust('token/src/lib.rs');
  const tblock = tok.slice(tok.indexOf('#[contractimpl]'));
  const texported = [...tblock.matchAll(/^    pub fn (\w+)\(/gm)].map((m) => m[1] as string).filter((n) => n !== '__constructor').sort();
  assert.deepEqual([...TOKEN_FUNCTIONS].sort(), texported);
});

test('the SDK\'s error tables are exactly the contracts\' error enums', () => {
  const parse = (src: string): Record<number, string> => {
    const i = src.indexOf('pub enum Error {');
    const body = src.slice(i, src.indexOf('}', i));
    return Object.fromEntries([...body.matchAll(/^\s+(\w+) = (\d+),/gm)].map((m) => [Number(m[2]), m[1] as string]));
  };
  assert.deepEqual(CLEARING_ERRORS, parse(rust('clearing/src/lib.rs')));
  assert.deepEqual(TOKEN_ERRORS, parse(rust('token/src/lib.rs')));
});

test('authorization requirements: a join needs the joiner AND the creator on the same invocation', () => {
  const j = prepareJoin(CLEARING, { sessionId: S, participant: B, creator: A });
  assert.deepEqual(j.auths.map((x) => x.signer), [B, A]);
  assert.deepEqual(j.auths[0]?.invocation, j.auths[1]?.invocation);
  assert.equal(j.fn, 'join_session');
  assert.deepEqual(j.args.map((x) => x.t), ['bytes32', 'addr']);
});

test('authorization requirements: single-signer calls name exactly the right signer', () => {
  const o = { id: oid(1), debtor: A, creditor: B, amount: 10n };
  assert.deepEqual(prepareSubmitObligation(CLEARING, { sessionId: S, obligation: o }).auths.map((x) => x.signer), [A], 'the debtor, not the creditor');
  assert.deepEqual(prepareFinalize(CLEARING, { sessionId: S, caller: C }).auths.map((x) => x.signer), [C]);
  assert.deepEqual(preparePropose(CLEARING, { sessionId: S, proposer: B, instructions: [] }).auths.map((x) => x.signer), [B]);
  assert.deepEqual(prepareApprove(CLEARING, { sessionId: S, participant: C, digest: DIGEST }).auths.map((x) => x.signer), [C]);
  assert.deepEqual(prepareMint(TOKEN, { minter: A, to: B, amount: 1n }).auths.map((x) => x.signer), [A]);
  assert.throws(() => prepareMint(TOKEN, { minter: A, to: B, amount: 0n }), EngineError);
  // an approval is NOT a debit authorization: its requirement has no token sub-invocation
  assert.deepEqual(prepareApprove(CLEARING, { sessionId: S, participant: C, digest: DIGEST }).auths[0]?.invocation.subs, []);
});

test('settlement requirements: one per debtor, with its own total and its own transfers; creditors and submitters need none', () => {
  const plan = [
    { payer: A, payee: B, amount: 20n },
    { payer: A, payee: C, amount: 10n },
    { payer: B, payee: C, amount: 5n },
  ];
  const call = prepareSettle(CLEARING, { sessionId: S, digest: DIGEST, instructions: plan, token: TOKEN });
  assert.equal(call.fn, 'settle');
  assert.deepEqual(call.args.map((x) => x.t), ['bytes32', 'bytes32'], 'settle takes no caller and no submitter argument');
  assert.deepEqual(call.auths.map((x) => x.signer), [A, B], 'the debtors only: C is a creditor and needs no authorization');
  const [authA, authB] = call.auths;
  assert.deepEqual(authA?.invocation.args, [{ t: 'bytes32', v: S }, { t: 'bytes32', v: DIGEST }, { t: 'i128', v: '30' }], 'settle(session, digest, own total)');
  assert.equal(authA?.invocation.contract, CLEARING);
  assert.deepEqual(authA?.invocation.subs.map((s) => [s.contract, s.fn, s.args]), [
    [TOKEN, 'transfer', [{ t: 'addr', v: A }, { t: 'addr', v: B }, { t: 'i128', v: '20' }]],
    [TOKEN, 'transfer', [{ t: 'addr', v: A }, { t: 'addr', v: C }, { t: 'i128', v: '10' }]],
  ]);
  assert.deepEqual(authB?.invocation.args[2], { t: 'i128', v: '5' });
  assert.equal(authB?.invocation.subs.length, 1);
  assert.deepEqual(debtorAuthorizations(plan).map((d) => [d.debtor, d.total]), [[A, 30n], [B, 5n]]);
});

test('settlement of an empty plan has no debtor and no authorization', () => {
  const call = prepareSettle(CLEARING, { sessionId: S, digest: DIGEST, instructions: [], token: TOKEN });
  assert.deepEqual(call.auths, []);
  assert.match(call.description, /all zero/);
});

test('a debtor total that would overflow i128 is refused before anything is sent', () => {
  const plan = [
    { payer: A, payee: B, amount: I128_MAX },
    { payer: A, payee: C, amount: 1n },
  ];
  assert.throws(() => prepareSettle(CLEARING, { sessionId: S, digest: DIGEST, instructions: plan, token: TOKEN }), (e: unknown) => e instanceof EngineError && e.code === 'OVERFLOW');
});

class Recording implements Transport {
  readonly description = 'recording fake';
  calls: { call: PreparedCall; options?: InvokeOptions }[] = [];
  replies: InvocationResult[] = [];
  invoke(call: PreparedCall, options?: InvokeOptions): Promise<InvocationResult> {
    this.calls.push(options ? { call, options } : { call });
    return Promise.resolve(this.replies.shift() ?? { ok: true, value: null });
  }
}

test('the client sends prepared calls through the transport and passes the authorize option; failures become typed errors', async () => {
  const t = new Recording();
  const client = new TobinClient({ transport: t, clearing: CLEARING });
  t.replies.push({ ok: true, value: null, eventCount: 2 });
  const r = await client.createSession({ creator: A, sessionId: S, token: TOKEN, maxParticipants: 4, maxObligations: 16 }, { authorize: [A] });
  assert.deepEqual(t.calls[0]?.options, { authorize: [A] });
  assert.equal(r.ranOn, 'recording fake');
  assert.equal(r.eventCount, 2);
  t.replies.push({ ok: false, errorType: 'Contract', code: 40 });
  await assert.rejects(client.approveSettlement({ sessionId: S, participant: A, digest: DIGEST }), (e: unknown) => e instanceof TobinError && e.kind === 'contract' && e.errorName === 'DigestMismatch' && e.code === 40);
  t.replies.push({ ok: false, errorType: 'Auth', code: null, codeName: 'InvalidAction' });
  await assert.rejects(client.createSession({ creator: A, sessionId: S, token: TOKEN, maxParticipants: 4, maxObligations: 16 }), (e: unknown) => e instanceof TobinError && e.kind === 'auth');
  t.replies.push({ ok: false, errorType: 'Contract', code: 102 });
  await assert.rejects(client.createSession({ creator: A, sessionId: S, token: TOKEN, maxParticipants: 4, maxObligations: 16 }), (e: unknown) => e instanceof TobinError && e.kind === 'token' && e.errorName === 'InsufficientBalance');
});

test('reads: "no proposal" and "not settled" are null, other failures still throw', async () => {
  const t = new Recording();
  const client = new TobinClient({ transport: t, clearing: CLEARING });
  t.replies.push({ ok: false, errorType: 'Contract', code: 5 });
  assert.equal(await client.getProposal(S), null);
  t.replies.push({ ok: false, errorType: 'Contract', code: 3 });
  assert.equal(await client.getSettlement(S), null);
  t.replies.push({ ok: false, errorType: 'Contract', code: 1 });
  await assert.rejects(client.getProposal(S), (e: unknown) => e instanceof TobinError && e.errorName === 'SessionNotFound');
});

test('status counts approvals of the CURRENT digest only (a stale approval never counts), even if one were reported', async () => {
  const t = new Recording();
  const client = new TobinClient({ transport: t, clearing: CLEARING });
  const D1 = '11'.repeat(32);
  const D2 = '22'.repeat(32);
  t.replies.push(
    { ok: true, value: { creator: A, token: TOKEN, max_participants: 4, max_obligations: 16, state: 2, participants: [A, B], obligation_commitment: 'ab'.repeat(32) } },
    { ok: true, value: [{ id: oid(1), debtor: A, creditor: B, amount: '5' }] },
    { ok: true, value: { digest: D2, instructions: [{ payer: A, payee: B, amount: '5' }], proposer: A, revision: 2 } },
    { ok: true, value: [{ participant: A, digest: D1 }, { participant: B, digest: D2 }] },
    { ok: false, errorType: 'Contract', code: 3 },
  );
  const st = await client.getSessionStatus(S);
  assert.deepEqual(st.approvals, [{ participant: A, approved: false }, { participant: B, approved: true }]);
  assert.deepEqual(st.missingApprovals, [A]);
  assert.equal(st.state, 'Committed');
  assert.equal(st.settlement, null);
  assert.deepEqual(st.debtorAuthorizations.map((d) => [d.debtor, d.total]), [[A, 5n]]);
});

test('error mapping: unknown codes and non-contract host errors stay visible', () => {
  assert.equal(toTobinError('f', 'Contract', 77).errorName, 'Unknown#77');
  assert.equal(toTobinError('f', 'Budget', null, 'ExceededLimit').kind, 'host');
  assert.equal(toTobinError('f', 'Auth', null, 'InvalidAction').kind, 'auth');
  assert.match(toTobinError('settle', 'Contract', 6).message, /Not every admitted participant has approved/);
});

test('the network transport is an explicit, honest gap: it refuses and says why', async () => {
  const n = new NetworkTransportNotAuthorized();
  assert.match(n.description, /DB-13/);
  await assert.rejects(n.invoke(prepareFinalize(CLEARING, { sessionId: S, caller: A })), /DB-13/);
});

test('local digest verification refuses to guess the network id', () => {
  const client = new TobinClient({ transport: new Recording(), clearing: CLEARING });
  assert.throws(() => client.digestContext(S, TOKEN), EngineError);
});

// ---- EQ-20 fresh-authorization retry policy (founder decisions, record section 9). Pure unit tests: no bridge, no network. ----
const PLAN = [{ payer: A, payee: B, amount: 5n }];
const settleCall = (): PreparedCall => prepareSettle(CLEARING, { sessionId: S, digest: DIGEST, instructions: PLAN, token: TOKEN });

test('EQ-20: a failed settlement attempt is never retried with the same authorization round', async () => {
  const t = new Recording();
  const client = new TobinClient({ transport: t, clearing: CLEARING });
  const call = settleCall();
  t.replies.push({ ok: false, errorType: 'Contract', code: 102 }); // token error 102: insufficient balance
  await assert.rejects(client.send(call, { authorize: [A] }), (e: unknown) => e instanceof TobinError && e.errorName === 'InsufficientBalance');
  assert.equal(t.calls.length, 1);
  // the very same call object, with the same grants, is refused before the transport is touched
  const again = (await client.send(call, { authorize: [A] }).then(() => null, (e: unknown) => e)) as TobinError;
  assert.ok(again instanceof TobinError && again.kind === 'policy' && again.errorName === 'ReauthorizationRequired');
  assert.match(again.message, /prepare the settlement again/);
  assert.equal(t.calls.length, 1, 'nothing was sent the second time');
});

test('EQ-20: copies and edits of a used call are not fresh authorization (a new sequence or envelope is not either)', async () => {
  const t = new Recording();
  const client = new TobinClient({ transport: t, clearing: CLEARING });
  const call = settleCall();
  t.replies.push({ ok: false, errorType: 'Auth', code: null, codeName: 'InvalidAction' });
  await assert.rejects(client.send(call, { authorize: [] }));
  for (const variant of [{ ...call }, { ...call, description: 'resubmitted in a new transaction' }, { ...call, auths: [...call.auths].reverse() }]) {
    await assert.rejects(client.send(variant, { authorize: [A] }), (e: unknown) => e instanceof TobinError && e.kind === 'policy');
  }
  assert.equal(t.calls.length, 1);
});

test('EQ-20: freshly prepared authorization after a failure is permitted, and each round is single-use', async () => {
  const t = new Recording();
  const client = new TobinClient({ transport: t, clearing: CLEARING });
  const first = settleCall();
  const second = settleCall();
  assert.notEqual(first.authorizationId, second.authorizationId);
  t.replies.push({ ok: false, errorType: 'Contract', code: 102 }, { ok: true, value: null, eventCount: 1 });
  await assert.rejects(client.send(first, { authorize: [A] }));
  const ok = await client.send(second, { authorize: [A] });
  assert.equal(ok.receipt.fn, 'settle');
  assert.equal(t.calls.length, 2);
  // a settled round is used up as well
  await assert.rejects(client.send(second, { authorize: [A] }), (e: unknown) => e instanceof TobinError && e.kind === 'policy');
});

test('EQ-20: a thrown transport failure also uses the round up; zero-value settlement and non-settlement calls are unaffected', async () => {
  const flaky: Transport = { description: 'flaky', invoke: () => Promise.reject(new Error('connection reset')) };
  const c1 = new TobinClient({ transport: flaky, clearing: CLEARING });
  const call = settleCall();
  await assert.rejects(c1.send(call), /connection reset/);
  await assert.rejects(c1.send(call), (e: unknown) => e instanceof TobinError && e.kind === 'policy');

  const t = new Recording();
  const client = new TobinClient({ transport: t, clearing: CLEARING });
  const zero = prepareSettle(CLEARING, { sessionId: S, digest: DIGEST, instructions: [], token: TOKEN });
  assert.deepEqual(zero.auths, [], 'all-zero settlement still needs no debtor authorization');
  await client.send(zero);
  const fin = prepareFinalize(CLEARING, { sessionId: S, caller: A });
  assert.equal(fin.authorizationId, undefined, 'only settlement carries an authorization round');
  await client.send(fin);
  await client.send(fin);
  assert.equal(t.calls.length, 3);
});
