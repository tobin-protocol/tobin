// Settlement execution state machine and chain-outcome reconciliation (pure). This module defines the LEGAL states and transitions of settlement execution and the
// rule that decides what an observed chain result means. It performs no I/O itself. The owner-run Stellar tools (lib/stellar/run.ts) do sign and submit on Testnet, but they do not go through this module, and no HTTP route advances execution state.
// The observed-transaction inputs used in tests are MOCKS and are labelled as such: a mock is not evidence of any Stellar behaviour.
//
// Stages that must never be collapsed into one generic "settled": prepared -> approved (batch) -> awaiting-signer -> signing -> signed -> submission-pending ->
// submitted -> confirmed (independently verified on chain) -> reconciled (matches the approved batch exactly).

export const STATES = ['awaiting-signer', 'signing', 'signed', 'submission-pending', 'submitted', 'confirmed', 'reconciled', 'failed', 'expired', 'unknown-outcome', 'reconciliation-required'] as const;
export type ExecState = (typeof STATES)[number];

export const TRANSITIONS: Record<ExecState, readonly ExecState[]> = {
  'awaiting-signer': ['signing'],
  signing: ['signed', 'awaiting-signer', 'failed'], // awaiting-signer again after a rejected or abandoned signature: nothing is marked signed
  signed: ['submission-pending', 'expired'],
  'submission-pending': ['submitted', 'failed', 'expired', 'unknown-outcome'],
  submitted: ['confirmed', 'failed', 'expired', 'unknown-outcome'],
  // an unknown outcome is resolved ONLY by reading the network, never by retrying: it may move on once the network answers
  'unknown-outcome': ['confirmed', 'failed', 'expired', 'unknown-outcome'],
  confirmed: ['reconciled', 'reconciliation-required'],
  'reconciliation-required': ['reconciled'],
  reconciled: [], failed: [], expired: [],
};
export const TERMINAL: readonly ExecState[] = ['reconciled', 'failed', 'expired'];
export const canTransition = (from: ExecState, to: ExecState): boolean => TRANSITIONS[from].includes(to);
export const isState = (s: unknown): s is ExecState => typeof s === 'string' && (STATES as readonly string[]).includes(s);

// ---- chain outcome ----
export interface Transfer { from: string; to: string; asset: string; amount: string }
export interface ExpectedSettlement { network: string; transfers: Transfer[] }
export type TxStatus = 'SUCCESS' | 'FAILED' | 'NOT_FOUND' | 'PENDING' | 'UNAVAILABLE';
export interface ObservedTransaction { network: string; hash: string; status: TxStatus; ledger?: number; transfers: Transfer[] }
export interface Verdict { state: 'pending' | 'failed' | 'unknown-outcome' | 'reconciled' | 'reconciliation-required'; mismatches: string[] }

const key = (t: Transfer) => `${t.from}>${t.to}|${t.asset}|${t.amount}`;

/**
 * What an independently observed transaction means for the approved settlement. Conservative by construction:
 *  - NOT_FOUND and UNAVAILABLE are NEVER failure and never confirmation: the outcome is unknown and must be re-read before anything is retried;
 *  - PENDING stays pending; FAILED is failed;
 *  - SUCCESS is reconciled only if the network and the multiset of transfers equal the approved settlement exactly (every asset, account and amount);
 *    any difference (extra, missing, altered, other network) is reconciliation-required, never silently accepted.
 */
export function verifyChainOutcome(expected: ExpectedSettlement, observed: ObservedTransaction): Verdict {
  if (observed.status === 'UNAVAILABLE' || observed.status === 'NOT_FOUND') return { state: 'unknown-outcome', mismatches: [observed.status === 'NOT_FOUND' ? 'the network has no record of the transaction (yet): outcome unknown' : 'the network could not be read: outcome unknown'] };
  if (observed.status === 'PENDING') return { state: 'pending', mismatches: [] };
  if (observed.status === 'FAILED') return { state: 'failed', mismatches: ['the transaction was included and failed'] };
  const mismatches: string[] = [];
  if (observed.network !== expected.network) mismatches.push(`observed on ${observed.network}, expected ${expected.network}`);
  const want = new Map<string, number>(); for (const t of expected.transfers) want.set(key(t), (want.get(key(t)) ?? 0) + 1);
  const got = new Map<string, number>(); for (const t of observed.transfers) got.set(key(t), (got.get(key(t)) ?? 0) + 1);
  for (const [k, n] of want) if ((got.get(k) ?? 0) < n) mismatches.push(`missing: ${k}`);
  for (const [k, n] of got) if ((want.get(k) ?? 0) < n) mismatches.push(`unexpected: ${k}`);
  return mismatches.length === 0 ? { state: 'reconciled', mismatches } : { state: 'reconciliation-required', mismatches };
}

/** The chain reader a future verifier must implement. NOT IMPLEMENTED in this build: no network read exists, so nothing can be marked confirmed. */
export interface ChainReader { readTransaction(network: string, hash: string): Promise<ObservedTransaction> }
