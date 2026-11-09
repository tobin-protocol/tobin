# Architecture decisions, alternatives and open questions

Status: proposals from a read-only audit. None is accepted. "Recommendation" means the audit's view; "Owner decision" means it needs the owner's written acceptance (`AGENTS.md` section 2: there is no ADR directory; accepted decisions live in milestone documents). Stellar Testnet only.

## 1. Proposed decisions (each with alternatives)

| ID | Decision (Recommendation) | Alternatives considered | Why | Evidence |
|---|---|---|---|---|
| D1 | Keep two apps: `apps/web` UI with a server-side proxy, `apps/web-console` backend | one merged Next service | merging is a rewrite; both define `/`, `/sign-in` and separate `proxy.ts` files with different CSP expectations; no technical gain | `railway-deployment-architecture.md` section 9 |
| D2 | Make the system hostable on SQLite first (P1), then move to PostgreSQL | port to PostgreSQL immediately | the blockers (SEC-01, SEC-02, SEC-06, SEC-08) are independent of the database; fixing them first lowers risk | `security-assessment.md` |
| D3 | Make the store asynchronous on SQLite before adding PostgreSQL | write the PostgreSQL store directly | `RegistryStore` (59 methods, 169 synchronous calls) and `AuthService` (49 direct `db.raw` calls) cannot call an async driver; doing it first on SQLite isolates the regression risk | `postgresql-target-architecture.md` section 10 |
| D4 | `pg` (node-postgres) with a bounded pool, no ORM | an ORM or query builder | existing SQL is static and parameterised; the store interface is the boundary; the repository avoids runtime dependencies for persistence | target architecture section 16 |
| D5 | Preserve text ids with prefixes | uuid | ids are referenced as text everywhere, appear in URLs and hashes; changing them adds migration risk for no benefit | target architecture |
| D6 | `json` (not `jsonb`) for stored position documents; `numeric(39,0)` for amounts with a range check | `jsonb`; `bigint` | `registry/service.ts:618` compares `JSON.stringify` of stored and recomputed positions, and `jsonb` reorders keys; amounts are digit strings up to i128 | target architecture sections 6.3, 6.4 |
| D7 | Replace SQLite's global write serialization by an explicit per-organization lock | rely on `SERIALIZABLE` retries; row locks only | the race-prone rules (last administrator, invitation acceptance, calculate, decide, prepare, execution transitions) are organization-scoped | target architecture section 8 |
| D8 | Immutability by triggers plus `REVOKE` (two roles); no hash chain across rows; RLS deferred | hash-chained audit; RLS now | the records are application evidence, not third-party evidence; RLS interacts with pooling and adds cost; application scoping is already consistent | target architecture sections 12, 13 |
| D9 | Migrate with a purpose-built read-only utility, verified by counts and canonical hashes; do not copy login sessions, challenges or rate counters; copy password hashes verbatim | one-time `pgloader`-style copy; copy everything | repeatable, restartable, verifiable; bearer credentials should not travel | migration plan sections 5 to 7 |
| D10 | Railway: `web` public and `console` private, plus PostgreSQL; a Testnet pilot may start with SQLite on one volume and one replica | one container with two processes; one merged service | keeps `TOBIN_API_URL` private and attack surface small; the single-container option avoids the guard change but couples scaling and restarts | Railway document sections 4 and 9 |
| D11 | Production excludes the MVP-1 sandbox, W0 mock API, `/api/rpc` and `/api/bootstrap` | keep behind the guard | these have no authentication beyond the loopback guard; hosting requires loosening that guard | SEC-01, SEC-17 |
| D12 | The backend never holds a Stellar signing key | server-side signing | the code holds only public keys; signing happens in Freighter; this is the existing signing-authority boundary | settlement document |
| D13 | Aggregate, paged and filtered read endpoints replace the browser fan-out | keep deriving in the browser | about 3 requests per session across 10 sessions per page load, and `GET /sessions/:id` reads the whole organization activity log | mapping M01 to M07 |

## 2. Contradictions between documents and code (resolve before relying on either)

1. Authorization-entry lifetime: policy text says 10 ledgers; `lib/stellar/run.ts:19` sets 30. **Owner decision**: keep 30 for interactive use and document the exception, or reduce.
2. `settlement-state.ts` header and `registry/http.ts:249-250` still say no signing or submission exists; the owner tools do sign and submit (already listed in `AGENTS.md` section 3).
3. `MVP-1.5-ARCHITECTURE.md` describes attempts used by signer and submitter services; `run.ts` does not use them and no production code calls `advanceExecutionAttempt`.
4. `WALLET-FIRST-AUTH-ARCHITECTURE.md`: reviewer table named `reviewer_grants` (code: `org_reviewers`); email invitations need "the verified account holding that email" (no email verification exists); challenge bound to the site from the validated Host (through the proxy it is the internal host); CSRF described as the custom header being un-sendable cross-origin (the proxy adds it).
5. `BACKEND_PERSISTENCE_DATA_MODEL.md` describes migration 1 and a `session_participants` foreign key that migration 2 removed; the architecture document's 8-hour session lifetime omits the 24-hour absolute and 2-hour idle limits on wallet sessions.
6. The Execution step text in the app ("no route can start") versus routes `execution/start` and `attempts/begin`.
7. The Wallets-tab "Connect a wallet" runs sign-in, not linking (README section 6).
8. Dead columns: `settlement_instructions.source_account`, `destination_account`, `validation_status`.

## 3. Owner decisions required

Blocking for P0:

1. Adopt PostgreSQL and the `pg` dependency; choose the hosting target and scope (Testnet pilot only, or beyond).
2. Whether any database other than a developer file exists and which data must survive (selects the migration scenario).
3. Who may reach the console (public, private network only, behind an access layer) and whether the owner Stellar tools run on the hosted console or only locally.
4. The authorization lifetime (10 or 30 ledgers).
5. Whether a second, different reviewer is required for the settlement batch (today one reviewer can approve both the calculation and the batch).
6. Wallets tab: make "Connect a wallet" link a wallet to the signed-in account (needs the client method and unknown-key handling), or keep sign-in behaviour and rename it.
7. Hosted account recovery: password reset, email verification and recovery are absent; decide scope before open sign-up (SEC-04, SEC-05).

Later:

8. Organization lock mechanism (advisory lock, row lock or `SERIALIZABLE`).
9. RLS now or later (recommended later).
10. Cascade from memberships to wallet-verification evidence: preserve or change.
11. Foreign keys on actor columns (requires clean data) and removal of dead instruction columns.
12. Retention periods and whether `rate_events` may be `UNLOGGED`.
13. Whether tamper evidence of `activity` needs external anchoring.
14. Unify the two wallet mechanisms (`wallet_verifications`, `user_wallets`) or keep both.
15. Migration: sessions end at cutover; rate counters start empty; fixture exclusion; archive location and retention of the frozen SQLite files (they contain password and invitation hashes); rollback window and soak period.
16. Browser support beyond Chrome; screen reader pass.
17. Settlement execution model (P8): unify owner tool and database state, or keep them separate and say so.

## 4. Open questions (Unknown, not decisions)

- Railway: private-network addressing and IPv4/IPv6, the health-check Host header and timeout, volume and Postgres backup features, pre-deploy command support, region and Node version selection, log retention, whether the Railway domain is on the Public Suffix List.
- Whether `node:sqlite` supports a read-only open option on the pinned Node 24 patch, and whether it is still experimental.
- Row counts and data volumes (the only database file was not opened).
- Whether `w1-store-conformance` covers `SqliteRegistryStore` (the testing document says it targets the W0 mocks).
- How `contract`-kind assets get into `supported_assets` (`scripts/db.ts asset-add` cannot create them).
- The decimal scale of "base units".
- Where the admin account's master secret is kept.
- Live Testnet RPC and Horizon retention and rate limits.
- Behaviour of redirects and cookies behind Railway's edge; whether Freighter binds origin on `signMessage`.
- Whether Vercel runs any checks on landing or docs.

## 5. Status annex: owner decisions as of 2026-11-09

Added after the audit was completed. Sections 1 to 4 above are the audit's original proposals and evidence and are unchanged; they are the historical baseline. The accepted record is [`docs/backend-implementation/ADR-0001-approved-backend-decisions.md`](../backend-implementation/ADR-0001-approved-backend-decisions.md). This annex only marks what the owner has decided; it does not claim that any recommendation has been implemented.

Approved (section 3, items 1 to 7, and the proposals D1 to D13 as amended in the ADR):

- PostgreSQL and the `pg` dependency; Railway; Stellar Testnet institutional pilot only (item 1).
- Public `web`, private `console`, private PostgreSQL; owner Stellar tools remain local (items 2 and 3).
- Necessary SQLite data is preserved; what is necessary is decided by inspection in P5 (item 2).
- Authorization-entry lifetime: 10 ledgers (item 4).
- A different reviewer must approve the settlement batch (item 5).
- The Wallets tab implements real wallet linking to the authenticated account (item 6).
- Registration is invitation-controlled; email verification and account recovery come before any open registration (item 7).

Still unresolved (section 3, later items, plus new ones): lock strategy (item 8); RLS timing (item 9, deferred by decision BD-18); cascade from memberships to wallet verification evidence (item 10); actor-column foreign keys and dead-column removal (item 11); retention periods (item 12); external anchoring of `activity` (item 13); unifying the two wallet mechanisms (item 14); migration archive, soak and rollback window (item 15); browser support and screen-reader acceptance (item 16); the email delivery provider; and the new items U-11 to U-13 in the ADR. Item 17 (settlement execution model) is not approved and is out of scope for this mandate.
