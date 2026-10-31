// npm run multisig:verify -- --account <G...> [--master-disabled]
// Read-only: compares the on-chain Testnet account with the manifest (three signers at 5/2/1, thresholds 5/6/7, no unexpected signers) and exits 1 on
// any difference. It reports what is on the ledger now, so run it after every setup transaction. It submits nothing.
import { arg, compareAccount, lookup, MANIFEST, readJson } from './lib.mjs';

const account = arg('--account');
if (!account) { console.error('usage: multisig:verify -- --account <administrative account public key> [--master-disabled]'); process.exit(2); }
const m = readJson(MANIFEST);
const signers = Object.fromEntries(m.signers.map((s) => [s.role, s.publicKey]));
if (Object.values(signers).some((k) => !k)) { console.error('the manifest does not yet hold all three signer public keys'); process.exit(1); }
const r = await lookup(account);
if (r.state !== 'exists') { console.error(`${account}: ${r.state === 'not-found' ? 'no account on Testnet' : r.detail}`); process.exitCode = 1; process.exit(); }
const rows = compareAccount(r.account, signers, m.thresholds, { masterDisabled: process.argv.includes('--master-disabled') ? true : null });
for (const x of rows) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.check}: ${x.detail}`);
process.exitCode = rows.every((x) => x.ok) ? 0 : 1;
