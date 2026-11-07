// Authentication for the institutional application: email and password accounts, server-side sessions stored in the database, rate-limited sign-in.
// The browser holds only an opaque random token in an HttpOnly cookie; the database holds only its SHA-256, so a database read does not yield a usable
// session. Identity is never taken from a client-supplied user id or header. An external identity provider (OIDC or SAML) can replace this behind
// the same ActingUser result; none is configured, and none is claimed (see BACKEND_PERSISTENCE_ARCHITECTURE.md).
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Database } from '../db/database.ts';
import type { ActingUser } from '../registry/identity.ts';
import { RegistryError } from '../registry/types.ts';
import { isStellarAccount, verifyChallengeSignature } from '../registry/wallet-proof.ts';
import { AUTH_CHALLENGE_TTL_MS, AUTH_NETWORK, authChallengeMessage } from './wallet-challenge.ts';
import type { ChallengePurpose } from './wallet-challenge.ts';

export interface AuthOptions {
  now?: () => Date;
  /** absolute session lifetime */
  sessionTtlMs?: number;
  /** scrypt cost exponent (N = 2^cost). Production default 16 (64 MiB). Tests may lower it; the cost is stored in each hash. */
  scryptCost?: number;
  /** a wallet session with no activity for this long is no longer valid (default 2 hours) */
  idleTtlMs?: number;
  /** a session can be renewed (rotated) but never lives longer than this after it was first created (default 24 hours) */
  absoluteTtlMs?: number;
}

export interface UserSummary { id: string; displayName: string; email: string; wallet?: string; authMethod?: 'password' | 'wallet' }
export interface WalletRecord { id: string; publicKey: string; network: string; verifiedAt: string }
export interface OrgBrief { id: string; name: string; role: 'admin' | 'member' }
export interface AccountView {
  user: { id: string; displayName: string; authMethod: 'password' | 'wallet'; email?: string };
  wallets: WalletRecord[];
  onboarding: { step: 'profile' | 'organization' | 'done'; profileDone: boolean };
  organizations: OrgBrief[];
  /** the last workspace, only if the user is STILL an active member of it */
  lastOrgId: string | null;
}

const SESSION_TTL_MS = 8 * 3600 * 1000;
const IDLE_TTL_MS = 2 * 3600 * 1000;
const ABSOLUTE_TTL_MS = 24 * 3600 * 1000;
const LAST_SEEN_THROTTLE_MS = 60 * 1000;
const CHALLENGE_PER_KEY = { max: 10, windowMs: 10 * 60 * 1000 };
const CHALLENGE_GLOBAL = { max: 300, windowMs: 10 * 60 * 1000 };
const VERIFY_FAILURES = { max: 10, windowMs: 15 * 60 * 1000 };
const CHALLENGE_BURN_AFTER = 5;
const MAX_WALLETS = 5;
const RESERVED_EMAIL_DOMAIN = '.invalid';
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
  readonly #idle: number;
  readonly #absolute: number;
  #dummy: Promise<string> | undefined;

  constructor(db: Database, opts: AuthOptions = {}) {
    this.#db = db;
    this.#now = opts.now ?? (() => new Date());
    this.#ttl = opts.sessionTtlMs ?? SESSION_TTL_MS;
    this.#cost = opts.scryptCost ?? 16;
    this.#idle = opts.idleTtlMs ?? IDLE_TTL_MS;
    this.#absolute = opts.absoluteTtlMs ?? ABSOLUTE_TTL_MS;
  }

  // ---- accounts ----
  async register(input: { email: unknown; password: unknown; displayName: unknown }): Promise<ActingUser & { displayName: string }> {
    const email = normalizeEmail(input.email);
    if (email.endsWith(RESERVED_EMAIL_DOMAIN)) throw new RegistryError('INVALID', 'a valid email address is required');
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
    const row = this.#db.raw.prepare("SELECT id, display_name, password_hash, disabled FROM users WHERE email = ? AND auth_method = 'password'").get(email);
    const dummy = await (this.#dummy ??= hashPassword('not-a-real-password', this.#cost));
    const ok = typeof password === 'string' && password.length <= 128 && (await verifyPassword(password, row ? (row['password_hash'] as string) : dummy));
    if (!row || !ok || row['disabled'] === 1) {
      this.rateFail(key);
      throw new RegistryError('INVALID_CREDENTIALS', 'email or password is incorrect');
    }
    this.#db.raw.prepare('DELETE FROM rate_events WHERE key = ?').run(key);
    const { token, expiresAt } = this.#newSession(row['id'] as string, 'password', null, undefined);
    return { token, expiresAt, user: { userId: row['id'] as string, kind: 'verified', email, displayName: row['display_name'] as string } };
  }

  /** Creates a session with a fresh random token. When the caller presented a previous session token it is revoked in the same step (rotation: no session fixation). */
  #newSession(userId: string, method: 'password' | 'wallet', walletId: string | null, replaceToken: string | undefined, createdAtOverride?: string): { token: string; expiresAt: string } {
    const token = randomBytes(32).toString('base64url');
    const now = this.#now();
    const createdAt = createdAtOverride ?? now.toISOString();
    const cap = new Date(createdAt).getTime() + this.#absolute;
    const expiresAt = new Date(Math.min(now.getTime() + this.#ttl, method === 'wallet' || createdAtOverride ? cap : Infinity)).toISOString();
    this.#db.raw.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at, last_seen_at, auth_method, wallet_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(sha256(token), userId, createdAt, expiresAt, now.toISOString(), method, walletId);
    if (replaceToken) this.logout(replaceToken);
    return { token, expiresAt };
  }

  logout(token: string | undefined): void {
    if (!token) return;
    this.#db.raw.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(this.#now().toISOString(), sha256(token));
  }

  /** The only way a request becomes an acting user: a live, unrevoked, unexpired server-side session of an enabled account. */
  resolve(token: string | undefined): (ActingUser & { displayName: string }) | null {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const row = this.#db.raw.prepare(
      'SELECT u.id, u.email, u.display_name, u.disabled, u.auth_method AS umethod, s.expires_at, s.revoked_at, s.last_seen_at, s.auth_method AS smethod, s.wallet_id FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
    ).get(sha256(token));
    if (!row || row['revoked_at'] !== null || row['disabled'] === 1) return null;
    const now = this.#now().getTime();
    if (new Date(row['expires_at'] as string).getTime() <= now) return null;
    const wallet = row['smethod'] === 'wallet';
    if (wallet) {
      const last = row['last_seen_at'] ? new Date(row['last_seen_at'] as string).getTime() : 0;
      if (now - last > this.#idle) return null; // idle timeout
      const w = this.#db.raw.prepare("SELECT 1 AS ok FROM user_wallets WHERE id = ? AND status = 'active'").get(row['wallet_id'] as string);
      if (!w) return null; // the wallet this session was created with is no longer active
      if (now - last > LAST_SEEN_THROTTLE_MS) this.#db.raw.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?').run(this.#now().toISOString(), sha256(token));
    }
    const wallets = this.#activeWallets(row['id'] as string).map((x) => x.publicKey);
    const walletOnly = row['umethod'] === 'wallet';
    return { userId: row['id'] as string, kind: 'verified', ...(walletOnly ? {} : { email: row['email'] as string }), displayName: row['display_name'] as string, wallets, authMethod: row['smethod'] as 'password' | 'wallet' };
  }

  summaries(ids: readonly string[]): Map<string, UserSummary> {
    const out = new Map<string, UserSummary>();
    const q = this.#db.raw.prepare('SELECT id, email, display_name, auth_method FROM users WHERE id = ?');
    for (const id of new Set(ids)) {
      const r = q.get(id);
      if (!r) continue;
      const walletOnly = r['auth_method'] === 'wallet';
      const w = this.#activeWallets(id)[0];
      out.set(id, { id, email: walletOnly ? '' : (r['email'] as string), displayName: r['display_name'] as string, authMethod: r['auth_method'] as 'password' | 'wallet', ...(w ? { wallet: w.publicKey } : {}) });
    }
    return out;
  }

  // ================= wallet-first authentication =================
  // Wallet sign-in proves control of a key. It creates or finds an internal user; it never creates a role, a membership or any authority.

  #audit(userId: string | null, kind: string, subject: string, detail: string): void {
    this.#db.raw.prepare('INSERT INTO auth_audit (at, user_id, kind, subject, detail) VALUES (?, ?, ?, ?, ?)').run(this.#now().toISOString(), userId, kind, subject, detail);
  }
  #activeWallets(userId: string): WalletRecord[] {
    return (this.#db.raw.prepare("SELECT id, public_key, network, verified_at FROM user_wallets WHERE user_id = ? AND status = 'active' ORDER BY created_at, id").all(userId) as Record<string, unknown>[])
      .map((r) => ({ id: r['id'] as string, publicKey: r['public_key'] as string, network: r['network'] as string, verifiedAt: r['verified_at'] as string }));
  }

  /** Issues a one-time challenge. The text is returned for display and signing; verification rebuilds it from the stored row. */
  #issueChallenge(purpose: ChallengePurpose, publicKey: unknown, network: unknown, domain: unknown, userId?: string): { id: string; message: string; expiresAt: string; network: string; publicKey: string } {
    if (!isStellarAccount(publicKey)) throw new RegistryError('INVALID', 'not a valid Stellar account address');
    if (network !== undefined && network !== AUTH_NETWORK) throw new RegistryError('INVALID', 'only Stellar Testnet is enabled');
    if (typeof domain !== 'string' || domain.length < 1 || domain.length > 100 || /[\s<>]/.test(domain)) throw new RegistryError('INVALID', 'unknown site');
    if (this.rateCount('chal:' + publicKey, CHALLENGE_PER_KEY.windowMs) >= CHALLENGE_PER_KEY.max || this.rateCount('chal:*', CHALLENGE_GLOBAL.windowMs) >= CHALLENGE_GLOBAL.max) throw new RegistryError('RATE_LIMITED', 'too many sign-in requests; try again later');
    this.rateFail('chal:' + publicKey); this.rateFail('chal:*');
    const now = this.#now();
    // safe cleanup: challenges that expired more than a day ago can no longer matter
    this.#db.raw.prepare('DELETE FROM auth_challenges WHERE expires_at < ?').run(new Date(now.getTime() - 24 * 3600 * 1000).toISOString());
    const id = randomBytes(16).toString('hex'); const nonce = randomBytes(16).toString('hex');
    const issuedAt = now.toISOString(); const expiresAt = new Date(now.getTime() + AUTH_CHALLENGE_TTL_MS).toISOString();
    this.#db.raw.prepare('INSERT INTO auth_challenges (id, purpose, network, public_key, user_id, domain, nonce, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, purpose, AUTH_NETWORK, publicKey, userId ?? null, domain, nonce, issuedAt, expiresAt);
    const message = authChallengeMessage({ purpose, domain, network: AUTH_NETWORK, publicKey, ...(userId ? { userId } : {}), nonce, issuedAt, expiresAt });
    return { id, message, expiresAt, network: AUTH_NETWORK, publicKey };
  }
  issueSignInChallenge(input: { publicKey: unknown; network?: unknown; domain: unknown }) { return this.#issueChallenge('sign-in', input.publicKey, input.network, input.domain); }

  /**
   * Checks a challenge answer and consumes the challenge in ONE guarded statement. Returns the challenge row on success. Every failure is the same generic AUTH_FAILED so a caller learns
   * nothing about which part was wrong. Failures are counted per key (rate limit) and per challenge (a challenge is burned after a few wrong answers).
   */
  #consume(purpose: ChallengePurpose, challengeId: unknown, signature: unknown, scheme: unknown, userId?: string): { publicKey: string; network: string } {
    const fail = (): never => { throw new RegistryError('AUTH_FAILED', purpose === 'sign-in' ? 'sign-in could not be completed' : 'the wallet could not be added'); };
    if (typeof challengeId !== 'string' || !/^[0-9a-f]{32}$/.test(challengeId) || typeof signature !== 'string' || scheme !== 'sep-53') return fail();
    const row = this.#db.raw.prepare('SELECT id, purpose, network, public_key, user_id, domain, nonce, issued_at, expires_at, consumed_at, failures FROM auth_challenges WHERE id = ?').get(challengeId);
    if (!row) return fail();
    const key = row['public_key'] as string;
    if (this.rateCount('wverify:' + key, VERIFY_FAILURES.windowMs) >= VERIFY_FAILURES.max) throw new RegistryError('RATE_LIMITED', 'too many failed attempts; try again later');
    const now = this.#now();
    const bad = (): never => { this.rateFail('wverify:' + key); this.#db.raw.prepare('UPDATE auth_challenges SET failures = failures + 1 WHERE id = ?').run(challengeId); return fail(); };
    if (row['purpose'] !== purpose || row['consumed_at'] !== null || Number(row['failures']) >= CHALLENGE_BURN_AFTER || new Date(row['expires_at'] as string).getTime() <= now.getTime()) return fail();
    if (purpose === 'link-wallet' && row['user_id'] !== userId) return fail(); // a challenge issued to one user cannot be answered by another
    const message = authChallengeMessage({ purpose, domain: row['domain'] as string, network: row['network'] as string, publicKey: key, ...(row['user_id'] ? { userId: row['user_id'] as string } : {}), nonce: row['nonce'] as string, issuedAt: row['issued_at'] as string, expiresAt: row['expires_at'] as string });
    if (!verifyChallengeSignature(key, message, signature, 'sep-53')) return bad();
    const res = this.#db.raw.prepare('UPDATE auth_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND expires_at > ?').run(now.toISOString(), challengeId, now.toISOString());
    if (Number(res.changes) !== 1) return fail(); // replay or a concurrent answer
    return { publicKey: key, network: row['network'] as string };
  }

  /** The whole sign-in. A failure inside the transaction that must be remembered (a wrong signature) is committed by returning, not throwing; see below. */
  verifySignIn(input: { challengeId: unknown; signature: unknown; scheme: unknown; replaceToken?: string }): { token: string; expiresAt: string; isNew: boolean; user: ActingUser & { displayName: string } } {
    // 1. check and consume (failure bookkeeping is committed even though the call then throws)
    let proof: { publicKey: string; network: string };
    this.#db.raw.exec('BEGIN IMMEDIATE');
    try {
      try { proof = this.#consume('sign-in', input.challengeId, input.signature, input.scheme); }
      catch (e) { this.#db.raw.exec('COMMIT'); throw e; }
      // 2. resolve or create the internal user, then the session, atomically with the consumption
      const existing = this.#db.raw.prepare("SELECT w.id AS wid, u.id, u.display_name, u.disabled, u.auth_method FROM user_wallets w JOIN users u ON u.id = w.user_id WHERE w.network = ? AND w.public_key = ? AND w.status = 'active'").get(proof.network, proof.publicKey);
      const now = this.#now().toISOString();
      let userId: string; let walletId: string; let displayName: string; let isNew = false;
      if (existing) {
        if (existing['disabled'] === 1) throw new RegistryError('AUTH_FAILED', 'sign-in could not be completed');
        userId = existing['id'] as string; walletId = existing['wid'] as string; displayName = existing['display_name'] as string;
      } else {
        isNew = true; userId = 'usr_' + randomBytes(9).toString('hex'); walletId = 'wal_' + randomBytes(9).toString('hex');
        displayName = 'Wallet ' + proof.publicKey.slice(0, 4) + '…' + proof.publicKey.slice(-4);
        const placeholder = 'wallet.' + userId + '@wallet.tobin' + RESERVED_EMAIL_DOMAIN;
        this.#db.raw.prepare("INSERT INTO users (id, email, display_name, password_hash, created_at, auth_method, updated_at) VALUES (?, ?, ?, 'wallet-only', ?, 'wallet', ?)").run(userId, placeholder, displayName, now, now);
        this.#db.raw.prepare("INSERT INTO user_wallets (id, user_id, network, public_key, status, verified_at, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)").run(walletId, userId, proof.network, proof.publicKey, now, now);
        this.#db.raw.prepare('INSERT INTO onboarding (user_id, profile_done, updated_at) VALUES (?, 0, ?)').run(userId, now);
        this.#audit(userId, 'user.created', userId, 'wallet sign-in, first use of the wallet ' + proof.publicKey);
      }
      const s = this.#newSession(userId, 'wallet', walletId, input.replaceToken);
      this.#audit(userId, 'session.created', userId, 'wallet sign-in');
      this.#db.raw.exec('COMMIT');
      return { token: s.token, expiresAt: s.expiresAt, isNew, user: { userId, kind: 'verified', displayName, wallets: this.#activeWallets(userId).map((w) => w.publicKey), authMethod: 'wallet' } };
    } catch (e) {
      try { this.#db.raw.exec('ROLLBACK'); } catch { /* already committed or rolled back */ }
      throw e;
    }
  }

  // ---- wallets of an existing user (adding needs a fresh proof of the NEW key; nothing is ever merged) ----
  wallets(userId: string): WalletRecord[] { return this.#activeWallets(userId); }
  issueLinkChallenge(userId: string, input: { publicKey: unknown; network?: unknown; domain: unknown }) {
    if (this.#activeWallets(userId).length >= MAX_WALLETS) throw new RegistryError('INVALID_STATE', 'a user can have at most ' + MAX_WALLETS + ' wallets');
    if (typeof input.publicKey === 'string' && this.#db.raw.prepare("SELECT 1 AS x FROM user_wallets WHERE network = ? AND public_key = ? AND status = 'active'").get(AUTH_NETWORK, input.publicKey)) throw new RegistryError('WALLET_UNAVAILABLE', 'this wallet cannot be associated with your account');
    return this.#issueChallenge('link-wallet', input.publicKey, input.network, input.domain, userId);
  }
  verifyLink(userId: string, input: { challengeId: unknown; signature: unknown; scheme: unknown }): WalletRecord {
    this.#db.raw.exec('BEGIN IMMEDIATE');
    try {
      let proof: { publicKey: string; network: string };
      try { proof = this.#consume('link-wallet', input.challengeId, input.signature, input.scheme, userId); }
      catch (e) { this.#db.raw.exec('COMMIT'); throw e; }
      if (this.#activeWallets(userId).length >= MAX_WALLETS) throw new RegistryError('INVALID_STATE', 'a user can have at most ' + MAX_WALLETS + ' wallets');
      // re-checked here: another user may have verified the same key since the challenge was issued (the unique index is the last line of defence)
      if (this.#db.raw.prepare("SELECT 1 AS x FROM user_wallets WHERE network = ? AND public_key = ? AND status = 'active'").get(proof.network, proof.publicKey)) throw new RegistryError('WALLET_UNAVAILABLE', 'this wallet cannot be associated with your account');
      const now = this.#now().toISOString(); const id = 'wal_' + randomBytes(9).toString('hex');
      this.#db.raw.prepare("INSERT INTO user_wallets (id, user_id, network, public_key, status, verified_at, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)").run(id, userId, proof.network, proof.publicKey, now, now);
      this.#audit(userId, 'wallet.linked', id, proof.publicKey);
      this.#db.raw.exec('COMMIT');
      return { id, publicKey: proof.publicKey, network: proof.network, verifiedAt: now };
    } catch (e) {
      try { this.#db.raw.exec('ROLLBACK'); } catch { /* already committed */ }
      if (e instanceof Error && /UNIQUE constraint/.test(e.message)) throw new RegistryError('WALLET_UNAVAILABLE', 'this wallet cannot be associated with your account');
      throw e;
    }
  }
  /** Revokes (never deletes) a wallet. The only way into a wallet-only account may not be removed: there is no recovery path in this build, so locking oneself out is refused. */
  removeWallet(userId: string, walletId: unknown): void {
    this.#db.tx(() => {
      const u = this.#db.raw.prepare('SELECT auth_method FROM users WHERE id = ?').get(userId);
      const w = typeof walletId === 'string' ? this.#db.raw.prepare("SELECT id, public_key FROM user_wallets WHERE id = ? AND user_id = ? AND status = 'active'").get(walletId, userId) : undefined;
      if (!u || !w) throw new RegistryError('NOT_FOUND', 'wallet not found');
      if (u['auth_method'] === 'wallet' && this.#activeWallets(userId).length <= 1) throw new RegistryError('LAST_METHOD', 'this is your only way to sign in; add another wallet first');
      const now = this.#now().toISOString();
      this.#db.raw.prepare("UPDATE user_wallets SET status = 'revoked', revoked_at = ?, revoked_reason = 'removed by the user' WHERE id = ?").run(now, w['id'] as string);
      this.#db.raw.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE wallet_id = ? AND revoked_at IS NULL').run(now, w['id'] as string);
      this.#audit(userId, 'wallet.revoked', w['id'] as string, w['public_key'] as string);
    });
  }

  // ---- sessions ----
  /** Rotates the session token (a new random token, the old one revoked). The new session never outlives the original by more than the absolute limit. */
  renew(token: string | undefined): { token: string; expiresAt: string } | null {
    if (!this.resolve(token)) return null;
    const row = this.#db.raw.prepare('SELECT user_id, created_at, auth_method, wallet_id FROM auth_sessions WHERE token_hash = ?').get(sha256(token as string));
    if (!row) return null;
    if (new Date(row['created_at'] as string).getTime() + this.#absolute <= this.#now().getTime()) return null;
    return this.#db.tx(() => this.#newSession(row['user_id'] as string, row['auth_method'] as 'password' | 'wallet', (row['wallet_id'] as string | null) ?? null, token, row['created_at'] as string));
  }
  /** Revokes every session of the user (optionally keeping the current one). */
  revokeSessions(userId: string, exceptToken?: string): number {
    const now = this.#now().toISOString();
    const r = exceptToken
      ? this.#db.raw.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND token_hash <> ?').run(now, userId, sha256(exceptToken))
      : this.#db.raw.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, userId);
    this.#audit(userId, 'session.revoked-all', userId, String(r.changes) + ' session(s)');
    return Number(r.changes);
  }

  // ---- profile, onboarding progress and workspace (all preferences are re-checked against membership when used) ----
  setDisplayName(userId: string, input: unknown): string {
    const name = typeof input === 'string' ? input.trim() : '';
    if (name.length < 1 || name.length > 80 || /[\u0000-\u001f\u007f<>]/.test(name)) throw new RegistryError('INVALID', 'name must be 1 to 80 printable characters without < or >');
    this.#db.tx(() => {
      const now = this.#now().toISOString();
      this.#db.raw.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').run(name, now, userId);
      this.#db.raw.prepare('INSERT INTO onboarding (user_id, profile_done, updated_at) VALUES (?, 1, ?) ON CONFLICT(user_id) DO UPDATE SET profile_done = 1, updated_at = excluded.updated_at').run(userId, now);
      this.#audit(userId, 'profile.updated', userId, 'display name');
    });
    return name;
  }
  #orgsOf(userId: string): OrgBrief[] {
    return (this.#db.raw.prepare("SELECT o.id, o.name, m.role FROM memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = ? AND m.status = 'active' ORDER BY m.since, o.id").all(userId) as Record<string, unknown>[])
      .map((r) => ({ id: r['id'] as string, name: r['name'] as string, role: r['role'] as 'admin' | 'member' }));
  }
  accountView(userId: string): AccountView | null {
    const u = this.#db.raw.prepare('SELECT id, email, display_name, auth_method, disabled FROM users WHERE id = ?').get(userId);
    if (!u || u['disabled'] === 1) return null;
    const ob = this.#db.raw.prepare('SELECT profile_done, last_org_id FROM onboarding WHERE user_id = ?').get(userId);
    const method = u['auth_method'] as 'password' | 'wallet';
    const profileDone = ob ? Number(ob['profile_done']) === 1 : method === 'password'; // a password account chose its name at registration
    const organizations = this.#orgsOf(userId);
    const last = ob && ob['last_org_id'] ? (ob['last_org_id'] as string) : null;
    return {
      user: { id: userId, displayName: u['display_name'] as string, authMethod: method, ...(method === 'password' ? { email: u['email'] as string } : {}) },
      wallets: this.#activeWallets(userId),
      onboarding: { profileDone, step: !profileDone ? 'profile' : organizations.length === 0 ? 'organization' : 'done' },
      organizations,
      lastOrgId: last && organizations.some((o) => o.id === last) ? last : null,
    };
  }
  /** Remembers the last workspace. The membership is checked here, on the server; a client-supplied organization id is never trusted. */
  setWorkspace(userId: string, orgId: unknown): void {
    if (typeof orgId !== 'string' || !this.#orgsOf(userId).some((o) => o.id === orgId)) throw new RegistryError('NOT_FOUND', 'organization not found');
    const m = this.#db.raw.prepare('SELECT auth_method FROM users WHERE id = ?').get(userId);
    this.#db.raw.prepare('INSERT INTO onboarding (user_id, profile_done, last_org_id, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET last_org_id = excluded.last_org_id, updated_at = excluded.updated_at')
      .run(userId, m && m['auth_method'] === 'password' ? 1 : 0, orgId, this.#now().toISOString());
  }
  /** Authentication audit trail of a user (newest last). No signatures or tokens are ever recorded. */
  auditOf(userId: string): { at: string; kind: string; subject: string; detail: string }[] {
    return (this.#db.raw.prepare('SELECT at, kind, subject, detail FROM auth_audit WHERE user_id = ? ORDER BY seq').all(userId) as Record<string, unknown>[]).map((r) => ({ at: r['at'] as string, kind: r['kind'] as string, subject: r['subject'] as string, detail: r['detail'] as string }));
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
