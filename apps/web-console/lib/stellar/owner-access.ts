// Who may drive the owner-run Testnet tools (/cosign-check, /settle-run). Wallet sign-in is open to any wallet, so being signed in must NOT be enough: the acting user needs an
// ACTIVE, VERIFIED wallet that is one of the administrative account's configured signers, the administrative account itself, or the configured second participant account.
// This is an access gate for tooling only. It is not an institutional role and not a Stellar authorization: the transactions still need the real signatures.
import type { ActingUser } from '../registry/identity.ts';
import { readPolicy } from './cosign.ts';

export function ownerToolAccounts(env: Record<string, string | undefined> = process.env): Set<string> {
  const out = new Set<string>();
  try { const p = readPolicy(); out.add(p.account); for (const r of p.required) out.add(r.key); } catch { /* no policy record: nobody qualifies through it */ }
  const second = env['TOBIN_SECOND_ACCOUNT']?.trim(); if (second) out.add(second);
  return out;
}
export function ownerToolsAllowed(user: ActingUser, accounts: Set<string> = ownerToolAccounts()): boolean {
  return (user.wallets ?? []).some((w) => accounts.has(w));
}
