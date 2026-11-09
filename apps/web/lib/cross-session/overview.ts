// Overview figures built from the cross-session reads (detail of each session, and its authorization when the viewer can act on one). Pure and tested.
// Everything here is DERIVED from the sessions that were read and says so through the coverage line; nothing is a chain value and nothing is summed across assets.
import type { ActivityItem, AuthorizationView, SessionDetail, SessionRow, WorkflowState } from "../tobin/types.ts";
import { coverageOf, type Coverage } from "./window.ts";

export interface Bundle {
  row: SessionRow;
  detail?: SessionDetail;
  authorization?: AuthorizationView;
  /** a part that was requested and could not be read: the session is left out of every count and reported as unreadable */
  failed: boolean;
}

export interface Who { canDecide: boolean; canRecalculate: boolean }
export type AttentionKind = "review" | "stale" | "invitations";
export interface AttentionItem { kind: AttentionKind; sessionId?: string; label: string; detail: string; /** where the action is */ href: string; action: string }
export interface RecentItem extends ActivityItem { sessionId: string; sessionLabel: string }

export interface OverviewFigures {
  sessionsTotal: number;
  byWorkflow: Record<WorkflowState, number>;
  awaitingReview: number;
  stale: number;
  attention: AttentionItem[];
  recent: RecentItem[];
  coverage: Coverage;
}

export function overviewOf(rows: readonly SessionRow[], bundles: readonly Bundle[], who: Who, pendingInvitations: number | null): OverviewFigures {
  const ok = bundles.filter((b) => !b.failed);
  const byWorkflow: Record<WorkflowState, number> = { configuring: 0, ready: 0, closed: 0 };
  const attention: AttentionItem[] = [];
  const recent: RecentItem[] = [];
  let awaitingReview = 0;
  let stale = 0;
  for (const b of ok) {
    if (b.detail) byWorkflow[b.detail.workflow] += 1;
    const a = b.authorization;
    if (a && who.canDecide && a.state === "awaiting-review" && a.eligibility.canDecide) {
      awaitingReview += 1;
      attention.push({ kind: "review", sessionId: b.row.sessionId, label: b.row.label, detail: "A calculation is awaiting your review.", href: `/sessions/${b.row.sessionId}?tab=approvals`, action: "Review" });
    }
    if (a && who.canRecalculate && a.state === "stale") {
      stale += 1;
      attention.push({ kind: "stale", sessionId: b.row.sessionId, label: b.row.label, detail: "The calculation is stale. Recalculate before it can be reviewed.", href: `/sessions/${b.row.sessionId}?tab=netting`, action: "Recalculate" });
    }
    for (const e of b.detail?.workspace.activity.items ?? []) recent.push({ ...e, sessionId: b.row.sessionId, sessionLabel: b.row.label });
  }
  if (pendingInvitations !== null && pendingInvitations > 0) attention.unshift({ kind: "invitations", label: "Invitations", detail: `${pendingInvitations} invitation${pendingInvitations === 1 ? "" : "s"} awaiting a response.`, href: "/organization?tab=invitations", action: "Open" });
  recent.sort((x, y) => y.at.localeCompare(x.at));
  return { sessionsTotal: rows.length, byWorkflow, awaitingReview, stale, attention, recent: recent.slice(0, 5), coverage: coverageOf(ok.length, rows.length, bundles.length - ok.length) };
}

/**
 * The count on the Reviews item. It reads only what the cross-session hook has already loaded (it makes no request of its own), so it is null until a page
 * has loaded that data. It counts calculations awaiting THIS user's review; settlement batches are counted once the Reviews page loads them.
 */
export function pendingReviews(bundles: readonly Bundle[], who: Pick<Who, "canDecide">): number | null {
  if (!who.canDecide) return null;
  const withAuth = bundles.filter((b) => !b.failed && b.authorization);
  if (withAuth.length === 0) return null;
  return withAuth.filter((b) => b.authorization?.state === "awaiting-review" && b.authorization.eligibility.canDecide).length;
}
