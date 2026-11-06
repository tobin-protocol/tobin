# B0 verification report (Phase 2C, Part 4)

**Status: SELF-VERIFIED. Independent verification: PENDING. B0 is not approved. The founder approved `9b594c54…` only as a candidate for independent review.**

## What was verified

| Definition | Inputs | Expected hash | Reconstructed | Result |
|---|---|---|---|---|
| Candidate (complete runtime) | 8 runtime files **including** `pinned.cjs`, config `ABSENT`, SDK `package.json`, SDK `dist/stellar-sdk.js` (11 lines) | `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` | `9b594c54…` | MATCH, 995 bytes |
| Historical (Milestone 1) | the same **without** `pinned.cjs` (10 lines) | `ccea8b5b94bf3358f295ec8dd85435f34505714ef927764e5f58c557c567aa92` | `ccea8b5b…` | MATCH, 913 bytes |

Both reconstructed manifests are **byte-identical** to the preserved evidence files (`revision-6/baseline-manifest-B0-revision-6.txt` and `baseline-manifest-B0.txt`).
The two manifests differ by exactly one line: `312ed3f2…f361  file:pinned.cjs`.

## Procedure (the specification the implementation was written from)

Header `TOBIN-TST-SIGNER-BASELINE v1`; one line per input `<sha256 lowercase hex><two spaces><label>`; lines in ordinal order of the label; LF only; final LF;
UTF-8 without BOM; baseline hash = SHA-256 of the manifest bytes. Text inputs (runtime files, config) must contain no CR byte, no BOM, and be valid UTF-8; SDK
files are hashed as raw bytes; a missing `deployment-config.json` is the literal `ABSENT`. Labels: `file:<name>`, `config:deployment-config.json`,
`external:@stellar/stellar-sdk@17.4.0/package.json`, `external:@stellar/stellar-sdk@17.4.0/dist/stellar-sdk.js`.

Implementation: `independent-b0-check.ps1.txt` (PowerShell 5.1 and .NET `SHA256`, written from the specification, **no code shared** with the Node scripts used for the
migration check or the Revision 6.x tools). Copy it to a `.ps1` file and run:
`powershell.exe -NoProfile -File independent-b0-check.ps1 -SignerDir <dir> -SdkDir <sdk package dir> -EvidenceDir <milestone-1-configuration-freeze dir>`.
Outputs: `run1-migrated-signer-dir.txt` (the migrated signer directory, before any Part 5/6 change) and `run2-revision-6-3-evidence-copies.txt` (the preserved Revision 6.3 copies).

## Closure completeness (checked by the script's own `require()` walk)

Starting at `tst-signer.cjs` the walk finds exactly: `authorization.cjs, dpapi-key.cjs, pinned.cjs, refusal.cjs, sdk-loader.cjs, state-store.cjs, tst-signer-core.cjs, tst-signer.cjs`.
`pinned.cjs` **is** in the runtime closure (required by `tst-signer.cjs`), so the candidate definition omits no runtime dependency; the historical definition omits one.
No non-literal `require`. Built-ins: `child_process, crypto, fs, path, readline, vm`. `make-deployment-config.cjs` is not in the closure.

## Why this is SELF-VERIFIED, not independent

The second implementation is a different language and shares no code, but the same author (this assistant) wrote the specification reading, both implementations, the Revision 6.x tools and the
migration check. Agreement shows the arithmetic is consistent; it does not show the **definition** is right, and it does not replace a reviewer who builds their own implementation from the specification
without seeing mine. Independent verification therefore remains **PENDING**; a reviewer can use the procedure above and the preserved evidence manifests.

## Not decided here

* Which definition governs (with or without `pinned.cjs`): a founder decision. This report only records that the candidate includes it and the historical one does not.
* B0 itself describes the pre-hardening signer. The hardening in Parts 5 and 6 changes the runtime closure, so a new baseline (B1) is produced separately; B0 and these manifests are preserved unchanged.
