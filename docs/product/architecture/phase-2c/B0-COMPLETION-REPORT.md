# B0 completion report

Date: 2026-11-06. Branch `feat/b0-finalization`, based on `main` at `c0f5cc2` (PR #11 and PR #12 merged). Evidence in this report is **self-verification by the author**; no independent reviewer has examined B0 (see section 9).

## 1. Scope and starting state

B0 is the integrity-verification foundation of the TST signer: a canonical baseline, an external verifier (Part A), an in-signer pre-import gate (Part B) and reproducible offline SDK restoration. This task started by verifying what PR #11 had already delivered instead of rebuilding it. Result of the inspection: the gate, launcher, restore script, external verifier, approved B0/B1 manifests and 251 signer tests already existed and passed. The real gaps were:

| Gap found | Resolution in this PR |
|---|---|
| The Node verifier could check only B1; the **approved B0 definition** had no in-repo Node check or tests (only the shell reconstruction handled it) | `--profile b0|b1|historical-b0` added to `scripts/tst-signer-verify/verify-signer-baseline.cjs` |
| No machine-readable result | `--json` (one object: `result, exitCode, profile, computed, expected, reason`) |
| Exit codes documented only in a source comment | `scripts/tst-signer-verify/README.md` |
| No fresh-clone test built from the **tracked files only** | `b0-acceptance.test.cjs` copies exactly `git ls-files` of the signer areas into a temporary directory, restores the SDK offline, verifies B1, re-runs idempotently, and checks that a tampered tarball is refused |
| Unreadable-file cases were untested (NTFS ignores `chmod`) | filesystem failure injected in-process for the verifier and the gate (`computeManifest`) |
| Packaging and secrets were checked by hand | automated: required inputs tracked and not ignored; no key, DPAPI blob, state file, deployment config or extracted SDK tracked; no absolute local path in tracked code |
| B0 manifest immutability had no test | the recorded B0 and B1 manifest files are asserted to hash to exactly the approved values |
| The B0 definition was not in CI | `.github/workflows/signer-tests.yml` runs the new suite and verifies B0 from the preserved sources |

No signer runtime file, manifest, approved hash, archive, `pinned.cjs`, contract, W0 or Web Console file was changed.

## 2. Approved values (immutable, unchanged)

| Definition | Hash | Reproduced |
|---|---|---|
| B0 (8 runtime files incl. `pinned.cjs`, config `ABSENT`, SDK 17.4.0 `package.json` and `dist/stellar-sdk.js`) | `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` | Node verifier `--profile b0` on the preserved sources: **MATCH**; shell reconstruction: **MATCH**; recorded manifest file hashes to it |
| B1 (10 runtime files incl. gate, `tst-signer-main.cjs`, launcher; config `ABSENT`) | `83f11a7f5ca4dce244dde39f69b19442711902137b8cba8ba3beb7f446c8733e` | Node verifier on the live directory: **MATCH**; shell reconstruction: **MATCH**; in-signer gate computes it; recorded manifest hashes to it |
| Historical Milestone 1 B0 (no `pinned.cjs`) | `ccea8b5b94bf3358f295ec8dd85435f34505714ef927764e5f58c557c567aa92` | historical evidence only, not substituted. The Node verifier **refuses** this definition (its launcher requires `pinned.cjs`, which that definition does not hash: an incomplete closure, the reason B0 added `pinned.cjs`) |

The computed B0 and B1 manifests are byte-identical to the recorded manifests (header `TOBIN-TST-SIGNER-BASELINE v1`, LF, final LF, ordinal order).

## 3. Runtime closure and canonical rules (verified)

Closure enforced by both implementations: exact directory listing (no unexpected, hidden or linked entries), every protected file a regular, non-linked, LF-only, BOM-free, valid-UTF-8 file, every `require()` a literal that is a closure file or an approved built-in, no dynamic `import()`, `eval` or `new Function`. Tested: one added byte and one flipped byte in every protected file of B0 (8) and B1 (10), a missing file, CRLF, BOM, invalid UTF-8, an extra file, a hidden file, a directory, an expected-hash file placed inside the signer directory (never read), extra relative requires, unapproved built-ins, non-literal requires, dynamic import, eval, `Function`, configuration present/CRLF. Deterministic across repeated runs and across working directories.

## 4. External verifier (Part A)

Independent code (imports only Node built-ins, never signer modules), hash from `--expected` only, `VERIFY: MATCH` only on exit 0; exit codes 0/1/2/3 documented and tested including `--json`; missing, malformed, uppercase, short, long, padded, or non-hex expected values refused. It never invokes the signer, reads keys, DPAPI, state or the network.

## 5. In-signer gate (Part B) and module-loading order

Verified from the source, not from comments: `tst-signer.cjs` requires only `baseline.cjs` (which requires `fs`, `path`, `crypto`) at load time; `tst-signer-main.cjs`, which pulls in `dpapi-key`, `state-store`, `sdk-loader`, `tst-signer-core` and `pinned`, is required once, inside the same function, after `verifyApproved` succeeded and after every refusal path (`process.exit(4)`), and receives the proof object the gate produces. A new static test pins this. The dynamic proofs (wrong hash refused with exit 4 before any application module is loaded; every post-approval modification refused; usage errors load nothing; no bypass by environment variables or start options) are in the existing 57-test gate suite. Known and documented limit: a corrupted gate or launcher cannot attest to itself; Part A covers it from outside.

## 6. SDK restoration

The extracted SDK is deliberately not tracked; the tarball (sha256 `455fcadd…a21c`), the 6,293-entry inventory and `restore-sdk.cjs` are. Verified from a copy made of **tracked files only**: the extracted package is absent, restore runs offline (no network API is imported; a dead proxy changes nothing), the three files equal the recorded hashes, version 17.4.0, a second run is a no-op, `--verify-only` passes, and a verifier run then matches B1. A one-byte-tampered tarball is refused before extraction and nothing is created. Existing 13-test restore suite additionally covers truncated, empty, missing and malformed archives, altered inventory, partial restores, junctions and the strict tar parser.

## 7. Test results (actual, this branch, local)

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| signer application suites (`tst-signer`, `hardening`, `submission`, `expiry`, `authorization`) | 122 | 122 | 0 | 0 |
| gate and launcher (`baseline.test.cjs`) | 57 | 57 | 0 | 0 |
| SDK restoration (`restore-sdk.test.cjs`) | 13 | 13 | 0 | 0 |
| external verifier (`verify-signer-baseline.test.cjs`) | 38 | 38 | 0 | 0 |
| **B0 acceptance (`b0-acceptance.test.cjs`, new)** | 79 | 79 | 0 | 0 |
| `restore-sdk.cjs --verify-only` | OK | | | |
| shell reconstruction: B1 on the live directory; B0 on the preserved sources | MATCH, MATCH | | | |

Windows-only suites (`dpapi-cleanup`, `windows`; 21 tests) were **not run locally in this task** (they exercise Windows DPAPI with dummy input and were left to the CI Windows job); their result is the PR's CI result. Mutation check of the new suite: deleting one file's hash from the verifier output failed 5 tests, disabling the mismatch comparison failed 42; a third mutation (removing the "runtime file missing" refusal) failed none, because the later "missing or unreadable file" check refuses the same condition (equivalent mutant: redundant defence, not a gap).

Repository checks: see section 10 for the CI results.

## 8. Isolation confirmation

The real signer was **not** run. The new tests start processes only through one helper that allows exactly the verifier and the restore script (a test asserts the launcher and `tst-signer-main.cjs` are rejected); the other process calls are `git ls-files` and `git check-ignore`. No `preview`, `init` or `execute`; no key, seed, DPAPI blob or state read or created; no `deployment-config.json` created in the repository (only inside temporary copies); no `pinned.cjs` change; no signing, simulation, submission, deployment, minting or transfer; no RPC or other network use. The existing suites run the launcher only in temporary copies with in-memory fakes, as approved in Phase 2C. The Web Console and its four-method adapter contract were not touched; W0 tests still pass (the console suite is unaffected, no W0 file changed).

## 9. Self-verification versus independent verification

Everything above is **self-verification** (same author), plus the independent *implementations* of Phase 2C (Node verifier, in-signer gate, PowerShell, bash/coreutils) which agree on the hashes. **Independent review by another party has not been performed** and is not claimed.

## 10. CI results

GitHub Actions on PR #13 on the two content commits of this branch (the later documentation-only commit that records these results re-runs the same checks), all passing: "Rust, TypeScript and documentation checks" (3m14s), "Signer portable suites and baseline verifiers" (29s), "Signer Windows suites (isolated temp and profile)" (47s), Vercel and Vercel Preview Comments. The portable job log shows the B0 acceptance suite at 79 of 79, the approved B0 definition `9b594c54…bacbb7` and approved B1 `83f11a7f…c8733e` each reported `VERIFY: MATCH` by the Node verifier, and B1 `VERIFY: MATCH` by the coreutils reconstruction, on a clean Linux runner after `restore-sdk.cjs`. The Windows job ran the DPAPI-cleanup and Windows suites with dummy input only.

## 11. Limitations and deferred work

| Item | Status |
|---|---|
| B2: bare `powershell.exe` / `icacls` process invocation and inherited environment | **deferred to B2** (changes the approved B1; needs a new candidate and owner approval). Unchanged, still a blocker for any execution |
| Independent third-party review | not done |
| Deployment identity F, `deployment-config.json`, non-null pin | do not exist; not created |
| Authorization to execute | not granted |
| Public-path exposure decision (account name in archived evidence) | owner decision still open (`PUBLIC-PATH-EXPOSURE-REVIEW.md`) |
| Unreadable-file behaviour on the real filesystem | tested by in-process fault injection, not by permission bits (NTFS) |
| Windows suites | CI only |
| Historical Milestone 1 definition cannot pass the closure check | by design; documented |

## 12. Acceptance decision

All applicable acceptance criteria were met on the evidence above: approved B0 reproduced, B1 preserved and verified, deterministic canonical manifests, closure enforced, Part A independent, Part B before application imports, safe refusals, fresh-clone SDK restoration from tracked files, no undocumented external dependency, failure-case coverage, no real signer operation, W0 untouched. **B0 ACCEPTED (self-verified), pending the PR's CI result and the owner's review.** Independent review, B2 and execution authorization remain outside B0.
