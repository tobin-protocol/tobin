'use strict';
// Hardening tests: pinned deployment identity, exact footprints, resource ceilings, time bounds, atomic state.
// Fake keys, mocked RPC and an in-memory file system only. Run: node --test test/*.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const H = require('./helpers.cjs');
const { S, x, core, F, OTHER, SALT, PIN, cfg, cfgUnpinned, P, STATE, realNow, memFs, kCode, kData, kInstance, kBalance, goodFootprint, MEASURED, makeDeps, createStore } = H;

const refused = (fn, re) => assert.throws(fn, (e) => e instanceof core.Refusal && (re ? re.test(e.message) : true), String(re));
const rejectsRefusal = (p, re) => assert.rejects(p, (e) => e instanceof core.Refusal && (re ? re.test(e.message) : true), String(re));
const sha = (t) => crypto.createHash('sha256').update(Buffer.from(t, 'utf8')).digest('hex');
const confText = (o = {}) => JSON.stringify({ version: 1, network: 'testnet', admin: F, saltHex: SALT, predictedContractId: cfg.tokenId, ...o }, null, 2) + '\n';

// ================= 1. pinned deployment identity =================
test('pinned config: the reviewed file parses, derives the same ID, and carries its SHA-256', () => {
  const text = confText(); const c = core.parseDeploymentConfig(S, text, sha(text));
  assert.equal(c.tokenId, cfg.tokenId); assert.equal(c.pinned, true); assert.equal(c.configSha256, sha(text));
});

test('pinned config: a changed salt, changed contract ID, or any changed byte is refused', () => {
  const text = confText(); const pin = sha(text);
  refused(() => core.parseDeploymentConfig(S, confText({ saltHex: crypto.randomBytes(32).toString('hex') }), pin), /pinned SHA-256/);
  refused(() => core.parseDeploymentConfig(S, confText({ predictedContractId: S.StrKey.encodeContract(crypto.randomBytes(32)) }), pin), /pinned SHA-256/);
  refused(() => core.parseDeploymentConfig(S, text + ' ', pin), /pinned SHA-256/);
});

test('config consistency is enforced even when the pin is recomputed for a tampered file', () => {
  // an attacker who also updates the pin still cannot make the ID inconsistent with (admin, salt)
  const badId = confText({ predictedContractId: S.StrKey.encodeContract(crypto.randomBytes(32)) });
  refused(() => core.parseDeploymentConfig(S, badId, sha(badId)), /inconsistent with its admin and salt/);
  const otherSalt = confText({ saltHex: crypto.randomBytes(32).toString('hex') });
  refused(() => core.parseDeploymentConfig(S, otherSalt, sha(otherSalt)), /inconsistent/);
});

test('config schema: extra or missing fields, wrong network or version, bad salts, bad admin are refused', () => {
  for (const [o, re] of [[{ extra: 1 }, /unexpected or missing/], [{ network: 'public' }, /network is not testnet/], [{ version: 2 }, /version/],
    [{ saltHex: '00'.repeat(32) }, /repeated byte/], [{ saltHex: 'zz' }, /32 bytes/], [{ admin: OTHER.slice(0, 20) }, /valid public key/], [{ admin: core.APPROVED.C }, /differ from C and D/]]) {
    const t = confText(o); refused(() => core.parseDeploymentConfig(S, t, sha(t)), re);
  }
  const missing = JSON.stringify({ version: 1, network: 'testnet', admin: F, saltHex: SALT });
  refused(() => core.parseDeploymentConfig(S, missing, sha(missing)), /unexpected or missing/);
  refused(() => core.parseDeploymentConfig(S, 'not json', null), /not valid JSON/);
});

test('an unpinned configuration can be previewed (with a warning) but never executed', async () => {
  const m = makeDeps('mint-C', { cfgUsed: cfgUnpinned });
  await core.preview(m.deps, cfgUnpinned, 'mint-C');
  assert.match(m.log.join('\n'), /NOT pinned/);
  await rejectsRefusal(core.execute(m.deps, cfgUnpinned, 'mint-C'), /not pinned/);
  assert.equal(m.counters.keyLoads, 0); assert.equal(m.rpc.calls.sent, 0);
});

test('local state must match the pinned deployment exactly: salt, contract ID, admin and config hash', async () => {
  for (const [field, value] of [['saltHex', crypto.randomBytes(32).toString('hex')], ['predictedContractId', S.StrKey.encodeContract(crypto.randomBytes(32))], ['admin', OTHER], ['configSha256', 'cd'.repeat(32)]]) {
    const m = makeDeps('deploy', { state: { exists: false } });
    const s = JSON.parse(m.fs.files.get(STATE)); s[field] = value; m.fs.files.set(STATE, JSON.stringify(s));
    await rejectsRefusal(core.execute(m.deps, cfg, 'deploy').catch((e) => { throw new core.Refusal(e.message); }), new RegExp(`${field} differs`));
    assert.equal(m.counters.keyLoads, 0); assert.equal(m.rpc.calls.sent, 0);
  }
});

test('repeating the approved deployment after local state tampering is still refused (on-chain guard, state record, pin)', async () => {
  // 1. a real deployment is recorded
  let m = makeDeps('deploy', { state: { exists: false } });
  await core.execute(m.deps, cfg, 'deploy');
  // 2. the record is deleted from the state file; the contract now exists on chain, so the deploy guard refuses
  const s = JSON.parse(m.fs.files.get(STATE)); s.operations = []; m.fs.files.set(STATE, JSON.stringify(s));
  const again = makeDeps('deploy', { state: { exists: true }, fs: m.fs, initStore: false });
  await rejectsRefusal(core.execute(again.deps, cfg, 'deploy'), /already exists/);
  assert.equal(again.rpc.calls.sent, 0);
  // 3. with the record intact the state refuses first
  m = makeDeps('deploy', { state: { exists: false } }); await core.execute(m.deps, cfg, 'deploy');
  await rejectsRefusal(core.execute(m.deps, cfg, 'deploy'), /already recorded as done/);
  // 4. a state file for a different salt cannot be used to deploy a "new" token
  const forged = makeDeps('deploy', { state: { exists: false } });
  const f = JSON.parse(forged.fs.files.get(STATE)); f.saltHex = crypto.randomBytes(32).toString('hex'); forged.fs.files.set(STATE, JSON.stringify(f));
  await assert.rejects(core.execute(forged.deps, cfg, 'deploy'), /saltHex differs/);
});

// ================= 2. exact footprints =================
const OPS = ['deploy', 'mint-C', 'mint-D'];
const fpOver = (opName, mut) => { const g = goodFootprint(opName); return mut(g) ?? g; };
const preview = (opName, rpcOver) => { const m = makeDeps(opName, { rpcOver }); return core.preview(m.deps, cfg, opName); };

test('the exact expected footprint for each operation is accepted', async () => { for (const op of OPS) await preview(op, {}); });

test('missing footprint entries are refused (code, instance, balance)', async () => {
  for (const op of OPS) {
    await rejectsRefusal(preview(op, { fp: fpOver(op, (g) => { g.ro = []; }) }), /readOnly is missing 1 required entry/);
    await rejectsRefusal(preview(op, { fp: fpOver(op, (g) => { g.rw = g.rw.filter((k) => k.toXDR('base64') !== kInstance().toXDR('base64')); }) }), /readWrite is missing 1 required entry/);
  }
  for (const op of ['mint-C', 'mint-D']) await rejectsRefusal(preview(op, { fp: fpOver(op, (g) => { g.rw = [kInstance()]; }) }), /missing 1 required entry/);
});

test('unexpected footprint entries are refused (extra key, other contract, other Wasm, other balance)', async () => {
  for (const op of OPS) {
    await rejectsRefusal(preview(op, { fp: fpOver(op, (g) => { g.rw.push(kBalance(OTHER)); }) }), /unexpected entr/);
    await rejectsRefusal(preview(op, { fp: fpOver(op, (g) => { g.rw.push(kInstance({ contract: S.StrKey.encodeContract(crypto.randomBytes(32)) })); }) }), /unexpected entr/);
    await rejectsRefusal(preview(op, { fp: fpOver(op, (g) => { g.ro.push(kCode('cd'.repeat(32))); }) }), /unexpected entr/);
    await rejectsRefusal(preview(op, { fp: fpOver(op, (g) => { g.ro = [kCode('cd'.repeat(32))]; }) }), /(missing|unexpected)/);
    await rejectsRefusal(preview(op, { fp: fpOver(op, (g) => { g.ro.push(x.LedgerKey.account(new x.LedgerKeyAccount({ accountId: S.Keypair.fromPublicKey(F).xdrAccountId() }))); }) }), /unexpected entr/);
    await rejectsRefusal(preview(op, { fp: fpOver(op, (g) => { g.rw.push(g.rw[0]); }) }), /(unexpected|duplicates)/);
  }
});

test('wrong durability is refused (instance or balance recorded as temporary)', async () => {
  const temp = { durability: x.ContractDataDurability.temporary };
  await rejectsRefusal(preview('deploy', { fp: { ro: [kCode()], rw: [kInstance(temp)] } }), /(missing|unexpected)/);
  for (const op of ['mint-C', 'mint-D']) {
    const to = op === 'mint-C' ? cfg.C : cfg.D;
    await rejectsRefusal(preview(op, { fp: { ro: [kCode()], rw: [kInstance(), kBalance(to, temp)] } }), /(missing|unexpected)/);
    await rejectsRefusal(preview(op, { fp: { ro: [kCode()], rw: [kInstance(temp), kBalance(to)] } }), /(missing|unexpected)/);
  }
});

test('wrong access classification is refused (written entries as read-only, code as writable, balance of the wrong recipient)', async () => {
  await rejectsRefusal(preview('deploy', { fp: { ro: [kCode(), kInstance()], rw: [] } }), /(missing|unexpected)/);
  await rejectsRefusal(preview('deploy', { fp: { ro: [], rw: [kCode(), kInstance()] } }), /(missing|unexpected)/);
  await rejectsRefusal(preview('mint-C', { fp: { ro: [kCode(), kInstance()], rw: [kBalance(cfg.C)] } }), /(missing|unexpected)/);
  await rejectsRefusal(preview('mint-C', { fp: { ro: [kCode()], rw: [kInstance(), kBalance(cfg.D)] } }), /(missing|unexpected)/);
  await rejectsRefusal(preview('mint-D', { fp: { ro: [kCode()], rw: [kInstance(), kBalance(cfg.C)] } }), /(missing|unexpected)/);
});

// ================= 3. resource ceilings =================
test('resources at the limit are accepted; one unit over is refused, for every operation and every dimension', async () => {
  for (const op of OPS) {
    const lim = cfg.resourceLimits[op];
    await preview(op, { res: { instructions: lim.instructions, read: lim.readBytes, write: lim.writeBytes } });
    await rejectsRefusal(preview(op, { res: { instructions: lim.instructions + 1 } }), /instructions .* exceeds the .* limit/);
    await rejectsRefusal(preview(op, { res: { read: lim.readBytes + 1 } }), /readBytes .* exceeds/);
    await rejectsRefusal(preview(op, { res: { write: lim.writeBytes + 1 } }), /writeBytes .* exceeds/);
  }
});

test('the limits are anchored to the measurements (about 2x) and per operation', () => {
  assert.ok(cfg.resourceLimits.deploy.instructions >= MEASURED.deploy.instructions * 2 - 50000 && cfg.resourceLimits.deploy.instructions <= MEASURED.deploy.instructions * 2.1);
  assert.ok(cfg.resourceLimits['mint-C'].instructions >= MEASURED['mint-C'].instructions * 2 && cfg.resourceLimits['mint-C'].instructions <= MEASURED['mint-C'].instructions * 2.2);
  assert.ok(cfg.resourceLimits.deploy.writeBytes >= MEASURED.deploy.write * 2);
  assert.equal(cfg.feeCeilingStroops, 500000);
});

test('the fee ceiling is retained: a resource fee that pushes the total over 0.05 XLM is refused; inconsistent fee fields are refused', async () => {
  await preview('mint-C', { res: { fee: 499800 } }); // 499,800 + 100 base = 499,900, inside the ceiling
  await rejectsRefusal(preview('mint-C', { res: { fee: 600000 } }), /fee is outside the approved ceiling/);
  const m = makeDeps('mint-C'); const orig = m.rpc.simulateTransaction;
  m.rpc.simulateTransaction = async (tx) => { const s = await orig(tx); s.minResourceFee = '1'; return s; };
  await rejectsRefusal(core.preview(m.deps, cfg, 'mint-C'), /inconsistent/);
});

// ================= 4. time bounds =================
const tb = (min, max) => ({ minTime: String(min), maxTime: String(max) });
test('time bounds: valid window accepted; expired, not yet valid, missing, malformed and too wide are refused', () => {
  const now = 1_000_000;
  core.checkTimeBounds(cfg, tb(0, now + 120), now);
  core.checkTimeBounds(cfg, tb(0, now + 130), now); // 120 s lifetime plus the 10 s skew allowance
  refused(() => core.checkTimeBounds(cfg, tb(0, now), now), /expired/);
  refused(() => core.checkTimeBounds(cfg, tb(0, now - 5), now), /expired/);
  refused(() => core.checkTimeBounds(cfg, tb(now + 60, now + 120), now), /not valid yet/);
  refused(() => core.checkTimeBounds(cfg, tb(0, 0), now), /unbounded/);
  refused(() => core.checkTimeBounds(cfg, tb(now + 10, now + 5), now), /(minimum after maximum|expired|not valid yet)/);
  refused(() => core.checkTimeBounds(cfg, undefined, now), /missing/);
  refused(() => core.checkTimeBounds(cfg, { minTime: '0' }, now), /missing/);
  refused(() => core.checkTimeBounds(cfg, tb('abc', now + 60), now), /malformed/);
  refused(() => core.checkTimeBounds(cfg, tb(0, '12x'), now), /malformed/);
  refused(() => core.checkTimeBounds(cfg, tb(0, -1), now), /malformed/);
  refused(() => core.checkTimeBounds(cfg, tb(0, now + 131), now), /maximum lifetime/);
  refused(() => core.checkTimeBounds(cfg, tb(0, now + 100000), now), /maximum lifetime/);
  refused(() => core.checkTimeBounds(cfg, tb(0, now + 10), now, 15), /too little validity/);
  core.checkTimeBounds(cfg, tb(0, now + 20), now, 15);
});

test('the maximum transaction lifetime is unchanged at 120 seconds', () => { assert.equal(core.APPROVED.maxTimeoutSeconds, 120); assert.equal(core.APPROVED.minRemainingSeconds, 15); });

test('validity is rechecked immediately before signing: a clock that moved past the window refuses and never loads the key', async () => {
  for (const jump of [200, 110]) { // expired (200 s) and "less than 15 s left" (110 s of 120)
    const clock = { offset: 0 };
    const m = makeDeps('mint-C', { clock });
    m.deps.confirm = async () => { m.counters.confirms++; clock.offset = jump; return core.confirmationPhrase(cfg, 'mint-C'); };
    await rejectsRefusal(core.execute(m.deps, cfg, 'mint-C'), jump === 200 ? /expired/ : /too little validity/);
    assert.equal(m.counters.keyLoads, 0); assert.equal(m.rpc.calls.sent, 0);
    assert.equal(JSON.parse(m.fs.files.get(STATE)).operations.length, 0);
  }
});

test('an expired transaction is refused by the verifier at build time too', () => {
  const m = makeDeps('mint-C', { clock: { offset: 100000 } });
  return rejectsRefusal(core.preview(m.deps, cfg, 'mint-C'), /(expired|not valid)/);
});

// ================= 5. state persistence =================
const goodState = () => ({ version: 2, network: 'testnet', admin: F, saltHex: SALT, predictedContractId: cfg.tokenId, configSha256: PIN, operations: [] });
const mk = (fs = memFs(), restrict = () => ({ applied: true })) => ({ fs, store: createStore(STATE, { fs, restrict, randomHex: () => 'x1' }) });

test('writes are atomic: failure at open, write, partial write, fsync or rename leaves the previous state intact and raises', () => {
  for (const hook of [{ open: () => { throw new Error('open'); } }, { write: () => { throw new Error('w'); } }, { write: 'partial' }, { fsync: () => { throw new Error('f'); } }, { rename: () => { throw new Error('r'); } }]) {
    const { fs, store } = mk(); store.init(cfg);
    const before = fs.files.get(STATE);
    Object.assign(fs.hooks, hook);
    assert.throws(() => store.markPending(cfg, 'deploy', { txHash: 'a'.repeat(64), maxTime: 1, now: 1 }), /state write failed before completion/);
    assert.equal(fs.files.get(STATE), before);
    assert.deepEqual([...fs.files.keys()].filter((k) => k.endsWith('.tmp')), []); // no temporary file is left behind
    for (const k of Object.keys(fs.hooks)) delete fs.hooks[k];
    assert.equal(store.load().operations.length, 0);
  }
});

test('interrupted-write recovery: a leftover temporary file is ignored; a torn main file is refused, never replaced by an empty state', () => {
  const { fs, store } = mk(); store.init(cfg);
  fs.files.set('/keys/.settlement-token-state.json.dead.tmp', '{"version":2,"oper'); // crash residue
  assert.equal(store.load().operations.length, 0);
  store.markPending(cfg, 'deploy', { txHash: 'a'.repeat(64), maxTime: 5, now: 1 }); // a later write still succeeds
  fs.files.set(STATE, '{"version":2,"network":"testn'); // torn file (should be impossible with rename, but never trusted)
  assert.throws(() => store.load(), /not valid JSON/);
  assert.throws(() => store.markPending(cfg, 'mint-C', { txHash: 'b'.repeat(64), maxTime: 5, now: 1 }), /not valid JSON/);
  assert.throws(() => mk(fs).store.init(cfg), /already exists/); // init never overwrites
});

test('a missing, malformed or schema-violating state file is refused', () => {
  const { fs, store } = mk();
  assert.throws(() => store.load(), /missing or unreadable/);
  for (const bad of [{ ...goodState(), extra: 1 }, { ...goodState(), version: 1 }, { ...goodState(), network: 'public' }, { ...goodState(), operations: [{ operation: 'transfer', status: 'PENDING', txHash: 'a'.repeat(64) }] },
    { ...goodState(), operations: [{ operation: 'deploy', status: 'DONE', txHash: 'a'.repeat(64) }] }, { ...goodState(), operations: [{ operation: 'deploy', status: 'PENDING', txHash: 'zz' }] },
    { ...goodState(), operations: [{ operation: 'deploy', status: 'PENDING', txHash: 'a'.repeat(64) }, { operation: 'deploy', status: 'SUCCEEDED', txHash: 'b'.repeat(64) }] }]) {
    fs.files.set(STATE, JSON.stringify(bad)); assert.throws(() => store.load(), /state file invalid/);
  }
});

test('persisted state is verified: a read-back that differs is an error, not a success', () => {
  const { fs, store } = mk(); store.init(cfg);
  fs.hooks.readTransform = (p, t) => (p === STATE ? t.replace('PENDING', 'SUCCEEDED') : t);
  assert.throws(() => store.markPending(cfg, 'deploy', { txHash: 'a'.repeat(64), maxTime: 5, now: 1 }), /read-back differs/);
});

test('permissions: the temporary file is created exclusively with mode 0600 and the restriction hook is applied before the rename', () => {
  const seen = []; const { fs, store } = mk(memFs(), (f) => { seen.push(f); return { applied: true }; });
  store.init(cfg);
  assert.deepEqual(fs.calls.openModes[0], ['wx', 0o600]);
  assert.equal(seen.length, 1); assert.match(seen[0], /\.tmp$/);
});

test('pending-before-send: the PENDING record with the real transaction hash exists on disk at the moment of submission', async () => {
  let atSend; const m = makeDeps('mint-C', { rpcOver: { onSend: (tx) => { atSend = JSON.parse(m.fs.files.get(STATE)); atSend.hash = Buffer.from(tx.hash()).toString('hex'); } } });
  await core.execute(m.deps, cfg, 'mint-C');
  assert.equal(atSend.operations[0].status, 'PENDING'); assert.equal(atSend.operations[0].txHash, atSend.hash);
  const final = JSON.parse(m.fs.files.get(STATE)); assert.equal(final.operations[0].status, 'SUCCEEDED'); assert.equal(final.operations[0].ledger, 777);
});

test('if the pending record cannot be written, nothing is submitted (and the key was only used for signing)', async () => {
  const m = makeDeps('mint-C'); m.fs.hooks.rename = () => { throw new Error('disk'); };
  await rejectsRefusal(core.execute(m.deps, cfg, 'mint-C'), /nothing was submitted/);
  assert.equal(m.rpc.calls.sent, 0); assert.equal(JSON.parse(m.fs.files.get(STATE)).operations.length, 0);
});

test('if the result cannot be recorded after a successful transaction, the error names the hash and says not to re-run', async () => {
  const m = makeDeps('mint-C', { rpcOver: { onSend: () => { m.fs.hooks.rename = () => { throw new Error('disk'); }; } } });
  await assert.rejects(core.execute(m.deps, cfg, 'mint-C'), (e) => /outcome is SUCCEEDED but the local record could not be updated/.test(e.message) && /[0-9a-f]{64}/.test(e.message) && /do not re-run/.test(e.message));
  delete m.fs.hooks.rename;
  assert.equal(JSON.parse(m.fs.files.get(STATE)).operations[0].status, 'PENDING'); // never a misleading "completed"
});

test('reconcile: an interrupted run is settled against the chain before anything new is attempted', async () => {
  const hash = 'c'.repeat(64);
  const seed = (m, maxTime) => m.store.markPending(cfg, 'mint-C', { txHash: hash, maxTime, now: realNow() });
  // pending and found on chain as SUCCESS: recorded as SUCCEEDED, and the operation is then refused as already done
  let m = makeDeps('mint-C', { rpcOver: { getTx: async () => ({ status: 'SUCCESS', ledger: 42 }) } }); seed(m, realNow() + 60);
  await rejectsRefusal(core.execute(m.deps, cfg, 'mint-C'), /already recorded as done/);
  assert.equal(JSON.parse(m.fs.files.get(STATE)).operations[0].status, 'SUCCEEDED');
  // pending, NOT_FOUND, still inside its validity window: refused until the outcome is known
  m = makeDeps('mint-C', { rpcOver: { getTx: async () => ({ status: 'NOT_FOUND' }) } }); seed(m, realNow() + 60);
  await rejectsRefusal(core.execute(m.deps, cfg, 'mint-C'), /outcome of a previous mint-C transaction is not known/);
  assert.equal(m.rpc.calls.sent, 0);
  // pending, NOT_FOUND, long past its window: marked EXPIRED and a fresh attempt is allowed
  const evidence = { status: 'NOT_FOUND', latestLedger: 9, oldestLedger: 1, latestLedgerCloseTime: String(realNow() + 5), oldestLedgerCloseTime: String(realNow() - 400000) };
  m = makeDeps('mint-C', { rpcOver: { getTx: async (h) => (h === hash ? evidence : { status: 'SUCCESS', ledger: 9, returnValue: x.ScVal.scvVoid() }) } }); seed(m, realNow() - 1000);
  await core.execute(m.deps, cfg, 'mint-C');
  const ops = JSON.parse(m.fs.files.get(STATE)).operations; assert.equal(ops[0].status, 'EXPIRED'); assert.equal(ops[1].status, 'SUCCEEDED');
  // pending and FAILED on chain: recorded as FAILED, a retry is then possible
  m = makeDeps('mint-C', { rpcOver: { getTx: async (h) => (h === hash ? { status: 'FAILED', ledger: 5 } : { status: 'SUCCESS', ledger: 9 }) } }); seed(m, realNow() + 60);
  await core.execute(m.deps, cfg, 'mint-C'); assert.equal(JSON.parse(m.fs.files.get(STATE)).operations[0].status, 'FAILED');
});

// ================= 6. configuration tool =================
test('make-deployment-config produces a file that parses, is consistent and can be pinned; it needs only a public address', () => {
  const { makeDeploymentConfigText } = require('../make-deployment-config.cjs');
  const text = makeDeploymentConfigText(S, F);
  const c = core.parseDeploymentConfig(S, text, sha(text));
  assert.equal(c.F, F); assert.equal(c.pinned, true);
  assert.notEqual(makeDeploymentConfigText(S, F), text); // a fresh random salt each time
  assert.throws(() => makeDeploymentConfigText(S, 'GBAD'), /valid public key/);
});

// ================= 7. resource-limit table is pinned to literals (not derived from the code under test) =================
test('the reviewed ceiling table is pinned by literal values, and literal boundaries are enforced', async () => {
  assert.deepEqual(JSON.parse(JSON.stringify(cfg.resourceLimits)), {
    deploy: { instructions: 1800000, readBytes: 10000, writeBytes: 1000 },
    'mint-C': { instructions: 1400000, readBytes: 10000, writeBytes: 1200 },
    'mint-D': { instructions: 1400000, readBytes: 10000, writeBytes: 1200 },
  });
  await rejectsRefusal(preview('deploy', { res: { instructions: 1800001 } }), /instructions/);
  await rejectsRefusal(preview('deploy', { res: { write: 1001 } }), /writeBytes/);
  for (const op of ['mint-C', 'mint-D']) {
    await rejectsRefusal(preview(op, { res: { instructions: 1400001 } }), /instructions/);
    await rejectsRefusal(preview(op, { res: { write: 1201 } }), /writeBytes/);
    await rejectsRefusal(preview(op, { res: { read: 10001 } }), /readBytes/);
    await preview(op, { res: { write: 1200 } });
  }
});

test('a simulation that omits or garbles a resource figure is refused', () => {
  const good = goodFootprint('mint-C');
  const simWith = (resources) => ({ transactionData: { build: () => ({ resources: { footprint: { readOnly: good.ro, readWrite: good.rw }, ...resources } }) } });
  const c = cfg;
  core.verifyFootprint(S, c, 'mint-C', simWith({ instructions: 1, diskReadBytes: 0, writeBytes: 1 }));
  refused(() => core.verifyFootprint(S, c, 'mint-C', simWith({ instructions: 1, writeBytes: 1 })), /did not report readBytes/);
  refused(() => core.verifyFootprint(S, c, 'mint-C', simWith({ diskReadBytes: 0, writeBytes: 1 })), /did not report instructions/);
  refused(() => core.verifyFootprint(S, c, 'mint-C', simWith({ instructions: 1, diskReadBytes: 0 })), /did not report writeBytes/);
  refused(() => core.verifyFootprint(S, c, 'mint-C', simWith({ instructions: -5, diskReadBytes: 0, writeBytes: 1 })), /did not report instructions/);
  refused(() => core.verifyFootprint(S, c, 'mint-C', simWith({ instructions: 'many', diskReadBytes: 0, writeBytes: 1 })), /did not report instructions/);
});
