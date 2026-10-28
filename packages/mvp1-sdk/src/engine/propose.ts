// The deterministic DEFAULT proposal generator. It is a convenience for participants, not an authority: the contract accepts any plan that
// satisfies its correctness rules (it never compares a plan with this output), and this module never claims its output is the only valid one.
//
// Procedure (adapted from the v0.2 `tobin-settle-v1` text with the baseline sign convention; the adaptation is this engine's own and makes no
// v0.2 conformance claim):
//  1. nets = outgoing - incoming. Debtors have net > 0, creditors net < 0.
//  2. Debtors are listed once by amount DESCENDING; equal amounts are ordered by the address XDR bytes ASCENDING. Creditors likewise by
//     absolute amount. The lists are not re-sorted after a partial transfer.
//  3. While both lists are non-empty: the first debtor pays the first creditor min(remaining debtor, remaining creditor); emit one
//     instruction; reduce both; drop any entry that reaches zero.
//  4. The emitted instructions are sorted ASCENDING by (payer XDR bytes, payee XDR bytes): the order the contract requires, so every pair
//     is unique and the list is accepted as-is. (Step 3 never emits the same ordered pair twice.)
// All nets zero gives the empty proposal. At most (debtors + creditors - 1) instructions.
import { compareAddresses } from '../address.ts';
import { computeNets } from './net.ts';
import type { Instruction, NetPosition, Obligation } from './types.ts';

/** The default proposal for a frozen obligation set. Throws EngineError for invalid input (see computeNets). */
export function defaultProposal(participants: readonly string[], obligations: readonly Obligation[]): Instruction[] {
  return proposalFromNets(computeNets(participants, obligations));
}

export function proposalFromNets(nets: readonly NetPosition[]): Instruction[] {
  const order = (a: { participant: string; amount: bigint }, b: { participant: string; amount: bigint }): number =>
    a.amount === b.amount ? compareAddresses(a.participant, b.participant) : a.amount > b.amount ? -1 : 1;
  const debtors = nets.filter((n) => n.net > 0n).map((n) => ({ participant: n.participant, amount: n.net })).sort(order);
  const creditors = nets.filter((n) => n.net < 0n).map((n) => ({ participant: n.participant, amount: -n.net })).sort(order);
  const out: Instruction[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i] as { participant: string; amount: bigint };
    const c = creditors[j] as { participant: string; amount: bigint };
    const amount = d.amount < c.amount ? d.amount : c.amount;
    out.push({ payer: d.participant, payee: c.participant, amount });
    d.amount -= amount;
    c.amount -= amount;
    if (d.amount === 0n) i++;
    if (c.amount === 0n) j++;
  }
  return sortInstructions(out);
}

/** The contract's required instruction order: ascending by payer then payee (XDR bytes). */
export function sortInstructions(list: readonly Instruction[]): Instruction[] {
  return [...list].sort((a, b) => compareAddresses(a.payer, b.payer) || compareAddresses(a.payee, b.payee));
}
