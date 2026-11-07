// Pure clearing rules: amounts, assets, engine mapping, conservation, determinism, staleness, readiness, transitions. No database, no HTTP.
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalInput, currencyOf, inputHash, parseAsset, parseObligationAmount, partyHandle, readinessChecks, runNetting, TRANSITIONS } from '../lib/registry/clearing.ts';
import type { CalculationRecord, ObligationRecord, SessionParticipant } from '../lib/registry/types.ts';

const S = 'cd'.repeat(32);
const part = (userId: string, status: 'active' | 'removed' = 'active'): SessionParticipant => ({ sessionId: S, orgId: 'org_1', userId, addedBy: 'x', addedAt: 't', status });
const ob = (n: number, debtor: string, creditor: string, amount: string, over: Partial<ObligationRecord> = {}): ObligationRecord => ({
  id: String(n).padStart(2, '0').repeat(32), sessionId: S, orgId: 'org_1', debtor, creditor, amount, asset: 'USD', reference: '', status: 'active', revision: 1, createdAt: 't', createdBy: 'x', updatedAt: 't', updatedBy: 'x', ...over });
const A = 'usr_a', B = 'usr_b', C = 'usr_c';
// Independently computed expected result: A owes B 100, B owes C 80, C owes A 70 => A +30 (debtor), B -20 (creditor), C -10 (creditor); gross 250.
const RING = [ob(1, A, B, '100'), ob(2, B, C, '80'), ob(3, C, A, '70')];

test('amounts: only positive whole base units written as digits are accepted; nothing is rounded', () => {
  assert.equal(parseObligationAmount('1'), '1');
  assert.equal(parseObligationAmount('170141183460469231731687303715884105727'), '170141183460469231731687303715884105727');
  for (const bad of ['0', '-1', '+1', '1.5', '1.0', '1e3', ' 1', '1 ', '01', '', 'abc', '١٢٣', '170141183460469231731687303715884105728', '1'.repeat(40)]) assert.throws(() => parseObligationAmount(bad), { code: 'INVALID' }, JSON.stringify(bad));
  for (const bad of [10, 1.5, null, undefined, {}, [], 10n]) assert.throws(() => parseObligationAmount(bad), { code: 'INVALID' }, String(typeof bad));
});

test('assets: upper-case codes of 1 to 12 letters or digits only', () => {
  assert.equal(parseAsset('USD'), 'USD'); assert.equal(parseAsset('TESTTOKEN12'), 'TESTTOKEN12');
  for (const bad of ['usd', '', 'US D', 'TOOLONGASSET1', 'US-D', 'US<D>', 5, null]) assert.throws(() => parseAsset(bad), { code: 'INVALID' });
});

test('netting uses the existing engine: expected nets, conservation, gross', () => {
  const input = canonicalInput([A, B, C], RING);
  const r = runNetting(S, input);
  assert.deepEqual(r.positions, [{ userId: A, net: '30' }, { userId: B, net: '-20' }, { userId: C, net: '-10' }]);
  assert.equal(r.gross, '250');
  assert.equal(r.positions.reduce((t, p) => t + BigInt(p.net), 0n), 0n, 'value is conserved');
});

test('netting is deterministic and independent of input order', () => {
  const a = runNetting(S, canonicalInput([A, B, C], RING));
  const b = runNetting(S, canonicalInput([C, A, B], [...RING].reverse()));
  assert.deepEqual(a, b);
  assert.equal(inputHash('USD', canonicalInput([A, B, C], RING)), inputHash('USD', canonicalInput([C, B, A], [...RING].reverse())));
});

test('large amounts are exact (no floating point)', () => {
  const big = '99999999999999999999999999999';
  const r = runNetting(S, canonicalInput([A, B], [ob(1, A, B, big), ob(2, B, A, '1')]));
  assert.deepEqual(r.positions, [{ userId: A, net: '99999999999999999999999999998' }, { userId: B, net: '-99999999999999999999999999998' }]);
});

test('netting refuses an obligation that names someone outside the calculation, and overflow', () => {
  assert.throws(() => runNetting(S, canonicalInput([A, B], [ob(1, A, C, '5')])), { code: 'INVALID' });
  const max = '170141183460469231731687303715884105727';
  assert.throws(() => runNetting(S, canonicalInput([A, B, C], [ob(1, A, B, max), ob(2, A, C, '1')])), { code: 'INVALID' });
});

test('party handles are deterministic per session and user, and differ between sessions', () => {
  assert.equal(partyHandle(S, A), partyHandle(S, A));
  assert.notEqual(partyHandle(S, A), partyHandle(S, B));
  assert.notEqual(partyHandle(S, A), partyHandle('ef'.repeat(32), A));
  assert.match(partyHandle(S, A), /^G[A-Z2-7]{55}$/);
});

test('voided obligations do not enter the input; any change to input changes the hash', () => {
  const base = inputHash('USD', canonicalInput([A, B, C], RING));
  assert.equal(inputHash('USD', canonicalInput([A, B, C], [...RING, ob(4, A, C, '9', { status: 'voided' })])), base, 'a voided obligation is not input');
  assert.notEqual(inputHash('USD', canonicalInput([A, B, C], [ob(1, A, B, '101'), RING[1]!, RING[2]!])), base, 'amount');
  assert.notEqual(inputHash('USD', canonicalInput([A, B, C], [ob(1, A, B, '100', { revision: 2 }), RING[1]!, RING[2]!])), base, 'revision');
  assert.notEqual(inputHash('USD', canonicalInput([A, B], RING.slice(0, 1))), base, 'participants/obligations');
  assert.notEqual(inputHash('EUR', canonicalInput([A, B, C], RING)), base, 'asset');
});

test('staleness: a snapshot is current only while the input is unchanged', () => {
  const input = canonicalInput([A, B, C], RING);
  const r = runNetting(S, input);
  const calc: CalculationRecord = { id: 'calc_1', sessionId: S, orgId: 'org_1', asset: 'USD', inputHash: inputHash('USD', input), input, positions: r.positions, gross: r.gross, createdAt: 't', createdBy: 'x' };
  assert.equal(currencyOf(undefined, 'USD', input), 'none');
  assert.equal(currencyOf(calc, 'USD', input), 'current');
  assert.equal(currencyOf(calc, 'USD', canonicalInput([A, B, C], [ob(1, A, B, '101'), RING[1]!, RING[2]!])), 'stale');
  assert.equal(currencyOf(calc, 'USD', canonicalInput([A, B, C, 'usr_d'], RING)), 'stale', 'a participant change is also a change');
});

function calcFor(participants: string[], obs: ObligationRecord[]): CalculationRecord {
  const input = canonicalInput(participants, obs); const r = runNetting(S, input);
  return { id: 'calc_1', sessionId: S, orgId: 'org_1', asset: 'USD', inputHash: inputHash('USD', input), input, positions: r.positions, gross: r.gross, createdAt: 't', createdBy: 'x' };
}
const failing = (r: ReturnType<typeof readinessChecks>) => r.checks.filter((c) => !c.ok).map((c) => c.key);

test('readiness: ready only with participants, obligations, one asset, and a current balanced calculation', () => {
  const ps = [part(A), part(B), part(C)];
  assert.deepEqual(failing(readinessChecks({ workflow: 'configuring', participants: [], obligations: [], latest: undefined })), ['participants', 'obligations', 'calculation', 'current']);
  assert.deepEqual(failing(readinessChecks({ workflow: 'configuring', participants: ps, obligations: RING, latest: undefined })), ['calculation', 'current']);
  const ok = readinessChecks({ workflow: 'configuring', participants: ps, obligations: RING, latest: calcFor([A, B, C], RING) });
  assert.equal(ok.ready, true); assert.equal(ok.currency, 'current'); assert.equal(ok.asset, 'USD');
  // a change after the calculation makes it stale and not ready
  const changed = [ob(1, A, B, '150'), RING[1]!, RING[2]!];
  const stale = readinessChecks({ workflow: 'configuring', participants: ps, obligations: changed, latest: calcFor([A, B, C], RING) });
  assert.equal(stale.ready, false); assert.deepEqual(failing(stale), ['current']); assert.equal(stale.currency, 'stale');
});

test('readiness: mixed assets, removed participants and the session state block readiness with a fix hint', () => {
  const ps = [part(A), part(B), part(C)];
  const mixed = readinessChecks({ workflow: 'configuring', participants: ps, obligations: [ob(1, A, B, '5'), ob(2, B, C, '5', { asset: 'EUR' })], latest: undefined });
  assert.ok(failing(mixed).includes('asset')); assert.equal(mixed.asset, null);
  const dangling = readinessChecks({ workflow: 'configuring', participants: [part(A), part(B), part(C, 'removed')], obligations: RING, latest: undefined });
  assert.ok(failing(dangling).includes('references'));
  assert.ok(readinessChecks({ workflow: 'ready', participants: ps, obligations: RING, latest: calcFor([A, B, C], RING) }).checks.find((c) => c.key === 'state')?.ok === false);
  for (const c of mixed.checks) assert.ok(c.fix.length > 0 && c.label.length > 0);
});

test('workflow transitions are explicit', () => {
  assert.deepEqual(TRANSITIONS.configuring, ['ready']);
  assert.deepEqual(TRANSITIONS.ready, ['configuring', 'closed']);
  assert.deepEqual(TRANSITIONS.closed, []);
});
