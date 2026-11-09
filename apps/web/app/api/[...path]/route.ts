import { decide, MAX_BODY_BYTES, REQUEST_HEADER } from "../../../lib/proxy-policy.ts";
import { CLIENT_IP_HEADER, isHosted, parseOrigin, trustedHops, upstreamAuthHeaders } from "../../../lib/server/config.ts";
import { clientIpFromForwarded } from "../../../lib/server/client-ip.ts";
import { checkBrowserRequest, originPredicate } from "../../../lib/server/csrf.ts";

// Server-side proxy to the web console's API (decision D2). The browser talks only to this origin; this handler talks to the console.
// It validates the REAL browser request first (content type, CSRF header, Origin, Fetch Metadata: lib/server/csrf.ts) and only then adds the headers the
// console requires. In hosted mode it also sends the shared proxy secret and the client address as seen by the one trusted proxy hop.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND = (process.env.TOBIN_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");

const reply = (status: number, error: string, message: string) =>
  new Response(JSON.stringify({ error, message }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function forward(request: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path: segments } = await ctx.params;
  const d = decide(request.method, segments);
  if (!d.ok) return reply(d.status, "PROXY_REFUSED", d.message);

  const hosted = isHosted(process.env);
  const refusal = checkBrowserRequest(
    {
      method: request.method,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
      contentType: request.headers.get("content-type"),
      csrfHeader: request.headers.get(REQUEST_HEADER),
    },
    originPredicate(hosted, parseOrigin(process.env.TOBIN_PUBLIC_ORIGIN)),
  );
  if (refusal) return reply(refusal.status, refusal.error, refusal.message);

  const headers = new Headers({ accept: "application/json", ...upstreamAuthHeaders(process.env) });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const ip = clientIpFromForwarded(request.headers.get("x-forwarded-for"), trustedHops(process.env));
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  let body: string | undefined;
  if (request.method === "POST") {
    body = await request.text();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) return reply(413, "PROXY_REFUSED", "request too large");
    headers.set("content-type", "application/json");
    // the browser request carried this header (checked above); it is passed on, not invented
    headers.set(REQUEST_HEADER, "1");
  }

  let upstream: Response;
  try {
    upstream = await fetch(BACKEND + d.path + new URL(request.url).search, { method: request.method, headers, body, redirect: "manual", cache: "no-store" });
  } catch {
    return reply(503, "BACKEND_UNAVAILABLE", "The Tobin console is not running or is unreachable. This app needs it as its backend.");
  }

  const out = new Headers({ "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  for (const c of upstream.headers.getSetCookie()) out.append("set-cookie", c);
  return new Response(await upstream.text(), { status: upstream.status, headers: out });
}

export const GET = forward;
export const POST = forward;
