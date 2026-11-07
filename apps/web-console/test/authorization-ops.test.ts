// Institutional authorization through the real HTTP handlers, real SQLite, real AuthService (MVP-1.3). Same-author tests; the concurrency tests run
// sequentially in one process across two connections (not true multi-process contention).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackend } from '../lib/server/backend.ts';
import { client, makeBackend, signedIn, tempDir } from './backend-helpers.ts';
import type { Backend } from '../lib/server/backend.ts';

type C = Awaited<ReturnType<typeof signedIn>>;
const me = async (c: C) => (await c.call('GET', '/api/auth/me')).body['user'].id as string;
type N = 'ann' | 'bob' | 'cat' | 'dan' | 'rae' | 'eve';

interface W { b: Backend; c: Record<N, C>; id: Record<N, string>; org: string; sid: string; base: string; ob: string[] }
/**
 * ann: administrator (records obligations and calculates). dan: second administrator. bob, cat, rae: members. eve: outsider.
 * Reviewers granted by ann: bob and rae. Session has ann, bob, cat as participants and the ring ann->bob 100, bob->cat 80, cat->ann 70, calculated by ann.
 */
async function world(path = ':memory:', calculate = true): Promise<W> {
  const { b } = makeBackend(path);
  const c = {} as Record<N, C>; const id = {} as Record<N, string>;
  for (const n of ['ann', 'bob', 'cat', 'dan', 'rae', 'eve'] as N[]) { c[n] = await signedIn(b, n); id[n] = await me(c[n]); }
  const org = (await c.ann.call('POST', '/api/registry/orgs', { name: 'Alpha Bank' })).body['organization'].id as string;
  for (const [n, role] of [['bob', 'member'], ['cat', 'member'], ['rae', 'member'], ['dan', 'admin']] as const) {
    const inv = await c.ann.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: `${n}@example.test`, role });
    assert.equal((await c[n].call('POST', '/api/registry/invitations/accept', { token: inv.body['token'] })).status, 200);
  }
  for (const n of ['bob', 'rae'] as N[]) assert.equal((await c.ann.call('POST', `/api/registry/orgs/${org}/reviewers/${id[n]}/grant`, {})).status, 200);
  const sid = (await c.ann.call('POST', `/api/registry/orgs/${org}/sessions`, { label: 'Run' })).body['session'].sessionId as string;
  const base = `/api/registry/orgs/${org}/sessions/${sid}`;
  for (const n of ['ann', 'bob', 'cat'] as N[]) await c.ann.call('POST', `${base}/participants`, { userId: id[n] });
  const ob: string[] = [];
  for (const [d, cr, amt] of [['ann', 'bob', '100'], ['bob', 'cat', '80'], ['cat', 'ann', '70']] as const) ob.push((await c.ann.call('POST', `${base}/obligations`, { debtor: id[d], creditor: id[cr], amount: amt, asset: 'USD' })).body['obligationId']);
  if (calculate) await c.ann.call('POST', `${base}/calculate`, {});
  return { b, c, id, org, sid, base, ob };
}
const auth = async (w: W, who: N = 'bob') => (await w.c[who].call('GET', `${w.base}/authorization`)).body;
const calcId = async (w: W) => (await auth(w))['calculationId'] as string;
const approve = async (w: W, who: N = 'bob', calculationId?: string, extra: Record<string, unknown> = {}) => w.c[who].call('POST', `${w.base}/authorization/approve`, { calculationId: calculationId ?? (await calcId(w)), ...extra });
const reject = async (w: W, who: N = 'bob', reason: unknown = 'amounts disputed', calculationId?: string) => w.c[who].call('POST', `${w.base}/authorization/reject`, { calculationId: calculationId ?? (await calcId(w)), reason });
const kinds = async (w: W) => (await w.c.ann.call('GET', w.base)).body['workspace'].activity.items.map((a: { kind: string }) => a.kind) as string[];

test('happy path: awaiting review, approve the exact snapshot, history shows who and when', async () => {
  const w = await world();
  const a0 = await auth(w);
  assert.equal(a0['state'], 'awaiting-review'); assert.equal(a0['eligibility'].canDecide, true); assert.equal(a0['currency'], 'current');
  assert.match(a0['note'], /not a Stellar signature, not a transaction, not a settlement and not an on-chain confirmation/);
  const r = await approve(w);
  assert.equal(r.status, 201); assert.equal(r.body['state'], 'approved');
  const d = r.body['decisions'][0];
  assert.equal(d.calculationId, a0['calculationId']); assert.equal(d.decision, 'approved'); assert.equal(d.decidedBy, 'bob'); assert.equal(d.status, 'active'); assert.ok(d.decidedAt);
  assert.equal((await auth(w, 'cat'))['state'], 'approved', 'every member sees the same state');
  assert.ok((await kinds(w)).includes('authorization.approved'));
});

test('isolation: a non-member sees and decides nothing, identical to a nonexistent organization', async () => {
  const w = await world();
  const ghost = await w.c.eve.call('GET', `/api/registry/orgs/org_doesnotexist/sessions/${w.sid}/authorization`);
  for (const [m, p, body] of [['GET', 'authorization'], ['POST', 'authorization/approve', { calculationId: await calcId(w) }], ['POST', 'authorization/reject', { calculationId: await calcId(w), reason: 'x' }]] as const) {
    const r = await w.c.eve.call(m, `${w.base}/${p}`, body); assert.equal(r.status, 404, p); assert.deepEqual(r.body, ghost.body);
  }
  assert.equal((await w.c.eve.call('POST', `/api/registry/orgs/${w.org}/reviewers/${w.id.eve}/grant`, {})).status, 404);
  assert.equal((await auth(w))['state'], 'awaiting-review', 'nothing changed');
});

test('authority: only a granted reviewer decides (members, administrators and revoked reviewers cannot)', async () => {
  const w = await world();
  assert.equal((await approve(w, 'cat')).status, 403, 'a plain member');
  assert.equal((await reject(w, 'cat')).status, 403);
  assert.equal((await approve(w, 'dan')).status, 403, 'an administrator is not a reviewer by default');
  assert.equal((await w.c.bob.call('POST', `/api/registry/orgs/${w.org}/reviewers/${w.id.cat}/grant`, {})).status, 403, 'a reviewer cannot grant');
  assert.equal((await w.c.cat.call('POST', `/api/registry/orgs/${w.org}/reviewers/${w.id.cat}/grant`, {})).status, 403, 'nor can a member self-grant');
  assert.equal((await w.c.ann.call('POST', `/api/registry/orgs/${w.org}/reviewers/${w.id.eve}/grant`, {})).status, 404, 'only members can be reviewers');
  const a = await auth(w, 'cat'); assert.equal(a['eligibility'].canDecide, false); assert.match(a['eligibility'].reasons.join(' '), /reviewer capability/);
  assert.equal((await w.c.ann.call('POST', `/api/registry/orgs/${w.org}/reviewers/${w.id.bob}/revoke`, {})).status, 200);
  assert.equal((await approve(w, 'bob')).status, 403, 'a revoked reviewer');
  assert.equal((await approve(w, 'rae')).status, 201, 'another reviewer still can');
  const list = (await w.c.cat.call('GET', `/api/registry/orgs/${w.org}/reviewers`)).body['reviewers'].map((x: { name: string }) => x.name);
  assert.deepEqual(list, ['rae']);
});

test('separation of duties: the calculator, the recorder and an earlier editor cannot decide', async () => {
  const w = await world();
  // ann ran the calculation and recorded the obligations; make her a reviewer too
  await w.c.ann.call('POST', `/api/registry/orgs/${w.org}/reviewers/${w.id.ann}/grant`, {});
  const self = await approve(w, 'ann'); assert.equal(self.status, 403); assert.equal(self.body['error'], 'SEPARATION_OF_DUTIES'); assert.match(self.body['message'], /ran this calculation|recorded or changed/);
  assert.equal((await reject(w, 'ann')).status, 403);
  const view = await auth(w, 'ann'); assert.equal(view['eligibility'].canDecide, false); assert.match(view['eligibility'].reasons.join(' '), /Separation of duties/);
  // a recorder who is not the calculator: dan (admin) records a new obligation, ann recalculates; dan is a reviewer
  const w2 = await world();
  await w2.c.ann.call('POST', `/api/registry/orgs/${w2.org}/reviewers/${w2.id.dan}/grant`, {});
  await w2.c.dan.call('POST', `${w2.base}/obligations/${w2.ob[0]}/update`, { amount: '101' });          // dan edits revision 2
  await w2.c.ann.call('POST', `${w2.base}/obligations/${w2.ob[0]}/update`, { amount: '102' });          // ann edits revision 3: dan is no longer updatedBy
  await w2.c.ann.call('POST', `${w2.base}/calculate`, {});                                              // ann calculates
  const d = await approve(w2, 'dan'); assert.equal(d.status, 403, 'dan changed an obligation in this calculation (found through the activity history)');
  assert.equal(d.body['error'], 'SEPARATION_OF_DUTIES');
  assert.equal((await approve(w2, 'rae')).status, 201, 'a reviewer with no part in it can decide');
});

test('stale, superseded and unknown snapshots cannot be decided; the decision is bound to the exact calculation id', async () => {
  const w = await world();
  const first = await calcId(w);
  assert.equal((await w.c.ann.call('POST', `${w.base}/obligations/${w.ob[0]}/update`, { amount: '150' })).status, 200);
  const st = await auth(w); assert.equal(st['state'], 'stale'); assert.equal(st['eligibility'].canDecide, false);
  assert.equal((await approve(w, 'bob', first)).status, 409, 'stale'); assert.equal((await reject(w, 'bob', 'x', first)).status, 409);
  await w.c.ann.call('POST', `${w.base}/calculate`, {});
  const second = await calcId(w); assert.notEqual(second, first);
  const old = await approve(w, 'bob', first); assert.equal(old.status, 409); assert.equal(old.body['error'], 'STALE', 'an older snapshot id is refused');
  assert.equal((await approve(w, 'bob', 'calc_000000000000000000')).status, 404);
  assert.equal((await w.c.bob.call('POST', `${w.base}/authorization/approve`, {})).status, 400, 'the calculation must be named');
  assert.equal((await w.c.bob.call('POST', `${w.base}/authorization/approve`, { calculationId: 7 })).status, 400);
  assert.equal((await approve(w, 'bob', second)).status, 201);
  assert.equal((await auth(w)).decisions[0].calculationId, second, 'the record names the exact snapshot');
});

test('closed session: no new decision', async () => {
  const w = await world();
  w.b.db.raw.prepare("UPDATE sessions SET workflow_state = 'closed' WHERE session_id = ?").run(w.sid); // closing needs an approved batch (MVP-1.5 policy); this test is about what a closed session refuses
  const r = await approve(w, 'bob'); assert.equal(r.status, 409); assert.match(r.body['message'], /closed/);
  assert.equal((await reject(w, 'bob')).status, 409);
  const a = await auth(w); assert.equal(a['eligibility'].canDecide, false); assert.match(a['eligibility'].reasons.join(' '), /closed/);
});

test('recalculation never inherits a decision: the old one is superseded and a new decision is required', async () => {
  const w = await world();
  const first = await calcId(w); await approve(w);
  await w.c.ann.call('POST', `${w.base}/calculate`, {}); // same data, new snapshot
  const a = await auth(w);
  assert.equal(a['state'], 'awaiting-review', 'a fresh snapshot is not approved');
  assert.notEqual(a['calculationId'], first);
  const old = a['decisions'].find((d: { calculationId: string }) => d.calculationId === first);
  assert.equal(old.status, 'invalidated'); assert.match(old.invalidationCause, /new calculation superseded/); assert.ok(old.invalidatedAt);
  assert.equal(old.decision, 'approved', 'the historical decision is still readable');
  assert.equal((await approve(w, 'rae')).status, 201); assert.equal((await auth(w))['state'], 'approved');
});

test('changed obligations and participants invalidate an approval, explicitly and on the record', async () => {
  for (const [label, change, cause] of [
    ['edit', (w: W) => w.c.ann.call('POST', `${w.base}/obligations/${w.ob[0]}/update`, { amount: '101' }), /changed/],
    ['void', (w: W) => w.c.ann.call('POST', `${w.base}/obligations/${w.ob[2]}/void`, {}), /voided/],
    ['record', (w: W) => w.c.ann.call('POST', `${w.base}/obligations`, { debtor: w.id.ann, creditor: w.id.cat, amount: '1', asset: 'USD' }), /recorded/],
    ['add participant', (w: W) => w.c.ann.call('POST', `${w.base}/participants`, { userId: w.id.rae }), /participant was added/],
  ] as const) {
    const w = await world(); const id = await calcId(w); await approve(w);
    assert.equal((await change(w)).status < 300, true, label);
    const a = await auth(w);
    assert.equal(a['state'], 'stale', label); assert.equal(a['decisions'][0].status, 'invalidated', label); assert.match(a['decisions'][0].invalidationCause, cause, label);
    assert.equal(a['decisions'][0].calculationId, id, `${label}: history kept`);
    assert.ok((await kinds(w)).includes('authorization.invalidated'), label);
    assert.equal((await approve(w, 'rae', id)).status, 409, `${label}: the old approval cannot be reused`);
  }
  // removing a participant (after voiding what names them)
  const w = await world(); await w.c.ann.call('POST', `${w.base}/participants`, { userId: w.id.rae });
  await w.c.ann.call('POST', `${w.base}/calculate`, {}); await approve(w);
  await w.c.ann.call('POST', `${w.base}/participants/${w.id.rae}/remove`, {});
  const a = await auth(w); assert.equal(a['state'], 'stale'); assert.match(a['decisions'][0].invalidationCause, /participant was removed/);
});

test('rejection needs a reason, is recorded with it, and the snapshot then needs a new calculation', async () => {
  const w = await world(); const id = await calcId(w);
  for (const reason of ['', '   ', 'x'.repeat(501), 5, null]) assert.equal((await reject(w, 'bob', reason)).status, 400, String(reason));
  assert.equal((await w.c.bob.call('POST', `${w.base}/authorization/reject`, { calculationId: id })).status, 400, 'no reason at all');
  assert.equal((await auth(w))['state'], 'awaiting-review', 'failed attempts left no trace');
  const r = await reject(w, 'bob', 'Amounts disputed with Beta Bank');
  assert.equal(r.status, 201); assert.equal(r.body['state'], 'rejected');
  assert.equal(r.body['decisions'][0].reason, 'Amounts disputed with Beta Bank'); assert.equal(r.body['decisions'][0].decidedBy, 'bob');
  assert.ok((await kinds(w)).includes('authorization.rejected'));
  assert.equal((await approve(w, 'rae', id)).status, 409, 'cannot flip a rejected snapshot');
  await w.c.ann.call('POST', `${w.base}/calculate`, {});
  assert.equal((await auth(w))['state'], 'awaiting-review');
  assert.equal((await approve(w, 'rae')).status, 201, 'a new snapshot can be reviewed afresh');
  const hist = (await auth(w))['decisions']; assert.deepEqual(hist.map((d: { decision: string; status: string }) => [d.decision, d.status]), [['rejected', 'invalidated'], ['approved', 'active']]);
});

test('duplicate and conflicting decisions are refused deterministically', async () => {
  const w = await world(); const id = await calcId(w);
  assert.equal((await approve(w, 'bob', id)).status, 201);
  for (const r of [await approve(w, 'bob', id), await approve(w, 'rae', id), await reject(w, 'rae', 'no', id), await reject(w, 'bob', 'no', id)]) { assert.equal(r.status, 409); assert.equal(r.body['error'], 'EXISTS'); }
  assert.equal((await auth(w))['decisions'].length, 1);
  assert.equal((w.b.db.raw.prepare('SELECT count(*) AS n FROM authorization_decisions').get() as { n: number }).n, 1);
});

test('concurrency across two connections to one file: one decision wins; a data change before a decision wins over a stale approval', async () => {
  const t = tempDir();
  try {
    const w = await world(t.path); const id = await calcId(w);
    const b2 = createBackend(t.path, { auth: { now: () => new Date('2026-11-08T10:00:00Z'), scryptCost: 10 }, secureCookies: true, clock: { now: () => new Date('2026-11-08T10:00:00Z') } });
    const bob2 = client(b2); bob2.cookie = w.c.rae.cookie; // rae on the second connection
    const [x, y] = [await w.c.bob.call('POST', `${w.base}/authorization/approve`, { calculationId: id }), await bob2.call('POST', `${w.base}/authorization/reject`, { calculationId: id, reason: 'late' })];
    assert.deepEqual([x.status, y.status], [201, 409], 'first writer wins, second is refused');
    assert.equal((await auth(w))['decisions'].length, 1);
    // a change on connection 2 invalidates what connection 1 still believes
    const ann2 = client(b2); ann2.cookie = w.c.ann.cookie;
    assert.equal((await ann2.call('POST', `${w.base}/obligations/${w.ob[0]}/update`, { amount: '555' })).status, 200);
    const a = await auth(w); assert.equal(a['state'], 'stale'); assert.equal(a['decisions'][0].status, 'invalidated');
    b2.db.close();
  } finally { t.cleanup(); }
});

test('activity: decisions, invalidations and reviewer changes are recorded, readable and immutable', async () => {
  const w = await world(); await approve(w); await w.c.ann.call('POST', `${w.base}/obligations/${w.ob[0]}/update`, { amount: '120' });
  await w.c.ann.call('POST', `/api/registry/orgs/${w.org}/reviewers/${w.id.rae}/revoke`, {});
  const items = (await w.c.ann.call('GET', w.base)).body['workspace'].activity.items as { kind: string; actor: string; detail: string }[];
  const k = items.map((a) => a.kind);
  assert.ok(k.includes('authorization.approved') && k.includes('authorization.invalidated'));
  assert.match(items.find((a) => a.kind === 'authorization.invalidated')!.detail, /approved decision on calculation \w{8} no longer applies: an obligation was changed/);
  assert.equal(items.find((a) => a.kind === 'authorization.approved')!.actor, 'bob');
  const org = (w.b.db.raw.prepare("SELECT kind FROM activity WHERE kind LIKE 'reviewer.%'").all() as { kind: string }[]).map((x) => x.kind);
  assert.deepEqual(org, ['reviewer.granted', 'reviewer.granted', 'reviewer.revoked']);
  assert.throws(() => w.b.db.raw.prepare("UPDATE authorization_decisions SET decision = 'rejected'").run(), /immutable/);
  assert.throws(() => w.b.db.raw.prepare('DELETE FROM authorization_decisions').run(), /immutable/);
  assert.throws(() => w.b.db.raw.prepare("UPDATE authorization_invalidations SET cause = 'x'").run(), /immutable/);
  assert.throws(() => w.b.db.raw.prepare('DELETE FROM authorization_invalidations').run(), /immutable/);
});

test('tampering: identity, status and bookkeeping in the body are ignored; headers, sessions and constraints still apply', async () => {
  const w = await world();
  const r = await approve(w, 'bob', undefined, { decidedBy: w.id.rae, status: 'active', decision: 'rejected', orgId: 'org_x', reason: 'ignored', id: 'dec_forged', decidedAt: '2000-01-01' });
  assert.equal(r.status, 201);
  const d = r.body['decisions'][0]; assert.equal(d.decidedBy, 'bob'); assert.equal(d.decision, 'approved'); assert.notEqual(d.id, 'dec_forged'); assert.notEqual(d.decidedAt, '2000-01-01'); assert.equal(d.reason, '');
  const w2 = await world();
  assert.equal((await w2.c.bob.call('POST', `${w2.base}/authorization/approve`, { calculationId: await calcId(w2) }, {}, false)).status, 403, 'request header required');
  const anon = await signedIn(w2.b, 'zed'); anon.cookie = '';
  assert.equal((await anon.call('POST', `${w2.base}/authorization/approve`, {})).status, 401);
  assert.equal((await w2.c.bob.call('GET', `${w2.base}/authorization/approve`)).status, 404, 'approving is not a GET');
  // direct database writes: a rejection without a reason and a second decision for one snapshot are refused by the schema
  const cid = await calcId(w2); const ins = (id: string, calc: string, dec: string, reason: string) => w2.b.db.raw.prepare('INSERT INTO authorization_decisions (id, session_id, org_id, calculation_id, decision, reason, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, w2.sid, w2.org, calc, dec, reason, w2.id.bob, 't');
  assert.throws(() => ins('d1', cid, 'rejected', ' '), /CHECK/); assert.throws(() => ins('d2', cid, 'approved', 'a note'), /CHECK/); assert.throws(() => ins('d3', cid, 'maybe', ''), /CHECK/);
  assert.throws(() => ins('d4', 'calc_unknown', 'approved', ''), /FOREIGN KEY/);
  ins('d5', cid, 'approved', ''); assert.throws(() => ins('d6', cid, 'approved', ''), /UNIQUE/);
});

test('rollback: a failed decision leaves no decision and no activity', async () => {
  const w = await world(); const id = await calcId(w);
  const n = (t: string) => (w.b.db.raw.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
  const before = [n('authorization_decisions'), n('activity')];
  assert.throws(() => w.b.db.tx(() => { w.b.registry.decide({ userId: w.id.bob, kind: 'verified' }, w.org, w.sid, 'approved', { calculationId: id }); throw new Error('boom'); }), /boom/);
  assert.deepEqual([n('authorization_decisions'), n('activity')], before, 'decision and its activity rolled back together');
  assert.equal((await reject(w, 'bob', '')).status, 400); assert.deepEqual([n('authorization_decisions'), n('activity')], before);
  assert.equal((await approve(w)).status, 201, 'and a clean attempt still works afterwards');
});

test('history survives: revoking a reviewer or removing a member keeps earlier decisions', async () => {
  const w = await world(); await approve(w, 'rae');
  assert.equal((await w.c.ann.call('POST', `/api/registry/orgs/${w.org}/members/${w.id.rae}/remove`, {})).status, 200);
  const a = await auth(w, 'bob'); assert.equal(a['decisions'][0].decision, 'approved'); assert.equal(a['decisions'][0].status, 'active');
  assert.equal((await w.c.rae.call('GET', `${w.base}/authorization`)).status, 404, 'a removed member sees nothing');
  assert.equal((w.b.db.raw.prepare('SELECT count(*) AS n FROM org_reviewers WHERE user_id = ?').get(w.id.rae) as { n: number }).n, 0, 'the reviewer grant left with the membership');
});

test('migration 3 upgrades a version-2 database and keeps its data', async () => {
  const { openDatabase, migrate, MIGRATIONS } = await import('../lib/db/database.ts');
  const db = openDatabase(':memory:'); migrate(db, undefined, MIGRATIONS.slice(0, 2));
  db.raw.exec(`INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ('usr_1', 'a@x.test', 'A', 'h', 't');
    INSERT INTO organizations (id, name, visibility, created_at, created_by) VALUES ('org_1', 'Org', 'private', 't', 'usr_1');
    INSERT INTO memberships (org_id, user_id, role, since) VALUES ('org_1', 'usr_1', 'admin', 't');`);
  assert.equal(migrate(db).current, 8);
  assert.equal((db.raw.prepare('SELECT count(*) AS n FROM memberships').get() as { n: number }).n, 1);
  assert.equal((db.raw.prepare('SELECT count(*) AS n FROM authorization_decisions').get() as { n: number }).n, 0);
});
