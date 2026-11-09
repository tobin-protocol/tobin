// Access-control check (security-critical). From a client with NO cookies, request every protected page route and every console API route through the web
// app's proxy. A page must answer with a redirect to /sign-in (or /discover for "/"), an API route with 401, 403, 404 or 405 (the proxy refuses what it does
// not forward). Anything that answers 2xx with a body, other than the two public pages, is a failure: never data.
// Usage: node scripts/check-access.mjs        (needs apps/web on :3100 and the console behind it; WEB_URL overrides)
const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const ID = "0".repeat(64);
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
const get = (path, init = {}) => fetch(BASE + path, { redirect: "manual", headers: {}, ...init });

// ---- page routes
const PUBLIC_PAGES = ["/discover", "/sign-in"];
const PROTECTED_PAGES = [
  "/", "/sessions", "/sessions/new", `/sessions/${ID}`, `/sessions/${ID}?tab=obligations`, `/sessions/${ID}?tab=settlement&step=review`,
  "/obligations", "/reviews", "/approvals", "/activity", "/organization", "/organization?tab=members", "/organization?tab=wallets", "/wallets",
  "/settings", "/notifications", "/onboarding",
];
for (const p of PROTECTED_PAGES) {
  const r = await get(p);
  const to = r.headers.get("location") ?? "";
  const body = r.status >= 300 && r.status < 400 ? "" : await r.text();
  const redirected = r.status >= 300 && r.status < 400 && (/\/sign-in/.test(to) || (p === "/" && /\/discover/.test(to)));
  check(redirected && body === "", `page ${p}: redirect to sign-in/discover with no body (${r.status} ${to.replace(BASE, "")})`);
}
for (const p of PUBLIC_PAGES) {
  const r = await get(p);
  const html = await r.text();
  check(r.status === 200 && !/tobin_session|"organizations"\s*:/.test(html), `public page ${p}: 200 and carries no session data`);
}

// ---- API routes (GET and POST, no cookie, no CSRF header)
const A = "/api/auth", R = "/api/registry", O = `${R}/orgs/org_x`, S = `${O}/sessions/${ID}`, B = `${S}/settlement/batches/b1`;
const API = [
  `${A}/me`, `${A}/audit`, `${A}/logout`, `${A}/logout-all`, `${A}/profile`, `${A}/login`, `${A}/register`, `${A}/wallet/challenge`, `${A}/wallet/verify`, `${A}/wallets/remove`, `${A}/default-org`, `${A}/onboarding`,
  `${R}/assets`, `${R}/invitations/accept`, `${R}/orgs`, `${R}/orgs/discover`, O, `${O}/update`,
  `${O}/members`, `${O}/members/u1/role`, `${O}/members/u1/remove`, `${O}/members/u1/status`,
  `${O}/invitations`, `${O}/invitations/i1/revoke`, `${O}/reviewers/u1/grant`, `${O}/reviewers/u1/revoke`,
  `${O}/wallets`, `${O}/wallet-verifications`, `${O}/wallet-challenges`, `${O}/signer-sets`,
  `${O}/sessions`, S, `${S}/participants`, `${S}/obligations`, `${S}/obligations/o1/void`, `${S}/calculate`, `${S}/calculation`, `${S}/readiness`, `${S}/ready`, `${S}/reopen`, `${S}/close`,
  `${S}/authorization`, `${S}/authorization/approve`, `${S}/authorization/reject`,
  `${S}/settlement`, `${S}/settlement/prepare`, B, `${B}/approve`, `${B}/reject`, `${B}/validation`, `${B}/execution`, `${B}/execution/attempts`, `${B}/execution/start`,
  // routes the proxy does not forward at all: they must not be reachable through it
  "/api/bootstrap", "/api/health", "/api/rpc", "/api/stellar/cosign", "/api/stellar/run", "/api/stellar/validation", "/api/w0/anything", "/api/console/anything", "/api/db/anything",
];
const OK_STATUS = new Set([401, 403, 404, 405]);
for (const p of API) {
  for (const method of ["GET", "POST"]) {
    const r = await get(p, method === "POST" ? { method, headers: { "content-type": "application/json" }, body: "{}" } : { method });
    const text = await r.text();
    // logging out with no session is idempotent and answers {"ok":true}: it returns no data and changes nothing
    const idempotentLogout = p === "/api/auth/logout" && method === "POST" && r.status === 200 && text.trim() === "{\"ok\":true}";
    const refused = OK_STATUS.has(r.status) || (r.status >= 300 && r.status < 400) || idempotentLogout;
    // 400 is accepted for the credential endpoints only when the body carries no data (an empty login is a bad request, not a leak)
    const emptyBad = r.status === 400 && /^\/api\/auth\/(login|register|wallet)/.test(p) && !/"(user|organizations|members|sessions)"/.test(text);
    check(refused || emptyBad, `${method} ${p.replace(ID, ":id")}: ${r.status}${refused || emptyBad ? "" : " " + text.slice(0, 80)}`);
  }
}
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log(" - " + p); process.exit(1); }
console.log(`\nall ${PROTECTED_PAGES.length + PUBLIC_PAGES.length} page routes and ${API.length * 2} API requests refused or redirected without data`);
