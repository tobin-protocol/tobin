// HTTP layer for the W0 console API. A CLOSED route table: nothing else is reachable, and there is deliberately no route for execute, init,
// keys, state, deployment configuration, baseline approval, signing, submission, files, or commands (contract section 8).
// Every route except the identity bootstrap requires an authenticated session; every non-GET requires the session's CSRF token.
import { isHosted } from '../server/config.ts';
import { checkRequest, readJsonBody } from '../server/guards.ts';
import { ServiceError } from './service.ts';
import type { ConsoleService } from './service.ts';
import { SessionStore } from './identity.ts';
import type { IdentityProvider, Session } from './identity.ts';

export const SESSION_COOKIE = 'w0_session';
export const CSRF_HEADER = 'x-w0-csrf';

export interface HttpDeps {
  service: ConsoleService;
  idp: IdentityProvider | null; // null: no identity provider configured, so nobody can sign in (fail closed)
  sessions: SessionStore;
  port: number;
  now: () => number;
  newId: () => string;
  /** Why the identity provider is or is not available (shown on the sign-in page; not sensitive). */
  idpNote: string;
  /** Production builds: true. Only a development server on plain-HTTP loopback may use false. */
  secureCookies: boolean;
  limiter: RateLimiter;
  loginLimiter: RateLimiter;
  anonLimiter: RateLimiter;
}

const json = (status: number, value: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

const sessionCookie = (deps: HttpDeps, value: string, maxAge: number): string =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${deps.secureCookies ? '; Secure' : ''}`;

const err = (status: number, code: string, message: string): Response => json(status, { ok: false, code, message });

function cookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** Sliding-window limiter, per key. Contract section 3 requires rate limiting; the numbers are W0 engineering choices. */
export class RateLimiter {
  readonly #hits = new Map<string, number[]>();
  readonly #max: number;
  readonly #windowMs: number;
  constructor(max: number, windowMs: number) { this.#max = max; this.#windowMs = windowMs; }
  allow(key: string, nowMs: number): boolean {
    const recent = (this.#hits.get(key) ?? []).filter((t) => nowMs - t < this.#windowMs);
    if (recent.length >= this.#max) { this.#hits.set(key, recent); return false; }
    recent.push(nowMs);
    this.#hits.set(key, recent);
    return true;
  }
}

type Handler = (ctx: { request: Request; url: URL; session: Session; deps: HttpDeps }) => Promise<Response> | Response;

const ROUTES: Readonly<Record<string, Partial<Record<'GET' | 'POST', Handler>>>> = {
  '/api/w0/readiness': { GET: async ({ deps, session }) => json(200, { ok: true, origin: 'mock', report: await deps.service.getReadiness(session.principal) }) },
  '/api/w0/previews': {
    GET: ({ deps, session }) => json(200, { ok: true, origin: 'mock', previews: deps.service.listPreviews(session.principal) }),
    POST: async ({ deps, session, request }) => json(201, { ok: true, origin: 'mock', preview: await deps.service.requestPreview(session.principal, await readJsonBody(request)) }),
  },
  '/api/w0/approvals': {
    GET: ({ deps, session }) => json(200, { ok: true, origin: 'mock', intents: deps.service.listIntents(session.principal) }),
    POST: async ({ deps, session, request }) => json(201, { ok: true, origin: 'mock', intent: await deps.service.recordApprovalIntent(session.principal, await readJsonBody(request)) }),
  },
  '/api/w0/audit': {
    GET: async ({ deps, session, url }) => {
      const filter: Record<string, string> = {};
      for (const [k, v] of url.searchParams) { if (k in filter) throw new ServiceError('invalid', 'duplicate filter parameter'); filter[k] = v; }
      return json(200, { ok: true, origin: 'mock', events: await deps.service.listAuditEvents(session.principal, filter) });
    },
  },
};

export async function handleW0(request: Request, deps: HttpDeps): Promise<Response> {
  const url = new URL(request.url);
  // The W0 mock API is a development tool: a hosted console refuses it outright.
  if (isHosted(process.env)) return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
  const refusal = checkRequest({
    method: request.method, pathname: url.pathname, host: request.headers.get('host'), origin: request.headers.get('origin'),
    contentType: request.headers.get('content-type'), port: deps.port,
  });
  if (refusal) return new Response(refusal.body, { status: refusal.status, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });

  try {
    const method = request.method;
    const sid = cookie(request, SESSION_COOKIE);

    if (url.pathname === '/api/w0/session') {
      if (method === 'GET') {
        const s = deps.sessions.get(sid);
        const idpKind = deps.idp?.kind ?? 'NONE';
        return s
          ? json(200, { ok: true, authenticated: true, principal: s.principal, csrf: s.csrf, idp: s.idp, expiresAt: new Date(s.expiresAt).toISOString() })
          : json(200, { ok: true, authenticated: false, idp: idpKind, idpNote: deps.idpNote, choices: deps.idp?.listLoginChoices() ?? [] });
      }
      if (method === 'POST') {
        if (!deps.loginLimiter.allow('login', deps.now())) return err(429, 'rate_limited', 'too many sign-in attempts');
        if (!deps.idp) return err(403, 'forbidden', 'no identity provider is configured');
        const principal = deps.idp.authenticate(await readJsonBody(request));
        if (!principal) return err(401, 'unauthenticated', 'sign-in refused');
        const s = deps.sessions.create(principal, deps.idp.kind);
        return json(200, { ok: true, authenticated: true, principal: s.principal, csrf: s.csrf, idp: s.idp },
          { 'set-cookie': sessionCookie(deps, s.id, 1800) });
      }
      if (method === 'DELETE') {
        const s = deps.sessions.get(sid);
        if (!s || request.headers.get(CSRF_HEADER) !== s.csrf) return err(403, 'forbidden', 'csrf check failed');
        deps.sessions.destroy(sid);
        return json(200, { ok: true }, { 'set-cookie': sessionCookie(deps, '', 0) });
      }
      return err(405, 'method_not_allowed', 'method not allowed');
    }

    const route = Object.hasOwn(ROUTES, url.pathname) ? ROUTES[url.pathname] : undefined;
    if (!route) return err(404, 'not_found', 'not found');
    const handler = method === 'GET' || method === 'POST' ? route[method] : undefined;
    if (!handler) return err(405, 'method_not_allowed', 'method not allowed');

    const session = deps.sessions.get(sid);
    if (!session) {
      // Anonymous traffic is capped before it can write audit events, so it cannot fill the audit log.
      if (!deps.anonLimiter.allow('anonymous', deps.now())) return err(429, 'rate_limited', 'too many unauthenticated requests');
      throw deps.service.unauthenticated(deps.newId(), 'no valid session');
    }
    if (method !== 'GET' && request.headers.get(CSRF_HEADER) !== session.csrf) return err(403, 'forbidden', 'csrf check failed');
    if (!deps.limiter.allow(session.principal.subject, deps.now())) return err(429, 'rate_limited', 'too many requests');
    return await handler({ request, url, session, deps });
  } catch (e) {
    if (e instanceof ServiceError) return err(e.status, e.code, e.message);
    if (e instanceof SyntaxError) return err(400, 'invalid', 'invalid JSON');
    if (e instanceof Error && e.message === 'request too large') return err(413, 'invalid', 'request too large');
    return err(500, 'internal', 'internal error'); // never echo the error: no stack, path or environment value
  }
}
