// Review rules shared by the calculation review and the settlement-batch review. The server is the authority (reviewer grant, separation of duties,
// staleness); these are the presentation rules around it.
import type { DecisionView } from "../tobin/types.ts";

export const REASON_MAX = 500;

/** A rejection needs a reason (1 to 500 characters), like the backend. Returns the message to show under the field, or null when acceptable. */
export function rejectReasonError(reason: string): string | null {
  const r = reason.trim();
  if (r.length === 0) return "Give a reason. A rejection cannot be recorded without one.";
  if (r.length > REASON_MAX) return `Use at most ${REASON_MAX} characters.`;
  if (/[\u0000-\u001f\u007f<>]/.test(r)) return "Do not use control characters, < or >.";
  return null;
}
export const canSubmitReject = (reason: string): boolean => rejectReasonError(reason) === null;

/** The line that must follow every recorded approval. An approval is an application decision, never a Stellar signature. */
export const APPROVAL_NOTE = "Approval recorded in Tobin. This is not an on-chain signature.";
export const hasActiveApproval = (decisions: readonly DecisionView[]): boolean => decisions.some((d) => d.decision === "approved" && d.status === "active");
export const approvalNote = (decisions: readonly DecisionView[]): string | null => (decisions.some((d) => d.decision === "approved") ? APPROVAL_NOTE : null);

export type DecisionLabel = "Approved" | "Rejected";
export const decisionLabel = (d: "approved" | "rejected"): DecisionLabel => (d === "approved" ? "Approved" : "Rejected");
export function decisionStatusText(status: string): string | null {
  return status === "active" ? null : status === "superseded" ? "Superseded by a newer calculation" : status === "invalidated" ? "No longer applies" : status;
}
