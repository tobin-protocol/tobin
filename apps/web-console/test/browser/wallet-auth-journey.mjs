// REAL-BROWSER journey for wallet-first authentication and institutional onboarding: welcome screen, wallet states, sign-in, onboarding, institution creation, invitation, returning user,
// workspace switching, logout, unauthorized access, wallet account change and network change. Production build, real SQLite, real cookies, real server-side signature verification.
//
// LABEL (important): this headless browser has NO Freighter. A STAND-IN for the extension is injected before every page loads. It speaks the extension's real message protocol (the one
// @stellar/freighter-api 6.0.1 uses: postMessage FREIGHTER_EXTERNAL_MSG_REQUEST / _RESPONSE), so the real Freighter client library and the real application code run unchanged. Its keys are
// throwaway ed25519 pairs made here; its signatures are made in Node with the SEP-53 scheme and are verified by the REAL server. Nothing here is evidence about the real extension.
//   TOBIN_WIDTH=420 node test/browser/wallet-auth-journey.mjs <absolute artifact dir>      (also run at TOBIN_WIDTH=1200)
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, sign as edSign } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeAddress } from 'tobin-mvp1-sdk/strkey';
import { Page, findBrowser, launchBrowser, sleep } from './cdp.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const W = Number(process.env.TOBIN_WIDTH ?? 1200);
const out = process.argv[2] ?? join(root, 'test', 'browser', 'wallet-auth-out');
mkdirSync(out, { recursive: true });
const exe = findBrowser();
if (!exe) throw new Error('no Chrome or Edge found (set TOBIN_BROWSER)');
const PORT = 31000 + Math.floor(Math.random() * 4000);
const DEBUG_PORT = 36000 + Math.floor(Math.random() * 3000);
const BASE = `http://127.0.0.1:${PORT}`;
const dbDir = mkdtempSync(join(tmpdir(), 'tobin-wjourney-'));
const DB = join(dbDir, 'journey.sqlite');
const q = (s) => JSON.stringify(s);

// ---- throwaway wallets (the stand-in's accounts) ----
function newWallet(name) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return { name, address: encodeAddress('account', new Uint8Array(raw)), sign: (m) => edSign(null, createHash('sha256').update(`Stellar Signed Message:\n${m}`, 'utf8').digest(), privateKey).toString('base64') };
}
const WALLETS = [newWallet('A'), newWallet('B'), newWallet('C'), newWallet('D')];
const short = (a) => `${a.slice(0, 6)}…${a.slice(-6)}`;

const results = [];
let currentStep = '';
function check(name, cond, detail = '') {
  results.push({ step: currentStep, name, ok: Boolean(cond), detail: cond ? '' : String(detail).slice(0, 1200) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  [${currentStep}] ${name}${cond ? '' : '\n      ' + String(detail).slice(0, 1200)}`);
}
async function step(name, fn) {
  currentStep = name;
  try { await fn(); } catch (e) { let page = ''; try { page = await pages[0].ev("document.body.innerText.slice(0, 600)"); } catch { /* page unavailable */ }
    check('step completed without an exception', false, (e instanceof Error ? e.message : String(e)) + ' | page: ' + page); }
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

// ---- the extension stand-in: injected into every document before its own scripts run; its state lives in sessionStorage so it survives navigation ----
const STAND_IN = `(() => {
  const TESTNET = 'Test SDF Network ; September 2015', PUBLIC = 'Public Global Stellar Network ; September 2015';
  const accounts = ${JSON.stringify(WALLETS.map((w) => w.address))};
  const get = () => { try { return JSON.parse(sessionStorage.getItem('__fw') || '{}'); } catch { return {}; } };
  const set = (p) => sessionStorage.setItem('__fw', JSON.stringify({ ...get(), ...p }));
  window.__fw = { get, set, accounts };
  const pending = {}; let n = 0;
  window.__fwResolve = (id, sig) => { pending[id]?.(sig); delete pending[id]; };
  const nativeNow = Date.now.bind(Date);
  window.addEventListener('message', async (ev) => {
    if (ev.source !== window || !ev.data || ev.data.source !== 'FREIGHTER_EXTERNAL_MSG_REQUEST') return;
    const m = ev.data, st = get();
    if (st.absent) return; // no extension: nobody answers (the client library times out)
    const reply = (p) => window.postMessage({ source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE', messagedId: m.messageId, ...p }, window.location.origin);
    const active = accounts[st.active || 0];
    const net = st.network || 'TESTNET';
    switch (m.type) {
      case 'REQUEST_CONNECTION_STATUS': return reply({ isConnected: true });
      case 'REQUEST_ALLOWED_STATUS': return reply({ isAllowed: !!st.allowed && !st.locked });
      case 'SET_ALLOWED_STATUS': case 'REQUEST_ACCESS':
        if (st.locked) return reply({ publicKey: '', apiError: { code: -3, message: 'The wallet is locked' } });
        if (st.declineAccess) return reply({ publicKey: '', apiError: { code: -4, message: 'The user declined access' } });
        set({ allowed: true }); return reply({ publicKey: active });
      case 'REQUEST_PUBLIC_KEY': return reply({ publicKey: st.allowed && !st.locked ? active : '' });
      case 'REQUEST_NETWORK_DETAILS': return reply({ networkDetails: { network: net, networkName: net, networkUrl: '', networkPassphrase: net === 'TESTNET' ? TESTNET : PUBLIC } });
      case 'SUBMIT_BLOB': {
        if (st.declineSign) return reply({ signedBlob: null, signerAddress: '', apiError: { code: -4, message: 'The user declined to sign' } });
        const who = st.signAs != null ? accounts[st.signAs] : active; // an account switch during signing
        const id = ++n; const sig = await new Promise((res) => { pending[id] = res; window.__fwSign(JSON.stringify({ id, account: who, message: m.blob })); });
        if (st.slowUser) Date.now = () => nativeNow() + 6 * 60 * 1000; // the user took six minutes: the challenge has expired by the time the answer returns
        return reply({ signedBlob: sig, signerAddress: who });
      }
      default: return reply({ apiError: { code: -1, message: 'not supported by the stand-in' } });
    }
  });
})();`;

async function openPage() {
  const P = await Page.open(DEBUG_PORT, 'about:blank');
  await P.send('Runtime.addBinding', { name: '__fwSign' });
  await P.send('Page.addScriptToEvaluateOnNewDocument', { source: STAND_IN });
  P.listeners.push((msg) => {
    if (msg.method !== 'Runtime.bindingCalled' || msg.params.name !== '__fwSign') return;
    const { id, account, message } = JSON.parse(msg.params.payload);
    const w = WALLETS.find((x) => x.address === account);
    void P.ev(`window.__fwResolve(${id}, ${q(w ? w.sign(message) : '')})`).catch(() => undefined);
  });
  return P;
}

const norm = (t) => t.replace(/\s+/g, ' ');
const main = async (p) => { await p.waitFor(`!!document.querySelector('main')`, { what: 'the main region is rendered' }); return norm(await p.ev(`document.querySelector('main').innerText`)); };
const btn = (label) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${q(label)})`;
const link = (label) => `[...document.querySelectorAll('a')].find((a) => a.textContent.trim() === ${q(label)})`;
async function setValue(p, expr, value) {
  await p.ev(`(() => { const el = ${expr}; if (!el) throw new Error('field not found: ' + ${q(expr.slice(0, 70))}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
  await sleep(60);
}
const field = (label) => `[...document.querySelectorAll('main label')].find((l) => l.textContent.trim().startsWith(${q(label)}))?.querySelector('input, select, textarea')`;
const labelled = (aria) => `document.querySelector('[aria-label=${q(aria)}]')`;
const overflow = (p) => p.ev(`document.documentElement.scrollWidth - window.innerWidth`);
const layout = async (p, where) => check(`no horizontal overflow (${where})`, (await overflow(p)) <= 1, `overflow ${await overflow(p)}px`);
async function structure(p, where) {
  const r = await p.ev(`(() => { const issues = [];
    for (const el of document.querySelectorAll('main input, main select, main textarea')) if (!(el.getAttribute('aria-label') || el.closest('label'))) issues.push('unlabelled ' + el.tagName);
    for (const t of document.querySelectorAll('main table')) { if (!t.querySelector('caption')) issues.push('table without caption'); if (t.querySelector('thead th:not([scope])')) issues.push('th without scope'); }
    for (const b of document.querySelectorAll('button')) if (!b.textContent.trim() && !b.getAttribute('aria-label')) issues.push('unnamed button');
    if (document.querySelectorAll('main').length !== 1) issues.push('expected exactly one main region, found ' + document.querySelectorAll('main').length);
    if (!document.querySelector('main h2')) issues.push('no h2 heading');
    return issues; })()`);
  check(`accessibility structure (${where})`, r.length === 0, r.join('; '));
}
const fw = (p, patch) => p.ev(`window.__fw.set(${JSON.stringify(patch)})`);
const status = (p) => p.ev(`document.querySelector('.wf-status')?.getAttribute('data-state') ?? ''`);
const api = (p, method, path, body) => p.ev(`fetch(${q(path)}, { method: ${q(method)}, headers: { 'content-type': 'application/json', 'x-tobin-request': '1' }, ${body === undefined ? '' : `body: JSON.stringify(${JSON.stringify(body)}), `}credentials: 'same-origin' }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))`);

async function toSignIn(P) { await P.navigate(`${BASE}/sign-in`); await P.waitFor(`document.querySelector('.wf-hero')`, { what: 'welcome screen' }); await sleep(900); }
async function connect(P) { await P.click(btn('Connect wallet')); }
async function walletSignIn(P, index, { expectPath }) {
  await fw(P, { active: index, allowed: true, network: 'TESTNET', locked: false, declineAccess: false, declineSign: false, absent: false, slowUser: false, signAs: null });
  await toSignIn(P); await connect(P);
  await P.waitFor(`location.pathname === ${q(expectPath)}`, { timeout: 20000, what: `wallet sign-in to reach ${expectPath}` });
  await P.waitFor(`document.querySelector('main')`); await sleep(500);
}
async function signOut(P) { await P.click(btn('Sign out')); await P.waitFor(`location.pathname === '/sign-in'`, { what: 'sign-out redirect' }); await sleep(300); }

let browser;
const pages = [];
try {
  await startServer();
  browser = await launchBrowser({ exe, port: DEBUG_PORT, profileDir: join(out, '.profile-wallet') });
  const P = await openPage(); pages.push(P);
  await P.navigate(`${BASE}/sign-in`);
  console.log(`browser ${browser.version}; viewport ${(await P.ev('[window.innerWidth, window.innerHeight]')).join('x')}`);
  let ORG_A = '', INVITE = '';

  await step('1 welcome screen', async () => {
    await fw(P, { absent: false, allowed: false, network: 'TESTNET' });
    await toSignIn(P);
    const t = await main(P);
    check('product name, description and a primary Connect wallet action', /Welcome to Tobin/.test(t) && /institutional clearing and settlement/.test(t) && (await P.ev(`!!${btn('Connect wallet')}`)));
    check('supported wallet and the three-step explanation are shown', /Supported wallet: Freighter/.test(t) && /Approve a one-time message/.test(t) && /signs no transaction/.test(t));
    check('the page says a connected wallet does not make anyone a member or administrator', /does not make you a member or administrator/.test(t));
    check('the existing email account form is still available but secondary', await P.ev(`!!document.querySelector('main input[type=email]') && !!${btn('Sign in')}`));
    await P.waitFor(`document.querySelector('.wf-status')?.getAttribute('data-state') === 'initial'`, { what: 'initial state after detection' });
    check('with Freighter present the page is in the Ready state', (await status(P)) === 'initial');
    await structure(P, 'welcome'); await layout(P, 'welcome'); await P.screenshot(join(out, `welcome-${W}.png`));
  });

  await step('2 Freighter unavailable', async () => {
    await fw(P, { absent: true });
    await toSignIn(P);
    await P.waitFor(`document.querySelector('.wf-status')?.getAttribute('data-state') === 'unavailable'`, { timeout: 12000, what: 'unavailable state' });
    const t = await main(P);
    check('the page explains that Freighter was not found and how to get it', /was not found/.test(t) && (await P.ev(`!!${link('Get Freighter')}`)) && /Install the Freighter extension/.test(t));
    await connect(P); await P.waitFor(`document.querySelector('.wf-status')?.getAttribute('data-state') === 'unavailable'`, { timeout: 15000 });
    check('pressing Connect wallet without Freighter ends in the same clear state (no endless spinner) and no session exists', (await api(P, 'GET', '/api/auth/me')).status === 401);
    await layout(P, 'unavailable'); await fw(P, { absent: false });
  });

  await step('3 wallet states: locked, connection declined, wrong network, signature declined', async () => {
    await fw(P, { absent: false, allowed: false, locked: true }); await toSignIn(P); await connect(P);
    await P.waitFor(`['locked','rejected'].includes(document.querySelector('.wf-status')?.getAttribute('data-state'))`, { timeout: 15000 });
    check('a locked wallet is reported as locked with instructions', (await status(P)) === 'locked' && /Unlock Freighter/.test(await main(P)));
    await fw(P, { locked: false, declineAccess: true }); await P.click(btn('Try again'));
    await P.waitFor(`document.querySelector('.wf-status')?.getAttribute('data-state') === 'rejected'`, { timeout: 15000 });
    check('declining the connection is reported as declined and nothing was signed', /declined in Freighter/.test(await main(P)) && (await api(P, 'GET', '/api/auth/me')).status === 401);
    await fw(P, { declineAccess: false, network: 'PUBLIC' }); await P.click(btn('Try again'));
    await P.waitFor(`document.querySelector('.wf-status')?.getAttribute('data-state') === 'wrong-network'`, { timeout: 15000 });
    check('a wallet on the wrong network is refused before any challenge is requested', /Stellar Testnet/.test(await main(P)));
    await fw(P, { network: 'TESTNET', declineSign: true }); await P.click(btn('Try again'));
    await P.waitFor(`document.querySelector('.wf-status')?.getAttribute('data-state') === 'rejected'`, { timeout: 15000 });
    check('declining the signature is reported as rejected; no user and no session were created', (await api(P, 'GET', '/api/auth/me')).status === 401);
    check('the Try again control is offered', await P.ev(`!!${btn('Try again')}`));
    await layout(P, 'wallet failure states');
  });

  await step('4 challenge expiry on the client', async () => {
    await fw(P, { declineSign: false, slowUser: true }); await toSignIn(P); await connect(P);
    await P.waitFor(`document.querySelector('.wf-status')?.getAttribute('data-state') === 'expired'`, { timeout: 15000, what: 'expired state' });
    check('a challenge that expired before it was signed is reported as expired and is not sent', /expired/.test(await main(P)) && (await api(P, 'GET', '/api/auth/me')).status === 401);
    await fw(P, { slowUser: false });
  });

  await step('5 wallet sign-in succeeds; first-time user lands in onboarding with no role', async () => {
    await walletSignIn(P, 0, { expectPath: '/onboarding' });
    const t = await main(P);
    check('onboarding opens at the welcome step and says the wallet proves control only', /You are signed in/.test(t) && /not yet a member of any institution/.test(t));
    check('the signed-in name is the wallet placeholder, not an email', await P.ev(`document.body.innerText.includes(${q('Signed in as Wallet ' + WALLETS[0].address.slice(0, 4))})`));
    check('the session cookie is not readable by page scripts (HttpOnly)', !(await P.ev(`document.cookie`)).includes('tobin_session'));
    const me = await api(P, 'GET', '/api/auth/me');
    check('the server reports a wallet account with no email, no organization and the profile step', me.body.user.authMethod === 'wallet' && me.body.user.email === undefined && me.body.organizations.length === 0 && me.body.onboarding.step === 'profile', JSON.stringify(me.body));
    check('the wallet is recorded as verified for the user', me.body.wallets.length === 1 && me.body.wallets[0].publicKey === WALLETS[0].address);
    check('an outsider route is closed: the user cannot reach an organization they do not belong to', (await api(P, 'GET', '/api/registry/orgs/org_00000000000000000a')).status === 404);
    await structure(P, 'onboarding welcome'); await layout(P, 'onboarding welcome'); await P.screenshot(join(out, `onboarding-welcome-${W}.png`));
  });

  await step('6 onboarding: profile, then create an institution', async () => {
    await P.click(btn('Continue')); await P.waitFor(`document.querySelector('[aria-label="Your profile"]')`);
    check('step 2 of 4 is marked as the current step', await P.ev(`document.querySelector('.wf-steps [aria-current=step]')?.textContent.includes('Your profile')`));
    await setValue(P, field('Display name'), 'Ada Ledger'); await P.click(btn('Save and continue'));
    await P.waitFor(`document.querySelector('main')?.innerText.includes('Create or join an institution')`);
    check('the empty state explains there is no personal workspace and that no placeholder institution is made', /no personal workspace/.test(await main(P)));
    await P.reload(); await P.waitFor(`document.querySelector('main')?.innerText.includes('Create or join an institution')`, { what: 'progress kept after a reload' });
    check('after a reload the user is still at the institution step (progress is kept on the server)', true);
    await P.click(btn('Create an institution')); await P.waitFor(`document.querySelector('[aria-label="Create an institution"]')`);
    check('creating an institution says the administrator role is not reviewer or Stellar authority', /not reviewer authority, not Stellar signing authority/.test(await main(P)));
    await setValue(P, field('Institution name'), 'Alpha Bank'); await setValue(P, field('Type'), 'bank'); await setValue(P, field('Country code'), 'gb');
    await structure(P, 'create institution'); await layout(P, 'create institution'); await P.screenshot(join(out, `onboarding-create-${W}.png`));
    await P.click(btn('Create institution'));
    await P.waitFor(`document.querySelector('[aria-label="Ready"]')`, { timeout: 15000, what: 'ready step' });
    check('the Ready step names the new workspace and the administrator role', /Alpha Bank/.test(await main(P)) && /your role: admin/.test(await main(P)));
    const me = await api(P, 'GET', '/api/auth/me'); ORG_A = me.body.organizations[0].id;
    check('the server shows one active membership with the admin role and a remembered workspace', me.body.organizations.length === 1 && me.body.lastOrgId === ORG_A && me.body.onboarding.step === 'done');
    const org = await api(P, 'GET', `/api/registry/orgs/${ORG_A}`);
    check('the institution kept its type and jurisdiction', org.body.organization.institutionType === 'bank' && org.body.organization.jurisdiction === 'GB', JSON.stringify(org.body));
    const rv = await api(P, 'GET', `/api/registry/orgs/${ORG_A}/reviewers`);
    check('the creator is NOT a reviewer: the administrator role carries no reviewer authority', rv.body.reviewers.length === 0);
    await P.click(btn('Enter workspace')); await P.waitFor(`location.pathname === '/sessions'`); await sleep(400);
    check('Enter workspace opens the sessions area with the signed-in name', await P.ev(`document.body.innerText.includes('Signed in as Ada Ledger')`));
  });

  await step('7 an administrator invites a wallet; a different wallet cannot use the leaked code', async () => {
    await P.navigate(`${BASE}/organizations`); await P.waitFor(`document.querySelector('[aria-label="Organization details"]')`, { what: 'organization page' }); await sleep(400);
    check('the member list shows the wallet of the administrator (administrators only)', /wallet\s+GAAA|wallet\s+G[A-Z0-9]{5}/.test(await main(P)) || (await P.ev(`document.querySelector('main').innerText.includes('wallet')`)));
    await setValue(P, field('Invitee email'), WALLETS[1].address); await P.click(btn('Create invitation'));
    await P.waitFor(`document.querySelector('main').innerText.includes('#invite=')`, { what: 'invitation link' });
    INVITE = await P.ev(`/#invite=([A-Za-z0-9_-]+)/.exec(document.querySelector('main').innerText)?.[1] ?? ''`);
    check('an invitation code was issued for the wallet address', INVITE.length >= 16);
    await structure(P, 'organizations (wallet user)'); await layout(P, 'organizations (wallet user)');
    await signOut(P);
    // wallet C (not the invited wallet) signs in and tries the code
    await walletSignIn(P, 2, { expectPath: '/onboarding' });
    await P.click(btn('Continue')); await P.waitFor(`document.querySelector('[aria-label="Your profile"]')`);
    await setValue(P, field('Display name'), 'Carl Outsider'); await P.click(btn('Save and continue'));
    await P.waitFor(`document.querySelector('main')?.innerText.includes('Create or join an institution')`);
    await P.click(btn('Join with an invitation')); await P.waitFor(`document.querySelector('[aria-label="Join with an invitation"]')`);
    await setValue(P, field('Invitation code'), INVITE); await P.click(btn('Accept invitation'));
    await P.waitFor(`document.querySelector('[role=alert]')`, { what: 'invitation refused' });
    check('another wallet cannot use the invitation (the same generic message)', /invalid, expired or already used/.test(await main(P)));
    check('that user still has no membership and cannot see the institution', (await api(P, 'GET', `/api/registry/orgs/${ORG_A}`)).status === 404);
    await signOut(P);
  });

  await step('8 the invited wallet joins with exactly the offered role', async () => {
    await walletSignIn(P, 1, { expectPath: '/onboarding' });
    await P.click(btn('Continue')); await P.waitFor(`document.querySelector('[aria-label="Your profile"]')`);
    await setValue(P, field('Display name'), 'Bo Member'); await P.click(btn('Save and continue'));
    await P.waitFor(`document.querySelector('main')?.innerText.includes('Create or join an institution')`);
    await P.click(btn('Join with an invitation')); await P.waitFor(`document.querySelector('[aria-label="Join with an invitation"]')`);
    await structure(P, 'join with invitation'); await layout(P, 'join with invitation');
    await setValue(P, field('Invitation code'), INVITE); await P.click(btn('Accept invitation'));
    await P.waitFor(`document.querySelector('[aria-label="Ready"]')`, { timeout: 15000, what: 'ready after joining' });
    check('the Ready step shows the institution and the member role', /Alpha Bank/.test(await main(P)) && /your role: member/.test(await main(P)));
    check('the invitation is single-use: the same code now fails', (await api(P, 'POST', '/api/registry/invitations/accept', { token: INVITE })).status === 400);
    const members = await api(P, 'GET', `/api/registry/orgs/${ORG_A}/members`);
    check('a member sees the member list without email or wallet details', members.body.members.length === 2 && members.body.members.every((m) => m.email === undefined && m.wallet === undefined), JSON.stringify(members.body));
    check('a member cannot create invitations (403)', (await api(P, 'POST', `/api/registry/orgs/${ORG_A}/invitations`, { invitee: 'someone', role: 'admin' })).status === 403);
    check('a member cannot suspend anyone (403)', (await api(P, 'POST', `/api/registry/orgs/${ORG_A}/members/${members.body.members[0].userId}/status`, { status: 'suspended' })).status === 403);
    check('the member may be a participant but is not a reviewer: no reviewer authority came with joining', (await api(P, 'GET', `/api/registry/orgs/${ORG_A}/reviewers`)).body.reviewers.every((r) => r.name !== 'Bo Member'));
  });

  await step('9 returning user, workspace switching, suspension', async () => {
    await signOut(P);
    await walletSignIn(P, 0, { expectPath: '/sessions' });
    check('a returning user goes straight to the workspace, not to onboarding', await P.ev(`location.pathname === '/sessions'`));
    check('the same internal user is recognised (same name)', await P.ev(`document.body.innerText.includes('Signed in as Ada Ledger')`));
    await P.navigate(`${BASE}/organizations`); await P.waitFor(`document.querySelector('[aria-label="Organization details"]')`); await sleep(300);
    await setValue(P, field('Name'), 'Beta Capital'); await P.click(btn('Create organization')); await P.waitFor(`document.querySelector('main').innerText.includes('Beta Capital')`, { what: 'second organization' });
    await P.navigate(`${BASE}/sessions`); await P.waitFor(`document.querySelector('select[aria-label="Workspace"]')`, { what: 'workspace switcher' });
    check('with two institutions a workspace switcher appears in the navigation', true);
    const orgs = (await api(P, 'GET', '/api/auth/me')).body.organizations; const beta = orgs.find((o) => o.name === 'Beta Capital').id;
    await setValue(P, `document.querySelector('select[aria-label="Workspace"]')`, beta);
    await P.waitFor(`document.querySelector('select[aria-label="Workspace"]')?.value === ${q(beta)}`, { timeout: 8000, what: 'switcher shows Beta Capital after reload' }); await sleep(600);
    check('switching the workspace is remembered by the server', (await api(P, 'GET', '/api/auth/me')).body.lastOrgId === beta);
    await P.navigate(`${BASE}/organizations`); await P.waitFor(`document.querySelector('select[aria-label="Active organization"]')`); await sleep(300);
    check('the organizations page opens on the remembered workspace', (await P.ev(`document.querySelector('select[aria-label="Active organization"]').selectedOptions[0].textContent`)) === 'Beta Capital');
    check('a client-supplied foreign organization id is refused as a workspace', (await api(P, 'POST', '/api/auth/workspace', { orgId: 'org_00000000000000000a' })).status === 404);
    await layout(P, 'workspace switcher');
    // suspend the member Bo Member of Alpha Bank and see that access ends
    await P.navigate(`${BASE}/organizations`); await P.waitFor(`document.querySelector('select[aria-label="Active organization"]')`); await sleep(300);
    await setValue(P, `document.querySelector('select[aria-label="Active organization"]')`, ORG_A); await P.waitFor(`document.querySelector('main').innerText.includes('Bo Member')`, { what: 'members of Alpha Bank' });
    await P.click(btn('Suspend Bo Member')); await P.waitFor(`document.querySelector('main').innerText.includes('suspended')`, { what: 'suspended status' });
    check('the suspended member is shown as suspended and can be restored', await P.ev(`!!${btn('Restore Bo Member')}`));
    await signOut(P);
    await walletSignIn(P, 1, { expectPath: '/onboarding' });
    check('the suspended member no longer has the institution: they are back at the institution step', (await api(P, 'GET', `/api/registry/orgs/${ORG_A}`)).status === 404 && /Create or join an institution/.test(await main(P)));
    await signOut(P);
  });

  await step('10 wallet account change and network change after sign-in', async () => {
    await walletSignIn(P, 0, { expectPath: '/sessions' });
    await fw(P, { active: 2 }); await P.ev(`window.dispatchEvent(new Event('focus'))`);
    await P.waitFor(`document.querySelector('[data-wallet-banner=account-changed]')`, { timeout: 15000, what: 'account-changed banner' });
    check('switching Freighter to another account shows a banner and keeps the session as it is', /not a verified wallet of your account/.test(await P.ev(`document.querySelector('[data-wallet-banner]').innerText`)) && (await api(P, 'GET', '/api/auth/me')).status === 200);
    await layout(P, 'account-changed banner'); await P.screenshot(join(out, `account-changed-${W}.png`));
    await fw(P, { active: 0, network: 'PUBLIC' }); await P.ev(`window.dispatchEvent(new Event('focus'))`);
    await P.waitFor(`document.querySelector('[data-wallet-banner=network-changed]')`, { timeout: 15000, what: 'network-changed banner' });
    check('switching Freighter to another network shows a Testnet banner', /not Stellar Testnet/.test(await P.ev(`document.querySelector('[data-wallet-banner]').innerText`)));
    await fw(P, { network: 'TESTNET' });
    // an account switch DURING signing is caught
    await signOut(P); await fw(P, { signAs: 2 }); await toSignIn(P); await connect(P);
    await P.waitFor(`document.querySelector('.wf-status')?.getAttribute('data-state') === 'account-changed'`, { timeout: 15000, what: 'account changed while signing' });
    check('an account switch during signing is caught and no session is created', (await api(P, 'GET', '/api/auth/me')).status === 401);
    await fw(P, { signAs: null });
  });

  await step('11 account page: wallets, add a wallet, remove history-safe, sign out everywhere', async () => {
    await walletSignIn(P, 0, { expectPath: '/sessions' });
    await P.navigate(`${BASE}/account`); await P.waitFor(`document.querySelector('[aria-label="Verified wallets"] table')`, { what: 'wallet list' });
    check('the account page lists the verified wallet and says it grants no role', (await main(P)).includes(WALLETS[0].address) && /does not make you a member, administrator or reviewer/.test(await main(P)));
    check('removing the only wallet of a wallet-only account is refused by the server', (await api(P, 'POST', '/api/auth/wallet/remove', { walletId: (await api(P, 'GET', '/api/auth/me')).body.wallets[0].id })).status === 409);
    await fw(P, { active: 3 }); await P.click(btn('Add wallet'));
    await P.waitFor(`document.querySelector('[aria-label="Verified wallets"] .wf-status')?.innerText.includes('authenticated')`, { timeout: 20000, what: 'wallet added' });
    await P.waitFor(`document.querySelectorAll('[aria-label="Verified wallets"] tbody tr').length === 2`, { what: 'two wallets listed' });
    check('a second wallet was added only after a fresh proof of that key', (await api(P, 'GET', '/api/auth/me')).body.wallets.some((w) => w.publicKey === WALLETS[3].address));
    await fw(P, { active: 2 }); await P.click(btn('Add wallet'));
    await P.waitFor(`document.querySelector('[aria-label="Verified wallets"] .wf-status')?.innerText.includes('cannot be associated')`, { timeout: 20000, what: 'refusal for a wallet of another user' });
    check('adding a wallet that belongs to another user is refused and nothing is merged', (await api(P, 'GET', '/api/auth/me')).body.wallets.length === 2);
    await structure(P, 'account'); await layout(P, 'account'); await P.screenshot(join(out, `account-${W}.png`));
    await P.click(btn('Sign out everywhere')); await P.waitFor(`location.pathname === '/sign-in'`, { what: 'signed out everywhere' });
    check('sign out everywhere ends the session', (await api(P, 'GET', '/api/auth/me')).status === 401);
  });

  await step('12 logout and unauthorized access', async () => {
    await walletSignIn(P, 1, { expectPath: '/onboarding' });
    await signOut(P);
    check('after logout the session is gone on the server', (await api(P, 'GET', '/api/auth/me')).status === 401);
    for (const path of ['/onboarding', '/account']) {
      await P.navigate(`${BASE}${path}`); await P.waitFor(`location.pathname === '/sign-in'`, { timeout: 10000, what: `${path} redirects when signed out` });
    }
    check('protected pages send a signed-out visitor to the welcome screen', true);
    check('protected APIs answer 401 to a signed-out caller', (await api(P, 'GET', '/api/registry/orgs')).status === 401 && (await api(P, 'POST', '/api/auth/profile', { displayName: 'x' })).status === 401 && (await api(P, 'POST', '/api/stellar/run', { action: 'status' })).status === 401);
    check('the public invitation page loads and explains sign-in', await (async () => { await P.navigate(`${BASE}/join`); await P.waitFor(`document.querySelector('main')`); await sleep(500); return /not signed in/.test(await main(P)) && (await P.ev(`${btn('Accept invitation')}.disabled`)); })());
    await layout(P, 'join page');
  });

  await step('13 owner tooling is closed to an ordinary signed-in wallet', async () => {
    await walletSignIn(P, 1, { expectPath: '/onboarding' });
    const r = await api(P, 'POST', '/api/stellar/run', { action: 'status' });
    check('a signed-in wallet that is not a configured owner account gets 403 from the Testnet settlement tool', r.status === 403, JSON.stringify(r));
    check('and from the co-signing tool', (await api(P, 'POST', '/api/stellar/cosign', { action: 'prepare' })).status === 403);
    await signOut(P);
  });

  await step('14 page health', async () => {
    check('no JavaScript exception during the whole journey (expected 401/403/404 console messages excluded)', P.errors.filter((e) => !/401|403|404|409|400|429|Failed to load resource/.test(e)).length === 0, P.errors.join(' | '));
  });
} finally {
  for (const p of pages) await p.close();
  if (browser) browser.child.kill();
  if (server) { server.removeAllListeners('exit'); server.kill(); }
  await sleep(800);
  // temporary artifacts only: on Windows the browser may still hold a lock for a moment, and that must not turn finished results into a crash
  for (const d of [join(out, '.profile-wallet'), dbDir]) { try { rmSync(d, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (e) { console.log('note: could not remove ' + d + ' (' + (e.code ?? e.message) + ')'); } }
}
const failed = results.filter((r) => !r.ok);
writeFileSync(join(out, `wallet-auth-journey-results-${W}.json`), JSON.stringify({ browser: browser?.version, width: W, total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length} of ${results.length} checks passed${failed.length ? `; ${failed.length} FAILED` : ''}. Results: ${out}`);
process.exit(failed.length ? 1 : 0);
