// Request guards for the LOCAL sandbox Console, ported from the earlier plain Node server. Pure functions with no framework dependency, so they are
// unit-tested directly and used by both `proxy.ts` (every request) and the route handlers (defence in depth).
//
// The Console is local only: it must be reachable only as 127.0.0.1:PORT or localhost:PORT. A web page in the user's browser must not be able to
// drive the sandbox: only this server's own names are accepted as Host (DNS rebinding), a foreign Origin is refused on the API (cross-site requests),
// and writes must be JSON (a text/plain POST needs no CORS preflight, so the server itself has to refuse it). No CORS header is ever sent.

export const DEFAULT_PORT = 8787;
export const MAX_BODY_BYTES = 1_000_000;

export function configuredPort(env: Record<string, string | undefined>): number {
  const n = Number(env['PORT'] ?? DEFAULT_PORT);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_PORT;
}

export const allowedHosts = (port: number): Set<string> => new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
export const allowedOrigins = (port: number): Set<string> => new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

export interface GuardInput {
  method: string;
  pathname: string;
  host: string | null;
  origin: string | null;
  contentType: string | null;
  port: number;
}

export interface GuardRefusal {
  status: number;
  body: string;
}

/** Returns a refusal, or null when the request may proceed. Order and messages are those of the earlier server. */
export function checkRequest(i: GuardInput): GuardRefusal | null {
  if (!allowedHosts(i.port).has(String(i.host))) return { status: 403, body: 'forbidden host' };
  if (i.origin !== null && !allowedOrigins(i.port).has(i.origin) && i.pathname.startsWith('/api/')) return { status: 403, body: 'forbidden origin' };
  if (i.method === 'POST' && !String(i.contentType ?? '').toLowerCase().startsWith('application/json')) return { status: 415, body: 'application/json required' };
  return null;
}

/** Reads a JSON body of at most `limit` bytes (counted while streaming, so a missing or false Content-Length cannot bypass it). An empty body is `{}`. */
export async function readJsonBody(request: Request, limit: number = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > limit) throw new Error('request too large');
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('request too large');
      }
      chunks.push(value);
    }
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks));
  return JSON.parse(text || '{}');
}

/** Content Security Policy for documents. The nonce lets Next.js's own inline scripts run; nothing else inline is allowed. `unsafe-eval` only in development (React debugging). */
export function buildCsp(nonce: string, development: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Headers added to every response by `next.config.ts` and to guard refusals by `proxy.ts`. */
export const SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
];
