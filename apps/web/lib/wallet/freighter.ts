// Freighter wallet access (decision D4: the pinned @stellar/freighter-api 6.0.1; Stellar Wallets Kit is not used).
// The logic and wording follow apps/web-console/lib/stellar/freighter-core.ts and wallet-signin.ts, which are tested there with a labelled mock; they are
// re-expressed here rather than imported because apps/web must not depend on the console's source. This module is NOT tested against the real extension in
// this repository's automated tests; the owner validated signing with Freighter in Edge (MVP-1.5 record), not this app's sign-in screen.
// Rules: a wallet is "connected" only when Freighter itself says so on Testnet; the text that is signed comes from the SERVER; the signature is verified by the
// SERVER; every outcome is a named state; no key or seed phrase is ever seen, stored or requested.

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
export const SIGN_TIMEOUT_MS = 120_000;

interface WalletError { code?: number; message?: string }
type R<T> = Promise<T & { error?: WalletError }>;
export interface FreighterLike {
  isConnected(): R<{ isConnected: boolean }>;
  isAllowed(): R<{ isAllowed: boolean }>;
  requestAccess(): R<{ address: string }>;
  getAddress(): R<{ address: string }>;
  getNetwork(): R<{ network: string; networkPassphrase: string }>;
  signMessage?(message: string, opts?: { networkPassphrase?: string; address?: string }): R<{ signedMessage: string | Uint8Array | null; signerAddress: string }>;
}

export type WalletState =
  | { kind: "UNAVAILABLE"; reason: string }
  | { kind: "NOT_ALLOWED"; reason: string }
  | { kind: "WRONG_NETWORK"; address: string; network: string }
  | { kind: "READY"; address: string; network: string };

const errText = (e: WalletError | undefined) => (e ? `${e.message ?? "wallet error"}${e.code !== undefined ? ` (code ${e.code})` : ""}` : "");
async function safe<T>(f: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  try { return { ok: true, value: await f() }; } catch (e) { return { ok: false, reason: String((e as Error)?.message ?? e) }; }
}

export async function loadFreighter(): Promise<FreighterLike | undefined> {
  try {
    const m = (await import("@stellar/freighter-api")) as unknown as { default?: FreighterLike } & FreighterLike;
    return (m.default ?? m) as FreighterLike;
  } catch { return undefined; }
}

/** Reads the wallet WITHOUT prompting. Only READY means the wallet may be asked to sign. */
export async function inspectWallet(api: FreighterLike | undefined): Promise<WalletState> {
  if (!api) return { kind: "UNAVAILABLE", reason: "the Freighter API is not present in this page" };
  const c = await safe(() => api.isConnected());
  if (!c.ok) return { kind: "UNAVAILABLE", reason: c.reason };
  if (c.value.error || !c.value.isConnected) return { kind: "UNAVAILABLE", reason: c.value.error ? errText(c.value.error) : "Freighter is not installed or did not answer" };
  const a = await safe(() => api.isAllowed());
  if (!a.ok) return { kind: "UNAVAILABLE", reason: a.reason };
  if (a.value.error || !a.value.isAllowed) return { kind: "NOT_ALLOWED", reason: a.value.error ? errText(a.value.error) : "this site has not been granted access in Freighter (or Freighter is locked)" };
  const n = await safe(() => api.getNetwork());
  const ad = await safe(() => api.getAddress());
  if (!n.ok || n.value.error) return { kind: "UNAVAILABLE", reason: n.ok ? errText(n.value.error) : n.reason };
  if (!ad.ok || ad.value.error || !ad.value.address) return { kind: "NOT_ALLOWED", reason: ad.ok ? errText(ad.value.error) || "Freighter returned no address (locked?)" : ad.reason };
  if (n.value.networkPassphrase !== TESTNET_PASSPHRASE) return { kind: "WRONG_NETWORK", address: ad.value.address, network: n.value.network };
  return { kind: "READY", address: ad.value.address, network: n.value.network };
}

/** Asks Freighter to grant this site access (this DOES prompt the user). A refusal is a normal outcome, not an error. */
export async function connectWallet(api: FreighterLike | undefined): Promise<{ ok: true; address: string } | { ok: false; rejected: boolean; reason: string }> {
  if (!api) return { ok: false, rejected: false, reason: "the Freighter API is not present in this page" };
  const r = await safe(() => api.requestAccess());
  if (!r.ok) return { ok: false, rejected: false, reason: r.reason };
  if (r.value.error || !r.value.address) return { ok: false, rejected: true, reason: errText(r.value.error) || "access was not granted" };
  return { ok: true, address: r.value.address };
}
