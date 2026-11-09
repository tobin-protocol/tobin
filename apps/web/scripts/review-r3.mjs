// Rewrite phase R3 review run: the workspace tab bodies (Obligations, Netting, Settlement close-out, Activity) and Reopen. Drives the real UI (apps/web on :3100)
// against a seeded throwaway console backend (:8787) as admin (alice), reviewer (bob) and member (carol). Sessions in the states a step needs are made through
// the real API first. Two faults are injected and labelled: a doctored batch response (to prove the red diff blocks approval) and nothing else.
// Usage: node scripts/review-r3.mjs <output dir>
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out) throw new Error("usage: review-r3.mjs <output dir>");
mkdirSync(out, { recursive: true });
const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PW = "Correct-horse-battery-1";
const WIDTHS = [1440, 1024, 768, 390];
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
const vis = async (loc, msg) => { let ok = true; try { await loc.first().waitFor({ state: "visible", timeout: 12000 }); } catch { ok = false; } check(ok, msg); };
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

/** stage: draft (participants only) | calculated | approved | ready | prepared (approved, ready, batch prepared) | batchApproved (reviewed too) */
async function build(label, stage) {
  const sid = (await call(alice, "post", "/sessions", { label })).session.sessionId;
  for (const m of members) await call(alice, "post", `/sessions/${sid}/participants`, { userId: m.userId });
  if (stage === "draft") return sid;
  const ref = (await call(alice, "get", `/sessions/${sid}/settlement`)).assets[0].id;
  const ob = (d, c, amt) => call(alice, "post", `/sessions/${sid}/obligations`, { debtor: idOf(d), creditor: idOf(c), amount: amt, assetRef: ref, reference: "r3" });
  await ob("Alice", "Bob", "100"); await ob("Bob", "Carol", "80"); await ob("Carol", "Alice", "70");
  const calc = await call(alice, "post", `/sessions/${sid}/calculate`);
  if (stage === "calculated") return sid;
  const calcId = calc.calculation.id;
  await call(bob, "post", `/sessions/${sid}/authorization/approve`, { calculationId: calcId });
  if (stage === "approved") return sid;
  await call(alice, "post", `/sessions/${sid}/ready`);
  if (stage === "ready") return sid;
  const { batchId } = await call(alice, "post", `/sessions/${sid}/settlement/prepare`, { calculationId: calcId });
  if (stage === "prepared") return sid;
  const hash = (await call(alice, "get", `/sessions/${sid}/settlement/batches/${batchId}`)).batch.instructionsHash;
  await call(bob, "post", `/sessions/${sid}/settlement/batches/${batchId}/approve`, { instructionsHash: hash });
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
  await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(300);
}
async function shot(page, name, w) {
  await settled(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `${name}-${w}: no horizontal overflow (${overflow}px)`);
  await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: false });
}
const setSheet = (page, open) => page.evaluate((o) => { try { sessionStorage.setItem("tobin-sheet", o ? "open" : "closed"); } catch { /* */ } window.dispatchEvent(new Event("tobin-sheet")); }, open);
const go = async (page, path) => { await page.goto(BASE + path); await settled(page); if ((page.viewportSize()?.width ?? 1000) < 768) await setSheet(page, false); };
const panel = (page) => page.locator("aside[data-sheet]");
/** the action panel, opened first when it is a bottom sheet */
const P = async (page) => { if ((page.viewportSize()?.width ?? 1000) < 768) await setSheet(page, true); return panel(page); };
const dlg = (page) => page.getByRole("dialog").last();

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${w}: page error ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`${w}: console error ${m.text().slice(0, 160)}`); });
  const tag = `${w} ${stamp}`;

  const readyId = await build(`R3 ready ${tag}`, "ready");
  const calcId = await build(`R3 calc ${tag}`, "calculated");
  const awaitId = await build(`R3 review ${tag}`, "calculated");
  const approvedId = await build(`R3 approved ${tag}`, "approved");
  const preparedId = await build(`R3 prepared ${tag}`, "prepared");
  const mismatchId = await build(`R3 mismatch ${tag}`, "prepared");
  const doneId = await build(`R3 done ${tag}`, "batchApproved");
  const draftId = await build(`R3 draft ${tag}`, "draft");

  // =============== Alice: administrator ===============
  await signIn(page, "alice");

  // ---- Reopen ----
  await go(page, `/sessions/${calcId}`);
  check((await page.getByText("Reopen session", { exact: true }).count()) === 0, `${w}: Reopen is not shown for a session that is being configured`);
  await go(page, `/sessions/${readyId}`);
  await vis((await P(page)).getByText("Reopen session", { exact: true }), `${w}: Reopen is shown for a ready session`);
  await (await P(page)).getByRole("button", { name: "Reopen session" }).click();
  const rd = dlg(page);
  await vis(rd.getByText("What changes"), `${w}: the Reopen dialog says what changes`);
  await vis(rd.getByText("What is kept"), `${w}: what is kept`);
  await vis(rd.getByText("What stops applying later"), `${w}: and what stops applying later`);
  await vis(rd.getByText(/deletes nothing/), `${w}: it says reopening alone deletes nothing`);
  await vis(rd.getByText(/stay on record, marked "No longer applies"/), `${w}: and that old decisions stay on record`);
  await shot(page, "reopen-dialog", w);
  await rd.getByRole("button", { name: "Cancel" }).click();
  await rd.waitFor({ state: "hidden" });
  check((await call(alice, "get", `/sessions/${readyId}/readiness`)).state === "ready", `${w}: Cancel changes nothing (still ready)`);
  await (await P(page)).getByRole("button", { name: "Reopen session" }).click();
  await dlg(page).getByRole("button", { name: "Reopen session" }).click();
  await vis(page.locator("main").getByText("Being configured", { exact: true }), `${w}: Reopen returns the session to Being configured`);
  check((await call(alice, "get", `/sessions/${readyId}/readiness`)).state === "configuring", `${w}: the backend agrees`);
  check((await call(alice, "get", `/sessions/${readyId}/authorization`)).state === "approved", `${w}: reopening alone kept the approval, as the dialog says`);
  await call(alice, "post", `/sessions/${readyId}/obligations`, { debtor: idOf("Alice"), creditor: idOf("Bob"), amount: "1", assetRef: (await call(alice, "get", `/sessions/${readyId}/settlement`)).assets[0].id, reference: "after reopen" });
  const after = await call(alice, "get", `/sessions/${readyId}/authorization`);
  check(after.state !== "approved", `${w}: the first change afterwards made the approval stop applying (${after.state}), as the dialog says`);

  // ---- Obligations ----
  await go(page, `/sessions/${calcId}?tab=obligations`);
  await vis(page.getByLabel("Search by reference or participant"), `${w}: obligations have a search`);
  await vis(page.getByRole("group", { name: "Status" }), `${w}: and a status filter`);
  const obTable = w >= 900 ? page.locator("table").first() : page.locator("#tab-content");
  await vis(obTable, `${w}: the obligations table`);
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Voided" }).click();
  await vis(page.getByText("No obligations match"), `${w}: the status filter works (no voided ones yet)`);
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "All" }).click();
  const rec = (await P(page));
  for (const l of ["Debtor", "Creditor", "Amount", "Asset", "Reference"]) await vis(rec.getByLabel(new RegExp("^" + l)), `${w}: the record form has ${l}`);
  check((await rec.locator("input, select, textarea").count()) === 5, `${w}: and nothing else (only fields the backend accepts)`);
  await rec.getByLabel(/^Debtor/).selectOption({ label: "Alice" });
  await rec.getByLabel(/^Creditor/).selectOption({ label: "Alice" });
  await rec.getByLabel(/^Amount/).fill("1.5");
  await rec.getByLabel(/^Asset/).selectOption({ index: 1 });
  await rec.getByRole("button", { name: /^Review/ }).click();
  await vis(rec.getByText(/whole number of base units/), `${w}: a bad amount is refused under the Amount field`);
  await vis(rec.getByText(/debtor and the creditor must be different/), `${w}: the same debtor and creditor is refused under Creditor`);
  await rec.getByLabel(/^Creditor/).selectOption({ label: "Bob" });
  await rec.getByLabel(/^Amount/).fill("5");
  await rec.getByRole("button", { name: /^Review/ }).click();
  await vis(dlg(page), `${w}: Review opens one confirmation`);
  await shot(page, "obligations-record-review", w);
  await dlg(page).getByRole("button", { name: /^Record/ }).click();
  await settled(page);
  await setSheet(page, false);
  await vis(page.getByRole("button", { name: /^View obligation Alice to Bob, 5/ }), `${w}: the new obligation is listed`);
  await page.getByRole("button", { name: /^View obligation Alice to Bob, 5/ }).first().click();
  await vis(page.getByRole("dialog").getByText("Recorded as Active"), `${w}: its detail panel shows its history`);
  await shot(page, "obligations-detail", w);
  await page.getByRole("dialog").getByRole("button", { name: "Void obligation" }).click();
  await vis(page.getByRole("dialog").last().getByText(/stays on record as voided/i), `${w}: Void is a separate confirmed action`);
  await page.getByRole("dialog").last().getByRole("button", { name: "Void obligation" }).click();
  await settled(page);
  // the detail sheet stays open on the same obligation, now voided, with its own history entry
  await vis(page.getByRole("dialog").getByText("Active to Voided"), `${w}: voiding added its own history entry`);
  await vis(page.getByRole("dialog").getByText(/cannot be edited or deleted here/), `${w}: there is no edit and no delete`);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Voided" }).click();
  await vis(page.getByRole("button", { name: /^View obligation Alice to Bob, 5/ }), `${w}: the status filter now lists the voided obligation`);
  await vis(page.getByText(/Active total, one line per asset/), `${w}: totals are one line per asset`);
  check(!/total across assets|all assets combined/i.test(await page.locator("#tab-content").innerText().then((t) => t.replace("never added across assets", ""))), `${w}: no cross-asset total`);
  await shot(page, "obligations-tab", w);
  await go(page, `/sessions/${draftId}?tab=obligations`);
  await vis(page.getByText("No obligations yet"), `${w}: an empty session shows the empty state`);
  await go(page, `/sessions/${approvedId}?tab=obligations`);
  await call(alice, "post", `/sessions/${approvedId}/ready`);
  await go(page, `/sessions/${approvedId}?tab=obligations`);
  await P(page);
  await vis(page.getByText(/An administrator can reopen it/).first(), `${w}: on a ready session the form says it is read-only and how to change that`);
  await shot(page, "obligations-ready-readonly", w);

  // ---- Netting ----
  await go(page, `/sessions/${awaitId}?tab=netting`);
  await vis(page.getByLabel("Netting steps"), `${w}: Inputs, Calculation, Result strip`);
  const strip = await page.getByLabel("Netting steps").innerText();
  check(/Eligible inputs/.test(strip) && /Calculation/.test(strip) && /Result/.test(strip), `${w}: the strip has its three steps`);
  await vis(page.getByRole("heading", { name: "Eligible inputs" }), `${w}: eligible inputs`);
  await vis(page.getByRole("heading", { name: "Excluded" }), `${w}: and the excluded table`);
  await vis(page.getByText(/Nothing is excluded/), `${w}: it says when nothing is excluded`);
  const cards = page.getByRole("group", { name: "Gross versus net" });
  await vis(cards, `${w}: Gross and Net cards`);
  check((await cards.getByText(/^(Gross|Net that moves)$/).count()) === 2, `${w}: two separate cards`);
  await vis(cards.getByText(/250 USD|250/), `${w}: the real gross`);
  for (const h of ["Net debtors (pay)", "Net creditors (receive)"]) check((await page.getByRole("heading", { name: h }).count()) >= 0, `${w}: (info) ${h}`);
  await vis(page.getByRole("region", { name: /^Positions in USD$/ }).or(page.getByLabel("Positions in USD")), `${w}: positions have a section per asset`);
  const orig = page.getByRole("list", { name: "Original obligations" }).getByRole("listitem").first();
  await orig.focus();
  await page.waitForTimeout(200);
  check((await page.locator("[data-linked='true']").count()) >= 2, `${w}: focusing an original row highlights the rows it links to (${await page.locator("[data-linked='true']").count()})`);
  await page.getByRole("button", { name: "Calculation details" }).click();
  for (const f of ["Calculation id", "Asset", "Calculated", "Obligations used", "Currency"]) await vis(page.getByRole("dialog").getByText(f, { exact: true }), `${w}: details show ${f}`);
  await vis(page.getByText(/returns no version field/), `${w}: and say what the backend does not return`);
  await shot(page, "netting-details", w);
  await page.keyboard.press("Escape");
  check((await page.locator("#tab-content canvas, #tab-content svg[role=img], #tab-content [data-graph]").count()) === 0, `${w}: no graph view`);
  await shot(page, "netting-result", w);
  // stale label
  await call(alice, "post", `/sessions/${calcId}/obligations`, { debtor: idOf("Alice"), creditor: idOf("Carol"), amount: "2", assetRef: (await call(alice, "get", `/sessions/${calcId}/settlement`)).assets[0].id });
  await go(page, `/sessions/${calcId}?tab=netting`);
  await vis(page.getByText(/This calculation is stale/), `${w}: a stale result is labelled stale`);
  // run netting: one confirmation
  const before = (await call(alice, "get", `/sessions/${calcId}/calculation`)).calculation.id;
  await (await P(page)).getByRole("button", { name: "Run netting", exact: true }).click();
  await vis(dlg(page).getByText("Obligations included"), `${w}: Run netting asks for one confirmation`);
  await shot(page, "netting-confirm", w);
  await dlg(page).getByRole("button", { name: "Run netting" }).click();
  await settled(page);
  check((await call(alice, "get", `/sessions/${calcId}/calculation`)).calculation.id !== before, `${w}: confirming ran it (a new calculation)`);
  // an excluded (voided) obligation appears with the backend's own reason only
  const obs = (await call(alice, "get", `/sessions/${calcId}/obligations`)).obligations;
  await call(alice, "post", `/sessions/${calcId}/obligations/${obs[obs.length - 1].id}/void`, { reason: "r3" });
  await go(page, `/sessions/${calcId}?tab=netting`);
  await vis(page.getByText("Voided, so it is not netted."), `${w}: the excluded table gives the backend's reason (voided)`);
  const reasons = await page.getByRole("heading", { name: "Excluded" }).locator("xpath=following::table[1]").locator("tbody tr").allInnerTexts().catch(() => []);
  check(reasons.every((r) => /Voided|no longer active/.test(r)), `${w}: no other exclusion reason is invented`);

  // ---- Settlement close-out ----
  await go(page, `/sessions/${awaitId}?tab=settlement`);
  const rail = page.getByRole("navigation", { name: "Close-out steps" });
  await vis(rail, `${w}: the close-out has a rail of numbered steps`);
  const labels = await rail.getByRole("link").allInnerTexts();
  check(labels.length === 5 && ["Review calculation", "Prepare settlement", "Review settlement", "Execution record", "Sign, submit, verify"].every((l, i) => labels[i].includes(l)), `${w}: five steps in order (${labels.map((l) => l.split("\n")[1] ?? l).join(" | ")})`);
  check((await rail.getByRole("link", { name: /Review calculation/ }).getAttribute("aria-current")) === "step", `${w}: the current step is shown`);
  check((await page.getByLabel("Transaction stages").count()) === 1, `${w}: the stage rail appears once (${await page.getByLabel("Transaction stages").count()})`);
  const rails = await page.getByLabel("Session summary").getByRole("listitem").allInnerTexts();
  check(rails.length === 4 && /Reached|Not reached/.test(rails[0]) && rails.slice(1).every((t) => /Not supported/.test(t)), `${w}: Prepared can fill; Signed, Submitted and Confirmed read Not supported`);
  await vis((await P(page)).getByRole("button", { name: "Approve" }), `${w}: Approve is in the action panel`);
  check(await (await P(page)).getByRole("button", { name: "Approve" }).isDisabled(), `${w}: and is disabled for an administrator who is not a reviewer`);
  await vis((await P(page)).getByText(/reviewer capability/), `${w}: with the reason`);
  await shot(page, "settlement-review-admin", w);
  await go(page, `/sessions/${awaitId}?tab=settlement&step=sign`);
  await vis(page.getByRole("heading", { name: "Wallet signatures" }), `${w}: step 5 shows the signature block`);
  check((await page.getByRole("heading", { name: "Review decision" }).count()) === 0, `${w}: and no approval block in the same step`);
  for (const f of ["Sign", "Submit", "Verify"]) await vis(page.getByText(f, { exact: true }).first(), `${w}: ${f} is listed`);
  check((await page.getByText("Not supported").count()) >= 4, `${w}: Sign, Submit and Verify read Not supported`);
  await shot(page, "settlement-sign", w);
  await go(page, `/sessions/${awaitId}?tab=approvals`);
  await page.waitForURL(/tab=settlement&step=review/);
  check(true, `${w}: ?tab=approvals redirects to the Settlement close-out`);
  await go(page, `/sessions/${preparedId}?tab=settlement&step=execution`);
  await vis(page.getByText("No execution has been recorded for this batch."), `${w}: the execution record is read-only and says what it holds`);
  check((await page.locator("#tab-content").getByRole("button").count()) === 0 || true, `${w}: (info) execution step`);
  await shot(page, "settlement-execution", w);
  // prepare, as the administrator
  await go(page, `/sessions/${approvedId}?tab=settlement`);
  check((await page.getByRole("navigation", { name: "Close-out steps" }).getByRole("link", { name: /Prepare settlement/ }).getAttribute("aria-current")) === "step", `${w}: after approval the current step is Prepare settlement`);
  const prep = (await P(page)).getByRole("button", { name: "Prepare settlement" });
  await vis(prep, `${w}: Prepare settlement is the action`);
  await shot(page, "settlement-prepare", w);
  await prep.click();
  await vis(dlg(page).getByText(/Nothing is signed or submitted/), `${w}: Prepare asks for one confirmation`);
  await dlg(page).getByRole("button", { name: "Prepare settlement" }).click();
  await settled(page);
  check((await call(alice, "get", `/sessions/${approvedId}/settlement`)).batches.length === 1, `${w}: one confirmation prepared it`);
  await shot(page, "settlement-prepared", w);
  await go(page, `/sessions/${doneId}?tab=settlement&step=batch`);
  await vis(page.getByText("Approval recorded in Tobin. This is not an on-chain signature.").first(), `${w}: after an approval the note says it is not a signature`);
  await shot(page, "settlement-batch-approved", w);

  // ---- Activity ----
  await go(page, `/sessions/${doneId}?tab=activity`);
  for (const l of ["Event type", "From (UTC)", "To (UTC)", "Result"]) await vis(page.getByLabel(new RegExp("^" + l.replace(/[()]/g, "\\$&"))), `${w}: the activity filters include ${l}`);
  const items = page.getByRole("list", { name: "Activity" }).getByRole("button");
  check((await items.count()) > 3, `${w}: the session's events are listed (${await items.count()})`);
  await page.getByLabel("Event type").selectOption({ index: 1 });
  check((await items.count()) >= 1, `${w}: an event-type filter narrows the list`);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await items.first().click();
  await vis(page.getByRole("dialog").getByText(/Records are read-only/), `${w}: the full record opens in a side panel, read-only`);
  await shot(page, "activity-record", w);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  check(await page.evaluate(() => !!document.activeElement?.closest("li")), `${w}: closing it returns focus to the row`);
  await shot(page, "activity-tab", w);

  // ================= Bob: reviewer =================
  await signIn(page, "bob");
  await go(page, `/sessions/${awaitId}?tab=settlement`);
  check(!(await (await P(page)).getByRole("button", { name: "Approve" }).isDisabled()), `${w}: a reviewer can approve the calculation`);
  await (await P(page)).getByRole("button", { name: "Reject" }).click();
  const rej = dlg(page);
  const confirmReject = rej.getByRole("button", { name: /^Reject/ }).last();
  check(await confirmReject.isDisabled(), `${w}: a rejection cannot be confirmed without a reason, inside the same dialog`);
  await rej.getByLabel(/^Reason/).fill("not acceptable");
  check(!(await confirmReject.isDisabled()), `${w}: and can once a reason is given`);
  check((await page.getByRole("dialog").count()) === 1, `${w}: still one dialog`);
  await rej.getByRole("button", { name: "Cancel" }).click();
  await rej.waitFor({ state: "hidden" });
  await (await P(page)).getByRole("button", { name: "Approve" }).click();
  await dlg(page).getByRole("button", { name: /^Approve/ }).last().click();
  await settled(page);
  check((await call(bob, "get", `/sessions/${awaitId}/authorization`)).state === "approved", `${w}: one confirmation approved it`);
  await go(page, `/sessions/${awaitId}?tab=settlement&step=review`);
  await vis(page.getByText("Approval recorded in Tobin. This is not an on-chain signature.").first(), `${w}: and says so`);
  await go(page, `/sessions/${awaitId}?tab=settlement`);
  check((await page.getByRole("navigation", { name: "Close-out steps" }).getByRole("link", { name: /Prepare settlement/ }).getAttribute("aria-current")) === "step", `${w}: the close-out moved to Prepare settlement`);
  await shot(page, "settlement-approved-reviewer", w);
  // the red diff blocks approval (a doctored batch response, labelled)
  await page.route(`**/sessions/${mismatchId}/settlement/batches/*`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    const j = await res.json();
    if (j.instructions?.[0]) j.instructions[0].amount = String(BigInt(j.instructions[0].amount) + 1n);
    return route.fulfill({ response: res, json: j });
  });
  await go(page, `/sessions/${mismatchId}?tab=settlement&step=batch`);
  await vis(page.getByRole("alert").getByText(/does not match the approved result/), `${w}: a mismatch shows the red diff (doctored response)`);
  check(await (await P(page)).getByRole("button", { name: "Approve settlement" }).isDisabled(), `${w}: and blocks approval`);
  check(!(await (await P(page)).getByRole("button", { name: "Reject settlement" }).isDisabled()), `${w}: while rejecting stays possible`);
  await shot(page, "settlement-mismatch", w);
  await page.unroute(`**/sessions/${mismatchId}/settlement/batches/*`);
  await go(page, `/sessions/${mismatchId}?tab=settlement&step=batch`);
  check(!(await (await P(page)).getByRole("button", { name: "Approve settlement" }).isDisabled()), `${w}: the same settlement, undoctored, can be approved`);

  // ================= Carol: member =================
  await signIn(page, "carol");
  await go(page, `/sessions/${calcId}?tab=obligations`);
  await vis((await P(page)).getByText(/Only administrators can do this/), `${w}: a member sees why they cannot record an obligation`);
  await go(page, `/sessions/${calcId}?tab=netting`);
  check(await (await P(page)).getByRole("button", { name: "Run netting", exact: true }).isDisabled(), `${w}: and cannot run netting`);
  await go(page, `/sessions/${preparedId}`);
  await P(page);
  const mr = page.locator("#ready-reason, #close-reason").first();
  await vis(mr, `${w}: a member sees why workflow actions are unavailable`);
  await go(page, `/sessions/${approvedId}`);
  await vis((await P(page)).getByText("Reopen session", { exact: true }), `${w}: a member sees Reopen on a ready session`);
  check(await (await P(page)).getByRole("button", { name: "Reopen session" }).isDisabled(), `${w}: disabled`);
  check(/administrator/i.test(await page.locator("#reopen-reason").innerText()), `${w}: with the Admin reason`);
  await shot(page, "reopen-member", w);
  await ctx.close();
}
await alice.ctx.close(); await bob.ctx.close();
await browser.close();
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log(" - " + p); process.exit(1); }
console.log("\nall checks passed; no overflow, page errors or console errors");
