// REAL-BROWSER journey for the session experience (/sessions), driven over the Chrome DevTools Protocol with the existing cdp.mjs driver.
// Not part of `node --test`: needs an installed Chrome or Edge and a production build (`npm run build:console` from the repository root).
//   TOBIN_WIDTH=420 node test/browser/sessions-journey.mjs <artifact dir>      (also run at TOBIN_WIDTH=1200)
// Production build on 127.0.0.1 with the development identity explicitly enabled. No wallet, no network, no Stellar call.
// Loading and error states are produced by the TEST (CDP Fetch interception of the page's own requests); no production code path is altered for them.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Page, findBrowser, launchBrowser, sleep } from './cdp.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const W = Number(process.env.TOBIN_WIDTH ?? 1200);
const out = process.argv[2] ?? join(root, 'test', 'browser', 'sessions-out');
mkdirSync(out, { recursive: true });
const exe = findBrowser();
if (!exe) throw new Error('no Chrome or Edge found (set TOBIN_BROWSER)');
const PORT = 31000 + Math.floor(Math.random() * 4000);
const DEBUG_PORT = 36000 + Math.floor(Math.random() * 3000);
const BASE = `http://127.0.0.1:${PORT}`;
const FIXTURE_ID = 'f1'.repeat(32);
const results = [];
let currentStep = '';
const q = (s) => JSON.stringify(s);
function check(name, cond, detail = '') {
  results.push({ step: currentStep, name, ok: Boolean(cond), detail: cond ? '' : String(detail).slice(0, 1200) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  [${currentStep}] ${name}${cond ? '' : '\n      ' + String(detail).slice(0, 1200)}`);
}
async function step(name, fn) {
  currentStep = name;
  try { await fn(); } catch (e) { check('step completed without an exception', false, e instanceof Error ? e.message : String(e)); }
}

// A throw-away database seeded ONLY by the explicit operator command (never automatically), with a random password that exists only in this process.
const dbDir = mkdtempSync(join(tmpdir(), 'tobin-journey-'));
const DB = join(dbDir, 'journey.sqlite');
const PW = randomBytes(12).toString('base64url');
execFileSync(process.execPath, ['scripts/db.ts', 'seed-demo'], { cwd: root, env: { ...process.env, NODE_ENV: 'development', TOBIN_DB_PATH: DB, TOBIN_DEMO_PASSWORD: PW }, stdio: ['ignore', 'ignore', 'ignore'] });
const env = { ...process.env, PORT: String(PORT), NODE_ENV: 'production', TOBIN_DB_PATH: DB };
delete env.TOBIN_ALLOW_DEV_IDENTITY;
const server = spawn(process.execPath, [join(root, '..', '..', 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '--hostname', '127.0.0.1', '--port', String(PORT)], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });

const main = (p) => p.ev(`document.querySelector('main').innerText`);
const btn = (label) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${q(label)})`;
const overflow = (p) => p.ev(`document.documentElement.scrollWidth - window.innerWidth`);
const clipped = (p) => p.ev(`[...document.querySelectorAll('main button, main input, main select')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1); }).map((e) => e.tagName + ':' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30))`);
async function setValue(p, expr, value) {
  await p.ev(`(() => { const el = ${expr}; if (!el) throw new Error('field not found'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(60);
}
async function press(p, key, code, vk, shift = false) {
  for (const type of ['keyDown', 'keyUp']) await p.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0, ...(key === 'Enter' && type === 'keyDown' ? { text: String.fromCharCode(13) } : {}) });
  await sleep(50);
}
async function structure(p, where) {
  const r = await p.ev(`(() => {
    const issues = [];
    const named = (el) => el.getAttribute('aria-label') || el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]'));
    for (const el of document.querySelectorAll('main input, main select')) if (!named(el)) issues.push('unlabelled control ' + el.tagName);
    for (const t of document.querySelectorAll('main table')) { if (!t.querySelector('caption')) issues.push('table without caption'); if (t.querySelector('thead th:not([scope])')) issues.push('th without scope'); }
    for (const b of document.querySelectorAll('main button')) if (!b.textContent.trim() && !b.getAttribute('aria-label')) issues.push('button without name');
    if (document.querySelectorAll('h1').length !== 1) issues.push('h1 count ' + document.querySelectorAll('h1').length);
    const levels = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1]));
    for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) issues.push('heading skip ' + levels[i - 1] + '->' + levels[i]);
    if (!document.documentElement.lang) issues.push('no lang');
    return issues;
  })()`);
  check(`accessibility structure (${where}): labels, captions, scope, headings, names`, r.length === 0, r.join('; '));
}
const layout = async (p, where) => {
  check(`no horizontal page overflow (${where})`, (await overflow(p)) <= 1, `overflow ${await overflow(p)}px`);
  const c = await clipped(p);
  check(`no control clipped outside the viewport (${where})`, c.length === 0, c.join(', '));
};

let browser;
const pages = [];
try {
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 30000);
    server.stdout.on('data', (d) => { if (String(d).includes('Ready')) { clearTimeout(t); resolve(); } });
    server.on('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
  browser = await launchBrowser({ exe, port: DEBUG_PORT, profileDir: join(out, '.profile') });
  const P = await Page.open(DEBUG_PORT, 'about:blank');
  pages.push(P);
  const actual = await P.ev('[window.innerWidth, window.innerHeight]');
  console.log(`browser ${browser.version}; viewport ${actual.join('x')}`);

  await step('S0 sign in through the real sign-in page', async () => {
    await P.navigate(`${BASE}/sessions`);
    await P.waitFor(`document.body.innerText.includes('You are not signed in')`, { what: 'signed-out prompt' });
    check('without a session, /sessions asks the user to sign in and shows no organization data', !/Demo Institution/.test(await main(P)));
    await P.navigate(`${BASE}/sign-in`);
    await P.waitFor(`document.querySelector('input[type=email]')`); await sleep(1200); // let React hydrate before typing
    await setValue(P, `document.querySelector('input[type=email]')`, 'demo@example.test');
    await setValue(P, `document.querySelector('input[type=password]')`, PW);
    await P.click(btn('Sign in'));
    await P.waitFor(`location.pathname === '/sessions'`, { what: 'redirect to /sessions' });
    const c = (await P.send('Network.getCookies', { urls: [BASE] })).cookies.find((x) => x.name === 'tobin_session');
    check('the session cookie is HttpOnly, SameSite=Strict and Secure', c && c.httpOnly && c.sameSite === 'Strict' && c.secure, JSON.stringify(c));
    check('document.cookie cannot read it', !(await P.ev('document.cookie')).includes('tobin_session'));
  });

  await step('A1 loading state (response delayed by the test)', async () => {
    await P.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/registry/orgs/*/sessions', requestStage: 'Request' }] });
    let held = null;
    P.listeners.push((m) => { if (m.method === 'Fetch.requestPaused') held = m.params.requestId; });
    await P.navigate(`${BASE}/sessions`);
    await P.waitFor(`document.body.innerText.includes('Loading sessions')`, { what: 'loading text' });
    check('a loading message is shown while the list request is pending', true);
    await P.waitFor(`true`); await sleep(100);
    check('the list request was intercepted by the test', held !== null);
    await P.send('Fetch.continueRequest', { requestId: held });
    await P.send('Fetch.disable');
    await P.waitFor(`document.querySelector('main table tbody tr')`, { what: 'rows after release' });
  });

  await step('A2 error state with Retry (500 produced by the test)', async () => {
    await P.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/registry/orgs/*/sessions', requestStage: 'Request' }] });
    const onPause = (m) => { if (m.method === 'Fetch.requestPaused') P.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 500, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ error: 'INTERNAL', message: 'internal error' })).toString('base64') }); };
    P.listeners.push(onPause);
    await P.navigate(`${BASE}/sessions`);
    await P.waitFor(`document.querySelector('[role="alert"]')`, { what: 'error alert' });
    const t = await main(P);
    check('the error is shown in an alert with a readable message and a Retry button', /Could not load sessions: internal error/.test(t) && (await P.ev(`Boolean(${btn('Retry')})`)));
    P.listeners = P.listeners.filter((l) => l !== onPause);
    await P.send('Fetch.disable');
    await P.click(btn('Retry'));
    await P.waitFor(`document.querySelector('main table tbody tr')`, { what: 'rows after retry' });
    check('Retry recovers and shows the sessions', true);
  });

  await step('A3 listing', async () => {
    await P.navigate(`${BASE}/sessions`);
    await P.waitFor(`document.querySelector('main table tbody tr')`, { what: 'listing' });
    const t = await main(P);
    check('/sessions loads and the organization is visible', t.includes('Organization') && (await P.ev(`document.querySelector('select[aria-label="Organization"]').selectedOptions[0].textContent`)).includes('Demo Institution (fixture data)'));
    check('the banner names the signed-in user and states no wallet, no network, drafts not on-chain', /Signed in as Demo User.*No wallet or Stellar network.*not an on-chain session/s.test(t));
    const row = await P.ev(`(() => { const tr = document.querySelector('main table tbody tr'); return [...tr.children].map((c) => c.innerText.trim()); })()`);
    check('row: name, short id, status, participants, created, provenance, activity', row[0] === 'Fixture: three-party triangle' && row[1].includes('…') && /Fixture/.test(row[2]) && row[3] === 'not read' && /^\d{4}-\d{2}-\d{2}$/.test(row[4]) && row[5] === 'Fixture' && /^\d+/.test(row[6]), JSON.stringify(row));
    check('the full session id is available on the short id (title)', (await P.ev(`document.querySelector('main table tbody tr code').title`)) === FIXTURE_ID);
    check('the activity cell shows a count and last-activity date when activity exists', /^\d+( \(last \d{4}-\d{2}-\d{2}\))?$/.test(row[6]), row[6]);
    check('the provenance badge is visible', await P.ev(`(() => { const b = document.querySelector('.ss-badge'); const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`));
    await structure(P, 'listing'); await layout(P, 'listing');
    await P.screenshot(join(out, `listing-${W}.png`));
  });

  await step('N navigation', async () => {
    await P.navigate(`${BASE}/sessions`);
    await P.waitFor(`document.querySelector('nav[aria-label="Institution"] a')`, { what: 'nav link' });
    const a = await P.ev(`(() => { const l = document.querySelector('nav[aria-label="Institution"] a'); const r = l.getBoundingClientRect(); return [l.textContent.trim(), l.getAttribute('href'), l.getAttribute('aria-current'), r.width > 0 && r.left >= 0 && r.right <= window.innerWidth, r.height]; })()`);
    check('a "Sessions" link to /sessions is in the Institution navigation', a[0] === 'Sessions' && a[1] === '/sessions', JSON.stringify(a));
    check('it is marked as the current page (aria-current) on /sessions', a[2] === 'page');
    check('it is inside the viewport and at least 24px tall', a[3] && a[4] >= 24, JSON.stringify(a));
    check('the navigation precedes the identity banner and the page keeps exactly one h1', await P.ev(`(() => { const n = document.querySelector('nav[aria-label="Institution"]'); const b = document.querySelector('.ss-banner'); return Boolean(n.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && document.querySelectorAll('h1').length === 1; })()`));
    await P.waitFor(`document.body.innerText.includes('Signed in as Demo User')`, { what: 'signed-in banner' });
    check('the signed-in banner is still shown', /Signed in as Demo User/.test(await main(P)));
    await P.screenshot(join(out, `navigation-${W}.png`));
    await P.ev(`document.activeElement.blur()`);
    await press(P, 'Tab', 'Tab', 9);
    check('the link is the first control reached by keyboard and shows a focus outline', await P.ev(`(() => { const e = document.activeElement; return e.getAttribute('href') === '/sessions' && parseFloat(getComputedStyle(e).outlineWidth) >= 2; })()`));
    await press(P, 'Enter', 'Enter', 13);
    await P.waitFor(`document.querySelector('main table tbody tr')`, { what: 'sessions after Enter on the link' });
    check('Enter on the link keeps the user on /sessions with the list shown', (await P.ev('location.pathname')) === '/sessions');
    for (const path of ['/w0', '/']) {
      await P.navigate(`${BASE}${path}`);
      await P.waitFor(`document.querySelector('main')`);
      check(`${path} has no Institution navigation and no link to /sessions`, await P.ev(`!document.querySelector('nav[aria-label="Institution"]') && !document.querySelector('a[href="/sessions"]')`));
    }
    await P.navigate(`${BASE}/w0`); await P.waitFor(`document.querySelector('main')`);
    check('the Sessions page is not linked from /w0 text either', !/Sessions/.test(await main(P)));
  });

  await step('B session creation', async () => {
    await P.navigate(`${BASE}/sessions`); await P.waitFor(`document.querySelector('main table tbody tr')`);
    check('the form states a draft is not an on-chain session', /not an on-chain session/.test(await main(P)));
    const fields = await P.ev(`[...document.querySelectorAll('section[aria-label="New session"] input, section[aria-label="New session"] select')].map((e) => e.name + '|' + e.type)`);
    check('the only creation input is the name: no session id or provenance field', fields.length === 1 && !/id|prov/i.test(fields[0]), JSON.stringify(fields));
    check('the name field is required', await P.ev(`document.querySelector('section[aria-label="New session"] input').required`));
    await P.navigate(`${BASE}/sessions`); await P.waitFor(`document.querySelector('main table tbody tr')`);
    await P.click(btn('Create local draft'));
    check('empty submission is blocked by validation (nothing created)', (await P.ev(`document.querySelectorAll('main table tbody tr').length`)) === 1);
    await setValue(P, `document.querySelector('section[aria-label="New session"] input')`, '<b>x</b>');
    await P.click(btn('Create local draft'));
    await P.waitFor(`document.querySelector('[role="alert"]')`, { what: 'invalid name error' });
    check('an invalid name shows a clear server error and creates nothing', /./.test(await P.ev(`document.querySelector('[role="alert"]').innerText`)) && (await P.ev(`document.querySelectorAll('main table tbody tr').length`)) === 1, await P.ev(`document.querySelector('[role="alert"]').innerText`));
    await P.screenshot(join(out, `creation-${W}.png`));
    await setValue(P, `document.querySelector('section[aria-label="New session"] input')`, 'Q4 clearing draft');
    await P.click(btn('Create local draft'));
    await P.waitFor(`document.querySelectorAll('main table tbody tr').length === 2`, { what: 'second row' });
    const t = await main(P);
    check('the notice says it is not an on-chain session', /Local draft recorded\. It is not an on-chain session\./.test(t));
    const rows = await P.ev(`[...document.querySelectorAll('main table tbody tr')].map((tr) => [...tr.children].map((c) => c.innerText.trim()))`);
    const d = rows.find((r) => r[0] === 'Q4 clearing draft');
    check('the new draft is listed as "Draft (not on-chain)" with provenance Local draft', d && d[2] === 'Draft (not on-chain)' && d[5] === 'Local draft', JSON.stringify(rows));
    check('the alert from the invalid attempt is gone after a successful create', !(await P.ev(`Boolean(document.querySelector('[role="alert"]'))`)));
    await layout(P, 'after create');
  });

  const tabs = ['Overview', 'Participants', 'Obligations', 'Net positions', 'Activity and history'];
  await step('C/D fixture workspace', async () => {
    await P.click(btn('Fixture: three-party triangle'));
    await P.waitFor(`document.querySelector('[aria-label="Session workspace"]')`, { what: 'workspace' });
    for (const t of tabs) {
      check(`tab "${t}" is a visible, reachable tab control`, await P.ev(`(() => { const b = ${btn(t)}; if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= window.innerWidth + 1 && b.getAttribute('role') === 'tab'; })()`));
    }
    for (const t of tabs) {
      await P.click(btn(t)); await sleep(150);
      check(`"${t}": selected state exposed and the provenance banner stays visible above`, (await P.ev(`${btn(t)}.getAttribute('aria-selected')`)) === 'true' && (await P.ev(`(() => { const b = document.querySelector('.ss-provenance'); const r = b.getBoundingClientRect(); return r.width > 0 && /Fixture\\./.test(b.innerText) && r.bottom <= document.querySelector('[role="tablist"]').getBoundingClientRect().top + 1; })()`)));
      await P.screenshot(join(out, `workspace-${t.toLowerCase().replace(/ /g, '-')}-${W}.png`));
      await layout(P, `tab ${t}`);
    }
    await P.click(btn('Overview'));
    const ov = await main(P);
    check('overview: full session id, status, created date, provenance', ov.includes(FIXTURE_ID) && /Fixture/.test(ov) && /Created/.test(ov));
    await P.click(btn('Participants'));
    check('participants labelled FIXTURE', /FIXTURE participants/.test(await main(P)));
    await P.click(btn('Obligations'));
    const ob = await main(P);
    check('obligations labelled FIXTURE with three rows', /FIXTURE obligations/.test(ob) && (await P.ev(`document.querySelectorAll('main table tbody tr').length`)) === 3);
    await P.click(btn('Net positions'));
    const nt = await main(P);
    const nets = await P.ev(`[...document.querySelectorAll('main table tbody tr')].map((tr) => [...tr.children].map((c) => c.innerText.trim()))`);
    check('net positions labelled FIXTURE', /FIXTURE/.test(nt));
    check('A +30, B -20, C -10', JSON.stringify(nets.map((r) => [r[0], r[1]])) === JSON.stringify([['Fixture Org A', '30'], ['Fixture Org B', '-20'], ['Fixture Org C', '-10']]), JSON.stringify(nets));
    check('gross 250 and moved 30, marked as fixture figures', /Gross obligations 250; value that would move after netting 30/.test(nt) && /fixture figures/.test(nt));
    await P.click(btn('Activity and history'));
    check('activity tab shows an explicit state (empty message or rows)', /No activity recorded|When/.test(await main(P)));
    await structure(P, 'workspace');
  });

  await step('E draft workspace', async () => {
    await P.click(btn('Back to sessions'));
    await P.waitFor(`document.querySelectorAll('main table tbody tr').length === 2`);
    await P.click(btn('Q4 clearing draft'));
    await P.waitFor(`document.querySelector('[aria-label="Session workspace"]')`);
    const banner = await P.ev(`document.querySelector('.ss-provenance').innerText`);
    check('banner identifies a Local draft and says it is not on-chain', /Local draft\./.test(banner) && /not an on-chain session/.test(banner), banner);
    for (const [t, re] of [['Participants', /No participants yet/], ['Obligations', /No obligations yet/], ['Net positions', /No calculation yet/]]) {
      await P.click(btn(t));
      await P.waitFor(`/No (participants|obligations|calculation) yet/.test(document.querySelector('main').innerText)`, { what: `${t} empty state` });
      check(`${t}: empty state shown, and no table fabricated`, re.test(await main(P)) && (await P.ev(`document.querySelectorAll('main table').length`)) === 0);
    }
    await P.click(btn('Activity and history'));
    check('draft activity lists the recording event', /Session created/.test(await main(P)));
    await P.screenshot(join(out, `draft-workspace-${W}.png`));
  });

  await step('F organization isolation (same browser, signing in as the other user)', async () => {
    const r = await P.ev(`(async () => {
      const H = { 'content-type': 'application/json', 'x-tobin-request': '1' };
      const get = async (u) => { const r = await fetch(u, { cache: 'no-store' }); return [r.status, (await r.json()).error ?? null]; };
      const login = (email) => fetch('/api/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ email, password: ${JSON.stringify(PW)} }) });
      const orgs = (await (await fetch('/api/registry/orgs')).json()).organizations;
      const id = orgs[0].id;
      const own = await get('/api/registry/orgs/' + id + '/sessions/${FIXTURE_ID}');
      const unknownOrg = await get('/api/registry/orgs/org_doesnotexist/sessions');
      const unknownSession = await get('/api/registry/orgs/' + id + '/sessions/' + 'ab'.repeat(32));
      await login('other@example.test');
      const foreignList = await get('/api/registry/orgs/' + id + '/sessions');
      const foreignSession = await get('/api/registry/orgs/' + id + '/sessions/${FIXTURE_ID}');
      const otherOrgs = (await (await fetch('/api/registry/orgs')).json()).organizations.map((o) => o.name);
      await login('demo@example.test');
      return { own, foreignList, foreignSession, unknownOrg, unknownSession, otherOrgs };
    })()`);
    check('the demo organization can open its own session (200)', r.own[0] === 200, JSON.stringify(r));
    check('another organization gets 404 NOT_FOUND for list and session', r.foreignList[0] === 404 && r.foreignList[1] === 'NOT_FOUND' && r.foreignSession[0] === 404 && r.foreignSession[1] === 'NOT_FOUND', JSON.stringify(r));
    check('foreign access is indistinguishable from nonexistent (same status and code)', r.unknownOrg[0] === 404 && r.unknownOrg[1] === 'NOT_FOUND' && r.unknownSession[0] === 404 && r.unknownSession[1] === 'NOT_FOUND', JSON.stringify(r));
    check('the other user only ever sees their own organization', JSON.stringify(r.otherOrgs) === JSON.stringify(['Other Institution (fixture data)']), JSON.stringify(r.otherOrgs));
  });

  await step('G keyboard and focus', async () => {
    await P.navigate(`${BASE}/sessions`);
    await P.waitFor(`document.querySelector('main table tbody tr')`);
    const seen = [];
    let outlineOk = true;
    for (let i = 0; i < 6; i++) {
      await press(P, 'Tab', 'Tab', 9);
      const f = await P.ev(`(() => { const a = document.activeElement; const s = getComputedStyle(a); return [a.tagName, (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 30), parseFloat(s.outlineWidth), s.outlineStyle]; })()`);
      seen.push(f[0] + ':' + f[1]);
      if (f[0] !== 'BODY' && !(f[2] >= 2 && f[3] !== 'none')) outlineOk = false;
    }
    check('Tab moves through distinct controls', new Set(seen).size >= 3, JSON.stringify(seen));
    check('focused controls show an outline of at least 2px', outlineOk, JSON.stringify(seen));
    await P.ev(`${btn('Fixture: three-party triangle')}.focus()`);
    await press(P, 'Enter', 'Enter', 13);
    await P.waitFor(`document.querySelector('[aria-label="Session workspace"]')`, { what: 'keyboard open' });
    check('a session can be opened with the keyboard alone', true);
    await P.ev(`${btn('Net positions')}.focus()`);
    await press(P, 'Enter', 'Enter', 13);
    check('a tab can be activated with the keyboard alone', /FIXTURE/.test(await main(P)));
  });

  await step('H page health', async () => {
    check('no JavaScript exception or console error during the whole journey', P.errors.length === 0, P.errors.join('\n'));
  });
} finally {
  for (const p of pages) await p.close();
  if (browser) browser.child.kill();
  server.removeAllListeners('exit');
  server.kill();
  await sleep(500);
  rmSync(join(out, '.profile'), { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
const failed = results.filter((r) => !r.ok);
writeFileSync(join(out, `sessions-journey-results-${W}.json`), JSON.stringify({ browser: browser?.version, width: W, total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length} of ${results.length} checks passed${failed.length ? `; ${failed.length} FAILED` : ''}. Results: ${out}`);
process.exit(failed.length ? 1 : 0);
