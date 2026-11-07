// Wallet ownership verification and settlement execution start, through the real HTTP handlers and real SQLite. Keys are throwaway ed25519 pairs made in the test with
// node:crypto; NO wallet, NO Stellar network and NO real account is involved. Signature formats are tested against our own signer only (a real wallet is NOT TESTED).
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { encodeAddress } from 'tobin-mvp1-sdk/strkey';
import { SqliteRegistryStore } from '../lib/registry/sqlite-store.ts';
import { makeBackend, signedIn } from './backend-helpers.ts';
import type { Backend } from '../lib/server/backend.ts';

type C = Awaited<ReturnType<typeof signedIn>>;
type N = 'ann' | 'bob' | 'cat' | 'rae' | 'eve';
const ISS = encodeAddress('account', new Uint8Array(32).fill(1)); const USD = `testnet:USD:${ISS}`;
const me = async (c: C) => (await c.call('GET', '/api/auth/me')).body['user'].id as string;

/** A throwaway keypair. sign(message, scheme) produces the base64 signature a wallet or CLI would return. */
function newKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32);
  const address = encodeAddress('account', new Uint8Array(raw));
  return { address, sign: (message: string, scheme: 'raw' | 'sep-53' = 'raw') => sign(null, scheme === 'raw' ? Buffer.from(message, 'utf8') : createHash('sha256').update(`Stellar Signed Message:\n${message}`, 'utf8').digest(), privateKey).toString('base64') };
}

interface W { b: Backend; clock: { t: number }; c: Record<N, C>; id: Record<N, string>; org: string; sid: string; base: string }
async function world(): Promise<W> {
  const { b, clock } = makeBackend();
  new SqliteRegistryStore(b.db).putAsset({ id: USD, network: 'testnet', kind: 'issued', code: 'USD', issuer: ISS, status: 'supported', source: 'operator-configured', addedAt: 't' });
  const c = {} as Record<N, C>; const id = {} as Record<N, string>;
  for (const n of ['ann', 'bob', 'cat', 'rae', 'eve'] as N[]) { c[n] = await signedIn(b, n); id[n] = await me(c[n]); }
  const org = (await c.ann.call('POST', '/api/registry/orgs', { name: 'Alpha Bank' })).body['organization'].id as string;
  for (const n of ['bob', 'cat', 'rae'] as const) { const inv = await c.ann.call('POST', `/api/registry/orgs/${org}/invitations`, { invitee: `${n}@example.test`, role: 'member' }); await c[n].call('POST', '/api/registry/invitations/accept', { token: inv.body['token'] }); }
  for (const n of ['bob', 'rae'] as const) await c.ann.call('POST', `/api/registry/orgs/${org}/reviewers/${id[n]}/grant`, {});
  const sid = (await c.ann.call('POST', `/api/registry/orgs/${org}/sessions`, { label: 'Run' })).body['session'].sessionId as string;
  const base = `/api/registry/orgs/${org}/sessions/${sid}`;
  for (const n of ['ann', 'bob', 'cat'] as N[]) await c.ann.call('POST', `${base}/participants`, { userId: id[n] });
  for (const [d, cr, amt] of [['ann', 'bob', '100'], ['bob', 'cat', '80'], ['cat', 'ann', '70']] as const) await c.ann.call('POST', `${base}/obligations`, { debtor: id[d], creditor: id[cr], amount: amt, assetRef: USD });
  await c.ann.call('POST', `${base}/calculate`, {});
  await c.bob.call('POST', `${base}/authorization/approve`, { calculationId: (await c.bob.call('GET', `${base}/authorization`)).body['calculationId'] });
  return { b, clock, c, id, org, sid, base };
}
const verifyKey = async (w: W, who: N, key = newKey(), network = 'testnet', scheme: 'raw' | 'sep-53' = 'raw') => {
  const ch = await w.c[who].call('POST', `/api/registry/orgs/${w.org}/wallet-challenges`, { network, publicKey: key.address });
  assert.equal(ch.status, 201, JSON.stringify(ch.body));
  const v = await w.c[who].call('POST', `/api/registry/orgs/${w.org}/wallet-challenges/${ch.body['challenge'].id}/verify`, { signature: key.sign(ch.body['challenge'].message, scheme), scheme });
  return { ch, v, key };
};
const approvedBatch = async (w: W) => {
  const cid = (await w.c.bob.call('GET', `${w.base}/authorization`)).body['calculationId'];
  const bid = (await w.c.ann.call('POST', `${w.base}/settlement/prepare`, { calculationId: cid })).body['batchId'] as string;
  const hash = (await w.c.rae.call('GET', `${w.base}/settlement/batches/${bid}`)).body['batch'].instructionsHash;
  assert.equal((await w.c.rae.call('POST', `${w.base}/settlement/batches/${bid}/approve`, { instructionsHash: hash })).status, 201);
  return bid;
};
const count = (w: W, t: string) => (w.b.db.raw.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;

// ---------------- wallet ownership ----------------
test('ownership: a signed one-time challenge, bound to organization, user, network and key, proves control of the key', async () => {
  const w = await world();
  const { ch, v, key } = await verifyKey(w, 'ann');
  const m = ch.body['challenge'].message as string;
  for (const part of [w.org, w.id.ann, 'network: testnet', `public key: ${key.address}`, 'nonce: ', 'expires: ', 'authorizes no payment']) assert.ok(m.includes(part), part);
  assert.equal(v.status, 201); assert.equal(v.body['verification'].publicKey, key.address); assert.match(v.body['note'], /grants no institutional role or permission/);
  const list = (await w.c.cat.call('GET', `/api/registry/orgs/${w.org}/wallet-verifications`)).body;
  assert.equal(list['verifications'].length, 1); assert.equal(list['verifications'][0].name, 'ann'); assert.match(list['note'], /confers no role/);
  const act = w.b.db.raw.prepare("SELECT detail FROM activity WHERE kind = 'wallet.verified'").all() as { detail: string }[];
  assert.equal(act.length, 1); assert.match(act[0]!.detail, /grants no role or permission/);
});

test('ownership: both signature schemes verify, and only their own', async () => {
  const w = await world();
  assert.equal((await verifyKey(w, 'ann', newKey(), 'testnet', 'sep-53')).v.status, 201);
  const k = newKey(); const ch = await w.c.bob.call('POST', `/api/registry/orgs/${w.org}/wallet-challenges`, { network: 'testnet', publicKey: k.address });
  const url = `/api/registry/orgs/${w.org}/wallet-challenges/${ch.body['challenge'].id}/verify`;
  assert.equal((await w.c.bob.call('POST', url, { signature: k.sign(ch.body['challenge'].message, 'raw'), scheme: 'sep-53' })).status, 400, 'a raw signature does not verify as sep-53');
  assert.equal((await w.c.bob.call('POST', url, { signature: k.sign(ch.body['challenge'].message, 'sep-53'), scheme: 'raw' })).status, 400, 'nor the other way round');
  assert.equal((await w.c.bob.call('POST', url, { signature: k.sign(ch.body['challenge'].message, 'raw'), scheme: 'raw' })).status, 201, 'failed attempts did not use up the challenge');
});

test('ownership: replay, expiry, wrong key, tampered message, wrong user and malformed input all fail the same way', async () => {
  const w = await world(); const k = newKey();
  const ch = await w.c.ann.call('POST', `/api/registry/orgs/${w.org}/wallet-challenges`, { network: 'testnet', publicKey: k.address });
  const id = ch.body['challenge'].id as string; const msg = ch.body['challenge'].message as string; const url = `/api/registry/orgs/${w.org}/wallet-challenges/${id}/verify`;
  const same = async (r: Promise<{ status: number; body: Record<string, any> }>) => { const x = await r; assert.equal(x.status, 400); assert.equal(x.body['error'], 'INVALID_CHALLENGE'); return x.body['message']; };
  const msgs = new Set<string>();
  msgs.add(await same(w.c.ann.call('POST', url, { signature: newKey().sign(msg), scheme: 'raw' })));                  // signed by another key
  msgs.add(await same(w.c.ann.call('POST', url, { signature: k.sign(msg + ' '), scheme: 'raw' })));                    // other message
  msgs.add(await same(w.c.ann.call('POST', url, { signature: k.sign(msg.replace('testnet', 'public')), scheme: 'raw' }))); // other network
  msgs.add(await same(w.c.ann.call('POST', url, { signature: k.sign(msg.replace(w.org, 'org_other')), scheme: 'raw' })));  // other organization
  msgs.add(await same(w.c.ann.call('POST', url, { signature: 'not base64!', scheme: 'raw' })));
  msgs.add(await same(w.c.ann.call('POST', url, { signature: Buffer.alloc(63).toString('base64'), scheme: 'raw' })));
  msgs.add(await same(w.c.ann.call('POST', url, { signature: k.sign(msg), scheme: 'other' })));
  msgs.add(await same(w.c.ann.call('POST', url, { scheme: 'raw' })));
  msgs.add(await same(w.c.bob.call('POST', url, { signature: k.sign(msg), scheme: 'raw' })));                         // someone else's challenge (the signature is right)
  msgs.add(await same(w.c.ann.call('POST', `/api/registry/orgs/${w.org}/wallet-challenges/wch_unknown/verify`, { signature: k.sign(msg), scheme: 'raw' })));
  assert.equal(msgs.size, 1, 'one uniform message: nothing can be probed');
  assert.equal(count(w, 'wallet_verifications'), 0);
  assert.equal((await w.c.ann.call('POST', url, { signature: k.sign(msg), scheme: 'raw' })).status, 201);
  await same(w.c.ann.call('POST', url, { signature: k.sign(msg), scheme: 'raw' })); // replay of a used challenge
  // expiry
  const ch2 = await w.c.ann.call('POST', `/api/registry/orgs/${w.org}/wallet-challenges`, { network: 'testnet', publicKey: newKey().address });
  w.clock.t += 5 * 60 * 1000 + 1;
  await same(w.c.ann.call('POST', `/api/registry/orgs/${w.org}/wallet-challenges/${ch2.body['challenge'].id}/verify`, { signature: 'A'.repeat(86) + '==', scheme: 'raw' }));
});

test('ownership: input and access rules', async () => {
  const w = await world(); const k = newKey(); const url = `/api/registry/orgs/${w.org}/wallet-challenges`;
  assert.equal((await w.c.ann.call('POST', url, { network: 'testnet', publicKey: 'GBAD' })).status, 400);
  assert.equal((await w.c.ann.call('POST', url, { network: 'testnet', publicKey: 'G' + 'A'.repeat(55) })).status, 400, 'a bad checksum is refused');
  assert.equal((await w.c.ann.call('POST', url, { network: 'testnet', publicKey: encodeAddress('contract', new Uint8Array(32)) })).status, 400, 'a contract address is not a signing key');
  assert.equal((await w.c.ann.call('POST', url, { network: 'mainnet', publicKey: k.address })).status, 400);
  assert.equal((await w.c.eve.call('POST', url, { network: 'testnet', publicKey: k.address })).status, 404, 'an outsider');
  assert.equal((await w.c.eve.call('GET', `${url.replace('challenges', 'verifications')}`)).status, 404);
  assert.equal((await w.c.ann.call('POST', url, { network: 'testnet', publicKey: k.address }, {}, false)).status, 403, 'request header required');
  const anon = await signedIn(w.b, 'zed'); anon.cookie = ''; assert.equal((await anon.call('POST', url, { network: 'testnet', publicKey: k.address })).status, 401);
  // a key verified by one member cannot be claimed by another, and one member may verify several keys
  const shared = newKey(); assert.equal((await verifyKey(w, 'ann', shared)).v.status, 201);
  const clash = await verifyKey(w, 'bob', shared); assert.equal(clash.v.status, 409); assert.equal(clash.v.body['error'], 'EXISTS');
  assert.equal((await verifyKey(w, 'ann', newKey())).v.status, 201);
  const again = await verifyKey(w, 'ann', shared); assert.equal(again.v.status, 201, 'the same member re-proving the same key is idempotent'); assert.equal(count(w, 'wallet_verifications'), 2);
  assert.equal(count(w, 'wallet_challenges'), 4);
});

test('ownership confers NO institutional permission: a verified key is not a role', async () => {
  const w = await world();
  await verifyKey(w, 'cat'); await verifyKey(w, 'eve').catch(() => undefined);
  const hash = 'f'.repeat(64);
  assert.equal((await w.c.cat.call('POST', `${w.base}/authorization/approve`, { calculationId: 'x' })).status, 403, 'a verified member is still not a reviewer');
  assert.equal((await w.c.cat.call('POST', `${w.base}/settlement/prepare`, { calculationId: 'x' })).status, 403, 'nor an administrator');
  assert.equal((await w.c.cat.call('POST', `/api/registry/orgs/${w.org}/reviewers/${w.id.cat}/grant`, {})).status, 403);
  assert.equal(((await w.c.ann.call('GET', `/api/registry/orgs/${w.org}/members`)).body['members'] as { name: string; role: string; reviewer: boolean }[]).find((m) => m.name === 'cat')?.reviewer, false);
  void hash;
});

test('ownership: removing a member removes their verification; the record of the proof is not a permission that survives them', async () => {
  const w = await world(); await verifyKey(w, 'rae');
  assert.equal((await w.c.ann.call('POST', `/api/registry/orgs/${w.org}/members/${w.id.rae}/remove`, {})).status, 200);
  assert.equal(count(w, 'wallet_verifications'), 0);
});

// ---------------- execution start ----------------
test('execution: needs an approved batch and one VERIFIED account per payer and payee; it records the state and nothing else', async () => {
  const w = await world();
  // not approved yet
  const cid = (await w.c.bob.call('GET', `${w.base}/authorization`)).body['calculationId'];
  const bid = (await w.c.ann.call('POST', `${w.base}/settlement/prepare`, { calculationId: cid })).body['batchId'] as string;
  const start = (who: N = 'ann') => w.c[who].call('POST', `${w.base}/settlement/batches/${bid}/execution/start`, {});
  let r = await start(); assert.equal(r.status, 409); assert.match(r.body['message'], /only an approved, still-eligible batch/);
  const hash = (await w.c.rae.call('GET', `${w.base}/settlement/batches/${bid}`)).body['batch'].instructionsHash;
  await w.c.rae.call('POST', `${w.base}/settlement/batches/${bid}/approve`, { instructionsHash: hash });
  // approved but no verified accounts
  r = await start(); assert.equal(r.status, 409); assert.match(r.body['message'], /3 missing/); assert.match(r.body['message'], /connected wallet or a typed public key does not count/);
  // a wallet claim (unproven) does not count either
  await w.c.ann.call('POST', `/api/registry/orgs/${w.org}/wallets`, { address: newKey().address });
  assert.equal((await start()).status, 409, 'an unproven wallet claim is not a verified account');
  await verifyKey(w, 'ann'); await verifyKey(w, 'bob');
  r = await start(); assert.equal(r.status, 409); assert.match(r.body['message'], /1 missing/);
  const catKey = (await verifyKey(w, 'cat')).key;
  assert.equal((await start('rae')).status, 403, 'only administrators start an execution');
  assert.equal((await start('eve')).status, 404);
  r = await start(); assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body['state'], 'awaiting-signer'); assert.match(r.body['note'], /No signing, submission or confirmation exists in this build/);
  const view = (await w.c.rae.call('GET', `${w.base}/settlement/batches/${bid}/execution`)).body;
  assert.equal(view['execution'].state, 'awaiting-signer'); assert.equal(view['execution'].accounts[w.id.cat], catKey.address); assert.equal(view['network'], 'testnet');
  assert.equal(view['execution'].events.length, 1); assert.ok(view['unavailable'].includes('Wallet signing') && view['unavailable'].includes('Independent on-chain verification'));
  assert.equal(view['participants'].length, 3); assert.ok(view['participants'].every((p: { verifiedAccount: string | null }) => typeof p.verifiedAccount === 'string'));
  assert.equal((await start()).status, 409, 'a second start is refused: one execution per batch');
  assert.ok(((await w.c.ann.call('GET', w.base)).body['workspace'].activity.items as { kind: string }[]).some((a) => a.kind === 'settlement.execution-started'));
  // prepared instructions still carry no accounts: they live only in the execution snapshot
  assert.equal(count(w, "settlement_instructions WHERE source_account IS NOT NULL OR destination_account IS NOT NULL"), 0);
});

test('execution: an unapproved, rejected, invalidated or empty batch cannot start; accounts are per network', async () => {
  const w = await world();
  for (const n of ['ann', 'bob', 'cat'] as N[]) await verifyKey(w, n);
  const bid = await approvedBatch(w);
  await w.c.ann.call('POST', `${w.base}/obligations/${(await w.c.ann.call('GET', `${w.base}/obligations`)).body['obligations'][0].id}/update`, { amount: '101' });
  const r = await w.c.ann.call('POST', `${w.base}/settlement/batches/${bid}/execution/start`, {}); assert.equal(r.status, 409); assert.match(r.body['message'], /invalidated|no longer eligible|only an approved/);
  assert.equal(count(w, 'settlement_executions'), 0);
  // a key can no longer be verified on the OTHER network at all (Testnet is the only enabled network), so a testnet batch still finds no verified account
  const w2 = await world();
  for (const n of ['ann', 'bob', 'cat'] as N[]) {
    const r0 = await w2.c[n].call('POST', `/api/registry/orgs/${w2.org}/wallet-challenges`, { network: 'public', publicKey: newKey().address });
    assert.equal(r0.status, 400, JSON.stringify(r0.body)); assert.equal(r0.body['error'], 'INVALID');
  }
  const b2 = await approvedBatch(w2);
  const r2 = await w2.c.ann.call('POST', `${w2.base}/settlement/batches/${b2}/execution/start`, {}); assert.equal(r2.status, 409); assert.match(r2.body['message'], /on testnet/);
});

test('execution: states change only through the guarded server method; there is no HTTP route that sets a state', async () => {
  const w = await world(); for (const n of ['ann', 'bob', 'cat'] as N[]) await verifyKey(w, n);
  const bid = await approvedBatch(w); await w.c.ann.call('POST', `${w.base}/settlement/batches/${bid}/execution/start`, {});
  for (const [m, p, body] of [['POST', 'execution/advance', { to: 'confirmed' }], ['POST', 'execution/state', { state: 'confirmed' }], ['POST', 'execution', { state: 'confirmed' }], ['PUT', 'execution', { state: 'confirmed' }], ['POST', 'execution/sign', {}], ['POST', 'execution/submit', {}]] as const)
    assert.equal((await w.c.ann.call(m, `${w.base}/settlement/batches/${bid}/${p}`, body)).status, 404, `${m} ${p}`);
  const ann = { userId: w.id.ann, kind: 'verified' as const }; const reg = w.b.registry;
  const adv = (to: unknown, detail = 'test') => reg.advanceSettlementExecution(ann, w.org, w.sid, bid, to, { detail });
  assert.throws(() => adv('confirmed'), /cannot move from awaiting-signer to confirmed/); assert.throws(() => adv('submitted'), /cannot move/); assert.throws(() => adv('settled'), /unknown execution state/); assert.throws(() => adv('signed'), /cannot move/);
  assert.deepEqual(adv('signing'), { state: 'signing', changed: true });
  assert.deepEqual(adv('signing'), { state: 'signing', changed: false }, 'asking again for the current state is idempotent');
  assert.deepEqual(adv('awaiting-signer', 'user rejected the signature'), { state: 'awaiting-signer', changed: true });
  assert.deepEqual(adv('signing'), { state: 'signing', changed: true }); adv('signed'); adv('submission-pending'); adv('unknown-outcome', 'timeout: result not known');
  assert.throws(() => adv('submitted'), /cannot move from unknown-outcome to submitted/, 'no resubmission after an unknown outcome');
  assert.throws(() => adv('submission-pending'), /cannot move/);
  adv('confirmed', 'network answered'); adv('reconciliation-required', 'amount differs'); adv('reconciled', 'operator resolved');
  assert.throws(() => adv('failed'), /cannot move/, 'reconciled is final');
  const events = (await w.c.ann.call('GET', `${w.base}/settlement/batches/${bid}/execution`)).body['execution'].events as { from: string | null; to: string }[];
  assert.deepEqual(events.map((e) => e.to), ['awaiting-signer', 'signing', 'awaiting-signer', 'signing', 'signed', 'submission-pending', 'unknown-outcome', 'confirmed', 'reconciliation-required', 'reconciled']);
  assert.throws(() => w.b.db.raw.prepare("UPDATE settlement_execution_events SET to_state = 'x'").run(), /immutable/); assert.throws(() => w.b.db.raw.prepare('DELETE FROM settlement_execution_events').run(), /immutable/);
  assert.throws(() => w.b.db.raw.prepare("UPDATE settlement_executions SET network = 'public'").run(), /immutable/);
  assert.throws(() => reg.advanceSettlementExecution({ userId: w.id.rae, kind: 'verified' }, w.org, w.sid, bid, 'failed', { detail: 'x' }), /administrator/, 'only an administrator-level caller (the future services run as one)');
});

test('execution: a failed advance leaves no event', async () => {
  const w = await world(); for (const n of ['ann', 'bob', 'cat'] as N[]) await verifyKey(w, n);
  const bid = await approvedBatch(w); await w.c.ann.call('POST', `${w.base}/settlement/batches/${bid}/execution/start`, {});
  const before = count(w, 'settlement_execution_events'); const a0 = count(w, 'activity');
  assert.throws(() => w.b.db.tx(() => { w.b.registry.advanceSettlementExecution({ userId: w.id.ann, kind: 'verified' }, w.org, w.sid, bid, 'signing', { detail: 'x' }); throw new Error('boom'); }), /boom/);
  assert.equal(count(w, 'settlement_execution_events'), before); assert.equal(count(w, 'activity'), a0);
});
