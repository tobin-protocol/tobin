# Diagrams index

**Status:** index of the Mermaid diagrams for the SCF submission package; 2026-11-09. The files have not been rendered by a Mermaid renderer; syntax was checked by reading.
**Evidence basis:** the source files listed per row. Convention: solid = implemented; dashed lines and the `planned` class (grey, dashed border) = proposed. A planned component is never drawn as existing.

Label: our own recommended documentation (Open Track guidance point 8 asks for diagrams in the unified source).

| File | Purpose | Audience | Source files | Status |
|---|---|---|---|---|
| [system-context.mmd](system-context.mmd) | Who and what Tobin touches | SCF reviewer | `README.md`, `AGENTS.md` section 1, `RAILWAY-TESTNET-PILOT.md` | mixed (hosted execution proposed) |
| [architecture.mmd](architecture.mmd) | Components, proxy, backend, SDK, storage | Reviewer, developer | `apps/web/lib/proxy-policy.ts`, `apps/web-console/lib/*`, `AGENTS.md` section 4 | mixed (PostgreSQL proposed) |
| [clearing-lifecycle.mmd](clearing-lifecycle.mmd) | Application records versus on-chain steps, with the hosted stop point | Reviewer | `lib/registry/settlement-state.ts`, `AGENTS.md` section 6 | mixed (write-back proposed) |
| [netting-validation.mmd](netting-validation.mmd) | Engine default plan versus contract validation | Technical reviewer | `packages/mvp1-sdk/src/engine/`, `contracts/clearing/src/lib.rs:921` | current |
| [approval-authorization.mmd](approval-authorization.mmd) | Authentication, reviewer approval, debtor authorization kept distinct | Security reviewer | `lib/registry/authorization.ts`, `lib.rs:555-668` | current |
| [settlement-signing.mmd](settlement-signing.mmd) | Owner-run local signing sequence | Security reviewer | `lib/stellar/run.ts`, `freighter.ts` | current |
| [submission-verification.mmd](submission-verification.mmd) | Prepared to reconciled, unknown outcome | Reviewer | `AGENTS.md` section 6, `settlement-state.ts` | current |
| [onchain-offchain.mmd](onchain-offchain.mmd) | What lives in the database versus the contracts | Reviewer | `contracts/README.md`, `lib/registry/types.ts` | mixed |
| [trust-boundaries.mmd](trust-boundaries.mmd) | Zones and controls between them | Security reviewer | `HOSTING-CONFIGURATION.md`, `guards.ts`, [threat model](../security/threat-model.md) | mixed (monitoring proposed) |
| [deployment-current.mmd](deployment-current.mmd) | Vercel, Railway and SQLite as deployed (owner record) | Reviewer, operator | `RAILWAY-TESTNET-PILOT.md`, `Dockerfile.*` | current, not independently verified |
| [deployment-planned.mmd](deployment-planned.mmd) | PostgreSQL topology planned for MVP-1.7 | Reviewer | `docs/backend-audit/postgresql-target-architecture.md`, `IMPLEMENTATION-STATUS.md` | proposed |
| [data-model.mmd](data-model.mmd) | Core tables and the immutable ones | Developer, reviewer | `apps/web-console/lib/db/database.ts` | current (core tables only, not every column) |
| [failure-reconciliation.mmd](failure-reconciliation.mmd) | Failure, expiry, unknown outcome, mismatch | Security reviewer | `lib/stellar/run.ts`, `compare.ts`, `retry-policy.ts` | mixed |

Twelve diagrams are covered; deployment is split into current and planned files, giving thirteen `.mmd` files.
