// Hosting hardening of the public web service: hosted-mode startup validation, CSRF validation at the API proxy, security headers, the trusted client address.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { clientIpFromForwarded } from "../lib/server/client-ip.ts";
import { hostedProblems, isHosted, parseOrigin, trustedHops, upstreamAuthHeaders } from "../lib/server/config.ts";
import { checkBrowserRequest, originPredicate } from "../lib/server/csrf.ts";
import { buildCsp, HSTS, STATIC_SECURITY_HEADERS } from "../lib/server/headers.ts";

const ORIGIN = "https://app.example.org";
const hostedEnv = { TOBIN_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production", TOBIN_PUBLIC_ORIGIN: ORIGIN, TOBIN_API_URL: "http://console.railway.internal:8787", TOBIN_PROXY_SECRET: "s".repeat(40), TOBIN_TRUSTED_PROXY_HOPS: "1" };
const post = { method: "POST", origin: ORIGIN, secFetchSite: "same-origin", contentType: "application/json", csrfHeader: "1" };
const hostedOk = originPredicate(true, ORIGIN);
const localOk = originPredicate(false, null);

test("hosted startup validation names every problem and no value", () => {
  assert.deepEqual(hostedProblems(hostedEnv), []);
  assert.deepEqual(hostedProblems({}), [], "local mode needs nothing");
  const text = hostedProblems({ TOBIN_DEPLOYMENT_MODE: "hosted", TOBIN_PROXY_SECRET: "short-secret", TOBIN_PUBLIC_ORIGIN: "http://plain.example", NEXT_PUBLIC_TOBIN_SAMPLE_DATA: "1", TOBIN_DEV_GALLERY: "1" }).join("\n");
  for (const n of ["NODE_ENV", "TOBIN_PUBLIC_ORIGIN", "TOBIN_API_URL", "TOBIN_PROXY_SECRET", "TOBIN_TRUSTED_PROXY_HOPS", "SAMPLE_DATA", "DEV_GALLERY"]) assert.match(text, new RegExp(n), n);
  assert.doesNotMatch(text, /short-secret|plain\.example/);
  for (const hops of ["2", "", "true", undefined]) assert.ok(hostedProblems({ ...hostedEnv, TOBIN_TRUSTED_PROXY_HOPS: hops }).some((p) => /HOPS/.test(p)), String(hops));
  assert.equal(isHosted({ TOBIN_DEPLOYMENT_MODE: "hosted" }), true);
  assert.equal(isHosted({ TOBIN_DEPLOYMENT_MODE: "Hosted" }), false);
});

test("the proxy secret reaches the console only in hosted mode", () => {
  assert.deepEqual(upstreamAuthHeaders({}), {});
  assert.deepEqual(upstreamAuthHeaders({ TOBIN_PROXY_SECRET: "x".repeat(40) }), {}, "local mode sends nothing even if the variable is set");
  assert.deepEqual(upstreamAuthHeaders(hostedEnv), { "x-tobin-proxy-auth": "s".repeat(40) });
});

test("origins are exact; only the trusted hop count 1 is honoured", () => {
  assert.equal(parseOrigin("https://app.example.org/"), ORIGIN);
  for (const bad of ["https://app.example.org/path", "https://*.example.org", "app.example.org", "https://u:p@app.example.org", undefined, ""]) assert.equal(parseOrigin(bad), null, String(bad));
  assert.equal(trustedHops({ TOBIN_TRUSTED_PROXY_HOPS: "1" }), 1);
  for (const v of ["0", "2", "true", "", undefined]) assert.equal(trustedHops({ TOBIN_TRUSTED_PROXY_HOPS: v }), 0, String(v));
});

test("CSRF at the proxy: a valid same-origin write passes", () => {
  assert.equal(checkBrowserRequest(post, hostedOk), null);
  assert.equal(checkBrowserRequest({ ...post, origin: "http://127.0.0.1:3000", secFetchSite: null }, localOk), null);
  assert.equal(checkBrowserRequest({ ...post, origin: "http://localhost:3100" }, localOk), null);
});

test("CSRF at the proxy: cross-origin, cross-site and header-less writes are refused, each for its own reason", () => {
  assert.equal(checkBrowserRequest({ ...post, origin: "https://evil.example" }, hostedOk)?.error, "CSRF_ORIGIN");
  assert.equal(checkBrowserRequest({ ...post, origin: null }, hostedOk)?.error, "CSRF_ORIGIN", "a write without Origin is refused");
  assert.equal(checkBrowserRequest({ ...post, origin: "null" }, hostedOk)?.error, "CSRF_ORIGIN");
  assert.equal(checkBrowserRequest({ ...post, origin: "https://app.example.org.evil.example" }, hostedOk)?.error, "CSRF_ORIGIN");
  assert.equal(checkBrowserRequest({ ...post, origin: "http://app.example.org" }, hostedOk)?.error, "CSRF_ORIGIN", "scheme must match");
  assert.equal(checkBrowserRequest({ ...post, secFetchSite: "same-site" }, hostedOk)?.error, "CSRF_SITE");
  assert.equal(checkBrowserRequest({ ...post, secFetchSite: "cross-site" }, hostedOk)?.error, "CSRF_SITE");
  assert.equal(checkBrowserRequest({ ...post, secFetchSite: "none" }, hostedOk)?.error, "CSRF_SITE", "a write is never user-typed");
  assert.equal(checkBrowserRequest({ ...post, csrfHeader: null }, hostedOk)?.error, "CSRF_HEADER");
  assert.equal(checkBrowserRequest({ ...post, csrfHeader: "0" }, hostedOk)?.error, "CSRF_HEADER");
  assert.equal(checkBrowserRequest({ ...post, contentType: "text/plain" }, hostedOk)?.status, 415);
  assert.equal(checkBrowserRequest({ ...post, contentType: "application/x-www-form-urlencoded" }, hostedOk)?.status, 415);
  assert.equal(checkBrowserRequest({ ...post, origin: "http://127.0.0.1:3000" }, hostedOk)?.error, "CSRF_ORIGIN", "hosted mode accepts only the configured public origin");
  assert.equal(checkBrowserRequest({ ...post, origin: "https://evil.example", secFetchSite: null }, localOk)?.error, "CSRF_ORIGIN");
});

test("CSRF at the proxy: reads", () => {
  const get = { method: "GET", origin: null, secFetchSite: null, contentType: null, csrfHeader: null };
  assert.equal(checkBrowserRequest(get, hostedOk), null);
  assert.equal(checkBrowserRequest({ ...get, secFetchSite: "same-origin" }, hostedOk), null);
  assert.equal(checkBrowserRequest({ ...get, secFetchSite: "none" }, hostedOk), null);
  assert.equal(checkBrowserRequest({ ...get, secFetchSite: "cross-site" }, hostedOk)?.error, "CSRF_SITE");
  assert.equal(checkBrowserRequest({ ...get, origin: "https://evil.example" }, hostedOk)?.error, "CSRF_ORIGIN");
  assert.equal(checkBrowserRequest({ ...get, origin: ORIGIN }, hostedOk), null);
});

test("the proxy route validates the browser request before it forwards, and does not invent the CSRF header", () => {
  const src = readFileSync(new URL("../app/api/[...path]/route.ts", import.meta.url), "utf8");
  const check = src.indexOf("checkBrowserRequest(");
  assert.ok(check > 0);
  assert.ok(check < src.indexOf("await fetch(") , "validation comes before the upstream fetch");
  assert.match(src, /csrfHeader: request\.headers\.get\(REQUEST_HEADER\)/);
  assert.match(readFileSync(new URL("../lib/api/http.ts", import.meta.url), "utf8"), /"x-tobin-request": "1"/, "the browser client sets the header");
});

test("Content-Security-Policy: nonce based, framing refused, nothing inline without the nonce", () => {
  const csp = buildCsp("abc", false);
  assert.match(csp, /script-src 'self' 'nonce-abc' 'strict-dynamic'(?!.*unsafe)/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /default-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.match(buildCsp("abc", true), /unsafe-eval/, "development only");
  assert.doesNotMatch(buildCsp("abc", false), /ws:/);
});

test("static security headers include the required set; HSTS is separate (hosted only)", () => {
  const keys = STATIC_SECURITY_HEADERS.map((h) => h.key);
  for (const k of ["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy"]) assert.ok(keys.includes(k), k);
  assert.ok(!keys.includes("Strict-Transport-Security"));
  assert.match(HSTS.value, /max-age=\d{7,}/);
  assert.match(STATIC_SECURITY_HEADERS.find((h) => h.key === "Permissions-Policy")!.value, /camera=\(\)/);
});

test("the trusted client address is the last forwarded entry and only with one hop", () => {
  assert.equal(clientIpFromForwarded("6.6.6.6, 1.2.3.4", 1), "1.2.3.4");
  assert.equal(clientIpFromForwarded("1.2.3.4", 0), null);
  assert.equal(clientIpFromForwarded("1.2.3.4", 2), null);
  assert.equal(clientIpFromForwarded("bad value", 1), null);
  assert.equal(clientIpFromForwarded(null, 1), null);
});
