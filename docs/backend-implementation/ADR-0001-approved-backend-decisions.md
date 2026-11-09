# ADR-0001: Approved decisions for backend hardening, PostgreSQL and the Railway Testnet pilot

- **Status:** Accepted by the project owner.
- **Date of acceptance:** 2026-11-09 (the owner's implementation mandate for the next backend phase; the individual decisions below were stated there as approved).
- **Scope:** Stellar Testnet institutional pilot only. No Mainnet, no real-value use, no production approval.
- **Baseline:** `main` at commit `b16a7db`. The findings these decisions respond to are in [`docs/backend-audit/`](../backend-audit/README.md), which is kept unchanged as the historical baseline (it was added to the repository in commit `898ea5d`). The audit recommended; this record is where the owner accepted. Where the two differ, this record governs the implementation.
- **Standing rules that this record does not change:** [`AGENTS.md`](../../AGENTS.md) sections 6, 7, 11 and 12 (trust boundaries, invariants, Git rules, restricted actions).

## 1. Accepted decisions

Each row records what was approved, why (with the audit evidence), and which phase implements it. "Phase" uses the sequence P0 to P8 of the mandate (P0 decisions, P1 hosting and security hardening, P2 test foundation, P3 asynchronous store, P4 PostgreSQL, P5 migration rehearsal, P6 Railway staging, P7 product gaps, P8 settlement execution, which is out of scope).

| ID | Decision | Rationale and evidence | Phase |
|---|---|---|---|
| BD-01 | Host on Railway, for a **Stellar Testnet institutional pilot only** | The audit scoped hosting to the Testnet pilot (`railway-deployment-architecture.md`); production deployment is not approved (`AGENTS.md` section 1) | P6 |
| BD-02 | PostgreSQL through `pg` (node-postgres) | A hosted deployment needs more than one SQLite file on one volume can give (replicas, managed backups); `postgresql-target-architecture.md` sections 1, 16 | P4 |
| BD-03 | No ORM | The existing SQL is static and parameterised (`security-assessment.md`, "found sound"); the store interface is the boundary; the repository avoids runtime dependencies for persistence | P4 |
| BD-04 | Two separate services: `apps/web` public, `apps/web-console` private; the database is a private PostgreSQL service | Keeps the console and its credentials off the public network; merging the two Next apps would be a rewrite with no stated gain (`railway-deployment-architecture.md` sections 4, 9) | P1, P6 |
| BD-05 | Owner Stellar tools stay locally operated by the owner | The hosted console must not hold signing keys or run the owner-run settlement tool (`stellar-settlement-architecture.md`) | all |
| BD-06 | Preserve the necessary existing SQLite data | No evidence of production data was found, but the database was not inspected (`sqlite-postgresql-migration-plan.md` section 2); inspection decides what is necessary | P5 |
| BD-07 | The authorization-entry lifetime is **10 ledgers** | The project policy says 10; `apps/web-console/lib/stellar/run.ts:19` sets `ENTRY_LIFETIME_LEDGERS = 30` (`stellar-settlement-architecture.md`). The code is brought to the policy; accepted decisions and tests that assert 30 change with it | P1 |
| BD-08 | A **different reviewer must approve the settlement batch** than the one who approved the calculation | Today the batch reviewer is only barred if they prepared the batch, so one reviewer can approve both (`authentication-and-authorization.md`, A5). Enforced on the server by user id | P7 |
| BD-09 | Implement real **wallet linking** to the authenticated account | "Connect a wallet" on the Wallets tab runs the sign-in flow and can create a separate wallet-only user and replace the cookie (`frontend-backend-mapping.md`, M09; README section 6). The backend link routes exist; the app has no client method | P7 |
| BD-10 | Registration is **invitation-controlled**; no unrestricted public registration | `POST /api/auth/register` is unrated and unrestricted today (SEC-05) | P1, P7 |
| BD-11 | Implement **email verification and account recovery** before any open registration | Emails are never verified and there is no reset (SEC-04; authentication document A1, A9) | P7 |
| BD-12 | Preserve the existing prefixed text identifiers | Ids are referenced as text in URLs, hashes and tests; changing them adds migration risk for no benefit | P4 |
| BD-13 | `json`, not `jsonb`, for order-sensitive position documents | `registry/service.ts:618` compares `JSON.stringify` of stored and recomputed positions; `jsonb` reorders keys and would fail every settlement preparation (`postgresql-target-architecture.md` section 6.3) | P4 |
| BD-14 | `numeric(39,0)` with range constraints for large integer amounts; amounts travel as decimal strings, never as JavaScript `Number` | Amounts are digit strings up to i128 (section 6.2) | P4 |
| BD-15 | A bounded PostgreSQL connection pool | Avoids unbounded connections on a managed plan (section 9) | P4 |
| BD-16 | Immutability by database triggers **and** privileges | 15 tables are trigger-immutable today and `user_wallets` is revoke-only (`sqlite-database-inventory.md`); the application role must not be able to bypass them | P4 |
| BD-17 | Two database roles: an application role with minimum privileges, and a migration/owner role used only for controlled schema operations and never by a request handler | Separates ordinary operation from schema authority; the owner credential never reaches the web application | P4, P6 |
| BD-18 | Defer PostgreSQL row-level security | Application scoping is consistent today, and RLS interacts with pooling and adds cost (section 13); revisit after the pilot | later |
| BD-19 | Stellar signing keys stay out of the backend | The code holds only public keys; signing happens in Freighter (`stellar-settlement-architecture.md`); this is the existing signing-authority boundary | all |
| BD-20 | Keep the existing two-application split | Same as BD-04 | all |
| BD-21 | Exclude the MVP-1 sandbox, the W0 mock API, `/api/rpc` and `/api/bootstrap` from production access, by explicit production exclusion or refusal, not by the Host guard alone | These routes have no authentication of their own (SEC-01, SEC-17) | P1 |
| BD-22 | Replace browser-side fan-out with aggregate, paginated and filtered backend reads where the audit specifies (M01 to M08) | The Overview, Reviews, Obligations and Activity pages derive from per-session reads (about 3 requests per session over 10 sessions) and `GET /sessions/:id` reads the whole organization activity log | P7 |
| BD-23 | No Mainnet support and no real-value settlement | `AGENTS.md` sections 1 and 12 | all |

Settlement execution (P8) is explicitly **not** approved: see section 4.

## 2. Consequences the owner should know about

1. **Reviewer capacity (BD-08).** After this rule, an organization needs at least two people holding the Reviewer grant: one approves the calculation, a different one approves the batch, and the batch approver must also not be the person who prepared it. A one-reviewer organization will be unable to finish a settlement batch. This is intended separation of duties; it must be stated in the UI and documents. Historical approvals are not rewritten (the immutable records are not touched).
2. **Invitation-controlled registration (BD-10) affects more than the register route.** Wallet sign-in currently creates a new wallet-only user for an unknown key. Under this decision that creation must also be controlled. Who creates the first organization is unresolved (U-11).
3. **BD-07 touches the owner-run tool's constant** (`lib/stellar/run.ts`). It is a policy lifetime, not a signing-authority change; existing tests that assert 30 change deliberately and are listed in the phase record.
4. **BD-02 adds a runtime dependency (`pg`).** The approval covers `pg` and its types only. The dependency baseline (`ci/dependency-baseline.csv`) and the lockfile update with it.
5. **The Wallets-tab behaviour changes** from sign-in to linking (BD-09): wording, tests and the pull request text that described the button as detection only are corrected in P7.

## 3. Decisions deliberately left open

These are **unresolved**. Nothing here is assumed; each is closed by the owner in writing, or by an engineering choice that is recorded and reviewable when the owner has delegated it. "Needed by" is the first phase that cannot finish without an answer.

| ID | Open decision | Needed by | Audit reference |
|---|---|---|---|
| U-01 | Locking strategy: transaction-scoped advisory lock vs row lock vs `SERIALIZABLE` retry. The mandate prefers an advisory lock if it keys safely by organization; the final choice follows the real PostgreSQL design review in P4 and is then recorded here | P4 | target architecture section 8 |
| U-02 | Email delivery provider (a provider abstraction and a test adapter are built; no provider is chosen or paid for) | P7 production use | security SEC-04 |
| U-03 | Cascade from membership removal to wallet-verification evidence: preserve or change | P4 | target architecture section 5 |
| U-04 | Foreign keys on actor columns and removal of the dead `settlement_instructions` columns | P4 | target architecture sections 5, 14 |
| U-05 | Data retention periods (sessions, challenges, rate events, idempotency keys, audit) | P4 | target architecture section 17 |
| U-06 | Whether `activity` needs external tamper-evidence anchoring | later | target architecture section 12 |
| U-07 | Whether the two wallet mechanisms (`wallet_verifications`, `user_wallets`) are eventually unified | later | inventory; target architecture section 14 |
| U-08 | Migration archive location and retention period for the frozen SQLite files | P5 | migration plan sections 9, 12 |
| U-09 | Staging soak duration and rollback window | P6 | migration plan section 12 |
| U-10 | Browser support beyond Chrome, and screen-reader acceptance | P6 | testing plan |
| U-11 | **First-organization bootstrap** under invitation-controlled registration, and how wallet sign-in creation of unknown users is controlled. Engineering options to be proposed in P1/P7: an operator-issued platform invitation (for example through the operator script `scripts/db.ts`) is the lowest-surface option; not chosen yet | P1 design | new finding of this phase |
| U-12 | **Milestone mapping.** `AGENTS.md` sections 13 and 14 forbid renaming, reordering or expanding the approved milestones. This work fits MVP-1.7 (Security, Governance and Infrastructure Hardening) and prepares MVP-1.8 (Controlled Institutional Pilot); the owner confirms the mapping or states otherwise. The implementation does not rename or alter any milestone | P0 follow-up | new finding of this phase |
| U-13 | Whether an organization with fewer than two reviewers should be warned or blocked earlier than at batch approval (consequence 1) | P7 | new finding of this phase |

## 4. Out of scope (not approved by this record)

- **P8, settlement execution.** The database execution and attempt tables are not connected to the real signing path; the owner tool keeps state in memory; the chain-outcome verifier has no production caller; no route can set `chain-confirmed` (`stellar-settlement-architecture.md`). A separate design proposal follows the rest of this work and needs its own approval.
- Mainnet, real-value settlement, token or contract changes, signer-set or signing-authority changes, server-side private keys.
- A public Discover explorer or organization directory.
- Row-level security (BD-18) and a hash-chained audit log (not warranted now; section 12 of the target architecture).
- Public deployment and the final data cutover, each of which needs a separate explicit owner approval after the staging report is reviewed.

## 5. How this record relates to the audit

The audit documents are not edited to reflect these decisions. Only the owner-decision section of [`docs/backend-audit/architecture-decisions.md`](../backend-audit/architecture-decisions.md) carries an appended status annex (section 5 there), without deleting the original proposals or evidence. Progress is tracked in [`IMPLEMENTATION-STATUS.md`](IMPLEMENTATION-STATUS.md); dependencies and risks in [`DEPENDENCY-AND-RISK-MATRIX.md`](DEPENDENCY-AND-RISK-MATRIX.md).
