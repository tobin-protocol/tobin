// HTTP surface of authentication: POST register, login, logout and GET me under /api/auth. The cookie holds an opaque random token only.
// Cookie: HttpOnly, SameSite=Strict, Path=/, Secure in production, Max-Age matching the server-side expiry (the server decides, not the cookie).
import { REQUEST_HEADER, json, readBody } from '../registry/http.ts';
import { RegistryError } from '../registry/types.ts';
import type { ActingUser } from '../registry/identity.ts';
import type { AuthService } from './service.ts';

export const SESSION_COOKIE = 'tobin_session';

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
      const b = await readBody(request);
      const c = deps.auth.issueSignInChallenge({ publicKey: b['publicKey'], network: b['network'], domain: request.headers.get('host') });
      return json(201, { challenge: c, note: 'Sign this exact message with your wallet. It signs no transaction and grants no role.' });
    }
    if (path === 'wallet/verify') {
      const b = await readBody(request);
      const s = deps.auth.verifySignIn({ challengeId: b['challengeId'], signature: b['signature'], scheme: b['scheme'], ...(readCookie(request, SESSION_COOKIE) ? { replaceToken: readCookie(request, SESSION_COOKIE) as string } : {}) });
      const v = deps.auth.accountView(s.user.userId);
      return json(200, { user: { id: s.user.userId, displayName: s.user.displayName, authMethod: 'wallet' }, isNew: s.isNew, ...(v ? { onboarding: v.onboarding, organizations: v.organizations, lastOrgId: v.lastOrgId } : {}) }, { 'set-cookie': cookieHeader(deps, s.token, maxAge(s.expiresAt)) });
    }

    // ---- everything below needs a live session ----
    const needUser = (): ActingUser => { const u = deps.auth.resolve(readCookie(request, SESSION_COOKIE)); if (!u) throw new RegistryError('UNAUTHENTICATED', 'Not signed in.'); return u; };
    if (path === 'wallet/link/challenge') {
      const u = needUser(); const b = await readBody(request);
      return json(201, { challenge: deps.auth.issueLinkChallenge(u.userId, { publicKey: b['publicKey'], network: b['network'], domain: request.headers.get('host') }) });
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
      const b = await readBody(request);
      const reg = path === 'register' ? await deps.auth.register({ email: b['email'], password: b['password'], displayName: b['displayName'] }) : null;
      const s = await deps.auth.login(b['email'], b['password']);
      return json(reg ? 201 : 200, { user: { id: s.user.userId, email: s.user.email, displayName: s.user.displayName } }, { 'set-cookie': cookieHeader(deps, s.token, maxAge(s.expiresAt)) });
    }
    return json(404, { error: 'NOT_FOUND', message: 'not found' });
  } catch (e) {
    if (e instanceof RegistryError) return json(STATUS[e.code] ?? 400, { error: e.code, message: e.message });
    if (e instanceof Error && e.name === 'BackendUnavailable') return json(503, { error: 'BACKEND_UNAVAILABLE', message: 'The service is not available.' });
    return json(500, { error: 'INTERNAL', message: 'internal error' });
  }
}
