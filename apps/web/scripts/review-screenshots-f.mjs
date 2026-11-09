// Redesign review run (docs/web-redesign): drives the real UI (apps/web on :3100) against a real, seeded throwaway console backend (:8787) and verifies each
// change the redesign PRD asked for: the Overview's relevant sessions and quick links, what is inside each session in the list, the session's state layers and
// at-a-glance summary, Stepper links, the netting confirmation, amounts in the approvals list, the obligation deep link and history, activity entity links, and
// the Discover page. Run it LAST on a seeded database (it recalculates "Monthly settlement"). Saves screenshots and checks overflow at 1440, 900 and 390 px.
// Usage: node scripts/review-screenshots-f.mjs <output dir>
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out) throw new Error("usage: review-screenshots-f.mjs <output dir>");
mkdirSync(out, { recursive: true });
const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PW = "Correct-horse-battery-1";
const WIDTHS = [1440, 900, 390];
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
const vis = async (loc, msg) => { let ok = true; try { await loc.first().waitFor({ state: "visible", timeout: 12000 }); } catch { ok = false; } check(ok, msg); };
const browser = await chromium.launch({ channel: "chrome" });

async function signIn(page, email) {
  await page.context().clearCookies();
  await page.goto(BASE + "/sign-in");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(PW);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await page.waitForURL(BASE + "/");
}
async function settled(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.body.innerText.includes("Reading sessions…") && !document.querySelector("[aria-busy='true']"), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(400);
}
async function shot(page, name, w) {
  await settled(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `${name}-${w}: no horizontal overflow (${overflow}px)`);
  await page.addStyleTag({ content: "nav[aria-label=Primary].fixed,[data-sheet]{position:static!important}" }).catch(() => {});
  await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
}
const dialog = (page) => page.getByRole("dialog").last();
// under 768px the action panel is a bottom sheet: open it when a step needs its controls
async function openPanel(page) {
  const t = page.locator("[data-sheet]").getByRole("button", { name: /Next step/ });
  if (await t.isVisible() && (await t.getAttribute("aria-expanded")) === "false") await t.click();
}
const calcId = async (page, orgId, sid) => ((await (await page.request.get(`${BASE}/api/registry/orgs/${orgId}/sessions/${sid}/calculation`)).json()).calculation ?? {}).id ?? null;
const go = async (page, path) => { await page.goto(BASE + path); await settled(page); };
const openSession = async (page, q, tab) => {
  await go(page, `/sessions?q=${encodeURIComponent(q)}`);
  await page.getByRole("link", { name: "Open" }).locator("visible=true").first().click();
  await page.waitForURL(/\/sessions\/[0-9a-f]{64}/); await settled(page);
  if (tab) await go(page, `${new URL(page.url()).pathname}?tab=${tab}`);
};

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${w}: page error ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`${w}: console error ${m.text().slice(0, 160)}`); });

  // ============ Alice: administrator ============
  await signIn(page, "alice@example.test");
  await settled(page);
  await vis(page.getByRole("heading", { name: "Sessions that matter now" }), `${w}: the Overview lists the sessions that matter now`);
  await vis(page.getByRole("navigation", { name: "Quick links" }).getByRole("link", { name: "View sessions" }), `${w}: the Overview offers quick links`);
  check(await page.getByRole("link", { name: "Create session" }).count() >= 1, `${w}: the Overview has one primary action, Create session`);
  check(await page.getByRole("heading", { name: "About access" }).count() === 0, `${w}: the role help is no longer on the Overview (it is in Settings)`);
  await vis(page.getByText(/Showing \d+ of \d+ sessions|Showing all \d+ sessions/).first(), `${w}: the Overview still says how many sessions it read`);
  await shot(page, "overview-redesign", w);
  const first = page.getByRole("list", { name: "Sessions that matter now" }).getByRole("link", { name: /^Open / }).first();
  const label = await first.getAttribute("aria-label");
  await first.click(); await page.waitForURL(/\/sessions\/[0-9a-f]{64}/);
  check(true, `${w}: an Overview session leads to the right section (${label})`);

  // sessions list: contents
  await go(page, "/sessions?q=Q4");
  await vis(page.getByText("Contents (derived)").locator("visible=true").first(), `${w}: the sessions list shows what is inside each session`);
  await vis(page.getByText("3 participants").locator("visible=true").first(), `${w}: with participant counts`);
  await vis(page.getByText("3 obligations").locator("visible=true").first(), `${w}: and obligation counts`);
  await shot(page, "sessions-contents", w);

  // workspace overview
  await openSession(page, "Q4");
  const base = new URL(page.url()).pathname;
  await vis(page.getByRole("heading", { name: "State, layer by layer" }), `${w}: the session shows its state layer by layer`);
  const layers = page.getByRole("list", { name: "State layers" }).getByRole("listitem");
  check(await layers.count() === 5, `${w}: five layers (application, calculation, review, settlement preparation, blockchain)`);
  await vis(page.getByRole("list", { name: "State layers" }).getByText("Not recorded"), `${w}: the blockchain layer reads Not recorded`);
  const layerText = await page.getByRole("list", { name: "State layers" }).innerText();
  check(!/\b(settled|confirmed)\b/i.test(layerText.replace("nothing is shown as settled or confirmed", "")), `${w}: no layer claims the session is settled or confirmed`);
  await vis(page.getByRole("heading", { name: "At a glance" }), `${w}: an at-a-glance summary`);
  await vis(page.getByRole("heading", { name: "Recent events" }), `${w}: and the recent events`);
  await shot(page, "workspace-layers", w);
  await page.getByRole("list", { name: "Session sections" }).getByRole("link", { name: "Open Netting" }).click();
  await page.waitForURL(/tab=netting/); check(true, `${w}: At a glance leads to Netting`);
  await go(page, base);
  await page.getByRole("list", { name: "Session progress" }).getByRole("link", { name: "Approval", exact: true }).click();
  await page.waitForURL(/tab=approvals/); check(true, `${w}: a Stepper group leads to its section`);

  // netting confirmation, on a session with a stale calculation
  await openSession(page, "Monthly settlement", "netting");
  const orgId = (await (await page.request.get(BASE + "/api/auth/me")).json()).organizations[0].id;
  const sid = new URL(page.url()).pathname.split("/").pop();
  const idBefore = await calcId(page, orgId, sid);
  await openPanel(page);
  await page.getByRole("button", { name: "Run netting", exact: true }).click();
  await vis(dialog(page).getByText("Obligations included"), `${w}: running netting asks for confirmation`);
  await vis(dialog(page).getByText(/replaces the current one/), `${w}: and says what it replaces`);
  await shot(page, "netting-confirm", w);
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(500);
  check(await calcId(page, orgId, sid) === idBefore, `${w}: cancelling leaves the calculation untouched`);
  await openPanel(page);
  await page.getByRole("button", { name: "Run netting", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Run netting" }).click();
  await page.waitForTimeout(800);
  check(await calcId(page, orgId, sid) !== idBefore, `${w}: confirming runs it (a new calculation exists)`);
  await vis(page.getByLabel("Netting steps").getByText("3. Result"), `${w}: confirming runs it`);

  // obligations deep link from the global list
  await go(page, "/obligations");
  await vis(page.getByText("Active totals by asset"), `${w}: global obligations`);
  if (w >= 900) await vis(page.getByRole("columnheader", { name: "Obligation" }), `${w}: the global list shows the obligation identifier`);
  // the list covers the 10 newest sessions (the cap), so follow whichever obligation link is shown
  const link = page.locator('a[href*="&ob="]').locator("visible=true").first();
  await link.click(); await page.waitForURL(/[?&]ob=[0-9a-f]{64}/);
  await vis(page.getByText("History").first(), `${w}: a global obligation opens its detail in its session`);
  await vis(page.getByText("Recorded as Active").first(), `${w}: and its history states the change`);
  await shot(page, "obligation-deeplink", w);
  await page.keyboard.press("Escape");

  // activity: entity links
  await go(page, "/activity");
  await vis(page.getByRole("list", { name: "Activity" }).getByText(/Obligations|Netting|Participants|Session/).first(), `${w}: each activity record names the section it concerns`);
  await page.getByLabel("Event type").selectOption({ label: "Obligation created" });
  await page.getByRole("list", { name: "Activity" }).getByRole("button").first().click();
  await vis(page.getByRole("link", { name: /^Open obligations$/ }), `${w}: the record offers to open the affected section`);
  await shot(page, "activity-entity", w);
  await page.getByRole("link", { name: /^Open obligations$/ }).click();
  await page.waitForURL(/tab=obligations/); check(true, `${w}: and it opens the right section`);

  // discover
  await go(page, "/discover");
  await vis(page.getByText("Future capability. Discover is not available"), `${w}: Discover says it is a future capability`);
  await vis(page.getByText("Not supported").first(), `${w}: and that it is not supported`);
  check(await page.locator("input[type=search], input[type=text]").count() === 0, `${w}: Discover has no search box and no sample records`);
  await shot(page, "discover", w);
  await page.keyboard.press("Control+k");
  await page.locator("#cmd-input").fill("Discover");
  await vis(page.getByText("Discover (not available)"), `${w}: the command panel lists Discover as not available`);
  await page.keyboard.press("Escape");

  // a session that is calculated and awaiting review, made through the real API (the seeded one has aged out of the 10-newest window the capped pages read)
  {
    const org = `${BASE}/api/registry/orgs/${orgId}`;
    const post = async (path, data) => (await (await page.request.post(org + path, { data })).json());
    const members = (await (await page.request.get(org + "/members")).json()).members;
    const id = (n) => members.find((m) => m.name === n).userId;
    const created = (await post("/sessions", { label: `Review me ${w}` })).session.sessionId;
    for (const m of members) await post(`/sessions/${created}/participants`, { userId: m.userId });
    const ref = (await (await page.request.get(`${org}/sessions/${created}/settlement`)).json()).assets[0].id;
    for (const [d, c, amt] of [["Alice", "Bob", "100"], ["Bob", "Carol", "80"], ["Carol", "Alice", "70"]]) await post(`/sessions/${created}/obligations`, { debtor: id(d), creditor: id(c), amount: amt, assetRef: ref, reference: "f" });
    await post(`/sessions/${created}/calculate`, {});
  }

  // ============ Bob: reviewer ============
  await signIn(page, "bob@example.test"); await settled(page);
  await vis(page.getByRole("list", { name: "Sessions that matter now" }).getByText("Awaiting your review"), `${w}: a reviewer's Overview puts the session awaiting their review first`);
  await go(page, "/approvals");
  await vis(page.getByText(/Gross [\d,]+ USD/).first(), `${w}: the approvals list shows the amounts under review`);
  await vis(page.getByText(/Calculation review · Alpha Bank/).first(), `${w}: and the organization`);
  await shot(page, "approvals-amounts", w);
  await openSession(page, `Review me ${w}`, "approvals");
  await vis(page.getByRole("heading", { name: "What is being reviewed" }), `${w}: the session Approvals tab shows what is being reviewed`);
  await vis(page.getByRole("list", { name: "Obligations under review" }).getByText(/owes/).first(), `${w}: with the obligations behind the calculation`);
  await shot(page, "approvals-reviewed", w);

  // ============ Carol: member ============
  await signIn(page, "carol@example.test"); await settled(page);
  check(await page.getByRole("button", { name: "Create session" }).isDisabled(), `${w}: a member's Create session is disabled`);
  await vis(page.getByText(/Only administrators can do this\./), `${w}: with the reason`);
  await shot(page, "overview-member", w);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "all checks passed; no overflow, page errors or console errors");
process.exit(problems.length ? 1 : 0);
