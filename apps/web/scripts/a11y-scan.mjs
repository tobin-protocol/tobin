// Accessibility audit of the key screens against the real backend: an axe-core scan (WCAG 2.0/2.1 A and AA plus best practice) at 1440 and 390 px, a
// tap-target audit (44px minimum) at 390 px, and a horizontal-overflow check at 1440, 900 and 390 px.
// axe-core is NOT a dependency of this repository: point AXE_PATH at an axe.min.js installed elsewhere (for example `npm i axe-core` in a scratch folder).
// Usage: AXE_PATH=<path to axe.min.js> node scripts/a11y-scan.mjs        (both servers running and seeded; signs in as Alice)
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const AXE = process.env.AXE_PATH;
if (!AXE) throw new Error("set AXE_PATH to an axe.min.js file");
const axeSource = readFileSync(AXE, "utf8");
const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PW = "Correct-horse-battery-1";
const browser = await chromium.launch({ channel: "chrome" });
const bad = []; const summary = [];

async function sessionPath(page) {
  await page.goto(BASE + "/sessions?q=Q4"); await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: /^Open \S/ }).locator("visible=true").first().click();
  await page.waitForURL(/\/sessions\/[0-9a-f]{64}/);
  return new URL(page.url()).pathname;
}
async function settled(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.body.innerText.includes("Reading sessions…") && !document.querySelector("[aria-busy='true']"), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function scanPage(page, label, w) {
  await settled(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) bad.push(`${label} @${w}: horizontal overflow ${overflow}px`);
  await page.evaluate(axeSource);
  const res = await page.evaluate(async () => {
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, target: v.nodes[0]?.target?.join(" ") ?? "", html: (v.nodes[0]?.html ?? "").slice(0, 120) }));
  });
  summary.push({ label, w, violations: res });
  for (const v of res) if (v.impact === "serious" || v.impact === "critical") bad.push(`${label} @${w}: [${v.impact}] ${v.id}: ${v.help} (${v.nodes} node${v.nodes === 1 ? "" : "s"}; ${v.target})`);
  if (w === 390) {
    const small = await page.evaluate(() => {
      const sel = "a[href], button, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, [role=button], [role=tab], summary";
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
        if (el.disabled || el.getAttribute("aria-disabled") === "true") continue; // disabled controls are exempt
        if (el.closest(".sr-only") || el.classList.contains("sr-only")) continue;
        if (el.textContent?.trim() === "Skip to content") continue;
        // an inline link inside running text is exempt (WCAG 2.5.8 inline exception)
        const inline = cs.display === "inline" && el.closest("p, li, dd, span.block, label");
        if (inline) continue;
        // a form control inside its field card (a label) is tapped through the card
        const box = ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) ? (el.closest("label")?.getBoundingClientRect() ?? r) : r;
        if (box.height < 43.5 || box.width < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    });
    for (const s of small) bad.push(`${label} @390: tap target below 44px: ${s}`);
  }
}

for (const w of [1440, 900, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem("tobin-sheet", "open"); } catch {} });
  const page = await ctx.newPage();
  await page.goto(BASE + "/discover"); await scanPage(page, "discover-signed-out", w);
  await page.goto(BASE + "/sign-in"); await scanPage(page, "sign-in", w);
  await page.getByRole("button", { name: "Continue with wallet" }).click(); await page.getByRole("dialog").waitFor(); await scanPage(page, "connect-wallet-dialog", w); await page.keyboard.press("Escape");
  await page.locator("#auth-email").fill("alice@example.test"); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await scanPage(page, "sign-in-step-2", w);
  await page.locator("#login-password").fill(PW);
  await page.getByRole("button", { name: "Log in", exact: true }).click(); await page.waitForURL(BASE + "/");
  const sp = await sessionPath(page);
  const pages = [["discover-signed-in", "/discover"], ["overview", "/"], ["sessions", "/sessions"], ["create-session", "/sessions/new"], ["obligations", "/obligations"], ["approvals", "/approvals"], ["activity", "/activity"], ["wallets", "/wallets"],
    ["organization-profile", "/organization"], ["organization-members", "/organization?tab=members"], ["organization-invitations", "/organization?tab=invitations"], ["organization-wallets", "/organization?tab=wallets"],
    ["settings", "/settings"], ["notifications", "/notifications"], ["components", "/dev/components"],
    ...["overview", "participants", "obligations", "netting", "approvals", "settlement", "activity"].map((t) => [`workspace-${t}`, t === "overview" ? sp : `${sp}?tab=${t}`])];
  for (const [label, path] of pages) { await page.goto(BASE + path); await scanPage(page, label, w); }
  await ctx.close();
}
await browser.close();

console.log("\naxe results (all impacts):");
const all = new Map();
for (const s of summary) for (const v of s.violations) { const k = `${v.impact}\t${v.id}\t${v.help}`; all.set(k, [...(all.get(k) ?? []), `${s.label}@${s.w}`]); }
if (all.size === 0) console.log("  no violations on any scanned screen");
for (const [k, where] of all) console.log(`  ${k}\n    on ${where.length} scan(s): ${[...new Set(where)].slice(0, 6).join(", ")}${where.length > 6 ? ", ..." : ""}`);
console.log(`\nscanned ${summary.length} page-width combinations`);
console.log(bad.length ? "\nBLOCKING FINDINGS:\n" + [...new Set(bad)].join("\n") : "\nno serious or critical axe violations, no tap target under 44px at 390px, no horizontal overflow");
process.exit(bad.length ? 1 : 0);
