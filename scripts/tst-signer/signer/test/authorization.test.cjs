'use strict';
// Adversarial tests for the authorization-entry validation (revision 5). Every malicious structure is built here from raw XDR
// constructors (test/helpers.cjs), independently of the signer's own derivation in authorization.cjs. Fake keys, mocked RPC only.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const H = require('./helpers.cjs');
const { S, x, core, cfg, F, OTHER, P, makeDeps, authEntry, mintFn, deployFn, subOf, argAddr, argI128, sc, goodAuth, goodAuthFn, STATE } = H;
const A = require('../authorization.cjs');

const refused = (fn, re) => assert.throws(fn, (e) => e instanceof core.Refusal && (re ? re.test(e.message) : true), String(re));
const rejects = (p, re) => assert.rejects(p, (e) => e instanceof core.Refusal && (re ? re.test(e.message) : true), String(re));
const OPS = ['deploy', 'mint-C', 'mint-D'];
const val = (op, entries, c = cfg) => A.validateAuthorizationEntries(S, c, op, entries);
const to = (op) => (op === 'mint-C' ? cfg.C : cfg.D);
const amt = (op) => (op === 'mint-C' ? 20000n : 10000n);
const mint = (op, o = {}) => mintFn({ args: [argAddr(o.to ?? to(op)), argI128(o.amount ?? amt(op))], ...o.fn });
const m1 = (o) => authEntry({ fn: mint('mint-C', o) });
const addrCreds = (who, n = 1n) => x.SorobanCredentials.sorobanCredentialsAddress(new x.SorobanAddressCredentials({ address: sc(who), nonce: n, signatureExpirationLedger: 10, signature: x.ScVal.scvVoid() }));
const b64 = (e) => e.toXDR('base64');
const edit = (e, fn) => { const buf = Buffer.from(b64(e), 'base64'); fn(buf); return buf.toString('base64'); };
const chain = (depth, fn) => { let inv = subOf(fn); for (let i = 0; i < depth; i++) inv = subOf(fn, [inv]); return inv; };

// ---------------------------------------------------------------- accepted
test('the correct authorization entry is accepted for each operation, deterministically and without being modified', () => {
  for (const op of OPS) {
    const entries = goodAuth(op); const before = b64(entries[0]);
    const a = val(op, entries); const b = val(op, entries);
    assert.deepEqual(a, b); assert.equal(a.length, 1); assert.equal(b64(entries[0]), before);
    assert.deepEqual(A.expectedAuthorizationEntries(S, cfg, op).map(b64), [before]);               // the independent builder and the derivation agree
  }
});

test('the same entry is accepted as an XDR object, as base64 text and as bytes; the full preview pipeline accepts it', async () => {
  const e = goodAuth('mint-C')[0];
  val('mint-C', [e]); val('mint-C', [b64(e)]); val('mint-C', [Buffer.from(b64(e), 'base64')]);
  for (const op of OPS) await core.preview(makeDeps(op).deps, cfg, op);
});

// ---------------------------------------------------------------- real evidence
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'real-auth-entries.json'), 'utf8'));
test('real evidence: the specification-derived entries are byte-identical to a live protocol-30 deploy simulation and to the real on-chain mint', () => {
  const c = core.makeConfig(S, { adminAddress: FX.deploy.deployer, saltHex: FX.deploy.saltHex });
  assert.equal(b64(A.expectedAuthorizationEntries(S, c, 'deploy')[0]), FX.deploy.xdr);
  val('deploy', [FX.deploy.xdr], c);
  const contract = S.StrKey.encodeContract(Buffer.from(FX.mint.contractIdHex, 'hex'));
  assert.equal(b64(A.buildExpectedAuthEntry(S, { kind: 'mint', contract, to: FX.mint.to, amount: BigInt(FX.mint.amount) })), FX.mint.xdr);
  val('mint-C', [FX.mint.xdr], { tokenId: contract, C: FX.mint.to, mintC: BigInt(FX.mint.amount) });
  const flipped = Buffer.from(FX.mint.xdr, 'base64'); flipped[flipped.length - 1] ^= 1;                // one bit of the real mint entry
  refused(() => val('mint-C', [flipped.toString('base64')], { tokenId: contract, C: FX.mint.to, mintC: BigInt(FX.mint.amount) }));
});

// ---------------------------------------------------------------- credentials
test('wrong or unsupported credential kinds are rejected', () => {
  const fn = goodAuthFn('mint-C');
  refused(() => val('mint-C', [authEntry({ fn, credentials: addrCreds(OTHER) })]), /only source-account authorization is allowed \(unsupported credential kind: sorobanCredentialsAddress\)/);
  refused(() => val('mint-C', [authEntry({ fn, credentials: addrCreds(F) })]), /only source-account authorization/);   // even the approved account as an address credential
  // other credential arms, and arms that do not exist, by editing the discriminant of a valid entry
  const good = goodAuth('mint-C')[0];
  for (const d of [1, 2, 3, 4, 99, 0x7fffffff]) refused(() => val('mint-C', [edit(good, (b) => b.writeInt32BE(d, 0))]), /(only source-account|cannot be decoded)/);
  refused(() => val('mint-C', [edit(authEntry({ fn, credentials: addrCreds(OTHER) }), (b) => b.writeInt32BE(2, 0))]), /(only source-account|cannot be decoded)/);
});

// ---------------------------------------------------------------- identity (authorized address)
test('the authorized identity must be exactly the approved account: wrong recipient, deployer or minter', () => {
  refused(() => val('mint-C', [m1({ to: cfg.D })]), /differs from the approved invocation at fn\.args\[0\]/);
  refused(() => val('mint-C', [m1({ to: OTHER })]), /fn\.args\[0\]/);
  refused(() => val('mint-D', [authEntry({ fn: mint('mint-D', { to: cfg.C }) })]), /fn\.args\[0\]/);
  refused(() => val('mint-C', [m1({ to: S.StrKey.encodeContract(crypto.randomBytes(32)) })]), /fn\.args\[0\]/);   // a contract address where an account is required
  refused(() => val('deploy', [authEntry({ fn: deployFn({ deployer: OTHER }) })]), /fn\.deployer/);
  refused(() => val('deploy', [authEntry({ fn: deployFn({ ctor: [argAddr(OTHER), argI128(30000n), S.nativeToScVal(7, { type: 'u32' }), S.nativeToScVal('Tobin Settlement Test Token', { type: 'string' }), S.nativeToScVal('TST', { type: 'string' })] }) })]), /fn\.ctor\[0\]/);
});

// ---------------------------------------------------------------- root contract and function
test('the root contract must be exactly the predicted contract', () => {
  refused(() => val('mint-C', [m1({ fn: { contract: S.StrKey.encodeContract(crypto.randomBytes(32)) } })]), /fn\.contract/);
  refused(() => val('mint-C', [m1({ fn: { contract: F } })]), /unexpected address kind/);                          // an account address as the "contract"
});

test('the function name must be exactly "mint"', () => {
  for (const name of ['transfer', 'burn', 'Mint', 'mint ', 'mint\u0000', '', 'mint_to', 'approve', '__constructor']) refused(() => val('mint-C', [m1({ fn: { name } })]), /fn\.name/);
});

test('function kinds other than the two approved ones are rejected', () => {
  const args = new x.CreateContractArgs({
    contractIdPreimage: x.ContractIdPreimage.contractIdPreimageFromAddress(new x.ContractIdPreimageFromAddress({ address: sc(cfg.F), salt: cfg.salt })),
    executable: x.ContractExecutable.contractExecutableWasm(Buffer.from(cfg.wasmHash, 'hex')) });
  refused(() => val('deploy', [authEntry({ fn: x.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractHostFn(args) })]), /function kind is not supported/);
  refused(() => val('mint-C', [authEntry({ fn: x.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractHostFn(args) })]), /function kind is not supported/);
  refused(() => val('mint-C', [authEntry({ fn: deployFn() })]), /fn/);                                              // a deployment where a mint is approved
  refused(() => val('deploy', [m1()]), /fn/);                                                                       // and the reverse
});

// ---------------------------------------------------------------- arguments
test('wrong argument count is rejected', () => {
  refused(() => val('mint-C', [authEntry({ fn: mintFn({ args: [argAddr(cfg.C)] }) })]), /fn\.args\.length/);
  refused(() => val('mint-C', [authEntry({ fn: mintFn({ args: [argAddr(cfg.C), argI128(20000n), argI128(1n)] }) })]), /fn\.args\.length/);
  refused(() => val('mint-C', [authEntry({ fn: mintFn({ args: [] }) })]), /fn\.args\.length/);
  const good = [argAddr(cfg.F), argI128(30000n), S.nativeToScVal(7, { type: 'u32' }), S.nativeToScVal('Tobin Settlement Test Token', { type: 'string' }), S.nativeToScVal('TST', { type: 'string' })];
  refused(() => val('deploy', [authEntry({ fn: deployFn({ ctor: good.slice(0, 4) }) })]), /fn\.ctor\.length/);
  refused(() => val('deploy', [authEntry({ fn: deployFn({ ctor: [...good, argI128(1n)] }) })]), /fn\.ctor\.length/);
});

test('wrong argument type is rejected, including types the signer does not support at all', () => {
  const a0 = argAddr(cfg.C);
  refused(() => val('mint-C', [authEntry({ fn: mintFn({ args: [a0, S.nativeToScVal(20000, { type: 'u32' })] }) })]), /fn\.args\[1\]/);        // u32 where i128
  refused(() => val('mint-C', [authEntry({ fn: mintFn({ args: [a0, S.nativeToScVal(20000n, { type: 'u64' })] }) })]), /unsupported value type/);
  refused(() => val('mint-C', [authEntry({ fn: mintFn({ args: [a0, S.nativeToScVal('20000', { type: 'string' })] }) })]), /fn\.args\[1\]/);
  refused(() => val('mint-C', [authEntry({ fn: mintFn({ args: [S.nativeToScVal(cfg.C, { type: 'string' }), argI128(20000n)] }) })]), /fn\.args\[0\]/);   // string where address
  refused(() => val('mint-C', [authEntry({ fn: mintFn({ args: [a0, x.ScVal.scvBool(true)] }) })]), /unsupported value type/);
  refused(() => val('mint-C', [authEntry({ fn: mintFn({ args: [a0, x.ScVal.scvVoid()] }) })]), /unsupported value type/);
  refused(() => val('mint-C', [authEntry({ fn: mintFn({ args: [a0, x.ScVal.scvVec([argI128(20000n)])] }) })]), /unsupported value type/);
  refused(() => val('mint-C', [authEntry({ fn: mintFn({ args: [x.ScVal.scvVec([a0]), argI128(20000n)] }) })]), /unsupported value type/);
});

test('wrong argument value is rejected (amounts, 128-bit extremes, constructor parameters)', () => {
  for (const v of [20001n, 19999n, 0n, -20000n, 20000n + (1n << 64n), (1n << 127n) - 1n, -(1n << 127n), 10000n]) refused(() => val('mint-C', [m1({ amount: v })]), /fn\.args\[1\]/);
  refused(() => val('mint-D', [authEntry({ fn: mint('mint-D', { amount: 20000n }) })]), /fn\.args\[1\]/);
  const base = (o) => deployFn({ ctor: [argAddr(cfg.F), argI128(o.cap ?? 30000n), S.nativeToScVal(o.dec ?? 7, { type: 'u32' }), S.nativeToScVal(o.name ?? 'Tobin Settlement Test Token', { type: 'string' }), S.nativeToScVal(o.sym ?? 'TST', { type: 'string' })] });
  for (const o of [{ cap: 30001n }, { cap: 1000000n }, { dec: 6 }, { dec: 8 }, { name: 'Other' }, { name: 'Tobin Settlement Test Token ' }, { sym: 'TTT' }, { sym: 'tst' }]) refused(() => val('deploy', [authEntry({ fn: base(o) })]), /fn\.ctor/);
  refused(() => val('deploy', [authEntry({ fn: deployFn({ wasm: 'ab'.repeat(32) }) })]), /fn\.wasm/);
  refused(() => val('deploy', [authEntry({ fn: deployFn({ salt: crypto.randomBytes(32) }) })]), /fn\.salt/);
  const stellarAsset = x.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractV2HostFn(new x.CreateContractArgsV2({
    contractIdPreimage: x.ContractIdPreimage.contractIdPreimageFromAddress(new x.ContractIdPreimageFromAddress({ address: sc(cfg.F), salt: cfg.salt })),
    executable: x.ContractExecutable.contractExecutableStellarAsset(), constructorArgs: [] }));
  refused(() => val('deploy', [authEntry({ fn: stellarAsset })]), /executable kind is not supported/);
});

// ---------------------------------------------------------------- nested invocations and branches
test('any nested invocation is rejected, at any depth, whatever it calls', () => {
  const transfer = mintFn({ name: 'transfer', args: [argAddr(cfg.C), argAddr(cfg.D), argI128(1n)] });
  const root = goodAuthFn('mint-C');
  refused(() => val('mint-C', [authEntry({ fn: root, subs: [subOf(transfer)] })]), /subs\.length/);                       // unexpected nested invocation
  refused(() => val('mint-C', [authEntry({ fn: root, subs: [subOf(root)] })]), /subs\.length/);                          // even an identical copy of the root
  refused(() => val('mint-C', [authEntry({ fn: root, subs: [subOf(transfer), subOf(transfer)] })]), /subs\.length/);
  refused(() => val('mint-C', [authEntry({ fn: root, subs: [subOf(transfer, [subOf(transfer)])] })]), /subs\.length/);   // a nested-of-nested
  refused(() => val('mint-D', [authEntry({ fn: goodAuthFn('mint-D'), subs: [subOf(deployFn())] })]), /subs\.length/);    // an unexpected authorization branch
  refused(() => val('deploy', [authEntry({ fn: deployFn(), subs: [subOf(mint('mint-C'))] })]), /subs\.length/);
  // deep chains are refused (by the nesting rule or the depth guard), never accepted
  for (const d of [1, 3, 9, 12, 40]) refused(() => val('mint-C', [authEntry({ fn: root, subs: [chain(d, transfer)] })]), /(subs\.length|too deep)/);
});

test('the recursive description refuses a malformed tree: extra fields, non-lists, depth beyond the limit', () => {
  const e = goodAuth('mint-C')[0];
  assert.throws(() => A.describeInvocation(S, { ...e.rootInvocation, extra: 1 }), /unexpected or missing fields/);
  assert.throws(() => A.describeInvocation(S, { function: e.rootInvocation.function }), /unexpected or missing fields/);
  assert.throws(() => A.describeInvocation(S, { function: e.rootInvocation.function, subInvocations: 'x' }), /not a list/);
  assert.throws(() => A.describeInvocation(S, null), /not an object/);
  assert.throws(() => A.describeInvocation(S, e.rootInvocation, A.MAX_DEPTH + 1), /too deep/);
  const fn = e.rootInvocation.function;
  assert.throws(() => A.describeInvocation(S, { function: { ...fn, extra: true }, subInvocations: [] }), /unexpected or missing fields/);
  assert.throws(() => A.describeInvocation(S, { function: { type: 'sorobanAuthorizedFunctionTypeUnknown' }, subInvocations: [] }), /not supported/);
});

// ---------------------------------------------------------------- entry set: missing, extra, duplicate, reordered
test('missing, additional, duplicated and reordered entries are rejected (exactly one entry is approved, so there is no accepted order)', () => {
  for (const op of OPS) {
    const g = goodAuth(op)[0];
    refused(() => val(op, []), /missing authorization entry/);
    refused(() => val(op, [g, g]), /duplicate authorization entries/);
    refused(() => val(op, [g, authEntry({ fn: mint('mint-C', { fn: { name: 'transfer' } }) })]), /unexpected additional authorization entries/);
    refused(() => val(op, [authEntry({ fn: mint('mint-C', { fn: { name: 'transfer' } }) }), g]), /unexpected additional authorization entries/);   // reordered
    refused(() => val(op, [g, g, g]), /duplicate/);
  }
  refused(() => val('mint-C', [goodAuth('mint-D')[0], goodAuth('mint-C')[0]]), /unexpected additional/);              // the other mint's entry alongside
  refused(() => val('mint-C', 'x'), /not a list/); refused(() => val('mint-C', null), /not a list/); refused(() => val('mint-C', undefined), /not a list/);
  refused(() => val('mint-C', { length: 1, 0: goodAuth('mint-C')[0] }), /not a list/);
});

// ---------------------------------------------------------------- malformed and unsupported XDR
test('malformed XDR is rejected', () => {
  const good = goodAuth('mint-C')[0]; const g64 = b64(good); const gb = Buffer.from(g64, 'base64');
  const bads = ['', 'not base64 at all !!!', 'AAAA', Buffer.alloc(0).toString('base64'), gb.subarray(0, gb.length - 1).toString('base64'), gb.subarray(0, 8).toString('base64'),
    Buffer.concat([gb, Buffer.from([0])]).toString('base64'), Buffer.concat([gb, gb]).toString('base64'), crypto.randomBytes(120).toString('base64')];
  for (const bad of bads) refused(() => val('mint-C', [bad]), /cannot be decoded|does not re-encode/);
  for (const bad of [null, undefined, 5, true, {}, [], () => 1, { toXDR: () => { throw new Error('boom'); } }, { toXDR: () => 'AAAA' }]) refused(() => val('mint-C', [bad]), /cannot be decoded/);
  refused(() => A.decodeAuthorizationEntry(S, '!!!'), /cannot be decoded/);
});

test('unsupported XDR variants are rejected: unknown function kind, unknown value kind, unsupported executable and preimage kinds', () => {
  const good = goodAuth('mint-C')[0];
  for (const d of [3, 4, 99]) refused(() => val('mint-C', [edit(good, (b) => b.writeInt32BE(d, 4))]), /cannot be decoded|not supported/);          // function discriminant
  const i128Bytes = Buffer.from(argI128(20000n).toXDR());
  refused(() => val('mint-C', [edit(good, (b) => { const at = b.indexOf(i128Bytes); assert.ok(at > 0); b.writeInt32BE(99, at); })]), /cannot be decoded/);   // unknown ScVal arm
  const dep = goodAuth('deploy')[0];
  refused(() => val('deploy', [edit(dep, (b) => b.writeInt32BE(99, 8))]), /cannot be decoded|not supported/);                                 // unknown CreateContractArgs v2 preimage kind
});

// ---------------------------------------------------------------- layers tested one by one
test('layer 2 (structural comparison) and layer 3 (canonical bytes) each reject on their own', () => {
  const exp = A.expectedAuthorizationEntries(S, cfg, 'mint-C')[0];
  A.structuralCompare(S, exp, exp); A.bytesCompare(b64(exp), exp);
  const wrongAmount = m1({ amount: 20001n });
  assert.throws(() => A.structuralCompare(S, wrongAmount, exp), /fn\.args\[1\]/);
  assert.throws(() => A.bytesCompare(b64(wrongAmount), exp), /canonical bytes/);
  assert.throws(() => A.bytesCompare(b64(exp).replace(/.$/, 'A') === b64(exp) ? 'AAAA' : b64(exp).replace(/.$/, 'A'), exp), /canonical bytes/);
});

test('describeScVal: only the four value types of the approved calls are supported, with canonical values', () => {
  assert.deepEqual(A.describeScVal(S, argAddr(cfg.C), 'a'), { t: 'address', v: cfg.C });
  assert.deepEqual(A.describeScVal(S, argI128(-5n), 'a'), { t: 'i128', v: '-5' });
  assert.deepEqual(A.describeScVal(S, argI128(2n ** 100n), 'a'), { t: 'i128', v: (2n ** 100n).toString() });
  assert.deepEqual(A.describeScVal(S, S.nativeToScVal(7, { type: 'u32' }), 'a'), { t: 'u32', v: 7 });
  assert.deepEqual(A.describeScVal(S, S.nativeToScVal('TST', { type: 'string' }), 'a'), { t: 'string', v: 'TST' });
  for (const v of [x.ScVal.scvBool(false), x.ScVal.scvVoid(), S.nativeToScVal(1, { type: 'i32' }), S.nativeToScVal(1n, { type: 'u128' }), S.nativeToScVal('a', { type: 'symbol' }), x.ScVal.scvVec([])]) assert.throws(() => A.describeScVal(S, v, 'a'), /unsupported value type/);
  assert.throws(() => A.describeScVal(S, null, 'a'), /not a value/);
});

test('firstDifference locates the first differing field and treats equal trees as equal', () => {
  assert.equal(A.firstDifference({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), null);
  assert.equal(A.firstDifference({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] }), 'a[1].b');
  assert.equal(A.firstDifference({ a: [1] }, { a: [1, 2] }), 'a.length');
  assert.equal(A.firstDifference({ a: 1 }, { b: 1 }), '{fields}');
  assert.ok(A.firstDifference({ a: 1 }, { a: '1' })); assert.ok(A.firstDifference([], {})); assert.ok(A.firstDifference(null, {}));
});

test('no authorization specification exists for any other operation: it stays blocked', () => {
  for (const op of ['transfer', 'mint-E', 'burn', '', undefined]) assert.throws(() => A.expectedAuthorizationEntries(S, cfg, op), /no authorization specification exists/);
});

// ---------------------------------------------------------------- the pipeline: simulation response, assembled transaction, key and submission
const evil = {
  'wrong credential': (op) => [authEntry({ fn: goodAuthFn(op), credentials: addrCreds(OTHER) })],
  'wrong function': (op) => [authEntry({ fn: op === 'deploy' ? mint('mint-C') : mint(op, { fn: { name: 'transfer' } }) })],
  'wrong argument': (op) => [authEntry({ fn: op === 'deploy' ? deployFn({ wasm: 'ab'.repeat(32) }) : mint(op, { amount: 1n }) })],
  'nested invocation': (op) => [authEntry({ fn: goodAuthFn(op), subs: [subOf(mintFn({ name: 'transfer', args: [argAddr(cfg.C), argAddr(cfg.D), argI128(1n)] }))] })],
  'second entry': (op) => [...goodAuth(op), ...goodAuth(op)],
  'no entry': () => [],
};
test('a simulation response whose authorization differs from the approved specification is refused before anything is signed or sent', async () => {
  for (const op of OPS) for (const [label, make] of Object.entries(evil)) {
    const m = makeDeps(op, { rpcOver: { auth: make(op) } });
    await rejects(core.execute(m.deps, cfg, op), /authorization/);
    assert.equal(m.counters.keyLoads, 0, `${op}/${label}: key must not be loaded`); assert.equal(m.rpc.calls.sent, 0, `${op}/${label}`); assert.equal(m.counters.confirms, 0);
    assert.equal(JSON.parse(m.fs.files.get(STATE)).operations.length, 0, `${op}/${label}: nothing recorded`);
    await rejects(core.preview(makeDeps(op, { rpcOver: { auth: make(op) } }).deps, cfg, op), /authorization/);
  }
});

test('a simulation that changes its authorization entries between two calls for the same expected transaction is refused on the changed call', async () => {
  const m = makeDeps('mint-C'); const orig = m.rpc.simulateTransaction; let n = 0;
  m.rpc.simulateTransaction = async (tx) => { const s = await orig(tx); if (++n >= 2) s.result.auth = evil['wrong argument']('mint-C'); return s; };
  await core.preview(m.deps, cfg, 'mint-C');                                    // first answer matches the specification
  await rejects(core.preview(m.deps, cfg, 'mint-C'), /authorization/);          // the changed answer is refused
});

test('the assembled transaction is validated too: tampered authorization on the transaction itself is refused, the approved one is accepted', () => {
  const probe = new S.TransactionBuilder(new S.Account(cfg.F, '0'), { fee: '100', networkPassphrase: P }).addOperation(core.expectedOperation(S, cfg, 'mint-C')).setTimeout(30).build();
  const func = probe.operations[0].func;
  const withAuth = (auth) => new S.TransactionBuilder(new S.Account(cfg.F, '100'), { fee: '100', networkPassphrase: P }).addOperation(S.Operation.invokeHostFunction({ func, auth })).setTimeout(60).build();
  core.verifyTransaction(S, cfg, 'mint-C', withAuth(goodAuth('mint-C')), { networkPassphrase: P, assembled: true });
  for (const [label, make] of Object.entries(evil)) refused(() => core.verifyTransaction(S, cfg, 'mint-C', withAuth(make('mint-C')), { networkPassphrase: P, assembled: true }), /authorization|only source-account/);
  refused(() => core.verifyTransaction(S, cfg, 'mint-C', withAuth(goodAuth('mint-C')), { networkPassphrase: P }), /unexpected authorization entries before simulation/);
});

test('with an approved authorization the full execution still works end to end (regression)', async () => {
  for (const op of OPS) { const m = makeDeps(op, { state: op === 'deploy' ? { exists: false } : undefined }); const r = await core.execute(m.deps, cfg, op); assert.equal(r.status, 'SUCCEEDED'); assert.equal(m.rpc.calls.sent, 1); }
});

test('a malicious simulation is refused before assembly: no transaction is ever assembled from entries the specification does not approve', async () => {
  // the SDK namespace is frozen, so the spy is injected through the dependency object the core uses
  let assembled = 0;
  const spied = () => Object.create(S, { rpc: { value: { ...S.rpc, assembleTransaction: (...a) => { assembled++; return S.rpc.assembleTransaction(...a); } } } });
  for (const op of OPS) {
    const m = makeDeps(op, { rpcOver: { auth: evil['nested invocation'](op) } }); m.deps.S = spied();
    await rejects(core.preview(m.deps, cfg, op), /authorization/);
  }
  assert.equal(assembled, 0, 'assembleTransaction must not run for a rejected simulation');
  const ok = makeDeps('mint-C'); ok.deps.S = spied();
  await core.preview(ok.deps, cfg, 'mint-C');
  assert.equal(assembled, 1, 'the spy works: an approved simulation is assembled exactly once');
});

test('non-canonical base64 text is rejected even though the decoder tolerates it (newline, whitespace, URL-safe alphabet, missing padding, non-zero trailing bits)', () => {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let variants = 0;
  for (const op of OPS) {
    const g = b64(goodAuth(op)[0]); const raw = Buffer.from(g, 'base64');
    const forms = [g + '\n', g + ' ', ' ' + g, g.slice(0, 16) + '\n' + g.slice(16), g.slice(0, 20) + ' ' + g.slice(20)];
    if (/[+/]/.test(g)) forms.push(g.replace(/\+/g, '-').replace(/\//g, '_'));
    if (/=$/.test(g)) forms.push(g.replace(/=+$/, ''));
    if (raw.length % 3 !== 0) { const core64 = g.replace(/=+$/, ''); const c = core64[core64.length - 1]; forms.push(core64.slice(0, -1) + alpha[alpha.indexOf(c) ^ 1] + g.slice(core64.length)); }
    for (const f of forms) { refused(() => val(op, [f]), /does not re-encode|cannot be decoded/); variants++; }
    val(op, [g]);                                                                                    // the canonical text itself is accepted
  }
  assert.ok(variants >= 15, 'enough non-canonical variants were exercised: ' + variants);
});

test('a contract-call node with an extra or missing field, and a deployment preimage of another kind, are rejected', () => {
  const fn = goodAuth('mint-C')[0].rootInvocation.function;
  const call = fn.contractFn;
  assert.throws(() => A.describeInvocation(S, { function: { type: fn.type, contractFn: { ...call, extra: 1 } }, subInvocations: [] }), /contract call has unexpected or missing fields/);
  assert.throws(() => A.describeInvocation(S, { function: { type: fn.type, contractFn: { contractAddress: call.contractAddress, functionName: call.functionName } }, subInvocations: [] }), /contract call has unexpected or missing fields/);
  const fromAsset = x.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractV2HostFn(new x.CreateContractArgsV2({
    contractIdPreimage: x.ContractIdPreimage.contractIdPreimageFromAsset(S.Asset.native().toXDRObject()),
    executable: x.ContractExecutable.contractExecutableWasm(Buffer.from(cfg.wasmHash, 'hex')), constructorArgs: [] }));
  refused(() => val('deploy', [authEntry({ fn: fromAsset })]), /preimage kind is not supported/);
});

test('firstDifference gives exact answers for nulls, primitives, mixed shapes and nested paths (and never throws)', () => {
  assert.equal(A.firstDifference({ a: 1 }, { a: '1' }), 'a');
  assert.equal(A.firstDifference({}, null), 'value'); assert.equal(A.firstDifference(null, {}), 'value'); assert.equal(A.firstDifference(null, null), null);
  assert.equal(A.firstDifference({ a: 1 }, 5), 'value'); assert.equal(A.firstDifference(5, { a: 1 }), 'value'); assert.equal(A.firstDifference(5, 5), null);
  assert.equal(A.firstDifference([], {}), 'value'); assert.equal(A.firstDifference({}, []), 'value'); assert.equal(A.firstDifference([1, [2]], [1, [3]]), '[1][0]');
  assert.equal(A.firstDifference({ a: { b: [1, { c: 2 }] } }, { a: { b: [1, { c: 3 }] } }), 'a.b[1].c');
  assert.equal(A.firstDifference({ a: undefined }, { a: undefined }), null); assert.equal(A.firstDifference('x', 'x'), null);
});
