// Addresses as the contract sees them: the XDR of `ScVal::Address` (44 bytes for an account, 40 for a contract), used for the
// contract's byte ordering and inside the digests.
import { compareBytes, concat } from './amount.ts';
import { decodeAddress } from './strkey.ts';
import type { AddressKind } from './strkey.ts';

export interface Party {
  str: string;
  kind: AddressKind;
  key: Uint8Array;
  /** XDR of ScVal::Address: 00000012 | ScAddress type (0 account, 1 contract) | [PublicKey type 0 for an account] | 32 bytes */
  xdr: Uint8Array;
}

const cache = new Map<string, Party>();

export function parseParty(s: string): Party {
  const hit = cache.get(s);
  if (hit) return hit;
  const { kind, key } = decodeAddress(s);
  const head = kind === 'account' ? new Uint8Array([0, 0, 0, 0x12, 0, 0, 0, 0, 0, 0, 0, 0]) : new Uint8Array([0, 0, 0, 0x12, 0, 0, 0, 1]);
  const p: Party = { str: s, kind, key, xdr: concat(head, key) };
  cache.set(s, p);
  return p;
}

/** The contract's order of addresses: unsigned lexicographic comparison of the XDR bytes (an account sorts before a contract). */
export function compareAddresses(a: string, b: string): number {
  return compareBytes(parseParty(a).xdr, parseParty(b).xdr);
}
