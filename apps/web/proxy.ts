// Server-side access control (Next 16 "proxy", the renamed middleware). Runs before any page renders, so a signed-out visitor never receives protected markup.
// It asks the console who the cookie belongs to (GET /api/auth/me on loopback, the same path the API proxy uses), then applies lib/access/decide.ts.
// The console's guards are not touched. With NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1 (the fictional adapter, no backend) nothing is enforced.
import { NextResponse, type NextRequest } from "next/server";
import { decideAccess } from "./lib/access/decide.ts";

const API = process.env.TOBIN_API_URL ?? "http://127.0.0.1:8787";
const COOKIE = "tobin_session";

async function facts(request: NextRequest) {
  const value = request.cookies.get(COOKIE)?.value;
  if (!value) return { signedIn: false, onboardingDone: false, cookieRejected: false };
  try {
    const res = await fetch(`${API}/api/auth/me`, { headers: { cookie: `${COOKIE}=${value}` }, cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { signedIn: false, onboardingDone: false, cookieRejected: res.status === 401 };
    const me = (await res.json()) as { onboarding?: { step?: string }; organizations?: unknown[] };
    return { signedIn: true, onboardingDone: me.onboarding?.step === "done" && (me.organizations?.length ?? 0) > 0, cookieRejected: false };
  } catch {
    // the console could not be reached: treat as signed out, never as signed in
    return { signedIn: false, onboardingDone: false, cookieRejected: false };
  }
}

export async function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_TOBIN_SAMPLE_DATA === "1") return NextResponse.next();
  const f = await facts(request);
  const { pathname, search } = request.nextUrl;
  const decision = decideAccess(pathname, search, f);
  if (decision.action === "redirect") return NextResponse.redirect(new URL(decision.to, request.url));
  // tell the render which shell to use on the public Discover page; the browser cannot set this header (it is overwritten here)
  const headers = new Headers(request.headers);
  headers.set("x-tobin-auth", f.signedIn && f.onboardingDone ? "in" : "out");
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // everything except the API proxy, Next internals and files with an extension
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
