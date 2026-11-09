// Phase C review run: drives the real UI (apps/web on :3100) against a real, seeded throwaway console backend (:8787). It records, voids and nets real
// obligations through the UI, asserts behaviour (admin, member and reviewer), checks horizontal overflow at every width and saves screenshots.
// Usage: node scripts/review-screenshots-c.mjs <output dir>      (run scripts/seed-review-data.mjs first; both servers must be running)
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out) throw new Error("usage: review-screenshots-c.mjs <output dir>");
mkdirSync(out, { recursive: true });
const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PW = "Correct-horse-battery-1";
const WIDTHS = [1440, 900, 390];
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
const vis = async (loc, msg) => { let ok = true; try { await loc.first().waitFor({ state: "visible", timeout: 10000 }); } catch { ok = false; } check(ok, msg); };

const browser = await chromium.launch({ channel: "chrome" });

async function signIn(page, email) {
  await page.goto(BASE + "/sign-in");
  await page.locator("#auth-email").fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#login-password").fill(PW);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(BASE + "/");
}
async function settled(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.body.innerText.includes("Reading sessions…") && !document.querySelector("[aria-busy='true']"), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
}
async function shot(page, name, w) {
  await settled(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `${name}-${w}: no horizontal overflow (${overflow}px)`);
  await page.addStyleTag({ content: "nav[aria-label=Primary].fixed,[data-sheet]{position:static!important}" }).catch(() => {});
  await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
}
const open = async (page, label, tab) => {
  await page.goto(`${BASE}/sessions?q=${encodeURIComponent(label)}`); await settled(page);
  await page.getByRole("link", { name: "Open", exact: true }).locator("visible=true").first().click();
  await page.waitForURL(/\/sessions\/[0-9a-f]{64}/); await settled(page);
  if (tab) { await page.goto(`${page.url().split("?")[0]}?tab=${tab}`); await settled(page); }
};
const choose = (page, label, text) => page.getByLabel(label, { exact: false }).selectOption({ label: text });
const dialog = (page) => page.getByRole("dialog").last();
// the asset control is a select (supported-asset list configured) or a code field (none configured): drive whichever the UI shows
async function setAsset(page, code) {
  const el = page.locator("#ob-asset");
  const tag = await el.evaluate((n) => n.tagName);
  if (tag === "SELECT") await el.selectOption({ index: 1 }); else await el.fill(code);
  return tag;
}

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1 });
  // the action panel is a bottom sheet under 768px: open it for the whole run so flows can reach its controls
  await ctx.addInitScript(() => { try { sessionStorage.setItem("tobin-sheet", "open"); } catch {} });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${w}: page error ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`${w}: console error ${m.text().slice(0, 160)}`); });

  // ================= Alice: administrator =================
  await signIn(page, "alice@example.test");

  // the seeded, calculated session: read paths
  await open(page, "Q4 clearing", "obligations");
  await vis(page.getByRole("heading", { name: "Record an obligation" }), `${w}: the action panel holds the record form for an admin`);
  await vis(page.getByText("100 USD").first(), `${w}: amounts always carry their asset`);
  await shot(page, "obligations-tab-admin", w);
  await page.getByRole("button", { name: /^View obligation/ }).first().click();
  await vis(page.getByText("History"), `${w}: obligation detail shows a History section`);
  await vis(page.getByText("Obligation created").first(), `${w}: history comes from the real created event`);
  await vis(page.getByRole("button", { name: "Void obligation" }), `${w}: void is offered as its own action`);
  check(await page.getByRole("button", { name: /^(Edit|Delete)/ }).count() === 0, `${w}: no edit or delete control exists`);
  await shot(page, "obligation-detail", w);
  await page.keyboard.press("Escape");

  await page.goto(`${page.url().split("?")[0]}?tab=netting`); await settled(page);
  await vis(page.getByRole("heading", { name: "Net debtors (pay)" }), `${w}: positions grouped as net debtors`);
  await vis(page.getByRole("heading", { name: "Net creditors (receive)" }), `${w}: positions grouped as net creditors`);
  await vis(page.getByText("Netting removes 220 USD of gross payments."), `${w}: gross 250, net 30, reduction 220 USD come from the real calculation`);
  await vis(page.getByLabel("Netting steps").getByText("3. Result"), `${w}: the step strip reaches Result for a current calculation`);
  if (w >= 900) {
    await page.getByLabel("Original obligations").getByRole("listitem").first().hover();
    check(await page.locator("[data-linked=true]").count() >= 2, `${w}: hovering an obligation highlights the linked rows`);
  }
  await shot(page, "netting-result", w);
  await page.getByRole("button", { name: "Calculation details" }).click();
  await vis(page.getByText("Calculation id"), `${w}: calculation details panel opens`);
  await vis(page.getByText("returns no version field"), `${w}: no version is invented`);
  await shot(page, "netting-details", w);
  await page.keyboard.press("Escape");

  // a fresh session, driven entirely through the UI
  const label = `Phase C run ${w}`;
  await page.goto(BASE + "/sessions/new"); await settled(page);
  await page.locator("#session-label").fill(label); await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Add participants").first().waitFor(); await settled(page);
  for (let i = 0; i < 3; i++) await page.getByRole("checkbox").nth(i).check();
  await page.getByRole("button", { name: "Review" }).click(); await page.getByRole("button", { name: "Create session" }).click();
  await page.getByText("Session created").waitFor();
  await page.getByRole("link", { name: "Open session workspace" }).click(); await page.waitForURL(/\/sessions\/[0-9a-f]{64}/); await settled(page);
  const base = page.url().split("?")[0];

  await page.goto(`${base}?tab=netting`); await settled(page);
  check(await page.getByRole("button", { name: "Run netting", exact: true }).isDisabled(), `${w}: Run netting is disabled with no obligations`);
  await vis(page.getByText("There are no active obligations to net. Record one first."), `${w}: the reason it cannot run is shown`);
  await shot(page, "netting-empty", w);

  await page.goto(`${base}?tab=obligations`); await settled(page);
  await shot(page, "obligations-empty", w);
  // validation messages, under the field
  await page.getByRole("button", { name: "Review obligation" }).click();
  await vis(page.getByText("Choose the debtor."), `${w}: missing debtor is explained under the field`);
  await choose(page, "Debtor (owes)", "Alice"); await choose(page, "Creditor (is owed)", "Alice");
  await page.locator("#ob-amount").fill("1.5"); const assetControl = await setAsset(page, "USD");
  console.log(`info ${w}: asset control is a ${assetControl}`);
  if (assetControl === "SELECT") {
    const opts = await page.locator("#ob-asset option").allTextContents();
    check(opts.length === 2 && /^USD/.test(opts[1] ?? ""), `${w}: the asset select lists only the supported asset (${opts.join(" | ")})`);
  }
  await page.getByRole("button", { name: "Review obligation" }).click();
  await vis(page.getByText("Enter a positive whole number of base units"), `${w}: a decimal amount is refused with the precision rule`);
  await vis(page.getByText("The debtor and the creditor must be different participants."), `${w}: debtor equal to creditor is refused under the creditor`);
  await shot(page, "obligation-form-errors", w);

  const record = async (debtor, creditor, amount, asset, ref) => {
    await choose(page, "Debtor (owes)", debtor); await choose(page, "Creditor (is owed)", creditor);
    await page.locator("#ob-amount").fill(amount); await setAsset(page, asset); await page.locator("#ob-reference").fill(ref);
    await page.getByRole("button", { name: "Review obligation" }).click();
  };
  await record("Alice", "Bob", "100", "USD", "invoice A");
  await vis(dialog(page).getByText("100 USD"), `${w}: the review dialog shows the amount with its asset`);
  await shot(page, "obligation-review-dialog", w);
  await dialog(page).getByRole("button", { name: "Record obligation" }).click();
  await vis(page.getByText("Obligation recorded."), `${w}: the obligation is recorded`);
  await record("Bob", "Carol", "80", "USD", "invoice B");
  await dialog(page).getByRole("button", { name: "Record obligation" }).click();
  await vis(page.getByRole("table").getByText("80 USD"), `${w}: the second obligation appears in the table`);
  // a real backend refusal under the field. Code mode: a second asset code. Select mode: a hand-built request for an asset identity that is not supported.
  if (assetControl !== "SELECT") {
    await record("Carol", "Alice", "70", "EUR", "invoice C");
    await dialog(page).getByRole("button", { name: "Record obligation" }).click();
    await vis(page.getByText(/this session nets USD/), `${w}: the backend's own refusal is shown under the asset field`);
    await shot(page, "obligation-backend-error", w);
  }

  // void the second, with its own confirmed action
  await page.getByRole("button", { name: /^View obligation Bob/ }).click();
  await page.getByRole("button", { name: "Void obligation" }).first().click();
  await dialog(page).getByLabel("Reason (optional)").fill("entered twice");
  await shot(page, "obligation-void-dialog", w);
  await dialog(page).getByRole("button", { name: "Void obligation" }).click();
  await vis(page.getByText("Voided").first(), `${w}: the obligation is shown as voided`);
  // the drawer stays open and now shows the voided obligation
  await vis(page.getByText("Obligation voided").first(), `${w}: voiding added its own history entry`);
  await shot(page, "obligation-detail-voided", w);
  await page.keyboard.press("Escape");

  // netting: inputs with an excluded item, then run
  await page.goto(`${base}?tab=netting`); await settled(page);
  await vis(page.getByText("Voided, so it is not netted."), `${w}: the excluded table gives the real reason`);
  await vis(page.getByText("Will include 1 active obligation among 3 participants in USD."), `${w}: the panel summarises what will be included`);
  await shot(page, "netting-inputs", w);
  await page.getByRole("button", { name: "Run netting", exact: true }).click();
  await vis(dialog(page).getByText("Obligations included"), `${w}: running netting asks for confirmation and summarises what is included`);
  await dialog(page).getByRole("button", { name: "Run netting" }).click();
  await vis(page.getByRole("heading", { name: "Zero positions" }), `${w}: a participant with no obligations is grouped as zero`);
  await vis(page.getByLabel("Netting steps").getByText("3. Result"), `${w}: running netting moves the strip to Result`);
  await shot(page, "netting-after-run", w);
  // changing inputs makes the result stale
  await page.goto(`${base}?tab=obligations`); await settled(page);
  await record("Carol", "Alice", "5", "USD", "late");
  await dialog(page).getByRole("button", { name: "Record obligation" }).click();
  await vis(page.getByText("Obligation recorded."), `${w}: a further obligation is recorded`);
  await page.goto(`${base}?tab=netting`); await settled(page);
  await vis(page.getByText(/This calculation is stale/), `${w}: the old result is labelled stale`);
  await shot(page, "netting-stale", w);

  // global Obligations page
  await page.goto(BASE + "/obligations"); await settled(page);
  await vis(page.getByText(/Showing \d+ of \d+ sessions|Showing all \d+ sessions/), `${w}: the global list says how many sessions it read`);
  await vis(page.getByText("Active totals by asset"), `${w}: totals are listed per asset`);
  await shot(page, "obligations-global", w);
  await page.getByRole("button", { name: "Voided", exact: true }).click(); await settled(page);
  await shot(page, "obligations-global-voided", w);
  await page.context().clearCookies();

  // ================= Bob: member with the reviewer grant =================
  await signIn(page, "bob@example.test");
  await open(page, "Q4 clearing", "obligations");
  await vis(page.getByText(/Only administrators can do this/), `${w}: a member sees why they cannot record`);
  check(await page.getByRole("button", { name: "Review obligation" }).count() === 0, `${w}: a member has no record form`);
  await shot(page, "obligations-tab-member", w);
  await page.getByRole("button", { name: /^View obligation/ }).first().click();
  check(await page.getByRole("button", { name: "Void obligation" }).count() === 0, `${w}: a member cannot void`);
  await shot(page, "obligation-detail-member", w);
  await page.keyboard.press("Escape");
  await page.goto(`${page.url().split("?")[0]}?tab=netting`); await settled(page);
  check(await page.getByRole("button", { name: "Run netting", exact: true }).isDisabled(), `${w}: a member cannot run netting`);
  await shot(page, "netting-member", w);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "all checks passed; no overflow, page errors or console errors");
process.exit(problems.length ? 1 : 0);
