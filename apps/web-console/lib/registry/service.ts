// Registry rules: organizations, memberships, invitations, wallet links, session records with provenance, activity. Server-side authorization on every call.
// Nothing here talks to a network or a wallet. A role here never grants on-chain authority.
import { createHash, randomBytes } from 'node:crypto';
import type { ActingUser } from './identity.ts';
import type { RegistryStore } from './store.ts';
import { RegistryError } from './types.ts';
import type { ActivityRecord, CalculationRecord, ChainObservation, Invitation, Membership, ObligationRecord, Organization, OrgWallet, Role, SessionParticipant, SessionRecord, WorkflowState } from './types.ts';
import { canonicalInput, currencyOf, inputHash, parseAsset, parseObligationAmount, readinessChecks, runNetting, TRANSITIONS } from './clearing.ts';
import type { Currency, ReadinessCheck } from './clearing.ts';

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
      this.#log(orgId, u, 'session.participant-removed', sess.sessionId, `${userId} (membership ended)`);
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
      this.#log(orgId, u, 'session.participant-added', sessionId, existing ? `${input.userId} (re-added)` : input.userId);
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
      this.#log(orgId, u, 'session.participant-removed', sessionId, userId);
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
      this.#log(orgId, u, 'obligation.created', sessionId, `obligation ${this.#short(o.id)}: ${debtor} owes ${creditor} ${amount} ${asset}${reference ? ` (${reference})` : ''}`);
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
      this.#log(orgId, u, 'obligation.updated', sessionId, `obligation ${this.#short(o.id)} revision ${next.revision}: ${changes.join('; ')}`);
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
      this.#log(orgId, u, 'obligation.voided', sessionId, `obligation ${this.#short(o.id)} voided (was ${o.debtor} owes ${o.creditor} ${o.amount} ${o.asset})${why ? `: ${why}` : ''}`);
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
        this.#log(orgId, u, 'netting.calculated', sessionId, `calculation ${this.#short(c.id)}: ${input.obligations.length} obligation(s), ${positions.length} participant(s), ${asset}, gross ${gross}`);
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

  activity(u: ActingUser, orgId: string): ActivityRecord[] { this.#need(orgId, u); return this.#s.activityOfOrg(orgId); }
}
