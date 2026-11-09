// Public Discover API: only opted-in (public) organizations, only three fields, honest empties, validated paging.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handlePublicDiscover } from '../lib/public/discover.ts';
import { newUser, makeBackend } from './backend-helpers.ts';

const get = (b: ReturnType<typeof makeBackend>['b'], path: string, method = 'GET') => handlePublicDiscover(new Request('http://x' + path, { method }), b.db);

async function world() {
  const { b } = makeBackend();
  const u = await newUser(b, 'ann');
  b.registry.createOrganization(u, { name: 'Zed Payments', visibility: 'public', institutionType: 'payment-institution', jurisdiction: 'NG' });
  b.registry.createOrganization(u, { name: 'Alpha Bank', visibility: 'public', institutionType: 'bank' });
  const priv = b.registry.createOrganization(u, { name: 'Secret Treasury', visibility: 'private' });
  b.registry.recordSession(u, priv.id, { sessionId: 'ab'.repeat(32), label: 'Private run' });
  return b;
}

test('institutions: only public organizations, only name, type and jurisdiction, sorted by name', async () => {
  const b = await world();
  const r = await get(b, '/api/public/v1/institutions');
  assert.equal(r.status, 200);
  const body = (await r.json()) as { items: Record<string, unknown>[]; nextCursor: string | null; network: string };
  assert.equal(body.network, 'testnet');
  assert.deepEqual(body.items.map((i) => i['displayName']), ['Alpha Bank', 'Zed Payments']);
  assert.deepEqual(Object.keys(body.items[1]!).sort(), ['displayName', 'id', 'institutionType', 'jurisdiction']);
  const text = JSON.stringify(body);
  for (const secret of ['Secret Treasury', 'Private run', 'ann@example.test', 'usr_', 'created_by']) assert.ok(!text.includes(secret), secret);
});

test('stats are honest: opted-in count only, everything else null, never zero', async () => {
  const b = await world();
  const s = (await (await get(b, '/api/public/v1/stats')).json()) as Record<string, unknown>;
  assert.equal(s['institutionsOptedIn'], 2);
  for (const k of ['settlementsRecorded', 'assetsInUse', 'lastSettlementAt']) assert.equal(s[k], null, k);
});

test('settlements and assets publish nothing and say why; verifiedReadBack never appears', async () => {
  const b = await world();
  for (const p of ['settlements', 'assets']) {
    const body = (await (await get(b, `/api/public/v1/${p}`)).json()) as { items: unknown[]; note: string };
    assert.deepEqual(body.items, []);
    assert.match(body.note, /independently read back/);
  }
});

test('paging and validation', async () => {
  const b = await world();
  const one = (await (await get(b, '/api/public/v1/institutions?limit=1')).json()) as { items: { displayName: string }[]; nextCursor: string | null };
  assert.equal(one.items.length, 1); assert.equal(one.nextCursor, '1');
  const two = (await (await get(b, '/api/public/v1/institutions?limit=1&cursor=1')).json()) as { items: { displayName: string }[]; nextCursor: string | null };
  assert.equal(two.items[0]!.displayName, 'Zed Payments'); assert.equal(two.nextCursor, null);
  for (const q of ['limit=0', 'limit=51', 'limit=x', 'cursor=-1', 'cursor=abc', 'sort=bogus']) assert.equal((await get(b, '/api/public/v1/institutions?' + q)).status, 400, q);
  assert.equal((await get(b, '/api/public/v1/settlements?sort=bogus')).status, 400);
  assert.equal((await get(b, '/api/public/v1/other')).status, 404);
  assert.equal((await get(b, '/api/public/v1/stats', 'POST')).status, 405);
});
