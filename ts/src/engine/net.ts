// Net positions of a frozen obligation set: net = outgoing - incoming, positive = net debtor. Integer-safe (bigint), every sum checked
// against the i128 range exactly as the contract checks it. The input checks mirror what the contract enforces at submission, so an
// obligation set that passes here is one the contract could have frozen.
import { EngineError, checkedAdd, checkedSub, fromHex, toHex, parsePositiveAmount } from '../amount.ts';
import { parseParty } from '../address.ts';
import type { Obligation, NetPosition } from './types.ts';

/** Normalize a raw obligation: parse the amount (strictly positive, i128), lower-case a 32-byte hex id, validate both addresses. */
export function normalizeObligation(o: { id: string; debtor: string; creditor: string; amount: bigint | string }): Obligation {
  if (typeof o.id !== 'string' || !/^[0-9a-fA-F]{64}$/.test(o.id)) throw new EngineError('INVALID_ID', 'an obligation id is 32 bytes as 64 hex characters');
  parseParty(o.debtor);
  parseParty(o.creditor);
  if (o.debtor === o.creditor) throw new EngineError('SAME_PARTY', 'debtor and creditor must differ');
  return { id: toHex(fromHex(o.id)), debtor: o.debtor, creditor: o.creditor, amount: parsePositiveAmount(o.amount) };
}

export function computeNets(participants: readonly string[], obligations: readonly Obligation[]): NetPosition[] {
  const index = new Map<string, number>();
  participants.forEach((p, i) => {
    parseParty(p);
    if (index.has(p)) throw new EngineError('DUPLICATE_PARTICIPANT', `participant listed twice: ${p}`);
    index.set(p, i);
  });
  const out = participants.map(() => 0n);
  const inn = participants.map(() => 0n);
  const seen = new Set<string>();
  let grand = 0n;
  for (const raw of obligations) {
    const o = normalizeObligation(raw);
    if (seen.has(o.id)) throw new EngineError('DUPLICATE_ID', `duplicate obligation id ${o.id}`);
    seen.add(o.id);
    const d = index.get(o.debtor);
    const c = index.get(o.creditor);
    if (d === undefined || c === undefined) throw new EngineError('UNKNOWN_PARTY', `obligation ${o.id} names an address that is not a participant`);
    out[d] = checkedAdd(out[d] as bigint, o.amount);
    inn[c] = checkedAdd(inn[c] as bigint, o.amount);
    grand = checkedAdd(grand, o.amount);
  }
  return participants.map((participant, i) => ({ participant, net: checkedSub(out[i] as bigint, inn[i] as bigint) }));
}

export function allZero(nets: readonly NetPosition[]): boolean {
  return nets.every((n) => n.net === 0n);
}
