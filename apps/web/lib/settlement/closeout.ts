// The Settlement tab's linear close-out: five numbered steps and which one is current. Pure and tested. It only reads facts the backend reports; nothing is
// inferred past a fact that could not be read (the walk stops there, like the session lifecycle). Only the first three steps have actions; the fourth is a
// read-only record and the fifth (sign, submit, verify) is not supported, because no route exists for it.
import type { AuthState, BatchStatus } from "../tobin/types.ts";

export type StepKey = "review" | "prepare" | "batch" | "execution" | "sign";
export type StepState = "done" | "current" | "blocked" | "upcoming" | "readonly" | "unsupported" | "unread";
export interface CloseOutStep { key: StepKey; number: number; label: string; role: string; state: StepState; note: string }

export interface CloseOutFacts {
  /** the session is closed */
  closed: boolean;
  /** null: the review state could not be read */
  auth: AuthState | null;
  /** the latest settlement batch: "none" when none was prepared, null when it could not be read */
  batch: BatchStatus | "none" | null;
  /** the prepared settlement does not reconcile with the approved calculation (the red diff). null: no batch to compare */
  mismatch: boolean | null;
}

export const STEP_LABEL: Record<StepKey, { label: string; role: string }> = {
  review: { label: "Review calculation", role: "A reviewer" },
  prepare: { label: "Prepare settlement", role: "An administrator" },
  batch: { label: "Review settlement", role: "A second reviewer, not the preparer" },
  execution: { label: "Execution record", role: "Read-only" },
  sign: { label: "Sign, submit, verify", role: "Not supported" },
};
export const STEP_ORDER: readonly StepKey[] = ["review", "prepare", "batch", "execution", "sign"];

/**
 * What each step lets the user do. EVERY action has exactly one confirmation (its own dialog, opened and confirmed once). A rejection collects its required
 * reason inside that same dialog, not in a second one. Steps 4 and 5 have no action at all.
 */
export const STEP_ACTIONS: Record<StepKey, readonly { id: string; confirms: 1; needsReason: boolean }[]> = {
  review: [{ id: "approve-calculation", confirms: 1, needsReason: false }, { id: "reject-calculation", confirms: 1, needsReason: true }],
  prepare: [{ id: "prepare-settlement", confirms: 1, needsReason: false }],
  batch: [{ id: "approve-settlement", confirms: 1, needsReason: false }, { id: "reject-settlement", confirms: 1, needsReason: true }],
  execution: [],
  sign: [],
};

const live = (b: BatchStatus | "none" | null): boolean => b === "awaiting-review" || b === "approved";

export function closeOutOf(f: CloseOutFacts): { steps: CloseOutStep[]; current: StepKey | null } {
  const mk = (key: StepKey, state: StepState, note: string): CloseOutStep => ({ key, number: STEP_ORDER.indexOf(key) + 1, ...STEP_LABEL[key], state, note });
  const sign = mk("sign", "unsupported", "This app cannot sign, submit or verify a transaction. No route exists, so nothing is ever shown as settled.");

  if (f.closed) {
    return { current: null, steps: [
      mk("review", "done", "The session is closed."), mk("prepare", "done", "The session is closed."), mk("batch", "done", "The session is closed."),
      mk("execution", "readonly", "Read-only record of what the backend holds."), sign,
    ] };
  }
  // a fact that could not be read stops the walk: later steps are not marked done or current on a failed read
  if (f.auth === null) {
    return { current: null, steps: [mk("review", "unread", "The review state could not be read, so progress after this point is not shown."), mk("prepare", "upcoming", "Waits for the review."), mk("batch", "upcoming", "Waits for the preparation."), mk("execution", "upcoming", "Waits for a prepared settlement."), sign] };
  }

  const reviewDone = f.auth === "approved";
  const review = f.auth === "awaiting-review" ? mk("review", "current", "A reviewer approves or rejects this exact calculation.")
    : reviewDone ? mk("review", "done", "The calculation is approved. Approval recorded in Tobin; this is not an on-chain signature.")
    : f.auth === "rejected" ? mk("review", "blocked", "The calculation was rejected. Change the inputs and calculate again.")
    : f.auth === "stale" ? mk("review", "blocked", "The reviewed calculation is stale. Calculate again.")
    : mk("review", "blocked", "There is no calculation to review. Run netting first.");

  if (!reviewDone) {
    return { current: review.state === "current" ? "review" : null, steps: [review, mk("prepare", "upcoming", "Waits for an approved calculation."), mk("batch", "upcoming", "Waits for the preparation."), mk("execution", "upcoming", "Waits for a prepared settlement."), sign] };
  }
  if (f.batch === null) {
    return { current: null, steps: [review, mk("prepare", "unread", "The settlement state could not be read, so progress after this point is not shown."), mk("batch", "upcoming", "Waits for the preparation."), mk("execution", "upcoming", "Waits for a prepared settlement."), sign] };
  }

  const prepared = live(f.batch);
  const prepare = prepared ? mk("prepare", "done", "Instructions were prepared from the approved calculation. Preparing is not executing.")
    : f.batch === "none" ? mk("prepare", "current", "An administrator prepares the instructions from the approved calculation.")
    : mk("prepare", "current", f.batch === "rejected" ? "The previous settlement was rejected. Prepare it again." : "The previous settlement no longer applies. Prepare it again.");
  const batch = f.batch === "awaiting-review" ? (f.mismatch ? mk("batch", "blocked", "The prepared settlement does not match the approved result. Approval is blocked; a reviewer can still reject it.") : mk("batch", "current", "A reviewer other than the preparer approves or rejects exactly these instructions."))
    : f.batch === "approved" ? mk("batch", "done", "The settlement is approved. Approval recorded in Tobin; this is not an on-chain signature.")
    : mk("batch", "upcoming", "Waits for the preparation.");
  const execution = f.batch === "none" ? mk("execution", "upcoming", "Waits for a prepared settlement.") : mk("execution", "readonly", "Read-only record of what the backend holds for this settlement.");

  const steps = [review, prepare, batch, execution, sign];
  const current = prepare.state === "current" ? "prepare" : f.batch === "awaiting-review" ? "batch" : null;
  return { steps, current };
}

/** Approval of a prepared settlement is blocked by any mismatch; rejecting it is not (a reviewer must be able to refuse a bad batch). */
export const batchApprovalBlocked = (mismatch: boolean | null): boolean => mismatch === true;
