# Public-path exposure review, including archive contents

Date: 2026-11-06. Scope: all 407 files of PR #11 at commit `817c316`, plus every committed ZIP (9 committed files; with nested ZIPs, 15 archive instances and 596 members, all read in memory, none extracted or modified) and the SDK tarball. Same-author review.

## Verdict

**PASS WITH LIMITATIONS.** No credential or secret was found anywhere, including inside the archives. One non-secret personal identifier, the author's Windows account name (and with it a local directory layout), **is present in the repository: in 8 loose files and in 42 archive members (13 distinct archive files, counting nested copies), 77 occurrences in all.** It is unavoidable without rewriting immutable evidence, and it is already published on the public remote (see "Already public"). The earlier statement that it appeared in "eight files" was correct for loose files only; it did not cover the archives. This review replaces it.

## What was searched, and the result

| Pattern | Loose files (407) | Archive members (596) | Judgement |
|---|---|---|---|
| Account name | 8 files, 1 each | 42 members, 77 occurrences | present; non-secret identifier |
| Windows user-profile paths (drive letter, then the users folder) | the 8 above | 76 occurrences | present; all carry the account name |
| `AppData\` | generic `%LOCALAPPDATA%` documentation only | 40 occurrences, in the same account-path strings | generic variable names are fine; the rest follow the account paths |
| `/home/<user>/` | 0 | 0 | none |
| Stellar secret seed (`S…`, 56 chars) | 0 | 0 | none |
| PEM private-key block | 0 | 0 | none |
| API-token shapes (GitHub, AWS, Slack) | 0 | 0 | none |
| DPAPI blobs / key files | none (only code and docs that name the file) | none | none |
| Owner e-mail address | 0 | not scanned separately | none found in loose files |

Generic strings that are not exposure: `C:\secret\path` (a synthetic test input), `%LOCALAPPDATA%\TobinTestKeys\…` (documented key-directory name), contract ids (public testnet identifiers). The SDK tarball (third-party, hash-pinned) contains neither the account name nor `C:/Users/`. Raw output: `independent-verification/zip-scan-output.txt` (matches are located but the sensitive text is not reproduced there or here); method: `independent-verification/scan-zips.ps1`.

## Where it is

**Eight loose files** (a default path, once each): `config-inventory.cjs.txt` in `milestone-1-configuration-freeze/` and in its `revision-6`, `revision-6-1`, `revision-6-2` folders; `tst-signer-revision-5/{auth-evidence,auth-probe,evidence}.cjs.txt`; `tst-signer-source/evidence.cjs.txt`. All eight have their hashes recorded in `SHA256SUMS.txt`, `tst-signer-historical/SHA256-INVENTORY.txt` or `scripts/tst-signer/SOURCE-INVENTORY.sha256`.

**Archives (members containing it):**

| Archive | Members |
|---|---|
| `PHASE-2C-MILESTONE-1-REVISION-6-EVIDENCE.zip` | `revision-6/parity-evidence.txt` (8), `revision-6/config-inventory.cjs.txt`, `revision-6/PHASE-2C-MILESTONE-1-REVISION-6-REVIEW.md` |
| `PHASE-2C-REVISION-6-1-EVIDENCE.zip` | `parity-evidence.txt` (8), `config-inventory.cjs.txt`, and via nested `tst-signer-revision-5-review.zip` the three revision-5 evidence scripts |
| `PHASE-2C-REVISION-6-2-EVIDENCE.zip` | same pattern |
| `PHASE-2C-REVISION-6-3-EVIDENCE.zip` | `revision-6-3/output/initial-inspection.txt`; nested `revision-6-2/PHASE-2C-REVISION-6-2-EVIDENCE.zip` (parity-evidence 8, config-inventory) and nested review ZIPs |
| `revision-6-1/revision-5/…review.zip`, `revision-6-2/revision-5/…review.zip`, `revision-6-3/revision-5/…review.zip` | the three revision-5 evidence scripts each |
| `revision-6-3/revision-6-2/PHASE-2C-REVISION-6-2-EVIDENCE.zip` | duplicate of the Revision 6.2 archive (byte-identical to the top-level one) |
| `tst-signer-historical/tst-signer-scratchpad-historical-33-files.zip` | `asm.cjs`, `auth-evidence.cjs`, `auth-probe.cjs`, `evidence.cjs`, `finalize-docs-rev4.cjs`, `finalize-rev5.cjs` |

The same original files appear in several archives because each revision package re-bundled its predecessors.

## Required-as-evidence or sanitisable?

* All affected files are **hash-bound historical evidence**: a recorded SHA-256 (or the archive's own SHA-256 in an inventory) is what lets a reviewer confirm that the evidence is the evidence. Editing any of them breaks that, and the recorded hashes would then be falsified or need re-issuing.
* A sanitised successor would mean new archives containing edited copies of tool sources and tool outputs, with new hashes in at least ten inventories and a supersession record. That is feasible, but it **cannot remove the exposure** (below) and would add a second set of evidence that is no longer the original. I did not create one, and I rewrote nothing.
* **Decision recorded:** retain unchanged; document (this file); recommend the owner choose among the options below.

## Already public

PR #11 is on a public repository and commit `ed1dde3` (which holds all of the above) has been pushed. Adding a later commit that removes or sanitises the files would **not** erase them: they stay readable in the commit history, in the PR's changed-files view and in any fork or clone. Only the owner can decide to remove them by deleting and recreating the branch (history rewrite, which I am not permitted to do) and, for completeness, contacting GitHub to purge cached views. The string also already exists on `main` in three files (`SECURITY.md`, `release/RELEASE-GATES.json`, `scripts/multisig/governed-token.mjs`), so the identifier is not new to the repository.

## Severity

Low. It discloses a username and a folder layout (`…/Documents/codes/scf/tobin-protocol/tobin`), not a credential, key, token or secret. It does not help anyone sign or deploy. It is personal data of the author and a modest social-engineering aid.

## Options for the owner (smallest first)

1. **Accept and merge** as is (the exposure is low severity and the identifier already exists on `main`).
2. **Before merge, re-issue the branch without the evidence archives** that carry the path (owner action: recreate the branch from a rewritten history), keeping the evidence offline or in a private location.
3. **Re-issue sanitised successors** for the 8 loose files and the archives with a supersession record, accepting that history still holds the originals unless option 2 is also done.

No runtime default or security-sensitive code was changed to remove a textual path match.
