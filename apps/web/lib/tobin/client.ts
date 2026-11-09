// The typed data-access interface (docs/web-app-plan.md section 6). Phase A covers authentication, organizations and the read paths the Overview needs.
// Two adapters implement it: HttpAdapter (the real API through the proxy, the default) and MockAdapter (sample data, only when
// NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1, always bannered). A capability with no backend is a NotSupported constant, never a method that returns invented data.
import { api } from "../api/http.ts";
import type {
  AuditEvent, AuthorizationView, AttemptView, CreatedInvitation, OrgVerification, OrgWalletClaim, UpdateOrganizationInput, BatchView, CalculationView, ExecutionView, SettlementList, RecordObligationInput, SupportedAssetView, CreateOrganizationInput, CreatedSession, Readiness, SessionParticipantView, Invitation, Me, Member, Role, NotSupported, ObligationView, OrgDetail, Organization, SessionDetail, SessionRow, SignerSetHistory,
} from "./types.ts";

export interface WalletChallenge { challenge: { id: string; message: string; expiresAt: string } }

export interface TobinClient {
  readonly kind: "http" | "sample";
  auth: {
    me(): Promise<Me>;
    login(email: string, password: string): Promise<void>;
    register(email: string, password: string, displayName: string): Promise<void>;
    walletChallenge(publicKey: string): Promise<WalletChallenge>;
    walletVerify(challengeId: string, signature: string): Promise<{ isNew: boolean }>;
    setProfile(displayName: string): Promise<void>;
    setWorkspace(orgId: string): Promise<void>;
    logout(): Promise<void>;
    /** Revokes every session of the account, including this one. There is no list of sessions. */
    logoutAll(): Promise<void>;
    /** Removes (disconnects) a verified wallet: revokes sessions signed in with it. It does not touch the Stellar account. */
    removeWallet(walletId: string): Promise<void>;
    audit(): Promise<AuditEvent[]>;
  };
  organizations: {
    get(orgId: string): Promise<OrgDetail>;
    create(input: CreateOrganizationInput): Promise<Organization>;
    members(orgId: string): Promise<Member[]>;
    invitations(orgId: string): Promise<Invitation[]>;
    acceptInvitation(token: string): Promise<{ orgId: string }>;
    /** Admin. Only name, description and visibility can change. */
    update(orgId: string, input: UpdateOrganizationInput): Promise<Organization>;
    verifications(orgId: string): Promise<OrgVerification[]>;
    claims(orgId: string): Promise<OrgWalletClaim[]>;
    /** Member read of the signer-set snapshots recorded for one account (GET signer-sets/:account). Empty when none was recorded. */
    signerSetHistory(orgId: string, account: string): Promise<SignerSetHistory>;
    /** Admin. A role is Admin or Member; Reviewer is a separate grant. */
    setRole(orgId: string, userId: string, role: Role): Promise<void>;
    setStatus(orgId: string, userId: string, status: "active" | "suspended"): Promise<void>;
    removeMember(orgId: string, userId: string): Promise<void>;
    setReviewer(orgId: string, userId: string, grant: boolean): Promise<void>;
    /** Admin. No email is sent: the one-time token is returned once and must be handed over. */
    invite(orgId: string, input: { invitee: string; role: Role }): Promise<CreatedInvitation>;
    revokeInvitation(orgId: string, invitationId: string): Promise<void>;
  };
  sessions: {
    list(orgId: string): Promise<SessionRow[]>;
    get(orgId: string, sessionId: string): Promise<SessionDetail>;
    /** Records a LOCAL DRAFT: the only accepted field is the label; the server generates the id. */
    create(orgId: string, label: string): Promise<CreatedSession>;
    readiness(orgId: string, sessionId: string): Promise<Readiness>;
    calculation(orgId: string, sessionId: string): Promise<CalculationView>;
    /** Admin. configuring to ready, only when every readiness check passes. Ready is not approval, signing or settlement. Returns the readiness view. */
    markReady(orgId: string, sessionId: string): Promise<Readiness>;
    /** Admin. ready to closed, only with an approved, still-eligible settlement batch for the current calculation. Operational closure: nothing has settled. */
    close(orgId: string, sessionId: string): Promise<Readiness>;
    /** Admin. ready to configuring. Changes the workflow state only: nothing is deleted. The first edit afterwards invalidates reviews and the prepared settlement. */
    reopen(orgId: string, sessionId: string): Promise<Readiness>;
  };
  participants: {
    list(orgId: string, sessionId: string): Promise<SessionParticipantView[]>;
    add(orgId: string, sessionId: string, userId: string): Promise<void>;
    remove(orgId: string, sessionId: string, userId: string): Promise<void>;
  };
  obligations: {
    listBySession(orgId: string, sessionId: string): Promise<ObligationView[]>;
    /** Admin, configuring sessions only. The server validates every field and its message is the reason shown. */
    record(orgId: string, sessionId: string, input: RecordObligationInput): Promise<{ obligationId: string }>;
    /** Admin, configuring sessions only. There is no delete and no edit in this app. */
    void(orgId: string, sessionId: string, obligationId: string, reason?: string): Promise<void>;
  };
  netting: { run(orgId: string, sessionId: string): Promise<CalculationView> };
  /** The operator-configured supported assets. Empty means none is configured and the backend accepts a plain asset code. */
  assets: { list(orgId: string, sessionId: string): Promise<SupportedAssetView[]> };
  authorization: {
    get(orgId: string, sessionId: string): Promise<AuthorizationView>;
    /** Reviewer grant. One decision per calculation. A rejection needs a reason (1 to 500 characters); the server enforces separation of duties. */
    decide(orgId: string, sessionId: string, kind: "approve" | "reject", input: { calculationId: string; reason?: string }): Promise<void>;
  };
  settlement: {
    list(orgId: string, sessionId: string): Promise<SettlementList>;
    batch(orgId: string, sessionId: string, batchId: string): Promise<BatchView>;
    /** Admin. Prepares instructions from the approved, current calculation. Nothing is signed or submitted. */
    prepare(orgId: string, sessionId: string, input: { calculationId: string; attempt?: number }): Promise<{ batchId: string }>;
    /** Reviewer grant, and not the preparer. instructionsHash must be the hash of the batch the reviewer was shown. */
    decide(orgId: string, sessionId: string, batchId: string, kind: "approve" | "reject", input: { instructionsHash: string; reason?: string }): Promise<void>;
    execution(orgId: string, sessionId: string, batchId: string): Promise<ExecutionView>;
    attempts(orgId: string, sessionId: string, batchId: string): Promise<AttemptView[]>;
  };
  /** No backend (decision D3). */
  notifications: NotSupported;
  search: NotSupported;
}

export const NOT_SUPPORTED = {
  notifications: { supported: false, reason: "The backend has no notifications." } satisfies NotSupported,
  search: { supported: false, reason: "The backend has no global search." } satisfies NotSupported,
};

const org = (id: string) => `/api/registry/orgs/${encodeURIComponent(id)}`;

export class HttpAdapter implements TobinClient {
  readonly kind = "http" as const;
  notifications = NOT_SUPPORTED.notifications;
  search = NOT_SUPPORTED.search;

  auth: TobinClient["auth"] = {
    me: () => api<Me>("/api/auth/me"),
    login: async (email, password) => { await api("/api/auth/login", { method: "POST", body: { email, password } }); },
    register: async (email, password, displayName) => { await api("/api/auth/register", { method: "POST", body: { email, password, displayName } }); },
    walletChallenge: (publicKey) => api<WalletChallenge>("/api/auth/wallet/challenge", { method: "POST", body: { publicKey, network: "testnet" } }),
    walletVerify: async (challengeId, signature) => {
      const r = await api<{ isNew: boolean }>("/api/auth/wallet/verify", { method: "POST", body: { challengeId, signature, scheme: "sep-53" } });
      return { isNew: r.isNew };
    },
    setProfile: async (displayName) => { await api("/api/auth/profile", { method: "POST", body: { displayName } }); },
    setWorkspace: async (orgId) => { await api("/api/auth/workspace", { method: "POST", body: { orgId } }); },
    logout: async () => { await api("/api/auth/logout", { method: "POST" }); },
    logoutAll: async () => { await api("/api/auth/logout-all", { method: "POST" }); },
    removeWallet: async (walletId) => { await api("/api/auth/wallet/remove", { method: "POST", body: { walletId } }); },
    audit: async () => (await api<{ events: AuditEvent[] }>("/api/auth/audit")).events,
  };

  organizations: TobinClient["organizations"] = {
    get: (orgId) => api<OrgDetail>(org(orgId)),
    create: async (input) => (await api<{ organization: Organization }>("/api/registry/orgs", { method: "POST", body: input })).organization,
    members: async (orgId) => (await api<{ members: Member[] }>(`${org(orgId)}/members`)).members,
    invitations: async (orgId) => (await api<{ invitations: Invitation[] }>(`${org(orgId)}/invitations`)).invitations,
    acceptInvitation: async (token) => {
      const r = await api<{ membership: { orgId: string } }>("/api/registry/invitations/accept", { method: "POST", body: { token } });
      return { orgId: r.membership.orgId };
    },
    update: async (orgId, input) => (await api<{ organization: Organization }>(`${org(orgId)}/update`, { method: "POST", body: input })).organization,
    verifications: async (orgId) => (await api<{ verifications: OrgVerification[] }>(`${org(orgId)}/wallet-verifications`)).verifications,
    claims: async (orgId) => (await api<{ wallets: OrgWalletClaim[] }>(`${org(orgId)}/wallets`)).wallets,
    signerSetHistory: (orgId, account) => api<SignerSetHistory>(`${org(orgId)}/signer-sets/${encodeURIComponent(account)}`),
    setRole: async (orgId, userId, role) => { await api(`${org(orgId)}/members/${encodeURIComponent(userId)}/role`, { method: "POST", body: { role } }); },
    setStatus: async (orgId, userId, status) => { await api(`${org(orgId)}/members/${encodeURIComponent(userId)}/status`, { method: "POST", body: { status } }); },
    removeMember: async (orgId, userId) => { await api(`${org(orgId)}/members/${encodeURIComponent(userId)}/remove`, { method: "POST" }); },
    setReviewer: async (orgId, userId, grant) => { await api(`${org(orgId)}/reviewers/${encodeURIComponent(userId)}/${grant ? "grant" : "revoke"}`, { method: "POST" }); },
    invite: async (orgId, input) => { const r = await api<{ invitation: Invitation; token: string }>(`${org(orgId)}/invitations`, { method: "POST", body: input }); return { invitation: r.invitation, token: r.token }; },
    revokeInvitation: async (orgId, invitationId) => { await api(`${org(orgId)}/invitations/${encodeURIComponent(invitationId)}/revoke`, { method: "POST" }); },
  };

  sessions: TobinClient["sessions"] = {
    list: async (orgId) => (await api<{ rows: SessionRow[] }>(`${org(orgId)}/sessions`)).rows,
    get: (orgId, sessionId) => api<SessionDetail>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}`),
    create: async (orgId, label) => (await api<{ session: CreatedSession }>(`${org(orgId)}/sessions`, { method: "POST", body: { label } })).session,
    readiness: (orgId, sessionId) => api<Readiness>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/readiness`),
    calculation: (orgId, sessionId) => api<CalculationView>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/calculation`),
    markReady: (orgId, sessionId) => api<Readiness>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/ready`, { method: "POST" }),
    close: (orgId, sessionId) => api<Readiness>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/close`, { method: "POST" }),
    reopen: (orgId, sessionId) => api<Readiness>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/reopen`, { method: "POST" }),
  };
  participants: TobinClient["participants"] = {
    list: async (orgId, sessionId) => (await api<{ participants: SessionParticipantView[] }>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/participants`)).participants,
    add: async (orgId, sessionId, userId) => { await api(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/participants`, { method: "POST", body: { userId } }); },
    remove: async (orgId, sessionId, userId) => { await api(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(userId)}/remove`, { method: "POST" }); },
  };
  obligations: TobinClient["obligations"] = {
    listBySession: async (orgId, sessionId) => (await api<{ obligations: ObligationView[] }>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/obligations`)).obligations,
    record: async (orgId, sessionId, input) => { const r = await api<{ obligationId: string }>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/obligations`, { method: "POST", body: input }); return { obligationId: r.obligationId }; },
    void: async (orgId, sessionId, obligationId, reason) => { await api(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/obligations/${encodeURIComponent(obligationId)}/void`, { method: "POST", body: reason ? { reason } : {} }); },
  };
  netting: TobinClient["netting"] = { run: (orgId, sessionId) => api<CalculationView>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/calculate`, { method: "POST" }) };
  assets: TobinClient["assets"] = { list: async (orgId, sessionId) => (await api<{ assets: SupportedAssetView[] }>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/settlement`)).assets.filter((a) => a.status === "supported") };
  authorization: TobinClient["authorization"] = {
    get: (orgId, sessionId) => api<AuthorizationView>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/authorization`),
    decide: async (orgId, sessionId, kind, input) => { await api(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/authorization/${kind}`, { method: "POST", body: input }); },
  };
  settlement: TobinClient["settlement"] = {
    list: (orgId, sessionId) => api<SettlementList>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/settlement`),
    batch: (orgId, sessionId, batchId) => api<BatchView>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/settlement/batches/${encodeURIComponent(batchId)}`),
    prepare: async (orgId, sessionId, input) => { const r = await api<{ batchId: string }>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/settlement/prepare`, { method: "POST", body: input }); return { batchId: r.batchId }; },
    decide: async (orgId, sessionId, batchId, kind, input) => { await api(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/settlement/batches/${encodeURIComponent(batchId)}/${kind}`, { method: "POST", body: input }); },
    execution: (orgId, sessionId, batchId) => api<ExecutionView>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/settlement/batches/${encodeURIComponent(batchId)}/execution`),
    attempts: async (orgId, sessionId, batchId) => (await api<{ attempts: AttemptView[] }>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/settlement/batches/${encodeURIComponent(batchId)}/execution/attempts`)).attempts,
  };
}
