// Mismatch between the APPROVED result (the calculation's net positions) and the PREPARED settlement (the batch's instructions). The server runs its own
// reconciliation (`validation`); this module re-checks the same invariant in the browser from the data actually shown, so a reviewer never approves a
// settlement whose instructions do not add up to the result they approved. Any issue blocks progress. Pure: no I/O, no invented figures.
import type { BatchView, CalculationView, InstructionView, PrepCheck } from "../tobin/types.ts";

export type IssueSource = "browser" | "server";
export interface DiffIssue { source: IssueSource; text: string; expected?: string; actual?: string }
export interface DiffResult { ok: boolean; issues: DiffIssue[] }

/** payer pays, payee receives: net (positive = pays) per user id, from the instructions alone */
export function instructionNets(instructions: readonly InstructionView[]): Map<string, bigint> {
  const m = new Map<string, bigint>();
  for (const i of instructions) {
    const a = BigInt(i.amount);
    m.set(i.payer, (m.get(i.payer) ?? 0n) + a);
    m.set(i.payee, (m.get(i.payee) ?? 0n) - a);
  }
  return m;
}

export function diffSettlement(calc: CalculationView["calculation"], batch: Pick<BatchView, "batch" | "instructions" | "validation">): DiffResult {
  const issues: DiffIssue[] = [];
  const name = new Map<string, string>();
  for (const i of batch.instructions) { name.set(i.payer, i.payerName); name.set(i.payee, i.payeeName); }

  if (!calc) {
    issues.push({ source: "browser", text: "The calculation this batch was prepared from could not be read, so the instructions cannot be compared with the approved result." });
  } else {
    if (calc.id !== batch.batch.calculationId) issues.push({ source: "browser", text: "The latest calculation is not the one this batch was prepared from.", expected: calc.id, actual: batch.batch.calculationId });
    if (calc.asset !== batch.batch.asset.code) issues.push({ source: "browser", text: "The batch asset differs from the calculation asset.", expected: calc.asset, actual: batch.batch.asset.code });
    const got = instructionNets(batch.instructions);
    const ids = new Set<string>([...calc.positions.map((p) => p.userId), ...got.keys()]);
    for (const id of ids) {
      const want = BigInt(calc.positions.find((p) => p.userId === id)?.net ?? "0");
      const have = got.get(id) ?? 0n;
      if (want !== have) {
        const who = calc.positions.find((p) => p.userId === id)?.name ?? name.get(id) ?? id;
        issues.push({ source: "browser", text: `${who}: the instructions do not produce the approved net position.`, expected: want.toString(), actual: have.toString() });
      }
    }
  }
  const sum = batch.instructions.reduce((t, i) => t + BigInt(i.amount), 0n).toString();
  if (sum !== batch.batch.totalAmount) issues.push({ source: "browser", text: "The batch total differs from the sum of its instructions.", expected: batch.batch.totalAmount, actual: sum });
  if (batch.instructions.length !== batch.batch.instructionCount) issues.push({ source: "browser", text: "The batch instruction count differs from the instructions listed.", expected: String(batch.batch.instructionCount), actual: String(batch.instructions.length) });
  for (const c of batch.validation as readonly PrepCheck[]) if (!c.ok) issues.push({ source: "server", text: `${c.label}: ${c.detail}` });
  return { ok: issues.length === 0, issues };
}

/** Approval is blocked by any issue; rejecting a bad batch is not (a reviewer must be able to refuse it). */
export const blocksApproval = (d: DiffResult): boolean => !d.ok;
