// Shared, read-only helpers for the Testnet administrative multisig scripts. Public data only: nothing here reads, asks for, stores or prints a
// secret key, and nothing here signs or submits a transaction. Testnet only: the Horizon endpoint and the passphrase are fixed constants.
import { readFileSync } from 'node:fs';
import { isPublicKey } from '../accounts/check-accounts.mjs';

export { isPublicKey };
export const HORIZON = 'https://horizon-testnet.stellar.org';
export const PASSPHRASE = 'Test SDF Network ; September 2015';
export const MANIFEST = 'accounts/testnet-admin.json';
export const THRESHOLDS = { low: 5, medium: 6, high: 7 };
export const WEIGHTS = { founder: 5, technical: 2, security: 1 };
/** The existing deployer / legacy token minter. It must never be touched by this tooling. */
export const LEGACY_DEPLOYER = 'GD5ESAZOA4RTEHWDJ4RVYH3TG4DJZFX7OGHXXNHVVDA7G77CD5DQNYPQ';

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function arg(name, argv = process.argv.slice(2)) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Read-only account lookup. Returns { state: 'exists' | 'not-found' | 'error', account?, detail? }. A missing account is not an invalid key. */
export async function lookup(id) {
  if (!isPublicKey(id)) return { state: 'error', detail: 'not a valid public key' };
  let res;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    res = await fetch(`${HORIZON}/accounts/${id}`, { signal: ctl.signal });
  } catch (e) {
    return { state: 'error', detail: `network: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
  const body = await res.text(); // always read the body so the connection closes cleanly
  if (res.status === 404) return { state: 'not-found' };
  if (!res.ok) return { state: 'error', detail: `Horizon ${res.status}` };
  return { state: 'exists', account: JSON.parse(body) };
}

/** The weight table of the signers on a Horizon account, without the master key. */
export function onChainSignerWeights(account) {
  const m = {};
  for (const s of account.signers) if (s.type === 'ed25519_public_key') m[s.key] = s.weight;
  return m;
}

/**
 * The ordered plan to configure a dedicated administrative account. Pure: it only builds data. Executing it needs explicit authorization,
 * the account's funding, and the signatures named in each step.
 *
 * Step 1 is ONE transaction with every operation, so it either applies completely or not at all (no half-configured account). While
 * thresholds are still 0 the master key (weight 1) is enough to sign it. Once it succeeds the new thresholds apply to every later transaction.
 * The master key keeps weight 1 until step 3.
 */
export function buildPlan({ account, signers, thresholds = THRESHOLDS }) {
  const problems = [];
  if (!isPublicKey(account)) problems.push('account is not a valid public key');
  if (account === LEGACY_DEPLOYER) problems.push('the legacy deployer must not be used as the administrative account');
  const roles = ['founder', 'technical', 'security'];
  for (const r of roles) if (!isPublicKey(signers[r])) problems.push(`${r} signer public key is missing or invalid`);
  const keys = roles.map((r) => signers[r]);
  if (new Set(keys).size !== 3) problems.push('signer public keys must be distinct');
  if (keys.includes(account)) problems.push('the account must not be one of its own signers');
  if (keys.includes(LEGACY_DEPLOYER)) problems.push('the legacy deployer must not be a signer');
  if (problems.length) return { problems, steps: [] };
  const steps = [
    {
      id: 1,
      title: 'Add the three signers and set the thresholds (one atomic transaction)',
      source: account,
      operations: [
        ...roles.map((r) => ({ type: 'setOptions', signer: signers[r], weight: WEIGHTS[r], role: r })),
        { type: 'setOptions', lowThreshold: thresholds.low, medThreshold: thresholds.medium, highThreshold: thresholds.high },
      ],
      signedBy: 'the account master key (weight 1; thresholds are 0 at this point)',
      effect: 'Founder 5, Technical 2, Security 1; thresholds 5/6/7. The master key keeps weight 1, so it counts as an extra weight-1 signer until step 3.',
      requiresApproval: true,
    },
    {
      id: 2,
      title: 'Verify (read-only, then harmless signing checks)',
      signedBy: 'read-only; the signing checks use Founder alone, Founder + Security, Founder + Technical and Technical + Security',
      effect: 'Compare the on-chain account with the manifest, then prove each combination with safe operations.',
      requiresApproval: false,
    },
    {
      id: 3,
      title: 'Disable the master key (only after step 2, recovery arrangements and the founder\'s explicit approval)',
      source: account,
      operations: [{ type: 'setOptions', masterWeight: 0 }],
      signedBy: 'Founder + Technical (weight 7, the high threshold)',
      effect: 'The account is then controlled only by the three signers. Irreversible without them.',
      requiresApproval: true,
    },
  ];
  return { problems: [], steps };
}

/** Compare a Horizon account with the intended configuration; returns a list of { check, ok, detail }. */
export function compareAccount(account, signers, thresholds = THRESHOLDS, { masterDisabled = null } = {}) {
  const w = onChainSignerWeights(account);
  const rows = [];
  for (const r of ['founder', 'technical', 'security']) {
    rows.push({ check: `${r} weight`, ok: w[signers[r]] === WEIGHTS[r], detail: `on-chain ${w[signers[r]] ?? 'absent'}, expected ${WEIGHTS[r]}` });
  }
  const t = account.thresholds;
  // Horizon names the medium threshold "med_threshold".
  for (const [k, field] of [['low', 'low_threshold'], ['medium', 'med_threshold'], ['high', 'high_threshold']]) {
    rows.push({ check: `${k} threshold`, ok: t[field] === thresholds[k], detail: `on-chain ${t[field]}, expected ${thresholds[k]}` });
  }
  const expected = new Set(Object.values(signers));
  const extras = Object.keys(w).filter((k) => k !== account.account_id && !expected.has(k));
  rows.push({ check: 'no unexpected signers', ok: extras.length === 0, detail: extras.length ? `unexpected: ${extras.join(', ')}` : 'none' });
  const master = w[account.account_id];
  if (masterDisabled !== null) rows.push({ check: 'master key', ok: masterDisabled ? master === 0 : master > 0, detail: `weight ${master}` });
  return rows;
}
