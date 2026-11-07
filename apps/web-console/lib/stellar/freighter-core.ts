// Freighter wallet adapter (@stellar/freighter-api 6.0.1). Browser-side. The API object is INJECTED so the logic is testable; in the browser it is the real package.
// Rules: a wallet is "connected" only if Freighter itself says so; nothing is assumed installed, unlocked, on Testnet, or on the expected account; every value the
// wallet returns is VERIFIED (the signed transaction must be the same transaction, carrying a valid signature of the expected key) before it is used.
// Tobin never sees a private key or seed phrase, and this module logs and stores nothing (no signed envelope, no secret).
// NOT TESTED against the real extension: everything here is exercised only with a hand-written MOCK of the API. Real behaviour (prompts, return formats of
// signAuthEntry, AddressV2 support) must be validated by the owner (MVP-1.5-FREIGHTER-OWNER-VALIDATION.md).
// NOTE: this module has no dependency on the Stellar SDK on purpose, so that screens that only look at the wallet (for example the sign-in page) do not download it. Signing lives in freighter.ts.

export interface WalletError { code?: number; message?: string }
type R<T> = Promise<T & { error?: WalletError }>;
/** The subset of the Freighter API this adapter uses (signatures as published in @stellar/freighter-api 6.0.1). */
export interface FreighterLike {
  isConnected(): R<{ isConnected: boolean }>;
  isAllowed(): R<{ isAllowed: boolean }>;
  requestAccess(): R<{ address: string }>;
  getAddress(): R<{ address: string }>;
  getNetwork(): R<{ network: string; networkPassphrase: string }>;
  signTransaction(xdr: string, opts?: { networkPassphrase?: string; address?: string }): R<{ signedTxXdr: string; signerAddress: string }>;
  signAuthEntry(entryXdr: string, opts?: { networkPassphrase?: string; address?: string }): R<{ signedAuthEntry: string | null; signerAddress: string }>;
}

export type WalletState =
  | { kind: 'UNAVAILABLE'; reason: string }          // no extension, or it did not answer
  | { kind: 'NOT_ALLOWED'; reason: string }          // installed, but the user has not granted this site access (or the wallet is locked)
  | { kind: 'WRONG_NETWORK'; address: string; network: string; passphrase: string }
  | { kind: 'ACCOUNT_MISMATCH'; address: string; expected: string }
  | { kind: 'READY'; address: string; network: string; passphrase: string };

const isEdge = (ua: string) => /\bEdg\//.test(ua);
export const browserName = (ua: string): 'Edge' | 'Chrome' | 'Firefox' | 'Safari' | 'other' => (isEdge(ua) ? 'Edge' : /\bFirefox\//.test(ua) ? 'Firefox' : /\bChrome\//.test(ua) ? 'Chrome' : /\bSafari\//.test(ua) ? 'Safari' : 'other');

export const errText = (e: WalletError | undefined) => (e ? `${e.message ?? 'wallet error'}${e.code !== undefined ? ` (code ${e.code})` : ''}` : '');
export async function safe<T>(f: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; reason: string }> { try { return { ok: true, value: await f() }; } catch (e) { return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) }; } }

/**
 * Reads the wallet state WITHOUT prompting (no access request). The caller supplies what the execution context requires: the network passphrase and, optionally,
 * the exact account. Only READY means the wallet may be asked to sign.
 */
export async function inspectWallet(api: FreighterLike | undefined, expected: { passphrase: string; address?: string }): Promise<WalletState> {
  if (!api) return { kind: 'UNAVAILABLE', reason: 'the Freighter API is not present in this page' };
  const c = await safe(() => api.isConnected());
  if (!c.ok) return { kind: 'UNAVAILABLE', reason: c.reason };
  if (c.value.error || !c.value.isConnected) return { kind: 'UNAVAILABLE', reason: c.value.error ? errText(c.value.error) : 'Freighter is not installed or did not answer' };
  const a = await safe(() => api.isAllowed());
  if (!a.ok) return { kind: 'UNAVAILABLE', reason: a.reason };
  if (a.value.error || !a.value.isAllowed) return { kind: 'NOT_ALLOWED', reason: a.value.error ? errText(a.value.error) : 'this site has not been granted access in Freighter (or Freighter is locked)' };
  const n = await safe(() => api.getNetwork()); const ad = await safe(() => api.getAddress());
  if (!n.ok || n.value.error) return { kind: 'UNAVAILABLE', reason: n.ok ? errText(n.value.error) : n.reason };
  if (!ad.ok || ad.value.error || !ad.value.address) return { kind: 'NOT_ALLOWED', reason: ad.ok ? errText(ad.value.error) || 'Freighter returned no address (locked?)' : ad.reason };
  if (n.value.networkPassphrase !== expected.passphrase) return { kind: 'WRONG_NETWORK', address: ad.value.address, network: n.value.network, passphrase: n.value.networkPassphrase };
  if (expected.address && ad.value.address !== expected.address) return { kind: 'ACCOUNT_MISMATCH', address: ad.value.address, expected: expected.address };
  return { kind: 'READY', address: ad.value.address, network: n.value.network, passphrase: n.value.networkPassphrase };
}

/** Asks Freighter to grant this site access (this DOES prompt the user). A refusal is a normal outcome, not an error. */
export async function connectWallet(api: FreighterLike | undefined): Promise<{ ok: true; address: string } | { ok: false; rejected: boolean; reason: string }> {
  if (!api) return { ok: false, rejected: false, reason: 'the Freighter API is not present in this page' };
  const r = await safe(() => api.requestAccess());
  if (!r.ok) return { ok: false, rejected: false, reason: r.reason };
  if (r.value.error || !r.value.address) return { ok: false, rejected: true, reason: errText(r.value.error) || 'access was not granted' };
  return { ok: true, address: r.value.address };
}
