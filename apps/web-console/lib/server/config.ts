// Security configuration of the console's request guards. Pure (takes the environment as a parameter) so it is unit-tested.
//
// Two modes. LOCAL (the default, unchanged behaviour): only 127.0.0.1:PORT and localhost:PORT are accepted as Host and Origin. HOSTED
// (`TOBIN_DEPLOYMENT_MODE=hosted`): nothing is accepted unless it is configured, the process refuses to start when required configuration is missing or
// malformed (`hostedProblems`, called from instrumentation.ts), only the institutional API and the probes are served, and every API request must carry
// the shared proxy secret, because the console is a private service that only the web service may call.
//
// Environment variables (hosted mode):
//   TOBIN_ALLOWED_HOSTS   comma list of exact Host values the console serves, for example `console.railway.internal:8787`
//   TOBIN_ALLOWED_ORIGINS comma list of exact Origins accepted on /api (normally empty: the web proxy calls without a browser Origin)
//   TOBIN_HEALTH_HOSTS    comma list of Host values accepted ONLY for the probe paths (the platform health check uses its own Host name)
//   TOBIN_PROXY_SECRET    shared secret (at least 32 characters) that the web service sends in x-tobin-proxy-auth
//   TOBIN_PUBLIC_ORIGIN   the public origin of the web application (https://...), used as the wallet sign-in domain
import { timingSafeEqual } from 'node:crypto';

export const HOSTED_MODE = 'hosted';
export const PROXY_AUTH_HEADER = 'x-tobin-proxy-auth';
export const CLIENT_IP_HEADER = 'x-tobin-client-ip';
export const MIN_PROXY_SECRET_LENGTH = 32;
/** The only paths a hosted console serves: the institutional API and the probes. Everything else (sandbox, W0 mock API, /api/rpc, /api/bootstrap, owner tools, pages) is refused. */
export const HOSTED_PATHS = /^\/api\/(auth|registry|health|live|ready)(\/|$)/;
export const PROBE_PATHS = /^\/api\/(health|live|ready)$/;

export interface SecurityPolicy {
  hosted: boolean;
  hosts: ReadonlySet<string>;
  origins: ReadonlySet<string>;
  healthHosts: ReadonlySet<string>;
  /** hosted mode only: the secret every non-probe API request must present */
  proxySecret: string | null;
}

const HOST = /^(\[[0-9a-f:.]+\]|[a-z0-9]([a-z0-9.-]*[a-z0-9])?)(:\d{1,5})?$/;

export const isHosted = (env: Record<string, string | undefined>): boolean => env['TOBIN_DEPLOYMENT_MODE'] === HOSTED_MODE;

export function parseHostList(raw: string | undefined): { hosts: string[]; invalid: string[] } {
  const hosts: string[] = [];
  const invalid: string[] = [];
  for (const part of String(raw ?? '').split(',')) {
    const h = part.trim().toLowerCase();
    if (h === '') continue;
    if (HOST.test(h)) hosts.push(h); else invalid.push(part.trim());
  }
  return { hosts, invalid };
}

/** An origin is scheme://host[:port] with no path, query or credentials. Wildcards are not accepted. */
export function parseOriginList(raw: string | undefined): { origins: string[]; invalid: string[] } {
  const origins: string[] = [];
  const invalid: string[] = [];
  for (const part of String(raw ?? '').split(',')) {
    const o = part.trim();
    if (o === '') continue;
    try {
      const u = new URL(o);
      const ok = (u.protocol === 'https:' || u.protocol === 'http:') && u.username === '' && u.password === '' && (u.pathname === '/' || u.pathname === '') && u.search === '' && u.hash === '' && !o.includes('*');
      if (ok && u.origin === o.replace(/\/$/, '')) origins.push(u.origin); else invalid.push(o);
    } catch { invalid.push(o); }
  }
  return { origins, invalid };
}

export function securityPolicy(env: Record<string, string | undefined>, port: number): SecurityPolicy {
  if (!isHosted(env)) {
    return {
      hosted: false,
      hosts: new Set([`127.0.0.1:${port}`, `localhost:${port}`]),
      origins: new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]),
      healthHosts: new Set(),
      proxySecret: null,
    };
  }
  return {
    hosted: true,
    hosts: new Set(parseHostList(env['TOBIN_ALLOWED_HOSTS']).hosts),
    origins: new Set(parseOriginList(env['TOBIN_ALLOWED_ORIGINS']).origins),
    healthHosts: new Set(parseHostList(env['TOBIN_HEALTH_HOSTS']).hosts),
    proxySecret: env['TOBIN_PROXY_SECRET'] ?? null,
  };
}

/** Problems that must stop a hosted process from starting. Empty in local mode. */
export function hostedProblems(env: Record<string, string | undefined>): string[] {
  if (!isHosted(env)) return [];
  const p: string[] = [];
  if (env['NODE_ENV'] !== 'production') p.push('NODE_ENV must be production in hosted mode');
  const h = parseHostList(env['TOBIN_ALLOWED_HOSTS']);
  if (h.hosts.length === 0) p.push('TOBIN_ALLOWED_HOSTS must list at least one host');
  if (h.invalid.length) p.push('TOBIN_ALLOWED_HOSTS has invalid entries (a host or host:port, no wildcards, no scheme, no path)');
  if (parseHostList(env['TOBIN_HEALTH_HOSTS']).invalid.length) p.push('TOBIN_HEALTH_HOSTS has invalid entries');
  if (parseOriginList(env['TOBIN_ALLOWED_ORIGINS']).invalid.length) p.push('TOBIN_ALLOWED_ORIGINS has invalid entries (exact origins such as https://app.example, no wildcards, no path)');
  const s = env['TOBIN_PROXY_SECRET'] ?? '';
  if (s.length < MIN_PROXY_SECRET_LENGTH) p.push(`TOBIN_PROXY_SECRET must be at least ${MIN_PROXY_SECRET_LENGTH} characters`);
  const o = env['TOBIN_PUBLIC_ORIGIN'] ?? '';
  const po = parseOriginList(o);
  if (po.origins.length !== 1 || po.invalid.length || !o.startsWith('https://')) p.push('TOBIN_PUBLIC_ORIGIN must be one https origin');
  if (!env['TOBIN_DB_PATH']) p.push('TOBIN_DB_PATH must be set (the SQLite file; PostgreSQL configuration replaces this in a later phase)');
  return p;
}

/** Constant-time comparison of the presented proxy secret with the configured one. */
export function proxySecretMatches(presented: string | null, secret: string | null): boolean {
  if (!secret || presented === null) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The client address as seen by the one trusted proxy hop. `hops` is the number of trusted proxies in front of the web service (0 or 1): with 1, the
 * address that proxy appended (the LAST entry of X-Forwarded-For) is used; earlier entries are client-supplied and ignored. With 0 nothing forwarded is
 * trusted and the result is null. A value that is not an IP address is rejected.
 */
export function clientIpFromForwarded(forwardedFor: string | null, hops: number): string | null {
  if (hops !== 1 || !forwardedFor) return null;
  const parts = forwardedFor.split(',').map((s) => s.trim()).filter(Boolean);
  const ip = parts[parts.length - 1];
  return ip && /^[0-9a-f:.]{2,45}$/i.test(ip) ? ip.toLowerCase() : null;
}

/** For development-only route handlers: a hosted console answers 404 and never runs them. Reads the environment here so the isolated W0 module does not. */
export function hostedRefusal(): Response | null {
  return isHosted(process.env) ? new Response('not found', { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } }) : null;
}
