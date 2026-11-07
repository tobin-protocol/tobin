// Settlement execution state machine and chain-outcome reconciliation. Pure. The "observed transactions" below are MOCKS written by hand to exercise the rules:
// they are NOT chain reads and prove nothing about Stellar behaviour. No wallet, signing, submission or network exists in this build.
import assert from 'node:assert/strict';
import test from 'node:test';
import { STATES, TERMINAL, TRANSITIONS, canTransition, isState, verifyChainOutcome } from '../lib/registry/settlement-state.ts';
import type { ExpectedSettlement, ObservedTransaction } from '../lib/registry/settlement-state.ts';

test('every required state exists, and no state is silently missing from the transition table', () => {
  for (const s of ['awaiting-signer', 'signing', 'signed', 'submission-pending', 'submitted', 'confirmed', 'failed', 'expired', 'unknown-outcome', 'reconciliation-required', 'reconciled']) assert.ok(isState(s), s);
  assert.deepEqual(Object.keys(TRANSITIONS).sort(), [...STATES].sort());
  assert.ok(!isState('settled'), 'there is no generic "settled" state');
  assert.ok(!isState('approved') && !isState('prepared'), 'batch approval is a batch status, not an execution state');
});

test('the happy path is legal and strictly ordered; shortcuts are not', () => {
  const path = ['awaiting-signer', 'signing', 'signed', 'submission-pending', 'submitted', 'confirmed', 'reconciled'] as const;
  for (let i = 0; i < path.length - 1; i++) assert.ok(canTransition(path[i]!, path[i + 1]!), `${path[i]} -> ${path[i + 1]}`);
  for (const [a, b] of [['awaiting-signer', 'signed'], ['awaiting-signer', 'submitted'], ['awaiting-signer', 'confirmed'], ['signing', 'submitted'], ['signed', 'submitted'], ['signed', 'confirmed'], ['submission-pending', 'confirmed'], ['submitted', 'reconciled'], ['awaiting-signer', 'reconciled']] as const) assert.ok(!canTransition(a, b), `${a} -> ${b} must be illegal`);
});

test('confirmed is not final: it must be reconciled (or flagged) before anything is complete', () => {
  assert.deepEqual([...TRANSITIONS.confirmed].sort(), ['reconciled', 'reconciliation-required']);
  assert.deepEqual([...TRANSITIONS['reconciliation-required']], ['reconciled']);
});

test('terminal states have no exits; nothing leaves failed or expired, so nothing is silently retried', () => {
  for (const t of TERMINAL) { assert.deepEqual([...TRANSITIONS[t]], [], t); for (const s of STATES) assert.ok(!canTransition(t, s), `${t} -> ${s}`); }
  for (const s of STATES) if (s !== 'failed') assert.ok(!canTransition('failed', s));
});

test('a rejected or abandoned signature returns to awaiting-signer and never to signed', () => {
  assert.ok(canTransition('signing', 'awaiting-signer')); assert.ok(!canTransition('awaiting-signer', 'signed'));
});

test('an unknown outcome is resolved only by learning the real result, never by resubmitting', () => {
  assert.deepEqual([...TRANSITIONS['unknown-outcome']].sort(), ['confirmed', 'expired', 'failed', 'unknown-outcome']);
  for (const bad of ['submission-pending', 'submitted', 'signed', 'signing', 'awaiting-signer'] as const) assert.ok(!canTransition('unknown-outcome', bad), `unknown-outcome -> ${bad}: a retry path would risk a duplicate payment`);
});

// ---- chain outcome (MOCK observations) ----
const A = 'GA', B = 'GB', C = 'GC', USD = 'testnet:USD:X';
const expected: ExpectedSettlement = { network: 'testnet', transfers: [{ from: A, to: B, asset: USD, amount: '20' }, { from: A, to: C, asset: USD, amount: '10' }] };
const obs = (over: Partial<ObservedTransaction> = {}): ObservedTransaction => ({ network: 'testnet', hash: 'h', status: 'SUCCESS', ledger: 1, transfers: [{ from: A, to: C, asset: USD, amount: '10' }, { from: A, to: B, asset: USD, amount: '20' }], ...over });

test('MOCK: an exact match, in any order, reconciles', () => { assert.deepEqual(verifyChainOutcome(expected, obs()), { state: 'reconciled', mismatches: [] }); });

test('MOCK: any deviation from the approved batch is reconciliation-required, never accepted', () => {
  const cases: [string, Partial<ObservedTransaction>][] = [
    ['wrong amount', { transfers: [{ from: A, to: B, asset: USD, amount: '21' }, { from: A, to: C, asset: USD, amount: '10' }] }],
    ['wrong asset', { transfers: [{ from: A, to: B, asset: 'testnet:EUR:X', amount: '20' }, { from: A, to: C, asset: USD, amount: '10' }] }],
    ['wrong destination', { transfers: [{ from: A, to: C, asset: USD, amount: '20' }, { from: A, to: C, asset: USD, amount: '10' }] }],
    ['wrong source', { transfers: [{ from: B, to: A, asset: USD, amount: '20' }, { from: A, to: C, asset: USD, amount: '10' }] }],
    ['missing transfer', { transfers: [{ from: A, to: B, asset: USD, amount: '20' }] }],
    ['extra transfer', { transfers: [...obs().transfers, { from: C, to: B, asset: USD, amount: '1' }] }],
    ['duplicate transfer', { transfers: [{ from: A, to: B, asset: USD, amount: '20' }, { from: A, to: B, asset: USD, amount: '20' }, { from: A, to: C, asset: USD, amount: '10' }] }],
    ['other network', { network: 'public' }],
    ['no transfers at all', { transfers: [] }],
  ];
  for (const [name, o] of cases) { const v = verifyChainOutcome(expected, obs(o)); assert.equal(v.state, 'reconciliation-required', name); assert.ok(v.mismatches.length > 0, name); }
});

test('MOCK: not found and unavailable are an UNKNOWN outcome, never a failure and never a confirmation', () => {
  for (const status of ['NOT_FOUND', 'UNAVAILABLE'] as const) { const v = verifyChainOutcome(expected, obs({ status, transfers: [] })); assert.equal(v.state, 'unknown-outcome', status); assert.match(v.mismatches[0]!, /unknown/); }
});

test('MOCK: pending stays pending and a failed transaction is failed even if it lists transfers', () => {
  assert.equal(verifyChainOutcome(expected, obs({ status: 'PENDING', transfers: [] })).state, 'pending');
  assert.equal(verifyChainOutcome(expected, obs({ status: 'FAILED' })).state, 'failed', 'a failed transaction is never reconciled');
});

test('MOCK: an empty settlement matches an empty result only', () => {
  assert.equal(verifyChainOutcome({ network: 'testnet', transfers: [] }, obs({ transfers: [] })).state, 'reconciled');
  assert.equal(verifyChainOutcome({ network: 'testnet', transfers: [] }, obs()).state, 'reconciliation-required');
});
