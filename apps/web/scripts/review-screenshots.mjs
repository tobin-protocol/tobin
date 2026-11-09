// Drives the real UI (apps/web on :3100) against a real, seeded throwaway console backend (:8787) and saves screenshots at 1440, 900 and 390 px.
// Usage: node scripts/review-screenshots.mjs <output dir>      (run scripts/seed-review-data.mjs first; both servers must be running)
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out) throw new Error("usage: review-screenshots.mjs <output dir>");
mkdirSync(out, { recursive: true });
const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PW = "Correct-horse-battery-1";
const WIDTHS = [1440, 900, 390];
const problems = [];

const browser = await chromium.launch({ channel: "chrome" });
const note = (m) => console.log(m);

async function signIn(page, email) {
  await page.goto(BASE + "/sign-in");
  await page.locator("#auth-email").fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#login-password").fill(PW);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}
async function settled(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.body.innerText.includes("Reading sessions…") && !document.querySelector("[aria-busy='true']"), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(400);
}
async function shot(page, name, w) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) problems.push(`${name}-${w}: horizontal overflow ${overflow}px`);
  // the fixed bottom bar (under 768px) would be drawn mid-page in a full-page capture, so it is hidden for the capture only
  await page.addStyleTag({ content: "nav[aria-label=Primary].fixed,[data-sheet]{position:static!important}" }).catch(() => {});
  await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
  note(`saved ${name}-${w}.png`);
}

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1 });
  // the action panel is a bottom sheet under 768px: open it for the whole run so flows can reach its controls
  await ctx.addInitScript(() => { try { sessionStorage.setItem("tobin-sheet", "open"); } catch {} });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${w}: page error ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`${w}: console error ${m.text().slice(0, 160)}`); });

  // component gallery
  await page.goto(BASE + "/dev/components"); await settled(page); await shot(page, "gallery", w);

  // sign-in: initial, wallet failure (no Freighter in this browser), email
  await page.goto(BASE + "/sign-in"); await settled(page); await shot(page, "sign-in", w);
  await page.getByRole("button", { name: "Continue with wallet" }).click();
  await page.getByText("NOT INSTALLED").waitFor(); await shot(page, "sign-in-wallet-unavailable", w);
  await page.keyboard.press("Escape");
  await page.locator("#auth-email").fill("someone@example.test"); await page.getByRole("button", { name: "Continue", exact: true }).click(); await shot(page, "sign-in-email", w);

  // Alice: administrator
  await signIn(page, "alice@example.test");
  await page.waitForURL(BASE + "/"); await settled(page); await shot(page, "overview-admin", w);

  if (w === 1440) {
    await page.getByRole("button", { name: /^Organization:/ }).click(); await page.waitForTimeout(200); await shot(page, "menu-organization", w); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Wallet:/ }).click(); await page.waitForTimeout(200); await shot(page, "menu-wallet", w); await page.keyboard.press("Escape");
    // the bell is a muted link to the Not supported page (there are no notifications)
    await page.getByRole("link", { name: "Notifications: not supported" }).click(); await page.waitForURL(/notifications/); await shot(page, "notifications-not-supported", w); await page.goBack(); await settled(page);
    await page.keyboard.press("Control+k"); await page.waitForTimeout(300); await shot(page, "command-panel", w); await page.keyboard.press("Escape");
    await page.goto(BASE + "/sessions"); await settled(page); await shot(page, "placeholder-sessions", w);
  }
  // sign out, then Bob: member with the reviewer grant
  await ctx.clearCookies();
  if (w !== 900) {
    await signIn(page, "bob@example.test");
    await page.waitForURL(BASE + "/"); await settled(page); await shot(page, "overview-reviewer", w);
  }
  await ctx.clearCookies();

  // first-time onboarding: a brand-new account
  const email = `erin${w}-${Date.now()}@example.test`;
  await page.goto(BASE + "/sign-in");
  await page.locator("#auth-email").fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.locator("#reg-name").fill("Erin");
  await page.locator("#reg-password").fill(PW);
  await page.getByRole("button", { name: "Create account" }).last().click();
  await page.waitForURL(/\/onboarding/); await settled(page); await shot(page, "onboarding-choose", w);
  await page.getByRole("button", { name: /Create an organization/ }).click(); await shot(page, "onboarding-create", w);
  await page.getByLabel("Organization name").fill(`Erin Payments ${w}-${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Review" }).click(); await shot(page, "onboarding-review", w);
  await page.getByRole("button", { name: "Back" }).click(); await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: /Join with an invitation/ }).click();
  await page.getByLabel("One-time invitation code").fill("not-a-valid-code");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page.getByText(/not valid, has expired, or was already used/).waitFor(); await shot(page, "onboarding-join-error", w);
  await page.getByRole("button", { name: "Back" }).click(); await page.getByRole("button", { name: /Create an organization/ }).click();
  await page.getByLabel("Organization name").fill(`Erin Payments ${w}-${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL(BASE + "/"); await settled(page); await shot(page, "overview-new-org-empty", w);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "no overflow, page errors or console errors");
process.exit(problems.length ? 1 : 0);
