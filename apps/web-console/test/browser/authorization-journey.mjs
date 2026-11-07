// REAL-BROWSER journey for institutional clearing authorization (MVP-1.3): reviewer grants, who may decide and why not, separation of duties, rejection with a
// reason, recalculation requiring a fresh decision, approval of the exact snapshot, invalidation after a data change, history, persistence across a server restart,
// and isolation. Production build, real SQLite, real cookies.
//   TOBIN_WIDTH=420 node test/browser/authorization-journey.mjs <absolute artifact dir>      (also run at TOBIN_WIDTH=1200)
// No wallet, no Stellar call. Accounts and the seeded session exist only in a throw-away database created for the run.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Page, findBrowser, launchBrowser, sleep } from './cdp.mjs';
import { createBackend } from '../../lib/server/backend.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const W = Number(process.env.TOBIN_WIDTH ?? 1200);
const out = process.argv[2] ?? join(root, 'test', 'browser', 'authorization-out');
mkdirSync(out, { recursive: true });
const exe = findBrowser();
if (!exe) throw new Error('no Chrome or Edge found (set TOBIN_BROWSER)');
const PORT = 31000 + Math.floor(Math.random() * 4000);
const DEBUG_PORT = 36000 + Math.floor(Math.random() * 3000);
const BASE = `http://127.0.0.1:${PORT}`;
const dbDir = mkdtempSync(join(tmpdir(), 'tobin-ajourney-'));
const DB = join(dbDir, 'journey.sqlite');
const PW = randomBytes(12).toString('base64url');
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

// ---- seed through the application's own services; the authorization workflow itself is driven through the UI ----
let SESSION_ID = '', ORG_ID = '';
{
  const s = createBackend(DB, { auth: {}, secureCookies: true });
  const reg = (name) => s.auth.register({ email: `${name.toLowerCase()}@example.test`, password: PW, displayName: name });
  const alice = await reg('Alice'), bob = await reg('Bob'), carol = await reg('Carol'), dan = await reg('Dan'), eve = await reg('Eve');
  const alpha = s.registry.createOrganization(alice, { name: 'Alpha Bank' });
  ORG_ID = alpha.id;
  for (const [u, e] of [[bob, 'bob'], [carol, 'carol'], [dan, 'dan']]) s.registry.acceptInvitation(u, s.registry.invite(alice, alpha.id, { invitee: `${e}@example.test`, role: 'member' }).token);
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
async function goTab(P, name, waitText) { await P.click(tab(name)); await P.waitFor(`document.querySelector('main').innerText.replace(/\\s+/g, ' ').includes(${q(waitText)})`, { what: `${name} tab shows ${waitText}` }); await sleep(250); }
const authTab = (P) => goTab(P, 'Authorization', 'Institutional authorization');
const rows = (p) => p.ev(`[...document.querySelectorAll('main table tbody tr')].map((tr) => [...tr.children].map((td) => td.innerText.trim()))`);
const historyRows = (p) => p.ev(`[...document.querySelectorAll('table[class] , main table')].filter((t) => t.querySelector('caption')?.textContent.includes('decision history')).flatMap((t) => [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.innerText.trim())))`);

let browser;
const pages = [];
try {
  await startServer();
  browser = await launchBrowser({ exe, port: DEBUG_PORT, profileDir: join(out, '.profile-authorization') });
  const P = await Page.open(DEBUG_PORT, 'about:blank');
  pages.push(P);
  console.log(`browser ${browser.version}; viewport ${(await P.ev('[window.innerWidth, window.innerHeight]')).join('x')}`);

  await step('1 an administrator who is not a reviewer cannot decide', async () => {
    await signInAs(P, 'Alice'); await openSession(P);
    check('the Authorization tab exists for an operational session', await P.ev(`!!${tab('Authorization')}`));
    await authTab(P);
    const t = await main(P);
    check('the stage ladder separates readiness, authorization and the not-available Stellar stages', /Calculation readiness/.test(t) && /Institutional authorization: Awaiting review/.test(t) && /Stellar signing: not available/.test(t) && /Transaction submission: not available/.test(t) && /On-chain confirmation: not available/.test(t), t.slice(0, 400));
    check('the calculation under review shows the exact id and the hand-computed positions +30, -20, -10', /Calculation under review/.test(t) && /\+30/.test(t) && /-20/.test(t) && /-10/.test(t) && /calc_[0-9a-f]{18}/.test(t));
    check('no approve or reject control is offered', !(await hasBtn(P, 'Approve this calculation')) && !(await hasBtn(P, 'Reject this calculation')));
    check('the page says why: no reviewer capability', /You cannot decide right now/.test(t) && /not been granted the reviewer capability/.test(t));
    check('the page states approval is not a Stellar signature', /not readiness, not a Stellar signature, not a transaction and not a settlement/.test(t));
    await structure(P, 'authorization (cannot decide)'); await layout(P, 'authorization (cannot decide)');
    await P.screenshot(join(out, `authorization-ineligible-${W}.png`));
  });

  await step('2 reviewer grants (administrator only) and separation of duties', async () => {
    await P.navigate(`${BASE}/organizations`);
    await P.waitFor(`document.body.innerText.includes('Grant reviewer to Bob')`, { what: 'members loaded' });
    check('the page explains that an administrator is not a reviewer and nobody decides on what they recorded or calculated', /does not make someone a reviewer/.test(await main(P)) && /recorded, changed or calculated/.test(await main(P)));
    await P.click(btn('Grant reviewer to Bob'));
    await P.waitFor(`document.body.innerText.includes('Revoke reviewer from Bob')`);
    await P.click(btn('Grant reviewer to Alice'));
    await P.waitFor(`document.body.innerText.includes('Revoke reviewer from Alice')`);
    check('Bob and Alice now show the reviewer capability in the member list', (await rows(P)).filter((r) => /reviewer/.test(r[1])).length === 2, JSON.stringify(await rows(P)));
    await structure(P, 'organizations'); await layout(P, 'organizations');
    await P.navigate(`${BASE}/sessions`); await P.waitFor(`document.body.innerText.includes('Signed in as Alice')`); await openSession(P); await authTab(P);
    const t = await main(P);
    check('Alice is a reviewer but ran the calculation and recorded the obligations: separation of duties blocks her, with the reason', /Separation of duties/.test(t) && /you ran this calculation/.test(t) && !(await hasBtn(P, 'Approve this calculation')), t.slice(0, 500));
  });

  await step('3 a reviewer rejects with a reason', async () => {
    await signOut(P); await signInAs(P, 'Bob'); await openSession(P); await authTab(P);
    let t = await main(P);
    check('Bob (reviewer, took no part in recording or calculating) is told he is eligible', /You are eligible to decide on this exact calculation/.test(t) && await hasBtn(P, 'Approve this calculation'), t.slice(0, 400));
    await structure(P, 'authorization (can decide)'); await layout(P, 'authorization (can decide)');
    await P.screenshot(join(out, `authorization-eligible-${W}.png`));
    await P.click(btn('Reject this calculation'));
    await P.waitFor(`document.querySelector('form[aria-label="Reject calculation"]')`);
    await P.click(btn('Confirm rejection'));
    await P.waitFor(`document.querySelector('main [role="alert"]')`);
    check('rejecting without a reason is refused with a clear message, and nothing is recorded', /needs a reason/.test(await P.ev(`document.querySelector('main [role="alert"]').innerText`)) && /No decisions yet/.test(await main(P)));
    await setValue(P, input('Reason'), 'Amount owed by Alpha to Beta is disputed');
    await P.click(btn('Confirm rejection'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Calculation rejected')`); await sleep(500);
    t = await main(P);
    check('the status is Rejected and the ladder shows it', /Status: Rejected/.test(t) && /Institutional authorization: Rejected/.test(t));
    const h = await historyRows(P);
    check('the history row names the decision, the exact calculation, Bob, the reason and a current status', h.length === 1 && h[0][0] === 'Rejected' && /^calc_/.test(h[0][1]) && h[0][2] === 'Bob' && /disputed/.test(h[0][4]) && /Current/.test(h[0][5]), JSON.stringify(h));
    check('he cannot decide again on the same snapshot, and is told how to proceed', !(await hasBtn(P, 'Approve this calculation')) && /already been recorded for this calculation/.test(t));
  });

  await step('4 recalculation: a fresh snapshot needs a fresh decision', async () => {
    await signOut(P); await signInAs(P, 'Alice'); await openSession(P);
    await goTab(P, 'Net positions', 'Recalculate net positions');
    await P.click(btn('Recalculate net positions'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Net positions calculated')`); await sleep(400);
    await signOut(P); await signInAs(P, 'Bob'); await openSession(P); await authTab(P);
    const t = await main(P); const h = await historyRows(P);
    check('the new snapshot is Awaiting review (the rejection was not carried over)', /Status: Awaiting review/.test(t));
    check('the old rejection stays in the history and is marked as no longer applying (superseded by the new calculation)', h.length === 1 && /No longer applies/.test(h[0][5]) && /new calculation superseded/.test(h[0][5]), JSON.stringify(h));
    check('the reviewer is eligible again', await hasBtn(P, 'Approve this calculation'));
  });

  await step('5 approval is bound to the exact calculation and is not a signature', async () => {
    const shown = await P.ev(`[...document.querySelectorAll('dt')].find((d) => d.textContent === 'Calculation').nextElementSibling.innerText.trim()`);
    await P.click(btn('Approve this calculation'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Calculation approved')`); await sleep(500);
    const t = await main(P); const h = await historyRows(P);
    check('the status is Approved (institutional), and the notice says it is not a Stellar signature', /Status: Approved \(institutional\)/.test(t) && /not a Stellar signature/.test(t));
    check('the newest history row is the approval of the calculation that was on screen', h[0][0] === 'Approved' && shown.startsWith(h[0][1].slice(0, 13)) && /Current/.test(h[0][5]), JSON.stringify(h) + ' vs ' + shown);
    check('the ladder still says signing, submission and confirmation are not available', /Stellar signing: not available/.test(t) && /On-chain confirmation: not available/.test(t));
    check('after approval no decision control remains', !(await hasBtn(P, 'Approve this calculation')) && !(await hasBtn(P, 'Reject this calculation')));
    await structure(P, 'authorization (approved)'); await layout(P, 'authorization (approved)');
    await P.screenshot(join(out, `authorization-approved-${W}.png`));
  });

  await step('6 a data change invalidates the approval; history is kept', async () => {
    await signOut(P); await signInAs(P, 'Alice'); await openSession(P);
    await goTab(P, 'Obligations', 'Record an obligation');
    await P.click(`[...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Edit obligation'))`);
    await P.waitFor(`document.querySelector('main').innerText.includes('Edit obligation')`);
    await setValue(P, input('Amount'), '150'); await P.click(btn('Save changes'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Obligation updated')`); await sleep(400);
    await signOut(P); await signInAs(P, 'Bob'); await openSession(P); await authTab(P);
    const t = await main(P); const h = await historyRows(P);
    check('the status is Stale and not approved', /Status: Calculation is stale: not reviewable/.test(t) && !/Status: Approved/.test(t));
    check('the approval is still listed, marked as no longer applying, with the cause', h.some((r) => r[0] === 'Approved' && /No longer applies/.test(r[5]) && /an obligation was changed/.test(r[5])), JSON.stringify(h));
    check('no approve control is offered on a stale calculation, and the page says to calculate again', !(await hasBtn(P, 'Approve this calculation')) && /stale/.test(t) && /Calculate again/.test(t));
  });

  await step('7 a non-reviewer member and an outsider', async () => {
    await signOut(P); await signInAs(P, 'Dan'); await openSession(P); await authTab(P);
    check('a member without the capability sees the review but no controls, with the reason', /You cannot decide right now/.test(await main(P)) && !(await hasBtn(P, 'Approve this calculation')));
    const direct = await P.ev(`fetch('/api/registry/orgs/${ORG_ID}/sessions/${SESSION_ID}/authorization/approve', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tobin-request': '1' }, body: JSON.stringify({ calculationId: 'calc_x' }) }).then((x) => x.status)`);
    check('a direct approve request by that member is refused by the server (403)', direct === 403, String(direct));
    await signOut(P); await signInAs(P, 'Eve');
    const st = await P.ev(`Promise.all(['authorization', 'authorization/approve'].map((s, i) => fetch('/api/registry/orgs/${ORG_ID}/sessions/${SESSION_ID}/' + s, i ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-tobin-request': '1' }, body: '{}' } : {}).then((x) => x.status)))`);
    check('an outsider receives 404 for the authorization and for a decision', st.every((s) => s === 404), JSON.stringify(st));
  });

  await step('8 activity and persistence across a server restart', async () => {
    await stopServer(); await startServer();
    await signOut(P).catch(() => undefined);
    await signInAs(P, 'Bob'); await openSession(P);
    await goTab(P, 'Activity and history', 'Session created');
    const t = await main(P);
    for (const w of ['Calculation rejected', 'Calculation approved', 'Decision no longer applies']) check(`the activity history contains "${w}"`, t.includes(w));
    check('activity shows who decided, by name', /Bob/.test(t) && /Amount owed by Alpha to Beta is disputed/.test(t));
    await structure(P, 'activity'); await layout(P, 'activity');
    await authTab(P);
    const h = await historyRows(P);
    check('after the restart the full decision history is intact (rejection, approval), both no longer applying', h.length === 2 && h.every((r) => /No longer applies/.test(r[5])), JSON.stringify(h));
    check('and the current state is still Stale', /Calculation is stale: not reviewable/.test(await main(P)));
  });

  await step('9 page health', async () => {
    check('no JavaScript exception during the whole journey (expected 401/403/404 console messages excluded)', P.errors.filter((e) => !/401|403|404|Failed to load resource/.test(e)).length === 0, P.errors.join('\n'));
  });
} finally {
  for (const p of pages) await p.close();
  if (browser) browser.child.kill();
  if (server) { server.removeAllListeners('exit'); server.kill(); }
  await sleep(800);
  rmSync(join(out, '.profile-authorization'), { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
const failed = results.filter((r) => !r.ok);
writeFileSync(join(out, `authorization-journey-results-${W}.json`), JSON.stringify({ browser: browser?.version, width: W, total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length} of ${results.length} checks passed${failed.length ? `; ${failed.length} FAILED` : ''}. Results: ${out}`);
process.exit(failed.length ? 1 : 0);
