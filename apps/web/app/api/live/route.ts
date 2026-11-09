export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liveness of the web service: the process answers. No console call, no database, nothing else, so it cannot fail because a dependency is down.
export function GET(): Response {
  return new Response(JSON.stringify({ status: "ok", service: "web" }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
