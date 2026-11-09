// Presentation rules for members, invitations and wallets. The server decides every one of these (last administrator, active obligations, expiry); this only
// words them. Nothing here is a permission.
import { can, roleDifferences, type Actor } from "../permissions/can.ts";
import type { Invitation, Member, OrgVerification, Role, WalletRecord } from "../tobin/types.ts";

export type InvitationState = "Pending" | "Accepted" | "Revoked" | "Expired";
/** The API stores pending, accepted or revoked. A pending invitation past its expiry is shown as Expired (derived from expiresAt). */
export function invitationState(i: Pick<Invitation, "status" | "expiresAt">, now: number = Date.now()): InvitationState {
  if (i.status === "accepted") return "Accepted";
  if (i.status === "revoked") return "Revoked";
  return new Date(i.expiresAt).getTime() <= now ? "Expired" : "Pending";
}
export const canRevokeInvitation = (i: Pick<Invitation, "status" | "expiresAt">, now?: number): boolean => i.status === "pending" && invitationState(i, now) === "Pending";

/** What removing a member does, from the backend rules (Registry.removeMember). */
export const REMOVE_CONSEQUENCES = [
  "The membership ends and the member loses all access to this organization.",
  "They are removed from every session still being configured; each such session's calculation and review is invalidated.",
  "Removal is refused if they are a participant with active obligations (void those first) or a participant of a session that is no longer being configured.",
  "The last active administrator cannot be removed.",
  "Their earlier activity stays on record.",
] as const;
export const SUSPEND_CONSEQUENCES = [
  "A suspended member keeps their record but has no access and no authority until restored.",
  "You cannot suspend yourself, and the last active administrator cannot be suspended.",
] as const;

export const lastActiveAdmin = (members: readonly Member[], userId: string): boolean =>
  members.filter((m) => m.role === "admin" && m.status === "active").length === 1 && members.some((m) => m.userId === userId && m.role === "admin" && m.status === "active");

export interface WalletRow { id: string; publicKey: string; network: string; verifiedAt: string; connection: "Connected in this browser" | "Not connected in this browser"; verification: "Verified" }
/** Own wallets. Connection is a browser-side Freighter fact (the backend has none); verification is the backend's. They are separate columns. */
export function walletRows(wallets: readonly WalletRecord[], browserAddress: string | null): WalletRow[] {
  return wallets.map((w) => ({ id: w.id, publicKey: w.publicKey, network: w.network, verifiedAt: w.verifiedAt, connection: browserAddress && browserAddress === w.publicKey ? "Connected in this browser" : "Not connected in this browser", verification: "Verified" }));
}
export const verifiedByMember = (v: readonly OrgVerification[]): Map<string, OrgVerification[]> => {
  const m = new Map<string, OrgVerification[]>();
  for (const x of v) m.set(x.userId, [...(m.get(x.userId) ?? []), x]);
  return m;
};

/** Wallet wording on the Wallets tab. The button only opens the Connect wallet window: nothing is linked, signed or verified. */
export const WALLET_BUTTON_LABEL = "Connect a wallet";
export const WALLET_NOTE = "This opens the Connect wallet window, which only looks for a wallet in this browser. Linking a wallet to your account and verifying it are not available yet: nothing is linked, signed or verified here.";

export interface RoleChangePlan {
  /** the viewer may open the dialog at all (administrators only) */
  allowed: boolean;
  reason: string | null;
  /** the change would leave the organization without an active administrator */
  blockedLastAdmin: boolean;
  /** the confirm button can be pressed */
  canConfirm: boolean;
  gains: string[];
  losses: string[];
  /** a role change is one confirmation; nothing else is asked */
  confirmations: 1;
}
/** What the role-change dialog shows and allows. The server still decides; this only words it and keeps the button honest. */
export function roleChangePlan(actor: Actor, members: readonly Member[], target: Member, newRole: Role): RoleChangePlan {
  const gate = can(actor, "members.manage");
  const last = lastActiveAdmin(members, target.userId);
  const blockedLastAdmin = last && newRole !== "admin";
  const diff = roleDifferences(target.role, newRole);
  return { allowed: gate.allowed, reason: gate.reason, blockedLastAdmin, canConfirm: gate.allowed && newRole !== target.role && !blockedLastAdmin, gains: diff.gains, losses: diff.losses, confirmations: 1 };
}
