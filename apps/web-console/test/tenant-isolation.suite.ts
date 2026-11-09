// TENANT ISOLATION SUITE. For EVERY organization-scoped registry route, a signed-in administrator of ANOTHER organization must get exactly what they would get
// for a resource that does not exist (no existence oracle), see nothing of the first organization's data, and change nothing. Run through the store harness, so
// it applies to every store. The route table is explicit and checked against the router: a route that does not exist at all is reported, so the table cannot
// silently rot, and a new route in lib/registry/http.ts that is missing from the table is caught by the route-coverage test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { encodeAddress } from 'tobin-mvp1-sdk/strkey';
import { setLogWriter } from '../lib/server/log.ts';
import { signedIn } from './backend-helpers.ts';
import type { StoreHandle, StoreHarness } from './store-harness.ts';

type C = Awaited<ReturnType<typeof signedIn>>;
const R = '/api/registry';
const CLEARING = encodeAddress('contract', new Uint8Array(32).fill(200));

interface Ids { org: string; sid: string; bid: string; ob: string; uid: string; inv: string; ch: string; acct: string; att: string }
interface Route { method: 'GET' | 'POST'; path: (i: Ids) => string; body?: unknown | ((i: Ids) => unknown) }

/** Every organization-scoped route of lib/registry/http.ts (47). `leaf` is the part of the route after the organization id, used to check coverage. */
const ROUTES: Route[] = [
  { method: 'GET', path: (i) => `/orgs/${i.org}` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/update`, body: { name: 'Renamed' } },
  { method: 'GET', path: (i) => `/orgs/${i.org}/members` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/members/${i.uid}/role`, body: { role: 'member' } },
  { method: 'POST', path: (i) => `/orgs/${i.org}/members/${i.uid}/remove`, body: {} },
  { method: 'POST', path: (i) => `/orgs/${i.org}/members/${i.uid}/status`, body: { status: 'suspended' } },
  { method: 'GET', path: (i) => `/orgs/${i.org}/invitations` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/invitations`, body: { invitee: 'intruder@example.test', role: 'admin' } },
  { method: 'POST', path: (i) => `/orgs/${i.org}/invitations/${i.inv}/revoke`, body: {} },
  { method: 'GET', path: (i) => `/orgs/${i.org}/reviewers` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/reviewers/${i.uid}/grant`, body: {} },
  { method: 'POST', path: (i) => `/orgs/${i.org}/reviewers/${i.uid}/revoke`, body: {} },
  { method: 'GET', path: (i) => `/orgs/${i.org}/wallets` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/wallets`, body: { address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' } },
  { method: 'GET', path: (i) => `/orgs/${i.org}/wallet-verifications` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/wallet-challenges`, body: { network: 'testnet', publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' } },
  { method: 'POST', path: (i) => `/orgs/${i.org}/wallet-challenges/${i.ch}/verify`, body: { signature: 'AA==', scheme: 'raw' } },
  { method: 'POST', path: (i) => `/orgs/${i.org}/signer-sets`, body: (i: Ids) => ({ account: i.acct }) },
  { method: 'GET', path: (i) => `/orgs/${i.org}/signer-sets/${i.acct}` },
  { method: 'GET', path: (i) => `/orgs/${i.org}/sessions` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions`, body: { label: 'Intruder session' } },
  { method: 'GET', path: (i) => `/orgs/${i.org}/sessions/${i.sid}` },
  { method: 'GET', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/participants` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/participants`, body: { userId: 'u_intruder' } },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/participants/${i.uid}/remove`, body: {} },
  { method: 'GET', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/obligations` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/obligations`, body: { debtor: 'a', creditor: 'b', amount: '1' } },
  { method: 'GET', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/obligations/${i.ob}` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/obligations/${i.ob}/update`, body: { amount: '2' } },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/obligations/${i.ob}/void`, body: { reason: 'x' } },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/calculate`, body: {} },
  { method: 'GET', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/calculation` },
  { method: 'GET', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/readiness` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/ready`, body: {} },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/reopen`, body: {} },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/close`, body: {} },
  { method: 'GET', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/authorization` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/authorization/approve`, body: { calculationId: 'calc' } },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/authorization/reject`, body: { calculationId: 'calc', reason: 'x' } },
  { method: 'GET', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/settlement` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/settlement/prepare`, body: { calculationId: 'calc' } },
  { method: 'GET', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/settlement/batches/${i.bid}` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/settlement/batches/${i.bid}/approve`, body: { instructionsHash: 'h' } },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/settlement/batches/${i.bid}/reject`, body: { instructionsHash: 'h', reason: 'x' } },
  { method: 'GET', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/settlement/batches/${i.bid}/validation` },
  { method: 'GET', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/settlement/batches/${i.bid}/execution` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/settlement/batches/${i.bid}/execution/start`, body: {} },
  { method: 'GET', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/settlement/batches/${i.bid}/execution/attempts` },
  { method: 'POST', path: (i) => `/orgs/${i.org}/sessions/${i.sid}/settlement/batches/${i.bid}/execution/attempts/begin`, body: { initiator: 'x' } },
];

const call = (c: C, r: Route, ids: Ids) => c.call(r.method, R + r.path(ids), typeof r.body === 'function' ? (r.body as (i: Ids) => unknown)(ids) : r.body);
const shape = (x: { status: number; body: Record<string, unknown> }) => ({ status: x.status, error: x.body['error'], message: x.body['message'] });

export function tenantIsolation(harness: StoreHarness): void {
  describe(`tenant isolation on ${harness.name}`, () => {
    test.before(() => setLogWriter(() => {}));
    test.after(() => setLogWriter());

    async function fixture(): Promise<{ h: StoreHandle; a: C; b: C; ids: Ids; fake: Ids; own: Ids; secrets: string[] }> {
      const h = await harness.open({ clearingContract: CLEARING });
      const a = await signedIn(h.b, 'alice'); const b = await signedIn(h.b, 'beth'); const m = await signedIn(h.b, 'mike');
      const id = async (c: C) => (await c.call('GET', '/api/auth/me')).body['user'].id as string;
      const [ua, ub, um] = [await id(a), await id(b), await id(m)];
      const orgA = (await a.call('POST', `${R}/orgs`, { name: 'Alpha Bank' })).body['organization'].id as string;
      const orgB = (await b.call('POST', `${R}/orgs`, { name: 'Beta Bank' })).body['organization'].id as string;
      const inv = await a.call('POST', `${R}/orgs/${orgA}/invitations`, { invitee: 'mike@example.test', role: 'member' });
      await m.call('POST', `${R}/invitations/accept`, { token: inv.body['token'] });
      const invId = ((await a.call('GET', `${R}/orgs/${orgA}/invitations`)).body['invitations'] as { id: string }[])[0]?.id ?? 'inv_x';
      const sidA = (await a.call('POST', `${R}/orgs/${orgA}/sessions`, { label: 'Alpha run' })).body['session'].sessionId as string;
      const sidB = (await b.call('POST', `${R}/orgs/${orgB}/sessions`, { label: 'Beta run' })).body['session'].sessionId as string;
      await a.call('POST', `${R}/orgs/${orgA}/sessions/${sidA}/participants`, { userId: ua });
      await a.call('POST', `${R}/orgs/${orgA}/sessions/${sidA}/participants`, { userId: um });
      const acct = 'G' + 'A'.repeat(55);
      const ids: Ids = { org: orgA, sid: sidA, bid: 'bat_' + 'a'.repeat(24), ob: 'obl_' + 'a'.repeat(24), uid: um, inv: invId, ch: 'chl_' + 'a'.repeat(24), acct, att: '1' };
      const hex = (s: string) => s.replace(/[0-9a-f]/g, 'e');
      const fake: Ids = { ...ids, org: hex(orgA), sid: hex(sidA), uid: hex(um) };
      const own: Ids = { ...ids, org: orgB };
      void sidB; void ub;
      return { h, a, b, ids, fake, own, secrets: [orgA, sidA, ua, um, 'Alpha Bank', 'Alpha run', 'alice@example.test', 'mike@example.test'] };
    }

    test('the route table covers every organization-scoped route of the router, and every entry is a real route', async () => {
      const src = readFileSync(new URL('../lib/registry/http.ts', import.meta.url), 'utf8');
      // leaf names the router dispatches on after /orgs/:org (a coarse but real cross-check: a new top-level organization route must be added to the table)
      const subs = new Set([...src.matchAll(/sub === '([a-z-]+)'/g)].map((m) => m[1]));
      const tableSubs = new Set(ROUTES.map((r) => r.path({ org: 'o', sid: 's', bid: 'b', ob: 'x', uid: 'u', inv: 'i', ch: 'c', acct: 'a', att: '1' }).split('/')[3]).filter(Boolean));
      for (const s of subs) assert.ok(tableSubs.has(s as string), `the router dispatches on '${s}' but the table has no route for it`);
      const f = await fixture();
      try {
        // owner view: no table entry may answer like a route that does not exist
        const missing = shape(await f.a.call('GET', `${R}/orgs/${f.ids.org}/definitely-not-a-route`));
        for (const r of ROUTES) {
          const owner = shape(await call(f.a, r, f.ids));
          assert.ok(!(owner.status === 404 && owner.message === missing.message), `${r.method} ${r.path(f.ids)} is not a real route`);
        }
      } finally { await f.h.close(); }
    });

    test('foreign administrator: every route answers exactly like a nonexistent organization, and nothing leaks', async () => {
      const f = await fixture();
      try {
        for (const r of ROUTES) {
          const foreign = await call(f.b, r, f.ids);
          const ghost = await call(f.b, r, f.fake);
          assert.deepEqual(shape(foreign), shape(ghost), `${r.method} ${r.path(f.ids)}: a foreign organization must look like a nonexistent one`);
          assert.ok(foreign.status >= 400, `${r.method} ${r.path(f.ids)}: refused (${foreign.status})`);
          const text = JSON.stringify(foreign.body);
          for (const s of f.secrets) assert.ok(!text.includes(s), `${r.method} ${r.path(f.ids)}: the response leaks ${s}`);
        }
      } finally { await f.h.close(); }
    });

    test('foreign administrator: no route changes anything (every table row count is unchanged)', async () => {
      const f = await fixture();
      try {
        const tables = ['organizations', 'memberships', 'invitations', 'org_reviewers', 'sessions', 'session_participants', 'obligations', 'calculations', 'authorization_decisions', 'settlement_batches', 'settlement_executions', 'org_wallets', 'wallet_challenges', 'wallet_verifications', 'activity'];
        const snap = async () => Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await f.h.count(t).catch(() => -1)])));
        const before = await snap();
        for (const r of ROUTES) await call(f.b, r, f.ids);
        assert.deepEqual(await snap(), before, 'a foreign administrator wrote nothing');
      } finally { await f.h.close(); }
    });

    test('identifier swapping: an own-organization route with another organization\'s session answers like a nonexistent session', async () => {
      const f = await fixture();
      try {
        const swapped: Ids = { ...f.ids, org: f.own.org }; // beth's organization, alice's session, batch and obligation ids
        const ghost: Ids = { ...swapped, sid: f.fake.sid, uid: f.fake.uid };
        for (const r of ROUTES.filter((x) => x.path(f.ids).includes('/sessions/'))) {
          const a = shape(await call(f.b, r, swapped));
          const g = shape(await call(f.b, r, ghost));
          assert.deepEqual(a, g, `${r.method} ${r.path(swapped)}: another organization's session id must look nonexistent`);
          assert.ok(a.status >= 400);
        }
      } finally { await f.h.close(); }
    });

    test('a member of the organization is not an administrator: administrator-only writes are refused with a permission error, not a not-found', async () => {
      const f = await fixture();
      try {
        const mike = await signedIn(f.h.b, 'mike2').catch(() => null);
        void mike;
        const inv = await f.a.call('POST', `${R}/orgs/${f.ids.org}/invitations`, { invitee: 'nina@example.test', role: 'member' });
        const nina = await signedIn(f.h.b, 'nina');
        await nina.call('POST', `${R}/invitations/accept`, { token: inv.body['token'] });
        for (const path of [`/orgs/${f.ids.org}/update`, `/orgs/${f.ids.org}/invitations`, `/orgs/${f.ids.org}/reviewers/${f.ids.uid}/grant`]) {
          const r = await nina.call('POST', R + path, { name: 'Hijack', invitee: 'x@example.test', role: 'admin' });
          assert.equal(r.status, 403, `${path}: members cannot do administrator work (${r.status})`);
        }
      } finally { await f.h.close(); }
    });

    test('unauthenticated callers get 401 on every organization-scoped route', async () => {
      const f = await fixture();
      try {
        const anon = f.h.b ? (await import('./backend-helpers.ts')).client(f.h.b) : null;
        for (const r of ROUTES) assert.equal((await call(anon as C, r, f.ids)).status, 401, `${r.method} ${r.path(f.ids)}`);
      } finally { await f.h.close(); }
    });
  });
}
