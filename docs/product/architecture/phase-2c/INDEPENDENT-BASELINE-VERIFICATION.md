# Independent baseline verification (B0, B1, historical B0)

Date: 2026-11-06. Verifier: a fourth, separately written reconstruction (`independent-verification/verify-b1-coreutils.sh`) by the same author who wrote the signer, gate, external verifier, PowerShell check and test oracle. Tool identity: bash 5 + GNU coreutils (`sha256sum`, `sort`, `iconv`, `od`, `cmp`) on Windows 11 (Git for Windows); no Node, no .NET, no code shared with the other implementations.

## Result, stated plainly

| Question | Answer |
|---|---|
| Does an implementation that shares no code and no runtime with the others reproduce B0, B1 and the historical B0? | **Yes. PASS.** |
| Was independent **review** performed (a person or organisation other than the author)? | **No. NOT VERIFIED.** No such reviewer exists in this repository's record. |
| Is the separately-written implementation "independent verification"? | **PASS WITH LIMITATIONS.** It removes shared-code and shared-runtime error. It does not remove shared-misunderstanding error: the same author wrote the procedure, the implementations and the expectations. The owner approval (2026-11-06) stands on its own and is not an independent verification. |

Anything described elsewhere in the repository as "independent" keeps the meaning given there ("independent code, same author"). No document may state that independent third-party verification happened.

## Method

1. Read only the written manifest procedure v1 (`tst-signer-b1/B1-MANIFEST-ENTRIES.md`): header `TOBIN-TST-SIGNER-BASELINE v1`; one line `<sha256>␣␣<label>` per input; ordinal order of labels; LF only; final LF; baseline = SHA-256 of the manifest bytes; runtime text files must contain no CR, no BOM and be valid UTF-8; SDK files are hashed as raw bytes; absent config is the literal `ABSENT`.
2. Wrote the shell verifier from that text, without copying code from `baseline.cjs`, `verify-signer-baseline.cjs` or the PowerShell check. The author had read those implementations earlier (in this and previous sessions), so this is independence of code and toolchain, not independence of knowledge.
3. Ran it on: the live signer directory; the git blobs of the original PR commit `ed1dde3`; the preserved Revision 6.3 runtime sources (B0 and historical B0).
4. Ran a 12-mutant mutation matrix plus a control over three implementations at once: (S) the shell verifier, (N) the Node external verifier, (G) the in-signer gate through the launcher (`independent-verification/mutation-matrix.sh`; every mutant is a temporary copy; the real directory is never touched).

## Exact hashes and results

| Baseline | Hash | Input | Shell verifier | Output |
|---|---|---|---|---|
| Historical Milestone 1 B0 (no `pinned.cjs`, 7 runtime files) | `ccea8b5b94bf3358f295ec8dd85435f34505714ef927764e5f58c557c567aa92` | Revision 6.3 preserved runtime sources | MATCH | `three-hash-run-output.txt` |
| B0 candidate (8 runtime files incl. `pinned.cjs`) | `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` | same | MATCH | same |
| B1 | `83f11a7f5ca4dce244dde39f69b19442711902137b8cba8ba3beb7f446c8733e` | live `scripts/tst-signer/signer` + SDK package | MATCH (also Node external verifier: MATCH; in-signer `baseline` command prints the same hash) | same |
| B1 | same | git blobs of `ed1dde3` | MATCH | same |

Also: SHA-256 of `baseline-manifest-B0.txt` = `ccea8b5b…`; of `baseline-manifest-B0-revision-6-3.txt` = `9b594c54…`; of `baseline-manifest-B1.txt` = `83f11a7f…`. No manifest or hash was modified.

## Inventory, ordering, normalisation

* **B1 inventory** (13 entries): 10 runtime files, `config:deployment-config.json` = `ABSENT`, SDK `package.json`, SDK `dist/stellar-sdk.js`. The shell verifier rebuilds the same list from the procedure, and the manifest it produces sorts identically (`config:` < `external:` < `file:`).
* **B0 relation to B1**: 7 of 10 runtime files are byte-identical (authorization, dpapi-key, pinned, refusal, sdk-loader, state-store, tst-signer-core). B1 adds `baseline.cjs` and `tst-signer-main.cjs` and replaces `tst-signer.cjs` with the launcher. SDK entries and `ABSENT` config are identical. The historical B0 differs from B0 only by omitting `pinned.cjs`. This matches `B1-MANIFEST-ENTRIES.md`.
* **Path normalisation and traversal**: labels are fixed names, never derived from directory listings; any extra entry, hidden entry, symlink, directory in place of a file or a `require` of an outside path changes the hash or is refused.
* **Line endings**: baselines are over LF content. Git's `.gitattributes` (`eol=lf`) makes a Windows checkout and a Linux checkout identical; a CRLF checkout is refused by all three implementations (see matrix).

## Mutation results (`mutation-matrix-output.txt`)

S = shell verifier exit, N = Node external verifier exit, G = in-signer gate exit through the launcher (4 = integrity refusal, 2 = bad input). The control must pass in all three.

| Case | S | N | G | Fail-closed |
|---|---|---|---|---|
| control (unmodified) | 0 | 0 | 0 (`baseline` prints the approved hash) | pass |
| modified file | 1 | 1 | 4 | yes |
| missing file | 1 | 2 | 4 | yes |
| additional file | 2 | 2 | 4 | yes |
| hidden additional file | 2 | 2 | 4 | yes |
| CRLF line ends | 1 | 2 | 4 | yes |
| BOM | 1 | 2 | 4 | yes |
| invalid UTF-8 | 1 | 2 | 4 | yes |
| `deployment-config.json` present | 1 | 1 | 4 | yes |
| `pinned.cjs` value changed | 1 | 1 | 4 | yes |
| directory in place of a file | 1 | 2 | 4 | yes |
| symlink in place of a file | 1 | 1 | 4 | yes |
| path-traversal `require` replacing a file | 1 | 2 | 4 | yes |
| wrong pin (all zero) | 1 | 1 | 4 | yes |
| malformed pins (uppercase, truncated, empty) | 2 | 2 | 2 | yes |
| malformed manifest (garbage; header only) | n/a | 2; 1 | n/a | yes |

All 12 file mutants (plus the pin cases) were refused by all three implementations; the control passed. Exit codes differ between tools for the same refusal (1 versus 2): all are non-zero and none passes; the difference is a documented convention, not a disagreement.

## Known limitations (what remains unverified)

* **Independent review by another person: NOT VERIFIED.** Smallest action: a reviewer outside the author reads `B1-MANIFEST-ENTRIES.md`, runs `verify-b1-coreutils.sh` (or writes their own) and confirms the three hashes.
* **Unreadable-file case: NOT VERIFIED on this machine.** `chmod 000` is not enforced on NTFS from this shell, so the case could not be exercised. The Node tools treat read errors as refusals in code and in their own unit tests, which this pass did not re-derive.
* **Launcher and gate cannot attest to themselves.** They are covered only by running an external verifier from a trusted copy; the CI job and this record do that, but a compromised checkout would also contain a compromised workflow.
* **One platform.** Windows 11, Node 24.14.0, Git Bash. Linux behaviour is exercised only by the new CI job.
* An incident during the work, disclosed: one run of the matrix script used a mutant (`chmod 000` that did not take effect) that left the gate passing, so the real application's `preview deploy` ran once in the sandbox (no configuration present, `LOCALAPPDATA` redirected to a throwaway directory, no key directory, no network). It exited 1 (refused). The case was removed from the script. No signer `init` or `execute` ran.

## Files

`independent-verification/verify-b1-coreutils.sh`, `mutation-matrix.sh`, `mutation-matrix-output.txt`, `three-hash-run-output.txt`.
