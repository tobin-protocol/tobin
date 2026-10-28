// The Console\'s renderer and plan text, on synthetic models. No bridge, no DOM. These tests pin the HONESTY rules: what the page may and may not say.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineError } from '../../../packages/mvp1-sdk/src/amount.ts';
import type { Instruction } from '../../../packages/mvp1-sdk/src/engine/index.ts';
import type { SessionStatus } from '../../../packages/mvp1-sdk/src/sdk/index.ts';
import type { Model } from '../lib/console/controller.ts';
import { esc, formatPlan, parsePlan, renderApp, statusLine } from '../lib/console/view.ts';
import { addr, oid } from '../../../packages/mvp1-sdk/test/helpers.ts';

const A = addr(11, 'contract');
const B = addr(12, 'contract');
const C = addr(13, 'contract');
const TOKEN = addr(201, 'contract');
const personas = [
  { name: 'Alice', address: A },
  { name: 'Bob', address: B },
  { name: 'Carol', address: C },
];
const DESC = 'LOCAL SANDBOX: the real contracts in the Soroban test host; simulated unsigned authorizations; no network, no wallet, nothing on any ledger';
const digest = 'cd'.repeat(32);

function status(over: Partial<SessionStatus> = {}): SessionStatus {
  return {
    sessionId: oid(1), state: 'Committed', creator: A, token: TOKEN, participants: [A, B, C], maxParticipants: 4, maxObligations: 16,
    obligations: [{ id: oid(1), debtor: A, creditor: B, amount: 100n }, { id: oid(2), debtor: B, creditor: C, amount: 80n }, { id: oid(3), debtor: C, creditor: A, amount: 70n }],
    nets: [{ participant: A, net: 30n }, { participant: B, net: -20n }, { participant: C, net: -10n }], allZero: false, commitment: 'ab'.repeat(32),
    proposal: null, approvals: [], missingApprovals: [A, B, C], debtorAuthorizations: [], settlement: null,
    advice: { defaultProposal: [], currentValidation: null, currentIsDefault: null }, next: [], ...over,
  };
}

const plan: Instruction[] = [{ payer: A, payee: B, amount: 20n }, { payer: A, payee: C, amount: 10n }];
const withProposal = (over: Partial<SessionStatus> = {}): SessionStatus =>
  status({
    proposal: { digest, instructions: plan, proposer: B, revision: 1 },
    approvals: [{ participant: A, approved: true }, { participant: B, approved: false }, { participant: C, approved: false }],
    missingApprovals: [B, C],
    debtorAuthorizations: [{ debtor: A, total: 30n, transfers: [{ to: B, amount: 20n }, { to: C, amount: 10n }] }],
    advice: { defaultProposal: plan, currentValidation: { ok: true }, currentIsDefault: true },
    ...over,
  });

function model(st: SessionStatus | null, over: Partial<Model> = {}): Model {
  return {
    ranOn: DESC, personas, tokens: [{ name: 'TTT-A', address: TOKEN, cap: '1000000' }], balances: { [TOKEN]: { Alice: '100', Bob: '0', Carol: '0' } },
    sessionLabel: st ? 'demo' : null, sessionId: st ? st.sessionId : null, status: st, digestCheck: null, pending: null, replacement: null,
    draft: null, draftAdvice: null, draftDigest: null, settledInSandbox: false, log: [], ...over,
  };
}

const withoutBanner = (html: string): string => html.replace(/<div class="banner"[\s\S]*?<\/div>/, '');
const FORBIDDEN = [/testnet/i, /transaction (hash|id)/i, /confirmed on/i, /submitted to the (network|ledger)/i, /on-chain/i, /wallet connected/i, /signed by/i];

test('every rendering carries the sandbox banner and says authorizations are simulated', () => {
  for (const m of [model(null), model(status({ state: 'Open' })), model(withProposal()), model(withProposal({ state: 'Approved', missingApprovals: [] }))]) {
    const html = renderApp(m);
    assert.match(html, /<div class="banner"[^>]*>.*LOCAL SANDBOX.*no network, no wallet.*simulated local grants \(no signature\)/s);
  }
});

test('the banner says plainly that nothing here is saved: the sandbox lives in the local server process memory only', () => {
  const html = renderApp(model(null));
  const banner = /<div class="banner"[\s\S]*?<\/div>/.exec(html)?.[0] ?? '';
  assert.match(banner, /lives only in the memory of the local server process/);
  assert.match(banner, /not saved anywhere/);
  assert.match(banner, /disappears when that process stops/);
  assert.match(banner, /does not remember which session you had open/);
  assert.doesNotMatch(banner, /(persist|persistent|permanent|stored on|saved to)/i);
});

test('the digest-check line states the approved format version and does not claim it is still under review or independently reviewed', () => {
  const html = renderApp(model(withProposal(), { digestCheck: { commitmentMatches: true, proposalMatches: true, bytesMatch: true } }));
  assert.match(html, /digest format version 2, revision-bound, approved by the founder as the working MVP-1 format; not independently reviewed/);
  assert.doesNotMatch(html, /under founder review/);
});

test('no rendering claims network activity, signatures, hashes of transactions or confirmations', () => {
  const settled = status({ state: 'Settled', settlement: { digest, ledgerSequence: 12, totalMoved: 30n, instructionCount: 2 }, proposal: { digest, instructions: plan, proposer: B, revision: 1 }, missingApprovals: [] });
  for (const m of [model(null), model(status({ state: 'Open' })), model(withProposal()), model(settled), model(withProposal(), { log: [{ n: 1, title: 'x', ok: true, message: 'accepted by the contract', ranOn: DESC }] })]) {
    const body = withoutBanner(renderApp(m));
    for (const re of FORBIDDEN) assert.doesNotMatch(body, re, String(re));
  }
});

test('"settled" appears only when the contract reports Settled, and then only "in the local sandbox" and "not a network transaction"', () => {
  for (const st of [status({ state: 'Open' }), withProposal(), withProposal({ state: 'Approved', missingApprovals: [] })]) {
    const html = renderApp(model(st, { settledInSandbox: false }));
    assert.doesNotMatch(html, /settled-note|state-settled/);
    assert.match(html, /<strong>Not settled\.<\/strong>|Open: participants/);
    assert.doesNotMatch(statusLine(model(st)), /^Settled/);
  }
  const settled = status({ state: 'Settled', settlement: { digest, ledgerSequence: 12, totalMoved: 30n, instructionCount: 2 }, proposal: { digest, instructions: plan, proposer: B, revision: 1 }, missingApprovals: [] });
  const html = renderApp(model(settled));
  assert.match(html, /class="settled-note"/);
  assert.match(html, /in the local sandbox<\/em>\. This is not a network transaction\./);
  assert.match(html, /2 transfers moved 30 in total, all together\./);
  assert.doesNotMatch(html, /stall-note/);
});

test('an all-zero session shows no transfer activity, before and after completion', () => {
  const zeroOpen = withProposal({ allZero: true, nets: [{ participant: A, net: 0n }, { participant: B, net: 0n }, { participant: C, net: 0n }], proposal: { digest, instructions: [], proposer: A, revision: 1 }, debtorAuthorizations: [], state: 'Approved', missingApprovals: [] });
  const html = renderApp(model(zeroOpen));
  assert.match(html, /Nothing to transfer: every net position is zero/);
  assert.match(html, /The proposal contains no transfers\./);
  assert.match(html, /No debtor, so no debit authorization and no transfer\./);
  assert.doesNotMatch(html, /Debtor that must authorize/);
  const done = renderApp(model({ ...zeroOpen, state: 'Settled', settlement: { digest, ledgerSequence: 3, totalMoved: 0n, instructionCount: 0 } }));
  assert.match(done, /No transfer was made and zero value moved\./);
  assert.doesNotMatch(done, /transfers? moved/);
});

test('a stalled session is never described as completing by itself', () => {
  for (const st of [status({ state: 'Open' }), status(), withProposal(), withProposal({ state: 'Approved', missingApprovals: [] })]) {
    const html = renderApp(model(st));
    assert.match(html, /<p class="stall-note">This session does not complete by itself./, 'the note is rendered as a visible paragraph');
    assert.doesNotMatch(html, /stall-note"[^>]*hidden/);
    assert.match(html, /no timeout, forced approval, abort, default or recovery/);
    assert.doesNotMatch(html, /will (eventually |automatically )?complete|automatically (complete|settle)|in a few|countdown|expected completion/i);
  }
});

test('proposal replacement is shown with the number of invalidated approvals; approvals count for the current digest only', () => {
  const html = renderApp(model(withProposal({ approvals: [{ participant: A, approved: false }, { participant: B, approved: false }, { participant: C, approved: false }], missingApprovals: [A, B, C], proposal: { digest: 'ee'.repeat(32), instructions: plan, proposer: C, revision: 2 } }),
    { replacement: { fromRevision: 1, toRevision: 2, fromDigest: digest, toDigest: 'ee'.repeat(32), invalidated: 2 } }));
  assert.match(html, /Proposal replaced<\/strong> \(revision 1 to 2\)\. 2 earlier approvals were invalidated/);
  assert.match(html, /every participant must approve again/);
  assert.match(html, /Missing approvals: Alice, Bob, Carol/);
  const one = renderApp(model(withProposal(), { replacement: { fromRevision: 1, toRevision: 2, fromDigest: digest, toDigest: digest, invalidated: 1 } }));
  assert.match(one, /1 earlier approval was invalidated/);
});

test('approvals: each missing approver has a button only while COMMITTED; an approval is not a debit authorization', () => {
  const html = renderApp(model(withProposal()));
  assert.match(html, /Prepare approval as Bob/);
  assert.match(html, /Prepare approval as Carol/);
  assert.doesNotMatch(html, /Prepare approval as Alice/, 'Alice already approved the current digest');
  assert.match(html, /it is not a debit authorization/);
  const approved = renderApp(model(withProposal({ state: 'Approved', missingApprovals: [], approvals: [A, B, C].map((p) => ({ participant: p, approved: true })) })));
  assert.doesNotMatch(approved, /Prepare approval as/);
  assert.match(approved, /Every admitted participant approved the current digest\./);
  assert.match(approved, /<button>Prepare settlement<\/button>/);
  assert.doesNotMatch(renderApp(model(withProposal())), /Prepare settlement/, 'no settlement button before every approval');
});

test('the debtors who must authorize are listed with their own totals, and the submitter has no role', () => {
  const html = renderApp(model(withProposal({ state: 'Approved', missingApprovals: [] })));
  assert.match(html, /Debtor that must authorize/);
  assert.match(html, /<td>Alice<\/td><td>30<\/td><td>Bob 20; Carol 10<\/td>/);
  assert.match(html, /Anyone may submit the settlement; the submitter has no special role and approvals do not replace these authorizations\./);
});

test('the pending panel lists every required authorization as a simulated grant and warns about invalidation', () => {
  const call = { contract: TOKEN, fn: 'finalize_obligations', args: [], auths: [], description: 'Freeze things.' };
  const html = renderApp(model(withProposal(), {
    pending: {
      kind: 'propose', title: 'Replace the proposal (revision 1) as Bob', call, willInvalidate: 2,
      grants: [{ signer: B, purpose: 'propose exactly this list of transfers', granted: true }, { signer: A, purpose: 'second', granted: false }],
    },
  }));
  assert.match(html, /Sending this replacement will invalidate 2 existing approvals\./);
  assert.match(html, /simulated local grants, no signature/);
  assert.match(html, /data-grant="[^"]+" checked> Bob authorizes: propose exactly this list of transfers/);
  assert.match(html, /data-grant="[^"]+" > Alice authorizes: second/, 'an ungranted authorization is rendered unchecked');
  assert.match(html, /Send to the local sandbox contract/);
});

test('the default plan is offered as a convenience, never as authority; the draft check is advisory', () => {
  const html = renderApp(model(status(), { draft: plan, draftAdvice: { ok: true }, draftDigest: 'ab'.repeat(32) }));
  assert.match(html, /It is not authority: the contract accepts any plan that satisfies its rules and rejects any that does not\./);
  assert.match(html, /Advisory check of the draft: passes the published rules/);
  assert.match(html, /The contract decides\./);
  const bad = renderApp(model(status(), { draft: plan.slice(0, 1), draftAdvice: { ok: false, error: 'FlowMismatch', message: 'x' }, draftDigest: null }));
  assert.match(bad, /would be rejected \(FlowMismatch\)/);
});

test('rejections are shown as rejections by the contract', () => {
  const html = renderApp(model(withProposal(), { log: [{ n: 1, title: 'Execute the settlement', ok: false, message: 'REJECTED by the contract: settle: MissingApproval (#6)', ranOn: DESC }] }));
  assert.match(html, /<li class="rejected"><strong>Execute the settlement<\/strong>: REJECTED by the contract/);
});

test('all text is escaped', () => {
  assert.equal(esc('<img src=x onerror="a&b">'), '&lt;img src=x onerror=&quot;a&amp;b&quot;&gt;');
  const evil = model(status(), { personas: [{ name: '<script>alert(1)</script>', address: A }, ...personas.slice(1)] });
  const html = renderApp(evil);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('plan text: format and parse round-trip; bad lines, unknown accounts and non-positive amounts are refused', () => {
  const nameOf = (a: string): string => personas.find((p) => p.address === a)?.name ?? a;
  const text = formatPlan(plan, nameOf);
  assert.equal(text, 'Alice -> Bob : 20\nAlice -> Carol : 10');
  assert.deepEqual(parsePlan(text, personas), plan);
  assert.deepEqual(parsePlan('\n  alice->bob:5  \n\n', personas), [{ payer: A, payee: B, amount: 5n }]);
  for (const bad of ['Alice Bob 20', 'Alice -> Bob : 2.5', 'Alice -> Bob : -3', 'Alice -> Bob : 0', 'Alice -> Zed : 1', 'Alice => Bob : 1']) {
    assert.throws(() => parsePlan(bad, personas), (e: unknown) => e instanceof EngineError, bad);
  }
});
