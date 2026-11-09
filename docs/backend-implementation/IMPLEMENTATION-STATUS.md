# Backend implementation status

Tracks the hardening, PostgreSQL migration and Railway Testnet pilot work. Decisions: [`ADR-0001`](ADR-0001-approved-backend-decisions.md). Dependencies and risks: [`DEPENDENCY-AND-RISK-MATRIX.md`](DEPENDENCY-AND-RISK-MATRIX.md). Historical baseline: [`docs/backend-audit/`](../backend-audit/README.md) (unchanged apart from one appended status annex in its decisions document).

Scope: Stellar Testnet only. Nothing here is production approval. No independent review has taken place.

## Evidence levels used in this file

Each claim below carries one of these levels, and they are never merged into one word such as "ready": **Implemented**, **Tested locally**, **CI-verified**, **Tested against PostgreSQL**, **Tested on Railway staging**, **Verified against Stellar Testnet**, **Independently reviewed**, **Production-approved**. Where a level is not named for an item, it has not been reached.

## Sequence

P0, P1, P2, P3, P4, P5, P7, P6. P8 (settlement execution) is not approved and not started.

## Phase table

| Phase | Scope | Branch | Status | Acceptance |
|---|---|---|---|---|
| P0 | Record decisions, baseline, dependency and risk matrix; no source change | `docs/backend-p0-decisions` | **Merged** (PR #47) | accepted by merge |
| P1 | Hosting readiness and security hardening on SQLite | `feat/backend-hosting-hardening` | **In review** (pull request open) | pending owner review; CI result recorded on the PR |
| P2 | Registry store conformance, tenant isolation, concurrency, immutability, JSON key order | `test/registry-store-conformance` (planned) | Not started | not accepted |
| P3 | Asynchronous store refactor on SQLite | `refactor/async-registry-store` (planned) | Not started | not accepted |
| P4 | PostgreSQL implementation | `feat/postgres-persistence` (planned) | Not started | not accepted |
| P5 | SQLite backup, inspection, migration utility and rehearsals | `feat/sqlite-postgres-migration` (planned) | Not started | not accepted |
| P7 | Wallet linking, separate batch reviewer, email verification and recovery, aggregate reads, idempotency | `feat/institutional-backend-gaps` (planned) | Not started | not accepted |
| P6 | Railway staging | `feat/railway-testnet-staging` (planned) | Not started | not accepted |
| P8 | Settlement execution | none | Out of scope | design proposal only, after the rest |

## P0 record

**Scope.** Decisions, baseline and matrix only. No source code, dependency, configuration, database or workflow was modified.

**Files changed (all new unless stated).**

- `docs/backend-audit/*` (14 files): the audit, added to the repository unchanged as the historical baseline, in commit `898ea5d`.
- `docs/backend-implementation/ADR-0001-approved-backend-decisions.md`
- `docs/backend-implementation/DEPENDENCY-AND-RISK-MATRIX.md`
- `docs/backend-implementation/IMPLEMENTATION-STATUS.md` (this file)
- `docs/backend-audit/architecture-decisions.md`: one appended section 5 (owner decision status); sections 1 to 4 are unchanged.

**Decisions applied.** BD-01 to BD-23 recorded as accepted; U-01 to U-13 recorded as unresolved (ADR-0001 sections 1 and 3). Two unresolved items are new findings of this phase: U-11 (how the first organization is created, and how wallet sign-in creation of unknown users is controlled, under invitation-controlled registration) and U-12 (mapping to the approved milestones in `AGENTS.md` section 13, which may not be renamed, reordered or expanded). A third, U-13, concerns reviewer capacity after BD-08.

**Reading done.** Full: the audit README, `architecture-decisions.md`, `backend-implementation-roadmap.md`; `AGENTS.md` and `CLAUDE.md`; root `package.json`. The remaining audit documents were written in the preceding audit session from source reading and their headline claims were spot-checked against code; the sections each later phase relies on are re-read, and the claims re-verified against the working tree, at the start of that phase.

**Baseline (Tested locally, unchanged `main` at `b16a7db`, Node v24.14.0).**

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test --workspace tobin-web-console` | 494 tests, 486 pass, 0 fail, 8 skipped |
| `npm test --workspace tobin-mvp1-sdk` | 64 tests, 55 pass, 0 fail, 9 skipped |
| `npm test` in `apps/web` | 150 tests, 150 pass, 0 skipped |

The skipped tests are expected to be bridge-dependent (`TOBIN_BRIDGE_EXE` unset); individual skip reasons were not captured. CI allows exactly one skipped TypeScript test with the bridge available (`AGENTS.md` section 9).

**Outstanding.** Owner confirmation of U-12; answers to the unresolved decisions as their phases approach.

**Risks.** See the matrix; R-01 (async refactor), R-05 (guard loosening), R-12 and R-15 (wallet linking, registration bypass), R-16 (unverified Railway facts) are the ones that gate later phases.

**Working tree.** Pre-existing untracked files (the redesign brief, `docs/audits/`, `docs/design-system/`, loose files under `docs/product/architecture/`) are untouched and not part of any commit here.

**Acceptance.** Exit criteria of P0: decisions recorded (done), unknowns visible (done), no source modified (done), sequence documented (done). Owner acceptance pending.

**Commit and PR.** Commits `898ea5d` (audit baseline) and the P0 decision commit on `docs/backend-p0-decisions`; pull request: see the repository (not merged).


## P1 record (hosting readiness and security hardening)

**Scope.** Configurable fail-closed Host and Origin guards, served-path allow-list and shared proxy secret on the console; explicit refusal of development surfaces in hosted mode; bind-address and port launcher; nonce CSP and security headers on `apps/web`; CSRF validation at the browser-facing proxy; per-address rate limits on a trusted forwarded address and bounded password hashing; wallet challenge domain from configuration; structured redacted logging; liveness and readiness probes; `apps/web` checks in CI; alignment corrections (password 12, organization name 80, the 10-ledger lifetime, the Execution step text, a stale comment). Details: [`HOSTING-CONFIGURATION.md`](HOSTING-CONFIGURATION.md); finding statuses: [`SECURITY-FINDINGS-STATUS.md`](SECURITY-FINDINGS-STATUS.md). Not deployed; no database, schema or contract change.

**Decisions applied.** BD-04 (topology), BD-05, BD-07 (10 ledgers), BD-10 (partly: abuse controls; invitation control is P7), BD-19, BD-21, BD-23. Engineering choices made here and open to review: hosted mode is selected by `TOBIN_DEPLOYMENT_MODE=hosted` rather than `NODE_ENV` (production builds are also used locally by the browser journeys); the console is protected by a shared secret from the web service in addition to the Host allow-list; the client address is the last `X-Forwarded-For` entry with exactly one trusted hop; probe-only Host list (`TOBIN_HEALTH_HOSTS`); `/api/health` kept as a compatibility alias beside the new `/api/live` and `/api/ready`; the owner Stellar tools are not served by a hosted console at all (BD-05).

**Files changed.** Console: `proxy.ts`, `instrumentation.ts` (new), `lib/server/{config,guards,log,api}.ts`, `lib/auth/http.ts`, `lib/registry/http.ts`, `lib/registry/settlement-state.ts` (comment), `lib/stellar/run.ts` (constant 30 to 10), `app/api/{auth,registry,w0}/[...path]/route.ts`, `app/api/{live,ready,health}/route.ts`, `scripts/start.mjs` (new), `package.json` (start script); tests `guards-hosted`, `hosting-rate-logging`, `entry-lifetime-policy` (new). Web: `proxy.ts`, `instrumentation.ts` (new), `next.config.ts`, `app/layout.tsx`, `app/api/[...path]/route.ts`, `app/api/{live,ready}/route.ts`, `components/NonceBridge.tsx`, `components/settlement/Steps.tsx`, `lib/api/http.ts`, `lib/schemas.ts`, `lib/zod-setup.ts`, `lib/server/{config,csrf,headers,client-ip,log}.ts`, `scripts/start.mjs`, `scripts/csrf-headers.mjs`, `scripts/check-security-headers.mjs`, `scripts/check-hosted-config.mjs`, the Playwright-context scripts that post through the proxy (they now send Origin and the CSRF header), `package.json`; tests `hosting`, `log`. CI: `.github/workflows/ci.yml` (new job). Docs: `docs/backend-implementation/`.

**Tests executed and results (Tested locally; Node v24.14.0).**

| Command | Result |
|---|---|
| root `npm run typecheck` | exit 0 |
| `npm run lint` in `apps/web` | no output (clean) |
| `npm test` in `apps/web` | 164 tests, 164 pass, 0 skipped (baseline 150) |
| `npm test --workspace tobin-web-console` | 518 tests, 510 pass, 0 fail, 8 skipped (baseline 494; the 8 skips are unchanged and expected to be bridge-dependent) |
| `npm test --workspace tobin-mvp1-sdk` | 64 tests, 55 pass, 0 fail, 9 skipped (unchanged) |
| `node apps/web/scripts/check-hosted-config.mjs` (real production servers, hosted env, loopback) | 37 checks, all passed |
| `node apps/web/scripts/check-security-headers.mjs` (Chrome, running build) | 52 checks, all passed: no CSP violation signed out or signed in, headers present, CSRF refusals |
| `node apps/web/scripts/check-access.mjs` | 19 page routes and 124 API requests refused or redirected |
| `review-wallet-states.mjs` (mock Freighter, axe with popover open) | 154 checks passed |
| `review-r2.mjs` | 378 checks passed |
| `npx playwright test` in `apps/web` | 6 passed |
| link check, dependency baseline, release scan tests | 0 broken; matches; 19 of 19 |

**Not run.** Console browser journeys (`apps/web-console/test/browser/*`) were not re-run (the console UI pages were not changed; its API guards were, and are covered by unit and HTTP tests); `review-r1`, `r3`, `r4`, `r5`, Stage scripts, keyboard walkthrough; any real Freighter test; any Railway test; any Stellar Testnet action. The hosted-mode check proves behaviour on loopback only.

**Outstanding / risks.** Railway behaviour for the listen address, `PORT`, and the forwarded-address header is Unknown (validation plan in `HOSTING-CONFIGURATION.md` section 7). Bringing the entry lifetime to 10 ledgers has not been exercised in an owner-attended interactive session (R-18). Invitation-controlled registration, email verification and recovery, wallet linking and the separate-reviewer rule remain P7. The development code is refused, not removed, in a hosted build. The new CI job has not yet run on hosted CI.

**Acceptance.** Exit criteria status: configurable fail-closed guards (met, local); no unauthenticated development routes in hosted mode (met, local); security headers verified (met, local Chrome); CSRF at the correct boundary (met, local); IP-aware limiting tested (met, local); redacted structured logs (met, local); distinct liveness and readiness (met, local); `apps/web` checks in CI (added, pending first run); existing functionality intact (met on the scripts listed above); staging-compatible configuration can be built (met: hosted production builds and servers run on loopback). Owner acceptance pending.
