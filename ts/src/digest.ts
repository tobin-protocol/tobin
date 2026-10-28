// MVP-1 canonical bytes and digests, WORKING VERSION 1: a TypeScript encoding of exactly what `clearing/src/lib.rs` computes
// (`header`, `obligation_bytes`, `proposal_bytes_of`). The exact bytes are NOT founder-approved (DB-09/EQ-06): this module implements the
// current working version and claims nothing more. It is unrelated to, and must never be confused with, the provisional v0.2
// `commitment_digest` (different tags, different construction, no compatibility).
//
// Primitives: u32 and i128 big-endian (i128 is 16 bytes, two's complement); ids are 32 raw bytes; an address is ONE length byte (44 for an
// account, 40 for a contract) followed by the XDR of ScVal::Address; a collection is a u32 count followed by its elements; a domain tag is
// ONE length byte followed by ASCII.
//
//   obligation_bytes = tag "TOBIN-MVP1/OBLIGATIONS/v2" | version u32=2 | network id (32) | clearing contract id (32) | session id (32)
//                      | token contract id (32) | participants (ascending by XDR bytes) | obligations (strictly ascending by id)
//                      each obligation = id (32) | debtor address | creditor address | amount (16)
//   proposal_bytes   = tag "TOBIN-MVP1/SETTLEMENT/v2" | version | network id | clearing contract id | session id | token contract id
//                      | obligation commitment (32) | revision u32 (starts at 1, +1 per accepted proposal, never reused) | instructions exactly as submitted, each = payer address | payee address | amount (16)
//   obligation commitment = SHA-256(obligation_bytes);  proposal digest = SHA-256(proposal_bytes)
import { EngineError, concat, fromHex, i128ToBytes, u32ToBytes, compareBytes, parsePositiveAmount } from './amount.ts';
import { parseParty } from './address.ts';
import { sha256 } from './sha256.ts';
import type { Instruction, Obligation } from './engine/types.ts';

// Version 2 (EQ-05): the proposal REVISION is bound into the proposal digest. Version 1 had no revision field and tags .../v1; its bytes are
// superseded and are not accepted anywhere. Still a working version pending the founder's DB-09 review.
export const DIGEST_VERSION = 2;
export const DOMAIN_OBLIGATIONS = 'TOBIN-MVP1/OBLIGATIONS/v2';
export const DOMAIN_SETTLEMENT = 'TOBIN-MVP1/SETTLEMENT/v2';

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

/** What every digest of one session binds besides its own content. `networkId` is the 32-byte network id (SHA-256 of the passphrase). */
export interface DigestContext {
  networkId: Uint8Array;
  /** the clearing contract (C...) */
  contract: string;
  /** the session id, 64 hex characters */
  sessionId: string;
  /** the session token contract (C...) */
  token: string;
}

function rawContractId(addr: string): Uint8Array {
  const p = parseParty(addr);
  if (p.kind !== 'contract') throw new EngineError('INVALID_ADDRESS', `a contract address (C...) is required, got ${addr.slice(0, 8)}...`);
  return p.key;
}

function id32(hex: string): Uint8Array {
  const b = fromHex(hex);
  if (b.length !== 32) throw new EngineError('INVALID_ID', 'an id is 32 bytes');
  return b;
}

function domain(tag: string): Uint8Array {
  return concat(new Uint8Array([tag.length]), ascii(tag));
}

function address(addr: string): Uint8Array {
  const p = parseParty(addr);
  return concat(new Uint8Array([p.xdr.length]), p.xdr);
}

function header(tag: string, ctx: DigestContext): Uint8Array {
  if (ctx.networkId.length !== 32) throw new EngineError('INVALID_ID', 'the network id is 32 bytes');
  return concat(domain(tag), u32ToBytes(DIGEST_VERSION), ctx.networkId, rawContractId(ctx.contract), id32(ctx.sessionId), rawContractId(ctx.token));
}

/** The canonical obligation bytes. Participants and obligations are sorted here, so the order they are given in does not matter. */
export function obligationBytes(ctx: DigestContext, participants: readonly string[], obligations: readonly Obligation[]): Uint8Array {
  const ps = participants.map((p) => parseParty(p).xdr).sort(compareBytes);
  for (let i = 1; i < ps.length; i++) {
    if (compareBytes(ps[i - 1] as Uint8Array, ps[i] as Uint8Array) === 0) throw new EngineError('DUPLICATE_PARTICIPANT', 'duplicate participant');
  }
  const os = [...obligations].map((o) => ({ ...o, idBytes: id32(o.id) })).sort((a, b) => compareBytes(a.idBytes, b.idBytes));
  for (let i = 1; i < os.length; i++) {
    if (compareBytes((os[i - 1] as { idBytes: Uint8Array }).idBytes, (os[i] as { idBytes: Uint8Array }).idBytes) === 0) throw new EngineError('DUPLICATE_ID', 'duplicate obligation id');
  }
  const parts: Uint8Array[] = [header(DOMAIN_OBLIGATIONS, ctx), u32ToBytes(ps.length)];
  for (const x of ps) parts.push(new Uint8Array([x.length]), x);
  parts.push(u32ToBytes(os.length));
  for (const o of os) parts.push(o.idBytes, address(o.debtor), address(o.creditor), i128ToBytes(parsePositiveAmount(o.amount)));
  return concat(...parts);
}

export function obligationCommitment(ctx: DigestContext, participants: readonly string[], obligations: readonly Obligation[]): Uint8Array {
  return sha256(obligationBytes(ctx, participants, obligations));
}

/** The canonical proposal bytes. The instructions are encoded exactly in the order given (the contract requires its own order and rejects
 *  any other, so a plan in another order is invalid, not re-sorted). */
export function proposalBytes(ctx: DigestContext, commitment: Uint8Array, revision: number, instructions: readonly Instruction[]): Uint8Array {
  if (commitment.length !== 32) throw new EngineError('INVALID_ID', 'the obligation commitment is 32 bytes');
  if (!Number.isInteger(revision) || revision < 1) throw new EngineError('INVALID_ID', 'a proposal revision is a whole number from 1');
  const parts: Uint8Array[] = [header(DOMAIN_SETTLEMENT, ctx), commitment, u32ToBytes(revision), u32ToBytes(instructions.length)];
  for (const i of instructions) parts.push(address(i.payer), address(i.payee), i128ToBytes(parsePositiveAmount(i.amount)));
  return concat(...parts);
}

export function proposalDigest(ctx: DigestContext, commitment: Uint8Array, revision: number, instructions: readonly Instruction[]): Uint8Array {
  return sha256(proposalBytes(ctx, commitment, revision, instructions));
}
