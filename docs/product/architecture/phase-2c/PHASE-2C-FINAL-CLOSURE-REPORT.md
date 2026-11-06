# Phase 2C: final closure report

Date: 2026-11-06. Branch `feat/phase-2c-tst-signer-security-foundation`, PR #11 (`tobin-protocol/tobin`), base `main` at `5fa621e`. Status words: PASS, PASS WITH LIMITATIONS, BLOCKED, NOT VERIFIED, NOT APPLICABLE.

## Final status

**PHASE 2C CLOSED WITH LIMITATIONS: W0 SAFE TO START (non-executing work only).**
Signer execution is **BLOCKED**. Phase 2C is closed as an engineering and documentation phase; it did not deliver, and does not authorise, any actual TST operation.

## A. Executive summary

Phase 2C delivered a hardened, testable, documented TST signer *source* with an integrity gate that runs before any application code, an external baseline verifier, offline SDK restoration, a preserved historical record, and a defined Web Console boundary. The owner approved baselines B0 and B1 on 2026-11-06. Everything is reproducible offline. What it did not deliver: independent third-party review, a fix for the `powershell.exe`/`icacls` invocation hazard, the deployment identity and configuration, or any permission to execute. Real testnet signer operations (T3 to T14 wallet tests, minting, deployment) were not run.

## B. Delivered components

| Component | Where | Status |
|---|---|---|
| Signer runtime (10 files incl. launcher, gate, application entry) | `scripts/tst-signer/signer/` | PASS WITH LIMITATIONS (see F) |
| Integrity gate (Part B) and launcher | `baseline.cjs`, `tst-signer.cjs` | PASS (tested, mutation-checked); cannot attest to itself |
| External verifier (Part A) | `scripts/tst-signer-verify/` | PASS |
| Third, shell-based reconstruction | `phase-2c/independent-verification/` | PASS (same author) |
| Offline SDK restoration | `scripts/tst-signer/restore-sdk.cjs`, tracked tarball | PASS |
| Tests | 251 signer tests | PASS |
| CI job for the signer tests | `.github/workflows/signer-tests.yml` | added in this pass; result in section I |
| Historical evidence and archives | `phase-2c/milestone-1-configuration-freeze/`, `tst-signer-*` | PASS WITH LIMITATIONS (12 loose files withheld, preserved in archives) |
| Security and integration documents | `tst-signer-security-architecture.md`, `tst-signer-web-console-integration-contract.md`, this set | PASS |
| W0 hand-off | `docs/product/architecture/w0/W0-ENTRY-READINESS.md` | PASS |

## C. Baseline status

| Item | Hash | Status |
|---|---|---|
| B0 candidate | `9b594c54…bacbb7` | owner-approved 2026-11-06; self-verified; reproduced by an independently written shell tool |
| B1 | `83f11a7f…c8733e` | owner-approved 2026-11-06; matches the live signer directory, the `ed1dde3` blobs and the Node, PowerShell and shell implementations |
| Historical Milestone 1 B0 | `ccea8b5b…aa92` | historical; unchanged; reproduced |
| Owner approval | `B0-B1-PROJECT-OWNER-APPROVAL.md` | **granted** |
| Independent verification | `INDEPENDENT-BASELINE-VERIFICATION.md` | independent *implementation* PASS; independent *review by another party* **NOT VERIFIED** |
| Authorization to execute | – | **not granted** |

No hash or manifest was changed in this pass.

## D. Security findings

| Finding | Status |
|---|---|
| Process invocation: bare `powershell.exe`/`icacls` at three sites, full environment inherited | **BLOCKED**, unchanged on purpose (fixing it changes the approved B1). Design and target-machine checks: `PROCESS-INVOCATION-HAZARD.md` |
| Environment handling: launcher tripwire for preload variables; approved hash accepted only from the command line; `PATH` and `LOCALAPPDATA` are not hashed | PASS WITH LIMITATIONS (covered by the hazard above) |
| Integrity enforcement: gate before any application import; proof object required by the application; 12 file mutants refused by three implementations | PASS |
| Public-path exposure: account name in 8 loose files and 42 archive members; no secrets, seeds, keys or tokens | PASS WITH LIMITATIONS: `PUBLIC-PATH-EXPOSURE-REVIEW.md`; already public on the remote; owner decision needed |
| Web Console boundary | PASS: contract satisfies all 16 required guarantees (section H) |
| Launcher and gate self-attestation | accepted limitation: protected only by running a verifier from a trusted copy |
| Unreadable-file mutant | NOT VERIFIED on this machine (NTFS ignores `chmod 000` from this shell) |
| Revision 6.3 AST policy not extended to the three files added after it | open, low |

## E. Verification results (what was actually run)

| Check | Where | Result |
|---|---|---|
| Pure signer suites (5 files) | local sandbox | 122 / 122 |
| DPAPI cleanup | local sandbox | 7 / 7 |
| Windows validation | local sandbox | 14 / 14 |
| Gate and launcher | local sandbox | 57 / 57 |
| SDK restoration | local sandbox | 13 / 13 |
| External verifier | local sandbox | 38 / 38 |
| **Signer total** | | **251 / 251**, 0 failed, 0 skipped; sandbox left empty |
| External verifier and shell verifier on B1 | local | MATCH (both) |
| Three-hash reproduction (B0, historical B0, B1) | local, shell tool | 3 / 3 MATCH |
| Mutation matrix | local | 12 / 12 mutants refused; control passes; pin cases refused |
| ZIP and path scan | local, 596 members | 0 secrets; account name located (77) |
| Inventory reconciliation | local | 267 + 138 + 6 match; 0 mismatch; 0 duplicate members |
| `restore-sdk --verify-only` | local | OK |
| Documentation link check, `scan.test`, `check-gates` | local, clean export (see I) | recorded in section I |
| Rust (`cargo fmt`, tests), TypeScript, lint, console build | GitHub Actions only | passed on `817c316`; this pass changed no Rust, TypeScript or app code, so they were not re-run locally |

The earlier commits: `ed1dde3` (Phase 2C foundation), `817c316` (owner approval, link fix, reconciliation).

## F. Remaining blockers (only real ones)

| # | Blocker | Remediation | Who and where |
|---|---|---|---|
| 1 | Process-invocation hazard (three sites) | owner approves a runtime change; implement resolver, scrubbed environment and tests; compute and verify B2; owner approves B2 | engineering, then a **target Windows machine** for binary identity |
| 2 | No deployment identity F and no `deployment-config.json`; `pinned.cjs` is `null` | create under a separate, explicit owner authorization; configuration changes the baseline (B2 or B3) | owner and operator, local terminal |
| 3 | Independent review of B1 (a person other than the author) | a reviewer runs `verify-b1-coreutils.sh` or their own tool and records the result | external reviewer |
| 4 | Account-name exposure in public history | owner chooses option 1, 2 or 3 in `PUBLIC-PATH-EXPOSURE-REVIEW.md` | owner |
| 5 | Execution authorization | a separate written authorization; none exists | owner |

## G. Execution authorization (kept apart)

| Concept | Status |
|---|---|
| Engineering completion of Phase 2C | **PASS WITH LIMITATIONS** |
| Owner approval of B0 and B1 | **granted 2026-11-06** |
| Independent verification | implementation-level PASS; third-party review **NOT VERIFIED** |
| Deployment readiness | **BLOCKED** (blockers 1 and 2) |
| Authorization to execute (`init`, `execute`, signing, submission, deployment) | **NOT GRANTED** |

Passing tests, a matching hash or a green CI run authorises nothing.

## H. W0 readiness

W0 may start with design and **non-executing** work against the integration contract, using a mock signer adapter and contract tests. Real signer preview integration stays blocked until blockers 1 and 2 are cleared and the preview path is separately approved. Details and prohibitions: `docs/product/architecture/w0/W0-ENTRY-READINESS.md`.

Contract check (`tst-signer-web-console-integration-contract.md`, read against the current repository): the contract still states, in sections 2, 6, 7, 8 and 9, that the browser never talks to the signer and never receives keys, seeds, DPAPI material or signing capability; no arbitrary commands; no remote `init`, `execute`, signing, submission or key creation; no state-file access; no browser-supplied baseline pin or typed confirmation; only enumerated operations; approval intent is evidence, not authority; local operator confirmation is mandatory; audit is append-only, redacted and fail-closed; integrity refusals fail closed; the backend calls only the launcher with fixed arguments and a minimal environment. No code in `apps/web-console` or `packages/mvp1-sdk` references the signer or spawns a process, and this PR does not change them, so nothing contradicts the contract. One addition for W0, not a contract change: until blocker 1 is fixed the adapter's environment must not carry an influenceable `PATH` (see `PROCESS-INVOCATION-HAZARD.md`).

## I. GitHub release status

Filled in at the end of this pass; see the final entries below.

* PR: #11, open, not draft, base `main`, auto-merge disabled, not merged.
* Latest commit and check results: recorded in the PR description and in the final report of the pass.
* Ready for human merge approval: the engineering content is; the owner decisions in blocker 4 and the review scope (about 60 000 added lines) should be settled first.
