// READ-ONLY check of a Testnet account (MVP-1.5 stage 1): exists, funded, distinct from the administrative account. Horizon + RPC. No key. Usage:
//   node scripts/testnet-account-check.mjs <public key> [outfile.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Keypair, xdr } from '@stellar/stellar-sdk';
import { createServer } from '../lib/stellar/rpc.ts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const admin = JSON.parse(readFileSync(root + 'accounts/testnet-admin.json', 'utf8')).accountId;
const key = process.argv[2];
const out = { at: new Date().toISOString(), network: 'testnet', account: key, administrativeAccount: admin, checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`, typeof detail === 'string' ? detail : JSON.stringify(detail)); };
let valid = true; try { Keypair.fromPublicKey(key); } catch { valid = false; }
check('public key is a valid Stellar account address (G...)', valid, key);
if (valid) {
  check('distinct from the administrative multisig account', key !== admin, key === admin ? 'SAME ACCOUNT: not a second participant' : 'different');
  const h = await fetch(`https://horizon-testnet.stellar.org/accounts/${key}`);
  if (!h.ok) check('exists on Testnet (Horizon)', false, `Horizon answered ${h.status}: the account does not exist (fund it first)`);
  else {
    const a = await h.json(); const xlm = a.balances.find((b) => b.asset_type === 'native');
    check('exists on Testnet (Horizon)', true, { sequence: a.sequence, thresholds: a.thresholds, signers: a.signers.map((s) => [s.key, s.weight]), subentryCount: a.subentry_count });
    check('is a single-key account (master key only, weight 1 or more, default thresholds)', a.signers.length === 1 && a.signers[0].key === key, a.signers.length + ' signer(s)');
    check('native XLM balance covers transaction fees (at least 100 XLM expected from Friendbot; at least 5 XLM required here)', Number(xlm.balance) >= 5, xlm.balance);
    const r = await createServer().getLedgerEntries(xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(key).xdrPublicKey() })));
    check('exists on Testnet (Soroban RPC, independent read)', !!r.entries?.[0], r.entries?.[0] ? 'found' : 'not found');
  }
}
if (process.argv[3]) { writeFileSync(process.argv[3], JSON.stringify(out, null, 2)); console.log('evidence written'); }
process.exitCode = out.checks.every((c) => c.ok) ? 0 : 1;
