// The sessions most worth opening, for the Overview (redesign PRD 6.2: "Which clearing sessions are active or relevant?"). DERIVED from the per-session reads
// the Overview already makes (decision D6): at most SESSION_REQUEST_CAP sessions, so it is a subset and the page says so. Each entry says where the session
// stands using only facts that were read; a session that could not be read is left out, never guessed.
import type { SessionBundle } from "./overview.ts";
import type { WorkflowState } from "../tobin/types.ts";

export type Tone = "attention" | "progress" | "idle";
export interface RelevantSession {
  sessionId: string; label: string; stage: string; tone: Tone; priority: number; workflow: WorkflowState | null; activeObligations: number | null; createdAt: string;
  /** the tab that holds what the user should look at */
  tab: "overview" | "obligations" | "netting" | "approvals" | "settlement";
}

export function stageOf(b: SessionBundle, who: { canDecide: boolean; canRecalculate: boolean }): Pick<RelevantSession, "stage" | "tone" | "priority" | "tab"> {
  const a = b.authorization;
  const active = b.obligations ? b.obligations.filter((o) => o.status === "active").length : null;
  if (b.detail?.workflow === "closed") return { stage: "Closed", tone: "idle", priority: 6, tab: "overview" };
  if (a?.state === "awaiting-review") return who.canDecide && a.eligibility.canDecide ? { stage: "Awaiting your review", tone: "attention", priority: 0, tab: "approvals" } : { stage: "Awaiting review", tone: "progress", priority: 2, tab: "approvals" };
  if (a?.state === "stale") return { stage: "Calculation is stale", tone: who.canRecalculate ? "attention" : "progress", priority: who.canRecalculate ? 1 : 2, tab: "netting" };
  if (a?.state === "approved") return { stage: "Approved: settlement can be prepared", tone: "progress", priority: 3, tab: "settlement" };
  if (a?.state === "rejected") return { stage: "Calculation rejected", tone: "progress", priority: 3, tab: "approvals" };
  if (active === 0) return { stage: "No obligations yet", tone: "idle", priority: 5, tab: "obligations" };
  if (active !== null && active > 0) return { stage: "Ready to calculate", tone: "progress", priority: 4, tab: "netting" };
  return { stage: "Open the session", tone: "idle", priority: 5, tab: "overview" };
}

export function relevantSessions(bundles: readonly SessionBundle[], who: { canDecide: boolean; canRecalculate: boolean }, limit = 5): RelevantSession[] {
  return bundles
    .filter((b) => !b.failed)
    .map((b): RelevantSession => ({
      sessionId: b.row.sessionId, label: b.row.label, workflow: b.detail?.workflow ?? null, createdAt: b.row.createdAt,
      activeObligations: b.obligations ? b.obligations.filter((o) => o.status === "active").length : null, ...stageOf(b, who),
    }))
    .sort((x, y) => x.priority - y.priority || y.createdAt.localeCompare(x.createdAt))
    .slice(0, limit);
}
