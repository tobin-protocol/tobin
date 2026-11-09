// Where an activity record leads (redesign PRD 12.2: "navigate from an activity record to its associated entity"). The backend gives an event kind and a
// session, not an entity id, so the link goes to the section of the session that holds the affected records. Pure.
export type EntityTab = "overview" | "participants" | "obligations" | "netting" | "approvals" | "settlement";
export interface EntityLink { tab: EntityTab; label: string; href: string }

export function entityOf(kind: string, sessionId: string): EntityLink {
  const tab: EntityTab =
    kind.startsWith("obligation.") ? "obligations"
    : kind.startsWith("netting.") ? "netting"
    : kind.startsWith("authorization.") ? "approvals"
    : kind.startsWith("settlement.") ? "settlement"
    : kind.startsWith("session.participant") ? "participants"
    : "overview";
  const label = { overview: "Session", participants: "Participants", obligations: "Obligations", netting: "Netting", approvals: "Approvals", settlement: "Settlement" }[tab];
  return { tab, label, href: tab === "overview" ? `/sessions/${sessionId}` : `/sessions/${sessionId}?tab=${tab}` };
}
