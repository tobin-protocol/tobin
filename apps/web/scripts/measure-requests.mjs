// Counts the API requests the browser makes while a page loads, per role. Used to compare first-load request counts before and after a change.
// Usage: node scripts/measure-requests.mjs [label]    (needs apps/web on :3100 and a seeded console; alice = admin, bob = reviewer, carol = member)
import { chromium } from "@playwright/test";

const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PW = "Correct-horse-battery-1";
const PAGES = ["/", "/sessions"];
const label = process.argv[2] ?? "run";
const browser = await chromium.launch({ channel: "chrome" });
const rows = [];

for (const who of ["alice", "bob", "carol"]) {
  for (const path of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/sign-in");
    // the email path of whichever sign-in page this build has
    await page.locator("#auth-email, #login-email, button:has-text('Email')").first().waitFor();
    if (await page.locator("#auth-email").count()) {
      await page.locator("#auth-email").fill(`${who}@example.test`);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.locator("#login-password").fill(PW);
      await page.getByRole("button", { name: "Log in", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Email", exact: true }).click();
      await page.locator("#login-email").fill(`${who}@example.test`);
      await page.locator("#login-password").fill(PW);
      await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
    }
    await page.waitForURL(BASE + "/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    // count from a clean navigation (a hard load of the page under test)
    const seen = [];
    page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/") && r.method() !== "OPTIONS") seen.push(u.pathname); });
    await page.goto(BASE + path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    const bySession = seen.filter((p) => /\/sessions\/[0-9a-f]{64}/.test(p)).length;
    rows.push({ who, path, total: seen.length, perSession: bySession, other: seen.length - bySession });
    await ctx.close();
  }
}
await browser.close();
console.log(`requests per first load (${label})`);
console.log("role   page       total  per-session  other");
for (const r of rows) console.log(`${r.who.padEnd(6)} ${r.path.padEnd(10)} ${String(r.total).padStart(5)} ${String(r.perSession).padStart(11)} ${String(r.other).padStart(6)}`);
