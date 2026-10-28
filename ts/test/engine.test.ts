// The netting engine: nets, the deterministic default proposal, and the advisory validator. No bridge needed. (Agreement with the real Rust
// contract is checked separately in interop.test.ts.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineError, I128_MAX } from '../src/amount.ts';
import { compareAddresses } from '../src/address.ts';
import { computeNets, defaultProposal, validatePlan, allZero, INSTRUCTION_CEILING } from '../src/engine/index.ts';
import type { Instruction, Obligation } from '../src/engine/index.ts';
import { Rng, addr, ob, oid } from './helpers.ts';

const A = addr(11);
const B = addr(12);
const C = addr(13);
const D = addr(14);
const code = (e: unknown): string => (e instanceof EngineError ? e.code : String(e));

test('nets use outgoing minus incoming: positive is a debtor, negative a creditor (the README example)', () => {
  // A owes B 100, B owes C 80, C owes A 70
  const nets = computeNets([A, B, C], [ob(1, A, B, 100n), ob(2, B, C, 80n), ob(3, C, A, 70n)]);
  assert.deepEqual(nets.map((n) => n.net), [30n, -20n, -10n]);
  assert.equal(nets.reduce((s, n) => s + n.net, 0n), 0n);
});

test('the default proposal for the README example is A pays B 20 and A pays C 10', () => {
  const p = defaultProposal([A, B, C], [ob(1, A, B, 100n), ob(2, B, C, 80n), ob(3, C, A, 70n)]);
  assert.deepEqual(p, [
    { payer: A, payee: B, amount: 20n },
    { payer: A, payee: C, amount: 10n },
  ]);
});

test('all-zero nets give the empty proposal, and are reported as such', () => {
  const obs = [ob(1, A, B, 5n), ob(2, B, A, 5n)];
  const nets = computeNets([A, B], obs);
  assert.ok(allZero(nets));
  assert.deepEqual(defaultProposal([A, B], obs), []);
  assert.deepEqual(validatePlan([A, B], obs, []), { ok: true });
  // a non-empty plan for an all-zero set introduces value
  const r = validatePlan([A, B], obs, [{ payer: A, payee: B, amount: 1n }]);
  assert.equal(r.ok, false);
  // a cycle that nets to zero for every participant: A->B, B->C, C->A all 10
  const cyc = [ob(1, A, B, 10n), ob(2, B, C, 10n), ob(3, C, A, 10n)];
  assert.ok(allZero(computeNets([A, B, C], cyc)));
  assert.deepEqual(defaultProposal([A, B, C], cyc), []);
});

test('ordering and tie-breaking: debtors and creditors by amount descending, ties by address bytes; output sorted payer then payee', () => {
  // D1=A and D2=B both owe 10; C1=C and C2=D are both due 10 (all ties). Greedy: first debtor (A) pays first creditor (C) 10, then B pays D 10.
  const obs = [ob(1, A, C, 10n), ob(2, B, D, 10n)];
  assert.deepEqual(defaultProposal([D, C, B, A], obs), [
    { payer: A, payee: C, amount: 10n },
    { payer: B, payee: D, amount: 10n },
  ]);
  // larger amount first even when its address sorts later: B owes 30, A owes 10; creditors C due 25, D due 15
  const obs2 = [ob(1, B, C, 25n), ob(2, B, D, 5n), ob(3, A, D, 10n)];
  const p = defaultProposal([A, B, C, D], obs2);
  // debtors by amount: B(30), A(10). creditors: C(25), D(15). B pays C 25, B pays D 5, A pays D 10
  assert.deepEqual(p, [
    { payer: A, payee: D, amount: 10n },
    { payer: B, payee: C, amount: 25n },
    { payer: B, payee: D, amount: 5n },
  ]);
});

test('pinned ordering: larger amounts first, ties by lower address first, then output sorted (a case where the orders disagree)', () => {
  // nets: A -2, B +1, C +3, D -2. Debtors by amount descending: C(3), B(1). Creditors: A(2) and D(2) tie, so the lower address A comes first.
  // Greedy: C pays A 2 (C has 1 left), C pays D 1 (D has 1 left), B pays D 1. Output sorted by payer then payee: B>D, C>A, C>D.
  // Ascending amounts give B>A 1, C>A 1, C>D 2; so does a reversed tie-break (D before A). Either mutation changes the plan.
  const obs = [ob(1, B, A, 1n), ob(2, C, D, 2n), ob(3, C, A, 1n)];
  assert.deepEqual(computeNets([A, B, C, D], obs).map((n) => n.net), [-2n, 1n, 3n, -2n]);
  const expected: Instruction[] = [
    { payer: B, payee: D, amount: 1n },
    { payer: C, payee: A, amount: 2n },
    { payer: C, payee: D, amount: 1n },
  ];
  assert.deepEqual(defaultProposal([A, B, C, D], obs), expected);
  assert.deepEqual(defaultProposal([D, C, B, A], [...obs].reverse()), expected, 'independent of input order');
  assert.deepEqual(validatePlan([A, B, C, D], obs, expected), { ok: true });
  // another valid plan exists and is accepted by the validator too: the default is not the only answer
  const other: Instruction[] = [
    { payer: B, payee: A, amount: 1n },
    { payer: C, payee: A, amount: 1n },
    { payer: C, payee: D, amount: 2n },
  ];
  assert.deepEqual(validatePlan([A, B, C, D], obs, other), { ok: true });
});

test('input checks: invalid parties, amounts, ids, duplicates, overflow', () => {
  const ok = (): Obligation => ob(1, A, B, 5n);
  const nets = (o: Obligation[], parts: string[] = [A, B]) => () => computeNets(parts, o);
  assert.throws(nets([{ ...ok(), amount: 0n }]), (e) => code(e) === 'NON_POSITIVE_AMOUNT');
  assert.throws(nets([{ ...ok(), amount: -3n }]), (e) => code(e) === 'NON_POSITIVE_AMOUNT');
  assert.throws(nets([{ ...ok(), amount: 1.5 as unknown as bigint }]), (e) => code(e) === 'INVALID_AMOUNT', 'a floating-point number is never an amount');
  assert.throws(nets([{ ...ok(), amount: 5 as unknown as bigint }]), (e) => code(e) === 'INVALID_AMOUNT', 'not even an integral number');
  assert.throws(nets([{ ...ok(), creditor: A }]), (e) => code(e) === 'SAME_PARTY');
  assert.throws(nets([{ ...ok(), creditor: C }]), (e) => code(e) === 'UNKNOWN_PARTY');
  assert.throws(nets([{ ...ok(), debtor: 'not an address' }]), (e) => code(e) === 'INVALID_ADDRESS');
  assert.throws(nets([{ ...ok(), id: 'abc' }]), (e) => code(e) === 'INVALID_ID');
  assert.throws(nets([ok(), ok()]), (e) => code(e) === 'DUPLICATE_ID');
  assert.throws(nets([ok(), { ...ok(), id: oid(1).toUpperCase() }]), (e) => code(e) === 'DUPLICATE_ID', 'ids compare case-insensitively');
  assert.throws(nets([ok()], [A, A, B]), (e) => code(e) === 'DUPLICATE_PARTICIPANT');
  // overflow: A's outgoing sum, B's incoming sum and the grand total
  assert.throws(nets([ob(1, A, B, I128_MAX), ob(2, A, B, 1n)]), (e) => code(e) === 'OVERFLOW');
  assert.throws(nets([ob(1, A, B, I128_MAX), ob(2, B, A, 1n), ob(3, A, B, 1n)]), (e) => code(e) === 'OVERFLOW');
  // exactly at the limit is fine
  const edge = computeNets([A, B], [ob(1, A, B, I128_MAX)]);
  assert.deepEqual(edge.map((n) => n.net), [I128_MAX, -I128_MAX]);
  assert.deepEqual(defaultProposal([A, B], [ob(1, A, B, I128_MAX)]), [{ payer: A, payee: B, amount: I128_MAX }]);
});

test('amounts are handled as exact integers far beyond 2^53', () => {
  const big = 2n ** 100n + 12345n;
  const p = defaultProposal([A, B, C], [ob(1, A, B, big), ob(2, A, C, 1n)]);
  assert.deepEqual(p, [
    { payer: A, payee: B, amount: big },
    { payer: A, payee: C, amount: 1n },
  ]);
});

test('the validator mirrors the contract\'s rules and error names', () => {
  const parts = [A, B, C];
  const obs = [ob(1, A, B, 100n), ob(2, B, C, 80n), ob(3, C, A, 70n)];
  const good: Instruction[] = [
    { payer: A, payee: B, amount: 20n },
    { payer: A, payee: C, amount: 10n },
  ];
  assert.deepEqual(validatePlan(parts, obs, good), { ok: true });
  const err = (plan: Instruction[]): string => {
    const r = validatePlan(parts, obs, plan);
    return r.ok ? 'ok' : r.error;
  };
  const I = (payer: string, payee: string, amount: bigint): Instruction => ({ payer, payee, amount });
  assert.equal(err([I(A, B, 20n)]), 'FlowMismatch');
  assert.equal(err([I(A, B, 21n), I(A, C, 10n)]), 'FlowMismatch');
  assert.equal(err([I(B, A, 20n), I(C, A, 10n)]), 'FlowMismatch', 'payers and payees swapped');
  assert.equal(err([]), 'FlowMismatch', 'empty while a net is non-zero');
  assert.equal(err([I(A, B, 30n), I(B, C, 10n)]), 'OffsettingFlows');
  assert.equal(err([I(A, B, 10n), I(A, B, 10n), I(A, C, 10n)]), 'InstructionOrder', 'a repeated ordered pair');
  assert.equal(err([I(A, C, 10n), I(A, B, 20n)]), 'InstructionOrder');
  assert.equal(err([I(A, A, 5n)]), 'InstructionSelfPay');
  assert.equal(err([I(A, B, 0n)]), 'BadAmount');
  assert.equal(err([I(A, B, -5n), I(A, C, 10n)]), 'BadAmount');
  assert.equal(err([I(A, addr(99), 1n)]), 'UnknownParty');
  assert.equal(err(Array.from({ length: INSTRUCTION_CEILING + 1 }, () => I(A, B, 1n))), 'TooManyInstructions');
  // several valid plans can exist; the validator accepts each of them (the contract does too)
  const d4 = [ob(1, A, C, 10n), ob(2, B, D, 10n)];
  const p1 = [I(A, C, 10n), I(B, D, 10n)];
  const p2 = [I(A, D, 10n), I(B, C, 10n)];
  assert.deepEqual(validatePlan([A, B, C, D], d4, p1), { ok: true });
  assert.deepEqual(validatePlan([A, B, C, D], d4, p2), { ok: true });
  assert.deepEqual(defaultProposal([A, B, C, D], d4), p1);
});

function randomSession(rng: Rng): { parts: string[]; obs: Obligation[] } {
  const n = 2 + rng.below(7); // 2..8 participants (the engine is not limited to the contract\'s provisional ceilings)
  const parts = Array.from({ length: n }, (_, i) => addr(20 + i, rng.below(3) === 0 ? 'contract' : 'account'));
  const obs: Obligation[] = [];
  if (rng.below(6) === 0) {
    // a ring (or two) of equal obligations: every net is zero
    const k = 2 + rng.below(n - 1);
    const amt = BigInt(1 + rng.below(500));
    for (let i = 0; i < k; i++) obs.push(ob(i + 1, parts[i] as string, parts[(i + 1) % k] as string, amt));
    return { parts, obs };
  }
  const m = 1 + rng.below(16);
  for (let k = 0; k < m; k++) {
    const d = rng.below(n);
    let c = rng.below(n);
    if (c === d) c = (c + 1) % n;
    const scale = rng.below(4) === 0 ? 10n ** 30n : 1n;
    obs.push(ob(k + 1, parts[d] as string, parts[c] as string, BigInt(1 + rng.below(1000)) * scale));
  }
  return { parts, obs };
}

test('generated plans: conservation, debit/credit limits, completeness, order, determinism, validity (2000 random sessions)', () => {
  const rng = new Rng(0x9e3779b97f4a7c15n);
  let zero = 0;
  let multi = 0;
  for (let s = 0; s < 2000; s++) {
    const { parts, obs } = randomSession(rng);
    const nets = computeNets(parts, obs);
    const plan = defaultProposal(parts, obs);
    // determinism: independent of the order of participants and obligations
    assert.deepEqual(defaultProposal(rng.shuffle(parts), rng.shuffle(obs)), plan);
    assert.deepEqual(defaultProposal(parts, obs), plan);
    // conservation and per-participant limits: debit = max(0, net), credit = max(0, -net)
    const debit = new Map<string, bigint>();
    const credit = new Map<string, bigint>();
    let total = 0n;
    for (const i of plan) {
      assert.ok(i.amount > 0n && i.payer !== i.payee);
      debit.set(i.payer, (debit.get(i.payer) ?? 0n) + i.amount);
      credit.set(i.payee, (credit.get(i.payee) ?? 0n) + i.amount);
      total += i.amount;
    }
    let sumDebts = 0n;
    for (const n of nets) {
      assert.equal(debit.get(n.participant) ?? 0n, n.net > 0n ? n.net : 0n);
      assert.equal(credit.get(n.participant) ?? 0n, n.net < 0n ? -n.net : 0n);
      assert.ok(!(debit.has(n.participant) && credit.has(n.participant)), 'nobody both pays and receives');
      if (n.net > 0n) sumDebts += n.net;
    }
    assert.equal(total, sumDebts, 'total debits equal total credits');
    // order: strictly ascending (payer, payee); at most debtors + creditors - 1 instructions
    for (let i = 1; i < plan.length; i++) {
      const a = plan[i - 1] as Instruction;
      const b = plan[i] as Instruction;
      assert.ok((compareAddresses(a.payer, b.payer) || compareAddresses(a.payee, b.payee)) < 0);
    }
    const debtors = nets.filter((n) => n.net > 0n).length;
    const creditors = nets.filter((n) => n.net < 0n).length;
    assert.ok(plan.length <= Math.max(0, debtors + creditors - 1));
    // the advisory validator accepts it (when within the instruction ceiling)
    if (plan.length <= INSTRUCTION_CEILING) assert.deepEqual(validatePlan(parts, obs, plan), { ok: true });
    if (allZero(nets)) {
      zero++;
      assert.deepEqual(plan, []);
    }
    if (debtors >= 2 && creditors >= 2) multi++;
  }
  assert.ok(zero > 100, `the generator must produce all-zero sessions (got ${zero})`);
  assert.ok(multi > 100, `the generator must produce sessions with several valid plans (got ${multi})`);
  console.log(`engine property test: 2000 sessions, ${zero} all-zero, ${multi} with at least two debtors and two creditors`);
});

test('single-field mutations of a default plan are rejected by the validator (500 sessions)', () => {
  const rng = new Rng(0x1234567890abcdefn);
  let tried = 0;
  for (let s = 0; s < 500; s++) {
    const { parts, obs } = randomSession(rng);
    const plan = defaultProposal(parts, obs);
    if (plan.length === 0 || plan.length > INSTRUCTION_CEILING) continue;
    const i = rng.below(plan.length);
    const p = plan[i] as Instruction;
    const mutants: Instruction[][] = [
      plan.map((x, k) => (k === i ? { ...x, amount: x.amount + 1n } : x)), // one unit too much
      plan.filter((_, k) => k !== i), // an instruction omitted
      [...plan.slice(0, i + 1), p, ...plan.slice(i + 1)], // an instruction duplicated
      plan.map((x, k) => (k === i ? { payer: x.payee, payee: x.payer, amount: x.amount } : x)), // reversed
    ];
    for (const m of mutants) {
      tried++;
      assert.equal(validatePlan(parts, obs, m).ok, false);
    }
  }
  assert.ok(tried > 500);
});
