// The settlement ADAPTER: SettlementBatch -> ExecutionPlan -> Soroban calls. Pure and deterministic: no network, no wallet, no signing, no database.
//
// The deployed clearing contract does NOT accept an application batch. It runs its own on-chain session lifecycle (create, join, submit obligations, finalize,
// propose, approve, settle) in which every participant authorizes their own steps. This module maps Tobin's approved calculation and batch onto that lifecycle
// using the SDK's own prepared calls and authorization requirements (nothing is hand-assembled), and states, as data, EVERY signer each step needs.
//
// Mapping (the economic meaning is preserved exactly):
//   participants      the verified Stellar account of each participant of the approved calculation (never a bookkeeping handle)
//   obligations       one on-chain obligation per ACTIVE application obligation: same 32-byte id, debtor, creditor and amount (whole base units)
//   proposal          the approved batch's instructions, re-ordered ONLY into the contract's required (payer, payee) order; same multiset of (payer, payee, amount)
//   asset             the session token = the batch asset, which MUST be a Soroban token contract identity (kind 'contract') on the plan's network
//   net positions     the contract derives them from the on-chain obligations; the plan carries the approved positions so they can be compared independently
import { createHash } from 'node:crypto';
import { computeNets, sortInstructions, validatePlan } from 'tobin-mvp1-sdk/engine';
import type { Instruction, Obligation } from 'tobin-mvp1-sdk/engine';
import { obligationCommitment, proposalDigest } from 'tobin-mvp1-sdk/digest';
import { networkIdOf } from 'tobin-mvp1-sdk/sdk';
import { prepareApprove, prepareCreateSession, prepareFinalize, prepareJoin, preparePropose, prepareSettle, prepareSubmitObligation } from 'tobin-mvp1-sdk/sdk';
import type { PreparedCall } from 'tobin-mvp1-sdk/sdk';
import { toHex } from 'tobin-mvp1-sdk/amount';

export const PLAN_SCHEMA = 'tobin-execution-plan/v1';
export const NETWORK_PASSPHRASE = { testnet: 'Test SDF Network ; September 2015' } as const;

export interface Ceilings { participants: number; obligations: number; instructions: number }
/** The deployed contract's own ceilings (read from `config()` on chain at preflight: 4, 16, 16 on the recorded Testnet deployment). */
export const DEPLOYED_CEILINGS: Ceilings = { participants: 4, obligations: 16, instructions: 16 };

export interface PlanInput {
  network: 'testnet';
  clearing: string;
  /** the batch asset's canonical identity; must be a Soroban token contract on the same network */
  assetId: string;
  batchId: string;
  /** user id of the designated settlement initiator: creates the on-chain session and must be a participant */
  initiator: string;
  /** user id -> VERIFIED Stellar account on `network` */
  accounts: Record<string, string>;
  /** the approved calculation: per-participant nets and the active obligations (ids, parties as user ids, amounts) */
  positions: { userId: string; net: string }[];
  obligations: { id: string; debtor: string; creditor: string; amount: string }[];
  /** the approved batch's instructions (user ids) */
  instructions: { payer: string; payee: string; amount: string }[];
  ceilings?: Ceilings;
}

export interface PlanStep { index: number; fn: string; call: PreparedCall; signers: string[]; note: string }
export interface ExecutionPlan {
  schema: typeof PLAN_SCHEMA;
  network: 'testnet';
  networkPassphrase: string;
  clearing: string;
  token: string;
  sessionId: string;
  creator: string;
  participants: string[];
  obligations: Obligation[];
  instructions: Instruction[];
  /** approved net positions by ACCOUNT, for independent comparison with what the contract derives */
  expectedNets: { account: string; net: string }[];
  expectedCommitment: string;
  expectedDigest: string;
  expectedProposalRevision: 1;
  expectedTotalMoved: string;
  steps: PlanStep[];
  requiredSigners: string[];
  fingerprint: string;
}

export class PlanError extends Error { constructor(message: string) { super(message); this.name = 'PlanError'; } }
const fail = (m: string): never => { throw new PlanError(m); };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** One on-chain session per batch: a retry or a second attempt can only continue THIS session (create_session on an existing id fails), never duplicate it. */
export const onChainSessionId = (batchId: string): string => sha(`tobin-onchain-session/v1|${batchId}`);

export function buildExecutionPlan(input: PlanInput): ExecutionPlan {
  const lim = input.ceilings ?? DEPLOYED_CEILINGS;
  if (input.network !== 'testnet') fail('only Stellar Testnet is enabled: no other network is supported by this adapter');
  const parts = input.assetId.split(':');
  if (parts.length !== 3 || parts[1] !== 'contract' || parts[0] !== input.network) fail('the batch asset must be a Soroban token contract identity on ' + input.network + ' (the deployed contract settles in a token contract, not a classic asset)');
  const token = parts[2] as string;

  const users = [...new Set(input.positions.map((p) => p.userId))];
  const acct = (u: string): string => input.accounts[u] ?? fail('participant ' + u + ' has no verified Stellar account on ' + input.network);
  const accounts = users.map(acct);
  if (new Set(accounts).size !== accounts.length) fail('two participants resolve to the same Stellar account');
  if (!(input.initiator in input.accounts) || !users.includes(input.initiator)) fail('the settlement initiator must be a participant with a verified account');
  const creator = acct(input.initiator);
  const participants = [creator, ...accounts.filter((a) => a !== creator).sort()];
  if (participants.length < 2) fail('a settlement needs at least two participants');
  if (participants.length > lim.participants) fail(`the deployed contract admits at most ${lim.participants} participants per session; this settlement has ${participants.length}`);
  if (input.obligations.length === 0) fail('there are no obligations to put on chain');
  if (input.obligations.length > lim.obligations) fail(`the deployed contract admits at most ${lim.obligations} obligations per session; this settlement has ${input.obligations.length}`);

  const obligations: Obligation[] = [...input.obligations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((o) => ({ id: o.id, debtor: acct(o.debtor), creditor: acct(o.creditor), amount: BigInt(o.amount) }));
  const batch: Instruction[] = input.instructions.map((i) => ({ payer: acct(i.payer), payee: acct(i.payee), amount: BigInt(i.amount) }));
  if (batch.length === 0) fail('the approved batch has no instructions: there is nothing to settle on chain');
  if (batch.length > lim.instructions) fail(`the deployed contract admits at most ${lim.instructions} instructions; this batch has ${batch.length}`);
  const instructions = sortInstructions(batch);

  // the contract's own rules, applied locally before anything is signed (advisory; the contract is the authority)
  const check = validatePlan(participants, obligations, instructions);
  if (!check.ok) fail('the approved batch is not a valid plan for these obligations: ' + check.message);
  // the approved positions must equal the nets of the obligations that will be on chain
  const nets = computeNets(participants, obligations);
  const approved = new Map(input.positions.map((p) => [acct(p.userId), BigInt(p.net)]));
  for (const n of nets) if ((approved.get(n.participant) ?? 0n) !== n.net) fail('the approved net position of ' + n.participant.slice(0, 8) + '... differs from what the on-chain obligations produce');
  // the mapped plan is the approved batch, only re-ordered: same multiset of (payer, payee, amount)
  const key = (i: Instruction) => `${i.payer}>${i.payee}:${i.amount}`;
  if ([...batch.map(key)].sort().join() !== [...instructions.map(key)].sort().join()) fail('the plan differs from the approved batch');

  const sessionId = onChainSessionId(input.batchId);
  const ctx = { networkId: networkIdOf(NETWORK_PASSPHRASE.testnet), contract: input.clearing, sessionId, token };
  const commitment = obligationCommitment(ctx, participants, obligations);
  const digest = toHex(proposalDigest(ctx, commitment, 1, instructions));

  const steps: PlanStep[] = []; const add = (call: PreparedCall, note: string) => steps.push({ index: steps.length + 1, fn: call.fn, call, signers: [...new Set(call.auths.map((a) => a.signer))], note });
  add(prepareCreateSession(input.clearing, { creator, sessionId, token, maxParticipants: participants.length, maxObligations: obligations.length }), 'the initiator creates the session; the session token is fixed for good');
  for (const p of participants.slice(1)) add(prepareJoin(input.clearing, { sessionId, participant: p, creator }), 'the participant and the creator both authorize this admission (the creator authorizes membership only)');
  for (const o of obligations) add(prepareSubmitObligation(input.clearing, { sessionId, obligation: o }), 'the debtor authorizes its own obligation');
  add(prepareFinalize(input.clearing, { sessionId, caller: creator }), 'freezes participants, token and obligations on chain');
  add(preparePropose(input.clearing, { sessionId, proposer: creator, instructions }), 'proposes the APPROVED batch as the on-chain plan');
  for (const p of participants) add(prepareApprove(input.clearing, { sessionId, participant: p, digest }), 'each participant approves the current digest (not a debit authorization)');
  add(prepareSettle(input.clearing, { sessionId, digest, instructions, token }), 'every debtor authorizes its own total and its own token transfers; all transfers succeed or none does');

  const requiredSigners = [...new Set(steps.flatMap((s) => s.signers))].sort();
  const expectedNets = nets.map((n) => ({ account: n.participant, net: n.net.toString() }));
  const body = { schema: PLAN_SCHEMA, network: input.network, clearing: input.clearing, token, sessionId, participants, obligations: obligations.map((o) => [o.id, o.debtor, o.creditor, o.amount.toString()]), instructions: instructions.map((i) => [i.payer, i.payee, i.amount.toString()]), steps: steps.map((s) => [s.fn, s.call.args]) };
  return {
    schema: PLAN_SCHEMA, network: input.network, networkPassphrase: NETWORK_PASSPHRASE.testnet, clearing: input.clearing, token, sessionId, creator, participants, obligations, instructions,
    expectedNets, expectedCommitment: toHex(commitment), expectedDigest: digest, expectedProposalRevision: 1,
    expectedTotalMoved: instructions.reduce((t, i) => t + i.amount, 0n).toString(), steps, requiredSigners, fingerprint: sha(JSON.stringify(body)),
  };
}
