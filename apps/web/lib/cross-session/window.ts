// The pure part of the cross-session reads: which sessions are read, how far the reading reaches, and how that is said to the user. The API has no aggregate
// endpoint, so every cross-session figure is built from per-session reads of the newest sessions; the window below is how many. Decision D6.
import type { SessionRow } from "../tobin/types.ts";

/** Sessions read at first, and added by each "Load next 10 sessions". */
export const INITIAL_CAP = 10;
export const LOAD_STEP = 10;

/** The newest `cap` sessions. The sort is stable on the id so two sessions created in the same millisecond keep a fixed order. */
export function windowOf(rows: readonly SessionRow[], cap: number): SessionRow[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.sessionId.localeCompare(b.sessionId)).slice(0, Math.max(0, cap));
}

export const canLoadMore = (cap: number, total: number): boolean => total > cap;
/** The cap after "Load next 10 sessions": never past the total, never below the current cap. */
export const nextCap = (cap: number, total: number): number => Math.max(cap, Math.min(cap + LOAD_STEP, total));

export interface Coverage { read: number; total: number; unreadable: number; complete: boolean; text: string }

/**
 * What the figures are based on. `read` is the number of sessions whose reads all succeeded; a session that failed is counted as unreadable, never as zero.
 * "Based on N of M sessions" is the sentence every cross-session figure carries; when everything was read it says so.
 */
export function coverageOf(read: number, total: number, unreadable = 0): Coverage {
  const complete = total === 0 || (read === total && unreadable === 0);
  const base = total === 0 ? "No sessions yet" : complete ? `Based on all ${total} session${total === 1 ? "" : "s"}` : `Based on ${read} of ${total} sessions`;
  return { read, total, unreadable, complete, text: unreadable > 0 ? `${base}. ${unreadable} could not be read and ${unreadable === 1 ? "is" : "are"} left out.` : base };
}
