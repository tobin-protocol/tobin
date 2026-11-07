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

const STATUS: Record<string, number> = { INVALID: 400, INVALID_CREDENTIALS: 401, RATE_LIMITED: 429, REGISTRATION_FAILED: 409 };

export async function handleAuth(request: Request, deps: AuthDeps): Promise<Response> {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/auth\/?/, '').replace(/\/$/, '');
    const m = request.method;
    if (path === 'me' && m === 'GET') {
      const u = deps.auth.resolve(readCookie(request, SESSION_COOKIE));
      return u ? json(200, { user: { id: u.userId, email: u.email, displayName: u.displayName } }) : json(401, { error: 'UNAUTHENTICATED', message: 'Not signed in.' });
    }
    if (m !== 'POST') return json(404, { error: 'NOT_FOUND', message: 'not found' });
    if (request.headers.get(REQUEST_HEADER) !== '1') return json(403, { error: 'FORBIDDEN', message: 'missing request header' });
    if (path === 'logout') {
      deps.auth.logout(readCookie(request, SESSION_COOKIE));
      return json(200, { ok: true }, { 'set-cookie': cookieHeader(deps, '', 0) });
    }
    if (path === 'register' || path === 'login') {
      const b = await readBody(request);
      const reg = path === 'register' ? await deps.auth.register({ email: b['email'], password: b['password'], displayName: b['displayName'] }) : null;
      const s = await deps.auth.login(b['email'], b['password']);
      const maxAge = Math.max(0, Math.floor((new Date(s.expiresAt).getTime() - Date.now()) / 1000));
      return json(reg ? 201 : 200, { user: { id: s.user.userId, email: s.user.email, displayName: s.user.displayName } }, { 'set-cookie': cookieHeader(deps, s.token, maxAge) });
    }
    return json(404, { error: 'NOT_FOUND', message: 'not found' });
  } catch (e) {
    if (e instanceof RegistryError) return json(STATUS[e.code] ?? 400, { error: e.code, message: e.message });
    if (e instanceof Error && e.name === 'BackendUnavailable') return json(503, { error: 'BACKEND_UNAVAILABLE', message: 'The service is not available.' });
    return json(500, { error: 'INTERNAL', message: 'internal error' });
  }
}
