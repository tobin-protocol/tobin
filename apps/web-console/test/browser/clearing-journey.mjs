// REAL-BROWSER journey for clearing operations: sign in, open an organization, create a session, add participants, record and edit obligations, reject invalid
// input, calculate net positions with the real engine, see staleness after a change, recalculate, check readiness, move the workflow, read the activity history,
// sign out and back in, restart the server, and prove another organization sees nothing. Production build, real SQLite, real cookies.
//   TOBIN_WIDTH=420 node test/browser/clearing-journey.mjs <absolute artifact dir>      (also run at TOBIN_WIDTH=1200)
// No wallet, no Stellar call. Accounts exist only in a throw-away database created for the run (seeded through the application's own services).
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
const out = process.argv[2] ?? join(root, 'test', 'browser', 'clearing-out');
mkdirSync(out, { recursive: true });
const exe = findBrowser();
if (!exe) throw new Error('no Chrome or Edge found (set TOBIN_BROWSER)');
const PORT = 31000 + Math.floor(Math.random() * 4000);
const DEBUG_PORT = 36000 + Math.floor(Math.random() * 3000);
const BASE = `http://127.0.0.1:${PORT}`;
const dbDir = mkdtempSync(join(tmpdir(), 'tobin-cjourney-'));
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

// ---- seed accounts through the application's own services (the journey itself drives the UI) ----
const ids = {};
{
  const s = createBackend(DB, { auth: {}, secureCookies: true });
  const reg = async (name) => { const u = await s.auth.register({ email: `${name.toLowerCase()}@example.test`, password: PW, displayName: name }); ids[name] = u.userId; return u; };
  const alice = await reg('Alice'), bob = await reg('Bob'), carol = await reg('Carol'), eve = await reg('Eve');
  const alpha = s.registry.createOrganization(alice, { name: 'Alpha Bank' });
  for (const [u, e] of [[bob, 'bob'], [carol, 'carol']]) s.registry.acceptInvitation(u, s.registry.invite(alice, alpha.id, { invitee: `${e}@example.test`, role: 'member' }).token);
  s.registry.createOrganization(eve, { name: 'Eve Capital' });
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

const main = (p) => p.ev(`document.querySelector('main').innerText`);
const btn = (label) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${q(label)})`;
const btnAria = (label) => `[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === ${q(label)})`;
const tab = (name) => `[...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.trim() === ${q(name)})`;
async function setValue(p, expr, value) {
  await p.ev(`(() => { const el = ${expr}; if (!el) throw new Error('field not found: ' + ${q(expr.slice(0, 70))}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
  await sleep(60);
}
const input = (labelStart) => `[...document.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(${q(labelStart)}))?.querySelector('input, select')`;
const selectByText = async (p, labelStart, text) => {
  const v = await p.ev(`(() => { const s = ${input(labelStart)}; const o = [...s.options].find((x) => x.textContent.trim() === ${q(text)}); return o ? o.value : null; })()`);
  if (!v) throw new Error(`option ${text} not offered in ${labelStart}`);
  await setValue(p, input(labelStart), v);
};
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
const rows = (p) => p.ev(`[...document.querySelectorAll('main table tbody tr')].map((tr) => [...tr.children].map((td) => td.innerText.trim()))`);
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
async function openSession(P, label) {
  await P.waitFor(`[...document.querySelectorAll('button.ss-link')].some((b) => b.textContent.trim() === ${q(label)})`, { what: `session ${label} listed` });
  await P.click(`[...document.querySelectorAll('button.ss-link')].find((b) => b.textContent.trim() === ${q(label)})`);
  await P.waitFor(`document.querySelector('[role=tab]')`, { what: 'workspace tabs' });
  await sleep(400);
}
async function goTab(P, name, waitText) { await P.click(tab(name)); await P.waitFor(`document.querySelector('main').innerText.includes(${q(waitText)})`, { what: `${name} tab shows ${waitText}` }); await sleep(250); }
async function recordObligation(P, debtor, creditor, amount, asset = 'USD', reference = '') {
  await selectByText(P, 'Debtor', debtor); await selectByText(P, 'Creditor', creditor);
  await setValue(P, input('Amount'), amount); await setValue(P, input('Asset'), asset); await setValue(P, input('Reference'), reference);
  await P.click(btn('Record obligation'));
}
const alert = (P) => P.ev(`document.querySelector('main [role="alert"]')?.innerText ?? ''`);

let browser;
const pages = [];
let SESSION_ID = '';
try {
  await startServer();
  browser = await launchBrowser({ exe, port: DEBUG_PORT, profileDir: join(out, '.profile-clearing') });
  const P = await Page.open(DEBUG_PORT, 'about:blank');
  pages.push(P);
  console.log(`browser ${browser.version}; viewport ${(await P.ev('[window.innerWidth, window.innerHeight]')).join('x')}`);

  await step('1 sign in and create a session', async () => {
    await signInAs(P, 'Alice');
    check('the signed-in user lands on /sessions with the organization selected', (await P.ev(`document.querySelector('select[aria-label="Organization"]').selectedOptions[0].textContent`)) === 'Alpha Bank');
    await setValue(P, input('Name'), 'Q4 clearing run'); await P.click(btn('Create local draft'));
    await P.waitFor(`document.body.innerText.includes('Local draft recorded')`);
    await openSession(P, 'Q4 clearing run');
    SESSION_ID = await P.ev(`[...document.querySelectorAll('dt')].find((d) => d.textContent === 'Session ID').nextElementSibling.innerText.trim()`);
    check('the workspace opens as a local draft and states the workflow state', /Local draft/.test(await main(P)) && /Being configured/.test(await main(P)));
    check('readiness lists what is missing, with how to fix it', /At least two active participants/.test(await main(P)) && /Add participants on the Participants tab/.test(await main(P)));
    check('readiness states that ready is not approval or settlement', /does not mean anyone has signed, authorized or settled/.test(await main(P)));
    check('"Mark session ready" is disabled while checks fail', await P.ev(`${btn('Mark session ready')}.disabled`));
    await structure(P, 'overview'); await layout(P, 'overview');
    await P.screenshot(join(out, `clearing-overview-${W}.png`));
  });

  await step('2 participants', async () => {
    await goTab(P, 'Participants', 'No participants yet');
    check('the empty state invites adding members and states the boundary', /Add the members who take part/.test(await main(P)) && /not an on-chain admission/.test(await main(P)));
    for (const n of ['Alice', 'Bob', 'Carol']) {
      await selectByText(P, 'Member', n); await P.click(btn('Add participant'));
      await P.waitFor(`document.querySelector('main').innerText.includes('Participant added')`, { what: `${n} added` }); await sleep(300);
    }
    const r = await rows(P);
    check('three participants are listed with their organization and Active status', r.length === 3 && r.every((x) => x[1] === 'Alpha Bank' && x[2] === 'Active'), JSON.stringify(r));
    check('a participant already added is no longer offered', await P.ev(`![...${input('Member')}.options].some((o) => ['Alice','Bob','Carol'].includes(o.textContent.trim()))`));
    await P.click(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Details')`);
    check('participant details show the organization and an explicit "no wallet claim"', /Alpha Bank/.test(await main(P)) && /no wallet claim/.test(await main(P)));
    await structure(P, 'participants'); await layout(P, 'participants');
    await P.screenshot(join(out, `clearing-participants-${W}.png`));
  });

  await step('3 obligations: invalid input is rejected', async () => {
    await goTab(P, 'Obligations', 'No obligations yet');
    await recordObligation(P, 'Alice', 'Alice', '10');
    check('same debtor and creditor is refused with a clear message', /must be different participants/.test(await alert(P)), await alert(P));
    await recordObligation(P, 'Alice', 'Bob', '1.5');
    check('a decimal amount is refused (no silent rounding)', /whole number of base units/.test(await alert(P)), await alert(P));
    await recordObligation(P, 'Alice', 'Bob', '-5');
    check('a negative amount is refused', /whole number of base units/.test(await alert(P)));
    await recordObligation(P, 'Alice', 'Bob', '0');
    check('a zero amount is refused', /whole number of base units/.test(await alert(P)));
    await recordObligation(P, 'Alice', 'Bob', '10', 'usd');
    check('a lower-case asset is refused', /upper-case letters or digits/.test(await alert(P)));
    check('nothing was saved by the refused attempts', (await main(P)).includes('No obligations yet'));
  });

  await step('4 obligations: record, review, void', async () => {
    // two failed server-side checks are covered by the API tests; here the UI path for a valid ring
    await recordObligation(P, 'Alice', 'Bob', '100', 'USD', 'invoice 1');
    await P.waitFor(`document.querySelector('main').innerText.includes('Obligation recorded')`); await sleep(300);
    await recordObligation(P, 'Bob', 'Carol', '80');
    await P.waitFor(`document.querySelectorAll('main tbody tr').length === 2`); await sleep(300);
    await recordObligation(P, 'Carol', 'Alice', '70');
    await P.waitFor(`document.querySelectorAll('main tbody tr').length === 3`); await sleep(300);
    const r = await rows(P);
    check('three obligations are listed with debtor, creditor, amount, asset, reference and status', r.length === 3 && r[0][1] === 'Alice' && r[0][2] === 'Bob' && r[0][3] === '100' && r[0][4] === 'USD' && r[0][5] === 'invoice 1' && /Active/.test(r[0][6]), JSON.stringify(r));
    await recordObligation(P, 'Alice', 'Carol', '5', 'EUR');
    await P.waitFor(`document.querySelector('main [role="alert"]')`, { what: 'server refusal' });
    check('a second asset is refused by the server (assets are never netted together)', /nets USD/.test(await alert(P)), await alert(P));
    // a temporary obligation, then void it: it stays in the history
    await recordObligation(P, 'Bob', 'Alice', '1', 'USD', 'entered by mistake');
    await P.waitFor(`document.querySelectorAll('main tbody tr').length === 4`); await sleep(300);
    await P.click(`[...document.querySelectorAll('button')].filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('Void obligation')).pop()`);
    await P.waitFor(`document.querySelector('main').innerText.includes('Obligation voided')`); await sleep(300);
    const r2 = await rows(P);
    check('the voided obligation stays visible, marked Voided, with no Edit or Void actions', r2.length === 4 && r2[3][6] === 'Voided' && !/Edit|Void/.test(r2[3][7]), JSON.stringify(r2[3]));
    await P.click(`[...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Details')[0]`);
    check('obligation details show who created it and its revision', /created|Created/.test(await main(P)) && /Alice/.test(await main(P)) && /revision 1/.test(await main(P)));
    await structure(P, 'obligations'); await layout(P, 'obligations');
    await P.screenshot(join(out, `clearing-obligations-${W}.png`));
  });

  await step('5 participant removal is refused while obligations name them', async () => {
    await goTab(P, 'Participants', 'Participants are application records');
    await P.click(btnAria('Remove Bob'));
    await P.waitFor(`document.querySelector('main [role="alert"]')`);
    check('removal is refused with a resolution path', /void or correct them/.test(await alert(P)), await alert(P));
    check('Bob is still an active participant', (await rows(P)).some((r) => r[0] === 'Bob' && r[2] === 'Active'));
  });

  await step('6 net positions: calculate, verify, conservation', async () => {
    await goTab(P, 'Net positions', 'Not calculated');
    check('before the first calculation there is a clear empty state', /No calculation yet/.test(await main(P)));
    await P.click(btn('Calculate net positions'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Net positions calculated')`, { what: 'calculation' }); await sleep(300);
    const r = Object.fromEntries((await rows(P)).map((x) => [x[0], x]));
    check('Alice nets +30 (owes), Bob -20 and Carol -10 (are owed): hand-computed from 100, 80 and 70', r.Alice[2] === '+30' && r.Bob[2] === '-20' && r.Carol[2] === '-10', JSON.stringify(r));
    check('each row shows organization, asset and position wording', r.Alice[1] === 'Alpha Bank' && r.Alice[3] === 'USD' && /Owes/.test(r.Alice[4]) && /Is owed/.test(r.Bob[4]));
    check('the page states the result is current, balanced, and not a settlement', /Current/.test(await main(P)) && /balanced: value is conserved/.test(await main(P)) && /not approved, signed, settled or verified on any chain/.test(await main(P)));
    check('gross obligations are 250 and the voided obligation is not netted', /Gross obligations\s*250 USD/.test(await main(P)) && /3 active obligation/.test(await main(P)));
    await structure(P, 'net positions'); await layout(P, 'net positions');
    await P.screenshot(join(out, `clearing-nets-${W}.png`));
  });

  await step('7 changing an obligation makes the calculation stale; recalculate', async () => {
    await goTab(P, 'Obligations', 'Record an obligation');
    await P.click(btnAria(`Edit obligation ${(await P.ev(`document.querySelector('main tbody tr code').innerText`))}`));
    await P.waitFor(`document.querySelector('main').innerText.includes('Edit obligation')`);
    await setValue(P, input('Amount'), '150'); await P.click(btn('Save changes'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Obligation updated')`); await sleep(300);
    check('the edit is saved as revision 2', (await rows(P))[0][6] === 'Active (rev 2)' && (await rows(P))[0][3] === '150', JSON.stringify((await rows(P))[0]));
    await goTab(P, 'Net positions', 'Stale');
    check('the previous calculation is shown as Stale with a warning, never as current', /Stale/.test(await main(P)) && /Calculate again before relying on it/.test(await main(P)) && !/>Current</.test(await P.ev('document.querySelector("main").innerHTML')));
    await goTab(P, 'Overview', 'The latest calculation is current'); await sleep(300);
    check('readiness fails on "latest calculation is current" and says what to do; Mark ready is disabled', (await main(P)).replace(/\s+/g, ' ').includes('Failed: The latest calculation is current') && /calculate again/i.test(await main(P)) && await P.ev(`${btn('Mark session ready')}.disabled`), (await P.ev(`document.querySelector('.ss-checks')?.innerText ?? 'no checks'`)) + ' | disabled=' + (await P.ev(`${btn('Mark session ready')}?.disabled`)));
    await goTab(P, 'Net positions', 'Stale');
    await P.click(btn('Recalculate net positions'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Net positions calculated')`); await sleep(300);
    const r = Object.fromEntries((await rows(P)).map((x) => [x[0], x[2]]));
    check('recalculated: Alice +80, Bob -70, Carol -10 (150 − 70, 80 − 150, 70 − 80)', r.Alice === '+80' && r.Bob === '-70' && r.Carol === '-10', JSON.stringify(r));
    check('the result is Current again', /Current/.test(await main(P)) && !/Calculate again before relying/.test(await main(P)));
  });

  await step('8 readiness, workflow, freeze and reopen', async () => {
    await goTab(P, 'Overview', 'The latest calculation is current'); await sleep(300);
    const checks = await P.ev(`[...document.querySelectorAll('.ss-checks li')].map((l) => l.innerText)`);
    check('every readiness check passes', checks.length >= 8 && checks.every((c) => c.startsWith('✓')), JSON.stringify(checks));
    await P.click(btn('Mark session ready'));
    await P.waitFor(`document.querySelector('main').innerText.includes('Session marked ready')`); await sleep(400);
    check('the workflow state shows Marked ready (frozen)', /Marked ready \(frozen\)/.test(await main(P)));
    await goTab(P, 'Obligations', 'marked ready');
    check('a ready session offers no add, edit or void controls', await P.ev(`!document.querySelector('form[aria-label="Record obligation"]') && ![...document.querySelectorAll('button')].some((b) => /^(Edit|Void) obligation/.test(b.getAttribute('aria-label') ?? ''))`));
    await goTab(P, 'Participants', 'marked ready');
    check('nor on the Participants tab', await P.ev(`!document.querySelector('form[aria-label="Add participant"]') && ![...document.querySelectorAll('button')].some((b) => /^Remove /.test(b.getAttribute('aria-label') ?? ''))`));
    await goTab(P, 'Overview', 'Reopen for changes');
    await structure(P, 'ready overview'); await layout(P, 'ready overview');
    await P.screenshot(join(out, `clearing-ready-${W}.png`));
  });

  await step('9 activity history', async () => {
    await goTab(P, 'Activity and history', 'Session created');
    const t = await main(P);
    for (const w of ['Session created', 'Participant added', 'Obligation created', 'Obligation updated', 'Obligation voided', 'Net positions calculated', 'Session state changed', 'Readiness evaluated']) check(`the history contains "${w}"`, t.includes(w));
    check('activity shows people by name, and the before/after of an update', /amount 100 -> 150/.test(t) && /Alice owes Bob 100 USD/.test(t) && !/usr_[0-9a-f]{18}/.test(t));
    check('no secret-looking values appear', !/scrypt|password|token/i.test(t));
    await structure(P, 'activity'); await layout(P, 'activity');
    await P.screenshot(join(out, `clearing-activity-${W}.png`));
  });

  await step('10 sign out, sign in again: everything persisted', async () => {
    await signOut(P);
    await signInAs(P, 'Alice');
    await openSession(P, 'Q4 clearing run');
    check('the session is still Marked ready', /Marked ready \(frozen\)/.test(await main(P)));
    await goTab(P, 'Participants', 'Participants are application records');
    check('three participants persisted', (await rows(P)).length === 3);
    await goTab(P, 'Obligations', 'marked ready');
    check('four obligations persisted (three active, one voided)', (await rows(P)).length === 4 && (await rows(P)).filter((r) => r[6] === 'Voided').length === 1);
    await goTab(P, 'Net positions', 'Current');
    const r = Object.fromEntries((await rows(P)).map((x) => [x[0], x[2]]));
    check('the calculation persisted and is still Current: +80 / -70 / -10', r.Alice === '+80' && r.Bob === '-70' && r.Carol === '-10', JSON.stringify(r));
    await goTab(P, 'Activity and history', 'Session created');
    check('the activity history persisted', /Net positions calculated/.test(await main(P)) && /Session state changed/.test(await main(P)));
  });

  await step('11 server restart: still there', async () => {
    await stopServer(); await startServer();
    await P.navigate(`${BASE}/sessions`);
    await P.waitFor(`document.body.innerText.includes('Signed in as Alice')`, { what: 'session cookie still valid after restart' });
    await openSession(P, 'Q4 clearing run');
    await goTab(P, 'Net positions', 'Current');
    check('after a restart the calculation is intact', (await rows(P)).length === 3 && /\+80/.test(await main(P)));
  });

  await step('12 a member sees the data but has no controls', async () => {
    await signOut(P); await signInAs(P, 'Bob');
    await openSession(P, 'Q4 clearing run');
    await goTab(P, 'Obligations', 'Debtor');
    check('Bob can read obligations', (await rows(P)).length === 4);
    check('Bob has no record/edit/void controls', await P.ev(`!document.querySelector('form') && ![...document.querySelectorAll('button')].some((b) => /^(Edit|Void) obligation/.test(b.getAttribute('aria-label') ?? ''))`));
    const r = await P.ev(`fetch('/api/registry/orgs/' + ${q(await P.ev(`document.querySelector('select[aria-label="Organization"]')?.value ?? ''`))} + '/sessions/' + ${q(SESSION_ID)} + '/calculate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tobin-request': '1' }, body: '{}' }).then((x) => x.status)`);
    check('a direct request by the member to calculate is refused by the server (403)', r === 403, String(r));
  });

  await step('13 another organization sees nothing', async () => {
    await signOut(P); await signInAs(P, 'Eve');
    check('Eve sees her own organization only', (await P.ev(`[...document.querySelector('select[aria-label="Organization"]').options].map((o) => o.textContent)`)).join() === 'Eve Capital');
    check('Eve sees no sessions', /No sessions yet/.test(await main(P)) && !/Q4 clearing run/.test(await main(P)));
    const alphaOrg = await P.ev(`fetch('/api/registry/orgs').then((x) => x.json()).then((j) => j.organizations.map((o) => o.id))`);
    check('Eve lists only one organization', alphaOrg.length === 1);
    const status = await P.ev(`Promise.all(['obligations', 'participants', 'calculation', 'readiness'].map((s) => fetch('/api/registry/orgs/org_00000000000000000/sessions/' + ${q(SESSION_ID)} + '/' + s).then((x) => x.status)))`);
    check('an unknown organization and session id answer 404 to a stranger', status.every((s) => s === 404), JSON.stringify(status));
  });

  await step('14 page health', async () => {
    check('no JavaScript exception during the whole journey (expected 401/403/404 console messages excluded)', P.errors.filter((e) => !/401|403|404|Failed to load resource/.test(e)).length === 0, P.errors.join('\n'));
  });
} finally {
  for (const p of pages) await p.close();
  if (browser) browser.child.kill();
  if (server) { server.removeAllListeners('exit'); server.kill(); }
  await sleep(800);
  rmSync(join(out, '.profile-clearing'), { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
const failed = results.filter((r) => !r.ok);
writeFileSync(join(out, `clearing-journey-results-${W}.json`), JSON.stringify({ browser: browser?.version, width: W, total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length} of ${results.length} checks passed${failed.length ? `; ${failed.length} FAILED` : ''}. Results: ${out}`);
process.exit(failed.length ? 1 : 0);
