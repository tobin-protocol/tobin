// REAL-BROWSER journey for the Tobin Console, driven over the Chrome DevTools Protocol against the real Rust contracts (through the local bridge).
// Not part of `node --test`: it needs an installed Chrome or Edge, the compiled page (console/dist) and the Rust bridge.
//
//   export TOBIN_BRIDGE_EXE=<target>/debug/examples/bridge.exe
//   <tsc> -p console/tsconfig.json                       # build the page
//   node test/browser/journey.mjs [screenshot dir]       # prints one line per check and a summary; exit code 1 on any failure
//
// Everything is local: the Console server and the browser debugging port are bound to 127.0.0.1, the bridge is a child process (pipes), and no
// Stellar network, wallet or signature is involved.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Page, findBrowser, launchBrowser, sleep } from './cdp.mjs';
import { sessionIdFromLabel } from '../../console/controller.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const shots = process.argv[2] ?? join(root, 'test', 'browser', 'shots');
mkdirSync(shots, { recursive: true });
const BRIDGE = process.env.TOBIN_BRIDGE_EXE;
if (!BRIDGE) throw new Error('set TOBIN_BRIDGE_EXE');
const exe = findBrowser();
if (!exe) throw new Error('no Chrome or Edge found (set TOBIN_BROWSER)');

const PORT = 21000 + Math.floor(Math.random() * 5000);
const DEBUG_PORT = 26000 + Math.floor(Math.random() * 3000);
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
let currentStep = '';

function check(name, cond, detail = '') {
  results.push({ step: currentStep, name, ok: Boolean(cond), detail: cond ? '' : String(detail).slice(0, 400) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  [${currentStep}] ${name}${cond ? '' : '\n      ' + String(detail).slice(0, 400)}`);
}
async function step(name, fn) {
  currentStep = name;
  try {
    await fn();
  } catch (e) {
    check('step completed without an exception', false, e instanceof Error ? e.message : String(e));
  }
}

// ---- the local server (restartable, to prove the sandbox is not persistent) ----
let server;
async function startServer() {
  server = spawn(process.execPath, [join(root, 'console', 'server.mjs')], { env: { ...process.env, PORT: String(PORT), TOBIN_BRIDGE_EXE: BRIDGE }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 20000);
    server.stdout.on('data', (d) => {
      if (String(d).includes('127.0.0.1')) {
        clearTimeout(t);
        resolve();
      }
    });
    server.on('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
}
async function stopServer() {
  server.removeAllListeners('exit');
  server.kill();
  await sleep(500);
}
const rpc = async (call) => (await fetch(`${BASE}/api/rpc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ call, authorize: null }) })).json();

// ---- page helpers ----
const text = (p) => p.ev(`document.querySelector('main').innerText`);
const logCount = (p) => p.ev(`document.querySelectorAll('ol.log li').length`);
const q = (s) => JSON.stringify(s);

async function fill(p, formSel, fields) {
  await p.ev(`(() => { const f = document.querySelector(${q(formSel)}); if (!f) throw new Error('no form ' + ${q(formSel)}); for (const [k, v] of Object.entries(${JSON.stringify(fields)})) { const el = f.elements[k]; if (!el) throw new Error('no field ' + k); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
}
const clickIn = (p, formSel) => p.click(`document.querySelector(${q(formSel)} + ' button') || document.querySelector(${q(formSel)}).querySelector('button')`);

async function submitForm(p, formSel, fields = {}) {
  await fill(p, formSel, fields);
  await p.click(`document.querySelector(${q(formSel)}).querySelector('button')`);
  await sleep(200);
}

/** After a form that prepares an action: the pending panel is shown; optionally withhold some authorizations; then send. */
async function send(p, { withhold = [], expect = 'success' } = {}) {
  await p.waitFor(`document.querySelector('section.pending')`, { what: 'the pending panel' });
  for (const name of withhold) {
    await p.click(`[...document.querySelectorAll('section.pending input[data-grant]')].find((i) => i.closest('label').innerText.trim().startsWith(${q(name + ' authorizes')}))`);
  }
  const before = await logCount(p);
  await p.click(`document.querySelector('button[data-action="confirm"]')`);
  await p.waitFor(`document.querySelectorAll('ol.log li').length > ${before}`, { what: 'a new log entry' });
  await sleep(150);
  const last = await p.ev(`document.querySelector('ol.log li').className + '|' + document.querySelector('ol.log li').innerText`);
  const ok = last.startsWith('ok|');
  if (expect === 'success') check('the contract accepted the call', ok, last);
  else check('the contract rejected the call and the page says so', !ok && /REJECTED by the contract/.test(last), last);
  return last;
}

const inputErr = (p) => p.ev(`(() => { const e = document.getElementById('error'); return e.hidden ? '' : e.textContent; })()`);
async function shot(p, name) {
  // no horizontal overflow of the page itself at this viewport (wide tables scroll inside their own box)
  const o = await p.ev(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
  const saved = currentStep;
  check(`no horizontal page overflow at ${name} (scrollWidth ${o.sw} <= viewport ${o.cw})`, o.sw <= o.cw, JSON.stringify(o));
  currentStep = saved;
  await p.screenshot(join(shots, `${name}.png`));
}

// =====================================================================================================================================
let browser;
const pages = [];
try {
  await startServer();
  browser = await launchBrowser({ exe, port: DEBUG_PORT, profileDir: join(shots, '.profile') });
  const A = await Page.open(DEBUG_PORT);
  pages.push(A);
  const SID = sessionIdFromLabel('browser-1');
  let boot;
  let digest1 = '';

  await step('0 load', async () => {
    check('browser identified', true, browser.version);
    await A.navigate(`${BASE}/`);
    await A.waitFor(`document.querySelector('form[data-action="select"]')`, { what: 'the page to render' });
    boot = await (await fetch(`${BASE}/api/bootstrap`)).json();
    const t = await text(A);
    const html = await A.ev(`document.querySelector('.banner').innerText`);
    check('the page title names the local sandbox', (await A.ev(`document.title`)).includes('local sandbox'));
    check('the banner says LOCAL SANDBOX, no network, no wallet, simulated authorizations', /LOCAL SANDBOX/.test(html) && /no network, no wallet/.test(html) && /simulated local grants/.test(html), html);
    check('the banner says nothing is saved and state lives in the server process memory', /not saved anywhere/.test(html) && /memory of the local server process/.test(html), html);
    check('five accounts and two capped tokens are shown', /Alice/.test(t) && /Erin/.test(t) && /TTT-A balance/.test(t) && /TTT-B balance/.test(t), t.slice(0, 300));
    await shot(A, '01-loaded');
  });

  await step('1 mint + create session with a selected token', async () => {
    await submitForm(A, 'form[data-action="mint"]', { to: 'Alice', token: 'TTT-B', amount: '10' });
    await send(A);
    check('Alice now holds 10 TTT-B', /Alice\s+\S+\s+0\s+10/.test(await text(A)), (await text(A)).slice(0, 400));
    await submitForm(A, 'form[data-action="select"]', { label: 'browser-1' });
    await A.waitFor(`document.body.innerText.includes('No session "browser-1" exists yet')`);
    check('an unknown session is reported as not existing (not as an empty open one)', true);
    await submitForm(A, 'form[data-action="create"]', { creator: 'Alice', token: 'TTT-B', maxParticipants: '4', maxObligations: '16' });
    await send(A);
    await A.waitFor(`document.querySelector('.state')`);
    const t = await text(A);
    check('the session is OPEN with the selected token TTT-B and the creator Alice', /OPEN/.test(t) && /token TTT-B \(fixed\)/.test(t) && /creator Alice/.test(t), t.slice(0, 500));
    await shot(A, '02-created');
  });

  await step('2 join needs the joiner AND the creator', async () => {
    await submitForm(A, 'form[data-action="join"]', { participant: 'Bob' });
    await A.waitFor(`document.querySelector('section.pending')`);
    const grants = await A.ev(`[...document.querySelectorAll('section.pending input[data-grant]')].map((i) => i.closest('label').innerText.trim())`);
    check('exactly two authorizations are required: Bob and Alice (the creator)', grants.length === 2 && grants.some((g) => g.startsWith('Bob authorizes')) && grants.some((g) => g.startsWith('Alice authorizes')), JSON.stringify(grants));
    await send(A, { withhold: ['Alice'], expect: 'rejected' });
    check('Bob was NOT admitted when the creator\'s authorization was withheld', /Alice \(1 of 4 allowed\)|participants: Alice \(1 of 4/.test(await text(A)), (await text(A)).slice(0, 600));
    await shot(A, '03-join-rejected');
    await A.click(`document.querySelector('button[data-action="cancel"]')`);
    for (const who of ['Bob', 'Carol', 'Dave']) {
      await submitForm(A, 'form[data-action="join"]', { participant: who });
      await send(A);
    }
    check('all four participants are admitted', /participants: Alice, Bob, Carol, Dave \(4 of 4 allowed\)/.test(await text(A)), (await text(A)).slice(0, 600));
  });

  await step('3 obligations, input checks and net positions', async () => {
    for (const bad of ['0', '-5', '1.5', '1e3', 'abc', '']) {
      await submitForm(A, 'form[data-action="obligation"]', { debtor: 'Alice', creditor: 'Carol', amount: bad });
      const err = await inputErr(A);
      const pending = await A.ev(`Boolean(document.querySelector('section.pending'))`);
      check(`amount ${JSON.stringify(bad)} is refused with a message and nothing is prepared`, err.length > 0 && !pending, `error=${JSON.stringify(err)} pending=${pending}`);
    }
    await submitForm(A, 'form[data-action="obligation"]', { debtor: 'Alice', creditor: 'Alice', amount: '5' });
    check('debtor = creditor is refused before sending', /cannot owe itself/.test(await inputErr(A)), await inputErr(A));
    await submitForm(A, 'form[data-action="obligation"]', { debtor: 'Alice', creditor: 'Carol', amount: '10' });
    await send(A);
    await submitForm(A, 'form[data-action="obligation"]', { debtor: 'Bob', creditor: 'Dave', amount: '10' });
    await send(A);
    const t = await text(A);
    check('net positions are outgoing minus incoming: Alice +10 and Bob +10 debtors, Carol -10 and Dave -10 creditors', /Alice\s+10\s+net debtor/.test(t) && /Bob\s+10\s+net debtor/.test(t) && /Carol\s+-10\s+net creditor/.test(t) && /Dave\s+-10\s+net creditor/.test(t), t.slice(t.indexOf('Net positions'), t.indexOf('Net positions') + 400));
    // a capacity the form could mangle
    await shot(A, '04-obligations');
  });

  await step('4 finalize', async () => {
    await submitForm(A, 'form[data-action="finalize"]', { caller: 'Dave' });
    await send(A);
    await A.waitFor(`document.body.innerText.includes('COMMITTED')`);
    const t = await text(A);
    check('COMMITTED: obligations are frozen, joining and obligation forms are gone', /COMMITTED/.test(t) && !(await A.ev(`Boolean(document.querySelector('form[data-action="join"]'))`)) && !(await A.ev(`Boolean(document.querySelector('form[data-action="obligation"]'))`)));
    check('the page has no settlement possibility yet and says Not settled', /Not settled\./.test(t) && /does not complete by itself/.test(t));
  });

  await step('5 default proposal', async () => {
    await submitForm(A, 'form[data-action="useDefault"]', {});
    await A.waitFor(`document.querySelector('textarea[name="plan"]').value.length > 0`);
    const plan = await A.ev(`document.querySelector('textarea[name="plan"]').value`);
    check('the default plan is Alice -> Carol : 10 and Bob -> Dave : 10', plan === 'Alice -> Carol : 10\nBob -> Dave : 10', plan);
    check('the advisory check passes and says the contract decides', /passes the published rules/.test(await text(A)) && /The contract decides\./.test(await text(A)));
    await submitForm(A, 'form[data-action="propose"]', { proposer: 'Bob' });
    await send(A);
    await A.waitFor(`document.body.innerText.includes('Current proposal: revision 1')`);
    const shown = await A.ev(`document.querySelector('code').title`);
    const onContract = (await rpc({ contract: boot.clearing, fn: 'get_proposal', args: [{ t: 'bytes32', v: SID }], auths: [] })).value;
    check('the digest shown on the page equals the contract\'s current proposal digest', shown === onContract.digest, `${shown} vs ${onContract.digest}`);
    digest1 = shown;
    check('the page says the proposal is identical to the default', /identical to the default plan/.test(await text(A)));
    check('the page confirms the digests recomputed in the page equal the contract\'s', /the digests recomputed in this page equal the ones the contract reports/.test(await text(A)));
    await shot(A, '05-proposal');
  });

  await step('6 two approvals, then an alternative valid proposal replaces it', async () => {
    for (const who of ['Alice', 'Bob']) {
      await A.click(`document.querySelector('form[data-action="approve"]:has(input[value="${who}"]) button')`);
      await send(A);
    }
    let t = await text(A);
    check('Alice and Bob are shown as approved', /Alice\s+yes/.test(t) && /Bob\s+yes/.test(t) && /Missing approvals: Carol, Dave/.test(t), t.slice(t.indexOf('Approvals'), t.indexOf('Approvals') + 400));
    await fill(A, 'form[data-action="setDraft"]', { plan: 'Alice -> Dave : 10\nBob -> Carol : 10' });
    await A.click(`document.querySelector('form[data-action="setDraft"] button')`);
    await A.waitFor(`document.body.innerText.includes('Advisory check of the draft')`);
    check('the alternative plan passes the advisory check (a different valid plan)', /passes the published rules/.test(await text(A)));
    await submitForm(A, 'form[data-action="propose"]', { proposer: 'Dave' });
    await A.waitFor(`document.querySelector('section.pending')`);
    check('before sending, the page warns that the replacement will invalidate 2 existing approvals', /will invalidate 2 existing approvals/.test(await text(A)), await text(A));
    await send(A);
    await A.waitFor(`document.body.innerText.includes('Proposal replaced')`);
    t = await text(A);
    check('after sending: "Proposal replaced (revision 1 to 2). 2 earlier approvals were invalidated"', /Proposal replaced \(revision 1 to 2\)\. 2 earlier approvals were invalidated/.test(t), t.slice(t.indexOf('Settlement proposal'), t.indexOf('Settlement proposal') + 500));
    check('every approval row now says "not yet" and everybody is missing', !/Alice\s+yes/.test(t) && !/Bob\s+yes/.test(t) && /Missing approvals: Alice, Bob, Carol, Dave/.test(t));
    const now = (await rpc({ contract: boot.clearing, fn: 'get_proposal', args: [{ t: 'bytes32', v: SID }], auths: [] })).value;
    const approvals = (await rpc({ contract: boot.clearing, fn: 'get_approvals', args: [{ t: 'bytes32', v: SID }], auths: [] })).value;
    check('the contract agrees: revision 2, a new digest shown on the page, no approvals stored', now.revision === 2 && (await A.ev(`document.querySelector('code').title`)) === now.digest && approvals.length === 0, JSON.stringify({ now, approvals }));
    check('the page says the new proposal differs from the default but is acceptable to the contract', /differs from the default plan; any valid plan is acceptable to the contract/.test(t));
    await shot(A, '06-replaced');
  });

  await step('7 an invalid proposal is rejected and leaves the proposal and approvals unchanged', async () => {
    await A.click(`document.querySelector('form[data-action="approve"]:has(input[value="Carol"]) button')`);
    await send(A);
    const digestBefore = await A.ev(`document.querySelector('code').title`);
    await fill(A, 'form[data-action="setDraft"]', { plan: 'Alice -> Dave : 9\nBob -> Carol : 10' });
    await A.click(`document.querySelector('form[data-action="setDraft"] button')`);
    await A.waitFor(`document.body.innerText.includes('would be rejected')`);
    check('the advisory check warns FlowMismatch before sending', /would be rejected \(FlowMismatch\)/.test(await text(A)));
    await submitForm(A, 'form[data-action="propose"]', { proposer: 'Alice' });
    const last = await send(A, { expect: 'rejected' });
    check('the log names the contract error FlowMismatch', /FlowMismatch/.test(last), last);
    const digestAfter = await A.ev(`document.querySelector('code').title`);
    const t = await text(A);
    check('the proposal (revision 2, same digest) and Carol\'s approval are unchanged', digestAfter === digestBefore && /Current proposal: revision 2/.test(t) && /Carol\s+yes/.test(t), t.slice(t.indexOf('Approvals'), t.indexOf('Approvals') + 300));
    await A.click(`document.querySelector('button[data-action="cancel"]')`);
    await shot(A, '07-invalid-rejected');
  });

  await step('7b A then B then A again: the old approval never appears valid (EQ-05)', async () => {
    // state here: revision 2 = plan B, Carol approved. Re-propose plan A (identical to revision 1) as revision 3.
    await fill(A, 'form[data-action="setDraft"]', { plan: 'Alice -> Carol : 10\nBob -> Dave : 10' });
    await A.click(`document.querySelector('form[data-action="setDraft"] button')`);
    await A.waitFor(`document.body.innerText.includes('Advisory check of the draft')`);
    check('the draft shows the digest it would have as revision 3', /Digest it would have as revision 3/.test(await text(A)), await text(A));
    await submitForm(A, 'form[data-action="propose"]', { proposer: 'Alice' });
    await A.waitFor(`document.querySelector('section.pending')`);
    check('the warning says 1 existing approval (Carol) will be invalidated', /will invalidate 1 existing approval\./.test(await text(A)));
    await send(A);
    await A.waitFor(`document.body.innerText.includes('Current proposal: revision 3')`);
    const t = await text(A);
    const shown3 = await A.ev(`document.querySelector('code').title`);
    check('the page shows revision 3 and the heading of the approvals names revision 3', /Approvals of the current proposal \(revision 3, digest /.test(t));
    check('plan A again has a different digest from revision 1 (the revision is bound in)', shown3 !== digest1 && shown3.length === 64, shown3 + ' vs ' + digest1);
    check('nobody is shown as approved (the old approvals are not valid at revision 3)', !/Carol\s+yes/.test(t) && /Missing approvals: Alice, Bob, Carol, Dave/.test(t), t.slice(t.indexOf('Approvals of'), t.indexOf('Approvals of') + 350));
    // a revision-1 approval, sent straight to the contract, is refused
    const stale = await rpc({ contract: boot.clearing, fn: 'approve_settlement', args: [{ t: 'bytes32', v: SID }, { t: 'addr', v: boot.personas[0].address }, { t: 'bytes32', v: digest1 }], auths: [] });
    check('an approval signed for the revision-1 digest is refused by the contract (an authorization or DigestMismatch error, never accepted)', stale.ok === false, JSON.stringify(stale));
    const approvals = (await rpc({ contract: boot.clearing, fn: 'get_approvals', args: [{ t: 'bytes32', v: SID }], auths: [] })).value;
    check('the contract stored no approval', approvals.length === 0, JSON.stringify(approvals));
    await shot(A, '07b-aba');
    // restore the state the following steps expect: plan B (revision 4) with Carol's approval
    await fill(A, 'form[data-action="setDraft"]', { plan: 'Alice -> Dave : 10\nBob -> Carol : 10' });
    await A.click(`document.querySelector('form[data-action="setDraft"] button')`);
    await A.waitFor(`document.body.innerText.includes('Advisory check of the draft')`);
    await submitForm(A, 'form[data-action="propose"]', { proposer: 'Dave' });
    await send(A);
    await A.waitFor(`document.body.innerText.includes('Current proposal: revision 4')`);
    check('re-proposing yet another plan advances the revision to 4', true);
    await A.click(`document.querySelector('form[data-action="approve"]:has(input[value="Carol"]) button')`);
    await send(A);
  });

  await step('8 missing approvals prevent settlement', async () => {
    const t = await text(A);
    check('with 1 of 4 approvals there is no settle button and the page explains why', !(await A.ev(`Boolean(document.querySelector('form[data-action="settle"]'))`)) && /Settlement is not possible until every admitted participant has approved/.test(t) && /Missing approvals: Alice, Bob, Dave/.test(t));
    check('the page still says Not settled', /Not settled\./.test(t));
    // the contract refuses even if asked directly
    const refused = await rpc({ contract: boot.clearing, fn: 'settle', args: [{ t: 'bytes32', v: SID }, { t: 'bytes32', v: (await rpc({ contract: boot.clearing, fn: 'get_proposal', args: [{ t: 'bytes32', v: SID }], auths: [] })).value.digest }], auths: [] });
    check('asked directly, the contract refuses with MissingApproval (#6)', refused.ok === false && refused.errorType === 'Contract' && refused.code === 6, JSON.stringify(refused));
  });

  await step('9 all approvals; debtor authorizations are shown accurately', async () => {
    for (const who of ['Alice', 'Bob', 'Dave']) {
      await A.click(`document.querySelector('form[data-action="approve"]:has(input[value="${who}"]) button')`);
      await send(A);
    }
    await A.waitFor(`document.body.innerText.includes('APPROVED')`);
    const t = await text(A);
    check('APPROVED and every participant approved', /APPROVED/.test(t) && /Every admitted participant approved the current digest\./.test(t));
    check('the debtor table lists Alice (10: Dave 10) and Bob (10: Carol 10) and nobody else', /Alice\s+10\s+Dave 10/.test(t) && /Bob\s+10\s+Carol 10/.test(t) && !/Debtor that must authorize[\s\S]*Carol\s+10\s+\S/.test(t.slice(t.indexOf('Debtor that must authorize'), t.indexOf('Debtor that must authorize') + 200).replace(/Bob\s+10\s+Carol 10/, '')), t.slice(t.indexOf('Debtor that must authorize'), t.indexOf('Debtor that must authorize') + 300));
    check('the page says anyone may submit and approvals do not replace debtor authorizations', /Anyone may submit the settlement; the submitter has no special role and approvals do not replace these authorizations\./.test(t));
    await shot(A, '08-approved');
  });

  await step('10 settlement failures are truthful: missing authorization, then token failure', async () => {
    await clickIn(A, 'form[data-action="settle"]');
    await A.waitFor(`document.querySelector('section.pending')`);
    const grants = await A.ev(`[...document.querySelectorAll('section.pending input[data-grant]')].map((i) => i.closest('label').innerText.trim())`);
    check('exactly the two debtors must authorize (Alice and Bob), not Carol or Dave', grants.length === 2 && grants.some((g) => g.startsWith('Alice authorizes')) && grants.some((g) => g.startsWith('Bob authorizes')), JSON.stringify(grants));
    const last = await send(A, { withhold: ['Bob'], expect: 'rejected' });
    check('a missing debtor authorization is reported as a rejection by the contract', /REJECTED by the contract/.test(last) && /authorization/i.test(last), last);
    check('the session is still APPROVED and Not settled', /Not settled\./.test(await text(A)) && !(await A.ev(`Boolean(document.querySelector('.settled-note'))`)));
    // EQ-20 (founder record section 9): a failed settlement attempt discards its authorization. The pending action is gone, the page says re-authorization is
    // required, and the retry must be prepared anew with every debtor's authorization granted afresh.
    check('after the failed settlement the pending action (and its authorization) is gone', !(await A.ev(`Boolean(document.querySelector('section.pending'))`)));
    check('the log says re-authorization is required', /Re-authorization is required/.test(last), last);
    await clickIn(A, 'form[data-action="settle"]');
    await A.waitFor(`document.querySelector('section.pending')`);
    // every debtor authorizes again: Bob holds no TTT-B, so the TOKEN refuses
    const last2 = await send(A, { expect: 'rejected' });
    check('with every authorization but no funds, the failure is the token\'s InsufficientBalance, not a clearing success', /InsufficientBalance/.test(last2), last2);
    check('nothing moved and the page still says Not settled', /Not settled\./.test(await text(A)) && !(await A.ev(`Boolean(document.querySelector('.settled-note'))`)));
    await shot(A, '09-settle-failures');
    check('the second failure also discards its authorization (nothing left to cancel or resend)', !(await A.ev(`Boolean(document.querySelector('section.pending'))`)) && /Re-authorization is required/.test(last2), last2);
  });

  let B;
  await step('11 settle for real in the sandbox; a stale second tab then tries again', async () => {
    // a second tab opened BEFORE settlement: its view will go stale
    B = await Page.open(DEBUG_PORT, `${BASE}/`);
    pages.push(B);
    await B.waitFor(`document.querySelector('form[data-action="select"]')`);
    await submitForm(B, 'form[data-action="select"]', { label: 'browser-1' });
    await B.waitFor(`document.body.innerText.includes('APPROVED')`);
    // fund Bob (TTT-B) in tab A
    await submitForm(A, 'form[data-action="mint"]', { to: 'Bob', token: 'TTT-B', amount: '10' });
    await send(A);
    await clickIn(A, 'form[data-action="settle"]');
    await send(A);
    await A.waitFor(`document.querySelector('.settled-note')`);
    const t = await text(A);
    check('SETTLED is shown only as a local sandbox result, not a network transaction', /SETTLED, as recorded by the contract in the local sandbox\. This is not a network transaction\./.test(t) || (/SETTLED/.test(t) && /in the local sandbox/.test(t) && /not a network transaction/.test(t)), t.slice(t.indexOf('Settlement'), t.indexOf('Settlement') + 300));
    check('2 transfers moved 20 in total, all together', /2 transfers moved 20 in total, all together\./.test(t));
    check('balances: Alice 0, Bob 0, Carol 10, Dave 10 of TTT-B', /Alice\s+\S+\s+\d+\s+0\n/.test(t) || (/Carol\s+\S+\s+0\s+10/.test(t) && /Dave\s+\S+\s+0\s+10/.test(t)), t.slice(0, 500));
    check('the stall note is gone once the contract reports Settled', !/does not complete by itself/.test(t));
    const forbidden = [/confirmed on/i, /transaction (hash|id)/i, /testnet/i, /submitted to the (network|ledger)/i, /wallet connected/i, /signed by/i];
    const body = await A.ev(`(() => { const m = document.querySelector('main').cloneNode(true); m.querySelector('.banner')?.remove(); return m.innerText; })()`);
    check('no page text outside the banner (which negates them) claims network, wallet or signature activity', forbidden.every((re) => !re.test(body)), body);
    await shot(A, '10-settled');
    // the stale tab B still shows APPROVED with a settle button
    check('tab B (stale) still shows the old APPROVED view with a settle button', /APPROVED/.test(await text(B)) && (await B.ev(`Boolean(document.querySelector('form[data-action="settle"]'))`)));
    await clickIn(B, 'form[data-action="settle"]');
    const last = await send(B, { expect: 'rejected' });
    check('the repeated settlement is rejected by the contract with AlreadySettled (#50)', /AlreadySettled/.test(last), last);
    await B.waitFor(`document.querySelector('.settled-note')`);
    check('after the rejection tab B refreshed itself to the true SETTLED state', true);
    await shot(B, '11-stale-tab-rejected');
  });

  await step('12 all-zero session reaches SETTLED with no token transfer', async () => {
    const before = await A.ev(`document.querySelector('table').innerText`);
    await submitForm(A, 'form[data-action="select"]', { label: 'browser-zero' });
    await A.waitFor(`document.body.innerText.includes('No session "browser-zero" exists yet')`);
    await submitForm(A, 'form[data-action="create"]', { creator: 'Alice', token: 'TTT-A', maxParticipants: '2', maxObligations: '4' });
    await send(A);
    await submitForm(A, 'form[data-action="join"]', { participant: 'Bob' });
    await send(A);
    await submitForm(A, 'form[data-action="obligation"]', { debtor: 'Alice', creditor: 'Bob', amount: '5' });
    await send(A);
    await submitForm(A, 'form[data-action="obligation"]', { debtor: 'Bob', creditor: 'Alice', amount: '5' });
    await send(A);
    await submitForm(A, 'form[data-action="finalize"]', { caller: 'Bob' });
    await send(A);
    await A.waitFor(`document.body.innerText.includes('COMMITTED')`);
    let t = await text(A);
    check('every net is zero and the page says nothing is to be transferred', /Nothing to transfer: every net position is zero/.test(t));
    await submitForm(A, 'form[data-action="useDefault"]', {});
    await A.waitFor(`document.body.innerText.includes('Advisory check of the draft')`);
    check('the default plan is empty', (await A.ev(`document.querySelector('textarea[name="plan"]').value`)) === '');
    await submitForm(A, 'form[data-action="propose"]', { proposer: 'Alice' });
    await send(A);
    t = await text(A);
    check('the proposal has no transfers and no debtor must authorize', /The proposal contains no transfers\./.test(t) && /No debtor, so no debit authorization and no transfer\./.test(t) && !/Debtor that must authorize/.test(t));
    check('no settle button before every approval', !(await A.ev(`Boolean(document.querySelector('form[data-action="settle"]'))`)));
    for (const who of ['Alice', 'Bob']) {
      await A.click(`document.querySelector('form[data-action="approve"]:has(input[value="${who}"]) button')`);
      await send(A);
    }
    await A.waitFor(`document.querySelector('form[data-action="settle"]')`);
    await clickIn(A, 'form[data-action="settle"]');
    await A.waitFor(`document.querySelector('section.pending')`);
    check('the pending panel says no authorization is required', /No authorization is required for this call\./.test(await text(A)));
    await send(A);
    await A.waitFor(`document.querySelector('.settled-note')`);
    t = await text(A);
    check('SETTLED with "No transfer was made and zero value moved", in the local sandbox', /No transfer was made and zero value moved\./.test(t) && /in the local sandbox/.test(t) && !/transfers? moved/.test(t));
    const after = await A.ev(`document.querySelector('table').innerText`);
    check('no token balance changed', after === before, `${before}\n---\n${after}`);
    await shot(A, '12-zero-settled');
  });

  await step('13 reload and restart: the page does not claim persistence it does not have', async () => {
    await A.reload();
    await A.waitFor(`document.querySelector('form[data-action="select"]')`);
    let t = await text(A);
    check('after reload the page does not remember the open session', (await A.ev(`document.querySelector('form[data-action="select"] input[name="label"]').value`)) === '' && !/SETTLED|OPEN|COMMITTED/.test(t.split('Participants and obligations')[0] ?? t), t.slice(0, 300));
    check('after reload the balances are still those of the running sandbox (server memory)', /Carol\s+\S+\s+0\s+10/.test(t), t.slice(0, 400));
    await submitForm(A, 'form[data-action="select"]', { label: 'browser-1' });
    await A.waitFor(`document.querySelector('.settled-note')`);
    check('re-selecting the session shows what the running sandbox holds (SETTLED)', true);
    await stopServer();
    await startServer();
    await A.reload();
    await A.waitFor(`document.querySelector('form[data-action="select"]')`);
    t = await text(A);
    check('after the server restarts, every balance is back to 0: the sandbox was never saved', !/Carol\s+\S+\s+0\s+10/.test(t) && /Alice\s+\S+\s+0\s+0/.test(t), t.slice(0, 400));
    await submitForm(A, 'form[data-action="select"]', { label: 'browser-1' });
    await A.waitFor(`document.body.innerText.includes('No session "browser-1" exists yet')`);
    check('the previously settled session no longer exists after the restart', true);
    await shot(A, '13-after-restart');
  });

  await step('14 page health', async () => {
    const errs = [...A.errors, ...(B ? B.errors : [])];
    check('no JavaScript exception or console error in either tab during the whole journey', errs.length === 0, errs.join('\n'));
  });
} finally {
  for (const p of pages) await p.close();
  if (browser) browser.child.kill();
  if (server) {
    server.removeAllListeners('exit');
    server.kill();
  }
  await sleep(500);
  rmSync(join(shots, '.profile'), { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
writeFileSync(join(shots, 'journey-results.json'), JSON.stringify({ browser: browser?.version, total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length} of ${results.length} checks passed${failed.length ? `; ${failed.length} FAILED` : ''}. Screenshots and results: ${shots}`);
process.exit(failed.length ? 1 : 0);
