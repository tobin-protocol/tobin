# Evidence files withheld from the initial Phase 2C pull request

The directories under `milestone-1-configuration-freeze/` (`revision-6`, `revision-6-1`, `revision-6-2`, `revision-6-3`) each contain a `SHA256SUMS.txt` that lists every file of that evidence package.
**Twelve of the listed files are intentionally not committed in this pull request**, so `sha256sum -c` run against those directories will report them as missing. Nothing was edited, redacted or regenerated: each file is unchanged on the author's disk, and each is preserved byte for byte inside the committed evidence archive named below.

Why they were held back: this repository runs an automated release scan (gate G09), a Markdown link check in CI, and normalises text files to LF on commit (`.gitattributes`). Committing these files as they are would either trip the G09 rule against absolute local user paths (G09 is recorded as PASS), produce link-check errors, or change their bytes (CRLF to LF) so they no longer match the hashes recorded in `SHA256SUMS.txt`; and changing the files would break those hashes too. Whether to redact, exempt or leave them out is a maintainer decision.

| File (relative to `milestone-1-configuration-freeze/`) | SHA-256 of the unchanged file | Reason | Preserved inside |
|---|---|---|---|
| `revision-6/parity-evidence.txt` | `74e5301b215fccef0f66c583919191a1536989db55571ef2d0e27c5cc8e32557` | contains local absolute file-system paths (G09 rule) | `PHASE-2C-MILESTONE-1-REVISION-6-EVIDENCE.zip` |
| `revision-6/PHASE-2C-MILESTONE-1-REVISION-6-REVIEW.md` | `7c1370a3e971d6db3e5f99b3340b471dc84799328dbce647dddaaf2586d7b5cf` | contains a local absolute file-system path (G09 rule) | `PHASE-2C-MILESTONE-1-REVISION-6-EVIDENCE.zip` |
| `revision-6-1/parity-evidence.txt` | `a1e74d6ae50584e28e6fe7e934888a4a16da3a7562a680950e614d4dbfbcaecd` | local absolute paths (G09 rule) | `PHASE-2C-REVISION-6-1-EVIDENCE.zip` |
| `revision-6-2/parity-evidence.txt` | `f64d835eb842798519f7a51a1d549bd426771384cdfd10e5145e13720e3f745b` | local absolute paths (G09 rule) | `PHASE-2C-REVISION-6-2-EVIDENCE.zip` |
| `revision-6-3/output/initial-inspection.txt` | `033ccd41d43c9377d6aff9848d40593676138c9075c69989a8ac6b89a209ad23` | local absolute paths (G09 rule) | `PHASE-2C-REVISION-6-3-EVIDENCE.zip` |
| `revision-6-1/PHASE-2C-REVISION-6-1-SECURITY-REVIEW.md` | `f2eba87687261df1842d73517135b4e56c21de32c15d62bc18915cc1fcf7f807` | code samples that the link checker reads as broken links | `PHASE-2C-REVISION-6-1-EVIDENCE.zip` |
| `revision-6-2/PHASE-2C-REVISION-6-2-SECURITY-REVIEW.md` | `1442c50900fbd8d1d33bb0e40bd30b9358b4138ba2091a569abed13000f89560` | same (link checker false positive) | `PHASE-2C-REVISION-6-2-EVIDENCE.zip` |
| `revision-6-2/sensitive-api-policy.md` | `301ade2bcc4b9a8f82e2e964064283529cbd27b1241008dddf1a42513dea27e0` | same (link checker false positive) | `PHASE-2C-REVISION-6-2-EVIDENCE.zip` |
| `revision-6-2/global-alias-inventory.md` | `8aa624adcabf1fa5fae5da066f8d32372d5c9d93845f50e288081c3898cef505` | same (link checker false positive) | `PHASE-2C-REVISION-6-2-EVIDENCE.zip` |
| `revision-6-3/PHASE-2C-REVISION-6-3-SECURITY-REVIEW.md` | `ecdb4a047ecb606931e762b2450c937583d089c96103c63292d7edcff2c3190a` | same (link checker false positive) | `PHASE-2C-REVISION-6-3-EVIDENCE.zip` |
| `revision-6-3/b0/node-b0-verify-output-revision-6-2-tool.txt` | `7b99bbfca7c3494c85fdd2c446fa4214ac6c855637d223dec07434f47abec63d` | CRLF line ends would be rewritten to LF on commit, so the committed bytes would not match `SHA256SUMS.txt` | `PHASE-2C-REVISION-6-3-EVIDENCE.zip` |
| `revision-6-3/b0/powershell-parity-output.txt` | `0aa1433594d718397a38075e0c55956e635ddf886ac67b301ff6342cdbe08b16` | same (CRLF to LF) | `PHASE-2C-REVISION-6-3-EVIDENCE.zip` |

Three further text outputs captured from PowerShell (`tst-signer-b0-verification/run1-migrated-signer-dir.txt`, `run2-revision-6-3-evidence-copies.txt` and `tst-signer-b1/run-independent-b1-check.txt`) also have CRLF line ends and are committed with LF line ends; no checksum file records them, and their content is otherwise unchanged.

The evidence archives themselves are committed unchanged; the baseline manifests (`baseline-manifest-B0.txt`, `baseline-hash-B0.sha256`, the revision manifests and the B1 files) are committed unchanged.

## A known documentation-link limitation of this pull request

`mvp-1-architecture-final.md` and `phase-2c-implementation-backlog.md` link to documents under `docs/product/architecture/phase-2b/`, which are earlier-phase documents that are not part of this pull request. The link check therefore reports those two cross-references until the Phase 2B documents are added by a separate change.

## Reconciliation of the twelve files against the archives (2026-11-06)

The absence of these twelve files from the ordinary tree is **intentional**. Each is preserved unchanged as a member of the committed archive named below, and each is listed under its original name and hash in that directory's original `SHA256SUMS.txt` (not edited).

On 2026-11-06 each archive member was read in memory (nothing extracted, no repository file overwritten) and its SHA-256 recomputed from the archived bytes; the author's untracked on-disk copy was hashed too. **All twelve: expected = archive member = on-disk copy.** The four archives are stored directly in `milestone-1-configuration-freeze/`. Archive members sit at the same relative path as the original file, under the archive's root. The two CRLF files keep their CRLF bytes in the archive (17 and 16 CR LF pairs); the other ten contain none.

To re-verify one file: read the member `<path>` of the archive and compute its SHA-256; it must equal the value in the table above (full 64-hex values are in the first table).

| # | Original file (under `milestone-1-configuration-freeze/`) | Archive | Member path | Archive-member SHA-256 equals expected | Listed in |
|---|---|---|---|---|---|
| 1 | `revision-6/parity-evidence.txt` | `PHASE-2C-MILESTONE-1-REVISION-6-EVIDENCE.zip` | same | yes (`74e5301b…`) | `revision-6/SHA256SUMS.txt` |
| 2 | `revision-6/PHASE-2C-MILESTONE-1-REVISION-6-REVIEW.md` | same archive | same | yes (`7c1370a3…`) | `revision-6/SHA256SUMS.txt` |
| 3 | `revision-6-1/parity-evidence.txt` | `PHASE-2C-REVISION-6-1-EVIDENCE.zip` | same | yes (`a1e74d6a…`) | `revision-6-1/SHA256SUMS.txt` |
| 4 | `revision-6-1/PHASE-2C-REVISION-6-1-SECURITY-REVIEW.md` | same archive | same | yes (`f2eba876…`) | `revision-6-1/SHA256SUMS.txt` |
| 5 | `revision-6-2/parity-evidence.txt` | `PHASE-2C-REVISION-6-2-EVIDENCE.zip` | same | yes (`f64d835e…`) | `revision-6-2/SHA256SUMS.txt` |
| 6 | `revision-6-2/PHASE-2C-REVISION-6-2-SECURITY-REVIEW.md` | same archive | same | yes (`1442c509…`) | `revision-6-2/SHA256SUMS.txt` |
| 7 | `revision-6-2/sensitive-api-policy.md` | same archive | same | yes (`301ade2b…`) | `revision-6-2/SHA256SUMS.txt` |
| 8 | `revision-6-2/global-alias-inventory.md` | same archive | same | yes (`8aa624ad…`) | `revision-6-2/SHA256SUMS.txt` |
| 9 | `revision-6-3/output/initial-inspection.txt` | `PHASE-2C-REVISION-6-3-EVIDENCE.zip` | same | yes (`033ccd41…`) | `revision-6-3/SHA256SUMS.txt` |
| 10 | `revision-6-3/PHASE-2C-REVISION-6-3-SECURITY-REVIEW.md` | same archive | same | yes (`ecdb4a04…`) | `revision-6-3/SHA256SUMS.txt` |
| 11 | `revision-6-3/b0/node-b0-verify-output-revision-6-2-tool.txt` | same archive | same | yes (`7b99bbfc…`), 17 CRLF | `revision-6-3/SHA256SUMS.txt` |
| 12 | `revision-6-3/b0/powershell-parity-output.txt` | same archive | same | yes (`0aa14335…`), 16 CRLF | `revision-6-3/SHA256SUMS.txt` |

Limits: this recomputation was made by the same author with one PowerShell script; it is self-verification, not independent verification. No discrepancy was found, so no inventory, archive or manifest was changed.
