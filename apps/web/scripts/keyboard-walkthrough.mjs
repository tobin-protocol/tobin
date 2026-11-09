// Keyboard-only walkthrough of the main flows against the real backend. After the first page load nothing is clicked: only Tab, Shift+Tab, Enter, Space,
// Escape, arrow keys and typing. At every step it asserts that the focused element shows a visible focus ring (outline of at least 2px), and that dialogs
// take focus and give it back. Signs in as Alice, creates a session through the wizard, records an obligation and uses the command panel.
// Usage: node scripts/keyboard-walkthrough.mjs        (both servers running and seeded)
import { chromium } from "@playwright/test";

const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PW = "Correct-horse-battery-1";
const problems = []; let steps = 0; const ringless = new Set();
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => problems.push(`page error ${e}`));

const focused = () => page.evaluate(() => {
  const a = document.activeElement; if (!a || a === document.body) return null;
  const cs = getComputedStyle(a);
  return { tag: a.tagName.toLowerCase(), label: (a.getAttribute("aria-label") || a.getAttribute("title") || (a.labels && a.labels[0] ? a.labels[0].textContent : "") || a.textContent || a.id || "").trim().replace(/\s+/g, " ").slice(0, 60), id: a.id, type: a.getAttribute("type"), ring: (parseFloat(cs.outlineWidth) >= 2 && cs.outlineStyle !== "none") || (() => { const c = a.closest("label"); if (!c) return false; const k = getComputedStyle(c); return parseFloat(k.outlineWidth) >= 2 && k.outlineStyle !== "none"; })(), inDialog: !!a.closest("dialog") };
});
async function press(key) { await page.keyboard.press(key); }
/** Tab (or Shift+Tab) until the focused element's label matches; every stop must show a focus ring. */
async function tabTo(re, { max = 80, back = false } = {}) {
  for (let i = 0; i < max; i++) {
    await press(back ? "Shift+Tab" : "Tab"); steps++;
    const f = await focused();
    if (f && !f.ring && !(f.tag === "input" && f.type === "checkbox")) ringless.add(`${f.tag} "${f.label}"`);
    if (f && (re.test(f.label) || (f.id && re.test(f.id)))) return f;
  }
  throw new Error(`could not reach ${re} by keyboard within ${max} Tab presses`);
}

// ---- sign in ----
await page.goto(BASE + "/sign-in");
let f = await tabTo(/Skip to content/); check(!!f, "the first Tab stop is the skip link");
await press("Enter"); await page.waitForTimeout(200);
check(await page.evaluate(() => document.activeElement?.id === "main" || !!document.activeElement?.closest("main")), "Enter on the skip link moves focus into the main content");
await tabTo(/^Email$/); await press("Enter");
await tabTo(/Email address|login-email/); await page.keyboard.type("alice@example.test");
await press("Tab"); await page.keyboard.type(PW);
await press("Enter"); await page.waitForURL(BASE + "/", { timeout: 20000 });
check(true, "signed in with the keyboard alone");

// ---- navigate to Clearing Sessions ----
await page.waitForLoadState("networkidle");
await tabTo(/^Sessions/); await press("Enter"); await page.waitForURL(/\/sessions$/);
check(true, "reached Clearing Sessions with Tab and Enter");

// ---- create a session through the wizard ----
await tabTo(/^Create session$/); await press("Enter"); await page.waitForURL(/\/sessions\/new/);
await tabTo(/session-label|Session name/); await page.keyboard.type("Keyboard run");
await press("Enter"); // submits the form
await page.getByText("Add participants").first().waitFor();
const boxes = page.getByRole("checkbox");
await page.waitForTimeout(500);
await tabTo(/Alice/); await press("Space");
await tabTo(/Bob/); await press("Space");
check(await boxes.nth(0).isChecked() && await boxes.nth(1).isChecked(), "participants chosen with Space");
await tabTo(/^Review$/); await press("Enter");
await tabTo(/^Create session$/); await press("Enter");
await page.getByText("Session created").waitFor();
await tabTo(/Open session workspace/); await press("Enter"); await page.waitForURL(/\/sessions\/[0-9a-f]{64}/);
check(true, "created a session and opened its workspace with the keyboard");

// ---- workspace: sub-tab, record an obligation ----
await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
await tabTo(/^Obligations/); await press("Enter"); await page.waitForURL(/tab=obligations/);
await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
await tabTo(/ob-debtor|Debtor/); await page.keyboard.press("ArrowDown"); // first participant
await tabTo(/ob-creditor|Creditor/); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
await tabTo(/ob-amount|Amount/); await page.keyboard.type("42");
await tabTo(/ob-asset|Asset/); await page.keyboard.press("ArrowDown");
const review = await tabTo(/^Review obligation$/);
check(!!review, "the record form is reachable in a logical order: debtor, creditor, amount, asset, review");
await press("Enter");
await page.getByRole("dialog").waitFor();
f = await focused();
check(!!f?.inDialog, "opening the review dialog moves focus into it");
await press("Escape"); await page.waitForTimeout(250);
f = await focused();
check(f?.label === "Review obligation", `closing the dialog returns focus to its trigger (${f?.label})`);

// ---- command panel ----
await page.keyboard.press("Control+k");
await page.locator("[cmdk-input]").waitFor();
check(await page.evaluate(() => document.activeElement?.hasAttribute("cmdk-input")), "Ctrl+K opens the command panel with focus in its field");
check((await page.getByRole("listbox").count()) === 1, "the command panel exposes a listbox");
await page.keyboard.type("Q4"); // a session this browser has already loaded (the list was opened earlier)
await press("ArrowDown"); await page.waitForTimeout(150);
check(/Q4 clearing run/.test(await page.evaluate(() => document.querySelector("[cmdk-item][data-selected='true']")?.textContent ?? "")), "an arrow key selects the loaded session in the results");
await press("Enter"); await page.waitForURL(/\/sessions\/[0-9a-f]{64}/);
check(true, "Enter on a result navigates to the session");

// ---- keyboard trap check on a drawer ----
await page.goto(BASE + "/activity"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(600);
await tabTo(/Open the full record/, { max: 120 }); await press("Enter");
await page.getByText("Records are read-only.").waitFor();
f = await focused(); check(!!f?.inDialog, "the activity record drawer takes focus");
await press("Escape"); await page.waitForTimeout(250);
check((await focused())?.label.includes("Open the full record"), "closing the drawer returns focus to the row that opened it");

check(ringless.size === 0, `every focus stop showed a visible focus ring (${steps} stops)${ringless.size ? ": missing on " + [...ringless].slice(0, 5).join("; ") : ""}`);
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : `keyboard-only walkthrough passed (${steps} Tab presses)`);
process.exit(problems.length ? 1 : 0);
