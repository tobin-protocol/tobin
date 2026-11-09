# Existing backend assessment

Status: read-only review of the repository at the current `main`. Stellar Testnet only. No code was run, no test suite was executed, no database was opened. Every statement is labelled **Verified** (the code was read), **Recommendation**, **Inference**, **Unknown** or **Owner decision**. Paths are relative to the repository root; `console` means `apps/web-console`, `web` means `apps/web`.

This document is a same-author, desk-based review. It is not a penetration test and not an independent security review; none has taken place.

## 1. Summary

- **Verified.** The backend is the Next.js 16 app `apps/web-console`: route handlers over a synchronous `node:sqlite` database, with the domain rules in plain TypeScript classes (`Registry`, `AuthService`). `apps/web` has no database and reaches the backend only through a server-side proxy.
- **Verified.** The design is coherent and disciplined: authorization is done in the service layer on every call, SQL is parameterised everywhere, history tables are immutable by trigger, and the Stellar boundary is kept out of the HTTP path (no route can advance an execution or attempt state).
- **Verified.** The backend is built for one process on one machine on loopback. Request guards, bind addresses, in-memory maps and the SQLite file all assume that. This, not the quality of the domain code, is what decides the Railway question (see `security-assessment.md`).
- **Recommendation.** Keep the domain code (`Registry`, `AuthService`, settlement/authorization rules, execution plan, comparison), keep the HTTP shape, and change only what a hosted deployment forces: the Host/Origin guard, the proxy, bind addresses, security headers on `web`, IP-aware rate limiting, and (when the owner decides) the database driver.

## 2. Runtime and framework

| Item | Finding | Evidence |
|---|---|---|
| Runtime | Node 24 (`engines: ">=24"`); `node:sqlite` built in; `.ts` files executed directly in tests and operator script | `package.json:` engines; `console/package.json` scripts |
| Framework | Next.js 16.4.3, React 19.3.0, App Router, route handlers with `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` | `console/package.json`, `console/app/api/*/route.ts` |
| Language | TypeScript (strict-style, `.ts` import suffixes), no build step for the library code beyond Next | `tsconfig.base.json` |
| Stellar libraries | `@stellar/stellar-sdk` 17.4.0, `@stellar/freighter-api` 6.0.1 (exact pins) | `console/package.json` |
| Persistence | SQLite file via `node:sqlite` `DatabaseSync`, WAL, `foreign_keys=ON`, `busy_timeout=5000` | `console/lib/db/database.ts:670-678` |
| Process model | One Next server per app; singleton backend on `globalThis` (`Symbol.for('tobin.backend')`) | `console/lib/server/backend.ts:36-55` |
| Bind address | `next start --hostname 127.0.0.1 --port 8787` (console), `--port 3000` (web) | `console/package.json`, `web/package.json` |

**Verified.** All of the above. **Unknown.** Whether `node:sqlite` is still flagged experimental in the exact Node 24.x build that would run on Railway; the documentation for the pinned version was not consulted. **Recommendation.** Record the Node patch version in the deployment definition.

## 3. Application architecture

```
Browser ──HTTPS──► apps/web (Next, no DB)
                     ├─ proxy.ts           page access via GET /api/auth/me on the console
                     └─ app/api/[...path]  forwards only /api/auth/* and /api/registry/* (GET, POST)
                              │  http://127.0.0.1:8787 (TOBIN_API_URL)
                              ▼
                  apps/web-console (Next, the backend)
                     ├─ proxy.ts           Host allow-list, foreign-Origin refusal, JSON-only POST, CSP nonce
                     ├─ app/api/auth       ► lib/auth/http.ts      ► AuthService  ┐
                     ├─ app/api/registry   ► lib/registry/http.ts  ► Registry     ├─► SQLite (node:sqlite)
                     ├─ app/api/stellar/*  owner-run Testnet tools (lib/stellar)   ┘
                     ├─ app/api/w0         mock API (in-memory)        [separate]
                     ├─ app/api/bootstrap, app/api/rpc  MVP-1 sandbox via Rust bridge [separate]
                     └─ app/api/health
                                        lib/stellar ──► Soroban RPC + Horizon (Testnet, fixed URLs)
```

**Verified** against `web/app/api/[...path]/route.ts`, `web/proxy.ts`, `console/proxy.ts`, `console/app/api/**/route.ts`.

Layers, from the inside out:

1. **Persistence** (`lib/db/database.ts`, `lib/registry/sqlite-store.ts`): schema migrations 1 to 8 as TypeScript strings, a `Database` wrapper with `tx()` (`BEGIN IMMEDIATE`, nested calls join), and `SqliteRegistryStore`, which maps rows to records for the `RegistryStore` interface (`lib/registry/store.ts`, about 118 methods). There is also an in-memory store used by unit tests.
2. **Domain services** (`lib/registry/service.ts`, 974 lines; `lib/auth/service.ts`, 383 lines): all authorization and state rules. `Registry` talks only to `RegistryStore`; `AuthService` talks to `Database.raw` directly (49 raw statement sites, not behind an interface).
3. **Pure rule modules**: `clearing.ts`, `authorization.ts`, `settlement.ts`, `settlement-state.ts`, `asset-identity.ts`, `lib/stellar/{execution-plan,compare,retry-policy,signer-set}.ts`. Side-effect free; tested in isolation.
4. **HTTP adapters**: `lib/auth/http.ts` (`handleAuth`), `lib/registry/http.ts` (`handleRegistry`), each a function of `(Request, deps)`; the `app/api/*/route.ts` files only bind real dependencies.
5. **Stellar adapters** (`lib/stellar/*`): RPC builder/reader, owner-run execution, co-signing check, Freighter helpers.

## 4. API structure

**Verified.** Route handlers are thin catch-alls that delegate to one dispatcher function each:

| Route file | Methods | Dispatches to | Notes |
|---|---|---|---|
| `console/app/api/auth/[...path]/route.ts` | GET, POST | `handleAuth` | path is parsed by string replace (`lib/auth/http.ts:33`) |
| `console/app/api/registry/[...path]/route.ts` | GET, POST | `handleRegistry` | path split into `parts` (`lib/registry/http.ts:51`), manual `if` chain by `parts[n]` and method |
| `console/app/api/stellar/{cosign,run,validation}/route.ts` | POST | inline | header + session + `ownerToolsAllowed` (validation: no owner gate) |
| `console/app/api/health/route.ts` | GET | inline | schema version and pending-migration count only |
| `console/app/api/w0/[...path]/route.ts` | GET, POST, DELETE | `handleW0` | mock API, own cookie `w0_session`, own CSRF token |
| `console/app/api/bootstrap`, `app/api/rpc` | GET / POST | `lib/server/api.ts` | local sandbox only; needs `TOBIN_BRIDGE_EXE` |

Characteristics:

- **Verified.** No router library, no schema-validation library; routing is a hand-written `if` chain of about 250 lines in `handleRegistry`. Unknown paths or methods fall to `404 NOT_FOUND` (`lib/registry/http.ts:299`).
- **Verified.** Only GET and POST are used. Mutations are POST sub-paths (`/update`, `/remove`, `/role`, `/grant`) rather than PUT/PATCH/DELETE.
- **Verified.** There is no single API reference for the institutional API (AGENTS.md section 3). Operation names must be read from `lib/registry/http.ts`.
- **Verified.** No versioning prefix, no pagination, no filtering, no aggregate endpoints. `GET .../sessions` loads every session and the whole organization activity log and builds the listing in memory (`lib/registry/http.ts:148`, `lib/registry/session-view.ts`). The `web` app computes cross-session overviews client-side by reading sessions one at a time (`web/lib/cross-session/*`, **Inference** from file names and `web/lib/tobin/client.ts`).
- **Verified.** The `web` proxy (`web/lib/proxy-policy.ts`) allows only `/api/auth` and `/api/registry`, methods GET and POST, and refuses `..`, `.`, `/`, `\`, `%` in segments; it caps request bodies at 8 KiB.

## 5. Service boundaries

**Verified.** There is one deployable backend. Logical boundaries inside it:

| Boundary | Where | Property |
|---|---|---|
| Identity vs institution | `AuthService` vs `Registry` | `Registry` receives an `ActingUser` and never authenticates; `AuthService.resolve` is the only producer in the registry path (`lib/auth/http.ts:24-26`) |
| Application record vs chain | `Registry` vs `lib/stellar` | no registry HTTP route calls the chain except `signer-sets` POST; execution state advances only through `advanceSettlementExecution` / `advanceExecutionAttempt`, which have no HTTP route (`lib/registry/service.ts:826-830, 888-894`; confirmed by the route list in `lib/registry/http.ts`) |
| Product vs sandbox | `lib/w0`, `lib/server/sandbox.ts`, `lib/console` | separate state, separate cookie and CSRF in W0, no shared tables |
| UI vs backend | `web` vs `console` | HTTP only, through the proxy |

**Recommendation.** Keep this single-service shape. Nothing found justifies splitting services.

## 6. Domain logic

**Verified.** Domain concepts and rules (AGENTS.md section 5 matches the code):

- Organizations, memberships (`admin`/`member`, `active`/`suspended`), invitations, reviewer grants, organization wallet claims and verifications.
- Clearing sessions with provenance (`fixture`, `local-draft`, `chain-read`, `chain-confirmed`) and workflow (`configuring`, `ready`, `closed`). Session creation produces only `local-draft` or `fixture` (`service.ts:225`); `attachChainRead` and `confirmSession` exist in the service but have no HTTP route.
- Obligations (integer string amounts, i128 bound, single asset per session, canonical asset identity), immutable calculation snapshots with an input hash, authorization decisions bound to one calculation, settlement batches with an instruction hash, batch reviews, executions, attempts, signer-set snapshots.
- Invalidation is eager: every mutation of participants or obligations calls `#invalidate` inside the same transaction (`service.ts:496-509`).

**Verified.** Money arithmetic uses `BigInt` and decimal strings (`clearing.ts`, `settlement.ts`).

## 7. Authentication and authorization

Detailed in `authentication-and-authorization.md`. Summary: server-side opaque session cookie (SHA-256 at rest), email+password (scrypt) and wallet sign-in (SEP-53 challenge); authorization by `Registry.#need(orgId, user, admin)` on every service method, plus a reviewer grant and separation-of-duties checks for decisions; owner Stellar tools gated by a verified-wallet allow-list.

## 8. Validation

| Where | How strict | Evidence |
|---|---|---|
| Body size | `readBody`: 4096 characters, read in full before the check | `lib/registry/http.ts:36-41` |
| Body shape | must be a JSON object; unknown fields ignored (mass-assignment test S12) | `readBody`; `test/backend-security.test.ts:119` |
| Text fields | `text()` trims, length bounds, rejects control characters and `<`, `>` | `service.ts:36-41` |
| Identifiers | session id `^[0-9a-f]{64}$`; Stellar account via strkey decode (`isStellarAccount`); contract id regex; asset identity parser | `service.ts:31`, `wallet-proof.ts:19-23`, `asset-identity.ts` |
| Amounts | `parseObligationAmount`: positive integer string, at most i128 | `clearing.ts:12-20` |
| Enumerations | role, status, network, scheme, institution type, jurisdiction checked explicitly; the database also has CHECK constraints | `http.ts:43`, `database.ts` |
| URL path ids (`orgId`, `sessionId`, ...) | not format-validated; looked up and scoped by membership | `http.ts:72` |
| Stellar `account` for signer-set read | **only `typeof === 'string'`** before use in a Horizon URL | `http.ts:117`, `signer-set.ts:149` (see `security-assessment.md`) |

**Verified.** Validation is hand-written, per field, and consistent in style. **Recommendation.** No new library is required. Add a format check for the one unvalidated outbound value and consider a shared body-size check that reads in a streaming way (the streaming reader exists in `lib/server/guards.ts:42-62` but is used only by the sandbox routes).

## 9. Error handling and error code taxonomy

**Verified.** Errors are `RegistryError(code, message)` (`lib/registry/types.ts`). Each HTTP adapter maps a code to a status through a `STATUS` table and returns `{ error: CODE, message }`; anything else is `500 INTERNAL "internal error"` with no detail (`lib/registry/http.ts:300-304`, `lib/auth/http.ts:97-102`). Stellar routes return a truncated (160 chars) message of the thrown error on 400 (`app/api/stellar/*/route.ts`).

| Code | Status | Meaning |
|---|---|---|
| `INVALID` | 400 | malformed or out-of-range input |
| `UNAUTHENTICATED` | 401 | no valid session |
| `INVALID_CREDENTIALS`, `AUTH_FAILED` | 401 | email login, wallet sign-in failure (generic) |
| `FORBIDDEN` | 403 | role/reviewer missing, or missing `x-tobin-request` |
| `SEPARATION_OF_DUTIES` | 403 | reviewer conflicted with the result |
| `NOT_FOUND` | 404 | also used for "not a member" (uniform) |
| `EXISTS`, `LAST_ADMIN`, `INVALID_STATE`, `NOT_VERIFIED`, `FIXTURE`, `STALE`, `REGISTRATION_FAILED`, `WALLET_UNAVAILABLE`, `LAST_METHOD` | 409 (`STALE`, `NOT_VERIFIED` etc. as in the table) | state conflicts |
| `INVALID_INVITATION`, `INVALID_CHALLENGE` | 400 | generic failure to avoid probing |
| `RATE_LIMITED` | 429 | failure counters |
| `BACKEND_UNAVAILABLE` | 503 | missing/failed configuration |
| `INTERNAL` | 500 | unexpected |

**Recommendation.** Publish the taxonomy as an API reference; two adapters keep separate `STATUS` tables (`lib/auth/http.ts:28`, `lib/registry/http.ts:29`) that should be merged to avoid drift.

## 10. Logging and redaction

- **Verified.** Application logging is almost absent: the only server-side log call in `lib` is `console.error` of the backend start-up failure message (`lib/server/backend.ts:52`). There is no request log, no auth-failure log and no structured logging. Operator CLI prints to stdout/stderr.
- **Verified.** What exists instead is a **business audit trail** in the database: `activity` (per organization, append-only by trigger, `database.ts:108-109`) and `auth_audit` (per user, append-only by trigger, `database.ts:604-605`). `auth_audit` records no signatures or tokens (`service.ts:183-185` and callers).
- **Verified.** `lib/w0/redact.ts` redacts seeds, PEM blocks, Windows and POSIX paths, environment assignments and stack frames. Its scope is the W0 mock service; it is not on the institutional path (**Verified** by grep: no import from `lib/registry` or `lib/auth`).
- **Recommendation.** Before a hosted deployment, add minimal structured request/auth-event logging to stdout with the same redaction discipline, so platform logs can support incident review. This needs an owner decision on retention.

## 11. Background jobs

**Verified.** There are none: no scheduler, queue, worker or cron in `console/lib`, `console/app` or `scripts`. Cleanup is opportunistic inside requests: expired challenges are deleted when a new challenge is issued (`service.ts:200`); old rate events are deleted on every `rateCount` call (`service.ts:372`). **Verified.** Expired or revoked rows in `auth_sessions` are never deleted (no `DELETE FROM auth_sessions` anywhere). Consequences are listed under technical debt.

## 12. External integrations

| Integration | Direction | Verified detail |
|---|---|---|
| Soroban RPC `https://soroban-testnet.stellar.org` | outbound | constant `TESTNET.rpc` (`lib/stellar/rpc.ts:12`); `allowHttp: false` |
| Horizon `https://horizon-testnet.stellar.org` | outbound | constant `HORIZON.testnet` (`lib/stellar/live.ts:7`), 15 s timeout |
| Freighter | browser only | the server never sees a key; it verifies signatures |
| Email / SMS / webhooks / IdP | none | no delivery provider (`registry/http.ts:138`); no webhook endpoint exists |
| Rust bridge executable | local child process | sandbox only, `TOBIN_BRIDGE_EXE` (`lib/server/sandbox.ts:23`) |

## 13. Stellar integration (summary)

Depth is deferred to the Stellar document. **Verified** in outline: the server builds unsigned Soroban transactions, simulates them, reads chain state independently, compares to the approved plan, and (owner tools only) submits a transaction already signed in Freighter after a typed confirmation, capped at one base unit (`lib/stellar/run.ts`, `MAX_UNITS = 1n`). The institutional registry path does not sign or submit; its execution tables record preconditions and plan fingerprints only.

## 14. Transaction lifecycle (application level)

1. Draft session (`local-draft`), participants and obligations (admin, `configuring`).
2. Calculation (admin) creates an immutable snapshot; any later change invalidates dependent decisions and batches.
3. Reviewer decision on the exact calculation (`authorization_decisions`, one per calculation by `UNIQUE`).
4. Admin prepares a batch (hash over instructions); a different reviewer approves or rejects it.
5. Admin records execution preconditions (verified accounts) and begins attempts (plan rebuilt server-side from stored data).
6. Execution/attempt state changes happen only through service methods with no HTTP route; the owner tools in `lib/stellar/run.ts` act against the chain and keep their own in-memory attempt map (`run.ts:58-60`).

**Verified.** Gaps recorded in AGENTS.md section 13: confirmed on-chain outcomes are not written back to application records.

## 15. Idempotency

| Operation | Behaviour | Evidence |
|---|---|---|
| Decision on a calculation | `UNIQUE(calculation_id)`; second attempt returns `EXISTS` | `database.ts` migration 3; `service.ts:579, 584` |
| Batch preparation | `attempt` number must equal next; unique violation maps to `EXISTS` | `service.ts:655-670` |
| Execution start | one execution per batch | `service.ts:808` |
| Attempt transaction hash | unique per attempt step and per hash | `service.ts:910-911` |
| State advance | asking for the current state again is a no-op | `service.ts:836, 902` |
| Challenge answer | single guarded `UPDATE ... WHERE consumed_at IS NULL` | `auth/service.ts:226-227` |
| Invitation acceptance | status change in the same transaction | `service.ts:181-197` |
| `POST` generally | **no idempotency keys**; creating an organization or session twice makes two | **Verified** (no key handling in `http.ts`) |

## 16. Concurrency

**Verified.** The server is a single Node process using synchronous SQLite calls, so within one process each service method runs to completion without interleaving. `Database.tx` uses `BEGIN IMMEDIATE` (write lock at start), nesting joins the outer transaction. `busy_timeout=5000` covers contention with the operator script or a second process. Wallet sign-in and linking issue their own `BEGIN IMMEDIATE`/`COMMIT` (`auth/service.ts:235-262, 273-290`) and rely on the caller not being inside `tx()`.

**Verified** hazards:
- `AuthService.login` and `register` are `async` (scrypt is awaited), but all database calls between awaits are synchronous, so no transaction spans an `await`.
- `rateCount` performs a `DELETE` on every call (`service.ts:372`), turning reads into writes on the sign-in path.
- In-memory state outside the database (`run.ts` `ATTEMPTS`/`PREPARED` maps, W0 stores, sandbox) is per process.

**Inference.** Running two console instances against one SQLite file is not a supported topology (file locking over a network volume, plus the in-memory maps).

## 17. Rate limiting

**Verified.** All limits are failure counters in table `rate_events` keyed by strings, persisted, with no IP dimension:

| Key | Limit | Evidence |
|---|---|---|
| `login:<email>` | 5 failures / 15 min | `auth/service.ts:47-48, 115` |
| `chal:<publicKey>` | 10 challenges / 10 min | `service.ts:41, 196` |
| `chal:*` | 300 challenges / 10 min (global) | `service.ts:42, 196` |
| `wverify:<publicKey>` | 10 wrong answers / 15 min; a challenge burns after 5 | `service.ts:43-44, 219-221` |
| `accept:<userId>` | 10 invalid invitation tokens / 15 min | `registry/http.ts:30-31, 56-57` |

Not limited: registration, wallet-link challenge calls beyond the shared counters, all authenticated registry reads and writes, the `stellar/validation` route. W0 has its own in-memory limiters (`lib/w0/http.ts`).

## 18. Security controls (summary; detail in `security-assessment.md`)

| Control | Where |
|---|---|
| Host allow-list (`127.0.0.1:PORT`, `localhost:PORT`) on every request | `console/proxy.ts`, `lib/server/guards.ts:16, 35` |
| Foreign `Origin` refused on `/api/` | `guards.ts:36` |
| POST must be `application/json` | `guards.ts:37` |
| `x-tobin-request: 1` on every non-GET | `registry/http.ts:48`, `auth/http.ts:47` |
| Per-request CSP nonce, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'` | `guards.ts:65-78`, `proxy.ts:22-29` |
| Static headers `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`; `poweredByHeader: false` | `guards.ts:81-85`, `next.config.ts` |
| Session cookie `HttpOnly; SameSite=Strict; Secure` (production) | `auth/http.ts:20-21` |
| Production fail-closed configuration (`TOBIN_DB_PATH` required, no `:memory:`) | `server/backend.ts:18-27` |
| Development identity refused in production | `registry/identity.ts:25` |

**Verified.** The controls above exist in `console`. `web` sets none of the response headers (see `security-assessment.md`, SEC-02).

## 19. Testing coverage

Counts below are by reading: the number of `test(`/`it(` declarations per file, approximate (loops can generate more cases; factory files `w1-*.ts` register tests for other files). The suites were not run.

| Subsystem | Test files (declarations) | Notes |
|---|---|---|
| Authentication, sessions, wallet sign-in | `wallet-auth.test.ts` (21), `wallet-signin.test.ts` (8), `wallet-ops.test.ts` (10), `backend-security.test.ts` (17) | replay, expiry, fixation, rotation, idle/absolute timeouts, rate limits, cookie flags, cross-org 404, invitation binding |
| Registry rules, sessions, clearing | `registry.test.ts` (8), `sessions.test.ts` (10), `clearing.test.ts` (12), `clearing-ops.test.ts` (12) | |
| Authorization and separation of duties | `authorization.test.ts` (3), `authorization-ops.test.ts` (16) | |
| Settlement preparation | `settlement.test.ts` (10), `settlement-ops.test.ts` (16), `settlement-policy.test.ts` (10), `settlement-state.test.ts` (11), `asset-identity.test.ts` (5) | |
| Attempts, execution plan, comparison, RPC | `attempts-ops.test.ts` (14), `stellar-plan.test.ts` (8), `stellar-rpc.test.ts` (7), `run.test.ts` (3) | `run.test.ts` is thin for the module that submits transactions |
| Signer sets | `signer-set.test.ts` (10), `signer-set-ops.test.ts` (7) | |
| Database | `backend-db.test.ts` (9), migration 8 test inside `wallet-auth.test.ts` | |
| Request guards, CSP | `guards.test.ts` (8), `api.test.ts` (5), `next-server.test.ts` (2) | |
| W0 mock and sandbox | `w0-*.test.ts` (about 87), `console*.test.ts` (about 23) | |
| `packages/mvp1-sdk` | about 58 declarations in 7 files | |
| `apps/web` | about 150 declarations in 16 files, plus one Playwright smoke spec | **Verified:** no workflow under `.github/workflows` runs the `apps/web` tests or its Playwright spec (grep found only a dependency-baseline row) |

Totals by reading: roughly 350 declarations in `apps/web-console/test`, 150 in `apps/web/test`, 58 in the SDK.

**Risky areas with thin or no automated coverage (Verified by file listing, **Inference** on adequacy):**
- the `apps/web` proxy route handler itself (`app/api/[...path]/route.ts`): the policy function is tested, the handler's header and cookie forwarding behaviour was not found in a test;
- `apps/web/proxy.ts` matcher behaviour for dotted paths;
- `lib/stellar/run.ts` and `app/api/stellar/*` end to end (3 declarations in `run.test.ts`; the real flow was exercised by the owner manually);
- behaviour behind a TLS-terminating proxy or with a non-loopback Host (the guard tests assert the opposite);
- concurrency across processes (stated as untested in the wallet-first-auth security review, residual 6);
- load and abuse cases (no load or fuzz tests; residual 1 in the same review);
- no test of an unbounded or very large `activity` log on list endpoints.

## 20. Known technical debt

| # | Item | Evidence |
|---|---|---|
| D1 | `lib/w0` is a **mock** API with in-memory stores and a development identity provider; it is separate from the real registry, has its own cookie, CSRF scheme, rate limiter and role model (`viewer/requester/approver`), and ships inside the production console. It is refused as an identity provider when hosted markers are present (`lib/w0/deps.ts` `HOSTED_ENV_MARKERS` includes `RAILWAY_ENVIRONMENT`), but the routes and pages remain | `lib/w0/*`, `app/api/w0`, `app/w0` |
| D2 | MVP-1 sandbox console (`app/page.tsx`, `lib/console`, `lib/server/{api,sandbox}.ts`, `app/api/{bootstrap,rpc}`) depends on a Rust bridge executable and is unauthenticated; it is protected only by the Host allow-list | `lib/server/api.ts:20-30, 43-56` |
| D3 | Stale header comment in `lib/registry/settlement-state.ts` (says no wallet/signing/submission exists) | AGENTS.md section 3 (documented), not independently re-read here |
| D4 | Other documentation drift: `wallet-first-auth/WALLET-FIRST-AUTH-ARCHITECTURE.md` names the reviewer table `reviewer_grants`; the code's table is `org_reviewers` (`database.ts:180`) | **Verified** |
| D5 | Single-instance assumptions: SQLite file, in-process singleton, in-memory maps in `run.ts` and W0, sandbox in process memory | `backend.ts`, `run.ts:58-60` |
| D6 | `AuthService` bypasses the store interface and executes SQL itself (49 call sites), so replacing the database touches two places, not one | `grep this.#db.raw lib/auth/service.ts` |
| D7 | No pagination, no aggregate endpoints, whole-organization activity loaded on each list and detail request | `registry/http.ts:148, 157-160` |
| D8 | No session purge, no `auth_audit` pruning, no retention policy | no `DELETE` on those tables |
| D9 | Hand-written router `if` chain, duplicated `STATUS` tables, no API reference or OpenAPI | `registry/http.ts`, `auth/http.ts` |
| D10 | Loopback-only assumptions in `guards.ts`, `proxy.ts`, both `package.json` start scripts, `web/app/api/[...path]/route.ts` comment | see above |
| D11 | Hard-coded repository-relative file reads in the owner tools (`../../accounts/testnet-admin.json`, `contracts/deployments/testnet.json`) | `cosign.ts:15`, `run.ts:23-25`, `owner-validation.ts:14` |
| D12 | `apps/web` tests are not part of CI | workflows grep |
| D13 | `operator script asset-add` accepts `public` network (documented) | AGENTS.md section 3 |
| D14 | Migration 5 `CHECK` constraints still allow `'public'`; the server never writes it | wallet-first-auth review residual 8 |
| D15 | Events and constants noted as placeholders: password policy is length-only (12 to 128), no breach check | `auth/service.ts:97` |

## 21. Retain / change / replace

No component is recommended for replacement. "Change" items have a stated technical reason.

| Component | Decision | Technical reason |
|---|---|---|
| `Registry` rules, authorization, SoD, invalidation | **Retain** | Cohesive, server-side, transactional, extensively tested; the invariants in AGENTS.md section 7 are enforced here |
| Immutable-by-trigger history tables | **Retain** (port triggers to PostgreSQL when migrating) | Cheap defence in depth; reproducible in PG with `BEFORE UPDATE/DELETE` triggers |
| `AuthService` scheme (opaque token, SHA-256 at rest, scrypt, SEP-53 challenge) | **Retain**; **change** the rate limiting and the email-verification gap | The cryptographic design is sound (see auth document); abuse controls lack an IP dimension and registration has none |
| HTTP adapters (`handleAuth`, `handleRegistry`) | **Retain**; **change** gradually | Testable pure functions of `(Request, deps)`; the long `if` chain and duplicated tables are maintainability debt, not defects. Add a shared body reader with a streaming size limit |
| Request guards (`guards.ts`, console `proxy.ts`) | **Change** | They hard-code loopback hosts and ports, so any non-loopback Host receives 403. A deployable variant needs a configured allow-list of public hosts and origins; the unauthenticated sandbox routes must then be disabled or gated separately |
| `web` proxy route and `web/proxy.ts` | **Change** | No security headers; the proxy supplies the CSRF header itself and forces the content type, bypassing the console's cross-origin defences; no client IP forwarding; bind address and backend host assumptions |
| `lib/stellar` plan, compare, signer-set, RPC | **Retain** | Pure and well isolated; outbound URLs are constants |
| `lib/stellar/run.ts`, `cosign.ts`, `owner-validation.ts`, `app/api/stellar/*` | **Retain** for owner-run Testnet use; **change** before multi-instance or hosted use | In-memory attempt/prepared maps and repo-relative file reads assume one process on the developer machine |
| `lib/w0` + `app/api/w0` + `app/w0` | **Retain as test fixture only**; **Recommendation** to exclude from the production build | A second auth/RBAC model and an in-memory store add attack surface and confusion without serving the institutional product |
| MVP-1 sandbox console + Rust bridge | **Retain for development**; **Recommendation** to exclude from production | Unauthenticated routes guarded only by Host; require a native executable |
| `SqliteRegistryStore` and SQLite | **Retain for now**; **Owner decision** on PostgreSQL (section 22) | Fine for one instance and one volume; becomes the constraint for replicas, backups and managed operations |
| `RegistryStore` interface | **Change** (make async) when moving to PostgreSQL | Interface is synchronous; PG drivers are asynchronous |
| In-memory test store | **Retain** | Useful for unit tests; keep its contract suite in lockstep (`w1-store-conformance.ts`) |
| Logging | **Change** | No request or auth-event logging exists |

## 22. What changes when moving from synchronous SQLite to PostgreSQL

This section is a **Recommendation / Inference**; no PostgreSQL work was done and no database was created.

**22.1 The async boundary.** `node:sqlite`'s `DatabaseSync` blocks the event loop and lets the services run as plain synchronous functions; `RegistryStore` declares every method synchronous (`lib/registry/store.ts`, `transaction<T>(fn: () => T): T`). A PostgreSQL driver (`pg`, `postgres`) is asynchronous, so:

1. Every `RegistryStore` method returns a `Promise` (about 118 methods).
2. Every `Registry` method becomes `async`, and so do the callers inside it (`#need`, `#role`, `#log`, `#editable`, `#opSession`, `#evaluate`, ...). Because many methods call each other (for example `decide` calls `calculationView`, `authorization` calls `calculationView`), this is a mechanical but wide change in a 974-line file.
3. `handleRegistry` already awaits `deps.authenticate`; its many direct `r.something(...)` calls need `await`.
4. `AuthService` (383 lines, 49 raw statements, including `BEGIN IMMEDIATE ... COMMIT` blocks in `verifySignIn` and `verifyLink`) becomes async and should first be put behind its own store interface so it is not a second place that executes SQL.
5. `Database.tx` today uses an instance counter (`#depth`) to join nested calls. That works only because all work inside is synchronous. With `await` across a transaction, two concurrent requests would interleave on a shared connection. Each request/transaction needs its **own** client from a pool and the transaction handle must be passed down (or carried with `AsyncLocalStorage`), not held on a singleton.

**22.2 Transactions and isolation.** `BEGIN IMMEDIATE` takes the single SQLite write lock up front, which gives serialised writers. PostgreSQL defaults to READ COMMITTED with row-level locks, so check-then-write patterns need explicit protection:
- decision uniqueness, batch uniqueness and hash uniqueness are already `UNIQUE` constraints (keep them);
- the "last administrator" check (`service.ts:112, 123, 144`) reads the membership list then writes: add `SELECT ... FOR UPDATE` on the organization's membership rows or use `SERIALIZABLE` with retry;
- invitation acceptance and challenge consumption: keep the guarded single-statement `UPDATE ... WHERE ... IS NULL` and check the affected row count (works as is);
- `calculate`/`prepare` attempt numbering (`earlier.length + 1`) needs the unique index to be authoritative and a retry on violation.

**22.3 Dialect differences.** Places to review (all in `database.ts` migrations and `sqlite-store.ts`):
- `INTEGER PRIMARY KEY AUTOINCREMENT` columns named `seq` (activity, calculations, batches, events) become `BIGINT GENERATED ALWAYS AS IDENTITY`; ordering by `seq` is relied on for history and the "latest calculation" (`ORDER BY seq DESC LIMIT 1`).
- `ON CONFLICT ... DO UPDATE` and `DO NOTHING` are supported by PostgreSQL (placeholders become `$1..$n`).
- `RAISE(ABORT, ...)` triggers become `CREATE FUNCTION ... RAISE EXCEPTION` plus `CREATE TRIGGER`; partial unique index `user_wallets_active_key ... WHERE status = 'active'` works as is; `CHECK` constraints largely carry over; `GLOB` in the jurisdiction check needs a regex (`~`).
- Text timestamps (ISO strings) work but `timestamptz` would be cleaner; changing it is optional and affects comparison code (`expires_at > ?`).
- `count(*)` returns `bigint` (a string in some drivers): `Number(...)` is already used in a few places but not all.
- The table-rebuild migrations (2, 5) use SQLite-specific patterns; for PostgreSQL write a fresh baseline migration instead of replaying 1 to 8.
- `PRAGMA foreign_keys`, `journal_mode`, `busy_timeout` disappear; foreign keys are always on; add a pool, statement timeout and connection retry.

**22.4 Data migration.** A one-off export from the SQLite file (rows are plain text/integers) to PostgreSQL, preserving `seq` ordering and verifying the immutable tables row counts and hashes. Verify `inputHash`, `instructionsHash` and `fingerprint` values still recompute after load. **Owner decision:** whether any existing local data must be carried over, or Railway starts empty.

**22.5 Operational consequences.** Migrations: the current runner applies migrations at process start (`getBackend` → `migrate`); with several instances this needs a lock (`pg_advisory_lock`) or a separate release step. Health: `app/api/health/route.ts` reports schema version; keep it. Backups and point-in-time restore come from the platform instead of copying a SQLite file. The in-memory maps in `run.ts` still make the owner tools single-instance; moving them to tables is a separate piece of work.

**22.6 Effort shape (Inference).** The store implementation and the two services change mechanically but extensively; the rules do not change. Tests need an async conformance harness (`w1-store-conformance.ts` is the natural place) and a real PostgreSQL for integration, which the lead has said must not be created here.

## 23. Discrepancies between documents and code found

| Document statement | Code | Source |
|---|---|---|
| Reviewer authority is stored in `reviewer_grants` | table is `org_reviewers` | `WALLET-FIRST-AUTH-ARCHITECTURE.md` vs `database.ts:180` |
| Email-bound invitations can only be accepted by "the verified account holding that email" | no email verification exists; the `kind: 'verified'` label is assigned at registration | `WALLET-FIRST-AUTH-ARCHITECTURE.md` vs `auth/service.ts:107` |
| Sign-in challenge is bound to the site "from the validated `Host`" | in the `web`→`console` topology the Host the console sees is the proxy's target (`127.0.0.1:8787`), not the public site | `auth/http.ts:55`, `web/app/api/[...path]/route.ts:31` |
| CSRF header "cannot be sent cross-origin" | true for direct calls to the console; the `web` proxy adds the header itself | `web/app/api/[...path]/route.ts:26` |

## 24. What could not be verified

- Behaviour of the running system (nothing was started).
- Whether `web`'s redirects and `request.url` behave correctly behind Railway's edge (`x-forwarded-*` handling).
- Real-extension behaviour of Freighter message signing for this flow (documented as unverified by the authors).
- The contents of the workflows beyond the lines read; `signer-tests.yml`, `integration.yml`, `release-readiness.yml` were not opened.
