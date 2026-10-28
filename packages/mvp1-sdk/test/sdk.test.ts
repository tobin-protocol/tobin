// The SDK against the REAL contracts (local sandbox: Soroban test host through the development bridge). Authorization requirements stated by the
// SDK are applied as simulated, unsigned grants and ENFORCED by the real contract, so a requirement that is missing, wrong, or unnecessary shows
// up here. Nothing in this file touches a wallet, a transaction or a network. Skipped (visibly) when the bridge is not built.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSandbox } from '../src/local/bridge.ts';
import type { Sandbox } from '../src/local/bridge.ts';
import { TobinClient, TobinError } from '../src/sdk/index.ts';
import type { PreparedCall } from '../src/sdk/index.ts';
import { defaultProposal } from '../src/engine/index.ts';
import { BRIDGE_EXE, SKIP } from './bridge-env.ts';
import { oid } from './helpers.ts';

interface Env {
  sb: Sandbox;
  client: TobinClient;
  a: string;
  b: string;
  c: string;
  d: string;
  minter: string;
  x: string; // an outsider, never admitted
}

async function setup(): Promise<Env> {
  const sb = await startSandbox(BRIDGE_EXE as string, { actors: ['a', 'b', 'c', 'd', 'x', 'minter'], minter: 'minter', cap: 1_000_000n });
  const client = new TobinClient({ transport: sb.transport, clearing: sb.clearing, networkId: sb.networkId });
  const g = (n: string): string => sb.actors[n] as string;
  return { sb, client, a: g('a'), b: g('b'), c: g('c'), d: g('d'), x: g('x'), minter: g('minter') };
}

const sidOf = (n: number): string => n.toString(16).padStart(2, '0').repeat(32);

async function expectError(p: Promise<unknown>, kind: string, name?: string): Promise<TobinError> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof TobinError, `expected a TobinError, got ${String(e)}`);
    assert.equal(e.kind, kind, e.message);
    if (name) assert.equal(e.errorName, name, e.message);
    return e;
  }
  assert.fail('the call was accepted but should have been rejected');
}

/** Every strict subset of the signers (each with ONE required signer withheld) must be rejected by the contract; the full set must pass. */
async function necessaryAndSufficient(env: Env, call: PreparedCall): Promise<void> {
  const signers = [...new Set(call.auths.map((a) => a.signer))];
  for (const without of signers) {
    const r = await env.sb.transport.invoke(call, { authorize: signers.filter((s) => s !== without) });
    assert.equal(r.ok, false, `${call.fn} was accepted without the authorization of ${without}`);
    assert.equal(r.ok === false && r.errorType, 'Auth', `${call.fn} without ${without} should fail as an authorization error`);
  }
}

test('the whole lifecycle through the SDK on the real contract: README example', { skip: SKIP, timeout: 120000 }, async () => {
  const e = await setup();
  try {
    const { client, a, b, c } = e;
    const s = sidOf(1);
    await client.mint(e.sb.token, { minter: e.minter, to: a, amount: 100n });

    // create: the creator authorizes; join: the joiner AND the creator
    const create = client.prepareCreateSession({ creator: a, sessionId: s, token: e.sb.token, maxParticipants: 4, maxObligations: 16 });
    await necessaryAndSufficient(e, create);
    const receipt = await client.createSession({ creator: a, sessionId: s, token: e.sb.token, maxParticipants: 4, maxObligations: 16 });
    assert.match(receipt.ranOn, /LOCAL SANDBOX/);
    for (const p of [b, c]) {
      const join = await client.prepareJoin({ sessionId: s, participant: p });
      assert.deepEqual(join.auths.map((x) => x.signer).sort(), [a, p].sort(), 'joiner and creator');
      await necessaryAndSufficient(e, join);
      await client.joinSession({ sessionId: s, participant: p });
    }
    // obligations: the debtor alone authorizes
    const obs = [
      { id: oid(1), debtor: a, creditor: b, amount: 100n },
      { id: oid(2), debtor: b, creditor: c, amount: 80n },
      { id: oid(3), debtor: c, creditor: a, amount: 70n },
    ];
    for (const o of obs) {
      const call = client.prepareSubmitObligation({ sessionId: s, obligation: o });
      assert.deepEqual(call.auths.map((x) => x.signer), [o.debtor]);
      await necessaryAndSufficient(e, call);
      await client.submitObligation({ sessionId: s, obligation: o });
    }
    let st = await client.getSessionStatus(s);
    assert.equal(st.state, 'Open');
    assert.deepEqual(st.nets.map((n) => n.net), [30n, -20n, -10n]);

    // finalize by any admitted participant (here the one with the smallest role: C)
    await necessaryAndSufficient(e, client.prepareFinalize({ sessionId: s, caller: c }));
    const { commitment } = await client.finalizeObligations({ sessionId: s, caller: c });
    assert.equal(commitment.length, 64);
    st = await client.getSessionStatus(s);
    assert.equal(st.state, 'Committed');
    assert.equal(st.proposal, null);
    assert.deepEqual(st.advice.defaultProposal, [
      { payer: a, payee: b, amount: 20n },
      { payer: a, payee: c, amount: 10n },
    ]);

    // propose the default plan; the digest is verified independently BEFORE anyone approves
    const plan = await client.generateDefaultProposal(s);
    const v = await client.validateProposal(s, plan);
    assert.deepEqual(v, { ok: true });
    await necessaryAndSufficient(e, client.preparePropose({ sessionId: s, proposer: b, instructions: plan }));
    const { digest } = await client.proposeSettlement({ sessionId: s, proposer: b, instructions: plan });
    assert.equal(digest, client.expectedProposalDigest(s, e.sb.token, commitment, 1, plan));
    assert.deepEqual(await client.verifyDigests(s), { commitmentMatches: true, proposalMatches: true, bytesMatch: true });

    // every admitted participant must approve; settlement is refused until then
    await expectError(client.settle({ sessionId: s }), 'contract', 'MissingApproval');
    await necessaryAndSufficient(e, client.prepareApprove({ sessionId: s, participant: a, digest }));
    assert.equal((await client.approveSettlement({ sessionId: s, participant: a, digest })).completed, false);
    assert.equal((await client.approveSettlement({ sessionId: s, participant: b, digest })).completed, false);
    st = await client.getSessionStatus(s);
    assert.deepEqual(st.missingApprovals, [c]);
    await expectError(client.settle({ sessionId: s }), 'contract', 'MissingApproval');
    assert.equal((await client.approveSettlement({ sessionId: s, participant: c, digest })).completed, true);
    st = await client.getSessionStatus(s);
    assert.equal(st.state, 'Approved');
    assert.deepEqual(st.missingApprovals, []);
    assert.deepEqual(st.debtorAuthorizations.map((d) => [d.debtor, d.total]), [[a, 30n]]);

    // settlement: any caller; the debtor must authorize its own transfers; approvals do not replace that
    const settleCall = await client.prepareSettle(s);
    assert.deepEqual(settleCall.auths.map((x) => x.signer), [a]);
    await necessaryAndSufficient(e, settleCall);
    await expectError(client.settle({ sessionId: s }, { authorize: [] }), 'auth');
    assert.deepEqual([await client.tokenBalance(e.sb.token, a), await client.tokenBalance(e.sb.token, b), await client.tokenBalance(e.sb.token, c)], [100n, 0n, 0n]);
    const done = await client.settle({ sessionId: s });
    assert.match(done.ranOn, /no network/);
    assert.deepEqual([await client.tokenBalance(e.sb.token, a), await client.tokenBalance(e.sb.token, b), await client.tokenBalance(e.sb.token, c)], [70n, 20n, 10n]);
    st = await client.getSessionStatus(s);
    assert.equal(st.state, 'Settled');
    assert.deepEqual(st.settlement && [st.settlement.totalMoved, st.settlement.instructionCount], [30n, 2]);
    await expectError(client.settle({ sessionId: s }), 'contract', 'AlreadySettled');
  } finally {
    e.sb.close();
  }
});

test('a replacement invalidates every earlier approval, and the participants must approve the new digest', { skip: SKIP, timeout: 120000 }, async () => {
  const e = await setup();
  try {
    const { client, a, b, c, d } = e;
    const s = sidOf(2);
    await client.createSession({ creator: a, sessionId: s, token: e.sb.token, maxParticipants: 4, maxObligations: 16 });
    for (const p of [b, c, d]) await client.joinSession({ sessionId: s, participant: p });
    await client.submitObligation({ sessionId: s, obligation: { id: oid(1), debtor: a, creditor: c, amount: 10n } });
    await client.submitObligation({ sessionId: s, obligation: { id: oid(2), debtor: b, creditor: d, amount: 10n } });
    await client.finalizeObligations({ sessionId: s, caller: d });
    const p1 = defaultProposal([a, b, c, d], await client.getObligations(s));
    const p2 = [
      { payer: a, payee: d, amount: 10n },
      { payer: b, payee: c, amount: 10n },
    ].sort((x, y) => (x.payer < y.payer ? -1 : 1));
    // sort exactly as the contract does
    const { sortInstructions } = await import('../src/engine/index.ts');
    const plan2 = sortInstructions(p2);
    assert.deepEqual(await client.validateProposal(s, plan2), { ok: true });
    const first = await client.proposeSettlement({ sessionId: s, proposer: a, instructions: p1 });
    await client.approveSettlement({ sessionId: s, participant: a, digest: first.digest });
    await client.approveSettlement({ sessionId: s, participant: b, digest: first.digest });
    assert.equal((await client.getSessionStatus(s)).approvals.filter((x) => x.approved).length, 2);

    // any admitted participant (the finalizer, D, a creditor) replaces it
    const second = await client.proposeSettlement({ sessionId: s, proposer: d, instructions: plan2 });
    assert.notEqual(second.digest, first.digest);
    assert.equal(second.approvalsInvalidated, 2, 'the SDK reports how many approvals the replacement invalidated');
    assert.equal(second.replacedDigest, first.digest);
    const st = await client.getSessionStatus(s);
    assert.equal(st.state, 'Committed');
    assert.deepEqual(st.approvals.filter((x) => x.approved), [], 'no approval counts toward the new proposal');
    assert.equal(st.proposal?.revision, 2);
    assert.equal((await client.getApprovals(s)).length, 0, 'the contract itself dropped them');
    // the old digest never counts again, and the replaced proposal cannot be settled
    await expectError(client.approveSettlement({ sessionId: s, participant: c, digest: first.digest }), 'contract', 'DigestMismatch');
    await expectError(client.settle({ sessionId: s, digest: first.digest }), 'contract', 'MissingApproval');

    // complete the approvals for the new digest; then replace once more from APPROVED: back to COMMITTED
    for (const p of [a, b, c, d]) await client.approveSettlement({ sessionId: s, participant: p, digest: second.digest });
    assert.equal((await client.getSessionStatus(s)).state, 'Approved');
    const third = await client.proposeSettlement({ sessionId: s, proposer: a, instructions: p1 });
    assert.equal(third.approvalsInvalidated, 4);
    assert.equal((await client.getSessionStatus(s)).state, 'Committed');
    // an identical resubmission is accepted as a NEW revision with a NEW digest (EQ-05: stale signatures of the old revision are dead)
    const again = await client.proposeSettlement({ sessionId: s, proposer: b, instructions: p1 });
    assert.notEqual(again.digest, third.digest);
    assert.equal((await client.getProposal(s))?.revision, 4);
    // an invalid plan is rejected by the contract whatever the engine says
    await expectError(client.proposeSettlement({ sessionId: s, proposer: b, instructions: p1.slice(0, 1) }), 'contract', 'FlowMismatch');
    assert.equal((await client.getProposal(s))?.revision, 4, 'a rejected plan does not advance the revision');
  } finally {
    e.sb.close();
  }
});

test('every debtor must authorize its own transfers; a relayer with no role cannot move anything; failures revert', { skip: SKIP, timeout: 120000 }, async () => {
  const e = await setup();
  try {
    const { client, a, b, c, d } = e;
    const s = sidOf(3);
    await client.mint(e.sb.token, { minter: e.minter, to: a, amount: 10n });
    await client.mint(e.sb.token, { minter: e.minter, to: b, amount: 5n }); // B cannot cover its 10
    await client.createSession({ creator: a, sessionId: s, token: e.sb.token, maxParticipants: 4, maxObligations: 16 });
    for (const p of [b, c, d]) await client.joinSession({ sessionId: s, participant: p });
    await client.submitObligation({ sessionId: s, obligation: { id: oid(1), debtor: a, creditor: c, amount: 10n } });
    await client.submitObligation({ sessionId: s, obligation: { id: oid(2), debtor: b, creditor: d, amount: 10n } });
    await client.finalizeObligations({ sessionId: s, caller: a });
    const plan = await client.generateDefaultProposal(s);
    const { digest } = await client.proposeSettlement({ sessionId: s, proposer: a, instructions: plan });
    for (const p of [a, b, c, d]) await client.approveSettlement({ sessionId: s, participant: p, digest });

    const call = await client.prepareSettle(s);
    assert.deepEqual(call.auths.map((x) => x.signer).sort(), [a, b].sort(), 'exactly the two debtors, nobody else');
    await necessaryAndSufficient(e, call);
    // the creditors, the creator, the approvers and an outsider authorizing instead of the debtors do not help
    for (const only of [[c], [d], [e.x], [a], [b], [c, d, e.x]]) await expectError(client.settle({ sessionId: s }, { authorize: only }), 'auth');
    // all authorized, but B lacks funds: the token\'s own error passes through, and A\'s earlier transfer is reverted
    const err = await expectError(client.settle({ sessionId: s }), 'token', 'InsufficientBalance');
    assert.equal(err.code, 102);
    assert.deepEqual([await client.tokenBalance(e.sb.token, a), await client.tokenBalance(e.sb.token, b), await client.tokenBalance(e.sb.token, c)], [10n, 5n, 0n]);
    assert.equal((await client.getSessionStatus(s)).state, 'Approved');
    // fund B and retry: exactly one success
    await client.mint(e.sb.token, { minter: e.minter, to: b, amount: 5n });
    await client.settle({ sessionId: s });
    assert.deepEqual([await client.tokenBalance(e.sb.token, c), await client.tokenBalance(e.sb.token, d)], [10n, 10n]);
    assert.equal((await client.getSessionStatus(s)).state, 'Settled');
  } finally {
    e.sb.close();
  }
});

test('all-zero nets: the empty proposal, no debtor authorization, no token movement, SETTLED once', { skip: SKIP, timeout: 120000 }, async () => {
  const e = await setup();
  try {
    const { client, a, b } = e;
    const s = sidOf(4);
    await client.createSession({ creator: a, sessionId: s, token: e.sb.token, maxParticipants: 4, maxObligations: 16 });
    await client.joinSession({ sessionId: s, participant: b });
    await client.submitObligation({ sessionId: s, obligation: { id: oid(1), debtor: a, creditor: b, amount: 5n } });
    await client.submitObligation({ sessionId: s, obligation: { id: oid(2), debtor: b, creditor: a, amount: 5n } });
    await client.finalizeObligations({ sessionId: s, caller: b });
    let st = await client.getSessionStatus(s);
    assert.equal(st.allZero, true);
    assert.deepEqual(st.advice.defaultProposal, []);
    // a transfer would introduce value
    await expectError(client.proposeSettlement({ sessionId: s, proposer: a, instructions: [{ payer: a, payee: b, amount: 1n }] }), 'contract', 'FlowMismatch');
    const { digest } = await client.proposeSettlement({ sessionId: s, proposer: a, instructions: [] });
    st = await client.getSessionStatus(s);
    assert.deepEqual(st.proposal?.instructions, []);
    assert.deepEqual(st.debtorAuthorizations, []);
    // approvals are still required of everyone
    await expectError(client.settle({ sessionId: s }), 'contract', 'MissingApproval');
    await client.approveSettlement({ sessionId: s, participant: a, digest });
    assert.equal((await client.approveSettlement({ sessionId: s, participant: b, digest })).completed, true);
    const call = await client.prepareSettle(s);
    assert.deepEqual(call.auths, [], 'no debtor, so nothing to authorize');
    assert.match(call.description, /all zero/);
    await client.settle({ sessionId: s }, { authorize: [] });
    st = await client.getSessionStatus(s);
    assert.equal(st.state, 'Settled');
    assert.deepEqual(st.settlement && [st.settlement.totalMoved, st.settlement.instructionCount], [0n, 0]);
    assert.equal(await client.tokenBalance(e.sb.token, a), 0n);
    await expectError(client.settle({ sessionId: s }), 'contract', 'AlreadySettled');
  } finally {
    e.sb.close();
  }
});

test('typed errors: stable contract names, authorization failures are host errors, token failures keep the token\'s names', { skip: SKIP, timeout: 120000 }, async () => {
  const e = await setup();
  try {
    const { client, a, b } = e;
    const s = sidOf(5);
    await expectError(client.getSession(s), 'contract', 'SessionNotFound');
    await client.createSession({ creator: a, sessionId: s, token: e.sb.token, maxParticipants: 2, maxObligations: 1 });
    await expectError(client.createSession({ creator: b, sessionId: s, token: e.sb.token, maxParticipants: 2, maxObligations: 1 }), 'contract', 'SessionExists');
    await expectError(client.createSession({ creator: b, sessionId: sidOf(6), token: e.sb.token, maxParticipants: 9, maxObligations: 1 }), 'contract', 'BadCapacity');
    await expectError(client.joinSession({ sessionId: s, participant: a }), 'contract', 'ParticipantExists');
    await expectError(client.joinSession({ sessionId: s, participant: b }, { authorize: [b] }), 'auth', 'InvalidAction');
    await expectError(client.joinSession({ sessionId: s, participant: b }, { authorize: [a] }), 'auth', 'InvalidAction');
    await expectError(client.submitObligation({ sessionId: s, obligation: { id: oid(1), debtor: a, creditor: e.x, amount: 1n } }), 'contract', 'UnknownParty');
    await expectError(client.mint(e.sb.token, { minter: e.minter, to: a, amount: 2_000_000n }), 'token', 'CapExceeded');
    await expectError(client.mint(e.sb.token, { minter: a, to: a, amount: 1n }), 'auth');
    assert.equal(await client.tokenBalance(e.sb.token, a), 0n);
  } finally {
    e.sb.close();
  }
});

test('EQ-05: A then B then A again: an approval for revision 1 never counts at revision 3; a fresh one does', { skip: SKIP, timeout: 120000 }, async () => {
  const e = await setup();
  try {
    const { client, a, b, c, d } = e;
    const s = sidOf(6);
    await client.createSession({ creator: a, sessionId: s, token: e.sb.token, maxParticipants: 4, maxObligations: 16 });
    for (const p of [b, c, d]) await client.joinSession({ sessionId: s, participant: p });
    await client.submitObligation({ sessionId: s, obligation: { id: oid(1), debtor: a, creditor: c, amount: 10n } });
    await client.submitObligation({ sessionId: s, obligation: { id: oid(2), debtor: b, creditor: d, amount: 10n } });
    const { commitment } = await client.finalizeObligations({ sessionId: s, caller: a });
    const { sortInstructions } = await import('../src/engine/index.ts');
    const planA = defaultProposal([a, b, c, d], await client.getObligations(s));
    const planB = sortInstructions([{ payer: a, payee: d, amount: 10n }, { payer: b, payee: c, amount: 10n }]);

    // the digest each revision will have is predicted in TypeScript BEFORE sending, and the contract agrees
    const p1 = await client.expectedNextProposalDigest(s, planA);
    const r1 = await client.proposeSettlement({ sessionId: s, proposer: a, instructions: planA });
    assert.deepEqual([p1.revision, r1.digest], [1, p1.digest]);
    // Alice signs an approval of revision 1 and keeps it: this is the authorization tree approve(session, Alice, digest-1)
    const staleApproval = client.prepareApprove({ sessionId: s, participant: a, digest: r1.digest });
    const r2 = await client.proposeSettlement({ sessionId: s, proposer: b, instructions: planB });
    const p3 = await client.expectedNextProposalDigest(s, planA);
    const r3 = await client.proposeSettlement({ sessionId: s, proposer: c, instructions: planA });
    assert.equal(p3.revision, 3);
    assert.equal(r3.digest, p3.digest);
    assert.equal(new Set([r1.digest, r2.digest, r3.digest]).size, 3, 'identical instructions at revisions 1 and 3 have different digests');
    assert.equal((await client.getProposal(s))?.revision, 3);
    assert.deepEqual(await client.verifyDigests(s), { commitmentMatches: true, proposalMatches: true, bytesMatch: true });
    assert.equal(commitment.length, 64);

    // the stale approval is refused, stores nothing and cannot move the session
    const out = await e.sb.transport.invoke(staleApproval);
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.errorType === 'Contract' && out.code, 40, 'DigestMismatch');
    assert.equal((await client.getApprovals(s)).length, 0);
    const st = await client.getSessionStatus(s);
    assert.deepEqual([st.state, st.missingApprovals.length], ['Committed', 4]);
    await expectError(client.settle({ sessionId: s }), 'contract', 'MissingApproval');
    // a fresh approval of revision 3 is accepted; the others complete the set
    for (const p of [a, b, c]) assert.equal((await client.approveSettlement({ sessionId: s, participant: p, digest: r3.digest })).completed, false);
    assert.equal((await client.approveSettlement({ sessionId: s, participant: d, digest: r3.digest })).completed, true);
    assert.equal((await client.getSessionStatus(s)).state, 'Approved');
  } finally {
    e.sb.close();
  }
});
