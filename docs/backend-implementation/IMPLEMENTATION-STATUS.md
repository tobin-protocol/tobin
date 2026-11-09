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
| P0 | Record decisions, baseline, dependency and risk matrix; no source change | `docs/backend-p0-decisions` | **In review** (pull request open; documents only) | pending owner review |
| P1 | Hosting readiness and security hardening on SQLite | `feat/backend-hosting-hardening` (planned) | Not started | not accepted |
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
