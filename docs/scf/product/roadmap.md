# Tobin: roadmap, milestones and tranche plan

**Status:** roadmap and milestone plan for the SCF Build Award (Open Track) submission, dated 2026-11-09. Milestones keep the names in `AGENTS.md` section 13. Costs are owner input.
**Evidence basis:** `AGENTS.md` section 13, milestone closure records under `docs/product/architecture/`, [`release/RELEASE-GATES.json`](../../../release/RELEASE-GATES.json), `docs/backend-implementation/` (ADR-0001, status, risk matrix), [`docs/backend-audit/backend-implementation-roadmap.md`](../../backend-audit/backend-implementation-roadmap.md), SCF handbook (verified 2026-11-09).

Labels: **OFFICIAL** = SCF handbook rule. **OUR PROPOSAL** = our recommended mapping. Milestones (MVP-1.x) are product milestones and are **not** SCF tranches; section 5 maps one to the other.

## 1. Existing work (traction, not a deliverable)

SCF does not reimburse past work. The table is traction and evidence of capability. None of it is requested for funding.

| Milestone | Description | Status (AGENTS.md section 13) | Evidence |
|---|---|---|---|
| MVP-1.2 | Clearing Operations Foundation | Completed | `docs/product/architecture/mvp-1.2/CLEARING_OPERATIONS_CLOSURE.md`, `BACKEND_PERSISTENCE_ACCEPTANCE.md` |
| MVP-1.3 | Institutional Clearing Authorization | Completed | `docs/product/architecture/mvp-1.3/MVP-1.3-CLOSURE.md` |
| MVP-1.4 | Settlement Preparation Engine | Completed | `docs/product/architecture/mvp-1.4/MVP-1.4-CLOSURE.md` |
| MVP-1.5 | Stellar Settlement Integration | Completed with limitations | [`MVP-1.5-CLOSURE.md`](../../product/architecture/mvp-1.5/MVP-1.5-CLOSURE.md); [`MVP-1.5-TESTNET-VERIFICATION.md`](../../product/architecture/mvp-1.5/MVP-1.5-TESTNET-VERIFICATION.md); `evidence/settlement-reconciliation-2026-11-07.json` |
| Wallet-first authentication | delivered after MVP-1.5, separate work | Complete with limitations (real-Freighter validation of sign-in outstanding) | `docs/product/architecture/wallet-first-auth/` |
| Backend hardening P0 to P2 | ADR, hosting hardening, store and tenant-isolation tests | P0, P1 and P2 merged (PRs #47, #48, #50). Also merged: #51 (public Discover API, Dockerfiles) and #52 (Discover wired in `apps/web`) | `docs/backend-implementation/IMPLEMENTATION-STATUS.md` |
| Hosted Testnet demonstration deployment (interim) | Vercel web, Railway console on SQLite volume; does not execute settlement | deployed; checked by the owner and, for the Discover page, live-verified on 2026-11-09 ([implementation status](../implementation/implementation-status.md)); registration open | `docs/backend-implementation/RAILWAY-TESTNET-PILOT.md` |

MVP-1.5 limitations that stand: same-author evidence; one owner-run execution of eight transactions, 1 base unit; no independent security review; no fuzzing; Freighter in Edge only, no second or hardware wallet; fees recorded per transaction but not broken down; confirmed outcomes not written back to application records.

## 2. Planned milestones

Owner mapping (binding): broader institutional operations and reconciliation to MVP-1.6; PostgreSQL, Railway, security and infrastructure hardening to MVP-1.7; controlled institutional usage to MVP-1.8. Mainnet deployment is not authorized, not built and not part of this submission (owner decision, 2026-11-09): the current scope is Stellar Testnet only. `docs/backend-implementation/ADR-0001-approved-backend-decisions.md` (U-12) left this mapping for owner confirmation; this document records it.

Phase labels P0 to P8 are the backend phases in the repository. Costs: `[OWNER INPUT NEEDED: cost per deliverable]` (see [budget](budget-and-timeline.md)).

### MVP-1.6 Institutional Operations and Reconciliation

| ID | Deliverable | Verification method | Source |
|---|---|---|---|
| D1.6-1 | Persist chain-confirmed outcomes: execution attempts, transaction hashes and read-backs stored in application records; provenance label `chain-confirmed` set only with a confirmed creating transaction; states `confirmed` and `reconciled` reachable only from evidence | Unit and integration tests for state transitions; independent chain read of each recorded hash matches the stored record; negative tests (no label without a confirmed transaction) | P8 and `stellar-settlement-architecture.md` (audit); `AGENTS.md` section 6 |
| D1.6-2 | Repeatable reconciliation: re-run read-back and comparison against the approved batch, with unknown outcomes resolved by reading the original hash, never by resending | Tests with simulated `NOT_FOUND` and timeout; one Testnet run reconciled twice with identical result | `AGENTS.md` section 6; P8 |
| D1.6-3 | Hosted settlement initiation path with signing outside the backend (no server-side keys) | Review of the code for key handling; Testnet run initiated from the hosted app, signed in the user's wallet, read back | PRD-STL-003; ADR-0001 BD-19. Needs its own owner approval (P8) |
| D1.6-4 | Product backend gaps from the audit mapping: aggregate and paged reads, wallet linking, idempotency keys, atomic create-session-with-participants | Contract tests per endpoint; conformance suite unchanged | P7; BD-09, BD-22 |
| D1.6-5 | Separate batch-reviewer rule and reviewer-capacity warning | Server-side tests by user id | BD-08; U-13 |
| D1.6-6 | Operational reporting: settlement, session and reconciliation history views | Browser journeys; reconciliation report matches chain read | OUR PROPOSAL |
| D1.6-7 | Measured resources and fee breakdown for a Testnet session, including a maximum-size (16-instruction) run and an all-zero run | Recorded Testnet transactions with fee and resource data from RPC | gate P03; MVP-1.5 limitations |
| D1.6-8 | Second wallet validation (and, if available, hardware wallet) and real-Freighter validation of sign-in | Recorded validation procedure and results | gate P02; README remaining work |

### MVP-1.7 Security, Governance and Infrastructure Hardening

| ID | Deliverable | Verification method | Source |
|---|---|---|---|
| D1.7-1 | PostgreSQL store (asynchronous store refactor, then PostgreSQL), migration utility and rehearsals | The conformance and tenant-isolation suites pass on PostgreSQL; two clean rehearsals with row counts and hashes; rollback rehearsed | P3 to P5; BD-02, BD-12 to BD-17 |
| D1.7-2 | Railway staging and cutover with backups, a restore test, rollback window, logs | Restore test passed and recorded; staging soak completed | P6; U-08, U-09 |
| D1.7-3 | Invitation-controlled registration, email verification, account recovery | Tests; abuse-case tests on the hosted deployment | BD-10, BD-11; U-02, U-11 |
| D1.7-4 | Threat model for the current system and an on-chain monitoring plan | Documents reviewed against SCF Tranche 2 requirement (OFFICIAL); monitoring exercised on Testnet | handbook; `MVP-1.5-THREAT-MODEL.md` |
| D1.7-5 | Fuzzing and extended adversarial tests of the contracts and digest code | Fuzz targets committed, run logs, defects found and fixed | gate P04 |
| D1.7-6 | Hosted CI evidence: pull-request, integration and browser workflows pass on GitHub-hosted runners; Wasm hashes identical across independent runs | Recorded CI runs for an exact commit (gates E01 to E04) | `RELEASE-GATES.json` |
| D1.7-7 | Branch protection with required checks; dependency and attribution review | Settings inspection; gate G04 | E05, G04 |
| D1.7-8 | Governance: independent signers for the Testnet administrative account, master key disabled | Signer-set read from the network | `contracts/deployments/testnet.json` note |
| D1.7-9 | Request for independent security review through the Audit Bank | Request filed and engagement recorded. Audit costs are outside this budget. | OFFICIAL (audit costs ineligible) |
| D1.7-10 | Open-source plan for smart contracts | Published plan; repository licence is Apache-2.0 | OFFICIAL requirement |

### MVP-1.8 Controlled Institutional Pilot

MVP-1.8 is planned, not started, and in this submission runs on Stellar Testnet only. A Railway or Vercel deployment alone is **not** an institutional pilot. Conditions MVP-1.8 must meet to qualify (derived from `docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md`, "Pilot-ready", and the gates):

| ID | Pilot condition | Verification method |
|---|---|---|
| D1.8-1 | Named participating institutions with their own Stellar accounts and signers: `[OWNER INPUT NEEDED: participating institutions, number, jurisdictions, whether they have agreed in writing]` | Written participation record; verified wallet ownership and signer sets read from the network |
| D1.8-2 | Controlled scope in writing: assets, maximum amounts, session sizes within contract ceilings, duration, network | Pilot charter; settlement caps enforced and tested |
| D1.8-3 | Real Stellar flows (Stellar Testnet only) executed through the hosted application with reconciliation of every settlement | Each settlement read back by hash and reconciled; `chain-confirmed` records |
| D1.8-4 | Pilot acceptance criteria defined before the pilot: `[OWNER INPUT NEEDED: acceptance criteria and exit thresholds]` | Criteria recorded and evaluated |
| D1.8-5 | Independent security review completed (or findings accepted in writing) before real value | Review report from an independent party (gate P01) |
| D1.8-6 | Measurement of whether the participants' flows reduce gross settlement | Netting-benefit report using ledger and pilot data; method in the metrics document |
| D1.8-7 | Operational runbooks, incident handling, support contact, backups tested | Runbook exercise recorded |

## 3. Consolidation of `apps/web` and `apps/web-console` (plan only)

Owner decision: `apps/web` is the canonical user-facing application; `apps/web-console` stays. Nothing is deleted or changed by this plan.

| Item | Position |
|---|---|
| `apps/web-console` responsibilities | Backend: route handlers (`/api/auth`, `/api/registry`, `/api/stellar`, `/api/public`), SQLite persistence and migrations, registry and authorization services, Stellar plan builder, RPC adapter, owner-run tools (`/wallet-check`, `/cosign-check`, `/settle-run`), the MVP-1 sandbox and W0 mock console (`AGENTS.md` sections 4 and 8) |
| `apps/web` responsibilities | Institutional UI as a client of the console API through a server-side proxy (`apps/web/README.md`) |
| Overlapping UI | The console's `(institution)` pages and `apps/web` both present sessions, calculations, authorization and settlement preparation |
| Plan | (1) reach functional parity in `apps/web` for the institutional pages; (2) move the owner-run tool pages behind the hosted settlement path (D1.6-3) or keep them local; (3) mark the console UI pages deprecated in documentation when parity is recorded by the owner; (4) keep the console as the API/backend service until a separate decision; (5) retire only the duplicate UI pages, after tests and browser journeys on `apps/web` cover them. Each step needs owner sign-off. |

## 4. Mapping to SCF tranches

**OFFICIAL (SCF handbook, verified 2026-11-09):** awards up to USD 150,000 in XLM, typically 3 to 6 months and not over 6; four installments: Tranche 0 10% on award acceptance, not tied to a deliverable; Tranche 1 20% (MVP); Tranche 2 30% (Testnet or equivalent); Tranche 3 40% (Mainnet launch or equivalent). The three-tranche structure is recommended and may be adjusted. The handbook says the final tranche is normally a Mainnet launch, and that jurisdiction-specific restrictions may modify this, for example a Testnet-only final tranche. Each tranche is submitted within 90 calendar days of the previous payment or the balance is forfeited. Deliverables must be specific, verifiable and carry a cost. A threat model and an on-chain monitoring plan are required in Tranche 2.

**TEAM'S SCOPE:** this submission is Testnet only. A Testnet-only final tranche is the team's scope, relying on the handbook's allowance above; it is not an SCF decision and SCF may decide otherwise.

**OUR PROPOSAL (the structure may be adjusted):**

| Tranche | Official share | Proposed contents | Reasoning |
|---|---|---|---|
| Tranche 0 | 10% | No deliverable. Use: start of MVP-1.6 and the Audit Bank request preparation | Official rule |
| Tranche 1 (MVP) | 20% | MVP-1.6: D1.6-1 to D1.6-8 | The product already exceeds a bare MVP on Testnet (past work, not reimbursed). The reviewable new step is closing the loop between chain and application record, plus measured behaviour |
| Tranche 2 (Testnet or equivalent) | 30% | MVP-1.7: D1.7-1 to D1.7-10, including the threat model and monitoring plan the handbook requires here | Hardening of the Testnet system to the point where it can support a pilot; the independent review request is filed here |
| Tranche 3 (controlled institutional usage, Testnet milestone) | 40% | MVP-1.8 controlled institutional usage on Stellar Testnet | The team's Testnet-only scope. Risk we state openly: MVP-1.8 depends on conditions outside the development budget (named participating institutions, independent security review). If they are not met within the award period, the structure should be adjusted with SCF rather than the conditions relaxed |

Timing: each tranche within 90 calendar days of the previous payment. `[OWNER INPUT NEEDED: planned calendar start date and duration per milestone]`.

## 5. Mainnet: not authorized and not part of this submission

Nothing in the repository authorizes Mainnet (`AGENTS.md` section 12), no Mainnet path is built, and Mainnet is not a deliverable or a gated objective of this submission. Any future Mainnet work would be a separate decision and a separate application. For context, release gate status read from `release/RELEASE-GATES.json` on 2026-11-09:

| Gate | Status | Meaning |
|---|---|---|
| G01, G02, G03, G05, G06, G07, G08, G09, G11, G12 | PASS | Source-only publication gates (founder attestations; not legal review) |
| G04 Dependency and attribution review | BLOCKED | Required for a versioned release and for production |
| G10 Release artifacts and provenance | BLOCKED | No hosted build; Wasm reproducibility across Linux runs not established |
| E01 to E05 Hosted CI, browser journeys, Wasm hash reproducibility, branch protection | NOT VERIFIED | No hosted CI run recorded |
| P01 Independent security review | BLOCKED | None exists |
| P02 Wallet and multisig signing verification | BLOCKED | Incomplete |
| P03 Measured resources, fees, storage lifetimes | NOT VERIFIED | Declared, not measured |
| P04 Fuzzing | NOT VERIFIED | Only seeded property tests and author-run mutation checks |
| P05 Legal and compliance review for real-value use | BLOCKED | Not performed |

Not authorized today and not planned in this submission: Mainnet deployment, real-value settlement, token minting or supply change, signer changes, production approval.
