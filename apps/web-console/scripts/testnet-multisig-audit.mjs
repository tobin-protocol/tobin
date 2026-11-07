// READ-ONLY live audit of the administrative multisig account on Stellar Testnet (MVP-1.5 stage 2). Reads Horizon AND the Soroban RPC independently, compares them
// with each other and with the repository record, and writes a timestamped evidence file. Nothing is signed or submitted; no key is used.
//   node scripts/testnet-multisig-audit.mjs <outfile.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Keypair, xdr } from '@stellar/stellar-sdk';
import { createServer } from '../lib/stellar/rpc.ts';
import { signerSetFromHorizon, signerSetFromRpc, fingerprintOf, minimalAuthorizingSets } from '../lib/stellar/signer-set.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const dep = JSON.parse(readFileSync(root + 'contracts/deployments/testnet.json', 'utf8'));
const rec = JSON.parse(readFileSync(root + 'accounts/testnet-admin.json', 'utf8'));
const HORIZON = 'https://horizon-testnet.stellar.org';
const out = { at: new Date().toISOString(), network: 'testnet', passphrase: dep.networkPassphrase, account: rec.accountId, horizon: HORIZON, rpc: dep.rpc, checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`, typeof detail === 'string' ? detail : JSON.stringify(detail)); };

const h = await (await fetch(`${HORIZON}/accounts/${rec.accountId}`)).json();
const live = signerSetFromHorizon(h, 'testnet');
out.horizonAccount = { id: h.id, sequence: h.sequence, subentryCount: h.subentry_count, flags: h.flags, thresholds: h.thresholds, signers: h.signers, balances: h.balances, lastModifiedLedger: h.last_modified_ledger };

const server = createServer(dep.rpc);
const r = await server.getLedgerEntries(xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(rec.accountId).xdrPublicKey() })));
const rpcEntry = JSON.parse(JSON.stringify(r.entries[0].val, (k, v) => (typeof v === 'bigint' ? v.toString() : v))).account;
const viaRpc = signerSetFromRpc(rpcEntry, 'testnet');
out.rpcAccount = { sequence: rpcEntry.seq_num, thresholdsHex: rpcEntry.thresholds, signers: rpcEntry.signers, lastModifiedLedgerSeq: r.entries[0].lastModifiedLedgerSeq, latestLedger: r.latestLedger };
check('Horizon and RPC agree on the signer set and thresholds', fingerprintOf(live) === fingerprintOf(viaRpc), { horizon: fingerprintOf(live), rpc: fingerprintOf(viaRpc) });
check('live signer set equals the repository record (accounts/testnet-admin.json)', JSON.stringify(rec.signers.map((s) => [s.publicKey, s.weight]).sort()) === JSON.stringify(live.signers.filter((s) => s.key !== rec.accountId).map((s) => [s.key, s.weight]).sort()), { recorded: rec.signers.map((s) => [s.role, s.publicKey, s.weight]) });
check('thresholds are 5 / 6 / 7', live.thresholds.low === 5 && live.thresholds.medium === 6 && live.thresholds.high === 7, live.thresholds);
const master = live.signers.find((s) => s.key === rec.accountId);
check('master key weight (the bootstrap key is still enabled)', !!master, master ?? 'master key not a signer');
// the contract configuration: the token minter must be this account
const tokenId = dep.contracts.tobin_test_token_governed.contractId;
check('the governed token minter recorded in the deployment is this account', dep.contracts.tobin_test_token_governed.minter === rec.accountId, dep.contracts.tobin_test_token_governed.minter);
out.signerSet = { ...live, fingerprint: fingerprintOf(live) };
for (const [name, t] of [['low', live.thresholds.low], ['medium', live.thresholds.medium], ['high', live.thresholds.high]]) out['minimalSetsFor_' + name] = minimalAuthorizingSets(live, t).map((set) => set.map((k) => ({ key: k, weight: live.signers.find((s) => s.key === k).weight })));
console.log('signer set fingerprint', out.signerSet.fingerprint);
console.log('minimal authorizing sets (medium, what InvokeHostFunction needs):', JSON.stringify(out.minimalSetsFor_medium.map((s) => s.map((x) => x.key.slice(0, 6) + ':' + x.weight))));
out.tokenContract = tokenId;
writeFileSync(process.argv[2], JSON.stringify(out, null, 2)); console.log('evidence written');
process.exitCode = out.checks.every((c) => c.ok) ? 0 : 1;
