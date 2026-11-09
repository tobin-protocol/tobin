// Phase E review run: drives the real UI (apps/web on :3100) against a real, seeded throwaway console backend (:8787, seeded with SEED_WALLET=1 so Alice has a
// real verified wallet). Covers activity, wallets, organization (profile, members, invitations, wallets), settings, notifications, the command panel and the
// bottom sheet, as admin (Alice) and a plain member (Carol). Asserts behaviour, checks horizontal overflow and saves screenshots.
// Usage: node scripts/review-screenshots-e.mjs <output dir>
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out) throw new Error("usage: review-screenshots-e.mjs <output dir>");
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
const dialog = (page) => page.getByRole("dialog").last();
const go = async (page, path) => { await page.goto(BASE + path); await settled(page); };

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { sessionStorage.setItem("tobin-sheet", "open"); } catch {} });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${w}: page error ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`${w}: console error ${m.text().slice(0, 160)}`); });

  // ============ Alice: administrator ============
  await signIn(page, "alice@example.test");

  // ---- activity ----
  await go(page, "/activity");
  await vis(page.getByText(/Showing \d+ of \d+ sessions|Showing all \d+ sessions/), `${w}: activity says how many sessions it read`);
  await vis(page.getByText("Events that belong to no session"), `${w}: activity says what it cannot list`);
  const before = await page.getByRole("list", { name: "Activity" }).getByRole("listitem").count();
  await page.getByLabel("Event type").selectOption({ label: "Obligation created" });
  const after = await page.getByRole("list", { name: "Activity" }).getByRole("listitem").count();
  check(after > 0 && after <= before, `${w}: the event-type filter narrows the list (${before} to ${after})`);
  await page.getByLabel("Result").selectOption("Refused");
  await vis(page.getByText("No activity matches"), `${w}: a filter with no match says so`);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await shot(page, "activity-global", w);
  await page.getByRole("list", { name: "Activity" }).getByRole("button").first().click();
  await vis(page.getByText("Records are read-only."), `${w}: the full record opens in a side panel`);
  check(await page.getByRole("button", { name: /^(Edit|Delete|Remove)/ }).count() === 0, `${w}: activity has no edit affordance`);
  await shot(page, "activity-record", w);
  await page.keyboard.press("Escape");

  await go(page, "/sessions?q=Q4"); await page.getByRole("link", { name: "Open", exact: true }).locator("visible=true").first().click(); await page.waitForURL(/\/sessions\/[0-9a-f]{64}/);
  await go(page, `${new URL(page.url()).pathname}?tab=activity`);
  await vis(page.getByLabel("Event type"), `${w}: the session Activity tab uses the same component`);
  check(await page.getByLabel("Session", { exact: true }).count() === 0, `${w}: the session tab has no session filter`);
  await shot(page, "activity-session-tab", w);

  // ---- wallets ----
  await go(page, "/wallets");
  // Freighter detection takes a moment; wait for it so the page is captured settled
  await page.waitForFunction(() => !document.body.innerText.includes("Checking for Freighter"), null, { timeout: 20000 }).catch(() => {});
  await vis(page.getByText("Freighter was not found in this browser."), `${w}: the wallet in this browser is reported as not found`);
  if (w === 1440) {
    await vis(page.getByRole("columnheader", { name: "Connection" }), `${w}: connection is its own column`);
    check(await page.getByRole("columnheader", { name: "Verification" }).count() === 1, `${w}: verification is its own column`);
    check(await page.getByRole("columnheader", { name: /provider/i }).count() === 0, `${w}: no provider column (the backend returns none)`);
    await vis(page.getByText("Not connected").first(), `${w}: connection reflects this browser (no Freighter here)`);
    await vis(page.getByText("Application roles never grant signing authority").first(), `${w}: the no-authority note is shown`);
    await shot(page, "wallets", w);
    await page.getByRole("button", { name: /^Details of wallet/ }).click();
    await vis(page.getByRole("button", { name: "Copy address" }), `${w}: wallet detail offers copy`);
    await shot(page, "wallet-detail", w);
    await page.getByRole("button", { name: "Disconnect wallet" }).click();
    await vis(dialog(page).getByText(/does not delete or change the Stellar account/), `${w}: the disconnect dialog says the Stellar account is untouched`);
    await shot(page, "wallet-disconnect-dialog", w);
    await dialog(page).getByRole("button", { name: "Disconnect wallet" }).click();
    await vis(page.getByText("No verified wallet"), `${w}: after disconnecting the wallet is gone`);
  } else {
    await vis(page.getByText("No verified wallet"), `${w}: empty wallet state`);
  }
  await shot(page, "wallets-empty", w);

  // ---- organization ----
  await go(page, "/organization");
  await vis(page.getByRole("heading", { name: "Edit profile" }), `${w}: admin can edit the profile`);
  await page.locator("#op-desc").fill(`Reviewed at width ${w}.`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await vis(page.getByText("Saved."), `${w}: the profile saves`);
  await shot(page, "organization-profile", w);

  await go(page, "/organization?tab=members");
  await vis(page.getByText("Reviewer is a separate grant"), `${w}: roles are Admin and Member, Reviewer is separate`);
  await vis(page.getByText("Owner, Operator, Approver and Viewer roles"), `${w}: the roles that do not exist read Not supported`);
  await shot(page, "organization-members", w);
  await page.getByRole("button", { name: "Open Carol" }).click();
  await shot(page, "member-panel", w);
  await page.getByRole("button", { name: "Change role" }).click();
  await vis(dialog(page).getByText("They will gain"), `${w}: the role dialog lists what the member would gain`);
  await vis(dialog(page).getByText("Record obligations"), `${w}: and names the real permissions`);
  await shot(page, "member-role-dialog", w);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open Alice" }).click();
  await page.getByRole("button", { name: "Change role" }).click();
  await dialog(page).getByLabel("New role").selectOption("member");
  await vis(dialog(page).getByText("last active administrator"), `${w}: demoting the last administrator is explained`);
  check(await dialog(page).getByRole("button", { name: "Change role" }).isDisabled(), `${w}: and cannot be confirmed`);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Remove member" }).click();
  await vis(dialog(page).getByText(/active obligations/), `${w}: the remove dialog lists the real consequences`);
  check(await dialog(page).getByRole("button", { name: "Remove member" }).isDisabled(), `${w}: the last administrator cannot be removed`);
  await shot(page, "member-remove-dialog", w);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await go(page, "/organization?tab=invitations");
  await page.locator("#inv-invitee").fill("ab");
  await page.getByRole("button", { name: "Create invitation" }).click();
  await vis(page.getByText(/at least 3 characters/), `${w}: a short invitee is refused under the field`);
  await page.locator("#inv-invitee").fill(`erin${w}@example.test`);
  await page.getByRole("button", { name: "Create invitation" }).click();
  await vis(dialog(page).getByTestId("invite-token"), `${w}: the one-time code is shown once`);
  await vis(dialog(page).getByText(/No email was sent/), `${w}: and says no email was sent`);
  await shot(page, "invitation-token", w);
  await dialog(page).getByRole("button", { name: "Done" }).click();
  await vis(page.getByText("Pending").first(), `${w}: the invitation is Pending`);
  await shot(page, "organization-invitations", w);
  await page.getByRole("button", { name: `Revoke invitation for erin${w}@example.test` }).click();
  await dialog(page).getByRole("button", { name: "Revoke invitation" }).click();
  await vis(page.getByText("Revoked").first(), `${w}: a revoked invitation shows Revoked`);

  await go(page, "/organization?tab=wallets");
  await vis(page.getByRole("heading", { name: "Verified accounts" }), `${w}: the Wallets sub-tab shows verified accounts`);
  await shot(page, "organization-wallets", w);

  // ---- settings, notifications ----
  await go(page, "/settings");
  await vis(page.getByRole("heading", { name: "Account", exact: true }), `${w}: Settings has an Account group`);
  await vis(page.getByRole("heading", { name: "Organization", exact: true }), `${w}: and an Organization group`);
  await vis(page.getByText("List of active sessions and revoking one"), `${w}: session listing reads Not supported`);
  await shot(page, "settings", w);
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await vis(dialog(page).getByText(/including this one/), `${w}: the sign-out-everywhere dialog states its scope`);
  await shot(page, "settings-signout-dialog", w);
  await page.keyboard.press("Escape");

  await go(page, "/notifications");
  await vis(page.getByText("The backend has no notifications"), `${w}: the notifications page says Not supported`);
  check(await page.getByLabel("Notifications: not supported").count() >= 1 || w < 768, `${w}: the bell reads not supported`);
  await shot(page, "notifications", w);

  // ---- command panel ----
  await go(page, "/");
  await page.keyboard.press("Control+k");
  await vis(page.getByText("Searches loaded sessions only."), `${w}: the command panel says what it searches`);
  await page.locator("[cmdk-input]").fill("Q4");
  await vis(page.getByText("Loaded sessions"), `${w}: loaded sessions appear under their own group`);
  await shot(page, "command-panel", w);
  await page.keyboard.press("Escape");

  // ============ Carol: plain member ============
  await signIn(page, "carol@example.test");
  await go(page, "/organization");
  await vis(page.getByText(/Only administrators can edit the profile/), `${w}: a member cannot edit the profile`);
  await go(page, "/organization?tab=invitations");
  await vis(page.getByText("Invitations are for administrators"), `${w}: a member is told invitations are for administrators`);
  await shot(page, "organization-invitations-member", w);
  await go(page, "/organization?tab=members");
  await page.getByRole("button", { name: "Open Alice" }).click();
  check(await page.getByRole("button", { name: "Change role" }).count() === 0, `${w}: a member has no role controls`);
  await vis(page.getByText("Only administrators can do this."), `${w}: and sees why`);
  await shot(page, "organization-members-member", w);
  await page.keyboard.press("Escape");
  if (w === 390) {
    // sign out everywhere really ends the session
    await go(page, "/settings");
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await dialog(page).getByRole("button", { name: "Sign out everywhere" }).click();
    await page.waitForURL(/\/sign-in/);
    check(true, `${w}: sign out everywhere returns to sign-in`);
  }
  await ctx.close();
}

// ============ the bottom sheet, without the open-state shortcut ============
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signIn(page, "alice@example.test");
  await go(page, "/sessions?q=Phase");
  const link = page.getByRole("link", { name: "Open", exact: true }).locator("visible=true").first();
  if (await link.count()) {
    await link.click(); await page.waitForURL(/\/sessions\/[0-9a-f]{64}/); await settled(page);
    await go(page, `${new URL(page.url()).pathname}?tab=obligations`);
    const pos = await page.locator("[data-sheet]").evaluate((n) => getComputedStyle(n).position);
    check(pos === "fixed", `390: the action panel is a fixed bottom sheet (position ${pos})`);
    await vis(page.locator("[data-sheet]").getByRole("button", { name: /Next step/ }), "390: the collapsed sheet shows what it is for");
    check(await page.getByRole("button", { name: "Review obligation" }).isVisible() === false, "390: the form is hidden while the sheet is collapsed");
    await page.screenshot({ path: `${out}/bottom-sheet-collapsed-390.png` });
    await page.locator("[data-sheet]").getByRole("button", { name: /Next step/ }).click();
    await vis(page.getByRole("button", { name: "Review obligation" }), "390: opening the sheet reveals the primary action");
    await page.screenshot({ path: `${out}/bottom-sheet-open-390.png` });
    const h = await page.locator("[data-sheet]").evaluate((n) => n.getBoundingClientRect().height);
    check(h < 844 * 0.8, `390: the open sheet leaves content visible (${Math.round(h)}px of 844)`);
  } else check(false, "390: a session exists for the bottom-sheet check");
  const wide = await ctx.newPage();
  await wide.setViewportSize({ width: 900, height: 900 });
  await wide.goto(page.url()); await settled(wide);
  check(await wide.locator("[data-sheet]").evaluate((n) => getComputedStyle(n).position) !== "fixed", "900: from 768px up the panel is not a bottom sheet");
  await ctx.close();
}
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "all checks passed; no overflow, page errors or console errors");
process.exit(problems.length ? 1 : 0);
