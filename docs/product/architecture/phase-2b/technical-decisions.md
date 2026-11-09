# Technical decisions (Phase 2B, Workstream A)

Written 2026-11-03. Each decision lists options, trade-offs, evidence, a recommendation and approval status. **Nothing here is approved.** Recommendations are proposals for the founder; they are registered in [phase-2b-decision-register.md](phase-2b-decision-register.md). Prior decisions D1 to D15 are in [../open-decisions.md](../open-decisions.md).

Status labels: PROPOSED (awaiting approval), BLOCKED (depends on wallet evidence).

## A1. Authentication and identity

Options:

| Option | Trade-offs |
|---|---|
| 1. Wallet-signature sign-in (sign a server challenge with the Stellar account) | No password store, no email dependency, matches "wallet is identity" (D3). Needs a wallet that can sign a message or a small transaction; Freighter message signing is **Unverified** here. A user who loses the wallet loses the identity |
| 2. Email magic link with wallet linking | Familiar to institutions, supports recovery and notifications. Adds an email provider (external service, not provisioned in this phase), a second identity to reconcile with the account |
| 3. Both, wallet as the proof of control and email only for notification | Best fit for institutions, more work |

Evidence: the contract authenticates only Stellar addresses (`require_auth` in `contracts/clearing/src/lib.rs`); the application holds no keys (Phase 1 `roles-and-permissions.md`). Application roles never carry on-chain authority, so authentication only gates application data.

**Recommendation (PROPOSED):** Option 1 for MVP-1, with a per-organization membership record binding users to an organization. Use a signed-transaction challenge (a never-submitted transaction signed through `signTransaction`, which is Verified experimentally for Freighter envelopes) if message signing proves unavailable. Email only as a notification address in Option 3 later. Status: **BLOCKED** on wallet test T2/T3 only for the message-signing variant; the transaction-challenge variant is not blocked.

## A2. Backend architecture

Options:

| Option | Trade-offs |
|---|---|
| 1. Next.js route handlers inside `apps/web-console` | One deployable, shares TypeScript with the SDK, already has guards and CSP in `lib/server/` and `proxy.ts`. Couples the product API to the web app's deploy and scaling |
| 2. Separate service (`apps/api`) | Clean boundary, independent scaling. More infrastructure and a second deploy for a small MVP |
| 3. No backend, client-only with an indexer | Cannot hold invitations, organization records or signature-collection state |

Evidence: no backend exists today; `apps/web-console/app/api/` holds two sandbox routes (`bootstrap`, `rpc`) with local-only guards (`lib/server/guards.ts`) that would have to be replaced, not extended, for a networked product.

**Recommendation (PROPOSED):** Option 1 for MVP-1 behind a thin module boundary (`lib/server/` domain services, no route handler logic) so it can be extracted. The server holds **no keys, signs nothing and has no authority over contract state** (D4). Status: PROPOSED.

## A3. Session registry and indexing

The contract has no enumeration (Phase 1 `protocol-capability-mapping.md`; no list function among the 18 in `contracts/clearing/src/lib.rs`). A "my sessions" list therefore needs an off-chain source.

| Option | Trade-offs |
|---|---|
| 1. Application registry written by the application on create/join | Simple. Can disagree with the chain if a user creates a session by another client. Must be reconcilable |
| 2. Event indexer reading Soroban RPC `getEvents` | Chain-derived and verifiable. RPC retention is limited (about 7 days, 120,960 ledgers, per the earlier RPC query), so history needs the indexer's own store from day one |
| 3. Registry plus event reconciliation | Registry for fast listing and invitations; chain events confirm and repair it |

Evidence: the contract emits eight events; session state is read with `getSessionStatus` in `packages/mvp1-sdk/src/sdk/client.ts`. Horizon holds classic data and, per its documented model, is not the source for Soroban events.

**Recommendation (PROPOSED):** Option 3. The registry stores identifiers and application-only data; **every displayed state is read from the contract**, and the indexer only fills history. Registry rows are never trusted for authority. Status: PROPOSED; the retention window is an assumption to be re-measured.

## A4. Stellar SDK and transport

Options: `@stellar/stellar-sdk` 17.4.0 on the client; the same on the server; Stellar Wallets Kit 2.8.0 for wallet access.

Evidence: the SDK in `packages/mvp1-sdk` is deliberately network-free: `NetworkTransportNotAuthorized` in `src/sdk/transport.ts` refuses all calls. The `Transport` interface is the extension point. `@stellar/stellar-sdk` offers `authorizeEntry` with a `SigningCallback(preimage, payload)` (Supported by package typings, not exercised by Tobin). The wallet kit's Albedo and Ledger modules do not support `signAuthEntry`.

**Recommendation (PROPOSED):** implement a `SorobanRpcTransport` behind the existing interface using `@stellar/stellar-sdk` for simulate, assemble, send and poll, and use Freighter's API directly for MVP-1 (the kit adds no entry-signing capability beyond Freighter). Adding either package is a **new dependency** and needs approval; none was added in Phase 2B. Status: PROPOSED, **BLOCKED** on T3 to T6 for the wallet part.

## A5. Design-system integration

Evidence: tokens live in `@theme` in `apps/landing/src/app/globals.css` (Tailwind 4.3.3). `apps/web-console` uses a 33-line plain stylesheet and no Tailwind. The monorepo workspaces are `apps/*` and `packages/*` (root `package.json`). No shared UI package exists.

| Option | Trade-offs |
|---|---|
| 1. Copy tokens into the console | Fast, diverges |
| 2. Extract `packages/design-tokens` (CSS) consumed by both | Single source. Touches the landing page's CSS import, which the constraints forbid in this phase and need care later |
| 3. Console imports the landing stylesheet by path | No new package, couples the apps |

**Recommendation (PROPOSED):** Option 2 as the first implementation ticket (DS-1), done without changing any token value, verified by a visual regression comparison of the landing page. Until approved nothing is changed. Status: PROPOSED.

## A6. Hosting

Evidence: the landing page is deployed on Vercel; `apps/web-console` currently binds to 127.0.0.1 only (`package.json` scripts) and its guards reject non-local hosts.

**Recommendation (PROPOSED):** the console deploys as a separate Vercel project on a subdomain; the local-only guards are replaced by origin and authentication checks; Testnet only; the persistent testnet notice stays. A database is needed (Postgres-class); no provider is selected or provisioned in this phase. Status: PROPOSED; provider choice is a founder decision (D-B6).
