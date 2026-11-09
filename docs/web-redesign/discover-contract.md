# Discover: public data contract

Status: a proposal for a backend that does not exist. Today the console has no public read endpoint (every `/api/registry` route answers 401 without a session, `apps/web-console/lib/registry/http.ts`) and the web app's proxy forwards only `/api/auth` and `/api/registry` (`apps/web/lib/proxy-policy.ts`). Discover therefore reads a typed client (`apps/web/lib/discover/types.ts`) whose only implementation, `unavailableClient`, makes no request and reports "unavailable"; every figure reads "No data" and every list shows one tile saying "Public settlement data is not available yet." Nothing in this document is built, and none of it is sample data.

## Principles

1. **Public by opt-in.** A record is public only if every institution it names opted in. Parties are omitted otherwise, not masked.
2. **No fake zeros.** A value the backend does not publish is `null` or absent. The screen shows "No data", never `0`.
3. **Verified means read back.** `verifiedReadBack` is true only after the transaction was independently read from Stellar. The Discover tile shows its verified mark from that flag and nothing else (`lib/stages.ts`, the Confirmed rule).
4. **Amounts are strings** in the asset's own unit and are never summed across assets.
5. **Read-only, cacheable, no authentication,** with its own origin separate from the console's loopback guards. The console's guards are not relaxed for it.
6. **Testnet is labelled.** Every record carries its network, and the tile prints it next to the explorer link.

## Endpoints

All `GET`, JSON, cursor-paginated. Path prefix is a placeholder (`/public/v1`).

| Endpoint | Returns |
|---|---|
| `/public/v1/stats` | `ProtocolStats` |
| `/public/v1/settlements?sort=&cursor=&limit=` | `Page<PublicSettlement>` |
| `/public/v1/institutions?sort=&cursor=&limit=` | `Page<PublicInstitution>` |
| `/public/v1/assets?sort=&cursor=&limit=` | `Page<PublicAssetUse>` |

Sort values: settlements `newest` (default), `oldest`, `amount-high`, `amount-low`; institutions `name` (default), `newest`, `most-settlements`; assets `code` (default), `most-settlements`, `latest`. An unknown value falls back to the default; the web app also falls back, so a hand-edited URL never breaks the page. `limit` defaults to 20, maximum 100. `nextCursor` is opaque.

## Types

```ts
type PublicNetwork = "testnet" | "public";

interface ProtocolStats {            // aggregates; any field may be null
  settlementsRecorded: number | null;
  institutionsOptedIn: number | null;
  assetsInUse: number | null;
  lastSettlementAt: string | null;   // ISO 8601
}

interface PublicSettlement {
  id: string;                        // Tobin's identifier for the record
  asset: { code: string; issuer: string | null };
  amount: string;                    // decimal string
  settledAt: string;                 // ISO 8601
  network: PublicNetwork;
  txHash: string;                    // 64 hex characters
  verifiedReadBack: boolean;
  parties: { payer: { institutionId: string; displayName: string };
             payee: { institutionId: string; displayName: string } } | null;   // null unless BOTH opted in
}

interface PublicInstitution {        // opted-in fields only; a field not published is absent
  id: string;
  displayName: string;
  institutionType?: string;
  jurisdiction?: string;
  optedInAt?: string;
  settlementCount?: number;
}

interface PublicAssetUse {
  asset: { code: string; issuer: string | null };
  settlementCount: number;
  settledAmount: string;             // in the asset's own unit
  lastSettledAt: string;
}

interface Page<T> { items: T[]; nextCursor: string | null; total: number | null }
```

## What the screen does with it

- **Stats row:** four cells (settlements recorded, institutions opted in, assets in use, last settlement). `null` renders "No data".
- **Settlement tile:** identifier; asset and amount; parties only when `parties` is present; time; the network label and a link to `https://stellar.expert/explorer/{testnet|public}/tx/{txHash}` (omitted if `txHash` is not 64 hex characters); the verified mark only when `verifiedReadBack` is true.
- **Institution tile:** identifier, name, and one chip per published field. Nothing else.
- **Asset tile:** code, settled amount, count, latest time.
- **Empty or unavailable:** one tile-sized "No data" with "Public settlement data is not available yet."

## Decisions a backend owner must make first

1. **Opt-in model:** who can opt an institution in (an administrator), what exactly it publishes (name, type, jurisdiction, counts), whether it can withdraw, and what happens to past records when it does.
2. **What a public settlement is:** only settlements that reached Stellar and were read back, or also prepared batches. The contract above assumes the former; Tobin records no signed or submitted settlement today (no route signs, submits or verifies), so there would be nothing to publish yet.
3. **Indexer:** something must read Tobin's contracts and keep the records. None exists.
4. **Privacy review** of aggregates: counts that reveal a single institution's activity in a small network.
5. **Hosting:** a public origin and rate limits, separate from the local-only console.
