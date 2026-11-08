// can(role, capability): PRESENTATION ONLY. The backend is the authority and always wins; a 403 from the server is displayed as the reason.
// The rules mirror apps/web-console/lib/registry/service.ts as read on 2026-11-08:
//   - every write operation is admin-only (`#need(orgId, u, true)` / `#editable`);
//   - reading needs an active membership (member or admin);
//   - a calculation or settlement-batch decision needs the REVIEWER grant (`#isReviewer`), which is separate from the admin role;
//   - issuing a wallet-ownership challenge needs only membership.
// The server additionally enforces separation of duties (nobody decides on a result they recorded, changed or calculated); the client cannot know that, so the
// reason text says so. There is no Owner and no Operator in the backend (decision D5): the UI shows Admin, Member and Reviewer.
import type { Role } from "../tobin/types.ts";

export type Capability =
  | "org.view" | "org.edit" | "members.manage" | "invitations.manage" | "reviewers.manage"
  | "sessions.view" | "sessions.create" | "sessions.manage" | "participants.manage"
  | "obligations.view" | "obligations.record" | "obligations.correct"
  | "netting.run" | "authorization.decide"
  | "settlement.prepare" | "settlement.decide" | "execution.begin"
  | "wallets.verify" | "wallets.link" | "signer-sets.record" | "activity.view";

export interface Actor { role: Role; reviewer: boolean; suspended?: boolean }
export interface Decision { allowed: boolean; reason: string | null }

const ADMIN_ONLY = new Set<Capability>([
  "org.edit", "members.manage", "invitations.manage", "reviewers.manage", "sessions.create", "sessions.manage", "participants.manage",
  "obligations.record", "obligations.correct", "netting.run", "settlement.prepare", "execution.begin", "wallets.link", "signer-sets.record",
]);
const REVIEWER_ONLY = new Set<Capability>(["authorization.decide", "settlement.decide"]);

export function can(actor: Actor, capability: Capability): Decision {
  if (actor.suspended) return { allowed: false, reason: "Your membership is suspended, so you have no access." };
  if (REVIEWER_ONLY.has(capability)) {
    return actor.reviewer
      ? { allowed: true, reason: null }
      : { allowed: false, reason: "You need the reviewer capability to decide. An administrator can grant it. The server also enforces separation of duties." };
  }
  if (ADMIN_ONLY.has(capability)) {
    return actor.role === "admin" ? { allowed: true, reason: null } : { allowed: false, reason: "Only administrators can do this." };
  }
  return { allowed: true, reason: null };
}

/** The real role names, in the order they are displayed. Never "Operator", "Approver" or "Owner". */
export function roleLabels(actor: Actor): string[] {
  const out = [actor.role === "admin" ? "Admin" : "Member"];
  if (actor.reviewer) out.push("Reviewer");
  return out;
}

/** Help text only: how the PRD's role names relate to the real ones. Never used as a label. */
export const PRD_ROLE_HELP = [
  { real: "Admin", prd: "covers the PRD's Operator tasks and the Admin role: it performs every write operation." },
  { real: "Member", prd: "is read-only, which is closest to the PRD's Viewer." },
  { real: "Reviewer", prd: "is a separate grant that lets a person approve or reject; it is closest to the PRD's Approver." },
  { real: "Owner", prd: "does not exist. The last active administrator cannot be removed or demoted." },
] as const;
