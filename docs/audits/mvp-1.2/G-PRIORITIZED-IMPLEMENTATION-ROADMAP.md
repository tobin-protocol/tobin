# G. Prioritized implementation roadmap

Proposed; every phase starts only with explicit owner approval. Existing working components are reused. Phases 1 and 2 may run in parallel. Sizes are relative (S/M/L), not time estimates.

## Phase 0: Decisions (S)
- **Objective:** remove blocking uncertainty. **Scope:** database; identity provider and organization authentication method; permission to run wallet validation (W2) and the wallet-support decision (W1); signature-expiry policy (W3); contract ceilings and whether a new contract version is wanted; hosting layout; retention (C8); whether any signer console ships publicly (recommended: no).
- **Deliverables:** a decision record. **Acceptance:** each decision written and dated by the owner. **Tests:** none. **Risks:** delay. **Done:** decisions recorded in the repository.

## Phase 1: Wallet and signing-room validation (M)
- **Objective:** prove the signing path with a real wallet. **Scope:** attended Freighter tests T3 to T14 on Testnet with disposable accounts; design and spike a "signing room" for multi-party authorization within the expiry window; measure ledger timing.
- **Dependencies:** Phase 0 W2/W3. **Deliverables:** results document with transaction hashes and ledgers; written conclusions on supported operations. **Acceptance:** per-test PASS/FAIL with evidence; `join_session` (two signers) and `settle` (several signers) demonstrated, or a clear limitation recorded. **Tests:** the plan's T3 to T14. **Risks:** wallet limitations for authorization entries; expiry conflict. **Done:** evidence reviewed by the owner.

## Phase 2: Backend foundation (L)
- **Objective:** persisted, authorized multi-organization data. **Scope:** database and migrations; authentication; organizations, memberships, roles, invitations; wallet linking with challenge verification; server-side authorization with organization isolation; audit/activity tables; API with validation, CSRF and rate limits.
- **Dependencies:** Phase 0. **Deliverables:** migrations, API, tests, threat model. **Acceptance:** two organizations cannot read or alter each other's data (negative tests); invitation tokens are single-use and expiring; sessions and records survive restarts. **Tests:** unit, integration against a real test database, authorization matrix, abuse cases. **Risks:** scope creep; identity choice. **Done:** CI green; security checklist reviewed.

## Phase 3: Stellar integration layer (L)
- **Objective:** network transport and wallet adapter behind the existing interfaces. **Scope:** `WalletAdapter` (Freighter), Soroban RPC client (simulate, assemble, send, poll), authorization-entry collection and relay storage (public entries only), explicit Testnet network guard, indexer and reconciler with chain-wins rule, error mapping to existing `TobinError` tables.
- **Dependencies:** Phases 1 and 2. **Deliverables:** SDK network transport; indexer; fixtures-versus-live switch with a visible label. **Acceptance:** a session created and read back on Testnet from code; reconciliation reproduces registry state from chain; never submits for users from the server. **Tests:** transport unit tests with recorded RPC responses; Testnet integration tests (opt-in, disposable accounts); mutation of RPC failures. **Risks:** RPC limits, protocol 30 differences. **Done:** a documented live read/write cycle.

## Phase 4: Product application (L)
- **Objective:** the institutional experience. **Scope:** app shell on shared design tokens (extracted from the landing without value changes); dashboard; onboarding; organization and members; session list, create, join, workspace; obligations; netting view with gross versus net; approvals; settlement; activity/history with transaction links; wallet management; settings. Loading, empty, error and confirmation states throughout.
- **Dependencies:** Phases 2 and 3. **Acceptance:** all 17 screens classified COMPLETE against real data; WCAG-oriented checks; responsive at 420 and 1200 px. **Tests:** component, API, browser E2E with the wallet mocked only in clearly labelled fixtures, accessibility checks. **Risks:** design time; contract ceilings visible to users. **Done:** reviewer can complete the journey on a staging environment.

## Phase 5: Testnet deployment and hardening (M)
- **Objective:** a public, monitored Testnet release. **Scope:** hosting project, domain, environment separation, secrets management, health endpoint, structured logs, error and uptime monitoring, backups, TTL-extension job, rollback notes, security review of the product app, dependency scan in CI.
- **Acceptance:** public URL, HTTPS, monitoring alerts tested, backup restore tested, contract TTLs above a safe threshold. **Tests:** smoke and synthetic checks; restore drill. **Risks:** Testnet resets (re-deployment plan). **Done:** release gates E01 to E05 verified where applicable.

## Phase 6: Documentation, demo and submission (M)
- **Objective:** a verifiable, honest submission. **Scope:** reviewer-facing architecture, contract and developer guides, API and SDK docs, the E2E demonstration (report H) executed and recorded, evidence pack (report I), application materials per the confirmed programme rules.
- **Acceptance:** every claim maps to a public artifact; a third party can follow the guide and reproduce the demonstration. **Risks:** claims drifting beyond evidence. **Done:** checklist I fully ticked.

## Explicit exclusions for the MVP
Real signer execution and any signer transport; obligation cancel/amend, abort and timeouts; multi-asset sessions; collateral; Merkle commitments; notifications; additional wallets; native mobile; production-readiness or audit claims.

## Priority summary
P0: Phases 0, 1, 2, 3, and the core of 4. P1: Phase 5 and the documentation set. P2: independent security review, additional hardening, extra wallets. P3: protocol v0.2 features.
