// Pure rules for institutional clearing authorization (MVP-1.3). No I/O. An authorization decision is an APPLICATION-LEVEL record bound to one immutable
// calculation snapshot. It is not a signature, not a Stellar transaction, not a settlement and not an on-chain fact.
import type { ActivityRecord, AuthorizationDecision, AuthorizationInvalidation, CalculationRecord, ObligationRecord } from './types.ts';
import type { Currency } from './clearing.ts';

/** active: authorizes (approved) or stands (rejected) for the current snapshot. superseded: a newer snapshot exists. invalidated: the data changed afterwards. */
export type DecisionStatus = 'active' | 'superseded' | 'invalidated';
export type AuthState = 'no-calculation' | 'stale' | 'awaiting-review' | 'approved' | 'rejected';

export function decisionStatus(d: AuthorizationDecision, inv: AuthorizationInvalidation | undefined, latest: CalculationRecord | undefined, currency: Currency): DecisionStatus {
  if (inv) return 'invalidated';
  if (!latest || latest.id !== d.calculationId) return 'superseded';
  if (currency !== 'current') return 'invalidated'; // defence in depth: an unrecorded change still cannot leave an active decision
  return 'active';
}

/** The state of the CURRENT snapshot: only a decision that is active for it counts. */
export function authState(latest: CalculationRecord | undefined, currency: Currency, active: AuthorizationDecision | undefined): AuthState {
  if (!latest) return 'no-calculation';
  if (currency !== 'current') return 'stale';
  if (!active) return 'awaiting-review';
  return active.decision === 'approved' ? 'approved' : 'rejected';
}

const short = (id: string) => id.slice(0, 8);

/**
 * Separation of duties for one snapshot: users who ran the calculation, or created, edited or voided any obligation in its input, cannot decide on it.
 * Determined from the obligation rows and from the append-only activity history, so an earlier editor of a later revision is still found.
 * Returns user id -> human-readable reason.
 */
export function conflictedActors(calc: CalculationRecord, obligations: readonly ObligationRecord[], activity: readonly ActivityRecord[]): Map<string, string> {
  const out = new Map<string, string>();
  out.set(calc.createdBy, 'you ran this calculation');
  const inInput = new Set(calc.input.obligations.map((o) => o.id));
  for (const o of obligations) {
    if (!inInput.has(o.id)) continue;
    for (const u of [o.createdBy, o.updatedBy]) if (!out.has(u)) out.set(u, `you recorded or changed obligation ${short(o.id)}, which is part of this calculation`);
  }
  const marks = [...inInput].map((id) => `obligation ${short(id)}`);
  for (const a of activity) {
    if (a.subject !== calc.sessionId || !a.kind.startsWith('obligation.') || out.has(a.actor)) continue;
    const hit = marks.find((m) => a.detail.startsWith(m));
    if (hit) out.set(a.actor, `you changed ${hit}, which is part of this calculation`);
  }
  return out;
}
