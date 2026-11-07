// Registry rules: organizations, memberships, invitations, wallet links, session records with provenance, activity. Server-side authorization on every call.
// Nothing here talks to a network or a wallet. A role here never grants on-chain authority.
import { createHash, randomBytes } from 'node:crypto';
import type { ActingUser } from './identity.ts';
import type { RegistryStore } from './store.ts';
import { RegistryError } from './types.ts';
import type { ActivityRecord, CalculationRecord, ChainObservation, Invitation, Membership, ObligationRecord, Organization, OrgWallet, Role, SessionParticipant, SessionRecord, WorkflowState } from './types.ts';
import { canonicalInput, currencyOf, inputHash, parseAsset, parseObligationAmount, readinessChecks, runNetting, TRANSITIONS } from './clearing.ts';
import type { Currency, ReadinessCheck } from './clearing.ts';
import { authState, conflictedActors, decisionStatus } from './authorization.ts';
import type { AuthState, DecisionStatus } from './authorization.ts';
import type { AuthorizationDecision, ReviewerGrant } from './types.ts';
import { ALGORITHM, INSTRUCTION_CEILING, assetCanonicalId, batchStatus, buildInstructions, instructionId, instructionsHash, integrityChecks, resolveAsset } from './settlement.ts';
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
  constructor(store: RegistryStore, clock: Clock = systemClock) { this.#s = store; this.#clock = clock; }

  #log(orgId: string, actor: ActingUser, kind: string, subject: string, detail: string) {
    const a: ActivityRecord = { id: id('act'), at: this.#clock.now().toISOString(), orgId, actor: actor.userId, kind, subject, detail };
    this.#s.appendActivity(a);
  }
  #role(orgId: string, u: ActingUser): Role | null {
    return this.#s.membershipsOfOrg(orgId).find((m) => m.userId === u.userId)?.role ?? null;
  }
  /** Not a member of the organization looks identical to "no such organization": isolation must not leak existence. */
  #need(orgId: string, u: ActingUser, admin = false): Role {
    const r = this.#role(orgId, u);
    if (!r || !this.#s.getOrganization(orgId)) throw new RegistryError('NOT_FOUND', 'organization not found');
    if (admin && r !== 'admin') throw new RegistryError('FORBIDDEN', 'administrator role required');
    return r;
  }

  createOrganization(u: ActingUser, input: { name: unknown; description?: unknown; visibility?: unknown }): Organization {
    return this.#s.transaction(() => this.#createOrganization(u, input));
  }
  #createOrganization(u: ActingUser, input: { name: unknown; description?: unknown; visibility?: unknown }): Organization {
    const name = text(input.name, 'name', 80, 2);
    const description = input.description === undefined ? '' : text(input.description, 'description', 500, 0);
    const visibility = input.visibility === 'public' ? 'public' : 'private';
    const o: Organization = { id: id('org'), name, description, visibility, createdAt: this.#clock.now().toISOString(), createdBy: u.userId };
    this.#s.putOrganization(o);
    this.#s.putMembership({ orgId: o.id, userId: u.userId, role: 'admin', since: o.createdAt });
    this.#log(o.id, u, 'organization.created', o.id, name);
    return o;
  }
  myOrganizations(u: ActingUser): Organization[] {
    return this.#s.membershipsOfUser(u.userId).map((m) => this.#s.getOrganization(m.orgId)).filter((o): o is Organization => !!o);
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
    if (m.role === 'admin' && role !== 'admin' && ms.filter((x) => x.role === 'admin').length === 1) throw new RegistryError('LAST_ADMIN', 'an organization must keep at least one administrator');
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
    if (m.role === 'admin' && ms.filter((x) => x.role === 'admin').length === 1) throw new RegistryError('LAST_ADMIN', 'an organization must keep at least one administrator');
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

  /** Returns the secret token ONCE; only its hash is stored. */
  invite(u: ActingUser, orgId: string, input: { invitee: unknown; role: unknown }): { invitation: Invitation; token: string } {
    return this.#s.transaction(() => this.#invite(u, orgId, input));
  }
  #invite(u: ActingUser, orgId: string, input: { invitee: unknown; role: unknown }): { invitation: Invitation; token: string } {
    this.#need(orgId, u, true);
    const invitee = text(input.invitee, 'invitee', 120, 3);
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
    if (u.email !== undefined && i.invitee.includes('@') && i.invitee.toLowerCase() !== u.email.toLowerCase()) throw bad;
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
  createObligation(u: ActingUser, orgId: string, sessionId: string, input: { debtor: unknown; creditor: unknown; amount: unknown; asset: unknown; reference?: unknown }): ObligationRecord {
    return this.#s.transaction(() => {
      this.#editable(u, orgId, sessionId);
      const debtor = this.#activeParticipant(sessionId, input.debtor, 'the debtor').userId;
      const creditor = this.#activeParticipant(sessionId, input.creditor, 'the creditor').userId;
      if (debtor === creditor) throw new RegistryError('INVALID', 'debtor and creditor must be different participants');
      const amount = parseObligationAmount(input.amount);
      const asset = parseAsset(input.asset);
      const other = this.#assetOfOthers(sessionId);
      if (other && other !== asset) throw new RegistryError('INVALID', `this session nets ${other}: obligations in different assets are never netted together`);
      const reference = input.reference === undefined ? '' : text(input.reference, 'reference', 200, 0);
      const now = this.#clock.now().toISOString();
      const o: ObligationRecord = { id: randomBytes(32).toString('hex'), sessionId, orgId, debtor, creditor, amount, asset, reference, status: 'active', revision: 1, createdAt: now, createdBy: u.userId, updatedAt: now, updatedBy: u.userId };
      this.#s.putObligation(o);
      this.#invalidate(orgId, u, sessionId, 'an obligation was recorded'); this.#log(orgId, u, 'obligation.created', sessionId, `obligation ${this.#short(o.id)}: ${debtor} owes ${creditor} ${amount} ${asset}${reference ? ` (${reference})` : ''}`);
      return o;
    });
  }
  updateObligation(u: ActingUser, orgId: string, sessionId: string, obligationId: string, patch: { debtor?: unknown; creditor?: unknown; amount?: unknown; asset?: unknown; reference?: unknown }): ObligationRecord {
    return this.#s.transaction(() => {
      this.#editable(u, orgId, sessionId);
      const o = this.#own(sessionId, obligationId);
      if (o.status !== 'active') throw new RegistryError('INVALID_STATE', 'a voided obligation cannot be changed; record a new one');
      const next: ObligationRecord = { ...o };
      const changes: string[] = [];
      if (patch.debtor !== undefined) next.debtor = this.#activeParticipant(sessionId, patch.debtor, 'the debtor').userId;
      if (patch.creditor !== undefined) next.creditor = this.#activeParticipant(sessionId, patch.creditor, 'the creditor').userId;
      if (patch.amount !== undefined) next.amount = parseObligationAmount(patch.amount);
      if (patch.asset !== undefined) next.asset = parseAsset(patch.asset);
      if (patch.reference !== undefined) next.reference = text(patch.reference, 'reference', 200, 0);
      // a participant that was removed since cannot stay on an edited obligation unchanged-by-accident: re-validate both parties
      this.#activeParticipant(sessionId, next.debtor, 'the debtor'); this.#activeParticipant(sessionId, next.creditor, 'the creditor');
      if (next.debtor === next.creditor) throw new RegistryError('INVALID', 'debtor and creditor must be different participants');
      const other = this.#assetOfOthers(sessionId, o.id);
      if (other && other !== next.asset) throw new RegistryError('INVALID', `this session nets ${other}: obligations in different assets are never netted together`);
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
        const c: CalculationRecord = { id: id('calc'), sessionId, orgId, asset, inputHash: inputHash(asset, input), input, positions, gross, createdAt: this.#clock.now().toISOString(), createdBy: u.userId };
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
  closeSession(u: ActingUser, orgId: string, sessionId: string): SessionRecord { return this.#s.transaction(() => { this.#need(orgId, u, true); return this.#move(u, orgId, sessionId, 'closed'); }); }

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
    const members = new Set(this.#s.membershipsOfOrg(orgId).map((m) => m.userId));
    const badParty = latest.positions.filter((p) => !active.has(p.userId) || !members.has(p.userId));
    add('participants', 'Every participant is still valid', badParty.length === 0, badParty.length === 0 ? latest.positions.length + ' active participant(s) and organization members' : badParty.length + ' participant(s) were removed or left the organization');
    const rows = new Map(this.#s.obligationsOfSession(sessionId).map((o) => [o.id, o]));
    const badOb = latest.input.obligations.filter((o) => { const r = rows.get(o.id); return !r || r.status !== 'active' || r.revision !== o.revision || r.asset !== latest.asset || !active.has(r.debtor) || !active.has(r.creditor); });
    add('obligations', 'Every obligation is still valid', badOb.length === 0, badOb.length === 0 ? latest.input.obligations.length + ' active obligation(s) as calculated' : badOb.length + ' obligation(s) changed, were voided, or name an inactive participant');
    let recalcOk = false; let recalcDetail = '';
    try { const again = runNetting(sessionId, latest.input); recalcOk = JSON.stringify(again.positions) === JSON.stringify(latest.positions) && again.gross === latest.gross && again.positions.reduce((t, p) => t + BigInt(p.net), 0n) === 0n; recalcDetail = recalcOk ? 'the stored positions recompute exactly and sum to zero' : 'the stored positions differ from a fresh calculation of the same input'; } catch (e) { recalcDetail = (e as Error).message; }
    add('recalculation', 'The net positions recompute exactly', recalcOk, recalcDetail);
    const res = resolveAsset(latest.asset, this.#s.assets());
    add('asset', 'The asset is in the supported asset list', res.ok, res.ok ? res.asset.id + ' (operator-configured; no on-chain check)' : res.detail);
    if (!forBatch) { const have = this.#s.batchesOfSession(sessionId).find((b) => b.calculationId === latest.id); add('no-batch', 'No batch exists yet for this calculation', !have, have ? 'batch ' + this.#short(have.id.slice(4)) + ' already prepared from it' : 'none yet'); }
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

  prepareSettlementBatch(u: ActingUser, orgId: string, sessionId: string, input: { calculationId: unknown }): SettlementBatch {
    return this.#s.transaction(() => {
      this.#need(orgId, u, true);
      this.#opSession(u, orgId, sessionId);
      if (typeof input.calculationId !== 'string') throw new RegistryError('INVALID', 'name the approved calculation to prepare from');
      const all = this.#s.calculationsOfSession(sessionId);
      const named = all.find((c) => c.id === input.calculationId);
      if (!named) throw new RegistryError('NOT_FOUND', 'calculation not found');
      if (named.id !== (all[all.length - 1] as CalculationRecord).id) throw new RegistryError('STALE', 'that calculation has been superseded by a newer one');
      const e = this.#evaluate(u, orgId, sessionId, false);
      const failed = e.checks.filter((c) => !c.ok);
      if (failed.length > 0) throw new RegistryError(failed.length === 1 && failed[0]?.key === 'no-batch' ? 'EXISTS' : 'INVALID_STATE', failed.length === 1 && failed[0]?.key === 'no-batch' ? 'a batch has already been prepared from this calculation' : 'cannot prepare a batch: ' + failed.map((c) => c.label + ' (' + c.detail + ')').join('; '));
      const calc = e.calc as CalculationRecord; const asset = e.asset as SupportedAsset; const plan = e.plan as PlannedInstruction[];
      const batchId = id('bat');
      const total = plan.reduce((t, p) => t + BigInt(p.amount), 0n).toString();
      const validation = [...e.checks, ...integrityChecks(calc, asset.id, plan)];
      const batch: SettlementBatch = { id: batchId, sessionId, orgId, calculationId: calc.id, asset: { id: asset.id, network: asset.network, kind: asset.kind, code: asset.code, ...(asset.issuer ? { issuer: asset.issuer } : {}) }, instructionCount: plan.length, totalAmount: total, instructionsHash: instructionsHash(calc.id, asset.id, plan), algorithm: ALGORITHM, validation, preparedBy: u.userId, preparedAt: this.#clock.now().toISOString() };
      const instructions: SettlementInstruction[] = plan.map((p) => ({ id: instructionId(calc.id, p), batchId, sessionId, calculationId: calc.id, seq: p.seq, payer: p.payer, payee: p.payee, assetId: asset.id, amount: p.amount }));
      try { this.#s.putBatch(batch, instructions); } catch (err) { if (/UNIQUE/i.test((err as Error).message)) throw new RegistryError('EXISTS', 'a batch has already been prepared from this calculation'); throw err; }
      this.#log(orgId, u, 'settlement.batch-prepared', sessionId, 'batch ' + this.#short(batchId.slice(4)) + ' from calculation ' + this.#short(calc.id) + ': ' + plan.length + ' instruction(s), ' + asset.code + ', total ' + total);
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
    return [...source, { key: 'count', label: 'The stored count and total match the instructions', ok: countOk, detail: countOk ? b.instructionCount + ' instruction(s), total ' + b.totalAmount : 'the stored summary differs from the instructions' }, ...integrityChecks(calc, b.asset.id, planned, b.instructionsHash)];
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

  activity(u: ActingUser, orgId: string): ActivityRecord[] { this.#need(orgId, u); return this.#s.activityOfOrg(orgId); }
}
