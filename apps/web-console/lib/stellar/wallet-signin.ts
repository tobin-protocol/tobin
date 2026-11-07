// Browser-side wallet sign-in sequence (Freighter). The wallet and the HTTP calls are INJECTED, so the logic is testable with a labelled MOCK wallet while the server verification is real.
// Rules: a wallet counts as connected only when Freighter itself says so on the expected network; the text that is signed comes from the SERVER (never composed here); the signature is
// verified by the SERVER (never here); every outcome is a named state with a plain explanation, never an open-ended wait; nothing is stored in the browser and no key is ever seen.
import { Buffer } from 'buffer';
import { connectWallet, inspectWallet } from './freighter-core.ts';
import type { FreighterLike } from './freighter-core.ts';

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
export const SIGN_TIMEOUT_MS = 120_000;

export type SignInState =
  | 'initial' | 'detecting' | 'unavailable' | 'connecting' | 'locked' | 'wrong-network' | 'requesting-challenge'
  | 'awaiting-approval' | 'verifying' | 'authenticated' | 'rejected' | 'expired' | 'failed' | 'rate-limited' | 'account-changed' | 'network-changed';

export interface SignInOutcome { state: SignInState; detail: string; address?: string; response?: unknown }
export interface PostError extends Error { status?: number; code?: string }
export interface SignInDeps {
  api: FreighterLike | undefined;
  post: <T>(path: string, body: unknown) => Promise<T>;
  onState?: (state: SignInState, detail: string) => void;
  now?: () => number;
  timeoutMs?: number;
  /** the request path prefix: '/api/auth/wallet' for sign-in, '/api/auth/wallet/link' for adding a wallet */
  base?: string;
  /** adding a wallet needs the wallet that is active to be the NEW one; sign-in accepts whichever account Freighter has active */
  expectAddress?: string;
}

/** Freighter's `signMessage` result as exposed by @stellar/freighter-api 6 (a base64 string; 3.x returned bytes). */
type Signed = string | Uint8Array | null;
type SignerLike = FreighterLike & { signMessage?: (message: string, opts?: { networkPassphrase?: string; address?: string }) => Promise<{ signedMessage: Signed; signerAddress: string; error?: { message?: string; code?: number } }> };

const isRejection = (msg: string) => /reject|declin|denied|cancel|refus/i.test(msg);
const short = (k: string) => `${k.slice(0, 6)}…${k.slice(-6)}`;

export async function runWalletSignIn(d: SignInDeps): Promise<SignInOutcome> {
  const say = (state: SignInState, detail: string, extra: Partial<SignInOutcome> = {}): SignInOutcome => { d.onState?.(state, detail); return { state, detail, ...extra }; };
  const now = d.now ?? (() => Date.now());
  const base = d.base ?? '/api/auth/wallet';
  const api = d.api as SignerLike | undefined;

  say('detecting', 'Looking for Freighter…');
  const first = await inspectWallet(api, { passphrase: TESTNET_PASSPHRASE });
  if (first.kind === 'UNAVAILABLE') return say('unavailable', 'Freighter was not found in this browser. Install the Freighter extension, unlock it, and reload this page.');

  say('connecting', 'Approve the connection in Freighter…');
  const c = await connectWallet(api);
  if (!c.ok) {
    // an empty answer or a message about locking means Freighter is locked or has no account selected; an explicit refusal is the user's decision
    const locked = /lock|unlock|not granted/i.test(c.reason);
    return c.rejected && !locked ? say('rejected', 'The connection was declined in Freighter. Nothing was signed.') : say('locked', 'Freighter did not give access: ' + c.reason + '. Unlock Freighter, choose an account, and try again.');
  }
  const address = c.address;
  if (!address) return say('locked', 'Freighter returned no account. Unlock Freighter, choose an account, and try again.');
  if (d.expectAddress && address !== d.expectAddress) return say('account-changed', `Freighter is on ${short(address)}, but you asked to add ${short(d.expectAddress)}. Switch Freighter to that account and try again.`, { address });
  const st = await inspectWallet(api, { passphrase: TESTNET_PASSPHRASE, address });
  if (st.kind === 'WRONG_NETWORK') return say('wrong-network', `Freighter is on "${st.network}". Switch it to Stellar Testnet and try again.`, { address });
  if (st.kind !== 'READY') return say('locked', 'Freighter is not ready' + ('reason' in st ? ': ' + st.reason : '') + '. Unlock it and try again.', { address });

  say('requesting-challenge', 'Requesting a one-time challenge from Tobin…');
  let ch: { challenge: { id: string; message: string; expiresAt: string } };
  try { ch = await d.post(base + '/challenge', { publicKey: address, network: 'testnet' }); }
  catch (e) { const pe = e as PostError; return pe.status === 429 ? say('rate-limited', 'Too many sign-in requests. Wait a few minutes and try again.', { address }) : say('failed', 'Tobin could not issue a challenge: ' + (pe.message ?? 'unknown error'), { address }); }

  say('awaiting-approval', 'Approve the message in Freighter. It signs no transaction and grants no role.');
  if (!api?.signMessage) return say('failed', 'This version of Freighter cannot sign messages.', { address });
  const timeoutMs = d.timeoutMs ?? SIGN_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((r) => { timer = setTimeout(() => r('timeout'), timeoutMs); });
  const signed = await Promise.race([api.signMessage(ch.challenge.message, { address, networkPassphrase: TESTNET_PASSPHRASE }).catch((e: unknown) => ({ signedMessage: null as Signed, signerAddress: '', error: { message: String((e as Error).message ?? e) } })), timedOut]);
  if (timer) clearTimeout(timer);
  if (signed === 'timeout') return say('failed', 'Freighter did not answer in time. Nothing was signed. Try again.', { address });
  if (signed.error || !signed.signedMessage) return isRejection(signed.error?.message ?? '') || !signed.error ? say('rejected', 'The signature was declined in Freighter. Nothing was signed.', { address }) : say('failed', 'Freighter could not sign: ' + (signed.error.message ?? 'unknown error'), { address });
  if (signed.signerAddress && signed.signerAddress !== address) return say('account-changed', `Freighter signed with ${short(signed.signerAddress)}, not ${short(address)}. Start again with the account you want to use.`, { address: signed.signerAddress });
  if (now() >= new Date(ch.challenge.expiresAt).getTime()) return say('expired', 'The challenge expired before it was signed. Start again.', { address });

  say('verifying', 'Tobin is verifying your signature…');
  const signature = typeof signed.signedMessage === 'string' ? signed.signedMessage : Buffer.from(signed.signedMessage).toString('base64');
  try {
    const response = await d.post<unknown>(base + '/verify', { challengeId: ch.challenge.id, signature, scheme: 'sep-53' });
    return say('authenticated', 'Wallet verified.', { address, response });
  } catch (e) {
    const pe = e as PostError;
    if (pe.status === 429) return say('rate-limited', 'Too many failed attempts. Wait a few minutes and try again.', { address });
    return say('failed', 'The signature could not be verified. Start again.', { address });
  }
}

/** One look at Freighter WITHOUT prompting: used to notice that the user switched account or network after signing in. */
export type WalletWatch = { kind: 'ok'; address: string } | { kind: 'account-changed'; address: string } | { kind: 'network-changed'; network: string } | { kind: 'unavailable' };
export async function watchWallet(api: FreighterLike | undefined, knownAddresses: readonly string[]): Promise<WalletWatch> {
  const st = await inspectWallet(api, { passphrase: TESTNET_PASSPHRASE });
  if (st.kind === 'UNAVAILABLE' || st.kind === 'NOT_ALLOWED') return { kind: 'unavailable' };
  if (st.kind === 'WRONG_NETWORK') return { kind: 'network-changed', network: st.network };
  return knownAddresses.includes(st.address) ? { kind: 'ok', address: st.address } : { kind: 'account-changed', address: st.address };
}

export async function loadFreighter(): Promise<FreighterLike | undefined> {
  try { const m = (await import('@stellar/freighter-api')) as unknown as { default?: FreighterLike } & FreighterLike; return (m.default ?? m) as FreighterLike; } catch { return undefined; }
}
