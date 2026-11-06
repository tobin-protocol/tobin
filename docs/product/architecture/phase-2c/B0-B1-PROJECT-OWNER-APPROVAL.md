# B0 and B1: project-owner approval record

**Date of approval: 2026-11-06.** Approved by: the project owner (explicit instruction given to the maintainer's working session on that date). This file records the approval event. It does not change any manifest, hash or earlier document.

## 1. What was approved

| Baseline | SHA-256 | Authoritative manifest in this repository |
|---|---|---|
| **B0** (complete runtime candidate, includes `pinned.cjs`) | `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` | `milestone-1-configuration-freeze/revision-6-3/b0/baseline-manifest-B0-revision-6-3.txt` (995 bytes) |
| **B1** (runtime with the integrity gate and launcher) | `83f11a7f5ca4dce244dde39f69b19442711902137b8cba8ba3beb7f446c8733e` | `tst-signer-b1/baseline-manifest-B1.txt`; hash in `tst-signer-b1/baseline-hash-B1.sha256` |

The historical Milestone 1 B0, which has no `pinned.cjs`, remains `ccea8b5b94bf3358f295ec8dd85435f34505714ef927764e5f58c557c567aa92` (`milestone-1-configuration-freeze/baseline-manifest-B0.txt`, `baseline-hash-B0.sha256`). It is a historical value and is not what this record approves.

The approved values are exactly the candidate values already in the repository. They were not altered, regenerated or replaced.

## 2. Checks made when recording the approval (2026-11-06)

* SHA-256 of `baseline-manifest-B0-revision-6-3.txt` = `9b594c54…bacbb7`; SHA-256 of `baseline-manifest-B1.txt` = `83f11a7f…c8733e`; the contents of `baseline-hash-B1.sha256` and `baseline-hash-B0.sha256` are as listed above.
* `node scripts/tst-signer-verify/verify-signer-baseline.cjs --signer-dir scripts/tst-signer/signer --expected 83f11a7f…c8733e` reports `VERIFY: MATCH` (read-only hashing; the signer was not run).

## 3. Four different things (do not conflate)

| Activity | Status |
|---|---|
| **Self-verification** | Done earlier by the implementing author, with several implementations (Node gate, separate Node tool, PowerShell, test oracle). Same author. |
| **Independent verification** | **Not performed.** It remains a separate activity. It must not be described as completed unless a party other than the author performs it. |
| **Project-owner approval** | **Granted on 2026-11-06 for B0 and B1, as recorded here.** |
| **Authorization to execute** | **Not granted.** |

Earlier documents (for example `tst-signer-b0-verification/B0-VERIFICATION-REPORT.md`, which says "B0 is not approved") describe the state at the time they were written and are deliberately left unchanged. This record supersedes their approval wording only.

## 4. What this approval does not do

* It does **not** authorize `init`, `execute`, signing, transaction submission, key creation or deployment.
* The inherited-environment hazard remains an **execution blocker**: `powershell.exe` and `icacls` are started by bare name with the full environment inherited. Fixing it needs a runtime change and therefore a new baseline.
* Deployment identity F and `deployment-config.json` have **not** been created; `pinned.cjs` still holds `null`.
* The launcher and gate cannot attest to themselves; they are covered only by running the external verifier from a trusted copy.
* The Revision 6.3 AST policy has not been extended to the three files added after it.
* Every other prerequisite listed in `PHASE-2C-COMPLETION-REPORT.md` section "Blockers to any execution" stays outstanding.
