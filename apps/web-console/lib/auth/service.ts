// Authentication for the institutional application: email and password accounts, server-side sessions stored in the database, rate-limited sign-in.
// The browser holds only an opaque random token in an HttpOnly cookie; the database holds only its SHA-256, so a database read does not yield a usable
// session. Identity is never taken from a client-supplied user id or header. An external identity provider (OIDC or SAML) can replace this behind
// the same ActingUser result; none is configured, and none is claimed (see BACKEND_PERSISTENCE_ARCHITECTURE.md).
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Database } from '../db/database.ts';
import type { ActingUser } from '../registry/identity.ts';
import { RegistryError } from '../registry/types.ts';

export interface AuthOptions {
  now?: () => Date;
  /** absolute session lifetime */
  sessionTtlMs?: number;
  /** scrypt cost exponent (N = 2^cost). Production default 16 (64 MiB). Tests may lower it; the cost is stored in each hash. */
  scryptCost?: number;
}

export interface UserSummary { id: string; displayName: string; email: string }

const SESSION_TTL_MS = 8 * 3600 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number, len: number): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, len, { N: n, r, p, maxmem: 256 * 1024 * 1024 }, (e, k) => (e ? reject(e) : resolve(k))));
}

export async function hashPassword(password: string, cost: number): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 2 ** cost, 8, 1, 32);
  return `scrypt$${cost}$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, cost, r, p, salt, key] = stored.split('$');
  if (alg !== 'scrypt' || !cost || !r || !p || !salt || !key) return false;
  const c = Number(cost);
  if (!Number.isInteger(c) || c < 4 || c > 17 || Number(r) !== 8 || Number(p) !== 1) return false; // bounded: a stored value cannot demand unbounded work
  const expected = Buffer.from(key, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), 2 ** c, 8, 1, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class AuthService {
  readonly #db: Database;
  readonly #now: () => Date;
  readonly #ttl: number;
  readonly #cost: number;
  #dummy: Promise<string> | undefined;

  constructor(db: Database, opts: AuthOptions = {}) {
    this.#db = db;
    this.#now = opts.now ?? (() => new Date());
    this.#ttl = opts.sessionTtlMs ?? SESSION_TTL_MS;
    this.#cost = opts.scryptCost ?? 16;
  }

  // ---- accounts ----
  async register(input: { email: unknown; password: unknown; displayName: unknown }): Promise<ActingUser & { displayName: string }> {
    const email = normalizeEmail(input.email);
    const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
    if (displayName.length < 1 || displayName.length > 80 || /[\u0000-\u001f\u007f<>]/.test(displayName)) throw new RegistryError('INVALID', 'name must be 1 to 80 printable characters without < or >');
    const password = input.password;
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new RegistryError('INVALID', 'password must be 12 to 128 characters');
    if (password.toLowerCase() === email) throw new RegistryError('INVALID', 'password must not equal the email');
    const hash = await hashPassword(password, this.#cost);
    const id = `usr_${randomBytes(9).toString('hex')}`;
    try {
      this.#db.raw.prepare('INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(id, email, displayName, hash, this.#now().toISOString());
    } catch {
      // Unique email. The same generic error is used so registration does not confirm whether an address is already in use.
      throw new RegistryError('REGISTRATION_FAILED', 'registration could not be completed');
    }
    return { userId: id, kind: 'verified', email, displayName };
  }

  /** Throws RATE_LIMITED after repeated failures for the same email; INVALID_CREDENTIALS otherwise. Unknown and wrong-password look the same. */
  async login(emailInput: unknown, password: unknown): Promise<{ token: string; expiresAt: string; user: ActingUser & { displayName: string } }> {
    let email: string;
    try { email = normalizeEmail(emailInput); } catch { throw new RegistryError('INVALID_CREDENTIALS', 'email or password is incorrect'); }
    const key = `login:${email}`;
    if (this.rateCount(key, LOGIN_WINDOW_MS) >= LOGIN_MAX_FAILURES) throw new RegistryError('RATE_LIMITED', 'too many failed sign-in attempts; try again later');
    const row = this.#db.raw.prepare('SELECT id, display_name, password_hash, disabled FROM users WHERE email = ?').get(email);
    const dummy = await (this.#dummy ??= hashPassword('not-a-real-password', this.#cost));
    const ok = typeof password === 'string' && password.length <= 128 && (await verifyPassword(password, row ? (row['password_hash'] as string) : dummy));
    if (!row || !ok || row['disabled'] === 1) {
      this.rateFail(key);
      throw new RegistryError('INVALID_CREDENTIALS', 'email or password is incorrect');
    }
    this.#db.raw.prepare('DELETE FROM rate_events WHERE key = ?').run(key);
    const token = randomBytes(32).toString('base64url');
    const now = this.#now();
    const expiresAt = new Date(now.getTime() + this.#ttl).toISOString();
    this.#db.raw.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(sha256(token), row['id'] as string, now.toISOString(), expiresAt);
    return { token, expiresAt, user: { userId: row['id'] as string, kind: 'verified', email, displayName: row['display_name'] as string } };
  }

  logout(token: string | undefined): void {
    if (!token) return;
    this.#db.raw.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(this.#now().toISOString(), sha256(token));
  }

  /** The only way a request becomes an acting user: a live, unrevoked, unexpired server-side session of an enabled account. */
  resolve(token: string | undefined): (ActingUser & { displayName: string }) | null {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const row = this.#db.raw.prepare(
      'SELECT u.id, u.email, u.display_name, u.disabled, s.expires_at, s.revoked_at FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
    ).get(sha256(token));
    if (!row || row['revoked_at'] !== null || row['disabled'] === 1) return null;
    if (new Date(row['expires_at'] as string).getTime() <= this.#now().getTime()) return null;
    return { userId: row['id'] as string, kind: 'verified', email: row['email'] as string, displayName: row['display_name'] as string };
  }

  summaries(ids: readonly string[]): Map<string, UserSummary> {
    const out = new Map<string, UserSummary>();
    const q = this.#db.raw.prepare('SELECT id, email, display_name FROM users WHERE id = ?');
    for (const id of new Set(ids)) {
      const r = q.get(id);
      if (r) out.set(id, { id, email: r['email'] as string, displayName: r['display_name'] as string });
    }
    return out;
  }

  // ---- rate limiting (failures only), persisted so it survives restarts and is shared by processes using the same database ----
  rateCount(key: string, windowMs: number): number {
    const since = this.#now().getTime() - windowMs;
    this.#db.raw.prepare('DELETE FROM rate_events WHERE at < ?').run(this.#now().getTime() - 24 * 3600 * 1000);
    return Number(this.#db.raw.prepare('SELECT count(*) AS n FROM rate_events WHERE key = ? AND at > ?').get(key, since)?.['n'] ?? 0);
  }
  rateFail(key: string): void { this.#db.raw.prepare('INSERT INTO rate_events (key, at) VALUES (?, ?)').run(key, this.#now().getTime()); }
}

export function normalizeEmail(v: unknown): string {
  if (typeof v !== 'string') throw new RegistryError('INVALID', 'email must be text');
  const e = v.trim().toLowerCase();
  if (e.length < 3 || e.length > 254 || !EMAIL.test(e)) throw new RegistryError('INVALID', 'a valid email address is required');
  return e;
}
