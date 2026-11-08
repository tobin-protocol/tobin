// Pure netting presentation rules. Nothing here computes a settlement: the net positions come from the backend's calculation. These functions only group,
// split and summarise what it returned. Amounts are decimal strings (BigInt in memory) and are ALWAYS paired with their asset; a total never spans assets.
import { formatAmount } from "../format.ts";
import type { CalculationPosition, ObligationView } from "../tobin/types.ts";

export const absAmount = (net: string): string => net.replace(/^-/, "");

export interface GroupedPositions {
  /** net debtors: they pay, largest first */
  debtors: CalculationPosition[];
  /** net creditors: they receive, largest first */
  creditors: CalculationPosition[];
  zero: CalculationPosition[];
}

/** Net debtors, then net creditors, then zero positions. Within a group: largest amount first, then name, so the order is stable. */
export function groupPositions(positions: readonly CalculationPosition[]): GroupedPositions {
  const bySize = (a: CalculationPosition, b: CalculationPosition): number => {
    const x = BigInt(absAmount(a.net)); const y = BigInt(absAmount(b.net));
    return x === y ? a.name.localeCompare(b.name) : x > y ? -1 : 1;
  };
  const sign = (p: CalculationPosition): number => { const n = BigInt(p.net); return n > 0n ? 1 : n < 0n ? -1 : 0; };
  return {
    debtors: positions.filter((p) => sign(p) > 0).sort(bySize),
    creditors: positions.filter((p) => sign(p) < 0).sort(bySize),
    zero: positions.filter((p) => sign(p) === 0).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Items split into one section per asset code, in code order. Different assets are never combined. */
export function splitByAsset<T extends { asset: string }>(items: readonly T[]): { asset: string; items: T[] }[] {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(i.asset, [...(m.get(i.asset) ?? []), i]);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([asset, list]) => ({ asset, items: list }));
}

/** Sums of ACTIVE obligation amounts, one entry per asset. There is deliberately no function that adds across assets. */
export function totalsByAsset(obligations: readonly Pick<ObligationView, "asset" | "amount" | "status">[]): { asset: string; total: string; label: string }[] {
  const sums = new Map<string, bigint>();
  for (const o of obligations) if (o.status === "active") sums.set(o.asset, (sums.get(o.asset) ?? 0n) + BigInt(o.amount));
  return [...sums.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([asset, v]) => ({ asset, total: v.toString(), label: formatAmount(v.toString(), asset) }));
}

export interface GrossNet {
  gross: string;
  /** what actually moves: the sum of the net debtors' amounts (equal to the sum of the net creditors') */
  net: string;
  /** gross minus net, only when the calculation is current and the figures satisfy net <= gross; otherwise null (never estimated) */
  reduction: string | null;
}

export function grossVsNet(gross: string, positions: readonly CalculationPosition[], current: boolean): GrossNet {
  const net = positions.reduce((t, p) => (BigInt(p.net) > 0n ? t + BigInt(p.net) : t), 0n);
  const g = BigInt(gross);
  return { gross, net: net.toString(), reduction: current && net <= g ? (g - net).toString() : null };
}

export type ExclusionReason = "voided" | "inactive-participant";
export interface EligibilityResult {
  eligible: ObligationView[];
  excluded: { obligation: ObligationView; reason: ExclusionReason; text: string }[];
}

/**
 * Which obligations go into a calculation. The backend nets ACTIVE obligations only, so a voided obligation is the one thing it leaves out. An active
 * obligation that names someone who is no longer an active participant is reported as blocking: the backend refuses to net it rather than dropping it.
 */
export function eligibility(obligations: readonly ObligationView[], activeParticipantIds: ReadonlySet<string>): EligibilityResult {
  const eligible: ObligationView[] = []; const excluded: EligibilityResult["excluded"] = [];
  for (const o of obligations) {
    if (o.status === "voided") excluded.push({ obligation: o, reason: "voided", text: "Voided, so it is not netted." });
    else if (!activeParticipantIds.has(o.debtor) || !activeParticipantIds.has(o.creditor)) excluded.push({ obligation: o, reason: "inactive-participant", text: "Names a participant who is no longer active. Netting refuses it until it is voided or the participant is added back." });
    else eligible.push(o);
  }
  return { eligible, excluded };
}
