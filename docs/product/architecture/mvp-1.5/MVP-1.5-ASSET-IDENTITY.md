# MVP-1.5 asset identity (decision 1)

**Obligations carry full asset identity.** Implemented in `lib/registry/asset-identity.ts` (schema `tobin-asset/v1`) and used by obligations, calculation snapshots, batches, instructions and the supported-asset list.

## Canonical identifiers
| Kind | Form | Example shape |
|---|---|---|
| native | `network:native` | `testnet:native` |
| issued (classic) | `network:CODE:ISSUER` | `testnet:USD:G...` |
| contract (Soroban token) | `network:contract:CONTRACT_ID` | `testnet:contract:C...` |
`network` is `testnet` or `public` (Mainnet). A Testnet and a Mainnet asset never compare equal. The same code from two issuers is two assets. A code alone is never an identity. The **contract** kind exists because the deployed clearing contract settles in a Soroban token contract (see the audit); it carries an operator-supplied, unverified display code.

## Strictness
`parseAsset` accepts only a string that equals `formatAsset(parse(...))`: valid network, code 1 to 12 upper-case letters or digits, issuer a checksum-valid account strkey, contract a checksum-valid contract strkey, no extra segments, no case or whitespace variants. `validateAsset` checks untrusted objects and rejects extra fields. Database CHECKs repeat the shape (including that the id equals the canonical form of its fields).

## Where it applies
- `obligations.asset_ref` and `asset_identity` (`canonical` or `legacy-unresolved`). New obligations: when any asset is **supported** in the registry, a bare code is refused and the client must name a supported identity; the code is taken from the registry. When no asset is supported at all (unconfigured or development deployment) a bare code is still accepted and recorded as `legacy-unresolved`. This transitional rule keeps the frozen MVP-1.2 behaviour and tests intact; every configured deployment gets canonical identity.
- One asset identity per session: a different identity, even with the same code, is refused.
- `calculations.asset_ref` is set only when every active obligation carries the same canonical identity.
- Settlement preparation requires the calculation's canonical identity to be a supported registry entry; batches and instructions store the canonical id and a snapshot of the asset's fields.
- The registry (`supported_assets`) is operator configuration: `node scripts/db.ts asset-add ...`, read-only over `GET /api/registry/assets`. It is a local list, not an on-chain query.

## Migration (migration 5)
Existing obligations keep their data and become `legacy-unresolved` (`asset_ref` NULL). Existing calculation snapshots are not touched (`asset_ref` NULL; immutable). No issuer is guessed, no identity invented, no ambiguous code mapped. Legacy obligations are **blocked from settlement preparation** with the message that an administrator must reconcile them. **Reconciliation process:** an administrator edits each legacy obligation naming a supported identity (`assetRef`); that is a recorded revision (`assetRef (legacy) -> testnet:USD:...` in the activity history), it makes the calculation stale, and a new calculation, approval and batch follow. The populated v4 to v5 upgrade is tested (batches, instructions, reviews, invalidations, triggers, asset list preserved; historical content unchanged).

## Limits
Mapping a classic issued asset to its Soroban contract id (the Stellar Asset Contract) is not implemented and unverified. The `public` network is representable but nothing enables it. Issuers and contract ids in the registry have not been verified on any network.
