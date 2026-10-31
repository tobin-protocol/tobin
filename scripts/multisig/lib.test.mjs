// Offline tests for the multisig planning and verification helpers. No network, no secrets. Run with: node --test scripts/multisig/lib.test.mjs
// The keys are public Stellar Testnet addresses (valid checksums); none is a secret.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlan, compareAccount, LEGACY_DEPLOYER, onChainSignerWeights } from './lib.mjs';

const ADMIN = 'GB4WIKKCYDDQUKLTKBMMMCPLZJVXZWL36CJEGWXMKEYV7NNLS2MDE7G5';
const SIGNERS = {
  founder: 'GB4NFBRAPQQH7GP24WXR7RKD2SHJWZXTBZH6CTJTEXZWUHTULDUME6OL',
  technical: 'GC7YMNS3FEYD4GZ4RMLOX3QOSCWOURVLCFUPY5PDOJPBJTSS22HL23KC',
  security: 'GATMFOGT2C25JK3AU635RKUXBFQ7JTBF3JXEFNZTONYM3VC4SPHX25AP',
};

const horizon = (over = {}) => ({
  account_id: ADMIN,
  thresholds: { low_threshold: 5, med_threshold: 6, high_threshold: 7 },
  signers: [
    { key: SIGNERS.founder, weight: 5, type: 'ed25519_public_key' },
    { key: SIGNERS.technical, weight: 2, type: 'ed25519_public_key' },
    { key: SIGNERS.security, weight: 1, type: 'ed25519_public_key' },
    { key: ADMIN, weight: 1, type: 'ed25519_public_key' },
  ],
  ...over,
});

test('the plan is one atomic setup transaction, then verification, then a separate master-key step', () => {
  const { problems, steps } = buildPlan({ account: ADMIN, signers: SIGNERS });
  assert.deepEqual(problems, []);
  assert.deepEqual(steps.map((s) => s.id), [1, 2, 3]);
  const [setup, verify, master] = steps;
  assert.equal(setup.operations.length, 4); // three signers and the thresholds, together
  assert.deepEqual(setup.operations.slice(0, 3).map((o) => [o.role, o.weight]), [['founder', 5], ['technical', 2], ['security', 1]]);
  assert.deepEqual(setup.operations[3], { type: 'setOptions', lowThreshold: 5, medThreshold: 6, highThreshold: 7 });
  assert.equal(setup.requiresApproval, true);
  assert.equal(verify.requiresApproval, false);
  assert.deepEqual(master.operations, [{ type: 'setOptions', masterWeight: 0 }]);
  assert.match(master.signedBy, /Founder \+ Technical/);
  assert.equal(master.requiresApproval, true);
});

test('the plan is refused for bad inputs', () => {
  const bad = (over, account = ADMIN) => buildPlan({ account, signers: { ...SIGNERS, ...over } }).problems.length > 0;
  assert.equal(bad({ technical: undefined }), true); // missing
  assert.equal(bad({ technical: 'GAE67UNGUDUCBUEHOJKU2OXVFQ7JTBF3JXEFNZTONYM3VC4SPHX25AP' }), true); // 55 characters
  assert.equal(bad({ technical: SIGNERS.founder }), true); // duplicate
  assert.equal(bad({ security: LEGACY_DEPLOYER }), true); // legacy deployer as a signer
  assert.equal(bad({}, LEGACY_DEPLOYER), true); // legacy deployer as the account
  assert.equal(bad({ security: ADMIN }), true); // the account as its own signer
  assert.equal(buildPlan({ account: ADMIN, signers: SIGNERS }).steps.length, 3);
  assert.equal(buildPlan({ account: ADMIN, signers: { ...SIGNERS, security: undefined } }).steps.length, 0);
});

test('verification passes only for the exact intended configuration', () => {
  assert.ok(compareAccount(horizon(), SIGNERS).every((r) => r.ok));
  const wrongWeight = horizon();
  wrongWeight.signers[1].weight = 3;
  assert.ok(compareAccount(wrongWeight, SIGNERS).some((r) => !r.ok && r.check === 'technical weight'));
  const wrongThreshold = horizon({ thresholds: { low_threshold: 5, med_threshold: 6, high_threshold: 6 } });
  assert.ok(compareAccount(wrongThreshold, SIGNERS).some((r) => !r.ok && r.check === 'high threshold'));
  const extra = horizon();
  extra.signers.push({ key: LEGACY_DEPLOYER, weight: 1, type: 'ed25519_public_key' });
  assert.ok(compareAccount(extra, SIGNERS).some((r) => !r.ok && r.check === 'no unexpected signers'));
  const missing = horizon();
  missing.signers.splice(2, 1);
  assert.ok(compareAccount(missing, SIGNERS).some((r) => !r.ok && r.check === 'security weight'));
});

test('the master key is only reported as disabled when its weight is 0', () => {
  assert.ok(compareAccount(horizon(), SIGNERS, undefined, { masterDisabled: true }).some((r) => !r.ok && r.check === 'master key'));
  const off = horizon();
  off.signers[3].weight = 0;
  assert.ok(compareAccount(off, SIGNERS, undefined, { masterDisabled: true }).every((r) => r.ok));
  assert.deepEqual(onChainSignerWeights(off)[ADMIN], 0);
});
