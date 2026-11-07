// Pure rules for settlement PREPARATION (MVP-1.4). No I/O. This module turns an approved calculation snapshot into a set of transfer instructions and checks
// them. It never signs, submits or settles anything: no wallet, key, transaction or network appears here. The allocation itself is the existing engine's
// deterministic `proposalFromNets`; this module maps participants to engine handles, maps the result back, and verifies it independently of the engine.
import { createHash } from 'node:crypto';
import { proposalFromNets, validatePlan, INSTRUCTION_CEILING } from 'tobin-mvp1-sdk/engine';
import type { ValidationResult } from 'tobin-mvp1-sdk/engine';
import { partyHandle } from './clearing.ts';
import type { Currency } from './clearing.ts';
import type { BatchInvalidation, BatchReview, CalculationRecord, SettlementBatch, SupportedAsset } from './types.ts';

export const ALGORITHM = 'tobin-mvp1-default-proposal/greedy-largest-first';
export { INSTRUCTION_CEILING };
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const I128_MAX = (1n << 127n) - 1n;

export interface PrepCheck { key: string; label: string; ok: boolean; detail: string }
export interface PlannedInstruction { seq: number; payer: string; payee: string; amount: string }

export const assetCanonicalId = (network: string, kind: 'native' | 'issued' | 'contract', code: string, issuer?: string, contractId?: string): string => (kind === 'native' ? `${network}:native` : kind === 'contract' ? `${network}:contract:${contractId ?? ''}` : `${network}:${code}:${issuer ?? ''}`);

export type AssetResolution =
  | { ok: true; asset: SupportedAsset }
  | { ok: false; reason: 'unsupported' | 'disabled' | 'ambiguous'; detail: string };

/**
 * Obligations carry an asset CODE only (MVP-1.2, frozen). A code is not an asset identity, so it resolves only when exactly one SUPPORTED registry entry has that
 * code. Zero entries: unsupported. Only disabled entries: disabled. Several supported entries (different issuers or networks): ambiguous, and refused.
 */
export function resolveAsset(code: string, assets: readonly SupportedAsset[]): AssetResolution {
  const same = assets.filter((a) => a.code === code);
  if (same.length === 0) return { ok: false, reason: 'unsupported', detail: `${code} is not in the supported asset list` };
  const live = same.filter((a) => a.status === 'supported');
  if (live.length === 0) return { ok: false, reason: 'disabled', detail: `${code} is in the asset list but disabled` };
  if (live.length > 1) return { ok: false, reason: 'ambiguous', detail: `${code} matches ${live.length} supported assets (${live.map((a) => a.id).join(', ')}); an obligation carries only a code, so the asset cannot be identified` };
  return { ok: true, asset: live[0] as SupportedAsset };
}

/**
 * Deterministic instructions from the SNAPSHOT's net positions (never from client input). Complexity: O(n log n) for sorting n participants plus a single
 * O(n) merge; at most debtors + creditors - 1 instructions. The result is one valid allocation, not claimed to be minimal or unique.
 * Also returns the engine's own advisory verdict on the plan against the snapshot's obligations.
 */
export function buildInstructions(sessionId: string, calc: CalculationRecord): { instructions: PlannedInstruction[]; engine: ValidationResult } {
  const handles = calc.positions.map((p) => partyHandle(sessionId, p.userId));
  const byHandle = new Map(handles.map((h, i) => [h, (calc.positions[i] as { userId: string }).userId]));
  const plan = proposalFromNets(calc.positions.map((p, i) => ({ participant: handles[i] as string, net: BigInt(p.net) })));
  const instructions = plan.map((x, i) => ({ seq: i + 1, payer: byHandle.get(x.payer) as string, payee: byHandle.get(x.payee) as string, amount: x.amount.toString() }));
  const handleOf = new Map(calc.positions.map((p, i) => [p.userId, handles[i] as string]));
  const engine = validatePlan(handles, calc.input.obligations.map((o) => ({ id: o.id, debtor: handleOf.get(o.debtor) as string, creditor: handleOf.get(o.creditor) as string, amount: BigInt(o.amount) })), plan);
  return { instructions, engine };
}

export const instructionId = (calculationId: string, i: PlannedInstruction, attempt = 1): string => `ins_${sha256(`${calculationId}|${attempt}|${i.seq}|${i.payer}|${i.payee}|${i.amount}`).slice(0, 24)}`;
/** Batch fingerprint. Attempt 1 keeps the MVP-1.4 formula exactly (so stored batches still verify); a later attempt is bound into the fingerprint, so a re-prepared batch has a new one. */
export const instructionsHash = (calculationId: string, assetId: string, list: readonly PlannedInstruction[], attempt = 1): string =>
  sha256(JSON.stringify(attempt === 1 ? { v: 1, calculationId, assetId, instructions: list.map((i) => [i.seq, i.payer, i.payee, i.amount]) } : { v: 2, attempt, calculationId, assetId, instructions: list.map((i) => [i.seq, i.payer, i.payee, i.amount]) }));

export const INSTRUCTION_SCHEMA = 'tobin-settlement-instruction/v1';
export interface InstructionFields { id: string; batchId: string; sessionId: string; orgId: string; calculationId: string; approvalDecisionId: string; network: string; seq: number; payer: string; payee: string; assetId: string; amount: string }
/** Integrity reference of ONE instruction: SHA-256 over a fixed-order serialization of every field of the v1 contract. */
export const instructionFingerprint = (i: InstructionFields): string =>
  sha256(JSON.stringify([INSTRUCTION_SCHEMA, i.id, i.batchId, i.sessionId, i.orgId, i.calculationId, i.approvalDecisionId, i.network, i.seq, i.payer, i.payee, i.assetId, i.amount]));

/** Independent verification of a set of instructions against a calculation's net positions. Does not use the engine. */
export function integrityChecks(calc: CalculationRecord, assetId: string, list: readonly (PlannedInstruction & { assetId?: string })[], expectedHash?: string, attempt = 1): PrepCheck[] {
  const net = new Map(calc.positions.map((p) => [p.userId, BigInt(p.net)]));
  const amountsOk = list.every((i) => /^[1-9][0-9]{0,38}$/.test(i.amount) && BigInt(i.amount) <= I128_MAX);
  const partiesOk = list.every((i) => net.has(i.payer) && net.has(i.payee) && i.payer !== i.payee);
  const pairs = new Set(list.map((i) => `${i.payer}>${i.payee}`));
  const seqOk = list.every((i, k) => i.seq === k + 1);
  const assetOk = list.every((i) => (i.assetId ?? assetId) === assetId);
  const paid = new Map<string, bigint>(); const got = new Map<string, bigint>();
  if (amountsOk) for (const i of list) { paid.set(i.payer, (paid.get(i.payer) ?? 0n) + BigInt(i.amount)); got.set(i.payee, (got.get(i.payee) ?? 0n) + BigInt(i.amount)); }
  let reconciled = amountsOk && partiesOk; let offsetting = false; let totalDebit = 0n;
  for (const [u, n] of net) {
    const p = paid.get(u) ?? 0n; const g = got.get(u) ?? 0n;
    if (p > 0n && g > 0n) offsetting = true;
    if (p !== (n > 0n ? n : 0n) || g !== (n < 0n ? -n : 0n)) reconciled = false;
    if (n > 0n) totalDebit += n;
  }
  const totalOut = [...paid.values()].reduce((a, b) => a + b, 0n); const totalIn = [...got.values()].reduce((a, b) => a + b, 0n);
  const checks: PrepCheck[] = [
    { key: 'amounts', label: 'Every amount is a positive whole number of base units', ok: amountsOk, detail: amountsOk ? `${list.length} instruction(s)` : 'a zero, negative, non-integer or oversized amount was found' },
    { key: 'parties', label: 'Every instruction names two different participants of the calculation', ok: partiesOk, detail: partiesOk ? 'all parties belong to the approved calculation' : 'an unknown participant, or a participant paying itself' },
    { key: 'unique', label: 'No duplicate instruction and a contiguous sequence', ok: pairs.size === list.length && seqOk, detail: pairs.size === list.length && seqOk ? 'each payer and payee pair appears once' : 'a repeated pair or a gap in the sequence' },
    { key: 'asset', label: 'Every instruction uses the batch asset', ok: assetOk, detail: assetOk ? assetId : 'an instruction names another asset' },
    { key: 'reconciliation', label: 'Instructions reconcile exactly to the approved net positions', ok: reconciled && !offsetting, detail: reconciled && !offsetting ? 'each net debtor pays exactly its net debit; each net creditor receives exactly its net credit' : offsetting ? 'a participant would both pay and receive' : 'a participant would pay or receive more or less than its net position' },
    { key: 'conservation', label: 'Total paid equals total received equals total net debit', ok: reconciled && totalOut === totalIn && totalOut === totalDebit, detail: `paid ${totalOut}, received ${totalIn}, net debit ${totalDebit}` },
  ];
  if (expectedHash !== undefined) { const h = instructionsHash(calc.id, assetId, list, attempt); checks.push({ key: 'hash', label: 'The stored instructions still match their recorded fingerprint', ok: h === expectedHash, detail: h === expectedHash ? expectedHash.slice(0, 16) : 'the instruction set differs from the recorded fingerprint' }); }
  return checks;
}

export type BatchStatus = 'awaiting-review' | 'approved' | 'rejected' | 'invalidated' | 'superseded';

/** Derived, never stored: a batch is only as good as its calculation. */
export function batchStatus(i: { batch: SettlementBatch; review: BatchReview | undefined; inv: BatchInvalidation | undefined; latest: CalculationRecord | undefined; currency: Currency; approvalActive: boolean }): BatchStatus {
  if (i.inv) return 'invalidated';
  if (!i.latest || i.latest.id !== i.batch.calculationId) return 'superseded';
  if (i.currency !== 'current' || !i.approvalActive) return 'invalidated'; // defence in depth: an unrecorded change still cannot leave an eligible batch
  return i.review ? i.review.decision : 'awaiting-review';
}
