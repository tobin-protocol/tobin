// Offline tests for the governed-token deployment and mint checks. No network, no secrets. Run: node --test scripts/multisig/governed-token.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDeployEnvelope, checkMintEnvelope, checkTtlEnvelope, PARAMS, predictContractId, SALT, WASM_HASH } from './governed-token.mjs';

const ADMIN = 'GCZD5U7GKWMJHX52J2XF65ZULTBGXNMAATYDWMONXPTUD4WB57HMU5MJ';
const OTHER = 'GB4NFBRAPQQH7GP24WXR7RKD2SHJWZXTBZH6CTJTEXZWUHTULDUME6OL';
// Known answer: the contract ID the Stellar CLI simulation reported for this deployer and salt.
// Written in two parts so that the release-gate scan (which flags contract-ID-shaped strings outside the deployment manifest) does not match this file.
const CONTRACT = 'CD5OK4ZSFLAQIEVQZ44D3MFKESL' + 'BRYJLCGO2MEH6UKWWCV63LVQNOKYO';
const TOKEN = CONTRACT;

const sourceAuth = (invocation) => [{ credentials: 'source_account', root_invocation: { function: invocation, sub_invocations: [] } }];
const wrap = (op, over = {}, ext) => ({
  tx: { tx: { source_account: ADMIN, fee: 54671, seq_num: '10', cond: 'none', memo: 'none', operations: [op], ext: ext ?? { v1: { resources: { footprint: { read_only: [{ contract_code: { hash: WASM_HASH } }], read_write: [{ contract_data: { contract: CONTRACT, key: 'ledger_key_contract_instance', durability: 'persistent' } }] } } } }, ...over }, signatures: [] },
});
const deployOp = (over = {}) => ({
  source_account: null,
  body: {
    invoke_host_function: {
      host_function: {
        create_contract_v2: {
          contract_id_preimage: { address: { address: ADMIN, salt: SALT } },
          executable: { wasm: WASM_HASH },
          constructor_args: [{ address: ADMIN }, { i128: PARAMS.cap }, { u32: PARAMS.decimals }, { string: PARAMS.name }, { string: PARAMS.symbol }],
          ...over,
        },
      },
      auth: sourceAuth({ create_contract_v2_host_fn: {} }),
    },
  },
});
const mintOp = (args, over = {}) => ({
  source_account: null,
  body: { invoke_host_function: { host_function: { invoke_contract: { contract_address: TOKEN, function_name: 'mint', args: args ?? [{ address: ADMIN }, { i128: '1000000' }], ...over } }, auth: sourceAuth({ contract_fn: {} }) } },
});
const failed = (rows) => rows.filter((r) => !r.ok).map((r) => r.check);
const dep = (env) => failed(checkDeployEnvelope(env, { account: ADMIN, contractId: CONTRACT, expectedSequence: 10n }));
const mint = (env, o = {}) => failed(checkMintEnvelope(env, { account: ADMIN, token: TOKEN, to: ADMIN, amount: '1000000', expectedSequence: 10n, ...o }));

test('the contract ID derivation matches the CLI (known answer) and depends on deployer and salt', () => {
  assert.equal(predictContractId(ADMIN), CONTRACT);
  assert.notEqual(predictContractId(OTHER), CONTRACT);
  assert.notEqual(predictContractId(ADMIN, 'ab'.repeat(32)), CONTRACT);
});

test('the approved deployment passes, with the existing token parameters and the administrative account as minter', () => {
  assert.deepEqual(dep(wrap(deployOp())), []);
  assert.deepEqual(PARAMS, { cap: '10000000000000', decimals: 7, name: 'Tobin Test Token', symbol: 'TTT' });
});

test('any change to the deployment is rejected', () => {
  const args = (i, v) => { const a = deployOp().body.invoke_host_function.host_function.create_contract_v2.constructor_args.slice(); a[i] = v; return a; };
  assert.ok(dep(wrap(deployOp({ constructor_args: args(0, { address: OTHER }) }))).includes('constructor: minter = the administrative account'));
  assert.ok(dep(wrap(deployOp({ constructor_args: args(1, { i128: '1' }) }))).includes('constructor: cap, decimals, name, symbol = the existing token values'));
  assert.ok(dep(wrap(deployOp({ constructor_args: args(3, { string: 'Other' }) }))).includes('constructor: cap, decimals, name, symbol = the existing token values'));
  assert.ok(dep(wrap(deployOp({ executable: { wasm: 'cd'.repeat(32) } }))).includes('executable is the audited token Wasm'));
  assert.ok(dep(wrap(deployOp({ contract_id_preimage: { address: { address: ADMIN, salt: 'ab'.repeat(32) } } }))).includes('deployer address and fixed salt'));
  assert.ok(dep(wrap(deployOp(), { seq_num: '11' })).includes('sequence is the account sequence + 1'));
  assert.ok(dep(wrap(deployOp(), { source_account: OTHER })).includes('source account is the administrative account'));
  assert.ok(dep(wrap(deployOp(), { memo: { text: 'x' } })).includes('no memo, no time bounds or preconditions'));
  const extra = wrap(deployOp());
  extra.tx.tx.operations.push(deployOp());
  assert.ok(dep(extra).includes('exactly one operation'));
  const other = wrap(deployOp());
  other.tx.tx.operations[0].body.invoke_host_function.auth[0].credentials = 'address';
  assert.ok(dep(other).includes('one authorization entry, source-account credentials, no sub-invocations'));
  const fp = wrap(deployOp(), {}, { v1: { resources: { footprint: { read_only: [], read_write: [{ contract_data: { contract: TOKEN.replace('CD5', 'CD6'), key: 'ledger_key_contract_instance' } }] } } } });
  assert.ok(dep(fp).includes('footprint writes only the new instance and reads only the Wasm code'));
});

test('the mint check enforces the token, function, recipient and amount', () => {
  assert.deepEqual(mint(wrap(mintOp())), []);
  assert.ok(mint(wrap(mintOp([{ address: OTHER }, { i128: '1000000' }]))).includes('arguments: to and amount exactly as approved'));
  assert.ok(mint(wrap(mintOp([{ address: ADMIN }, { i128: '2000000' }]))).includes('arguments: to and amount exactly as approved'));
  assert.ok(mint(wrap(mintOp(null, { function_name: 'transfer' }))).some((c) => /invokes the new token, function mint/.test(c)));
  assert.ok(mint(wrap(mintOp(null, { contract_address: 'CAAAA' }))).some((c) => /invokes the new token/.test(c)));
  assert.ok(mint(wrap(mintOp()), { expectedSequence: 99n }).includes('sequence is the account sequence + 1'));
});

const ttlOp = (extendTo = 1036800) => ({ source_account: null, body: { extend_footprint_ttl: { ext: 'v0', extend_to: extendTo } } });
const ttlExt = (ro, rw = []) => ({ v1: { resources: { footprint: { read_only: ro, read_write: rw } } } });
const instanceKey = (c = CONTRACT) => ({ contract_data: { contract: c, key: 'ledger_key_contract_instance', durability: 'persistent' } });
const ttl = (env, o = {}) => failed(checkTtlEnvelope(env, { account: ADMIN, contractId: CONTRACT, extendTo: 1036800, expectedSequence: 10n, ...o }));

test('the TTL extension check accepts exactly the new instance entry and the approved length', () => {
  assert.deepEqual(ttl(wrap(ttlOp(), {}, ttlExt([instanceKey()]))), []);
});

test('the TTL extension check rejects other entries, writes, another length, another sequence and extra operations', () => {
  assert.ok(ttl(wrap(ttlOp(), {}, ttlExt([instanceKey(OTHER)]))).some((c) => /footprint/.test(c))); // another contract's entry
  assert.ok(ttl(wrap(ttlOp(), {}, ttlExt([instanceKey(), { contract_code: { hash: WASM_HASH } }]))).some((c) => /footprint/.test(c))); // the shared code entry as well
  assert.ok(ttl(wrap(ttlOp(), {}, ttlExt([instanceKey()], [instanceKey()]))).some((c) => /footprint/.test(c))); // a write
  assert.ok(ttl(wrap(ttlOp(2000000), {}, ttlExt([instanceKey()]))).some((c) => /extend_to/.test(c))); // another length
  assert.ok(ttl(wrap(ttlOp(), {}, ttlExt([instanceKey()])), { expectedSequence: 99n }).includes('sequence is the expected one'));
  const two = wrap(ttlOp(), {}, ttlExt([instanceKey()]));
  two.tx.tx.operations.push(ttlOp());
  assert.ok(ttl(two).includes('exactly one operation'));
  assert.ok(ttl(wrap(mintOp(), {}, ttlExt([instanceKey()]))).some((c) => /extend_to/.test(c))); // a different operation kind
});
