// Phase D review run: drives the real UI (apps/web on :3100) against a real, seeded throwaway console backend (:8787) that has a supported asset configured.
// Per width it builds a fresh session through the UI, then walks the real review flow as admin (Alice), reviewer (Bob) and a plain member (Carol):
// calculation review, settlement preparation, batch review, rejection and re-preparation. It asserts behaviour, checks horizontal overflow and saves screenshots.
// One check tampers with a RESPONSE in the browser (labelled below) to show the mismatch block: the real backend cannot produce a mismatching batch.
// Usage: node scripts/review-screenshots-d.mjs <output dir>
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out) throw new Error("usage: review-screenshots-d.mjs <output dir>");
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
  await page.waitForTimeout(300);
}
async function shot(page, name, w) {
  await settled(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `${name}-${w}: no horizontal overflow (${overflow}px)`);
  await page.addStyleTag({ content: "nav[aria-label=Primary].fixed,[data-sheet]{position:static!important}" }).catch(() => {});
  await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
}
const dialog = (page) => page.getByRole("dialog").last();
const go = async (page, base, tab) => { await page.goto(`${base}?tab=${tab}`); await settled(page); };

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1 });
  // the action panel is a bottom sheet under 768px: open it for the whole run so flows can reach its controls
  await ctx.addInitScript(() => { try { sessionStorage.setItem("tobin-sheet", "open"); } catch {} });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${w}: page error ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`${w}: console error ${m.text().slice(0, 160)}`); });

  // ============ Alice (admin): a fresh session with three obligations and a calculation ============
  await signIn(page, "alice@example.test");
  await page.goto(BASE + "/sessions/new"); await settled(page);
  await page.locator("#session-label").fill(`Phase D run ${w}`); await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Add participants").first().waitFor(); await settled(page);
  for (let i = 0; i < 3; i++) await page.getByRole("checkbox").nth(i).check();
  await page.getByRole("button", { name: "Review" }).click(); await page.getByRole("button", { name: "Create session" }).click();
  await page.getByText("Session created").waitFor();
  await page.getByRole("link", { name: "Open session workspace" }).click(); await page.waitForURL(/\/sessions\/[0-9a-f]{64}/); await settled(page);
  const base = page.url().split("?")[0];

  await go(page, base, "obligations");
  const rec = async (d, c, amount, ref) => {
    await page.getByLabel("Debtor (owes)").selectOption({ label: d }); await page.getByLabel("Creditor (is owed)").selectOption({ label: c });
    await page.locator("#ob-amount").fill(amount); await page.locator("#ob-asset").selectOption({ index: 1 }); await page.locator("#ob-reference").fill(ref);
    await page.getByRole("button", { name: "Review obligation" }).click();
    await dialog(page).getByRole("button", { name: "Record obligation" }).click();
    await vis(page.getByText("Obligation recorded."), `${w}: obligation ${ref} recorded with a supported asset`);
  };
  await rec("Alice", "Bob", "100", "inv 1"); await rec("Bob", "Carol", "80", "inv 2"); await rec("Carol", "Alice", "70", "inv 3");
  await go(page, base, "netting");
  await page.getByRole("button", { name: "Run netting", exact: true }).click();
  await vis(page.getByText("Netting removes 220 USD of gross payments."), `${w}: netting ran (gross 250, net 30)`);

  // Approvals before any decision: Alice recorded and calculated everything, so she cannot decide
  await go(page, base, "approvals");
  await vis(page.getByRole("heading", { name: "Review decision" }), `${w}: the approval block is shown`);
  check(await page.getByText("Approval recorded in Tobin. This is not an on-chain signature.").count() === 0, `${w}: the not-a-signature line is not shown before any approval exists`);
  check(await page.getByRole("button", { name: "Approve", exact: true }).isDisabled(), `${w}: an administrator without the reviewer grant has Approve disabled`);
  await vis(page.getByText(/reviewer capability/), `${w}: the reason is shown`);
  await vis(page.getByText("N-of-M approval"), `${w}: N-of-M renders Not supported`);
  check(await page.getByText("Not supported").count() >= 2, `${w}: the signature block and N-of-M both read Not supported`);
  await shot(page, "approvals-admin-cannot-decide", w);

  // ============ Carol: a plain member ============
  await signIn(page, "carol@example.test");
  await page.goto(`${base}?tab=approvals`); await settled(page);
  check(await page.getByRole("button", { name: "Approve", exact: true }).isDisabled(), `${w}: a plain member has Approve disabled`);
  check(await page.getByRole("button", { name: "Reject", exact: true }).isDisabled(), `${w}: a plain member has Reject disabled`);
  await shot(page, "approvals-member", w);
  await go(page, base, "settlement");
  check(await page.getByRole("button", { name: "Prepare settlement", exact: true }).isDisabled(), `${w}: a member cannot prepare settlement`);
  await shot(page, "settlement-member-before", w);

  // ============ Bob: reviewer ============
  await signIn(page, "bob@example.test");
  await page.goto(`${base}?tab=approvals`); await settled(page);
  await shot(page, "approvals-reviewer", w);
  // reject needs a reason
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  check(await dialog(page).getByRole("button", { name: "Reject calculation" }).isDisabled(), `${w}: Reject cannot be confirmed without a reason`);
  await dialog(page).getByLabel("Reason (required)").fill("x"); await dialog(page).getByLabel("Reason (required)").fill("");
  await vis(dialog(page).getByText("Give a reason."), `${w}: the empty reason is explained under the field`);
  await shot(page, "approvals-reject-dialog", w);
  await page.keyboard.press("Escape");
  // approve: its own dialog, with the summary
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await vis(dialog(page).getByText("250 USD"), `${w}: the approve dialog shows the gross with its asset`);
  await shot(page, "approvals-approve-dialog", w);
  await dialog(page).getByRole("button", { name: "Approve calculation" }).click();
  await vis(page.getByText("Approval recorded in Tobin. This is not an on-chain signature.").first(), `${w}: the approval is followed by the not-a-signature line`);
  await vis(page.getByText("Approved").first(), `${w}: the real decision is shown`);
  check(await page.getByRole("button", { name: "Approve", exact: true }).count() === 0, `${w}: after a decision Approve is no longer offered`);
  await shot(page, "approvals-after-approve", w);
  check(await page.locator("section", { has: page.getByRole("heading", { name: "Wallet signatures" }) }).getByRole("button").count() === 0, `${w}: the signature block has no button`);

  // global Approvals page for Bob
  await page.goto(BASE + "/approvals"); await settled(page);
  await vis(page.getByText(/Showing \d+ of \d+ sessions|Showing all \d+ sessions/), `${w}: the approvals page says how many sessions it read`);
  await shot(page, "approvals-global", w);

  // ============ Alice: prepare settlement ============
  await signIn(page, "alice@example.test");
  await go(page, base, "settlement");
  await vis(page.getByText("No settlement has been prepared for this session."), `${w}: the empty settlement state lists what preparing needs`);
  await shot(page, "settlement-before", w);
  await page.getByRole("button", { name: "Prepare settlement", exact: true }).click();
  await shot(page, "settlement-prepare-dialog", w);
  await dialog(page).getByRole("button", { name: "Prepare settlement" }).click();
  await vis(page.getByRole("heading", { name: "Prepared settlement" }), `${w}: the settlement is prepared`);
  await vis(page.getByText("The instructions reconcile exactly to the approved net positions."), `${w}: the instructions reconcile to the approved result`);
  await vis(page.getByLabel("Transaction stages").getByText("Prepared").first(), `${w}: the stage rail reaches Prepared`);
  const stagesText = await page.getByLabel("Transaction stages").innerText();
  check((stagesText.match(/Not supported/g) ?? []).length === 3, `${w}: Signed, Submitted and the final stage each read Not supported (${(stagesText.match(/Not supported/g) ?? []).length})`);
  check(await page.getByRole("button", { name: "Approve settlement", exact: true }).isDisabled(), `${w}: the preparer cannot approve their own batch`);
  await vis(page.getByText(/Separation of duties|reviewer capability/), `${w}: the reason is shown to the preparer`);
  await shot(page, "settlement-awaiting-review-preparer", w);

  // ============ Bob: reject the batch (reason required), Alice prepares again, Bob approves ============
  await signIn(page, "bob@example.test");
  await go(page, base, "settlement");
  // SIMULATED TAMPER (labelled): alter one instruction amount in the response only, to show the red diff and the approval block
  await page.route(/\/settlement\/batches\/[^/?]+$/, async (route) => {
    const res = await route.fetch(); const json = await res.json();
    json.instructions[0].amount = String(Number(json.instructions[0].amount) + 5);
    await route.fulfill({ response: res, json });
  });
  await page.reload(); await settled(page);
  await vis(page.getByText("The prepared settlement does not match the approved result"), `${w}: [simulated tamper] a mismatch shows the red diff`);
  check(await page.getByRole("button", { name: "Approve settlement", exact: true }).isDisabled(), `${w}: [simulated tamper] a mismatch blocks approval`);
  await shot(page, "settlement-mismatch-simulated", w);
  await page.unroute(/\/settlement\/batches\/[^/?]+$/); await page.reload(); await settled(page);

  await shot(page, "settlement-awaiting-review-reviewer", w);
  await page.getByRole("button", { name: "Reject settlement", exact: true }).click();
  check(await dialog(page).getByRole("button", { name: "Reject settlement" }).isDisabled(), `${w}: rejecting the batch needs a reason`);
  await dialog(page).getByLabel("Reason (required)").fill("Wrong settlement window; prepare again.");
  await shot(page, "settlement-reject-dialog", w);
  await dialog(page).getByRole("button", { name: "Reject settlement" }).click();
  await vis(page.getByText("Rejected").first(), `${w}: the batch shows as rejected`);
  await vis(page.getByText("Wrong settlement window; prepare again."), `${w}: the rejection reason is recorded and shown`);
  await shot(page, "settlement-rejected", w);

  await signIn(page, "alice@example.test");
  await go(page, base, "settlement");
  await vis(page.getByRole("heading", { name: "Prepare settlement again" }), `${w}: a rejected batch offers a separate prepare-again action`);
  await page.getByRole("button", { name: "Prepare again" }).click();
  await dialog(page).getByRole("button", { name: "Prepare settlement" }).click();
  await vis(page.getByText("Attempt").first(), `${w}: attempt 2 is prepared`);

  await signIn(page, "bob@example.test");
  await go(page, base, "settlement");
  await page.getByRole("button", { name: "Approve settlement", exact: true }).click();
  await vis(dialog(page).getByText("30 USD"), `${w}: the approve dialog lists the instructions with their asset`);
  await shot(page, "settlement-approve-dialog", w);
  await dialog(page).getByRole("button", { name: "Approve settlement" }).click();
  await vis(page.getByText("Settlement batch approved").first(), `${w}: the settlement batch is approved`);
  await vis(page.getByText("No execution has been recorded for this batch."), `${w}: no execution exists and the page says what one needs`);
  await vis(page.getByText("Sign", { exact: true }).first(), `${w}: Sign is listed`);
  check(await page.getByText("Not supported").count() >= 5, `${w}: Sign, Submit, Verify and the stage rail all read Not supported`);
  check(await page.getByText("Submitted", { exact: true }).count() <= 1, `${w}: Submitted appears only as a stage name`);
  await shot(page, "settlement-approved", w);

  // overview of the session with the approved batch
  await go(page, base, "overview");
  await vis(page.getByText(/Settlement batch approved/).first(), `${w}: the Stepper's Settlement group reflects the approved batch`);
  await shot(page, "workspace-settlement-approved", w);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "all checks passed; no overflow, page errors or console errors");
process.exit(problems.length ? 1 : 0);
