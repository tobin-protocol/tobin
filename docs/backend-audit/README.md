# Tobin backend audit: executive summary and index

Status: read-only desk audit of `main` after the web redesign was merged. Stellar Testnet only. Nothing was implemented, deployed, migrated or run: no server, no test suite, no network call, no database was opened. Statements in these documents are labelled **Verified** (code or document read), **Recommendation**, **Inference**, **Unknown** or **Owner decision**. The evidence is same-author; no penetration test or independent security review has taken place, and none is claimed.

## Documents

| Document | Contents |
|---|---|
| [frontend-functionality-inventory.md](frontend-functionality-inventory.md) | every route, tab, dialog, panel, form and interaction of `apps/web` |
| [frontend-backend-mapping.md](frontend-backend-mapping.md) | every UI action mapped to its endpoint, rules, tables, status; the missing operations |
| [existing-backend-assessment.md](existing-backend-assessment.md) | architecture, concurrency, logging, tests, debt, retain/change table |
| [sqlite-database-inventory.md](sqlite-database-inventory.md) | all tables, constraints, triggers, migrations, migrate/disposable classification |
| [postgresql-target-architecture.md](postgresql-target-architecture.md) | proposed schema (DDL proposal), keys, isolation, locking, pooling, tenant isolation |
| [authentication-and-authorization.md](authentication-and-authorization.md) | identity model, per-endpoint authorization table, recovery gaps |
| [stellar-settlement-architecture.md](stellar-settlement-architecture.md) | lifecycle as built vs required, state machine, what the contract does and does not enforce |
| [security-assessment.md](security-assessment.md) | SEC-01 to SEC-20 with severity, evidence, remediation, blocker status |
| [railway-deployment-architecture.md](railway-deployment-architecture.md) | services, variables, health, migrations, one-versus-two services |
| [sqlite-postgresql-migration-plan.md](sqlite-postgresql-migration-plan.md) | repeatable migration, validation, rollback, cutover |
| [testing-and-acceptance-plan.md](testing-and-acceptance-plan.md) | test categories with measurable acceptance criteria; current coverage; CI gaps |
| [backend-implementation-roadmap.md](backend-implementation-roadmap.md) | ordered phases with entry and exit criteria |
| [architecture-decisions.md](architecture-decisions.md) | decisions, alternatives, open questions, owner decisions |

## 1. Overall assessment

The redesigned app is a coherent institutional front end over a backend that is more complete than its UI exposes, and less complete than a hosted service needs. It is not a prototype in the sense of mocks: of the 51 backend operations the app calls, 45 are fully implemented and 6 partial. The backend itself is a single Next.js server over one SQLite file, with careful domain logic (immutable snapshots, separation of duties, parameterised SQL, tenant scoping through `#need`/`#opSession`) and a good test suite for its size. Its limits are structural: it is built for one instance on one machine, it assumes loopback access, and the settlement path that signs and submits is a separate owner-run tool whose state is in memory.

## 2. Current backend maturity

| Area | Assessment (see the linked document) |
|---|---|
| Domain model and rules | strong: immutable calculations and batches, hash-bound approvals, 15 triggered-immutable tables, last-administrator and self-review rules |
| Authorization | sound by reading; no BOLA or SQL injection found; a few minor gaps (SEC-10, SEC-13) |
| Hosted readiness | not ready: loopback-only host guard and bind (SEC-01), no security headers on `web` (SEC-02), no IP-aware rate limiting (SEC-06), no structured logging (SEC-08) |
| Persistence | works for one instance; synchronous `node:sqlite`; not replica-safe; backups are file copies |
| Settlement | application records and preconditions exist; **no HTTP route advances execution state or records signing, submission or confirmation**; the real signing path (`lib/stellar/run.ts`) is a hard-coded owner tool |
| Verification | the chain-outcome verifier (`verifyChainOutcome`, `ChainReader`) has no producer; nothing in the app can set `chain-confirmed` |
| Tests | extensive unit and HTTP tests; store conformance suite targets the W0 mock stores, not the SQLite registry; `apps/web` lint, unit tests, build and browser scripts are not in CI |

## 3. Figures (Verified; counting rules in the inventory documents)

- Frontend: 16 `page.tsx` routes (14 render, 2 only redirect), plus 6 session tabs, 5 settlement steps, 4 organization tabs and 3 Discover tabs; 53 interactive components (23 dialogs, 8 panels and sheets, 4 menus and popovers, 13 forms, 5 filter groups) plus 12 tables; 97 meaningful interactions (32 mutating, 18 read, 47 client-only).
- Backend API: 82 distinct method and path operations in the console (auth 14, registry 53, stellar 3, bootstrap, rpc and health 3, w0 9). 67 are reachable through the web proxy and 15 are not. The app calls 51; 16 reachable operations are never called.
- Features: of 55, 23 fully implemented, 5 partial, 2 mocked, 10 frontend-only, 13 missing, 2 requiring redesign.
- Missing backend operations the UI needs or would need: 24 (M01 to M24 in the mapping), led by aggregate, paged and filtered reads (the Overview, Reviews, Obligations and Activity pages are derived in the browser from per-session reads of the newest 10 sessions), wallet linking from the app, execution and attempt flows, notifications, directory and public explorer API, password change, session list, idempotency keys.
- SQLite: 8 migrations, 32 application tables plus `schema_migrations`.

## 4. Recommended direction in one page

1. **Keep the domain code and the two-app split.** `apps/web` stays a UI with a server-side proxy; `apps/web-console` stays the backend. Merging them is a rewrite with no stated benefit.
2. **Make it hostable first, on SQLite** (phase 1): configurable and fail-closed host and origin allow-lists, bind address, security headers on `web`, structured logs, IP-aware rate limits, sandbox and W0 routes excluded from production builds, a real readiness check, `apps/web` checks in CI.
3. **Then move to PostgreSQL** in two steps: make the store asynchronous while still on SQLite (the `RegistryStore` has 59 methods called 169 times, all synchronously, and `AuthService` also issues SQL directly), then add a PostgreSQL implementation and the same conformance suite. Use `pg` without an ORM, keep the text ids, a `tobin` schema with two roles, `json` (not `jsonb`) for the stored position documents, `numeric(39,0)` for amounts, an explicit per-organization lock replacing SQLite's global write serialization, trigger plus `REVOKE` immutability, RLS deferred.
4. **Migrate with a purpose-built read-only utility** that verifies row counts and canonical hashes. No evidence of production data exists, so the plan allows schema creation plus a selective import. The SQLite file is never deleted or overwritten.
5. **Deploy on Railway as two services** (`web` public, `console` private) plus PostgreSQL. For a Testnet pilot, SQLite on a volume with one replica is the lower-risk first step; the Postgres port is a separate milestone.
6. **Do not extend settlement execution until the owner decides it** (see `architecture-decisions.md`): today the signing path and the persistence path are unconnected.

## 5. Critical blockers before implementation

1. Owner decisions listed in `architecture-decisions.md` section 3, in particular: adopt PostgreSQL and the `pg` dependency; whether any non-developer SQLite data must survive; hosting scope (Testnet pilot or beyond).
2. SEC-01 (loopback-only guard and bind) and SEC-02 (no security headers on `web`): both block any hosted deployment and both need a design decision, not just a patch, because loosening the guard naively exposes the unauthenticated sandbox and W0 routes.
3. The async refactor is the largest regression risk; it needs the conformance suite extended to the SQLite registry first (current suite covers the W0 mocks only).
4. Settlement execution ownership: decide whether the owner tool stays outside the hosted service or its state moves into the database (`stellar-settlement-architecture.md`).

## 6. Findings that correct earlier project statements

These were found by reading code; they contradict wording in documents or in the redesign pull request.

- The Wallets tab's "Connect a wallet" opens the wallet **sign-in** flow (`ConnectWallet.tsx` renders `WalletSignInFlow`, which calls the challenge and verify endpoints). For an unknown key it creates a new wallet-only user and replaces the session cookie; it does not link a wallet to the signed-in account. The backend link routes exist; the app has no client method for them. The Wallets note and the pull request text describing the button as "detection only" understate this.
- The Execution step text "no route can start" is inaccurate: `execution/start` and `attempts/begin` exist but are never called by the app.
- The 10-ledger authorization lifetime in the project documents differs from `ENTRY_LIFETIME_LEDGERS = 30` in `lib/stellar/run.ts:19`.
- The wallet-first-auth architecture document's CSRF and email-verification statements do not hold through the `web` proxy and with no email verification (SEC-03, SEC-04).
- UI limits differ from the server: password minimum 8 in the form and 12 on the server; organization name maximum 120 in the forms and 80 on the server.
- The Reviews page decides "mine" for batches by comparing display names; the server compares user ids.
- `BACKEND_PERSISTENCE_DATA_MODEL.md` describes migration 1 only.

## 7. Method and limits

Four independent reads covered (a) the frontend and its API mapping, (b) the database and migration, (c) the backend, authentication and security, (d) Stellar, Railway and testing. The lead spot-checked headline claims against code (the host guard in `lib/server/guards.ts:16,35`, `ENTRY_LIFETIME_LEDGERS`, the `JSON.stringify` comparison at `registry/service.ts:618`, the 12-character password rule, the Wallets tab sign-in flow). Not verified anywhere: behaviour on Railway itself (private networking, health-check Host header, volumes, backups), live Testnet RPC limits, row counts of any database (the only database file is a live developer file that was deliberately not opened), whether the test suites pass today, and whether `node:sqlite` is still experimental on the pinned Node 24 patch.

Untracked files in the working tree (the redesign brief, `docs/audits/`, `docs/design-system/`, loose files under `docs/product/architecture/`) are not repository evidence and were not used.
