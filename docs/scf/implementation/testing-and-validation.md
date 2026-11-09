# Testing and validation

**Status:** inventory of tests, recorded executions and release gates, with a forward test plan; 2026-11-09.
**Evidence basis:** static counts by `grep` over the repository (no suite was run for this document and none is claimed to pass), `docs/backend-implementation/IMPLEMENTATION-STATUS.md`, `CI-VALIDATION-POLICY.md`, `MVP-1.5-CLOSURE.md`, `MVP-1.5-ACCEPTANCE.md`, `.github/workflows/*.yml`, `ci/README.md`, `release/RELEASE-GATES.json`.

Label: **Open Track guidance point 8** asks for a test plan in the unified source; section 8 is **our recommendation**. The SCF handbook does not prescribe a test-plan format.

## 1. Suites that exist (static counts)

Counts are of `test(`/`it(` call lines or `#[test]` attributes at the commit of this branch. Dynamically generated tests make recorded totals higher (for example the console total was 537 in the P2 record against roughly 380 static lines). Quote recorded totals for results, static counts only for existence.

| Suite | Location | Static count |
|---|---|---|
| Contract tests (Rust, Soroban test host) | `contracts/clearing/tests/*.rs` (11 files), `contracts/token/tests/token.rs` | 96 `#[test]` attributes: lifecycle 14, proposal 16, settlement 13, signed 8, digest 6, token 9, others |
| Console unit, integration, security | `apps/web-console/test/*.test.ts` | 42 files, about 380 tests |
| Web app unit | `apps/web/test/*.test.ts(x)` | 18 files, about 165 tests |
| SDK | `packages/mvp1-sdk/test` | 7 files, about 58 tests |
| Registry conformance suite | `apps/web-console/test/registry-conformance.suite.ts` | 13 tests (immutability, atomicity, key order, concurrency invariants, idempotency characterization) |
| Tenant-isolation suite | `apps/web-console/test/tenant-isolation.suite.ts` | 6 tests over 47 routes |
| Hosted guards and logging | `guards-hosted.test.ts` 11, `hosting-rate-logging.test.ts` 12, `apps/web/test/hosting.test.ts` 13, `log.test.ts` 2 | |
| Scripts | `scripts/release/scan.test.mjs`, `scripts/multisig/*.test.mjs`, `scripts/accounts/check-accounts.test.mjs`, signer tests under `scripts/tst-signer` | not counted |
| Browser journeys (console, real Chrome over CDP) | `apps/web-console/test/browser/`: `journey` (needs the Rust bridge), `w0-journey`, `sessions-journey`, `settlement-journey`, `authorization-journey`, `clearing-journey`, `backend-journey`, `wallet-auth-journey`, plus `badge.mjs` | 10 files |
| Web app checks | `apps/web/scripts/`: `check-hosted-config.mjs`, `check-security-headers.mjs`, `check-access.mjs`, `a11y-scan.mjs`, `contrast.mjs`, `keyboard-walkthrough.mjs`, `review-*.mjs` | scripts |
| Playwright smoke | `apps/web/e2e/smoke.spec.ts`, `playwright.config.ts` | 1 spec file |

Bridge-dependent tests are skipped without the Rust bridge; the P1 and P2 local runs had 8 console and 9 SDK skips. Same-author tests throughout.

## 2. Recorded executions

Only results written in repository documents. No result below was reproduced for this document.

| Record | Date | Commit / branch | Result as recorded |
|---|---|---|---|
| P0 baseline, `IMPLEMENTATION-STATUS.md` | date not stated | `main` at `b16a7db`, Node v24.14.0 | typecheck exit 0; console 494 tests, 486 pass, 8 skipped; SDK 64 tests, 55 pass, 9 skipped; web 150/150 |
| P1 local, same file | date not stated | branch `feat/backend-hosting-hardening` (merged as #48); commit hash not recorded | web 164/164; console 518 tests, 510 pass, 8 skipped; SDK unchanged; `check-hosted-config.mjs` 37 checks passed; `check-security-headers.mjs` 52 passed; `check-access.mjs` 19 pages and 124 API requests refused or redirected; `review-wallet-states.mjs` 154; `review-r2.mjs` 378; Playwright 6 passed; link check 0 broken |
| P2 local, same file | date not stated | branch `test/registry-conformance-suite` (merged as #50); commit hash not recorded | conformance 13/13; isolation 6/6; console 537 tests, 529 pass, 8 skipped |
| MVP-1.5 final regression, `MVP-1.5-CLOSURE.md` | 2026-11-07 | before the MVP-1.5 commit | console 465 tests: 457 pass, 8 skipped without the bridge; 465 pass with an existing bridge build; SDK 64 tests, 63 pass, 1 skipped; journeys at 1200 and 420 px: W0 43/43, sessions 78/78, settlement 90/90, authorization 44/44, clearing 71/71, backend 42/42, Console 128/128; release scan 854 files, 0 findings |
| MVP-1.5 acceptance, `MVP-1.5-ACCEPTANCE.md` | 2026-11-07 | | 19 criteria; final status: all PASS with limitations stated (criterion 16 PASS for logic with mocks only) |
| Testnet run | 2026-11-07 | | eight transactions, `evidence/settlement-run-2026-11-07.jsonl`, `settlement-reconciliation-2026-11-07.json` (`comparison.ok: true`, state `Settled`, ledger 5607448) |
| Mutation checks | P2: hand-run once and reverted (trigger removal, rollback commit, sorted position keys, membership and admin checks); contract mutation runs are in earlier milestone documents | | recorded in `IMPLEMENTATION-STATUS.md` P2 record. One check (last-administrator guard) was not caught by the first test and the test was rewritten |
| Hosted CI | none recorded | | `IMPLEMENTATION-STATUS.md` states "CI green on the PR" for #48 and "pending first CI run" for the web job; there is no log or link in the repository. This package makes no CI claim |

One intermittent failure is recorded: two 420 px journey runs failed once each (blank document after navigation) and then passed on re-run (`MVP-1.5-CLOSURE.md`). The accepted authorization journey was left unchanged.

## 3. CI workflow definitions (what would run, not what has passed)

| Workflow | Triggers | Jobs / checks |
|---|---|---|
| `ci.yml` | every pull request; manual | Job `checks`: `cargo fmt --check`, clippy (warnings advisory), Rust tests (`--locked`), bridge build, typecheck, console build, landing lint and build, SDK tests, console tests, skip allow-list report, npm inventory sync, link check, release-scan rule tests, release-gate file check, clean working tree. Job `web`: `npm ci --ignore-scripts`, web lint, web unit tests, web build, console build, `check-hosted-config.mjs`, Playwright smoke |
| `integration.yml` | push to `main`; weekly (`17 4 * * 1`); manual; pull requests touching dependency, `ci/` or `scripts/ci/` files (dependency report only) | Wasm build with Stellar CLI 28.0.0 and a second build; Wasm-mode tests; hash report (report-only); browser journey at 1200 and 420 px; dependency report (report-only) |
| `docs.yml` | pull requests touching `apps/docs/**` or root `package*.json`; manual | docs site typecheck, validation, build |
| `signer-tests.yml` | pull requests touching signer scripts; manual | signer portable and Windows suites (never executes the signer against a network) |
| `w0-console.yml` | pull requests touching `apps/web-console/**`; manual | W0 browser journey (mock adapter) |
| `release-readiness.yml` | manual only | strict gate check; fails while required gates are unresolved |

`ci/README.md` predates the `web` job and `docs.yml` and describes `ci.yml` without them; the workflow files are the reference. The README also records that these workflows had not been executed on GitHub-hosted runners when written.

## 4. Conformance and tenant-isolation suites

Both run on SQLite through `store-harness.ts`; `TOBIN_TEST_STORE=postgres` fails loudly because no PostgreSQL implementation exists. The domain tests (`registry.test.ts`, `clearing-ops`, `authorization-ops`, `settlement-ops`, `attempts-ops`, `wallet-ops`, `backend-db`) still build SQLite directly, so they cannot yet gate PostgreSQL; that conversion is deferred to P3. The concurrency tests run on a synchronous store and do not interleave.

## 5. Release gates (`release/RELEASE-GATES.json`; 22 gates)

| Status | Gates |
|---|---|
| PASS (10) | G01 copyright holder authority; G02 code licence scope; G03 documentation licence scope; G05 NOTICE applicability; G06 security reporting contact and policy; G07 public-testnet claims reconciled; G08 excluded authentication fixtures reviewed; G09 source tree reviewed for secrets; G11 authorized approval of the publication action; G12 dependency standard for source-only publication |
| BLOCKED (5) | G04 dependency and attribution review; G10 release artifacts and provenance; **P01 independent security review**; P02 wallet and multisig signing verification; P05 legal and compliance review for real-value use |
| NOT VERIFIED (7) | E01 `ci.yml` on a hosted runner for the exact commit; E02 `integration.yml`; E03 browser journey on hosted Linux; E04 Wasm hashes identical across two hosted runs; E05 branch protection; P03 measured resources, fees, storage lifetimes; P04 fuzzing and extended adversarial testing |

Gates apply to targets: `public-source-release`, `versioned-release`, `production`, `private-remote-backup`. Versioned and production releases are blocked.

## 6. Deferred checks and why

From `CI-VALIDATION-POLICY.md` (owner direction recorded 2026-11-09): a deferred test is not a passed test; deferrals are recorded per phase with the point at which they must run. Currently deferred: console browser journeys after P1 and P2 (UI unchanged); PostgreSQL conformance and concurrency (no PostgreSQL yet); backup restoration; dependency-aware CI and caching (before Railway staging); real Freighter under the CSP; Railway forwarded-address behaviour; migration rehearsals (P5). The policy's final release checklist table is empty.

## 7. Known test limits

Same-author tests; mock wallet and mock network for failure and unknown-outcome paths; Chrome only (Edge used by the owner for the single wallet run); no fuzzing; no load or performance test; no maximum-size (16-instruction) or all-zero run on Testnet; no measured resources or fees; one Testnet execution.

## 8. Test plan going forward (our recommendation)

| Milestone | Tests to add or run | Pass criterion |
|---|---|---|
| Before MVP-1.7 staging (P3) | Convert domain tests to the store-parametric asynchronous harness; dependency-aware CI | SQLite conformance unchanged and green |
| MVP-1.7 (P4, P5, P6) | PostgreSQL conformance and isolation; real concurrent-writer races; migration rehearsal against a copy; backup and restore drill; staging smoke and security-header checks against the hosted topology; verify forwarded-address behaviour | All required rows of the CI policy checklist filled with commit and run link |
| MVP-1.7 | Record hosted CI runs for E01 to E05; two Linux builds for E04; branch protection export for E05 | Gate statuses updated by evidence |
| MVP-1.7 | Real Freighter sign-in and signing under the production CSP; second wallet; hardware wallet or multisig pass | Gate P02 evidence |
| MVP-1.6 | Write-back and reconciliation tests (confirmed outcome stored only after a read-back matching the approved batch); all-zero and maximum-size Testnet sessions; measured resources and fees | Gate P03 evidence |
| MVP-1.7 | Fuzzing of plan validation and digest encoding; independent review | Gates P04, P01 |
| MVP-1.8 | Pilot acceptance scenarios with named institutions; operational drills (alert, restore) | `[OWNER INPUT NEEDED: pilot acceptance criteria and participants]` |

Mapping to SCF tranches is in the roadmap and budget documents of this package; milestones are not tranches.
