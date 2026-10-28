// Integer-safe token amounts. Amounts are `bigint` in the token's smallest unit, never `number`: no floating point touches a token amount.
// The contract uses `i128`; every sum here is checked against that range exactly as the contract's checked arithmetic is.

export const I128_MAX = (1n << 127n) - 1n;
export const I128_MIN = -(1n << 127n);

export type EngineErrorCode =
  | 'INVALID_AMOUNT'
  | 'NON_POSITIVE_AMOUNT'
  | 'OVERFLOW'
  | 'INVALID_ADDRESS'
  | 'DUPLICATE_PARTICIPANT'
  | 'UNKNOWN_PARTY'
  | 'SAME_PARTY'
  | 'INVALID_ID'
  | 'DUPLICATE_ID';

/** Errors raised by input checks in the engine, digest and SDK helpers. The contract has its own, authoritative errors. */
export class EngineError extends Error {
  readonly code: EngineErrorCode;
  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

/** Accepts a `bigint` or a canonical decimal integer string. Rejects `number` (floats lose integers), decimals, exponents, spaces. */
export function parseAmount(v: unknown): bigint {
  let n: bigint;
  if (typeof v === 'bigint') n = v;
  else if (typeof v === 'string' && /^-?(0|[1-9][0-9]*)$/.test(v)) n = BigInt(v);
  else throw new EngineError('INVALID_AMOUNT', `an amount must be a bigint or a decimal integer string, got ${typeof v === 'string' ? JSON.stringify(v) : typeof v}`);
  if (n > I128_MAX || n < I128_MIN) throw new EngineError('OVERFLOW', 'amount outside the i128 range');
  return n;
}

/** A strictly positive amount, as every obligation and instruction amount must be. */
export function parsePositiveAmount(v: unknown): bigint {
  const n = parseAmount(v);
  if (n <= 0n) throw new EngineError('NON_POSITIVE_AMOUNT', `an amount must be greater than zero, got ${n}`);
  return n;
}

/** Checked i128 addition: throws OVERFLOW when the exact result leaves the i128 range. */
export function checkedAdd(a: bigint, b: bigint): bigint {
  const r = a + b;
  if (r > I128_MAX || r < I128_MIN) throw new EngineError('OVERFLOW', 'i128 overflow');
  return r;
}

/** Checked i128 subtraction. */
export function checkedSub(a: bigint, b: bigint): bigint {
  const r = a - b;
  if (r > I128_MAX || r < I128_MIN) throw new EngineError('OVERFLOW', 'i128 overflow');
  return r;
}

/** Big-endian two's complement, 16 bytes: the contract's i128 encoding in the digests. */
export function i128ToBytes(v: bigint): Uint8Array {
  if (v > I128_MAX || v < I128_MIN) throw new EngineError('OVERFLOW', 'i128 overflow');
  let u = v < 0n ? (1n << 128n) + v : v;
  const out = new Uint8Array(16);
  for (let i = 15; i >= 0; i--) {
    out[i] = Number(u & 0xffn);
    u >>= 8n;
  }
  return out;
}

export function u32ToBytes(v: number): Uint8Array {
  if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new EngineError('INVALID_AMOUNT', 'u32 out of range');
  return new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
}

export function toHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

export function fromHex(h: string): Uint8Array {
  if (!/^([0-9a-fA-F]{2})*$/.test(h)) throw new EngineError('INVALID_ID', 'not a hex string');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Unsigned lexicographic comparison; a shorter string sorts before a longer one it prefixes (the contract's `Bytes` order). */
export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}
