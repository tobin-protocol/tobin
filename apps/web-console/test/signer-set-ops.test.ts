// Signer-set snapshots through the service and HTTP layers, real SQLite. The signer sets here are SYNTHETIC (throwaway keys); nothing reads a network. The live route
// that reads Horizon and the RPC is covered by the real read-only audit (evidence/multisig-live-audit-*.json), not by this suite.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair } from '@stellar/stellar-sdk';
import { fingerprintOf } from '../lib/stellar/signer-set.ts';
import type { SignerSet } from '../lib/stellar/signer-set.ts';
import { makeBackend, signedIn } from './backend-helpers.ts';

const kp = () => Keypair.random().publicKey();
const ACCOUNT = kp(), FOUNDER = kp(), SECURITY = kp(), TECH = kp();
const SET: SignerSet = { network: 'testnet', account: ACCOUNT, thresholds: { low: 5, medium: 6, high: 7 }, signers: [{ key: ACCOUNT, weight: 1 }, { key: FOUNDER, weight: 5 }, { key: TECH, weight: 2 }, { key: SECURITY, weight: 1 }] };
const me = async (c: Awaited<ReturnType<typeof signedIn>>) => (await c.call('GET', '/api/auth/me')).body['user'].id as string;

async function world() {
  const { b } = makeBackend();
  const ann = await signedIn(b, 'ann'), bob = await signedIn(b, 'bob'), eve = await signedIn(b, 'eve');
  const org = (await ann.call('POST', '/api/registry/orgs', { name: 'Alpha Bank' })).body['organization'].id as string;
  const inv = await ann.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: 'bob@example.test', role: 'member' }); await bob.call('POST', '/api/registry/invitations/accept', { token: inv.body['token'] });
  const id = { ann: await me(ann), bob: await me(bob), eve: await me(eve) };
  const U = (n: 'ann' | 'bob' | 'eve') => ({ userId: id[n], kind: 'verified' as const });
  return { b, ann, bob, eve, org, id, U };
}
const count = (b: { db: { raw: { prepare(s: string): { get(): unknown } } } }, t: string) => (b.db.raw.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;

test('record: the fingerprint is recomputed; the same set is idempotent; a changed set supersedes and the old one stays on record', async () => {
  const w = await world(); const reg = w.b.registry; const fp = fingerprintOf(SET);
  assert.throws(() => reg.recordSignerSet(w.U('ann'), w.org, { set: SET, fingerprint: 'a'.repeat(64) }), /does not match the signer set/);
  assert.throws(() => reg.recordSignerSet(w.U('ann'), w.org, { set: { ...SET, signers: [] }, fingerprint: fp }), /not usable/);
  const first = reg.recordSignerSet(w.U('ann'), w.org, { set: SET, fingerprint: fp }); assert.equal(first.changed, true); assert.equal(first.snapshot.fingerprint, fp);
  const again = reg.recordSignerSet(w.U('ann'), w.org, { set: { ...SET, signers: [...SET.signers].reverse() }, fingerprint: fp }); assert.equal(again.changed, false, 'order does not matter, and the same set is idempotent'); assert.equal(count(w.b as never, 'signer_set_snapshots'), 1);
  const changed: SignerSet = { ...SET, signers: SET.signers.map((s) => (s.key === SECURITY ? { ...s, weight: 3 } : s)) };
  const second = reg.recordSignerSet(w.U('ann'), w.org, { set: changed, fingerprint: fingerprintOf(changed) });
  assert.equal(second.changed, true); assert.equal(second.supersedes, first.snapshot.id);
  const h = reg.signerSetHistory(w.U('bob'), w.org, 'testnet', ACCOUNT); assert.equal(h.history.length, 2); assert.equal(h.current?.fingerprint, fingerprintOf(changed)); assert.equal(h.history[0]?.fingerprint, fp, 'the earlier snapshot is kept');
  assert.deepEqual(h.current?.signers.map((s) => s.weight).sort(), [1, 2, 3, 5]);
});

test('access: only administrators record; outsiders see nothing; members can read the history', async () => {
  const w = await world(); const fp = fingerprintOf(SET);
  assert.throws(() => w.b.registry.recordSignerSet(w.U('bob'), w.org, { set: SET, fingerprint: fp }), /administrator role required/);
  assert.throws(() => w.b.registry.recordSignerSet(w.U('eve'), w.org, { set: SET, fingerprint: fp }), /organization not found/);
  w.b.registry.recordSignerSet(w.U('ann'), w.org, { set: SET, fingerprint: fp });
  assert.equal(w.b.registry.signerSetHistory(w.U('bob'), w.org, 'testnet', ACCOUNT).current?.fingerprint, fp);
  assert.throws(() => w.b.registry.signerSetHistory(w.U('eve'), w.org, 'testnet', ACCOUNT), /organization not found/);
  const r = await w.bob.call('GET', `/api/registry/orgs/${w.org}/signer-sets/${ACCOUNT}`); assert.equal(r.status, 200); assert.equal(r.body['history'].length, 1);
  assert.equal((await w.eve.call('GET', `/api/registry/orgs/${w.org}/signer-sets/${ACCOUNT}`)).status, 404);
  const ghost = await w.eve.call('POST', '/api/registry/orgs/org_nope/signer-sets', { network: 'testnet', account: ACCOUNT });
  const out = await w.eve.call('POST', `/api/registry/orgs/${w.org}/signer-sets`, { network: 'testnet', account: ACCOUNT }); assert.equal(out.status, 404); assert.deepEqual(out.body, ghost.body);
  assert.equal((await w.bob.call('POST', `/api/registry/orgs/${w.org}/signer-sets`, { network: 'testnet', account: ACCOUNT })).status, 403, 'a member cannot trigger a recording');
  assert.equal((await w.ann.call('POST', `/api/registry/orgs/${w.org}/signer-sets`, { network: 'public', account: ACCOUNT })).status, 400, 'Mainnet is not enabled');
  assert.equal((await w.ann.call('POST', `/api/registry/orgs/${w.org}/signer-sets`, { network: 'testnet' })).status, 400);
  assert.equal((await w.ann.call('POST', `/api/registry/orgs/${w.org}/signer-sets`, { network: 'testnet', account: ACCOUNT, weights: [{ key: ACCOUNT, weight: 255 }] }, {}, false)).status, 403, 'request header required');
});

test('no role escalation: recording or holding a signer set grants no role, no reviewer capability and does not bypass separation of duties', async () => {
  const w = await world(); const before = JSON.stringify((await w.ann.call('GET', `/api/registry/orgs/${w.org}/members`)).body['members']);
  w.b.registry.recordSignerSet(w.U('ann'), w.org, { set: SET, fingerprint: fingerprintOf(SET) });
  assert.equal(JSON.stringify((await w.ann.call('GET', `/api/registry/orgs/${w.org}/members`)).body['members']), before, 'roles and reviewer flags are unchanged');
  const sid = (await w.ann.call('POST', `/api/registry/orgs/${w.org}/sessions`, { label: 'Run' })).body['session'].sessionId as string;
  assert.equal((await w.bob.call('POST', `/api/registry/orgs/${w.org}/sessions/${sid}/authorization/approve`, { calculationId: 'calc_x' })).status, 403, 'a member is still no reviewer');
  assert.equal((await w.bob.call('POST', `/api/registry/orgs/${w.org}/sessions/${sid}/settlement/prepare`, { calculationId: 'calc_x' })).status, 403, 'nor an administrator');
  assert.equal((await w.bob.call('POST', `/api/registry/orgs/${w.org}/reviewers/${w.id.bob}/grant`, {})).status, 403, 'and cannot grant themselves anything');
  const act = w.b.db.raw.prepare("SELECT detail FROM activity WHERE kind = 'signer-set.recorded'").all() as { detail: string }[];
  assert.equal(act.length, 1); assert.match(act[0]!.detail, /no role or permission was granted/);
});

test('freshness: an authorization based on an old set, an unrecorded set, or an unreadable chain is not fresh', async () => {
  const w = await world(); const fp = fingerprintOf(SET); const reg = w.b.registry;
  assert.deepEqual(reg.signerSetFresh(w.U('ann'), w.org, 'testnet', ACCOUNT, fp, undefined), { fresh: false, reason: 'the live signer set could not be read: authorization is not possible' }, 'fails closed without a live read');
  assert.match(reg.signerSetFresh(w.U('ann'), w.org, 'testnet', ACCOUNT, fp, fp).reason, /not been recorded/, 'live but never recorded');
  reg.recordSignerSet(w.U('ann'), w.org, { set: SET, fingerprint: fp });
  assert.equal(reg.signerSetFresh(w.U('ann'), w.org, 'testnet', ACCOUNT, fp, fp).fresh, true);
  const changed: SignerSet = { ...SET, signers: SET.signers.filter((s) => s.key !== SECURITY) }; const cfp = fingerprintOf(changed);
  assert.match(reg.signerSetFresh(w.U('ann'), w.org, 'testnet', ACCOUNT, fp, cfp).reason, /changed since/, 'the chain moved on (a signer was revoked) after the authorization was based on the old set');
  reg.recordSignerSet(w.U('ann'), w.org, { set: changed, fingerprint: cfp });
  assert.equal(reg.signerSetFresh(w.U('ann'), w.org, 'testnet', ACCOUNT, fp, cfp).fresh, false, 'an authorization based on the superseded set stays stale');
  assert.equal(reg.signerSetFresh(w.U('ann'), w.org, 'testnet', ACCOUNT, cfp, cfp).fresh, true);
});

test('immutability and constraints hold against direct writes', async () => {
  const w = await world(); w.b.registry.recordSignerSet(w.U('ann'), w.org, { set: SET, fingerprint: fingerprintOf(SET) });
  const db = w.b.db.raw;
  assert.throws(() => db.prepare("UPDATE signer_set_snapshots SET thresholds_json = '{}'").run(), /immutable/); assert.throws(() => db.prepare('DELETE FROM signer_set_snapshots').run(), /immutable/);
  const ins = (over: Record<string, string>) => { const r = { id: 'sgs_x', network: 'testnet', account: ACCOUNT, fingerprint: 'b'.repeat(64), source: 'horizon+rpc-agreed', ...over }; db.prepare('INSERT INTO signer_set_snapshots (id, org_id, network, account, fingerprint, thresholds_json, signers_json, source, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(r.id, w.org, r.network, r.account, r.fingerprint, '{}', '[]', r.source, w.id.ann, 't'); };
  assert.throws(() => ins({ source: 'manual' }), /CHECK/, 'a hand-entered set cannot be recorded'); assert.throws(() => ins({ network: 'mainnet' }), /CHECK/); assert.throws(() => ins({ fingerprint: 'short' }), /CHECK/); assert.throws(() => ins({ account: 'GBAD' }), /CHECK/);
  assert.throws(() => ins({ fingerprint: fingerprintOf(SET) }), /UNIQUE/, 'the same fingerprint twice');
});

test('atomicity: a failed recording leaves nothing behind', async () => {
  const w = await world(); const a0 = count(w.b as never, 'activity');
  assert.throws(() => w.b.db.tx(() => { w.b.registry.recordSignerSet(w.U('ann'), w.org, { set: SET, fingerprint: fingerprintOf(SET) }); throw new Error('boom'); }), /boom/);
  assert.equal(count(w.b as never, 'signer_set_snapshots'), 0); assert.equal(count(w.b as never, 'activity'), a0);
});

test('migration 7 upgrades a version-6 database in place and keeps its data', async () => {
  const { openDatabase, migrate, MIGRATIONS } = await import('../lib/db/database.ts');
  const db = openDatabase(':memory:'); migrate(db, undefined, MIGRATIONS.slice(0, 6));
  db.raw.exec(`INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ('usr_1', 'a@x.test', 'A', 'h', 't');
    INSERT INTO organizations (id, name, visibility, created_at, created_by) VALUES ('org_1', 'Org', 'private', 't', 'usr_1');`);
  assert.equal(migrate(db).current, 8);
  assert.equal((db.raw.prepare('SELECT count(*) AS n FROM organizations').get() as { n: number }).n, 1); assert.equal((db.raw.prepare('SELECT count(*) AS n FROM signer_set_snapshots').get() as { n: number }).n, 0);
});
