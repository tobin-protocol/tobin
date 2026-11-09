# Phase 2B: technical decisions and wallet validation

Written 2026-11-03. An investigation and documentation package. **No implementation, no wallet signing, no transactions.** Success here means a reviewable architecture and a clear path to validating wallet signing, not proven wallet compatibility.

## Objectives

Decide the architecture for the MVP-1 console, establish what Tobin requires from wallets, and define the tests that would prove it.

## Findings in brief

1. Join needs two authorizations and settlement one per debtor; entry signing is a hard requirement. ([wallet-compatibility.md](wallet-compatibility.md))
2. No wallet is verified for entry signing; Freighter is the only candidate; Albedo and Ledger via the kit are unsupported.
3. The 10-ledger window is repository policy, not protocol; whether it fits human signing is unresolved.
4. Recommended: wallet-signature sign-in, backend in the Next.js app, registry with chain reconciliation, shared token package. ([technical-decisions.md](technical-decisions.md))

## Deliverables

| File | Content |
|---|---|
| [technical-decisions.md](technical-decisions.md) | A1 to A6 |
| [wallet-compatibility.md](wallet-compatibility.md) | B1 to B4 |
| [wallet-validation-test-plan.md](wallet-validation-test-plan.md) | B5, 15 tests, pending authorization |
| [mvp-1-architecture.md](mvp-1-architecture.md) | Diagrams (not rendered) |
| [backend-data-model.md](backend-data-model.md) | Entities |
| [security-model.md](security-model.md) | Threats |
| [phase-2b-implementation-plan.md](phase-2b-implementation-plan.md) | Backlog |
| [phase-2b-decision-register.md](phase-2b-decision-register.md) | Decisions |
| [phase-2b-readiness-report.md](phase-2b-readiness-report.md) | Readiness |

## Overall readiness

Architecture reviewable; signing path blocked on wallet evidence.
