# PR #11 scope review and public-path review

Date: 2026-11-06. Basis: `git diff origin/main...HEAD` of PR #11 at commit `ed1dde3` (405 files, 59,992 added lines; every file is new, none of `main` is modified). Review by the PR author; same-author, not independent.

## 1. Classification of the 405 files

| Class | Where | Files | Added lines | Decision |
|---|---|---|---|---|
| 1. Core signer implementation | `scripts/tst-signer/` (runtime `signer/*.cjs`, launcher, gate, `restore-sdk.cjs`, `README.md`, inventories, `MIGRATION-PROVENANCE.md`) | part of 29 | part of 10,024 | keep |
| 2. Verification and integrity tooling | `scripts/tst-signer-verify/` (external verifier and its test) | 2 | 304 | keep |
| 3. Tests and fixtures | `scripts/tst-signer/signer/test/`, `restore-sdk.test.cjs`, one read-only fixture | within classes 1 and 2 | | keep |
| 4. SDK restoration | `scripts/tst-signer/pk/stellar-stellar-sdk-17.4.0.tgz` and the nested `.gitignore` | within class 1 | | keep (without it the signer cannot be reproduced offline) |
| 5. Historical evidence and archives | `phase-2c/milestone-1-configuration-freeze/` (275 files, 40,941 lines), `tst-signer-revision-5/` (27), `tst-signer-source/` (19), `tst-signer-historical/` (3, the 33-file ZIP) | 324 | 44,506 | keep: these are the evidence for how B0 was defined and how the source was found |
| 6. Phase 2C security documentation | `tst-signer-b0-verification/`, `tst-signer-b1/`, `tst-signer-test-evidence/`, and the top-level security architecture, integration contract, completion report, usage guide, hardening change report, security review | 18 evidence files plus about 10 top-level documents | | keep |
| 7. Earlier Phase 2C planning documents | top level of `phase-2c/`: account provisioning, Friendbot plan and report, wallet compatibility and validation, test-account/transaction plans, setup, readiness, hosting and domain, technical decision closure, backlog, final architecture, approval package | about 20 of the 32 top-level files | about 2,200 together with the other top-level files | **retain** (see 2) |
| 8. Unrelated material | none identified | 0 | 0 | n/a |

New in this remediation (not counted above): `B0-B1-PROJECT-OWNER-APPROVAL.md`, this report, an added reconciliation section in `WITHHELD-FROM-INITIAL-PULL-REQUEST.md`, and plain-text edits of two links.

## 2. The earlier planning documents (class 7)

They concern the Friendbot funding plan, account provisioning, wallet validation, the disposable settlement token and hosting. They are not needed to run the signer. They were nevertheless kept, because:

* `phase-2c/README.md`, the index of the Phase 2C deliverables, links every one of them, and `phase-2c-final-approval-package.md`, `phase-2c-readiness-report.md`, `disposable-settlement-token-plan.md`, `phase-2c-implementation-backlog.md`, `account-provisioning-report.md` and `technical-decision-closure.md` link each other. Removing a subset would create new broken links or leave the index describing files that are absent.
* The security architecture and integration contract rely on their stated findings (for example that wallet tests T3 to T14 were not run).
* They are historical records of the same phase. Dropping them would shorten the PR but would not make it a signer-only change without also rewriting the README and the approval package, which this task forbids.

They are context, not signer code. If the maintainers want a signer-only PR, the split is: move class 7 and the `README.md` index to a separate PR. This was **not** done. The local originals are untouched.

## 3. Final scope assessment

The PR is coherent as "the Phase 2C record plus the signer foundation": a runtime, its integrity gate and external verifier, tests, offline SDK restoration, and the evidence and planning documents that explain how it was reached. It is large mainly because 275 files (about 41k lines) are the preserved Milestone 1 revision history. Remaining concerns: size makes review hard; class 7 is arguably a separate change; twelve evidence files are held back (see the withheld note); the Phase 2B documents are referenced as plain text only.

## 4. Public-path review

Searched all 405 files for: the local account name, `C:\Users`/drive paths, `AppData`, `/home/`, Stellar secret seeds (`S…` 56 characters), PEM private-key blocks and DPAPI-style content.

* **Local account name**: 8 files, 1 occurrence each, in a default path `C:/Users/<account>/Documents/codes/scf/tobin-protocol/tobin[/contracts/deployments/testnet.json]`:
  `milestone-1-configuration-freeze/config-inventory.cjs.txt`, `…/revision-6/config-inventory.cjs.txt`, `…/revision-6-1/config-inventory.cjs.txt`, `…/revision-6-2/config-inventory.cjs.txt`, `tst-signer-revision-5/auth-evidence.cjs.txt`, `…/auth-probe.cjs.txt`, `…/evidence.cjs.txt`, `tst-signer-source/evidence.cjs.txt`.
  All eight are archived tool sources whose hashes are recorded in `SHA256SUMS.txt`, `tst-signer-historical/SHA256-INVENTORY.txt` or `scripts/tst-signer/SOURCE-INVENTORY.sha256` (and several also sit inside committed ZIPs). They were **not edited**: doing so would break those recorded hashes and falsify the provenance records. This is the one **unavoidable, documented exposure**: the author's Windows account name appears eight times in the diff. It reveals a username and a project directory layout, not a credential. One tracked file on `main` already contains the same kind of path. The committed ZIP archives may contain further copies; their contents were not rewritten.
* **`%LOCALAPPDATA%`, `TobinTestKeys`, `LOCALAPPDATA`**: documented environment variable and key-directory names, generic, retained.
* **Synthetic strings** such as `C:\secret\path` inside signer tests: intentional test inputs.
* **Secrets**: no Stellar secret seed, PEM private key, API token, DPAPI blob or key file found. The public contract ids that appear are testnet identifiers already published in the repository.
* No runtime code or default was changed to remove a textual path.

If the maintainers consider the username unacceptable, the only clean remedy is a separate, owner-approved re-issue of those eight files with new hashes in all affected inventories; that was not done here.
