// Freighter wallet adapter (@stellar/freighter-api 6.0.1). Browser-side. The API object is INJECTED so the logic is testable; in the browser it is the real package.
// Rules: a wallet is "connected" only if Freighter itself says so; nothing is assumed installed, unlocked, on Testnet, or on the expected account; every value the
// wallet returns is VERIFIED (the signed transaction must be the same transaction, carrying a valid signature of the expected key) before it is used.
// Tobin never sees a private key or seed phrase, and this module logs and stores nothing (no signed envelope, no secret).
// NOT TESTED against the real extension: everything here is exercised only with a hand-written MOCK of the API. Real behaviour (prompts, return formats of
// signAuthEntry, AddressV2 support) must be validated by the owner (MVP-1.5-FREIGHTER-OWNER-VALIDATION.md).
import { Buffer } from 'buffer';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { errText, inspectWallet, safe } from './freighter-core.ts';
import type { FreighterLike } from './freighter-core.ts';

// The wallet detection and connection helpers live in freighter-core.ts (no SDK); they are re-exported here so existing imports keep working.
export * from './freighter-core.ts';

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
