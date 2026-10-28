// Shared test helpers: deterministic addresses and a seeded random generator.
import { encodeAddress } from '../src/strkey.ts';
import type { AddressKind } from '../src/strkey.ts';
import type { Obligation } from '../src/engine/types.ts';

export function addr(n: number, kind: AddressKind = 'account'): string {
  return encodeAddress(kind, new Uint8Array(32).fill(n));
}

export function oid(n: number): string {
  return n.toString(16).padStart(2, '0').repeat(32);
}

export function ob(n: number, debtor: string, creditor: string, amount: bigint | string): Obligation {
  return { id: oid(n), debtor, creditor, amount: BigInt(amount) };
}

/** xorshift64*: deterministic, seedable. */
export class Rng {
  private s: bigint;
  constructor(seed: bigint) {
    this.s = seed || 1n;
  }
  next(): bigint {
    this.s ^= (this.s << 13n) & 0xffffffffffffffffn;
    this.s ^= this.s >> 7n;
    this.s ^= (this.s << 17n) & 0xffffffffffffffffn;
    return this.s;
  }
  below(n: number): number {
    return Number(this.next() % BigInt(n));
  }
  shuffle<T>(a: readonly T[]): T[] {
    const out = [...a];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.below(i + 1);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}
