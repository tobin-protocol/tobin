// REAL-BROWSER journey for the W0 console (/w0), driven over the Chrome DevTools Protocol. MOCK ADAPTER ONLY: no signer, key, DPAPI, RPC or network is involved.
// Not part of `node --test`: it needs an installed Chrome or Edge and a production build of the console.
//
//   npm run build:console                              # from the repository root
//   node test/browser/w0-journey.mjs [artifact dir]    # from apps/web-console; one line per check, exit 1 on any failure
//
// The server runs the production build on 127.0.0.1 with the mock scenario `ok` and the development identity provider explicitly enabled.
// The environment passed to the server is a copy of this process environment with every hosted-environment marker removed.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Page, findBrowser, launchBrowser, sleep } from './cdp.mjs';
import { HOSTED_ENV_MARKERS, MOCK_BASELINE_HASH, MOCK_CONFIG_SHA256 } from '../../lib/w0/deps.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const out = process.argv[2] ?? join(root, 'test', 'browser', 'w0-out');
mkdirSync(out, { recursive: true });
const exe = findBrowser();
if (!exe) throw new Error('no Chrome or Edge found (set TOBIN_BROWSER)');
const PORT = 31000 + Math.floor(Math.random() * 4000);
const DEBUG_PORT = 36000 + Math.floor(Math.random() * 3000);
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
let currentStep = '';
const q = (s) => JSON.stringify(s);

function check(name, cond, detail = '') {
  results.push({ step: currentStep, name, ok: Boolean(cond), detail: cond ? '' : String(detail).slice(0, 1200) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  [${currentStep}] ${name}${cond ? '' : '\n      ' + String(detail).slice(0, 1200)}`);
}
async function step(name, fn) {
  currentStep = name;
  try { await fn(); } catch (e) { let page = ''; try { page = await pages[0].ev("document.querySelector('main')?.innerText.slice(0, 600) ?? ''"); } catch { /* page unavailable */ }
    check('step completed without an exception', false, (e instanceof Error ? e.message : String(e)) + ' | page: ' + page); }
}

const env = { ...process.env, PORT: String(PORT), NODE_ENV: 'production', W0_MOCK_SCENARIO: 'ok', W0_ALLOW_DEV_IDP: '1' };
for (const k of HOSTED_ENV_MARKERS) delete env[k];
const server = spawn(process.execPath, [join(root, '..', '..', 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '--hostname', '127.0.0.1', '--port', String(PORT)], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });

// ---- page helpers ----
const main = (p) => p.ev(`document.querySelector('main').innerText`);
const btn = (label) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${q(label)})`;
const field = (labelStart, tag) => `[...document.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(${q(labelStart)}))?.querySelector(${q(tag)})`;
async function setValue(p, expr, value) {
  await p.ev(`(() => { const el = ${expr}; if (!el) throw new Error('field not found: ' + ${q(expr.slice(0, 60))}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);
  await sleep(60);
}
const tab = async (p, name) => { await p.click(btn(name)); await sleep(250); };
async function signIn(p, subject) {
  await p.waitFor(btn(`Sign in as ${subject}`), { what: `sign-in button for ${subject}` });
  await p.click(btn(`Sign in as ${subject}`));
  await p.waitFor(`document.body.innerText.includes('Signed in as')`, { what: 'signed-in banner' });
}
async function signOut(p) {
  await p.click(btn('Sign out'));
  await p.waitFor(`document.body.innerText.includes('Sign in')`, { what: 'sign-in page' });
}
const alertText = (p) => p.ev(`document.querySelector('[role="alert"]')?.innerText ?? ''`);

async function a11yAudit(p, where) {
  const r = await p.ev(`(() => {
    const issues = [];
    const named = (el) => el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]'));
    for (const el of document.querySelectorAll('main input, main select, main textarea')) if (!named(el)) issues.push('unlabelled control ' + el.tagName);
    for (const t of document.querySelectorAll('main table')) {
      if (!t.querySelector('caption')) issues.push('table without caption');
      if (t.querySelector('thead th:not([scope])')) issues.push('th without scope');
    }
    for (const b of document.querySelectorAll('main button')) if (!b.textContent.trim() && !b.getAttribute('aria-label')) issues.push('button without name');
    const h1 = document.querySelectorAll('h1').length; if (h1 !== 1) issues.push('h1 count ' + h1);
    const levels = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1]));
    for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) issues.push('heading level skip ' + levels[i - 1] + '->' + levels[i]);
    if (!document.querySelector('html').lang) issues.push('no lang');
    if (document.documentElement.scrollWidth > window.innerWidth + 1) issues.push('horizontal overflow ' + document.documentElement.scrollWidth + '>' + window.innerWidth);
    return issues;
  })()`);
  check(`accessibility structure (${where}): labels, captions, scope, headings, no overflow`, r.length === 0, r.join('; '));
}
async function pressTab(p) {
  for (const type of ['keyDown', 'keyUp']) await p.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await sleep(40);
}

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

  await step('01 open /w0', async () => {
    await P.navigate(`${BASE}/w0`);
    await P.waitFor(`document.querySelector('main')`);
    const t = await main(P);
    check('the page opens and states W0 / MOCK ADAPTER / NON-EXECUTING', t.includes('W0 · MOCK ADAPTER · NON-EXECUTING'));
    check('it states that records are in memory, not durable audit infrastructure', /server memory only|in memory/i.test(t));
    check('it labels the identity provider as development, not production authentication', t.includes('DEVELOPMENT IDENTITY, NOT PRODUCTION AUTHENTICATION'));
    await P.waitFor(`document.querySelectorAll('main button').length >= 4`, { what: 'sign-in choices' });
    const choices = await P.ev(`[...document.querySelectorAll('main button')].map((b) => b.textContent.trim())`);
    check('exactly the four development accounts are offered and no operator account', JSON.stringify(choices) === JSON.stringify(['dev-viewer', 'dev-requester', 'dev-requester-2', 'dev-approver'].map((x) => `Sign in as ${x}`)), JSON.stringify(choices));
    await a11yAudit(P, 'sign-in');
  });

  await step('02 requester signs in', async () => {
    await signIn(P, 'dev-requester');
    const c = (await P.send('Network.getCookies', { urls: [BASE] })).cookies.find((x) => x.name === 'w0_session');
    check('a session cookie exists and is HttpOnly, SameSite=Strict and Secure (production build)', c && c.httpOnly && c.sameSite === 'Strict' && c.secure, JSON.stringify(c));
    check('the page shows the DEVELOPMENT identity provider and the role', (await main(P)).includes('(requester)') && (await main(P)).includes('DEVELOPMENT'));
    check('document.cookie cannot read the session cookie (HttpOnly)', !(await P.ev('document.cookie')).includes('w0_session'));
  });

  await step('03 readiness dashboard', async () => {
    await tab(P, 'Readiness');
    await P.waitFor(`document.body.innerText.includes('Overall:')`);
    const t = await main(P);
    check('overall status is BLOCKED', /Overall:\s*\S*\s*BLOCKED/.test(t), t.slice(0, 300));
    check('it is labelled MOCK DATA and says a mock result never proves real readiness', t.includes('MOCK DATA') && t.includes('never proves real signer readiness'));
    check('all eight checks are listed', ['sdk_restored', 'baseline_matches_approved', 'approved_baseline_configured', 'deployment_config_present', 'deployment_config_pinned', 'state_present', 'key_file_present', 'rpc_reachable'].every((c) => t.includes(c)));
    check('no check is shown as PASS and nothing claims readiness', (await P.ev(`document.querySelectorAll('.w0-s-PASS').length`)) === 0 && !t.includes('READY_FOR'));
    check('FAIL, BLOCKED and UNKNOWN are distinguishable by text, not colour alone', ['FAIL', 'BLOCKED', 'UNKNOWN'].every((s) => t.includes(s)));
    await a11yAudit(P, 'readiness');
  });

  await step('04 preview request', async () => {
    await tab(P, 'Preview requests');
    await setValue(P, field('Operation', 'select'), 'mint-C');
    await P.click(btn('Request preview'));
    await P.waitFor(`document.querySelector('main table tbody tr')`, { what: 'a preview row' });
    await P.waitFor(`document.body.innerText.includes('MOCK preview only')`);
    const t = await main(P);
    check('the outcome OK is shown for mint-C, labelled MOCK, and says nothing was signed or submitted', t.includes('mint-C') && /\bOK\b/.test(t) && t.includes('Nothing was built, simulated, signed or submitted'));
    check('the notice says a preview is not an approval or an execution', t.includes('not an approval and not an execution'));
    await setValue(P, field('Operation', 'select'), 'deploy');
    await P.click(btn('Request preview'));
    await P.waitFor(`document.querySelectorAll('main table tbody tr').length === 2`);
    check('two preview rows exist after a second request', true);
    await a11yAudit(P, 'previews');
  });

  await step('05 approver: invalid then valid approval intent', async () => {
    await signOut(P);
    await signIn(P, 'dev-approver');
    await tab(P, 'Approval intents');
    await P.waitFor(`document.querySelectorAll('select option').length > 1`);
    const t0 = await main(P);
    check('the page says hashes are mock development values and an intent is evidence only', t0.includes('mock development values') && t0.includes('not execution authority'));
    check('record is disabled until a preview is chosen', await P.ev(`${btn('Record approval intent')}.disabled`));
    const optValue = await P.ev(`[...document.querySelectorAll('select option')].find((o) => o.textContent.includes('mint-C')).value`);
    await setValue(P, field('Request', 'select'), optValue);
    await setValue(P, field('Baseline hash', 'input'), 'abc');
    await setValue(P, field('Configuration SHA-256', 'input'), MOCK_CONFIG_SHA256);
    await P.click(btn('Record approval intent'));
    await P.waitFor(`document.querySelector('[role="alert"]')`);
    check('a malformed hash is rejected with a visible alert', /400/.test(await alertText(P)), await alertText(P));
    await setValue(P, field('Baseline hash', 'input'), 'e'.repeat(64));
    await P.click(btn('Record approval intent'));
    await P.waitFor(`document.querySelector('[role="alert"]')?.innerText.includes('baseline hash')`);
    check('a well-formed but wrong baseline hash is rejected', true);
    await setValue(P, field('Baseline hash', 'input'), MOCK_BASELINE_HASH);
    await setValue(P, field('Configuration SHA-256', 'input'), 'f'.repeat(64));
    await P.click(btn('Record approval intent'));
    await P.waitFor(`document.querySelector('[role="alert"]')?.innerText.includes('configuration hash')`);
    check('a wrong configuration hash is rejected', true);
    check('nothing has been recorded yet', (await P.ev(`document.querySelectorAll('main table tbody tr').length`)) === 0);
    await setValue(P, field('Configuration SHA-256', 'input'), MOCK_CONFIG_SHA256);
    await P.click(btn('Record approval intent'));
    await P.waitFor(`document.querySelector('main table tbody tr')`, { what: 'the recorded intent row' });
    const t = await main(P);
    check('a valid intent is recorded and described as evidence only, not an approved transaction', t.includes('recorded as evidence only') && t.includes('authorizes nothing'));
    check('the same preview cannot be approved twice', await (async () => { await P.click(btn('Record approval intent')); await P.waitFor(`document.querySelector('[role="alert"]')?.innerText.includes('409')`); return true; })());
    await a11yAudit(P, 'approvals');
  });

  await step('06 audit viewer', async () => {
    await tab(P, 'Audit events');
    await P.waitFor(`document.querySelectorAll('main table tbody tr').length > 0`);
    const t = await main(P);
    check('events for the request, the completion and the recorded intent are visible', ['preview_requested', 'preview_completed', 'approval_intent_recorded', 'approval_intent_rejected'].every((e) => t.includes(e)));
    check('the audit page says the events are mock, in memory and not durable', t.includes('not durable') && t.includes('MOCK'));
    await setValue(P, field('Type', 'input'), 'approval_intent_rejected');
    await P.click(btn('Filter'));
    await sleep(400);
    const rows = await P.ev(`[...document.querySelectorAll('main table tbody tr')].map((r) => r.children[1].innerText)`);
    check('filtering by type shows only that type', rows.length >= 3 && rows.every((r) => r === 'approval_intent_rejected'), JSON.stringify(rows));
    await P.click(`document.querySelector('main table tbody button')`);
    await P.waitFor(`document.querySelector('[aria-label="Event detail"] pre')`);
    const detail = await P.ev(`document.querySelector('[aria-label="Event detail"] pre').innerText`);
    check('inspecting an event shows its origin as mock and no secret or path', detail.includes('"origin": "mock"') && !/[A-Za-z]:\\|\/Users\/|S[A-Z2-7]{55}/.test(detail));
    await a11yAudit(P, 'audit');
  });

  await step('07 lower-privilege role is denied', async () => {
    await signOut(P);
    await signIn(P, 'dev-viewer');
    await tab(P, 'Preview requests');
    check('the request button is disabled for a viewer and the page says the server enforces this', (await P.ev(`${btn('Request preview')}.disabled`)) && (await main(P)).includes('The server enforces this independently'));
    const direct = await P.ev(`(async () => {
      const s = await (await fetch('/api/w0/session')).json();
      const h = { 'content-type': 'application/json', 'x-w0-csrf': s.csrf };
      const a = await fetch('/api/w0/previews', { method: 'POST', headers: h, body: JSON.stringify({ requestId: crypto.randomUUID(), operation: 'deploy' }) });
      const b = await fetch('/api/w0/approvals', { method: 'POST', headers: h, body: JSON.stringify({}) });
      const c = await fetch('/api/w0/previews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID(), operation: 'deploy' }) });
      const d = await fetch('/api/w0/execute', { method: 'POST', headers: h, body: '{}' });
      return [a.status, b.status, c.status, d.status];
    })()`);
    check('direct API calls bypassing the UI get 403 (role), 403 (role), 403 (no CSRF token) and 404 (no execute route)', JSON.stringify(direct) === '[403,403,403,404]', JSON.stringify(direct));
    await tab(P, 'Audit events');
    await P.waitFor(`document.querySelectorAll('main table tbody tr').length > 0`);
    check('the denials appear in the audit viewer as auth_denied', (await main(P)).includes('auth_denied'));
    await tab(P, 'Identity');
    check('the identity page states that the operator is not a web role', (await main(P)).includes('not a web role'));
  });

  await step('08 keyboard and focus', async () => {
    await P.navigate(`${BASE}/w0`);
    await P.waitFor(`document.querySelector('main')`);
    await P.ev(`document.body.focus()`);
    const seen = new Set();
    let outlineOk = true;
    for (let i = 0; i < 6; i++) {
      await pressTab(P);
      const s = await P.ev(`(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { id: e.tagName + ':' + (e.textContent || '').trim().slice(0, 30), ow: parseFloat(cs.outlineWidth), os: cs.outlineStyle }; })()`);
      if (s) { seen.add(s.id); if (!(s.ow >= 2 && s.os !== 'none')) outlineOk = false; }
    }
    check('Tab moves focus through distinct controls (the sign-in session expired with the navigation or stays signed in)', seen.size >= 3, JSON.stringify([...seen]));
    check('focused controls show a visible outline of at least 2px', outlineOk);
  });

  await step('09 narrow window', async () => {
    await P.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 1500, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    for (const t of ['Readiness', 'Preview requests', 'Approval intents', 'Audit events']) {
      if (await P.ev(`Boolean(${btn(t)})`)) { await tab(P, t); await a11yAudit(P, `${t} at 420px`); }
    }
    await P.screenshot(join(out, 'w0-420.png'));
  });

  await step('10 page health', async () => {
    check('no JavaScript exception or console error during the whole journey', P.errors.length === 0, P.errors.join('\n'));
  });
} finally {
  for (const p of pages) await p.close();
  if (browser) browser.child.kill();
  server.removeAllListeners('exit');
  server.kill();
  await sleep(500);
  rmSync(join(out, '.profile'), { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

const failed = results.filter((r) => !r.ok);
writeFileSync(join(out, 'w0-journey-results.json'), JSON.stringify({ browser: browser?.version, total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length} of ${results.length} checks passed${failed.length ? `; ${failed.length} FAILED` : ''}. Results: ${out}`);
process.exit(failed.length ? 1 : 0);
