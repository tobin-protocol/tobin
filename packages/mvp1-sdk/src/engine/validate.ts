// ADVISORY client-side validation of a settlement plan, written from the contract's published rules (CD 6.2) and the contract source's
// check order. It exists so a participant sees problems before sending; it is NOT authority: the contract validates every plan itself and a
// plan that passes here can still be rejected (and, in principle, vice versa). It is also an independent second implementation of the rules
// only in the sense of a different language written by the same author: agreement with the Rust contract is evidence, not proof.
import { I128_MAX, checkedAdd } from '../amount.ts';
import { compareAddresses } from '../address.ts';
import { computeNets } from './net.ts';
import type { Instruction, Obligation, ValidationError, ValidationResult } from './types.ts';

/** Provisional engineering target (S§11), not a verified limit; the contract's ceiling. */
export const INSTRUCTION_CEILING = 16;

const fail = (error: ValidationError, message: string): ValidationResult => ({ ok: false, error, message });

export function validatePlan(participants: readonly string[], obligations: readonly Obligation[], plan: readonly Instruction[]): ValidationResult {
  if (plan.length > INSTRUCTION_CEILING) return fail('TooManyInstructions', `more than ${INSTRUCTION_CEILING} instructions`);
  let nets;
  try {
    nets = computeNets(participants, obligations);
  } catch (e) {
    return fail(e instanceof Error && 'code' in e && (e as { code: string }).code === 'OVERFLOW' ? 'Overflow' : 'UnknownParty', e instanceof Error ? e.message : String(e));
  }
  const index = new Map(participants.map((p, i) => [p, i] as const));
  const debit = participants.map(() => 0n);
  const credit = participants.map(() => 0n);
  let prev: Instruction | undefined;
  for (const ins of plan) {
    if (ins.amount <= 0n) return fail('BadAmount', 'an instruction amount must be greater than zero');
    if (ins.amount > I128_MAX) return fail('Overflow', 'amount outside the i128 range');
    if (ins.payer === ins.payee) return fail('InstructionSelfPay', 'payer equals payee');
    const p = index.get(ins.payer);
    const q = index.get(ins.payee);
    if (p === undefined || q === undefined) return fail('UnknownParty', 'an instruction names an address that is not a participant');
    if (prev) {
      const c = compareAddresses(prev.payer, ins.payer) || compareAddresses(prev.payee, ins.payee);
      if (c >= 0) return fail('InstructionOrder', 'instructions must be strictly ascending by payer then payee');
    }
    prev = ins;
    try {
      debit[p] = checkedAdd(debit[p] as bigint, ins.amount);
      credit[q] = checkedAdd(credit[q] as bigint, ins.amount);
    } catch {
      return fail('Overflow', 'a participant total overflows i128');
    }
  }
  for (let i = 0; i < participants.length; i++) {
    const net = (nets[i] as { net: bigint }).net;
    const d = debit[i] as bigint;
    const c = credit[i] as bigint;
    if (d > 0n && c > 0n) return fail('OffsettingFlows', `${participants[i]} would both pay and receive`);
    if (d !== (net > 0n ? net : 0n) || c !== (net < 0n ? -net : 0n)) {
      return fail('FlowMismatch', `${participants[i]}: the instructions do not realize the net position`);
    }
  }
  return { ok: true };
}
