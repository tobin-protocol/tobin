// npm run multisig:prepare -- --account <G...>
// OFFLINE. Builds and prints the ordered setup plan for the dedicated administrative account from the manifest. It makes no network call, reads no
// secret, signs nothing and submits nothing: preparation and execution are separate. Executing a step needs the founder's explicit authorization.
// The account public key comes from a bootstrap key that the founder generates outside the repository (only the public key is ever shared).
import { arg, buildPlan, LEGACY_DEPLOYER, MANIFEST, PASSPHRASE, readJson } from './lib.mjs';

const account = arg('--account');
if (!account) { console.error('usage: multisig:prepare -- --account <administrative account public key>'); process.exit(2); }
const m = readJson(MANIFEST);
const signers = Object.fromEntries(m.signers.map((s) => [s.role, s.publicKey]));
const { problems, steps } = buildPlan({ account, signers });
if (problems.length) {
  console.error('cannot prepare a plan:\n' + problems.map((p) => `- ${p}`).join('\n'));
  process.exit(1);
}
console.log(`Network: Stellar Testnet (${PASSPHRASE}). Nothing below has been executed.`);
console.log(`Untouched by this plan: the legacy deployer ${LEGACY_DEPLOYER}, both existing contracts and the token's minter.\n`);
for (const s of steps) {
  console.log(`Step ${s.id}: ${s.title}`);
  console.log(`  signed by: ${s.signedBy}`);
  console.log(`  effect: ${s.effect}`);
  if (s.operations) for (const op of s.operations) console.log('  op: ' + JSON.stringify(op));
  console.log(`  needs explicit authorization: ${s.requiresApproval ? 'YES' : 'no'}\n`);
}
console.log('Funding the account (Testnet friendbot) is a separate action that also needs authorization. Failure handling: if step 1 fails, read the account');
console.log('with multisig:inspect before doing anything; step 1 is a single transaction, so it applied completely or not at all.');
