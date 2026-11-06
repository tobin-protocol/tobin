'use strict';
// Local tests for the restricted TST signer (core rules). Fake, in-memory keys and mocked RPC responses only.
// No network, no real key, no DPAPI. Run: node --test test/*.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const H = require('./helpers.cjs');
const { S, x, core, FAKE_F, F, OTHER, SALT, cfg, P, makeDeps, dataFor, goodFootprint, loadAdminKey } = H;

const acct = (a = F) => new S.Account(a, '100');
const build = (op, { source = F, fee = '100', timeout = 120 } = {}) =>
  new S.TransactionBuilder(acct(source), { fee, networkPassphrase: P }).addOperation(op).setTimeout(timeout).build();
const ok = (opName, tx, extra = {}) => core.verifyTransaction(S, cfg, opName, tx, { networkPassphrase: P, ...extra });
const addr = (a) => new S.Address(a).toScVal();
const i128 = (v) => S.nativeToScVal(v, { type: 'i128' });
const deployOp = (o = {}) => S.Operation.createCustomContract({
  address: new S.Address(o.deployer ?? F), wasmHash: Buffer.from(o.wasm ?? cfg.wasmHash, 'hex'), salt: o.salt ?? cfg.salt,
  constructorArgs: [addr(F), i128(o.cap ?? cfg.cap), S.nativeToScVal(o.decimals ?? 7, { type: 'u32' }),
    S.nativeToScVal(o.name ?? cfg.name, { type: 'string' }), S.nativeToScVal(o.symbol ?? cfg.symbol, { type: 'string' })],
});
const mintOp = (to, amount, contract = cfg.tokenId, fn = 'mint') => new S.Contract(contract).call(fn, addr(to), i128(amount));
const refused = (fn, re) => assert.throws(fn, (e) => e instanceof core.Refusal && (re ? re.test(e.message) : true), String(re));

// ---------- configuration ----------
test('config: predicted ID is deterministic, F must be a valid key different from C and D, salt must be 32 bytes', () => {
  assert.equal(cfg.tokenId, core.makeConfig(S, { adminAddress: F, saltHex: SALT }).tokenId);
  assert.notEqual(cfg.tokenId, core.makeConfig(S, { adminAddress: F, saltHex: crypto.randomBytes(32).toString('hex') }).tokenId);
  refused(() => core.makeConfig(S, { adminAddress: core.APPROVED.C, saltHex: SALT }), /differ from C and D/);
  refused(() => core.makeConfig(S, { adminAddress: 'GNOTAKEY', saltHex: SALT }), /valid public key/);
  refused(() => core.makeConfig(S, { adminAddress: F, saltHex: 'abcd' }), /32 bytes/);
});

// ---------- valid operations ----------
test('valid deploy, mint-C and mint-D transactions verify', () => {
  ok('deploy', build(deployOp()));
  ok('mint-C', build(mintOp(cfg.C, 20000n)));
  ok('mint-D', build(mintOp(cfg.D, 10000n)));
});

test('only the three approved operations exist; any other name is refused', () => {
  refused(() => core.expectedOperation(S, cfg, 'transfer'), /not in the approved manifest/);
  refused(() => ok('mint-E', build(mintOp(cfg.C, 20000n))), /not in the approved manifest/);
  assert.deepEqual([...core.APPROVED.ops], ['deploy', 'mint-C', 'mint-D']);
  assert.equal(Object.keys(core).some((k) => /^sign|arbitrary|generic/i.test(k)), false);
});

// ---------- rejected variants ----------
test('wrong network passphrase is refused (verification and RPC check)', async () => {
  refused(() => core.verifyTransaction(S, cfg, 'deploy', build(deployOp()), { networkPassphrase: 'Public Global Stellar Network ; September 2015' }), /passphrase/);
  const { deps } = makeDeps('deploy', { rpcOver: { passphrase: 'Public Global Stellar Network ; September 2015' }, state: { exists: false } });
  await assert.rejects(core.preview(deps, cfg, 'deploy'), /other than the approved Testnet/);
});

test('wrong source account is refused', () => {
  refused(() => ok('deploy', build(deployOp(), { source: OTHER })), /source account/);
  refused(() => ok('mint-C', build(mintOp(cfg.C, 20000n), { source: cfg.C })), /source account/);
});

test('wrong Wasm hash is refused', () => {
  refused(() => ok('deploy', build(deployOp({ wasm: 'ab'.repeat(32) }))), /host function/);
});

test('wrong contract ID is refused (mint against any contract other than the predicted one)', () => {
  const other = S.StrKey.encodeContract(crypto.randomBytes(32));
  refused(() => ok('mint-C', build(mintOp(cfg.C, 20000n, other))), /host function/);
});

test('wrong function name is refused', () => {
  refused(() => ok('mint-C', build(mintOp(cfg.C, 20000n, cfg.tokenId, 'transfer'))), /host function/);
  refused(() => ok('mint-C', build(mintOp(cfg.C, 20000n, cfg.tokenId, 'burn'))), /host function/);
});

test('wrong constructor arguments are refused (cap, decimals, name, symbol, salt, deployer)', () => {
  for (const o of [{ cap: 30001n }, { cap: 1000000n }, { decimals: 6 }, { name: 'Other Token' }, { symbol: 'TTT' }, { salt: crypto.randomBytes(32) }, { deployer: OTHER }]) {
    refused(() => ok('deploy', build(deployOp(o))), /host function/);
  }
});

test('wrong mint recipient or amount is refused', () => {
  refused(() => ok('mint-C', build(mintOp(cfg.D, 20000n))), /host function/);
  refused(() => ok('mint-D', build(mintOp(cfg.C, 10000n))), /host function/);
  refused(() => ok('mint-C', build(mintOp(OTHER, 20000n))), /host function/);
  refused(() => ok('mint-C', build(mintOp(cfg.C, 20001n))), /host function/);
  refused(() => ok('mint-C', build(mintOp(cfg.C, 10000n))), /host function/);
  refused(() => ok('mint-D', build(mintOp(cfg.D, 20000n))), /host function/);
});

test('additional operation injection and multiple operations are refused', () => {
  const two = new S.TransactionBuilder(acct(), { fee: '100', networkPassphrase: P })
    .addOperation(mintOp(cfg.C, 20000n)).addOperation(S.Operation.payment({ destination: OTHER, asset: S.Asset.native(), amount: '1' })).setTimeout(60).build();
  refused(() => ok('mint-C', two), /exactly one operation/);
  const three = new S.TransactionBuilder(acct(), { fee: '100', networkPassphrase: P })
    .addOperation(mintOp(cfg.C, 20000n)).addOperation(mintOp(cfg.C, 20000n)).addOperation(mintOp(cfg.D, 10000n)).setTimeout(60).build();
  refused(() => ok('mint-C', three), /exactly one operation/);
  const wrongType = build(S.Operation.payment({ destination: OTHER, asset: S.Asset.native(), amount: '1' }));
  refused(() => ok('mint-C', wrongType), /invokeHostFunction/);
});

test('memo, signed transactions, excessive fee and wide time bounds are refused', () => {
  const withMemo = new S.TransactionBuilder(acct(), { fee: '100', networkPassphrase: P, memo: S.Memo.text('x') }).addOperation(S.Operation.payment({ destination: OTHER, asset: S.Asset.native(), amount: '1' })).setTimeout(60).build(); // the SDK itself refuses a memo on a Soroban transaction; the check order lets us test the signer's own memo rule
  refused(() => ok('mint-C', withMemo), /memo/);
  const signed = build(mintOp(cfg.C, 20000n)); signed.sign(FAKE_F);
  refused(() => ok('mint-C', signed), /already signed/);
  refused(() => ok('mint-C', build(mintOp(cfg.C, 20000n), { fee: '600000' })), /fee/);
  refused(() => ok('mint-C', build(mintOp(cfg.C, 20000n), { timeout: 100000 })), /time bounds/);
});

// ---------- simulation ----------
test('valid flows simulate, assemble and produce a human-readable intent for all three operations', async () => {
  for (const op of ['deploy', 'mint-C', 'mint-D']) {
    const state = op === 'deploy' ? { exists: false } : { exists: true, total: op === 'mint-D' ? 20000n : 0n, balC: op === 'mint-D' ? 20000n : 0n, balD: 0n };
    const { deps, log } = makeDeps(op, { state });
    const r = await core.preview(deps, cfg, op);
    assert.match(r.intent, /Stellar Testnet/); assert.match(r.intent, /minimum resource fee 55971/); assert.match(r.intent, /source-account only/);
    assert.match(log.join('\n'), /preview only: nothing was signed/);
  }
});

test('simulation failure is refused before any confirmation or key access', async () => {
  const { deps, counters, rpc } = makeDeps('mint-C', { rpcOver: { simError: 'HostError: boom' } });
  await assert.rejects(core.execute(deps, cfg, 'mint-C'), /simulation failed/);
  assert.equal(counters.confirms, 0); assert.equal(counters.keyLoads, 0); assert.equal(rpc.calls.sent, 0);
});

test('a simulation that needs a restore, or returns a wrong deployed ID, is refused', async () => {
  let m = makeDeps('mint-C', { rpcOver: { restorePreamble: { minResourceFee: '1' } } });
  await assert.rejects(core.preview(m.deps, cfg, 'mint-C'), /state restore/);
  m = makeDeps('deploy', { state: { exists: false }, rpcOver: { simId: S.StrKey.encodeContract(crypto.randomBytes(32)) } });
  await assert.rejects(core.preview(m.deps, cfg, 'deploy'), /simulated contract ID differs/);
});

test('state guards: no double deploy, no mint before deploy, no double mint, no wrong metadata', async () => {
  await assert.rejects(core.preview(makeDeps('deploy', { state: { exists: true } }).deps, cfg, 'deploy'), /already exists/);
  await assert.rejects(core.preview(makeDeps('mint-C', { state: { exists: false } }).deps, cfg, 'mint-C'), /deploy first/);
  await assert.rejects(core.preview(makeDeps('mint-C', { state: { exists: true, total: 20000n, balC: 20000n, balD: 0n } }).deps, cfg, 'mint-C'), /requires total supply 0/);
  await assert.rejects(core.preview(makeDeps('mint-D', { state: { exists: true, total: 0n, balC: 0n, balD: 0n } }).deps, cfg, 'mint-D'), /requires supply 20,000/);
  await assert.rejects(core.preview(makeDeps('mint-C', { state: { exists: true, name: 'Evil' } }).deps, cfg, 'mint-C'), /approved metadata/);
  await assert.rejects(core.preview(makeDeps('mint-C', { state: { exists: true, minter: OTHER } }).deps, cfg, 'mint-C'), /approved metadata/);
});

// ---------- confirmation ----------
test('confirmation mismatch refuses before the key is loaded or anything is sent', async () => {
  for (const typed of ['yes', 'y', '', 'MINT 20000 TO C', core.confirmationPhrase(cfg, 'mint-D')]) {
    const { deps, counters, rpc } = makeDeps('mint-C', { typed });
    await assert.rejects(core.execute(deps, cfg, 'mint-C'), /confirmation does not match/);
    assert.equal(counters.keyLoads, 0); assert.equal(rpc.calls.sent, 0);
  }
  assert.notEqual(core.confirmationPhrase(cfg, 'mint-C'), core.confirmationPhrase(cfg, 'mint-D'));
  assert.match(core.confirmationPhrase(cfg, 'mint-C'), /20000/); assert.match(core.confirmationPhrase(cfg, 'deploy'), /DEPLOY TST CAP 30000/);
});

// ---------- execution with fakes ----------
test('execute: signs once with the (fake) F key, submits once, verifies the deployed ID', async () => {
  const { deps, counters, rpc } = makeDeps('deploy', { state: { exists: false } });
  const rec = await core.execute(deps, cfg, 'deploy');
  assert.equal(rec.status, 'SUCCEEDED'); assert.equal(rec.contractId, cfg.tokenId); assert.equal(rpc.calls.sent, 1); assert.equal(counters.keyLoads, 1); assert.equal(counters.confirms, 1);
  const m = makeDeps('mint-C');
  const r2 = await core.execute(m.deps, cfg, 'mint-C'); assert.equal(r2.ledger, 777);
});

test('execute: a wrong deployed contract ID is reported (the success is still recorded because the chain says so)', async () => {
  const m = makeDeps('deploy', { state: { exists: false }, rpcOver: { returnId: S.StrKey.encodeContract(crypto.randomBytes(32)) } });
  await assert.rejects(core.execute(m.deps, cfg, 'deploy'), /deployed contract ID differs/);
  assert.equal(JSON.parse(m.fs.files.get(H.STATE)).operations[0].status, 'SUCCEEDED');
});

// ---------- key boundary ----------
test('missing key file: generic error, nothing leaked', () => {
  assert.throws(() => loadAdminKey(S, F, () => { throw new Error('C:\\secret\\path ' + 'S' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.repeat(2).slice(0, 55)); }), (e) => /missing or cannot be decrypted/.test(e.message) && !/secret|SABCD/.test(e.message));
});

test('invalid key content: refused without echoing the content', () => {
  const bad = 'S' + 'A'.repeat(55); // secret-shaped, invalid checksum
  assert.throws(() => loadAdminKey(S, F, () => Buffer.from(bad)), (e) => !e.message.includes(bad) && /not a valid secret seed/.test(e.message));
  assert.throws(() => loadAdminKey(S, F, () => Buffer.from('not a key at all')), (e) => !e.message.includes('not a key at all'));
});

test('public-key mismatch: a valid secret for another account is refused and never echoed', () => {
  const other = S.Keypair.random(); const sec = other.secret();
  assert.throws(() => loadAdminKey(S, F, () => Buffer.from(sec)), (e) => !e.message.includes(sec) && /does not match the configured F/.test(e.message));
  assert.equal(loadAdminKey(S, F, () => Buffer.from(FAKE_F.secret())).publicKey(), F);
});

test('the decrypted buffer is zero-filled after use', () => {
  const buf = Buffer.from(FAKE_F.secret());
  loadAdminKey(S, F, () => buf);
  assert.ok(buf.every((b) => b === 0));
});

// ---------- redaction ----------
test('secret redaction: seeds are removed from messages, refusals and logs', async () => {
  const sec = S.Keypair.random().secret();
  assert.equal(core.redact(`oops ${sec} end`), 'oops [REDACTED-SECRET] end');
  assert.equal(core.redact('literal-secret-value', ['literal-secret-value']), '[REDACTED-SECRET]');
  assert.throws(() => core.verifyTransaction(S, cfg, `x${sec}`, build(deployOp()), { networkPassphrase: P }), (e) => !e.message.includes(sec));
  const { deps } = makeDeps('mint-C', { rpcOver: { simError: `leak ${sec}` } });
  await assert.rejects(core.preview(deps, cfg, 'mint-C'), (e) => !e.message.includes(sec));
});

test('a non-source-account authorization entry (for example an address credential for another account) is refused after assembly', () => {
  const funcOf = (op) => build(op).operations[0].func;
  const entry = new x.SorobanAuthorizationEntry({
    credentials: x.SorobanCredentials.sorobanCredentialsAddress(new x.SorobanAddressCredentials({
      address: new S.Address(OTHER).toScAddress(), nonce: 1n, signatureExpirationLedger: 10, signature: x.ScVal.scvVoid() })),
    rootInvocation: new x.SorobanAuthorizedInvocation({
      function: x.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new x.InvokeContractArgs({
        contractAddress: new S.Address(cfg.tokenId).toScAddress(), functionName: 'mint', args: [] })),
      subInvocations: [] }),
  });
  const withForeignAuth = build(S.Operation.invokeHostFunction({ func: funcOf(mintOp(cfg.C, 20000n)), auth: [entry] }));
  refused(() => ok('mint-C', withForeignAuth, { assembled: true }), /only source-account authorization/);
  refused(() => ok('mint-C', withForeignAuth), /unexpected authorization entries/);
});
