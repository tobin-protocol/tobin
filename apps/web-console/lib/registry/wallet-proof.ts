// Wallet ownership proof (pure). A connected wallet, or a public key typed into a form, proves NOTHING. Control of a Stellar key is shown by an ed25519 signature
// over a one-time challenge that names the organization, the user, the network and the key, and that expires quickly. Verification is done HERE, server-side.
// Two signature schemes are accepted, each checked exactly:
//   raw     ed25519 signature over the UTF-8 bytes of the challenge message
//   sep-53  ed25519 signature over SHA-256("Stellar Signed Message:\n" + message)   (the SEP-53 message-signing format, as understood here)
// NOT TESTED against any real wallet: whether Freighter or another wallet produces exactly these bytes is unverified (see the wallet and signing document).
import { createHash, createPublicKey, verify as edVerify } from 'node:crypto';
import { decodeAddress } from 'tobin-mvp1-sdk/strkey';

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export type Scheme = 'raw' | 'sep-53';
export interface ChallengeFields { orgId: string; userId: string; network: string; publicKey: string; nonce: string; issuedAt: string; expiresAt: string }

/** The exact text the key holder signs. Every binding is inside it, so a signature cannot be moved to another organization, user, network or key. */
export const challengeMessage = (f: ChallengeFields): string =>
  ['Tobin wallet ownership challenge v1', `organization: ${f.orgId}`, `user: ${f.userId}`, `network: ${f.network}`, `public key: ${f.publicKey}`, `nonce: ${f.nonce}`, `issued: ${f.issuedAt}`, `expires: ${f.expiresAt}`, 'This signs no transaction and authorizes no payment.'].join('\n');

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
export function isStellarAccount(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  try { return decodeAddress(s).kind === 'account'; } catch { return false; }
}

/** True only if `signatureB64` is a valid ed25519 signature by `publicKey` under `scheme`. Never throws. */
export function verifyChallengeSignature(publicKey: string, message: string, signatureB64: string, scheme: Scheme): boolean {
  try {
    if (!isStellarAccount(publicKey) || (scheme !== 'raw' && scheme !== 'sep-53')) return false;
    if (typeof signatureB64 !== 'string' || signatureB64.length > 200 || !/^[A-Za-z0-9+/]+={0,2}$/.test(signatureB64)) return false;
    const sig = Buffer.from(signatureB64, 'base64');
    if (sig.length !== 64) return false;
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(decodeAddress(publicKey).key)]), format: 'der', type: 'spki' });
    const data = scheme === 'raw' ? Buffer.from(message, 'utf8') : createHash('sha256').update(Buffer.from(`Stellar Signed Message:\n${message}`, 'utf8')).digest();
    return edVerify(null, data, key, sig);
  } catch { return false; }
}
