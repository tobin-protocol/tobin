// Phase B review run: drives the real UI (apps/web on :3100) against a real, seeded throwaway console backend (:8787), asserts behaviour, checks horizontal
// overflow at every width, and saves screenshots at 1440, 900 and 390 px.
// Usage: node scripts/review-screenshots-b.mjs <output dir>      (run scripts/seed-review-data.mjs first; both servers must be running)
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out) throw new Error("usage: review-screenshots-b.mjs <output dir>");
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
const open = async (page, label) => { await page.goto(`${BASE}/sessions?q=${encodeURIComponent(label)}`); await settled(page); await page.getByRole("link", { name: /^Open \S/ }).locator("visible=true").first().click(); await page.waitForURL(/\/sessions\/[0-9a-f]{64}/); await settled(page); };

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1 });
  // the action panel is a bottom sheet under 768px: open it for the whole run so flows can reach its controls
  await ctx.addInitScript(() => { try { sessionStorage.setItem("tobin-sheet", "open"); } catch {} });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${w}: page error ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`${w}: console error ${m.text().slice(0, 160)}`); });

  // ---- Alice: administrator ----
  await signIn(page, "alice@example.test");
  await page.goto(BASE + "/sessions"); await settled(page);
  await vis(page.getByRole("link", { name: "Create session" }), `${w}: admin sees an enabled Create session link`);
  await vis(page.getByText(/Showing 1 to 10 of \d+/), `${w}: first page shows 1 to 10 of N`);
  await shot(page, "sessions-list", w);

  await page.goto(BASE + "/sessions?page=2"); await settled(page);
  await vis(page.getByText(/Showing 11 to \d+ of \d+/), `${w}: page 2 from the URL shows rows 11 onward`);
  await shot(page, "sessions-list-page2", w);

  await page.goto(BASE + "/sessions?q=clearing&sort=label&dir=asc"); await settled(page);
  check(await page.locator("#session-search").inputValue() === "clearing", `${w}: search box restored from the URL`);
  await vis(page.getByText(/Showing 1 to 1 of 1 matching \(\d+ in total\)/), `${w}: search matches exactly one session`);
  await shot(page, "sessions-list-search", w);

  await page.goto(BASE + "/sessions?q=zzzz"); await settled(page);
  await vis(page.getByText("No sessions match"), `${w}: empty match state`);
  await shot(page, "sessions-list-no-match", w);

  // ---- create flow ----
  await page.goto(BASE + "/sessions/new"); await settled(page);
  await shot(page, "create-details", w);
  await page.getByRole("button", { name: "Continue" }).click();
  await vis(page.getByText("Enter a name for the session."), `${w}: empty name is refused with a message`);
  const label = `Review run ${w}`;
  await page.locator("#session-label").fill(label);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Add participants").first().waitFor(); await settled(page);
  await page.getByRole("checkbox").nth(0).check(); await page.getByRole("checkbox").nth(1).check();
  await shot(page, "create-participants", w);
  await page.getByRole("button", { name: "Review" }).click(); await shot(page, "create-review", w);
  await page.getByRole("button", { name: "Create session" }).click();
  await page.getByText("Session created").waitFor();
  const id = (await page.getByTestId("created-session-id").textContent()) ?? "";
  check(/^[0-9a-f]{64}$/.test(id), `${w}: created screen shows the 64-hex session id`);
  await shot(page, "create-created", w);
  await page.getByRole("link", { name: "Open session workspace" }).click();
  await page.waitForURL(new RegExp(id)); await settled(page);
  check((await page.getByTestId("session-id").textContent()) === id, `${w}: workspace shows the same id`);
  check(await page.getByText("2 active participants").count() === 0 && await page.getByText(/active participants?; at least 2/).count() === 0, `${w}: created session with two participants is past the Participation step`);
  await shot(page, "workspace-new-session", w);

  // ---- participants: remove and re-add on the new session ----
  await page.goto(`${BASE}/sessions/${id}?tab=participants`); await settled(page);
  await page.getByRole("button", { name: "Remove" }).first().click();
  await page.getByRole("button", { name: "Remove", exact: true }).last().click();
  await page.getByText(/active participant; at least 2|1 active participant/).first().waitFor().catch(() => {});
  await shot(page, "workspace-participants-after-remove", w);

  // ---- the calculated session: all tabs ----
  await open(page, "Q4 clearing");
  const base = page.url().split("?")[0];
  await vis(page.getByText("Calculation awaiting review").first(), `${w}: stepper sub-label says the calculation awaits review`);
  check(await page.getByRole("button", { name: "Review the calculation", exact: true }).isDisabled(), `${w}: the Phase D action is disabled, not faked`);
  await shot(page, "workspace-overview", w);
  for (const t of ["participants", "obligations", "netting", "approvals", "settlement", "activity"]) {
    await page.goto(`${base}?tab=${t}`); await settled(page); await shot(page, `workspace-${t}`, w);
  }
  await page.goto(`${base}?tab=netting`); await vis(page.getByText("Pays"), `${w}: netting tab shows real positions`);

  // stale session and draft
  await open(page, "Monthly settlement"); await vis(page.getByText(/calculation is stale/i).first(), `${w}: stale session says so`); await shot(page, "workspace-stale", w);
  await open(page, "Draft run"); await vis(page.getByText(/active participants?; at least 2/).first(), `${w}: empty draft is at Participation`); await shot(page, "workspace-draft", w);

  // not found
  await page.goto(`${BASE}/sessions/${"0".repeat(64)}`); await settled(page);
  await vis(page.getByText("This session does not exist in this organization"), `${w}: unknown session shows not found`);
  await shot(page, "workspace-not-found", w);

  // attention list Open button works (Alice sees the stale item)
  await page.goto(BASE + "/"); await settled(page);
  // the Overview reads the 10 newest sessions; the stale one may be older, so extend the window until everything is read
  for (let i = 0; i < 5 && await page.getByRole("button", { name: "Load next 10 sessions" }).count(); i++) { await page.getByRole("button", { name: "Load next 10 sessions" }).click(); await settled(page); }
  const openLink = page.getByRole("list", { name: "Needs your attention" }).locator('a[href^="/sessions/"]').first();
  await vis(openLink, `${w}: Attention has an enabled Open link`);
  await openLink.click(); await page.waitForURL(/\/sessions\/[0-9a-f]{64}/);
  await page.context().clearCookies();

  // ---- Bob: member with the reviewer grant ----
  await signIn(page, "bob@example.test");
  await page.goto(BASE + "/sessions"); await settled(page);
  check(await page.getByRole("button", { name: "Create session" }).isDisabled(), `${w}: member's Create session is disabled`);
  await vis(page.getByText(/Only administrators can do this/).first(), `${w}: member sees why`);
  await shot(page, "sessions-list-member", w);
  await page.goto(BASE + "/sessions/new"); await settled(page);
  await vis(page.getByText("You cannot create sessions"), `${w}: member is denied the wizard`);
  await shot(page, "create-denied-member", w);
  await open(page, "Q4 clearing"); await shot(page, "workspace-overview-reviewer", w);
  await vis(page.getByText("A reviewer", { exact: false }).first(), `${w}: reviewer sees a reviewer next action`);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "all checks passed; no overflow, page errors or console errors");
process.exit(problems.length ? 1 : 0);
