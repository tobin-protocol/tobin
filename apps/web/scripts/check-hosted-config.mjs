// Hosted-mode configuration, checked against REAL production servers started with the hosted environment on this machine (no network, no Railway, no
// secrets: the secret below is a throwaway). It proves, end to end: a hosted process refuses to start without its security configuration; the console
// serves only the institutional API and the probes, refuses every other Host, refuses requests without the shared secret and every development route
// even with it; the web service reaches the console with the secret; the browser-facing proxy refuses cross-origin writes; HSTS and the other headers
// are present; and a forged X-Forwarded-For entry cannot dodge the per-address limit.
// Needs both production builds (npm run build:console, npm run build --workspace tobin-web). Usage: node scripts/check-hosted-config.mjs
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const CONSOLE = join(ROOT, "web-console"), WEB = join(ROOT, "web");
const CPORT = 8790, WPORT = 3110;
const ORIGIN = "https://app.test.example";
const SECRET = "throwaway-secret-" + "x".repeat(32);
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
const dir = mkdtempSync(join(tmpdir(), "tobin-hosted-"));
const procs = [];
// the launcher starts `next start` as its child: kill the whole tree (a process group on Linux, taskkill /T on Windows), or the grandchild keeps the pipes open
const killTree = (p) => { try { if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"]); else process.kill(-p.pid, "SIGKILL"); } catch { /* already gone */ } };
const cleanup = () => { for (const p of procs) killTree(p); try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } };
process.on("exit", cleanup);

const hostedEnv = (extra = {}) => ({ ...process.env, NODE_ENV: "production", TOBIN_DEPLOYMENT_MODE: "hosted", ...extra });
const consoleEnv = (extra = {}) => hostedEnv({ PORT: String(CPORT), TOBIN_ALLOWED_HOSTS: `127.0.0.1:${CPORT}`, TOBIN_PROXY_SECRET: SECRET, TOBIN_PUBLIC_ORIGIN: ORIGIN, TOBIN_DB_PATH: join(dir, "c.sqlite"), ...extra });
const webEnv = (extra = {}) => hostedEnv({ PORT: String(WPORT), TOBIN_PUBLIC_ORIGIN: ORIGIN, TOBIN_API_URL: `http://127.0.0.1:${CPORT}`, TOBIN_PROXY_SECRET: SECRET, TOBIN_TRUSTED_PROXY_HOPS: "1", ...extra });
for (const k of ["NEXT_PUBLIC_TOBIN_SAMPLE_DATA", "TOBIN_DEV_GALLERY"]) delete process.env[k];

function start(cwd, env) {
  const p = spawn(process.execPath, ["scripts/start.mjs"], { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
  p.out = ""; p.stdout.on("data", (d) => { p.out += d; }); p.stderr.on("data", (d) => { p.out += d; });
  procs.push(p);
  return p;
}
const exited = (p, ms) => new Promise((res) => { if (p.exitCode !== null) return res(true); const t = setTimeout(() => res(false), ms); p.on("exit", () => { clearTimeout(t); res(true); }); });
function req(port, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolveReq, reject) => {
    const r = http.request({ host: "127.0.0.1", port, path, method, headers }, (res) => { let t = ""; res.on("data", (d) => { t += d; }); res.on("end", () => resolveReq({ status: res.statusCode, headers: res.headers, text: t })); });
    r.on("error", reject); if (body) r.write(body); r.end();
  });
}
async function waitUp(port, path) { for (let i = 0; i < 60; i++) { try { await req(port, path, { headers: { host: `127.0.0.1:${port}` } }); return true; } catch { await new Promise((r) => setTimeout(r, 500)); } } return false; }

// ---- 1. a hosted process refuses to start without its configuration, and names the variables, not the values
for (const [name, cwd, env, needles] of [
  ["console", CONSOLE, { ...hostedEnv(), PORT: "8791", TOBIN_PROXY_SECRET: "short-secret-value" }, ["TOBIN_ALLOWED_HOSTS", "TOBIN_PROXY_SECRET", "TOBIN_PUBLIC_ORIGIN", "TOBIN_DB_PATH"]],
  ["web", WEB, { ...hostedEnv(), PORT: "3111", TOBIN_PROXY_SECRET: "short-secret-value" }, ["TOBIN_PUBLIC_ORIGIN", "TOBIN_API_URL", "TOBIN_PROXY_SECRET", "TOBIN_TRUSTED_PROXY_HOPS"]],
]) {
  const p = start(cwd, env);
  // Next reports a register() failure on the first request in some versions, so poke it once
  setTimeout(() => { req(Number(env.PORT), "/api/live").catch(() => {}); }, 4000);
  const done = await exited(p, 30000);
  const named = needles.every((n) => p.out.includes(n));
  check(done || /refuses to start/.test(p.out), `hosted ${name} without configuration stops (${done ? "exited " + p.exitCode : "still running"})`);
  check(/refuses to start in hosted mode/.test(p.out) && named, `hosted ${name}: the message names the missing settings`);
  check(!p.out.includes("short-secret-value"), `hosted ${name}: the message prints no secret value`);
  killTree(p);
}

// ---- 2. the console, started with a valid hosted configuration
spawnSync(process.execPath, ["scripts/db.ts", "migrate"], { cwd: CONSOLE, env: consoleEnv(), stdio: "ignore" });
const c = start(CONSOLE, consoleEnv());
check(await waitUp(CPORT, "/api/live"), "the hosted console starts with a valid configuration");
const H = { host: `127.0.0.1:${CPORT}` };
let r = await req(CPORT, "/api/live", { headers: H });
check(r.status === 200, `console liveness answers without the secret (${r.status})`);
r = await req(CPORT, "/api/ready", { headers: H });
check(r.status === 200 && /"ready"/.test(r.text) && /not checked/.test(r.text), `console readiness: database and schema, Stellar explicitly not checked (${r.status})`);
r = await req(CPORT, "/api/auth/me", { headers: H });
check(r.status === 403, `an API request without the proxy secret is refused (${r.status})`);
r = await req(CPORT, "/api/auth/me", { headers: { ...H, "x-tobin-proxy-auth": "wrong" + SECRET } });
check(r.status === 403, `a wrong secret is refused (${r.status})`);
r = await req(CPORT, "/api/auth/me", { headers: { ...H, "x-tobin-proxy-auth": SECRET } });
check(r.status === 401, `with the secret the request reaches the handler and is judged on its session (${r.status})`);
r = await req(CPORT, "/api/auth/me", { headers: { host: "evil.example", "x-tobin-proxy-auth": SECRET } });
check(r.status === 403 && /forbidden host/.test(r.text), `a Host that is not configured is refused even with the secret (${r.status})`);
r = await req(CPORT, "/api/auth/me", { headers: { host: "localhost:" + CPORT, "x-tobin-proxy-auth": SECRET } });
check(r.status === 403, `loopback names are not accepted in hosted mode unless configured (${r.status})`);
for (const p of ["/api/rpc", "/api/bootstrap", "/api/w0/anything", "/api/stellar/run", "/api/stellar/cosign", "/api/stellar/validation", "/", "/w0", "/wallet-check", "/settle-run"]) {
  r = await req(CPORT, p, { headers: { ...H, "x-tobin-proxy-auth": SECRET } });
  check(r.status === 404, `development and owner-tool surface ${p} is refused in hosted mode (${r.status})`);
}

// ---- 3. the web service in front of it
const w = start(WEB, webEnv());
check(await waitUp(WPORT, "/api/live"), "the hosted web service starts with a valid configuration");
const W = { host: `127.0.0.1:${WPORT}` };
r = await req(WPORT, "/api/live", { headers: W });
check(r.status === 200, `web liveness (${r.status})`);
r = await req(WPORT, "/api/ready", { headers: W });
check(r.status === 200 && /"ready"/.test(r.text), `web readiness reaches the console with the secret (${r.status})`);
r = await req(WPORT, "/discover", { headers: W });
check(/max-age=\d+/.test(r.headers["strict-transport-security"] ?? "") && /nonce-/.test(r.headers["content-security-policy"] ?? "") && r.headers["x-frame-options"] === "DENY", "hosted web pages carry HSTS, the nonce CSP and framing protection");
const post = (extra, data = { email: "nobody@example.test", password: "x".repeat(12) }) => req(WPORT, "/api/auth/login", { method: "POST", headers: { ...W, "content-type": "application/json", ...extra }, body: JSON.stringify(data) });
r = await post({ origin: "https://evil.example", "x-tobin-request": "1" });
check(r.status === 403 && /CSRF_ORIGIN/.test(r.text), `a cross-origin write is refused at the web proxy (${r.status})`);
r = await post({ origin: "http://127.0.0.1:" + WPORT, "x-tobin-request": "1" });
check(r.status === 403, `the local origin is not accepted in hosted mode (${r.status})`);
r = await post({ origin: ORIGIN, "x-tobin-request": "1" });
check(r.status === 401, `a genuine write from the public origin reaches the console through the proxy and is judged on its credentials (${r.status})`);
r = await req(WPORT, "/api/rpc", { headers: W });
check(r.status === 404, `the web proxy does not forward /api/rpc (${r.status})`);
r = await req(WPORT, "/api/stellar/run", { headers: W });
check(r.status === 404, `the web proxy does not forward /api/stellar (${r.status})`);

// ---- 4. the per-address limit counts the address the trusted proxy appended, never a client-supplied earlier entry
const real = "203.0.113.77";
let last = 0;
for (let i = 0; i < 21; i++) last = (await post({ origin: ORIGIN, "x-tobin-request": "1", "x-forwarded-for": `10.9.8.${i}, ${real}` }, { email: `n${i}@example.test`, password: "x".repeat(12) })).status;
check(last === 429, `21 failed sign-ins from one trusted address are limited even though the forged leading entries differ (${last})`);
r = await post({ origin: ORIGIN, "x-tobin-request": "1", "x-forwarded-for": "1.1.1.1, 203.0.113.78" }, { email: "other@example.test", password: "x".repeat(12) });
check(r.status === 401, `a different trusted address is not limited (${r.status})`);

// ---- 5. a hosted BUILD refuses development switches (NEXT_PUBLIC values are baked in at build time)
const cfg = spawnSync(process.execPath, ["-e", "import('./next.config.ts').then(()=>process.exit(0),(e)=>{console.error(e.message);process.exit(3)})"], { cwd: WEB, env: webEnv({ NEXT_PUBLIC_TOBIN_SAMPLE_DATA: "1" }), encoding: "utf8" });
check(cfg.status === 3 && /refuses to build in hosted mode/.test(cfg.stderr), "a hosted build refuses NEXT_PUBLIC_TOBIN_SAMPLE_DATA");
const cfg2 = spawnSync(process.execPath, ["-e", "import('./next.config.ts').then(()=>process.exit(0),(e)=>{console.error(e.message);process.exit(3)})"], { cwd: WEB, env: webEnv({ TOBIN_DEV_GALLERY: "1" }), encoding: "utf8" });
check(cfg2.status === 3 && /DEV_GALLERY/.test(cfg2.stderr), "a hosted build refuses TOBIN_DEV_GALLERY");

killTree(c); killTree(w);
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log(" - " + p); process.exit(1); }
console.log("\nall checks passed");
process.exit(0);
