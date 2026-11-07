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
export interface DirectoryEntry { displayName: string; email: string; /** the user's first verified wallet, for display to administrators only */ wallet?: string }

export interface RegistryDeps {
  registry: Registry;
  /** resolves the acting user from the request (session cookie), or null */
  authenticate: (request: Request) => Promise<ActingUser | null> | ActingUser | null;
  /** user display data for member lists and activity; absent for development identities */
  directory?: (ids: readonly string[]) => Map<string, DirectoryEntry>;
  /** failure counter used to slow down invitation-token guessing */
  rate?: { count: (key: string, windowMs: number) => number; fail: (key: string) => void };
  newSessionId: () => string;
}

const STATUS: Record<string, number> = { NOT_FOUND: 404, INVALID: 400, FORBIDDEN: 403, EXISTS: 409, LAST_ADMIN: 409, INVALID_STATE: 409, NOT_VERIFIED: 409, FIXTURE: 409, INVALID_INVITATION: 400, RATE_LIMITED: 429, STALE: 409, SEPARATION_OF_DUTIES: 403, INVALID_CHALLENGE: 400 };
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
    const names = (ids: readonly string[]) => deps.directory?.(ids) ?? new Map<string, DirectoryEntry>();

    if (parts[0] === 'invitations' && parts[1] === 'accept' && parts.length === 2 && m === 'POST') {
      const key = `accept:${user.userId}`;
      if (deps.rate && deps.rate.count(key, ACCEPT_WINDOW_MS) >= ACCEPT_MAX_FAILURES) throw new RegistryError('RATE_LIMITED', 'too many invalid invitation attempts; try again later');
      const b = await readBody(request);
      try {
        const mem = r.acceptInvitation(user, typeof b['token'] === 'string' ? b['token'] : '');
        return json(200, { membership: { orgId: mem.orgId, role: mem.role } });
      } catch (e) { if (e instanceof RegistryError && e.code === 'INVALID_INVITATION') deps.rate?.fail(key); throw e; }
    }

    if (parts[0] === 'assets' && parts.length === 1 && m === 'GET') {
      return json(200, { assets: r.supportedAssets(), note: 'Operator-configured local list. It is not an on-chain query and says nothing about availability, liquidity or transferability. It cannot be changed through this API.' });
    }

    if (parts[0] === 'orgs') {
      if (parts.length === 1 && m === 'GET') return json(200, { organizations: r.myOrganizations(user), actingAs: user.userId });
      if (parts.length === 1 && m === 'POST') { const b = await readBody(request); return json(201, { organization: r.createOrganization(user, { name: b['name'], description: b['description'], visibility: b['visibility'], institutionType: b['institutionType'], jurisdiction: b['jurisdiction'] }) }); }
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
          return json(200, { members: ms.map((x) => ({ userId: x.userId, role: x.role, reviewer: rv.has(x.userId), since: x.since, status: x.status ?? 'active', name: d.get(x.userId)?.displayName ?? x.userId, ...(isAdmin && d.get(x.userId) ? { email: d.get(x.userId)?.email, ...(d.get(x.userId)?.wallet ? { wallet: d.get(x.userId)?.wallet } : {}) } : {}), you: x.userId === user.userId })) });
        }
        if (parts.length === 5 && parts[4] === 'role' && m === 'POST') { const b = await readBody(request); r.setRole(user, orgId, parts[3] as string, roleOf(b['role'])); return json(200, { ok: true }); }
        if (parts.length === 5 && parts[4] === 'remove' && m === 'POST') { r.removeMember(user, orgId, parts[3] as string); return json(200, { ok: true }); }
        if (parts.length === 5 && parts[4] === 'status' && m === 'POST') { const b = await readBody(request); r.setMemberStatus(user, orgId, parts[3] as string, b['status'] === 'suspended' ? 'suspended' : b['status'] === 'active' ? 'active' : (() => { throw new RegistryError('INVALID', 'status must be active or suspended'); })()); return json(200, { ok: true }); }
      }
      if (sub === 'wallet-challenges') {
        if (parts.length === 3 && m === 'POST') {
          const b = await readBody(request);
          const c = r.issueWalletChallenge(user, orgId, { network: b['network'], publicKey: b['publicKey'] });
          return json(201, { challenge: { id: c.id, network: c.network, publicKey: c.publicKey, message: c.message, expiresAt: c.expiresAt }, note: 'Sign this exact message with the key (outside Tobin) and return the base64 signature. It signs no transaction and authorizes no payment. Verifying proves control of the key only: it grants no role or permission.' });
        }
        if (parts.length === 5 && parts[4] === 'verify' && m === 'POST') {
          const b = await readBody(request);
          const v = r.verifyWalletChallenge(user, orgId, { challengeId: parts[3], signature: b['signature'], scheme: b['scheme'] });
          return json(201, { verification: { network: v.network, publicKey: v.publicKey, scheme: v.scheme, verifiedAt: v.verifiedAt }, note: 'Ownership of the key is proven. This grants no institutional role or permission.' });
        }
      }
      if (sub === 'wallet-verifications' && parts.length === 3 && m === 'GET') {
        const vs = r.walletVerifications(user, orgId); const d = names(vs.map((x) => x.userId));
        return json(200, { verifications: vs.map((x) => ({ userId: x.userId, name: d.get(x.userId)?.displayName ?? 'a former user', network: x.network, publicKey: x.publicKey, verifiedAt: x.verifiedAt })), note: 'Proof of control of a key. It confers no role, no reviewer capability and no signing authority in Tobin.' });
      }
      if (sub === 'signer-sets') {
        if (parts.length === 3 && m === 'POST') {
          // reads the chain HERE (Horizon and the RPC must agree): a caller can never supply weights or thresholds
          const b = await readBody(request);
          if (b['network'] !== 'testnet') throw new RegistryError('INVALID', 'only testnet is enabled');
          if (typeof b['account'] !== 'string') throw new RegistryError('INVALID', 'account is required');
          r.requireSignerSetAdmin(user, orgId); // authorization BEFORE any network read: outsiders get the uniform 404, members 403
          const { fetchLiveSignerSet } = await import('../stellar/live.ts');
          const live = await fetchLiveSignerSet(b['account'], 'testnet');
          if (!live.ok) return json(503, { error: 'CHAIN_UNAVAILABLE', message: live.reason });
          const rec = r.recordSignerSet(user, orgId, { set: live.set, fingerprint: live.fingerprint });
          return json(rec.changed ? 201 : 200, { fingerprint: rec.snapshot.fingerprint, changed: rec.changed, thresholds: rec.snapshot.thresholds, signers: rec.snapshot.signers, note: 'Read from the chain (Horizon and the RPC agreed). Information for verification only: it grants no role or permission, and it does not authorize any transaction.' });
        }
        if (parts.length === 4 && m === 'GET') { const h = r.signerSetHistory(user, orgId, 'testnet', parts[3] as string); return json(200, { current: h.current, history: h.history.map((x) => ({ fingerprint: x.fingerprint, recordedAt: x.recordedAt })) }); }
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
          const viewObligation = (o: ReturnType<Registry['obligation']>, d: Map<string, { displayName: string; email: string }>) => ({ id: o.id, debtor: o.debtor, debtorName: d.get(o.debtor)?.displayName ?? 'a former user', creditor: o.creditor, creditorName: d.get(o.creditor)?.displayName ?? 'a former user', amount: o.amount, asset: o.asset, assetRef: o.assetRef ?? null, assetIdentity: o.assetIdentity ?? 'legacy-unresolved', reference: o.reference, status: o.status, revision: o.revision, createdAt: o.createdAt, createdBy: d.get(o.createdBy)?.displayName ?? 'a former user', updatedAt: o.updatedAt, updatedBy: d.get(o.updatedBy)?.displayName ?? 'a former user' });
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
              const o = r.createObligation(user, orgId, sessionId, { debtor: b['debtor'], creditor: b['creditor'], amount: b['amount'], asset: b['asset'], ...(b['assetRef'] !== undefined ? { assetRef: b['assetRef'] } : {}), ...(b['reference'] !== undefined ? { reference: b['reference'] } : {}) });
              return json(201, { obligationId: o.id, obligations: viewObligations() });
            }
            if (parts.length === 6 && m === 'GET') { const o = r.obligation(user, orgId, sessionId, parts[5] as string); return json(200, { obligation: viewObligation(o, who([o.debtor, o.creditor, o.createdBy, o.updatedBy])) }); }
            if (parts.length === 7 && parts[6] === 'update' && m === 'POST') {
              const b = await readBody(request);
              r.updateObligation(user, orgId, sessionId, parts[5] as string, { debtor: b['debtor'], creditor: b['creditor'], amount: b['amount'], asset: b['asset'], ...(b['assetRef'] !== undefined ? { assetRef: b['assetRef'] } : {}), reference: b['reference'] });
              return json(200, { obligations: viewObligations() });
            }
            if (parts.length === 7 && parts[6] === 'void' && m === 'POST') { const b = await readBody(request); r.voidObligation(user, orgId, sessionId, parts[5] as string, b['reason']); return json(200, { obligations: viewObligations() }); }
          }
          if (leaf === 'settlement') {
            const NOTE = 'Settlement PREPARATION only. These instructions are not signed, not submitted and not settled: no wallet, transaction or network is involved, and no funds have moved. Approving a batch is an application-level decision, not a Stellar signature.';
            const batchView = (id: string) => {
              const v = r.settlementBatch(user, orgId, sessionId, id);
              const d = who([v.batch.preparedBy, ...(v.review ? [v.review.decidedBy] : []), ...v.instructions.flatMap((i) => [i.payer, i.payee])]);
              const nm = (u: string) => d.get(u)?.displayName ?? 'a former user';
              return {
                batch: { id: v.batch.id, attempt: v.batch.attempt, calculationId: v.batch.calculationId, asset: v.batch.asset, instructionCount: v.batch.instructionCount, totalAmount: v.batch.totalAmount, instructionsHash: v.batch.instructionsHash, algorithm: v.batch.algorithm, preparedBy: nm(v.batch.preparedBy), preparedAt: v.batch.preparedAt },
                status: v.status, validation: v.validation, eligibility: v.eligibility,
                instructions: v.instructions.map((i) => ({ id: i.id, seq: i.seq, payer: i.payer, payerName: nm(i.payer), payee: i.payee, payeeName: nm(i.payee), assetId: i.assetId, amount: i.amount, sessionId: i.sessionId, calculationId: i.calculationId, batchId: i.batchId, orgId: i.orgId ?? null, approvalDecisionId: i.approvalDecisionId ?? null, network: i.network ?? null, fingerprint: i.fingerprint ?? null, sourceAccount: null, destinationAccount: null, validation: 'valid' })),
                ...(v.review ? { review: { decision: v.review.decision, reason: v.review.reason, decidedBy: nm(v.review.decidedBy), decidedAt: v.review.decidedAt } } : {}),
                ...(v.invalidation ? { invalidation: { cause: v.invalidation.cause, at: v.invalidation.at } } : {}),
                note: NOTE,
              };
            };
            const listView = () => {
              const list = r.settlementBatches(user, orgId, sessionId);
              const d = who(list.flatMap((x) => [x.batch.preparedBy, ...(x.review ? [x.review.decidedBy] : [])]));
              const pv = r.settlementPreview(user, orgId, sessionId);
              return {
                preview: pv, note: NOTE, assets: r.supportedAssets().map((a) => ({ id: a.id, code: a.code, status: a.status })),
                batches: list.map((x) => ({ id: x.batch.id, attempt: x.batch.attempt, calculationId: x.batch.calculationId, status: x.status, asset: x.batch.asset, instructionCount: x.batch.instructionCount, totalAmount: x.batch.totalAmount, preparedBy: d.get(x.batch.preparedBy)?.displayName ?? 'a former user', preparedAt: x.batch.preparedAt, ...(x.review ? { decision: { decision: x.review.decision, reason: x.review.reason, decidedBy: d.get(x.review.decidedBy)?.displayName ?? 'a former user', decidedAt: x.review.decidedAt } } : {}), ...(x.invalidation ? { invalidation: { cause: x.invalidation.cause, at: x.invalidation.at } } : {}) })),
              };
            };
            if (parts.length === 5 && m === 'GET') return json(200, listView());
            if (parts.length === 6 && parts[5] === 'prepare' && m === 'POST') {
              const b = await readBody(request);
              const batch = r.prepareSettlementBatch(user, orgId, sessionId, { calculationId: b['calculationId'], ...(b['attempt'] !== undefined ? { attempt: b['attempt'] } : {}) });
              return json(201, { batchId: batch.id, ...listView() });
            }
            if (parts[5] === 'batches') {
              const bid = parts[6] as string;
              if (parts.length === 8 && parts[7] === 'execution' && m === 'GET') {
                const ex = r.settlementExecution(user, orgId, sessionId, bid);
                const bv = r.settlementBatch(user, orgId, sessionId, bid);
                const people = [...new Set(bv.instructions.flatMap((i) => [i.payer, i.payee]))];
                const d = who([...people, ...(ex ? ex.events.map((e) => e.actor) : [])]);
                const vs = r.walletVerifications(user, orgId).filter((x) => x.network === bv.batch.asset.network);
                return json(200, {
                  network: bv.batch.asset.network, batchStatus: bv.status,
                  participants: people.map((p) => ({ userId: p, name: d.get(p)?.displayName ?? 'a former user', verifiedAccount: vs.filter((x) => x.userId === p).length === 1 ? (vs.find((x) => x.userId === p)?.publicKey ?? null) : null, verifiedCount: vs.filter((x) => x.userId === p).length })),
                  execution: ex ? { id: ex.execution.id, state: ex.state, accounts: ex.execution.accounts, createdAt: ex.execution.createdAt, events: ex.events.map((e) => ({ from: e.from, to: e.to, at: e.at, actor: d.get(e.actor)?.displayName ?? 'a former user', detail: e.detail })) } : null,
                  unavailable: ['Wallet connection', 'Transaction construction', 'Wallet signing', 'Transaction submission', 'Independent on-chain verification', 'Reconciliation against the chain'],
                  note: 'This build records the Stellar-side preconditions only. Wallet signing, transaction construction, submission and on-chain verification are NOT implemented: nothing has been signed, submitted or settled.',
                });
              }
              if (parts.length === 9 && parts[7] === 'execution' && parts[8] === 'attempts' && m === 'GET') {
                const list = r.settlementAttempts(user, orgId, sessionId, bid); const d = who(list.flatMap((x) => x.events.map((e) => e.actor)));
                return json(200, { attempts: list.map((x) => { const plan = x.attempt.plan as { steps: { index: number; fn: string; signers: string[]; note: string }[]; requiredSigners: string[]; sessionId: string; expectedDigest: string } | undefined; return { attemptNo: x.attempt.attemptNo, state: x.state, network: x.attempt.network, planFingerprint: x.attempt.planFingerprint, createdAt: x.attempt.createdAt, onChainSessionId: plan?.sessionId ?? null, expectedDigest: plan?.expectedDigest ?? null, requiredSigners: plan?.requiredSigners ?? [], steps: (plan?.steps ?? []).map((s) => ({ index: s.index, fn: s.fn, signers: s.signers, note: s.note })), transactions: x.transactions, events: x.events.map((e) => ({ kind: e.kind, from: e.from, to: e.to, at: e.at, actor: d.get(e.actor)?.displayName ?? 'a former user', detail: e.detail })) }; }), note: 'An attempt is a technical try to execute the approved batch. A plan is not a transaction: nothing has been constructed, signed or submitted by creating one.' });
              }
              if (parts.length === 10 && parts[7] === 'execution' && parts[8] === 'attempts' && parts[9] === 'begin' && m === 'POST') {
                const b = await readBody(request);
                const a = r.beginExecutionAttempt(user, orgId, sessionId, bid, { initiator: b['initiator'], reviewedFailure: b['reviewedFailure'] });
                return json(201, { attemptNo: a.attemptNo, planFingerprint: a.planFingerprint, state: 'awaiting-signer', note: 'Plan prepared. No transaction has been constructed, signed or submitted.' });
              }
              if (parts.length === 9 && parts[7] === 'execution' && parts[8] === 'start' && m === 'POST') { const e = r.startSettlementExecution(user, orgId, sessionId, bid); return json(201, { executionId: e.id, state: 'awaiting-signer', note: 'Execution prepared and awaiting a signer. No signing, submission or confirmation exists in this build.' }); }
              if (parts.length === 7 && m === 'GET') return json(200, batchView(bid));
              if (parts.length === 8 && parts[7] === 'validation' && m === 'GET') return json(200, { validation: r.settlementBatchValidation(user, orgId, sessionId, bid), note: NOTE });
              if (parts.length === 8 && (parts[7] === 'approve' || parts[7] === 'reject') && m === 'POST') {
                const b = await readBody(request);
                r.decideSettlementBatch(user, orgId, sessionId, bid, parts[7] === 'approve' ? 'approved' : 'rejected', { instructionsHash: b['instructionsHash'], reason: b['reason'] });
                return json(201, batchView(bid));
              }
            }
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
