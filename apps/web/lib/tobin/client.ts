// The typed data-access interface (docs/web-app-plan.md section 6). Phase A covers authentication, organizations and the read paths the Overview needs.
// Two adapters implement it: HttpAdapter (the real API through the proxy, the default) and MockAdapter (sample data, only when
// NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1, always bannered). A capability with no backend is a NotSupported constant, never a method that returns invented data.
import { api } from "../api/http.ts";
import type {
  AuthorizationView, CreateOrganizationInput, Invitation, Me, Member, NotSupported, ObligationView, OrgDetail, Organization, SessionDetail, SessionRow,
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
  };
  organizations: {
    get(orgId: string): Promise<OrgDetail>;
    create(input: CreateOrganizationInput): Promise<Organization>;
    members(orgId: string): Promise<Member[]>;
    invitations(orgId: string): Promise<Invitation[]>;
    acceptInvitation(token: string): Promise<{ orgId: string }>;
  };
  sessions: {
    list(orgId: string): Promise<SessionRow[]>;
    get(orgId: string, sessionId: string): Promise<SessionDetail>;
  };
  obligations: { listBySession(orgId: string, sessionId: string): Promise<ObligationView[]> };
  authorization: { get(orgId: string, sessionId: string): Promise<AuthorizationView> };
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
  };

  sessions: TobinClient["sessions"] = {
    list: async (orgId) => (await api<{ rows: SessionRow[] }>(`${org(orgId)}/sessions`)).rows,
    get: (orgId, sessionId) => api<SessionDetail>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}`),
  };
  obligations: TobinClient["obligations"] = {
    listBySession: async (orgId, sessionId) => (await api<{ obligations: ObligationView[] }>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/obligations`)).obligations,
  };
  authorization: TobinClient["authorization"] = {
    get: (orgId, sessionId) => api<AuthorizationView>(`${org(orgId)}/sessions/${encodeURIComponent(sessionId)}/authorization`),
  };
}
