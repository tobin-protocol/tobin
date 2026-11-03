# Process deviations

A factual log of departures from the repository's change process. Entries are dated, are not rewritten afterwards, and do not describe a departure as compliant. They are not approvals and do not change any release gate.

## PD-1: direct push to `main` (2026-11-03)

| Item | Record |
|---|---|
| Commit | `847ce55` "chore(governance): finalize testnet governance evidence" (17 files; Deliverable 1, Testnet contracts and governance) |
| Target branch | `main` of `https://github.com/tobin-protocol/tobin.git` |
| What happened | The commit was pushed directly to `main`. GitHub reported: "Bypassed rule violations for refs/heads/main: Changes must be made through a pull request." |
| Why it was accepted | The pushing account has permission to bypass the rule. |
| Push type | A normal fast-forward (`cb2e617` to `847ce55`), not a force-push. Local `main` and `origin/main` were in sync before and after. No history was rewritten. |
| Checks before the push | The technical audit passed before the push: governance and release suites 39 of 39, contract tests 96 of 96 (sources unchanged), multisig on-chain verification 7 of 7, release-gate scan 0 findings, `public-source-release` all PASS, documentation links valid, manifest valid against its schema, no secrets in the staged diff. These were local checks. |
| CI note | The `ci` workflow (job "Rust, TypeScript and documentation checks", the check recommended as required) runs on pull requests and manually, not on pushes to `main`, so it did not run automatically for this commit. The `integration` workflow did run on the push (see the CI record below). |
| Acknowledgement | The deviation was recognised and reported after the push, not before it. |
| Status | The push is **not** compliant with the pull-request rule. No rollback is currently planned: the commit is kept as it is, unmodified. No redundant pull request will be opened for it. |
| Open items unchanged | The shared Wasm code TTL decision (see "Outstanding operational considerations" in `docs/governance/governed-token-evidence.md`) and the other limitations in that record are unaffected. |

CI record for `847ce55` (read from GitHub Actions on 2026-11-03):

| Workflow and run | Trigger | Result |
|---|---|---|
| `integration` run 41603996906 (08:32:09Z to 08:39:50Z) | automatic, on the push to `main` | **success**: "Browser journey at 1200 px and 420 px", "Contract Wasm build, Wasm-mode tests and hash report" and "Dependency licence metadata report (report-only)" all completed successfully |
| `ci` run 41604993973 (finished 08:44:43Z) | **started manually** (workflow_dispatch) on `main` at `847ce55` after the push, because this workflow does not run on pushes | **success**: "Rust, TypeScript and documentation checks" completed successfully |

The `ci` result was obtained by a manual run after the fact; it did not gate the push. No check was cancelled or failed.

## Required workflow for future changes

Every subsequent change, including documentation and evidence updates, follows the pull-request workflow (also stated in [CONTRIBUTING.md](../CONTRIBUTING.md)):

1. Create a dedicated feature branch.
2. Make and test the intended changes.
3. Push the feature branch.
4. Open a GitHub pull request.
5. Wait for the required CI checks and for review.
6. Merge through the approved GitHub workflow.
7. Verify the merged commit and the remote state.

Bypass permissions are not used for routine changes. Branch protection settings are not changed without explicit authorization.
