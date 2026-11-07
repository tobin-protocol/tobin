// Signer-set-aware authorization (stage 3). The keys are THROWAWAY in-memory keys and the signatures are REAL ed25519 signatures made with the official SDK over real
// transaction hashes: the cryptography is not mocked. There is NO network and NO real account here; the "chain" in the fetch tests is a hand-written MOCK, labelled.
// Real Testnet reads of the actual administrative account are recorded separately (evidence/multisig-live-audit-*.json) and are NOT part of this suite.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { authorizationRequirements, fingerprintOf, minimalAuthorizingSets, readLiveSignerSet, signerMembership, signerSetFromHorizon, signerSetFromRpc, verifyEnvelope } from '../lib/stellar/signer-set.ts';
import type { SignerSet } from '../lib/stellar/signer-set.ts';

const kp = () => Keypair.random();
const master = kp(), founder = kp(), technical = kp(), security = kp(), stranger = kp();
const ACCOUNT = master.publicKey();
// the shape of the real administrative account: thresholds 5/6/7, Founder 5, Technical 2, Security 1, master 1
const SET: SignerSet = { network: 'testnet', account: ACCOUNT, thresholds: { low: 5, medium: 6, high: 7 }, signers: [{ key: master.publicKey(), weight: 1 }, { key: founder.publicKey(), weight: 5 }, { key: technical.publicKey(), weight: 2 }, { key: security.publicKey(), weight: 1 }] };
const FP = fingerprintOf(SET);
const PASS = Networks.TESTNET;
const build = (source = ACCOUNT, passphrase = PASS, amount = '1') => new TransactionBuilder(new Account(source, '100'), { fee: '100', networkPassphrase: passphrase }).addOperation(Operation.payment({ destination: stranger.publicKey(), asset: Asset.native(), amount })).setTimeout(60).build();
const signed = (tx: ReturnType<typeof build>, ...keys: Keypair[]) => { for (const k of keys) tx.sign(k); return tx.toXDR(); };
const verify = (xdr: string, over: Partial<Parameters<typeof verifyEnvelope>[0]> = {}) => verifyEnvelope({ set: SET, expectedFingerprint: FP, passphrase: PASS, xdr, level: 'medium', ...over });
const has = (v: { problems: string[] }, re: RegExp) => assert.ok(v.problems.some((p) => re.test(p)), `${re}: ${JSON.stringify(v.problems)}`);

test('fingerprint: deterministic, order-independent, and any key, weight or threshold change alters it', () => {
  assert.equal(fingerprintOf({ ...SET, signers: [...SET.signers].reverse() }), FP);
  assert.notEqual(fingerprintOf({ ...SET, signers: SET.signers.map((s) => (s.key === security.publicKey() ? { ...s, weight: 2 } : s)) }), FP, 'a weight');
  assert.notEqual(fingerprintOf({ ...SET, thresholds: { ...SET.thresholds, medium: 5 } }), FP, 'a threshold');
  assert.notEqual(fingerprintOf({ ...SET, signers: [...SET.signers, { key: stranger.publicKey(), weight: 1 }] }), FP, 'a new signer');
  assert.notEqual(fingerprintOf({ ...SET, network: 'public' }), FP, 'the network');
  assert.notEqual(fingerprintOf({ ...SET, account: stranger.publicKey() }), FP, 'the account');
  assert.equal(fingerprintOf({ ...SET, signers: [...SET.signers, { key: stranger.publicKey(), weight: 0 }] }), FP, 'a removed signer (weight 0) is not a signer');
});

test('thresholds: which signer combinations are the minimal authorizing sets (the real shape: Founder is in every one)', () => {
  const m = minimalAuthorizingSets(SET, 6).map((s) => s.sort().join('+')).sort();
  assert.deepEqual(m, [[founder.publicKey(), technical.publicKey()], [founder.publicKey(), security.publicKey()], [founder.publicKey(), master.publicKey()]].map((s) => s.sort().join('+')).sort());
  assert.ok(minimalAuthorizingSets(SET, 6).every((s) => s.includes(founder.publicKey())), 'no combination without the Founder reaches 6 (others total 4)');
  assert.equal(minimalAuthorizingSets(SET, 10).length, 0, 'an unreachable threshold (total weight is 9) has no authorizing set'); assert.equal(minimalAuthorizingSets(SET, 9).length, 1, 'all four signers are needed for 9');
  assert.ok(minimalAuthorizingSets(SET, 5).some((s) => s.length === 1 && s[0] === founder.publicKey()), 'Founder alone meets the low threshold 5');
});

test('verify: exactly sufficient weight passes (Founder 5 + Security 1 = 6), excess passes, one short fails', () => {
  const ok = verify(signed(build(), founder, security)); assert.equal(ok.ok, true, JSON.stringify(ok.problems)); assert.equal(ok.weight, 6); assert.equal(ok.threshold, 6); assert.deepEqual(ok.signers.map((s) => s.key).sort(), [founder.publicKey(), security.publicKey()].sort());
  assert.equal(verify(signed(build(), founder, security, technical)).weight, 8); assert.equal(verify(signed(build(), founder, security, technical)).ok, true, 'excess weight');
  const short = verify(signed(build(), founder)); assert.equal(short.ok, false); assert.equal(short.weight, 5); has(short, /combined weight 5 is below the medium threshold 6/);
  const masterOnly = verify(signed(build(), master)); assert.equal(masterOnly.ok, false, 'the master key alone (weight 1) does not satisfy the threshold'); has(masterOnly, /weight 1 is below/);
  assert.equal(verify(signed(build(), security, technical)).ok, false, 'Security + Technical = 3, no Founder');
  assert.equal(verify(signed(build()), { level: 'medium' }).weight, 0); assert.equal(verify(signed(build(), founder), { level: 'low' }).ok, true, 'Founder alone meets the LOW threshold');
});

test('verify: unknown signer, duplicate signature, invalid signature', () => {
  const u = verify(signed(build(), founder, stranger)); assert.equal(u.ok, false); has(u, /not signers of the account/); assert.equal(u.weight, 5, 'an unknown signer adds nothing');
  const tx = build(); tx.sign(founder); tx.sign(founder); tx.sign(security);
  const d = verify(tx.toXDR()); has(d, /more than once/); assert.equal(d.weight, 6, 'the duplicate added no weight'); assert.equal(d.ok, false, 'a duplicate is a problem even if the weight is met');
  const dd = build(); dd.sign(founder); dd.sign(founder); const dw = verify(dd.toXDR()); assert.equal(dw.weight, 5, 'two copies of one signer are not weight 10');
  // corrupt a real signature: same hint, wrong bytes
  const c = build(); c.sign(founder); c.sign(security);
  const sigs = (c as unknown as { signatures: { signature: unknown }[] }).signatures; const raw = (sigs[0]!.signature as { value: Uint8Array }).value; raw[0] = raw[0]! ^ 0xff;
  const bad = verify(c.toXDR()); has(bad, /do not verify over this transaction/); assert.equal(bad.weight, 1, 'only the intact signature counts');
});

test('verify: wrong transaction, wrong network, wrong account, malformed input', () => {
  const t1 = build(ACCOUNT, PASS, '1'); const x1 = signed(t1, founder, security);
  // the same signatures attached to a DIFFERENT transaction (different amount) do not verify
  const t2 = build(ACCOUNT, PASS, '2'); (t2 as unknown as { signatures: unknown[] }).signatures.push(...(t1 as unknown as { signatures: unknown[] }).signatures);
  const w = verify(t2.toXDR()); assert.equal(w.ok, false); has(w, /do not verify over this transaction/); assert.equal(w.weight, 0);
  // signed for another network: verifying under Testnet fails (the hash binds the passphrase)
  const pub = signed(build(ACCOUNT, Networks.PUBLIC), founder, security); const n = verify(pub); assert.equal(n.ok, false); has(n, /do not verify/);
  const nn = verifyEnvelope({ set: SET, expectedFingerprint: FP, passphrase: Networks.PUBLIC, xdr: x1, level: 'medium' }); assert.equal(nn.ok, false, 'a Testnet transaction does not verify as Mainnet');
  // wrong account: the source is not the multisig account
  const other = verify(signed(build(stranger.publicKey()), founder, security)); assert.equal(other.ok, false); has(other, /source .* is not the account/);
  assert.equal(verify('not xdr').ok, false); has(verify('not xdr'), /cannot be read/);
  assert.equal(verifyEnvelope({ set: { ...SET, signers: [] }, expectedFingerprint: FP, passphrase: PASS, xdr: x1, level: 'medium' }).ok, false, 'an unusable set fails closed');
  assert.equal(verifyEnvelope({ set: { ...SET, signers: [{ key: ACCOUNT, weight: 300 }] }, expectedFingerprint: FP, passphrase: PASS, xdr: x1, level: 'medium' }).ok, false);
});

test('verify: a stale or changed signer set is refused even when the signatures are perfect', () => {
  const x = signed(build(), founder, security); assert.equal(verify(x).ok, true);
  const changed: SignerSet = { ...SET, signers: SET.signers.map((s) => (s.key === security.publicKey() ? { ...s, weight: 3 } : s)) };
  const r = verifyEnvelope({ set: changed, expectedFingerprint: FP, passphrase: PASS, xdr: x, level: 'medium' }); assert.equal(r.ok, false); has(r, /changed or is stale/); assert.notEqual(r.fingerprint, FP);
  const revoked: SignerSet = { ...SET, signers: SET.signers.filter((s) => s.key !== security.publicKey()) };
  const rv = verifyEnvelope({ set: revoked, expectedFingerprint: FP, passphrase: PASS, xdr: x, level: 'medium' }); assert.equal(rv.ok, false, 'a revoked signer: stale AND its signature no longer counts'); has(rv, /not signers of the account/);
  const raised: SignerSet = { ...SET, thresholds: { ...SET.thresholds, medium: 7 } };
  assert.equal(verifyEnvelope({ set: raised, expectedFingerprint: fingerprintOf(raised), passphrase: PASS, xdr: x, level: 'medium' }).ok, false, 'a raised threshold needs more weight');
});

test('policy: required signers (Founder and Security) must have signed; reaching the weight another way does not satisfy it', () => {
  const policy = [founder.publicKey(), security.publicKey()];
  assert.equal(verify(signed(build(), founder, security), { require: policy }).ok, true);
  const viaMaster = verify(signed(build(), founder, master), { require: policy }); assert.equal(viaMaster.weight, 6, 'the weight is met'); assert.equal(viaMaster.ok, false, 'but the policy is not'); has(viaMaster, new RegExp(`required signer ${security.publicKey()}`));
  const viaTech = verify(signed(build(), founder, technical), { require: policy }); assert.equal(viaTech.ok, false);
  assert.equal(verify(signed(build(), security, technical, master), { require: policy }).ok, false, 'no Founder');
});

test('membership is information only: proving control of a signer key grants no role and is not authorization', () => {
  assert.deepEqual(signerMembership(SET, [founder.publicKey(), stranger.publicKey(), founder.publicKey()]), [{ key: founder.publicKey(), weight: 5 }]);
  assert.deepEqual(signerMembership(SET, [stranger.publicKey()]), []);
  // a user who controls the Founder key (weight 5) is a member, but a transaction carrying only that signature is NOT authorized at the medium threshold
  assert.equal(signerMembership(SET, [founder.publicKey()])[0]!.weight, 5); assert.equal(verify(signed(build(), founder)).ok, false);
  // membership never turns a master-key holder into "the owner of the account" for a threshold decision
  assert.equal(verify(signed(build(), master)).ok, false);
});

test('authorization mechanism per step: a multi-key account must be the transaction source; two such accounts in one step are refused', () => {
  const sets = new Map([[ACCOUNT, SET]]); const single = kp().publicKey();
  const rows = authorizationRequirements([{ index: 1, fn: 'create_session', signers: [single] }, { index: 2, fn: 'join_session', signers: [ACCOUNT, single] }, { index: 3, fn: 'settle', signers: [ACCOUNT] }], sets);
  const row = (i: number, a: string) => rows.find((r) => r.step === i && r.account === a)!;
  assert.equal(row(1, single).mechanism, 'single-key'); assert.equal(row(1, single).ok, true);
  assert.equal(row(2, ACCOUNT).mechanism, 'envelope-multisig'); assert.equal(row(2, ACCOUNT).mustBeTransactionSource, true); assert.equal(row(2, ACCOUNT).threshold, 6); assert.equal(row(2, ACCOUNT).ok, true); assert.equal(row(2, single).mustBeTransactionSource, false);
  assert.equal(row(3, ACCOUNT).ok, true);
  const second = kp().publicKey(); const set2: SignerSet = { ...SET, account: second, signers: SET.signers.map((s, i) => ({ key: i === 0 ? second : s.key, weight: s.weight })) };
  const two = authorizationRequirements([{ index: 1, fn: 'join_session', signers: [ACCOUNT, second] }], new Map([[ACCOUNT, SET], [second, set2]]));
  assert.ok(two.every((r) => r.ok === false) && /split the step/.test(two[0]!.reason), 'no hand-assembled signature vectors');
  assert.equal(authorizationRequirements([{ index: 1, fn: 'x', signers: [single] }], new Map())[0]!.threshold, 0, 'an account with no recorded set is treated as a single-key account');
});

// ---- reading the set from the chain (MOCK fetch and RPC; labelled) ----
const horizonBody = (set: SignerSet) => ({ id: set.account, thresholds: { low_threshold: set.thresholds.low, med_threshold: set.thresholds.medium, high_threshold: set.thresholds.high }, signers: set.signers.map((s) => ({ key: s.key, weight: s.weight, type: 'ed25519_public_key' })) });
const rpcBody = (set: SignerSet) => { const m = set.signers.find((s) => s.key === set.account)?.weight ?? 0; const hex = [m, set.thresholds.low, set.thresholds.medium, set.thresholds.high].map((n) => n.toString(16).padStart(2, '0')).join(''); return { account_id: set.account, thresholds: hex, signers: set.signers.filter((s) => s.key !== set.account) }; };
const fetcher = (body: unknown, status = 200) => async () => ({ ok: status === 200, status, json: async () => body });
const read = (o: { horizon?: () => Promise<unknown>; rpc?: () => Promise<unknown> } = {}) => readLiveSignerSet({ account: ACCOUNT, network: 'testnet', horizon: 'https://horizon.mock', fetcher: (o.horizon ?? fetcher(horizonBody(SET))) as never, viaRpc: (o.rpc ?? (async () => rpcBody(SET))) as never });

test('MOCK chain: the set is returned only when Horizon and the RPC both answer and agree; everything else fails closed', async () => {
  const good = await read(); assert.equal(good.ok, true); if (good.ok) { assert.equal(good.fingerprint, FP); assert.deepEqual(good.set.thresholds, { low: 5, medium: 6, high: 7 }); }
  const hz = await read({ horizon: fetcher({}, 503) }); assert.equal(hz.ok, false); assert.match((hz as { reason: string }).reason, /Horizon answered 503/);
  const down = await read({ horizon: async () => { throw new Error('ECONNRESET'); } }); assert.equal(down.ok, false); assert.match((down as { reason: string }).reason, /Horizon could not be read/);
  const rpcDown = await read({ rpc: async () => { throw new Error('rpc timeout'); } }); assert.equal(rpcDown.ok, false); assert.match((rpcDown as { reason: string }).reason, /RPC could not be read/);
  const other: SignerSet = { ...SET, signers: SET.signers.map((s) => (s.key === security.publicKey() ? { ...s, weight: 3 } : s)) };
  const disagree = await read({ rpc: async () => rpcBody(other) }); assert.equal(disagree.ok, false); assert.match((disagree as { reason: string }).reason, /disagree/);
  const wrongAcct = await read({ horizon: fetcher(horizonBody({ ...SET, account: stranger.publicKey() })) }); assert.equal(wrongAcct.ok, false);
  const preauth = await read({ horizon: fetcher({ ...horizonBody(SET), signers: [...horizonBody(SET).signers, { key: 'TXYZ', weight: 1, type: 'preauth_tx' }] }) }); assert.equal(preauth.ok, false, 'an unsupported signer type cannot be reasoned about');
  const bad = await read({ rpc: async () => ({ ...rpcBody(SET), thresholds: 'zz' }) }); assert.equal(bad.ok, false);
  assert.deepEqual(signerSetFromHorizon(horizonBody(SET), 'testnet'), signerSetFromRpc(rpcBody(SET), 'testnet'), 'both parsers produce the same canonical set');
});
