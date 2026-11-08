# Tobin: project positioning for Stellar Community Fund reviewers

**Status: positioning draft.** This is not an application submission, and it does not claim that funding has been requested, committed or awarded. It describes Tobin for reviewers and community voters, written to the [communication and maturity terminology guide](COMMUNICATION-AND-MATURITY-TERMINOLOGY.md). Every factual statement is traceable to the repository; section 15 lists the evidence and the claims that still need more.

## 1. Project summary

Tobin is institutional clearing and settlement infrastructure built on Stellar. It lets institutions record the obligations they owe each other, calculates each participant's net position deterministically, applies authorization controls before anything is settled, prepares settlement instructions for only the net amounts, and settles through a Soroban contract on Stellar.

The core clearing and settlement workflows are implemented and have been demonstrated through controlled Stellar Testnet execution. Production deployment and real-value use have not yet been approved.

## 2. Problem statement

When institutions have recurring obligations to several counterparties, the obligations cross and largely offset, yet each is usually settled on its own. The consequences are operational as much as financial:

- obligations are tracked in separate places and reconciled by hand;
- settlement moves more value than the net exposure requires;
- approval structure is weak: the people who record or change an obligation can often release the payment;
- a stale approval, a changed amount or a wrong signer can lead to settling something nobody approved;
- a submitted payment is not a confirmed one, and a confirmed one still has to be matched against what was approved.

A worked example (arithmetic, not data): A owes B 100, B owes C 80, C owes A 70. Settled one by one, 250 moves. Cleared first, A pays 30 in total (20 to B and 10 to C), so 30 moves. Net positions always sum to zero.

Whether real Stellar payment flows are interconnected enough for multilateral clearing to reduce gross settlement in practice **has not been measured**. This is the most important unvalidated assumption (section 14).

## 3. Proposed solution

Tobin separates institutional workflow from on-chain execution and makes each step explicit and reviewable:

1. **Record.** Organizations, memberships, clearing sessions, participants and obligations (integer base units, canonical asset identity).
2. **Net.** A deterministic engine computes net positions (`outgoing − incoming`) and an immutable calculation snapshot.
3. **Authorize.** A reviewer approves or rejects that exact calculation. Separation of duties applies: nobody decides on a result they recorded, changed or calculated, and any later change invalidates the approval.
4. **Prepare.** An approved calculation becomes an immutable batch of settlement instructions, reviewed again before execution. Preparation moves no funds.
5. **Settle on Stellar.** A clearing contract on Soroban validates the plan, collects the participants' approvals and each debtor's authorization, and moves the net amounts atomically.
6. **Reconcile.** The confirmed on-chain outcome is read back from the network by transaction hash and compared with the approved batch. Any difference means stop.

## 4. Why Stellar is essential

Stellar is not a payment rail bolted on at the end. The design depends on specific properties of the network, and each has a concrete role:

| Where | What Stellar provides | How Tobin uses it |
|---|---|---|
| **Settlement** | Soroban smart contracts with atomic invocation | `TobinClearingV1` validates a plan against the frozen obligations and executes all token transfers in one invocation: all of them happen or none does. A token failure rolls the whole settlement back. |
| **Authorization** | Soroban's authorization framework and Stellar account signing, including multisig and thresholds | Each debtor authorizes `settle` for its own total and its own transfer; no operator key can move funds. A reviewer's approval is an application record and is deliberately **not** a debit authorization. Multisig accounts are verified against their on-chain signer sets before use. |
| **Execution** | Transactions submitted to the network by the accounts that must sign | Execution is one transaction at a time (session creation through `settle`), each signed by the required accounts, with fresh authorization after any failure and a short authorization lifetime policy. |
| **Verification** | A public ledger readable through Soroban RPC and Horizon | Outcomes are trusted only after being read back by hash, never inferred from an API reply or a simulation, then reconciled with the approved batch. Signer sets are read from the network, not from the application. |
| **Ecosystem fit** | Institutions already operating on Stellar (anchors, payment institutions) | Tobin sits above SEP-31, SEP-24 and SEP-38 and defines no protocol token. |

Today, submission and reconciliation are performed by separate, owner-run tools after a typed confirmation. The application records and prepares but does not submit to the network, and confirmed outcomes are not yet written back into its records.

## 5. Architecture overview

- **Institutional application** (`apps/web-console`, Next.js, SQLite): wallet-first authentication, organizations and roles, clearing sessions, calculations, reviewer authorization, settlement preparation. Records are append-only or immutable where history matters, enforced by database triggers.
- **Soroban contracts** (`contracts/`, Rust): a clearing contract and a capped-supply test token.
- **TypeScript engine and SDK** (`packages/mvp1-sdk`): netting engine, versioned digests, prepared contract calls, shared by the application and the tests.
- **Stellar Testnet tooling** (inside the web console, owner-run): wallet ownership verification, signer-set checks, co-signing with Freighter, step-by-step submission, read-back and comparison.

Four kinds of state are kept apart: application state, preparation state, Stellar transaction state, and independently read on-chain state. A prepared batch is not a signed transaction, a signed one is not a submitted one, a submitted one is not a confirmed one, and a confirmed one is not settled until it is reconciled. The netting engine produces a default plan; the contract accepts any plan that meets its own rules and does not require the engine's output.

## 6. Implemented capabilities

Implemented means the code and tests exist in the repository.

- Institutional workspaces, memberships, invitations and reviewer grants.
- Wallet-first sign-in with server-issued, single-use challenges.
- Clearing sessions, obligations and deterministic net-position calculations with immutable snapshots.
- Reviewer authorization with separation of duties and automatic invalidation of stale approvals.
- Settlement preparation with immutable batches and batch review.
- Soroban clearing contract and a capped test token, with validation rules, ceilings (provisional) and an all-zero path.
- Wallet ownership verification and signer-set-aware co-signing for multisig accounts.
- Owner-run Testnet execution of the full contract sequence and read-back with comparison.

## 7. Testnet demonstration evidence

| Item | Evidence |
|---|---|
| Full settlement | One owner-run execution on Stellar Testnet: eight transactions from `create_session` to `settle`, with the expected balance deltas, for a one-base-unit settlement of a governed test token. |
| Multisig | Founder and Security co-signing on a live-audited administrative multisig account, with signer-set-aware authorization. |
| Wallet | Freighter in Microsoft Edge produced authorization-entry signatures in the owner validation. |
| Read-back | Outcomes read from the network (RPC and Horizon) and compared with the approved plan. |
| Contracts | Wasm hashes of the deployed contracts equal the repository's recorded artifacts; ids are in `contracts/deployments/testnet.json`. |

Records: `docs/product/architecture/mvp-1.5/` (see the [closure](product/architecture/mvp-1.5/MVP-1.5-CLOSURE.md) and the [Testnet verification](product/architecture/mvp-1.5/MVP-1.5-TESTNET-VERIFICATION.md)). The scope was narrow and the evidence is same-author. It shows the mechanics work in that scope. It does not show production behaviour.

## 8. Current milestone status

The approved roadmap, unchanged:

| Milestone | Description | Status |
|---|---|---|
| MVP-1.2 | Clearing Operations Foundation | Completed |
| MVP-1.3 | Institutional Clearing Authorization | Completed |
| MVP-1.4 | Settlement Preparation Engine | Completed |
| MVP-1.5 | Stellar Settlement Integration | Completed with limitations |
| MVP-1.6 | Institutional Operations and Reconciliation | Planned |
| MVP-1.7 | Security, Governance and Infrastructure Hardening | Planned |
| MVP-1.8 | Controlled Institutional Pilot | Planned |

## 9. Remaining engineering work

These remain visible on purpose. They are the validation requirements between a working Testnet integration and a pilot.

- **Independent security review:** none has been performed; all reviews are by the implementing author.
- **Fuzz testing:** none has been done.
- **Wallet validation:** the wallet-first sign-in flow has not yet been validated with the real Freighter extension (automated tests use a protocol-compatible stand-in); no second wallet or hardware wallet has been validated.
- **Application-level reconciliation:** confirmed on-chain outcomes are not written back to the application's records.
- **Measured behaviour:** resource use, fee breakdown and maximum-size sessions were not measured; the Testnet run was a single, small execution.
- **Account recovery** for wallet-only users.
- **Operational and institutional controls**, multi-environment validation, and production infrastructure.
- **Release gates:** the versioned-release and production gates are blocked (`release/RELEASE-GATES.json`).

## 10. Next milestones

MVP-1.6 (Institutional Operations and Reconciliation), MVP-1.7 (Security, Governance and Infrastructure Hardening) and MVP-1.8 (Controlled Institutional Pilot) are planned. This draft does not define their deliverables beyond their names and the open items in section 9; the owner should confirm the scope of each before this document is used in a submission. Pilot readiness is not claimed.

## 11. Ecosystem value

Potential value to the Stellar ecosystem, stated as potential and not as demonstrated adoption:

- An open-source (Apache-2.0) reference for institutional multilateral clearing on Soroban: a clearing contract, an SDK and a reconciliation approach that others can inspect and reuse.
- A worked pattern for combining Soroban authorization, multisig signer sets and wallet signing in a settlement workflow where authority is deliberately split.
- A model of explicit state and evidence handling (prepared, signed, submitted, confirmed, reconciled) applicable to any institutional workflow built on Stellar.
- Potential reduction in settlement volume for institutions with interconnected obligations, if the assumption in section 14 holds.

## 12. Potential adoption pathway

Nothing below has happened. It is the sequence the roadmap implies, not a claim of traction.

1. Complete the engineering and validation work in section 9, including independent security review.
2. A controlled institutional pilot (MVP-1.8), under the acceptance criteria to be defined there.
3. Measure whether participating institutions' payment flows are interconnected enough for netting to reduce gross settlement, using historical ledger data and pilot data.
4. Only then consider production approval, which also needs governance, compliance and infrastructure approvals Tobin does not itself provide: it does not decide any institution's KYC or regulatory obligations.

## 13. Key risks and mitigation

| Risk | Mitigation or current position |
|---|---|
| The economic hypothesis (enough interconnected flows) is unproven | Treated as an open assumption; to be measured before any production claim. |
| Same-author evidence and no independent review | Independent security review is a remaining requirement and a condition for pilot-ready. Reviews are labelled as the author's own. |
| Key and signer risk in a multisig workflow | Authorization is split by design; signer sets are read from the network; authorization lifetime is capped by policy; failed-transaction authorizations are never reused. |
| Settlement or reconciliation error | Atomic settlement, independent read-back by hash, reconciliation against the approved batch, and no automatic retry. |
| Contract ceilings and resource use unmeasured | Ceilings are marked provisional; measurement is outstanding work. |
| Single-instance application architecture | A deliberate scope limit today; it is not described as decentralized. |
| Regulatory and compliance exposure | Tobin is not an anchor, custodian, bank or payment processor and does not make KYC or regulatory decisions; institutions keep those obligations. No approval is claimed. |

## 14. Unvalidated assumptions

Stated plainly so reviewers can weigh them: that real Stellar institutional payment flows are interconnected enough for multilateral clearing to matter; that institutions will adopt a shared clearing workflow; that the controls described meet an institution's own risk and compliance standards. The first is planned for validation with historical ledger data; none has been tested.

## 15. Claims and evidence

| Claim in this document | Evidence |
|---|---|
| Implemented capabilities (section 6) | `README.md` capability table; code under `apps/web-console`, `contracts/`, `packages/mvp1-sdk`; milestone records in `docs/product/architecture/` |
| Eight-transaction Testnet settlement with multisig co-signing | [MVP-1.5 closure](product/architecture/mvp-1.5/MVP-1.5-CLOSURE.md), [Testnet verification](product/architecture/mvp-1.5/MVP-1.5-TESTNET-VERIFICATION.md) |
| Debtor authorization, atomic settlement, validation rules | `contracts/README.md`; [ABI and authorization reference](reference/MVP-1-ABI-AND-AUTHORIZATION-REFERENCE.md) |
| Release gates blocked | `release/RELEASE-GATES.json` |
| No independent review, no fuzzing, same-author evidence | MVP-1.5 closure, README current scope |
| Roadmap names, order, statuses | `README.md`, `AGENTS.md` |

Claims that still need additional evidence before a submission: any statement about institutional demand, adoption, volumes or partners (none is made here); fee and latency characteristics (not measured); Freighter behaviour beyond the recorded Edge validation; the scope of MVP-1.6 to MVP-1.8 (to be confirmed by the owner).
