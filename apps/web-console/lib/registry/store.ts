// Persistence interface for the registry. The database choice is an open owner decision; this in-memory implementation is NON-PRODUCTION (lost on
// restart) and exists only for isolated unit tests. The production store is SqliteRegistryStore (sqlite-store.ts). Reads return copies.
import type { SignerSetSnapshot, AttemptEvent, AttemptTransaction, SettlementAttempt, ExecutionEvent, SettlementExecution, WalletChallenge, WalletVerification, BatchInvalidation, BatchReview, SettlementBatch, SettlementInstruction, SupportedAsset, ActivityRecord, AuthorizationDecision, AuthorizationInvalidation, ReviewerGrant, CalculationRecord, Invitation, ObligationRecord, Membership, Organization, OrgWallet, SessionParticipant, SessionRecord } from './types.ts';

const clone = <T>(x: T): T => structuredClone(x);

export interface RegistryStore {
  /** Runs fn atomically: every write inside it is kept or none is (the in-memory store restores a snapshot, the SQLite store rolls back). */
  transaction<T>(fn: () => T): T;
  putOrganization(o: Organization): void;
  getOrganization(id: string): Organization | undefined;
  putMembership(m: Membership): void;
  removeMembership(orgId: string, userId: string): void;
  membershipsOfOrg(orgId: string): Membership[];
  membershipsOfUser(userId: string): Membership[];
  putWallet(w: OrgWallet): void;
  walletsOfOrg(orgId: string): OrgWallet[];
  putInvitation(i: Invitation): void;
  getInvitation(id: string): Invitation | undefined;
  invitationByTokenHash(hash: string): Invitation | undefined;
  invitationsOfOrg(orgId: string): Invitation[];
  putSession(s: SessionRecord): void;
  getSession(sessionId: string): SessionRecord | undefined;
  sessionsOfOrg(orgId: string): SessionRecord[];
  putParticipant(p: SessionParticipant): void;
  participantsOfSession(sessionId: string): SessionParticipant[];
  putObligation(o: ObligationRecord): void;
  getObligation(id: string): ObligationRecord | undefined;
  obligationsOfSession(sessionId: string): ObligationRecord[];
  putCalculation(c: CalculationRecord): void;
  latestCalculation(sessionId: string): CalculationRecord | undefined;
  calculationsOfSession(sessionId: string): CalculationRecord[];
  putReviewer(r: ReviewerGrant): void;
  removeReviewer(orgId: string, userId: string): void;
  reviewersOfOrg(orgId: string): ReviewerGrant[];
  /** throws if a decision for the same calculation already exists */
  putDecision(d: AuthorizationDecision): void;
  decisionsOfSession(sessionId: string): AuthorizationDecision[];
  putInvalidation(i: AuthorizationInvalidation): void;
  invalidationsOfSession(sessionId: string): AuthorizationInvalidation[];
  /** operator configuration is written by the operator tool, not by the application API */
  putAsset(a: SupportedAsset): void;
  assets(): SupportedAsset[];
  /** throws if a batch for the same calculation already exists */
  putBatch(b: SettlementBatch, instructions: SettlementInstruction[]): void;
  batchesOfSession(sessionId: string): SettlementBatch[];
  instructionsOfBatch(batchId: string): SettlementInstruction[];
  putBatchReview(r: BatchReview): void;
  batchReviewsOfSession(sessionId: string): BatchReview[];
  putBatchInvalidation(i: BatchInvalidation): void;
  batchInvalidationsOfSession(sessionId: string): BatchInvalidation[];
  putChallenge(c: WalletChallenge): void;
  getChallenge(id: string): WalletChallenge | undefined;
  markChallengeUsed(id: string, at: string): void;
  /** throws if the key is already verified in the organization on that network */
  putVerification(v: WalletVerification): void;
  verificationsOfOrg(orgId: string): WalletVerification[];
  putExecution(e: SettlementExecution, first: ExecutionEvent): void;
  executionOfBatch(batchId: string): SettlementExecution | undefined;
  putExecutionEvent(ev: ExecutionEvent): void;
  eventsOfExecution(executionId: string): ExecutionEvent[];
  /** throws if (execution, attemptNo) already exists */
  putAttempt(a: SettlementAttempt, first: AttemptEvent): void;
  attemptsOfExecution(executionId: string): SettlementAttempt[];
  putAttemptEvent(ev: AttemptEvent): void;
  eventsOfAttempt(attemptId: string): AttemptEvent[];
  /** throws if the hash is already recorded, or the step already has a transaction for that attempt */
  putAttemptTransaction(t: AttemptTransaction): void;
  transactionsOfAttempt(attemptId: string): AttemptTransaction[];
  attemptOfTransaction(txHash: string): AttemptTransaction | undefined;
  /** throws if the same fingerprint is already recorded for the account */
  putSignerSet(s: SignerSetSnapshot): void;
  signerSetsOfAccount(orgId: string, network: string, account: string): SignerSetSnapshot[];
  appendActivity(a: ActivityRecord): void;
  activityOfOrg(orgId: string): ActivityRecord[];
}

export class InMemoryRegistryStore implements RegistryStore {
  readonly #orgs = new Map<string, Organization>();
  readonly #members = new Map<string, Membership>();
  readonly #wallets = new Map<string, OrgWallet>();
  readonly #invites = new Map<string, Invitation>();
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #activity: ActivityRecord[] = [];
  readonly #participants = new Map<string, SessionParticipant>();
  readonly #obligations = new Map<string, ObligationRecord>();
  readonly #calcs: CalculationRecord[] = [];
  readonly #reviewers = new Map<string, ReviewerGrant>();
  readonly #decisions: AuthorizationDecision[] = [];
  readonly #invalidations = new Map<string, AuthorizationInvalidation>();
  readonly #assets = new Map<string, SupportedAsset>();
  readonly #batches: SettlementBatch[] = [];
  readonly #instructions: SettlementInstruction[] = [];
  readonly #reviews: BatchReview[] = [];
  readonly #batchInv = new Map<string, BatchInvalidation>();
  readonly #challenges = new Map<string, WalletChallenge>();
  readonly #verifs: WalletVerification[] = [];
  readonly #execs = new Map<string, SettlementExecution>();
  readonly #events: ExecutionEvent[] = [];
  readonly #attempts: SettlementAttempt[] = [];
  readonly #attEvents: AttemptEvent[] = [];
  readonly #attTx: AttemptTransaction[] = [];
  readonly #signerSets: SignerSetSnapshot[] = [];
  transaction<T>(fn: () => T): T {
    const maps = [this.#orgs, this.#members, this.#wallets, this.#invites, this.#sessions, this.#participants, this.#obligations, this.#reviewers, this.#invalidations, this.#assets, this.#batchInv, this.#challenges, this.#execs] as Map<string, unknown>[];
    const snap = maps.map((m) => new Map(m));
    const act = this.#activity.length; const calcs = this.#calcs.length; const decs = this.#decisions.length; const bats = this.#batches.length; const ins = this.#instructions.length; const revs = this.#reviews.length; const vers = this.#verifs.length; const evs = this.#events.length; const atts = this.#attempts.length; const aev = this.#attEvents.length; const atx = this.#attTx.length; const sss = this.#signerSets.length;
    try { return fn(); } catch (e) {
      for (const [i, m] of maps.entries()) { m.clear(); for (const [k, v] of snap[i] as Map<string, unknown>) m.set(k, v); }
      this.#activity.length = act; this.#calcs.length = calcs; this.#decisions.length = decs; this.#batches.length = bats; this.#instructions.length = ins; this.#reviews.length = revs; this.#verifs.length = vers; this.#events.length = evs; this.#attempts.length = atts; this.#attEvents.length = aev; this.#attTx.length = atx; this.#signerSets.length = sss; throw e;
    }
  }
  putAsset(a: SupportedAsset) { this.#assets.set(a.id, clone(a)); }
  assets() { return [...this.#assets.values()].map(clone); }
  putBatch(b: SettlementBatch, instructions: SettlementInstruction[]) { if (this.#batches.some((x) => x.calculationId === b.calculationId && x.attempt === b.attempt)) throw new Error('UNIQUE constraint failed: settlement_batches.calculation_id, attempt'); this.#batches.push(clone(b)); for (const i of instructions) this.#instructions.push(clone(i)); }
  batchesOfSession(sessionId: string) { return this.#batches.filter((b) => b.sessionId === sessionId).map(clone); }
  instructionsOfBatch(batchId: string) { return this.#instructions.filter((i) => i.batchId === batchId).sort((a, b) => a.seq - b.seq).map(clone); }
  putBatchReview(r: BatchReview) { if (this.#reviews.some((x) => x.batchId === r.batchId)) throw new Error('UNIQUE constraint failed: settlement_batch_reviews.batch_id'); this.#reviews.push(clone(r)); }
  batchReviewsOfSession(sessionId: string) { const ids = new Set(this.#batches.filter((b) => b.sessionId === sessionId).map((b) => b.id)); return this.#reviews.filter((r) => ids.has(r.batchId)).map(clone); }
  putBatchInvalidation(i: BatchInvalidation) { if (!this.#batchInv.has(i.batchId)) this.#batchInv.set(i.batchId, clone(i)); }
  batchInvalidationsOfSession(sessionId: string) { const ids = new Set(this.#batches.filter((b) => b.sessionId === sessionId).map((b) => b.id)); return [...this.#batchInv.values()].filter((i) => ids.has(i.batchId)).map(clone); }
  putChallenge(c: WalletChallenge) { this.#challenges.set(c.id, clone(c)); }
  getChallenge(id: string) { const c = this.#challenges.get(id); return c && clone(c); }
  markChallengeUsed(id: string, at: string) { const c = this.#challenges.get(id); if (c) c.usedAt = at; }
  putVerification(v: WalletVerification) { if (this.#verifs.some((x) => x.orgId === v.orgId && x.network === v.network && x.publicKey === v.publicKey)) throw new Error('UNIQUE constraint failed: wallet_verifications'); this.#verifs.push(clone(v)); }
  verificationsOfOrg(orgId: string) { return this.#verifs.filter((v) => v.orgId === orgId && this.#members.has(`${v.orgId}|${v.userId}`)).map(clone); }
  putExecution(e: SettlementExecution, first: ExecutionEvent) { if (this.#execs.has(e.batchId)) throw new Error('UNIQUE constraint failed: settlement_executions.batch_id'); this.#execs.set(e.batchId, clone(e)); this.#events.push(clone(first)); }
  executionOfBatch(batchId: string) { const e = this.#execs.get(batchId); return e && clone(e); }
  putExecutionEvent(ev: ExecutionEvent) { this.#events.push(clone(ev)); }
  eventsOfExecution(executionId: string) { return this.#events.filter((x) => x.executionId === executionId).map(clone); }
  putSignerSet(s: SignerSetSnapshot) { if (this.#signerSets.some((x) => x.orgId === s.orgId && x.network === s.network && x.account === s.account && x.fingerprint === s.fingerprint)) throw new Error('UNIQUE constraint failed: signer_set_snapshots'); this.#signerSets.push(clone(s)); }
  signerSetsOfAccount(orgId: string, network: string, account: string) { return this.#signerSets.filter((x) => x.orgId === orgId && x.network === network && x.account === account).map(clone); }
  putAttempt(a: SettlementAttempt, first: AttemptEvent) { if (this.#attempts.some((x) => x.executionId === a.executionId && x.attemptNo === a.attemptNo)) throw new Error('UNIQUE constraint failed: settlement_attempts'); this.#attempts.push(clone(a)); this.#attEvents.push(clone(first)); }
  attemptsOfExecution(executionId: string) { return this.#attempts.filter((a) => a.executionId === executionId).sort((a, b) => a.attemptNo - b.attemptNo).map(clone); }
  putAttemptEvent(ev: AttemptEvent) { this.#attEvents.push(clone(ev)); }
  eventsOfAttempt(attemptId: string) { return this.#attEvents.filter((e) => e.attemptId === attemptId).map(clone); }
  putAttemptTransaction(t: AttemptTransaction) { if (this.#attTx.some((x) => x.txHash === t.txHash || (x.attemptId === t.attemptId && x.stepIndex === t.stepIndex))) throw new Error('UNIQUE constraint failed: settlement_attempt_transactions'); this.#attTx.push(clone(t)); }
  transactionsOfAttempt(attemptId: string) { return this.#attTx.filter((t) => t.attemptId === attemptId).map(clone); }
  attemptOfTransaction(txHash: string) { const t = this.#attTx.find((x) => x.txHash === txHash); return t && clone(t); }
  putReviewer(r: ReviewerGrant) { this.#reviewers.set(`${r.orgId}|${r.userId}`, clone(r)); }
  removeReviewer(orgId: string, userId: string) { this.#reviewers.delete(`${orgId}|${userId}`); }
  reviewersOfOrg(orgId: string) { return [...this.#reviewers.values()].filter((r) => r.orgId === orgId && this.#members.has(`${r.orgId}|${r.userId}`)).map(clone); }
  putDecision(d: AuthorizationDecision) { if (this.#decisions.some((x) => x.calculationId === d.calculationId)) throw new Error('UNIQUE constraint failed: authorization_decisions.calculation_id'); this.#decisions.push(clone(d)); }
  decisionsOfSession(sessionId: string) { return this.#decisions.filter((d) => d.sessionId === sessionId).map(clone); }
  putInvalidation(i: AuthorizationInvalidation) { if (!this.#invalidations.has(i.decisionId)) this.#invalidations.set(i.decisionId, clone(i)); }
  invalidationsOfSession(sessionId: string) { const ids = new Set(this.#decisions.filter((d) => d.sessionId === sessionId).map((d) => d.id)); return [...this.#invalidations.values()].filter((i) => ids.has(i.decisionId)).map(clone); }
  putObligation(o: ObligationRecord) { this.#obligations.set(o.id, clone(o)); }
  getObligation(id: string) { const o = this.#obligations.get(id); return o && clone(o); }
  obligationsOfSession(sessionId: string) { return [...this.#obligations.values()].filter((o) => o.sessionId === sessionId).map(clone); }
  putCalculation(c: CalculationRecord) { this.#calcs.push(clone(c)); }
  latestCalculation(sessionId: string) { const l = this.#calcs.filter((c) => c.sessionId === sessionId).at(-1); return l && clone(l); }
  calculationsOfSession(sessionId: string) { return this.#calcs.filter((c) => c.sessionId === sessionId).map(clone); }
  putParticipant(p: SessionParticipant) { this.#participants.set(`${p.sessionId}|${p.userId}`, clone(p)); }
  participantsOfSession(sessionId: string) { return [...this.#participants.values()].filter((p) => p.sessionId === sessionId).map(clone); }
  putOrganization(o: Organization) { this.#orgs.set(o.id, clone(o)); }
  getOrganization(id: string) { const o = this.#orgs.get(id); return o && clone(o); }
  putMembership(m: Membership) { this.#members.set(`${m.orgId}|${m.userId}`, clone(m)); }
  removeMembership(orgId: string, userId: string) { this.#members.delete(`${orgId}|${userId}`); }
  membershipsOfOrg(orgId: string) { return [...this.#members.values()].filter((m) => m.orgId === orgId).map(clone); }
  membershipsOfUser(userId: string) { return [...this.#members.values()].filter((m) => m.userId === userId).map(clone); }
  putWallet(w: OrgWallet) { this.#wallets.set(`${w.orgId}|${w.address}`, clone(w)); }
  walletsOfOrg(orgId: string) { return [...this.#wallets.values()].filter((w) => w.orgId === orgId).map(clone); }
  putInvitation(i: Invitation) { this.#invites.set(i.id, clone(i)); }
  getInvitation(id: string) { const i = this.#invites.get(id); return i && clone(i); }
  invitationByTokenHash(hash: string) { for (const i of this.#invites.values()) if (i.tokenHash === hash) return clone(i); return undefined; }
  invitationsOfOrg(orgId: string) { return [...this.#invites.values()].filter((i) => i.orgId === orgId).map(clone); }
  putSession(s: SessionRecord) { this.#sessions.set(s.sessionId, clone(s)); }
  getSession(sessionId: string) { const s = this.#sessions.get(sessionId); return s && clone(s); }
  sessionsOfOrg(orgId: string) { return [...this.#sessions.values()].filter((s) => s.orgId === orgId).map(clone); }
  appendActivity(a: ActivityRecord) { this.#activity.push(clone(a)); }
  activityOfOrg(orgId: string) { return this.#activity.filter((a) => a.orgId === orgId).map(clone); }
}
