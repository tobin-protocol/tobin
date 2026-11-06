# Phase 2C: controlled wallet validation and decision closure

Written 2026-11-03. Scope: the Phase 2C brief authorized real-wallet Testnet tests T3 to T14. **Those tests were not run** (reasons in [wallet-validation-results.md](wallet-validation-results.md)); the non-signing validation and the architecture and hosting work were completed.

## Execution summary

- T1, T2, T15: done.
- T3 to T14: BLOCKED or NOT RUN; no signatures, no transactions.
- Decision closure, hosting, database, retention: documented as recommendations.

## Deliverables

| File | Content |
|---|---|
| [non-signing-validation.md](non-signing-validation.md) | T1, T2, T15 |
| [wallet-validation-results.md](wallet-validation-results.md) | T3 to T14 |
| [wallet-compatibility-matrix.md](wallet-compatibility-matrix.md) | Matrix |
| [authorization-security-findings.md](authorization-security-findings.md) | Security findings |
| [technical-decision-closure.md](technical-decision-closure.md) | Decisions, recovery, database, retention |
| [hosting-and-domain-architecture.md](hosting-and-domain-architecture.md) | Separate Vercel project on the app subdomain (D4) |
| [mvp-1-architecture-final.md](mvp-1-architecture-final.md) | Revised architecture |
| [phase-2c-implementation-backlog.md](phase-2c-implementation-backlog.md) | Backlog |
| [phase-2c-readiness-report.md](phase-2c-readiness-report.md) | Readiness |

## Setup and session documents (added after the owner decisions D1 to D4)

- [phase-2c-setup.md](phase-2c-setup.md): approved decisions and direction
- [phase-2c-session-readiness.md](phase-2c-session-readiness.md): readiness for the attended Freighter session
- [hosting-and-domain-architecture.md](hosting-and-domain-architecture.md): revised for a separate Vercel project

## Account provisioning (preparation only)

- [account-provisioning-report.md](account-provisioning-report.md)
- [test-account-plan.md](test-account-plan.md)
- [test-transaction-plan.md](test-transaction-plan.md)
- [test-accounts.public.json](test-accounts.public.json)

## Final approval package (prepared, nothing executed)

- [phase-2c-final-approval-package.md](phase-2c-final-approval-package.md)
- [phase-2c-friendbot-funding-plan.md](phase-2c-friendbot-funding-plan.md)
- [phase-2c-setup-transactions.md](phase-2c-setup-transactions.md)
- [phase-2c-legacy-token-transfer-plan.md](phase-2c-legacy-token-transfer-plan.md)

## Friendbot execution

- [friendbot-execution-report.md](friendbot-execution-report.md): five accounts funded and verified

## Legacy holder key investigation

- [legacy-holder-key-investigation.md](legacy-holder-key-investigation.md): no matching key found in project artifacts

## Disposable settlement token

- [disposable-settlement-token-plan.md](disposable-settlement-token-plan.md): plan for a separate fixture token (prepared only; nothing deployed)

## Final settlement token manifest

- [disposable-settlement-token-final-manifest.md](disposable-settlement-token-final-manifest.md): approved parameters (cap 30,000), protocol 30 findings, exact manifest; nothing executed

## Restricted TST signer (implemented, tested with fakes only; nothing executed)

- [tst-signer-security-review.md](tst-signer-security-review.md)
- [tst-signer-usage-guide.md](tst-signer-usage-guide.md)
- [tst-signer-sample-preview.md](tst-signer-sample-preview.md)
- [tst-signer-source/](tst-signer-source/): read-only copies of the source and tests (.txt)
- [tst-signer-hardening-change-report.md](tst-signer-hardening-change-report.md): hardening revision 2 (pinned identity, exact footprints, time bounds, atomic state, resource ceilings)

## Pull request records (added 2026-11-06)

- [B0-B1-PROJECT-OWNER-APPROVAL.md](B0-B1-PROJECT-OWNER-APPROVAL.md): project-owner approval of the B0 and B1 baselines (does not authorize execution).
- [PR-11-SCOPE-REVIEW.md](PR-11-SCOPE-REVIEW.md): scope and public-path review of the pull request.
- [WITHHELD-FROM-INITIAL-PULL-REQUEST.md](WITHHELD-FROM-INITIAL-PULL-REQUEST.md): twelve evidence files kept in archives, with their reconciliation.

## Final closure records (added 2026-11-06)

- [PHASE-2C-FINAL-CLOSURE-REPORT.md](PHASE-2C-FINAL-CLOSURE-REPORT.md): definitive record of the phase and its limitations.
- [INDEPENDENT-BASELINE-VERIFICATION.md](INDEPENDENT-BASELINE-VERIFICATION.md): separately written verifier, mutation results, limits.
- [PROCESS-INVOCATION-HAZARD.md](PROCESS-INVOCATION-HAZARD.md): the `powershell`/`icacls` blocker and its remediation design.
- [PUBLIC-PATH-EXPOSURE-REVIEW.md](PUBLIC-PATH-EXPOSURE-REVIEW.md): path and secret scan including archive contents.
- [FINAL-EVIDENCE-RECONCILIATION.md](FINAL-EVIDENCE-RECONCILIATION.md): all hash inventories reconciled against the tree and archives.
- [../w0/W0-ENTRY-READINESS.md](../w0/W0-ENTRY-READINESS.md): W0 hand-off.
