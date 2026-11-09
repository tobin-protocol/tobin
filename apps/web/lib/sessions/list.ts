// Sessions list: search, filter, sort and pagination. The backend list endpoint offers none of these (docs/web-app-plan.md section 5a), so they run in the
// browser over the full list the API returned. The query lives in the URL; defaults are omitted from it so a plain /sessions stays plain.
import type { SessionRow, WorkflowState } from "../tobin/types.ts";

export const PAGE_SIZE = 10;
export type ProvenanceFilter = "all" | SessionRow["provenance"];
export type SortKey = "created" | "label" | "activity";
export type StatusFilter = "all" | WorkflowState;
export const STATUS_FILTERS: readonly StatusFilter[] = ["all", "configuring", "ready", "closed"];
export interface ListQuery { q: string; provenance: ProvenanceFilter; hasActivity: boolean; sort: SortKey; dir: "asc" | "desc"; page: number; status: StatusFilter }

export const DEFAULT_QUERY: ListQuery = { q: "", provenance: "all", hasActivity: false, sort: "created", dir: "desc", page: 1, status: "all" };
const PROVENANCES = ["all", "fixture", "local-draft", "chain-read", "chain-confirmed"] as const;
const SORTS = ["created", "label", "activity"] as const;

type Params = { get(name: string): string | null };

export function parseQuery(p: Params): ListQuery {
  const pv = p.get("provenance");
  const sort = p.get("sort");
  const page = Number.parseInt(p.get("page") ?? "1", 10);
  return {
    q: (p.get("q") ?? "").slice(0, 80),
    provenance: (PROVENANCES as readonly string[]).includes(pv ?? "") ? (pv as ProvenanceFilter) : "all",
    hasActivity: p.get("activity") === "1",
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as SortKey) : "created",
    dir: p.get("dir") === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    status: (STATUS_FILTERS as readonly string[]).includes(p.get("status") ?? "") ? (p.get("status") as StatusFilter) : "all",
  };
}

export function serializeQuery(q: ListQuery): string {
  const s = new URLSearchParams();
  if (q.q) s.set("q", q.q);
  if (q.provenance !== "all") s.set("provenance", q.provenance);
  if (q.hasActivity) s.set("activity", "1");
  if (q.sort !== DEFAULT_QUERY.sort) s.set("sort", q.sort);
  if (q.dir !== DEFAULT_QUERY.dir) s.set("dir", q.dir);
  if (q.page !== 1) s.set("page", String(q.page));
  if (q.status !== "all") s.set("status", q.status);
  const out = s.toString();
  return out ? `?${out}` : "";
}

export interface ListResult { rows: SessionRow[]; total: number; matched: number; page: number; pages: number }

export function applyQuery(all: readonly SessionRow[], q: ListQuery): ListResult {
  const needle = q.q.trim().toLowerCase();
  const filtered = all.filter((r) =>
    (!needle || r.label.toLowerCase().includes(needle) || r.sessionId.toLowerCase().includes(needle)) &&
    (q.provenance === "all" || r.provenance === q.provenance) &&
    (!q.hasActivity || r.activityCount > 0));
  const sign = q.dir === "asc" ? 1 : -1;
  const key = (r: SessionRow): string => (q.sort === "label" ? r.label.toLowerCase() : q.sort === "activity" ? r.lastActivity ?? "" : r.createdAt);
  const sorted = [...filtered].sort((a, b) => {
    const ka = key(a); const kb = key(b);
    return (ka < kb ? -1 : ka > kb ? 1 : a.sessionId < b.sessionId ? -1 : 1) * sign;
  });
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(q.page, pages);
  return { rows: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: all.length, matched: sorted.length, page, pages };
}

/**
 * The workflow state is not in the list response, so a status filter can only work on rows whose state was read: the rows of the page being shown. A row whose
 * state is unknown (still reading, or failed) is kept out of a filtered view and counted, never guessed.
 */
export function filterByState<T extends { sessionId: string }>(rows: readonly T[], states: Readonly<Record<string, WorkflowState | undefined>>, status: StatusFilter): { rows: T[]; unknown: number } {
  if (status === "all") return { rows: [...rows], unknown: 0 };
  const kept = rows.filter((r) => states[r.sessionId] === status);
  return { rows: kept, unknown: rows.filter((r) => states[r.sessionId] === undefined).length };
}
