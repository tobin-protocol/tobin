// What the server-side proxy will forward. Pure, so it is unit-tested. The console's request guards are NOT changed and no CORS is added (decision D2):
// the proxy calls the console from the server, forwards only the session cookie, drops the browser Origin, and adds the request header the console requires.
//
// Only /api/auth and /api/registry are forwarded. The owner-run Stellar routes (/api/stellar/*), the sandbox routes (/api/bootstrap, /api/rpc), the W0
// mock API and /api/health are deliberately not reachable through this app.

const ALLOWED = /^\/api\/(auth|registry)(\/|$)/;
export const MAX_BODY_BYTES = 8 * 1024;
export const REQUEST_HEADER = "x-tobin-request";

export type ProxyDecision = { ok: true; path: string } | { ok: false; status: number; message: string };

export function decide(method: string, segments: readonly string[]): ProxyDecision {
  if (method !== "GET" && method !== "POST") return { ok: false, status: 405, message: "method not allowed" };
  if (segments.some((s) => s === ".." || s === "." || s.includes("/") || s.includes("\\") || s.includes("%"))) return { ok: false, status: 400, message: "invalid path" };
  const path = "/api/" + segments.join("/");
  if (!ALLOWED.test(path)) return { ok: false, status: 404, message: "not found" };
  return { ok: true, path };
}
