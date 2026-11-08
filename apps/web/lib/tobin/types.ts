// Response shapes of the console's API as read from its source (apps/web-console/lib/registry/http.ts, lib/auth/http.ts). Only fields this app uses are typed.
// Nothing here is invented: a field that the API does not return is not in these types.

export type Role = "admin" | "member";
export type WorkflowState = "configuring" | "ready" | "closed";
export type AuthState = "no-calculation" | "stale" | "awaiting-review" | "approved" | "rejected";

export interface OrgBrief { id: string; name: string; role: Role }
export interface WalletRecord { id: string; publicKey: string; network: string; verifiedAt: string }

export interface Me {
  user: { id: string; displayName: string; authMethod: "password" | "wallet"; email?: string };
  wallets?: WalletRecord[];
  onboarding?: { step: "profile" | "organization" | "done"; profileDone: boolean };
  organizations?: OrgBrief[];
  lastOrgId?: string | null;
}

export const INSTITUTION_TYPES = ["bank", "payment-institution", "broker-dealer", "fintech", "corporate-treasury", "other"] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export interface Organization {
  id: string;
  name: string;
  description: string;
  visibility: "private" | "public";
  createdAt: string;
  createdBy: string;
  institutionType?: InstitutionType;
  jurisdiction?: string;
}
export interface OrgDetail { organization: Organization; role: Role }
export interface CreateOrganizationInput { name: string; description: string; visibility: "private" | "public"; institutionType: InstitutionType; jurisdiction?: string }

export interface Member {
  userId: string;
  role: Role;
  reviewer: boolean;
  since: string;
  status: "active" | "suspended";
  name: string;
  email?: string;
  you: boolean;
}
export interface Invitation { id: string; orgId: string; invitee: string; role: Role; status: "pending" | "accepted" | "revoked"; expiresAt: string; createdBy: string }

export interface SessionRow {
  sessionId: string;
  shortId: string;
  label: string;
  status: string;
  participants: string;
  createdAt: string;
  provenance: "fixture" | "local-draft" | "chain-read" | "chain-confirmed";
  provenanceLabel: string;
  activityCount: number;
  lastActivity: string | null;
}
export interface ActivityItem { at: string; kind: string; actor: string; detail: string }
export interface SessionDetail {
  workflow: WorkflowState;
  workspace: {
    banner?: { label: string; meaning: string };
    overview: { sessionId: string; label: string; status: string; createdAt: string; provenance: SessionRow["provenance"] };
    activity: { items: ActivityItem[]; empty: string | null };
  };
}
export interface ObligationView {
  id: string;
  debtor: string;
  debtorName: string;
  creditor: string;
  creditorName: string;
  amount: string;
  asset: string;
  status: "active" | "voided";
  revision: number;
  createdAt: string;
  reference?: string;
  assetRef?: string | null;
  assetIdentity?: "canonical" | "legacy-unresolved";
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}
export interface AuthorizationView {
  state: AuthState;
  sessionState: WorkflowState;
  calculationId: string | null;
  eligibility: { canDecide: boolean; isReviewer: boolean; reasons: string[] };
  decisions: { id: string; decision: "approved" | "rejected"; decidedBy: string; decidedAt: string; status: string }[];
}

/** A capability the backend does not provide. The UI renders it as "Not supported"; it is never mocked. */
export interface NotSupported { supported: false; reason: string }

// ---- Phase B: session workspace (shapes read from apps/web-console/lib/registry/http.ts) ----
export interface SessionParticipantView {
  userId: string;
  name: string;
  organization: string;
  orgId: string;
  status: "active" | "removed";
  addedAt: string;
  removedAt?: string;
  walletClaim?: string;
}
export type Currency = "current" | "stale" | "none";
export interface ReadinessCheck { key: string; label: string; ok: boolean; fix: string }
export interface Readiness { state: WorkflowState; ready: boolean; checks: ReadinessCheck[]; currency: Currency }
export interface CalculationPosition { userId: string; name: string; net: string; role: "debtor" | "creditor" | "flat" }
export interface CalculationView {
  currency: Currency;
  asset: string | null;
  calculation: null | { id: string; asset: string; createdAt: string; createdBy: string; gross: string; obligationCount: number; positions: CalculationPosition[] };
}
export interface CreatedSession { sessionId: string; label: string; provenance: SessionRow["provenance"]; createdAt: string }

// ---- Phase C ----
/** An entry of the operator-configured supported-asset list (GET .../settlement `assets`). `id` is the asset identity sent as `assetRef`. */
export interface SupportedAssetView { id: string; code: string; status: string }
export interface RecordObligationInput { debtor: string; creditor: string; amount: string; assetRef?: string; asset?: string; reference?: string }
