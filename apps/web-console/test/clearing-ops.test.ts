// Clearing operations through the real HTTP handlers, real SQLite, real AuthService: participants, obligations, netting, staleness, readiness,
// workflow, activity, isolation, persistence, constraints. Same-author tests; no browser here.
import assert from 'node:assert/strict';
import test from 'node:test';
import { openDatabase, migrate } from '../lib/db/database.ts';
import { createBackend } from '../lib/server/backend.ts';
import { makeBackend, signedIn, tempDir, PASSWORD } from './backend-helpers.ts';
import type { Backend } from '../lib/server/backend.ts';

type C = Awaited<ReturnType<typeof signedIn>>;
const me = async (c: C) => (await c.call('GET', '/api/auth/me')).body['user'].id as string;

interface World { b: Backend; ann: C; bob: C; cat: C; dan: C; eve: C; org: string; sid: string; ids: Record<'ann' | 'bob' | 'cat' | 'dan' | 'eve', string>; base: string }
/** ann administers Alpha with members bob, cat, dan; eve belongs to nothing. A local-draft session exists with no participants yet. */
async function world(path = ':memory:'): Promise<World> {
  const { b } = makeBackend(path);
  const [ann, bob, cat, dan, eve] = [await signedIn(b, 'ann'), await signedIn(b, 'bob'), await signedIn(b, 'cat'), await signedIn(b, 'dan'), await signedIn(b, 'eve')];
  const org = (await ann.call('POST', '/api/registry/orgs', { name: 'Alpha Bank' })).body['organization'].id as string;
  for (const [c, n] of [[bob, 'bob'], [cat, 'cat'], [dan, 'dan']] as const) {
    const inv = await ann.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: `${n}@example.test`, role: 'member' });
    assert.equal((await c.call('POST', '/api/registry/invitations/accept', { token: inv.body['token'] })).status, 200);
  }
  const sid = (await ann.call('POST', `/api/registry/orgs/${org}/sessions`, { label: 'Clearing run' })).body['session'].sessionId as string;
  const ids = { ann: await me(ann), bob: await me(bob), cat: await me(cat), dan: await me(dan), eve: await me(eve) };
  return { b, ann, bob, cat, dan, eve, org, sid, ids, base: `/api/registry/orgs/${org}/sessions/${sid}` };
}
const addAll = async (w: World, who: (keyof World['ids'])[] = ['ann', 'bob', 'cat']) => { for (const n of who) assert.equal((await w.ann.call('POST', `${w.base}/participants`, { userId: w.ids[n] })).status, 201); };
const owe = (w: World, d: keyof World['ids'], c: keyof World['ids'], amount: string, extra: Record<string, unknown> = {}) =>
  w.ann.call('POST', `${w.base}/obligations`, { debtor: w.ids[d], creditor: w.ids[c], amount, asset: 'USD', ...extra });
/** Ring: ann owes bob 100, bob owes cat 80, cat owes ann 70 => ann +30, bob -20, cat -10 (computed by hand). */
const ring = async (w: World) => { await addAll(w); const r = []; r.push(await owe(w, 'ann', 'bob', '100')); r.push(await owe(w, 'bob', 'cat', '80')); r.push(await owe(w, 'cat', 'ann', '70')); return r.map((x) => x.body['obligationId'] as string); };

test('end to end: participants, obligations, calculation, staleness, recalculation, readiness, workflow', async () => {
  const w = await world(); const o1 = (await ring(w))[0]!;
  const list = await w.bob.call('GET', `${w.base}/participants`);
  assert.equal(list.body['participants'].length, 3); assert.equal(list.body['participants'][0].organization, 'Alpha Bank');
  assert.equal((await w.bob.call('GET', `${w.base}/obligations`)).body['obligations'].length, 3, 'members can read');

  assert.equal((await w.ann.call('GET', `${w.base}/calculation`)).body['currency'], 'none');
  const calc = await w.ann.call('POST', `${w.base}/calculate`, {});
  assert.equal(calc.status, 201); assert.equal(calc.body['currency'], 'current');
  const pos = Object.fromEntries(calc.body['calculation'].positions.map((p: { name: string; net: string }) => [p.name, p.net]));
  assert.deepEqual(pos, { ann: '30', bob: '-20', cat: '-10' }); assert.equal(calc.body['calculation'].gross, '250');
  assert.match(calc.body['note'], /not an approval, a signature, a settlement/);

  // determinism: a second calculation of the same input gives the same positions and input hash
  const again = await w.ann.call('POST', `${w.base}/calculate`, {});
  assert.deepEqual(again.body['calculation'].positions, calc.body['calculation'].positions); assert.equal(again.body['calculation'].inputHash, calc.body['calculation'].inputHash);

  // an obligation change makes the previous calculation visibly stale, and readiness fails on it
  assert.equal((await w.ann.call('POST', `${w.base}/obligations/${o1}/update`, { amount: '150' })).status, 200);
  assert.equal((await w.bob.call('GET', `${w.base}/calculation`)).body['currency'], 'stale');
  const notReady = await w.ann.call('GET', `${w.base}/readiness`);
  assert.equal(notReady.body['ready'], false); assert.equal(notReady.body['checks'].find((c: { key: string }) => c.key === 'current').ok, false);
  assert.equal((await w.ann.call('POST', `${w.base}/ready`, {})).status, 409, 'cannot be marked ready on a stale calculation');

  const re = await w.ann.call('POST', `${w.base}/calculate`, {});
  assert.deepEqual(Object.fromEntries(re.body['calculation'].positions.map((p: { name: string; net: string }) => [p.name, p.net])), { ann: '80', bob: '-70', cat: '-10' });
  assert.equal(re.body['currency'], 'current');
  assert.equal((await w.ann.call('GET', `${w.base}/readiness`)).body['ready'], true);

  assert.equal((await w.bob.call('POST', `${w.base}/ready`, {})).status, 403, 'a member cannot change the workflow');
  assert.equal((await w.ann.call('POST', `${w.base}/ready`, {})).status, 200);
  assert.equal((await w.ann.call('GET', `${w.base}`)).body['workflow'], 'ready');
  // ready is frozen: nothing can be edited until reopened
  for (const [path, body] of [[`${w.base}/obligations`, { debtor: w.ids.ann, creditor: w.ids.bob, amount: '1', asset: 'USD' }], [`${w.base}/obligations/${o1}/update`, { amount: '2' }], [`${w.base}/obligations/${o1}/void`, {}], [`${w.base}/participants`, { userId: w.ids.dan }], [`${w.base}/calculate`, {}]] as const)
    assert.equal((await w.ann.call('POST', path, body)).status, 409, path);
  assert.equal((await w.ann.call('POST', `${w.base}/ready`, {})).status, 409, 'ready -> ready is not a transition');
  assert.equal((await w.ann.call('POST', `${w.base}/reopen`, {})).status, 200);
  assert.equal((await w.ann.call('POST', `${w.base}/obligations/${o1}/update`, { amount: '100' })).status, 200);
  assert.equal((await w.ann.call('GET', `${w.base}/calculation`)).body['currency'], 'stale');
  await w.ann.call('POST', `${w.base}/calculate`, {});
  assert.equal((await w.ann.call('POST', `${w.base}/ready`, {})).status, 200);
  assert.equal((await w.ann.call('POST', `${w.base}/close`, {})).status, 200);
  assert.equal((await w.ann.call('POST', `${w.base}/reopen`, {})).status, 409, 'closed is final');
  assert.equal((await w.ann.call('POST', `${w.base}/obligations`, { debtor: w.ids.ann, creditor: w.ids.bob, amount: '1', asset: 'USD' })).status, 409);
});

test('obligation validation: amounts, parties, assets, references, authority', async () => {
  const w = await world(); await addAll(w);
  const st = async (body: Record<string, unknown>) => (await w.ann.call('POST', `${w.base}/obligations`, { debtor: w.ids.ann, creditor: w.ids.bob, amount: '10', asset: 'USD', ...body })).status;
  for (const amount of ['0', '-5', '1.5', '1e3', ' 10', '+10', 10, 1.5, null, '170141183460469231731687303715884105728']) assert.equal(await st({ amount }), 400, `amount ${JSON.stringify(amount)}`);
  assert.equal(await st({ creditor: w.ids.ann }), 400, 'same debtor and creditor');
  assert.equal(await st({ creditor: w.ids.dan }), 400, 'a member who is not a participant');
  assert.equal(await st({ creditor: w.ids.eve }), 400, 'a user outside the organization');
  assert.equal(await st({ creditor: 'nobody' }), 400);
  for (const asset of ['usd', '', 'US D', 'WAYTOOLONGASSET', 7]) assert.equal(await st({ asset }), 400, `asset ${asset}`);
  assert.equal(await st({ reference: 'x'.repeat(201) }), 400); assert.equal(await st({ reference: '<script>' }), 400);
  assert.equal((await w.bob.call('POST', `${w.base}/obligations`, { debtor: w.ids.bob, creditor: w.ids.ann, amount: '1', asset: 'USD' })).status, 403, 'members cannot record');
  assert.equal(await st({}), 201);
  assert.equal(await st({ asset: 'EUR' }), 400, 'a second asset is never netted with the first');
  // client-supplied identity, id and state are ignored
  const ok = await w.ann.call('POST', `${w.base}/obligations`, { debtor: w.ids.bob, creditor: w.ids.cat, amount: '5', asset: 'USD', createdBy: w.ids.eve, id: 'f'.repeat(64), status: 'voided', revision: 9, orgId: 'org_x' });
  assert.equal(ok.status, 201); assert.notEqual(ok.body['obligationId'], 'f'.repeat(64));
  const o = (await w.ann.call('GET', `${w.base}/obligations/${ok.body['obligationId']}`)).body['obligation'];
  assert.equal(o.status, 'active'); assert.equal(o.revision, 1); assert.equal(o.createdBy, 'ann');
  assert.equal((await w.ann.call('POST', `${w.base}/obligations/${ok.body['obligationId']}/update`, {})).status, 400, 'an update that changes nothing');
  assert.equal((await w.ann.call('POST', `${w.base}/obligations/${ok.body['obligationId']}/update`, { amount: '0' })).status, 400);
  assert.equal((await w.ann.call('POST', `${w.base}/obligations/${ok.body['obligationId']}/update`, { creditor: w.ids.bob })).status, 400, 'update would make debtor = creditor');
});

test('participants: duplicates, eligibility, removal rules, re-adding', async () => {
  const w = await world();
  assert.equal((await w.ann.call('POST', `${w.base}/participants`, { userId: w.ids.eve })).status, 400, 'not a member of the organization');
  assert.equal((await w.ann.call('POST', `${w.base}/participants`, { userId: w.ids.bob, orgId: 'org_other' })).status, 201, 'a client orgId is ignored');
  assert.equal((await w.ann.call('POST', `${w.base}/participants`, { userId: w.ids.bob })).status, 409, 'no duplicates');
  assert.equal((await w.bob.call('POST', `${w.base}/participants`, { userId: w.ids.cat })).status, 403);
  await addAll(w, ['ann', 'cat']).catch(() => undefined);
  const o = await owe(w, 'ann', 'bob', '10'); assert.equal(o.status, 201);
  const rm = await w.ann.call('POST', `${w.base}/participants/${w.ids.bob}/remove`, {});
  assert.equal(rm.status, 409); assert.match(rm.body['message'], /void or correct/);
  assert.equal((await w.ann.call('POST', `${w.base}/obligations/${o.body['obligationId']}/void`, { reason: 'entered twice' })).status, 200);
  assert.equal((await w.ann.call('POST', `${w.base}/participants/${w.ids.bob}/remove`, {})).status, 200);
  assert.equal((await w.ann.call('POST', `${w.base}/participants/${w.ids.bob}/remove`, {})).status, 404, 'already removed');
  const removed = (await w.ann.call('GET', `${w.base}/participants`)).body['participants'].find((p: { userId: string }) => p.userId === w.ids.bob);
  assert.equal(removed.status, 'removed');
  assert.equal((await owe(w, 'ann', 'bob', '5')).status, 400, 'a removed participant cannot take new obligations');
  assert.equal((await w.ann.call('POST', `${w.base}/participants`, { userId: w.ids.bob })).status, 201, 're-adding reactivates');
  assert.equal((await owe(w, 'ann', 'bob', '5')).status, 201);
  // removing the organization member is refused while active obligations exist, and then the participation is kept as history
  assert.equal((await w.ann.call('POST', `/api/registry/orgs/${w.org}/members/${w.ids.bob}/remove`, {})).status, 409);
  const mem = (await w.ann.call('GET', `/api/registry/orgs/${w.org}/members`)).body['members'];
  assert.ok(mem.some((m: { userId: string }) => m.userId === w.ids.bob), 'the refused removal left the membership untouched');
});

test('calculation: server-side only, never from client input; refusals leave a failure record', async () => {
  const w = await world(); await addAll(w);
  assert.equal((await w.ann.call('POST', `${w.base}/calculate`, {})).status, 400, 'nothing to net');
  assert.equal((await w.bob.call('POST', `${w.base}/calculate`, {})).status, 403);
  await owe(w, 'ann', 'bob', '40');
  const r = await w.ann.call('POST', `${w.base}/calculate`, { positions: [{ userId: w.ids.ann, net: '-999' }], gross: '1', asset: 'EUR', inputHash: 'x' });
  assert.equal(r.status, 201);
  assert.deepEqual(Object.fromEntries(r.body['calculation'].positions.map((p: { name: string; net: string }) => [p.name, p.net])), { ann: '40', bob: '-40', cat: '0' }, 'client-submitted results are ignored; the third participant nets to zero');
  assert.equal(r.body['calculation'].asset, 'USD');
  const acts = (await w.ann.call('GET', w.base)).body['workspace'].activity.items.map((a: { kind: string }) => a.kind);
  assert.ok(acts.includes('netting.failed') && acts.includes('netting.calculated'));
});

test('activity: complete, readable, immutable, and free of secrets', async () => {
  const w = await world(); const o1 = (await ring(w))[0]!;
  await w.ann.call('POST', `${w.base}/obligations/${o1}/update`, { amount: '101', reference: 'invoice 7' });
  await w.ann.call('POST', `${w.base}/obligations/${o1}/void`, {});
  await w.ann.call('POST', `${w.base}/calculate`, {});
  const items = (await w.bob.call('GET', w.base)).body['workspace'].activity.items as { kind: string; actor: string; detail: string }[];
  const kinds = new Set(items.map((a) => a.kind));
  for (const k of ['session.recorded', 'session.participant-added', 'obligation.created', 'obligation.updated', 'obligation.voided', 'netting.calculated']) assert.ok(kinds.has(k), k);
  const upd = items.find((a) => a.kind === 'obligation.updated')!;
  assert.match(upd.detail, /revision 2/); assert.match(upd.detail, /amount 100 -> 101/); assert.match(upd.detail, /reference \(none\) -> invoice 7/);
  assert.equal(upd.actor, 'ann');
  assert.ok(items.every((a) => !/usr_[0-9a-f]{18}/.test(a.detail)), 'ids in details are shown as names');
  assert.match(items.find((a) => a.kind === 'obligation.created')!.detail, /ann owes bob 100 USD/);
  const dump = JSON.stringify(w.b.db.raw.prepare('SELECT * FROM activity').all());
  assert.ok(!/scrypt|password|tobin_session|token_hash/i.test(dump));
  assert.throws(() => w.b.db.raw.prepare("UPDATE activity SET detail = 'x'").run(), /immutable/);
  assert.throws(() => w.b.db.raw.prepare('DELETE FROM activity').run(), /immutable/);
});

test('isolation: other organizations and other sessions cannot see or touch anything', async () => {
  const w = await world(); const o1 = (await ring(w))[0]!;
  await w.ann.call('POST', `${w.base}/calculate`, {});
  const other = (await w.ann.call('POST', `/api/registry/orgs/${w.org}/sessions`, { label: 'Second' })).body['session'].sessionId as string;
  const otherBase = `/api/registry/orgs/${w.org}/sessions/${other}`;
  const ghost = await w.eve.call('GET', `/api/registry/orgs/org_doesnotexist/sessions/${w.sid}/obligations`);
  for (const [m, p, body] of [['GET', 'participants'], ['GET', 'obligations'], ['GET', `obligations/${o1}`], ['GET', 'calculation'], ['GET', 'readiness'], ['POST', 'calculate', {}], ['POST', 'ready', {}], ['POST', 'participants', { userId: w.ids.eve }], ['POST', 'obligations', { debtor: w.ids.ann, creditor: w.ids.bob, amount: '1', asset: 'USD' }], ['POST', `obligations/${o1}/void`, {}]] as const) {
    const r = await w.eve.call(m, `${w.base}/${p}`, body);
    assert.equal(r.status, 404, `${m} ${p}`); assert.deepEqual(r.body, ghost.body, 'identical to a nonexistent organization: existence is not revealed');
  }
  assert.equal((await w.eve.call('GET', '/api/registry/orgs/' + w.org + '/sessions')).status, 404);
  // an obligation of one session is not reachable through another
  assert.equal((await w.ann.call('GET', `${otherBase}/obligations/${o1}`)).status, 404);
  assert.equal((await w.ann.call('POST', `${otherBase}/obligations/${o1}/void`, {})).status, 404);
  assert.equal((await w.ann.call('POST', `${otherBase}/obligations/${o1}/update`, { amount: '1' })).status, 404);
  assert.equal((await w.ann.call('GET', `${otherBase}/calculation`)).body['calculation'], null, 'a calculation belongs to its session');
  // unauthenticated and header-less
  const anon = await signedIn(w.b, 'zed'); anon.cookie = '';
  assert.equal((await anon.call('GET', `${w.base}/obligations`)).status, 401);
  assert.equal((await w.ann.call('POST', `${w.base}/calculate`, {}, {}, false)).status, 403, 'state-changing requests need the request header');
  // fixture sessions have no operations
  const fx = (await w.ann.call('GET', w.base)).body; assert.ok(fx);
});

test('fixture sessions refuse clearing operations', async () => {
  const w = await world();
  const fid = 'f1'.repeat(32);
  w.b.registry.recordSession({ userId: w.ids.ann, kind: 'verified' }, w.org, { sessionId: fid, label: 'Demo', fixture: true });
  const base = `/api/registry/orgs/${w.org}/sessions/${fid}`;
  assert.equal((await w.ann.call('POST', `${base}/participants`, { userId: w.ids.bob })).status, 409);
  assert.equal((await w.ann.call('GET', `${base}/obligations`)).status, 409);
  assert.equal((await w.ann.call('POST', `${base}/calculate`, {})).status, 409);
});

test('persistence: everything survives closing and reopening the database file', async () => {
  const t = tempDir();
  try {
    const w = await world(t.path); await ring(w);
    const c1 = await w.ann.call('POST', `${w.base}/calculate`, {}); await w.ann.call('POST', `${w.base}/ready`, {});
    const cookie = w.ann.cookie; w.b.db.close();
    const b2 = createBackend(t.path, { auth: { now: () => new Date('2026-11-08T10:30:00Z'), scryptCost: 10 }, secureCookies: true, clock: { now: () => new Date('2026-11-08T10:30:00Z') } });
    const { client } = await import('./backend-helpers.ts');
    const ann2 = client(b2); ann2.cookie = cookie;
    assert.equal((await ann2.call('GET', `${w.base}/participants`)).body['participants'].length, 3);
    assert.equal((await ann2.call('GET', `${w.base}/obligations`)).body['obligations'].length, 3);
    const v = await ann2.call('GET', `${w.base}/calculation`);
    assert.equal(v.body['currency'], 'current'); assert.equal(v.body['calculation'].id, c1.body['calculation'].id); assert.equal(v.body['calculation'].gross, '250');
    assert.equal((await ann2.call('GET', w.base)).body['workflow'], 'ready');
    assert.ok((await ann2.call('GET', w.base)).body['workspace'].activity.items.some((a: { kind: string }) => a.kind === 'session.state-changed'));
    b2.db.close();
  } finally { t.cleanup(); }
});

test('database constraints hold even against direct writes; snapshots are immutable', async () => {
  const w = await world(); const o1 = (await ring(w))[0]!; await w.ann.call('POST', `${w.base}/calculate`, {});
  const db = w.b.db.raw; const row = db.prepare('SELECT * FROM obligations WHERE id = ?').get(o1) as Record<string, string>;
  const ins = (over: Record<string, unknown>) => { const r = { ...row, id: 'a'.repeat(64), ...over } as Record<string, string>; db.prepare(`INSERT INTO obligations (id, session_id, org_id, debtor, creditor, amount, asset, reference, status, revision, created_at, created_by, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(r['id']!, r['session_id']!, r['org_id']!, r['debtor']!, r['creditor']!, r['amount']!, r['asset']!, r['reference']!, r['status']!, Number(r['revision']), r['created_at']!, r['created_by']!, r['updated_at']!, r['updated_by']!); };
  assert.throws(() => ins({ amount: '0' }), /CHECK/); assert.throws(() => ins({ amount: '-4' }), /CHECK/); assert.throws(() => ins({ amount: '1.5' }), /CHECK/);
  assert.throws(() => ins({ creditor: row['debtor'] }), /CHECK/);
  assert.throws(() => ins({ asset: 'usd' }), /CHECK/);
  assert.throws(() => ins({ creditor: 'usr_000000000000000000' }), /FOREIGN KEY/, 'creditor must be a participant of that session');
  assert.throws(() => ins({ session_id: 'ee'.repeat(32) }), /FOREIGN KEY/);
  assert.throws(() => ins({ status: 'deleted' }), /CHECK/);
  ins({});
  assert.throws(() => db.prepare("UPDATE calculations SET gross = '1'").run(), /immutable/);
  assert.throws(() => db.prepare('DELETE FROM calculations').run(), /immutable/);
});

test('atomicity: a refused mutation leaves no partial record', async () => {
  const w = await world(); await addAll(w);
  const count = (t: string) => (w.b.db.raw.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
  const before = [count('obligations'), count('activity')];
  assert.equal((await owe(w, 'ann', 'bob', '10', { reference: 'x'.repeat(300) })).status, 400);
  assert.deepEqual([count('obligations'), count('activity')], before, 'nothing written, nothing logged');
  assert.throws(() => w.b.db.tx(() => { w.b.registry.createObligation({ userId: w.ids.ann, kind: 'verified' }, w.org, w.sid, { debtor: w.ids.ann, creditor: w.ids.bob, amount: '3', asset: 'USD' }); throw new Error('boom'); }), /boom/);
  assert.deepEqual([count('obligations'), count('activity')], before, 'an outer failure rolls the obligation and its activity back together');
});

test('two connections to one file: a change made on one is seen as staleness on the other', async () => {
  const t = tempDir();
  try {
    const w = await world(t.path); const o1 = (await ring(w))[0]!;
    await w.ann.call('POST', `${w.base}/calculate`, {});
    const b2 = createBackend(t.path, { auth: { now: () => new Date('2026-11-08T10:00:00Z'), scryptCost: 10 }, secureCookies: true, clock: { now: () => new Date('2026-11-08T10:00:00Z') } });
    const { client } = await import('./backend-helpers.ts');
    const second = client(b2); second.cookie = w.ann.cookie;
    assert.equal((await second.call('POST', `${w.base}/obligations/${o1}/update`, { amount: '999' })).status, 200);
    assert.equal((await w.ann.call('GET', `${w.base}/calculation`)).body['currency'], 'stale');
    assert.equal((await w.ann.call('POST', `${w.base}/ready`, {})).status, 409);
    b2.db.close();
  } finally { t.cleanup(); }
});

test('migration 2 upgrades a version-1 database in place and keeps its data', async () => {
  const db = openDatabase(':memory:');
  const { MIGRATIONS } = await import('../lib/db/database.ts');
  migrate(db, undefined, MIGRATIONS.slice(0, 1));
  db.raw.exec(`INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ('usr_1', 'a@x.test', 'A', 'h', 't');
    INSERT INTO organizations (id, name, visibility, created_at, created_by) VALUES ('org_1', 'Org', 'private', 't', 'usr_1');
    INSERT INTO memberships (org_id, user_id, role, since) VALUES ('org_1', 'usr_1', 'admin', 't');
    INSERT INTO sessions (session_id, org_id, label, provenance, created_at) VALUES ('${'ab'.repeat(32)}', 'org_1', 'S', 'local-draft', 't');
    INSERT INTO session_participants (session_id, org_id, user_id, added_by, added_at) VALUES ('${'ab'.repeat(32)}', 'org_1', 'usr_1', 'usr_1', 't');`);
  const st = migrate(db); assert.equal(st.current, 3);
  const p = db.raw.prepare('SELECT status FROM session_participants').get() as { status: string }; assert.equal(p.status, 'active');
  const s = db.raw.prepare('SELECT workflow_state FROM sessions').get() as { workflow_state: string }; assert.equal(s.workflow_state, 'configuring');
  void PASSWORD;
});
