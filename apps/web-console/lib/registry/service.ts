// Registry rules: organizations, memberships, invitations, wallet links, session records with provenance, activity. Server-side authorization on every call.
// Nothing here talks to a network or a wallet. A role here never grants on-chain authority.
import { createHash, randomBytes } from 'node:crypto';
import type { ActingUser } from './identity.ts';
import type { RegistryStore } from './store.ts';
import { INSTITUTION_TYPES, RegistryError } from './types.ts';
import type { ActivityRecord, CalculationRecord, ChainObservation, Invitation, Membership, ObligationRecord, Organization, OrgWallet, Role, SessionParticipant, SessionRecord, WorkflowState } from './types.ts';
import { canonicalInput, currencyOf, inputHash, parseAsset, parseObligationAmount, readinessChecks, runNetting, TRANSITIONS } from './clearing.ts';
import type { Currency, ReadinessCheck } from './clearing.ts';
import { authState, conflictedActors, decisionStatus } from './authorization.ts';
import type { AuthState, DecisionStatus } from './authorization.ts';
import type { AuthorizationDecision, ReviewerGrant } from './types.ts';
import { ALGORITHM, INSTRUCTION_CEILING, batchStatus, buildInstructions, instructionFingerprint, instructionId, instructionsHash, integrityChecks } from './settlement.ts';
import { AssetIdentityError, parseAsset as parseAssetRef } from './asset-identity.ts';
import { CHALLENGE_TTL_MS, challengeMessage, isStellarAccount, verifyChallengeSignature } from './wallet-proof.ts';
import type { Scheme } from './wallet-proof.ts';
import { canTransition, isState } from './settlement-state.ts';
import type { ExecState } from './settlement-state.ts';
import type { ExecutionEvent, SettlementExecution, WalletChallenge, WalletVerification } from './types.ts';
import type { AttemptEvent, SettlementAttempt, SignerSetSnapshot } from './types.ts';
import { fingerprintOf } from '../stellar/signer-set.ts';
import type { SignerSet } from '../stellar/signer-set.ts';
import { PlanError, buildExecutionPlan } from '../stellar/execution-plan.ts';
import { mayStartAttempt } from '../stellar/retry-policy.ts';
import type { BatchStatus, PlannedInstruction, PrepCheck } from './settlement.ts';
import type { BatchInvalidation, BatchReview, SettlementBatch, SettlementInstruction, SupportedAsset } from './types.ts';

export interface Clock { now(): Date }
const systemClock: Clock = { now: () => new Date() };
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
const SESSION_ID = /^[0-9a-f]{64}$/;
const STELLAR_ACCOUNT = /^G[A-Z2-7]{55}$/;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const id = (p: string) => `${p}_${randomBytes(9).toString('hex')}`;

function text(v: unknown, what: string, max: number, min = 1): string {
  if (typeof v !== 'string') throw new RegistryError('INVALID', `${what} must be text`);
  const t = v.trim();
  if (t.length < min || t.length > max || /[\u0000-\u001f\u007f<>]/.test(t)) throw new RegistryError('INVALID', `${what} must be ${min} to ${max} printable characters without < or >`);
  return t;
}

export class Registry {
  readonly #s: RegistryStore;
  readonly #clock: Clock;
  readonly #clearing: string | undefined;
  /** `clearingContract` is the PUBLIC id of the deployed clearing contract the adapter targets (configuration, not a secret). Without it no execution plan can be made. */
  constructor(store: RegistryStore, clock: Clock = systemClock, opts: { clearingContract?: string } = {}) { this.#s = store; this.#clock = clock; this.#clearing = opts.clearingContract; }

  #log(orgId: string, actor: ActingUser, kind: string, subject: string, detail: string) {
    const a: ActivityRecord = { id: id('act'), at: this.#clock.now().toISOString(), orgId, actor: actor.userId, kind, subject, detail };
    this.#s.appendActivity(a);
  }
  #role(orgId: string, u: ActingUser): Role | null {
    return this.#s.membershipsOfOrg(orgId).find((m) => m.userId === u.userId && (m.status ?? 'active') === 'active')?.role ?? null;
  }
  /** Not a member of the organization looks identical to "no such organization": isolation must not leak existence. */
  #need(orgId: string, u: ActingUser, admin = false): Role {
    const r = this.#role(orgId, u);
    if (!r || !this.#s.getOrganization(orgId)) throw new RegistryError('NOT_FOUND', 'organization not found');
    if (admin && r !== 'admin') throw new RegistryError('FORBIDDEN', 'administrator role required');
    return r;
  }

  createOrganization(u: ActingUser, input: { name: unknown; description?: unknown; visibility?: unknown; institutionType?: unknown; jurisdiction?: unknown }): Organization {
    return this.#s.transaction(() => this.#createOrganization(u, input));
  }
  #createOrganization(u: ActingUser, input: { name: unknown; description?: unknown; visibility?: unknown; institutionType?: unknown; jurisdiction?: unknown }): Organization {
    const name = text(input.name, 'name', 80, 2);
    const description = input.description === undefined ? '' : text(input.description, 'description', 500, 0);
    const visibility = input.visibility === 'public' ? 'public' : 'private';
    // Ambiguity guard: a user may not hold two institutions whose names differ only by case or spacing. (Names of OTHER institutions are never consulted: that would reveal that they exist.)
    const key = (n: string) => n.toLowerCase().replace(/\s+/g, ' ');
    if (this.myOrganizations(u).some((x) => key(x.name) === key(name))) throw new RegistryError('EXISTS', 'you already belong to an institution with this name');
    let institutionType: Organization['institutionType'];
    if (input.institutionType !== undefined && input.institutionType !== '') { if (typeof input.institutionType !== 'string' || !(INSTITUTION_TYPES as readonly string[]).includes(input.institutionType)) throw new RegistryError('INVALID', 'unknown institution type'); institutionType = input.institutionType as Organization['institutionType']; }
    let jurisdiction: string | undefined;
    if (input.jurisdiction !== undefined && input.jurisdiction !== '') { if (typeof input.jurisdiction !== 'string' || !/^[A-Z]{2}$/.test(input.jurisdiction)) throw new RegistryError('INVALID', 'jurisdiction must be a two-letter country code such as GB'); jurisdiction = input.jurisdiction; }
    const o: Organization = { id: id('org'), name, description, visibility, createdAt: this.#clock.now().toISOString(), createdBy: u.userId, ...(institutionType ? { institutionType } : {}), ...(jurisdiction ? { jurisdiction } : {}) };
    this.#s.putOrganization(o);
    this.#s.putMembership({ orgId: o.id, userId: u.userId, role: 'admin', since: o.createdAt });
    this.#log(o.id, u, 'organization.created', o.id, name);
    return o;
  }
  myOrganizations(u: ActingUser): Organization[] {
    return this.#s.membershipsOfUser(u.userId).filter((m) => (m.status ?? 'active') === 'active').map((m) => this.#s.getOrganization(m.orgId)).filter((o): o is Organization => !!o);
  }
  getOrganization(u: ActingUser, orgId: string): Organization { this.#need(orgId, u); return this.#s.getOrganization(orgId) as Organization; }
  members(u: ActingUser, orgId: string): Membership[] { this.#need(orgId, u); return this.#s.membershipsOfOrg(orgId); }

  updateProfile(u: ActingUser, orgId: string, patch: { name?: unknown; description?: unknown; visibility?: unknown }): Organization {
    return this.#s.transaction(() => this.#updateProfile(u, orgId, patch));
  }
  #updateProfile(u: ActingUser, orgId: string, patch: { name?: unknown; description?: unknown; visibility?: unknown }): Organization {
    this.#need(orgId, u, true);
    const o = this.#s.getOrganization(orgId) as Organization;
    if (patch.name !== undefined) o.name = text(patch.name, 'name', 80, 2);
    if (patch.description !== undefined) o.description = text(patch.description, 'description', 500, 0);
    if (patch.visibility !== undefined) o.visibility = patch.visibility === 'public' ? 'public' : 'private';
    this.#s.putOrganization(o);
    this.#log(orgId, u, 'organization.updated', orgId, 'profile');
    return o;
  }

  setRole(u: ActingUser, orgId: string, userId: string, role: Role): void {
    return this.#s.transaction(() => this.#setRole(u, orgId, userId, role));
  }
  #setRole(u: ActingUser, orgId: string, userId: string, role: Role): void {
    this.#need(orgId, u, true);
    const ms = this.#s.membershipsOfOrg(orgId); const m = ms.find((x) => x.userId === userId);
    if (!m) throw new RegistryError('NOT_FOUND', 'member not found');
    if (m.role === 'admin' && role !== 'admin' && ms.filter((x) => x.role === 'admin' && (x.status ?? 'active') === 'active').length === 1) throw new RegistryError('LAST_ADMIN', 'an organization must keep at least one administrator');
    this.#s.putMembership({ ...m, role });
    this.#log(orgId, u, 'member.role', userId, role);
  }
  removeMember(u: ActingUser, orgId: string, userId: string): void {
    return this.#s.transaction(() => this.#removeMember(u, orgId, userId));
  }
  #removeMember(u: ActingUser, orgId: string, userId: string): void {
    this.#need(orgId, u, true);
    const ms = this.#s.membershipsOfOrg(orgId); const m = ms.find((x) => x.userId === userId);
    if (!m) throw new RegistryError('NOT_FOUND', 'member not found');
    if (m.role === 'admin' && (m.status ?? 'active') === 'active' && ms.filter((x) => x.role === 'admin' && (x.status ?? 'active') === 'active').length === 1) throw new RegistryError('LAST_ADMIN', 'an organization must keep at least one administrator');
    for (const sess of this.#s.sessionsOfOrg(orgId)) {
      const part = this.#s.participantsOfSession(sess.sessionId).find((p) => p.userId === userId && (p.status ?? 'active') === 'active');
      if (!part) continue;
      if (this.#s.obligationsOfSession(sess.sessionId).some((o) => o.status === 'active' && (o.debtor === userId || o.creditor === userId))) throw new RegistryError('INVALID_STATE', `this member is a participant with active obligations in session "${sess.label}": void those obligations first`);
      if ((sess.workflow ?? 'configuring') !== 'configuring') throw new RegistryError('INVALID_STATE', `this member is a participant in session "${sess.label}", which is no longer being configured`);
      this.#s.putParticipant({ ...part, status: 'removed', removedAt: this.#clock.now().toISOString() });
      this.#invalidate(orgId, u, sess.sessionId, 'a participant left with their membership'); this.#log(orgId, u, 'session.participant-removed', sess.sessionId, `${userId} (membership ended)`);
    }
    this.#s.removeMembership(orgId, userId);
    this.#log(orgId, u, 'member.removed', userId, m.role);
  }

  /** An administrator may suspend or restore ANOTHER member. A suspended member keeps the record but has no access and no authority until restored. Own status and the last active administrator are protected. */
  setMemberStatus(u: ActingUser, orgId: string, userId: string, status: 'active' | 'suspended'): void {
    return this.#s.transaction(() => {
      this.#need(orgId, u, true);
      if (status !== 'active' && status !== 'suspended') throw new RegistryError('INVALID', 'status must be active or suspended');
      if (userId === u.userId) throw new RegistryError('INVALID_STATE', 'you cannot change your own membership status');
      const ms = this.#s.membershipsOfOrg(orgId); const m = ms.find((x) => x.userId === userId);
      if (!m) throw new RegistryError('NOT_FOUND', 'member not found');
      if (status === 'suspended' && m.role === 'admin' && (m.status ?? 'active') === 'active' && ms.filter((x) => x.role === 'admin' && (x.status ?? 'active') === 'active').length === 1) throw new RegistryError('LAST_ADMIN', 'an organization must keep at least one active administrator');
      if ((m.status ?? 'active') === status) return;
      this.#s.putMembership({ ...m, status });
      this.#log(orgId, u, status === 'suspended' ? 'member.suspended' : 'member.restored', userId, m.role);
    });
  }

  /** Returns the secret token ONCE; only its hash is stored. */
  invite(u: ActingUser, orgId: string, input: { invitee: unknown; role: unknown }): { invitation: Invitation; token: string } {
    return this.#s.transaction(() => this.#invite(u, orgId, input));
  }
  #invite(u: ActingUser, orgId: string, input: { invitee: unknown; role: unknown }): { invitation: Invitation; token: string } {
    this.#need(orgId, u, true);
    const invitee = text(input.invitee, 'invitee', 120, 3);
    if (/^G[A-Z2-7]{10,}$/.test(invitee) && !isStellarAccount(invitee)) throw new RegistryError('INVALID', 'the invitee looks like a Stellar address but is not a valid one');
    const role: Role = input.role === 'admin' ? 'admin' : 'member';
    const token = randomBytes(24).toString('base64url');
    const inv: Invitation = { id: id('inv'), orgId, invitee, role, tokenHash: sha256(token), status: 'pending', expiresAt: new Date(this.#clock.now().getTime() + INVITE_TTL_MS).toISOString(), createdBy: u.userId };
    this.#s.putInvitation(inv);
    this.#log(orgId, u, 'invitation.created', inv.id, role);
    return { invitation: inv, token };
  }
  revokeInvitation(u: ActingUser, orgId: string, invitationId: string): void {
    return this.#s.transaction(() => this.#revokeInvitation(u, orgId, invitationId));
  }
  #revokeInvitation(u: ActingUser, orgId: string, invitationId: string): void {
    this.#need(orgId, u, true);
    const i = this.#s.getInvitation(invitationId);
    if (!i || i.orgId !== orgId) throw new RegistryError('NOT_FOUND', 'invitation not found');
    if (i.status !== 'pending') throw new RegistryError('INVALID_STATE', 'only a pending invitation can be revoked');
    this.#s.putInvitation({ ...i, status: 'revoked' });
    this.#log(orgId, u, 'invitation.revoked', i.id, '');
  }
  /** Single-use, expiring. Every failure returns the same error so a token cannot be probed. */
  acceptInvitation(u: ActingUser, token: string): Membership {
    return this.#s.transaction(() => this.#acceptInvitation(u, token));
  }
  #acceptInvitation(u: ActingUser, token: string): Membership {
    const bad = new RegistryError('INVALID_INVITATION', 'invitation is invalid, expired or already used');
    if (typeof token !== 'string' || token.length < 16 || token.length > 128) throw bad;
    const i = this.#s.invitationByTokenHash(sha256(token));
    if (!i || i.status !== 'pending' || new Date(i.expiresAt).getTime() <= this.#clock.now().getTime()) throw bad;
    if (this.#role(i.orgId, u)) throw bad;
    // An invitation addressed to an email can only be accepted by the verified account with that email (a leaked token alone is not enough).
    // The binding is by what the invitation names: an email needs the verified account holding that email (a wallet-only user has none); a Stellar address needs a user with that
    // wallet VERIFIED and active. An invitation that names neither is open to the holder of the token. A leaked token alone never satisfies a bound invitation.
    if (i.invitee.includes('@')) { if (u.email === undefined ? u.kind !== 'development' : i.invitee.toLowerCase() !== u.email.toLowerCase()) throw bad; }
    else if (isStellarAccount(i.invitee)) { if (!(u.wallets ?? []).includes(i.invitee)) throw bad; }
    this.#s.putInvitation({ ...i, status: 'accepted' });
    const m: Membership = { orgId: i.orgId, userId: u.userId, role: i.role, since: this.#clock.now().toISOString() };
    this.#s.putMembership(m);
    this.#log(i.orgId, u, 'invitation.accepted', i.id, i.role);
    return m;
  }
  invitations(u: ActingUser, orgId: string): Omit<Invitation, 'tokenHash'>[] {
    this.#need(orgId, u, true);
    return this.#s.invitationsOfOrg(orgId).map(({ tokenHash: _t, ...rest }) => rest);
  }

  linkWallet(u: ActingUser, orgId: string, address: unknown): OrgWallet {
    return this.#s.transaction(() => this.#linkWallet(u, orgId, address));
  }
  #linkWallet(u: ActingUser, orgId: string, address: unknown): OrgWallet {
    this.#need(orgId, u, true);
    if (typeof address !== 'string' || !STELLAR_ACCOUNT.test(address)) throw new RegistryError('INVALID', 'not a Stellar account address');
    const w: OrgWallet = { orgId, address, proof: 'none' }; // a claim only: proof of control needs a wallet signature (not implemented)
    this.#s.putWallet(w);
    this.#log(orgId, u, 'wallet.linked', address, 'proof none');
    return w;
  }
  wallets(u: ActingUser, orgId: string): OrgWallet[] { this.#need(orgId, u); return this.#s.walletsOfOrg(orgId); }

  // ---- session registry keyed by the on-chain session id ----
  /** provenance 'local-draft' or 'fixture' only; nothing here can create a chain-backed record. */
  recordSession(u: ActingUser, orgId: string, input: { sessionId: unknown; label: unknown; fixture?: boolean }): SessionRecord {
    return this.#s.transaction(() => this.#recordSession(u, orgId, input));
  }
  #recordSession(u: ActingUser, orgId: string, input: { sessionId: unknown; label: unknown; fixture?: boolean }): SessionRecord {
    this.#need(orgId, u, true);
    if (typeof input.sessionId !== 'string' || !SESSION_ID.test(input.sessionId)) throw new RegistryError('INVALID', 'session id must be 64 lowercase hex characters');
    if (this.#s.getSession(input.sessionId)) throw new RegistryError('EXISTS', 'a record for this session id already exists');
    const s: SessionRecord = { sessionId: input.sessionId, orgId, label: text(input.label, 'label', 80, 1), provenance: input.fixture ? 'fixture' : 'local-draft', createdAt: this.#clock.now().toISOString(), workflow: 'configuring' };
    this.#s.putSession(s);
    this.#log(orgId, u, 'session.recorded', s.sessionId, s.provenance);
    return s;
  }
  sessions(u: ActingUser, orgId: string): SessionRecord[] { this.#need(orgId, u); return this.#s.sessionsOfOrg(orgId); }
  session(u: ActingUser, orgId: string, sessionId: string): SessionRecord {
    this.#need(orgId, u);
    const s = this.#s.getSession(sessionId);
    if (!s || s.orgId !== orgId) throw new RegistryError('NOT_FOUND', 'session not found');
    return s;
  }
  /** Attach a read-only RPC observation. A fixture record can never receive one (it would pass off demo data as chain data). */
  attachChainRead(u: ActingUser, orgId: string, sessionId: string, obs: ChainObservation): SessionRecord {
    return this.#s.transaction(() => this.#attachChainRead(u, orgId, sessionId, obs));
  }
  #attachChainRead(u: ActingUser, orgId: string, sessionId: string, obs: ChainObservation): SessionRecord {
    const s = this.session(u, orgId, sessionId);
    if (s.provenance === 'fixture') throw new RegistryError('FIXTURE', 'a fixture record cannot carry chain data');
    if (!Number.isInteger(obs.readAtLedger) || obs.readAtLedger <= 0) throw new RegistryError('INVALID', 'observation needs the ledger it was read at');
    const next: SessionRecord = { ...s, chain: obs, provenance: s.provenance === 'chain-confirmed' ? 'chain-confirmed' : 'chain-read' };
    this.#s.putSession(next);
    this.#log(orgId, u, 'session.chain-read', sessionId, `ledger ${obs.readAtLedger} ${obs.state}`);
    return next;
  }
  /** Confirmed requires: an earlier chain read of this id AND a transaction whose independently fetched status is SUCCESS. */
  confirmSession(u: ActingUser, orgId: string, sessionId: string, evidence: { txHash: string; txStatus: string }): SessionRecord {
    return this.#s.transaction(() => this.#confirmSession(u, orgId, sessionId, evidence));
  }
  #confirmSession(u: ActingUser, orgId: string, sessionId: string, evidence: { txHash: string; txStatus: string }): SessionRecord {
    const s = this.session(u, orgId, sessionId);
    if (s.provenance !== 'chain-read' || !s.chain) throw new RegistryError('NOT_VERIFIED', 'no chain read of this session id');
    if (evidence.txStatus !== 'SUCCESS' || !/^[0-9a-f]{64}$/.test(evidence.txHash)) throw new RegistryError('NOT_VERIFIED', 'the creating transaction is not confirmed SUCCESS');
    const next: SessionRecord = { ...s, provenance: 'chain-confirmed', confirmedTxHash: evidence.txHash };
    this.#s.putSession(next);
    this.#log(orgId, u, 'session.confirmed', sessionId, evidence.txHash);
    return next;
  }
  // ---- clearing operations (application level; never on-chain, never a wallet) ----
  /** Member read access to an operational (non-fixture) session. Non-members get the same NOT_FOUND as for a missing session. */
  #opSession(u: ActingUser, orgId: string, sessionId: string): SessionRecord {
    const s = this.session(u, orgId, sessionId);
    if (s.provenance === 'fixture') throw new RegistryError('FIXTURE', 'a fixture record has fixed demonstration data and no operations');
    return s;
  }
  /** Administrator write access, only while the session is being configured. */
  #editable(u: ActingUser, orgId: string, sessionId: string): SessionRecord {
    this.#need(orgId, u, true);
    const s = this.#opSession(u, orgId, sessionId);
    const w = s.workflow ?? 'configuring';
    if (w !== 'configuring') throw new RegistryError('INVALID_STATE', w === 'ready' ? 'the session is marked ready: reopen it to make changes' : 'the session is closed and cannot change');
    return s;
  }
  #activeParticipant(sessionId: string, userId: unknown, what: string): SessionParticipant {
    const p = typeof userId === 'string' ? this.#s.participantsOfSession(sessionId).find((x) => x.userId === userId) : undefined;
    if (!p || (p.status ?? 'active') !== 'active') throw new RegistryError('INVALID', `${what} must be an active participant of this session`);
    return p;
  }
  #short(x: string) { return x.slice(0, 8); }

  addSessionParticipant(u: ActingUser, orgId: string, sessionId: string, input: { userId: unknown; walletAddress?: unknown }): SessionParticipant {
    return this.#s.transaction(() => {
      this.#editable(u, orgId, sessionId);
      if (typeof input.userId !== 'string' || !this.#role(orgId, { userId: input.userId, kind: u.kind })) throw new RegistryError('INVALID', 'participants must be members of the organization');
      const existing = this.#s.participantsOfSession(sessionId).find((x) => x.userId === input.userId);
      if (existing && (existing.status ?? 'active') === 'active') throw new RegistryError('EXISTS', 'this member is already a participant in the session');
      let walletAddress: string | undefined;
      if (input.walletAddress !== undefined) {
        if (typeof input.walletAddress !== 'string' || !this.#s.walletsOfOrg(orgId).some((w) => w.address === input.walletAddress)) throw new RegistryError('INVALID', 'a wallet must be one of the organization wallet claims');
        walletAddress = input.walletAddress;
      }
      const p: SessionParticipant = { sessionId, orgId, userId: input.userId, addedBy: u.userId, addedAt: this.#clock.now().toISOString(), status: 'active', ...(walletAddress ? { walletAddress } : {}) };
      this.#s.putParticipant(p);
      this.#invalidate(orgId, u, sessionId, 'a participant was added'); this.#log(orgId, u, 'session.participant-added', sessionId, existing ? `${input.userId} (re-added)` : input.userId);
      return p;
    });
  }
  /** Soft removal. Refused while an active obligation names the participant: void or correct those obligations first (explicit resolution). */
  removeSessionParticipant(u: ActingUser, orgId: string, sessionId: string, userId: string): SessionParticipant {
    return this.#s.transaction(() => {
      this.#editable(u, orgId, sessionId);
      const p = this.#s.participantsOfSession(sessionId).find((x) => x.userId === userId);
      if (!p || (p.status ?? 'active') !== 'active') throw new RegistryError('NOT_FOUND', 'participant not found');
      const n = this.#s.obligationsOfSession(sessionId).filter((o) => o.status === 'active' && (o.debtor === userId || o.creditor === userId)).length;
      if (n > 0) throw new RegistryError('INVALID_STATE', `${n} active obligation(s) name this participant: void or correct them before removing the participant`);
      const next: SessionParticipant = { ...p, status: 'removed', removedAt: this.#clock.now().toISOString() };
      this.#s.putParticipant(next);
      this.#invalidate(orgId, u, sessionId, 'a participant was removed'); this.#log(orgId, u, 'session.participant-removed', sessionId, userId);
      return next;
    });
  }
  sessionParticipants(u: ActingUser, orgId: string, sessionId: string): SessionParticipant[] {
    this.session(u, orgId, sessionId);
    return this.#s.participantsOfSession(sessionId);
  }

  #assetOfOthers(sessionId: string, exceptId?: string): string | undefined {
    return this.#s.obligationsOfSession(sessionId).find((o) => o.status === 'active' && o.id !== exceptId)?.asset;
  }
  /**
   * Resolves the asset of a new or edited obligation. A canonical identity (assetRef, tobin-asset/v1) must name a SUPPORTED registry entry; its code comes from the
   * registry. While no asset is supported at all (an unconfigured or development deployment) a bare code is still accepted, recorded as 'legacy-unresolved' and
   * blocked from settlement preparation until an administrator reconciles it. Once any asset is supported, a bare code is refused.
   */
  #resolveObligationAsset(assetRef: unknown, assetCode: unknown): { asset: string; assetRef?: string; identity: 'canonical' | 'legacy-unresolved' } {
    const list = this.#s.assets();
    if (assetRef !== undefined) {
      let ref: string;
      try { ref = (() => { const p = parseAssetRef(assetRef); return typeof assetRef === 'string' ? assetRef : JSON.stringify(p); })(); } catch (e) { if (e instanceof AssetIdentityError) throw new RegistryError('INVALID', e.message); throw e; }
      const entry = list.find((a) => a.id === ref);
      if (!entry || entry.status !== 'supported') throw new RegistryError('INVALID', 'that asset identity is not in the supported asset list');
      if (assetCode !== undefined && assetCode !== entry.code) throw new RegistryError('INVALID', 'the asset code does not match the asset identity');
      return { asset: entry.code, assetRef: ref, identity: 'canonical' };
    }
    if (list.some((a) => a.status === 'supported')) throw new RegistryError('INVALID', 'choose a supported asset identity: an asset code alone does not identify an asset');
    return { asset: parseAsset(assetCode), identity: 'legacy-unresolved' };
  }
  #assetRefOfOthers(sessionId: string, exceptId?: string): string | undefined {
    return this.#s.obligationsOfSession(sessionId).find((o) => o.status === 'active' && o.id !== exceptId && o.assetRef)?.assetRef;
  }
  createObligation(u: ActingUser, orgId: string, sessionId: string, input: { debtor: unknown; creditor: unknown; amount: unknown; asset?: unknown; assetRef?: unknown; reference?: unknown }): ObligationRecord {
    return this.#s.transaction(() => {
      this.#editable(u, orgId, sessionId);
      const debtor = this.#activeParticipant(sessionId, input.debtor, 'the debtor').userId;
      const creditor = this.#activeParticipant(sessionId, input.creditor, 'the creditor').userId;
      if (debtor === creditor) throw new RegistryError('INVALID', 'debtor and creditor must be different participants');
      const amount = parseObligationAmount(input.amount);
      const res = this.#resolveObligationAsset(input.assetRef, input.asset);
      const asset = res.asset;
      const otherRef = this.#assetRefOfOthers(sessionId);
      if (res.assetRef && otherRef && otherRef !== res.assetRef) throw new RegistryError('INVALID', `this session nets ${otherRef}: a different asset identity (even with the same code) is never netted with it`);
      const other = this.#assetOfOthers(sessionId);
      if (other && other !== asset) throw new RegistryError('INVALID', `this session nets ${other}: obligations in different assets are never netted together`);
      const reference = input.reference === undefined ? '' : text(input.reference, 'reference', 200, 0);
      const now = this.#clock.now().toISOString();
      const o: ObligationRecord = { id: randomBytes(32).toString('hex'), sessionId, orgId, debtor, creditor, amount, asset, reference, status: 'active', revision: 1, createdAt: now, createdBy: u.userId, updatedAt: now, updatedBy: u.userId, ...(res.assetRef ? { assetRef: res.assetRef } : {}), assetIdentity: res.identity };
      this.#s.putObligation(o);
      this.#invalidate(orgId, u, sessionId, 'an obligation was recorded'); this.#log(orgId, u, 'obligation.created', sessionId, `obligation ${this.#short(o.id)}: ${debtor} owes ${creditor} ${amount} ${asset}${reference ? ` (${reference})` : ''}`);
      return o;
    });
  }
  updateObligation(u: ActingUser, orgId: string, sessionId: string, obligationId: string, patch: { debtor?: unknown; creditor?: unknown; amount?: unknown; asset?: unknown; assetRef?: unknown; reference?: unknown }): ObligationRecord {
    return this.#s.transaction(() => {
      this.#editable(u, orgId, sessionId);
      const o = this.#own(sessionId, obligationId);
      if (o.status !== 'active') throw new RegistryError('INVALID_STATE', 'a voided obligation cannot be changed; record a new one');
      const next: ObligationRecord = { ...o };
      const changes: string[] = [];
      if (patch.debtor !== undefined) next.debtor = this.#activeParticipant(sessionId, patch.debtor, 'the debtor').userId;
      if (patch.creditor !== undefined) next.creditor = this.#activeParticipant(sessionId, patch.creditor, 'the creditor').userId;
      if (patch.amount !== undefined) next.amount = parseObligationAmount(patch.amount);
      if (patch.assetRef !== undefined) { const res = this.#resolveObligationAsset(patch.assetRef, patch.asset); next.asset = res.asset; next.assetRef = res.assetRef as string; next.assetIdentity = 'canonical'; const otherRef = this.#assetRefOfOthers(sessionId, o.id); if (otherRef && otherRef !== next.assetRef) throw new RegistryError('INVALID', `this session nets ${otherRef}: a different asset identity (even with the same code) is never netted with it`); }
      else if (patch.asset !== undefined && !(o.assetIdentity === 'canonical' && patch.asset === o.asset)) { if (o.assetIdentity === 'canonical') throw new RegistryError('INVALID', 'change the asset identity with assetRef: a code alone does not identify an asset'); next.asset = parseAsset(patch.asset); }
      if (patch.reference !== undefined) next.reference = text(patch.reference, 'reference', 200, 0);
      // a participant that was removed since cannot stay on an edited obligation unchanged-by-accident: re-validate both parties
      this.#activeParticipant(sessionId, next.debtor, 'the debtor'); this.#activeParticipant(sessionId, next.creditor, 'the creditor');
      if (next.debtor === next.creditor) throw new RegistryError('INVALID', 'debtor and creditor must be different participants');
      const other = this.#assetOfOthers(sessionId, o.id);
      if (other && other !== next.asset) throw new RegistryError('INVALID', `this session nets ${other}: obligations in different assets are never netted together`);
      if (next.assetRef !== o.assetRef) changes.push(`assetRef ${o.assetRef ?? '(legacy)'} -> ${next.assetRef ?? '(legacy)'}`);
      for (const k of ['debtor', 'creditor', 'amount', 'asset', 'reference'] as const) if (next[k] !== o[k]) changes.push(`${k} ${o[k] || '(none)'} -> ${next[k] || '(none)'}`);
      if (changes.length === 0) throw new RegistryError('INVALID', 'nothing changed');
      next.revision = o.revision + 1; next.updatedAt = this.#clock.now().toISOString(); next.updatedBy = u.userId;
      this.#s.putObligation(next);
      this.#invalidate(orgId, u, sessionId, 'an obligation was changed'); this.#log(orgId, u, 'obligation.updated', sessionId, `obligation ${this.#short(o.id)} revision ${next.revision}: ${changes.join('; ')}`);
      return next;
    });
  }
  voidObligation(u: ActingUser, orgId: string, sessionId: string, obligationId: string, reason?: unknown): ObligationRecord {
    return this.#s.transaction(() => {
      this.#editable(u, orgId, sessionId);
      const o = this.#own(sessionId, obligationId);
      if (o.status !== 'active') throw new RegistryError('INVALID_STATE', 'the obligation is already voided');
      const why = reason === undefined || reason === '' ? '' : text(reason, 'reason', 200, 0);
      const next: ObligationRecord = { ...o, status: 'voided', revision: o.revision + 1, updatedAt: this.#clock.now().toISOString(), updatedBy: u.userId };
      this.#s.putObligation(next);
      this.#invalidate(orgId, u, sessionId, 'an obligation was voided'); this.#log(orgId, u, 'obligation.voided', sessionId, `obligation ${this.#short(o.id)} voided (was ${o.debtor} owes ${o.creditor} ${o.amount} ${o.asset})${why ? `: ${why}` : ''}`);
      return next;
    });
  }
  #own(sessionId: string, obligationId: string): ObligationRecord {
    const o = typeof obligationId === 'string' ? this.#s.getObligation(obligationId) : undefined;
    if (!o || o.sessionId !== sessionId) throw new RegistryError('NOT_FOUND', 'obligation not found');
    return o;
  }
  obligations(u: ActingUser, orgId: string, sessionId: string): ObligationRecord[] { this.#opSession(u, orgId, sessionId); return this.#s.obligationsOfSession(sessionId); }
  obligation(u: ActingUser, orgId: string, sessionId: string, obligationId: string): ObligationRecord { this.#opSession(u, orgId, sessionId); return this.#own(sessionId, obligationId); }

  /** Nets the PERSISTED active obligations with the existing engine and stores an immutable snapshot. The client supplies no input and no result. */
  calculate(u: ActingUser, orgId: string, sessionId: string): CalculationRecord {
    this.#s.transaction(() => this.#editable(u, orgId, sessionId)); // authorization and state first: a refused request leaves no trace
    try {
      return this.#s.transaction(() => {
        const parts = this.#s.participantsOfSession(sessionId).filter((p) => (p.status ?? 'active') === 'active').map((p) => p.userId);
        const obs = this.#s.obligationsOfSession(sessionId);
        const active = obs.filter((o) => o.status === 'active');
        if (active.length === 0) throw new RegistryError('INVALID', 'there are no active obligations to net');
        const assets = [...new Set(active.map((o) => o.asset))];
        if (assets.length !== 1) throw new RegistryError('INVALID', 'obligations use more than one asset; netting never mixes assets');
        const asset = assets[0] as string;
        const input = canonicalInput(parts, obs);
        const { positions, gross } = runNetting(sessionId, input);
        const refs = new Set(active.map((o) => (o.assetIdentity === 'canonical' ? o.assetRef : undefined)));
        const assetRef = refs.size === 1 ? [...refs][0] : undefined; // only when EVERY active obligation carries the same canonical identity
        const c: CalculationRecord = { id: id('calc'), sessionId, orgId, asset, inputHash: inputHash(asset, input), input, positions, gross, createdAt: this.#clock.now().toISOString(), createdBy: u.userId, ...(assetRef ? { assetRef } : {}) };
        this.#s.putCalculation(c);
        this.#invalidate(orgId, u, sessionId, 'a new calculation superseded this one'); this.#log(orgId, u, 'netting.calculated', sessionId, `calculation ${this.#short(c.id)}: ${input.obligations.length} obligation(s), ${positions.length} participant(s), ${asset}, gross ${gross}`);
        return c;
      });
    } catch (e) {
      if (e instanceof RegistryError && e.code === 'INVALID') this.#s.transaction(() => this.#log(orgId, u, 'netting.failed', sessionId, e.message));
      throw e;
    }
  }
  /** The latest snapshot (if any) and whether it still matches the session's present participants and obligations. */
  calculationView(u: ActingUser, orgId: string, sessionId: string): { calculation: CalculationRecord | null; currency: Currency; asset: string | null } {
    this.#opSession(u, orgId, sessionId);
    const latest = this.#s.latestCalculation(sessionId);
    const parts = this.#s.participantsOfSession(sessionId).filter((p) => (p.status ?? 'active') === 'active').map((p) => p.userId);
    const obs = this.#s.obligationsOfSession(sessionId);
    const assets = [...new Set(obs.filter((o) => o.status === 'active').map((o) => o.asset))];
    const asset = assets.length === 1 ? (assets[0] as string) : null;
    const currency: Currency = !latest ? 'none' : asset ? currencyOf(latest, asset, canonicalInput(parts, obs)) : 'stale';
    return { calculation: latest ?? null, currency, asset };
  }

  readiness(u: ActingUser, orgId: string, sessionId: string): { state: WorkflowState; ready: boolean; checks: ReadinessCheck[]; currency: Currency } {
    const s = this.#opSession(u, orgId, sessionId);
    const r = readinessChecks({ workflow: s.workflow ?? 'configuring', participants: this.#s.participantsOfSession(sessionId), obligations: this.#s.obligationsOfSession(sessionId), latest: this.#s.latestCalculation(sessionId) });
    return { state: s.workflow ?? 'configuring', ready: r.ready, checks: r.checks, currency: r.currency };
  }
  #move(u: ActingUser, orgId: string, sessionId: string, to: WorkflowState): SessionRecord {
    const s = this.#opSession(u, orgId, sessionId);
    const from = s.workflow ?? 'configuring';
    if (!TRANSITIONS[from].includes(to)) throw new RegistryError('INVALID_STATE', `a ${from} session cannot become ${to}`);
    const next: SessionRecord = { ...s, workflow: to };
    this.#s.putSession(next);
    this.#log(orgId, u, 'session.state-changed', sessionId, `${from} -> ${to}`);
    return next;
  }
  /** configuring -> ready, only when every readiness check passes. Ready is NOT approval, signing or settlement. */
  markReady(u: ActingUser, orgId: string, sessionId: string): SessionRecord {
    this.#need(orgId, u, true);
    try {
      return this.#s.transaction(() => {
        const r = this.readiness(u, orgId, sessionId);
        const failed = r.checks.filter((c) => !c.ok && c.key !== 'state');
        if (r.state !== 'configuring') throw new RegistryError('INVALID_STATE', `a ${r.state} session cannot become ready`);
        if (failed.length > 0) throw new RegistryError('INVALID_STATE', `not ready: ${failed.map((c) => c.label).join('; ')}`);
        this.#log(orgId, u, 'session.readiness-evaluated', sessionId, 'all checks passed');
        return this.#move(u, orgId, sessionId, 'ready');
      });
    } catch (e) {
      if (e instanceof RegistryError && e.code === 'INVALID_STATE' && e.message.startsWith('not ready')) this.#s.transaction(() => this.#log(orgId, u, 'session.readiness-evaluated', sessionId, e.message));
      throw e;
    }
  }
  reopenSession(u: ActingUser, orgId: string, sessionId: string): SessionRecord { return this.#s.transaction(() => { this.#need(orgId, u, true); return this.#move(u, orgId, sessionId, 'configuring'); }); }
  /** Operational closure: clearing and settlement PREPARATION are complete. It is not settlement completion: nothing has moved on any network. */
  closeSession(u: ActingUser, orgId: string, sessionId: string): SessionRecord {
    return this.#s.transaction(() => {
      this.#need(orgId, u, true);
      const latest = this.#opSession(u, orgId, sessionId) && this.#s.latestCalculation(sessionId);
      const ok = !!latest && this.settlementBatches(u, orgId, sessionId).some((x) => x.batch.calculationId === (latest as CalculationRecord).id && x.status === 'approved');
      if (!ok) throw new RegistryError('INVALID_STATE', 'closing requires an approved, still-eligible settlement batch for the current calculation (operational closure; it does not mean settlement happened)');
      return this.#move(u, orgId, sessionId, 'closed');
    });
  }

  // ---- institutional authorization (MVP-1.3): application-level decisions bound to one calculation snapshot; never a signature, never on-chain ----
  /** Records an invalidation (and an activity entry) for every decision of the session that has none yet. Runs inside the caller's transaction. */
  #invalidate(orgId: string, u: ActingUser, sessionId: string, cause: string): void {
    const done = new Set(this.#s.invalidationsOfSession(sessionId).map((i) => i.decisionId));
    for (const d of this.#s.decisionsOfSession(sessionId)) {
      if (done.has(d.id)) continue;
      this.#s.putInvalidation({ decisionId: d.id, cause, at: this.#clock.now().toISOString(), by: u.userId });
      this.#log(orgId, u, 'authorization.invalidated', sessionId, `${d.decision} decision on calculation ${this.#short(d.calculationId)} no longer applies: ${cause}`);
    }
    const batchDone = new Set(this.#s.batchInvalidationsOfSession(sessionId).map((i) => i.batchId));
    for (const b of this.#s.batchesOfSession(sessionId)) {
      if (batchDone.has(b.id)) continue;
      this.#s.putBatchInvalidation({ batchId: b.id, cause, at: this.#clock.now().toISOString(), by: u.userId });
      this.#log(orgId, u, 'settlement.batch-invalidated', sessionId, `batch ${this.#short(b.id.slice(4))} no longer eligible for settlement: ${cause}`);
    }
  }
  #isReviewer(orgId: string, userId: string): boolean { return this.#s.reviewersOfOrg(orgId).some((r) => r.userId === userId); }

  grantReviewer(u: ActingUser, orgId: string, userId: string): ReviewerGrant {
    return this.#s.transaction(() => {
      this.#need(orgId, u, true);
      if (!this.#role(orgId, { userId, kind: u.kind })) throw new RegistryError('NOT_FOUND', 'member not found');
      const have = this.#s.reviewersOfOrg(orgId).find((r) => r.userId === userId);
      if (have) return have;
      const g: ReviewerGrant = { orgId, userId, grantedBy: u.userId, grantedAt: this.#clock.now().toISOString() };
      this.#s.putReviewer(g);
      this.#log(orgId, u, 'reviewer.granted', userId, 'may decide on calculation results');
      return g;
    });
  }
  revokeReviewer(u: ActingUser, orgId: string, userId: string): void {
    this.#s.transaction(() => {
      this.#need(orgId, u, true);
      if (!this.#isReviewer(orgId, userId)) throw new RegistryError('NOT_FOUND', 'reviewer not found');
      this.#s.removeReviewer(orgId, userId);
      this.#log(orgId, u, 'reviewer.revoked', userId, 'earlier decisions stay on record');
    });
  }
  reviewers(u: ActingUser, orgId: string): ReviewerGrant[] { this.#need(orgId, u); return this.#s.reviewersOfOrg(orgId); }

  /** Everything needed to review and decide, computed server-side. */
  authorization(u: ActingUser, orgId: string, sessionId: string): {
    state: AuthState; sessionState: WorkflowState; currency: Currency; calculationId: string | null;
    eligibility: { canDecide: boolean; isReviewer: boolean; reasons: string[] };
    decisions: (AuthorizationDecision & { status: DecisionStatus; invalidatedAt?: string; invalidationCause?: string })[];
  } {
    const s = this.#opSession(u, orgId, sessionId);
    const view = this.calculationView(u, orgId, sessionId);
    const latest = view.calculation ?? undefined;
    const invs = new Map(this.#s.invalidationsOfSession(sessionId).map((i) => [i.decisionId, i]));
    const decisions = this.#s.decisionsOfSession(sessionId).map((d) => {
      const inv = invs.get(d.id);
      return { ...d, status: decisionStatus(d, inv, latest, view.currency), ...(inv ? { invalidatedAt: inv.at, invalidationCause: inv.cause } : {}) };
    });
    const active = decisions.find((d) => d.status === 'active');
    const state = authState(latest, view.currency, active);
    const reasons: string[] = [];
    const isReviewer = this.#isReviewer(orgId, u.userId);
    const wf = s.workflow ?? 'configuring';
    if (wf === 'closed') reasons.push('The session is closed.');
    if (!latest) reasons.push('There is no calculation to review. An administrator must calculate net positions first.');
    else if (view.currency !== 'current') reasons.push('The latest calculation is stale: participants or obligations changed after it. Calculate again to review the new result.');
    else if (decisions.some((d) => d.calculationId === latest.id)) reasons.push('A decision has already been recorded for this calculation. To review again, calculate again to create a new calculation.');
    if (!isReviewer) reasons.push('You have not been granted the reviewer capability. An organization administrator can grant it.');
    if (latest && isReviewer) {
      const why = conflictedActors(latest, this.#s.obligationsOfSession(sessionId), this.#s.activityOfOrg(orgId)).get(u.userId);
      if (why) reasons.push(`Separation of duties: ${why}. A different reviewer must decide.`);
    }
    return { state, sessionState: wf, currency: view.currency, calculationId: latest?.id ?? null, eligibility: { canDecide: reasons.length === 0, isReviewer, reasons }, decisions };
  }

  /** Approve or reject the named snapshot. Every check, and the write, happen in one transaction. */
  decide(u: ActingUser, orgId: string, sessionId: string, kind: 'approved' | 'rejected', input: { calculationId: unknown; reason?: unknown }): AuthorizationDecision {
    return this.#s.transaction(() => {
      this.#need(orgId, u);
      const s = this.#opSession(u, orgId, sessionId);
      if (!this.#isReviewer(orgId, u.userId)) throw new RegistryError('FORBIDDEN', 'the reviewer capability is required to decide on a calculation');
      if ((s.workflow ?? 'configuring') === 'closed') throw new RegistryError('INVALID_STATE', 'the session is closed and cannot receive a decision');
      if (typeof input.calculationId !== 'string') throw new RegistryError('INVALID', 'name the calculation the decision is about');
      const all = this.#s.calculationsOfSession(sessionId);
      const named = all.find((c) => c.id === input.calculationId);
      if (!named) throw new RegistryError('NOT_FOUND', 'calculation not found');
      const latest = all[all.length - 1] as CalculationRecord;
      if (named.id !== latest.id) throw new RegistryError('STALE', 'that calculation has been superseded by a newer one; review the latest calculation');
      if (this.calculationView(u, orgId, sessionId).currency !== 'current') throw new RegistryError('STALE', 'the calculation is stale: participants or obligations changed after it; calculate again');
      if (this.#s.decisionsOfSession(sessionId).some((d) => d.calculationId === named.id)) throw new RegistryError('EXISTS', 'a decision has already been recorded for this calculation');
      const why = conflictedActors(named, this.#s.obligationsOfSession(sessionId), this.#s.activityOfOrg(orgId)).get(u.userId);
      if (why) throw new RegistryError('SEPARATION_OF_DUTIES', `separation of duties: ${why}; a different reviewer must decide`);
      const reason = kind === 'rejected' ? text(input.reason, 'a rejection reason', 500, 1) : '';
      const d: AuthorizationDecision = { id: id('dec'), sessionId, orgId, calculationId: named.id, decision: kind, reason, decidedBy: u.userId, decidedAt: this.#clock.now().toISOString() };
      try { this.#s.putDecision(d); } catch (e) { if (/UNIQUE/i.test((e as Error).message)) throw new RegistryError('EXISTS', 'a decision has already been recorded for this calculation'); throw e; }
      this.#log(orgId, u, kind === 'approved' ? 'authorization.approved' : 'authorization.rejected', sessionId, `calculation ${this.#short(named.id)}${reason ? `: ${reason}` : ''}`);
      return d;
    });
  }

  // ---- settlement PREPARATION (MVP-1.4): instructions derived from an approved calculation snapshot. Nothing is signed, submitted or settled. ----
  supportedAssets(): SupportedAsset[] { return this.#s.assets(); }

  /** The preconditions for preparing (and the live eligibility of a batch). Every check is evaluated server-side from stored data only. */
  #evaluate(u: ActingUser, orgId: string, sessionId: string, forBatch: boolean): { checks: PrepCheck[]; ok: boolean; calc?: CalculationRecord; asset?: SupportedAsset; plan?: PlannedInstruction[] } {
    const s = this.#opSession(u, orgId, sessionId);
    const view = this.calculationView(u, orgId, sessionId);
    const latest = view.calculation ?? undefined;
    const checks: PrepCheck[] = [];
    const add = (key: string, label: string, ok: boolean, detail: string) => { checks.push({ key, label, ok, detail }); };
    add('session-open', 'The session is not closed', (s.workflow ?? 'configuring') !== 'closed', (s.workflow ?? 'configuring') === 'closed' ? 'a closed session cannot produce or review a batch' : 'session is ' + (s.workflow ?? 'configuring'));
    add('calculation', 'A calculation exists', !!latest, latest ? 'calculation ' + this.#short(latest.id) : 'calculate net positions first');
    if (!latest) {
      for (const [k, l] of [['current', 'The calculation is the latest and current'], ['approval', 'The exact calculation has an active institutional approval'], ['participants', 'Every participant is still valid'], ['obligations', 'Every obligation is still valid'], ['recalculation', 'The net positions recompute exactly'], ['asset', 'The asset is in the supported asset list']] as const) add(k, l, false, 'needs a calculation');
      return { checks, ok: false };
    }
    add('current', 'The calculation is the latest and current', view.currency === 'current', view.currency === 'current' ? 'matches the present participants and obligations' : 'participants or obligations changed after it: calculate again');
    const a = this.authorization(u, orgId, sessionId);
    const dec = a.decisions.find((d) => d.calculationId === latest.id && d.status === 'active');
    add('approval', 'The exact calculation has an active institutional approval', dec?.decision === 'approved', dec ? (dec.decision === 'approved' ? 'approved by a reviewer' : 'the calculation was rejected') : 'no active approval: a reviewer must approve this exact calculation');
    const active = new Set(this.#s.participantsOfSession(sessionId).filter((p) => (p.status ?? 'active') === 'active').map((p) => p.userId));
    const members = new Set(this.#s.membershipsOfOrg(orgId).filter((m) => (m.status ?? 'active') === 'active').map((m) => m.userId));
    const badParty = latest.positions.filter((p) => !active.has(p.userId) || !members.has(p.userId));
    add('participants', 'Every participant is still valid', badParty.length === 0, badParty.length === 0 ? latest.positions.length + ' active participant(s) and organization members' : badParty.length + ' participant(s) were removed or left the organization');
    const rows = new Map(this.#s.obligationsOfSession(sessionId).map((o) => [o.id, o]));
    const badOb = latest.input.obligations.filter((o) => { const r = rows.get(o.id); return !r || r.status !== 'active' || r.revision !== o.revision || r.asset !== latest.asset || !active.has(r.debtor) || !active.has(r.creditor); });
    add('obligations', 'Every obligation is still valid', badOb.length === 0, badOb.length === 0 ? latest.input.obligations.length + ' active obligation(s) as calculated' : badOb.length + ' obligation(s) changed, were voided, or name an inactive participant');
    let recalcOk = false; let recalcDetail = '';
    try { const again = runNetting(sessionId, latest.input); recalcOk = JSON.stringify(again.positions) === JSON.stringify(latest.positions) && again.gross === latest.gross && again.positions.reduce((t, p) => t + BigInt(p.net), 0n) === 0n; recalcDetail = recalcOk ? 'the stored positions recompute exactly and sum to zero' : 'the stored positions differ from a fresh calculation of the same input'; } catch (e) { recalcDetail = (e as Error).message; }
    add('recalculation', 'The net positions recompute exactly', recalcOk, recalcDetail);
    const legacy = latest.input.obligations.filter((o) => rows.get(o.id)?.assetIdentity !== 'canonical').length;
    const entry = latest.assetRef ? this.#s.assets().find((a) => a.id === latest.assetRef) : undefined;
    const res = entry && entry.status === 'supported' ? ({ ok: true as const, asset: entry }) : ({ ok: false as const, detail: latest.assetRef ? (entry ? latest.assetRef + ' is in the asset list but disabled' : latest.assetRef + ' is not in the supported asset list') : legacy > 0 ? legacy + ' obligation(s) have no canonical asset identity (legacy, code only): an administrator must reconcile them by editing each with a supported asset identity' : 'the calculation has no single canonical asset identity' });
    add('asset', 'The asset identity is canonical and in the supported asset list', res.ok, res.ok ? res.asset.id + ' (operator-configured; no on-chain check)' : res.detail);
    if (!forBatch) {
      const mine = this.#s.batchesOfSession(sessionId).filter((b) => b.calculationId === latest.id);
      const live = mine.find((b) => { const st = this.#batchStatusOf(u, orgId, sessionId, b).status; return st === 'awaiting-review' || st === 'approved'; });
      add('no-batch', 'No active batch exists for this calculation', !live, live ? 'batch ' + this.#short(live.id.slice(4)) + ' is already ' + this.#batchStatusOf(u, orgId, sessionId, live).status : mine.length ? mine.length + ' earlier batch(es) were rejected: a new attempt may be prepared' : 'none yet');
    }
    let plan: PlannedInstruction[] | undefined;
    if (recalcOk) {
      const built = buildInstructions(sessionId, latest);
      plan = built.instructions;
      add('engine', 'The netting engine accepts the generated plan', built.engine.ok, built.engine.ok ? built.instructions.length + ' instruction(s); at most ' + INSTRUCTION_CEILING + ' are supported' : built.engine.message);
      const bad = integrityChecks(latest, res.ok ? res.asset.id : 'unresolved', built.instructions).filter((c) => !c.ok);
      add('instructions', 'The instructions reconcile exactly to the approved net positions', bad.length === 0, bad.length === 0 ? 'checked independently of the engine' : bad.map((c) => c.label).join('; '));
    } else { add('engine', 'The netting engine accepts the generated plan', false, 'needs exact net positions'); add('instructions', 'The instructions reconcile exactly to the approved net positions', false, 'needs exact net positions'); }
    return { checks, ok: checks.every((c) => c.ok), calc: latest, ...(res.ok ? { asset: res.asset } : {}), ...(plan ? { plan } : {}) };
  }

  /** What preparing now would require, for display. Read-only. */
  settlementPreview(u: ActingUser, orgId: string, sessionId: string): { checks: PrepCheck[]; ready: boolean; calculationId: string | null } {
    const e = this.#evaluate(u, orgId, sessionId, false);
    return { checks: e.checks, ready: e.ok, calculationId: e.calc?.id ?? null };
  }

  prepareSettlementBatch(u: ActingUser, orgId: string, sessionId: string, input: { calculationId: unknown; attempt?: unknown }): SettlementBatch {
    return this.#s.transaction(() => {
      this.#need(orgId, u, true);
      this.#opSession(u, orgId, sessionId);
      if (typeof input.calculationId !== 'string') throw new RegistryError('INVALID', 'name the approved calculation to prepare from');
      const all = this.#s.calculationsOfSession(sessionId);
      const named = all.find((c) => c.id === input.calculationId);
      if (!named) throw new RegistryError('NOT_FOUND', 'calculation not found');
      if (named.id !== (all[all.length - 1] as CalculationRecord).id) throw new RegistryError('STALE', 'that calculation has been superseded by a newer one');
      const earlier = this.#s.batchesOfSession(sessionId).filter((b) => b.calculationId === named.id);
      const nextAttempt = earlier.length + 1;
      if (input.attempt === undefined) { if (earlier.length > 0) throw new RegistryError('INVALID', 'name the attempt number (' + nextAttempt + ') to prepare again: earlier batches exist for this calculation'); }
      else if (input.attempt !== nextAttempt) throw new RegistryError('EXISTS', 'attempt ' + String(input.attempt) + ' is not the next attempt (' + nextAttempt + '): the batches of this calculation changed; reload');
      const e = this.#evaluate(u, orgId, sessionId, false);
      const failed = e.checks.filter((c) => !c.ok);
      if (failed.length > 0) throw new RegistryError(failed.length === 1 && failed[0]?.key === 'no-batch' ? 'EXISTS' : 'INVALID_STATE', failed.length === 1 && failed[0]?.key === 'no-batch' ? 'an active batch already exists for this calculation' : 'cannot prepare a batch: ' + failed.map((c) => c.label + ' (' + c.detail + ')').join('; '));
      const calc = e.calc as CalculationRecord; const asset = e.asset as SupportedAsset; const plan = e.plan as PlannedInstruction[];
      const batchId = id('bat');
      const total = plan.reduce((t, p) => t + BigInt(p.amount), 0n).toString();
      const validation = [...e.checks, ...integrityChecks(calc, asset.id, plan)];
      const a0 = this.authorization(u, orgId, sessionId);
      const decisionId = a0.decisions.find((d) => d.calculationId === calc.id && d.decision === 'approved' && d.status === 'active')?.id as string;
      const batch: SettlementBatch = { id: batchId, attempt: nextAttempt, sessionId, orgId, calculationId: calc.id, asset: { id: asset.id, network: asset.network, kind: asset.kind, code: asset.code, ...(asset.issuer ? { issuer: asset.issuer } : {}) }, instructionCount: plan.length, totalAmount: total, instructionsHash: instructionsHash(calc.id, asset.id, plan, nextAttempt), algorithm: ALGORITHM, validation, preparedBy: u.userId, preparedAt: this.#clock.now().toISOString() };
      const instructions: SettlementInstruction[] = plan.map((p) => { const base = { id: instructionId(calc.id, p, nextAttempt), batchId, sessionId, orgId, calculationId: calc.id, approvalDecisionId: decisionId, network: asset.network, seq: p.seq, payer: p.payer, payee: p.payee, assetId: asset.id, amount: p.amount }; return { ...base, fingerprint: instructionFingerprint(base) }; });
      try { this.#s.putBatch(batch, instructions); } catch (err) { if (/UNIQUE/i.test((err as Error).message)) throw new RegistryError('EXISTS', 'a batch has already been prepared from this calculation'); throw err; }
      this.#log(orgId, u, 'settlement.batch-prepared', sessionId, 'batch ' + this.#short(batchId.slice(4)) + (nextAttempt > 1 ? ' (attempt ' + nextAttempt + ')' : '') + ' from calculation ' + this.#short(calc.id) + ': ' + plan.length + ' instruction(s), ' + asset.code + ', total ' + total);
      return batch;
    });
  }

  #batchOf(sessionId: string, batchId: string): SettlementBatch {
    const b = typeof batchId === 'string' ? this.#s.batchesOfSession(sessionId).find((x) => x.id === batchId) : undefined;
    if (!b) throw new RegistryError('NOT_FOUND', 'batch not found');
    return b;
  }
  /** Live validation of a stored batch: its own integrity plus whether its source is still eligible. */
  #batchValidation(u: ActingUser, orgId: string, sessionId: string, b: SettlementBatch): PrepCheck[] {
    const calc = this.#s.calculationsOfSession(sessionId).find((c) => c.id === b.calculationId) as CalculationRecord;
    const list = this.#s.instructionsOfBatch(b.id);
    const planned = list.map((i) => ({ seq: i.seq, payer: i.payer, payee: i.payee, amount: i.amount, assetId: i.assetId }));
    const latest = this.#s.latestCalculation(sessionId);
    const source: PrepCheck[] = latest?.id === calc.id ? this.#evaluate(u, orgId, sessionId, true).checks : [{ key: 'current', label: 'The calculation is the latest and current', ok: false, detail: 'a newer calculation exists: this batch is superseded' }];
    const countOk = list.length === b.instructionCount && list.reduce((t, i) => t + BigInt(i.amount), 0n).toString() === b.totalAmount;
    return [...source, { key: 'count', label: 'The stored count and total match the instructions', ok: countOk, detail: countOk ? b.instructionCount + ' instruction(s), total ' + b.totalAmount : 'the stored summary differs from the instructions' }, ...integrityChecks(calc, b.asset.id, planned, b.instructionsHash, b.attempt), ...this.#fingerprintCheck(list)];
  }
  #fingerprintCheck(list: SettlementInstruction[]): PrepCheck[] {
    const stamped = list.filter((i) => i.fingerprint !== undefined);
    if (stamped.length === 0) return [];
    const bad = stamped.filter((i) => instructionFingerprint({ id: i.id, batchId: i.batchId, sessionId: i.sessionId, orgId: i.orgId as string, calculationId: i.calculationId, approvalDecisionId: i.approvalDecisionId as string, network: i.network as string, seq: i.seq, payer: i.payer, payee: i.payee, assetId: i.assetId, amount: i.amount }) !== i.fingerprint);
    return [{ key: 'instruction-fingerprints', label: 'Every instruction still matches its own fingerprint', ok: bad.length === 0, detail: bad.length === 0 ? stamped.length + ' instruction(s) verified' : bad.length + ' instruction(s) differ from their fingerprints' }];
  }
  #batchStatusOf(u: ActingUser, orgId: string, sessionId: string, b: SettlementBatch): { status: BatchStatus; review?: BatchReview; invalidation?: BatchInvalidation } {
    const view = this.calculationView(u, orgId, sessionId);
    const a = this.authorization(u, orgId, sessionId);
    const approvalActive = a.decisions.some((d) => d.calculationId === b.calculationId && d.decision === 'approved' && d.status === 'active');
    const review = this.#s.batchReviewsOfSession(sessionId).find((r) => r.batchId === b.id);
    const invalidation = this.#s.batchInvalidationsOfSession(sessionId).find((i) => i.batchId === b.id);
    return { status: batchStatus({ batch: b, review, inv: invalidation, latest: view.calculation ?? undefined, currency: view.currency, approvalActive }), ...(review ? { review } : {}), ...(invalidation ? { invalidation } : {}) };
  }

  settlementBatches(u: ActingUser, orgId: string, sessionId: string): { batch: SettlementBatch; status: BatchStatus; review?: BatchReview; invalidation?: BatchInvalidation }[] {
    this.#opSession(u, orgId, sessionId);
    return this.#s.batchesOfSession(sessionId).map((b) => ({ batch: b, ...this.#batchStatusOf(u, orgId, sessionId, b) }));
  }
  settlementBatch(u: ActingUser, orgId: string, sessionId: string, batchId: string): {
    batch: SettlementBatch; instructions: SettlementInstruction[]; status: BatchStatus; review?: BatchReview; invalidation?: BatchInvalidation;
    validation: PrepCheck[]; eligibility: { canDecide: boolean; reasons: string[] };
  } {
    this.#opSession(u, orgId, sessionId);
    const batch = this.#batchOf(sessionId, batchId);
    const st = this.#batchStatusOf(u, orgId, sessionId, batch);
    const validation = this.#batchValidation(u, orgId, sessionId, batch);
    const reasons: string[] = [];
    if (!this.#isReviewer(orgId, u.userId)) reasons.push('You have not been granted the reviewer capability. An organization administrator can grant it.');
    if (batch.preparedBy === u.userId) reasons.push('Separation of duties: you prepared this batch. A different reviewer must decide.');
    if (st.status === 'approved' || st.status === 'rejected') reasons.push('A decision has already been recorded for this batch.');
    if (st.status === 'invalidated' || st.status === 'superseded') reasons.push('This batch is no longer eligible: its calculation or approval no longer applies. Calculate, approve and prepare again.');
    if (st.status === 'awaiting-review' && validation.some((c) => !c.ok)) reasons.push('Validation fails: ' + validation.filter((c) => !c.ok).map((c) => c.label).join('; '));
    return { batch, instructions: this.#s.instructionsOfBatch(batch.id), ...st, validation, eligibility: { canDecide: reasons.length === 0, reasons } };
  }
  settlementBatchValidation(u: ActingUser, orgId: string, sessionId: string, batchId: string): PrepCheck[] {
    this.#opSession(u, orgId, sessionId);
    return this.#batchValidation(u, orgId, sessionId, this.#batchOf(sessionId, batchId));
  }

  /** Approve or reject ONE batch for settlement. Application-level only: not a signature, not a transaction. */
  decideSettlementBatch(u: ActingUser, orgId: string, sessionId: string, batchId: string, kind: 'approved' | 'rejected', input: { instructionsHash: unknown; reason?: unknown }): BatchReview {
    return this.#s.transaction(() => {
      this.#need(orgId, u);
      this.#opSession(u, orgId, sessionId);
      if (!this.#isReviewer(orgId, u.userId)) throw new RegistryError('FORBIDDEN', 'the reviewer capability is required to decide on a batch');
      const batch = this.#batchOf(sessionId, batchId);
      if (this.session(u, orgId, sessionId).workflow === 'closed') throw new RegistryError('INVALID_STATE', 'the session is closed and cannot receive a decision');
      if (typeof input.instructionsHash !== 'string') throw new RegistryError('INVALID', 'name the instruction fingerprint you reviewed');
      if (input.instructionsHash !== batch.instructionsHash) throw new RegistryError('STALE', 'the instructions you reviewed are not the ones in this batch');
      const st = this.#batchStatusOf(u, orgId, sessionId, batch);
      if (st.status === 'invalidated' || st.status === 'superseded') throw new RegistryError('STALE', 'this batch is no longer eligible: its calculation or approval no longer applies');
      if (st.status !== 'awaiting-review') throw new RegistryError('EXISTS', 'a decision has already been recorded for this batch');
      const failed = this.#batchValidation(u, orgId, sessionId, batch).filter((c) => !c.ok);
      if (failed.length > 0) throw new RegistryError('INVALID_STATE', 'validation fails: ' + failed.map((c) => c.label).join('; '));
      if (batch.preparedBy === u.userId) throw new RegistryError('SEPARATION_OF_DUTIES', 'separation of duties: you prepared this batch; a different reviewer must decide');
      const reason = kind === 'rejected' ? text(input.reason, 'a rejection reason', 500, 1) : '';
      const r: BatchReview = { id: id('brv'), batchId: batch.id, decision: kind, reason, decidedBy: u.userId, decidedAt: this.#clock.now().toISOString() };
      try { this.#s.putBatchReview(r); } catch (err) { if (/UNIQUE/i.test((err as Error).message)) throw new RegistryError('EXISTS', 'a decision has already been recorded for this batch'); throw err; }
      this.#log(orgId, u, kind === 'approved' ? 'settlement.batch-approved' : 'settlement.batch-rejected', sessionId, 'batch ' + this.#short(batch.id.slice(4)) + (reason ? ': ' + reason : ''));
      return r;
    });
  }

  // ---- wallet ownership verification (MVP-1.5): proves control of a Stellar key; confers NO institutional permission ----
  issueWalletChallenge(u: ActingUser, orgId: string, input: { network: unknown; publicKey: unknown }): WalletChallenge {
    return this.#s.transaction(() => {
      this.#need(orgId, u);
      // Stellar Testnet is the only network enabled in this product: a Mainnet ("public") or any other network is refused here, whatever the client sends.
      if (input.network !== 'testnet') throw new RegistryError('INVALID', 'only Stellar Testnet is enabled: network must be testnet');
      if (!isStellarAccount(input.publicKey)) throw new RegistryError('INVALID', 'not a valid Stellar account address');
      const issued = this.#clock.now();
      const nonce = randomBytes(24).toString('hex');
      const base = { orgId, userId: u.userId, network: 'testnet' as const, publicKey: input.publicKey, nonce, issuedAt: issued.toISOString(), expiresAt: new Date(issued.getTime() + CHALLENGE_TTL_MS).toISOString() };
      const c: WalletChallenge = { id: id('wch'), ...base, message: challengeMessage(base) };
      this.#s.putChallenge(c);
      return c;
    });
  }
  /** One-time. Every failure (unknown, someone else's, expired, used, wrong signature, wrong scheme) returns the same error so nothing can be probed. */
  verifyWalletChallenge(u: ActingUser, orgId: string, input: { challengeId: unknown; signature: unknown; scheme: unknown }): WalletVerification {
    return this.#s.transaction(() => {
      this.#need(orgId, u);
      const bad = new RegistryError('INVALID_CHALLENGE', 'the challenge is invalid, expired or already used, or the signature does not verify');
      const c = typeof input.challengeId === 'string' ? this.#s.getChallenge(input.challengeId) : undefined;
      if (!c || c.orgId !== orgId || c.userId !== u.userId || c.usedAt || new Date(c.expiresAt).getTime() <= this.#clock.now().getTime()) throw bad;
      if (input.scheme !== 'raw' && input.scheme !== 'sep-53') throw bad;
      if (typeof input.signature !== 'string' || !verifyChallengeSignature(c.publicKey, c.message, input.signature, input.scheme as Scheme)) throw bad;
      const have = this.#s.verificationsOfOrg(orgId).find((v) => v.network === c.network && v.publicKey === c.publicKey);
      if (have && have.userId !== u.userId) throw new RegistryError('EXISTS', 'that key is already verified for another member of this organization');
      const now = this.#clock.now().toISOString();
      this.#s.markChallengeUsed(c.id, now);
      if (have) return have;
      const v: WalletVerification = { orgId, userId: u.userId, network: c.network, publicKey: c.publicKey, scheme: input.scheme as Scheme, challengeId: c.id, verifiedAt: now };
      this.#s.putVerification(v);
      this.#log(orgId, u, 'wallet.verified', c.publicKey, c.network + ', ' + input.scheme + ': proves control of the key only; it grants no role or permission');
      return v;
    });
  }
  walletVerifications(u: ActingUser, orgId: string): WalletVerification[] { this.#need(orgId, u); return this.#s.verificationsOfOrg(orgId); }

  // ---- settlement execution (MVP-1.5): the Stellar-side precondition snapshot and the state log. Nothing is signed, submitted or confirmed by this build. ----
  /** Accounts for the people in a batch: exactly one VERIFIED key per person on the batch network, or the person is reported missing. */
  #accountsFor(orgId: string, network: string, userIds: string[]): { accounts: Record<string, string>; missing: string[]; ambiguous: string[] } {
    const vs = this.#s.verificationsOfOrg(orgId).filter((v) => v.network === network);
    const accounts: Record<string, string> = {}; const missing: string[] = []; const ambiguous: string[] = [];
    for (const uid of userIds) { const mine = vs.filter((v) => v.userId === uid); if (mine.length === 1) accounts[uid] = (mine[0] as WalletVerification).publicKey; else if (mine.length === 0) missing.push(uid); else ambiguous.push(uid); }
    return { accounts, missing, ambiguous };
  }
  startSettlementExecution(u: ActingUser, orgId: string, sessionId: string, batchId: string): SettlementExecution {
    return this.#s.transaction(() => {
      this.#need(orgId, u, true);
      const v = this.settlementBatch(u, orgId, sessionId, batchId);
      if (v.status !== 'approved') throw new RegistryError('INVALID_STATE', 'only an approved, still-eligible batch can start execution (this batch is ' + v.status + ')');
      const failed = v.validation.filter((c) => !c.ok);
      if (failed.length > 0) throw new RegistryError('INVALID_STATE', 'validation fails: ' + failed.map((c) => c.label).join('; '));
      if (v.instructions.length === 0) throw new RegistryError('INVALID_STATE', 'this batch requires no transfers: there is nothing to execute');
      if (this.#s.executionOfBatch(batchId)) throw new RegistryError('EXISTS', 'an execution already exists for this batch');
      const network = v.batch.asset.network as 'testnet' | 'public';
      const people = [...new Set(v.instructions.flatMap((i) => [i.payer, i.payee]))];
      const a = this.#accountsFor(orgId, network, people);
      if (a.missing.length > 0 || a.ambiguous.length > 0) throw new RegistryError('INVALID_STATE', 'every payer and payee needs exactly one VERIFIED Stellar account on ' + network + ': ' + a.missing.length + ' missing, ' + a.ambiguous.length + ' ambiguous (a connected wallet or a typed public key does not count)');
      const now = this.#clock.now().toISOString();
      const e: SettlementExecution = { id: id('exe'), batchId, sessionId, orgId, network, accounts: a.accounts, createdBy: u.userId, createdAt: now };
      this.#s.putExecution(e, { executionId: e.id, from: null, to: 'awaiting-signer', actor: u.userId, at: now, detail: 'execution prepared from batch ' + this.#short(batchId.slice(4)) + ' with ' + people.length + ' verified account(s); no signing, submission or confirmation exists in this build' });
      this.#log(orgId, u, 'settlement.execution-started', sessionId, 'execution for batch ' + this.#short(batchId.slice(4)) + ' is awaiting a signer');
      return e;
    });
  }
  settlementExecution(u: ActingUser, orgId: string, sessionId: string, batchId: string): { execution: SettlementExecution; state: ExecState; events: ExecutionEvent[] } | null {
    this.#opSession(u, orgId, sessionId); this.#batchOf(sessionId, batchId);
    const e = this.#s.executionOfBatch(batchId); if (!e) return null;
    const events = this.#s.eventsOfExecution(e.id);
    return { execution: e, state: (events[events.length - 1] as ExecutionEvent).to as ExecState, events };
  }
  /**
   * The ONLY way an execution state changes. Server-side and not exposed over HTTP: the future signer and submitter services call it, a browser cannot. Illegal
   * transitions are refused; asking for the state it is already in is idempotent (no new event). Evidence is stored as given and must contain no secrets.
   */
  advanceSettlementExecution(u: ActingUser, orgId: string, sessionId: string, batchId: string, to: unknown, input: { detail: string; evidence?: unknown }): { state: ExecState; changed: boolean } {
    return this.#s.transaction(() => {
      this.#need(orgId, u, true);
      const cur = this.settlementExecution(u, orgId, sessionId, batchId);
      if (!cur) throw new RegistryError('NOT_FOUND', 'execution not found');
      if (!isState(to)) throw new RegistryError('INVALID', 'unknown execution state');
      if (cur.state === to) return { state: cur.state, changed: false };
      if (!canTransition(cur.state, to)) throw new RegistryError('INVALID_STATE', 'an execution cannot move from ' + cur.state + ' to ' + to);
      this.#s.putExecutionEvent({ executionId: cur.execution.id, from: cur.state, to, actor: u.userId, at: this.#clock.now().toISOString(), detail: text(input.detail, 'detail', 300, 1), ...(input.evidence !== undefined ? { evidence: input.evidence } : {}) });
      this.#log(orgId, u, 'settlement.execution-state', sessionId, 'execution ' + cur.state + ' -> ' + to);
      return { state: to, changed: true };
    });
  }

  // ---- execution ATTEMPTS (MVP-1.5): immutable technical tries to execute an approved batch on Stellar ----
  #attemptState(attemptId: string): { state: ExecState; events: AttemptEvent[] } {
    const events = this.#s.eventsOfAttempt(attemptId);
    const t = events.filter((e) => e.kind === 'transition');
    return { state: (t[t.length - 1] as AttemptEvent).to as ExecState, events };
  }
  /**
   * Starts a NEW attempt for an approved batch whose execution preconditions exist. The plan is rebuilt from the approved calculation, the approved batch and the
   * VERIFIED accounts in the execution snapshot (never from client input), so a changed economic instruction cannot slip in: the batch must still be approved and
   * eligible. The retry policy decides whether a new attempt is allowed after the previous one. An unknown outcome blocks everything until the network is read.
   */
  beginExecutionAttempt(u: ActingUser, orgId: string, sessionId: string, batchId: string, input: { initiator: unknown; reviewedFailure?: unknown }): SettlementAttempt {
    return this.#s.transaction(() => {
      this.#need(orgId, u, true);
      const ex = this.settlementExecution(u, orgId, sessionId, batchId);
      if (!ex) throw new RegistryError('INVALID_STATE', 'record the execution preconditions (verified accounts) for this batch first');
      const bv = this.settlementBatch(u, orgId, sessionId, batchId);
      if (bv.status !== 'approved') throw new RegistryError('INVALID_STATE', 'only an approved, still-eligible batch can be executed (this batch is ' + bv.status + ')');
      const failed = bv.validation.filter((c) => !c.ok);
      if (failed.length > 0) throw new RegistryError('INVALID_STATE', 'validation fails: ' + failed.map((c) => c.label).join('; '));
      if (typeof input.initiator !== 'string' || !(input.initiator in ex.execution.accounts)) throw new RegistryError('INVALID', 'the initiator must be a participant with a verified account');
      if (!this.#clearing) throw new RegistryError('INVALID_STATE', 'no clearing contract is configured for this deployment (TOBIN_STELLAR_CLEARING_CONTRACT)');
      const prior = this.#s.attemptsOfExecution(ex.execution.id);
      const last = prior[prior.length - 1];
      const dec = mayStartAttempt(last ? this.#attemptState(last.id).state : undefined, { reviewedFailure: input.reviewedFailure === true });
      if (!dec.allowed) throw new RegistryError('INVALID_STATE', 'a new attempt is not allowed: ' + dec.reason);
      const calc = this.#s.calculationsOfSession(sessionId).find((c) => c.id === bv.batch.calculationId) as CalculationRecord;
      let plan;
      try {
        plan = buildExecutionPlan({ network: ex.execution.network as 'testnet', clearing: this.#clearing, assetId: bv.batch.asset.id, batchId, initiator: input.initiator, accounts: ex.execution.accounts, positions: calc.positions, obligations: calc.input.obligations.map((o) => ({ id: o.id, debtor: o.debtor, creditor: o.creditor, amount: o.amount })), instructions: bv.instructions.map((i) => ({ payer: i.payer, payee: i.payee, amount: i.amount })) });
      } catch (e) { if (e instanceof PlanError) throw new RegistryError('INVALID_STATE', 'no execution plan can be made: ' + e.message); throw e; }
      const now = this.#clock.now().toISOString();
      const a: SettlementAttempt = { id: id('att'), executionId: ex.execution.id, attemptNo: prior.length + 1, network: ex.execution.network, planFingerprint: plan.fingerprint, plan, initiator: input.initiator, createdBy: u.userId, createdAt: now };
      try { this.#s.putAttempt(a, { attemptId: a.id, kind: 'transition', from: null, to: 'awaiting-signer', actor: u.userId, at: now, detail: 'attempt ' + a.attemptNo + ' started: ' + dec.reason + '; plan ' + plan.fingerprint.slice(0, 12) + ', ' + plan.steps.length + ' step(s), ' + plan.requiredSigners.length + ' signer(s); nothing has been signed or submitted' }); }
      catch (e) { if (/UNIQUE/i.test((e as Error).message)) throw new RegistryError('EXISTS', 'that attempt already exists'); throw e; }
      this.#log(orgId, u, 'settlement.attempt-started', sessionId, 'attempt ' + a.attemptNo + ' for batch ' + this.#short(batchId.slice(4)) + ' (plan ' + plan.fingerprint.slice(0, 12) + ')');
      return a;
    });
  }
  settlementAttempts(u: ActingUser, orgId: string, sessionId: string, batchId: string): { attempt: SettlementAttempt; state: ExecState; events: AttemptEvent[]; transactions: { txHash: string; stepIndex: number }[] }[] {
    this.#opSession(u, orgId, sessionId); this.#batchOf(sessionId, batchId);
    const ex = this.#s.executionOfBatch(batchId); if (!ex) return [];
    return this.#s.attemptsOfExecution(ex.id).map((attempt) => ({ attempt, ...this.#attemptState(attempt.id), transactions: this.#s.transactionsOfAttempt(attempt.id).map((t) => ({ txHash: t.txHash, stepIndex: t.stepIndex })) }));
  }
  /**
   * The ONLY way an attempt changes state. Server-side, no HTTP route. Rules: illegal transitions are refused; the current state again is idempotent; entering
   * submission-pending requires the transaction hash (recorded BEFORE sending, UNIQUE per attempt step and per hash: a duplicate submission cannot be recorded);
   * confirmed, failed-after-submission, expired-after-unknown and the final states require EVIDENCE of an independent network read of a recorded hash; reconciled
   * requires a comparison that matched. An API response, a signature or a local record never confirms anything.
   */
  advanceExecutionAttempt(u: ActingUser, orgId: string, sessionId: string, batchId: string, attemptNo: number, to: unknown, input: { detail: string; evidence?: unknown; tx?: { hash: string; step: number } }): { state: ExecState; changed: boolean } {
    return this.#s.transaction(() => {
      this.#need(orgId, u, true);
      const ex = this.#s.executionOfBatch(batchId); this.#opSession(u, orgId, sessionId); this.#batchOf(sessionId, batchId);
      const att = ex ? this.#s.attemptsOfExecution(ex.id).find((a) => a.attemptNo === attemptNo) : undefined;
      if (!att) throw new RegistryError('NOT_FOUND', 'attempt not found');
      if (!isState(to)) throw new RegistryError('INVALID', 'unknown execution state');
      const cur = this.#attemptState(att.id).state;
      if (cur === to) return { state: cur, changed: false };
      if (!canTransition(cur, to)) throw new RegistryError('INVALID_STATE', 'an attempt cannot move from ' + cur + ' to ' + to);
      const recorded = new Set(this.#s.transactionsOfAttempt(att.id).map((t) => t.txHash));
      const ev = (input.evidence ?? {}) as { networkRead?: { hash?: string; status?: string }; comparison?: { ok?: boolean; mismatches?: unknown[] } };
      const read = ev.networkRead;
      const readOk = (status: string) => !!read && typeof read.hash === 'string' && (recorded.has(read.hash) || input.tx?.hash === read.hash) && read.status === status;
      if (to === 'submission-pending') {
        if (!input.tx || !/^[0-9a-f]{64}$/.test(input.tx.hash) || !Number.isInteger(input.tx.step) || input.tx.step < 1) throw new RegistryError('INVALID', 'submission needs the transaction hash and step, recorded before sending');
        try { this.#s.putAttemptTransaction({ txHash: input.tx.hash, attemptId: att.id, stepIndex: input.tx.step, network: att.network, recordedBy: u.userId, recordedAt: this.#clock.now().toISOString() }); }
        catch (e) { if (/UNIQUE|constraint/i.test((e as Error).message)) throw new RegistryError('EXISTS', 'that transaction, or a transaction for that step of this attempt, is already recorded: a duplicate submission is refused'); throw e; }
      }
      if (to === 'confirmed' && !readOk('SUCCESS')) throw new RegistryError('INVALID_STATE', 'confirmation requires an independent network read of a recorded transaction hash that reports SUCCESS (evidence.networkRead)');
      if (to === 'failed' && cur !== 'signing' && !(readOk('FAILED') || input.evidence !== undefined && (ev as { rejectedBeforeInclusion?: boolean }).rejectedBeforeInclusion === true)) throw new RegistryError('INVALID_STATE', 'a failure after signing needs an independent network read reporting FAILED, or evidence that the network rejected the transaction before inclusion');
      if (to === 'expired' && cur === 'unknown-outcome' && !(readOk('NOT_FOUND') && (ev as { validityPassed?: boolean }).validityPassed === true)) throw new RegistryError('INVALID_STATE', 'an unknown outcome expires only when a network read finds no transaction AND its validity window has passed');
      if (to === 'reconciled' && !(cur === 'reconciliation-required' || cur === 'confirmed') ) throw new RegistryError('INVALID_STATE', 'only a confirmed or flagged attempt can be reconciled');
      if (to === 'reconciled' && cur === 'confirmed' && ev.comparison?.ok !== true) throw new RegistryError('INVALID_STATE', 'reconciliation requires a comparison of the chain with the approved plan that matched (evidence.comparison.ok)');
      if (to === 'reconciliation-required' && ev.comparison?.ok === true) throw new RegistryError('INVALID', 'a matching comparison does not require reconciliation');
      this.#s.putAttemptEvent({ attemptId: att.id, kind: 'transition', from: cur, to, actor: u.userId, at: this.#clock.now().toISOString(), detail: text(input.detail, 'detail', 300, 1), ...(input.evidence !== undefined ? { evidence: input.evidence } : {}) });
      this.#log(orgId, u, 'settlement.attempt-state', sessionId, 'attempt ' + attemptNo + ' ' + cur + ' -> ' + to);
      return { state: to as ExecState, changed: true };
    });
  }
  /** A note on an attempt (a failed simulation, a wallet that was unavailable, a user rejection): recorded, no state change. */
  noteExecutionAttempt(u: ActingUser, orgId: string, sessionId: string, batchId: string, attemptNo: number, detail: string, evidence?: unknown): void {
    this.#s.transaction(() => {
      this.#need(orgId, u, true); this.#opSession(u, orgId, sessionId); this.#batchOf(sessionId, batchId);
      const ex = this.#s.executionOfBatch(batchId); const att = ex ? this.#s.attemptsOfExecution(ex.id).find((a) => a.attemptNo === attemptNo) : undefined;
      if (!att) throw new RegistryError('NOT_FOUND', 'attempt not found');
      const cur = this.#attemptState(att.id).state;
      this.#s.putAttemptEvent({ attemptId: att.id, kind: 'note', from: cur, to: cur, actor: u.userId, at: this.#clock.now().toISOString(), detail: text(detail, 'detail', 300, 1), ...(evidence !== undefined ? { evidence } : {}) });
    });
  }

  // ---- signer-set snapshots (MVP-1.5): what the chain says about an account's signers. Information for verification; NOT a role, NOT an authorization ----
  /**
   * Records a snapshot of an account's signer set. The caller supplies a set that was read from the chain (Horizon and the RPC agreeing: see readLiveSignerSet); the
   * fingerprint is recomputed here, so a set cannot be recorded under a fingerprint it does not have. Recording changes no role, no reviewer capability and no
   * permission of any signer. The same fingerprint is idempotent; a different one supersedes the earlier snapshot (which stays on record).
   */
  recordSignerSet(u: ActingUser, orgId: string, input: { set: SignerSet; fingerprint: string }): { snapshot: SignerSetSnapshot; changed: boolean; supersedes?: string } {
    return this.#s.transaction(() => {
      this.#need(orgId, u, true);
      let fp: string; try { fp = fingerprintOf(input.set); } catch (e) { throw new RegistryError('INVALID', 'the signer set is not usable: ' + (e as Error).message); }
      if (fp !== input.fingerprint) throw new RegistryError('INVALID', 'the fingerprint does not match the signer set');
      const prior = this.#s.signerSetsOfAccount(orgId, input.set.network, input.set.account);
      const same = prior.find((p) => p.fingerprint === fp);
      if (same) return { snapshot: same, changed: false };
      const snap: SignerSetSnapshot = { id: id('sgs'), orgId, network: input.set.network, account: input.set.account, fingerprint: fp, thresholds: { ...input.set.thresholds }, signers: input.set.signers.filter((x) => x.weight > 0).map((x) => ({ key: x.key, weight: x.weight })).sort((a, b) => (a.key < b.key ? -1 : 1)), recordedBy: u.userId, recordedAt: this.#clock.now().toISOString() };
      this.#s.putSignerSet(snap);
      const last = prior[prior.length - 1];
      this.#log(orgId, u, 'signer-set.recorded', snap.account, (last ? 'the signer set CHANGED (superseding ' + last.fingerprint.slice(0, 12) + ')' : 'first snapshot') + '; fingerprint ' + fp.slice(0, 12) + ', ' + snap.signers.length + ' signer(s); information only: no role or permission was granted');
      return { snapshot: snap, changed: true, ...(last ? { supersedes: last.id } : {}) };
    });
  }
  /** Authorization check ONLY (no write): callers must pass it BEFORE any network read is made on a user's behalf. */
  requireSignerSetAdmin(u: ActingUser, orgId: string): void { this.#need(orgId, u, true); }
  /** The current (latest) snapshot, and the earlier ones, for an account. */
  signerSetHistory(u: ActingUser, orgId: string, network: 'testnet' | 'public', account: string): { current: SignerSetSnapshot | null; history: SignerSetSnapshot[] } {
    this.#need(orgId, u);
    const all = this.#s.signerSetsOfAccount(orgId, network, account);
    return { current: all[all.length - 1] ?? null, history: all };
  }
  /** Is an authorization that was based on `basedOn` still based on the CURRENT chain? Compares with the live fingerprint the caller just read; fails closed without one. */
  signerSetFresh(u: ActingUser, orgId: string, network: 'testnet' | 'public', account: string, basedOn: string, liveFingerprint: string | undefined): { fresh: boolean; reason: string } {
    const h = this.signerSetHistory(u, orgId, network, account);
    if (!liveFingerprint) return { fresh: false, reason: 'the live signer set could not be read: authorization is not possible' };
    if (basedOn !== liveFingerprint) return { fresh: false, reason: 'the signer set on chain changed since this authorization was based on it' };
    if (!h.current || h.current.fingerprint !== liveFingerprint) return { fresh: false, reason: 'the live signer set has not been recorded: record a snapshot first' };
    return { fresh: true, reason: 'the authorization matches the current signer set' };
  }

  activity(u: ActingUser, orgId: string): ActivityRecord[] { this.#need(orgId, u); return this.#s.activityOfOrg(orgId); }
}
