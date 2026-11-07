// The three approved product decisions and the stabilized instruction contract (MVP-1.5 preparation work): canonical asset identity on obligations and snapshots with
// a legacy path that never guesses, re-preparation of a rejected batch, operational session closure, instruction contract v1, and a populated v4 -> v5 migration.
// Real HTTP handlers, real SQLite. Nothing here signs, submits or settles. Same-author tests.
import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAddress } from 'tobin-mvp1-sdk/strkey';
import { SqliteRegistryStore } from '../lib/registry/sqlite-store.ts';
import { instructionFingerprint } from '../lib/registry/settlement.ts';
import { makeBackend, signedIn } from './backend-helpers.ts';
import type { Backend } from '../lib/server/backend.ts';

type C = Awaited<ReturnType<typeof signedIn>>;
type N = 'ann' | 'bob' | 'cat' | 'rae';
const ISS1 = encodeAddress('account', new Uint8Array(32).fill(1)), ISS2 = encodeAddress('account', new Uint8Array(32).fill(2)); // valid strkeys, fixtures only
const USD1 = `testnet:USD:${ISS1}`, USD2 = `testnet:USD:${ISS2}`;
const me = async (c: C) => (await c.call('GET', '/api/auth/me')).body['user'].id as string;

interface W { b: Backend; c: Record<N, C>; id: Record<N, string>; org: string; sid: string; base: string; ob: string[] }
/** ann (administrator) records and calculates; bob and rae are reviewers; cat is a participant. mode: 'canonical' (registry configured, assetRef) or 'legacy' (no registry, code only). */
async function world(mode: 'canonical' | 'legacy', approveCalc = true): Promise<W> {
  const { b } = makeBackend();
  const store = new SqliteRegistryStore(b.db);
  if (mode === 'canonical') for (const [iss, id] of [[ISS1, USD1], [ISS2, USD2]] as const) store.putAsset({ id, network: 'testnet', kind: 'issued', code: 'USD', issuer: iss, status: 'supported', source: 'operator-configured', addedAt: 't' });
  const c = {} as Record<N, C>; const id = {} as Record<N, string>;
  for (const n of ['ann', 'bob', 'cat', 'rae'] as N[]) { c[n] = await signedIn(b, n); id[n] = await me(c[n]); }
  const org = (await c.ann.call('POST', '/api/registry/orgs', { name: 'Alpha Bank' })).body['organization'].id as string;
  for (const n of ['bob', 'cat', 'rae'] as const) { const inv = await c.ann.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: `${n}@example.test`, role: 'member' }); await c[n].call('POST', '/api/registry/invitations/accept', { token: inv.body['token'] }); }
  for (const n of ['bob', 'rae'] as const) await c.ann.call('POST', `/api/registry/orgs/${org}/reviewers/${id[n]}/grant`, {});
  const sid = (await c.ann.call('POST', `/api/registry/orgs/${org}/sessions`, { label: 'Run' })).body['session'].sessionId as string;
  const base = `/api/registry/orgs/${org}/sessions/${sid}`;
  for (const n of ['ann', 'bob', 'cat'] as N[]) await c.ann.call('POST', `${base}/participants`, { userId: id[n] });
  const ob: string[] = [];
  for (const [d, cr, amt] of [['ann', 'bob', '100'], ['bob', 'cat', '80'], ['cat', 'ann', '70']] as const) {
    const r = await c.ann.call('POST', `${base}/obligations`, { debtor: id[d], creditor: id[cr], amount: amt, ...(mode === 'canonical' ? { assetRef: USD1 } : { asset: 'USD' }) });
    assert.equal(r.status, 201, JSON.stringify(r.body)); ob.push(r.body['obligationId']);
  }
  await c.ann.call('POST', `${base}/calculate`, {});
  if (approveCalc) await c.bob.call('POST', `${base}/authorization/approve`, { calculationId: (await c.bob.call('GET', `${base}/authorization`)).body['calculationId'] });
  return { b, c, id, org, sid, base, ob };
}
const calcId = async (w: W) => (await w.c.bob.call('GET', `${w.base}/authorization`)).body['calculationId'] as string;
const prepare = async (w: W, who: N = 'ann', extra: Record<string, unknown> = {}) => w.c[who].call('POST', `${w.base}/settlement/prepare`, { calculationId: await calcId(w), ...extra });
const batch = async (w: W, bid: string, who: N = 'rae') => (await w.c[who].call('GET', `${w.base}/settlement/batches/${bid}`)).body;
const decide = async (w: W, bid: string, kind: 'approve' | 'reject', who: N = 'rae') => w.c[who].call('POST', `${w.base}/settlement/batches/${bid}/${kind}`, { instructionsHash: (await batch(w, bid, who))['batch'].instructionsHash, ...(kind === 'reject' ? { reason: 'Beta Bank disputes the amounts' } : {}) });
const one = (w: W, sql: string, ...p: (string | number)[]) => w.b.db.raw.prepare(sql).get(...p) as Record<string, unknown>;

// ---------------- Decision 1: canonical asset identity ----------------
test('decision 1: with a registry configured, a bare code is refused and the obligation carries the full identity', async () => {
  const w = await world('canonical');
  const post = (body: Record<string, unknown>) => w.c.ann.call('POST', `${w.base}/obligations`, { debtor: w.id.ann, creditor: w.id.bob, amount: '1', ...body });
  const r = await post({ asset: 'USD' }); assert.equal(r.status, 400); assert.match(r.body['message'], /code alone does not identify an asset/);
  for (const [body, what] of [[{ assetRef: 'USD' }, 'not canonical'], [{ assetRef: `testnet:EUR:${ISS1}` }, 'unregistered'], [{ assetRef: `mainnet:USD:${ISS1}` }, 'unknown network'], [{ assetRef: USD1, asset: 'EUR' }, 'code contradicts identity'], [{ assetRef: 5 }, 'not a string'], [{ assetRef: `public:USD:${ISS1}` }, 'Mainnet identity on a Testnet-only registry']] as const) assert.equal((await post(body)).status, 400, what);
  const ok = await post({ assetRef: USD1 }); assert.equal(ok.status, 201);
  const list = (await w.c.ann.call('GET', `${w.base}/obligations`)).body['obligations'];
  assert.ok(list.every((o: { assetRef: string; assetIdentity: string; asset: string }) => o.assetRef === USD1 && o.assetIdentity === 'canonical' && o.asset === 'USD'));
  assert.equal(one(w, 'SELECT asset_identity AS a, asset_ref AS r FROM obligations LIMIT 1')['a'], 'canonical');
});

test('decision 1: the same code from another issuer is a different asset and never mixes in one session', async () => {
  const w = await world('canonical');
  const r = await w.c.ann.call('POST', `${w.base}/obligations`, { debtor: w.id.ann, creditor: w.id.bob, amount: '1', assetRef: USD2 });
  assert.equal(r.status, 400); assert.match(r.body['message'], /different asset identity/);
  const upd = await w.c.ann.call('POST', `${w.base}/obligations/${w.ob[0]}/update`, { assetRef: USD2 });
  assert.equal(upd.status, 400, 'moving one obligation to another issuer while the others stay would mix assets');
});

test('decision 1: snapshots carry the identity, and new snapshots never change old ones', async () => {
  const w = await world('canonical');
  const calc = one(w, 'SELECT asset_ref AS r, asset AS a FROM calculations ORDER BY seq DESC LIMIT 1'); assert.equal(calc['r'], USD1); assert.equal(calc['a'], 'USD');
  assert.throws(() => w.b.db.raw.prepare("UPDATE calculations SET asset_ref = 'x'").run(), /immutable/);
});

test('decision 1: legacy obligations are kept as legacy-unresolved, never guessed, and are blocked from preparation until reconciled by an administrator', async () => {
  const w = await world('legacy');
  assert.ok(((await w.c.ann.call('GET', `${w.base}/obligations`)).body['obligations'] as { assetIdentity: string; assetRef: null }[]).every((o) => o.assetIdentity === 'legacy-unresolved' && o.assetRef === null));
  assert.equal(one(w, 'SELECT asset_ref AS r FROM calculations ORDER BY seq DESC LIMIT 1')['r'], null, 'a legacy snapshot has no identity: nothing is invented');
  // the operator now configures supported assets; the legacy obligations stay legacy and preparation is refused with the reason
  const store = new SqliteRegistryStore(w.b.db);
  store.putAsset({ id: USD1, network: 'testnet', kind: 'issued', code: 'USD', issuer: ISS1, status: 'supported', source: 'operator-configured', addedAt: 't' });
  store.putAsset({ id: USD2, network: 'testnet', kind: 'issued', code: 'USD', issuer: ISS2, status: 'supported', source: 'operator-configured', addedAt: 't' });
  const pre = (await w.c.ann.call('GET', `${w.base}/settlement`)).body['preview'];
  assert.equal(pre.ready, false); assert.match(pre.checks.find((c: { key: string }) => c.key === 'asset').detail, /3 obligation\(s\) have no canonical asset identity/);
  const refused = await prepare(w); assert.equal(refused.status, 409); assert.match(refused.body['message'], /no canonical asset identity/);
  // a bare code is now refused for edits that stay legacy only when creating; reconciliation = an explicit, recorded edit naming the identity
  for (const id of w.ob) assert.equal((await w.c.ann.call('POST', `${w.base}/obligations/${id}/update`, { assetRef: USD1 })).status, 200);
  const acts = ((await w.c.ann.call('GET', w.base)).body['workspace'].activity.items as { kind: string; detail: string }[]).filter((a) => a.kind === 'obligation.updated');
  assert.equal(acts.length, 3); assert.ok(acts.every((a) => /assetRef \(legacy\) -> testnet:USD:/.test(a.detail)), 'each reconciliation is recorded with before and after');
  assert.equal((await w.c.ann.call('GET', `${w.base}/obligations/${w.ob[0]}`)).body['obligation'].revision, 2);
  await w.c.ann.call('POST', `${w.base}/calculate`, {});
  assert.equal(one(w, 'SELECT asset_ref AS r FROM calculations ORDER BY seq DESC LIMIT 1')['r'], USD1);
  assert.equal(one(w, 'SELECT count(*) AS n FROM calculations WHERE asset_ref IS NULL')['n'], 1, 'the historical snapshot was not rewritten');
  await w.c.bob.call('POST', `${w.base}/authorization/approve`, { calculationId: await calcId(w) });
  assert.equal((await prepare(w)).status, 201, 'after reconciliation, preparation works');
});

test('decision 1: the registry is read-only over the API and accepts the Soroban token kind', async () => {
  const w = await world('canonical');
  const store = new SqliteRegistryStore(w.b.db); const TOKEN = encodeAddress('contract', new Uint8Array(32).fill(9));
  store.putAsset({ id: `testnet:contract:${TOKEN}`, network: 'testnet', kind: 'contract', code: 'TTT', contractId: TOKEN, status: 'supported', source: 'operator-configured', addedAt: 't' });
  const a = (await w.c.cat.call('GET', '/api/registry/assets')).body['assets'] as { id: string; kind: string; contractId?: string }[];
  assert.ok(a.some((x) => x.kind === 'contract' && x.contractId === TOKEN));
  assert.throws(() => w.b.db.raw.prepare("INSERT INTO supported_assets (id, network, kind, code, status, added_at) VALUES ('testnet:contract:x', 'testnet', 'contract', 'T', 'supported', 't')").run(), /CHECK/, 'a contract token needs a contract id');
});

// ---------------- Decision 2: re-prepare a rejected batch ----------------
test('decision 2: a rejected batch can be prepared again from the same current, approved calculation; history is preserved', async () => {
  const w = await world('canonical');
  const first = (await prepare(w)).body['batchId'] as string; const b1 = await batch(w, first);
  assert.equal(b1['batch'].attempt, 1);
  assert.equal((await decide(w, first, 'reject', 'rae')).status, 201);
  assert.equal((await batch(w, first))['status'], 'rejected');
  const pre = (await w.c.ann.call('GET', `${w.base}/settlement`)).body['preview'];
  assert.equal(pre.ready, true); assert.match(pre.checks.find((c: { key: string }) => c.key === 'no-batch').detail, /1 earlier batch\(es\) were rejected/);
  const noAttempt = await prepare(w); assert.equal(noAttempt.status, 400, 'a retry must name the attempt: no accidental repeats');
  const stale = await prepare(w, 'ann', { attempt: 1 }); assert.equal(stale.status, 409); assert.equal(stale.body['error'], 'EXISTS');
  const second = await prepare(w, 'ann', { attempt: 2 }); assert.equal(second.status, 201);
  const b2 = await batch(w, second.body['batchId']);
  assert.notEqual(second.body['batchId'], first); assert.equal(b2['batch'].attempt, 2); assert.equal(b2['batch'].calculationId, b1['batch'].calculationId, 'same calculation');
  assert.notEqual(b2['batch'].instructionsHash, b1['batch'].instructionsHash, 'a new fingerprint');
  assert.ok(b2['instructions'].every((i: { id: string }) => !b1['instructions'].some((j: { id: string }) => j.id === i.id)), 'new instruction ids');
  assert.deepEqual(b2['instructions'].map((i: { payerName: string; payeeName: string; amount: string }) => [i.payerName, i.payeeName, i.amount]), b1['instructions'].map((i: { payerName: string; payeeName: string; amount: string }) => [i.payerName, i.payeeName, i.amount]), 'the same deterministic content');
  assert.ok(b2['validation'].every((c: { ok: boolean }) => c.ok));
  // the first batch is untouched: still rejected, with its reason, instructions and decision
  const old = await batch(w, first); assert.equal(old['status'], 'rejected'); assert.equal(old['review'].reason, 'Beta Bank disputes the amounts'); assert.equal(old['instructions'].length, b1['instructions'].length);
  assert.equal(one(w, 'SELECT count(*) AS n FROM settlement_batches')['n'], 2);
  // while attempt 2 awaits review, nothing else can be prepared; its decision is its own
  assert.equal((await prepare(w, 'ann', { attempt: 3 })).status, 409);
  assert.equal((await decide(w, second.body['batchId'], 'approve', 'bob')).status, 201);
  assert.equal((await prepare(w, 'ann', { attempt: 3 })).status, 409, 'an approved batch blocks any further attempt');
  assert.deepEqual((await w.c.ann.call('GET', `${w.base}/settlement`)).body['batches'].map((x: { status: string; attempt: number }) => [x.attempt, x.status]), [[1, 'rejected'], [2, 'approved']]);
});

test('decision 2: re-preparation needs a current calculation with an active approval; a source change ends the possibility', async () => {
  const w = await world('canonical'); const first = (await prepare(w)).body['batchId'] as string; await decide(w, first, 'reject', 'rae');
  await w.c.ann.call('POST', `${w.base}/obligations/${w.ob[0]}/update`, { amount: '101' });
  const r = await prepare(w, 'ann', { attempt: 2 }); assert.equal(r.status, 409, 'the calculation is stale');
  assert.equal((await batch(w, first))['status'], 'invalidated', 'the rejected batch is now superseded too, still readable');
  assert.equal((await batch(w, first))['review'].decision, 'rejected');
});

// ---------------- Decision 3: operational closure ----------------
test('decision 3: closure needs an approved, still-eligible batch for the current calculation (operational closure, not settlement)', async () => {
  const closeAttempt = async (w: W) => w.c.ann.call('POST', `${w.base}/close`, {});
  const w = await world('canonical');
  assert.equal((await w.c.ann.call('POST', `${w.base}/ready`, {})).status, 200);
  let r = await closeAttempt(w); assert.equal(r.status, 409, 'no batch'); assert.match(r.body['message'], /approved, still-eligible settlement batch/); assert.match(r.body['message'], /does not mean settlement happened/);
  await w.c.ann.call('POST', `${w.base}/reopen`, {});
  const b1 = (await prepare(w)).body['batchId'] as string;
  await w.c.ann.call('POST', `${w.base}/ready`, {});
  assert.equal((await closeAttempt(w)).status, 409, 'a batch awaiting review');
  await decide(w, b1, 'reject', 'rae'); assert.equal((await closeAttempt(w)).status, 409, 'the latest batch is rejected');
  await w.c.ann.call('POST', `${w.base}/reopen`, {});
  const b2 = (await prepare(w, 'ann', { attempt: 2 })).body['batchId'] as string; await decide(w, b2, 'approve', 'bob');
  await w.c.ann.call('POST', `${w.base}/ready`, {});
  assert.equal((await batch(w, b2, 'ann'))['status'], 'approved');
  r = await closeAttempt(w); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await w.c.ann.call('GET', w.base)).body['workflow'], 'closed');
  assert.equal((await batch(w, b2, 'ann'))['status'], 'approved', 'closing does not alter the batch');
  assert.equal((await w.c.ann.call('POST', `${w.base}/reopen`, {})).status, 409, 'closed is final');
  // an approved batch that stopped being eligible does not satisfy the prerequisite
  const x = await world('canonical'); const bx = (await prepare(x)).body['batchId'] as string; await decide(x, bx, 'approve', 'rae');
  await x.c.ann.call('POST', `${x.base}/obligations/${x.ob[0]}/update`, { amount: '555' });
  await x.c.ann.call('POST', `${x.base}/calculate`, {}); await x.c.bob.call('POST', `${x.base}/authorization/approve`, { calculationId: await calcId(x) });
  await x.c.ann.call('POST', `${x.base}/ready`, {});
  assert.equal((await batch(x, bx, 'ann'))['status'], 'invalidated');
  assert.equal((await closeAttempt(x)).status, 409, 'the old approved batch is no longer eligible and the new calculation has no batch');
  assert.equal((await x.c.cat.call('POST', `${x.base}/close`, {})).status, 403, 'only administrators close');
});

// ---------------- instruction contract v1 ----------------
test('instruction contract v1: every field is present and fingerprinted; prepared instructions never carry Stellar accounts', async () => {
  const w = await world('canonical'); const bid = (await prepare(w)).body['batchId'] as string; const v = await batch(w, bid);
  const decisionId = one(w, "SELECT id FROM authorization_decisions WHERE decision = 'approved'")['id'];
  for (const i of v['instructions']) {
    assert.equal(i.orgId, w.org); assert.equal(i.sessionId, w.sid); assert.equal(i.batchId, bid); assert.equal(i.calculationId, v['batch'].calculationId);
    assert.equal(i.approvalDecisionId, decisionId); assert.equal(i.network, 'testnet'); assert.equal(i.assetId, USD1); assert.match(i.amount, /^[1-9][0-9]*$/);
    assert.equal(i.sourceAccount, null); assert.equal(i.destinationAccount, null); assert.equal(i.validation, 'valid'); assert.match(i.fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(i.fingerprint, instructionFingerprint({ id: i.id, batchId: bid, sessionId: w.sid, orgId: w.org, calculationId: i.calculationId, approvalDecisionId: decisionId as string, network: 'testnet', seq: i.seq, payer: i.payer, payee: i.payee, assetId: USD1, amount: i.amount }));
  }
  assert.ok(v['validation'].some((c: { key: string; ok: boolean }) => c.key === 'instruction-fingerprints' && c.ok));
  const ins = one(w, 'SELECT * FROM settlement_instructions LIMIT 1');
  assert.throws(() => w.b.db.raw.prepare("UPDATE settlement_instructions SET source_account = 'G'").run(), /immutable/);
  assert.throws(() => w.b.db.raw.prepare('INSERT INTO settlement_instructions (id, batch_id, session_id, org_id, calculation_id, network, seq, payer, payee, source_account, asset_id, amount) VALUES (?, ?, ?, ?, ?, ?, 9, ?, ?, ?, ?, ?)').run('ins_acct', ins['batch_id'] as string, ins['session_id'] as string, w.org, ins['calculation_id'] as string, 'testnet', 'usr_a', 'usr_b', ISS1, USD1, '5'), /CHECK/, 'an account on a prepared instruction is refused by the schema');
  // a tampered stored fingerprint is caught by validation (simulated by recomputing against changed data in memory)
  assert.notEqual(instructionFingerprint({ id: 'a', batchId: 'b', sessionId: 's', orgId: 'o', calculationId: 'c', approvalDecisionId: 'd', network: 'testnet', seq: 1, payer: 'p', payee: 'q', assetId: USD1, amount: '1' }), instructionFingerprint({ id: 'a', batchId: 'b', sessionId: 's', orgId: 'o', calculationId: 'c', approvalDecisionId: 'd', network: 'testnet', seq: 1, payer: 'p', payee: 'q', assetId: USD1, amount: '2' }));
});

// ---------------- migration of populated data ----------------
test('migration 5 upgrades a populated version-4 database without changing historical content', async () => {
  const { openDatabase, migrate, MIGRATIONS } = await import('../lib/db/database.ts');
  const db = openDatabase(':memory:'); migrate(db, undefined, MIGRATIONS.slice(0, 4));
  const SID = 'ab'.repeat(32), CALC = 'calc_old', ASSET = `testnet:USD:${ISS1}`, FP = 'f'.repeat(64);
  db.raw.exec(`INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ('usr_1', 'a@x.test', 'A', 'h', 't'), ('usr_2', 'b@x.test', 'B', 'h', 't');
    INSERT INTO organizations (id, name, visibility, created_at, created_by) VALUES ('org_1', 'Org', 'private', 't', 'usr_1');
    INSERT INTO memberships (org_id, user_id, role, since) VALUES ('org_1', 'usr_1', 'admin', 't'), ('org_1', 'usr_2', 'member', 't');
    INSERT INTO sessions (session_id, org_id, label, provenance, created_at) VALUES ('${SID}', 'org_1', 'S', 'local-draft', 't');
    INSERT INTO session_participants (session_id, org_id, user_id, added_by, added_at) VALUES ('${SID}', 'org_1', 'usr_1', 'usr_1', 't'), ('${SID}', 'org_1', 'usr_2', 'usr_1', 't');
    INSERT INTO obligations (id, session_id, org_id, debtor, creditor, amount, asset, status, revision, created_at, created_by, updated_at, updated_by) VALUES ('${'01'.repeat(32)}', '${SID}', 'org_1', 'usr_1', 'usr_2', '10', 'USD', 'active', 1, 't', 'usr_1', 't', 'usr_1');
    INSERT INTO calculations (id, session_id, org_id, asset, input_hash, input_json, positions_json, gross, created_at, created_by) VALUES ('${CALC}', '${SID}', 'org_1', 'USD', '${'e'.repeat(64)}', '{}', '[]', '10', 't', 'usr_1');
    INSERT INTO authorization_decisions (id, session_id, org_id, calculation_id, decision, reason, decided_by, decided_at) VALUES ('dec_old', '${SID}', 'org_1', '${CALC}', 'approved', '', 'usr_2', 't');
    INSERT INTO supported_assets (id, network, kind, code, issuer, status, added_at) VALUES ('${ASSET}', 'testnet', 'issued', 'USD', '${ISS1}', 'supported', 't');
    INSERT INTO settlement_batches (id, session_id, org_id, calculation_id, asset_id, asset_network, asset_kind, asset_code, asset_issuer, instruction_count, total_amount, instructions_hash, algorithm, validation_json, prepared_by, prepared_at) VALUES ('bat_old', '${SID}', 'org_1', '${CALC}', '${ASSET}', 'testnet', 'issued', 'USD', '${ISS1}', 1, '10', '${FP}', 'alg', '[]', 'usr_1', 't');
    INSERT INTO settlement_instructions (id, batch_id, session_id, calculation_id, seq, payer, payee, asset_id, amount) VALUES ('ins_old', 'bat_old', '${SID}', '${CALC}', 1, 'usr_1', 'usr_2', '${ASSET}', '10');
    INSERT INTO settlement_batch_reviews (id, batch_id, decision, reason, decided_by, decided_at) VALUES ('brv_old', 'bat_old', 'rejected', 'old reason', 'usr_2', 't');
    INSERT INTO settlement_batch_invalidations (batch_id, cause, at, by_actor) VALUES ('bat_old', 'old cause', 't', 'usr_1');`);
  const st = migrate(db); assert.equal(st.current, 8);
  const g = (sql: string) => db.raw.prepare(sql).get() as Record<string, unknown>;
  const b = g("SELECT * FROM settlement_batches WHERE id = 'bat_old'"); assert.equal(b['attempt'], 1); assert.equal(b['instructions_hash'], FP); assert.equal(b['total_amount'], '10'); assert.equal(b['asset_id'], ASSET);
  const i = g("SELECT * FROM settlement_instructions WHERE id = 'ins_old'"); assert.equal(i['amount'], '10'); assert.equal(i['org_id'], 'org_1'); assert.equal(i['network'], 'testnet'); assert.equal(i['approval_decision_id'], 'dec_old'); assert.equal(i['fingerprint'], null, 'legacy rows get no invented fingerprint'); assert.equal(i['source_account'], null);
  assert.equal(g("SELECT reason FROM settlement_batch_reviews WHERE id = 'brv_old'")['reason'], 'old reason'); assert.equal(g("SELECT cause FROM settlement_batch_invalidations WHERE batch_id = 'bat_old'")['cause'], 'old cause');
  const o = g('SELECT asset_ref, asset_identity FROM obligations'); assert.equal(o['asset_ref'], null); assert.equal(o['asset_identity'], 'legacy-unresolved', 'historical obligations are not guessed');
  assert.equal(g('SELECT asset_ref FROM calculations')['asset_ref'], null, 'historical snapshots are not rewritten');
  assert.equal(g("SELECT status FROM supported_assets WHERE id = '" + ASSET + "'")['status'], 'supported');
  for (const sql of ["UPDATE settlement_batches SET total_amount = '1'", 'DELETE FROM settlement_instructions', "UPDATE settlement_batch_reviews SET reason = 'x'", 'DELETE FROM settlement_batch_invalidations']) assert.throws(() => db.raw.prepare(sql).run(), /immutable/, 'triggers were recreated: ' + sql);
  assert.throws(() => db.raw.prepare("INSERT INTO settlement_batches (id, session_id, org_id, calculation_id, attempt, asset_id, asset_network, asset_kind, asset_code, instruction_count, total_amount, instructions_hash, algorithm, validation_json, prepared_by, prepared_at) VALUES ('bat_dup', ?, 'org_1', ?, 1, 'x', 'testnet', 'issued', 'USD', 0, '0', ?, 'a', '[]', 'usr_1', 't')").run(SID, CALC, FP), /UNIQUE/, 'attempt 1 of a calculation is still unique');
  db.raw.prepare("INSERT INTO settlement_batches (id, session_id, org_id, calculation_id, attempt, asset_id, asset_network, asset_kind, asset_code, instruction_count, total_amount, instructions_hash, algorithm, validation_json, prepared_by, prepared_at) VALUES ('bat_2', ?, 'org_1', ?, 2, 'x', 'testnet', 'issued', 'USD', 0, '0', ?, 'a', '[]', 'usr_1', 't')").run(SID, CALC, 'a'.repeat(64));
  assert.equal(g('PRAGMA foreign_key_check') === undefined, true, 'no foreign key violations after the rebuild');
});
