import { decide, MAX_BODY_BYTES, REQUEST_HEADER } from "../../../lib/proxy-policy.ts";

// Server-side proxy to the web console's API (decision D2). The browser talks only to this origin; this handler talks to the console.
// Local hosting only: TOBIN_API_URL defaults to the console on loopback, and nothing here makes that backend reachable from elsewhere.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND = (process.env.TOBIN_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");

const reply = (status: number, error: string, message: string) =>
  new Response(JSON.stringify({ error, message }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function forward(request: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path: segments } = await ctx.params;
  const d = decide(request.method, segments);
  if (!d.ok) return reply(d.status, "PROXY_REFUSED", d.message);

  const headers = new Headers({ accept: "application/json" });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  let body: string | undefined;
  if (request.method === "POST") {
    body = await request.text();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) return reply(413, "PROXY_REFUSED", "request too large");
    headers.set("content-type", "application/json");
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
