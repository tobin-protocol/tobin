// Maps the backend facts onto the six stepper groups (docs/web-app-plan.md section 5a). Pure: no I/O. Every stage is an Application record
// (the session is a local draft; nothing is on-chain). A fact that could not be read stops the walk: later groups are never marked done on a failed read.
import type { AuthState, Currency, WorkflowState } from "../tobin/types.ts";

export const GROUPS = ["Draft", "Participation", "Obligations", "Netting", "Approval", "Settlement"] as const;

/** null means "could not be read". */
export interface LifecycleFacts {
  workflow: WorkflowState;
  activeParticipants: number | null;
  activeObligations: number | null;
  currency: Currency | null;
  auth: AuthState | null;
}
export interface LifecycleView {
  /** index of the current group; GROUPS.length means every group is done (a closed session) */
  currentIndex: number;
  subLabel: string;
  /** true when the walk stopped because a fact could not be read */
  unread: boolean;
}

export function lifecycleOf(f: LifecycleFacts): LifecycleView {
  if (f.workflow === "closed") return { currentIndex: GROUPS.length, subLabel: "Closed. A closed session cannot change", unread: false };
  const stop = (i: number, subLabel: string, unread = false): LifecycleView => ({ currentIndex: i, subLabel, unread });
  const unreadAt = (i: number) => stop(i, `${GROUPS[i]} could not be read, so progress after this point is not shown`, true);

  if (f.activeParticipants === null) return unreadAt(1);
  if (f.activeParticipants < 2) return stop(1, `${f.activeParticipants} active participant${f.activeParticipants === 1 ? "" : "s"}; at least 2 are needed`);
  if (f.activeObligations === null) return unreadAt(2);
  if (f.activeObligations < 1) return stop(2, "No active obligations; at least 1 is needed");
  if (f.currency === null) return unreadAt(3);
  if (f.currency === "none") return stop(3, "No calculation yet");
  if (f.currency === "stale") return stop(3, "The calculation is stale: participants or obligations changed after it");
  if (f.auth === null) return unreadAt(4);
  if (f.auth === "awaiting-review") return stop(4, "Calculation awaiting review");
  if (f.auth === "rejected") return stop(4, "The calculation was rejected; change the inputs and recalculate");
  if (f.auth === "stale") return stop(4, "The reviewed calculation is stale");
  if (f.auth === "no-calculation") return stop(4, "No calculation to review");
  return stop(5, f.workflow === "ready"
    ? "Approved and marked ready. Settlement preparation is built in Phase D"
    : "Approved. The session is not yet marked ready");
}
