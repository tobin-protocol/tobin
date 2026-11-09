// The command panel searches sessions this browser has already loaded. It lists at most COMMAND_SESSION_CAP of them, newest first, and says so when the cap cuts
// the list short, so a missing session is never mistaken for a missing record. Pure and tested.
import type { SessionRow } from "../tobin/types.ts";

export const COMMAND_SESSION_CAP = 300;
export const COMMAND_CAP_NOTE = `Showing the newest ${COMMAND_SESSION_CAP} sessions`;

export function commandSessions(rows: readonly Pick<SessionRow, "sessionId" | "label" | "createdAt">[] | undefined): { items: { sessionId: string; label: string }[]; capped: boolean; total: number; note: string | null } {
  const all = [...(rows ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.sessionId.localeCompare(b.sessionId));
  const capped = all.length > COMMAND_SESSION_CAP;
  return { items: all.slice(0, COMMAND_SESSION_CAP).map((r) => ({ sessionId: r.sessionId, label: r.label })), capped, total: all.length, note: capped ? COMMAND_CAP_NOTE : null };
}
