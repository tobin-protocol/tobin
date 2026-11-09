// R5 light browser pass, run once on the final build. (1) axe-core on every route at 1440 and 390 as signed-out, member (carol) and admin (alice).
// (2) horizontal overflow on every route at 390 and 360. (3) opens every dialog and sheet it can reach once and writes its copy to <dir>/dialog-copy.txt.
// (4) screenshots at 1440 for a reading pass. It makes its own throwaway sessions through the real API. Nothing is injected or mocked.
// axe-core is not a dependency: point AXE_PATH at an axe.min.js installed elsewhere.
// Usage: AXE_PATH=<axe.min.js> node scripts/review-r5.mjs <output dir>
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out || !process.env.AXE_PATH) throw new Error("usage: AXE_PATH=<axe.min.js> node scripts/review-r5.mjs <output dir>");
mkdirSync(out, { recursive: true });
const axeSource = readFileSync(process.env.AXE_PATH, "utf8");
const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PW = "Correct-horse-battery-1";
const problems = [];
const axeFindings = [];
const notes = `${out}/dialog-copy.txt`;
writeFileSync(notes, "Dialog and sheet copy, as rendered (R5 pass)\n\n");
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
const browser = await chromium.launch({ channel: "chrome" });

async function apiUser(name) {
  const ctx = await browser.newContext();
  const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email: `${name}@example.test`, password: PW } });
  if (!r.ok()) throw new Error(`login ${name} ${r.status()}`);
  const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  return { ctx, req: ctx.request, orgId: me.organizations[0].id };
}
const alice = await apiUser("alice");
const bob = await apiUser("bob");
const orgBase = `${BASE}/api/registry/orgs/${alice.orgId}`;
const call = async (u, method, path, data) => {
  const r = await u.req[method](orgBase + path, method === "post" ? { data: data ?? {} } : undefined);
  if (!r.ok()) throw new Error(`${method} ${path} -> ${r.status()} ${(await r.text()).slice(0, 160)}`);
  return r.json();
};
const members = (await call(alice, "get", "/members")).members;
const idOf = (n) => members.find((m) => m.name === n).userId;
const stamp = Date.now().toString(36);
async function build(label, stage) {
  const sid = (await call(alice, "post", "/sessions", { label })).session.sessionId;
  for (const m of members) await call(alice, "post", `/sessions/${sid}/participants`, { userId: m.userId });
  if (stage === "draft") return sid;
  const ref = (await call(alice, "get", `/sessions/${sid}/settlement`)).assets[0].id;
  const ob = (d, c, amt) => call(alice, "post", `/sessions/${sid}/obligations`, { debtor: idOf(d), creditor: idOf(c), amount: amt, assetRef: ref, reference: "r5" });
  await ob("Alice", "Bob", "100"); await ob("Bob", "Carol", "80"); await ob("Carol", "Alice", "70");
  const calc = await call(alice, "post", `/sessions/${sid}/calculate`);
  if (stage === "calculated") return sid;
  await call(bob, "post", `/sessions/${sid}/authorization/approve`, { calculationId: calc.calculation.id });
  await call(alice, "post", `/sessions/${sid}/ready`);
  if (stage === "ready") return sid;
  await call(alice, "post", `/sessions/${sid}/settlement/prepare`, { calculationId: calc.calculation.id });
  return sid;
}
const calcId = await build(`R5 calc ${stamp}`, "calculated");
const readyId = await build(`R5 ready ${stamp}`, "ready");
const preparedId = await build(`R5 prepared ${stamp}`, "prepared");

async function signIn(page, name) {
  await page.context().clearCookies();
  await page.goto(BASE + "/sign-in");
  await page.locator("#auth-email").fill(`${name}@example.test`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#login-password").fill(PW);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(BASE + "/");
}
async function settled(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
}
async function axeScan(page, label, w) {
  await page.evaluate(axeSource);
  const res = await page.evaluate(async () => {
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, target: v.nodes[0]?.target?.join(" ") ?? "" }));
  });
  for (const v of res) axeFindings.push(`${label} @${w}: [${v.impact}] ${v.id}: ${v.help} (${v.nodes} node(s); ${v.target})`);
  return res.length;
}
const overflowOf = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const ROUTES = (role) => [
  ["discover", "/discover"], ["overview", "/"], ["sessions", "/sessions"], ["create-session", "/sessions/new"],
  ["obligations", "/obligations"], ["reviews", "/reviews"], ["activity", "/activity"],
  ["organization-overview", "/organization"], ["organization-members", "/organization?tab=members"], ["organization-institutions", "/organization?tab=institutions"], ["organization-wallets", "/organization?tab=wallets"],
  ["settings", "/settings"], ["notifications", "/notifications"],
  ...["overview", "participants", "obligations", "netting", "settlement", "activity"].map((t) => [`workspace-${t}`, t === "overview" ? `/sessions/${preparedId}` : `/sessions/${preparedId}?tab=${t}`]),
  ...(role === "admin" ? [["workspace-settlement-sign", `/sessions/${preparedId}?tab=settlement&step=sign`]] : []),
];

async function dialogCopy(page, label, shotName) {
  const d = page.getByRole("dialog").last();
  try { await d.waitFor({ state: "visible", timeout: 8000 }); } catch { check(false, `${label}: nothing opened`); return false; }
  const text = (await d.innerText()).replace(/\n{2,}/g, "\n");
  appendFileSync(notes, `=== ${label}\n${text}\n\n`);
  if (shotName) await page.screenshot({ path: `${out}/${shotName}-1440.png` });
  check(true, `${label}: opened and its copy was captured`);
  await page.keyboard.press("Escape");
  await d.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  return true;
}
async function open(page, path, label, shot, fn) {
  await page.goto(BASE + path); await settled(page);
  try { await fn(); } catch (e) { check(false, `${label}: could not be opened (${String(e).slice(0, 90)})`); return; }
  await dialogCopy(page, label, shot);
}
const btn = (page, name) => page.getByRole("button", { name, exact: true }).locator("visible=true").first();

// ============ (1) axe + (2) overflow ============
for (const role of ["signed-out", "member", "admin"]) {
  for (const w of [1440, 390, 360]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
    await ctx.addInitScript(() => { try { sessionStorage.setItem("tobin-sheet", "open"); } catch { /* */ } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => problems.push(`${role}@${w}: page error ${e}`));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`${role}@${w}: console error ${m.text().slice(0, 140)}`); });
    let routes;
    if (role === "signed-out") { routes = [["discover", "/discover"], ["sign-in", "/sign-in"]]; }
    else { await signIn(page, role === "admin" ? "alice" : "carol"); routes = ROUTES(role); }
    for (const [label, path] of routes) {
      await page.goto(BASE + path); await settled(page);
      const o = await overflowOf(page);
      if (w <= 390) check(o <= 0, `${role} ${label} @${w}: no horizontal overflow (${o}px)`);
      if (w !== 360) await axeScan(page, `${role} ${label}`, w);
      if (w === 1440 && role !== "signed-out") await page.screenshot({ path: `${out}/${role}-${label}-1440.png` });
    }
    await ctx.close();
  }
}

// ============ (3) every dialog and sheet, once ============
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`dialogs: page error ${e}`));
  // signed out
  await page.goto(BASE + "/sign-in"); await settled(page);
  await open(page, "/sign-in", "Connect wallet (sign-in)", "dlg-connect-signin", () => page.getByRole("button", { name: "Continue with wallet" }).click());

  await signIn(page, "alice");
  await open(page, "/", "Command panel", "dlg-command", () => page.getByRole("button", { name: /search|command/i }).first().click());
  await open(page, "/settings", "Sign out everywhere", "dlg-signout", () => btn(page, "Sign out everywhere").click());
  await open(page, "/organization?tab=wallets", "Connect a wallet", "dlg-connect-wallet", () => btn(page, "Connect a wallet").click());
  await open(page, "/organization?tab=members", "Member sheet", "dlg-member-sheet", () => page.getByRole("button", { name: /^Open Carol/ }).first().click());
  for (const [name, label] of [["Change role", "Change role dialog"], ["Grant reviewer capability", "Grant reviewer dialog"], ["Suspend member", "Suspend dialog"], ["Remove member", "Remove dialog"]]) {
    await page.goto(BASE + "/organization?tab=members"); await settled(page);
    await page.getByRole("button", { name: /^Open Carol/ }).first().click();
    try { await btn(page, name).click(); } catch { check(false, `${label}: could not be opened`); continue; }
    await dialogCopy(page, label, "dlg-" + name.toLowerCase().replace(/\W+/g, "-"));
    await page.keyboard.press("Escape");
  }
  await open(page, "/obligations", "Obligation sheet (global)", "dlg-obligation-global", () => page.getByRole("button", { name: /^Open obligation/ }).first().click());
  await open(page, "/activity", "Activity record panel", "dlg-activity-record", () => page.getByRole("list", { name: "Activity" }).getByRole("button").first().click());
  await open(page, `/sessions/${calcId}?tab=netting`, "Run netting confirmation", "dlg-run-netting", () => btn(page, "Run netting").click());
  await open(page, `/sessions/${calcId}?tab=obligations`, "Obligation sheet (workspace)", "dlg-obligation-ws", () => page.getByRole("button", { name: /^View obligation/ }).first().click());
  await open(page, `/sessions/${calcId}?tab=obligations`, "Void obligation", "dlg-void", async () => { await page.getByRole("button", { name: /^View obligation/ }).first().click(); await btn(page, "Void obligation").click(); });
  await open(page, `/sessions/${calcId}?tab=obligations`, "Calculation details sheet", "dlg-calc-details", async () => { await page.goto(BASE + `/sessions/${calcId}?tab=netting`); await settled(page); await btn(page, "Calculation details").click(); });
  await open(page, `/sessions/${calcId}`, "Mark ready", "dlg-mark-ready", () => btn(page, "Mark ready").click());
  await open(page, `/sessions/${readyId}`, "Reopen session", "dlg-reopen", () => btn(page, "Reopen session").click());

  await signIn(page, "bob");
  await open(page, `/sessions/${calcId}?tab=settlement&step=review`, "Approve calculation", "dlg-approve-calc", () => btn(page, "Approve").click());
  await open(page, `/sessions/${calcId}?tab=settlement&step=review`, "Reject calculation", "dlg-reject-calc", () => btn(page, "Reject").click());
  await open(page, `/sessions/${preparedId}?tab=settlement&step=batch`, "Approve settlement", "dlg-approve-batch", () => btn(page, "Approve settlement").click());
  await open(page, `/sessions/${preparedId}?tab=settlement&step=batch`, "Reject settlement", "dlg-reject-batch", () => btn(page, "Reject settlement").click());
  await ctx.close();
}
await alice.ctx.close(); await bob.ctx.close();
await browser.close();

console.log("\naxe findings (all impacts):");
if (axeFindings.length === 0) console.log("  none: zero violations on every scan");
for (const f of [...new Set(axeFindings)]) console.log("  " + f);
writeFileSync(`${out}/axe-findings.txt`, axeFindings.join("\n") + "\n");
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log(" - " + p); }
process.exit(problems.length || axeFindings.length ? 1 : 0);
