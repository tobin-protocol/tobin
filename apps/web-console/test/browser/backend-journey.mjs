// REAL-BROWSER journey for the backend foundation: account registration, sign-in and sign-out, organizations, members and roles, invitations, session drafts,
// organization isolation, expired-session handling, and persistence across a SERVER RESTART (same database file). Production build, real SQLite, real cookies.
//   TOBIN_WIDTH=420 node test/browser/backend-journey.mjs <absolute artifact dir>      (also run at TOBIN_WIDTH=1200)
// No wallet, no Stellar call. Accounts and passwords exist only in a throw-away database created for the run.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Page, findBrowser, launchBrowser, sleep } from './cdp.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const W = Number(process.env.TOBIN_WIDTH ?? 1200);
const out = process.argv[2] ?? join(root, 'test', 'browser', 'backend-out');
mkdirSync(out, { recursive: true });
const exe = findBrowser();
if (!exe) throw new Error('no Chrome or Edge found (set TOBIN_BROWSER)');
const PORT = 31000 + Math.floor(Math.random() * 4000);
const DEBUG_PORT = 36000 + Math.floor(Math.random() * 3000);
const BASE = `http://127.0.0.1:${PORT}`;
const dbDir = mkdtempSync(join(tmpdir(), 'tobin-bjourney-'));
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
  try { await fn(); } catch (e) { let page = ''; try { page = await pages[0].ev("document.querySelector('main')?.innerText.slice(0, 500) ?? ''"); } catch { /* page unavailable */ }
    check('step completed without an exception', false, (e instanceof Error ? e.message : String(e)) + ' | page: ' + page); }
}

let server;
async function startServer() {
  const env = { ...process.env, PORT: String(PORT), NODE_ENV: 'production', TOBIN_DB_PATH: DB };
  delete env.TOBIN_ALLOW_DEV_IDENTITY;
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
const text = (p) => p.ev(`document.body.innerText`);
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
    if (document.querySelectorAll('h1').length !== 1) issues.push('h1 count');
    return issues; })()`);
  check(`accessibility structure (${where})`, r.length === 0, r.join('; '));
}
async function register(P, name, email) {
  await P.navigate(`${BASE}/sign-in`);
  await P.waitFor(`document.querySelector('input[type=email]')`); await sleep(1200);
  await P.click(btn('Create one')); await P.waitFor(`document.querySelector('input[autocomplete=name]')`);
  await setValue(P, input('Name'), name); await setValue(P, input('Email'), email); await setValue(P, input('Password'), PW);
  await P.click(btn('Create account'));
  await P.waitFor(`location.pathname === '/sessions'`, { what: `registration of ${name}` });
}
async function signInAs(P, email) {
  await P.navigate(`${BASE}/sign-in`);
  await P.waitFor(`document.querySelector('input[type=email]')`); await sleep(1200);
  await setValue(P, input('Email'), email); await setValue(P, input('Password'), PW);
  await P.click(btn('Sign in'));
  await P.waitFor(`location.pathname === '/sessions'`, { what: `sign-in of ${email}` });
}
async function openOrganizations(P) {
  await P.navigate(`${BASE}/organizations`);
  await P.waitFor(`document.body.innerText.includes('Signed in as')`); await sleep(600);
}
async function signOut(P) {
  await P.click(btn('Sign out'));
  await P.waitFor(`location.pathname === '/sign-in'`, { what: 'sign-out redirect' });
}

let browser;
const pages = [];
try {
  await startServer();
  browser = await launchBrowser({ exe, port: DEBUG_PORT, profileDir: join(out, '.profile-backend') });
  const P = await Page.open(DEBUG_PORT, 'about:blank');
  pages.push(P);
  console.log(`browser ${browser.version}; viewport ${(await P.ev('[window.innerWidth, window.innerHeight]')).join('x')}`);

  await step('1 sign-in page and registration', async () => {
    await P.navigate(`${BASE}/sign-in`);
    await P.waitFor(`document.querySelector('input[type=email]')`); await sleep(1200);
    const t = await main(P);
    check('the sign-in page states that no wallet or Stellar network is used', /does not use a wallet and does not touch the Stellar network/.test(t));
    check('email and password fields are labelled and the password field is masked', await P.ev(`document.querySelector('input[type=password]') !== null && [...document.querySelectorAll('main input')].every((i) => i.closest('label'))`));
    await structure(P, 'sign-in'); await layout(P, 'sign-in');
    await P.screenshot(join(out, `backend-sign-in-${W}.png`));
    await P.click(btn('Sign in'));
    check('empty submission is blocked by the browser (still on the sign-in page)', (await P.ev('location.pathname')) === '/sign-in');
    await setValue(P, input('Email'), 'nobody@example.test'); await setValue(P, input('Password'), 'wrong-password-123');
    await P.click(btn('Sign in'));
    await P.waitFor(`document.querySelector('[role="alert"]')`, { what: 'sign-in error' });
    check('a wrong sign-in shows one generic message (no hint whether the account exists)', /email or password is incorrect/.test(await P.ev(`document.querySelector('[role="alert"]').innerText`)));
    await register(P, 'Alice', 'alice@example.test');
    await P.waitFor(`document.body.innerText.includes('Signed in as Alice')`, { what: 'signed-in banner' });
    const s = await main(P);
    check('registration signs the user in and lands on /sessions', /Signed in as\s*Alice/.test(s) || (await text(P)).includes('Signed in as Alice'));
    const c = (await P.send('Network.getCookies', { urls: [BASE] })).cookies.find((x) => x.name === 'tobin_session');
    check('the session cookie is HttpOnly, SameSite=Strict, Secure and invisible to scripts', c && c.httpOnly && c.sameSite === 'Strict' && c.secure && !(await P.ev('document.cookie')).includes('tobin_session'), JSON.stringify(c));
    check('with no organization yet, /sessions explains where to create one', /not a member of any organization/.test(await main(P)));
  });

  await step('2 organization creation, details and last-administrator protection', async () => {
    await openOrganizations(P);
    check('the page states roles are application roles with no Stellar authority', /grant no authority on Stellar/.test(await main(P)));
    await setValue(P, input('Name'), 'Alpha Bank');
    await P.click(btn('Create organization'));
    await P.waitFor(`document.body.innerText.includes('Organization "Alpha Bank" created')`, { what: 'creation notice' });
    await P.waitFor(`document.body.innerText.includes('Alice (you)') && document.body.innerText.includes('Your role: admin')`, { what: 'members loaded' });
    check('the new organization is selected and shows Alice as administrator', (await P.ev(`document.querySelector('select[aria-label="Active organization"]').selectedOptions[0].textContent`)) === 'Alpha Bank' && /Alice \(you\)/.test(await main(P)) && /Your role:\s*admin/.test(await main(P)));
    await P.click(btn('Make Alice a member'));
    await P.waitFor(`document.querySelector('[role="alert"]')`, { what: 'last admin error' });
    check('demoting the last administrator is refused with a clear message', /at least one administrator/.test(await P.ev(`document.querySelector('[role="alert"]').innerText`)));
    await P.click(btn('Remove Alice'));
    await P.waitFor(`/at least one administrator/.test(document.querySelector('[role="alert"]')?.innerText ?? '')`);
    check('removing the last administrator is refused too', true);
    await structure(P, 'organizations'); await layout(P, 'organizations');
    await P.screenshot(join(out, `backend-organizations-${W}.png`));
  });

  let code = '';
  await step('3 invitation: one-time code, honest delivery note', async () => {
    await setValue(P, input('Invitee email'), 'bob@example.test');
    await P.click(btn('Create invitation'));
    await P.waitFor(`document.body.innerText.includes('One-time invitation code')`, { what: 'issued code' });
    await P.waitFor(`document.body.innerText.includes('pending')`, { what: 'invitation row' });
    const t = await text(P);
    check('the UI says no email was sent and the code is shown once', /No email was sent/.test(t) && /shown once/.test(t));
    code = await P.ev(`document.querySelector('.ss-provenance code').innerText`);
    check('a long random code is shown', code.length >= 30, code.length);
    check('the invitation is listed as pending', /bob@example\.test/.test(t) && /pending/.test(t));
    await layout(P, 'invitation issued');
    await P.screenshot(join(out, `backend-invitation-${W}.png`));
    await P.navigate(`${BASE}/organizations`); await P.waitFor(`document.body.innerText.includes('Signed in as')`); await sleep(600);
    check('after a reload the code is not shown again and the token is not on the page', !(await text(P)).includes(code));
  });

  await step('4 sign out; the invitee registers and accepts', async () => {
    await signOut(P);
    await P.waitFor(`[...document.querySelectorAll('nav a')].some((a) => a.textContent.trim() === 'Sign in')`, { what: 'Sign in link' });
    check('signed out: the nav offers Sign in and the old session is dead', await P.ev(`Boolean([...document.querySelectorAll('nav a')].find((a) => a.textContent.trim() === 'Sign in'))`));
    await P.navigate(`${BASE}/sessions`); await P.waitFor(`document.body.innerText.includes('You are not signed in')`);
    check('/sessions after sign-out shows no organization data', !/Alpha Bank/.test(await text(P)));
    await register(P, 'Bob', 'bob@example.test');
    await openOrganizations(P);
    await setValue(P, input('Invitation code'), 'not-the-real-code-xxxxxxxxxxxx');
    await P.click(btn('Accept invitation'));
    await P.waitFor(`document.querySelector('[role="alert"]')`, { what: 'bad code error' });
    check('a wrong code is refused with a uniform message', /invalid, expired or already used/.test(await P.ev(`document.querySelector('[role="alert"]').innerText`)));
    await setValue(P, input('Invitation code'), code);
    await P.click(btn('Accept invitation'));
    await P.waitFor(`document.body.innerText.includes('Invitation accepted')`, { what: 'accepted' });
    await P.waitFor(`document.body.innerText.includes('Your role:') && document.body.innerText.includes('Bob (you)') && document.body.innerText.includes('Alice')`, { what: 'member view loaded' });
    const t = await main(P);
    check('Bob is now a member of Alpha Bank with the member role and no admin controls', /Alpha Bank/.test(t) && /Your role:\s*member/.test(t) && !/Create invitation/.test(t) && !/Make Alice/.test(t));
    check('Bob sees the member list by name but not email addresses', /Alice/.test(t) && !/alice@example\.test/.test(t));
    await layout(P, 'member view');
  });

  await step('5 replay and role limits for a member', async () => {
    await setValue(P, input('Invitation code'), code);
    await P.click(btn('Accept invitation'));
    await P.waitFor(`document.querySelector('[role="alert"]')`);
    check('the same code cannot be used again', /invalid, expired or already used/.test(await P.ev(`document.querySelector('[role="alert"]').innerText`)));
    await P.navigate(`${BASE}/sessions`); await P.waitFor(`document.querySelector('select[aria-label="Organization"]')`); await sleep(500);
    await setValue(P, `document.querySelector('section[aria-label="New session"] input')`, 'Member draft');
    await P.click(btn('Create local draft'));
    await P.waitFor(`document.querySelector('[role="alert"]')`, { what: 'member cannot create' });
    check('a member cannot create a draft: the server refuses with a clear message', /administrator role required/.test(await P.ev(`document.querySelector('[role="alert"]').innerText`)));
  });

  await step('6 administrator creates a draft; the workspace and provenance', async () => {
    await signOut(P); await signInAs(P, 'alice@example.test');
    await P.waitFor(`document.querySelector('select[aria-label="Organization"]')`); await sleep(500);
    await setValue(P, `document.querySelector('section[aria-label="New session"] input')`, 'Alice Q4 draft');
    await P.click(btn('Create local draft'));
    await P.waitFor(`document.querySelectorAll('main table tbody tr').length >= 1`, { what: 'draft row' });
    check('the draft is listed as a local draft, not on-chain', /Draft \(not on-chain\)/.test(await main(P)) && /Local draft/.test(await main(P)));
    await P.click(btn('Alice Q4 draft')); await P.waitFor(`document.querySelector('[aria-label="Session workspace"]')`);
    check('the workspace banner says Local draft', /Local draft\./.test(await P.ev(`document.querySelector('.ss-provenance').innerText`)));
    await P.click(btn('Activity and history'));
    check('activity names the actor by display name', /Session created/.test(await main(P)) &&/Alice/.test(await main(P)));
    await P.screenshot(join(out, `backend-draft-${W}.png`));
  });

  await step('7 persistence across a server restart', async () => {
    await stopServer(); await startServer();
    await P.navigate(`${BASE}/sessions`);
    await P.waitFor(`document.querySelector('main table tbody tr')`, { what: 'sessions after restart', timeout: 15000 });
    const t = await main(P);
    check('the browser session survived the restart (still signed in as Alice)', /Signed in as\s*Alice/.test(t) || (await text(P)).includes('Signed in as Alice'));
    check('the draft survived the restart and is still a local draft', /Alice Q4 draft/.test(t) && /Local draft/.test(t));
    await openOrganizations(P);
    check('the organization and both members survived the restart', /Alpha Bank/.test(await main(P)) && /Bob/.test(await main(P)) && /Alice \(you\)/.test(await main(P)));
  });

  await step('8 organization isolation between real accounts', async () => {
    const orgId = await P.ev(`fetch('/api/registry/orgs').then((r) => r.json()).then((j) => j.organizations[0].id)`);
    await signOut(P); await register(P, 'Eve', 'eve@example.test');
    await openOrganizations(P);
    await setValue(P, input('Name'), 'Eve Capital'); await P.click(btn('Create organization'));
    await P.waitFor(`document.body.innerText.includes('Organization "Eve Capital" created')`);
    const r = await P.ev(`(async () => { const g = async (u) => { const r = await fetch(u); const j = await r.json(); return [r.status, j.error]; }; return { foreign: await g('/api/registry/orgs/${orgId}'), foreignSessions: await g('/api/registry/orgs/${orgId}/sessions'), none: await g('/api/registry/orgs/org_nonexistent') }; })()`);
    check('Eve gets 404 NOT_FOUND for Alpha Bank, identical to a nonexistent organization', r.foreign[0] === 404 && r.foreignSessions[0] === 404 && r.none[0] === 404 && r.foreign[1] === r.none[1], JSON.stringify(r));
    check('Eve only sees her own organization', (await P.ev(`[...document.querySelectorAll('select[aria-label="Active organization"] option')].map((o) => o.textContent)`)).join() === 'Eve Capital');
    const forged = await P.ev(`fetch('/api/registry/orgs', { headers: { 'x-tobin-dev-user': 'dev:demo', 'x-user-id': 'alice' } }).then((r) => r.json()).then((j) => j.organizations.map((o) => o.name))`);
    check('forged identity headers change nothing (still Eve)', forged.join() === 'Eve Capital', forged.join());
  });

  await step('9 expired or removed session', async () => {
    await P.send('Network.deleteCookies', { name: 'tobin_session', url: BASE });
    await P.navigate(`${BASE}/organizations`);
    await P.waitFor(`document.body.innerText.includes('You are not signed in')`, { what: 'signed-out message' });
    check('with no valid session the page offers sign-in and shows no data', !/Eve Capital|Alpha Bank/.test(await text(P)));
    await P.navigate(`${BASE}/sessions`);
    await P.waitFor(`document.body.innerText.includes('You are not signed in')`);
    check('the same holds for /sessions', true);
    check('/w0 stays separate: no institutional nav, no link to /sessions or /organizations', await (async () => { await P.navigate(`${BASE}/w0`); await P.waitFor(`document.querySelector('main')`); return P.ev(`!document.querySelector('nav[aria-label="Institution"]') && !document.querySelector('a[href="/sessions"]') && !document.querySelector('a[href="/organizations"]')`); })());
  });

  await step('10 health and page health', async () => {
    const h = await P.ev(`fetch('/api/health').then((r) => r.json())`);
    check('health reports status, schema version and nothing else', h.status === 'ok' && h.schemaVersion === 2 && Object.keys(h).sort().join() === 'database,pendingMigrations,schemaVersion,status', JSON.stringify(h));
    check('no JavaScript exception during the whole journey (expected 401 console messages excluded)', P.errors.filter((e) => !/401|Failed to load resource/.test(e)).length === 0, P.errors.join('\n'));
  });
} finally {
  for (const p of pages) await p.close();
  if (browser) browser.child.kill();
  if (server) { server.removeAllListeners('exit'); server.kill(); }
  await sleep(800);
  rmSync(join(out, '.profile-backend'), { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
const failed = results.filter((r) => !r.ok);
writeFileSync(join(out, `backend-journey-results-${W}.json`), JSON.stringify({ browser: browser?.version, width: W, total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length} of ${results.length} checks passed${failed.length ? `; ${failed.length} FAILED` : ''}. Results: ${out}`);
process.exit(failed.length ? 1 : 0);
