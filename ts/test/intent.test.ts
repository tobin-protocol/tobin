// The expected-intent builder (src/sdk/intent.ts): provenance of the settlement intent, the generic path for every supported call, the strict deployment
// record parser, and the checks that the committed Rust-side fixtures are exactly what this code generates. Pure unit tests: no bridge, no network.
// The approved digest in the provenance tests is computed with the library's own digest functions: that proves consistency and tamper detection; the
// correctness of those functions against the real contract is established separately (digest.test.ts, interop.test.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { EngineError, toHex } from '../src/amount.ts';
import { obligationCommitment, proposalDigest } from '../src/digest.ts';
import type { DigestContext } from '../src/digest.ts';
import {
  deploymentRecordJson,
  intentFromRequirements,
  intentJson,
  networkIdOf,
  parseDeploymentRecord,
  prepareApprove,
  prepareCreateSession,
  prepareFinalize,
  prepareJoin,
  prepareMint,
  preparePropose,
  prepareSettle,
  prepareSubmitObligation,
  settlementIntent,
} from '../src/sdk/index.ts';
import { TobinClient } from '../src/sdk/index.ts';
import type { DeploymentRecord, InvocationResult, PreparedCall, SettlementState, Transport } from '../src/sdk/index.ts';
import { addr, ob, oid } from './helpers.ts';
import { allCallsText, deployment, katIntentText } from './fixtures/generate-intents.ts';

const fixture = (p: string): string => readFileSync(new URL(`../../core/clearing/tests/fixtures/${p}`, import.meta.url), 'utf8');

const CLEARING = addr(200, 'contract');
const TOKEN = addr(201, 'contract');
const PASS = 'Standalone Network ; February 2017';
const DEP: DeploymentRecord = { version: 1, networkPassphrase: PASS, clearing: CLEARING, token: TOKEN };
const A = addr(11);
const B = addr(12);
const C = addr(13);
const S = '5e'.repeat(32);

const refuses = (f: () => unknown, re: RegExp): void => assert.throws(f, (e: unknown) => e instanceof EngineError && re.test(e.message));

/** the README example: A owes 30 net, B and C are owed 20 and 10; the plan pays B then C (the contract's ascending order) */
function state(over: Partial<SettlementState> = {}): SettlementState {
  return {
    sessionId: S,
    participants: [A, B, C],
    obligations: [ob(1, A, B, 100n), ob(2, B, C, 80n), ob(3, C, A, 70n)],
    revision: 1,
    instructions: [
      { payer: A, payee: B, amount: 20n },
      { payer: A, payee: C, amount: 10n },
    ],
    sessionToken: TOKEN,
    ...over,
  };
}
function digestOf(st: SettlementState, dep: DeploymentRecord = DEP): string {
  const ctx: DigestContext = { networkId: networkIdOf(dep.networkPassphrase), contract: dep.clearing, sessionId: st.sessionId, token: dep.token };
  return toHex(proposalDigest(ctx, obligationCommitment(ctx, st.participants, st.obligations), st.revision, st.instructions));
}

test('the committed Rust-side fixtures are exactly what this code generates', () => {
  assert.equal(fixture('deployment.TEST-ONLY.json'), deploymentRecordJson(deployment()));
  assert.equal(fixture('intents-all-calls-v1.json'), allCallsText());
});

// The known-answer intent is built from tests/fixtures/auth-vectors.json. A publication without that fixture (attribution review pending) skips this one assertion explicitly and visibly; with both files present it runs unchanged.
const KAT_PRESENT = ['auth-vectors.json', 'auth-intent-v1.json'].every((p) => existsSync(new URL(`../../core/clearing/tests/fixtures/${p}`, import.meta.url)));
test('the known-answer intent fixture is exactly what this code generates', { skip: KAT_PRESENT ? false : 'known-answer fixtures are not part of this publication (attribution review pending)' }, () => {
  assert.equal(fixture('auth-intent-v1.json'), katIntentText());
});

test('settlement intent: built from verified state, the debtor\'s tree is settle(session, digest, total) with the transfers in plan order', () => {
  const st = state();
  const d = digestOf(st);
  const it = settlementIntent(DEP, d, st);
  assert.equal(it.version, 1);
  assert.equal(it.network_passphrase, PASS);
  assert.equal(it.entries.length, 1, 'A is the only debtor');
  const e = it.entries[0]!;
  assert.equal(e.signer, A);
  assert.deepEqual([e.tree.contract, e.tree.fn], [CLEARING, 'settle']);
  assert.deepEqual(e.tree.args, [{ t: 'bytes32', v: S }, { t: 'bytes32', v: d }, { t: 'i128', v: '30' }]);
  assert.deepEqual(e.tree.subs.map((s) => [s.contract, s.fn, s.args]), [
    [TOKEN, 'transfer', [{ t: 'addr', v: A }, { t: 'addr', v: B }, { t: 'i128', v: '20' }]],
    [TOKEN, 'transfer', [{ t: 'addr', v: A }, { t: 'addr', v: C }, { t: 'i128', v: '10' }]],
  ]);
  // identical to what prepareSettle produces from the same verified plan
  assert.deepEqual(it.entries, intentFromRequirements(DEP, prepareSettle(CLEARING, { sessionId: S, digest: d, instructions: st.instructions, token: TOKEN }).auths).entries);
  // canonical text round trip is stable
  assert.equal(intentJson(it), intentJson(JSON.parse(intentJson(it))));
});

test('settlement intent: refuses data that does not recompute the digest the debtor approved', () => {
  const st = state();
  const d = digestOf(st);
  // a replaced / other-revision proposal, tampered obligations, an extra participant, another network, another clearing contract
  refuses(() => settlementIntent(DEP, d, state({ revision: 2 })), /recompute the approved digest/);
  refuses(() => settlementIntent(DEP, d, state({ obligations: [ob(9, A, B, 100n), ob(2, B, C, 80n), ob(3, C, A, 70n)] })), /recompute the approved digest/);
  refuses(() => settlementIntent(DEP, d, state({ participants: [A, B, C, addr(14)] })), /recompute the approved digest/);
  refuses(() => settlementIntent({ ...DEP, networkPassphrase: 'Test SDF Network ; September 2015' }, d, st), /recompute the approved digest/);
  refuses(() => settlementIntent({ ...DEP, clearing: addr(202, 'contract') }, d, st), /recompute the approved digest/);
  refuses(() => settlementIntent(DEP, d, state({ sessionId: '5f'.repeat(32) })), /recompute the approved digest/);
  // a different approved digest, and a malformed one
  refuses(() => settlementIntent(DEP, digestOf(state({ revision: 7 })), st), /recompute the approved digest/);
  refuses(() => settlementIntent(DEP, d.toUpperCase(), st), /lowercase hex/);
  refuses(() => settlementIntent(DEP, 'ab', st), /lowercase hex/);
});

test('settlement intent: refuses instructions that are not a valid plan, even if their digest is "approved"', () => {
  // A pays B 30 and nobody pays C: not the nets of the obligations. The digest of this bad plan is computed, so only the plan validation can refuse it.
  const bad = state({ instructions: [{ payer: A, payee: B, amount: 30n }] });
  refuses(() => settlementIntent(DEP, digestOf(bad), bad), /not a valid settlement plan/);
  const unordered = state({ instructions: [{ payer: A, payee: C, amount: 10n }, { payer: A, payee: B, amount: 20n }] });
  refuses(() => settlementIntent(DEP, digestOf(unordered), unordered), /not a valid settlement plan/);
  const selfPay = state({ instructions: [{ payer: A, payee: A, amount: 30n }] });
  refuses(() => settlementIntent(DEP, digestOf(selfPay), selfPay), /not a valid settlement plan/);
});

test('settlement intent: the pinned token and the all-zero case', () => {
  const st = state();
  refuses(() => settlementIntent(DEP, digestOf(st), state({ sessionToken: addr(202, 'contract') })), /session token differs from the pinned/);
  const zero = state({ obligations: [ob(1, A, B, 5n), ob(2, B, A, 5n)], participants: [A, B], instructions: [] });
  refuses(() => settlementIntent(DEP, digestOf(zero), zero), /all-zero settlement has no debtor authorization/);
});

test('generic intents: every supported signing call, built from the user\'s own request, with contracts inside the pinned record', () => {
  const dig = 'ab'.repeat(32);
  const plan = [{ payer: A, payee: B, amount: 100n }];
  const calls = [
    prepareCreateSession(CLEARING, { creator: A, sessionId: S, token: TOKEN, maxParticipants: 4, maxObligations: 16 }),
    prepareJoin(CLEARING, { sessionId: S, participant: B, creator: A }),
    prepareSubmitObligation(CLEARING, { sessionId: S, obligation: ob(1, A, B, 100n) }),
    prepareFinalize(CLEARING, { sessionId: S, caller: B }),
    preparePropose(CLEARING, { sessionId: S, proposer: A, instructions: plan }),
    prepareApprove(CLEARING, { sessionId: S, participant: B, digest: dig }),
    prepareSettle(CLEARING, { sessionId: S, digest: dig, instructions: plan, token: TOKEN }),
    prepareMint(TOKEN, { minter: addr(14), to: A, amount: 500n }),
  ];
  for (const c of calls) {
    const it = intentFromRequirements(DEP, c.auths);
    assert.equal(it.entries.length, c.auths.length, c.fn);
    assert.deepEqual(it.entries.map((e) => e.signer), c.auths.map((a) => a.signer), c.fn);
    assert.ok(it.entries.every((e) => e.tree.fn === c.fn), c.fn);
  }
  assert.equal(calls[1]!.auths.length, 2, 'a join needs the joiner and the creator');
  // a contract outside the record, a contract signer, and an empty call are refused
  refuses(() => intentFromRequirements({ ...DEP, token: addr(202, 'contract') }, calls[6]!.auths), /not in the pinned deployment record/);
  refuses(() => intentFromRequirements(DEP, [{ ...calls[0]!.auths[0]!, signer: CLEARING }]), /account/);
  refuses(() => intentFromRequirements(DEP, []), /no authorization/);
  refuses(() => intentFromRequirements(DEP, prepareSettle(CLEARING, { sessionId: S, digest: dig, instructions: [], token: TOKEN }).auths), /no authorization/);
});

test('deployment record: strict parser, canonical text, no unknown fields, no fallback', () => {
  const good = deploymentRecordJson(DEP);
  assert.deepEqual(parseDeploymentRecord(good), DEP);
  const mutate = (f: (o: Record<string, unknown>) => void): string => {
    const o = JSON.parse(good) as Record<string, unknown>;
    f(o);
    return JSON.stringify(o);
  };
  refuses(() => parseDeploymentRecord('not json'), /not valid JSON/);
  refuses(() => parseDeploymentRecord(mutate((o) => (o['version'] = 2))), /version/);
  refuses(() => parseDeploymentRecord(mutate((o) => (o['rpc_url'] = 'http://x'))), /unknown field/);
  refuses(() => parseDeploymentRecord(mutate((o) => delete o['token'])), /missing field/);
  refuses(() => parseDeploymentRecord(mutate((o) => (o['network_passphrase'] = ''))), /passphrase/);
  refuses(() => parseDeploymentRecord(mutate((o) => (o['network_passphrase'] = 'a\nb'))), /passphrase/);
  refuses(() => parseDeploymentRecord(mutate((o) => (o['clearing'] = A))), /contract/);
  refuses(() => parseDeploymentRecord(mutate((o) => (o['token'] = o['clearing']))), /different/);
  refuses(() => parseDeploymentRecord('[]'), /JSON object/);
  assert.equal(oid(1).length, 64);
});

class Replies implements Transport {
  readonly description = 'replies fake';
  calls: string[] = [];
  replies: InvocationResult[];
  constructor(replies: InvocationResult[]) {
    this.replies = replies;
  }
  invoke(call: PreparedCall): Promise<InvocationResult> {
    this.calls.push(call.fn);
    return Promise.resolve(this.replies.shift() ?? { ok: true, value: null });
  }
}

test('client.settlementIntent: reads state from the transport, accepts it only against the approved digest, uses no envelope', async () => {
  const st = state();
  const d = digestOf(st);
  const replies = (over: Partial<SettlementState> = {}, digest = d): InvocationResult[] => {
    const x = { ...st, ...over };
    return [
      { ok: true, value: { creator: A, token: x.sessionToken, max_participants: 4, max_obligations: 16, state: 3, participants: [...x.participants], obligation_commitment: 'ab'.repeat(32) } },
      { ok: true, value: { digest, instructions: x.instructions.map((i) => ({ payer: i.payer, payee: i.payee, amount: i.amount.toString() })), proposer: A, revision: x.revision } },
      { ok: true, value: x.obligations.map((o) => ({ id: o.id, debtor: o.debtor, creditor: o.creditor, amount: o.amount.toString() })) },
    ];
  };
  const t = new Replies(replies());
  const it = await new TobinClient({ transport: t, clearing: CLEARING }).settlementIntent(S, d, DEP);
  assert.deepEqual(t.calls, ['get_session', 'get_proposal', 'get_obligations'], 'only reads');
  assert.equal(it.entries[0]?.signer, A);
  // a lying transport: other instructions behind the same reported digest, another revision, another token
  const lie = [{ payer: A, payee: B, amount: 30n }];
  await assert.rejects(new TobinClient({ transport: new Replies(replies({ instructions: lie })), clearing: CLEARING }).settlementIntent(S, d, DEP), /not a valid settlement plan/);
  await assert.rejects(new TobinClient({ transport: new Replies(replies({ revision: 2 })), clearing: CLEARING }).settlementIntent(S, d, DEP), /recompute the approved digest/);
  await assert.rejects(new TobinClient({ transport: new Replies(replies({ sessionToken: addr(202, 'contract') })), clearing: CLEARING }).settlementIntent(S, d, DEP), /pinned/);
  // the client must be configured for the pinned clearing contract
  await assert.rejects(new TobinClient({ transport: new Replies(replies()), clearing: addr(202, 'contract') }).settlementIntent(S, d, DEP), /different clearing contract/);
});
