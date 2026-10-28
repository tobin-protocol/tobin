// Prepared calls and the AUTHORIZATION REQUIREMENTS each one needs. This is the signing boundary of the SDK: a `PreparedCall` states, as
// data, WHAT each account must authorize (the exact contract, function, arguments and sub-invocations the contract will demand). How an
// authorization is produced (a wallet signature over an authorization entry, in a real deployment) is the transport's business and is NOT
// implemented here; the local bridge applies the same requirements as simulated, unsigned grants. Nothing is signed or sent by this module.
import { EngineError, checkedAdd } from '../amount.ts';
import { arg } from './abi.ts';
import type { ScArg } from './abi.ts';
import type { Instruction, Obligation } from '../engine/types.ts';

export interface Invocation {
  contract: string;
  fn: string;
  args: ScArg[];
  subs: Invocation[];
}

export interface AuthRequirement {
  signer: string;
  /** a human sentence for the signer: what exactly they are authorizing */
  purpose: string;
  invocation: Invocation;
}

export interface PreparedCall {
  /** set for a settlement: identifies ONE round of authorization. The client lets each id be attempted once; a retry needs a newly prepared call (EQ-20, record section 9). */
  authorizationId?: string;
  contract: string;
  fn: string;
  args: ScArg[];
  auths: AuthRequirement[];
  description: string;
}

const root = (contract: string, fn: string, args: ScArg[], subs: Invocation[] = []): Invocation => ({ contract, fn, args, subs });

export function prepareCreateSession(clearing: string, p: { creator: string; sessionId: string; token: string; maxParticipants: number; maxObligations: number }): PreparedCall {
  const args = [arg.addr(p.creator), arg.bytes32(p.sessionId), arg.addr(p.token), arg.u32(p.maxParticipants), arg.u32(p.maxObligations)];
  return {
    contract: clearing,
    fn: 'create_session',
    args,
    description: 'Create a session; the creator is admitted automatically and the session token is fixed for good.',
    auths: [{ signer: p.creator, purpose: 'create this session with this token and these capacities', invocation: root(clearing, 'create_session', args) }],
  };
}

/** A join needs TWO distinct authorizations on the same call: the joiner\'s own and the session creator\'s. */
export function prepareJoin(clearing: string, p: { sessionId: string; participant: string; creator: string }): PreparedCall {
  const args = [arg.bytes32(p.sessionId), arg.addr(p.participant)];
  const inv = root(clearing, 'join_session', args);
  return {
    contract: clearing,
    fn: 'join_session',
    args,
    description: 'Admit a participant. Both the joining participant and the session creator must authorize this exact join.',
    auths: [
      { signer: p.participant, purpose: 'join this session as a participant (joiner authorization)', invocation: inv },
      { signer: p.creator, purpose: 'admit this participant into this session (creator authorization of membership only)', invocation: inv },
    ],
  };
}

export function prepareSubmitObligation(clearing: string, p: { sessionId: string; obligation: Obligation }): PreparedCall {
  const args = [arg.bytes32(p.sessionId), arg.obligation(p.obligation)];
  return {
    contract: clearing,
    fn: 'submit_obligation',
    args,
    description: 'Record an obligation. Only the debtor authorizes; the creditor consents later by approving the whole proposal.',
    auths: [{ signer: p.obligation.debtor, purpose: 'owe this amount to this creditor (debtor authorization)', invocation: root(clearing, 'submit_obligation', args) }],
  };
}

export function prepareFinalize(clearing: string, p: { sessionId: string; caller: string }): PreparedCall {
  const args = [arg.bytes32(p.sessionId), arg.addr(p.caller)];
  return {
    contract: clearing,
    fn: 'finalize_obligations',
    args,
    description: 'Freeze the participants, token and obligations. Any admitted participant may do it; it edits nothing and settles nothing.',
    auths: [{ signer: p.caller, purpose: 'freeze this obligation set', invocation: root(clearing, 'finalize_obligations', args) }],
  };
}

export function preparePropose(clearing: string, p: { sessionId: string; proposer: string; instructions: readonly Instruction[] }): PreparedCall {
  const args = [arg.bytes32(p.sessionId), arg.addr(p.proposer), arg.instructions(p.instructions)];
  return {
    contract: clearing,
    fn: 'propose_settlement',
    args,
    description: 'Create or replace the settlement proposal. The contract validates the plan; a replacement invalidates every earlier approval.',
    auths: [{ signer: p.proposer, purpose: 'propose exactly this list of transfers', invocation: root(clearing, 'propose_settlement', args) }],
  };
}

export function prepareApprove(clearing: string, p: { sessionId: string; participant: string; digest: string }): PreparedCall {
  const args = [arg.bytes32(p.sessionId), arg.addr(p.participant), arg.bytes32(p.digest)];
  return {
    contract: clearing,
    fn: 'approve_settlement',
    args,
    description: 'Approve the complete current proposal (identified by its digest). Not a debit authorization.',
    auths: [{ signer: p.participant, purpose: `approve the proposal with digest ${p.digest.slice(0, 12)}...`, invocation: root(clearing, 'approve_settlement', args) }],
  };
}

export interface DebtorAuthorization {
  debtor: string;
  /** the debtor's total debit: the checked sum of its instructions */
  total: bigint;
  transfers: { to: string; amount: bigint }[];
}

/** The debtors of a plan, grouped exactly as the contract groups them: runs of consecutive instructions with the same payer. */
export function debtorAuthorizations(instructions: readonly Instruction[]): DebtorAuthorization[] {
  const out: DebtorAuthorization[] = [];
  for (const i of instructions) {
    const last = out[out.length - 1];
    if (last && last.debtor === i.payer) {
      last.total = checkedAdd(last.total, i.amount);
      last.transfers.push({ to: i.payee, amount: i.amount });
    } else {
      out.push({ debtor: i.payer, total: i.amount, transfers: [{ to: i.payee, amount: i.amount }] });
    }
  }
  return out;
}

/** Settlement: anyone may submit (no submitter argument); EVERY debtor must authorize `settle(session, digest, own total)` together with its own
 *  token transfers. Approvals do not substitute for these. With an empty plan there is no debtor and no authorization. */
let settleAuthorizationSeq = 0;

export function prepareSettle(clearing: string, p: { sessionId: string; digest: string; instructions: readonly Instruction[]; token: string }): PreparedCall {
  const args = [arg.bytes32(p.sessionId), arg.bytes32(p.digest)];
  const auths: AuthRequirement[] = debtorAuthorizations(p.instructions).map((d) => {
    const subs = d.transfers.map((t) => root(p.token, 'transfer', [arg.addr(d.debtor), arg.addr(t.to), arg.i128(t.amount)]));
    return {
      signer: d.debtor,
      purpose: `pay ${d.total} in total (${d.transfers.length} transfer${d.transfers.length === 1 ? '' : 's'}) for this settlement`,
      invocation: root(clearing, 'settle', [arg.bytes32(p.sessionId), arg.bytes32(p.digest), arg.i128(d.total)], subs),
    };
  });
  return {
    authorizationId: `settle-authorization-${++settleAuthorizationSeq}`,
    contract: clearing,
    fn: 'settle',
    args,
    auths,
    description: p.instructions.length === 0
      ? 'Complete a session whose nets are all zero: no transfer, no debtor authorization; records SETTLED with zero value.'
      : 'Execute the settlement. Any caller may submit; every debtor must authorize its own transfers; all transfers succeed or none does.',
  };
}

export function prepareMint(token: string, p: { minter: string; to: string; amount: bigint }): PreparedCall {
  if (p.amount <= 0n) throw new EngineError('NON_POSITIVE_AMOUNT', 'a mint amount must be greater than zero');
  const args = [arg.addr(p.to), arg.i128(p.amount)];
  return {
    contract: token,
    fn: 'mint',
    args,
    description: 'Mint test tokens (only the token\'s fixed minter; the supply can never exceed the cap).',
    auths: [{ signer: p.minter, purpose: 'mint this amount to this account', invocation: root(token, 'mint', args) }],
  };
}

export function prepareQuery(contract: string, fn: string, args: ScArg[]): PreparedCall {
  return { contract, fn, args, auths: [], description: `Read: ${fn}` };
}
