// REAL-BROWSER journey for settlement PREPARATION (MVP-1.4): the preparation checks, preparing a batch from an approved calculation, reading its instructions and
// validation, rejecting with a reason, recalculating, approving a second batch, invalidation after a data change, history, activity, persistence across a server
// restart, member and outsider views. Production build, real SQLite, real cookies. Nothing is signed, submitted or settled: no wallet or Stellar call exists.
//   TOBIN_WIDTH=420 node test/browser/settlement-journey.mjs <absolute artifact dir>      (also run at TOBIN_WIDTH=1200)
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Page, findBrowser, launchBrowser, sleep } from './cdp.mjs';
import { createBackend } from '../../lib/server/backend.ts';
import { SqliteRegistryStore } from '../../lib/registry/sqlite-store.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const W = Number(process.env.TOBIN_WIDTH ?? 1200);
const out = process.argv[2] ?? join(root, 'test', 'browser', 'settlement-out');
mkdirSync(out, { recursive: true });
const exe = findBrowser();
if (!exe) throw new Error('no Chrome or Edge found (set TOBIN_BROWSER)');
const PORT = 31000 + Math.floor(Math.random() * 4000);
const DEBUG_PORT = 36000 + Math.floor(Math.random() * 3000);
const BASE = `http://127.0.0.1:${PORT}`;
const dbDir = mkdtempSync(join(tmpdir(), 'tobin-sjourney-'));
const DB = join(dbDir, 'journey.sqlite');
const PW = randomBytes(12).toString('base64url');
const ISSUER = 'G' + 'A'.repeat(55); // test fixture, not a real issuer
const results = [];
let currentStep = '';
const q = (s) => JSON.stringify(s);
function check(name, cond, detail = '') {
  results.push({ step: currentStep, name, ok: Boolean(cond), detail: cond ? '' : String(detail).slice(0, 1200) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  [${currentStep}] ${name}${cond ? '' : '\n      ' + String(detail).slice(0, 1200)}`);
}
async function step(name, fn) {
  currentStep = name;
  try { await fn(); } catch (e) { let page = ''; try { page = await pages[0].ev("document.querySelector('main')?.innerText.slice(0, 700) ?? ''"); } catch { /* page unavailable */ }
    check('step completed without an exception', false, (e instanceof Error ? e.message : String(e)) + ' | page: ' + page); }
}

// ---- seed through the application's own services; the settlement workflow itself is driven through the UI ----
let SESSION_ID = '', ORG_ID = '';
{
  const s = createBackend(DB, { auth: {}, secureCookies: true });
  new SqliteRegistryStore(s.db).putAsset({ id: `testnet:USD:${ISSUER}`, network: 'testnet', kind: 'issued', code: 'USD', issuer: ISSUER, status: 'supported', source: 'operator-configured', addedAt: new Date().toISOString() });
  const reg = (name) => s.auth.register({ email: `${name.toLowerCase()}@example.test`, password: PW, displayName: name });
  const alice = await reg('Alice'), bob = await reg('Bob'), carol = await reg('Carol'), dan = await reg('Dan'), eve = await reg('Eve');
  const alpha = s.registry.createOrganization(alice, { name: 'Alpha Bank' });
  ORG_ID = alpha.id;
  for (const [u, e] of [[bob, 'bob'], [carol, 'carol'], [dan, 'dan']]) s.registry.acceptInvitation(u, s.registry.invite(alice, alpha.id, { invitee: `${e}@example.test`, role: 'member' }).token);
  s.registry.grantReviewer(alice, alpha.id, bob.userId); s.registry.grantReviewer(alice, alpha.id, dan.userId);
  s.registry.createOrganization(eve, { name: 'Eve Capital' });
  SESSION_ID = randomBytes(32).toString('hex');
  s.registry.recordSession(alice, alpha.id, { sessionId: SESSION_ID, label: 'Q4 clearing run' });
  for (const u of [alice, bob, carol]) s.registry.addSessionParticipant(alice, alpha.id, SESSION_ID, { userId: u.userId });
  for (const [d, c, a] of [[alice, bob, '100'], [bob, carol, '80'], [carol, alice, '70']]) s.registry.createObligation(alice, alpha.id, SESSION_ID, { debtor: d.userId, creditor: c.userId, amount: a, asset: 'USD' });
  s.registry.calculate(alice, alpha.id, SESSION_ID);
  s.db.close();
}

let server;
async function startServer() {
  const env = { ...process.env, PORT: String(PORT), NODE_ENV: 'production', TOBIN_DB_PATH: DB };
  server = spawn(process.execPath, [join(root, '..', '..', 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '--hostname', '127.0.0.1', '--port', String(PORT)], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 30000);
    server.stdout.on('data', (d) => { if (String(d).includes('Ready')) { clearTimeout(t); resolve(); } });
    server.on('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
}
async function stopServer() { server.removeAllListeners('exit'); server.kill(); await sleep(1500); }

const norm = (t) => t.replace(/\s+/g, ' ');
const main = async (p) => norm(await p.ev(`document.querySelector('main').innerText`));
const btn = (label) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${q(label)})`;
const tab = (name) => `[...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.trim() === ${q(name)})`;
const hasBtn = (p, label) => p.ev(`!!${btn(label)}`);
async function setValue(p, expr, value) {
  await p.ev(`(() => { const el = ${expr}; if (!el) throw new Error('field not found: ' + ${q(expr.slice(0, 70))}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
  await sleep(60);
}
const input = (labelStart) => `[...document.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(${q(labelStart)}))?.querySelector('input, select')`;
const overflow = (p) => p.ev(`document.documentElement.scrollWidth - window.innerWidth`);
const layout = async (p, where) => check(`no horizontal overflow (${where})`, (await overflow(p)) <= 1, `overflow ${await overflow(p)}px`);
async function structure(p, where) {
  const r = await p.ev(`(() => { const issues = [];
    for (const el of document.querySelectorAll('main input, main select')) if (!(el.getAttribute('aria-label') || el.closest('label'))) issues.push('unlabelled ' + el.tagName);
    for (const t of document.querySelectorAll('main table')) { if (!t.querySelector('caption')) issues.push('table without caption'); if (t.querySelector('thead th:not([scope])')) issues.push('th without scope'); }
    for (const b of document.querySelectorAll('button')) if (!b.textContent.trim() && !b.getAttribute('aria-label')) issues.push('unnamed button');
    return issues; })()`);
  check(`accessibility structure (${where})`, r.length === 0, r.join('; '));
}
async function signInAs(P, name) {
  await P.navigate(`${BASE}/sign-in`);
  await P.waitFor(`document.querySelector('input[type=email]')`); await sleep(1200);
  await setValue(P, input('Email'), `${name.toLowerCase()}@example.test`); await setValue(P, input('Password'), PW);
  await P.click(btn('Sign in'));
  await P.waitFor(`location.pathname === '/sessions'`, { what: `sign-in of ${name}` });
  await P.waitFor(`document.body.innerText.includes('Signed in as ${name}')`);
  await sleep(500);
}
async function signOut(P) { await P.click(btn('Sign out')); await P.waitFor(`location.pathname === '/sign-in'`, { what: 'sign-out redirect' }); }
async function openSession(P) {
  await P.waitFor(`[...document.querySelectorAll('button.ss-link')].some((b) => b.textContent.trim() === 'Q4 clearing run')`, { what: 'session listed' });
  await P.click(`[...document.querySelectorAll('button.ss-link')].find((b) => b.textContent.trim() === 'Q4 clearing run')`);
  await P.waitFor(`document.querySelector('[role=tab]')`, { what: 'workspace tabs' }); await sleep(400);
}
async function goTab(P, name, waitText) { await P.click(tab(name)); await P.waitFor(`document.querySelector('main').innerText.replace(/\\s+/g, ' ').includes(${q(waitText)})`, { what: `${name} tab shows ${waitText}` }); await sleep(300); }
const settleTab = (P) => goTab(P, 'Settlement preparation', 'Settlement preparation turns an approved calculation');
const rowsOf = (p, captionPart) => p.ev(`[...document.querySelectorAll('main table')].filter((t) => t.querySelector('caption')?.textContent.includes(${q(captionPart)})).flatMap((t) => [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.innerText.trim())))`);
async function approveCalculation(P, by) {
  await signOut(P); await signInAs(P, by); await openSession(P); await goTab(P, 'Authorization', 'Institutional authorization');
  await P.click(btn('Approve this calculation'));
  await P.waitFor(`document.querySelector('main').innerText.includes('Calculation approved')`); await sleep(400);
}

let browser;
const pages = [];
try {
  await startServer();
  browser = await launchBrowser({ exe, port: DEBUG_PORT, profileDir: join(out, '.profile-settlement') });
  const P = await Page.open(DEBUG_PORT, 'about:blank');
  pages.push(P);
  console.log(`browser ${browser.version}; viewport ${(await P.ev('[window.innerWidth, window.innerHeight]')).join('x')}`);

  await step('1 an unapproved calculation cannot be prepared, and the page says why', async () => {
    await signInAs(P, 'Alice'); await openSession(P);
    check('the Settlement preparation tab exists for an operational session', await P.ev(`!!${tab('Settlement preparation')}`));
    await settleTab(P);
    const t = await main(P);
    check('the stage ladder lists calculation, approval, preparation, batch approval and the three not-available Stellar stages', /Clearing calculation: complete/.test(t) && /Institutional calculation approval: unavailable/.test(t) && /Settlement preparation: not prepared/.test(t) && /Batch institutional approval: not approved/.test(t) && /Wallet signing: not available in MVP-1.4/.test(t) && /Transaction submission: not available in MVP-1.4/.test(t) && /On-chain confirmation: not available in MVP-1.4/.test(t), t.slice(0, 500));
    check('the checks show the missing approval with a reason, and the asset is recognised', /Failed:\s*The exact calculation has an active institutional approval/.test(t) && /no active approval: a reviewer must approve this exact calculation/.test(t) && /Passed:\s*The asset is in the supported asset list/.test(t) && /operator-configured; no on-chain check/.test(t), t.slice(0, 900));
    check('"Prepare settlement batch" is disabled and the page says to fix the checks first', await P.ev(`${btn('Prepare settlement batch')}.disabled`) && /Fix the failed checks first/.test(t));
    check('the page states preparation is not signing, submission or settlement', /It prepares; it does not execute/.test(t) && /No funds have moved/.test(t));
    await structure(P, 'settlement (not ready)'); await layout(P, 'settlement (not ready)');
    await P.screenshot(join(out, `settlement-not-ready-${W}.png`));
  });

  await step('2 after the calculation is approved, an administrator prepares a batch', async () => {
    await approveCalculation(P, 'Bob');
    await signOut(P); await signInAs(P, 'Alice'); await openSession(P); await settleTab(P);
    check('all preparation checks now pass and Prepare is enabled', !(await P.ev(`${btn('Prepare settlement batch')}.disabled`)) && /Passed:\s*The exact calculation has an active institutional approval/.test(await main(P)));
    await P.click(btn('Prepare settlement batch'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Settlement batch prepared')`, { what: 'prepared notice' }); await sleep(500);
    const t = await main(P);
    check('the notice states nothing was signed, submitted or settled', /Nothing has been signed, submitted or settled/.test(t));
    check('the batch is Awaiting review, bound to a calculation, with asset identity and total', /Status: Awaiting review/.test(t) && /Source calculation calc_[0-9a-f]{18}/.test(t) && /testnet:USD:G/.test(t) && /2 instruction\(s\), total 30 base units/.test(t), t.slice(0, 900));
    const ins = await rowsOf(P, 'Settlement instructions');
    check('instructions are Alice pays Bob 20 and Alice pays Carol 10 (hand-computed from nets +30, -20, -10)', ins.length === 2 && ins.every((r) => r[2] === 'Alice' && r[4] === 'USD') && ins.map((r) => `${r[3]}:${r[5]}`).sort().join() === 'Bob:20,Carol:10', JSON.stringify(ins));
    check('every instruction has a stable id and shows Validation: valid', ins.every((r) => /^ins_[0-9a-f]{8}/.test(r[1]) && r[6] === 'valid'), JSON.stringify(ins));
    check('every validation check passes, including the independent reconciliation', await P.ev(`[...document.querySelectorAll('.ss-checks')].pop().querySelectorAll('li').length >= 6 && [...document.querySelectorAll('.ss-checks')].pop().innerText.indexOf('Failed') < 0`) && /Instructions reconcile exactly to the approved net positions/.test(t));
    check('the ladder shows preparation done, batch approval pending, signing and later stages not available', /Settlement preparation: prepared/.test(t) && /Batch institutional approval: not approved/.test(t) && /Wallet signing: not available/.test(t));
    check('Alice prepared it and is not a reviewer: she is told she cannot decide, with the reason', /You cannot decide on this batch/.test(t) && /reviewer capability/.test(t) && !(await hasBtn(P, 'Approve this batch')));
    await structure(P, 'settlement (prepared)'); await layout(P, 'settlement (prepared)');
    await P.screenshot(join(out, `settlement-prepared-${W}.png`));
  });

  await step('3 a different reviewer rejects the batch, with a mandatory reason', async () => {
    await signOut(P); await signInAs(P, 'Dan'); await openSession(P); await settleTab(P);
    let t = await main(P);
    check('Dan (reviewer, did not prepare it) is told he is eligible', /You are eligible to decide on these exact instructions/.test(t) && await hasBtn(P, 'Approve this batch'), t.slice(0, 300));
    check('and Dan has no Prepare control (administrators prepare)', !(await hasBtn(P, 'Prepare settlement batch')));
    await P.click(btn('Reject this batch')); await P.waitFor(`document.querySelector('form[aria-label="Reject batch"]')`);
    await P.click(btn('Confirm rejection')); await P.waitFor(`document.querySelector('main [role="alert"]')`);
    check('rejecting without a reason is refused and nothing is recorded', /needs a reason/.test(await P.ev(`document.querySelector('main [role="alert"]').innerText`)) && /Status: Awaiting review/.test(await main(P)));
    await setValue(P, input('Reason'), 'Settlement amounts need re-confirmation with Beta Bank');
    await P.click(btn('Confirm rejection'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Batch rejected. Your reason is recorded.')`); await sleep(500);
    t = await main(P); const h = await rowsOf(P, 'batch history');
    check('the status is Batch rejected and the decision shows who, when and why', /Status: Batch rejected/.test(t) && /Decision: Rejected by Dan/.test(t) && /re-confirmation with Beta Bank/.test(t));
    check('the history lists the batch as rejected by Dan', h.length === 1 && /Batch rejected/.test(h[0][2]) && /Rejected by Dan/.test(h[0][6]), JSON.stringify(h));
    check('a decided batch offers no decision controls', !(await hasBtn(P, 'Approve this batch')) && /already been recorded for this batch/.test(t));
  });

  await step('4 recalculation supersedes the batch; a fresh approval and a new batch are required', async () => {
    await signOut(P); await signInAs(P, 'Alice'); await openSession(P);
    await goTab(P, 'Net positions', 'Recalculate net positions'); await P.click(btn('Recalculate net positions'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Net positions calculated')`); await sleep(400);
    await settleTab(P);
    let t = await main(P); const h = await rowsOf(P, 'batch history');
    check('the old batch is marked No longer eligible, the rejection stays on record, and the cause is shown', h.length === 1 && /No longer eligible/.test(h[0][2]) && /Rejected by Dan/.test(h[0][6]) && /new calculation superseded/.test(h[0][6]), JSON.stringify(h));
    check('preparation is blocked until the new calculation is approved', await P.ev(`${btn('Prepare settlement batch')}.disabled`) && /Failed:\s*The exact calculation has an active institutional approval/.test(t));
    await approveCalculation(P, 'Bob');
    await signOut(P); await signInAs(P, 'Alice'); await openSession(P); await settleTab(P);
    await P.click(btn('Prepare settlement batch'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Settlement batch prepared')`); await sleep(500);
    t = await main(P);
    check('a new batch is Awaiting review and did not inherit the rejection', /Status: Awaiting review/.test(t) && !/Decision: Rejected/.test(t));
    const h2 = await rowsOf(P, 'batch history');
    check('the history now lists two batches, the newest first', h2.length === 2 && /Awaiting review/.test(h2[0][2]) && /No longer eligible/.test(h2[1][2]), JSON.stringify(h2));
  });

  await step('5 the batch is approved; approval is application-level and nothing is shown as settled', async () => {
    await signOut(P); await signInAs(P, 'Dan'); await openSession(P); await settleTab(P);
    await P.click(btn('Approve this batch'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Batch approved.')`); await sleep(500);
    const t = await main(P);
    check('the status is "Batch approved (not signed, not settled)" and the notice says it is not a signature', /Status: Batch approved \(not signed, not settled\)/.test(t) && /not a signature and nothing has been settled/.test(t));
    check('the ladder shows batch approval done but signing, submission and confirmation still not available', /Batch institutional approval: approved \(application-level\)/.test(t) && /Wallet signing: not available in MVP-1.4/.test(t) && /Transaction submission: not available in MVP-1.4/.test(t) && /On-chain confirmation: not available in MVP-1.4/.test(t));
    const claims = t.replace(/No funds have moved, and nothing here is signed, submitted or confirmed on Stellar./, '').replace(/nothing has been settled/g, '');
    check('no wording claims funds moved or settlement happened (the explicit negations are excluded)', !/(funds|payment|payments) (have been|were|was) (sent|transferred|moved|settled)/i.test(claims) && !/\bSettled\b/.test(claims) && !/confirmed on (stellar|the chain)/i.test(claims), [/(funds|payment|payments) (have been|were|was) (sent|transferred|moved|settled)/i, /Settled/, /confirmed on (stellar|the chain)/i].map((r) => { const m = claims.match(r); return m ? claims.slice(Math.max(0, m.index - 60), m.index + 60) : '-'; }).join(' | '));
    check('the decision is recorded with reviewer and time, and no further decision is possible', /Decision: Approved by Dan/.test(t) && !(await hasBtn(P, 'Approve this batch')) && !(await hasBtn(P, 'Reject this batch')));
    await structure(P, 'settlement (approved)'); await layout(P, 'settlement (approved)');
    await P.screenshot(join(out, `settlement-approved-${W}.png`));
  });

  await step('6 a data change makes the approved batch ineligible; history is kept', async () => {
    await signOut(P); await signInAs(P, 'Alice'); await openSession(P);
    await goTab(P, 'Obligations', 'Record an obligation');
    await P.click(`[...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Edit obligation'))`);
    await P.waitFor(`document.querySelector('main').innerText.includes('Edit obligation')`);
    await setValue(P, input('Amount'), '150'); await P.click(btn('Save changes'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Obligation updated')`); await sleep(400);
    await settleTab(P);
    const t = await main(P); const h = await rowsOf(P, 'batch history');
    check('the approved batch is No longer eligible, with the cause, and its approval is still on record', h.length === 2 && /No longer eligible/.test(h[0][2]) && /Approved by Dan/.test(h[0][6]) && /an obligation was changed/.test(h[0][6]), JSON.stringify(h));
    check('the ladder falls back: approval unavailable, not prepared, not approved', /Institutional calculation approval: unavailable/.test(t) && /Settlement preparation: not prepared/.test(t) && /Batch institutional approval: not approved/.test(t));
    check('preparing is blocked and the stale calculation is named as the reason', await P.ev(`${btn('Prepare settlement batch')}.disabled`) && /participants or obligations changed after it/.test(t));
    check('the batch detail says to calculate, approve and prepare again', /Calculate again, obtain a fresh approval and prepare a new batch/.test(t));
  });

  await step('7 a non-administrator sees the batch but cannot prepare; an outsider sees nothing', async () => {
    await signOut(P); await signInAs(P, 'Bob'); await openSession(P); await settleTab(P);
    check('Bob (reviewer, not an administrator) has no Prepare control and is told who prepares', !(await hasBtn(P, 'Prepare settlement batch')) && /An administrator prepares the batch/.test(await main(P)));
    const direct = await P.ev(`fetch('/api/registry/orgs/${ORG_ID}/sessions/${SESSION_ID}/settlement/prepare', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tobin-request': '1' }, body: JSON.stringify({ calculationId: 'calc_x' }) }).then((x) => x.status)`);
    check('a direct prepare request by Bob is refused by the server (403)', direct === 403, String(direct));
    await signOut(P); await signInAs(P, 'Eve');
    const st = await P.ev(`Promise.all(['settlement', 'settlement/prepare'].map((s, i) => fetch('/api/registry/orgs/${ORG_ID}/sessions/${SESSION_ID}/' + s, i ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-tobin-request': '1' }, body: '{}' } : {}).then((x) => x.status)))`);
    check('an outsider receives 404 for settlement data and for preparing', st.every((s) => s === 404), JSON.stringify(st));
  });

  await step('8 activity and persistence across a server restart', async () => {
    await stopServer(); await startServer();
    await signOut(P).catch(() => undefined);
    await signInAs(P, 'Dan'); await openSession(P);
    await goTab(P, 'Activity and history', 'Session created');
    const t = await main(P);
    for (const w of ['Settlement batch prepared', 'Settlement batch rejected', 'Settlement batch approved', 'Settlement batch no longer eligible']) check(`the activity history contains "${w}"`, t.includes(w));
    await structure(P, 'activity'); await layout(P, 'activity');
    await settleTab(P);
    const h = await rowsOf(P, 'batch history');
    check('after the restart both batches and their decisions are intact', h.length === 2 && /Approved by Dan/.test(h[0][6]) && /Rejected by Dan/.test(h[1][6]), JSON.stringify(h));
  });

  await step('9 page health', async () => {
    check('no JavaScript exception during the whole journey (expected 401/403/404 console messages excluded)', P.errors.filter((e) => !/401|403|404|Failed to load resource/.test(e)).length === 0, P.errors.join('\n'));
  });
} finally {
  for (const p of pages) await p.close();
  if (browser) browser.child.kill();
  if (server) { server.removeAllListeners('exit'); server.kill(); }
  await sleep(800);
  rmSync(join(out, '.profile-settlement'), { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
const failed = results.filter((r) => !r.ok);
writeFileSync(join(out, `settlement-journey-results-${W}.json`), JSON.stringify({ browser: browser?.version, width: W, total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length} of ${results.length} checks passed${failed.length ? `; ${failed.length} FAILED` : ''}. Results: ${out}`);
process.exit(failed.length ? 1 : 0);
