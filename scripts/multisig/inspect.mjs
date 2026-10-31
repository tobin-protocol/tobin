// npm run multisig:inspect -- <G...>
// Read-only: prints an account's signers, thresholds, flags and native balance from Testnet. Submits nothing.
import { lookup } from './lib.mjs';

const id = process.argv.slice(2).find((a) => !a.startsWith('-'));
if (!id) { console.error('usage: multisig:inspect -- <account public key>'); process.exit(2); }
const r = await lookup(id);
if (r.state === 'not-found') { console.log(`${id}: no account on Testnet (not activated)`); process.exit(0); }
if (r.state !== 'exists') { console.error(`${id}: ${r.detail}`); process.exit(1); }
const a = r.account;
console.log(JSON.stringify({
  account: a.account_id,
  sequence: a.sequence,
  thresholds: { low: a.thresholds.low_threshold, medium: a.thresholds.med_threshold, high: a.thresholds.high_threshold },
  signers: a.signers.map((s) => ({ key: s.key, weight: s.weight, type: s.type })),
  flags: a.flags,
  homeDomain: a.home_domain ?? null,
  nativeBalance: a.balances.find((b) => b.asset_type === 'native')?.balance,
}, null, 2));
