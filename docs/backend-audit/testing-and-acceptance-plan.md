# Testing strategy and acceptance plan

Scope: the backend (`apps/web-console`: route handlers, `lib/registry`, `lib/auth`, `lib/stellar`, SQLite today, PostgreSQL as a possible target), its Stellar Testnet integration and the web app that consumes it (`apps/web`). Stellar Testnet only. No test in this plan may touch Mainnet, change the token, redeploy the contract or hold a signing key. The suites were not run for this document; counts below come from reading the test files and workflow files. Targets in sections 4 to 12 are proposals unless a source is cited. Evidence labels: **Verified**, **Recommendation**, **Inference**, **Unknown**, **Owner decision**.

## 1. Where testing stands

### 1.1 What CI actually runs (Verified from `.github/workflows/*.yml`)

| Workflow | Triggers | Jobs and what they run | Skip / condition notes |
|---|---|---|---|
| `ci.yml` (`checks`, ubuntu-22.04, 45 min) | `pull_request`, `workflow_dispatch`. **Not on push to `main`.** | `cargo fmt --check`, `cargo clippy` (warnings advisory), `cargo test --workspace` (native), build of the Rust bridge, Node 24.14.0, `npm ci --ignore-scripts`, **`npm run typecheck`** (root: `npm run typecheck --workspaces --if-present`, so it includes `tobin-web`'s `next typegen && tsc --noEmit`, `tobin-docs`, `tobin-web-console`, SDK), `npm run build:console`, landing `lint` and `build`, `npm test --workspace tobin-mvp1-sdk`, `npm test --workspace tobin-web-console` (with the bridge), a skipped-test report against an allow-list, dependency inventory, doc links, release-gate scan tests, clean working tree check | bridge tests run because `TOBIN_BRIDGE_EXE` is set; the report fails on skips not on the allow-list |
| `integration.yml` | `push` to `main`, `pull_request` only for dependency/manifest paths, weekly cron (Mon 04:17), `workflow_dispatch` | `dependency-report` (all triggers); **`wasm`** and **`browser`** only when the event is not a pull request: build the Wasm, hash report, Rust tests against the Wasm; the browser job builds the console and runs **only** `test/browser/journey.mjs` (the local sandbox Console) at 1200 and 420 px | on a PR touching other files, neither `wasm` nor `browser` runs |
| `w0-console.yml` | `pull_request` touching `apps/web-console/**`, root `package*.json`, the workflow; `workflow_dispatch` | builds the console and runs `test/browser/w0-journey.mjs` at 1200 px (mock adapter) | PRs touching only `apps/web` do not trigger it |
| `docs.yml` | `pull_request` touching `apps/docs/**` etc. | typecheck, validate, build of `apps/docs` | |
| `signer-tests.yml` | `pull_request` touching `scripts/tst-signer/**` etc. | signer suites (Linux and Windows), baseline verifiers | |
| `release-readiness.yml` | `workflow_dispatch` only | strict release-gate check | |

**Not in CI (Verified by grep for `tobin-web`, `apps/web`, `playwright` in `.github/workflows`):**
- `apps/web` **lint** (`eslint`), **unit tests** (`node --test test/*.test.ts`, 15 files, about 150 `test(` declarations by grep), **build** (`next build`) and the **Playwright smoke test** (`apps/web/e2e/smoke.spec.ts`, 6 `test(` declarations). Only its typecheck runs, through the root `npm run typecheck`.
- All `apps/web/scripts/*.mjs` review, access, accessibility, keyboard, contrast and wallet-state scripts (they need two servers, a seeded database and, for accessibility, an external `axe.min.js`). `apps/web/README.md:103` says so: "no hosted CI run of the browser scripts".
- Browser journeys other than `journey.mjs` (sandbox) and `w0-journey.mjs`: `sessions-journey`, `settlement-journey`, `authorization-journey`, `clearing-journey`, `backend-journey`, `wallet-auth-journey` exist in `apps/web-console/test/browser/` and are exposed as `test:*-browser` scripts (`package.json`), but no workflow invokes them.
- Anything against a real network (Testnet reads or submissions).
- A Postgres run (no Postgres code exists).

### 1.2 Current coverage by category (counts are `test(` declarations found by grep per file; not run, not pass counts)

| Category | Existing assets | Covers | Does not cover |
|---|---|---|---|
| Unit: pure rules | `apps/web-console/test/`: `clearing.test.ts` (12), `authorization.test.ts` (3), `settlement.test.ts` (10), `settlement-state.test.ts` (11), `settlement-policy.test.ts` (11), `asset-identity.test.ts` (5), `stellar-plan.test.ts` (11), `signer-set.test.ts` (12), `guards.test.ts` (9), `console-view.test.ts` (15); `packages/mvp1-sdk/test`; `apps/web/test` (15 files) | netting, input hash, readiness, batch integrity, state transitions, retry policy, plan building, comparison against MOCK observations, signer-set maths, host/origin/content-type guards | any behaviour against a real network; fixtures are same-author |
| Service-level (in-process, real SQLite) | `registry.test.ts` (8), `clearing-ops.test.ts` (14), `authorization-ops.test.ts` (16), `settlement-ops.test.ts` (16), `attempts-ops.test.ts` (16), `signer-set-ops.test.ts` (7), `wallet-ops.test.ts` (10), `sessions.test.ts` (10) | permissions, separation of duties, immutability, retry rules, evidence-gated transitions, concurrency across two connections (sequential) | only SQLite; no Postgres |
| API / HTTP (handlers called with a `Request`, no network) | `backend-security.test.ts` (19: unauthenticated 401, forged/expired/revoked sessions, forged identity headers, mass assignment, cross-org 404, request-header CSRF defence, cookie flags, health), `api.test.ts` (5), `wallet-auth.test.ts` (23), `wallet-signin.test.ts` (8), `w0-http.test.ts` (16), `w0-isolation-http.test.ts` (2), `next-server.test.ts` (2) | auth surface and the main registry error mapping | no machine-checked API contract: there is no OpenAPI document or schema (`AGENTS.md` section 3: "no single API reference") |
| Database | `backend-db.test.ts` (9): migrations apply/observe/rerun, failing migration rolls back, newer-than-code refused, restart persistence, provenance/FK/immutability constraints, transaction rollback, two-connection conflict, last-admin protection, `createBackend` refuses unmigratable DB | schema and triggers on SQLite | store-conformance for the SQLite registry store (see section 6) |
| Authorization / tenant isolation | `backend-security.test.ts` S5 (`:51-61`): one foreign user against 9 endpoints of one org, asserting a 404 body identical to a nonexistent org; `authorization-ops.test.ts`; `w0-isolation*.test.ts` (for the W0 mock) | cross-org reads and some writes | the other org-scoped endpoints (matrix in section 7) |
| Browser end-to-end | `apps/web-console/test/browser/*.mjs` (CDP over installed Chrome; step counts recorded in milestone documents, e.g. sessions 78, settlement 90, authorization 44, clearing 71, backend 42, sandbox 128, W0 43 at both widths in `MVP-1.5-CLOSURE.md`); `apps/web/e2e/smoke.spec.ts` (Playwright, signed-out pages and component gallery, no backend); `apps/web/scripts/*` (review runs, `check-access.mjs` against both servers, `review-wallet-states.mjs` against a MOCK Freighter, `keyboard-walkthrough.mjs`, `a11y-scan.mjs`, `measure-requests.mjs`) | UI flows on the real console backend, access control through the web proxy, accessibility/keyboard checks | CI runs only `journey.mjs` (main-push) and `w0-journey.mjs` (PR on console paths). Chrome only; no Edge/Firefox/Safari; no screen reader |
| Stellar Testnet | **Real reads/submissions were done by hand** (owner-run: `scripts/testnet-preflight.mjs`, `testnet-simulate.mjs`, the multisig audit, eight settlement transactions; evidence under `docs/product/architecture/mvp-1.5/evidence/`). Automated tests of RPC code use mocks (`stellar-rpc.test.ts` 7, `run.test.ts` 3, `stellar-plan.test.ts`) | submission/unknown-outcome mapping, step ordering logic | no scheduled automated Testnet check; no test that fails when the deployed contracts drift from `contracts/deployments/testnet.json` |
| Contracts | `contracts/` Rust host tests (native in `ci.yml`; Wasm mode on main-push in `integration.yml`) | contract behaviour | not a backend concern |
| Performance | none automated; `apps/web/scripts/measure-requests.mjs` counts browser requests per page | request counts | latency, throughput, DB under load |
| Migration | `backend-db.test.ts`; `scripts/db.ts` | forward migration on SQLite | rollback/restore drills, Postgres migration, data migration |
| Concurrency | `backend-db.test.ts` (two connections); `attempts-ops.test.ts` (parallel attempt creation) | simple conflicts | true parallel clients against Postgres or a deployed service |
| Idempotency | unique constraints tested at service level (`attempts-ops.test.ts`, `settlement-ops.test.ts`) | duplicate hash/attempt refused | HTTP-level idempotency keys (none exist) |
| Failure/recovery | `settlement-state.test.ts`, `attempts-ops.test.ts` (unknown outcome rules, MOCK network) | logic | restart during an in-flight submission (state is in memory in `run.ts`), RPC outage, partial chain progress on a real network |
| Security | `backend-security.test.ts`; `scripts/release/scan.test.mjs` (secret and wording scan); `apps/web/scripts/check-access.mjs` | the rules listed | no penetration test and no independent review has been done; none is claimed |

**Skips (Verified):** `console.test.ts` marks bridge-dependent tests `{ skip: SKIP ... }` when `TOBIN_BRIDGE_EXE` is absent (8 skipped in the milestone records). `ci.yml` builds the bridge, so CI runs them; a developer without it sees them skipped.

## 2. Acceptance principles (proposed, measurable)

1. Every phase of the backend work ends with: root `npm run typecheck` clean; `npm test` for all workspaces that have tests; zero unexplained skips (`scripts/ci/test-skip-report.mjs`); `git status` unchanged after the run.
2. No new behaviour without a test that fails on the old behaviour (mutation-style check: the PR description names the line it broke).
3. A Postgres-backed run must pass the same tests as the SQLite run, with no test weakened (section 6).
4. Evidence labels in the test names or output: MOCK versus REAL network, as already practised in the milestone documents.
5. "Settled" and "confirmed" appear in assertions only together with a stored chain read (existing `no-confirmed.test.ts` in `apps/web` and `settlement-state.test.ts` express this; keep them).

## 3. Unit tests

**Scope:** pure functions in `lib/registry/{clearing,authorization,settlement,settlement-state}.ts`, `lib/stellar/{execution-plan,compare,retry-policy,signer-set}.ts`, `lib/server/guards.ts`, `packages/mvp1-sdk`.

| Target | Acceptance criterion |
|---|---|
| Netting and input hash | determinism: same input in any order gives the same `inputHash` (property test over random obligation sets, 1,000 cases); nets sum to zero in every case; amounts at `i128` bounds accepted/refused exactly |
| Batch integrity | each `integrityChecks` key fails on a targeted mutation (existing; extend with a mutation per key) |
| State machine | exhaustive: for all 11 x 11 state pairs, `canTransition` equals the table in `settlement-state.ts:11-22` (one test, 121 assertions); no path from `unknown-outcome` to `submission-pending` |
| Retry policy | one test per state for `mayStartAttempt` (11 states; existing coverage to be checked against the full list) |
| Comparison | one targeted mismatch per `compareWithPlan` branch (existing 21 cases use MOCK observations; keep and add observations captured from the real settled session in `evidence/settlement-reconciliation-2026-11-07.json`) |
| Guards | host allow-list: loopback accepted, any other host rejected, and (after the proposed `TOBIN_ALLOWED_HOSTS` change) only the configured names accepted; foreign Origin on `/api/` rejected; non-JSON POST 415 |
| Coverage target (proposal) | line coverage reporting added (Node test coverage), threshold 85% on the pure modules above; the number is a starting proposal, not an existing standard |

## 4. Integration tests (service + database)

Run the existing `*-ops.test.ts` files through a store factory so the same files exercise SQLite and Postgres (section 6). Acceptance: 100% of the existing service-level tests pass on both stores; the parallel-writer tests (section 9) pass on Postgres.

## 5. API contract tests

**Gap (Verified):** no machine-readable contract exists. **Recommendation:** derive, from `lib/registry/http.ts` and `apps/web/lib/tobin/types.ts`, a JSON schema (or OpenAPI) of every `/api/auth/*` and `/api/registry/*` response, then:
- Provider tests: for each route, call the handler with a seeded user and validate the response against the schema (status codes from the table `STATUS` at `http.ts:29`: 404, 400, 403, 409, 429 and so on).
- Consumer tests: `apps/web/lib/tobin/client.ts` types are checked against the same schema (the typecheck already ties the TypeScript shapes; add a runtime check on recorded responses).
- Acceptance: 100% of routes in the proxy allow-list have a schema; a schema change without a client change fails CI; error bodies always have `{ error, message }`.
- Proxy contract (`apps/web/lib/proxy-policy.ts`): table-driven test: `/api/auth/*` and `/api/registry/*` GET/POST allowed; every other path, method, `..`, `%`, `/` in a segment rejected (the unit test `access.test.ts` exists; extend with each console route family: `/api/stellar/*`, `/api/w0/*`, `/api/rpc`, `/api/bootstrap`, `/api/health` must all be refused by the web app).

## 6. Database tests (SQLite today, Postgres target)

### 6.1 Reuse of the existing suites (Verified, then recommendation)
- `apps/web-console/test/w1-store-conformance.ts` exports `runAuditStoreConformance`, `runIntentStoreConformance` and `runPreviewStoreConformance`, each taking a factory (`make: () => Store`), and `w1-store-conformance.test.ts` calls them with `InMemory*` stores. **Verified:** these conformance suites target the W0 mock stores (audit, intent, preview), not the SQLite registry store. They demonstrate the pattern but are not the registry's persistence tests, and the file header says "No database has been chosen".
- The registry persistence tests are `backend-db.test.ts` (9) plus the `*-ops.test.ts` files; they construct `createBackend(path)` and `SqliteRegistryStore` directly (`backend-helpers.ts`).
- **Recommendation:** extract a `runRegistryStoreConformance(name, make)` suite following the W1 pattern, from the assertions already in `backend-db.test.ts` and the `-ops` files, parameterised by a factory that returns `{ registry, auth, close }`. Run it twice: `sqlite` (always) and `postgres` (when `TEST_DATABASE_URL` is set, in a throwaway schema per test file). Required cases:
  1. migrations: apply on empty, idempotent rerun, failure rolls back and records nothing, database newer than code refused;
  2. constraints: provenance CHECKs, foreign keys, UNIQUE (batch per calculation, execution per batch, tx hash, attempt number), immutability of every immutable table (UPDATE and DELETE rejected, trigger or revoked privilege);
  3. transactions: a throw inside leaves no row in any table; nested calls join the outer one;
  4. restart persistence;
  5. concurrency (section 9);
  6. integrity recomputation: batch fingerprints and instruction fingerprints recompute after a round trip (catches type or encoding drift, e.g. numeric versus text amounts);
  7. exactness: amounts up to 39 digits round-trip as strings (the SQLite schema stores amounts as TEXT with a 39-digit CHECK).
- Acceptance: 100% pass on both backends; any Postgres-only difference is documented, not skipped.

### 6.2 Migration tests
| Test | Acceptance |
|---|---|
| Forward from empty to latest | schema equals the expected inventory (tables, constraints, triggers) |
| Forward from each historical version (1 to 7) with seeded data | rows preserved; counts and hashes of immutable tables identical before and after |
| SQLite -> Postgres data copy (if adopted) | row counts per table equal; every `inputHash`, `instructionsHash`, `plan_fingerprint` recomputed on Postgres equals the stored value; `chain-confirmed` rows keep their hash |
| Failed migration | no partial schema; app refuses to serve (`createBackend` already tested); health returns 503 |
| Rollback | restoring a backup taken before migration N and running the previous build works (documented drill, run once per release) |

## 7. Authorization and tenant-isolation tests

### 7.1 Authorization matrix (roles x actions)
Roles in the code: not signed in, signed in without organization, `member` (active), `admin`, `suspended` member, reviewer grant (separate), wallet-verified user, owner-tool user. Existing evidence: `authorization-ops.test.ts`, `wallet-ops.test.ts`, `backend-security.test.ts` S6/S7. **Acceptance:** a generated table test: for each registry mutation, each role gets the expected 401/403/200; the table is generated from the route list so that a new route without a row fails the build.

Must be asserted separately (none implies another; `AGENTS.md` section 6): wallet connection is not Tobin authentication is not membership is not role is not reviewer authority is not Stellar signing authority. Concretely: a user with a verified wallet but no reviewer grant cannot approve; an admin without the reviewer grant cannot approve; the preparer of a batch cannot review it; the calculator or an obligation editor cannot approve the calculation.

### 7.2 Tenant-isolation matrix: every org-scoped endpoint x a foreign-org user
Routes verified from `lib/registry/http.ts`; the base is `/api/registry/orgs/:o`. S5 covers the ones marked "S5". The test must also assert body equality with a nonexistent org (no existence oracle) and that nothing changed after each foreign write.

| Endpoint family | Methods | Covered today |
|---|---|---|
| `:o` | GET | S5 |
| `:o/update` | POST | S5 |
| `:o/members` | GET | S5 |
| `:o/members/:u/role`, `/remove`, `/status` | POST | no |
| `:o/wallets` | GET, POST | S5 (GET) |
| `:o/wallet-challenges` (+ `/:id/verify`) | POST | no |
| `:o/wallet-verifications` | GET | no |
| `:o/signer-sets` (+ `/:account`) | POST, GET | no |
| `:o/reviewers` (+ `/:u/grant`, `/revoke`) | GET, POST | no |
| `:o/invitations` (+ `/:i/revoke`) | GET, POST | S5 (GET, POST) |
| `:o/sessions` | GET, POST | S5 |
| `:o/sessions/:s` | GET | S5 |
| `:o/sessions/:s/participants` (+ `/:u/remove`) | GET, POST | no |
| `:o/sessions/:s/obligations` (+ `/:ob`, `/:ob/update`, `/:ob/void`) | GET, POST | no |
| `:o/sessions/:s/calculate`, `/calculation`, `/readiness`, `/ready`, `/reopen`, `/close` | GET, POST | no |
| `:o/sessions/:s/authorization` (+ `/approve`, `/reject`) | GET, POST | no |
| `:o/sessions/:s/settlement` (+ `/prepare`) | GET, POST | no |
| `:o/sessions/:s/settlement/batches/:b` (+ `/validation`, `/approve`, `/reject`) | GET, POST | no |
| `.../batches/:b/execution` (+ `/start`, `/attempts`, `/attempts/begin`) | GET, POST | no |

Also cross-session within the same org (session id from another org used under the caller's org id: `session()` checks `s.orgId === orgId`, `service.ts:231-236`), and foreign `batchId`, `obligationId`, `userId` identifiers inside an own-org path. Acceptance: matrix is generated from the router (enumerate route patterns), 100% of routes have a foreign-org row, zero 2xx, all bodies equal the nonexistent-org body, database row counts and `activity` count unchanged. The non-org routes (`/api/auth/*`, `/api/registry/assets`, `/invitations/accept`) get their own rows (invitation token secrecy is already S8 to S11).

## 8. End-to-end browser tests

Inventory (Verified): see section 1.2. **Gaps and proposals:**
1. Run `apps/web/e2e/smoke.spec.ts` in CI (it needs no backend; `playwright.config.ts` builds and starts `next start` on 3100 with the system Chrome).
2. A scripted two-server journey in CI: start the console with a temporary `TOBIN_DB_PATH`, seed with `scripts/seed-review-data.mjs`, start `apps/web`, run `check-access.mjs`, `review-r1.mjs` (sign-in/out and Discover), and the keyboard walkthrough. Acceptance: zero failed checks; the access check shows no 2xx body for any protected route without a cookie.
3. A web-app test that the protected pages never render the "Confirmed" stage without a stored read-back (`no-confirmed.test.ts` and the Playwright stage-rail test exist).
4. Journeys against the deployed topology (section 13): sign-in cookie flags observed over HTTPS (Secure, HttpOnly, SameSite=Strict), session survives a console restart (cookie valid, session row in the database).
5. Browser coverage beyond Chrome is an **Owner decision**; stated as untested.

## 9. Concurrency tests
| Scenario | Acceptance |
|---|---|
| Two admins calculate at once | exactly one current calculation; the other gets a deterministic error; no orphaned approval |
| Two reviewers approve the same calculation/batch | one decision row (UNIQUE), the other `EXISTS` |
| Approve while an obligation changes | the approval is invalidated or refused as `STALE`; never an approval of stale data |
| Two `execution/start` for one batch | one execution |
| Two `attempts/begin` | one live attempt (`mayStartAttempt`) |
| Same tx hash recorded by two workers | one row (primary key), the second gets `EXISTS` |
| Verifier and a user request advance the same attempt | both end in a legal state; no duplicate event |
| Invitation accepted twice | accepted once (existing test) |
Run with N=2, 8, 32 parallel clients on Postgres, against a real server process, 100 iterations each; zero invariant violations, zero deadlock aborts that surface to a client.

## 10. Idempotency tests
- Repeated requests with the same `Idempotency-Key` (a proposed header; none exists) return the same status and body and create one row (applies to every POST that creates records).
- Without a key: duplicates are refused by the existing constraints (session id `EXISTS`, batch per calculation, execution per batch, `tx_hash`).
- State advance to the current state is a no-op without a new event (existing).
- `getTransaction` and the contract state reads can be repeated N times with identical interpretation; the verifier job can be killed and restarted at every point and converge to the same final state (kill-point test: for each statement boundary in the verifier, kill, restart, assert the same end state).
- `sendTransaction` is never invoked twice for one attempt step: inject a submitter that counts calls; fail the response after sending (timeout) and assert the count stays 1 and the state is `unknown-outcome`.

## 11. Performance tests
Targets are **proposals**, derived from measured request counts and the nature of the code.

**Known request pattern (Verified, `docs/web-redesign/plan.md` section 18, measured with `scripts/measure-requests.mjs`):** the API has no aggregate endpoint, so cross-session pages read the newest 10 sessions one by one (roughly 2 per-session reads for Reviews and Obligations, 1 for Activity, plus 3 to 4 shell requests: me, organizations, sessions list). First-load totals for an admin with 10 sessions read: Overview 25 (34 for a reviewer, 14 for a member), Reviews 24, Obligations 24, Activity 14, Organization 3, Members 4, Wallets 5, Settings 4, Notifications 3. The brief's "about 3 requests per session x 10 sessions" is the order of magnitude of the Overview for a reviewer (34). Every browser request becomes one server-side hop through the web proxy to the console, so one page load can produce about 25 to 34 console requests within a second or two.

| Metric | Proposed budget (single console instance, Testnet pilot data volume) |
|---|---|
| Console p95 latency, single read route (`GET .../sessions/:s`) | <= 100 ms on SQLite local; <= 150 ms on Postgres in the same region |
| Console p95, write route (record obligation, calculate with 16 obligations) | <= 250 ms |
| Web first-load fan-out | page load completes in <= 3 s at p95 with 34 sequential-or-parallel requests; no more than 6 concurrent in flight from the browser (HTTP limit) |
| Throughput | sustain 10 concurrent users each issuing a reviewer Overview load every 10 s (about 34 requests per 10 s each, about 34 req/s total) with 0 errors and p95 under the budget |
| Aggregate endpoint (if added) | one request replaces 24 to 34; target p95 <= 300 ms for 10 sessions and fewer than 6 queries per session pair |
| Database | no query over 50 ms at 10,000 sessions / 100,000 obligations in a synthetic dataset; explain plans reviewed for list endpoints (`sessionsOfOrg`, `activityOfOrg` have no pagination in the store interface: **Verified** gap, `store.ts`) |
| Memory | console RSS stable (no growth > 10%) over a 1-hour soak at the throughput above |
| Stellar read-back | verifier handles 100 pending attempts with <= 2 RPC calls per attempt per minute; back-off respected on RPC errors |
Tooling: a repeatable script (k6 or a Node script) with seeded data; run on the deployed topology and compared with the local run. The budgets above are starting points for review, not measurements.

## 12. Stellar Testnet integration tests

All Testnet only; read-only unless stated.
| Test | Needs | Acceptance |
|---|---|---|
| Deployment drift check | RPC read, no account | the Wasm hashes of `tobin_clearing_v1` and the governed token on chain equal `contracts/deployments/testnet.json`; `config()` returns 4/16/16; scheduled weekly (similar to `scripts/testnet-preflight.mjs`, which exists) |
| Reconciliation of the recorded session | RPC read | `compareWithPlan` on the recorded settled session (evidence file) returns `ok` with the recorded plan |
| `getTransaction` mapping | RPC read | a known SUCCESS hash (the recorded mint or a settlement step) reads SUCCESS; a random hash reads NOT_FOUND and maps to `unknown-outcome`; a timeout injected through a proxy maps to `UNAVAILABLE` |
| Signer-set read | Horizon + RPC | agree on the live admin account; a deliberately mismatched mock refuses (fail closed) |
| Simulation of each plan step against a fresh Testnet session | a funded Testnet account (Friendbot) for the source; no signing | simulation success for `create_session` and `join_session`, expected contract error codes for out-of-order steps |
| Full settlement of a NEW small session | funded accounts, owner Freighter signatures (the app holds no key), token units (the governed token supply is 1 base unit and minting is not authorized, so a new settlement is **blocked** until the owner decides on a token source) | not part of automated CI; run by the owner with `/settle-run`; acceptance: exact reconciliation and stored read-back evidence |
| Unknown-outcome drill | funded account | submit through a proxy that drops the response; the attempt ends `unknown-outcome`, the verifier resolves from the original hash, no second `sendTransaction` |
| Expired authorization | funded account | an entry signed with a short lifetime is refused after expiry; attempt becomes `expired`; a fresh attempt succeeds |

Automated CI must not require secrets. Anything needing a funded key stays manual or uses an ephemeral Friendbot account created in the job (Testnet only, no value). **Unknown:** Friendbot availability and rate limits; Testnet resets.

## 13. Failure and recovery tests
- Kill the console between "hash recorded" and "send": on restart the attempt has no submission; no automatic resend (verifier policy).
- Kill the console after send and before the poll ends: on restart the verifier reads the original hash and reaches the right state (today this cannot pass: `run.ts` state is in memory; the test documents the requirement).
- RPC outage for N minutes: attempts stay `unknown-outcome`; no `failed`; recovery after the outage resolves them.
- RPC retention exceeded (simulate by asking for an old hash): the attempt is not marked `expired`; it escalates (stellar document section 7.3).
- Reconciliation mismatch: all further steps blocked; operator alert; no new attempt (`retry-policy.ts:27`).
- Database restore: restore from backup, run the integrity recomputation over every immutable table, run the verifier; the end state equals the pre-backup state or is behind it, never ahead of what the chain shows.
- Migration failure at deploy: the previous version keeps serving; health reports degraded.

## 14. Security tests
Existing (`backend-security.test.ts`, `guards.test.ts`, release scan): unauthenticated 401, forged/expired/revoked sessions, forged identity headers, user-id injection, cross-org 404, role escalation, last-admin protection, invitation token replay/expiry/guessing rate limit, mass assignment, dev identity refused in production, production fails closed without a database path, request-header requirement, cookie flags, no secrets in activity or health, SQL parameterisation (not asserted; **Inference** from prepared statements, `sqlite-store.ts`).

Additions (proposals, each with a pass condition):
| Test | Pass condition |
|---|---|
| Host-guard configuration | with `TOBIN_ALLOWED_HOSTS` unset the behaviour equals today's (loopback only); with it set, only listed hosts pass; Host spoofing with a port mismatch rejected |
| Public exposure of the console | from outside the platform network, the console hostname does not resolve or does not answer (deployment check) |
| Proxy allow-list | every console route outside `/api/auth` and `/api/registry` returns 404 through the web app, including `/api/stellar/*` |
| Cookie behaviour behind the proxy | `Set-Cookie` from the console is forwarded exactly once with `Secure; HttpOnly; SameSite=Strict`; no `Domain`; absent `Origin` on proxy calls accepted |
| Rate limiting | failures persisted in `rate_events` survive a restart; limits keyed by email/key (not IP) hold behind a proxy |
| Session fixation/rotation | existing wallet sign-in `replaceToken` path; assert old token invalid after rotation |
| Input fuzzing | randomised bodies on every POST: no 500, no stack trace in the body, body size limit 1,000,000 bytes at the console and 8 KiB at the proxy |
| Secrets scan | no `S...` seed strings and no Postgres URLs in logs, responses or the repository (extend `scripts/release/scan`) |
| Evidence tampering | direct UPDATE/DELETE on immutable tables fails for the application role (Postgres: revoke privileges plus triggers) |
| Fabricated evidence | no HTTP route can supply `networkRead` evidence or set provenance (existing `http.ts` header comment; add a route-enumeration test) |
| Dependency | `npm audit` result recorded (report-only); lockfile inventory check (exists) |
No penetration test and no independent security review have been performed, and this plan does not claim either.

## 15. CI additions needed
| Addition | Reason |
|---|---|
| Run `ci.yml` also on `push` to `main` (or add a required status) | today `ci.yml` does not run on `main` pushes, only `integration.yml` does |
| `npm run lint --workspace tobin-web`, `npm test --workspace tobin-web`, `npm run build --workspace tobin-web` | **Verified missing**; only `tobin-web` typecheck runs (via the root script) |
| Playwright smoke (`apps/web/e2e`) | not in any workflow |
| Two-server access check and keyboard walkthrough on a seeded throwaway database | scripts exist, not in CI |
| The other console browser journeys (`sessions`, `settlement`, `authorization`, `clearing`, `backend`, `wallet-auth`) | exist and pass in milestone records; only `journey.mjs` and `w0-journey.mjs` run |
| Postgres service container + conformance suite | when a Postgres store exists |
| Weekly Testnet drift/read job (no secrets) | none exists |
| Route-enumeration tests (tenant matrix, schema coverage) | new |
| Coverage report (report-only first) | none exists |
| Pin Node to the same version everywhere | CI uses 24.14.0; no `.nvmrc` for local and platform builds |
Path filters: `w0-console.yml` triggers only on `apps/web-console/**`; a change under `apps/web/**` or `packages/**` alone triggers neither the W0 journey nor any web-app test. Add `apps/web/**` and `packages/**` to the relevant filters.

## 16. Acceptance gates for the backend change as a whole (proposed)
1. Typecheck, lint, unit, service, API-contract, database-conformance (both stores), tenant matrix, security and idempotency suites green, zero unexplained skips.
2. Concurrency and idempotency suites green on Postgres with the parallel loads above.
3. Migration drills: forward from every historic version, failed migration, restore.
4. Browser journeys green at 1200 and 420 px on the deployed topology; access check clean.
5. Testnet: drift check green; unknown-outcome and expiry drills run once with evidence stored; no Mainnet reference in configuration (grep gate for `public` network paths used in execution).
6. Performance budgets in section 11 met or the deviation is recorded and accepted by the owner.
7. Documentation: every limit above that remains (same-author evidence, Chrome only, one real run) is stated in the release notes, not dropped.

## 17. Not verified
- No suite was run. Counts of `test(` are greps and include skipped tests; milestone-record totals (for example 465 tests, 457 pass, 8 skipped in `MVP-1.5-CLOSURE.md`) are the authors' own reports, not re-measured.
- Whether `apps/web` unit tests currently pass.
- The exact set of tests that already cover each tenant-matrix row beyond S5 (other `-ops` tests exercise some service methods with foreign users; the matrix above lists HTTP-level coverage only).
- Whether Vercel runs any checks on the landing or docs projects (outside this repository).
