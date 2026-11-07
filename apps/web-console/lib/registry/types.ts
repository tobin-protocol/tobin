// Institutional-application records (MVP-1.2 backend foundation). PROPOSED model from docs/product/architecture/domain-model.md and roles-and-permissions.md.
// Everything here is application data. An application role never grants on-chain authority. No database or identity provider is chosen: see store.ts and identity.ts.

export type Role = 'admin' | 'member';

export interface Organization {
  id: string;
  name: string;
  description: string;
  visibility: 'private' | 'public';
  createdAt: string;
  createdBy: string;
}

export interface Membership {
  orgId: string;
  userId: string;
  role: Role;
  since: string;
}

/** A Stellar address linked to an organization. `proof: 'none'` means the link is a claim, NOT proof of control. */
export interface OrgWallet {
  orgId: string;
  address: string;
  proof: 'none' | 'signature-verified';
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked';

export interface Invitation {
  id: string;
  orgId: string;
  /** a free reference for the invitee (for example an email); never used for authentication here */
  invitee: string;
  role: Role;
  /** only the SHA-256 of the secret token is stored */
  tokenHash: string;
  status: InvitationStatus;
  expiresAt: string;
  createdBy: string;
}

/**
 * Where a session record's data comes from. This is never silently upgraded:
 *  - fixture: demonstration data, never on-chain
 *  - local-draft: created in the application, nothing submitted
 *  - chain-read: a read-only RPC observation of the session id exists, not tied to a verified transaction
 *  - chain-confirmed: a read matched the id AND the creating transaction was confirmed SUCCESS
 */
export type Provenance = 'fixture' | 'local-draft' | 'chain-read' | 'chain-confirmed';

export interface ChainObservation {
  state: 'OPEN' | 'COMMITTED' | 'APPROVED' | 'SETTLED';
  participants: string[];
  creator: string;
  readAtLedger: number;
}

export interface SessionRecord {
  /** 64 lowercase hex characters: the on-chain BytesN<32> id */
  sessionId: string;
  orgId: string;
  label: string;
  provenance: Provenance;
  createdAt: string;
  chain?: ChainObservation;
  /** set only together with provenance chain-confirmed */
  confirmedTxHash?: string;
  /** application workflow state (not a chain state); absent means 'configuring' */
  workflow?: WorkflowState;
}

/** configuring: participants and obligations may change. ready: frozen for the next stage (reopen to edit). closed: final, nothing changes. Not settlement. */
export type WorkflowState = 'configuring' | 'ready' | 'closed';

/**
 * A user taking part in a session AS AN APPLICATION RECORD. Three things are kept apart: organization membership (memberships), participation in this
 * application session (this record), and a wallet address (an unproven claim from org_wallets). Being a member proves nothing about any wallet, and a
 * participant record is not an on-chain admission.
 */
export interface SessionParticipant {
  sessionId: string;
  orgId: string;
  userId: string;
  /** optional: one of the organization's wallet claims; still unproven */
  walletAddress?: string;
  addedBy: string;
  addedAt: string;
  /** 'removed' participants keep their history but cannot take part in new obligations */
  status?: 'active' | 'removed';
  removedAt?: string;
}

export interface ObligationRecord {
  /** 64 lowercase hex characters (the netting engine's obligation id) */
  id: string;
  sessionId: string;
  orgId: string;
  /** participant user ids */
  debtor: string;
  creditor: string;
  /** positive integer in base units, as a decimal string */
  amount: string;
  asset: string;
  reference: string;
  status: 'active' | 'voided';
  revision: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface CalculationRecord {
  id: string;
  sessionId: string;
  orgId: string;
  asset: string;
  /** SHA-256 of the canonical input (participants and active obligations): a later change to either makes this snapshot stale */
  inputHash: string;
  /** the exact input that was netted, so the result is reproducible */
  input: { participants: string[]; obligations: { id: string; revision: number; debtor: string; creditor: string; amount: string }[] };
  positions: { userId: string; net: string }[];
  gross: string;
  createdAt: string;
  createdBy: string;
}

export interface ActivityRecord {
  id: string;
  at: string;
  orgId: string;
  actor: string;
  kind: string;
  subject: string;
  detail: string;
}

export class RegistryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'RegistryError'; this.code = code; }
}

/** An administrator-granted capability to decide on calculation results. Separate from the admin role: administrators do not decide by default. */
export interface ReviewerGrant { orgId: string; userId: string; grantedBy: string; grantedAt: string }

/** An application-level institutional decision on ONE calculation snapshot. Not a signature and not an on-chain fact. Immutable. */
export interface AuthorizationDecision {
  id: string;
  sessionId: string;
  orgId: string;
  calculationId: string;
  decision: 'approved' | 'rejected';
  /** required (non-empty) for a rejection, empty for an approval */
  reason: string;
  decidedBy: string;
  decidedAt: string;
}
/** Recorded once when a decision stops being current; the decision row itself is never changed. */
export interface AuthorizationInvalidation { decisionId: string; cause: string; at: string; by: string }
