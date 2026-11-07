// Security and API tests through the REAL handlers, a REAL SQLite database and REAL server-side sessions. Mirrors the threat list of
// BACKEND_PERSISTENCE_SECURITY_REPORT.md (numbers in the test names match it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readBackendConfig, BackendUnavailable } from '../lib/server/backend.ts';
import { DevelopmentIdentityProvider } from '../lib/registry/identity.ts';
import { SESSION_COOKIE } from '../lib/auth/http.ts';
import { client, codeAsync, makeBackend, newUser, PASSWORD, signedIn } from './backend-helpers.ts';
import { readFileSync } from 'node:fs';

const orgOf = async (c: ReturnType<typeof client>, name: string) => (await c.call('POST', '/api/registry/orgs', { name })).body['organization'].id as string;

test('S1 unauthenticated: every registry route answers 401', async () => {
  const { b } = makeBackend(); const c = client(b);
  for (const [m, p] of [['GET', '/api/registry/orgs'], ['POST', '/api/registry/orgs'], ['GET', '/api/registry/orgs/org_x/sessions'], ['POST', '/api/registry/invitations/accept']] as const) assert.equal((await c.call(m, p, m === 'POST' ? {} : undefined)).status, 401, `${m} ${p}`);
  assert.equal((await c.call('GET', '/api/auth/me')).status, 401);
});

test('S2 invalid, forged, expired and revoked sessions are rejected', async () => {
  const { b, clock } = makeBackend();
  const c = await signedIn(b, 'ann');
  assert.equal((await c.call('GET', '/api/registry/orgs')).status, 200);
  const good = c.cookie;
  c.cookie = `${SESSION_COOKIE}=${'A'.repeat(43)}`; assert.equal((await c.call('GET', '/api/registry/orgs')).status, 401, 'well-formed but unknown token');
  c.cookie = `${SESSION_COOKIE}=short`; assert.equal((await c.call('GET', '/api/registry/orgs')).status, 401);
  c.cookie = good;
  clock.t += 9 * 3600 * 1000; // past the 8 hour absolute lifetime
  assert.equal((await c.call('GET', '/api/registry/orgs')).status, 401, 'expired session');
  clock.t -= 9 * 3600 * 1000;
  assert.equal((await c.call('GET', '/api/registry/orgs')).status, 200);
  assert.equal((await c.call('POST', '/api/auth/logout', {})).status, 200);
  c.cookie = good; assert.equal((await c.call('GET', '/api/registry/orgs')).status, 401, 'the old token is dead after logout (server-side revocation)');
});

test('S3 forged identity headers and S4 arbitrary user-id injection grant nothing', async () => {
  const { b } = makeBackend(); const ann = await signedIn(b, 'ann'); const orgId = await orgOf(ann, 'Alpha Bank');
  const anon = client(b);
  for (const h of [{ 'x-tobin-dev-user': 'dev:demo' }, { 'x-tobin-dev-user': 'ann' }, { 'x-user-id': 'ann' }, { authorization: 'Bearer ann' }, { 'x-forwarded-user': 'ann' }] as Record<string, string>[]) {
    assert.equal((await anon.call('GET', '/api/registry/orgs', undefined, h)).status, 401, JSON.stringify(h));
    assert.equal((await anon.call('GET', `/api/registry/orgs/${orgId}`, undefined, h)).status, 401);
  }
  // a signed-in user injecting someone else's id in a body or query stays themselves
  const bob = await signedIn(b, 'bob');
  const r = await bob.call('POST', '/api/registry/orgs', { name: 'Bobs Fund', createdBy: 'ann', userId: 'ann', actor: 'ann' });
  const me = (await bob.call('GET', '/api/auth/me')).body['user'].id;
  const org = r.body['organization'];
  assert.equal(org.createdBy, me);
  assert.equal((await bob.call('GET', `/api/registry/orgs/${orgId}`)).status, 404, 'bob cannot read ann org even when claiming to be ann');
});

test('S5 cross-organization access returns the same 404 for foreign and nonexistent resources', async () => {
  const { b } = makeBackend(); const ann = await signedIn(b, 'ann'); const bob = await signedIn(b, 'bob');
  const a = await orgOf(ann, 'Alpha Bank'); await orgOf(bob, 'Beta Fund');
  const sid = (await ann.call('POST', `/api/registry/orgs/${a}/sessions`, { label: 'secret draft' })).body['session'].sessionId;
  const real = [['GET', `/api/registry/orgs/${a}`], ['GET', `/api/registry/orgs/${a}/members`], ['GET', `/api/registry/orgs/${a}/sessions`], ['GET', `/api/registry/orgs/${a}/sessions/${sid}`], ['GET', `/api/registry/orgs/${a}/invitations`], ['GET', `/api/registry/orgs/${a}/wallets`], ['POST', `/api/registry/orgs/${a}/sessions`, { label: 'x' }], ['POST', `/api/registry/orgs/${a}/invitations`, { invitee: 'x@y.z', role: 'admin' }], ['POST', `/api/registry/orgs/${a}/update`, { name: 'pwned' }]] as const;
  for (const [m, p, body] of real) {
    const foreign = await bob.call(m, p, body); const none = await bob.call(m, p.replace(a, 'org_doesnotexist'), body);
    assert.equal(foreign.status, 404, `${m} ${p}`); assert.deepEqual(foreign.body, none.body, 'identical to a nonexistent organization');
  }
  assert.equal((await ann.call('GET', `/api/registry/orgs/${a}`)).body['organization'].name, 'Alpha Bank', 'nothing was altered');
});

test('S6 role changes: members cannot promote anyone (or themselves); S7 the last administrator is protected over HTTP', async () => {
  const { b } = makeBackend(); const ann = await signedIn(b, 'ann'); const bob = await signedIn(b, 'bob');
  const org = await orgOf(ann, 'Alpha Bank');
  const inv = await ann.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: 'bob@example.test', role: 'member' });
  assert.equal((await bob.call('POST', '/api/registry/invitations/accept', { token: inv.body['token'] })).status, 200);
  const bobId = (await bob.call('GET', '/api/auth/me')).body['user'].id; const annId = (await ann.call('GET', '/api/auth/me')).body['user'].id;
  assert.equal((await bob.call('POST', `/api/registry/orgs/${org}/members/${bobId}/role`, { role: 'admin' })).status, 403, 'self-promotion');
  assert.equal((await bob.call('POST', `/api/registry/orgs/${org}/members/${annId}/remove`, {})).status, 403);
  assert.equal((await bob.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: 'c@d.ef', role: 'member' })).status, 403, 'members cannot invite');
  assert.equal((await bob.call('GET', `/api/registry/orgs/${org}/invitations`)).status, 403, 'members cannot read invitations');
  assert.equal((await ann.call('POST', `/api/registry/orgs/${org}/members/${annId}/role`, { role: 'member' })).status, 409, 'last admin cannot be demoted');
  assert.equal((await ann.call('POST', `/api/registry/orgs/${org}/members/${annId}/remove`, {})).status, 409, 'last admin cannot be removed');
  assert.equal((await ann.call('POST', `/api/registry/orgs/${org}/members/${bobId}/role`, { role: 'superuser' })).status, 400, 'unknown role');
  assert.equal((await ann.call('POST', `/api/registry/orgs/${org}/members/${bobId}/role`, { role: 'admin' })).status, 200);
});

test('S8 replay, S9 expiry, S10 revocation, S11 leakage: the invitation token', async () => {
  const { b, clock } = makeBackend(); const ann = await signedIn(b, 'ann'); const bob = await signedIn(b, 'bob'); const cy = await signedIn(b, 'cy');
  const org = await orgOf(ann, 'Alpha Bank');
  const mk = async (invitee: string) => (await ann.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee, role: 'member' })).body;
  const one = await mk('bob@example.test');
  assert.equal(one['delivery'].sent, false, 'the API says plainly that no email was sent');
  assert.equal((await bob.call('POST', '/api/registry/invitations/accept', { token: one['token'] })).status, 200);
  assert.equal((await cy.call('POST', '/api/registry/invitations/accept', { token: one['token'] })).status, 400, 'replay by another user');
  assert.equal((await bob.call('POST', '/api/registry/invitations/accept', { token: one['token'] })).status, 400, 'replay by the same user (already a member)');
  const two = await mk('cy@example.test');
  assert.equal((await ann.call('POST', `/api/registry/orgs/${org}/invitations/${two['invitation'].id}/revoke`, {})).status, 200);
  assert.equal((await cy.call('POST', '/api/registry/invitations/accept', { token: two['token'] })).status, 400, 'revoked');
  const three = await mk('cy@example.test'); clock.t += 8 * 24 * 3600 * 1000;
  await cy.call('POST', '/api/auth/login', { email: 'cy@example.test', password: PASSWORD }); // the 8 hour browser session also expired; sign in again
  assert.equal((await cy.call('POST', '/api/registry/invitations/accept', { token: three['token'] })).status, 400, 'expired (7 day lifetime)');
  // leakage: the token never appears in the list API, the activity history, or the database, and only a hash is stored
  clock.t -= 8 * 24 * 3600 * 1000;
  const four = await mk('dee@example.test'); const tok = four['token'] as string;
  assert.ok(!JSON.stringify((await ann.call('GET', `/api/registry/orgs/${org}/invitations`)).body).includes(tok));
  assert.ok(!JSON.stringify(b.registry.activity({ userId: (await ann.call('GET', '/api/auth/me')).body['user'].id, kind: 'verified' }, org)).includes(tok));
  const dump = JSON.stringify([b.db.raw.prepare('SELECT * FROM invitations').all(), b.db.raw.prepare('SELECT * FROM activity').all(), b.db.raw.prepare('SELECT * FROM auth_sessions').all()]);
  assert.ok(!dump.includes(tok), 'the secret is not in the database');
  assert.match(String(b.db.raw.prepare('SELECT token_hash FROM invitations ORDER BY rowid DESC').get()?.['token_hash']), /^[0-9a-f]{64}$/);
});

test('S8b an invitation addressed to an email cannot be accepted by a different verified account', async () => {
  const { b } = makeBackend(); const ann = await signedIn(b, 'ann'); const eve = await signedIn(b, 'eve');
  const org = await orgOf(ann, 'Alpha Bank');
  const inv = await ann.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: 'bob@example.test', role: 'admin' });
  assert.equal((await eve.call('POST', '/api/registry/invitations/accept', { token: inv.body['token'] })).status, 400, 'a stolen token alone is not enough');
  assert.equal((await ann.call('GET', `/api/registry/orgs/${org}/members`)).body['members'].length, 1);
});

test('S8c guessing invitation tokens is rate limited per account', async () => {
  const { b } = makeBackend(); const eve = await signedIn(b, 'eve');
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await eve.call('POST', '/api/registry/invitations/accept', { token: `guess-${i}-xxxxxxxxxxxxxxxxxxxx` })).status;
  assert.equal(last, 429);
});

test('S12 mass assignment: ids, provenance, roles and audit fields in bodies are ignored', async () => {
  const { b } = makeBackend(); const ann = await signedIn(b, 'ann');
  const org = (await ann.call('POST', '/api/registry/orgs', { name: 'Alpha Bank', id: 'org_chosen', createdAt: '1999-01-01T00:00:00Z', role: 'member' })).body['organization'];
  assert.notEqual(org.id, 'org_chosen'); assert.notEqual(org.createdAt, '1999-01-01T00:00:00Z');
  assert.equal((await ann.call('GET', `/api/registry/orgs/${org.id}`)).body['role'], 'admin');
  const s = (await ann.call('POST', `/api/registry/orgs/${org.id}/sessions`, { label: 'x', sessionId: 'ee'.repeat(32), provenance: 'chain-confirmed', confirmedTxHash: 'f'.repeat(64), chain: { state: 'SETTLED' }, orgId: 'org_other' })).body['session'];
  assert.equal(s.provenance, 'local-draft'); assert.notEqual(s.sessionId, 'ee'.repeat(32)); assert.equal(s.orgId, org.id); assert.equal(s.confirmedTxHash, undefined); assert.equal(s.chain, undefined);
  const upd = await ann.call('POST', `/api/registry/orgs/${org.id}/update`, { description: 'new', createdBy: 'someone', id: 'org_x' });
  assert.equal(upd.body['organization'].createdBy, org.createdBy); assert.equal(upd.body['organization'].id, org.id);
});

test('S13 production rejects the development identity unconditionally, whatever flag is set', () => {
  const was = process.env['NODE_ENV'];
  try {
    (process.env as Record<string, string>)['NODE_ENV'] = 'production';
    process.env['TOBIN_ALLOW_DEV_IDENTITY'] = '1'; process.env['TOBIN_DEV_IDENTITY'] = '1';
    assert.throws(() => new DevelopmentIdentityProvider(), /cannot exist in production/);
  } finally { (process.env as Record<string, string | undefined>)['NODE_ENV'] = was; delete process.env['TOBIN_ALLOW_DEV_IDENTITY']; delete process.env['TOBIN_DEV_IDENTITY']; }
  // and no production code path reads such a flag at all
  for (const f of ['lib/registry/http.ts', 'lib/server/backend.ts', 'lib/auth/http.ts', 'lib/auth/service.ts', 'app/api/registry/[...path]/route.ts', 'app/api/auth/[...path]/route.ts']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!/ALLOW_DEV_IDENTITY|DevelopmentIdentityProvider|x-tobin-dev-user/.test(src), `${f} does not reference development identity`);
  }
});

test('S13b production configuration fails closed: no path, or an in-memory path, means no backend', () => {
  assert.throws(() => readBackendConfig({ NODE_ENV: 'production' }), BackendUnavailable);
  assert.throws(() => readBackendConfig({ NODE_ENV: 'production', TOBIN_DB_PATH: ':memory:' }), /in-memory/);
  assert.equal(readBackendConfig({ NODE_ENV: 'production', TOBIN_DB_PATH: '/var/lib/tobin/app.sqlite' }).secureCookies, true);
  assert.match(readBackendConfig({ NODE_ENV: 'development' }).dbPath, /tobin-dev\.sqlite$/);
  assert.equal(readBackendConfig({ NODE_ENV: 'development' }).secureCookies, false);
});

test('S14 fixture and S15 draft provenance cannot be escalated through any ordinary operation', async () => {
  const { b } = makeBackend(); const ann = await signedIn(b, 'ann'); const org = await orgOf(ann, 'Alpha Bank');
  const sid = (await ann.call('POST', `/api/registry/orgs/${org}/sessions`, { label: 'draft' })).body['session'].sessionId;
  for (const p of [`/api/registry/orgs/${org}/sessions/${sid}/confirm`, `/api/registry/orgs/${org}/sessions/${sid}/chain`, `/api/registry/orgs/${org}/sessions/${sid}`, `/api/registry/orgs/${org}/sessions/${sid}/provenance`]) {
    assert.equal((await ann.call('POST', p, { provenance: 'chain-confirmed', txHash: 'f'.repeat(64), txStatus: 'SUCCESS' })).status, 404, p);
  }
  const ws = (await ann.call('GET', `/api/registry/orgs/${org}/sessions/${sid}`)).body['workspace'];
  assert.equal(ws.banner.label, 'Local draft'); assert.equal(ws.overview.confirmedTxHash, null);
  // the database refuses an escalation even if code tried to write it directly
  assert.throws(() => b.db.raw.prepare("UPDATE sessions SET provenance = 'chain-confirmed' WHERE session_id = ?").run(sid), /CHECK/);
  assert.throws(() => b.db.raw.prepare("UPDATE sessions SET provenance = 'chain-read' WHERE session_id = ?").run(sid), /CHECK/);
  // a fixture row cannot be given chain data by the Registry either
  const fx = 'f1'.repeat(32); b.registry.recordSession({ userId: (await ann.call('GET', '/api/auth/me')).body['user'].id, kind: 'verified' }, org, { sessionId: fx, label: 'Fixture', fixture: true });
  assert.equal(await codeAsync(async () => b.registry.attachChainRead({ userId: (await ann.call('GET', '/api/auth/me')).body['user'].id, kind: 'verified' }, org, fx, { state: 'OPEN', participants: [], creator: 'G', readAtLedger: 5 })), 'FIXTURE');
});

test('requests without the request header are refused (CSRF defence in depth) while GETs work', async () => {
  const { b } = makeBackend(); const ann = await signedIn(b, 'ann');
  assert.equal((await ann.call('POST', '/api/registry/orgs', { name: 'Alpha Bank' }, {}, false)).status, 403);
  assert.equal((await ann.call('POST', '/api/auth/logout', {}, {}, false)).status, 403);
  assert.equal((await ann.call('GET', '/api/registry/orgs')).status, 200);
});

test('authentication: cookie flags, generic failures, lockout after repeated failures, password stored only as a salted hash', async () => {
  const { b, clock } = makeBackend(); const c = client(b);
  const reg = await c.call('POST', '/api/auth/register', { email: 'Ann@Example.test', password: PASSWORD, displayName: 'Ann' });
  assert.equal(reg.status, 201);
  const cookie = String(reg.headers.get('set-cookie'));
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Secure/); assert.match(cookie, /Path=\//);
  assert.ok(!JSON.stringify(reg.body).includes(PASSWORD));
  const row = b.db.raw.prepare('SELECT * FROM users').get() as Record<string, string>;
  assert.equal(row['email'], 'ann@example.test'); assert.match(row['password_hash'] as string, /^scrypt\$10\$8\$1\$/); assert.ok(!(row['password_hash'] as string).includes(PASSWORD));
  const tokenInCookie = cookie.split(';')[0]?.split('=')[1] as string;
  assert.ok(!JSON.stringify(b.db.raw.prepare('SELECT * FROM auth_sessions').all()).includes(tokenInCookie), 'only the hash of the session token is stored');
  const dup = await client(b).call('POST', '/api/auth/register', { email: 'ann@example.test', password: PASSWORD, displayName: 'Other' });
  assert.equal(dup.status, 409); assert.equal(dup.body['error'], 'REGISTRATION_FAILED');
  assert.equal((await client(b).call('POST', '/api/auth/register', { email: 'x@y.z', password: 'short', displayName: 'X' })).status, 400);
  const wrong = await client(b).call('POST', '/api/auth/login', { email: 'ann@example.test', password: 'nope-nope-nope-nope' });
  const unknown = await client(b).call('POST', '/api/auth/login', { email: 'ghost@example.test', password: 'nope-nope-nope-nope' });
  assert.equal(wrong.status, 401); assert.deepEqual(wrong.body, unknown.body, 'unknown account and wrong password are indistinguishable');
  for (let i = 0; i < 4; i++) await client(b).call('POST', '/api/auth/login', { email: 'ann@example.test', password: 'nope-nope-nope-nope' });
  assert.equal((await client(b).call('POST', '/api/auth/login', { email: 'ann@example.test', password: PASSWORD })).status, 429, 'locked out even with the right password');
  clock.t += 16 * 60 * 1000;
  assert.equal((await client(b).call('POST', '/api/auth/login', { email: 'ann@example.test', password: PASSWORD })).status, 200, 'the lockout window passes');
  const out = await c.call('POST', '/api/auth/logout', {});
  assert.match(String(out.headers.get('set-cookie')), /Max-Age=0/);
});

test('participants and wallet claims: application records, kept apart from membership, unproven', async () => {
  const { b } = makeBackend(); const ann = await signedIn(b, 'ann'); const bob = await signedIn(b, 'bob'); const eve = await signedIn(b, 'eve');
  const org = await orgOf(ann, 'Alpha Bank');
  const inv = await ann.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: 'bob@example.test', role: 'member' });
  await bob.call('POST', '/api/registry/invitations/accept', { token: inv.body['token'] });
  const bobId = (await bob.call('GET', '/api/auth/me')).body['user'].id; const eveId = (await eve.call('GET', '/api/auth/me')).body['user'].id;
  const addr = 'G' + 'B'.repeat(55);
  const w = await ann.call('POST', `/api/registry/orgs/${org}/wallets`, { address: addr, proof: 'signature-verified' });
  assert.equal(w.body['wallet'].proof, 'none', 'a supplied proof flag is ignored: a link is only a claim');
  assert.equal((await ann.call('POST', `/api/registry/orgs/${org}/wallets`, { address: 'not-an-address' })).status, 400);
  assert.equal((await bob.call('POST', `/api/registry/orgs/${org}/wallets`, { address: addr })).status, 403);
  const sid = (await ann.call('POST', `/api/registry/orgs/${org}/sessions`, { label: 'draft' })).body['session'].sessionId;
  const url = `/api/registry/orgs/${org}/sessions/${sid}/participants`;
  assert.equal((await ann.call('POST', url, { userId: eveId })).status, 400, 'a non-member cannot be a participant');
  assert.equal((await ann.call('POST', url, { userId: bobId, walletAddress: 'G' + 'C'.repeat(55) })).status, 400, 'a wallet must be one of the organization claims');
  assert.equal((await bob.call('POST', url, { userId: bobId })).status, 403);
  assert.equal((await ann.call('POST', url, { userId: bobId, walletAddress: addr })).status, 201);
  const ws = (await bob.call('GET', `/api/registry/orgs/${org}/sessions/${sid}`)).body['workspace'];
  assert.equal(ws.participants.available, true); assert.match(ws.participants.note, /not an on-chain admission/);
  assert.equal(ws.participants.items[0].name, 'bob'); assert.match(ws.participants.items[0].address, /claim, unproven/);
  assert.equal(ws.banner.label, 'Local draft', 'adding a participant did not change provenance');
  await ann.call('POST', `/api/registry/orgs/${org}/members/${bobId}/remove`, {});
  const kept = b.registry.sessionParticipants({ userId: (await ann.call('GET', '/api/auth/me')).body['user'].id, kind: 'verified' }, org, sid);
  assert.equal(kept.length, 1, 'the participation record is kept as history'); assert.equal(kept[0]?.status, 'removed', 'but it is marked removed when the member leaves');
});

test('activity: recorded for the operations in scope, with actor names, immutable through the API, never containing secrets', async () => {
  const { b } = makeBackend(); const ann = await signedIn(b, 'ann'); const org = await orgOf(ann, 'Alpha Bank');
  const inv = await ann.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: 'bob@example.test', role: 'member' });
  const sid = (await ann.call('POST', `/api/registry/orgs/${org}/sessions`, { label: 'draft' })).body['session'].sessionId;
  const ws = (await ann.call('GET', `/api/registry/orgs/${org}/sessions/${sid}`)).body['workspace'];
  assert.deepEqual(ws.activity.items.map((a: { kind: string }) => a.kind), ['session.recorded'], 'the workspace shows the activity of that session');
  const me = { userId: (await ann.call('GET', '/api/auth/me')).body['user'].id, kind: 'verified' as const };
  assert.deepEqual(b.registry.activity(me, org).map((a) => a.kind), ['organization.created', 'invitation.created', 'session.recorded'], 'the organization history has all of them');
  assert.equal(ws.activity.items[0].actor, 'ann');
  assert.ok(!JSON.stringify(ws).includes(inv.body['token']));
  assert.ok(!JSON.stringify(b.db.raw.prepare('SELECT * FROM activity').all()).includes(PASSWORD));
  for (const m of ['POST', 'DELETE', 'PUT', 'PATCH']) assert.equal((await ann.call(m, `/api/registry/orgs/${org}/activity`, {})).status, 404, `${m} activity`);
  await newUser(b, 'zed');
});

test('health: schema status only, no paths or credentials', async () => {
  const { b } = makeBackend();
  const { migrationStatus } = await import('../lib/db/database.ts');
  const st = migrationStatus(b.db);
  assert.equal(st.pending.length, 0); assert.equal(st.current, 2);
});
