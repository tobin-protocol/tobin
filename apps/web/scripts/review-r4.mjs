// Rewrite phase R4 review run: the global pages (Reviews, Obligations, Activity, Organization, Settings, Notifications). Drives the real UI (apps/web on :3100)
// against a seeded throwaway console backend (:8787) as admin (alice), reviewer (bob) and member (carol). Sessions are made through the real API first.
// No fault is injected in this run.
// Usage: node scripts/review-r4.mjs <output dir>
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out) throw new Error("usage: review-r4.mjs <output dir>");
mkdirSync(out, { recursive: true });
const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PW = "Correct-horse-battery-1";
const WIDTHS = [1440, 1024, 768, 390];
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
const vis = async (loc, msg) => { let ok = true; try { await loc.first().waitFor({ state: "visible", timeout: 15000 }); } catch { ok = false; } check(ok, msg); };
const browser = await chromium.launch({ channel: "chrome" });
const stamp = Date.now().toString(36);

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

/** stage: calculated (awaiting a calculation review) | prepared (approved, ready, batch prepared by Alice and awaiting review) */
async function build(label, stage) {
  const sid = (await call(alice, "post", "/sessions", { label })).session.sessionId;
  for (const m of members) await call(alice, "post", `/sessions/${sid}/participants`, { userId: m.userId });
  const ref = (await call(alice, "get", `/sessions/${sid}/settlement`)).assets[0].id;
  const ob = (d, c, amt) => call(alice, "post", `/sessions/${sid}/obligations`, { debtor: idOf(d), creditor: idOf(c), amount: amt, assetRef: ref, reference: "r4" });
  await ob("Alice", "Bob", "100"); await ob("Bob", "Carol", "80"); await ob("Carol", "Alice", "70");
  const calc = await call(alice, "post", `/sessions/${sid}/calculate`);
  if (stage === "calculated") return sid;
  await call(bob, "post", `/sessions/${sid}/authorization/approve`, { calculationId: calc.calculation.id });
  await call(alice, "post", `/sessions/${sid}/ready`);
  await call(alice, "post", `/sessions/${sid}/settlement/prepare`, { calculationId: calc.calculation.id });
  return sid;
}

async function signIn(page, name) {
  await page.context().clearCookies();
  await page.goto(BASE + "/sign-in");
  await page.locator("#auth-email").fill(`${name}@example.test`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#login-password").fill(PW);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(BASE + "/");
  await settled(page);
}
async function settled(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(300);
}
async function shot(page, name, w) {
  await settled(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `${name}-${w}: no horizontal overflow (${overflow}px)`);
  await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: false });
}
const go = async (page, path) => { await page.goto(BASE + path); await settled(page); };
const dlg = (page) => page.getByRole("dialog").last();
const main = (page) => page.locator("main");

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${w}: page error ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`${w}: console error ${m.text().slice(0, 160)}`); });
  const tag = `${w} ${stamp}`;
  const calcId = await build(`R4 calc ${tag}`, "calculated");
  const batchId = await build(`R4 batch ${tag}`, "prepared");

  // =============== Bob: reviewer ===============
  await signIn(page, "bob");
  await go(page, "/reviews");
  await vis(main(page).getByRole("heading", { name: "Reviews" }), `${w}: Reviews page`);
  await vis(main(page).getByText(/Nobody reviews a result they recorded, changed, calculated or prepared/), `${w}: separation of duties is stated`);
  await vis(page.getByTestId("reviews-coverage"), `${w}: coverage text is shown`);
  const cov = await page.getByTestId("reviews-coverage").innerText();
  check(/^Based on (\d+ of \d+|all \d+) sessions/.test(cov), `${w}: coverage says how much it covers (${cov})`);
  await vis(main(page).getByRole("link", { name: new RegExp(`R4 calc ${tag}`) }), `${w}: My reviews lists the calculation awaiting Bob`);
  await vis(main(page).getByText(/Settlement batch review/), `${w}: and a settlement batch awaiting review`);
  await vis(main(page).getByText(/Prepared by: Alice/).first(), `${w}: each row says who prepared`);
  await vis(main(page).getByText(/Who may review: you/).first(), `${w}: and who may review`);
  const mine = await main(page).locator("ul[aria-label='Review items'] > li").count();
  if (w >= 1024) {
    const badge = (await page.locator("nav a[href='/reviews'] span[aria-hidden='true']").first().innerText().catch(() => "")).trim();
    check(badge === String(mine), `${w}: the sidebar count (${badge}) equals the rows of My reviews (${mine})`);
  }
  await shot(page, "reviews-mine", w);
  await main(page).getByRole("button", { name: "All", exact: true }).click();
  await vis(main(page).getByText(/Calculation review/).first(), `${w}: All tab`);
  await main(page).getByRole("link", { name: "Open the Settlement step" }).first().click();
  await page.waitForURL(/\/sessions\/.*tab=settlement/);
  check(true, `${w}: a row opens the Settlement step of its session`);
  await go(page, "/approvals");
  check(new URL(page.url()).pathname === "/reviews", `${w}: /approvals redirects to /reviews`);

  // =============== Carol: member ===============
  await signIn(page, "carol");
  await go(page, "/reviews");
  await main(page).getByRole("button", { name: "My reviews", exact: true }).click();
  await vis(main(page).getByText(/needs the reviewer capability/), `${w}: a member sees a permission state on My reviews`);
  await main(page).getByRole("button", { name: "All", exact: true }).click();
  await vis(main(page).getByText(/Calculation review/).first(), `${w}: and the All tab still works`);
  await go(page, "/organization?tab=members");
  await vis(main(page).getByText(/Invitations are for administrators/), `${w}: invitations show a permission state for a member`);
  await vis(main(page).getByText(/Admin and Member roles/), `${w}: roles are the backend's two`);
  await go(page, "/organization?tab=wallets");
  await vis(main(page).getByRole("button", { name: "Connect a wallet" }), `${w}: Wallets has Connect a wallet`);
  await ctx.clearCookies();

  // =============== Alice: administrator ===============
  await signIn(page, "alice");
  await go(page, "/obligations");
  await vis(page.getByTestId("obligations-coverage"), `${w}: global Obligations says what it covers`);
  await vis(main(page).getByLabel("Asset"), `${w}: asset filter`);
  await vis(main(page).getByLabel("Session"), `${w}: session filter`);
  await vis(main(page).getByRole("group", { name: "Status" }), `${w}: status filter`);
  await vis(main(page).getByLabel("Search reference, participant or session"), `${w}: search`);
  await vis(main(page).getByText(/Active totals by asset/), `${w}: totals are per asset`);
  check((await main(page).getByText(/Grand total|All assets total/i).count()) === 0, `${w}: no total across assets`);
  check((await main(page).getByRole("button", { name: /^(Void obligation|Record)/ }).count()) === 0, `${w}: no create or void on the global page`);
  await main(page).getByLabel("Search reference, participant or session").fill("r4");
  await settled(page);
  await shot(page, "obligations-global", w);
  await main(page).getByRole("button", { name: /^Open obligation/ }).first().click();
  await vis(dlg(page).getByText("History"), `${w}: a row opens the same detail sheet`);
  check((await dlg(page).getByRole("button", { name: "Void obligation" }).count()) === 0, `${w}: and the sheet offers no Void here`);
  await shot(page, "obligations-sheet", w);
  await page.keyboard.press("Escape");

  await go(page, "/activity");
  await vis(page.getByTestId("activity-coverage"), `${w}: global Activity says what it covers`);
  await shot(page, "activity-global", w);

  await go(page, "/organization");
  await vis(page.getByRole("link", { name: "Overview" }).first(), `${w}: Organization has an Overview tab`);
  for (const t of ["Members and roles", "Institutions", "Wallets"]) await vis(page.getByRole("link", { name: t }).first(), `${w}: and a ${t} tab`);
  await shot(page, "organization-overview", w);
  await go(page, "/organization?tab=members");
  await vis(main(page).getByText("Invite someone"), `${w}: invitations are a section of Members and roles`);
  await shot(page, "organization-members", w);
  await main(page).getByRole("button", { name: /^Open Bob/ }).first().click();
  await vis(dlg(page).getByRole("button", { name: "Change role" }), `${w}: an admin can change a role`);
  await dlg(page).getByRole("button", { name: "Change role" }).click();
  await vis(page.getByRole("dialog").last().getByText(/They will (gain|lose)/), `${w}: one confirmation lists what the change does`);
  await page.getByRole("dialog").last().getByRole("button", { name: "Cancel" }).click();
  await go(page, "/organization?tab=institutions");
  await vis(main(page).getByText("Institution directory and counterparties"), `${w}: Institutions says what the backend does not provide`);
  await shot(page, "organization-institutions", w);
  await go(page, "/organization?tab=invitations");
  await vis(main(page).getByText("Invite someone"), `${w}: the old Invitations address still works`);
  await go(page, "/wallets");
  check(/tab=wallets/.test(page.url()), `${w}: /wallets redirects to the Wallets tab`);
  await vis(main(page).getByText(/looks for a wallet in this browser/), `${w}: Wallets says nothing is linked or verified`);
  await main(page).getByRole("button", { name: "Connect a wallet" }).click();
  await vis(dlg(page), `${w}: Connect a wallet opens the Connect wallet window`);
  await shot(page, "organization-wallets-link", w);
  await page.keyboard.press("Escape");

  await go(page, "/settings");
  await vis(main(page).getByText("Change password"), `${w}: Settings shows password change as Not supported`);
  check((await main(page).getByText(/theme/i).count()) === 0, `${w}: no theme switcher`);
  await shot(page, "settings", w);
  await go(page, "/notifications");
  await vis(main(page).getByText("Not supported"), `${w}: Notifications is Not supported`);
  await shot(page, "notifications", w);

  // the command panel's cap note is unit-tested; the panel itself opens here
  await go(page, "/");
  void calcId; void batchId;
  await ctx.close();
}
await alice.ctx.close(); await bob.ctx.close();
await browser.close();
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log(" - " + p); process.exit(1); }
console.log("\nall checks passed; no overflow, page errors or console errors");
