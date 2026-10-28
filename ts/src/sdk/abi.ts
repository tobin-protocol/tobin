// The REAL contract interface, taken from `core/clearing/src/lib.rs` (TobinClearingV1) and `core/token/src/lib.rs` (TobinTestToken).
// Nothing here is invented: every function name below is exported by the compiled contract (the build lists the same 18 for the clearing
// contract). Argument order and types are those of the Rust signatures.
import { EngineError, parseAmount } from '../amount.ts';
import type { Instruction, Obligation } from '../engine/types.ts';

/** A typed contract argument, in the tagged JSON form that transports understand (the local bridge converts it to a Soroban `Val`). */
export type ScArg =
  | { t: 'addr' | 'bytes32' | 'i128' | 'string'; v: string }
  | { t: 'u32'; v: number }
  | { t: 'obligation'; v: { id: string; debtor: string; creditor: string; amount: string } }
  | { t: 'instructions'; v: { payer: string; payee: string; amount: string }[] };

export const arg = {
  addr: (v: string): ScArg => ({ t: 'addr', v }),
  bytes32: (hex: string): ScArg => ({ t: 'bytes32', v: hex }),
  i128: (v: bigint): ScArg => ({ t: 'i128', v: v.toString() }),
  u32: (v: number): ScArg => ({ t: 'u32', v }),
  obligation: (o: Obligation): ScArg => ({ t: 'obligation', v: { id: o.id, debtor: o.debtor, creditor: o.creditor, amount: o.amount.toString() } }),
  instructions: (list: readonly Instruction[]): ScArg => ({ t: 'instructions', v: list.map((i) => ({ payer: i.payer, payee: i.payee, amount: i.amount.toString() })) }),
};

/** Every callable function of TobinClearingV1. */
export const CLEARING_FUNCTIONS = [
  'config',
  'create_session',
  'join_session',
  'submit_obligation',
  'finalize_obligations',
  'propose_settlement',
  'approve_settlement',
  'settle',
  'get_session',
  'get_obligations',
  'get_obligation',
  'get_commitment',
  'get_proposal',
  'get_settlement',
  'get_approvals',
  'get_approval',
  'commitment_bytes',
  'proposal_bytes',
] as const;
export type ClearingFunction = (typeof CLEARING_FUNCTIONS)[number];

/** The functions of TobinTestToken the SDK uses. */
export const TOKEN_FUNCTIONS = ['mint', 'transfer', 'balance', 'total_supply', 'cap', 'minter', 'decimals', 'name', 'symbol'] as const;

export type SessionState = 'Open' | 'Committed' | 'Approved' | 'Settled';
const STATES: Record<number, SessionState> = { 1: 'Open', 2: 'Committed', 3: 'Approved', 4: 'Settled' };

export interface SessionRecord {
  creator: string;
  token: string;
  maxParticipants: number;
  maxObligations: number;
  state: SessionState;
  /** admission order, the creator first */
  participants: string[];
  /** 64 hex characters once the obligations are finalized */
  obligationCommitment: string | null;
}

export interface ProposalRecord {
  digest: string;
  instructions: Instruction[];
  proposer: string;
  revision: number;
}

export interface ApprovalRecord {
  participant: string;
  digest: string;
}

export interface SettlementRecord {
  digest: string;
  ledgerSequence: number;
  totalMoved: bigint;
  instructionCount: number;
}

type Json = Record<string, unknown>;
const obj = (v: unknown, what: string): Json => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new EngineError('INVALID_ID', `unexpected ${what} from the contract`);
  return v as Json;
};
const str = (v: unknown): string => String(v);

export function parseSession(v: unknown): SessionRecord {
  const o = obj(v, 'session');
  const state = STATES[Number(o['state'])];
  if (!state) throw new EngineError('INVALID_ID', `unknown session state ${String(o['state'])}`);
  return {
    creator: str(o['creator']),
    token: str(o['token']),
    maxParticipants: Number(o['max_participants']),
    maxObligations: Number(o['max_obligations']),
    state,
    participants: (o['participants'] as unknown[]).map(str),
    obligationCommitment: o['obligation_commitment'] === null || o['obligation_commitment'] === undefined ? null : str(o['obligation_commitment']),
  };
}

export function parseObligation(v: unknown): Obligation {
  const o = obj(v, 'obligation');
  return { id: str(o['id']), debtor: str(o['debtor']), creditor: str(o['creditor']), amount: parseAmount(str(o['amount'])) };
}

export function parseInstruction(v: unknown): Instruction {
  const o = obj(v, 'instruction');
  return { payer: str(o['payer']), payee: str(o['payee']), amount: parseAmount(str(o['amount'])) };
}

export function parseProposal(v: unknown): ProposalRecord {
  const o = obj(v, 'proposal');
  return { digest: str(o['digest']), instructions: (o['instructions'] as unknown[]).map(parseInstruction), proposer: str(o['proposer']), revision: Number(o['revision']) };
}

export function parseApproval(v: unknown): ApprovalRecord {
  const o = obj(v, 'approval');
  return { participant: str(o['participant']), digest: str(o['digest']) };
}

export function parseSettlement(v: unknown): SettlementRecord {
  const o = obj(v, 'settlement');
  return { digest: str(o['digest']), ledgerSequence: Number(o['ledger_sequence']), totalMoved: parseAmount(str(o['total_moved'])), instructionCount: Number(o['instruction_count']) };
}
