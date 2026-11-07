import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRegistry, REQUEST_HEADER } from '../lib/registry/http.ts';
import { seededRegistry, FIXTURE_SESSION_ID } from '../lib/registry/demo-seed.ts';
import type { RegistryDeps } from '../lib/registry/http.ts';
import { DevelopmentIdentityProvider } from '../lib/registry/identity.ts';
import { PROVENANCE, listingRows, listingState, statusOf, workspaceOf } from '../lib/registry/session-view.ts';
import type { ActivityRecord, SessionRecord } from '../lib/registry/types.ts';

let n = 0;
// TEST-ONLY authentication: the development provider reads a header. Production wiring (app/api/registry) uses server-side sessions and never this.
const dev = new DevelopmentIdentityProvider();
const deps = (over: Partial<RegistryDeps> = {}): RegistryDeps => ({ registry: seededRegistry(), authenticate: (req) => dev.resolve(req.headers.get('x-tobin-dev-user') ?? undefined), newSessionId: () => (++n).toString(16).padStart(64, '0'), ...over });
const call = async (d: RegistryDeps, method: string, path: string, user: string | null, body?: unknown) => {
  const headers: Record<string, string> = {};
  if (user) headers['x-tobin-dev-user'] = user;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers[REQUEST_HEADER] = '1';
  const res = await handleRegistry(new Request(`http://127.0.0.1:8787/api/registry/${path}`, { method, headers, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }), d);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};
const orgs = async (d: RegistryDeps, user: string) => (await call(d, 'GET', 'orgs', user)).body['organizations'] as { id: string; name: string }[];

const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({ sessionId: 'ab'.repeat(32), orgId: 'o', label: 'S', provenance: 'local-draft', createdAt: '2026-11-06T10:00:00.000Z', ...over });

test('provenance wording: four values, only chain ones are on-chain, drafts never claim chain state', () => {
  assert.deepEqual(Object.keys(PROVENANCE).sort(), ['chain-confirmed', 'chain-read', 'fixture', 'local-draft']);
  assert.deepEqual(Object.entries(PROVENANCE).filter(([, v]) => v.onChain).map(([k]) => k).sort(), ['chain-confirmed', 'chain-read']);
  assert.match(PROVENANCE['local-draft'].meaning, /not an on-chain session/);
  assert.match(PROVENANCE.fixture.meaning, /never created on Stellar/);
  assert.equal(statusOf(rec()), 'Draft (not on-chain)');
  assert.match(statusOf(rec({ provenance: 'fixture' })), /Fixture/);
  assert.equal(statusOf(rec({ provenance: 'chain-read', chain: { state: 'OPEN', participants: ['GA'], creator: 'GA', readAtLedger: 5 } })), 'OPEN');
});

test('listing rows: newest first, participants unknown unless read, activity indicators', () => {
  const act: ActivityRecord[] = [{ id: '1', at: '2026-11-06T11:00:00.000Z', orgId: 'o', actor: 'u', kind: 'session.recorded', subject: 'cd'.repeat(32), detail: '' }];
  const rows = listingRows([rec(), rec({ sessionId: 'cd'.repeat(32), createdAt: '2026-11-06T12:00:00.000Z', label: 'newer' })], act);
  assert.equal(rows[0]?.label, 'newer'); assert.equal(rows[0]?.activityCount, 1); assert.equal(rows[1]?.activityCount, 0);
  assert.equal(rows[0]?.participants, 'not read'); assert.equal(rows[1]?.lastActivity, null);
  assert.ok((rows[0]?.shortId ?? '').includes('…'));
});

test('listing states: loading, error, empty, rows (error wins over stale rows)', () => {
  assert.equal(listingState({ loading: true }).kind, 'loading');
  assert.equal(listingState({ loading: false, error: 'boom', rows: [] }).kind, 'error');
  const e = listingState({ loading: false, rows: [] }); assert.equal(e.kind, 'empty'); assert.match((e as { message: string }).message, /not an on-chain session/);
  assert.equal(listingState({ loading: false, rows: listingRows([rec()], []) }).kind, 'rows');
});

test('workspace of a fixture: obligations and nets are labelled fixture and computed by the real engine', () => {
  const w = workspaceOf(rec({ provenance: 'fixture' }), []);
  assert.match(w.obligations.note, /FIXTURE/); assert.match(w.netPositions.note, /FIXTURE/);
  assert.equal(w.obligations.items.length, 3);
  const net = Object.fromEntries(w.netPositions.items.map((x) => [x.name, x.net]));
  assert.deepEqual(net, { 'Fixture Org A': '30', 'Fixture Org B': '-20', 'Fixture Org C': '-10' });
  assert.equal(w.netPositions.grossTotal, '250'); assert.equal(w.netPositions.netMoved, '30');
  assert.equal(w.overview.confirmedTxHash, null);
});

test('workspace of a local draft shows no invented participants, obligations, nets or hash', () => {
  const w = workspaceOf(rec(), []);
  for (const s of [w.participants, w.obligations, w.netPositions]) { assert.equal(s.available, false); assert.equal(s.items.length, 0); }
  assert.equal(w.netPositions.grossTotal, null); assert.equal(w.overview.confirmedTxHash, null);
  assert.equal(w.banner.label, 'Local draft'); assert.ok(w.activity.empty);
});

test('workspace of a chain read: participants come from the observation, obligations stay unavailable; confirmed shows the hash', () => {
  const chain = { state: 'OPEN' as const, participants: ['GA', 'GB'], creator: 'GA', readAtLedger: 77 };
  const r = workspaceOf(rec({ provenance: 'chain-read', chain }), []);
  assert.equal(r.participants.items.length, 2); assert.match(r.participants.note, /ledger 77/);
  assert.equal(r.obligations.available, false); assert.equal(r.overview.confirmedTxHash, null);
  const c = workspaceOf(rec({ provenance: 'chain-confirmed', chain, confirmedTxHash: 'f'.repeat(64) }), []);
  assert.equal(c.overview.confirmedTxHash, 'f'.repeat(64)); assert.equal(c.banner.label, 'Chain confirmed');
});

test('API: create a local draft, list it, open it; it is never chain-backed', async () => {
  const d = deps(); const [demo] = await orgs(d, 'dev:demo');
  const before = (await call(d, 'GET', `orgs/${demo?.id}/sessions`, 'dev:demo')).body['rows'] as { provenance: string }[];
  assert.equal(before.length, 1); assert.equal(before[0]?.provenance, 'fixture');
  const created = await call(d, 'POST', `orgs/${demo?.id}/sessions`, 'dev:demo', { label: 'Q4 clearing' });
  assert.equal(created.status, 201); assert.match(created.body['notice'], /not an on-chain session/);
  assert.equal(created.body['session'].provenance, 'local-draft');
  const rows = (await call(d, 'GET', `orgs/${demo?.id}/sessions`, 'dev:demo')).body['rows'] as { provenance: string; label: string; status: string }[];
  assert.equal(rows.length, 2); assert.equal(rows.find((r) => r.label === 'Q4 clearing')?.status, 'Draft (not on-chain)');
  const detail = await call(d, 'GET', `orgs/${demo?.id}/sessions/${created.body['session'].sessionId}`, 'dev:demo');
  assert.equal(detail.status, 200); assert.equal(detail.body['workspace'].banner.label, 'Local draft');
});

test('API: no route can confirm, attach chain data, or alter provenance', async () => {
  const d = deps(); const [demo] = await orgs(d, 'dev:demo');
  const s = (await call(d, 'POST', `orgs/${demo?.id}/sessions`, 'dev:demo', { label: 'x' })).body['session'].sessionId;
  for (const [m, p] of [['POST', `orgs/${demo?.id}/sessions/${s}/confirm`], ['POST', `orgs/${demo?.id}/sessions/${s}`], ['POST', `orgs/${demo?.id}/sessions/${s}/chain`]] as const) assert.equal((await call(d, m, p, 'dev:demo', { txHash: 'f'.repeat(64), txStatus: 'SUCCESS' })).status, 404);
  const body = (await call(d, 'POST', `orgs/${demo?.id}/sessions`, 'dev:demo', { label: 'y', provenance: 'chain-confirmed', sessionId: 'ee'.repeat(32) })).body;
  assert.equal(body['session'].provenance, 'local-draft'); assert.notEqual(body['session'].sessionId, 'ee'.repeat(32));
  const fixture = await call(d, 'GET', `orgs/${demo?.id}/sessions/${FIXTURE_SESSION_ID}`, 'dev:demo');
  assert.equal(fixture.body['workspace'].banner.label, 'Fixture');
});

test('API: organization isolation returns not-found for list, detail, create and activity', async () => {
  const d = deps(); const [demo] = await orgs(d, 'dev:demo'); const [other] = await orgs(d, 'dev:other');
  assert.notEqual(demo?.id, other?.id);
  for (const [m, p, b] of [['GET', `orgs/${demo?.id}/sessions`], ['GET', `orgs/${demo?.id}/sessions/${FIXTURE_SESSION_ID}`], ['POST', `orgs/${demo?.id}/sessions`, { label: 'intrusion' }]] as const) {
    const r = await call(d, m, p, 'dev:other', b); assert.equal(r.status, 404); assert.equal(r.body['error'], 'NOT_FOUND');
  }
  // a session of org A is not reachable through org B's own id either
  assert.equal((await call(d, 'GET', `orgs/${other?.id}/sessions/${FIXTURE_SESSION_ID}`, 'dev:other')).status, 404);
  assert.equal((await call(d, 'GET', `orgs/${demo?.id}/sessions`, 'dev:demo')).body['rows'].length, 1, 'nothing was created by the intruder');
  assert.equal((await call(d, 'GET', 'orgs/org_doesnotexist/sessions', 'dev:demo')).status, 404, 'unknown org looks the same as foreign org');
});

test('API: identity and input errors', async () => {
  const d = deps(); const [demo] = await orgs(d, 'dev:demo');
  assert.equal((await call(d, 'GET', 'orgs', null)).status, 401);
  assert.equal((await call(d, 'GET', 'orgs', 'demo')).status, 401);
  assert.equal((await call(deps({ authenticate: () => null }), 'GET', 'orgs', 'dev:demo')).status, 401, 'an identity header is only honoured when the test wiring says so');
  assert.equal((await call(d, 'POST', `orgs/${demo?.id}/sessions`, 'dev:demo', { label: '' })).status, 400);
  assert.equal((await call(d, 'POST', `orgs/${demo?.id}/sessions`, 'dev:demo', { label: '<b>' })).status, 400);
  assert.equal((await call(d, 'POST', `orgs/${demo?.id}/sessions`, 'dev:demo', 'not json')).status, 400);
  assert.equal((await call(d, 'POST', `orgs/${demo?.id}/sessions`, 'dev:demo', { label: 'a'.repeat(5000) })).status, 400);
  assert.equal((await call(d, 'GET', 'nope', 'dev:demo')).status, 404);
  assert.equal((await call(d, 'GET', `orgs/${demo?.id}/sessions/not-hex`, 'dev:demo')).status, 404);
});
