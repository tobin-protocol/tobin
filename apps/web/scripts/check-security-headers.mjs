// Security headers and CSRF, checked against a RUNNING build in a real browser. (1) Every page response carries the nonce Content-Security-Policy and the
// static security headers; (2) loading real pages signed out and signed in (Alice, seeded throwaway backend) produces NO Content-Security-Policy violation
// and no page error, including the wallet popover and the Connect wallet window; (3) the API proxy refuses a cross-origin write, a write without the CSRF
// header, a cross-site Fetch Metadata write and a non-JSON write, and accepts the same write when it is a genuine same-origin request.
// Usage: node scripts/check-security-headers.mjs        (WEB_URL, default http://127.0.0.1:3100; needs the seeded servers)
import { chromium } from "@playwright/test";

const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PW = "Correct-horse-battery-1";
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
const browser = await chromium.launch({ channel: "chrome" });

// ---- 1 and 2: headers and CSP violations
const PAGES = ["/discover", "/sign-in", "/", "/sessions", "/obligations", "/reviews", "/activity", "/organization", "/organization?tab=wallets", "/settings"];
async function load(signedIn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const violations = []; const errors = [];
  await page.exposeFunction("__csp", (m) => violations.push(m));
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => window.__csp(`${e.violatedDirective} ${e.blockedURI} ${(e.sample || "").slice(0, 40)}`)));
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));
  if (signedIn) {
    const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email: "alice@example.test", password: PW }, headers: { origin: BASE, "x-tobin-request": "1" } });
    check(r.ok(), `signed-in login through the proxy with a genuine same-origin write: ${r.status()}`);
  }
  for (const p of PAGES) {
    const resp = await page.goto(BASE + p);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    const h = resp?.headers() ?? {};
    const csp = h["content-security-policy"] ?? "";
    check(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(csp) && /frame-ancestors 'none'/.test(csp), `${signedIn ? "member" : "signed-out"} ${p}: nonce CSP present (final URL ${page.url().replace(BASE, "")})`);
    check(h["x-content-type-options"] === "nosniff" && h["x-frame-options"] === "DENY" && h["referrer-policy"] === "no-referrer" && /camera=\(\)/.test(h["permissions-policy"] ?? ""), `${signedIn ? "member" : "signed-out"} ${p}: static security headers present`);
  }
  // open the wallet popover and the Connect wallet window where they exist
  if (signedIn) { await page.goto(BASE + "/"); await page.waitForLoadState("networkidle"); await page.getByRole("button", { name: /^Wallet:/ }).click(); await page.waitForTimeout(500); }
  else { await page.goto(BASE + "/discover"); await page.waitForLoadState("networkidle"); const b = page.getByRole("button", { name: /Connect wallet/i }).first(); if (await b.count()) { await b.click(); await page.waitForTimeout(600); } }
  check(violations.length === 0, `${signedIn ? "member" : "signed-out"}: no Content-Security-Policy violations${violations.length ? ": " + [...new Set(violations)].slice(0, 5).join(" | ") : ""}`);
  check(errors.length === 0, `${signedIn ? "member" : "signed-out"}: no page errors${errors.length ? ": " + errors[0] : ""}`);
  await ctx.close();
}
await load(false);
await load(true);

// ---- 3: CSRF at the proxy
const anon = await browser.newContext();
const w = (extra) => anon.request.post(`${BASE}/api/auth/login`, { data: { email: "nobody@example.test", password: "x" }, failOnStatusCode: false, ...extra });
const body = async (r) => (await r.json().catch(() => ({}))).error;
let r = await w({ headers: { origin: "https://evil.example", "x-tobin-request": "1" } });
check(r.status() === 403 && (await body(r)) === "CSRF_ORIGIN", `cross-origin write refused (${r.status()})`);
r = await w({ headers: { "x-tobin-request": "1" } });
check(r.status() === 403 && (await body(r)) === "CSRF_ORIGIN", `write without Origin refused (${r.status()})`);
r = await w({ headers: { origin: BASE } });
check(r.status() === 403 && (await body(r)) === "CSRF_HEADER", `write without the CSRF header refused (${r.status()})`);
r = await w({ headers: { origin: BASE, "x-tobin-request": "1", "sec-fetch-site": "cross-site" } });
check(r.status() === 403 && (await body(r)) === "CSRF_SITE", `cross-site Fetch Metadata write refused (${r.status()})`);
r = await anon.request.post(`${BASE}/api/auth/login`, { data: "a=b", headers: { origin: BASE, "x-tobin-request": "1", "content-type": "text/plain" }, failOnStatusCode: false });
check(r.status() === 415, `text/plain write refused (${r.status()})`);
r = await w({ headers: { origin: BASE, "x-tobin-request": "1" } });
check(r.status() === 401 || r.status() === 400 || r.status() === 429, `a genuine same-origin write reaches the console and is judged on its credentials (${r.status()})`);
r = await anon.request.get(`${BASE}/api/live`);
check(r.status() === 200 && (await r.json()).status === "ok", "web liveness answers without the console");
await browser.close();
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log(" - " + p); process.exit(1); }
console.log("\nall checks passed");
