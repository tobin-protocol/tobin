// Runs before every request (Next.js 16 `proxy`, the renamed middleware; Node.js runtime). It (1) enforces the local-only guards (Host allow-list on
// everything, foreign-Origin refusal on /api, JSON-only POST) and (2) adds a per-request nonce Content Security Policy for documents, as described in
// the bundled Next.js guide "Content Security Policy". Pages that carry the nonce are rendered dynamically (see app/page.tsx).
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildCsp, checkRequest, configuredPort, SECURITY_HEADERS } from './lib/server/guards.ts';

export function proxy(request: NextRequest): NextResponse {
  const refusal = checkRequest({
    method: request.method,
    pathname: request.nextUrl.pathname,
    host: request.headers.get('host'),
    origin: request.headers.get('origin'),
    contentType: request.headers.get('content-type'),
    port: configuredPort(process.env),
  });
  if (refusal) {
    const res = new NextResponse(refusal.body, { status: refusal.status, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
    for (const h of SECURITY_HEADERS) res.headers.set(h.key, h.value);
    return res;
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}
