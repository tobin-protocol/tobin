# Final evidence reconciliation

Date: 2026-11-06. Basis: an export of the committed `HEAD` (`817c316`), read-only. ZIP members were read in memory (nested ZIPs descended); nothing was extracted into the repository and nothing was modified. Method: `independent-verification/reconcile-inventories.ps1` (PowerShell 5.1 / .NET SHA-256), re-run from the committed artifacts, not from the earlier recomputation. Output: `independent-verification/inventory-reconciliation-output.txt`. This is archive verification by one script by the same author; it is **not independent verification**.

## Result: PASS WITH LIMITATIONS

| Check | Result |
|---|---|
| Inventory files read | 10 (`SHA256SUMS.txt` in the revision and source folders, `tst-signer-historical/SHA256-INVENTORY.txt`, `scripts/tst-signer/SOURCE-INVENTORY.sha256`, `scripts/tst-signer/SDK-PACKAGE-INVENTORY.sha256`, and the B-series hash files that use the same format) |
| Entries whose file is in the tree with the recorded hash | **267 match**, 0 differ |
| Entries whose file is **not** in the tree but is a member of a committed archive with the recorded hash | **138 match** (includes the 12 withheld files; see below). Member paths equal the original relative paths. |
| Entries recorded under a name without the `.txt` suffix, stored with it | **6**, all match once the suffix is applied: `tst-signer-core.cjs`, `dpapi-key.cjs`, `mutate.cjs`, `windows-validation.cjs`, `test/helpers.cjs`, `test/windows.test.cjs` in `tst-signer-source/` |
| Entries naming files inside the SDK tarball | 6,291 (SDK package inventory). The generic script cannot resolve them. They are checked by `restore-sdk.cjs`, which verifies every archive entry on restore (13 tests) and, run now, `node scripts/tst-signer/restore-sdk.cjs --verify-only` reports `SDK VERIFY: OK` for `package.json`, `LICENSE` and `dist/stellar-sdk.js`. A full restore of all 6,293 entries was not re-run in this pass. |
| Entries with a different hash anywhere | **0** |
| Entries not found anywhere | **0** (apart from the SDK group above, which is resolved differently) |
| Duplicate members inside any archive | **0** (15 archive instances including nested ZIPs, 596 members) |
| Historical `SHA256SUMS.txt` files | unchanged; none rewritten |

## The twelve withheld files

Re-derived from the committed archives. All twelve: recorded hash = archive-member hash. The two CRLF files keep their CRLF bytes in the archive (17 and 16 CR LF pairs); the other ten contain none. The full table with archive and member names is in `WITHHELD-FROM-INITIAL-PULL-REQUEST.md`; the loose, untracked copies on the author's disk also match, but they are not part of the repository.

| # | File (under `milestone-1-configuration-freeze/`) | Hash (first 12) | Archive |
|---|---|---|---|
| 1 | `revision-6/parity-evidence.txt` | `74e5301b215f` | `PHASE-2C-MILESTONE-1-REVISION-6-EVIDENCE.zip` |
| 2 | `revision-6/PHASE-2C-MILESTONE-1-REVISION-6-REVIEW.md` | `7c1370a3e971` | same |
| 3 | `revision-6-1/parity-evidence.txt` | `a1e74d6ae505` | `PHASE-2C-REVISION-6-1-EVIDENCE.zip` |
| 4 | `revision-6-1/PHASE-2C-REVISION-6-1-SECURITY-REVIEW.md` | `f2eba8768726` | same |
| 5 | `revision-6-2/parity-evidence.txt` | `f64d835eb842` | `PHASE-2C-REVISION-6-2-EVIDENCE.zip` |
| 6 | `revision-6-2/PHASE-2C-REVISION-6-2-SECURITY-REVIEW.md` | `1442c50900fb` | same |
| 7 | `revision-6-2/sensitive-api-policy.md` | `301ade2bcc4b` | same |
| 8 | `revision-6-2/global-alias-inventory.md` | `8aa624adcabf` | same |
| 9 | `revision-6-3/output/initial-inspection.txt` | `033ccd41d43c` | `PHASE-2C-REVISION-6-3-EVIDENCE.zip` |
| 10 | `revision-6-3/PHASE-2C-REVISION-6-3-SECURITY-REVIEW.md` | `ecdb4a047ecb` | same |
| 11 | `revision-6-3/b0/node-b0-verify-output-revision-6-2-tool.txt` | `7b99bbfca7c3` | same (CRLF) |
| 12 | `revision-6-3/b0/powershell-parity-output.txt` | `0aa1433594d7` | same (CRLF) |

The Revision 6.2 archive exists twice (top level and under `revision-6-3/revision-6-2/`); the two copies are byte-identical (`6692524d…47413`).

## Consistency notes

* The absence of these twelve loose files is **intentional** and documented in `WITHHELD-FROM-INITIAL-PULL-REQUEST.md`; `sha256sum -c` run inside a revision folder will report them missing, and that is expected. The archive is the verifiable form.
* Three PowerShell outputs (`tst-signer-b0-verification/run1-…`, `run2-…`, `tst-signer-b1/run-independent-b1-check.txt`) were committed with LF line ends instead of their original CRLF; no inventory records them.
* The Phase 2B documents referenced by two Phase 2C files are cited as text and are outside this PR (see `PR-11-SCOPE-REVIEW.md`).
* The account-name exposure inside these evidence files is covered by `PUBLIC-PATH-EXPOSURE-REVIEW.md`.

## Not verified

Independent (third-party) re-computation; a full re-extraction of the SDK tarball against all 6,293 inventory entries in this pass; the contents of the evidence beyond their hashes (this is integrity, not correctness of what the evidence says).
