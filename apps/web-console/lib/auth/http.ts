// HTTP surface of authentication: POST register, login, logout and GET me under /api/auth. The cookie holds an opaque random token only.
// Cookie: HttpOnly, SameSite=Strict, Path=/, Secure in production, Max-Age matching the server-side expiry (the server decides, not the cookie).
import { REQUEST_HEADER, json, readBody } from '../registry/http.ts';
import { CLIENT_IP_HEADER, isHosted } from '../server/config.ts';
import { log } from '../server/log.ts';
import { RegistryError } from '../registry/types.ts';
import type { ActingUser } from '../registry/identity.ts';
import type { AuthService } from './service.ts';

export const SESSION_COOKIE = 'tobin_session';

/**
 * The client address, only when it can be trusted: in hosted mode the console accepts requests only from the web service (shared proxy secret checked in
 * proxy.ts), and that service forwards the address seen by the one trusted proxy hop. In local mode, or when no address was forwarded, there is none: the
 * per-user and per-key limits still apply, and a shared "unknown" bucket is never used (it would let one client lock out everyone).
 */
export function trustedClientIp(request: Request): string | null {
  if (!isHosted(process.env)) return null;
  const v = request.headers.get(CLIENT_IP_HEADER);
  return v && /^[0-9a-f:.]{2,45}$/i.test(v) ? v.toLowerCase() : null;
}

/** Per-address limits (the existing per-user and per-key limits stay). 'attempts' count every call; 'failures' count only calls that failed. */
export const IP_LIMITS = {
  register: { max: 10, windowMs: 60 * 60 * 1000, count: 'attempts' },
  login: { max: 20, windowMs: 15 * 60 * 1000, count: 'failures' },
  'wallet-challenge': { max: 30, windowMs: 10 * 60 * 1000, count: 'attempts' },
  'wallet-verify': { max: 20, windowMs: 10 * 60 * 1000, count: 'failures' },
} as const;
type IpLimitName = keyof typeof IP_LIMITS;
const ipKey = (name: IpLimitName, ip: string) => 'ip:' + name + ':' + ip;

/** Refuses with RATE_LIMITED when this address is over its limit; for 'attempts' limits it also records this call. */
function ipGate(deps: AuthDeps, ip: string | null, name: IpLimitName): void {
  if (!ip) return;
  const lim = IP_LIMITS[name];
  if (deps.auth.rateCount(ipKey(name, ip), lim.windowMs) >= lim.max) throw new RegistryError('RATE_LIMITED', 'too many requests from this address; try again later');
  if (lim.count === 'attempts') deps.auth.rateFail(ipKey(name, ip));
}
/** Records a failed call against the address for the 'failures' limits. */
function ipFailed(deps: AuthDeps, ip: string | null, name: IpLimitName): void {
  if (ip && IP_LIMITS[name].count === 'failures') deps.auth.rateFail(ipKey(name, ip));
}

/** At most this many password hashes (64 MiB each) are computed at once; more are refused instead of exhausting memory. */
export const MAX_CONCURRENT_HASHES = 4;
let hashesRunning = 0;
async function withHashSlot<T>(f: () => Promise<T>): Promise<T> {
  if (hashesRunning >= MAX_CONCURRENT_HASHES) throw new RegistryError('RATE_LIMITED', 'the service is busy; try again shortly');
  hashesRunning++;
  try { return await f(); } finally { hashesRunning--; }
}

/** The domain a wallet challenge is bound to: the configured public application origin in hosted mode (never the internal Host), the request Host locally. */
export function challengeDomain(request: Request): string | null {
  if (!isHosted(process.env)) return request.headers.get('host');
  try { return new URL(process.env['TOBIN_PUBLIC_ORIGIN'] ?? '').host; } catch { return null; }
}

export interface AuthDeps { auth: AuthService; secureCookies: boolean }

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

const cookieHeader = (deps: AuthDeps, value: string, maxAgeSeconds: number) =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${deps.secureCookies ? '; Secure' : ''}`;

/** Resolves the acting user for the registry API: the session cookie only. */
export function authenticateRequest(auth: AuthService) {
  return (request: Request): ActingUser | null => auth.resolve(readCookie(request, SESSION_COOKIE));
}

const STATUS: Record<string, number> = { INVALID: 400, INVALID_CREDENTIALS: 401, AUTH_FAILED: 401, UNAUTHENTICATED: 401, RATE_LIMITED: 429, REGISTRATION_FAILED: 409, WALLET_UNAVAILABLE: 409, LAST_METHOD: 409, INVALID_STATE: 409, NOT_FOUND: 404 };
const maxAge = (expiresAt: string) => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));

export async function handleAuth(request: Request, deps: AuthDeps): Promise<Response> {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/auth\/?/, '').replace(/\/$/, '');
    const m = request.method;
    if (path === 'me' && m === 'GET') {
      const u = deps.auth.resolve(readCookie(request, SESSION_COOKIE));
      if (!u) return json(401, { error: 'UNAUTHENTICATED', message: 'Not signed in.' });
      // 'user' keeps the earlier shape (id, email, displayName); the rest is the account view used by onboarding and the workspace switcher
      const v = deps.auth.accountView(u.userId);
      return json(200, { user: { id: u.userId, ...(u.email !== undefined ? { email: u.email } : {}), displayName: u.displayName, authMethod: u.authMethod ?? 'password' }, ...(v ? { wallets: v.wallets, onboarding: v.onboarding, organizations: v.organizations, lastOrgId: v.lastOrgId } : {}) });
    }
    if (path === 'audit' && m === 'GET') {
      const u = deps.auth.resolve(readCookie(request, SESSION_COOKIE));
      return u ? json(200, { events: deps.auth.auditOf(u.userId) }) : json(401, { error: 'UNAUTHENTICATED', message: 'Not signed in.' });
    }
    if (m !== 'POST') return json(404, { error: 'NOT_FOUND', message: 'not found' });
    if (request.headers.get(REQUEST_HEADER) !== '1') return json(403, { error: 'FORBIDDEN', message: 'missing request header' });
    if (path === 'logout') {
      deps.auth.logout(readCookie(request, SESSION_COOKIE));
      return json(200, { ok: true }, { 'set-cookie': cookieHeader(deps, '', 0) });
    }
    // ---- wallet sign-in (public: it is how a session begins) ----
    if (path === 'wallet/challenge') {
      ipGate(deps, trustedClientIp(request), 'wallet-challenge');
      const b = await readBody(request);
      const c = deps.auth.issueSignInChallenge({ publicKey: b['publicKey'], network: b['network'], domain: challengeDomain(request) });
      return json(201, { challenge: c, note: 'Sign this exact message with your wallet. It signs no transaction and grants no role.' });
    }
    if (path === 'wallet/verify') {
      const ip = trustedClientIp(request);
      ipGate(deps, ip, 'wallet-verify');
      const b = await readBody(request);
      const s = (() => { try { return deps.auth.verifySignIn({ challengeId: b['challengeId'], signature: b['signature'], scheme: b['scheme'], ...(readCookie(request, SESSION_COOKIE) ? { replaceToken: readCookie(request, SESSION_COOKIE) as string } : {}) }); } catch (e) { if (e instanceof RegistryError && e.code !== 'RATE_LIMITED') ipFailed(deps, ip, 'wallet-verify'); throw e; } })();
      const v = deps.auth.accountView(s.user.userId);
      return json(200, { user: { id: s.user.userId, displayName: s.user.displayName, authMethod: 'wallet' }, isNew: s.isNew, ...(v ? { onboarding: v.onboarding, organizations: v.organizations, lastOrgId: v.lastOrgId } : {}) }, { 'set-cookie': cookieHeader(deps, s.token, maxAge(s.expiresAt)) });
    }

    // ---- everything below needs a live session ----
    const needUser = (): ActingUser => { const u = deps.auth.resolve(readCookie(request, SESSION_COOKIE)); if (!u) throw new RegistryError('UNAUTHENTICATED', 'Not signed in.'); return u; };
    if (path === 'wallet/link/challenge') {
      const u = needUser(); const b = await readBody(request);
      return json(201, { challenge: deps.auth.issueLinkChallenge(u.userId, { publicKey: b['publicKey'], network: b['network'], domain: challengeDomain(request) }) });
    }
    if (path === 'wallet/link/verify') {
      const u = needUser(); const b = await readBody(request);
      return json(201, { wallet: deps.auth.verifyLink(u.userId, { challengeId: b['challengeId'], signature: b['signature'], scheme: b['scheme'] }), note: 'The wallet is now verified for your account. It grants no role or permission.' });
    }
    if (path === 'wallet/remove') {
      const u = needUser(); const b = await readBody(request);
      deps.auth.removeWallet(u.userId, b['walletId']); return json(200, { ok: true });
    }
    if (path === 'profile') { const u = needUser(); const b = await readBody(request); return json(200, { displayName: deps.auth.setDisplayName(u.userId, b['displayName']) }); }
    if (path === 'workspace') { const u = needUser(); const b = await readBody(request); deps.auth.setWorkspace(u.userId, b['orgId']); return json(200, { ok: true }); }
    if (path === 'renew') {
      const t = deps.auth.renew(readCookie(request, SESSION_COOKIE));
      return t ? json(200, { ok: true }, { 'set-cookie': cookieHeader(deps, t.token, maxAge(t.expiresAt)) }) : json(401, { error: 'UNAUTHENTICATED', message: 'Not signed in.' });
    }
    if (path === 'logout-all') {
      const u = needUser(); const n = deps.auth.revokeSessions(u.userId);
      return json(200, { ok: true, revoked: n }, { 'set-cookie': cookieHeader(deps, '', 0) });
    }

    if (path === 'register' || path === 'login') {
      const ip = trustedClientIp(request);
      ipGate(deps, ip, path === 'register' ? 'register' : 'login');
      const b = await readBody(request);
      let reg: unknown = null;
      let s: Awaited<ReturnType<AuthService['login']>>;
      try {
        reg = path === 'register' ? await withHashSlot(() => deps.auth.register({ email: b['email'], password: b['password'], displayName: b['displayName'] })) : null;
        s = await withHashSlot(() => deps.auth.login(b['email'], b['password']));
      } catch (e) {
        if (path === 'login' && e instanceof RegistryError && e.code !== 'RATE_LIMITED') ipFailed(deps, ip, 'login');
        throw e;
      }
      return json(reg ? 201 : 200, { user: { id: s.user.userId, email: s.user.email, displayName: s.user.displayName } }, { 'set-cookie': cookieHeader(deps, s.token, maxAge(s.expiresAt)) });
    }
    return json(404, { error: 'NOT_FOUND', message: 'not found' });
  } catch (e) {
    if (e instanceof RegistryError) return json(STATUS[e.code] ?? 400, { error: e.code, message: e.message });
    if (e instanceof Error && e.name === 'BackendUnavailable') return json(503, { error: 'BACKEND_UNAVAILABLE', message: 'The service is not available.' });
    log('error', 'http.internal', { error: e });
    return json(500, { error: 'INTERNAL', message: 'internal error' });
  }
}
