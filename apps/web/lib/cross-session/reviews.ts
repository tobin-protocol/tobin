// The review queue: calculations and settlement batches that are awaiting a reviewer, across the sessions that were read. ONE function builds it, and both the
// Reviews page and the sidebar count call it, so the two cannot disagree. Pure and tested. PRESENTATION ONLY: nothing is decided here (the list makes no
// decisions); each row leads to the Settlement step of its session, where the server decides, including separation of duties.
import type { Bundle } from "./overview.ts";
import type { BatchSummary } from "../tobin/types.ts";

export type ReviewKind = "calculation" | "settlement";
export interface ReviewRow {
  key: string;
  kind: ReviewKind;
  sessionId: string;
  sessionLabel: string;
  /** the settlement step this row opens */
  href: string;
  /** who prepared the batch. For a calculation the authorization view does not say who calculated it, so this is null */
  preparedBy: string | null;
  preparedAt: string | null;
  /** batch facts, when the row is a settlement */
  batchId: string | null;
  asset: string | null;
  /** can the viewer review it, as far as the data shows. The server decides when they act */
  mine: boolean;
  /** why not, in words; null when mine */
  reason: string | null;
}
export interface Viewer { reviewer: boolean; displayName: string }

export const SEPARATION_NOTE = "Nobody reviews a result they recorded, changed, calculated or prepared. The server enforces it.";

const latest = (batches: readonly BatchSummary[]): BatchSummary | null =>
  [...batches].sort((a, b) => b.preparedAt.localeCompare(a.preparedAt) || b.attempt - a.attempt)[0] ?? null;

/** Every row awaiting review in the bundles (only bundles whose reads succeeded), newest preparation first where known, then by session label. */
export function reviewQueue(bundles: readonly Bundle[], viewer: Viewer): ReviewRow[] {
  const out: ReviewRow[] = [];
  for (const b of bundles) {
    if (b.failed) continue;
    const a = b.authorization;
    if (a && a.state === "awaiting-review") {
      const mine = viewer.reviewer && a.eligibility.canDecide;
      out.push({
        key: `calc-${b.row.sessionId}`, kind: "calculation", sessionId: b.row.sessionId, sessionLabel: b.row.label,
        href: `/sessions/${b.row.sessionId}?tab=settlement&step=review`, preparedBy: null, preparedAt: null, batchId: null, asset: null, mine,
        reason: mine ? null : !viewer.reviewer ? "You need the reviewer capability to decide." : a.eligibility.reasons.join(" ") || "The server does not let you decide this calculation.",
      });
    }
    const s = b.settlement ? latest(b.settlement.batches) : null;
    if (s && s.status === "awaiting-review") {
      const prepared = s.preparedBy === viewer.displayName;
      const mine = viewer.reviewer && !prepared;
      out.push({
        key: `batch-${b.row.sessionId}-${s.id}`, kind: "settlement", sessionId: b.row.sessionId, sessionLabel: b.row.label,
        href: `/sessions/${b.row.sessionId}?tab=settlement&step=batch`, preparedBy: s.preparedBy, preparedAt: s.preparedAt, batchId: s.id, asset: s.asset.code, mine,
        reason: mine ? null : !viewer.reviewer ? "You need the reviewer capability to decide." : "You prepared this settlement, so another reviewer must review it.",
      });
    }
  }
  return out.sort((x, y) => (y.preparedAt ?? "").localeCompare(x.preparedAt ?? "") || x.sessionLabel.localeCompare(y.sessionLabel) || x.kind.localeCompare(y.kind));
}

export const mineOf = (rows: readonly ReviewRow[]): ReviewRow[] => rows.filter((r) => r.mine);

/**
 * The number on the sidebar's Reviews item: the rows of "My reviews". null until a page has loaded both the authorizations AND the settlement lists of the
 * sessions in the window (so it never counts half the queue), and null for anyone who is not a reviewer.
 */
export function reviewsBadge(bundles: readonly Bundle[], viewer: Viewer, windowSize: number): number | null {
  if (!viewer.reviewer) return null;
  const complete = bundles.filter((b) => !b.failed && b.authorization && b.settlement);
  if (windowSize === 0 || complete.length < windowSize) return null;
  return mineOf(reviewQueue(complete, viewer)).length;
}
