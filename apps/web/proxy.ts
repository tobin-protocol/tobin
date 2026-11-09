// Server-side access control and security headers (Next 16 "proxy", the renamed middleware). Runs before any page renders, so a signed-out visitor never
// receives protected markup. It asks the console who the cookie belongs to (GET /api/auth/me, the same path the API proxy uses; in hosted mode with the
// shared proxy secret), then applies lib/access/decide.ts. It also sets a per-request nonce Content-Security-Policy and the other security headers.
// With NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1 (the fictional adapter, no backend; refused in hosted mode at startup) access is not enforced.
import { NextResponse, type NextRequest } from "next/server";
import { decideAccess } from "./lib/access/decide.ts";
import { isHosted, upstreamAuthHeaders } from "./lib/server/config.ts";
import { buildCsp, HSTS, STATIC_SECURITY_HEADERS } from "./lib/server/headers.ts";

const API = process.env.TOBIN_API_URL ?? "http://127.0.0.1:8787";
const COOKIE = "tobin_session";

async function facts(request: NextRequest) {
  const value = request.cookies.get(COOKIE)?.value;
  if (!value) return { signedIn: false, onboardingDone: false, cookieRejected: false };
  try {
    const res = await fetch(`${API}/api/auth/me`, { headers: { cookie: `${COOKIE}=${value}`, ...upstreamAuthHeaders(process.env) }, cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { signedIn: false, onboardingDone: false, cookieRejected: res.status === 401 };
    const me = (await res.json()) as { onboarding?: { step?: string }; organizations?: unknown[] };
    return { signedIn: true, onboardingDone: me.onboarding?.step === "done" && (me.organizations?.length ?? 0) > 0, cookieRejected: false };
  } catch {
    // the console could not be reached: treat as signed out, never as signed in
    return { signedIn: false, onboardingDone: false, cookieRejected: false };
  }
}

function secure(res: NextResponse, csp: string): NextResponse {
  res.headers.set("Content-Security-Policy", csp);
  for (const h of STATIC_SECURITY_HEADERS) res.headers.set(h.key, h.value);
  if (isHosted(process.env)) res.headers.set(HSTS.key, HSTS.value);
  return res;
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  if (process.env.NEXT_PUBLIC_TOBIN_SAMPLE_DATA === "1") return secure(NextResponse.next({ request: { headers } }), csp);
  const f = await facts(request);
  const { pathname, search } = request.nextUrl;
  const decision = decideAccess(pathname, search, f);
  if (decision.action === "redirect") return secure(NextResponse.redirect(new URL(decision.to, request.url)), csp);
  // tell the render which shell to use on the public Discover page; the browser cannot set this header (it is overwritten here)
  headers.set("x-tobin-auth", f.signedIn && f.onboardingDone ? "in" : "out");
  return secure(NextResponse.next({ request: { headers } }), csp);
}

export const config = {
  // pages only: the API proxy sets its own responses, and Next internals and files with an extension are static
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
