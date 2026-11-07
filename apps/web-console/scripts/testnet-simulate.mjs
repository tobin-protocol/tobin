// READ-ONLY Testnet evidence for the adapter (MVP-1.5): builds an ExecutionPlan from REAL public identifiers, constructs the UNSIGNED transaction for each step with the
// official SDK, SIMULATES it against the real Testnet RPC, and reads recorded transactions back by hash. It submits NOTHING, signs NOTHING and uses NO key.
// Simulation of a step whose earlier steps are not on chain fails by design (for example join_session before create_session): that is expected and recorded.
//   node scripts/testnet-simulate.mjs [outfile.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildExecutionPlan } from '../lib/stellar/execution-plan.ts';
import { buildAndSimulate, createServer, readObservedChain, readTransaction, tokenBalance, TESTNET } from '../lib/stellar/rpc.ts';
import { compareWithPlan } from '../lib/stellar/compare.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const dep = JSON.parse(readFileSync(root + 'contracts/deployments/testnet.json', 'utf8'));
const admin = JSON.parse(readFileSync(root + 'accounts/testnet-admin.json', 'utf8'));
if (dep.networkPassphrase !== TESTNET.passphrase) throw new Error('not Testnet');
const server = createServer(dep.rpc);
const out = { at: new Date().toISOString(), note: 'read-only: simulations and reads only; nothing was signed or submitted', steps: [], reads: [] };
const log = (k, v) => console.log(k, JSON.stringify(v));

const CLEARING = dep.contracts.tobin_clearing_v1.contractId, TOKEN = dep.contracts.tobin_test_token_governed.contractId;
const ADMIN = admin.accountId;                         // holds the only 1 unit of the governed token
const RECORDED_CREATOR = 'GB4WIKKCYDDQUKLTKBMMMCPLZJVXZWL36CJEGWXMKEYV7NNLS2MDE7G5';
const OTHER = process.env.TOBIN_SECOND_ACCOUNT || RECORDED_CREATOR;// public id of the creator of the existing on-chain session, as read from get_session in the preflight (its key is not available to this work)
// can the second participant account be read at all?
let otherExists = true; try { await server.getAccount(OTHER); } catch { otherExists = false; }
log('second public account exists on chain', { account: OTHER, exists: otherExists });
out.secondAccountExists = otherExists;

// the smallest real economic settlement the existing supply allows: ADMIN owes OTHER 1 base unit (the governed token has total supply 1, held by ADMIN)
const plan = buildExecutionPlan({
  network: 'testnet', clearing: CLEARING, assetId: `testnet:contract:${TOKEN}`, batchId: process.env.TOBIN_BATCH_ID || 'bat_simulation_only', initiator: 'usr_other',
  accounts: { usr_other: OTHER, usr_admin: ADMIN },
  positions: [{ userId: 'usr_admin', net: '1' }, { userId: 'usr_other', net: '-1' }],
  obligations: [{ id: '0a'.repeat(32), debtor: 'usr_admin', creditor: 'usr_other', amount: '1' }],
  instructions: [{ payer: 'usr_admin', payee: 'usr_other', amount: '1' }],
});
out.plan = { sessionId: plan.sessionId, fingerprint: plan.fingerprint, steps: plan.steps.map((s) => ({ index: s.index, fn: s.fn, signers: s.signers })), requiredSigners: plan.requiredSigners, expectedDigest: plan.expectedDigest };
log('plan', out.plan);

for (const step of plan.steps) {
  // the account that would pay for the transaction: the first signer of the step (read from the network for its real sequence number)
  const source = step.signers[0];
  let r;
  try { r = await buildAndSimulate(server, step.call, source); } catch (e) { r = { simulation: { ok: false, error: 'could not build: ' + String(e.message ?? e), authEntries: [] }, source }; }
  const rec = { index: step.index, fn: step.fn, source, simulationOk: r.simulation.ok, error: r.simulation.error ?? null, minResourceFee: r.simulation.minResourceFee ?? null, authCredentialTypes: r.simulation.authEntries.map((a) => a.credentials), authAddresses: r.simulation.authEntries.map((a) => a.address ?? null) };
  out.steps.push(rec); log(`step ${step.index} ${step.fn}`, rec);
}

// CREDENTIAL PROBE (read-only): simulate a VALID join against the real recorded Open session. The joiner (the administrative account) is the transaction source, the session
// creator is a different account, so the network must return one source-account credential and one address credential. Protocol 30 returns AddressV2 for the latter.
import { prepareJoin } from 'tobin-mvp1-sdk/sdk';
{
  const call = prepareJoin(CLEARING, { sessionId: dep.functionalChecks.sessionId, participant: ADMIN, creator: RECORDED_CREATOR });
  const r = await buildAndSimulate(server, call, ADMIN);
  const rec = { what: 'join_session into the recorded Open session, source = joiner', simulationOk: r.simulation.ok, error: r.simulation.error ?? null, minResourceFee: r.simulation.minResourceFee ?? null, authCredentialTypes: r.simulation.authEntries.map((a) => a.credentials), authAddresses: r.simulation.authEntries.map((a) => a.address ?? null), unsignedXdrLength: r.xdr.length };
  out.credentialProbe = rec; log('credential probe', rec);
}

// independent reads: the on-chain session for this plan does not exist (nothing was submitted): the comparison must say not-started
const observed = await readObservedChain(server, plan, ADMIN);
const cmp = compareWithPlan(plan, observed); out.compareNotStarted = cmp; log('on-chain comparison before anything is submitted', cmp);
out.reads.push({ what: 'governed token balance of the administrative account (base units)', value: await tokenBalance(server, TOKEN, ADMIN, ADMIN) });
log('reads', out.reads);

// recorded transactions, read back independently by hash
for (const [label, hash] of [['recorded create-session transaction', dep.functionalChecks.createSessionTx], ['recorded governed-token mint transaction (Founder + Security)', dep.contracts.tobin_test_token_governed.authorizationTests.A.tx], ['a hash that was never submitted (expected NOT_FOUND = unknown)', 'ab'.repeat(32)]]) {
  const t = await readTransaction(server, hash); out.reads.push({ what: label, ...t }); log(label, t);
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
