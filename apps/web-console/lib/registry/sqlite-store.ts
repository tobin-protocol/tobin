// Durable RegistryStore over SQLite. Same interface as the in-memory store, so the Registry rules are unchanged. Foreign keys, CHECK constraints and
// the append-only activity triggers live in the schema (lib/db/database.ts); this file only maps rows to records.
import type { Database } from '../db/database.ts';
import type { RegistryStore } from './store.ts';
import type { ActivityRecord, AuthorizationDecision, AuthorizationInvalidation, ReviewerGrant, CalculationRecord, ChainObservation, ObligationRecord, Invitation, Membership, Organization, OrgWallet, SessionParticipant, SessionRecord } from './types.ts';

type Row = Record<string, unknown>;
const rows = (x: unknown) => x as Row[];

function sessionOf(r: Row): SessionRecord {
  const s: SessionRecord = { sessionId: r['session_id'] as string, orgId: r['org_id'] as string, label: r['label'] as string, provenance: r['provenance'] as SessionRecord['provenance'], createdAt: r['created_at'] as string, workflow: r['workflow_state'] as SessionRecord['workflow'] };
  if (r['chain_json'] !== null) s.chain = JSON.parse(r['chain_json'] as string) as ChainObservation;
  if (r['confirmed_tx_hash'] !== null) s.confirmedTxHash = r['confirmed_tx_hash'] as string;
  return s;
}
const invitationOf = (r: Row): Invitation => ({ id: r['id'] as string, orgId: r['org_id'] as string, invitee: r['invitee'] as string, role: r['role'] as Invitation['role'], tokenHash: r['token_hash'] as string, status: r['status'] as Invitation['status'], expiresAt: r['expires_at'] as string, createdBy: r['created_by'] as string });
const membershipOf = (r: Row): Membership => ({ orgId: r['org_id'] as string, userId: r['user_id'] as string, role: r['role'] as Membership['role'], since: r['since'] as string });

const obligationOf = (r: Row): ObligationRecord => ({ id: r['id'] as string, sessionId: r['session_id'] as string, orgId: r['org_id'] as string, debtor: r['debtor'] as string, creditor: r['creditor'] as string, amount: r['amount'] as string, asset: r['asset'] as string, reference: r['reference'] as string, status: r['status'] as ObligationRecord['status'], revision: Number(r['revision']), createdAt: r['created_at'] as string, createdBy: r['created_by'] as string, updatedAt: r['updated_at'] as string, updatedBy: r['updated_by'] as string });
const calculationOf = (r: Row): CalculationRecord => ({ id: r['id'] as string, sessionId: r['session_id'] as string, orgId: r['org_id'] as string, asset: r['asset'] as string, inputHash: r['input_hash'] as string, input: JSON.parse(r['input_json'] as string) as CalculationRecord['input'], positions: JSON.parse(r['positions_json'] as string) as CalculationRecord['positions'], gross: r['gross'] as string, createdAt: r['created_at'] as string, createdBy: r['created_by'] as string });

export class SqliteRegistryStore implements RegistryStore {
  readonly #db: Database;
  constructor(db: Database) { this.#db = db; }
  #q(sql: string) { return this.#db.raw.prepare(sql); }

  transaction<T>(fn: () => T): T { return this.#db.tx(fn); }

  putOrganization(o: Organization) {
    this.#q('INSERT INTO organizations (id, name, description, visibility, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, visibility = excluded.visibility')
      .run(o.id, o.name, o.description, o.visibility, o.createdAt, o.createdBy);
  }
  getOrganization(id: string) {
    const r = this.#q('SELECT * FROM organizations WHERE id = ?').get(id) as Row | undefined;
    return r && { id: r['id'] as string, name: r['name'] as string, description: r['description'] as string, visibility: r['visibility'] as Organization['visibility'], createdAt: r['created_at'] as string, createdBy: r['created_by'] as string };
  }
  putMembership(m: Membership) {
    this.#q('INSERT INTO memberships (org_id, user_id, role, since) VALUES (?, ?, ?, ?) ON CONFLICT(org_id, user_id) DO UPDATE SET role = excluded.role').run(m.orgId, m.userId, m.role, m.since);
  }
  removeMembership(orgId: string, userId: string) { this.#q('DELETE FROM memberships WHERE org_id = ? AND user_id = ?').run(orgId, userId); }
  membershipsOfOrg(orgId: string) { return rows(this.#q('SELECT * FROM memberships WHERE org_id = ? ORDER BY since, user_id').all(orgId)).map(membershipOf); }
  membershipsOfUser(userId: string) { return rows(this.#q('SELECT * FROM memberships WHERE user_id = ? ORDER BY since, org_id').all(userId)).map(membershipOf); }

  putWallet(w: OrgWallet) {
    this.#q('INSERT INTO org_wallets (org_id, address, proof) VALUES (?, ?, ?) ON CONFLICT(org_id, address) DO UPDATE SET proof = excluded.proof').run(w.orgId, w.address, w.proof);
  }
  walletsOfOrg(orgId: string) { return rows(this.#q('SELECT * FROM org_wallets WHERE org_id = ? ORDER BY address').all(orgId)).map((r) => ({ orgId: r['org_id'] as string, address: r['address'] as string, proof: r['proof'] as OrgWallet['proof'] })); }

  putInvitation(i: Invitation) {
    this.#q('INSERT INTO invitations (id, org_id, invitee, role, token_hash, status, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status')
      .run(i.id, i.orgId, i.invitee, i.role, i.tokenHash, i.status, i.expiresAt, i.createdBy);
  }
  getInvitation(id: string) { const r = this.#q('SELECT * FROM invitations WHERE id = ?').get(id) as Row | undefined; return r && invitationOf(r); }
  invitationByTokenHash(hash: string) { const r = this.#q('SELECT * FROM invitations WHERE token_hash = ?').get(hash) as Row | undefined; return r && invitationOf(r); }
  invitationsOfOrg(orgId: string) { return rows(this.#q('SELECT * FROM invitations WHERE org_id = ? ORDER BY expires_at, id').all(orgId)).map(invitationOf); }

  putSession(s: SessionRecord) {
    this.#q(`INSERT INTO sessions (session_id, org_id, label, provenance, created_at, chain_json, confirmed_tx_hash, workflow_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET provenance = excluded.provenance, chain_json = excluded.chain_json, confirmed_tx_hash = excluded.confirmed_tx_hash, workflow_state = excluded.workflow_state`)
      .run(s.sessionId, s.orgId, s.label, s.provenance, s.createdAt, s.chain ? JSON.stringify(s.chain) : null, s.confirmedTxHash ?? null, s.workflow ?? 'configuring');
  }
  getSession(sessionId: string) { const r = this.#q('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as Row | undefined; return r && sessionOf(r); }
  sessionsOfOrg(orgId: string) { return rows(this.#q('SELECT * FROM sessions WHERE org_id = ? ORDER BY created_at, session_id').all(orgId)).map(sessionOf); }

  putParticipant(p: SessionParticipant) {
    this.#q('INSERT INTO session_participants (session_id, org_id, user_id, wallet_address, added_by, added_at, status, removed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, user_id) DO UPDATE SET wallet_address = excluded.wallet_address, added_by = excluded.added_by, added_at = excluded.added_at, status = excluded.status, removed_at = excluded.removed_at')
      .run(p.sessionId, p.orgId, p.userId, p.walletAddress ?? null, p.addedBy, p.addedAt, p.status ?? 'active', p.removedAt ?? null);
  }
  participantsOfSession(sessionId: string) {
    return rows(this.#q('SELECT * FROM session_participants WHERE session_id = ? ORDER BY added_at, user_id').all(sessionId)).map((r): SessionParticipant => {
      const p: SessionParticipant = { sessionId: r['session_id'] as string, orgId: r['org_id'] as string, userId: r['user_id'] as string, addedBy: r['added_by'] as string, addedAt: r['added_at'] as string, status: r['status'] as 'active' | 'removed' };
      if (r['removed_at'] !== null) p.removedAt = r['removed_at'] as string;
      if (r['wallet_address'] !== null) p.walletAddress = r['wallet_address'] as string;
      return p;
    });
  }

  putObligation(o: ObligationRecord) {
    this.#q(`INSERT INTO obligations (id, session_id, org_id, debtor, creditor, amount, asset, reference, status, revision, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET debtor = excluded.debtor, creditor = excluded.creditor, amount = excluded.amount, asset = excluded.asset, reference = excluded.reference, status = excluded.status, revision = excluded.revision, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .run(o.id, o.sessionId, o.orgId, o.debtor, o.creditor, o.amount, o.asset, o.reference, o.status, o.revision, o.createdAt, o.createdBy, o.updatedAt, o.updatedBy);
  }
  getObligation(id: string) { const r = this.#q('SELECT * FROM obligations WHERE id = ?').get(id) as Row | undefined; return r && obligationOf(r); }
  obligationsOfSession(sessionId: string) { return rows(this.#q('SELECT * FROM obligations WHERE session_id = ? ORDER BY created_at, id').all(sessionId)).map(obligationOf); }

  putCalculation(c: CalculationRecord) {
    this.#q('INSERT INTO calculations (id, session_id, org_id, asset, input_hash, input_json, positions_json, gross, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(c.id, c.sessionId, c.orgId, c.asset, c.inputHash, JSON.stringify(c.input), JSON.stringify(c.positions), c.gross, c.createdAt, c.createdBy);
  }
  latestCalculation(sessionId: string) { const r = this.#q('SELECT * FROM calculations WHERE session_id = ? ORDER BY seq DESC LIMIT 1').get(sessionId) as Row | undefined; return r && calculationOf(r); }
  calculationsOfSession(sessionId: string) { return rows(this.#q('SELECT * FROM calculations WHERE session_id = ? ORDER BY seq').all(sessionId)).map(calculationOf); }

  putReviewer(r: ReviewerGrant) {
    this.#q('INSERT INTO org_reviewers (org_id, user_id, granted_by, granted_at) VALUES (?, ?, ?, ?) ON CONFLICT(org_id, user_id) DO NOTHING').run(r.orgId, r.userId, r.grantedBy, r.grantedAt);
  }
  removeReviewer(orgId: string, userId: string) { this.#q('DELETE FROM org_reviewers WHERE org_id = ? AND user_id = ?').run(orgId, userId); }
  reviewersOfOrg(orgId: string) { return rows(this.#q('SELECT * FROM org_reviewers WHERE org_id = ? ORDER BY granted_at, user_id').all(orgId)).map((r): ReviewerGrant => ({ orgId: r['org_id'] as string, userId: r['user_id'] as string, grantedBy: r['granted_by'] as string, grantedAt: r['granted_at'] as string })); }
  putDecision(d: AuthorizationDecision) {
    this.#q('INSERT INTO authorization_decisions (id, session_id, org_id, calculation_id, decision, reason, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(d.id, d.sessionId, d.orgId, d.calculationId, d.decision, d.reason, d.decidedBy, d.decidedAt);
  }
  decisionsOfSession(sessionId: string) {
    return rows(this.#q('SELECT * FROM authorization_decisions WHERE session_id = ? ORDER BY seq').all(sessionId)).map((r): AuthorizationDecision => ({ id: r['id'] as string, sessionId: r['session_id'] as string, orgId: r['org_id'] as string, calculationId: r['calculation_id'] as string, decision: r['decision'] as AuthorizationDecision['decision'], reason: r['reason'] as string, decidedBy: r['decided_by'] as string, decidedAt: r['decided_at'] as string }));
  }
  putInvalidation(i: AuthorizationInvalidation) {
    this.#q('INSERT INTO authorization_invalidations (decision_id, cause, at, by_actor) VALUES (?, ?, ?, ?) ON CONFLICT(decision_id) DO NOTHING').run(i.decisionId, i.cause, i.at, i.by);
  }
  invalidationsOfSession(sessionId: string) {
    return rows(this.#q('SELECT i.* FROM authorization_invalidations i JOIN authorization_decisions d ON d.id = i.decision_id WHERE d.session_id = ?').all(sessionId)).map((r): AuthorizationInvalidation => ({ decisionId: r['decision_id'] as string, cause: r['cause'] as string, at: r['at'] as string, by: r['by_actor'] as string }));
  }

  appendActivity(a: ActivityRecord) { this.#q('INSERT INTO activity (id, at, org_id, actor, kind, subject, detail) VALUES (?, ?, ?, ?, ?, ?, ?)').run(a.id, a.at, a.orgId, a.actor, a.kind, a.subject, a.detail); }
  activityOfOrg(orgId: string) { return rows(this.#q('SELECT * FROM activity WHERE org_id = ? ORDER BY seq').all(orgId)).map((r): ActivityRecord => ({ id: r['id'] as string, at: r['at'] as string, orgId: r['org_id'] as string, actor: r['actor'] as string, kind: r['kind'] as string, subject: r['subject'] as string, detail: r['detail'] as string })); }
}
