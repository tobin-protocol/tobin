// Canonical, network-aware asset identity (schema tobin-asset/v1). The ONE representation used by obligations, calculation snapshots, settlement batches and
// instructions, and by any later transaction construction, verification and reconciliation. A human-readable asset CODE is never an identity.
//   native    testnet:native                 (XLM on that network)
//   issued    testnet:USD:G...ISSUER         (classic asset: network + code + issuer; a different issuer is a different asset)
//   contract  testnet:contract:C...ID        (a Soroban token contract: what the deployed clearing contract actually settles in)
// Testnet and public (Mainnet) identities are never interchangeable. Serialization is strict: parse(format(x)) === x, and anything else is rejected.
// Nothing here queries a network: an identity says what an asset IS, not that it exists, is available, liquid or transferable.
import { decodeAddress } from 'tobin-mvp1-sdk/strkey';

export const ASSET_SCHEMA = 'tobin-asset/v1';
export type Network = 'testnet' | 'public';
export const NETWORKS: readonly Network[] = ['testnet', 'public'];
export type AssetIdentity =
  | { network: Network; kind: 'native' }
  | { network: Network; kind: 'issued'; code: string; issuer: string }
  | { network: Network; kind: 'contract'; contractId: string };

export class AssetIdentityError extends Error { constructor(message: string) { super(message); this.name = 'AssetIdentityError'; } }

const CODE = /^[A-Z0-9]{1,12}$/;
function account(s: string, what: string): string {
  try { if (decodeAddress(s).kind !== 'account') throw new Error('x'); } catch { throw new AssetIdentityError(`${what} is not a valid Stellar account address`); }
  return s;
}
function contract(s: string): string {
  try { if (decodeAddress(s).kind !== 'contract') throw new Error('x'); } catch { throw new AssetIdentityError('the token is not a valid Soroban contract address'); }
  return s;
}
const network = (s: unknown): Network => { if (s === 'testnet' || s === 'public') return s; throw new AssetIdentityError('network must be testnet or public'); };

/** Validates an identity object (untrusted input) and returns a clean copy. */
export function validateAsset(a: unknown): AssetIdentity {
  if (typeof a !== 'object' || a === null) throw new AssetIdentityError('an asset identity is an object');
  const o = a as Record<string, unknown>;
  const net = network(o['network']);
  if (o['kind'] === 'native') { if (Object.keys(o).some((k) => !['network', 'kind'].includes(k))) throw new AssetIdentityError('a native asset has no code, issuer or contract'); return { network: net, kind: 'native' }; }
  if (o['kind'] === 'issued') {
    if (typeof o['code'] !== 'string' || !CODE.test(o['code'])) throw new AssetIdentityError('asset code must be 1 to 12 upper-case letters or digits');
    if (typeof o['issuer'] !== 'string') throw new AssetIdentityError('an issued asset needs an issuer');
    if (Object.keys(o).some((k) => !['network', 'kind', 'code', 'issuer'].includes(k))) throw new AssetIdentityError('unexpected field on an issued asset');
    return { network: net, kind: 'issued', code: o['code'], issuer: account(o['issuer'], 'the issuer') };
  }
  if (o['kind'] === 'contract') {
    if (typeof o['contractId'] !== 'string') throw new AssetIdentityError('a contract token needs a contract id');
    if (Object.keys(o).some((k) => !['network', 'kind', 'contractId'].includes(k))) throw new AssetIdentityError('unexpected field on a contract token');
    return { network: net, kind: 'contract', contractId: contract(o['contractId']) };
  }
  throw new AssetIdentityError('asset kind must be native, issued or contract');
}

export function formatAsset(a: AssetIdentity): string {
  const v = validateAsset(a);
  return v.kind === 'native' ? `${v.network}:native` : v.kind === 'issued' ? `${v.network}:${v.code}:${v.issuer}` : `${v.network}:contract:${v.contractId}`;
}

/** Strict inverse of formatAsset. Rejects anything that is not exactly a canonical identifier. */
export function parseAsset(s: unknown): AssetIdentity {
  if (typeof s !== 'string' || s.length > 200) throw new AssetIdentityError('an asset reference is a canonical identifier string');
  const p = s.split(':');
  let out: AssetIdentity;
  if (p.length === 2 && p[1] === 'native') out = validateAsset({ network: p[0], kind: 'native' });
  else if (p.length === 3 && p[1] === 'contract') out = validateAsset({ network: p[0], kind: 'contract', contractId: p[2] });
  else if (p.length === 3) out = validateAsset({ network: p[0], kind: 'issued', code: p[1], issuer: p[2] });
  else throw new AssetIdentityError('not a canonical asset identifier');
  if (formatAsset(out) !== s) throw new AssetIdentityError('not a canonical asset identifier');
  return out;
}

/** The display code of an identity: XLM for native, the code for issued; a contract token has no intrinsic code (the registry supplies an unverified label). */
export const codeOf = (a: AssetIdentity): string | undefined => (a.kind === 'native' ? 'XLM' : a.kind === 'issued' ? a.code : undefined);
export const sameAsset = (a: string, b: string): boolean => formatAsset(parseAsset(a)) === formatAsset(parseAsset(b));
