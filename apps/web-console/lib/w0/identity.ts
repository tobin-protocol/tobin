// Authentication foundation. No production identity provider has been selected (contract section 3 leaves it open), so W0 defines only the
// IdentityProvider abstraction plus a DEVELOPMENT provider. The development provider is unmistakable (kind 'DEVELOPMENT', surfaced in every
// session and in the UI) and is NOT production authentication: it has no credentials. It exists so RBAC can be exercised end to end locally.
import { isRole } from './rbac.ts';
import type { Principal, Role } from './types.ts';

export interface IdentityProvider {
  readonly kind: 'DEVELOPMENT' | 'PRODUCTION';
  /** Resolve a login request to a principal, or null. A production provider would verify real credentials/MFA here. */
  authenticate(request: unknown): Principal | null;
  listLoginChoices(): { subject: string; role: Role }[];
}

const DEV_USERS: readonly Principal[] = [
  { subject: 'dev-viewer', role: 'viewer' },
  { subject: 'dev-requester', role: 'requester' },
  { subject: 'dev-requester-2', role: 'requester' },
  { subject: 'dev-approver', role: 'approver' },
];

export class DevelopmentIdentityProvider implements IdentityProvider {
  readonly kind = 'DEVELOPMENT' as const;
  authenticate(request: unknown): Principal | null {
    if (typeof request !== 'object' || request === null) return null;
    const keys = Object.keys(request);
    if (keys.length !== 1 || keys[0] !== 'subject') return null;
    const subject = (request as { subject: unknown }).subject;
    const u = DEV_USERS.find((x) => x.subject === subject);
    return u && isRole(u.role) ? { ...u } : null;
  }
  listLoginChoices() { return DEV_USERS.map((u) => ({ ...u })); }
}

export interface Session { id: string; csrf: string; principal: Principal; expiresAt: number; idp: IdentityProvider['kind'] }

/** In-memory sessions: server-side state only; the cookie carries an opaque random id. Non-production. */
export class SessionStore {
  readonly #s = new Map<string, Session>();
  readonly #now: () => number;
  readonly #ttlMs: number;
  constructor(now: () => number, ttlMs: number = 30 * 60_000) { this.#now = now; this.#ttlMs = ttlMs; }
  create(principal: Principal, idp: IdentityProvider['kind']): Session {
    const s: Session = { id: randomToken(), csrf: randomToken(), principal: { ...principal }, expiresAt: this.#now() + this.#ttlMs, idp };
    this.#s.set(s.id, s);
    return s;
  }
  get(id: string | undefined): Session | null {
    if (!id) return null;
    const s = this.#s.get(id);
    if (!s) return null;
    if (s.expiresAt <= this.#now()) { this.#s.delete(id); return null; }
    return s;
  }
  destroy(id: string | undefined): void { if (id) this.#s.delete(id); }
}

function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
