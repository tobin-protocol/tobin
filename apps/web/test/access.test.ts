import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAccess, safeNext } from "../lib/access/decide.ts";

const out = { signedIn: false, onboardingDone: false };
const expired = { signedIn: false, onboardingDone: false, cookieRejected: true };
const noOrg = { signedIn: true, onboardingDone: false };
const inn = { signedIn: true, onboardingDone: true };

test("Discover is public for everyone", () => {
  for (const f of [out, noOrg, inn]) assert.deepEqual(decideAccess("/discover", "", f), { action: "next" });
});

test("the development gallery is not behind sign-in (the layout hides it outside development)", () => {
  assert.deepEqual(decideAccess("/dev/components", "", out), { action: "next" });
});

test("a signed-out visit to a protected route goes to sign-in with the route to return to", () => {
  assert.deepEqual(decideAccess("/obligations", "", out), { action: "redirect", to: "/sign-in?next=%2Fobligations" });
  assert.deepEqual(decideAccess("/sessions/abc", "?tab=netting", out), { action: "redirect", to: "/sign-in?next=%2Fsessions%2Fabc%3Ftab%3Dnetting" });
  assert.deepEqual(decideAccess("/onboarding", "", out), { action: "redirect", to: "/sign-in?next=%2Fonboarding" });
});

test("a rejected cookie is reported as an expired session", () => {
  assert.deepEqual(decideAccess("/reviews", "", expired), { action: "redirect", to: "/sign-in?next=%2Freviews&expired=1" });
});

test("a signed-out visitor to the root lands on Discover, the default entry", () => {
  assert.deepEqual(decideAccess("/", "", out), { action: "redirect", to: "/discover" });
});

test("sign-in stays reachable when signed out, and bounces a signed-in account back", () => {
  assert.deepEqual(decideAccess("/sign-in", "?next=%2Fsessions", out), { action: "next" });
  assert.deepEqual(decideAccess("/sign-in", "?next=%2Fsessions", inn), { action: "redirect", to: "/sessions" });
  assert.deepEqual(decideAccess("/sign-in", "", inn), { action: "redirect", to: "/" });
  assert.deepEqual(decideAccess("/sign-in", "?next=%2Fsessions", noOrg), { action: "redirect", to: "/onboarding" });
});

test("an account without an organization is held at onboarding, and onboarding is closed once done", () => {
  assert.deepEqual(decideAccess("/sessions", "", noOrg), { action: "redirect", to: "/onboarding" });
  assert.deepEqual(decideAccess("/onboarding", "", noOrg), { action: "next" });
  assert.deepEqual(decideAccess("/onboarding", "", inn), { action: "redirect", to: "/" });
});

test("a signed-in account with an organization reaches protected routes", () => {
  for (const p of ["/", "/sessions", "/sessions/x", "/obligations", "/reviews", "/activity", "/organization", "/settings", "/notifications"]) assert.deepEqual(decideAccess(p, "", inn), { action: "next" });
});

test("only same-origin absolute paths are followed after sign-in", () => {
  assert.equal(safeNext("/sessions?tab=netting"), "/sessions?tab=netting");
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "sessions", "", null, undefined, "/sign-in?next=/x", "/a\u0000b", "/" + "a".repeat(600)]) assert.equal(safeNext(bad as string | null | undefined), null, String(bad));
  assert.deepEqual(decideAccess("/sign-in", "?next=https%3A%2F%2Fevil.example", inn), { action: "redirect", to: "/" });
});
