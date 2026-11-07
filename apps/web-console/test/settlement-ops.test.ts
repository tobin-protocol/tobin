// Settlement PREPARATION through the real HTTP handlers, real SQLite, real AuthService (MVP-1.4). Nothing here signs, submits or settles. Same-author tests; the
// concurrency tests run sequentially in one process across two connections (not true multi-process contention).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackend } from '../lib/server/backend.ts';
import { SqliteRegistryStore } from '../lib/registry/sqlite-store.ts';
import { encodeAddress } from 'tobin-mvp1-sdk/strkey';
import { client, makeBackend, signedIn, tempDir } from './backend-helpers.ts';
import type { Backend } from '../lib/server/backend.ts';

type C = Awaited<ReturnType<typeof signedIn>>;
type N = 'ann' | 'bob' | 'cat' | 'dan' | 'rae' | 'eve';
const me = async (c: C) => (await c.call('GET', '/api/auth/me')).body['user'].id as string;
const ISS1 = encodeAddress('account', new Uint8Array(32).fill(1)), ISS2 = encodeAddress('account', new Uint8Array(32).fill(2)); // valid strkeys, test fixtures only, not real issuers
const USD1 = `testnet:USD:${ISS1}`;

interface W { b: Backend; c: Record<N, C>; id: Record<N, string>; org: string; sid: string; base: string; ob: string[]; asset: string }
interface Opts { path?: string; approve?: boolean; assets?: 'one' | 'none' | 'disabled' | 'two'; amounts?: [string, string, string]; calculate?: boolean }
/**
 * ann: administrator who records and calculates. dan: second administrator. bob and rae: reviewers. cat: plain member. eve: outsider.
 * Ring ann->bob, bob->cat, cat->ann (100/80/70 by default: nets ann +30, bob -20, cat -10). By default bob approves the calculation.
 */
async function world(o: Opts = {}): Promise<W> {
  const { b } = makeBackend(o.path ?? ':memory:');
  const store = new SqliteRegistryStore(b.db);
  const kind = o.assets ?? 'one';
  if (kind !== 'none') store.putAsset({ id: USD1, network: 'testnet', kind: 'issued', code: 'USD', issuer: ISS1, status: kind === 'disabled' ? 'disabled' : 'supported', source: 'operator-configured', addedAt: 't' });
  if (kind === 'two') store.putAsset({ id: `testnet:USD:${ISS2}`, network: 'testnet', kind: 'issued', code: 'USD', issuer: ISS2, status: 'supported', source: 'operator-configured', addedAt: 't' });
  const c = {} as Record<N, C>; const id = {} as Record<N, string>;
  for (const n of ['ann', 'bob', 'cat', 'dan', 'rae', 'eve'] as N[]) { c[n] = await signedIn(b, n); id[n] = await me(c[n]); }
  const org = (await c.ann.call('POST', '/api/registry/orgs', { name: 'Alpha Bank' })).body['organization'].id as string;
  for (const [n, role] of [['bob', 'member'], ['cat', 'member'], ['rae', 'member'], ['dan', 'admin']] as const) {
    const inv = await c.ann.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: `${n}@example.test`, role });
    assert.equal((await c[n].call('POST', '/api/registry/invitations/accept', { token: inv.body['token'] })).status, 200);
  }
  for (const n of ['bob', 'rae'] as N[]) await c.ann.call('POST', `/api/registry/orgs/${org}/reviewers/${id[n]}/grant`, {});
  const sid = (await c.ann.call('POST', `/api/registry/orgs/${org}/sessions`, { label: 'Run' })).body['session'].sessionId as string;
  const base = `/api/registry/orgs/${org}/sessions/${sid}`;
  for (const n of ['ann', 'bob', 'cat'] as N[]) await c.ann.call('POST', `${base}/participants`, { userId: id[n] });
  const amts = o.amounts ?? ['100', '80', '70']; const ob: string[] = [];
  const canonical = kind === 'one' || kind === 'two'; // with no supported asset configured only the legacy code path exists
  const assetFields = canonical ? { assetRef: USD1 } : { asset: 'USD' };
  for (const [i, [d, cr]] of ([['ann', 'bob'], ['bob', 'cat'], ['cat', 'ann']] as const).entries()) { const rr = await c.ann.call('POST', `${base}/obligations`, { debtor: id[d], creditor: id[cr], amount: amts[i], ...assetFields }); assert.equal(rr.status, 201, JSON.stringify(rr.body)); ob.push(rr.body['obligationId']); }
  if (o.calculate !== false) {
    await c.ann.call('POST', `${base}/calculate`, {});
    if (o.approve !== false) await c.bob.call('POST', `${base}/authorization/approve`, { calculationId: (await c.bob.call('GET', `${base}/authorization`)).body['calculationId'] });
  }
  return { b, c, id, org, sid, base, ob, asset: USD1 };
}
const calcId = async (w: W) => (await w.c.bob.call('GET', `${w.base}/authorization`)).body['calculationId'] as string;
const prepare = async (w: W, who: N = 'ann', calculationId?: string, extra: Record<string, unknown> = {}) => w.c[who].call('POST', `${w.base}/settlement/prepare`, { calculationId: calculationId ?? (await calcId(w)), ...extra });
const forceClose = (w: W) => { w.b.db.raw.prepare("UPDATE sessions SET workflow_state = 'closed' WHERE session_id = ?").run(w.sid); };
const list = async (w: W, who: N = 'ann') => (await w.c[who].call('GET', `${w.base}/settlement`)).body;
const batchGet = async (w: W, bid: string, who: N = 'rae') => (await w.c[who].call('GET', `${w.base}/settlement/batches/${bid}`)).body;
const decide = async (w: W, bid: string, kind: 'approve' | 'reject', who: N = 'rae', over: Record<string, unknown> = {}) => {
  const hash = (await batchGet(w, bid, who))['batch']?.instructionsHash;
  return w.c[who].call('POST', `${w.base}/settlement/batches/${bid}/${kind}`, { instructionsHash: hash, ...(kind === 'reject' ? { reason: 'amounts disputed' } : {}), ...over });
};
const kinds = async (w: W) => (await w.c.ann.call('GET', w.base)).body['workspace'].activity.items.map((a: { kind: string }) => a.kind) as string[];
const count = (w: W, t: string) => (w.b.db.raw.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
const prepared = async (w: W) => { const r = await prepare(w); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body['batchId'] as string; };

test('happy path: an approved calculation becomes a validated batch whose instructions reconcile to the net positions', async () => {
  const w = await world();
  const pre = await list(w);
  assert.equal(pre['preview'].ready, true, JSON.stringify(pre['preview'].checks.filter((c: { ok: boolean }) => !c.ok))); assert.ok(pre['preview'].checks.every((c: { ok: boolean }) => c.ok), JSON.stringify(pre['preview'].checks));
  assert.match(pre['note'], /not signed, not submitted and not settled/);
  const bid = await prepared(w);
  const v = await batchGet(w, bid);
  assert.equal(v['status'], 'awaiting-review'); assert.equal(v['batch'].asset.id, USD1); assert.equal(v['batch'].instructionCount, 2); assert.equal(v['batch'].totalAmount, '30');
  assert.equal(v['batch'].calculationId, await calcId(w)); assert.equal(v['batch'].preparedBy, 'ann');
  const ins = v['instructions'].map((i: { payerName: string; payeeName: string; amount: string }) => `${i.payerName}>${i.payeeName}:${i.amount}`).sort();
  assert.deepEqual(ins, ['ann>bob:20', 'ann>cat:10'], 'ann owes 30 net; bob is owed 20, cat is owed 10');
  for (const i of v['instructions']) { assert.equal(i.validation, 'valid'); assert.equal(i.assetId, USD1); assert.equal(i.sessionId, w.sid); assert.equal(i.calculationId, v['batch'].calculationId); assert.equal(i.batchId, bid); assert.match(i.id, /^ins_[0-9a-f]{24}$/); }
  assert.ok(v['validation'].every((c: { ok: boolean }) => c.ok), JSON.stringify(v['validation'].filter((c: { ok: boolean }) => !c.ok)));
  assert.match(v['note'], /no funds have moved/);
  const l = await list(w); assert.equal(l['batches'].length, 1); assert.equal(l['batches'][0].status, 'awaiting-review');
  assert.ok((await kinds(w)).includes('settlement.batch-prepared'));
});

test('preconditions: every missing or invalid prerequisite refuses preparation and writes nothing', async () => {
  const none = await world({ calculate: false });
  assert.equal((await none.c.ann.call('POST', `${none.base}/settlement/prepare`, { calculationId: 'calc_x' })).status, 404, 'no calculation exists');
  const noApproval = await world({ approve: false });
  let r = await prepare(noApproval); assert.equal(r.status, 409); assert.match(r.body['message'], /active institutional approval/);
  assert.equal((await list(noApproval))['preview'].ready, false);
  const rejected = await world({ approve: false });
  await rejected.c.bob.call('POST', `${rejected.base}/authorization/reject`, { calculationId: await calcId(rejected), reason: 'no' });
  r = await prepare(rejected); assert.equal(r.status, 409); assert.match(r.body['message'], /active institutional approval/);
  const stale = await world(); const oldId = await calcId(stale);
  await stale.c.ann.call('POST', `${stale.base}/obligations/${stale.ob[0]}/update`, { amount: '120' });
  r = await prepare(stale, 'ann', oldId); assert.equal(r.status, 409, 'a stale calculation, and so an invalidated approval, cannot be prepared');
  await stale.c.ann.call('POST', `${stale.base}/calculate`, {});
  r = await prepare(stale); assert.equal(r.status, 409, 'a fresh calculation is not approved yet'); assert.match(r.body['message'], /active institutional approval/);
  r = await prepare(stale, 'ann', oldId); assert.equal(r.status, 409); assert.equal(r.body['error'], 'STALE', 'a superseded calculation id');
  const closed = await world(); forceClose(closed);
  r = await prepare(closed); assert.equal(r.status, 409); assert.match(r.body['message'], /not closed/);
  for (const w of [none, noApproval, rejected, stale, closed]) assert.equal(count(w, 'settlement_batches') + count(w, 'settlement_instructions'), 0);
});

test('asset registry: an unregistered, disabled or ambiguous asset cannot be prepared; a code alone is never an identity', async () => {
  for (const [kind, text] of [['none', /no canonical asset identity/], ['disabled', /no canonical asset identity/]] as const) {
    const w = await world({ assets: kind });
    const pv = await list(w); assert.equal(pv['preview'].ready, false);
    const r = await prepare(w); assert.equal(r.status, 409, kind); assert.match(r.body['message'], text, kind);
    assert.equal(count(w, 'settlement_batches'), 0);
  }
  // two supported assets with the SAME code and different issuers are two different assets: each obligation names its own identity, so nothing is ambiguous, and they never mix
  const two = await world({ assets: 'two' });
  assert.equal((await prepare(two)).status, 201, 'a canonical identity resolves exactly even though the code is shared');
  const mix = await two.c.ann.call('POST', `${two.base}/obligations`, { debtor: two.id.ann, creditor: two.id.bob, amount: '1', assetRef: `testnet:USD:${ISS2}` });
  assert.equal(mix.status, 400); assert.match(mix.body['message'], /different asset identity|only|nets/);
  const w = await world();
  const a = await w.c.cat.call('GET', '/api/registry/assets'); assert.equal(a.status, 200); assert.equal(a.body['assets'][0].id, USD1); assert.match(a.body['note'], /not an on-chain query/);
  for (const m of ['POST', 'PUT']) assert.equal((await w.c.ann.call(m, '/api/registry/assets', { id: 'x', code: 'USD' })).status, 404, `the API cannot change the registry (${m})`);
  const anon = await signedIn(w.b, 'zed'); anon.cookie = ''; assert.equal((await anon.call('GET', '/api/registry/assets')).status, 401);
});

test('the client cannot override the server: amounts, asset, participants, instructions and ids in the body are ignored', async () => {
  const w = await world();
  const r = await prepare(w, 'ann', undefined, { amount: '999999', asset: 'EUR', participants: [w.id.eve], instructions: [{ payer: w.id.eve, payee: w.id.ann, amount: '1' }], netPositions: [], status: 'approved', preparedBy: w.id.eve, id: 'bat_forged', assetId: 'public:native' });
  assert.equal(r.status, 201);
  const v = await batchGet(w, r.body['batchId']);
  assert.equal(v['batch'].asset.id, USD1); assert.equal(v['batch'].totalAmount, '30'); assert.equal(v['batch'].preparedBy, 'ann'); assert.notEqual(v['batch'].id, 'bat_forged'); assert.equal(v['status'], 'awaiting-review');
  assert.ok(v['instructions'].every((i: { payerName: string }) => i.payerName === 'ann'));
  const w2 = await world();
  assert.equal((await w2.c.ann.call('POST', `${w2.base}/settlement/prepare`, {})).status, 400, 'the calculation must be named');
  assert.equal((await w2.c.ann.call('POST', `${w2.base}/settlement/prepare`, { calculationId: 5 })).status, 400);
  assert.equal((await prepare(w2, 'ann', 'calc_000000000000000000')).status, 404);
});

test('authorization: only administrators prepare; only reviewers decide; outsiders see nothing; header and session required', async () => {
  const w = await world();
  assert.equal((await prepare(w, 'cat')).status, 403, 'a member'); assert.equal((await prepare(w, 'rae')).status, 403, 'a reviewer who is not an administrator');
  assert.equal((await prepare(w, 'bob')).status, 403);
  const ghost = await w.c.eve.call('GET', `/api/registry/orgs/org_doesnotexist/sessions/${w.sid}/settlement`);
  const bid = await prepared(w);
  const hash = (await batchGet(w, bid))['batch'].instructionsHash;
  for (const [m, p, body] of [['GET', 'settlement'], ['POST', 'settlement/prepare', { calculationId: await calcId(w) }], ['GET', `settlement/batches/${bid}`], ['GET', `settlement/batches/${bid}/validation`], ['POST', `settlement/batches/${bid}/approve`, { instructionsHash: hash }], ['POST', `settlement/batches/${bid}/reject`, { instructionsHash: hash, reason: 'x' }]] as const) {
    const x = await w.c.eve.call(m, `${w.base}/${p}`, body); assert.equal(x.status, 404, p); assert.deepEqual(x.body, ghost.body, 'identical to a nonexistent organization');
  }
  assert.equal((await decide(w, bid, 'approve', 'cat')).status, 403, 'a plain member cannot decide'); assert.equal((await decide(w, bid, 'reject', 'dan')).status, 403, 'an administrator is not a reviewer by default');
  const anon = await signedIn(w.b, 'zed'); anon.cookie = '';
  assert.equal((await anon.call('GET', `${w.base}/settlement`)).status, 401);
  assert.equal((await w.c.ann.call('POST', `${w.base}/settlement/prepare`, { calculationId: await calcId(w) }, {}, false)).status, 403, 'request header required');
  assert.equal((await w.c.rae.call('GET', `${w.base}/settlement/batches/${bid}/approve`)).status, 404, 'approving is not a GET');
  // another session of the same organization cannot reach the batch
  const other = (await w.c.ann.call('POST', `/api/registry/orgs/${w.org}/sessions`, { label: 'Second' })).body['session'].sessionId as string;
  assert.equal((await w.c.ann.call('GET', `/api/registry/orgs/${w.org}/sessions/${other}/settlement/batches/${bid}`)).status, 404);
  assert.equal((await w.c.rae.call('POST', `/api/registry/orgs/${w.org}/sessions/${other}/settlement/batches/${bid}/approve`, { instructionsHash: hash })).status, 404);
  assert.equal((await list(w, 'rae'))['batches'].length, 1, 'but members of the organization can read');
});

test('batch review: bound to the exact batch and its instruction fingerprint; rejection needs a reason; one decision only', async () => {
  const w = await world(); const bid = await prepared(w);
  assert.equal((await w.c.rae.call('POST', `${w.base}/settlement/batches/${bid}/approve`, {})).status, 400, 'the fingerprint must be named');
  const wrong = await w.c.rae.call('POST', `${w.base}/settlement/batches/${bid}/approve`, { instructionsHash: 'f'.repeat(64) }); assert.equal(wrong.status, 409); assert.equal(wrong.body['error'], 'STALE');
  for (const reason of ['', '   ', 'x'.repeat(501), 5, null]) assert.equal((await decide(w, bid, 'reject', 'rae', { reason })).status, 400, String(reason));
  assert.equal((await w.c.rae.call('POST', `${w.base}/settlement/batches/${bid}/reject`, { instructionsHash: (await batchGet(w, bid)).batch.instructionsHash })).status, 400, 'no reason at all');
  assert.equal((await batchGet(w, bid))['status'], 'awaiting-review', 'failed attempts left no trace');
  const ok = await decide(w, bid, 'approve', 'rae'); assert.equal(ok.status, 201); assert.equal(ok.body['status'], 'approved');
  assert.equal(ok.body['review'].decidedBy, 'rae'); assert.ok(ok.body['review'].decidedAt); assert.match(ok.body['note'], /not a Stellar signature/);
  for (const x of [await decide(w, bid, 'approve', 'rae'), await decide(w, bid, 'approve', 'bob'), await decide(w, bid, 'reject', 'bob')]) { assert.equal(x.status, 409); assert.equal(x.body['error'], 'EXISTS'); }
  assert.equal(count(w, 'settlement_batch_reviews'), 1);
  assert.ok((await kinds(w)).includes('settlement.batch-approved'));
  // rejection path on a second world
  const w2 = await world(); const b2 = await prepared(w2);
  const rej = await decide(w2, b2, 'reject', 'bob'); assert.equal(rej.status, 201); assert.equal(rej.body['status'], 'rejected'); assert.equal(rej.body['review'].reason, 'amounts disputed');
  assert.equal((await decide(w2, b2, 'approve', 'rae')).status, 409, 'a rejected batch cannot be flipped to approved');
  assert.ok((await kinds(w2)).includes('settlement.batch-rejected'));
});

test('separation of duties: whoever prepared the batch cannot decide on it', async () => {
  const w = await world();
  await w.c.ann.call('POST', `/api/registry/orgs/${w.org}/reviewers/${w.id.ann}/grant`, {});
  const bid = await prepared(w);
  const v = await batchGet(w, bid, 'ann'); assert.equal(v['eligibility'].canDecide, false); assert.match(v['eligibility'].reasons.join(' '), /you prepared this batch/);
  for (const k of ['approve', 'reject'] as const) { const r = await decide(w, bid, k, 'ann'); assert.equal(r.status, 403); assert.equal(r.body['error'], 'SEPARATION_OF_DUTIES'); }
  assert.equal((await batchGet(w, bid, 'rae'))['eligibility'].canDecide, true);
  assert.equal((await decide(w, bid, 'approve', 'bob')).status, 201, 'the calculation approver may review a batch someone else prepared');
});

test('source changes and recalculation make a batch ineligible; history is kept; approval is never transferred', async () => {
  for (const [label, change] of [
    ['edit', (w: W) => w.c.ann.call('POST', `${w.base}/obligations/${w.ob[0]}/update`, { amount: '101' })],
    ['void', (w: W) => w.c.ann.call('POST', `${w.base}/obligations/${w.ob[2]}/void`, {})],
    ['participant', (w: W) => w.c.ann.call('POST', `${w.base}/participants`, { userId: w.id.rae })],
    ['recalculate', (w: W) => w.c.ann.call('POST', `${w.base}/calculate`, {})],
  ] as const) {
    const w = await world(); const bid = await prepared(w); await decide(w, bid, 'approve', 'rae');
    assert.equal((await change(w)).status < 300, true, label);
    const v = await batchGet(w, bid);
    assert.ok(['invalidated', 'superseded'].includes(v['status']), `${label}: ${v['status']}`);
    assert.ok(v['invalidation'].cause, label); assert.equal(v['review'].decision, 'approved', `${label}: the historical decision stays readable`);
    assert.ok((await kinds(w)).includes('settlement.batch-invalidated'), label);
    assert.equal((await decide(w, bid, 'approve', 'bob')).status, 409, label);
    assert.equal((await prepare(w, 'ann', undefined, { attempt: 2 })).status, 409, `${label}: no new batch until the new calculation is approved`);
    assert.equal(count(w, 'settlement_batches'), 1, `${label}: nothing was deleted or rewritten`);
  }
  // after recalculation and a fresh approval a NEW batch is prepared; the old one stays as history
  const w = await world(); const first = await prepared(w); await decide(w, first, 'approve', 'rae');
  await w.c.ann.call('POST', `${w.base}/calculate`, {}); const cid = await calcId(w);
  await w.c.bob.call('POST', `${w.base}/authorization/approve`, { calculationId: cid });
  const second = await prepared(w); assert.notEqual(second, first);
  const l = await list(w); assert.deepEqual(l['batches'].map((x: { status: string }) => x.status), ['invalidated', 'awaiting-review']);
  assert.equal((await batchGet(w, second))['review'], undefined, 'the new batch did not inherit the old approval');
  assert.equal(count(w, 'settlement_batches'), 2);
});

test('duplicate requests produce one batch, deterministically', async () => {
  const w = await world();
  assert.equal((await prepare(w)).status, 201);
  const noAttempt = await prepare(w); assert.equal(noAttempt.status, 400); assert.match(noAttempt.body['message'], /name the attempt number/);
  for (const who of ['ann', 'dan'] as N[]) { const r = await prepare(w, who, undefined, { attempt: 1 }); assert.equal(r.status, 409); assert.equal(r.body['error'], 'EXISTS', 'a repeat of attempt 1 is a duplicate'); }
  const live = await prepare(w, 'ann', undefined, { attempt: 2 }); assert.equal(live.status, 409); assert.match(live.body['message'], /active batch/, 'while a batch is awaiting review, no second one is made');
  assert.equal(count(w, 'settlement_batches'), 1); assert.equal(count(w, 'settlement_instructions'), 2);
});

test('a decision on a closed session is refused', async () => {
  const w = await world(); const bid = await prepared(w);
  forceClose(w);
  const r = await decide(w, bid, 'approve', 'rae'); assert.equal(r.status, 409); assert.match(r.body['message'], /closed/);
  assert.equal((await batchGet(w, bid))['eligibility'].canDecide, false);
});

test('zero-net calculations prepare an empty batch that still reconciles', async () => {
  const w = await world({ amounts: ['10', '10', '10'] });
  const bid = await prepared(w); const v = await batchGet(w, bid);
  assert.equal(v['batch'].instructionCount, 0); assert.equal(v['batch'].totalAmount, '0'); assert.deepEqual(v['instructions'], []);
  assert.ok(v['validation'].every((c: { ok: boolean }) => c.ok));
  assert.equal((await decide(w, bid, 'approve', 'rae')).status, 201);
});

test('immutability and constraints hold against direct database writes', async () => {
  const w = await world(); const bid = await prepared(w); await decide(w, bid, 'approve', 'rae');
  const db = w.b.db.raw;
  for (const sql of ["UPDATE settlement_batches SET total_amount = '1'", 'DELETE FROM settlement_batches', "UPDATE settlement_instructions SET amount = '1'", 'DELETE FROM settlement_instructions', "UPDATE settlement_batch_reviews SET decision = 'rejected'", 'DELETE FROM settlement_batch_reviews']) assert.throws(() => db.prepare(sql).run(), /immutable/, sql);
  const ins = db.prepare('SELECT * FROM settlement_instructions LIMIT 1').get() as Record<string, string>;
  const put = (over: Record<string, unknown>) => { const r = { ...ins, id: 'ins_x' + Math.random().toString(16).slice(2, 10), seq: 9, ...over } as unknown as Record<string, string>; db.prepare('INSERT INTO settlement_instructions (id, batch_id, session_id, calculation_id, seq, payer, payee, asset_id, amount) VALUES (?,?,?,?,?,?,?,?,?)').run(r['id']!, r['batch_id']!, r['session_id']!, r['calculation_id']!, Number(r['seq']), r['payer']!, r['payee']!, r['asset_id']!, r['amount']!); };
  assert.throws(() => put({ amount: '0' }), /CHECK/); assert.throws(() => put({ amount: '-3' }), /CHECK/); assert.throws(() => put({ payee: ins['payer'] }), /CHECK/);
  assert.throws(() => put({ calculation_id: 'calc_other', payee: 'usr_zzz' }), /FOREIGN KEY/, 'an instruction must carry its own batch binding'); assert.throws(() => put({ batch_id: 'bat_none', payee: 'usr_zzz' }), /FOREIGN KEY/);
  assert.throws(() => put({ seq: 1, id: 'ins_dupseq', payee: 'usr_zzz' }), /UNIQUE/);
  const calc = (db.prepare('SELECT calculation_id FROM settlement_batches').get() as { calculation_id: string }).calculation_id;
  assert.throws(() => db.prepare("INSERT INTO settlement_batches (id, session_id, org_id, calculation_id, asset_id, asset_network, asset_kind, asset_code, instruction_count, total_amount, instructions_hash, algorithm, validation_json, prepared_by, prepared_at) SELECT 'bat_dup', session_id, org_id, calculation_id, asset_id, asset_network, asset_kind, asset_code, 0, '0', instructions_hash, algorithm, '[]', prepared_by, 't' FROM settlement_batches").run(), /UNIQUE/, 'one batch per calculation');
  void calc;
  assert.throws(() => db.prepare("INSERT INTO settlement_batch_reviews (id, batch_id, decision, reason, decided_by, decided_at) VALUES ('brv_x', ?, 'rejected', ' ', ?, 't')").run(bid, w.id.rae), /CHECK|UNIQUE/);
  // the asset registry's own constraints
  const asset = (a: Record<string, unknown>) => db.prepare('INSERT INTO supported_assets (id, network, kind, code, issuer, status, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(a['id'] as string, a['network'] as string, a['kind'] as string, a['code'] as string, (a['issuer'] ?? null) as string | null, 'supported', 't');
  assert.throws(() => asset({ id: 'testnet:native', network: 'testnet', kind: 'native', code: 'USD' }), /CHECK/, 'native must be XLM');
  assert.throws(() => asset({ id: 'testnet:USD', network: 'testnet', kind: 'issued', code: 'USD' }), /CHECK/, 'issued needs an issuer');
  assert.throws(() => asset({ id: 'testnet:USD:bad', network: 'testnet', kind: 'issued', code: 'USD', issuer: 'GBAD' }), /CHECK/);
  assert.throws(() => asset({ id: 'wrong', network: 'testnet', kind: 'issued', code: 'EUR', issuer: ISS1 }), /CHECK/, 'the id must be canonical');
  assert.throws(() => asset({ id: 'mainnet:native', network: 'mainnet', kind: 'native', code: 'XLM' }), /CHECK/);
  asset({ id: 'testnet:native', network: 'testnet', kind: 'native', code: 'XLM' });
});

test('atomicity: a failure inside preparation or review leaves nothing behind', async () => {
  const w = await world(); const cid = await calcId(w);
  const before = [count(w, 'settlement_batches'), count(w, 'settlement_instructions'), count(w, 'activity')];
  assert.throws(() => w.b.db.tx(() => { w.b.registry.prepareSettlementBatch({ userId: w.id.ann, kind: 'verified' }, w.org, w.sid, { calculationId: cid }); throw new Error('boom'); }), /boom/);
  assert.deepEqual([count(w, 'settlement_batches'), count(w, 'settlement_instructions'), count(w, 'activity')], before, 'batch, instructions and activity roll back together');
  const bid = await prepared(w); const hash = (await batchGet(w, bid))['batch'].instructionsHash;
  const r0 = count(w, 'settlement_batch_reviews'); const a0 = count(w, 'activity');
  assert.throws(() => w.b.db.tx(() => { w.b.registry.decideSettlementBatch({ userId: w.id.rae, kind: 'verified' }, w.org, w.sid, bid, 'approved', { instructionsHash: hash }); throw new Error('boom'); }), /boom/);
  assert.deepEqual([count(w, 'settlement_batch_reviews'), count(w, 'activity')], [r0, a0]);
  assert.equal((await decide(w, bid, 'approve', 'rae')).status, 201, 'a clean attempt still works');
});

test('concurrency across two connections to one file: one preparation and one decision win; a change on one connection invalidates the other view', async () => {
  const t = tempDir();
  try {
    const w = await world({ path: t.path });
    const b2 = createBackend(t.path, { auth: { now: () => new Date('2026-11-08T10:00:00Z'), scryptCost: 10 }, secureCookies: true, clock: { now: () => new Date('2026-11-08T10:00:00Z') } });
    const cid = await calcId(w);
    const dan2 = client(b2); dan2.cookie = w.c.dan.cookie;
    const [p1, p2] = [await w.c.ann.call('POST', `${w.base}/settlement/prepare`, { calculationId: cid, attempt: 1 }), await dan2.call('POST', `${w.base}/settlement/prepare`, { calculationId: cid, attempt: 1 })];
    assert.deepEqual([p1.status, p2.status], [201, 409]); assert.equal(count(w, 'settlement_batches'), 1);
    const bid = p1.body['batchId'] as string; const hash = (await batchGet(w, bid))['batch'].instructionsHash;
    const bob2 = client(b2); bob2.cookie = w.c.bob.cookie;
    const [d1, d2] = [await w.c.rae.call('POST', `${w.base}/settlement/batches/${bid}/approve`, { instructionsHash: hash }), await bob2.call('POST', `${w.base}/settlement/batches/${bid}/reject`, { instructionsHash: hash, reason: 'late' })];
    assert.deepEqual([d1.status, d2.status], [201, 409]); assert.equal(count(w, 'settlement_batch_reviews'), 1);
    const ann2 = client(b2); ann2.cookie = w.c.ann.cookie;
    assert.equal((await ann2.call('POST', `${w.base}/obligations/${w.ob[0]}/update`, { amount: '555' })).status, 200);
    assert.equal((await batchGet(w, bid))['status'], 'invalidated', 'the other connection sees the batch as no longer eligible');
    b2.db.close();
  } finally { t.cleanup(); }
});

test('activity: preparation, decisions and invalidation are recorded, readable and immutable; persistence across reopen', async () => {
  const t = tempDir();
  try {
    const w = await world({ path: t.path }); const bid = await prepared(w); await decide(w, bid, 'approve', 'rae');
    await w.c.ann.call('POST', `${w.base}/obligations/${w.ob[0]}/update`, { amount: '120' });
    const items = (await w.c.ann.call('GET', w.base)).body['workspace'].activity.items as { kind: string; actor: string; detail: string }[];
    const k = items.map((a) => a.kind);
    for (const x of ['settlement.batch-prepared', 'settlement.batch-approved', 'settlement.batch-invalidated']) assert.ok(k.includes(x), x);
    assert.match(items.find((a) => a.kind === 'settlement.batch-prepared')!.detail, /2 instruction\(s\), USD, total 30/);
    assert.equal(items.find((a) => a.kind === 'settlement.batch-approved')!.actor, 'rae');
    assert.throws(() => w.b.db.raw.prepare("UPDATE activity SET detail = 'x'").run(), /immutable/);
    const cookie = w.c.ann.cookie; w.b.db.close();
    const b2 = createBackend(t.path, { auth: { now: () => new Date('2026-11-08T10:30:00Z'), scryptCost: 10 }, secureCookies: true, clock: { now: () => new Date('2026-11-08T10:30:00Z') } });
    const ann2 = client(b2); ann2.cookie = cookie;
    const l = (await ann2.call('GET', `${w.base}/settlement`)).body;
    assert.equal(l['batches'].length, 1); assert.equal(l['batches'][0].status, 'invalidated'); assert.equal(l['batches'][0].decision.decision, 'approved');
    b2.db.close();
  } finally { t.cleanup(); }
});

test('migration 4 upgrades a version-3 database in place and keeps its data', async () => {
  const { openDatabase, migrate, MIGRATIONS } = await import('../lib/db/database.ts');
  const db = openDatabase(':memory:'); migrate(db, undefined, MIGRATIONS.slice(0, 3));
  db.raw.exec(`INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ('usr_1', 'a@x.test', 'A', 'h', 't');
    INSERT INTO organizations (id, name, visibility, created_at, created_by) VALUES ('org_1', 'Org', 'private', 't', 'usr_1');
    INSERT INTO memberships (org_id, user_id, role, since) VALUES ('org_1', 'usr_1', 'admin', 't');`);
  assert.equal(migrate(db).current, 8);
  assert.equal((db.raw.prepare('SELECT count(*) AS n FROM memberships').get() as { n: number }).n, 1);
  for (const t of ['supported_assets', 'settlement_batches', 'settlement_instructions', 'settlement_batch_reviews', 'settlement_batch_invalidations']) assert.equal((db.raw.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n, 0, t);
});
