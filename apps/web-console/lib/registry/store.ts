// Persistence interface for the registry. The database choice is an open owner decision; this in-memory implementation is NON-PRODUCTION (lost on
// restart) and exists only for isolated unit tests. The production store is SqliteRegistryStore (sqlite-store.ts). Reads return copies.
import type { ActivityRecord, CalculationRecord, Invitation, ObligationRecord, Membership, Organization, OrgWallet, SessionParticipant, SessionRecord } from './types.ts';

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
  transaction<T>(fn: () => T): T {
    const maps = [this.#orgs, this.#members, this.#wallets, this.#invites, this.#sessions, this.#participants, this.#obligations] as Map<string, unknown>[];
    const snap = maps.map((m) => new Map(m));
    const act = this.#activity.length; const calcs = this.#calcs.length;
    try { return fn(); } catch (e) {
      for (const [i, m] of maps.entries()) { m.clear(); for (const [k, v] of snap[i] as Map<string, unknown>) m.set(k, v); }
      this.#activity.length = act; this.#calcs.length = calcs; throw e;
    }
  }
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
