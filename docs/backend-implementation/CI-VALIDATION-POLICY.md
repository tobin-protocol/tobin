# CI and validation policy

Status: accepted owner direction (recorded 2026-11-09), applied to every phase of the backend work. Optimizes feedback time without weakening release safety.

## Tiers

| Tier | When | What runs |
|---|---|---|
| 1. During implementation | after each small change | typecheck of the affected workspaces; targeted unit and integration tests; the relevant lint; database-specific tests when persistence code changes; browser tests only when UI behaviour or browser integration changes. Expensive full suites are not repeated after every small edit when targeted tests already cover the change |
| 2. Before pull request approval | before a PR is opened for review | all required checks for the affected application and its dependencies: typecheck, the relevant workspace tests, security and authorization tests, tenant-isolation tests when API or data-access code changes, store conformance when persistence changes, production build of affected applications, migration and concurrency tests when database behaviour changes |
| 3. Before Railway staging | before any staging deployment | the complete relevant CI suite: full unit and integration tests, SQLite and PostgreSQL store conformance, tenant isolation, authorization and security, PostgreSQL concurrency, production builds, browser smoke and critical user journeys, migration validation |
| 4. Before final deployment or cutover | before any cutover | all applicable release gates; never skipped: tenant isolation, authorization, database integrity, migration verification, immutability, security guard tests, PostgreSQL concurrency tests, backup restoration, production build |

## Rules

1. A deferred test is not a passed test.
2. Every skipped or deferred check is recorded (in `IMPLEMENTATION-STATUS.md`, per phase) with why it was deferred and when it must run.
3. A test is never changed or weakened to save time.
4. `continue-on-error` is never used to hide a failing required check.
5. Nothing is deployed with an unresolved critical security or data-integrity failure.
6. Unchanged components are not rebuilt unnecessarily; CI is dependency-aware so unrelated workspaces do not run expensive checks.
7. Dependencies and build artifacts are cached where that is safe.
8. A final release checklist proves that every required check was executed (below).

## How this applies to the current CI

`ci.yml` runs on every pull request (no path filter) and now has a separate `web` job beside the main `checks` job; the heavier integration jobs (contract Wasm, the console browser journeys) run on `main`, weekly and manually (`integration.yml`). The skip report (`scripts/ci/test-skip-report.mjs`) rejects any skipped test that is not on its allow-list, any `todo` and any failure: pending behaviour is therefore recorded as data or as a characterization test, never as a `todo` or `skip`. Dependency-aware job selection (path filters per workspace) and dependency caching are **not yet implemented**: they are CI changes of their own and are tracked as a follow-up before Railway staging (they must not remove any job from the required set).

## Final release checklist (filled in at the end of the work; empty rows are not yet run)

| Required check | Last run (commit) | Result | Where |
|---|---|---|---|
| Typecheck (all workspaces) | | | |
| Web app lint, unit tests, build | | | |
| Console unit, integration and security tests | | | |
| Registry store conformance, SQLite | | | |
| Registry store conformance, PostgreSQL | | | |
| Tenant isolation, SQLite and PostgreSQL | | | |
| Authorization and security guard tests | | | |
| Immutability tests, both stores | | | |
| PostgreSQL concurrency tests | | | |
| Migration verification and rehearsals | | | |
| Backup restoration | | | |
| Production builds | | | |
| Browser smoke and critical journeys | | | |
| Release gates (scan, links, dependency baseline) | | | |
