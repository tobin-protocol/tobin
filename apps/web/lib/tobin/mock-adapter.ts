// SAMPLE DATA. Used only when NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1, and the UI then shows a persistent "Sample data" banner. Everything here is fictional.
// It implements only the endpoints that exist in the real API, so it lets a reviewer see populated screens without a backend. It is NOT used to fill
// in features the backend lacks (those render "Not supported", decision D3). The example participants and amounts are the documented arithmetic
// example, not data.
import { NOT_SUPPORTED, type TobinClient } from "./client.ts";
import type { AuthorizationView, Invitation, Me, Member, ObligationView, Organization, SessionDetail, SessionRow } from "./types.ts";

const ORG: Organization = { id: "org_sample", name: "Sample Bank (fictional)", description: "Sample data", visibility: "private", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "usr_sample_a", institutionType: "bank", jurisdiction: "GB" };
const ME: Me = {
  user: { id: "usr_sample_a", displayName: "Sample Admin", authMethod: "password", email: "admin@example.test" },
  wallets: [],
  onboarding: { step: "done", profileDone: true },
  organizations: [{ id: ORG.id, name: ORG.name, role: "admin" }],
  lastOrgId: ORG.id,
};
const ROWS: SessionRow[] = [
  { sessionId: "a".repeat(64), shortId: "aaaaaaaa…aaaaaa", label: "Sample clearing run", status: "Draft (not on-chain)", participants: "not read", createdAt: "2026-02-01T09:00:00.000Z", provenance: "local-draft", provenanceLabel: "Local draft", activityCount: 3, lastActivity: "2026-02-01T10:00:00.000Z" },
];
const OBLIGATIONS: ObligationView[] = [
  { id: "1".repeat(64), debtor: "usr_a", debtorName: "Party A", creditor: "usr_b", creditorName: "Party B", amount: "100", asset: "USD", status: "active", revision: 1, createdAt: "2026-02-01T09:05:00.000Z" },
  { id: "2".repeat(64), debtor: "usr_b", debtorName: "Party B", creditor: "usr_c", creditorName: "Party C", amount: "80", asset: "USD", status: "active", revision: 1, createdAt: "2026-02-01T09:06:00.000Z" },
  { id: "3".repeat(64), debtor: "usr_c", debtorName: "Party C", creditor: "usr_a", creditorName: "Party A", amount: "70", asset: "USD", status: "active", revision: 1, createdAt: "2026-02-01T09:07:00.000Z" },
];

export class MockAdapter implements TobinClient {
  readonly kind = "sample" as const;
  notifications = NOT_SUPPORTED.notifications;
  search = NOT_SUPPORTED.search;
  auth: TobinClient["auth"] = {
    me: async () => ME,
    login: async () => {},
    register: async () => {},
    walletChallenge: async () => { throw new Error("Wallet sign-in is not available with sample data."); },
    walletVerify: async () => { throw new Error("Wallet sign-in is not available with sample data."); },
    setProfile: async () => {},
    setWorkspace: async () => {},
    logout: async () => {},
    logoutAll: async () => {},
    removeWallet: async () => {},
    audit: async () => [],
  };
  organizations: TobinClient["organizations"] = {
    get: async () => ({ organization: ORG, role: "admin" }),
    create: async () => ORG,
    members: async (): Promise<Member[]> => [{ userId: ME.user.id, role: "admin", reviewer: false, since: ORG.createdAt, status: "active", name: ME.user.displayName, you: true }],
    invitations: async (): Promise<Invitation[]> => [],
    acceptInvitation: async () => ({ orgId: ORG.id }),
    update: async () => ORG,
    verifications: async () => [],
    claims: async () => [],
    setRole: async () => {}, setStatus: async () => {}, removeMember: async () => {}, setReviewer: async () => {},
    invite: async () => { throw new Error("Invitations are not available with sample data."); },
    revokeInvitation: async () => {},
  };
  sessions: TobinClient["sessions"] = {
    list: async () => ROWS,
    create: async (_o, label) => ({ sessionId: "b".repeat(64), label, provenance: "local-draft", createdAt: "2026-02-02T09:00:00.000Z" }),
    readiness: async () => ({ state: "configuring", ready: false, checks: [], currency: "none" }),
    calculation: async () => ({ currency: "none", asset: null, calculation: null }),
    markReady: async () => ({ state: "ready", ready: true, checks: [], currency: "none" }),
    close: async () => ({ state: "closed", ready: false, checks: [], currency: "none" }),
    get: async (): Promise<SessionDetail> => ({
      workflow: "configuring",
      workspace: {
        overview: { sessionId: ROWS[0]!.sessionId, label: ROWS[0]!.label, status: ROWS[0]!.status, createdAt: ROWS[0]!.createdAt, provenance: "local-draft" },
        activity: { items: [{ at: "2026-02-01T10:00:00.000Z", kind: "obligation.created", actor: "Sample Admin", detail: "Obligation created" }], empty: null },
      },
    }),
  };
  participants: TobinClient["participants"] = { list: async () => [], add: async () => {}, remove: async () => {} };
  obligations: TobinClient["obligations"] = { listBySession: async () => OBLIGATIONS, record: async () => ({ obligationId: "9".repeat(64) }), void: async () => {} };
  netting: TobinClient["netting"] = { run: async () => ({ currency: "none", asset: null, calculation: null }) };
  assets: TobinClient["assets"] = { list: async () => [] };
  authorization: TobinClient["authorization"] = {
    get: async (): Promise<AuthorizationView> => ({ state: "no-calculation", sessionState: "configuring", calculationId: null, eligibility: { canDecide: false, isReviewer: false, reasons: [] }, decisions: [] }),
    decide: async () => {},
  };
  settlement: TobinClient["settlement"] = {
    list: async () => ({ preview: { checks: [], ready: false, calculationId: null }, assets: [], batches: [] }),
    batch: async () => { throw new Error("No sample batch exists."); },
    prepare: async () => ({ batchId: "bat_sample" }),
    decide: async () => {},
    execution: async () => ({ network: "testnet", batchStatus: "awaiting-review", participants: [], execution: null, unavailable: [] }),
    attempts: async () => [],
  };
}
