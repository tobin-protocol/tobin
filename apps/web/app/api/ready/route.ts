import { upstreamAuthHeaders } from "../../../lib/server/config.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND = (process.env.TOBIN_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");

// Readiness of the web service: it can reach the console and the console reports itself ready (its database answers and its schema is current).
// It says nothing about Stellar connectivity. It reveals only a status word, never a URL or an error text.
export async function GET(): Promise<Response> {
  const h = { "content-type": "application/json", "cache-control": "no-store" };
  try {
    const r = await fetch(`${BACKEND}/api/ready`, { headers: { accept: "application/json", ...upstreamAuthHeaders(process.env) }, cache: "no-store", signal: AbortSignal.timeout(3000) });
    return new Response(JSON.stringify({ status: r.ok ? "ready" : "not-ready", console: r.ok ? "ready" : "not ready", stellar: "not checked" }), { status: r.ok ? 200 : 503, headers: h });
  } catch {
    return new Response(JSON.stringify({ status: "not-ready", console: "unreachable", stellar: "not checked" }), { status: 503, headers: h });
  }
}
