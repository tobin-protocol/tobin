// The "Next action" card and the right-hand action panel are driven by this one pure function. It returns who must act, whether that is the current user,
// and the single primary action. An action that belongs to a later phase is returned with `blockedBy` set: it is shown disabled with the reason,
// never faked. `can()` is presentation only; the server decides.
import { can, type Actor, type Capability } from "../permissions/can.ts";
import { GROUPS, type LifecycleView } from "./lifecycle.ts";

export type TabKey = "overview" | "participants" | "obligations" | "netting" | "approvals" | "settlement" | "activity";
export interface NextAction {
  title: string;
  who: string;
  forYou: boolean;
  /** null only when nothing can be done (a closed session) */
  primary: { label: string; tab: TabKey; blockedBy: string | null } | null;
  /** why the current user cannot act, or why there is no action; null when the user can act now */
  reason: string | null;
}


export function nextActionOf(view: LifecycleView, workflow: "configuring" | "ready" | "closed", actor: Actor): NextAction {
  if (workflow === "closed") return { title: "No further action", who: "The session is closed", forYou: false, primary: null, reason: "A closed session cannot change." };
  if (view.unread) return { title: "Reload to continue", who: "Some information could not be read", forYou: true, primary: { label: "Reload", tab: "overview", blockedBy: null }, reason: null };

  const act = (cap: Capability, label: string, tab: TabKey, phase: string | null, title: string, who: string): NextAction => {
    const d = can(actor, cap);
    const blockedBy = !d.allowed ? d.reason : phase ? `This action is built in Phase ${phase}. Nothing is simulated.` : null;
    return { title, who, forYou: d.allowed, primary: { label, tab, blockedBy }, reason: blockedBy };
  };
  switch (GROUPS[view.currentIndex]) {
    case "Participation": return act("participants.manage", "Add participants", "participants", null, "Add at least two participants", "An administrator");
    case "Obligations": return act("obligations.record", "Record an obligation", "obligations", null, "Record the obligations", "An administrator");
    case "Netting": return act("netting.run", "Calculate net positions", "netting", null, view.subLabel.startsWith("The calculation is stale") ? "Recalculate net positions" : "Calculate net positions", "An administrator");
    case "Approval":
      if (view.subLabel.startsWith("Calculation awaiting")) return act("authorization.decide", "Review the calculation", "approvals", null, "Review the calculation", "A reviewer");
      return act("netting.run", "Recalculate net positions", "netting", null, "Recalculate net positions", "An administrator");
    default:
      if (view.batch === "awaiting-review") return act("settlement.decide", "Review the settlement", "settlement", null, "Review the settlement batch", "A reviewer who did not prepare it");
      if (view.batch === "approved") return { title: "Nothing more can be done here", who: "Signing, submission and verification are not supported in this app", forYou: false, primary: null, reason: "The settlement stops at Review in this app." };
      return act("settlement.prepare", "Prepare settlement", "settlement", null, "Prepare settlement", "An administrator");
  }
}
