// Stable error identifiers: the contract's `#[contracterror]` codes (contracts/clearing/src/lib.rs) and the token's (contracts/token/src/lib.rs, 101+).
// Authorization failures are HOST errors (`Error(Auth, ...)`), not contract errors: a contract cannot return its own code for a failed
// `require_auth` (baseline S12, CD section 8). Token failures pass through `settle` as the token's own contract errors.

export const CLEARING_ERRORS: Record<number, string> = {
  1: 'SessionNotFound',
  2: 'SessionExists',
  3: 'WrongState',
  4: 'NotParticipant',
  5: 'NoProposal',
  6: 'MissingApproval',
  10: 'TooManyParticipants',
  11: 'ParticipantExists',
  12: 'BadAddressKind',
  13: 'BadCapacity',
  20: 'TooManyObligations',
  21: 'DuplicateObligation',
  22: 'BadAmount',
  23: 'SameParty',
  24: 'UnknownParty',
  25: 'ObligationNotFound',
  30: 'TooFewParticipants',
  31: 'NoObligations',
  33: 'TooManyInstructions',
  34: 'InstructionOrder',
  35: 'InstructionSelfPay',
  36: 'FlowMismatch',
  37: 'OffsettingFlows',
  38: 'Overflow',
  40: 'DigestMismatch',
  50: 'AlreadySettled',
  90: 'CorruptState',
};

export const TOKEN_ERRORS: Record<number, string> = {
  101: 'BadAmount',
  102: 'InsufficientBalance',
  103: 'CapExceeded',
  104: 'Overflow',
  105: 'BadCap',
};

const EXPLAIN: Record<string, string> = {
  SessionNotFound: 'There is no session with this id.',
  SessionExists: 'A session with this id already exists; ids are never reused.',
  WrongState: 'This action is not allowed in the session\'s current state.',
  NotParticipant: 'The account is not an admitted participant of this session.',
  NoProposal: 'There is no settlement proposal yet.',
  MissingApproval: 'Not every admitted participant has approved the current proposal.',
  TooManyParticipants: 'The session\'s participant capacity is reached.',
  ParticipantExists: 'The account is already admitted (the creator is admitted automatically).',
  BadAddressKind: 'Only account (G...) and contract (C...) addresses are accepted, and the token must be a contract.',
  BadCapacity: 'Capacities must be 2 to 4 participants and 1 to 16 obligations (provisional targets).',
  TooManyObligations: 'The session\'s obligation capacity is reached.',
  DuplicateObligation: 'An obligation with this id already exists in the session.',
  BadAmount: 'An amount must be greater than zero.',
  SameParty: 'Debtor and creditor must be different accounts.',
  UnknownParty: 'An account named here is not an admitted participant.',
  ObligationNotFound: 'There is no obligation with this id.',
  TooFewParticipants: 'At least two participants are needed to finalize.',
  NoObligations: 'There is no obligation to finalize.',
  TooManyInstructions: 'The plan has more instructions than the ceiling.',
  InstructionOrder: 'Instructions must be strictly ascending by payer, then payee.',
  InstructionSelfPay: 'An instruction cannot pay an account to itself.',
  FlowMismatch: 'The instructions do not realize every participant\'s net position exactly.',
  OffsettingFlows: 'A participant would both pay and receive.',
  Overflow: 'An amount or sum is outside the i128 range.',
  DigestMismatch: 'The digest is not the current proposal digest (a replaced or stale proposal).',
  AlreadySettled: 'The session is already settled; nothing can move again.',
  CorruptState: 'An integrity check of the stored state failed; the contract failed closed.',
  InsufficientBalance: 'A debtor\'s balance is too low for its transfer; the whole settlement was reverted.',
  CapExceeded: 'Minting would take the token supply above its cap.',
  InvalidAction: 'A required authorization is missing or does not match the exact call.',
};

/** 'policy': refused by the SDK itself before any call (for example a settlement authorization that was already used in an attempt), not by the contract. */
export type TobinErrorKind = 'contract' | 'token' | 'auth' | 'host' | 'transport' | 'policy';

/** A failed call. `errorName` is the stable identifier (e.g. DigestMismatch); authorization failures have kind 'auth'. */
export class TobinError extends Error {
  readonly kind: TobinErrorKind;
  readonly code: number | null;
  readonly errorName: string;
  readonly fn: string;
  constructor(kind: TobinErrorKind, errorName: string, code: number | null, fn: string, detail?: string) {
    super(`${fn}: ${errorName}${code !== null ? ` (#${code})` : ''}${EXPLAIN[errorName] ? ` - ${EXPLAIN[errorName]}` : ''}${detail ? ` [${detail}]` : ''}`);
    this.name = 'TobinError';
    this.kind = kind;
    this.code = code;
    this.errorName = errorName;
    this.fn = fn;
  }
}

/** Map a transport failure to a typed error. */
export function toTobinError(fn: string, errorType: string, code: number | null, codeName?: string): TobinError {
  if (errorType === 'Contract' && code !== null) {
    if (CLEARING_ERRORS[code] && code < 100) return new TobinError('contract', CLEARING_ERRORS[code] as string, code, fn);
    if (TOKEN_ERRORS[code]) return new TobinError('token', TOKEN_ERRORS[code] as string, code, fn, 'passed through from the token contract');
    return new TobinError('contract', `Unknown#${code}`, code, fn);
  }
  if (errorType === 'Auth') return new TobinError('auth', codeName ?? 'InvalidAction', code, fn, 'a required authorization is missing or does not match');
  return new TobinError('host', `${errorType}${codeName ? `:${codeName}` : ''}`, code, fn);
}
