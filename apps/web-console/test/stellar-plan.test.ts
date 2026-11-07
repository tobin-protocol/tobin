// The settlement adapter (ExecutionPlan) and the on-chain comparison engine. Pure: no network, no wallet, no signing. Accounts and contract ids are synthetic
// valid strkeys made for these tests; nothing here is on any network, and the "observed chain" objects are hand-built MOCKS (labelled), not chain reads.
import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAddress } from 'tobin-mvp1-sdk/strkey';
import { DEPLOYED_CEILINGS, PlanError, buildExecutionPlan, onChainSessionId } from '../lib/stellar/execution-plan.ts';
import type { ExecutionPlan, PlanInput } from '../lib/stellar/execution-plan.ts';
import { compareWithPlan } from '../lib/stellar/compare.ts';
import type { ObservedChain } from '../lib/stellar/compare.ts';

const acct = (n: number) => encodeAddress('account', new Uint8Array(32).fill(n));
const CLEARING = encodeAddress('contract', new Uint8Array(32).fill(200)), TOKEN = encodeAddress('contract', new Uint8Array(32).fill(201));
const ASSET = `testnet:contract:${TOKEN}`;
const OB = (n: number) => String(n).padStart(2, '0').repeat(32);
// ring: ann owes bob 100, bob owes cat 80, cat owes ann 70 => ann +30, bob -20, cat -10; plan: ann pays bob 20 and cat 10
function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    network: 'testnet', clearing: CLEARING, assetId: ASSET, batchId: 'bat_1', initiator: 'usr_ann',
    accounts: { usr_ann: acct(1), usr_bob: acct(2), usr_cat: acct(3) },
    positions: [{ userId: 'usr_ann', net: '30' }, { userId: 'usr_bob', net: '-20' }, { userId: 'usr_cat', net: '-10' }],
    obligations: [{ id: OB(1), debtor: 'usr_ann', creditor: 'usr_bob', amount: '100' }, { id: OB(2), debtor: 'usr_bob', creditor: 'usr_cat', amount: '80' }, { id: OB(3), debtor: 'usr_cat', creditor: 'usr_ann', amount: '70' }],
    instructions: [{ payer: 'usr_ann', payee: 'usr_bob', amount: '20' }, { payer: 'usr_ann', payee: 'usr_cat', amount: '10' }],
    ...over,
  };
}
const refuses = (i: PlanInput, re: RegExp) => assert.throws(() => buildExecutionPlan(i), (e: Error) => e instanceof PlanError && re.test(e.message), String(re));

test('plan: the deployed lifecycle in order, one on-chain obligation per application obligation', () => {
  const p = buildExecutionPlan(input());
  assert.deepEqual(p.steps.map((s) => s.fn), ['create_session', 'join_session', 'join_session', 'submit_obligation', 'submit_obligation', 'submit_obligation', 'finalize_obligations', 'propose_settlement', 'approve_settlement', 'approve_settlement', 'approve_settlement', 'settle']);
  assert.deepEqual(p.steps.map((s) => s.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(p.token, TOKEN); assert.equal(p.network, 'testnet'); assert.equal(p.networkPassphrase, 'Test SDF Network ; September 2015');
  assert.equal(p.participants[0], acct(1), 'the creator (initiator) is first'); assert.deepEqual(p.participants.slice(1), [acct(2), acct(3)].sort());
  assert.deepEqual(p.obligations.map((o) => [o.id, o.debtor, o.creditor, o.amount]), [[OB(1), acct(1), acct(2), 100n], [OB(2), acct(2), acct(3), 80n], [OB(3), acct(3), acct(1), 70n]], 'same id, parties (as accounts) and amount');
  assert.match(p.expectedCommitment, /^[0-9a-f]{64}$/); assert.match(p.expectedDigest, /^[0-9a-f]{64}$/); assert.equal(p.expectedTotalMoved, '30'); assert.equal(p.expectedProposalRevision, 1);
  assert.deepEqual(p.expectedNets, [{ account: acct(1), net: '30' }, { account: acct(2), net: '-20' }, { account: acct(3), net: '-10' }].sort((a, b) => 0 || (p.participants.indexOf(a.account) - p.participants.indexOf(b.account))));
});

test('plan: every signer of every step is stated as data, and the initiator never signs for others', () => {
  const p = buildExecutionPlan(input());
  const by = (fn: string) => p.steps.filter((s) => s.fn === fn);
  assert.deepEqual(by('create_session')[0]!.signers, [acct(1)]);
  for (const j of by('join_session')) { assert.equal(j.signers.length, 2); assert.ok(j.signers.includes(acct(1)), 'the creator authorizes membership only'); assert.ok(j.signers.some((x) => x !== acct(1)), 'the joiner authorizes its own admission'); }
  assert.deepEqual(by('submit_obligation').map((s) => s.signers[0]), [acct(1), acct(2), acct(3)], 'each debtor authorizes its own obligation');
  for (const a of by('approve_settlement')) assert.equal(a.signers.length, 1);
  assert.deepEqual(by('approve_settlement').map((s) => s.signers[0]).sort(), p.participants.slice().sort(), 'every participant approves for themselves');
  assert.deepEqual(by('settle')[0]!.signers, [acct(1)], 'only the net debtor authorizes the debit');
  assert.deepEqual(p.requiredSigners, [acct(1), acct(2), acct(3)].sort());
  const settle = by('settle')[0]!.call.auths[0]!; assert.equal(settle.invocation.subs.length, 2, "the debtor's token transfers are part of what it authorizes"); assert.ok(settle.invocation.subs.every((t) => t.contract === TOKEN && t.fn === 'transfer'));
});

test('plan: the instructions are the approved batch, re-ordered only into the contract order', () => {
  const p = buildExecutionPlan(input({ instructions: [{ payer: 'usr_ann', payee: 'usr_cat', amount: '10' }, { payer: 'usr_ann', payee: 'usr_bob', amount: '20' }] }));
  const set = (list: { payer: string; payee: string; amount: bigint }[]) => list.map((i) => `${i.payer}>${i.payee}:${i.amount}`).sort();
  assert.deepEqual(set(p.instructions), set([{ payer: acct(1), payee: acct(2), amount: 20n }, { payer: acct(1), payee: acct(3), amount: 10n }]));
  const q = buildExecutionPlan(input());
  assert.deepEqual(q.instructions, p.instructions, 'any input order gives the same contract order');
  assert.equal(q.fingerprint, p.fingerprint);
});

test('plan: deterministic; independent of the order of positions, obligations and accounts', () => {
  const a = buildExecutionPlan(input());
  const i = input(); const b = buildExecutionPlan({ ...i, positions: [...i.positions].reverse(), obligations: [...i.obligations].reverse(), accounts: { usr_cat: acct(3), usr_bob: acct(2), usr_ann: acct(1) } });
  assert.equal(b.fingerprint, a.fingerprint); assert.equal(b.expectedDigest, a.expectedDigest); assert.equal(b.expectedCommitment, a.expectedCommitment);
  assert.notEqual(buildExecutionPlan(input({ batchId: 'bat_2' })).fingerprint, a.fingerprint, 'bound to the batch');
  assert.notEqual(buildExecutionPlan(input({ initiator: 'usr_bob' })).fingerprint, a.fingerprint, 'bound to the initiator');
  assert.equal(onChainSessionId('bat_1'), a.sessionId); assert.notEqual(onChainSessionId('bat_2'), a.sessionId); assert.match(a.sessionId, /^[0-9a-f]{64}$/);
});

test('plan: refusals (nothing is built from anything that is not exactly the approved economics)', () => {
  refuses(input({ network: 'public' as 'testnet' }), /only Stellar Testnet/);
  refuses(input({ assetId: `testnet:USD:${acct(9)}` }), /Soroban token contract identity/);
  refuses(input({ assetId: `public:contract:${TOKEN}` }), /Soroban token contract identity/);
  refuses(input({ assetId: 'testnet:native' }), /Soroban token contract identity/);
  refuses(input({ accounts: { usr_ann: acct(1), usr_bob: acct(2) } }), /no verified Stellar account/);
  refuses(input({ accounts: { usr_ann: acct(1), usr_bob: acct(2), usr_cat: acct(2) } }), /same Stellar account/);
  refuses(input({ initiator: 'usr_zed', accounts: { usr_ann: acct(1), usr_bob: acct(2), usr_cat: acct(3), usr_zed: acct(4) } }), /initiator must be a participant/);
  refuses(input({ obligations: [] }), /no obligations/);
  refuses(input({ instructions: [] }), /no instructions/);
  refuses(input({ instructions: [{ payer: 'usr_ann', payee: 'usr_bob', amount: '21' }, { payer: 'usr_ann', payee: 'usr_cat', amount: '10' }] }), /not a valid plan/);
  refuses(input({ positions: [{ userId: 'usr_ann', net: '31' }, { userId: 'usr_bob', net: '-21' }, { userId: 'usr_cat', net: '-10' }] }), /approved net position/);
  refuses(input({ instructions: [{ payer: 'usr_bob', payee: 'usr_ann', amount: '20' }, { payer: 'usr_cat', payee: 'usr_ann', amount: '10' }] }), /not a valid plan/);
  const many = (n: number) => { const accounts: Record<string, string> = {}; const positions: PlanInput['positions'] = []; for (let k = 1; k <= n; k++) { accounts[`usr_${k}`] = acct(k); positions.push({ userId: `usr_${k}`, net: '0' }); } return { accounts, positions }; };
  refuses(input({ ...many(DEPLOYED_CEILINGS.participants + 1), initiator: 'usr_1' }), /at most 4 participants/);
  refuses(input({ obligations: Array.from({ length: 17 }, (_, k) => ({ id: OB(k + 1), debtor: 'usr_ann', creditor: 'usr_bob', amount: '1' })) }), /at most 16 obligations/);
  assert.equal(DEPLOYED_CEILINGS.participants, 4); assert.equal(DEPLOYED_CEILINGS.obligations, 16);
});

// ---- comparison with an observed chain (MOCK observations) ----
const plan = buildExecutionPlan(input());
const settled = (): ObservedChain => ({
  session: { creator: plan.creator, token: plan.token, maxParticipants: 3, maxObligations: 3, state: 'Settled', participants: [...plan.participants], obligationCommitment: plan.expectedCommitment },
  obligations: plan.obligations.map((o) => ({ id: o.id, debtor: o.debtor, creditor: o.creditor, amount: o.amount.toString() })),
  proposal: { digest: plan.expectedDigest, instructions: plan.instructions.map((i) => ({ payer: i.payer, payee: i.payee, amount: i.amount.toString() })), proposer: plan.creator, revision: 1 },
  approvals: plan.participants.map((p) => ({ participant: p, digest: plan.expectedDigest })),
  settlement: { digest: plan.expectedDigest, ledgerSequence: 123, totalMoved: '30', instructionCount: 2 },
});
const clone = (o: ObservedChain): ObservedChain => JSON.parse(JSON.stringify(o));

test('MOCK compare: a chain that equals the plan matches at every stage of progress', () => {
  const full = settled(); const c = compareWithPlan(plan, full); assert.deepEqual(c, { ok: true, progress: 'settled', mismatches: [] });
  const none = compareWithPlan(plan, { session: null, obligations: [], proposal: null, approvals: [], settlement: null }); assert.deepEqual(none, { ok: true, progress: 'not-started', mismatches: [] });
  const created: ObservedChain = { session: { ...full.session!, state: 'Open', participants: [plan.creator], obligationCommitment: null }, obligations: [], proposal: null, approvals: [], settlement: null };
  assert.equal(compareWithPlan(plan, created).progress, 'created'); assert.ok(compareWithPlan(plan, created).ok);
  const some: ObservedChain = { ...created, session: { ...created.session!, participants: [...plan.participants] }, obligations: full.obligations.slice(0, 2) }; assert.equal(compareWithPlan(plan, some).progress, 'obligations-recorded'); assert.ok(compareWithPlan(plan, some).ok);
  const fin: ObservedChain = { ...full, session: { ...full.session!, state: 'Committed' }, proposal: null, approvals: [], settlement: null }; assert.equal(compareWithPlan(plan, fin).progress, 'finalized'); assert.ok(compareWithPlan(plan, fin).ok);
  const prop = { ...fin, proposal: full.proposal }; assert.equal(compareWithPlan(plan, prop).progress, 'proposed');
  const appr = { ...prop, session: { ...full.session!, state: 'Approved' as const }, approvals: full.approvals }; assert.equal(compareWithPlan(plan, appr).progress, 'approved'); assert.ok(compareWithPlan(plan, appr).ok);
});

test('MOCK compare: every kind of difference is a mismatch (stop; never accept a different result)', () => {
  const bad = (mut: (o: ObservedChain) => void, re: RegExp) => { const o = clone(settled()); mut(o); const c = compareWithPlan(plan, o); assert.equal(c.ok, false, String(re)); assert.ok(c.mismatches.some((m) => re.test(m)), `${re}: ${JSON.stringify(c.mismatches)}`); };
  bad((o) => { o.session!.creator = acct(9); }, /creator/);
  bad((o) => { o.session!.token = encodeAddress('contract', new Uint8Array(32).fill(7)); }, /session token/);
  bad((o) => { o.session!.participants.push(acct(9)); }, /unexpected participant/);
  bad((o) => { o.session!.participants.reverse(); }, /creator is not the first/);
  bad((o) => { o.session!.maxParticipants = 4; }, /participant capacity/);
  bad((o) => { o.obligations[0]!.amount = '101'; }, /obligation .* differs/);
  bad((o) => { o.obligations[1]!.creditor = acct(1); }, /obligation .* differs/);
  bad((o) => { o.obligations.pop(); }, /only 2 of 3 obligations/);
  bad((o) => { o.obligations.push({ id: OB(9), debtor: acct(1), creditor: acct(2), amount: '1' }); }, /unexpected obligation/);
  bad((o) => { o.session!.obligationCommitment = 'f'.repeat(64); }, /commitment/);
  bad((o) => { o.obligations[0]!.amount = '90'; }, /net position/);
  bad((o) => { o.proposal!.instructions[0]!.amount = '19'; }, /instruction 1/);
  bad((o) => { o.proposal!.instructions.reverse(); }, /instruction/);
  bad((o) => { o.proposal!.instructions.pop(); }, /the proposal has 1 instructions/);
  bad((o) => { o.proposal!.digest = 'e'.repeat(64); }, /proposal digest/);
  bad((o) => { o.proposal!.revision = 2; }, /revision/);
  bad((o) => { o.approvals[0]!.digest = 'e'.repeat(64); }, /different digest/);
  bad((o) => { o.approvals.push({ participant: acct(9), digest: plan.expectedDigest }); }, /non-participant/);
  bad((o) => { o.settlement!.totalMoved = '31'; }, /total moved/);
  bad((o) => { o.settlement!.instructionCount = 3; }, /settled 3 instructions/);
  bad((o) => { o.settlement!.digest = 'd'.repeat(64); }, /settled digest/);
  bad((o) => { o.session!.state = 'Approved'; }, /not Settled/);
  bad((o) => { o.settlement = null; }, /no settlement result/);
  const orphan = compareWithPlan(plan, { session: null, obligations: settled().obligations, proposal: null, approvals: [], settlement: null }); assert.equal(orphan.ok, false);
});

test('MOCK compare: a contract that netted differently is never accepted, even if every id matches', () => {
  const o = clone(settled()); o.obligations[2]!.amount = '60'; // the nets now differ from the approved ones
  const c = compareWithPlan(plan, o); assert.equal(c.ok, false); assert.ok(c.mismatches.some((m) => /net position/.test(m)));
});
