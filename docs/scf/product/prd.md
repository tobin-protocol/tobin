# Tobin: Product Requirements Document

**Status:** tracked PRD for the SCF Build Award (Open Track) submission package, dated 2026-11-09. Our own recommended documentation: the SCF handbook does not name a PRD.
**Evidence basis:** `AGENTS.md`, `README.md`, [maturity terminology](../../COMMUNICATION-AND-MATURITY-TERMINOLOGY.md), [`release/RELEASE-GATES.json`](../../../release/RELEASE-GATES.json), the MVP-1.2 to MVP-1.5 milestone records under `docs/product/architecture/`, `contracts/clearing/src/lib.rs`, [`contracts/deployments/testnet.json`](../../../contracts/deployments/testnet.json), the backend ADR and status files under `docs/backend-implementation/`.

Status words follow the repository's maturity vocabulary: **implemented** (code and tests exist), **Testnet-verified** (demonstrated on Stellar Testnet and read back), **planned**. Tobin is pre-production, Stellar Testnet only. All evidence is same-author, and no independent security review has been performed. Production deployment and real-value use have not been approved.

## 1. Problem and context

Institutions with recurring obligations to several counterparties usually settle each obligation separately. Obligations are tracked in separate places and reconciled by hand. Gross settlement moves more value than the net exposure requires. The person who records an obligation can often also release the payment. A submitted payment is not a confirmed one, and a confirmed one still has to be matched to what was approved. (Source: `README.md`, "The problem".)

Worked example, arithmetic only: A owes B 100, B owes C 80, C owes A 70. Settled one by one, 250 moves; after netting, A pays 30 in total. Net positions always sum to zero.

Whether real Stellar payment flows are interconnected enough for this to matter **has not been measured**. See [market analysis](market-analysis.md) and section 8.

## 2. Product definition

Tobin is open-source (Apache-2.0) clearing and settlement software for institutions that already move money on Stellar. Institutions record obligations they owe each other; Tobin computes net positions deterministically; a reviewer approves the exact result; settlement instructions are prepared for the net amounts only; a Soroban contract validates and executes the settlement.

### Target users (only what the repository supports)

`AGENTS.md` section 1 and `README.md` name the intended users: institutions with recurring obligations to several counterparties on Stellar, namely anchors, payment institutions, cross-border payment providers and institutional Stellar applications. **No institution uses Tobin.** No customer, partner, volume or letter of intent is recorded in the repository. Named target segments: `[OWNER INPUT NEEDED: named target institution segments and any evidence of interest, such as letters of intent or interviews]`.

User roles in the product (`AGENTS.md` section 5): administrator and member (organization roles), reviewer (an explicit grant, not implied by administrator), debtor and creditor (obligation parties), and owner-run Stellar signers.

### Scope

In scope: organization workspaces, clearing sessions, obligations, deterministic netting, reviewer authorization, settlement preparation, a Soroban clearing contract and capped test token, Stellar Testnet execution and read-back, wallet-first sign-in.

### Non-goals

| Tobin is not | Basis |
|---|---|
| an anchor, custodian, payment processor, DEX, lender or bank | `AGENTS.md` section 1 |
| a universal clearing network or a fully decentralized protocol | `AGENTS.md` section 1; the application is a single-instance web app |
| a protocol token or a replacement for SEP-24, SEP-31 or SEP-38 | `README.md` |
| a decider of any institution's KYC or regulatory obligations | `README.md` |
| collateral, deadlines, abort, default or recovery handling, Merkle commitments | broader protocol ideas, not on the roadmap (`docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md` section 4) |
| Mainnet or real-value use | not authorized (`AGENTS.md` section 12) |

## 3. Trust model in plain terms

- Tobin application records (organizations, sessions, calculations, approvals, batches) live in a database. They are **not** on-chain records. A reviewer's approval is a database record, not a signature and not a debit authorization.
- Moving funds requires Stellar signatures from the accounts that owe them. Each debtor authorizes its own transfer in the settlement call; the design has no Tobin operator key that can move funds. Signing keys are never held by the backend (ADR-0001 BD-19).
- The contract validates whatever plan it is given by its own rules (admitted parties, positive amounts, each party's paid and received amounts equal its net, no value omitted or introduced, strict instruction order, checked arithmetic). It accepts any valid plan; it does not require the netting engine's output or a minimal plan (`contracts/clearing/src/lib.rs`, `validate_plan`; `README.md`).
- Outcomes are trusted only after being read back from the network by transaction hash and reconciled against the approved batch.
- Distinct, never merged: wallet connection, verified wallet ownership, authenticated Tobin user, institutional membership, role, reviewer authority, settlement initiation authority, Stellar signing authority (`AGENTS.md` section 6).
- Users must trust the single operator of the application and the database today. Hosted, the application is operated by the owner; it does not execute settlement.

## 4. Functional requirements

IDs are stable so other documents can cite them. "Status" uses the vocabulary above. Evidence paths are relative to the repository root and were checked to exist; "same-author" applies to all test evidence.

| ID | Capability | Requirement | Status | Evidence |
|---|---|---|---|---|
| PRD-ORG-001 | Organizations and membership | Create an organization; memberships with role admin or member, status active or suspended | implemented | `apps/web-console/lib/registry/service.ts`; MVP-1.2 records |
| PRD-ORG-002 | Organizations and membership | Invitations bound to an email, a wallet or open | implemented | `README.md` capability table |
| PRD-ORG-003 | Organizations and membership | Reviewer is an explicit grant; an administrator is not automatically a reviewer | implemented | `AGENTS.md` section 5; `docs/product/architecture/mvp-1.3/MVP-1.3-CLOSURE.md` |
| PRD-ORG-004 | Organizations and membership | Invitation-controlled registration, email verification, account recovery | planned (registration is open on the current hosted deployment) | ADR-0001 BD-10, BD-11; `docs/backend-implementation/RAILWAY-TESTNET-PILOT.md` |
| PRD-AUTH-001 | Authentication | Wallet-first sign-in with server-issued, single-use, expiring challenges; opaque HttpOnly session cookie, hash at rest | implemented; not Testnet-verified with a real Freighter sign-in (tested with a protocol-compatible stand-in) | `apps/web-console/lib/auth/wallet-challenge.ts`; `README.md` |
| PRD-SES-001 | Sessions | Create a clearing session with participants; provenance labels `fixture`, `local-draft`, `chain-read`, `chain-confirmed` | implemented (application records) | `AGENTS.md` section 6; `apps/web-console/lib/registry/clearing.ts` |
| PRD-OBL-001 | Obligations | Record debtor, creditor and positive integer amount in one canonical asset; no floating point for money | implemented | `AGENTS.md` section 7; MVP-1.2 closure |
| PRD-NET-001 | Netting | Deterministic net positions (`outgoing - incoming`, positive means pays), immutable calculation snapshot with input hash; stale when participants or obligations change | implemented | `packages/mvp1-sdk/src/engine/`; MVP-1.2 records |
| PRD-NET-002 | Netting | Engine output is a default plan, not an authority; netting benefit is not claimed | implemented as stated | `README.md`, "Netting engine and contract validation" |
| PRD-AUZ-001 | Institutional authorization | A reviewer approves or rejects the exact calculation; decisions are immutable; separation of duties (no decision on a result the reviewer recorded, changed or calculated) | implemented | `apps/web-console/lib/registry/authorization.ts`; `docs/product/architecture/mvp-1.3/MVP-1.3-CLOSURE.md` |
| PRD-AUZ-002 | Institutional authorization | Stale approvals invalidated automatically | implemented | same |
| PRD-AUZ-003 | Institutional authorization | A different reviewer approves the settlement batch than approved the calculation | planned | ADR-0001 BD-08 (P7) |
| PRD-PREP-001 | Settlement preparation | Immutable batch derived from an approved calculation, batch review bound to the instruction hash, execution preconditions (verified accounts); no funds move | implemented | `apps/web-console/lib/registry/settlement.ts`; `docs/product/architecture/mvp-1.4/MVP-1.4-CLOSURE.md` |
| PRD-CON-001 | Stellar settlement | Soroban `TobinClearingV1`: lifecycle Open, Committed, Approved, Settled; join needs joiner and creator authorization; debtor authorizes own obligation | implemented; Testnet-verified once | `contracts/clearing/src/lib.rs:287,332-333,384`; `contracts/deployments/testnet.json` |
| PRD-CON-002 | Stellar settlement | `settle` validates the approved proposal, requires each payer's authorization, writes the terminal record, then executes token transfers in the same invocation; a failed transfer reverts the invocation; checked arithmetic | implemented; Testnet-verified once (1 base unit) | `contracts/clearing/src/lib.rs:555-660` |
| PRD-CON-003 | Stellar settlement | Capped-supply test token with a single fixed minter | implemented; deployed; governed instance minter is a Testnet multisig | `contracts/token/src/lib.rs`; `contracts/deployments/testnet.json` |
| PRD-CON-004 | Stellar settlement | Provisional ceilings: 4 participants, 16 obligations, 16 instructions; resource use unmeasured | implemented as constants; measurement not done | `contracts/clearing/src/lib.rs:30-32`; gate P03 |
| PRD-STL-001 | Stellar settlement | Wallet ownership verification and signer-set-aware co-signing for multisig accounts | implemented; owner-validated once (Freighter in Edge) | `apps/web-console/lib/stellar/{signer-set,cosign}.ts`; MVP-1.5 evidence |
| PRD-STL-002 | Stellar settlement | Step-by-step submission by an owner-run tool after a typed confirmation, with a 10-ledger authorization lifetime policy, no automatic retry | implemented as a local owner-run tool; not available in the hosted app | `apps/web-console/lib/stellar/run.ts`; ADR-0001 BD-05, BD-07 |
| PRD-STL-003 | Stellar settlement | Settlement initiation from the hosted application | planned (P8; needs its own approval) | ADR-0001 section 4 |
| PRD-REC-001 | Reconciliation | Read the confirmed transaction and contract state back by hash (RPC and Horizon) and compare with the approved plan; any difference means stop | implemented as an owner-run tool; Testnet-verified once | `apps/web-console/lib/stellar/compare.ts`; `docs/product/architecture/mvp-1.5/evidence/settlement-reconciliation-2026-11-07.json` |
| PRD-REC-002 | Reconciliation | Write confirmed on-chain outcomes back to application records (`confirmed`, `reconciled`, `chain-confirmed`) | planned (MVP-1.6) | `README.md`, "What is and is not connected" |
| PRD-AUD-001 | Audit trail | Decisions, batches, attempts, signer-set snapshots, events immutable or append-only, enforced by database triggers | implemented | `apps/web-console/lib/db/database.ts` |
| PRD-AUD-002 | Audit trail | Structured, redacted logging of authentication events and refusals | implemented (local checks) | `docs/backend-implementation/IMPLEMENTATION-STATUS.md` P1 |
| PRD-DIS-001 | Discovery | Unauthenticated read-only public endpoints listing only organizations that opted in (name, type, jurisdiction); settlement and statistics fields are null because no read-back transaction is recorded | implemented; the web Discover screen is not wired | `apps/web-console/lib/public/discover.ts`; `docs/backend-implementation/RAILWAY-TESTNET-PILOT.md` |
| PRD-UI-001 | Application | `apps/web` as the canonical user-facing application; `apps/web-console` retained for its backend, API and owner-run tools | owner decision; consolidation plan is in the roadmap | [roadmap](roadmap.md) section 3 |

## 5. Non-functional requirements

| ID | Area | Requirement | Status |
|---|---|---|---|
| PRD-NFR-001 | Security | Server-side authorization on every request; never trust a client-supplied role, user or organization id | implemented; tenant-isolation suite over 47 organization-scoped routes (SQLite only) |
| PRD-NFR-002 | Security | Fail-closed hosted guards: Host and Origin allow-lists, shared proxy secret, CSP, CSRF check, rate limits | implemented; verified on loopback and by outside probes of the hosted deployment (forwarded-address behaviour unverified) |
| PRD-NFR-003 | Security | Independent security review; fuzzing; wallet and multisig verification | **not done** (gates P01 BLOCKED, P04 NOT VERIFIED, P02 BLOCKED) |
| PRD-NFR-004 | Integrity | Integer arithmetic only; conservation of value; immutable history; no duplicate execution; outcomes verified by chain read-back | implemented; same-author tests |
| PRD-NFR-005 | Data isolation | Organization-scoped data; no existence oracle for foreign organizations | implemented (tested on SQLite) |
| PRD-NFR-006 | Availability | Single application instance with one SQLite file on one volume; PostgreSQL, backups and a restore test | PostgreSQL planned (MVP-1.7); no backup or restore test exists |
| PRD-NFR-007 | Observability | Liveness and readiness probes; structured logs; log retention, alerting and an on-chain monitoring plan | probes and logs implemented; monitoring plan planned (MVP-1.7); log retention unverified |
| PRD-NFR-008 | Resource and fee | Measured resources, fee breakdown and maximum-size sessions on the target network | not measured (gate P03) |

## 6. Constraints

- Stellar Testnet only. No Mainnet transaction, RPC, signer or settlement path exists. Mainnet is a gated final objective (roadmap section 5).
- No changes to settlement contracts, deployed artifacts, signing authority, network configuration or database contents are part of this documentation work.
- Evidence is same-author; one owner-run Testnet settlement of 1 base unit; confirmed outcomes are not written back to application records; the hosted app does not execute settlement.

## 7. Success measures

Product success is measured by chain read-back, not by application counts. Candidate metrics, definitions and verification are in [on-chain growth and metrics](onchain-growth-and-metrics.md). Targets: `[OWNER INPUT NEEDED: target values, set in that document]`.

## 8. Assumptions not yet validated

| Assumption | Status |
|---|---|
| Real Stellar institutional flows are interconnected enough for multilateral netting to reduce gross settlement | untested hypothesis; planned validation with historical ledger data and pilot data |
| Institutions will adopt a shared clearing workflow | untested |
| The controls described meet an institution's own risk and compliance standards | untested |
| Soroban resource limits admit the intended session sizes | unmeasured |

## 9. Risks

| Risk | Current position |
|---|---|
| Economic hypothesis fails | Treated as open; measure before any production claim |
| Same-author evidence, no independent review | Independent review is a pilot precondition; planned to be requested through the Audit Bank route, not yet requested |
| Operator trust and single-instance application | Stated limitation; hardening in MVP-1.7 |
| Registration open on hosted deployment; email unverified | Planned (PRD-ORG-004) |
| Signer concentration: the three Testnet administrative signer wallets are controlled by one person and the master key is still enabled | Recorded in `contracts/deployments/testnet.json`; Testnet only |
| Settlement or reconciliation error | One-transaction contract execution, read-back by hash, reconciliation, no automatic retry |
| Regulatory exposure | Tobin makes no KYC or regulatory decision; no approval claimed |
