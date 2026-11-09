// Who may see which route. Pure, so it is unit-tested; proxy.ts supplies the facts (read on the server from the console) and applies the answer.
// Public: /discover and /sign-in. Everything else needs a session, and an account without an organization is sent to /onboarding.

export interface AccessFacts {
  /** the console accepted the session cookie */
  signedIn: boolean;
  /** the account has a profile and at least one organization */
  onboardingDone: boolean;
  /** a session cookie was sent but the console did not accept it (expired or revoked) */
  cookieRejected?: boolean;
}
export type AccessDecision = { action: "next" } | { action: "redirect"; to: string };

export const PUBLIC_ROUTES = ["/discover", "/sign-in"] as const;
export const isPublicRoute = (path: string) => PUBLIC_ROUTES.some((p) => path === p || path.startsWith(p + "/"));

/** A return path is only ever followed when it is a same-origin absolute path. Anything else (another host, a scheme, a protocol-relative URL, a backslash) is dropped. */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 512) return null;
  if (!/^\/(?![/\\])/.test(raw)) return null;
  if (/[\u0000-\u001f\\]/.test(raw)) return null;
  if (raw === "/sign-in" || raw.startsWith("/sign-in?") || raw.startsWith("/sign-in/")) return null;
  return raw;
}

export function decideAccess(path: string, search: string, facts: AccessFacts): AccessDecision {
  const here = path + search;
  if (path === "/discover" || path.startsWith("/discover/")) return { action: "next" };
  // the development component gallery shows fictional values and calls no backend; app/dev/layout.tsx decides whether it exists at all
  if (path === "/dev" || path.startsWith("/dev/")) return { action: "next" };

  if (path === "/sign-in") {
    if (!facts.signedIn) return { action: "next" };
    if (!facts.onboardingDone) return { action: "redirect", to: "/onboarding" };
    return { action: "redirect", to: safeNext(new URLSearchParams(search).get("next")) ?? "/" };
  }

  if (!facts.signedIn) {
    if (path === "/") return { action: "redirect", to: "/discover" };
    const qs = new URLSearchParams({ next: here });
    if (facts.cookieRejected) qs.set("expired", "1");
    return { action: "redirect", to: `/sign-in?${qs.toString()}` };
  }

  if (path === "/onboarding" || path.startsWith("/onboarding/")) return facts.onboardingDone ? { action: "redirect", to: "/" } : { action: "next" };
  if (!facts.onboardingDone) return { action: "redirect", to: "/onboarding" };
  return { action: "next" };
}
