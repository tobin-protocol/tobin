// Browser-side wallet sign-in sequence. The wallet and the HTTP calls are injected so the sequence is unit-tested with a labelled MOCK wallet (test only);
// the server challenge and verification are real. Every outcome is a named state with a plain explanation, never an open-ended wait.
import { connectWallet, inspectWallet, SIGN_TIMEOUT_MS, TESTNET_PASSPHRASE, type FreighterLike } from "./freighter.ts";
import type { WalletChallenge } from "../tobin/client.ts";

export type SignInState =
  | "idle" | "detecting" | "unavailable" | "connecting" | "locked" | "wrong-network" | "requesting-challenge"
  | "awaiting-approval" | "verifying" | "authenticated" | "rejected" | "expired" | "failed" | "rate-limited" | "account-changed";

export interface SignInOutcome { state: SignInState; detail: string; address?: string; isNew?: boolean }
export interface SignInDeps {
  api: FreighterLike | undefined;
  challenge: (publicKey: string) => Promise<WalletChallenge>;
  verify: (challengeId: string, signature: string) => Promise<{ isNew: boolean }>;
  onState?: (state: SignInState, detail: string) => void;
  now?: () => number;
  timeoutMs?: number;
}

const isRejection = (m: string) => /reject|declin|denied|cancel|refus/i.test(m);
const short = (k: string) => `${k.slice(0, 6)}…${k.slice(-6)}`;
const statusOf = (e: unknown) => (e as { status?: number }).status;

export async function runWalletSignIn(d: SignInDeps): Promise<SignInOutcome> {
  const say = (state: SignInState, detail: string, extra: Partial<SignInOutcome> = {}): SignInOutcome => { d.onState?.(state, detail); return { state, detail, ...extra }; };
  const now = d.now ?? (() => Date.now());

  say("detecting", "Looking for Freighter…");
  const first = await inspectWallet(d.api);
  if (first.kind === "UNAVAILABLE") return say("unavailable", "Freighter was not found in this browser. Install the Freighter extension, unlock it, and reload this page.");

  say("connecting", "Approve the connection in Freighter…");
  const c = await connectWallet(d.api);
  if (!c.ok) {
    const locked = /lock|unlock|not granted/i.test(c.reason);
    return c.rejected && !locked
      ? say("rejected", "The connection was declined in Freighter. Nothing was signed.")
      : say("locked", `Freighter did not give access: ${c.reason}. Unlock Freighter, choose an account, and try again.`);
  }
  const address = c.address;
  const st = await inspectWallet(d.api);
  if (st.kind === "WRONG_NETWORK") return say("wrong-network", `Freighter is on "${st.network}". Switch it to Stellar Testnet and try again.`, { address });
  if (st.kind !== "READY") return say("locked", "Freighter is not ready. Unlock it and try again.", { address });

  say("requesting-challenge", "Requesting a one-time challenge from Tobin…");
  let ch: WalletChallenge;
  try { ch = await d.challenge(address); }
  catch (e) { return statusOf(e) === 429 ? say("rate-limited", "Too many sign-in requests. Wait a few minutes and try again.", { address }) : say("failed", `Tobin could not issue a challenge: ${(e as Error).message}`, { address }); }

  say("awaiting-approval", "Approve the message in Freighter. It signs no transaction and grants no role.");
  const api = d.api;
  if (!api?.signMessage) return say("failed", "This version of Freighter cannot sign messages.", { address });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((r) => { timer = setTimeout(() => r("timeout"), d.timeoutMs ?? SIGN_TIMEOUT_MS); });
  const signed = await Promise.race([
    api.signMessage(ch.challenge.message, { address, networkPassphrase: TESTNET_PASSPHRASE }).catch((e: unknown) => ({ signedMessage: null, signerAddress: "", error: { message: String((e as Error).message ?? e) } })),
    timedOut,
  ]);
  if (timer) clearTimeout(timer);
  if (signed === "timeout") return say("failed", "Freighter did not answer in time. Nothing was signed. Try again.", { address });
  if (signed.error || !signed.signedMessage) {
    return isRejection(signed.error?.message ?? "") || !signed.error
      ? say("rejected", "The signature was declined in Freighter. Nothing was signed.", { address })
      : say("failed", `Freighter could not sign: ${signed.error.message ?? "unknown error"}`, { address });
  }
  if (signed.signerAddress && signed.signerAddress !== address) return say("account-changed", `Freighter signed with ${short(signed.signerAddress)}, not ${short(address)}. Start again with the account you want to use.`, { address: signed.signerAddress });
  if (now() >= new Date(ch.challenge.expiresAt).getTime()) return say("expired", "The challenge expired before it was signed. Start again.", { address });

  say("verifying", "Tobin is verifying your signature…");
  const signature = typeof signed.signedMessage === "string" ? signed.signedMessage : btoa(String.fromCharCode(...signed.signedMessage));
  try {
    const r = await d.verify(ch.challenge.id, signature);
    return say("authenticated", "Wallet verified.", { address, isNew: r.isNew });
  } catch (e) {
    return statusOf(e) === 429 ? say("rate-limited", "Too many failed attempts. Wait a few minutes and try again.", { address }) : say("failed", "The signature could not be verified. Start again.", { address });
  }
}
