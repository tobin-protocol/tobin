// The public data Discover would read, and the client that would read it. There is NO backend for this today (the console has no public read endpoint:
// every registry route answers 401 without a session), so the only implementation is `unavailableClient` in ./client.ts, which never makes a request.
// docs/web-redesign/discover-contract.md describes what a backend would have to provide. Nothing here is sample data.

/** The network a transaction was submitted to. Shown as a label next to every explorer link. */
export type PublicNetwork = "testnet" | "public";

export interface PublicAsset { code: string; /** Stellar issuer account, null for the native asset */ issuer: string | null }

/** An institution that has opted in to being named. Only institutions that opted in ever appear as a party. */
export interface PublicParty { institutionId: string; displayName: string }

export interface PublicSettlement {
  /** Tobin's identifier for the settlement record */
  id: string;
  asset: PublicAsset;
  /** decimal string, never a float */
  amount: string;
  /** ISO 8601 */
  settledAt: string;
  network: PublicNetwork;
  /** the Stellar transaction hash (64 hex characters) */
  txHash: string;
  /** true only when the transaction was independently read back from Stellar. The tile shows its verified mark from this flag and nothing else */
  verifiedReadBack: boolean;
  /** present ONLY when both institutions opted in; otherwise null and the tile names no one */
  parties: { payer: PublicParty; payee: PublicParty } | null;
}

/** Opted-in fields only. A field the institution did not publish is absent, never an empty string. */
export interface PublicInstitution {
  id: string;
  displayName: string;
  institutionType?: string;
  jurisdiction?: string;
  /** ISO 8601 */
  optedInAt?: string;
  /** settlements the institution took part in and agreed to count publicly */
  settlementCount?: number;
}

export interface PublicAssetUse {
  asset: PublicAsset;
  settlementCount: number;
  /** decimal string in the asset's own unit; amounts of different assets are never added together */
  settledAmount: string;
  lastSettledAt: string;
}

/** Protocol aggregates. A value the backend does not publish is null, and the screen then says "No data", never 0. */
export interface ProtocolStats {
  settlementsRecorded: number | null;
  institutionsOptedIn: number | null;
  assetsInUse: number | null;
  /** ISO 8601 */
  lastSettlementAt: string | null;
}

export type DiscoverTab = "settlements" | "institutions" | "assets";
export type SettlementSort = "newest" | "oldest" | "amount-high" | "amount-low";
export type InstitutionSort = "name" | "newest" | "most-settlements";
export type AssetSort = "code" | "most-settlements" | "latest";
export interface ListQuery<S extends string> { sort: S; /** opaque, from the previous page */ cursor?: string; limit?: number }
export interface Page<T> { items: T[]; nextCursor: string | null; /** the number of records, when the backend knows it */ total: number | null }

export type DiscoverResult<T> = { kind: "ok"; data: T } | { kind: "unavailable"; reason: string };

export interface DiscoverClient {
  stats(): Promise<DiscoverResult<ProtocolStats>>;
  settlements(query: ListQuery<SettlementSort>): Promise<DiscoverResult<Page<PublicSettlement>>>;
  institutions(query: ListQuery<InstitutionSort>): Promise<DiscoverResult<Page<PublicInstitution>>>;
  assets(query: ListQuery<AssetSort>): Promise<DiscoverResult<Page<PublicAssetUse>>>;
}
