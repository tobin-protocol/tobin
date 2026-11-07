// READ-ONLY Stellar Testnet preflight (MVP-1.5). Reads the public network and the deployed contracts and compares them with contracts/deployments/testnet.json.
// It submits NOTHING, signs NOTHING and needs NO key: simulation of read-only getters uses a public account id as the (unsigned) source.
//   node scripts/testnet-preflight.mjs [outfile.json]      Testnet only: refuses any other passphrase.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Account, Address, Contract, Keypair, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const dep = JSON.parse(readFileSync(root + 'contracts/deployments/testnet.json', 'utf8'));
const admin = JSON.parse(readFileSync(root + 'accounts/testnet-admin.json', 'utf8'));
const PASSPHRASE = 'Test SDF Network ; September 2015';
if (dep.networkPassphrase !== PASSPHRASE) throw new Error('deployment record is not Testnet');
const server = new rpc.Server(dep.rpc, { allowHttp: false });
const out = { at: new Date().toISOString(), rpc: dep.rpc, checks: [] };
const J = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x))); // SDK 17 objects serialize through toJSON
const check = (name, ok, detail) => { out.checks.push({ name, ok, detail: J(detail) }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${typeof detail === 'string' ? detail : JSON.stringify(J(detail))}`); };

const health = await server.getHealth(); check('rpc health', health.status === 'healthy', health);
const net = await server.getNetwork(); check('network passphrase is Testnet', net.passphrase === PASSPHRASE, { passphrase: net.passphrase, protocolVersion: net.protocolVersion });
out.protocolVersion = net.protocolVersion;
let ver = {}; try { ver = await server.getVersionInfo(); } catch (e) { ver = { error: String(e.message ?? e) }; } check('rpc version info', true, ver);
const latest = await server.getLatestLedger(); check('latest ledger', latest.sequence > 0, { sequence: latest.sequence, protocolVersion: latest.protocolVersion });

// the deployed contract instances and their Wasm hashes (SDK 17 returns plain typed objects)
for (const [name, c] of Object.entries(dep.contracts)) {
  let e; try { e = await server.getContractData(c.contractId, xdr.ScVal.scvLedgerKeyContractInstance()); } catch (x) { check(`${name}: instance exists`, false, String(x.message ?? x)); continue; }
  const inst = J(e.val.contractData.val); const hash = inst?.contract_instance?.executable?.wasm; if (!hash) { check(name + ': instance entry shape', false, JSON.stringify(inst, (k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 200)); continue; }
  check(`${name}: instance exists, Wasm hash matches the record`, hash === c.wasmHash, { contractId: c.contractId, onChain: hash, recorded: c.wasmHash, liveUntil: e.liveUntilLedgerSeq });
}

// the administrative account (public data)
const ar = await server.getLedgerEntries(xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(admin.accountId).xdrPublicKey() })));
const ae = ar.entries?.[0] ? J(ar.entries[0].val).account : undefined;
check('administrative account exists with the recorded thresholds and signers', !!ae && ae.thresholds === '01050607' && ae.signers.length === 3, ae ? { id: admin.accountId, balanceStroops: ae.balance, thresholds: ae.thresholds, signerWeights: ae.signers.map((x) => x.weight) } : 'not found');

// read-only simulation of getters, unsigned, from a public source account
async function view(contractId, fn, ...args) {
  const src = new Account(admin.accountId, '0');
  const tx = new TransactionBuilder(src, { fee: '100', networkPassphrase: PASSPHRASE }).addOperation(new Contract(contractId).call(fn, ...args)).setTimeout(60).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return { error: sim.error };
  return { value: scValToNative(sim.result.retval), minResourceFee: sim.minResourceFee };
}
const tok = dep.contracts.tobin_test_token_governed.contractId, clr = dep.contracts.tobin_clearing_v1.contractId;
for (const [fn, args] of [['symbol', []], ['decimals', []], ['cap', []], ['total_supply', []], ['minter', []], ['balance', [new Address(admin.accountId).toScVal()]]]) {
  const r = await view(tok, fn, ...args); check(`governed token ${fn}`, !r.error, r.error ?? String(r.value));
}
{ const r = await view(clr, 'config'); check('clearing config()', !r.error, r.error ?? JSON.stringify(r.value, (k, v) => (typeof v === 'bigint' ? v.toString() : v))); }
if (dep.functionalChecks?.sessionId) {
  const sid = nativeToScVal(Buffer.from(dep.functionalChecks.sessionId, 'hex'), { type: 'bytes' });
  const r = await view(clr, 'get_session', sid); check('recorded Testnet session readable on chain (get_session)', !r.error, r.error ?? JSON.stringify(r.value, (k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 400));
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
process.exit(out.checks.every((c) => c.ok) ? 0 : 1);
