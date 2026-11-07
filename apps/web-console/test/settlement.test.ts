// Pure settlement-preparation rules (MVP-1.4): asset resolution, deterministic instruction generation, exact reconciliation, conservation, integrity checks, derived
// batch status. No database, no HTTP. Instructions are PREPARATION only: nothing here signs, submits or settles.
import assert from 'node:assert/strict';
import test from 'node:test';
import { assetCanonicalId, batchStatus, buildInstructions, instructionId, instructionsHash, integrityChecks, resolveAsset } from '../lib/registry/settlement.ts';
import { canonicalInput, inputHash, runNetting } from '../lib/registry/clearing.ts';
import type { CalculationRecord, ObligationRecord, SettlementBatch, SupportedAsset } from '../lib/registry/types.ts';

const S = 'cd'.repeat(32);
const ISS1 = 'G' + 'A'.repeat(55), ISS2 = 'G' + 'B'.repeat(55); // test fixtures only, not real issuers
const asset = (code: string, over: Partial<SupportedAsset> = {}): SupportedAsset => {
  const a = { network: 'testnet', kind: 'issued', code, issuer: ISS1, status: 'supported', source: 'operator-configured', addedAt: 't', ...over } as SupportedAsset;
  return { ...a, id: assetCanonicalId(a.network, a.kind, a.code, a.issuer) };
};
const ob = (n: number, debtor: string, creditor: string, amount: string): ObligationRecord => ({ id: String(n).padStart(2, '0').repeat(32), sessionId: S, orgId: 'o', debtor, creditor, amount, asset: 'USD', reference: '', status: 'active', revision: 1, createdAt: 't', createdBy: 'x', updatedAt: 't', updatedBy: 'x' });
function calcOf(participants: string[], obs: ObligationRecord[], id = 'calc_1'): CalculationRecord {
  const input = canonicalInput(participants, obs); const r = runNetting(S, input);
  return { id, sessionId: S, orgId: 'o', asset: 'USD', inputHash: inputHash('USD', input), input, positions: r.positions, gross: r.gross, createdAt: 't', createdBy: 'u' };
}
/** A calculation built directly from positions (they must sum to zero); the input is irrelevant to the allocation. */
function calcFromNets(nets: Record<string, bigint>, id = 'calc_n'): CalculationRecord {
  const users = Object.keys(nets).sort();
  return { id, sessionId: S, orgId: 'o', asset: 'USD', inputHash: 'h'.repeat(64), input: { participants: users, obligations: [] }, positions: users.map((u) => ({ userId: u, net: (nets[u] as bigint).toString() })), gross: '0', createdAt: 't', createdBy: 'u' };
}
const A = 'usr_a', B = 'usr_b', C = 'usr_c';
const RING = [ob(1, A, B, '100'), ob(2, B, C, '80'), ob(3, C, A, '70')];
const allOk = (c: { ok: boolean }[]) => c.every((x) => x.ok);

test('asset canonical identity is network plus code plus issuer; native has its own form', () => {
  assert.equal(assetCanonicalId('testnet', 'native', 'XLM'), 'testnet:native');
  assert.equal(assetCanonicalId('public', 'issued', 'USD', ISS1), `public:USD:${ISS1}`);
  assert.notEqual(assetCanonicalId('testnet', 'issued', 'USD', ISS1), assetCanonicalId('testnet', 'issued', 'USD', ISS2), 'the same code from another issuer is another asset');
  assert.notEqual(assetCanonicalId('testnet', 'issued', 'USD', ISS1), assetCanonicalId('public', 'issued', 'USD', ISS1), 'the same asset on another network is another asset');
});

test('asset resolution: only exactly one supported entry resolves; unsupported, disabled and ambiguous are refused with a reason', () => {
  const usd = asset('USD');
  const r = resolveAsset('USD', [usd, asset('EUR')]); assert.ok(r.ok && r.asset.id === usd.id);
  const none = resolveAsset('GBP', [usd]); assert.ok(!none.ok && none.reason === 'unsupported');
  const dis = resolveAsset('USD', [asset('USD', { status: 'disabled' })]); assert.ok(!dis.ok && dis.reason === 'disabled');
  const amb = resolveAsset('USD', [usd, asset('USD', { issuer: ISS2 })]); assert.ok(!amb.ok && amb.reason === 'ambiguous'); assert.match(amb.detail, /cannot be identified/);
  const ambNet = resolveAsset('USD', [usd, asset('USD', { network: 'public' })]); assert.ok(!ambNet.ok && ambNet.reason === 'ambiguous');
  const oneDisabled = resolveAsset('USD', [usd, asset('USD', { issuer: ISS2, status: 'disabled' })]); assert.ok(oneDisabled.ok, 'a disabled duplicate does not make a supported entry ambiguous');
  const nat = resolveAsset('XLM', [asset('XLM', { kind: 'native', issuer: undefined })]); assert.ok(nat.ok && nat.asset.id === 'testnet:native');
  assert.ok(!resolveAsset('usd', [usd]).ok, 'matching is exact');
});

test('instructions reconcile to hand-computed nets: ring 100/80/70 gives A +30, B -20, C -10 and A pays B 20 and C 10', () => {
  const calc = calcOf([A, B, C], RING);
  assert.deepEqual(calc.positions, [{ userId: A, net: '30' }, { userId: B, net: '-20' }, { userId: C, net: '-10' }]);
  const { instructions, engine } = buildInstructions(S, calc);
  assert.deepEqual(instructions.map((i) => [i.payer, i.payee, i.amount]).sort(), [[A, B, '20'], [A, C, '10']]);
  assert.deepEqual(instructions.map((i) => i.seq), [1, 2]);
  assert.ok(engine.ok, 'the existing engine accepts the plan against the snapshot obligations');
  assert.ok(allOk(integrityChecks(calc, 'testnet:USD:x', instructions)));
});

test('generation is deterministic and independent of the order of positions', () => {
  const nets = { usr_1: 500n, usr_2: 300n, usr_3: -400n, usr_4: -250n, usr_5: -150n };
  const a = buildInstructions(S, calcFromNets(nets)).instructions;
  const c2 = calcFromNets(nets); c2.positions.reverse();
  const b = buildInstructions(S, c2).instructions;
  assert.deepEqual(a, b);
  assert.deepEqual(buildInstructions(S, calcFromNets(nets)).instructions, a, 'a repeat gives the same result');
  const h = instructionsHash('calc_n', 'testnet:USD:x', a);
  assert.equal(h, instructionsHash('calc_n', 'testnet:USD:x', b)); assert.notEqual(h, instructionsHash('calc_other', 'testnet:USD:x', a), 'the fingerprint is bound to the calculation');
  assert.notEqual(h, instructionsHash('calc_n', 'testnet:EUR:x', a), 'and to the asset');
  assert.equal(instructionId('calc_n', a[0]!), instructionId('calc_n', a[0]!), 'stable identifiers'); assert.notEqual(instructionId('calc_n', a[0]!), instructionId('calc_n', a[1]!));
});

test('exact base-unit arithmetic: huge amounts reconcile without rounding', () => {
  const big = 99999999999999999999999999999n;
  const calc = calcFromNets({ usr_1: big, usr_2: -(big - 1n), usr_3: -1n });
  const { instructions } = buildInstructions(S, calc);
  assert.equal(instructions.reduce((t, i) => t + BigInt(i.amount), 0n), big);
  assert.ok(allOk(integrityChecks(calc, 'x', instructions)));
});

test('conservation and reconciliation hold for many generated position sets (seeded, 300 cases)', () => {
  let seed = 12345; const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let k = 0; k < 300; k++) {
    const n = 2 + rnd(7); const nets: Record<string, bigint> = {}; let sum = 0n;
    for (let i = 0; i < n - 1; i++) { const v = BigInt(rnd(2000)) - 1000n; nets[`usr_${i}`] = v; sum += v; }
    nets[`usr_${n - 1}`] = -sum;
    const calc = calcFromNets(nets);
    const { instructions } = buildInstructions(S, calc);
    const checks = integrityChecks(calc, 'x', instructions);
    assert.ok(allOk(checks), JSON.stringify({ nets: calc.positions, instructions, bad: checks.filter((c) => !c.ok) }));
    assert.ok(instructions.every((i) => BigInt(i.amount) > 0n), 'no zero or negative instruction');
    const debit = Object.values(nets).filter((v) => v > 0n).reduce((t, v) => t + v, 0n);
    assert.equal(instructions.reduce((t, i) => t + BigInt(i.amount), 0n), debit, 'total moved equals total net debit');
    const nonzero = Object.values(nets).filter((v) => v !== 0n).length;
    assert.ok(instructions.length <= Math.max(0, nonzero - 1), 'at most debtors + creditors - 1 instructions');
  }
});

test('zero-net and empty calculations produce no instructions, and that still reconciles', () => {
  const zero = calcOf([A, B, C], [ob(1, A, B, '10'), ob(2, B, C, '10'), ob(3, C, A, '10')]);
  assert.ok(zero.positions.every((p) => p.net === '0'));
  const z = buildInstructions(S, zero); assert.deepEqual(z.instructions, []); assert.ok(z.engine.ok);
  assert.ok(allOk(integrityChecks(zero, 'x', [])));
  const empty = calcFromNets({}); assert.deepEqual(buildInstructions(S, empty).instructions, []);
});

test('a plan larger than the engine ceiling (16) is refused by the engine verdict', () => {
  // 9 debtors owing 10 each (boundaries 10, 20, ... 90) and 9 creditors owed 11 x 8 and 2 (boundaries 11, 22, ... 88, 90): no boundary coincides, so the merge needs 9 + 9 - 1 = 17 instructions
  const nets: Record<string, bigint> = {};
  for (let i = 0; i < 9; i++) nets['usr_d' + i] = 10n;
  for (let i = 0; i < 8; i++) nets['usr_c' + i] = -11n;
  nets['usr_c8'] = -2n;
  const { instructions, engine } = buildInstructions(S, calcFromNets(nets));
  assert.equal(instructions.length, 17);
  assert.equal(engine.ok, false);
  assert.ok(!engine.ok && engine.error === 'TooManyInstructions');
});

test('integrity checks catch every kind of tampering', () => {
  const calc = calcOf([A, B, C], RING);
  const good = buildInstructions(S, calc).instructions;
  const hash = instructionsHash(calc.id, 'X', good);
  assert.ok(allOk(integrityChecks(calc, 'X', good, hash)));
  const bad = (list: Parameters<typeof integrityChecks>[2], key: string, h?: string) => { const c = integrityChecks(calc, 'X', list, h ?? hash).find((x) => x.key === key)!; assert.equal(c.ok, false, key); };
  bad(good.map((i, k) => (k === 0 ? { ...i, amount: '0' } : i)), 'amounts');
  bad(good.map((i, k) => (k === 0 ? { ...i, amount: '-5' } : i)), 'amounts');
  bad(good.map((i, k) => (k === 0 ? { ...i, amount: '1.5' } : i)), 'amounts');
  bad(good.map((i, k) => (k === 0 ? { ...i, payee: i.payer } : i)), 'parties');
  bad(good.map((i, k) => (k === 0 ? { ...i, payee: 'usr_stranger' } : i)), 'parties');
  bad([...good, { ...good[0]!, seq: 3 }], 'unique');
  bad(good.map((i, k) => (k === 1 ? { ...i, seq: 5 } : i)), 'unique');
  bad(good.map((i, k) => (k === 0 ? { ...i, assetId: 'other' } : i)), 'asset');
  bad(good.map((i, k) => (k === 0 ? { ...i, amount: '21' } : i)), 'reconciliation');
  bad(good.slice(0, 1), 'reconciliation');
  bad([...good, { seq: 3, payer: B, payee: A, amount: '1' }], 'reconciliation');
  bad(good.map((i, k) => (k === 0 ? { ...i, amount: '19' } : i)), 'hash');
  bad(good, 'hash', 'f'.repeat(64));
});

test('batch status is derived: a batch is only as good as its calculation and approval', () => {
  const calc = calcOf([A, B, C], RING, 'calc_1');
  const batch = { id: 'bat_1', calculationId: 'calc_1' } as SettlementBatch;
  const base = { batch, review: undefined, inv: undefined, latest: calc, currency: 'current' as const, approvalActive: true };
  assert.equal(batchStatus(base), 'awaiting-review');
  assert.equal(batchStatus({ ...base, review: { id: 'r', batchId: 'bat_1', decision: 'approved', reason: '', decidedBy: 'u', decidedAt: 't' } }), 'approved');
  assert.equal(batchStatus({ ...base, review: { id: 'r', batchId: 'bat_1', decision: 'rejected', reason: 'x', decidedBy: 'u', decidedAt: 't' } }), 'rejected');
  assert.equal(batchStatus({ ...base, inv: { batchId: 'bat_1', cause: 'c', at: 't', by: 'u' }, review: { id: 'r', batchId: 'bat_1', decision: 'approved', reason: '', decidedBy: 'u', decidedAt: 't' } }), 'invalidated', 'an invalidation overrides an approval');
  assert.equal(batchStatus({ ...base, latest: calcOf([A, B, C], RING, 'calc_2') }), 'superseded');
  assert.equal(batchStatus({ ...base, currency: 'stale' }), 'invalidated');
  assert.equal(batchStatus({ ...base, approvalActive: false, review: { id: 'r', batchId: 'bat_1', decision: 'approved', reason: '', decidedBy: 'u', decidedAt: 't' } }), 'invalidated', 'no active calculation approval means no eligible batch');
});
