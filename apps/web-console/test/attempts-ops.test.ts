// Execution ATTEMPTS (MVP-1.5): immutable attempts, the retry policy, the unknown-outcome protection, evidence-gated confirmation, duplicate-submission prevention.
// Real HTTP handlers and real SQLite. Keys are throwaway ed25519 pairs made in memory. NO wallet, NO Stellar network and NO transaction is involved: the "network
// reads" in the evidence objects below are hand-written MOCKS used to exercise the server rules; they are not chain reads and prove nothing about Stellar.
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { encodeAddress } from 'tobin-mvp1-sdk/strkey';
import { createBackend } from '../lib/server/backend.ts';
import { SqliteRegistryStore } from '../lib/registry/sqlite-store.ts';
import { mayStartAttempt, stateAfterSubmission } from '../lib/stellar/retry-policy.ts';
import { client, makeBackend, signedIn, tempDir } from './backend-helpers.ts';
import type { Backend } from '../lib/server/backend.ts';

type C = Awaited<ReturnType<typeof signedIn>>;
type N = 'ann' | 'bob' | 'cat' | 'rae' | 'eve';
const CLEARING = encodeAddress('contract', new Uint8Array(32).fill(200)), TOKEN = encodeAddress('contract', new Uint8Array(32).fill(201));
const ASSET = `testnet:contract:${TOKEN}`;
const H1 = 'a1'.repeat(32), H2 = 'b2'.repeat(32), H3 = 'c3'.repeat(32);
const me = async (c: C) => (await c.call('GET', '/api/auth/me')).body['user'].id as string;
function newKey() { const { publicKey, privateKey } = generateKeyPairSync('ed25519'); const raw = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32); return { address: encodeAddress('account', new Uint8Array(raw)), sign: (m: string) => sign(null, Buffer.from(m, 'utf8'), privateKey).toString('base64') }; }

interface W { b: Backend; c: Record<N, C>; id: Record<N, string>; org: string; sid: string; base: string; bid: string; ob: string[]; exec: string }
async function world(o: { clearing?: boolean; asset?: 'contract' | 'issued'; path?: string; execute?: boolean } = {}): Promise<W> {
  const { b } = makeBackend(o.path ?? ':memory:', undefined, o.clearing === false ? undefined : CLEARING);
  const ISS = encodeAddress('account', new Uint8Array(32).fill(1));
  const store = new SqliteRegistryStore(b.db);
  const assetRef = o.asset === 'issued' ? `testnet:USD:${ISS}` : ASSET;
  if (o.asset === 'issued') store.putAsset({ id: assetRef, network: 'testnet', kind: 'issued', code: 'USD', issuer: ISS, status: 'supported', source: 'operator-configured', addedAt: 't' });
  else store.putAsset({ id: assetRef, network: 'testnet', kind: 'contract', code: 'TTT', contractId: TOKEN, status: 'supported', source: 'operator-configured', addedAt: 't' });
  const c = {} as Record<N, C>; const id = {} as Record<N, string>;
  for (const n of ['ann', 'bob', 'cat', 'rae', 'eve'] as N[]) { c[n] = await signedIn(b, n); id[n] = await me(c[n]); }
  const org = (await c.ann.call('POST', '/api/registry/orgs', { name: 'Alpha Bank' })).body['organization'].id as string;
  for (const n of ['bob', 'cat', 'rae'] as const) { const inv = await c.ann.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: `${n}@example.test`, role: 'member' }); await c[n].call('POST', '/api/registry/invitations/accept', { token: inv.body['token'] }); }
  for (const n of ['bob', 'rae'] as const) await c.ann.call('POST', `/api/registry/orgs/${org}/reviewers/${id[n]}/grant`, {});
  const sid = (await c.ann.call('POST', `/api/registry/orgs/${org}/sessions`, { label: 'Run' })).body['session'].sessionId as string;
  const base = `/api/registry/orgs/${org}/sessions/${sid}`;
  for (const n of ['ann', 'bob', 'cat'] as N[]) await c.ann.call('POST', `${base}/participants`, { userId: id[n] });
  const ob: string[] = [];
  for (const [d, cr, amt] of [['ann', 'bob', '100'], ['bob', 'cat', '80'], ['cat', 'ann', '70']] as const) ob.push((await c.ann.call('POST', `${base}/obligations`, { debtor: id[d], creditor: id[cr], amount: amt, assetRef })).body['obligationId']);
  await c.ann.call('POST', `${base}/calculate`, {});
  await c.bob.call('POST', `${base}/authorization/approve`, { calculationId: (await c.bob.call('GET', `${base}/authorization`)).body['calculationId'] });
  const cid = (await c.bob.call('GET', `${base}/authorization`)).body['calculationId'];
  const bid = (await c.ann.call('POST', `${base}/settlement/prepare`, { calculationId: cid })).body['batchId'] as string;
  const hash = (await c.rae.call('GET', `${base}/settlement/batches/${bid}`)).body['batch'].instructionsHash;
  await c.rae.call('POST', `${base}/settlement/batches/${bid}/approve`, { instructionsHash: hash });
  for (const n of ['ann', 'bob', 'cat'] as N[]) { const k = newKey(); const ch = await c[n].call('POST', `/api/registry/orgs/${org}/wallet-challenges`, { network: 'testnet', publicKey: k.address }); await c[n].call('POST', `/api/registry/orgs/${org}/wallet-challenges/${ch.body['challenge'].id}/verify`, { signature: k.sign(ch.body['challenge'].message), scheme: 'raw' }); }
  let exec = '';
  if (o.execute !== false) { const r = await c.ann.call('POST', `${base}/settlement/batches/${bid}/execution/start`, {}); assert.equal(r.status, 201, JSON.stringify(r.body)); exec = r.body['executionId']; }
  return { b, c, id, org, sid, base, bid, ob, exec };
}
const begin = (w: W, who: N = 'ann', body: Record<string, unknown> = {}) => w.c[who].call('POST', `${w.base}/settlement/batches/${w.bid}/execution/attempts/begin`, { initiator: w.id.ann, ...body });
const attempts = async (w: W, who: N = 'rae') => (await w.c[who].call('GET', `${w.base}/settlement/batches/${w.bid}/execution/attempts`)).body;
const ann = (w: W) => ({ userId: w.id.ann, kind: 'verified' as const });
const adv = (w: W, no: number, to: unknown, input: { detail?: string; evidence?: unknown; tx?: { hash: string; step: number } } = {}) => w.b.registry.advanceExecutionAttempt(ann(w), w.org, w.sid, w.bid, no, to, { detail: input.detail ?? 'test', ...(input.evidence !== undefined ? { evidence: input.evidence } : {}), ...(input.tx ? { tx: input.tx } : {}) });
const count = (w: W, t: string) => (w.b.db.raw.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
const toPending = (w: W, no = 1, hash = H1, step = 1) => { adv(w, no, 'signing'); adv(w, no, 'signed'); adv(w, no, 'submission-pending', { tx: { hash, step } }); };

// ---------------- pure retry policy ----------------
test('retry policy: the exact table', () => {
  assert.equal(mayStartAttempt(undefined).allowed, true);
  for (const s of ['awaiting-signer', 'signing', 'signed', 'submission-pending', 'submitted'] as const) assert.equal(mayStartAttempt(s).allowed, false, `${s}: one live attempt`);
  const u = mayStartAttempt('unknown-outcome', { reviewedFailure: true }); assert.equal(u.allowed, false); assert.match(u.reason, /timeout is not a failure/, 'no flag overrides an unknown outcome');
  assert.equal(mayStartAttempt('confirmed', { reviewedFailure: true }).allowed, false, 'a confirmed settlement is never retried'); assert.equal(mayStartAttempt('reconciled').allowed, false); assert.equal(mayStartAttempt('reconciliation-required', { reviewedFailure: true }).allowed, false);
  assert.equal(mayStartAttempt('expired').allowed, true); assert.equal(mayStartAttempt('failed').allowed, false); assert.equal(mayStartAttempt('failed', { reviewedFailure: true }).allowed, true);
  assert.equal(stateAfterSubmission('accepted'), 'submitted'); assert.equal(stateAfterSubmission('duplicate'), 'submitted'); assert.equal(stateAfterSubmission('rejected'), 'failed'); assert.equal(stateAfterSubmission('unknown'), 'unknown-outcome');
  assert.notEqual(stateAfterSubmission('unknown'), 'failed', 'a timeout is never recorded as a failure'); assert.notEqual(stateAfterSubmission('accepted'), 'confirmed', 'an accepted submission is never a confirmation');
});

// ---------------- beginning an attempt ----------------
test('begin: needs execution preconditions, an approved eligible batch, a contract-token asset and a configured clearing contract', async () => {
  const w = await world({ execute: false });
  let r = await begin(w); assert.equal(r.status, 409); assert.match(r.body['message'], /record the execution preconditions/);
  await w.c.ann.call('POST', `${w.base}/settlement/batches/${w.bid}/execution/start`, {});
  r = await begin(w, 'ann', { initiator: 'nobody' }); assert.equal(r.status, 400); assert.match(r.body['message'], /initiator must be a participant with a verified account/);
  r = await begin(w, 'ann', { initiator: w.id.rae }); assert.equal(r.status, 400, 'a reviewer with no verified account in the execution cannot initiate');
  assert.equal((await begin(w, 'rae')).status, 403, 'a reviewer who is not an administrator'); assert.equal((await begin(w, 'eve')).status, 404, 'an outsider');
  const noCfg = await world({ clearing: false }); r = await begin(noCfg); assert.equal(r.status, 409); assert.match(r.body['message'], /no clearing contract is configured/);
  const classic = await world({ asset: 'issued' }); r = await begin(classic); assert.equal(r.status, 409); assert.match(r.body['message'], /Soroban token contract identity/, 'a classic asset cannot be settled by the deployed contract');
  assert.equal(count(w, 'settlement_attempts'), 0);
  r = await begin(w); assert.equal(r.status, 201); assert.equal(r.body['attemptNo'], 1); assert.equal(r.body['state'], 'awaiting-signer'); assert.match(r.body['note'], /No transaction has been constructed, signed or submitted/);
});

test('begin: the plan is derived from the approved batch, states every signer, and holds no secrets', async () => {
  const w = await world(); assert.equal((await begin(w)).status, 201);
  const a = (await attempts(w))['attempts'][0];
  assert.equal(a.state, 'awaiting-signer'); assert.equal(a.network, 'testnet'); assert.match(a.planFingerprint, /^[0-9a-f]{64}$/); assert.match(a.onChainSessionId, /^[0-9a-f]{64}$/); assert.match(a.expectedDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(a.steps.map((s: { fn: string }) => s.fn), ['create_session', 'join_session', 'join_session', 'submit_obligation', 'submit_obligation', 'submit_obligation', 'finalize_obligations', 'propose_settlement', 'approve_settlement', 'approve_settlement', 'approve_settlement', 'settle']);
  assert.equal(a.requiredSigners.length, 3); assert.ok(a.requiredSigners.every((s: string) => /^G[A-Z2-7]{55}$/.test(s)), 'signers are verified Stellar accounts, never bookkeeping keys');
  const create = a.steps[0]; assert.equal(create.signers.length, 1, 'the initiator alone creates the session');
  for (const j of a.steps.filter((s: { fn: string }) => s.fn === 'join_session')) assert.equal(j.signers.length, 2, 'a join needs the joiner and the creator: the creator signs membership only');
  const row = w.b.db.raw.prepare('SELECT plan_json FROM settlement_attempts').get() as { plan_json: string };
  assert.ok(!/secret|seed|private|signature|envelope/i.test(row.plan_json), 'no secret-looking field in the stored plan');
  assert.ok(((await w.c.ann.call('GET', w.base)).body['workspace'].activity.items as { kind: string }[]).some((x) => x.kind === 'settlement.attempt-started'));
  assert.deepEqual((await w.c.rae.call('POST', `${w.base}/settlement/batches/${w.bid}/execution/attempts/begin`, { initiator: w.id.ann })).status, 403);
});

test('begin: only one live attempt; a changed economic instruction ends eligibility', async () => {
  const w = await world(); assert.equal((await begin(w)).status, 201);
  const again = await begin(w); assert.equal(again.status, 409); assert.match(again.body['message'], /still awaiting-signer: only one attempt may be live/);
  assert.equal(count(w, 'settlement_attempts'), 1);
  await w.c.ann.call('POST', `${w.base}/obligations/${w.ob[0]}/update`, { amount: '101' });
  const w2 = await world(); await w2.c.ann.call('POST', `${w2.base}/obligations/${w2.ob[0]}/update`, { amount: '101' });
  const r = await begin(w2); assert.equal(r.status, 409); assert.match(r.body['message'], /approved, still-eligible batch/, 'fresh calculation and approval are required; the old batch cannot be executed');
});

// ---------------- the state machine, evidence, and the unknown outcome ----------------
test('attempt states: only legal transitions; user rejection returns to awaiting-signer; notes change nothing', async () => {
  const w = await world(); await begin(w);
  assert.throws(() => adv(w, 1, 'signed'), /cannot move from awaiting-signer to signed/); assert.throws(() => adv(w, 1, 'submitted'), /cannot move/); assert.throws(() => adv(w, 1, 'settled'), /unknown execution state/);
  assert.deepEqual(adv(w, 1, 'signing'), { state: 'signing', changed: true }); assert.deepEqual(adv(w, 1, 'signing'), { state: 'signing', changed: false });
  assert.deepEqual(adv(w, 1, 'awaiting-signer', { detail: 'the user rejected the signature' }), { state: 'awaiting-signer', changed: true });
  w.b.registry.noteExecutionAttempt(ann(w), w.org, w.sid, w.bid, 1, 'simulation failed: contract error #3', { simulation: 'MOCK' });
  w.b.registry.noteExecutionAttempt(ann(w), w.org, w.sid, w.bid, 1, 'Freighter was unavailable');
  const a = (await attempts(w))['attempts'][0]; assert.equal(a.state, 'awaiting-signer'); assert.deepEqual(a.events.map((e: { kind: string; to: string }) => `${e.kind}:${e.to}`), ['transition:awaiting-signer', 'transition:signing', 'transition:awaiting-signer', 'note:awaiting-signer', 'note:awaiting-signer']);
  assert.equal((await begin(w)).status, 409, 'rejection and notes do not allow a second live attempt');
  assert.throws(() => adv(w, 9, 'signing'), /attempt not found/);
});

test('evidence: nothing is confirmed, failed after submission or reconciled without an independent read or comparison', async () => {
  const w = await world(); await begin(w); toPending(w); adv(w, 1, 'submitted');
  assert.throws(() => adv(w, 1, 'confirmed'), /requires an independent network read/, 'a submission response is not a confirmation');
  assert.throws(() => adv(w, 1, 'confirmed', { evidence: { networkRead: { hash: H1, status: 'NOT_FOUND' } } }), /requires an independent network read/);
  assert.throws(() => adv(w, 1, 'confirmed', { evidence: { networkRead: { hash: H2, status: 'SUCCESS' } } }), /requires an independent network read/, 'a read of a hash that is not this attempt\'s');
  assert.throws(() => adv(w, 1, 'confirmed', { evidence: { networkRead: { hash: H1, status: 'FAILED' } } }), /SUCCESS/);
  assert.throws(() => adv(w, 1, 'failed'), /needs an independent network read reporting FAILED/);
  assert.deepEqual(adv(w, 1, 'confirmed', { evidence: { networkRead: { hash: H1, status: 'SUCCESS', ledger: 123 } } }), { state: 'confirmed', changed: true });
  assert.throws(() => adv(w, 1, 'reconciled'), /comparison/); assert.throws(() => adv(w, 1, 'reconciled', { evidence: { comparison: { ok: false, mismatches: ['x'] } } }), /comparison/);
  assert.throws(() => adv(w, 1, 'reconciliation-required', { evidence: { comparison: { ok: true } } }), /matching comparison does not require/);
  assert.deepEqual(adv(w, 1, 'reconciled', { evidence: { comparison: { ok: true, mismatches: [] } } }), { state: 'reconciled', changed: true });
  assert.equal((await begin(w)).status, 409, 'a reconciled settlement is never retried'); assert.throws(() => adv(w, 1, 'failed'), /cannot move/);
  // mismatch path
  const m = await world(); await begin(m); toPending(m); adv(m, 1, 'submitted'); adv(m, 1, 'confirmed', { evidence: { networkRead: { hash: H1, status: 'SUCCESS' } } });
  adv(m, 1, 'reconciliation-required', { evidence: { comparison: { ok: false, mismatches: ['total moved 2, approved 1'] } } });
  assert.equal((await begin(m)).status, 409); assert.match((await begin(m)).body['message'], /authorized person must resolve/);
});

test('unknown outcome: a timeout is never a failure; no retry and no resubmission until the network answers', async () => {
  const w = await world(); await begin(w); toPending(w);
  adv(w, 1, 'unknown-outcome', { detail: 'the submission timed out: result not known', evidence: { timeout: true } });
  for (const bad of ['submission-pending', 'submitted', 'signed', 'signing', 'awaiting-signer'] as const) assert.throws(() => adv(w, 1, bad), /cannot move from unknown-outcome/, `unknown -> ${bad} would risk a duplicate payment`);
  assert.throws(() => adv(w, 1, 'failed'), /needs an independent network read reporting FAILED/, 'unknown is not failed');
  assert.throws(() => adv(w, 1, 'expired'), /only when a network read finds no transaction AND its validity window has passed/);
  assert.throws(() => adv(w, 1, 'expired', { evidence: { networkRead: { hash: H1, status: 'NOT_FOUND' } } }), /validity window has passed/, 'not found alone is still unknown');
  const r = await begin(w); assert.equal(r.status, 409); assert.match(r.body['message'], /previous outcome is unknown.*timeout is not a failure/);
  assert.equal(count(w, 'settlement_attempts'), 1, 'no second attempt, so no second transaction');
  assert.deepEqual(adv(w, 1, 'unknown-outcome'), { state: 'unknown-outcome', changed: false }, 'staying unknown is idempotent');
  // resolved by reading the network: it was in fact included and successful
  assert.deepEqual(adv(w, 1, 'confirmed', { evidence: { networkRead: { hash: H1, status: 'SUCCESS' } } }), { state: 'confirmed', changed: true });
});

test('retry: after expiry a new attempt; after a failure only when reviewed; never after success; attempts are never overwritten', async () => {
  const w = await world(); await begin(w); toPending(w); adv(w, 1, 'unknown-outcome', { detail: 'timeout' });
  adv(w, 1, 'expired', { detail: 'validity passed and the network has no record', evidence: { networkRead: { hash: H1, status: 'NOT_FOUND' }, validityPassed: true } });
  const second = await begin(w); assert.equal(second.status, 201); assert.equal(second.body['attemptNo'], 2);
  assert.equal(count(w, 'settlement_attempts'), 2); const list = (await attempts(w))['attempts'];
  assert.deepEqual(list.map((a: { attemptNo: number; state: string }) => [a.attemptNo, a.state]), [[1, 'expired'], [2, 'awaiting-signer']]); assert.equal(list[0].transactions.length, 1, 'the first attempt keeps its record');
  // attempt 2 fails after submission: a new attempt needs the explicit review
  adv(w, 2, 'signing'); adv(w, 2, 'signed'); adv(w, 2, 'submission-pending', { tx: { hash: H2, step: 1 } }); adv(w, 2, 'submitted'); adv(w, 2, 'failed', { evidence: { networkRead: { hash: H2, status: 'FAILED' } } });
  const blocked = await begin(w); assert.equal(blocked.status, 409); assert.match(blocked.body['message'], /review the failure/);
  const third = await begin(w, 'ann', { reviewedFailure: true }); assert.equal(third.status, 201); assert.equal(third.body['attemptNo'], 3);
  // a rejection before inclusion also ends in failed, and also needs the review
  adv(w, 3, 'signing'); adv(w, 3, 'signed'); adv(w, 3, 'submission-pending', { tx: { hash: H3, step: 1 } }); adv(w, 3, 'failed', { evidence: { rejectedBeforeInclusion: true } });
  assert.equal((await begin(w)).status, 409); assert.equal((await begin(w, 'ann', { reviewedFailure: true })).status, 201);
  // signing that fails ends the attempt without any transaction
  const x = await world(); await begin(x); adv(x, 1, 'signing'); adv(x, 1, 'failed', { detail: 'the wallet disconnected during signing' });
  assert.equal((await begin(x, 'ann', { reviewedFailure: true })).status, 201);
});

// ---------------- duplicate submission, integrity, isolation, concurrency ----------------
test('duplicate submission is refused: one transaction per attempt step, one attempt per hash', async () => {
  const w = await world(); await begin(w); adv(w, 1, 'signing'); adv(w, 1, 'signed');
  assert.throws(() => adv(w, 1, 'submission-pending'), /needs the transaction hash and step/); assert.throws(() => adv(w, 1, 'submission-pending', { tx: { hash: 'xyz', step: 1 } }), /needs the transaction hash/);
  adv(w, 1, 'submission-pending', { tx: { hash: H1, step: 1 } }); adv(w, 1, 'submitted'); adv(w, 1, 'failed', { evidence: { networkRead: { hash: H1, status: 'FAILED' } } });
  assert.equal(count(w, 'settlement_attempt_transactions'), 1);
  const w2 = await world(); await begin(w2); adv(w2, 1, 'signing'); adv(w2, 1, 'signed'); adv(w2, 1, 'submission-pending', { tx: { hash: H1, step: 1 } });
  assert.deepEqual(w2.b.registry.advanceExecutionAttempt(ann(w2), w2.org, w2.sid, w2.bid, 1, 'submission-pending', { detail: 'again', tx: { hash: H2, step: 1 } }), { state: 'submission-pending', changed: false }, 'asking again is an idempotent no-op: a second hash is NOT recorded');
  assert.equal(count(w2, 'settlement_attempt_transactions'), 1, 'still one recorded transaction for the step');
  // the schema itself: the same hash twice, and the same step twice
  const att = (w2.b.db.raw.prepare('SELECT id FROM settlement_attempts').get() as { id: string }).id;
  assert.throws(() => w2.b.db.raw.prepare("INSERT INTO settlement_attempt_transactions (tx_hash, attempt_id, step_index, network, recorded_by, recorded_at) VALUES (?, ?, 2, 'testnet', 'u', 't')").run(H1, att), /UNIQUE|constraint/, 'one attempt per hash');
  assert.throws(() => w2.b.db.raw.prepare("INSERT INTO settlement_attempt_transactions (tx_hash, attempt_id, step_index, network, recorded_by, recorded_at) VALUES (?, ?, 1, 'testnet', 'u', 't')").run(H2, att), /UNIQUE|constraint/, 'one transaction per step');
  assert.throws(() => w2.b.db.raw.prepare("INSERT INTO settlement_attempt_transactions (tx_hash, attempt_id, step_index, network, recorded_by, recorded_at) VALUES ('short', ?, 3, 'testnet', 'u', 't')").run(att), /CHECK/);
  assert.throws(() => w2.b.db.raw.prepare("INSERT INTO settlement_attempts (id, execution_id, attempt_no, network, plan_fingerprint, plan_json, initiator, created_by, created_at) SELECT 'att_dup', execution_id, attempt_no, network, plan_fingerprint, plan_json, initiator, created_by, 't' FROM settlement_attempts").run(), /UNIQUE/, 'attempt numbers are unique per execution');
  // a hash cannot be attached to a second attempt of another execution either (same primary key)
  const w3 = await world(); await begin(w3); adv(w3, 1, 'signing'); adv(w3, 1, 'signed'); adv(w3, 1, 'submission-pending', { tx: { hash: H3, step: 1 } });
  assert.equal(w3.b.db.raw.prepare('SELECT count(*) AS n FROM settlement_attempt_transactions WHERE tx_hash = ?').get(H3)?.['n'], 1);
});

test('immutability: attempts, events and transaction records cannot be changed or removed', async () => {
  const w = await world(); await begin(w); toPending(w);
  for (const sql of ["UPDATE settlement_attempts SET plan_fingerprint = '" + 'f'.repeat(64) + "'", 'DELETE FROM settlement_attempts', "UPDATE settlement_attempt_events SET to_state = 'confirmed'", 'DELETE FROM settlement_attempt_events', "UPDATE settlement_attempt_transactions SET step_index = 9", 'DELETE FROM settlement_attempt_transactions']) assert.throws(() => w.b.db.raw.prepare(sql).run(), /immutable/, sql);
  assert.throws(() => w.b.db.raw.prepare("INSERT INTO settlement_attempt_events (attempt_id, kind, from_state, to_state, actor, at, detail) SELECT id, 'note', 'signed', 'confirmed', 'u', 't', 'x' FROM settlement_attempts").run(), /CHECK/, 'a note cannot change the state');
});

test('isolation and access: outsiders see nothing; there is no HTTP route that advances an attempt', async () => {
  const w = await world(); await begin(w);
  const ghost = await w.c.eve.call('GET', `/api/registry/orgs/org_doesnotexist/sessions/${w.sid}/settlement/batches/${w.bid}/execution/attempts`);
  const r = await w.c.eve.call('GET', `${w.base}/settlement/batches/${w.bid}/execution/attempts`); assert.equal(r.status, 404); assert.deepEqual(r.body, ghost.body);
  for (const [m, p, body] of [['POST', 'execution/attempts/1/advance', { to: 'confirmed' }], ['POST', 'execution/attempts/advance', { to: 'confirmed' }], ['PUT', 'execution/attempts/begin', {}], ['POST', 'execution/attempts/1/transactions', { hash: H1 }], ['POST', 'execution/attempts/1/submit', {}]] as const)
    assert.equal((await w.c.ann.call(m, `${w.base}/settlement/batches/${w.bid}/${p}`, body)).status, 404, `${m} ${p}`);
  const anon = await signedIn(w.b, 'zed'); anon.cookie = ''; assert.equal((await anon.call('GET', `${w.base}/settlement/batches/${w.bid}/execution/attempts`)).status, 401);
  assert.equal((await w.c.ann.call('POST', `${w.base}/settlement/batches/${w.bid}/execution/attempts/begin`, { initiator: w.id.ann }, {}, false)).status, 403, 'request header required');
  assert.equal((await w.c.cat.call('GET', `${w.base}/settlement/batches/${w.bid}/execution/attempts`)).status, 200, 'members can read the attempts');
});

test('concurrency across two connections: one attempt wins, the other is refused; state changes from two connections stay legal', async () => {
  const t = tempDir();
  try {
    const w = await world({ path: t.path });
    const b2 = createBackend(t.path, { clearingContract: CLEARING, auth: { now: () => new Date('2026-11-08T10:00:00Z'), scryptCost: 10 }, secureCookies: true, clock: { now: () => new Date('2026-11-08T10:00:00Z') } });
    const ann2 = client(b2); ann2.cookie = w.c.ann.cookie;
    const [x, y] = [await begin(w), await ann2.call('POST', `${w.base}/settlement/batches/${w.bid}/execution/attempts/begin`, { initiator: w.id.ann })];
    assert.deepEqual([x.status, y.status], [201, 409]); assert.equal(count(w, 'settlement_attempts'), 1);
    adv(w, 1, 'signing');
    assert.throws(() => b2.registry.advanceExecutionAttempt(ann(w), w.org, w.sid, w.bid, 1, 'submitted', { detail: 'x' }), /cannot move from signing to submitted/, 'the second connection sees the first connection\'s state');
    b2.registry.advanceExecutionAttempt(ann(w), w.org, w.sid, w.bid, 1, 'signed', { detail: 'second connection signs off' });
    assert.equal((await attempts(w))['attempts'][0].state, 'signed');
    b2.db.close();
  } finally { t.cleanup(); }
});

test('atomicity: a failed advance or begin leaves nothing behind', async () => {
  const w = await world(); await begin(w); adv(w, 1, 'signing'); adv(w, 1, 'signed');
  const before = [count(w, 'settlement_attempt_events'), count(w, 'settlement_attempt_transactions'), count(w, 'activity')];
  assert.throws(() => w.b.db.tx(() => { adv(w, 1, 'submission-pending', { tx: { hash: H1, step: 1 } }); throw new Error('boom'); }), /boom/);
  assert.deepEqual([count(w, 'settlement_attempt_events'), count(w, 'settlement_attempt_transactions'), count(w, 'activity')], before, 'the recorded hash, the event and the activity rolled back together');
  const ok = adv(w, 1, 'submission-pending', { tx: { hash: H1, step: 1 } }); assert.equal(ok.changed, true);
});

test('migration 6 upgrades a version-5 database in place and keeps its data', async () => {
  const { openDatabase, migrate, MIGRATIONS } = await import('../lib/db/database.ts');
  const db = openDatabase(':memory:'); migrate(db, undefined, MIGRATIONS.slice(0, 5));
  db.raw.exec(`INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ('usr_1', 'a@x.test', 'A', 'h', 't');
    INSERT INTO organizations (id, name, visibility, created_at, created_by) VALUES ('org_1', 'Org', 'private', 't', 'usr_1');`);
  assert.equal(migrate(db).current, 7);
  assert.equal((db.raw.prepare('SELECT count(*) AS n FROM organizations').get() as { n: number }).n, 1);
  for (const t of ['settlement_attempts', 'settlement_attempt_events', 'settlement_attempt_transactions']) assert.equal((db.raw.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n, 0, t);
});
