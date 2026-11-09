// Wallet popover states, checked in a real browser against a MOCK Freighter. The mock answers the same window messages the pinned @stellar/freighter-api
// sends to the extension (REQUEST_*), so the app's real code path runs; no real Freighter, no key, no network. The Tobin backend is the real throwaway console.
// For each state at 1440 and 390: the popover's text and actions, a screenshot, and axe with the popover open. Also the Wallets tab on a wrong network, the
// Disconnect confirmation copy, and (last, 1440 only) one real Disconnect, which revokes the seeded wallet in the throwaway database.
// Usage: AXE_PATH=<axe.min.js> node scripts/review-wallet-states.mjs <output dir>      (needs the seeded servers on :3100 / :8787; run scripts/seed-review-data.mjs with SEED_WALLET=1)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out || !process.env.AXE_PATH) throw new Error("usage: AXE_PATH=<axe.min.js> node scripts/review-wallet-states.mjs <output dir>");
mkdirSync(out, { recursive: true });
const axeSource = readFileSync(process.env.AXE_PATH, "utf8");
const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PW = "Correct-horse-battery-1";
const TESTNET = "Test SDF Network ; September 2015", PUBLIC = "Public Global Stellar Network ; September 2015";
const OTHER_KEY = "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37";
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
const copy = [];
const browser = await chromium.launch({ channel: "chrome" });

const ctx0 = await browser.newContext();
await ctx0.request.post(`${BASE}/api/auth/login`, { data: { email: "alice@example.test", password: PW } });
const me = await (await ctx0.request.get(`${BASE}/api/auth/me`)).json();
const walletKey = me.wallets?.[0]?.publicKey;
if (!walletKey) throw new Error("the seeded account has no verified wallet; run the seed with SEED_WALLET=1");

// the mock extension: answers the window messages freighter-api posts. mode: absent => no answer at all (Freighter not installed)
const mockScript = (mode) => `(() => {
  const mode = ${JSON.stringify(mode)};
  if (!mode) return;
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") return;
    const reply = (extra) => window.postMessage({ source: "FREIGHTER_EXTERNAL_MSG_RESPONSE", messagedId: d.messageId, ...extra }, window.location.origin);
    switch (d.type) {
      case "REQUEST_CONNECTION_STATUS": return reply({ isConnected: true });
      case "REQUEST_ALLOWED_STATUS": return reply({ isAllowed: mode.allowed });
      case "REQUEST_PUBLIC_KEY": return mode.locked ? reply({ publicKey: "", apiError: { code: -4, message: "wallet is locked" } }) : reply({ publicKey: mode.address });
      case "REQUEST_NETWORK_DETAILS": return reply({ networkDetails: { network: mode.network, networkName: mode.network, networkUrl: "", networkPassphrase: mode.passphrase } });
      case "REQUEST_ACCESS": return mode.locked ? reply({ publicKey: "", apiError: { code: -4, message: "wallet is locked" } }) : reply({ publicKey: mode.address });
      default: return reply({ apiError: { code: -1, message: "mock: unsupported " + d.type } });
    }
  });
})();`;
const STATES = [
  { id: "not-found", mode: null, text: [/Freighter not found/, /Install the extension/], actions: ["Check again"], none: ["Connect Freighter", "Disconnect", "Manage wallets"], connected: "No" },
  { id: "not-connected", mode: { allowed: false }, text: [/installed, not connected/, /has not been given access/], actions: ["Connect Freighter", "Check again"], none: ["Disconnect", "Manage wallets"], connected: "No" },
  { id: "locked-or-denied", mode: { allowed: true, locked: true }, text: [/locked or access was declined/, /Unlock Freighter/], actions: ["Connect Freighter", "Check again"], none: ["Disconnect"], connected: "No" },
  { id: "connected-verified", mode: { allowed: true, address: walletKey, network: "TESTNET", passphrase: TESTNET }, text: [/Connected and verified/, /verified record of this key/], actions: ["Disconnect"], links: ["Manage wallets"], none: ["Connect Freighter", "Check again"], connected: "Yes", verified: "Yes" },
  { id: "connected-unverified", mode: { allowed: true, address: OTHER_KEY, network: "TESTNET", passphrase: TESTNET }, text: [/Connected, not verified/, /nothing to disconnect/], actions: [], links: ["Manage wallets"], none: ["Connect Freighter", "Check again", "Disconnect"], connected: "Yes", verified: "No" },
  { id: "wrong-network", mode: { allowed: true, address: walletKey, network: "PUBLIC", passphrase: PUBLIC }, text: [/Wrong network/, /Tobin supports Stellar Testnet only in this build\. Switch Freighter to Testnet\./, /Freighter is on PUBLIC/], actions: ["Check again"], none: ["Connect Freighter", "Disconnect", "Manage wallets"], connected: "No" },
];

async function signedInPage(w, mode) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(mockScript(mode));
  const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email: "alice@example.test", password: PW } });
  if (!r.ok()) throw new Error("login " + r.status());
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  return { ctx, page, errs };
}
const settle = async (page) => { await page.waitForLoadState("networkidle"); await page.waitForTimeout(3200); }; // the not-found path waits out freighter-api's 2 s timeout
async function axeScan(page, label) {
  await page.evaluate(axeSource);
  const res = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } })).violations.map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes[0]?.target?.join(" ")})`));
  check(res.length === 0, `axe ${label}: ${res.length ? res.join("; ") : "zero violations"}`);
}

for (const w of [1440, 390]) {
  for (const s of STATES) {
    const { ctx, page, errs } = await signedInPage(w, s.mode);
    await page.goto(BASE + "/"); await settle(page);
    const trigger = page.getByRole("button", { name: /^Wallet:/ });
    const label = await trigger.getAttribute("aria-label");
    await trigger.click();
    const pop = page.locator("[data-wallet-state]");
    await pop.waitFor({ timeout: 5000 });
    check((await pop.getAttribute("data-wallet-state")) === s.id, `${w} ${s.id}: popover state is ${s.id} (bar: "${label}")`);
    const text = await pop.innerText();
    for (const re of s.text) check(re.test(text), `${w} ${s.id}: says ${re}`);
    check(new RegExp(`Connected\\s+${s.connected}\\b`).test(text), `${w} ${s.id}: Connected row reads ${s.connected}`);
    if (s.verified) check(new RegExp(`Verified for your account\\s+${s.verified}\\b`).test(text), `${w} ${s.id}: Verified row reads ${s.verified}`);
    for (const b of s.actions) check((await pop.getByRole("button", { name: b, exact: true }).count()) === 1, `${w} ${s.id}: has the ${b} button`);
    for (const l of s.links ?? []) check((await pop.getByRole("link", { name: l }).count()) === 1, `${w} ${s.id}: has the ${l} link`);
    for (const n of s.none) check((await pop.getByRole("button", { name: n, exact: true }).count()) + (await pop.getByRole("link", { name: n }).count()) === 0, `${w} ${s.id}: does NOT offer ${n}`);
    if (s.id === "wrong-network") check(!/Connected, /.test(label ?? "") && !/Connected\s+Yes/.test(text), `${w} wrong network never reads as connected`);
    check((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, `${w} ${s.id}: no horizontal overflow`);
    copy.push(`--- ${w}px ${s.id} (top bar: ${label})\n${text.replace(/\n+/g, "\n")}\n`);
    await page.waitForTimeout(500); // let the open animation finish before the picture
    await page.screenshot({ path: `${out}/popover-${s.id}-${w}.png` });
    await axeScan(page, `${w} popover ${s.id}`);
    check(errs.length === 0, `${w} ${s.id}: no page errors${errs.length ? " " + errs[0] : ""}`);
    await ctx.close();
  }
}

// Wallets tab on a wrong network (1440 and 390): the card and the table row never say connected
for (const w of [1440, 390]) {
  const { ctx, page } = await signedInPage(w, STATES.find((s) => s.id === "wrong-network").mode);
  await page.goto(BASE + "/organization?tab=wallets"); await settle(page);
  const card = page.locator("section, div").filter({ has: page.getByRole("heading", { name: "Wallet in this browser" }) }).last();
  const t = await card.innerText();
  check(/Tobin supports Stellar Testnet only in this build\. Switch Freighter to Testnet\./.test(t) && /Not connected/.test(t) && !/Connected on/.test(t), `${w} Wallets tab: wrong-network card says "Not connected" plus the shared message`);
  const row = await page.getByRole("row").filter({ hasText: "Verified" }).first().innerText();
  check(/Not connected/.test(row) && !/\bConnected\b(?! *$)/.test(row.replace(/Not connected/g, "")), `${w} Wallets tab: the wallet's table row is Not connected on a wrong network (${row.replace(/\s+/g, " ").slice(0, 90)})`);
  const note = await page.getByRole("note").filter({ hasText: "Connect wallet window" }).innerText();
  check(/looks for a wallet in this browser/.test(note) && !/not available|nothing is linked/.test(note), `${w} Wallets tab: the note describes only the button (${note.slice(0, 80)}...)`);
  copy.push(`--- ${w}px Wallets tab, wrong network\n${t.replace(/\n+/g, "\n")}\nNOTE: ${note}\n`);
  await page.screenshot({ path: `${out}/wallets-tab-wrong-network-${w}.png` });
  await axeScan(page, `${w} Wallets tab (wrong network)`);
  await ctx.close();
}

// Disconnect confirmation (connected and verified), 1440 and 390; the real disconnect runs once, last
for (const w of [390, 1440]) {
  const { ctx, page } = await signedInPage(w, STATES.find((s) => s.id === "connected-verified").mode);
  await page.goto(BASE + "/"); await settle(page);
  await page.getByRole("button", { name: /^Wallet:/ }).click();
  await page.locator("[data-wallet-state]").getByRole("button", { name: "Disconnect", exact: true }).click();
  const dlg = page.locator("dialog[open]");
  await dlg.waitFor();
  await page.waitForTimeout(600);
  const t = await dlg.innerText();
  check(/Disconnect this wallet\?/.test(t) && /removes the verified record/.test(t) && /signs out every Tobin session that used it/.test(t) && /you will be signed out now/.test(t) && /a website cannot revoke it/.test(t) && /Freighter's connected sites/.test(t), `${w} Disconnect dialog: states what Tobin does and that Freighter's permission must be removed in Freighter`);
  check((await dlg.getByRole("button", { name: "Disconnect wallet" }).count()) === 1 && (await dlg.getByRole("button", { name: "Cancel" }).count()) === 1, `${w} Disconnect dialog: one confirm and one cancel`);
  copy.push(`--- ${w}px Disconnect confirmation (from the popover)\n${t.replace(/\n+/g, "\n")}\n`);
  await page.screenshot({ path: `${out}/disconnect-dialog-${w}.png` });
  await axeScan(page, `${w} Disconnect dialog`);
  if (w === 1440) {
    await dlg.getByRole("button", { name: "Disconnect wallet" }).click();
    await dlg.waitFor({ state: "hidden", timeout: 8000 });
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /^Wallet:/ }).click();
    const st = await page.locator("[data-wallet-state]").getAttribute("data-wallet-state");
    check(st === "connected-unverified", `1440 after the real Disconnect the popover reads connected-unverified (was verified): ${st}`);
    const after = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
    check((after.wallets ?? []).length === 0, "1440 the backend no longer lists the wallet as verified");
    await page.screenshot({ path: `${out}/popover-after-disconnect-1440.png` });
  }
  await ctx.close();
}

writeFileSync(`${out}/popover-copy.txt`, "Wallet popover copy as rendered (mock Freighter)\n\n" + copy.join("\n"));
await browser.close();
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log(" - " + p); process.exit(1); }
console.log("\nall checks passed");
