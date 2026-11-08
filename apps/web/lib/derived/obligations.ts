// Global Obligations list (decision D6): derived from per-session reads. The API has no cross-session obligation endpoint, so this is built from the
// obligations of at most SESSION_REQUEST_CAP sessions and the page must say "Showing N of M sessions". Totals are per asset, never across assets.
import { totalsByAsset } from "../netting/group.ts";
import type { ObligationView, SessionRow } from "../tobin/types.ts";
import { SESSION_REQUEST_CAP } from "./overview.ts";

export interface SessionObligations { row: SessionRow; obligations?: ObligationView[]; failed: boolean }
export interface GlobalObligation extends ObligationView { sessionId: string; sessionLabel: string }
export interface GlobalObligations {
  items: GlobalObligation[];
  sessionsTotal: number;
  sessionsRead: number;
  capped: boolean;
  unreadable: number;
  totals: ReturnType<typeof totalsByAsset>;
}

export function deriveGlobalObligations(rows: readonly SessionRow[], reads: readonly SessionObligations[], cap: number = SESSION_REQUEST_CAP): GlobalObligations {
  const ok = reads.filter((r) => !r.failed && r.obligations);
  const items = ok.flatMap((r) => (r.obligations ?? []).map((o): GlobalObligation => ({ ...o, sessionId: r.row.sessionId, sessionLabel: r.row.label })));
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { items, sessionsTotal: rows.length, sessionsRead: ok.length, capped: rows.length > cap, unreadable: reads.length - ok.length, totals: totalsByAsset(items) };
}
