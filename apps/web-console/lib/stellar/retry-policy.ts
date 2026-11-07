// Retry policy for settlement execution ATTEMPTS (pure). A batch is the approved economics; an attempt is one technical try to execute it. The rules below are the
// MVP-1.5 policy. The invariant that matters most: an UNKNOWN outcome never leads to a new submission. It is resolved only by reading the network for the original
// transaction hash, and only then may a decision be made.
import type { ExecState } from '../registry/settlement-state.ts';

export const ACTIVE_STATES: readonly ExecState[] = ['awaiting-signer', 'signing', 'signed', 'submission-pending', 'submitted'];

export interface AttemptDecision { allowed: boolean; reason: string }

/**
 * May a NEW attempt be started, given the state of the most recent attempt (undefined = none yet)?
 *  - none yet: yes (attempt 1)
 *  - an attempt is still active: no (one live attempt at a time; a rejected signature simply returns THAT attempt to awaiting-signer)
 *  - unknown outcome: no, until the network has been read and the original transaction is established (the attempt then moves to confirmed, failed or expired)
 *  - confirmed or reconciled: no. A confirmed success is final: no retry, ever
 *  - reconciliation required: no. The chain and the approved batch differ: a person must resolve it; nothing is retried
 *  - expired: yes, after the caller has revalidated the batch (done by the service) - the old transaction can no longer execute
 *  - failed: yes only after an explicit review (a failed transaction may still have had effects elsewhere; the caller must assert it was assessed)
 */
export function mayStartAttempt(last: ExecState | undefined, o: { reviewedFailure?: boolean } = {}): AttemptDecision {
  if (last === undefined) return { allowed: true, reason: 'first attempt' };
  if ((ACTIVE_STATES as readonly string[]).includes(last)) return { allowed: false, reason: `the previous attempt is still ${last}: only one attempt may be live` };
  switch (last) {
    case 'unknown-outcome': return { allowed: false, reason: 'the previous outcome is unknown: read the network for the original transaction before anything else; a timeout is not a failure' };
    case 'confirmed': return { allowed: false, reason: 'the previous attempt was confirmed on chain: a confirmed settlement is never retried (reconcile it)' };
    case 'reconciled': return { allowed: false, reason: 'the settlement is complete and reconciled: nothing to retry' };
    case 'reconciliation-required': return { allowed: false, reason: 'the chain result differs from the approved batch: an authorized person must resolve it; nothing is retried' };
    case 'expired': return { allowed: true, reason: 'the previous transaction expired before it executed: a new attempt after revalidation' };
    case 'failed': return o.reviewedFailure ? { allowed: true, reason: 'the previous attempt failed and the failure was reviewed' } : { allowed: false, reason: 'the previous attempt failed: review the failure and state that a new attempt is safe' };
    default: return { allowed: false, reason: 'unknown state' };
  }
}

/** What a submission response means for the attempt state. Nothing here is "confirmed": only an independent read of the hash can confirm. */
export type SubmitKind = 'accepted' | 'duplicate' | 'rejected' | 'unknown';
export function stateAfterSubmission(kind: SubmitKind): ExecState {
  switch (kind) {
    case 'accepted': return 'submitted';          // queued, not confirmed
    case 'duplicate': return 'submitted';         // the network already has it: look it up, do not send again
    case 'rejected': return 'failed';             // refused before inclusion; investigate before any retry (mayStartAttempt demands a review)
    case 'unknown': return 'unknown-outcome';     // never failed, never resubmitted
  }
}
