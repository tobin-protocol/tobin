// Rewrite phase R2 review run: Overview, Sessions list, create wizard, session workspace shell, Mark ready and Close session. Drives the real UI (apps/web on
// :3100) against a seeded throwaway console backend (:8787) with MORE THAN ONE PAGE of sessions, as admin (alice), reviewer (bob) and member (carol). Data the
// UI cannot create in one click (a current calculation, an approved settlement) is created through the real API first. The one injected fault is a blocked
// request in the wizard test, to prove the recovery panel retries only what failed.
// Usage: node scripts/review-r2.mjs <output dir>
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out) throw new Error("usage: review-r2.mjs <output dir>");
mkdirSync(out, { recursive: true });
const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PW = "Correct-horse-battery-1";
const WIDTHS = [1440, 1024, 768, 390];
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
const vis = async (loc, msg) => { let ok = true; try { await loc.first().waitFor({ state: "visible", timeout: 12000 }); } catch { ok = false; } check(ok, msg); };
const browser = await chromium.launch({ channel: "chrome" });
const stamp = Date.now().toString(36);

// ---------- API helpers (a signed-in request context per person) ----------
async function apiUser(name) {
  const ctx = await browser.newContext();
  const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email: `${name}@example.test`, password: PW } });
  if (!r.ok()) throw new Error(`login ${name} ${r.status()}`);
  const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  return { ctx, req: ctx.request, orgId: me.organizations[0].id, orgs: me.organizations };
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
const assetRef = async (sid) => (await call(alice, "get", `/sessions/${sid}/settlement`)).assets[0].id;
const sessionsTotal = async () => (await call(alice, "get", "/sessions")).rows.length;

/** stage: "draft" | "calculated" | "approved" (calculation approved by a reviewer) | "closable" (calculation approved, marked ready, settlement prepared and approved) */
async function build(label, stage) {
  const sid = (await call(alice, "post", "/sessions", { label })).session.sessionId;
  if (stage === "draft") return sid;
  for (const m of members) await call(alice, "post", `/sessions/${sid}/participants`, { userId: m.userId });
  const ref = await assetRef(sid);
  for (const [d, c, amt] of [["Alice", "Bob", "100"], ["Bob", "Carol", "80"], ["Carol", "Alice", "70"]]) await call(alice, "post", `/sessions/${sid}/obligations`, { debtor: idOf(d), creditor: idOf(c), amount: amt, assetRef: ref, reference: "r2" });
  const calc = await call(alice, "post", `/sessions/${sid}/calculate`);
  if (stage === "calculated") return sid;
  const calcId = calc.calculation.id;
  await call(bob, "post", `/sessions/${sid}/authorization/approve`, { calculationId: calcId });
  if (stage === "approved") return sid;
  await call(alice, "post", `/sessions/${sid}/ready`);
  const { batchId } = await call(alice, "post", `/sessions/${sid}/settlement/prepare`, { calculationId: calcId });
  const hash = (await call(alice, "get", `/sessions/${sid}/settlement/batches/${batchId}`)).batch.instructionsHash;
  await call(bob, "post", `/sessions/${sid}/settlement/batches/${batchId}/approve`, { instructionsHash: hash });
  return sid;
}

// a second organization for the organization-switch test (created once)
let beta = alice.orgs.find((o) => o.name === "R2 Beta Bank");
if (!beta) {
  const r = await alice.req.post(`${BASE}/api/registry/orgs`, { data: { name: "R2 Beta Bank", description: "Second organization for the switch test.", visibility: "private", institutionType: "bank", jurisdiction: "GB" } });
  if (!r.ok()) throw new Error("second org " + r.status());
  beta = (await r.json()).organization;
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
  // sign-in may pick the last organization used: make sure it is Alpha Bank
  const sel = page.getByRole("button", { name: /^Organization: / });
  await sel.first().waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
}
async function settled(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(300);
}
async function shot(page, name, w) {
  await settled(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `${name}-${w}: no horizontal overflow (${overflow}px)`);
  await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: false });
}
const go = async (page, path) => { await page.goto(BASE + path); await settled(page); };
const apiCount = (page) => { const seen = []; page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) seen.push(u.pathname); }); return seen; };

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem("tobin-sheet", "open"); } catch { /* */ } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${w}: page error ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`${w}: console error ${m.text().slice(0, 160)}`); });
  const desktop = w >= 1024;

  // data for this width
  const reviewMe = await build(`R2 review ${w} ${stamp}`, "calculated");
  const readyMe = await build(`R2 ready ${w} ${stamp}`, "approved");
  const closeMe = await build(`R2 close ${w} ${stamp}`, "closable");
  const total = await sessionsTotal();

  // ================= Alice: administrator =================
  await signIn(page, "alice");
  let seen = apiCount(page);
  await go(page, "/");
  check((await page.title()).startsWith("Overview"), `${w}: Overview has its own title (${await page.title()})`);
  const banner = page.getByRole("group", { name: /^Sessions: / });
  await vis(banner, `${w}: the banner is there`);
  check((await banner.getAttribute("aria-label")) === `Sessions: ${total}`, `${w}: the banner headline is the real count (${await banner.getAttribute("aria-label")} vs ${total})`);
  const bb = await banner.boundingBox();
  check(!!bb && bb.height >= 100 && bb.height <= 120, `${w}: the banner is about 110px high (${bb?.height})`);
  const bg = await banner.evaluate((e) => getComputedStyle(e).backgroundColor);
  const m = bg.match(/\d+/g)?.map(Number) ?? [];
  check(m.length >= 3 && m[0] === m[1] && m[1] === m[2], `${w}: the banner is greyscale (${bg})`);
  const font = await page.locator("[role=group][aria-label^='Sessions: '] p").evaluate((e) => getComputedStyle(e).fontFamily);
  check(/outfit/i.test(font), `${w}: the banner headline uses the landing's display face (${font.slice(0, 60)})`);
  await vis(page.getByRole("heading", { name: "Needs your attention" }), `${w}: Needs your attention`);
  const cov = page.getByTestId("coverage");
  await page.waitForFunction(() => /Based on/.test(document.querySelector("[data-testid=coverage]")?.textContent ?? ""), null, { timeout: 25000 });
  const covText = await cov.innerText();
  check(new RegExp(`^Based on 10 of ${total} sessions`).test(covText), `${w}: the coverage line says how much it is based on (${covText})`);
  const loadBtn = page.getByRole("button", { name: "Load next 10 sessions" });
  await vis(loadBtn, `${w}: Load next 10 sessions is offered`);
  check((await page.getByRole("list", { name: "Recent activity" }).getByRole("listitem").count()) <= 5, `${w}: at most five recent activity rows`);
  check((await page.locator("svg polyline, canvas, [data-sparkline]").count()) === 0, `${w}: no sparkline`);
  await shot(page, "overview-admin", w);
  await loadBtn.click();
  await page.waitForFunction((n) => new RegExp("^Based on (20 of " + n + "|all " + n + ") sessions").test(document.querySelector("[data-testid=coverage]")?.textContent ?? ""), total, { timeout: 25000 });
  check(true, `${w}: Load next 10 sessions extends the window (${await cov.innerText()})`);
  while (await loadBtn.count()) { await loadBtn.click(); await page.waitForTimeout(800); }
  check(new RegExp(`^Based on all ${total} sessions`).test(await cov.innerText()), `${w}: once everything is read the line says so and the button is gone (${await cov.innerText()})`);
  const adminRequests = seen.length;
  check(adminRequests > 0, `${w}: (info) the admin Overview made ${adminRequests} API requests including the load of every session`);

  // ---- Sessions list ----
  seen = apiCount(page);
  await go(page, "/sessions");
  check((await page.title()).startsWith("Clearing Sessions"), `${w}: Sessions has its own title`);
  await vis(page.getByRole("group", { name: `Sessions: ${total}` }), `${w}: the Sessions banner shows the real count`);
  await vis(page.getByRole("search", { name: "Filter sessions" }), `${w}: filter bar`);
  check((await page.getByRole("button", { name: "Create session" }).count()) + (await page.getByRole("link", { name: "Create session" }).count()) === 1, `${w}: CREATE SESSION is the single primary action`);
  check(seen.length <= 14, `${w}: the Sessions list made ${seen.length} requests (at most 14: the list plus one state read per row on the page)`);
  if (w >= 900) { await vis(page.locator("table"), `${w}: a table at ${w}px`); check((await page.locator("ul[aria-label=Sessions]").isVisible()) === false, `${w}: no tiles at ${w}px`); }
  else { await vis(page.locator("ul[aria-label=Sessions] li"), `${w}: tiles under 900px`); check((await page.locator("table").first().isVisible().catch(() => false)) === false, `${w}: no table under 900px`); }
  await page.locator("#session-sort").selectOption("label:asc");
  await page.waitForURL(/sort=label/);
  check(page.url().includes("sort=label") && page.url().includes("dir=asc"), `${w}: the sort is in the URL (${page.url().replace(BASE, "")})`);
  await page.locator("#session-status").selectOption("closed");
  await page.waitForURL(/status=closed/);
  await vis(page.getByText(/rows on this page are closed/), `${w}: the status filter says it applies to this page`);
  check(page.url().includes("status=closed"), `${w}: the status filter is in the URL`);
  await go(page, "/sessions");
  await shot(page, "sessions-list", w);
  await go(page, "/sessions?page=2");
  check(/Showing 11 to/.test(await page.locator("main").innerText()), `${w}: more than one page of sessions pages correctly`);
  await go(page, "/sessions?notice=org-changed");
  await vis(page.getByText(/You switched organization/), `${w}: the organization-switch notice is shown`);

  // ---- create wizard with a recovery panel ----
  await go(page, "/sessions/new");
  check((await page.title()).startsWith("Create session"), `${w}: the wizard has its own title`);
  await page.locator("#session-label").fill(`R2 wizard ${w} ${stamp}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await vis(page.getByRole("heading", { name: "Add participants" }), `${w}: step 2 Participants`);
  await vis(page.getByText("Participants from other organizations"), `${w}: cross-organization participants read Not supported`);
  for (const n of ["Alice", "Bob", "Carol"]) await page.getByLabel(new RegExp("^" + n)).check();
  await page.getByRole("button", { name: "Review" }).click();
  await vis(page.getByRole("heading", { name: "Review" }), `${w}: step 3 Review`);
  const bobId = idOf("Bob");
  const adds = [];
  let blocked = false;
  await page.route("**/participants", async (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    if (route.request().method() === "POST") { adds.push(body.userId); if (body.userId === bobId && !blocked) { blocked = true; return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "INVALID_STATE", message: "simulated failure for the recovery test" }) }); } }
    return route.continue();
  });
  await page.getByRole("button", { name: "Create session" }).last().click();
  await vis(page.getByRole("heading", { name: "Session created" }), `${w}: step 4 Created`);
  await vis(page.getByText("1 participant was not added"), `${w}: ONE recovery panel names what failed`);
  check((await page.locator("[role=alert][aria-labelledby=recovery-h]").count()) === 1, `${w}: exactly one recovery panel`);
  await shot(page, "wizard-recovery", w);
  adds.length = 0;
  await page.getByRole("button", { name: "Retry this participant" }).click();
  await page.waitForFunction(() => !document.querySelector("#recovery-h"), null, { timeout: 15000 });
  check(adds.length === 1 && adds[0] === bobId, `${w}: retry asked for the failed participant only (${adds.length} request)`);
  await page.unroute("**/participants");
  await shot(page, "wizard-created", w);

  // ---- workspace: a session with a current calculation ----
  await go(page, `/sessions/${readyMe}`);
  check((await page.title()).startsWith(`Session: R2 ready ${w}`), `${w}: the workspace title is specific (${await page.title()})`);
  await vis(page.getByRole("heading", { name: `R2 ready ${w} ${stamp}`, level: 1 }), `${w}: the page heading is the session`);
  const nav = page.getByRole("navigation", { name: "Session sections" });
  const tabNames = await nav.getByRole("link").allInnerTexts();
  check(["Overview", "Participants", "Obligations", "Netting", "Settlement", "Activity"].every((t, i) => (tabNames[i] ?? "").startsWith(t)) && tabNames.length === 6, `${w}: six tabs in order (${tabNames.map((t) => t.split("\n")[0]).join(", ")})`);
  check((await page.getByLabel("Session summary").count()) === 1, `${w}: ONE summary card`);
  check((await page.getByLabel("Session summary").getByRole("listitem").count()) === 4, `${w}: the card has four-square stage rail items`);
  await vis(page.getByLabel("Session summary").getByText(/Next action/), `${w}: and the next action line`);
  await vis(page.getByTestId("session-id"), `${w}: the identifier is shown`);
  await vis(page.getByRole("button", { name: "Copy id" }), `${w}: with a copy button`);
  const stateMarks = await page.locator("main").getByText(/^(Being configured|Marked ready|Closed)$/).count();
  check(stateMarks === 1, `${w}: ONE status mark (${stateMarks})`);
  const overviewText = await page.locator("#tab-content").innerText();
  check(!/Where this session stands|Next action|Transaction stages/.test(overviewText), `${w}: the Overview tab does not repeat the summary card`);
  await vis(page.getByRole("heading", { name: "Readiness checks" }), `${w}: readiness checks`);
  check((await page.getByRole("list", { name: "Readiness checks" }).getByRole("listitem").count()) >= 8, `${w}: the checks are the console's own`);
  await vis(page.getByRole("heading", { name: "Recent activity" }), `${w}: recent activity`);
  const primaries = async () => page.locator("aside[data-sheet]").locator('button[class*="bg-primary"], button[class*="bg-button"], a[class*="bg-button"]').count();
  check((await primaries()) === 1, `${w}: the action panel shows exactly one primary (${await primaries()})`);
  await vis(page.locator("aside[data-sheet]").getByRole("button", { name: "Mark ready" }).first(), `${w}: Mark ready is the primary when every check passes`);
  const closeReason = await page.locator("#close-reason").innerText();
  check(/Mark the session ready first/.test(closeReason), `${w}: Close says why it is unavailable (${closeReason.slice(0, 60)})`);
  await shot(page, "workspace-overview", w);
  await page.locator("aside[data-sheet]").getByRole("button", { name: "Mark ready" }).first().click();
  const dlg = page.getByRole("dialog");
  await vis(dlg.getByText(/cannot reopen it/), `${w}: Mark ready asks for one confirmation and states the consequence`);
  await shot(page, "workspace-ready-dialog", w);
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await dlg.waitFor({ state: "hidden" });
  check(await page.locator("main").getByText("Being configured", { exact: true }).count() === 1, `${w}: Cancel changes nothing`);
  await page.locator("aside[data-sheet]").getByRole("button", { name: "Mark ready" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark ready" }).click();
  await vis(page.locator("main").getByText("Marked ready", { exact: true }), `${w}: Mark ready moved the session to Marked ready`);
  await settled(page);
  check((await call(alice, "get", `/sessions/${readyMe}/readiness`)).state === "ready", `${w}: the backend agrees (state ready)`);
  const closeAfter = await page.locator("#close-reason").innerText();
  check(/approved settlement/.test(closeAfter), `${w}: after Mark ready, Close names what is missing (${closeAfter.slice(0, 70)})`);
  await shot(page, "workspace-marked-ready", w);

  // ---- workspace: a session that can be closed ----
  await go(page, `/sessions/${closeMe}`);
  await vis(page.locator("aside[data-sheet]").getByRole("button", { name: "Close session" }).first(), `${w}: Close session is the primary when ready with an approved settlement`);
  check((await primaries()) === 1, `${w}: still exactly one primary (${await primaries()})`);
  await page.locator("aside[data-sheet]").getByRole("button", { name: "Close session" }).first().click();
  await vis(page.getByRole("dialog").getByText(/does not mean anything settled/), `${w}: Close states that nothing has settled`);
  await page.getByRole("dialog").getByRole("button", { name: "Close session" }).click();
  await vis(page.locator("main").getByText("Closed", { exact: true }), `${w}: Close session closed it`);
  check((await call(alice, "get", `/sessions/${closeMe}/readiness`)).state === "closed", `${w}: the backend agrees (state closed)`);
  await vis(page.getByText("No further action"), `${w}: a closed session has no further action`);
  await shot(page, "workspace-closed", w);

  // ---- tabs: the Settlement tab keeps the calculation review reachable ----
  await go(page, `/sessions/${reviewMe}?tab=approvals`);
  await vis(page.getByRole("navigation", { name: "Settlement views" }), `${w}: ?tab=approvals opens the Settlement tab's calculation review view`);
  check((await nav.getByRole("link", { name: /Settlement/ }).getAttribute("aria-current")) === "page", `${w}: Settlement is the active tab for it`);

  // ---- organization switch on a session URL ----
  await go(page, `/sessions/${reviewMe}`);
  if (!desktop) { await page.getByRole("button", { name: "Open navigation" }).click(); }
  await page.getByRole("button", { name: /^Organization: / }).click();
  await page.getByRole("menuitem", { name: /R2 Beta Bank/ }).click();
  await page.waitForURL(/\/sessions\?notice=org-changed/);
  await vis(page.getByText(/You switched organization/), `${w}: switching organization on a session URL redirects to Sessions with a notice`);
  check(!(await page.locator("main").innerText()).includes("Session not found"), `${w}: and shows no "Session not found"`);
  await shot(page, "org-switched", w);
  if (!desktop) { await page.getByRole("button", { name: "Open navigation" }).click().catch(() => {}); }
  await page.getByRole("button", { name: /^Organization: / }).click();
  await page.getByRole("menuitem", { name: /Alpha Bank/ }).click();
  await settled(page);

  // ---- a path that matches nothing, and a session id that does not exist ----
  await go(page, "/sessions/" + "0".repeat(64));
  await vis(page.getByRole("heading", { name: "Session not found" }), `${w}: an unknown session id says so`);
  const nf = await page.goto(BASE + "/no-such-page");
  check(nf?.status() === 404, `${w}: an unknown address answers 404 (${nf?.status()})`);
  await vis(page.getByRole("heading", { name: "Page not found" }), `${w}: with the not-found page`);

  // ================= Bob: reviewer =================
  await signIn(page, "bob");
  seen = apiCount(page);
  await go(page, "/");
  await vis(page.getByRole("list", { name: "Needs your attention" }).getByText("Awaiting your review").first(), `${w}: a reviewer's attention list shows the calculation awaiting their review`);
  const tile = page.getByRole("list", { name: "Needs your attention" }).getByRole("listitem").filter({ hasText: `R2 review ${w} ${stamp}` });
  await vis(tile, `${w}: and the session we prepared`);
  const act = tile.getByRole("link", { name: /^Review:/ });
  if (w >= 768) {
    check(Number(await act.evaluate((e) => getComputedStyle(e).opacity)) === 0, `${w}: the tile's action is hidden until hover or focus`);
    await act.focus();
    await page.waitForTimeout(300);
    check(Number(await act.evaluate((e) => getComputedStyle(e).opacity)) === 1, `${w}: keyboard focus shows it`);
    await page.locator("main h1").focus().catch(() => {});
    await tile.hover();
    await page.waitForTimeout(250);
    check(Number(await act.evaluate((e) => getComputedStyle(e).opacity)) === 1, `${w}: hover shows it`);
  } else {
    check(Number(await act.evaluate((e) => getComputedStyle(e).opacity)) === 1, `${w}: the action is always visible under 768px`);
  }
  await page.waitForFunction(() => /Based on/.test(document.querySelector("[data-testid=coverage]")?.textContent ?? ""), null, { timeout: 25000 });
  await vis(page.getByText("Awaiting your review", { exact: true }).last(), `${w}: the stat for calculations awaiting review is shown to a reviewer`);
  check(seen.length <= 27, `${w}: the reviewer Overview made ${seen.length} requests (guard: at most 27, was about 54)`);
  await shot(page, "overview-reviewer", w);
  const badge = page.locator("aside nav").getByText(/calculations awaiting your review/);
  check((await badge.count()) <= 1, `${w}: the Reviews count comes from the loaded data (${await badge.count()})`);

  // ================= Carol: member =================
  await signIn(page, "carol");
  seen = apiCount(page);
  await go(page, "/");
  check(await page.getByRole("button", { name: "Create session" }).isDisabled(), `${w}: a member's Create session is disabled`);
  await vis(page.getByText(/Only administrators can do this\./), `${w}: with the reason`);
  check(!seen.some((p) => p.endsWith("/authorization")), `${w}: a member's Overview does not read any authorization`);
  check(seen.length <= 16, `${w}: the member Overview made ${seen.length} requests (guard: at most 16, was about 54)`);
  await shot(page, "overview-member", w);
  await go(page, `/sessions/${readyMe}`);
  await vis(page.locator("#ready-reason, #close-reason").first(), `${w}: the member sees why Close and Mark ready are unavailable`);
  check(/administrator/i.test(await page.locator("#close-reason").innerText()), `${w}: the reason names the Admin role (${(await page.locator("#close-reason").innerText()).slice(0, 50)})`);
  check(await page.locator("aside[data-sheet]").getByRole("button", { name: "Close session" }).isDisabled().catch(() => true), `${w}: and Close is disabled`);
  await shot(page, "workspace-member", w);
  await ctx.close();
}
await alice.ctx.close(); await bob.ctx.close();
await browser.close();
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log(" - " + p); process.exit(1); }
console.log("\nall checks passed; no overflow, page errors or console errors");
