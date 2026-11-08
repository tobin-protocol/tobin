// Derived Overview data (decision D6). The API has no aggregate endpoint, so the counts below are computed from per-session requests. The number of
// sessions read is capped; whenever the cap applies the UI must say "Showing N sessions" so a total is never read as complete. The session TOTAL is not
// derived: it is the length of the one list response. Nothing here is a chain value.
import type { ActivityItem, AuthorizationView, ObligationView, SessionDetail, SessionRow, WorkflowState } from "../tobin/types.ts";

export const SESSION_REQUEST_CAP = 10;

export interface SessionBundle {
  row: SessionRow;
  detail?: SessionDetail;
  obligations?: ObligationView[];
  authorization?: AuthorizationView;
  /** true if any of this session's requests failed: the session is then excluded from the derived counts and reported */
  failed: boolean;
}

export interface AttentionItem { kind: "review" | "stale" | "invitations"; sessionId?: string; label: string; detail: string }
export interface RecentItem extends ActivityItem { sessionId: string; sessionLabel: string }

export interface OverviewDerived {
  sessionsTotal: number;
  sessionsRead: number;
  capped: boolean;
  unreadable: number;
  byWorkflow: Record<WorkflowState, number>;
  obligationsActive: number;
  obligationsVoided: number;
  attention: AttentionItem[];
  recent: RecentItem[];
}

/** The sessions to read: newest first, at most `cap`. The API returns rows newest first. */
export function selectForReading(rows: readonly SessionRow[], cap: number = SESSION_REQUEST_CAP): SessionRow[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, cap);
}

export function derive(
  rows: readonly SessionRow[],
  bundles: readonly SessionBundle[],
  who: { canDecide: boolean; canRecalculate: boolean },
  pendingInvitations: number | null,
  cap: number = SESSION_REQUEST_CAP,
): OverviewDerived {
  const ok = bundles.filter((b) => !b.failed);
  const byWorkflow: Record<WorkflowState, number> = { configuring: 0, ready: 0, closed: 0 };
  let active = 0;
  let voided = 0;
  const attention: AttentionItem[] = [];
  const recent: RecentItem[] = [];

  for (const b of ok) {
    if (b.detail) byWorkflow[b.detail.workflow] += 1;
    for (const o of b.obligations ?? []) {
      if (o.status === "active") active += 1;
      else voided += 1;
    }
    const a = b.authorization;
    if (a && who.canDecide && a.state === "awaiting-review" && a.eligibility.canDecide) attention.push({ kind: "review", sessionId: b.row.sessionId, label: b.row.label, detail: "A calculation is awaiting your review." });
    if (a && who.canRecalculate && a.state === "stale") attention.push({ kind: "stale", sessionId: b.row.sessionId, label: b.row.label, detail: "The calculation is stale. Recalculate before review." });
    for (const e of b.detail?.workspace.activity.items ?? []) recent.push({ ...e, sessionId: b.row.sessionId, sessionLabel: b.row.label });
  }
  if (pendingInvitations !== null && pendingInvitations > 0) attention.push({ kind: "invitations", label: "Invitations", detail: `${pendingInvitations} invitation${pendingInvitations === 1 ? "" : "s"} awaiting a response.` });

  recent.sort((x, y) => y.at.localeCompare(x.at));
  return {
    sessionsTotal: rows.length,
    sessionsRead: ok.length,
    capped: rows.length > cap,
    unreadable: bundles.length - ok.length,
    byWorkflow,
    obligationsActive: active,
    obligationsVoided: voided,
    attention,
    recent: recent.slice(0, 5),
  };
}
