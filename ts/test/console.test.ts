// The Console controller driving the SDK against the REAL contracts in the local sandbox, and the HTML the renderer produces from the resulting
// model. This is how the Console\'s behaviour is tested without a browser. Nothing here touches a network or a wallet. Skipped (visibly) when
// the bridge is not built.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSandbox } from '../src/local/bridge.ts';
import type { Sandbox } from '../src/local/bridge.ts';
import { TobinClient } from '../src/sdk/index.ts';
import { ConsoleController, sessionIdFromLabel } from '../console/controller.ts';
import { renderApp } from '../console/view.ts';
import { BRIDGE_EXE, SKIP } from './bridge-env.ts';

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave'];

async function boot(): Promise<{ sb: Sandbox; c: ConsoleController }> {
  const sb = await startSandbox(BRIDGE_EXE as string, { actors: [...NAMES, 'Minter'], minter: 'Minter', cap: 1_000_000n });
  const second = String((await sb.bridge.request({ cmd: 'token', minter: sb.actors['Minter'], cap: '500000' }))['address']);
  const client = new TobinClient({ transport: sb.transport, clearing: sb.clearing, networkId: sb.networkId });
  const c = new ConsoleController(client, {
    personas: NAMES.map((name) => ({ name, address: sb.actors[name] as string })),
    tokens: [{ name: 'TTT-A', address: sb.token, cap: '1000000' }, { name: 'TTT-B', address: second, cap: '500000' }],
  });
  await c.refresh();
  return { sb, c };
}

/** Prepare, then confirm; returns whether the contract accepted. */
async function send(c: ConsoleController, prepare: () => unknown): Promise<boolean> {
  await prepare();
  return c.confirmPending();
}

const lastLog = (c: ConsoleController) => c.model.log[0] as { ok: boolean; message: string; title: string };

test('the whole Console flow on the real contract, with honest outcomes at every step (README example)', { skip: SKIP, timeout: 120000 }, async () => {
  const { sb, c } = await boot();
  try {
    assert.match(renderApp(c.model), /LOCAL SANDBOX/);
    // test tokens: only the minter authorizes
    assert.ok(await send(c, () => c.prepareMint({ to: 'Alice', token: 'TTT-A', amount: '100' })));
    assert.equal(c.model.balances[sb.token]?.['Alice'], '100');

    // create with a SELECTED token
    await c.selectSession('demo-1');
    assert.equal(c.model.sessionId, sessionIdFromLabel('demo-1'));
    assert.equal(c.model.status as unknown, null);
    assert.match(renderApp(c.model), /No session "demo-1" exists yet/);
    assert.ok(await send(c, () => c.prepareCreate({ creator: 'Alice', token: 'TTT-B', maxParticipants: 4, maxObligations: 16 })));
    assert.equal(c.model.status?.state, 'Open');
    assert.equal(c.model.status?.token, c.model.tokens[1]?.address, 'the chosen token is the session token');

    // joining requires BOTH authorizations: withhold the creator\'s and watch the real contract refuse
    c.prepareJoin({ participant: 'Bob' });
    const pend = await c.prepareJoin({ participant: 'Bob' });
    assert.deepEqual(pend.grants.map((g) => c.nameOf(g.signer)).sort(), ['Alice', 'Bob']);
    c.setGrant(c.model.personas[0]?.address as string, false);
    assert.equal(await c.confirmPending(), false);
    assert.equal(lastLog(c).ok, false);
    assert.match(lastLog(c).message, /REJECTED by the contract/);
    assert.equal(c.model.status?.participants.length, 1, 'nobody was admitted');
    assert.match(renderApp(c.model), /<li class="rejected">/);
    // now with both
    assert.ok(await send(c, () => c.prepareJoin({ participant: 'Bob' })));
    assert.ok(await send(c, () => c.prepareJoin({ participant: 'Carol' })));
    assert.equal(c.model.status?.participants.length, 3);

    // obligations: the debtor alone
    assert.ok(await send(c, () => c.prepareObligation({ debtor: 'Alice', creditor: 'Bob', amount: '100', key: 'a' })));
    assert.ok(await send(c, () => c.prepareObligation({ debtor: 'Bob', creditor: 'Carol', amount: '80', key: 'b' })));
    assert.ok(await send(c, () => c.prepareObligation({ debtor: 'Carol', creditor: 'Alice', amount: '70', key: 'c' })));
    assert.deepEqual(c.model.status?.nets.map((n) => n.net), [30n, -20n, -10n]);
    // a non-positive amount never reaches the contract
    assert.throws(() => c.prepareObligation({ debtor: 'Alice', creditor: 'Bob', amount: '0', key: 'z' }));
    assert.throws(() => c.prepareObligation({ debtor: 'Alice', creditor: 'Bob', amount: '1.5', key: 'z' }));

    assert.ok(await send(c, () => c.prepareFinalize({ caller: 'Carol' })));
    assert.equal(c.model.status?.state, 'Committed');
    assert.equal(c.model.digestCheck?.commitmentMatches, true);

    // default proposal: shown and checked locally, then submitted; the contract\'s digest equals the one predicted in this page
    await c.useDefaultProposal();
    assert.deepEqual(c.model.draftAdvice, { ok: true });
    const predicted = c.model.draftDigest;
    assert.ok(await send(c, () => c.prepareProposal({ proposer: 'Bob' })));
    assert.equal(c.model.status?.proposal?.digest, predicted);
    assert.deepEqual(c.model.digestCheck, { commitmentMatches: true, proposalMatches: true, bytesMatch: true });
    let html = renderApp(c.model);
    assert.match(html, /identical to the default plan/);
    assert.match(html, /Not settled\./);
    assert.doesNotMatch(html, /settled-note/);

    // approvals: all participants; settlement is refused before that
    assert.equal(await send(c, () => c.prepareSettlement()), false);
    assert.match(lastLog(c).message, /MissingApproval/);
    assert.ok(await send(c, () => c.prepareApproval({ participant: 'Alice' })));
    assert.ok(await send(c, () => c.prepareApproval({ participant: 'Bob' })));
    assert.deepEqual(c.model.status?.missingApprovals.map((a) => c.nameOf(a)), ['Carol']);
    assert.match(renderApp(c.model), /Missing approvals: Carol/);
    assert.ok(await send(c, () => c.prepareApproval({ participant: 'Carol' })));
    assert.equal(c.model.status?.state, 'Approved');
    assert.match(lastLog(c).message, /completed the set/);

    // settlement: the debtor (Alice) must authorize; withhold it and the contract refuses; nothing moves
    const settle = await c.prepareSettlement();
    assert.deepEqual(settle.grants.map((g) => c.nameOf(g.signer)), ['Alice']);
    c.setGrant(settle.grants[0]?.signer as string, false);
    assert.equal(await c.confirmPending(), false);
    assert.match(lastLog(c).message, /REJECTED by the contract/);
    assert.equal(c.model.status?.state, 'Approved');
    assert.equal(c.model.settledInSandbox, false);
    html = renderApp(c.model);
    assert.match(html, /Not settled\./);
    assert.doesNotMatch(html, /settled-note/);
    // all authorized, but Alice holds TTT-A and the session token is TTT-B: the token refuses, the whole call is reverted, nothing is settled
    assert.equal(await send(c, () => c.prepareSettlement()), false);
    assert.match(lastLog(c).message, /InsufficientBalance/);
    assert.equal(c.model.status?.state, 'Approved');
    assert.doesNotMatch(renderApp(c.model), /settled-note/);
    // fund the right token and retry
    assert.ok(await send(c, () => c.prepareMint({ to: 'Alice', token: 'TTT-B', amount: '100' })));
    assert.ok(await send(c, () => c.prepareSettlement()));
    assert.equal(c.model.status?.state, 'Settled');
    const tb = c.model.tokens[1]?.address as string;
    assert.deepEqual([c.model.balances[tb]?.['Alice'], c.model.balances[tb]?.['Bob'], c.model.balances[tb]?.['Carol']], ['70', '20', '10']);
    html = renderApp(c.model);
    assert.match(html, /in the local sandbox<\/em>\. This is not a network transaction\./);
  } finally {
    sb.close();
  }
});

test('Console: replacing a proposal invalidates the earlier approvals visibly; the new digest needs everyone again', { skip: SKIP, timeout: 120000 }, async () => {
  const { sb, c } = await boot();
  try {
    await c.selectSession('demo-2');
    assert.ok(await send(c, () => c.prepareCreate({ creator: 'Alice', token: 'TTT-A', maxParticipants: 4, maxObligations: 16 })));
    for (const p of ['Bob', 'Carol', 'Dave']) assert.ok(await send(c, () => c.prepareJoin({ participant: p })));
    assert.ok(await send(c, () => c.prepareObligation({ debtor: 'Alice', creditor: 'Carol', amount: '10', key: 'a' })));
    assert.ok(await send(c, () => c.prepareObligation({ debtor: 'Bob', creditor: 'Dave', amount: '10', key: 'b' })));
    assert.ok(await send(c, () => c.prepareFinalize({ caller: 'Dave' })));
    await c.useDefaultProposal();
    assert.ok(await send(c, () => c.prepareProposal({ proposer: 'Alice' })));
    const firstDigest = c.model.status?.proposal?.digest as string;
    assert.ok(await send(c, () => c.prepareApproval({ participant: 'Alice' })));
    assert.ok(await send(c, () => c.prepareApproval({ participant: 'Bob' })));

    // another valid plan: Alice pays Dave and Bob pays Carol
    const { parsePlan } = await import('../console/view.ts');
    c.setDraft(parsePlan('Alice -> Dave : 10\nBob -> Carol : 10', c.model.personas));
    assert.deepEqual(c.model.draftAdvice, { ok: true });
    const pending = c.prepareProposal({ proposer: 'Dave' });
    assert.equal(pending.willInvalidate, 2, 'the pending panel warns about the two approvals');
    assert.match(renderApp(c.model), /Sending this replacement will invalidate 2 existing approvals\./);
    assert.ok(await c.confirmPending());

    assert.equal(c.model.replacement?.invalidated, 2);
    assert.equal(c.model.replacement?.fromRevision, 1);
    assert.equal(c.model.replacement?.toRevision, 2);
    assert.equal(c.model.replacement?.fromDigest, firstDigest);
    assert.notEqual(c.model.status?.proposal?.digest, firstDigest);
    assert.equal(c.model.status?.approvals.filter((a) => a.approved).length, 0);
    assert.equal(c.model.status?.state, 'Committed');
    const html = renderApp(c.model);
    assert.match(html, /2 earlier approvals were invalidated/);
    assert.match(html, /differs from the default plan; any valid plan is acceptable to the contract/);
    // all four must approve the NEW digest; the last completes the set
    for (const p of ['Alice', 'Bob', 'Carol']) assert.ok(await send(c, () => c.prepareApproval({ participant: p })));
    assert.equal(c.model.status?.state, 'Committed', 'three of four is not enough');
    assert.ok(await send(c, () => c.prepareApproval({ participant: 'Dave' })));
    assert.equal(c.model.status?.state, 'Approved');
    // an invalid draft is flagged advisorily and, if sent anyway, rejected by the contract
    c.setDraft(parsePlan('Alice -> Dave : 9\nBob -> Carol : 10', c.model.personas));
    assert.equal(c.model.draftAdvice?.ok, false);
    assert.equal(await send(c, () => c.prepareProposal({ proposer: 'Alice' })), false);
    assert.match(lastLog(c).message, /FlowMismatch/);
    assert.equal(c.model.status?.state, 'Approved', 'a rejected replacement leaves everything as it was');
    assert.equal(c.model.status?.approvals.filter((a) => a.approved).length, 4);
  } finally {
    sb.close();
  }
});

test('Console: an all-zero session is handled without fabricating transfer activity', { skip: SKIP, timeout: 120000 }, async () => {
  const { sb, c } = await boot();
  try {
    await c.selectSession('zero');
    assert.ok(await send(c, () => c.prepareCreate({ creator: 'Alice', token: 'TTT-A', maxParticipants: 4, maxObligations: 16 })));
    assert.ok(await send(c, () => c.prepareJoin({ participant: 'Bob' })));
    assert.ok(await send(c, () => c.prepareObligation({ debtor: 'Alice', creditor: 'Bob', amount: '5', key: 'a' })));
    assert.ok(await send(c, () => c.prepareObligation({ debtor: 'Bob', creditor: 'Alice', amount: '5', key: 'b' })));
    assert.ok(await send(c, () => c.prepareFinalize({ caller: 'Bob' })));
    assert.equal(c.model.status?.allZero, true);
    await c.useDefaultProposal();
    assert.deepEqual(c.model.draft, []);
    assert.ok(await send(c, () => c.prepareProposal({ proposer: 'Alice' })));
    let html = renderApp(c.model);
    assert.match(html, /Nothing to transfer: every net position is zero/);
    assert.doesNotMatch(html, /Debtor that must authorize/);
    assert.equal(await send(c, () => c.prepareSettlement()), false, 'approvals are still required');
    assert.ok(await send(c, () => c.prepareApproval({ participant: 'Alice' })));
    assert.ok(await send(c, () => c.prepareApproval({ participant: 'Bob' })));
    const p = await c.prepareSettlement();
    assert.deepEqual(p.grants, [], 'no debtor, so nothing to authorize');
    assert.ok(await c.confirmPending());
    html = renderApp(c.model);
    assert.match(html, /No transfer was made and zero value moved\./);
    assert.doesNotMatch(html, /transfers? moved/);
    assert.equal(c.model.balances[sb.token]?.['Alice'], '0');
  } finally {
    sb.close();
  }
});

test('Console: a stalled session says so, and shows who is missing', { skip: SKIP, timeout: 120000 }, async () => {
  const { sb, c } = await boot();
  try {
    await c.selectSession('stall');
    assert.ok(await send(c, () => c.prepareCreate({ creator: 'Alice', token: 'TTT-A', maxParticipants: 4, maxObligations: 16 })));
    assert.ok(await send(c, () => c.prepareJoin({ participant: 'Bob' })));
    assert.ok(await send(c, () => c.prepareObligation({ debtor: 'Alice', creditor: 'Bob', amount: '5', key: 'a' })));
    assert.ok(await send(c, () => c.prepareFinalize({ caller: 'Alice' })));
    await c.useDefaultProposal();
    assert.ok(await send(c, () => c.prepareProposal({ proposer: 'Alice' })));
    assert.ok(await send(c, () => c.prepareApproval({ participant: 'Alice' })));
    const html = renderApp(c.model);
    assert.match(html, /does not complete by itself/);
    assert.match(html, /Missing approvals: Bob/);
    assert.match(html, /Not settled\./);
    assert.doesNotMatch(html, /automatically (complete|settle)|will (eventually )?complete/i);
  } finally {
    sb.close();
  }
});

test('Console: A then B then A shows each revision, and old approvals never appear valid', { skip: SKIP, timeout: 120000 }, async () => {
  const { sb, c } = await boot();
  try {
    await c.selectSession('aba');
    assert.ok(await send(c, () => c.prepareCreate({ creator: 'Alice', token: 'TTT-A', maxParticipants: 4, maxObligations: 16 })));
    for (const p of ['Bob', 'Carol', 'Dave']) assert.ok(await send(c, () => c.prepareJoin({ participant: p })));
    assert.ok(await send(c, () => c.prepareObligation({ debtor: 'Alice', creditor: 'Carol', amount: '10', key: 'a' })));
    assert.ok(await send(c, () => c.prepareObligation({ debtor: 'Bob', creditor: 'Dave', amount: '10', key: 'b' })));
    assert.ok(await send(c, () => c.prepareFinalize({ caller: 'Dave' })));
    const { parsePlan } = await import('../console/view.ts');
    const A = 'Alice -> Carol : 10\nBob -> Dave : 10';
    const B = 'Alice -> Dave : 10\nBob -> Carol : 10';
    const propose = async (text: string, who: string): Promise<void> => {
      c.setDraft(parsePlan(text, c.model.personas));
      assert.match(renderApp(c.model), /Digest it would have as revision \d+/);
      assert.ok(await send(c, () => c.prepareProposal({ proposer: who })));
    };
    await propose(A, 'Alice');
    const d1 = c.model.status?.proposal?.digest as string;
    assert.ok(await send(c, () => c.prepareApproval({ participant: 'Alice' })));
    assert.ok(await send(c, () => c.prepareApproval({ participant: 'Bob' })));
    await propose(B, 'Dave');
    assert.equal(c.model.status?.proposal?.revision, 2);
    await propose(A, 'Carol');
    assert.equal(c.model.status?.proposal?.revision, 3);
    assert.notEqual(c.model.status?.proposal?.digest, d1, 'plan A again has a new digest');
    const html = renderApp(c.model);
    assert.match(html, /Approvals of the current proposal \(revision 3, digest /);
    assert.match(html, /Current proposal: revision 3/);
    assert.deepEqual(c.model.status?.approvals.filter((a) => a.approved), [], 'nobody is shown as approved at revision 3');
    assert.match(html, /Missing approvals: Alice, Bob, Carol, Dave/);
    assert.equal(c.model.replacement?.fromRevision, 2);
    assert.equal(c.model.replacement?.toRevision, 3);
  } finally {
    sb.close();
  }
});

test('EQ-20 Console: a failed settlement discards its authorization; the retry needs a fresh preparation and fresh grants', { skip: SKIP, timeout: 120000 }, async () => {
  const { sb, c } = await boot();
  try {
    await c.selectSession('eq20');
    assert.ok(await send(c, () => c.prepareMint({ to: 'Alice', token: 'TTT-A', amount: '5' })));
    assert.ok(await send(c, () => c.prepareCreate({ creator: 'Alice', token: 'TTT-A', maxParticipants: 4, maxObligations: 16 })));
    assert.ok(await send(c, () => c.prepareJoin({ participant: 'Bob' })));
    assert.ok(await send(c, () => c.prepareObligation({ debtor: 'Alice', creditor: 'Bob', amount: '10', key: 'o1' })));
    assert.ok(await send(c, () => c.prepareFinalize({ caller: 'Bob' })));
    await c.useDefaultProposal();
    assert.ok(await send(c, () => c.prepareProposal({ proposer: 'Alice' })));
    assert.ok(await send(c, () => c.prepareApproval({ participant: 'Alice' })));
    assert.ok(await send(c, () => c.prepareApproval({ participant: 'Bob' })));
    // Alice holds 5 but owes 10: the token refuses, the whole call reverts
    const failed = await c.prepareSettlement();
    const oldCall = failed.call;
    assert.equal(await c.confirmPending(), false);
    assert.match(lastLog(c).message, /InsufficientBalance/);
    assert.match(lastLog(c).message, /Re-authorization is required/);
    assert.equal(c.model.pending, null, 'the failed attempt\'s authorization is gone');
    assert.equal(await c.confirmPending(), false, 'there is nothing left to confirm');
    // even holding on to the old prepared call and re-sending it (a retry with the same authorization) is refused by the SDK, before any call
    await assert.rejects(c.client.send(oldCall, { authorize: [oldCall.auths[0]?.signer as string] }), (e: unknown) => (e as { kind?: string }).kind === 'policy');
    assert.equal(c.model.status?.state, 'Approved', 'nothing moved');
    // fund Alice, then a freshly prepared settlement with freshly granted authorization succeeds
    assert.ok(await send(c, () => c.prepareMint({ to: 'Alice', token: 'TTT-A', amount: '5' })));
    const fresh = await c.prepareSettlement();
    assert.notEqual(fresh.call.authorizationId, oldCall.authorizationId);
    assert.ok(await c.confirmPending());
    assert.equal(c.model.status?.state, 'Settled');
  } finally {
    sb.close();
  }
});
