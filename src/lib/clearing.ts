/**
 * Netting arithmetic for the illustrative example used across the page.
 * Pure and deterministic: the same obligations always give the same positions.
 */

export type Obligation = { from: string; to: string; amount: number };

export type Position = {
  party: string;
  /** Total this party owes to others. */
  owes: number;
  /** Total others owe this party. */
  owed: number;
  /** owed - owes. Negative means the party pays; positive means it receives. */
  net: number;
};

export type ClearingResult = {
  positions: Position[];
  /** Sum of all obligations if each were settled on its own. */
  gross: number;
  /** Value that actually has to move once positions are netted. */
  settled: number;
};

export function computeClearing(obligations: Obligation[]): ClearingResult {
  const book = new Map<string, { owes: number; owed: number }>();
  const entry = (party: string) => {
    let e = book.get(party);
    if (!e) {
      e = { owes: 0, owed: 0 };
      book.set(party, e);
    }
    return e;
  };

  let gross = 0;
  for (const { from, to, amount } of obligations) {
    entry(from).owes += amount;
    entry(to).owed += amount;
    gross += amount;
  }

  const positions = [...book.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([party, { owes, owed }]) => ({ party, owes, owed, net: owed - owes }));

  const settled = positions.reduce((sum, p) => sum + Math.max(p.net, 0), 0);

  return { positions, gross, settled };
}

/** Illustrative only. Not real transaction data. */
export const EXAMPLE_OBLIGATIONS: Obligation[] = [
  { from: "A", to: "B", amount: 100 },
  { from: "B", to: "C", amount: 80 },
  { from: "C", to: "A", amount: 70 },
];

export const EXAMPLE = computeClearing(EXAMPLE_OBLIGATIONS);

export const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
