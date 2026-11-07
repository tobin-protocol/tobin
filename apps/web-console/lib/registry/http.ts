// HTTP surface of the registry for the institutional application. Read, organization-management and local-draft operations only: no contract call, no
// wallet, no transaction, and no route that can set chain provenance. The acting user comes ONLY from deps.authenticate (a server-side session lookup);
// no header or body field is ever treated as an identity. Every non-GET request must carry the x-tobin-request header (it cannot be added cross-origin
// without a CORS preflight, which this server never grants), on top of SameSite=Strict cookies and the foreign-Origin refusal in proxy.ts.
import { randomBytes } from 'node:crypto';
import type { ActingUser } from './identity.ts';
import { Registry } from './service.ts';
import { listingRows, workspaceOf } from './session-view.ts';
import { RegistryError } from './types.ts';
import type { Role } from './types.ts';

export const REQUEST_HEADER = 'x-tobin-request';
const USER_ID = /usr_[0-9a-f]{18}/g;

export interface Directory { displayName(userId: string): string | undefined; email(userId: string): string | undefined }

export interface RegistryDeps {
  registry: Registry;
  /** resolves the acting user from the request (session cookie), or null */
  authenticate: (request: Request) => Promise<ActingUser | null> | ActingUser | null;
  /** user display data for member lists and activity; absent for development identities */
  directory?: (ids: readonly string[]) => Map<string, { displayName: string; email: string }>;
  /** failure counter used to slow down invitation-token guessing */
  rate?: { count: (key: string, windowMs: number) => number; fail: (key: string) => void };
  newSessionId: () => string;
}

const STATUS: Record<string, number> = { NOT_FOUND: 404, INVALID: 400, FORBIDDEN: 403, EXISTS: 409, LAST_ADMIN: 409, INVALID_STATE: 409, NOT_VERIFIED: 409, FIXTURE: 409, INVALID_INVITATION: 400, RATE_LIMITED: 429, STALE: 409, SEPARATION_OF_DUTIES: 403 };
const ACCEPT_MAX_FAILURES = 10;
const ACCEPT_WINDOW_MS = 15 * 60 * 1000;

export const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 4096) throw new RegistryError('INVALID', 'request too large');
  try { const v: unknown = JSON.parse(text || '{}'); if (typeof v === 'object' && v !== null && !Array.isArray(v)) return v as Record<string, unknown>; } catch { /* fall through */ }
  throw new RegistryError('INVALID', 'a JSON object is required');
}

const roleOf = (v: unknown): Role => { if (v === 'admin' || v === 'member') return v; throw new RegistryError('INVALID', 'role must be admin or member'); };

export async function handleRegistry(request: Request, deps: RegistryDeps): Promise<Response> {
  try {
    const m = request.method;
    if (m !== 'GET' && request.headers.get(REQUEST_HEADER) !== '1') return json(403, { error: 'FORBIDDEN', message: 'missing request header' });
    const user = await deps.authenticate(request);
    if (!user) return json(401, { error: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
    const parts = new URL(request.url).pathname.replace(/^\/api\/registry\/?/, '').split('/').filter(Boolean);
    const r = deps.registry;
    const names = (ids: readonly string[]) => deps.directory?.(ids) ?? new Map<string, { displayName: string; email: string }>();

    if (parts[0] === 'invitations' && parts[1] === 'accept' && parts.length === 2 && m === 'POST') {
      const key = `accept:${user.userId}`;
      if (deps.rate && deps.rate.count(key, ACCEPT_WINDOW_MS) >= ACCEPT_MAX_FAILURES) throw new RegistryError('RATE_LIMITED', 'too many invalid invitation attempts; try again later');
      const b = await readBody(request);
      try {
        const mem = r.acceptInvitation(user, typeof b['token'] === 'string' ? b['token'] : '');
        return json(200, { membership: { orgId: mem.orgId, role: mem.role } });
      } catch (e) { if (e instanceof RegistryError && e.code === 'INVALID_INVITATION') deps.rate?.fail(key); throw e; }
    }

    if (parts[0] === 'orgs') {
      if (parts.length === 1 && m === 'GET') return json(200, { organizations: r.myOrganizations(user), actingAs: user.userId });
      if (parts.length === 1 && m === 'POST') { const b = await readBody(request); return json(201, { organization: r.createOrganization(user, { name: b['name'], description: b['description'], visibility: b['visibility'] }) }); }
      const orgId = parts[1] as string;
      const sub = parts[2];

      if (sub === undefined && m === 'GET') {
        const org = r.getOrganization(user, orgId);
        const role = r.members(user, orgId).find((x) => x.userId === user.userId)?.role ?? 'member';
        return json(200, { organization: org, role });
      }
      if (sub === 'update' && parts.length === 3 && m === 'POST') {
        const b = await readBody(request);
        return json(200, { organization: r.updateProfile(user, orgId, { name: b['name'], description: b['description'], visibility: b['visibility'] }) });
      }
      if (sub === 'members') {
        if (parts.length === 3 && m === 'GET') {
          const ms = r.members(user, orgId);
          const isAdmin = ms.some((x) => x.userId === user.userId && x.role === 'admin');
          const d = names(ms.map((x) => x.userId));
          const rv = new Set(r.reviewers(user, orgId).map((g) => g.userId));
          return json(200, { members: ms.map((x) => ({ userId: x.userId, role: x.role, reviewer: rv.has(x.userId), since: x.since, name: d.get(x.userId)?.displayName ?? x.userId, ...(isAdmin && d.get(x.userId) ? { email: d.get(x.userId)?.email } : {}), you: x.userId === user.userId })) });
        }
        if (parts.length === 5 && parts[4] === 'role' && m === 'POST') { const b = await readBody(request); r.setRole(user, orgId, parts[3] as string, roleOf(b['role'])); return json(200, { ok: true }); }
        if (parts.length === 5 && parts[4] === 'remove' && m === 'POST') { r.removeMember(user, orgId, parts[3] as string); return json(200, { ok: true }); }
      }
      if (sub === 'reviewers') {
        if (parts.length === 3 && m === 'GET') { const d = names(r.reviewers(user, orgId).map((g) => g.userId)); return json(200, { reviewers: r.reviewers(user, orgId).map((g) => ({ userId: g.userId, name: d.get(g.userId)?.displayName ?? 'a former user', grantedAt: g.grantedAt })) }); }
        if (parts.length === 5 && parts[4] === 'grant' && m === 'POST') { r.grantReviewer(user, orgId, parts[3] as string); return json(200, { ok: true }); }
        if (parts.length === 5 && parts[4] === 'revoke' && m === 'POST') { r.revokeReviewer(user, orgId, parts[3] as string); return json(200, { ok: true }); }
      }
      if (sub === 'invitations') {
        if (parts.length === 3 && m === 'GET') return json(200, { invitations: r.invitations(user, orgId) });
        if (parts.length === 3 && m === 'POST') {
          const b = await readBody(request);
          const { invitation, token } = r.invite(user, orgId, { invitee: b['invitee'], role: roleOf(b['role'] ?? 'member') });
          const { tokenHash: _h, ...safe } = invitation;
          // No email is sent: no delivery provider is configured. The administrator passes the one-time token to the invitee. It is shown once and never stored.
          return json(201, { invitation: safe, token, delivery: { sent: false, note: 'No email was sent. No delivery provider is configured: give this one-time code to the invitee yourself.' } });
        }
        if (parts.length === 5 && parts[4] === 'revoke' && m === 'POST') { r.revokeInvitation(user, orgId, parts[3] as string); return json(200, { ok: true }); }
      }
      if (sub === 'wallets' && parts.length === 3) {
        if (m === 'GET') return json(200, { wallets: r.wallets(user, orgId), note: 'Wallet links are unproven claims.' });
        if (m === 'POST') { const b = await readBody(request); return json(201, { wallet: r.linkWallet(user, orgId, b['address']), note: 'Recorded as an unproven claim; no proof of control was checked.' }); }
      }
      if (sub === 'sessions') {
        if (parts.length === 3 && m === 'GET') return json(200, { rows: listingRows(r.sessions(user, orgId), r.activity(user, orgId)) });
        if (parts.length === 3 && m === 'POST') {
          const b = await readBody(request);
          // A local draft: the id is generated here and recorded; nothing is sent to Stellar. Client-supplied id and provenance are ignored.
          const rec = r.recordSession(user, orgId, { sessionId: deps.newSessionId(), label: b['label'] });
          return json(201, { session: rec, notice: 'Local draft recorded. It is not an on-chain session.' });
        }
        if (parts.length === 4 && m === 'GET') {
          const rec = r.session(user, orgId, parts[3] as string);
          const ps = r.sessionParticipants(user, orgId, rec.sessionId);
          const acts = r.activity(user, orgId);
          const d = names([...ps.map((p) => p.userId), ...acts.map((a) => a.actor), ...acts.flatMap((a) => a.detail.match(USER_ID) ?? [])]);
          const activity = acts.map((a) => ({ ...a, actor: d.get(a.actor)?.displayName ?? a.actor, detail: a.detail.replace(USER_ID, (x) => d.get(x)?.displayName ?? 'a former user') }));
          const active = ps.filter((p) => (p.status ?? 'active') === 'active');
          return json(200, { workspace: workspaceOf(rec, activity, active.map((p) => ({ name: d.get(p.userId)?.displayName ?? p.userId, ...(p.walletAddress ? { walletClaim: p.walletAddress } : {}) }))), workflow: rec.workflow ?? 'configuring' });
        }
        if (parts.length >= 5 && m !== undefined) {
          const sessionId = parts[3] as string;
          const leaf = parts[4];
          const who = (ids: readonly string[]) => names(ids);
          const orgName = r.getOrganization(user, orgId).name;
          const viewParticipants = () => {
            const ps = r.sessionParticipants(user, orgId, sessionId);
            const d = who(ps.map((p) => p.userId));
            return ps.map((p) => ({ userId: p.userId, name: d.get(p.userId)?.displayName ?? 'a former user', organization: orgName, orgId: p.orgId, status: p.status ?? 'active', addedAt: p.addedAt, ...(p.removedAt ? { removedAt: p.removedAt } : {}), ...(p.walletAddress ? { walletClaim: p.walletAddress, walletProof: 'none' } : {}) }));
          };
          const viewObligation = (o: ReturnType<Registry['obligation']>, d: Map<string, { displayName: string; email: string }>) => ({ id: o.id, debtor: o.debtor, debtorName: d.get(o.debtor)?.displayName ?? 'a former user', creditor: o.creditor, creditorName: d.get(o.creditor)?.displayName ?? 'a former user', amount: o.amount, asset: o.asset, reference: o.reference, status: o.status, revision: o.revision, createdAt: o.createdAt, createdBy: d.get(o.createdBy)?.displayName ?? 'a former user', updatedAt: o.updatedAt, updatedBy: d.get(o.updatedBy)?.displayName ?? 'a former user' });
          const viewObligations = () => { const os = r.obligations(user, orgId, sessionId); const d = who(os.flatMap((o) => [o.debtor, o.creditor, o.createdBy, o.updatedBy])); return os.map((o) => viewObligation(o, d)); };
          const viewCalculation = () => {
            const v = r.calculationView(user, orgId, sessionId);
            const c = v.calculation;
            const d = who([...(c?.positions.map((p) => p.userId) ?? []), ...(c ? [c.createdBy] : [])]);
            return { currency: v.currency, asset: v.asset, calculation: c && { id: c.id, asset: c.asset, createdAt: c.createdAt, createdBy: d.get(c.createdBy)?.displayName ?? 'a former user', gross: c.gross, inputHash: c.inputHash, obligationCount: c.input.obligations.length, positions: c.positions.map((p) => ({ userId: p.userId, name: d.get(p.userId)?.displayName ?? 'a former user', organization: orgName, net: p.net, role: BigInt(p.net) > 0n ? 'debtor' : BigInt(p.net) < 0n ? 'creditor' : 'flat' })) }, note: 'An application-level calculation by the netting engine. It is not an approval, a signature, a settlement or a chain-verified result.' };
          };
          const NOTE = 'Application record only: not an on-chain admission, and any wallet is an unproven claim.';
          if (leaf === 'participants') {
            if (parts.length === 5 && m === 'GET') return json(200, { participants: viewParticipants(), note: NOTE });
            if (parts.length === 5 && m === 'POST') {
              const b = await readBody(request);
              r.addSessionParticipant(user, orgId, sessionId, { userId: b['userId'], ...(b['walletAddress'] !== undefined ? { walletAddress: b['walletAddress'] } : {}) });
              return json(201, { participants: viewParticipants(), note: NOTE });
            }
            if (parts.length === 7 && parts[6] === 'remove' && m === 'POST') { r.removeSessionParticipant(user, orgId, sessionId, parts[5] as string); return json(200, { participants: viewParticipants() }); }
          }
          if (leaf === 'obligations') {
            if (parts.length === 5 && m === 'GET') return json(200, { obligations: viewObligations() });
            if (parts.length === 5 && m === 'POST') {
              const b = await readBody(request);
              const o = r.createObligation(user, orgId, sessionId, { debtor: b['debtor'], creditor: b['creditor'], amount: b['amount'], asset: b['asset'], ...(b['reference'] !== undefined ? { reference: b['reference'] } : {}) });
              return json(201, { obligationId: o.id, obligations: viewObligations() });
            }
            if (parts.length === 6 && m === 'GET') { const o = r.obligation(user, orgId, sessionId, parts[5] as string); return json(200, { obligation: viewObligation(o, who([o.debtor, o.creditor, o.createdBy, o.updatedBy])) }); }
            if (parts.length === 7 && parts[6] === 'update' && m === 'POST') {
              const b = await readBody(request);
              r.updateObligation(user, orgId, sessionId, parts[5] as string, { debtor: b['debtor'], creditor: b['creditor'], amount: b['amount'], asset: b['asset'], reference: b['reference'] });
              return json(200, { obligations: viewObligations() });
            }
            if (parts.length === 7 && parts[6] === 'void' && m === 'POST') { const b = await readBody(request); r.voidObligation(user, orgId, sessionId, parts[5] as string, b['reason']); return json(200, { obligations: viewObligations() }); }
          }
          if (leaf === 'authorization') {
            const view = () => {
              const a = r.authorization(user, orgId, sessionId);
              const d = who(a.decisions.map((x) => x.decidedBy));
              return {
                state: a.state, sessionState: a.sessionState, currency: a.currency, calculationId: a.calculationId, eligibility: a.eligibility,
                decisions: a.decisions.map((x) => ({ id: x.id, calculationId: x.calculationId, decision: x.decision, reason: x.reason, decidedBy: d.get(x.decidedBy)?.displayName ?? 'a former user', decidedAt: x.decidedAt, status: x.status, ...(x.invalidatedAt ? { invalidatedAt: x.invalidatedAt, invalidationCause: x.invalidationCause } : {}) })),
                note: 'An institutional authorization is an application-level decision on one exact calculation. It is not a Stellar signature, not a transaction, not a settlement and not an on-chain confirmation. None of those exist in this application yet.',
              };
            };
            if (parts.length === 5 && m === 'GET') return json(200, view());
            if (parts.length === 6 && (parts[5] === 'approve' || parts[5] === 'reject') && m === 'POST') {
              const b = await readBody(request);
              r.decide(user, orgId, sessionId, parts[5] === 'approve' ? 'approved' : 'rejected', { calculationId: b['calculationId'], reason: b['reason'] });
              return json(201, view());
            }
          }
          if (parts.length === 5 && leaf === 'calculate' && m === 'POST') { r.calculate(user, orgId, sessionId); return json(201, viewCalculation()); }
          if (parts.length === 5 && leaf === 'calculation' && m === 'GET') return json(200, viewCalculation());
          if (parts.length === 5 && leaf === 'readiness' && m === 'GET') return json(200, { ...r.readiness(user, orgId, sessionId), note: 'Ready means the application records are consistent. No participant has signed, authorized or settled anything.' });
          if (parts.length === 5 && (leaf === 'ready' || leaf === 'reopen' || leaf === 'close') && m === 'POST') {
            if (leaf === 'ready') r.markReady(user, orgId, sessionId); else if (leaf === 'reopen') r.reopenSession(user, orgId, sessionId); else r.closeSession(user, orgId, sessionId);
            return json(200, { ...r.readiness(user, orgId, sessionId) });
          }
        }
      }
    }
    return json(404, { error: 'NOT_FOUND', message: 'not found' });
  } catch (e) {
    if (e instanceof RegistryError) return json(STATUS[e.code] ?? 400, { error: e.code, message: e.message });
    if (e instanceof Error && e.name === 'BackendUnavailable') return json(503, { error: 'BACKEND_UNAVAILABLE', message: 'The service is not available.' });
    return json(500, { error: 'INTERNAL', message: 'internal error' });
  }
}

export const randomSessionId = () => randomBytes(32).toString('hex');
