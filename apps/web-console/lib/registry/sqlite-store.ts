// Durable RegistryStore over SQLite. Same interface as the in-memory store, so the Registry rules are unchanged. Foreign keys, CHECK constraints and
// the append-only activity triggers live in the schema (lib/db/database.ts); this file only maps rows to records.
import type { Database } from '../db/database.ts';
import type { RegistryStore } from './store.ts';
import type { SignerSetSnapshot, AttemptEvent, AttemptTransaction, SettlementAttempt, ExecutionEvent, SettlementExecution, WalletChallenge, WalletVerification, BatchInvalidation, BatchReview, SettlementBatch, SettlementInstruction, SupportedAsset, ActivityRecord, AuthorizationDecision, AuthorizationInvalidation, ReviewerGrant, CalculationRecord, ChainObservation, ObligationRecord, Invitation, Membership, Organization, OrgWallet, SessionParticipant, SessionRecord } from './types.ts';

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

const obligationOf = (r: Row): ObligationRecord => ({ id: r['id'] as string, sessionId: r['session_id'] as string, orgId: r['org_id'] as string, debtor: r['debtor'] as string, creditor: r['creditor'] as string, amount: r['amount'] as string, asset: r['asset'] as string, reference: r['reference'] as string, status: r['status'] as ObligationRecord['status'], revision: Number(r['revision']), createdAt: r['created_at'] as string, createdBy: r['created_by'] as string, updatedAt: r['updated_at'] as string, updatedBy: r['updated_by'] as string, ...(r['asset_ref'] !== null ? { assetRef: r['asset_ref'] as string } : {}), assetIdentity: r['asset_identity'] as ObligationRecord['assetIdentity'] });
const calculationOf = (r: Row): CalculationRecord => ({ id: r['id'] as string, sessionId: r['session_id'] as string, orgId: r['org_id'] as string, asset: r['asset'] as string, inputHash: r['input_hash'] as string, input: JSON.parse(r['input_json'] as string) as CalculationRecord['input'], positions: JSON.parse(r['positions_json'] as string) as CalculationRecord['positions'], gross: r['gross'] as string, createdAt: r['created_at'] as string, createdBy: r['created_by'] as string, ...(r['asset_ref'] !== null && r['asset_ref'] !== undefined ? { assetRef: r['asset_ref'] as string } : {}) });

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
    this.#q(`INSERT INTO obligations (id, session_id, org_id, debtor, creditor, amount, asset, reference, status, revision, created_at, created_by, updated_at, updated_by, asset_ref, asset_identity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET asset_ref = excluded.asset_ref, asset_identity = excluded.asset_identity, debtor = excluded.debtor, creditor = excluded.creditor, amount = excluded.amount, asset = excluded.asset, reference = excluded.reference, status = excluded.status, revision = excluded.revision, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .run(o.id, o.sessionId, o.orgId, o.debtor, o.creditor, o.amount, o.asset, o.reference, o.status, o.revision, o.createdAt, o.createdBy, o.updatedAt, o.updatedBy, o.assetRef ?? null, o.assetIdentity ?? 'legacy-unresolved');
  }
  getObligation(id: string) { const r = this.#q('SELECT * FROM obligations WHERE id = ?').get(id) as Row | undefined; return r && obligationOf(r); }
  obligationsOfSession(sessionId: string) { return rows(this.#q('SELECT * FROM obligations WHERE session_id = ? ORDER BY created_at, id').all(sessionId)).map(obligationOf); }

  putCalculation(c: CalculationRecord) {
    this.#q('INSERT INTO calculations (id, session_id, org_id, asset, input_hash, input_json, positions_json, gross, created_at, created_by, asset_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(c.id, c.sessionId, c.orgId, c.asset, c.inputHash, JSON.stringify(c.input), JSON.stringify(c.positions), c.gross, c.createdAt, c.createdBy, c.assetRef ?? null);
  }
  latestCalculation(sessionId: string) { const r = this.#q('SELECT * FROM calculations WHERE session_id = ? ORDER BY seq DESC LIMIT 1').get(sessionId) as Row | undefined; return r && calculationOf(r); }
  calculationsOfSession(sessionId: string) { return rows(this.#q('SELECT * FROM calculations WHERE session_id = ? ORDER BY seq').all(sessionId)).map(calculationOf); }

  putAsset(a: SupportedAsset) {
    this.#q('INSERT INTO supported_assets (id, network, kind, code, issuer, contract_id, status, source, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status').run(a.id, a.network, a.kind, a.code, a.issuer ?? null, a.contractId ?? null, a.status, a.source, a.addedAt);
  }
  assets() {
    return rows(this.#q('SELECT * FROM supported_assets ORDER BY id').all()).map((r): SupportedAsset => ({ id: r['id'] as string, network: r['network'] as SupportedAsset['network'], kind: r['kind'] as SupportedAsset['kind'], code: r['code'] as string, ...(r['issuer'] !== null ? { issuer: r['issuer'] as string } : {}), ...(r['contract_id'] !== null ? { contractId: r['contract_id'] as string } : {}), status: r['status'] as SupportedAsset['status'], source: 'operator-configured', addedAt: r['added_at'] as string }));
  }
  putBatch(b: SettlementBatch, instructions: SettlementInstruction[]) {
    this.#q('INSERT INTO settlement_batches (id, session_id, org_id, calculation_id, attempt, asset_id, asset_network, asset_kind, asset_code, asset_issuer, instruction_count, total_amount, instructions_hash, algorithm, validation_json, prepared_by, prepared_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(b.id, b.sessionId, b.orgId, b.calculationId, b.attempt, b.asset.id, b.asset.network, b.asset.kind, b.asset.code, b.asset.issuer ?? null, b.instructionCount, b.totalAmount, b.instructionsHash, b.algorithm, JSON.stringify(b.validation), b.preparedBy, b.preparedAt);
    for (const i of instructions) this.#q('INSERT INTO settlement_instructions (id, batch_id, session_id, org_id, calculation_id, approval_decision_id, network, seq, payer, payee, asset_id, amount, fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(i.id, i.batchId, i.sessionId, i.orgId ?? null, i.calculationId, i.approvalDecisionId ?? null, i.network ?? null, i.seq, i.payer, i.payee, i.assetId, i.amount, i.fingerprint ?? null);
  }
  batchesOfSession(sessionId: string) {
    return rows(this.#q('SELECT * FROM settlement_batches WHERE session_id = ? ORDER BY seq').all(sessionId)).map((r): SettlementBatch => ({ id: r['id'] as string, sessionId: r['session_id'] as string, orgId: r['org_id'] as string, calculationId: r['calculation_id'] as string, attempt: Number(r['attempt']), asset: { id: r['asset_id'] as string, network: r['asset_network'] as string, kind: r['asset_kind'] as string, code: r['asset_code'] as string, ...(r['asset_issuer'] !== null ? { issuer: r['asset_issuer'] as string } : {}) }, instructionCount: Number(r['instruction_count']), totalAmount: r['total_amount'] as string, instructionsHash: r['instructions_hash'] as string, algorithm: r['algorithm'] as string, validation: JSON.parse(r['validation_json'] as string) as SettlementBatch['validation'], preparedBy: r['prepared_by'] as string, preparedAt: r['prepared_at'] as string }));
  }
  instructionsOfBatch(batchId: string) {
    return rows(this.#q('SELECT * FROM settlement_instructions WHERE batch_id = ? ORDER BY seq').all(batchId)).map((r): SettlementInstruction => ({ id: r['id'] as string, batchId: r['batch_id'] as string, sessionId: r['session_id'] as string, calculationId: r['calculation_id'] as string, seq: Number(r['seq']), payer: r['payer'] as string, payee: r['payee'] as string, assetId: r['asset_id'] as string, amount: r['amount'] as string, ...(r['org_id'] !== null ? { orgId: r['org_id'] as string } : {}), ...(r['approval_decision_id'] !== null ? { approvalDecisionId: r['approval_decision_id'] as string } : {}), ...(r['network'] !== null ? { network: r['network'] as string } : {}), ...(r['fingerprint'] !== null ? { fingerprint: r['fingerprint'] as string } : {}) }));
  }
  putBatchReview(r: BatchReview) { this.#q('INSERT INTO settlement_batch_reviews (id, batch_id, decision, reason, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?)').run(r.id, r.batchId, r.decision, r.reason, r.decidedBy, r.decidedAt); }
  batchReviewsOfSession(sessionId: string) {
    return rows(this.#q('SELECT r.* FROM settlement_batch_reviews r JOIN settlement_batches b ON b.id = r.batch_id WHERE b.session_id = ? ORDER BY r.seq').all(sessionId)).map((r): BatchReview => ({ id: r['id'] as string, batchId: r['batch_id'] as string, decision: r['decision'] as BatchReview['decision'], reason: r['reason'] as string, decidedBy: r['decided_by'] as string, decidedAt: r['decided_at'] as string }));
  }
  putBatchInvalidation(i: BatchInvalidation) { this.#q('INSERT INTO settlement_batch_invalidations (batch_id, cause, at, by_actor) VALUES (?, ?, ?, ?) ON CONFLICT(batch_id) DO NOTHING').run(i.batchId, i.cause, i.at, i.by); }
  batchInvalidationsOfSession(sessionId: string) {
    return rows(this.#q('SELECT i.* FROM settlement_batch_invalidations i JOIN settlement_batches b ON b.id = i.batch_id WHERE b.session_id = ?').all(sessionId)).map((r): BatchInvalidation => ({ batchId: r['batch_id'] as string, cause: r['cause'] as string, at: r['at'] as string, by: r['by_actor'] as string }));
  }

  putChallenge(c: WalletChallenge) { this.#q('INSERT INTO wallet_challenges (id, org_id, user_id, network, public_key, nonce, message, issued_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(c.id, c.orgId, c.userId, c.network, c.publicKey, c.nonce, c.message, c.issuedAt, c.expiresAt, c.usedAt ?? null); }
  getChallenge(id: string) {
    const r = this.#q('SELECT * FROM wallet_challenges WHERE id = ?').get(id) as Row | undefined;
    return r && ({ id: r['id'] as string, orgId: r['org_id'] as string, userId: r['user_id'] as string, network: r['network'] as WalletChallenge['network'], publicKey: r['public_key'] as string, nonce: r['nonce'] as string, message: r['message'] as string, issuedAt: r['issued_at'] as string, expiresAt: r['expires_at'] as string, ...(r['used_at'] !== null ? { usedAt: r['used_at'] as string } : {}) } satisfies WalletChallenge);
  }
  markChallengeUsed(id: string, at: string) { this.#q('UPDATE wallet_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL').run(at, id); }
  putVerification(v: WalletVerification) { this.#q('INSERT INTO wallet_verifications (org_id, user_id, network, public_key, scheme, challenge_id, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(v.orgId, v.userId, v.network, v.publicKey, v.scheme, v.challengeId, v.verifiedAt); }
  verificationsOfOrg(orgId: string) { return rows(this.#q('SELECT * FROM wallet_verifications WHERE org_id = ? ORDER BY verified_at, public_key').all(orgId)).map((r): WalletVerification => ({ orgId: r['org_id'] as string, userId: r['user_id'] as string, network: r['network'] as WalletVerification['network'], publicKey: r['public_key'] as string, scheme: r['scheme'] as WalletVerification['scheme'], challengeId: r['challenge_id'] as string, verifiedAt: r['verified_at'] as string })); }
  putExecution(e: SettlementExecution, first: ExecutionEvent) {
    this.#q('INSERT INTO settlement_executions (id, batch_id, session_id, org_id, network, accounts_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(e.id, e.batchId, e.sessionId, e.orgId, e.network, JSON.stringify(e.accounts), e.createdBy, e.createdAt);
    this.putExecutionEvent(first);
  }
  executionOfBatch(batchId: string) {
    const r = this.#q('SELECT * FROM settlement_executions WHERE batch_id = ?').get(batchId) as Row | undefined;
    return r && ({ id: r['id'] as string, batchId: r['batch_id'] as string, sessionId: r['session_id'] as string, orgId: r['org_id'] as string, network: r['network'] as SettlementExecution['network'], accounts: JSON.parse(r['accounts_json'] as string) as Record<string, string>, createdBy: r['created_by'] as string, createdAt: r['created_at'] as string } satisfies SettlementExecution);
  }
  putExecutionEvent(ev: ExecutionEvent) { this.#q('INSERT INTO settlement_execution_events (execution_id, from_state, to_state, actor, at, detail, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(ev.executionId, ev.from, ev.to, ev.actor, ev.at, ev.detail, ev.evidence === undefined ? null : JSON.stringify(ev.evidence)); }
  eventsOfExecution(executionId: string) { return rows(this.#q('SELECT * FROM settlement_execution_events WHERE execution_id = ? ORDER BY seq').all(executionId)).map((r): ExecutionEvent => ({ seq: Number(r['seq']), executionId: r['execution_id'] as string, from: r['from_state'] as string | null, to: r['to_state'] as string, actor: r['actor'] as string, at: r['at'] as string, detail: r['detail'] as string, ...(r['evidence_json'] !== null ? { evidence: JSON.parse(r['evidence_json'] as string) as unknown } : {}) })); }

  putSignerSet(s: SignerSetSnapshot) { this.#q('INSERT INTO signer_set_snapshots (id, org_id, network, account, fingerprint, thresholds_json, signers_json, source, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(s.id, s.orgId, s.network, s.account, s.fingerprint, JSON.stringify(s.thresholds), JSON.stringify(s.signers), 'horizon+rpc-agreed', s.recordedBy, s.recordedAt); }
  signerSetsOfAccount(orgId: string, network: string, account: string) { return rows(this.#q('SELECT * FROM signer_set_snapshots WHERE org_id = ? AND network = ? AND account = ? ORDER BY seq').all(orgId, network, account)).map((r): SignerSetSnapshot => ({ id: r['id'] as string, orgId: r['org_id'] as string, network: r['network'] as SignerSetSnapshot['network'], account: r['account'] as string, fingerprint: r['fingerprint'] as string, thresholds: JSON.parse(r['thresholds_json'] as string) as SignerSetSnapshot['thresholds'], signers: JSON.parse(r['signers_json'] as string) as SignerSetSnapshot['signers'], recordedBy: r['recorded_by'] as string, recordedAt: r['recorded_at'] as string })); }
  putAttempt(a: SettlementAttempt, first: AttemptEvent) {
    this.#q('INSERT INTO settlement_attempts (id, execution_id, attempt_no, network, plan_fingerprint, plan_json, initiator, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(a.id, a.executionId, a.attemptNo, a.network, a.planFingerprint, JSON.stringify(a.plan, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), a.initiator, a.createdBy, a.createdAt);
    this.putAttemptEvent(first);
  }
  attemptsOfExecution(executionId: string) { return rows(this.#q('SELECT * FROM settlement_attempts WHERE execution_id = ? ORDER BY attempt_no').all(executionId)).map((r): SettlementAttempt => ({ id: r['id'] as string, executionId: r['execution_id'] as string, attemptNo: Number(r['attempt_no']), network: r['network'] as SettlementAttempt['network'], planFingerprint: r['plan_fingerprint'] as string, plan: JSON.parse(r['plan_json'] as string) as unknown, initiator: r['initiator'] as string, createdBy: r['created_by'] as string, createdAt: r['created_at'] as string })); }
  putAttemptEvent(ev: AttemptEvent) { this.#q('INSERT INTO settlement_attempt_events (attempt_id, kind, from_state, to_state, actor, at, detail, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(ev.attemptId, ev.kind, ev.from, ev.to, ev.actor, ev.at, ev.detail, ev.evidence === undefined ? null : JSON.stringify(ev.evidence)); }
  eventsOfAttempt(attemptId: string) { return rows(this.#q('SELECT * FROM settlement_attempt_events WHERE attempt_id = ? ORDER BY seq').all(attemptId)).map((r): AttemptEvent => ({ seq: Number(r['seq']), attemptId: r['attempt_id'] as string, kind: r['kind'] as AttemptEvent['kind'], from: r['from_state'] as string | null, to: r['to_state'] as string, actor: r['actor'] as string, at: r['at'] as string, detail: r['detail'] as string, ...(r['evidence_json'] !== null ? { evidence: JSON.parse(r['evidence_json'] as string) as unknown } : {}) })); }
  putAttemptTransaction(t: AttemptTransaction) { this.#q('INSERT INTO settlement_attempt_transactions (tx_hash, attempt_id, step_index, network, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)').run(t.txHash, t.attemptId, t.stepIndex, t.network, t.recordedBy, t.recordedAt); }
  transactionsOfAttempt(attemptId: string) { return rows(this.#q('SELECT * FROM settlement_attempt_transactions WHERE attempt_id = ? ORDER BY step_index').all(attemptId)).map((r): AttemptTransaction => ({ txHash: r['tx_hash'] as string, attemptId: r['attempt_id'] as string, stepIndex: Number(r['step_index']), network: r['network'] as AttemptTransaction['network'], recordedBy: r['recorded_by'] as string, recordedAt: r['recorded_at'] as string })); }
  attemptOfTransaction(txHash: string) { const r = this.#q('SELECT * FROM settlement_attempt_transactions WHERE tx_hash = ?').get(txHash) as Row | undefined; return r && ({ txHash: r['tx_hash'] as string, attemptId: r['attempt_id'] as string, stepIndex: Number(r['step_index']), network: r['network'] as AttemptTransaction['network'], recordedBy: r['recorded_by'] as string, recordedAt: r['recorded_at'] as string } satisfies AttemptTransaction); }

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
