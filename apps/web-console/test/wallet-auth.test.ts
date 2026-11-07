// Wallet-first authentication, sessions, multiple wallets, onboarding, invitations, membership status and the migration, through the REAL HTTP handlers and REAL SQLite.
// LABELS: keys are throwaway ed25519 pairs made with node:crypto. The "wallet" is a function in this file that signs the text the server issued (a MOCK of Freighter);
// the SERVER verification of those signatures is real. NO real Freighter, NO Stellar network, NO real account is involved.
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { encodeAddress } from 'tobin-mvp1-sdk/strkey';
import { MIGRATIONS, migrate, migrationStatus, openDatabase } from '../lib/db/database.ts';
import { ownerToolsAllowed } from '../lib/stellar/owner-access.ts';
import { PASSWORD, client, makeBackend, signedIn } from './backend-helpers.ts';
import type { Backend } from '../lib/server/backend.ts';

const HOST = { host: '127.0.0.1:8787' };
function newKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32);
  const address = encodeAddress('account', new Uint8Array(raw));
  const sep53 = (m: string) => sign(null, createHash('sha256').update(`Stellar Signed Message:\n${m}`, 'utf8').digest(), privateKey).toString('base64');
  const raw64 = (m: string) => sign(null, Buffer.from(m, 'utf8'), privateKey).toString('base64');
  return { address, sep53, raw64 };
}
type Key = ReturnType<typeof newKey>;
type Cl = ReturnType<typeof client>;
const wallet = (b: Backend) => { const c = client(b); return { c, call: (m: string, p: string, body?: unknown) => c.call(m, p, body, HOST) }; };
type W = ReturnType<typeof wallet>;

async function challenge(w: W, k: Key, link = false) {
  const r = await w.call('POST', link ? '/api/auth/wallet/link/challenge' : '/api/auth/wallet/challenge', { publicKey: k.address, network: 'testnet' });
  return r;
}
/** the full sign-in: challenge, the mock wallet signs the issued text, the server verifies */
async function signIn(w: W, k: Key) {
  const ch = await challenge(w, k); assert.equal(ch.status, 201, JSON.stringify(ch.body));
  const c = ch.body['challenge'];
  return { ch: c, res: await w.call('POST', '/api/auth/wallet/verify', { challengeId: c.id, signature: k.sep53(c.message), scheme: 'sep-53' }) };
}
async function link(w: W, k: Key) {
  const ch = await challenge(w, k, true); if (ch.status !== 201) return ch;
  const c = ch.body['challenge'];
  return w.call('POST', '/api/auth/wallet/link/verify', { challengeId: c.id, signature: k.sep53(c.message), scheme: 'sep-53' });
}
const err = (r: { status: number; body: Record<string, any> }) => `${r.status} ${r.body['error']}`;

// ---------------------------------------------------------------- challenge
test('a challenge is bound to the site, purpose, network, key, a nonce and a short validity; the text is rebuilt on the server', async () => {
  const { b } = makeBackend(); const w = wallet(b); const k = newKey();
  const r = await challenge(w, k); assert.equal(r.status, 201);
  const c = r.body['challenge']; const m = c.message as string;
  for (const part of ['Tobin wallet sign-in v1', 'domain: 127.0.0.1:8787', 'purpose: sign-in', 'network: testnet', `public key: ${k.address}`, 'nonce: ', 'issued: ', 'expires: ', 'signs no transaction']) assert.ok(m.includes(part), part);
  assert.match(c.id, /^[0-9a-f]{32}$/);
  assert.ok(new Date(c.expiresAt).getTime() - Date.parse('2026-11-08T10:00:00Z') <= 5 * 60 * 1000);
  const row = b.db.raw.prepare('SELECT * FROM auth_challenges WHERE id = ?').get(c.id) as Record<string, unknown>;
  assert.equal(row['purpose'], 'sign-in'); assert.equal(row['consumed_at'], null); assert.equal(row['user_id'], null);
  assert.equal(err(await w.call('POST', '/api/auth/wallet/challenge', { publicKey: 'GNOTANADDRESS' })), '400 INVALID');
  assert.equal(err(await w.call('POST', '/api/auth/wallet/challenge', { publicKey: k.address, network: 'public' })), '400 INVALID', 'Mainnet is not enabled');
  const noHost = await w.c.call('POST', '/api/auth/wallet/challenge', { publicKey: k.address }); assert.equal(noHost.status, 400, 'a challenge needs the site it is for');
  const noHeader = await w.c.call('POST', '/api/auth/wallet/challenge', { publicKey: k.address }, HOST, false); assert.equal(noHeader.status, 403, 'CSRF header required');
});

// ---------------------------------------------------------------- first sign-in and session
test('first sign-in creates an internal user with NO email, NO role and NO organization; the session cookie is HttpOnly, SameSite=Strict and Secure', async () => {
  const { b } = makeBackend(); const w = wallet(b); const k = newKey();
  const { res } = await signIn(w, k);
  assert.equal(res.status, 200, JSON.stringify(res.body)); assert.equal(res.body['isNew'], true);
  const cookie = res.headers.get('set-cookie') as string;
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Secure/); assert.match(cookie, /Path=\//); assert.doesNotMatch(cookie, /Domain=/);
  assert.equal(JSON.stringify(res.body).includes(cookie.split(';')[0]!.split('=')[1]!), false, 'the token is never in the body');
  const me = await w.call('GET', '/api/auth/me');
  assert.equal(me.status, 200); assert.equal(me.body['user'].authMethod, 'wallet'); assert.equal(me.body['user'].email, undefined, 'no email is exposed for a wallet-only user');
  assert.deepEqual(me.body['organizations'], []); assert.equal(me.body['onboarding'].step, 'profile');
  assert.deepEqual(me.body['wallets'].map((x: { publicKey: string }) => x.publicKey), [k.address]);
  // no privilege came with the wallet
  assert.equal((await w.call('GET', '/api/registry/orgs')).body['organizations'].length, 0);
  assert.equal(err(await w.call('GET', '/api/registry/orgs/org_000000000000000000')), '404 NOT_FOUND');
  const ev = (await w.call('GET', '/api/auth/audit')).body['events'] as { kind: string; detail: string }[];
  assert.deepEqual(ev.map((e) => e.kind), ['user.created', 'session.created']);
  assert.equal(JSON.stringify(ev).includes('signature'), false, 'no signature material in the audit');
  const stored = b.db.raw.prepare('SELECT token_hash FROM auth_sessions').all() as { token_hash: string }[];
  assert.ok(stored.every((s) => /^[0-9a-f]{64}$/.test(s.token_hash)), 'only a hash of the token is stored');
});

test('a returning wallet resolves to the SAME user; every sign-in rotates the session and revokes the one presented', async () => {
  const { b } = makeBackend(); const w = wallet(b); const k = newKey();
  const first = await signIn(w, k); const id = (await w.call('GET', '/api/auth/me')).body['user'].id; const oldCookie = w.c.cookie;
  const w2 = wallet(b); w2.c.cookie = oldCookie; // the browser still holds the old session when it signs in again
  const second = await signIn(w2, k);
  assert.equal(second.res.body['isNew'], false); assert.notEqual(w2.c.cookie, oldCookie, 'a new token');
  assert.equal((await w2.call('GET', '/api/auth/me')).body['user'].id, id);
  const stale = wallet(b); stale.c.cookie = oldCookie; assert.equal((await stale.call('GET', '/api/auth/me')).status, 401, 'the presented session was revoked (no session fixation)');
  assert.equal(b.db.raw.prepare('SELECT count(*) AS n FROM users').get()?.['n'], 1);
  void first;
});

// ---------------------------------------------------------------- replay, expiry, substitution
test('a challenge is single-use: replay and a concurrent double answer both fail, and exactly one session results', async () => {
  const { b } = makeBackend(); const w = wallet(b); const k = newKey();
  const ch = (await challenge(w, k)).body['challenge']; const body = { challengeId: ch.id, signature: k.sep53(ch.message), scheme: 'sep-53' };
  const results = await Promise.all([wallet(b).call('POST', '/api/auth/wallet/verify', body), wallet(b).call('POST', '/api/auth/wallet/verify', body)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
  assert.equal(b.db.raw.prepare('SELECT count(*) AS n FROM auth_sessions').get()?.['n'], 1);
  assert.equal(err(await wallet(b).call('POST', '/api/auth/wallet/verify', body)), '401 AUTH_FAILED', 'replay');
  assert.ok(b.db.raw.prepare('SELECT consumed_at FROM auth_challenges WHERE id = ?').get(ch.id)?.['consumed_at']);
});
test('an expired challenge is refused with the same generic error', async () => {
  const { b, clock } = makeBackend(); const w = wallet(b); const k = newKey();
  const ch = (await challenge(w, k)).body['challenge']; clock.t += 5 * 60 * 1000 + 1;
  const r = await w.call('POST', '/api/auth/wallet/verify', { challengeId: ch.id, signature: k.sep53(ch.message), scheme: 'sep-53' });
  assert.equal(err(r), '401 AUTH_FAILED'); assert.equal(r.body['message'], 'sign-in could not be completed');
});
test('wallet-address substitution, a tampered message, the raw scheme and a made-up challenge id all fail; wrong answers burn the challenge', async () => {
  const { b } = makeBackend(); const w = wallet(b); const k = newKey(); const other = newKey();
  const ch = (await challenge(w, k)).body['challenge'];
  const v = (sig: string, scheme = 'sep-53', id = ch.id) => w.call('POST', '/api/auth/wallet/verify', { challengeId: id, signature: sig, scheme });
  assert.equal(err(await v(other.sep53(ch.message))), '401 AUTH_FAILED', 'signed by another key');
  assert.equal(err(await v(k.sep53(ch.message.replace('nonce: ', 'nonce: 0')))), '401 AUTH_FAILED', 'a different text');
  assert.equal(err(await v(k.raw64(ch.message), 'raw')), '401 AUTH_FAILED', 'the raw scheme is not accepted for sign-in');
  assert.equal(err(await v('', 'sep-53', 'a'.repeat(32))), '401 AUTH_FAILED', 'unknown challenge');
  assert.equal(err(await v('not base64!')), '401 AUTH_FAILED');
  // after five wrong answers a challenge is burned even for the right signer
  const ch2 = (await challenge(w, k)).body['challenge'];
  for (let i = 0; i < 5; i++) await w.call('POST', '/api/auth/wallet/verify', { challengeId: ch2.id, signature: other.sep53(ch2.message), scheme: 'sep-53' });
  assert.equal(err(await w.call('POST', '/api/auth/wallet/verify', { challengeId: ch2.id, signature: k.sep53(ch2.message), scheme: 'sep-53' })), '401 AUTH_FAILED', 'burned');
  assert.equal(b.db.raw.prepare('SELECT count(*) AS n FROM users').get()?.['n'], 0, 'nothing was created by any failed attempt');
});
test('rate limits: challenge requests per key, and failed answers per key', async () => {
  const { b } = makeBackend(); const w = wallet(b); const k = newKey();
  for (let i = 0; i < 10; i++) assert.equal((await challenge(w, k)).status, 201);
  assert.equal(err(await challenge(w, k)), '429 RATE_LIMITED');
  assert.equal((await challenge(w, newKey())).status, 201, 'another key is not affected');
  const { b: b2 } = makeBackend(); const w2 = wallet(b2); const k2 = newKey(); const bad = newKey();
  const ch = (await challenge(w2, k2)).body['challenge'];
  b2.db.raw.prepare("UPDATE auth_challenges SET failures = 0").run();
  let last = ''; for (let i = 0; i < 12; i++) { const c2 = (await w2.call('POST', '/api/auth/wallet/verify', { challengeId: ch.id, signature: bad.sep53(ch.message), scheme: 'sep-53' })); last = err(c2); b2.db.raw.prepare('UPDATE auth_challenges SET failures = 0').run(); }
  assert.equal(last, '429 RATE_LIMITED');
});
test('old challenges are cleaned up safely and unconsumed ones never authenticate later', async () => {
  const { b, clock } = makeBackend(); const w = wallet(b); const k = newKey();
  await challenge(w, k); clock.t += 26 * 3600 * 1000; await challenge(w, newKey());
  assert.equal(b.db.raw.prepare('SELECT count(*) AS n FROM auth_challenges').get()?.['n'], 1, 'the day-old challenge was removed');
});

// ---------------------------------------------------------------- sessions
test('sessions: idle timeout, logout, logout-all, renewal with rotation and an absolute limit', async () => {
  const { b, clock } = makeBackend(); const w = wallet(b); const k = newKey();
  await signIn(w, k);
  clock.t += 119 * 60 * 1000; assert.equal((await w.call('GET', '/api/auth/me')).status, 200, 'activity within the idle window keeps it alive');
  clock.t += 119 * 60 * 1000; assert.equal((await w.call('GET', '/api/auth/me')).status, 200, 'and renews the idle window');
  clock.t += 121 * 60 * 1000; assert.equal((await w.call('GET', '/api/auth/me')).status, 401, 'idle for over two hours');
  // renewal rotates the token
  const w2 = wallet(b); await signIn(w2, k); const before = w2.c.cookie;
  assert.equal((await w2.call('POST', '/api/auth/renew', {})).status, 200); assert.notEqual(w2.c.cookie, before);
  const old = wallet(b); old.c.cookie = before; assert.equal((await old.call('GET', '/api/auth/me')).status, 401, 'the old token is revoked');
  // absolute limit: renewals never extend past 24 hours from the first sign-in
  for (let i = 0; i < 16; i++) { clock.t += 90 * 60 * 1000; await w2.call('POST', '/api/auth/renew', {}); }
  clock.t += 20 * 60 * 1000; // > 24 h in total
  assert.equal((await w2.call('POST', '/api/auth/renew', {})).status, 401, 'the absolute limit holds');
  // logout and logout-all
  const w3 = wallet(b); await signIn(w3, k); const w4 = wallet(b); await signIn(w4, k);
  assert.equal((await w3.call('POST', '/api/auth/logout', {})).status, 200); assert.equal((await w3.call('GET', '/api/auth/me')).status, 401);
  assert.equal((await w4.call('GET', '/api/auth/me')).status, 200);
  assert.equal((await w4.call('POST', '/api/auth/logout-all', {})).body['revoked'] >= 1, true); assert.equal((await w4.call('GET', '/api/auth/me')).status, 401);
  assert.equal(err(await wallet(b).call('POST', '/api/auth/profile', { displayName: 'x' })), '401 UNAUTHENTICATED');
});

// ---------------------------------------------------------------- multiple wallets
test('multiple wallets: a new wallet needs its own fresh proof, belongs to one user only, is never merged, and removal keeps history', async () => {
  const { b } = makeBackend(); const a = wallet(b); const ka = newKey(); const ka2 = newKey();
  await signIn(a, ka); const idA = (await a.call('GET', '/api/auth/me')).body['user'].id;
  assert.equal((await link(a, ka2)).status, 201);
  assert.equal((await a.call('GET', '/api/auth/me')).body['wallets'].length, 2);
  // signing in with either wallet reaches the same user
  const viaSecond = wallet(b); await signIn(viaSecond, ka2); assert.equal((await viaSecond.call('GET', '/api/auth/me')).body['user'].id, idA);
  // another user cannot take a wallet that is active elsewhere; nothing is merged
  const other = wallet(b); const ko = newKey(); await signIn(other, ko); const idO = (await other.call('GET', '/api/auth/me')).body['user'].id;
  assert.equal(err(await link(other, ka2)), '409 WALLET_UNAVAILABLE'); assert.notEqual(idO, idA);
  assert.equal((await other.call('GET', '/api/auth/me')).body['wallets'].length, 1);
  // a link challenge is for ONE user: another user cannot answer it
  const ch = (await a.call('POST', '/api/auth/wallet/link/challenge', { publicKey: newKey().address })).body['challenge'];
  assert.equal(err(await other.call('POST', '/api/auth/wallet/link/verify', { challengeId: ch.id, signature: 'AAAA', scheme: 'sep-53' })), '401 AUTH_FAILED');
  // a link challenge cannot sign anyone in, and a sign-in challenge cannot add a wallet
  const lk = newKey(); const lc = (await a.call('POST', '/api/auth/wallet/link/challenge', { publicKey: lk.address })).body['challenge'];
  assert.equal(err(await wallet(b).call('POST', '/api/auth/wallet/verify', { challengeId: lc.id, signature: lk.sep53(lc.message), scheme: 'sep-53' })), '401 AUTH_FAILED');
  const sc = (await challenge(a, lk)).body['challenge'];
  assert.equal(err(await a.call('POST', '/api/auth/wallet/link/verify', { challengeId: sc.id, signature: lk.sep53(sc.message), scheme: 'sep-53' })), '401 AUTH_FAILED');
  // removal: revoked, never deleted; the session created with it ends; the other wallet still works
  const walletId = (await a.call('GET', '/api/auth/me')).body['wallets'].find((x: { publicKey: string }) => x.publicKey === ka2.address).id;
  assert.equal((await a.call('POST', '/api/auth/wallet/remove', { walletId })).status, 200);
  assert.equal((await viaSecond.call('GET', '/api/auth/me')).status, 401, 'the session made with the removed wallet is revoked');
  assert.equal((await a.call('GET', '/api/auth/me')).body['wallets'].length, 1);
  const hist = b.db.raw.prepare("SELECT status, revoked_at FROM user_wallets WHERE public_key = ?").get(ka2.address) as Record<string, unknown>;
  assert.equal(hist['status'], 'revoked'); assert.ok(hist['revoked_at']);
  assert.throws(() => b.db.raw.prepare('DELETE FROM user_wallets').run(), /kept/);
  assert.throws(() => b.db.raw.prepare("UPDATE user_wallets SET user_id = ? WHERE public_key = ?").run(idO, ka2.address), /cannot be moved|final/);
  assert.ok((await a.call('GET', '/api/auth/audit')).body['events'].some((e: { kind: string }) => e.kind === 'wallet.revoked'));
});
test('the only way into a wallet-only account cannot be removed; at most five wallets; an unknown wallet id is a 404', async () => {
  const { b } = makeBackend(); const a = wallet(b); const k = newKey(); await signIn(a, k);
  const id = (await a.call('GET', '/api/auth/me')).body['wallets'][0].id;
  assert.equal(err(await a.call('POST', '/api/auth/wallet/remove', { walletId: id })), '409 LAST_METHOD');
  for (let i = 0; i < 4; i++) assert.equal((await link(a, newKey())).status, 201);
  assert.equal(err(await challenge(a, newKey(), true)), '409 INVALID_STATE');
  assert.equal(err(await a.call('POST', '/api/auth/wallet/remove', { walletId: 'wal_nope' })), '404 NOT_FOUND');
});
test('an email account can add a wallet and then remove all wallets; a wallet user has no password and the placeholder address cannot be used to sign in or to register', async () => {
  const { b } = makeBackend(); const e = await signedIn(b, 'erin'); const k = newKey();
  const ew: W = { c: e as unknown as Cl, call: (m, p, body) => e.call(m, p, body, HOST) };
  assert.equal((await link(ew, k)).status, 201);
  const id = (await e.call('GET', '/api/auth/me')).body['wallets'][0].id; assert.equal((await e.call('POST', '/api/auth/wallet/remove', { walletId: id }, HOST)).status, 200, 'a password account keeps its other method');
  const w = wallet(b); const k2 = newKey(); await signIn(w, k2);
  const placeholder = b.db.raw.prepare("SELECT email FROM users WHERE auth_method = 'wallet'").get()?.['email'] as string;
  assert.match(placeholder, /@wallet\.tobin\.invalid$/);
  assert.equal(err(await client(b).call('POST', '/api/auth/login', { email: placeholder, password: PASSWORD }, HOST)), '401 INVALID_CREDENTIALS');
  assert.equal((await client(b).call('POST', '/api/auth/register', { email: 'x@wallet.tobin.invalid', password: PASSWORD, displayName: 'X' }, HOST)).status, 400);
});

// ---------------------------------------------------------------- onboarding, organizations, invitations
test('onboarding progress lives on the server: profile, then institution, then done; the institution gets its fields and the creator is an application administrator only', async () => {
  const { b } = makeBackend(); const w = wallet(b); await signIn(w, newKey());
  assert.equal((await w.call('GET', '/api/auth/me')).body['onboarding'].step, 'profile');
  assert.equal(err(await w.call('POST', '/api/auth/profile', { displayName: '<b>x</b>' })), '400 INVALID');
  assert.equal((await w.call('POST', '/api/auth/profile', { displayName: 'Ada Ledger' })).status, 200);
  assert.equal((await w.call('GET', '/api/auth/me')).body['onboarding'].step, 'organization');
  // another session of the same user sees the same progress (nothing is browser-only)
  assert.equal(err(await w.call('POST', '/api/registry/orgs', { name: 'X' })), '400 INVALID');
  assert.equal(err(await w.call('POST', '/api/registry/orgs', { name: 'Alpha Bank', institutionType: 'spaceship' })), '400 INVALID');
  assert.equal(err(await w.call('POST', '/api/registry/orgs', { name: 'Alpha Bank', jurisdiction: 'gb' })), '400 INVALID');
  const o = await w.call('POST', '/api/registry/orgs', { name: 'Alpha Bank', institutionType: 'bank', jurisdiction: 'GB', description: 'Test' });
  assert.equal(o.status, 201); const org = o.body['organization'];
  assert.equal(org.institutionType, 'bank'); assert.equal(org.jurisdiction, 'GB');
  assert.equal(err(await w.call('POST', '/api/registry/orgs', { name: '  alpha   BANK ' })), '409 EXISTS', 'ambiguous duplicate for the same user');
  const me = (await w.call('GET', '/api/auth/me')).body;
  assert.equal(me['onboarding'].step, 'done'); assert.deepEqual(me['organizations'].map((x: { role: string }) => x.role), ['admin']);
  // the creator is NOT a reviewer: the administrator role does not carry reviewer authority
  assert.equal((await w.call('GET', `/api/registry/orgs/${org.id}/reviewers`)).body['reviewers'].length, 0);
  // atomic creation: organization, membership and activity exist together
  assert.equal(b.db.raw.prepare('SELECT count(*) AS n FROM activity WHERE org_id = ?').get(org.id)?.['n'], 1);
});
test('the last workspace is remembered on the server but re-checked: a non-member, a removed or a suspended member gets nothing', async () => {
  const { b } = makeBackend(); const a = wallet(b); await signIn(a, newKey()); await a.call('POST', '/api/auth/profile', { displayName: 'Ann' });
  const org = (await a.call('POST', '/api/registry/orgs', { name: 'Alpha Bank' })).body['organization'].id as string;
  const org2 = (await a.call('POST', '/api/registry/orgs', { name: 'Beta Bank' })).body['organization'].id as string;
  assert.equal((await a.call('POST', '/api/auth/workspace', { orgId: org2 })).status, 200); assert.equal((await a.call('GET', '/api/auth/me')).body['lastOrgId'], org2);
  const bob = wallet(b); await signIn(bob, newKey());
  assert.equal(err(await bob.call('POST', '/api/auth/workspace', { orgId: org })), '404 NOT_FOUND', 'a client-supplied organization id is never trusted');
  // invite Bob as a member; then suspend him
  const inv = (await a.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: 'someone', role: 'member' })).body;
  assert.equal((await bob.call('POST', '/api/registry/invitations/accept', { token: inv['token'] })).status, 200);
  await bob.call('POST', '/api/auth/workspace', { orgId: org }); assert.equal((await bob.call('GET', '/api/auth/me')).body['lastOrgId'], org);
  const bobId = (await bob.call('GET', '/api/auth/me')).body['user'].id;
  assert.equal((await a.call('POST', `/api/registry/orgs/${org}/members/${bobId}/status`, { status: 'suspended' })).status, 200);
  assert.equal((await bob.call('GET', '/api/auth/me')).body['lastOrgId'], null, 'a suspended member keeps no workspace');
  assert.equal(err(await bob.call('GET', `/api/registry/orgs/${org}`)), '404 NOT_FOUND'); assert.equal(err(await bob.call('GET', `/api/registry/orgs/${org}/sessions`)), '404 NOT_FOUND');
  assert.equal((await bob.call('GET', '/api/registry/orgs')).body['organizations'].length, 0);
  const row = (await a.call('GET', `/api/registry/orgs/${org}/members`)).body['members'].find((m: { userId: string }) => m.userId === bobId);
  assert.equal(row.status, 'suspended'); assert.ok(row.wallet, 'administrators can see the member wallet');
  assert.equal((await a.call('POST', `/api/registry/orgs/${org}/members/${bobId}/status`, { status: 'active' })).status, 200);
  assert.equal((await bob.call('GET', `/api/registry/orgs/${org}`)).status, 200);
});
test('membership status: no self-suspension, the last active administrator is protected, non-administrators cannot change status', async () => {
  const { b } = makeBackend(); const a = wallet(b); await signIn(a, newKey()); const aId = (await a.call('GET', '/api/auth/me')).body['user'].id;
  const org = (await a.call('POST', '/api/registry/orgs', { name: 'Alpha Bank' })).body['organization'].id as string;
  assert.equal(err(await a.call('POST', `/api/registry/orgs/${org}/members/${aId}/status`, { status: 'suspended' })), '409 INVALID_STATE');
  const m = wallet(b); await signIn(m, newKey()); const mId = (await m.call('GET', '/api/auth/me')).body['user'].id;
  const inv = (await a.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: 'xxx', role: 'admin' })).body['token'];
  await m.call('POST', '/api/registry/invitations/accept', { token: inv });
  assert.equal(err(await m.call('POST', `/api/registry/orgs/${org}/members/${aId}/status`, { status: 'bogus' })), '400 INVALID');
  assert.equal((await m.call('POST', `/api/registry/orgs/${org}/members/${aId}/status`, { status: 'suspended' })).status, 200, 'a second administrator may suspend the first');
  assert.equal(err(await a.call('GET', `/api/registry/orgs/${org}`)), '404 NOT_FOUND');
  assert.equal(err(await m.call('POST', `/api/registry/orgs/${org}/members/${mId}/role`, { role: 'member' })), '409 LAST_ADMIN', 'a suspended administrator does not count');
  const plain = wallet(b); await signIn(plain, newKey());
  const inv2 = (await m.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: 'yyy', role: 'member' })).body['token']; await plain.call('POST', '/api/registry/invitations/accept', { token: inv2 });
  assert.equal(err(await plain.call('POST', `/api/registry/orgs/${org}/members/${mId}/status`, { status: 'suspended' })), '403 FORBIDDEN');
});
test('invitations: bound to an email or a wallet where they name one, single-use, expiring, revocable, role-limited; a leaked token alone is not enough', async () => {
  const { b, clock } = makeBackend(); const a = wallet(b); await signIn(a, newKey());
  const org = (await a.call('POST', '/api/registry/orgs', { name: 'Alpha Bank' })).body['organization'].id as string;
  const kb = newKey(); const bob = wallet(b); await signIn(bob, kb); const eve = wallet(b); await signIn(eve, newKey());
  const inv = async (invitee: string, role = 'member') => (await a.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee, role })).body['token'] as string;
  const acc = (w: W, token: string) => w.call('POST', '/api/registry/invitations/accept', { token });
  // bound to a wallet
  const t1 = await inv(kb.address);
  assert.equal(err(await acc(eve, t1)), '400 INVALID_INVITATION', 'another wallet user with the leaked token');
  const okr = await acc(bob, t1); assert.equal(okr.status, 200); assert.equal(okr.body['membership'].role, 'member', 'exactly the offered role');
  assert.equal(err(await acc(bob, t1)), '400 INVALID_INVITATION', 'single use');
  // bound to an email: a wallet-only user has no verified email, so it can never satisfy the binding
  const t2 = await inv('carol@example.test'); assert.equal(err(await acc(eve, t2)), '400 INVALID_INVITATION');
  const carol = await signedIn(b, 'carol'); assert.equal((await carol.call('POST', '/api/registry/invitations/accept', { token: t2 })).status, 200);
  // an invitation naming a malformed Stellar address is refused at creation
  assert.equal(err(await a.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: 'GABCDEFGHIJKLMNOP', role: 'member' })), '400 INVALID');
  // revoked and expired
  const t3 = await inv('anyone'); const list = (await a.call('GET', `/api/registry/orgs/${org}/invitations`)).body['invitations'] as { id: string; status: string }[];
  await a.call('POST', `/api/registry/orgs/${org}/invitations/${list.find((i) => i.status === 'pending')!.id}/revoke`, {});
  assert.equal(err(await acc(eve, t3)), '400 INVALID_INVITATION', 'revoked');
  const t4 = await inv('anyone'); clock.t += 8 * 24 * 3600 * 1000; const ke = newKey(); const eve2 = wallet(b); await signIn(eve2, ke);
  assert.equal(err(await acc(eve2, t4)), '400 INVALID_INVITATION', 'expired');
  // an administrator invitation gives administration only because the administrator offered it
  clock.t = Date.parse('2026-11-08T10:00:00Z'); const t5 = await inv('anyone', 'admin'); const r5 = await acc(eve, t5); assert.equal(r5.body['membership'].role, 'admin');
  assert.equal(err(await acc(bob, 'short')), '400 INVALID_INVITATION'); assert.equal(err(await wallet(b).call('POST', '/api/registry/invitations/accept', { token: t5 })), '401 UNAUTHENTICATED');
});
test('cross-organization access is refused for a wallet user: another organization looks like it does not exist', async () => {
  const { b } = makeBackend(); const a = wallet(b); await signIn(a, newKey()); const x = wallet(b); await signIn(x, newKey());
  const orgA = (await a.call('POST', '/api/registry/orgs', { name: 'Alpha Bank' })).body['organization'].id as string;
  const orgX = (await x.call('POST', '/api/registry/orgs', { name: 'Xi Bank' })).body['organization'].id as string;
  for (const p of [`/api/registry/orgs/${orgA}`, `/api/registry/orgs/${orgA}/members`, `/api/registry/orgs/${orgA}/sessions`, `/api/registry/orgs/${orgA}/invitations`, `/api/registry/orgs/${orgA}/activity`]) assert.equal(err(await x.call('GET', p)), '404 NOT_FOUND', p);
  assert.equal(err(await x.call('POST', `/api/registry/orgs/${orgA}/invitations`, { invitee: 'xxx', role: 'admin' })), '404 NOT_FOUND');
  assert.equal(err(await x.call('POST', `/api/registry/orgs/${orgA}/members/${(await a.call('GET', '/api/auth/me')).body['user'].id}/role`, { role: 'member' })), '404 NOT_FOUND');
  assert.equal(err(await a.call('GET', `/api/registry/orgs/${orgX}`)), '404 NOT_FOUND');
});

// ---------------------------------------------------------------- owner tooling gate, email accounts, migration
test('owner tooling needs a verified wallet that is one of the configured accounts; being signed in is not enough', () => {
  const accounts = new Set(['GAAA', 'GBBB']);
  assert.equal(ownerToolsAllowed({ userId: 'u', kind: 'verified' }, accounts), false);
  assert.equal(ownerToolsAllowed({ userId: 'u', kind: 'verified', wallets: ['GCCC'] }, accounts), false);
  assert.equal(ownerToolsAllowed({ userId: 'u', kind: 'verified', wallets: ['GCCC', 'GBBB'] }, accounts), true);
});
test('email accounts keep working unchanged (register, login, me with an email)', async () => {
  const { b } = makeBackend(); const c = await signedIn(b, 'dora');
  const me = (await c.call('GET', '/api/auth/me')).body; assert.equal(me['user'].email, 'dora@example.test'); assert.equal(me['user'].authMethod, 'password'); assert.equal(me['onboarding'].step, 'organization');
});
test('migration 8 upgrades a populated version-7 database in place and keeps its data; the new constraints hold', () => {
  const db = openDatabase(':memory:'); const v7 = MIGRATIONS.slice(0, 7);
  migrate(db, undefined, v7); assert.equal(migrationStatus(db, v7).current, 7);
  const t = '2026-11-08T10:00:00.000Z';
  db.raw.prepare("INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ('usr_a', 'a@example.test', 'A', 'scrypt$4$8$1$AA==$AA==', ?)").run(t);
  db.raw.prepare("INSERT INTO organizations (id, name, description, visibility, created_at, created_by) VALUES ('org_a', 'Alpha', '', 'private', ?, 'usr_a')").run(t);
  db.raw.prepare("INSERT INTO memberships (org_id, user_id, role, since) VALUES ('org_a', 'usr_a', 'admin', ?)").run(t);
  db.raw.prepare("INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, 'usr_a', ?, ?)").run('f'.repeat(64), t, '2099-01-01T00:00:00.000Z');
  const before = migrate(db); assert.equal(before.current, 8); assert.deepEqual(before.pending, []);
  const u = db.raw.prepare("SELECT auth_method, display_name FROM users WHERE id = 'usr_a'").get() as Record<string, unknown>; assert.equal(u['auth_method'], 'password'); assert.equal(u['display_name'], 'A');
  assert.equal(db.raw.prepare("SELECT status FROM memberships WHERE user_id = 'usr_a'").get()?.['status'], 'active');
  assert.equal(db.raw.prepare("SELECT auth_method FROM auth_sessions").get()?.['auth_method'], 'password');
  assert.equal(db.raw.prepare("SELECT institution_type FROM organizations").get()?.['institution_type'], null);
  assert.equal(migrate(db).applied.length, 8, 'running again changes nothing');
  const key = 'G' + 'A'.repeat(55);
  db.raw.prepare("INSERT INTO user_wallets (id, user_id, network, public_key, status, verified_at, created_at) VALUES ('w1', 'usr_a', 'testnet', ?, 'active', ?, ?)").run(key, t, t);
  assert.throws(() => db.raw.prepare("INSERT INTO user_wallets (id, user_id, network, public_key, status, verified_at, created_at) VALUES ('w2', 'usr_a', 'testnet', ?, 'active', ?, ?)").run(key, t, t), /UNIQUE/, 'one active user per key');
  assert.throws(() => db.raw.prepare("INSERT INTO user_wallets (id, user_id, network, public_key, status, verified_at, created_at) VALUES ('w3', 'usr_a', 'public', ?, 'active', ?, ?)").run(key, t, t), /CHECK/, 'Mainnet cannot be recorded');
  db.raw.prepare("UPDATE user_wallets SET status = 'revoked', revoked_at = ? WHERE id = 'w1'").run(t);
  db.raw.prepare("INSERT INTO user_wallets (id, user_id, network, public_key, status, verified_at, created_at) VALUES ('w4', 'usr_a', 'testnet', ?, 'active', ?, ?)").run(key, t, t); // a revoked key may be verified again
  assert.throws(() => db.raw.prepare("UPDATE user_wallets SET status = 'active', revoked_at = NULL WHERE id = 'w1'").run(), /final|CHECK/, 'a revoked record is final');
  db.raw.prepare("INSERT INTO auth_audit (at, user_id, kind, subject, detail) VALUES (?, 'usr_a', 'k', 's', 'd')").run(t);
  assert.throws(() => db.raw.prepare("UPDATE auth_audit SET detail = 'x'").run(), /immutable/); assert.throws(() => db.raw.prepare('DELETE FROM auth_audit').run(), /immutable/);
  assert.throws(() => db.raw.prepare("INSERT INTO organizations (id, name, description, visibility, created_at, created_by, jurisdiction) VALUES ('o2', 'Beta', '', 'private', ?, 'usr_a', 'gb')").run(t), /CHECK/);
  assert.throws(() => db.raw.prepare("INSERT INTO auth_challenges (id, purpose, network, public_key, user_id, domain, nonce, issued_at, expires_at) VALUES (?, 'link-wallet', 'testnet', ?, NULL, 'h', ?, ?, ?)").run('a'.repeat(32), key, 'b'.repeat(32), t, t), /CHECK/, 'a link challenge must name its user');
});

// ---------------------------------------------------------------- Testnet only: the organization ownership proof
test('the organization ownership proof accepts Stellar Testnet and rejects public, Mainnet and anything else; nothing is stored for a rejected network', async () => {
  const { b } = makeBackend(); const a = await signedIn(b, 'olga'); const k = newKey();
  const org = (await a.call('POST', '/api/registry/orgs', { name: 'Alpha Bank' })).body['organization'].id as string;
  const url = `/api/registry/orgs/${org}/wallet-challenges`;
  // Testnet works end to end (a real signature, verified by the real server)
  const ok = await a.call('POST', url, { network: 'testnet', publicKey: k.address }); assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.match(ok.body['challenge'].message as string, /network: testnet/);
  const verified = await a.call('POST', `${url}/${ok.body['challenge'].id}/verify`, { signature: k.raw64(ok.body['challenge'].message), scheme: 'raw' });
  assert.equal(verified.status, 201, JSON.stringify(verified.body)); assert.equal(verified.body['verification'].network, 'testnet');
  // everything else is refused with the same clear error, before any record is made
  for (const network of ['public', 'PUBLIC', 'mainnet', 'Mainnet', 'Public Global Stellar Network ; September 2015', 'Testnet', 'futurenet', '', null, 5, undefined, ['testnet']]) {
    const r = await a.call('POST', url, { network, publicKey: newKey().address });
    assert.equal(err(r), '400 INVALID', String(network)); assert.match(r.body['message'], /only Stellar Testnet is enabled/);
  }
  assert.equal(b.db.raw.prepare("SELECT count(*) AS n FROM wallet_challenges WHERE network <> 'testnet'").get()?.['n'], 0, 'no challenge was stored for another network');
  assert.equal(b.db.raw.prepare("SELECT count(*) AS n FROM wallet_challenges").get()?.['n'], 1, 'only the Testnet challenge exists');
  assert.equal(b.db.raw.prepare("SELECT count(*) AS n FROM wallet_verifications WHERE network <> 'testnet'").get()?.['n'], 0);
  // the registry service itself refuses it too (not only the HTTP layer)
  const user = { userId: (await a.call('GET', '/api/auth/me')).body['user'].id as string, kind: 'verified' as const };
  assert.throws(() => b.registry.issueWalletChallenge(user, org, { network: 'public', publicKey: newKey().address }), /only Stellar Testnet/);
  // the wallet sign-in path was already Testnet-only and still is
  assert.equal(err(await wallet(b).call('POST', '/api/auth/wallet/challenge', { publicKey: newKey().address, network: 'public' })), '400 INVALID');
});
