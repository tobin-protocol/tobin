// Freighter wallet adapter (@stellar/freighter-api 6.0.1). Browser-side. The API object is INJECTED so the logic is testable; in the browser it is the real package.
// Rules: a wallet is "connected" only if Freighter itself says so; nothing is assumed installed, unlocked, on Testnet, or on the expected account; every value the
// wallet returns is VERIFIED (the signed transaction must be the same transaction, carrying a valid signature of the expected key) before it is used.
// Tobin never sees a private key or seed phrase, and this module logs and stores nothing (no signed envelope, no secret).
// NOT TESTED against the real extension: everything here is exercised only with a hand-written MOCK of the API. Real behaviour (prompts, return formats of
// signAuthEntry, AddressV2 support) must be validated by the owner (MVP-1.5-FREIGHTER-OWNER-VALIDATION.md).
import { Buffer } from 'buffer';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';

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

const errText = (e: WalletError | undefined) => (e ? `${e.message ?? 'wallet error'}${e.code !== undefined ? ` (code ${e.code})` : ''}` : '');
async function safe<T>(f: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; reason: string }> { try { return { ok: true, value: await f() }; } catch (e) { return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) }; } }

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

export type SignResult =
  | { ok: true; signedXdr: string; signer: string }
  | { ok: false; kind: 'REJECTED' | 'WALLET_ERROR' | 'NOT_READY' | 'WRONG_SIGNER' | 'TRANSACTION_ALTERED' | 'BAD_SIGNATURE'; reason: string };

/**
 * Asks the wallet to sign ONE transaction and verifies the answer before anything uses it:
 *  - the wallet must be READY on the expected network and account right now;
 *  - the signer reported must be the expected account;
 *  - the returned XDR must be the SAME transaction (identical hash: the hash covers the whole body, so any change to a destination, asset, amount, contract call,
 *    fee, sequence or network is detected) and must carry a valid ed25519 signature by the expected key over that hash.
 * A rejection by the user is returned as REJECTED and changes nothing.
 */
export async function requestTransactionSignature(api: FreighterLike | undefined, unsignedXdr: string, ctx: { passphrase: string; address: string }): Promise<SignResult> {
  const st = await inspectWallet(api, ctx);
  if (st.kind !== 'READY') return { ok: false, kind: 'NOT_READY', reason: `the wallet is not ready: ${st.kind}${'reason' in st ? ` (${st.reason})` : ''}` };
  const r = await safe(() => (api as FreighterLike).signTransaction(unsignedXdr, { networkPassphrase: ctx.passphrase, address: ctx.address }));
  if (!r.ok) return { ok: false, kind: 'WALLET_ERROR', reason: r.reason };
  if (r.value.error) { const msg = errText(r.value.error); return { ok: false, kind: /reject|declin|denied|cancel/i.test(msg) ? 'REJECTED' : 'WALLET_ERROR', reason: msg }; }
  if (!r.value.signedTxXdr) return { ok: false, kind: 'REJECTED', reason: 'the wallet returned no signed transaction' };
  if (r.value.signerAddress !== ctx.address) return { ok: false, kind: 'WRONG_SIGNER', reason: `signed by ${r.value.signerAddress}, expected ${ctx.address}` };
  let want: Buffer; let got: ReturnType<typeof TransactionBuilder.fromXDR>;
  try { want = Buffer.from(TransactionBuilder.fromXDR(unsignedXdr, ctx.passphrase).hash()); got = TransactionBuilder.fromXDR(r.value.signedTxXdr, ctx.passphrase); } catch (e) { return { ok: false, kind: 'TRANSACTION_ALTERED', reason: 'the returned transaction cannot be read: ' + String((e as Error).message).slice(0, 120) }; }
  const have = Buffer.from(got.hash());
  if (!want.equals(have)) return { ok: false, kind: 'TRANSACTION_ALTERED', reason: 'the wallet returned a different transaction than the one that was requested' };
  const kp = Keypair.fromPublicKey(ctx.address);
  // SDK 17 exposes decorated signatures as plain objects; accept either a property or an accessor
  const sigBytes = (sig: { signature: unknown }): Buffer => { const v = sig.signature; const raw = typeof v === 'function' ? (v as () => Uint8Array)() : v instanceof Uint8Array ? v : (v as { value: Uint8Array }).value; return Buffer.from(raw); };
  const valid = (got as unknown as { signatures: { signature: unknown }[] }).signatures.some((x) => { try { return kp.verify(have, sigBytes(x)); } catch { return false; } });
  if (!valid) return { ok: false, kind: 'BAD_SIGNATURE', reason: 'the returned transaction carries no valid signature by the expected account' };
  return { ok: true, signedXdr: r.value.signedTxXdr, signer: ctx.address };
}
