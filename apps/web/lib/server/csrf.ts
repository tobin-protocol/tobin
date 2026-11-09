// Validation of the REAL browser request at the API proxy, before anything is forwarded. The console requires a CSRF header on writes; this proxy must
// not manufacture that evidence, so it checks the incoming request and only then forwards. Pure, so it is unit-tested.
//
// POST: JSON content type, the x-tobin-request header that the app's own client sets (a cross-site form or a simple fetch cannot add it without a CORS
// preflight, which this app never grants), an Origin that is exactly the allowed one, and Sec-Fetch-Site same-origin when the browser sends it.
// GET: Sec-Fetch-Site same-origin or none (a typed address) when sent; Origin, when sent, must be the allowed one.
// SameSite=Strict on the session cookie (set by the console) stays as the last layer.
export const CSRF_HEADER = "x-tobin-request";

export interface BrowserRequest {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  contentType: string | null;
  csrfHeader: string | null;
}
export type Refusal = { status: number; error: string; message: string };

export function checkBrowserRequest(r: BrowserRequest, originAllowed: (origin: string) => boolean): Refusal | null {
  const site = r.secFetchSite?.toLowerCase() ?? null;
  if (r.method === "POST") {
    if (!String(r.contentType ?? "").toLowerCase().startsWith("application/json")) return { status: 415, error: "PROXY_REFUSED", message: "application/json required" };
    if (r.origin === null || !originAllowed(r.origin)) return { status: 403, error: "CSRF_ORIGIN", message: "forbidden origin" };
    if (site !== null && site !== "same-origin") return { status: 403, error: "CSRF_SITE", message: "cross-site request refused" };
    if (r.csrfHeader !== "1") return { status: 403, error: "CSRF_HEADER", message: "missing request header" };
    return null;
  }
  if (r.origin !== null && !originAllowed(r.origin)) return { status: 403, error: "CSRF_ORIGIN", message: "forbidden origin" };
  if (site !== null && site !== "same-origin" && site !== "none") return { status: 403, error: "CSRF_SITE", message: "cross-site request refused" };
  return null;
}

/** Local mode accepts http loopback origins; hosted mode accepts only the one configured public origin. */
export function originPredicate(hosted: boolean, publicOrigin: string | null): (origin: string) => boolean {
  if (hosted) return (o) => publicOrigin !== null && o === publicOrigin;
  return (o) => { try { const u = new URL(o); return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost") && u.origin === o; } catch { return false; } };
}
