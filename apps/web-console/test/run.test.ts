// Stage 5 runner: pure logic only (no network). Real-chain behaviour is NOT covered here: it is the owner-run settlement itself.
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildRunPlan, stepsDone, MAX_UNITS } from '../lib/stellar/run.ts';
import type { ObservedChain } from '../lib/stellar/compare.ts';

const dep = JSON.parse(readFileSync(new URL('../../../contracts/deployments/testnet.json', import.meta.url), 'utf8'));
const cfg = { clearing: dep.contracts.tobin_clearing_v1.contractId as string, token: dep.contracts.tobin_test_token_governed.contractId as string, admin: 'GCZD5U7GKWMJHX52J2XF65ZULTBGXNMAATYDWMONXPTUD4WB57HMU5MJ', second: 'GAS7VMM764FIEP6Q5KDWXXC56QE7YGORME27MFKWPMP63QL3LX7QJL2M', batchId: 'bat_test' };
const empty: ObservedChain = { session: null, obligations: [], proposal: null, approvals: [], settlement: null };

test('the plan moves exactly one unit and has eight ordered steps', () => {
  const p = buildRunPlan(cfg);
  assert.equal(p.expectedTotalMoved, '1'); assert.ok(BigInt(p.expectedTotalMoved) <= MAX_UNITS);
  assert.deepEqual(p.steps.map((s) => s.fn), ['create_session', 'join_session', 'submit_obligation', 'finalize_obligations', 'propose_settlement', 'approve_settlement', 'approve_settlement', 'settle']);
  assert.equal(p.steps[0]!.signers[0], cfg.second);
  assert.equal(p.steps[1]!.signers[0], cfg.admin); // the administrative account is the transaction source: authorized through the envelope only
});
test('steps are reported done only from observed chain state', () => {
  const p = buildRunPlan(cfg);
  assert.deepEqual(stepsDone(p, empty), Array(8).fill(false));
  const created: ObservedChain = { ...empty, session: { creator: cfg.second, token: cfg.token, maxParticipants: 2, maxObligations: 1, state: 'Open', participants: [cfg.second], obligationCommitment: null } };
  assert.deepEqual(stepsDone(p, created), [true, ...Array(7).fill(false)]);
  const joined: ObservedChain = { ...created, session: { ...created.session!, participants: [cfg.second, cfg.admin] } };
  assert.deepEqual(stepsDone(p, joined).slice(0, 3), [true, true, false]);
});
test('an approval counts only for the expected digest', () => {
  const p = buildRunPlan(cfg);
  const base: ObservedChain = { ...empty, session: { creator: cfg.second, token: cfg.token, maxParticipants: 2, maxObligations: 1, state: 'Committed', participants: [cfg.second, cfg.admin], obligationCommitment: p.expectedCommitment }, obligations: [{ id: '0a'.repeat(32), debtor: cfg.admin, creditor: cfg.second, amount: '1' }], proposal: { digest: p.expectedDigest, instructions: [], proposer: cfg.second, revision: 1 } };
  const wrong = { ...base, approvals: [{ participant: cfg.second, digest: 'ff'.repeat(32) }] };
  assert.equal(stepsDone(p, wrong)[5], false);
  const right = { ...base, approvals: [{ participant: cfg.second, digest: p.expectedDigest }] };
  assert.equal(stepsDone(p, right)[5], true); assert.equal(stepsDone(p, right)[6], false);
});
