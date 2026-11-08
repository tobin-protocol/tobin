// Organization-wide activity, DERIVED from per-session reads (decision D6). The backend keeps one activity log per organization but serves it only through a
// session's detail, filtered to that session; events without a session subject (member, invitation, reviewer and organization changes) cannot be read.
// There is no "result" field and no per-event reference: the outcome below is derived from the event KIND alone and labelled as such.
import type { ActivityItem, SessionRow } from "../tobin/types.ts";
import { SESSION_REQUEST_CAP } from "../derived/overview.ts";

export type Outcome = "Refused" | "Rejected" | "No longer applies" | "Recorded";
export interface ActivityEntry extends ActivityItem { sessionId: string; sessionLabel: string; outcome: Outcome }

/** What the event kind says happened. "Recorded" means nothing in the kind marks it as a refusal, rejection or invalidation. */
export function outcomeOf(kind: string): Outcome {
  if (kind.endsWith(".failed")) return "Refused";
  if (kind.includes("rejected")) return "Rejected";
  if (kind.includes("invalidated")) return "No longer applies";
  return "Recorded";
}

export interface SessionActivityRead { row: SessionRow; items?: readonly ActivityItem[]; failed: boolean }
export interface DerivedActivity { entries: ActivityEntry[]; sessionsTotal: number; sessionsRead: number; capped: boolean; unreadable: number }

export function deriveActivity(rows: readonly SessionRow[], reads: readonly SessionActivityRead[], cap: number = SESSION_REQUEST_CAP): DerivedActivity {
  const ok = reads.filter((r) => !r.failed && r.items);
  const entries = ok.flatMap((r) => (r.items ?? []).map((e): ActivityEntry => ({ ...e, sessionId: r.row.sessionId, sessionLabel: r.row.label, outcome: outcomeOf(e.kind) })));
  entries.sort((a, b) => b.at.localeCompare(a.at));
  return { entries, sessionsTotal: rows.length, sessionsRead: ok.length, capped: rows.length > cap, unreadable: reads.length - ok.length };
}

export interface ActivityFilter { kind: string; sessionId: string; from: string; to: string; outcome: "" | Outcome }
export const NO_FILTER: ActivityFilter = { kind: "", sessionId: "", from: "", to: "", outcome: "" };

/** from and to are YYYY-MM-DD, inclusive, UTC. An invalid or empty bound is ignored. */
export function applyActivityFilter(entries: readonly ActivityEntry[], f: ActivityFilter): ActivityEntry[] {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const from = day.test(f.from) ? `${f.from}T00:00:00.000Z` : "";
  const to = day.test(f.to) ? `${f.to}T23:59:59.999Z` : "";
  return entries.filter((e) =>
    (!f.kind || e.kind === f.kind) && (!f.sessionId || e.sessionId === f.sessionId) && (!f.outcome || e.outcome === f.outcome) &&
    (!from || e.at >= from) && (!to || e.at <= to));
}

export const eventKinds = (entries: readonly ActivityEntry[]): string[] => [...new Set(entries.map((e) => e.kind))].sort();
