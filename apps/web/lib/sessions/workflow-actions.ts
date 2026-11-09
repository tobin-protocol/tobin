// Mark ready and Close session: when each is available and, when it is not, the reason in words. Pure and tested. PRESENTATION ONLY: the server decides.
//
// What the console does (apps/web-console/lib/registry/service.ts, read 2026-11-09):
//   POST .../sessions/:id/ready  admin only (#need admin: FORBIDDEN "administrator role required"). The session must be "configuring" (INVALID_STATE
//        otherwise) and every readiness check except "state" must pass (INVALID_STATE "not ready: <labels>"). That includes a calculation that exists and is
//        current. It returns the readiness view: { state, ready, checks, currency, note }.
//   POST .../sessions/:id/close  admin only. The session must be "ready" (the only state that can become closed) AND the latest calculation must have a
//        settlement batch for it that is approved and still eligible (INVALID_STATE otherwise). Closure is operational: nothing has settled on any network.
//   POST .../sessions/:id/reopen  admin only; ready back to configuring; changes the workflow state only. See lib/sessions/reopen.ts for the consequences.
import { can, type Actor } from "../permissions/can.ts";
import type { BatchStatus, ReadinessCheck, WorkflowState } from "../tobin/types.ts";

export interface WorkflowActionFacts {
  workflow: WorkflowState;
  /** null: the checks could not be read */
  checks: readonly ReadinessCheck[] | null;
  /** the latest settlement batch: "none" when none was prepared, null when it could not be read */
  batch: BatchStatus | "none" | null;
  actor: Actor;
  /** the calculation has been approved (the lifecycle is past the Approval step). The console does not require it for Mark ready, but the UI offers Mark ready as the next step only after it */
  reviewed: boolean;
}
export interface WorkflowAction { enabled: boolean; /** why it is unavailable; null when enabled */ reason: string | null }
export interface WorkflowActions { markReady: WorkflowAction; close: WorkflowAction; reopen: WorkflowAction; primary: "close" | "ready" | null }

const BATCH_TEXT: Record<BatchStatus | "none", string> = {
  none: "No settlement has been prepared.",
  "awaiting-review": "The prepared settlement is still awaiting review.",
  approved: "",
  rejected: "The prepared settlement was rejected.",
  invalidated: "The prepared settlement was invalidated.",
  superseded: "The prepared settlement no longer applies to the current calculation.",
};

export function workflowActions(f: WorkflowActionFacts): WorkflowActions {
  const admin = can(f.actor, "sessions.manage");
  const no = (reason: string): WorkflowAction => ({ enabled: false, reason });
  const yes: WorkflowAction = { enabled: true, reason: null };

  const markReady: WorkflowAction = !admin.allowed ? no(admin.reason ?? "Only administrators can do this.")
    : f.workflow === "ready" ? no("This session is already marked ready.")
    : f.workflow === "closed" ? no("A closed session cannot change.")
    : f.checks === null ? no("The readiness checks could not be read, so this cannot be offered. Reload the page.")
    : (() => { const failed = f.checks.filter((c) => !c.ok && c.key !== "state"); return failed.length ? no(`Not ready yet: ${failed.map((c) => c.label.charAt(0).toLowerCase() + c.label.slice(1)).join("; ")}.`) : yes; })();

  const close: WorkflowAction = !admin.allowed ? no(admin.reason ?? "Only administrators can do this.")
    : f.workflow === "closed" ? no("This session is already closed.")
    : f.workflow === "configuring" ? no("Mark the session ready first. Only a ready session can be closed.")
    : f.batch === null ? no("The settlement state could not be read, so this cannot be offered. Reload the page.")
    : f.batch !== "approved" ? no(`Closing needs an approved settlement for the current calculation. ${BATCH_TEXT[f.batch]}`)
    : yes;

  // Reopen exists only for a ready session and the UI shows it only then; for anyone else it explains itself.
  const reopen: WorkflowAction = !admin.allowed ? no(admin.reason ?? "Only administrators can do this.")
    : f.workflow === "ready" ? yes
    : f.workflow === "closed" ? no("A closed session cannot be reopened.")
    : no("The session is already being configured.");

  return { markReady, close, reopen, primary: close.enabled ? "close" : markReady.enabled && f.reviewed ? "ready" : null };
}
