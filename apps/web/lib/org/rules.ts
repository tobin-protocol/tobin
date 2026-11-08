// Presentation rules for members, invitations and wallets. The server decides every one of these (last administrator, active obligations, expiry); this only
// words them. Nothing here is a permission.
import type { Invitation, Member, OrgVerification, WalletRecord } from "../tobin/types.ts";

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
