# Implementation status

**Status:** component-by-component status as of 2026-11-09, Stellar Testnet only. Source state: `origin/main` `8b2030d`. A capability-by-capability comparison of documented claims with the code is in [implementation-truth-matrix.md](implementation-truth-matrix.md).
**Evidence basis:** `AGENTS.md` sections 4, 13; `docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md`; source files named below; `docs/backend-implementation/` records; `git log` of this branch (merge commits #47, #48, #50).

Label: this document is **our own recommended documentation** (Open Track guidance point 8). It makes no claim of SCF compliance.

## 1. Maturity terms used

From `docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md`: **Implemented** (exists in the code), **Tested** (passed relevant automated or manual tests; scope stated), **Testnet-verified** (demonstrated against Stellar Testnet and read back), **Independently reviewed**, **Pilot-ready**, **Production-approved**. Nothing in Tobin is independently reviewed, pilot-ready or production-approved. Only the settlement path is Testnet-verified, narrowly: one owner-run execution of eight transactions with multisig co-signing, 1 base unit of a governed test token.

## 2. Components

| Component | Maturity | Where it runs / is deployed | Evidence | Limitation |
|---|---|---|---|---|
| Clearing and netting (obligations, sessions, deterministic `net = outgoing - incoming`, default plan) | Implemented; Tested (same-author) | Library in `packages/mvp1-sdk/src/engine/`; used by the console | `engine.test.ts`; `apps/web/test/netting.test.ts` | The engine yields a default plan; the contract accepts any valid plan. Netting benefit on real Stellar flows is unmeasured |
| Institutional authorization (calculation snapshots, reviewer decisions, separation of duties, stale-approval invalidation) | Implemented; Tested | Console backend | `lib/registry/authorization.ts`; `authorization*.test.ts` | A reviewer decision is a database record, not a signature; separate batch-reviewer rule not built |
| Settlement preparation (immutable batch, batch review, execution preconditions) | Implemented; Tested | Console backend | `lib/registry/settlement.ts`; `settlement*.test.ts` | A prepared batch is an application record, not a contract object |
| Execution state (attempts, events, states `awaiting-signer` to `reconciliation-required`) | Implemented; Tested with mocks | Console backend (state recorded); transactions only by owner-run tools | `lib/registry/settlement-state.ts`; `attempts-ops.test.ts` | Confirmed outcomes are not written back to application records; the hosted app does not sign, submit or confirm |
| Clearing contract `TobinClearingV1` | Implemented; Tested (Rust host tests); Testnet-verified (one run) | Stellar Testnet: `CCV3E…Y4DT` | `contracts/clearing/src/lib.rs`; `contracts/deployments/testnet.json`; `settlement-reconciliation-2026-11-07.json` | Not independently reviewed; no fuzzing; ceilings 4/16/16 and storage lifetimes provisional; resources and fees not measured |
| Token contract `TobinTestToken` (fixed minter, hard cap, no burn) | Implemented; Tested; deployed | Testnet governed instance `CD5OK…OKYO` | `contracts/token/src/lib.rs`; `token/tests/token.rs` | Test instrument; minter is a multisig controlled by one person |
| Stellar owner tools (`/wallet-check`, `/cosign-check`, `/settle-run`) | Implemented; Tested with mocks; Testnet-verified (one run) | Local only; refused by the hosted console | `lib/stellar/*`; `MVP-1.5-TESTNET-VERIFICATION.md` | Hosted execution is planned, not done; run plan hard-coded to a one-unit batch (`run.ts`); Freighter in Edge only |
| Wallet authentication (challenge, verify, sessions, multiple wallets) | Implemented; Tested with a protocol-compatible stand-in | Console backend and `apps/web` | `lib/auth/*`; `wallet-auth.test.ts` | Not Testnet-verified as a flow; real-Freighter sign-in run outstanding; no account recovery |
| Backend persistence | Implemented; Tested | SQLite, migrations 1 to 8 (`lib/db/database.ts`), 15 immutable tables | `registry-conformance.suite.ts`; `tenant-isolation.suite.ts` | Single instance; SQLite only; PostgreSQL planned (P3 to P5); migration 8 not tested on a real operator database |
| Hosted deployment | Implemented; owner-checked after deploy; Discover page Live-verified (2026-11-09) | `apps/web` on Vercel project `tobin-app` at `app.tobinprotocol.xyz`; console on Railway service `console` with a volume (SQLite). Identities: section 6 | `RAILWAY-TESTNET-PILOT.md` (working-tree record, 2026-11-09); section 6 | Testnet demonstration deployment, not an institutional pilot; registration open; no backup or restore test; edge behaviour partly unverified; the Vercel deployment records no Git SHA |
| Frontend `apps/web` (canonical user application) | Implemented; Tested (unit, Playwright smoke, local scripts) | Vercel | `apps/web/README.md`; `apps/web/test`, `e2e/smoke.spec.ts` | Notifications, Sign/Submit/Verify, wallet linking from the client not supported; cross-session views derived from at most 10 sessions by default |
| Frontend `apps/web-console` UI | Implemented; Tested (browser journeys) | Local; backend and API role hosted on Railway | `app/(institution)` | Overlaps `apps/web`; migration or retirement of its UI is a plan only; nothing is removed |
| Public Discover API (`/api/public/v1/stats`, `institutions`, `settlements`, `assets`) and the Discover page | Implemented; Tested; Live-verified (2026-11-09, section 6) | Console on Railway, via `apps/web` (the page calls it since #52) | `lib/public/discover.ts`; `public-discover.test.ts`; `apps/web/lib/discover/http.ts` | Opt-in only; settlements and statistics are `null` because no read-back is recorded; no organization is public yet, so every list is empty; not an indexer; the Institutions empty-state copy is wrong ("Public settlement data is not available yet.") |
| CI | Implemented as workflow definitions; results not recorded | GitHub Actions: `ci.yml`, `integration.yml`, `docs.yml`, `signer-tests.yml`, `w0-console.yml`, `release-readiness.yml` | `.github/workflows/`; `ci/README.md` | No hosted CI result is recorded in the repository (gates E01 to E05 NOT VERIFIED) |

## 3. Milestones (as stated in `AGENTS.md` section 13; names and order are fixed)

| Milestone | Status |
|---|---|
| MVP-1.2 Clearing Operations Foundation | Completed |
| MVP-1.3 Institutional Clearing Authorization | Completed |
| MVP-1.4 Settlement Preparation Engine | Completed |
| MVP-1.5 Stellar Settlement Integration | Completed with limitations |
| MVP-1.6 Institutional Operations and Reconciliation | Planned |
| MVP-1.7 Security, Governance and Infrastructure Hardening | Planned |
| MVP-1.8 Controlled Institutional Pilot | Planned |

Wallet-first authentication was delivered after MVP-1.5 as separate work (complete with limitations) and does not reorder the list. Mapping of work to milestones, per owner decision: broader operations and reconciliation to MVP-1.6; PostgreSQL, Railway, security and infrastructure hardening to MVP-1.7; controlled institutional usage to MVP-1.8. Mainnet deployment is not authorized, not built and not part of this submission (the scope is Stellar Testnet only). The milestones are not SCF tranches; the tranche mapping (our proposal) is in the roadmap documents of this package. A Railway deployment alone is not an institutional pilot.

## 4. Backend hosting hardening phases

Source: `docs/backend-implementation/IMPLEMENTATION-STATUS.md` (its phase table is slightly stale for P2) and the repository history.

| Phase | Scope | Status | Evidence |
|---|---|---|---|
| P0 | Decisions, baseline, dependency and risk matrix | **Merged**, PR #47 (`48dcc22`) | git history |
| P1 | Hosting readiness and security hardening | **Merged**, PR #48 (`660a351`) | git history; local results recorded in the status file |
| P2 | Registry conformance and tenant-isolation suites | **Merged**, PR #50 (`7e57707`) | git history. The status file still says "in review" |
| #51 | Public Discover API and the Dockerfiles | **Merged** | `origin/main` history at `8b2030d` |
| #52 | Discover page wired to the public API in `apps/web` | **Merged** | same; live-verified, section 6 |
| P3 | Asynchronous store refactor | Planned | status file |
| P4 | PostgreSQL implementation | Planned | status file |
| P5 | SQLite backup, inspection, migration utility, rehearsals | Planned | status file |
| P7 | Wallet linking, separate reviewer, email verification and recovery, aggregate reads, idempotency | Planned | status file |
| P6 | Railway staging | Planned | status file |
| P8 | Settlement execution in the hosted app | Planned; not approved and not started | status file |

The Railway deployment departs from ADR-0001 (PostgreSQL) on purpose and is recorded as an interim SQLite-on-volume setup; the owner approved the interim on 2026-11-09 (`RAILWAY-TESTNET-PILOT.md`).

## 5. What is not done

Hosted settlement execution; any code path from a database-approved batch to a Stellar submission; write-back of confirmed outcomes; email verification; wallet linking in the new UI (the "Connect a wallet" button is sign-in); invitation-controlled registration; PostgreSQL; backup and restore; monitoring; second or hardware wallet validation; measured resources and fees; maximum-size and all-zero sessions on Testnet; independent review. Mainnet is not authorized, not built and not part of this submission. See [testing-and-validation.md](testing-and-validation.md) and [../security/security-overview.md](../security/security-overview.md).

## 6. Deployment identities and live verification (2026-11-09)

**Deployment facts (owner and project records, 2026-11-09).**

| Item | Value |
|---|---|
| Web app | `apps/web` on the Vercel project `tobin-app` at https://app.tobinprotocol.xyz |
| Production deployment | `dpl_GtbBUWS6XoyqAo4KGKsjchmPEmtj`, created 2026-11-09 21:26 UTC from a clean export of `main` `8b2030d`, uploaded with the Vercel CLI |
| Previous production deployment | `tobin-9cglhno59` (19:27 UTC), built before #51 and #52; its Discover page did not call the API |
| Console | Railway service `console` (public domain `console-production-84ae.up.railway.app`), deployment `37e219ca`, SUCCESS 2026-11-09 19:16 UTC, uploaded with the Railway CLI; SQLite on a volume; single replica |
| Console guards | Host allow-list, shared proxy secret; serves only `/api/auth`, `/api/registry`, `/api/public` and probes |
| Superseded | an old Railway `web` service still exists |

**Provenance limitation (fixed, not resolvable by wording).** The Vercel project has no Git integration. The deployment was created by uploading a clean export of `main` `8b2030d` with the CLI, so the commit identity is the uploader's own metadata (`sourceCommit`), not a Git SHA recorded by Vercel. The Railway deployment was also uploaded with the CLI and records no commit hash. Neither deployment can be tied to a commit by the platform's own record.

**Discover, live-verified on 2026-11-09 (Live-verified; read-only observation of the deployed page).** At desktop 1440, tablet 768 and mobile 390 px the page called `GET /api/public/v1/stats`, `/institutions?sort=name&limit=20`, `/settlements?sort=newest&limit=20` and `/assets?sort=code&limit=20`, all answering 200. The stats response was: `settlementsRecorded` null, `institutionsOptedIn` 0, `assetsInUse` null, `lastSettlementAt` null, with a note that no settlement has been independently read back. The page shows "No data" for the three null figures and 0 for institutions opted in; the three lists are empty because no organization has chosen public visibility. No horizontal overflow at any of the three widths. One finding: the Institutions tab's empty state says "Public settlement data is not available yet." (wrong noun). This is not an indexer: the API lists organizations that chose public visibility only. Not checked: other pages of the deployed app, authenticated flows, behaviour under load.

**Local runs of 2026-11-09 (local, not CI)** are recorded in [testing-and-validation.md](testing-and-validation.md) section 2.
