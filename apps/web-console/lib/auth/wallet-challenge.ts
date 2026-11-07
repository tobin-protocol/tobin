// Wallet sign-in challenge text (pure). The text a wallet signs is rebuilt on the server from the stored challenge row, so a client can never choose what was signed.
// Every binding is inside the text: the purpose (sign-in or adding a wallet), the site (domain), the network, the key, the user (when adding a wallet), a nonce and the validity window.
// Signing it proves control of the key and nothing else: it is not a transaction and not an institutional credential.
export type ChallengePurpose = 'sign-in' | 'link-wallet';
export const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const AUTH_NETWORK = 'testnet' as const;

export interface AuthChallengeFields {
  purpose: ChallengePurpose;
  domain: string;
  network: string;
  publicKey: string;
  /** only for 'link-wallet' */
  userId?: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export const authChallengeMessage = (f: AuthChallengeFields): string => [
  f.purpose === 'sign-in' ? 'Tobin wallet sign-in v1' : 'Tobin add-wallet v1',
  `domain: ${f.domain}`,
  `purpose: ${f.purpose}`,
  `network: ${f.network}`,
  `public key: ${f.publicKey}`,
  ...(f.purpose === 'link-wallet' ? [`user: ${f.userId ?? ''}`] : []),
  `nonce: ${f.nonce}`,
  `issued: ${f.issuedAt}`,
  `expires: ${f.expiresAt}`,
  'This signs no transaction and authorizes no payment. It proves control of this key only and grants no role or permission.',
].join('\n');
