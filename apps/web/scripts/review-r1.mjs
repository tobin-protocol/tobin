// Rewrite phase R1 review run: drives the real UI (apps/web on :3100) against a seeded throwaway console backend (:8787). Verifies server-side access control
// (a signed-out request never receives protected markup), the public Discover page, the full-page sign-in with ?next=, the new sidebar / top bar / help tile at
// 1440, 1024, 768 and 390 px, the drawer under 1024px, keyboard behaviour of the command panel and menus, and sign-out returning to Discover.
// Usage: node scripts/review-r1.mjs <output dir>
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out) throw new Error("usage: review-r1.mjs <output dir>");
mkdirSync(out, { recursive: true });
const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PW = "Correct-horse-battery-1";
const WIDTHS = [1440, 1024, 768, 390];
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
const vis = async (loc, msg) => { let ok = true; try { await loc.first().waitFor({ state: "visible", timeout: 12000 }); } catch { ok = false; } check(ok, msg); };
const browser = await chromium.launch({ channel: "chrome" });

// 1. Access control, without a browser: the first response must not contain protected markup.
for (const path of ["/obligations", "/sessions", "/organization", "/approvals", "/settings", "/onboarding"]) {
  const r = await fetch(BASE + path, { redirect: "manual" });
  const loc = r.headers.get("location") ?? "";
  check(r.status >= 300 && r.status < 400 && loc.includes("/sign-in?next=" + encodeURIComponent(path)), `signed-out ${path} redirects to sign-in with next (${r.status} ${loc})`);
  const body = await r.text();
  check(!/Obligations|Clearing|Quarterly/i.test(body) || r.status >= 300, `signed-out ${path}: no protected markup in the response`);
}
{
  const r = await fetch(BASE + "/", { redirect: "manual" });
  check(r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").endsWith("/discover"), `signed-out / redirects to /discover (${r.headers.get("location")})`);
  const d = await fetch(BASE + "/discover", { redirect: "manual" });
  check(d.status === 200, "signed-out /discover is public (200)");
  const e = await fetch(BASE + "/sessions?x=1", { redirect: "manual", headers: { cookie: "tobin_session=not-a-real-session" } });
  check((e.headers.get("location") ?? "").includes("expired=1"), `a rejected cookie is sent to sign-in as expired (${e.headers.get("location")})`);
  const h = await fetch(BASE + "/discover", { headers: { "x-tobin-auth": "in" } });
  check(!(await h.text()).includes("Go to Overview"), "a forged x-tobin-auth header does not make Discover signed-in");
  const o = await fetch(BASE + "/sign-in?next=https%3A%2F%2Fevil.example", { redirect: "manual" });
  check(o.status === 200, "sign-in renders for a signed-out visitor even with a foreign next");
}

async function settled(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
}
async function shot(page, name, w) {
  await settled(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `${name}-${w}: no horizontal overflow (${overflow}px)`);
  await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: false });
}
const NAV = ["Discover", "Overview", "Sessions", "Obligations", "Reviews", "Activity", "Organization", "Settings"];

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${w}: page error ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`${w}: console error ${m.text().slice(0, 160)}`); });
  const desktop = w >= 1024;
  const openDrawer = async () => { if (!desktop) { await page.getByRole("button", { name: "Open navigation" }).click(); await page.getByRole("dialog").waitFor(); } };
  const closeDrawer = async () => { if (!desktop) { await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "hidden" }); } };
  const navScope = () => (desktop ? page.locator("aside") : page.getByRole("dialog")).getByRole("navigation", { name: "Primary" });

  // 2. Signed out: Discover
  await page.goto(BASE + "/");
  await page.waitForURL(BASE + "/discover");
  await settled(page);
  await vis(page.getByRole("heading", { name: "Discover", level: 1 }), `${w}: signed-out visitor lands on Discover`);
  check((await page.title()).startsWith("Discover"), `${w}: page title is specific (${await page.title()})`);
  await vis(page.getByText("Specification and testnet validation stage. Experimental. Test assets only. Not audited."), `${w}: maturity line`);
  const stats = page.getByRole("region", { name: "Protocol statistics" }).or(page.locator("section[aria-labelledby=stats-h]"));
  const statText = (await stats.innerText()).toUpperCase();
  for (const l of ["SETTLEMENTS RECORDED", "INSTITUTIONS OPTED IN", "ASSETS IN USE", "LAST SETTLEMENT"]) check(statText.includes(l), `${w}: stats row has ${l}`);
  check((statText.match(/NO DATA/g) ?? []).length === 4, `${w}: all four stats read No data (${(statText.match(/NO DATA/g) ?? []).length})`);
  check(!/\b0\b/.test(statText.replace(/\d+ of \d+/g, "")), `${w}: no stat reads 0`);
  for (const t of ["Settlements", "Institutions", "Assets"]) await vis(page.getByRole("navigation", { name: "Discover sections" }).getByRole("link", { name: t }), `${w}: sub-tab ${t}`);
  for (const t of ["institutions", "assets", "settlements"]) {
    await page.goto(BASE + `/discover?tab=${t}`); await settled(page);
    await vis(page.getByText("Public settlement data is not available yet."), `${w}: ${t} tab shows the empty tile`);
    check((await page.locator("main li").filter({ hasText: "Public settlement data is not available yet." }).count()) === 1, `${w}: ${t} tab shows exactly one tile and no rows`);
  }
  await page.goto(BASE + "/discover?tab=institutions&sort=most-settlements"); await settled(page);
  check((await page.locator("select").inputValue()) === "most-settlements", `${w}: the sort bar reads its value from the URL`);
  await page.locator("select").selectOption("newest"); await page.waitForURL(/sort=newest/);
  check(page.url().includes("tab=institutions"), `${w}: changing the sort keeps the tab and updates the URL`);
  await page.goto(BASE + "/discover?tab=settlements&sort=bogus"); await settled(page);
  check((await page.locator("select").inputValue()) === "newest", `${w}: an unknown sort falls back to the default`);
  const details = page.locator("details", { hasText: "How clearing works" });
  check((await details.getAttribute("open")) === null, `${w}: the clearing example is collapsed by default`);
  check(!(await page.locator("main").innerText()).includes("250"), `${w}: 250 does not appear until the example is opened`);
  await page.goto(BASE + "/discover"); await settled(page);
  await details.locator("summary").click();
  await vis(page.getByText("Illustrative example. Not live data."), `${w}: the example is labelled`);
  check((await page.locator("main").innerText()).includes("250"), `${w}: the example shows 250 once opened`);
  await details.locator("summary").click();
  check((await page.getByText(/SESSIONS: /).count()) === 0, `${w}: no banner on Discover`);
  const body = await page.locator("main").innerText();
  check(!/\b(Confirmed|Settled)\b/.test(body) && !/Alpha Bank|Alice|Bob|Carol/.test(body), `${w}: no confirmed state and no real names on the public page`);
  await openDrawer();
  const items = await navScope().getByRole("link").allInnerTexts();
  check(NAV.every((n) => items.some((t) => t.toUpperCase().includes(n.toUpperCase()))), `${w}: signed-out sidebar lists every destination`);
  const locked = await navScope().getByText("Locked: sign in first").count();
  check(locked === 7, `${w}: seven destinations are locked (${locked})`);
  check((await navScope().getByRole("link", { name: /Discover/i }).getAttribute("aria-current")) === "page", `${w}: Discover is the active item`);
  const foot = desktop ? page.locator("aside") : page.getByRole("dialog");
  await vis(foot.getByRole("link", { name: "Sign up / Log in" }), `${w}: sidebar footer has SIGN UP / LOG IN`);
  await vis(foot.getByRole("button", { name: "Connect wallet" }), `${w}: sidebar footer has CONNECT WALLET`);
  if (!desktop) { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/drawer-signed-out-${w}.png` }); }
  await closeDrawer();
  await vis(page.locator("header").getByRole("link", { name: "Sign up / Log in" }), `${w}: top bar has SIGN UP / LOG IN (primary)`);
  await vis(page.locator("header").getByRole("button", { name: "Connect wallet" }), `${w}: top bar has CONNECT WALLET (secondary)`);
  const v = (n) => page.locator("header").getByRole(n === "l" ? "link" : "button", { name: n === "l" ? "Sign up / Log in" : "Connect wallet" }).evaluate((e) => getComputedStyle(e).backgroundColor);
  check((await v("l")) === "rgb(0, 0, 0)" && (await v("b")) !== "rgb(0, 0, 0)", `${w}: SIGN UP / LOG IN is the filled primary, CONNECT WALLET the secondary`);
  await shot(page, "discover-signed-out", w);

  // 2b. The connect-wallet dialog
  await page.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  const dlg = page.getByRole("dialog");
  await vis(dlg.getByRole("heading", { name: "Connect wallet" }), `${w}: CONNECT WALLET opens the dialog`);
  await vis(dlg.getByText("Freighter", { exact: true }), `${w}: Freighter is listed`);
  await vis(dlg.getByText("NOT INSTALLED"), `${w}: it is labelled NOT INSTALLED (no extension in this browser)`);
  check((await dlg.getByText("INSTALLED", { exact: true }).count()) === 0, `${w}: it is not labelled INSTALLED`);
  check((await dlg.getByRole("link", { name: /Install Freighter/ }).getAttribute("href")) === "https://www.freighter.app", `${w}: install link`);
  await vis(dlg.getByText(/desktop browser extension/), `${w}: desktop-extension note`);
  check((await dlg.getByRole("textbox").count()) === 0, `${w}: no search field for one wallet`);
  check((await dlg.getByText(/seed phrase/).count()) >= 1 && !(await dlg.innerText()).toLowerCase().includes("enter your seed"), `${w}: it never asks for a seed phrase`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/connect-wallet-dialog-${w}.png` });
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "hidden" });
  check(await page.evaluate(() => document.activeElement?.textContent?.trim() === "Connect wallet"), `${w}: closing the dialog returns focus to the button that opened it`);

  // 3. A locked item goes to a separate sign-in page that returns here
  await openDrawer();
  await navScope().getByRole("link", { name: /Obligations/i }).click();
  await page.waitForURL(/\/sign-in\?next=%2Fobligations/);
  await vis(page.getByRole("heading", { name: "Sign up or sign in" }), `${w}: locked item opens the sign-in page`);
  check((await page.locator("aside").count()) === 0 && (await page.getByRole("navigation", { name: "Primary" }).count()) === 0, `${w}: sign-in is a full page with no sidebar`);
  const artVisible = await page.locator("svg[viewBox='0 0 600 800']").evaluate((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e.closest("div[aria-hidden]") ?? e).display !== "none");
  check(artVisible === (w >= 900), `${w}: the art panel is ${w >= 900 ? "shown" : "hidden under 900px"} (${artVisible})`);
  await vis(page.getByRole("link", { name: "Close and return to Discover" }), `${w}: close icon back to Discover`);
  await vis(page.getByLabel("Email address"), `${w}: an Email address field`);
  const cont = page.getByRole("button", { name: "Continue", exact: true });
  check(await cont.isDisabled(), `${w}: Continue is disabled while the address is empty`);
  await page.locator("#auth-email").fill("not-an-email");
  check(await cont.isDisabled(), `${w}: and while it is invalid`);
  await page.locator("#auth-email").fill("alice@example.test");
  check(await cont.isEnabled(), `${w}: and enabled once valid`);
  await vis(page.getByRole("separator", { name: "Or" }), `${w}: an Or divider`);
  await vis(page.getByRole("button", { name: "Continue with wallet" }), `${w}: Continue with wallet`);
  await vis(page.getByText(/Experimental Stellar Testnet application/), `${w}: small testnet text`);
  await page.locator("#auth-email").fill("");
  await shot(page, "sign-in", w);
  await page.getByRole("button", { name: "Continue with wallet" }).click();
  await vis(page.getByRole("dialog").getByRole("heading", { name: "Connect wallet" }), `${w}: Continue with wallet opens the same dialog`);
  await page.keyboard.press("Escape");

  // 4. Email sign-in returns to the page that was asked for
  await page.locator("#auth-email").fill("alice@example.test");
  await cont.click();
  await vis(page.getByRole("button", { name: "Create account" }).first(), `${w}: step 2 offers log in or create account (the backend needs a password)`);
  await shot(page, "sign-in-step-2", w);
  await page.locator("#login-password").fill(PW);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(BASE + "/obligations");
  await settled(page);
  check(true, `${w}: sign-in returned to /obligations`);

  // 5. Signed-in frame
  await vis(page.getByRole("button", { name: /^Wallet:/ }), `${w}: wallet cell`);
  await vis(page.getByRole("button", { name: "Stellar Testnet" }).or(page.getByRole("button", { name: "Testnet" })), `${w}: environment button`);
  await vis(page.getByRole("link", { name: "Documentation (opens in a new tab)" }), `${w}: help tile`);
  await vis(page.getByRole("link", { name: "Notifications: not supported" }), `${w}: notifications link`);
  await openDrawer();
  const inItems = await navScope().getByRole("link").allInnerTexts();
  check(NAV.every((n) => inItems.some((t) => t.toUpperCase().includes(n.toUpperCase()))), `${w}: signed-in sidebar lists every destination`);
  check((await navScope().getByText("Locked: sign in first").count()) === 0, `${w}: nothing is locked when signed in`);
  for (const t of ["Documentation", "Repository", "Share feedback"]) await vis(page.getByRole("link", { name: new RegExp(t) }).first(), `${w}: external link ${t}`);
  await vis(page.getByRole("button", { name: /^Organization: / }), `${w}: organization selector`);
  check((await navScope().getByRole("link", { name: /Obligations/i }).getAttribute("aria-current")) === "page", `${w}: Obligations is the active item`);
  check((await navScope().getByRole("link", { name: /Wallets/i }).count()) === 0, `${w}: Wallets is not a top-level item`);
  if (!desktop) { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/drawer-signed-in-${w}.png` }); }
  await closeDrawer();
  await shot(page, "shell-signed-in", w);

  // 6. Signed-in Discover keeps the app frame
  await page.goto(BASE + "/discover");
  await settled(page);
  await vis(page.getByRole("link", { name: "Go to Overview" }), `${w}: signed-in Discover offers Go to Overview`);
  await vis(page.getByRole("button", { name: /^Wallet:/ }), `${w}: signed-in Discover has the full top bar`);
  await shot(page, "discover-signed-in", w);

  // 7. Signed-in visits to sign-in bounce
  await page.goto(BASE + "/sign-in?next=%2Fsessions");
  await page.waitForURL(BASE + "/sessions");
  await settled(page);
  check(true, `${w}: a signed-in visit to sign-in follows next`);

  // 8. Keyboard: command panel and menus
  if (w >= 640) {
    await page.keyboard.press("Control+k");
    await vis(page.getByRole("dialog"), `${w}: Ctrl+K opens the command panel`);
    await vis(page.getByRole("listbox"), `${w}: the panel exposes a listbox`);
    await page.keyboard.press("ArrowDown");
    const sel = await page.locator("[cmdk-item][data-selected='true']").count();
    check(sel === 1, `${w}: arrow keys move the selection (${sel})`);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    check(true, `${w}: Escape closes the command panel`);
  }
  await page.getByRole("button", { name: /^Account:/ }).click();
  await vis(page.getByRole("menu"), `${w}: account menu opens as a menu`);
  await page.keyboard.press("Escape");
  await page.getByRole("menu").waitFor({ state: "hidden" });
  await page.waitForTimeout(250);
  const focusBack = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  check(/^Account:/.test(focusBack), `${w}: focus returns to the account button (${focusBack})`);
  await page.getByRole("button", { name: /^Wallet:/ }).click();
  await vis(page.getByText("Verified for your account"), `${w}: wallet popover shows connected and verified as separate rows`);
  await shot(page, "wallet-popover", w);
  await page.keyboard.press("Escape");

  // 9. Sign out returns to Discover
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(BASE + "/discover");
  check(true, `${w}: signing out returns to Discover`);
  const after = await fetch(BASE + "/obligations", { redirect: "manual", headers: { cookie: (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") } });
  check(after.status >= 300 && after.status < 400, `${w}: the old session no longer opens protected routes (${after.status})`);
  await ctx.close();
}
await browser.close();
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log(" - " + p); process.exit(1); }
console.log("\nall checks passed; no overflow, page errors or console errors");
