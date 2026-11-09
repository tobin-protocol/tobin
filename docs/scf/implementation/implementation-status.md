# Implementation status

**Status:** component-by-component status as of 2026-11-09, Stellar Testnet only.
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
| Hosted deployment | Implemented; checked by the owner after deploy | `apps/web` on Vercel at `app.tobinprotocol.xyz`; console on Railway with a volume (SQLite) | `RAILWAY-TESTNET-PILOT.md` (working-tree record, 2026-11-09) | Testnet demonstration deployment, not an institutional pilot; registration open; no backup or restore test; edge behaviour partly unverified |
| Frontend `apps/web` (canonical user application) | Implemented; Tested (unit, Playwright smoke, local scripts) | Vercel | `apps/web/README.md`; `apps/web/test`, `e2e/smoke.spec.ts` | Notifications, Sign/Submit/Verify, wallet linking from the client not supported; cross-session views derived from at most 10 sessions by default |
| Frontend `apps/web-console` UI | Implemented; Tested (browser journeys) | Local; backend and API role hosted on Railway | `app/(institution)` | Overlaps `apps/web`; migration or retirement of its UI is a plan only; nothing is removed |
| Public Discover API (`/api/public/v1/stats`, `institutions`, `settlements`, `assets`) | Implemented; Tested | Console on Railway, via `apps/web` | `lib/public/discover.ts`; `public-discover.test.ts` | Opt-in only; settlements and statistics are `null` because no read-back is recorded; the web Discover screen is not wired to it |
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

Wallet-first authentication was delivered after MVP-1.5 as separate work (complete with limitations) and does not reorder the list. Mapping of work to milestones, per owner decision: broader operations and reconciliation to MVP-1.6; PostgreSQL, Railway, security and infrastructure hardening to MVP-1.7; controlled institutional usage to MVP-1.8; Mainnet deployment is the final gated objective. The milestones are not SCF tranches; the tranche mapping is in the roadmap documents of this package. A Railway deployment alone is not an institutional pilot.

## 4. Backend hosting hardening phases

Source: `docs/backend-implementation/IMPLEMENTATION-STATUS.md` (its phase table is slightly stale for P2) and the repository history.

| Phase | Scope | Status | Evidence |
|---|---|---|---|
| P0 | Decisions, baseline, dependency and risk matrix | **Merged**, PR #47 (`48dcc22`) | git history |
| P1 | Hosting readiness and security hardening | **Merged**, PR #48 (`660a351`) | git history; local results recorded in the status file |
| P2 | Registry conformance and tenant-isolation suites | **Merged**, PR #50 (`7e57707`) | git history. The status file still says "in review" |
| #51 | Not in this branch's history | In review (per the project owner) | `[OWNER INPUT NEEDED: title and scope of PR #51]` |
| P3 | Asynchronous store refactor | Planned | status file |
| P4 | PostgreSQL implementation | Planned | status file |
| P5 | SQLite backup, inspection, migration utility, rehearsals | Planned | status file |
| P7 | Wallet linking, separate reviewer, email verification and recovery, aggregate reads, idempotency | Planned | status file |
| P6 | Railway staging | Planned | status file |
| P8 | Settlement execution in the hosted app | Planned; not approved and not started | status file |

The Railway deployment departs from ADR-0001 (PostgreSQL) on purpose and is recorded as an interim SQLite-on-volume setup; the owner approved the interim on 2026-11-09 (`RAILWAY-TESTNET-PILOT.md`).

## 5. What is not done

Hosted settlement execution; write-back of confirmed outcomes; email verification; wallet linking in the new UI; invitation-controlled registration; PostgreSQL; backup and restore; monitoring; second or hardware wallet validation; measured resources and fees; maximum-size and all-zero sessions on Testnet; independent review; Mainnet (not approved). See [testing-and-validation.md](testing-and-validation.md) and [../security/security-overview.md](../security/security-overview.md).
