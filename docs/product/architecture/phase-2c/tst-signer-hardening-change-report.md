# TST signer hardening: change report

Written 2026-11-03. Scope respected: work only in the external `tst-signer/` scratchpad and the documentation copies. No contract, application code, deployment manifest or repository other than `docs/` was touched; F was not generated; no real key or DPAPI file was accessed; no Friendbot request, signature, submission or any state-changing network request was made.

## Requirement-to-change map

| Requirement | Change | Tests (see `test/hardening.test.cjs`) |
|---|---|---|
| 1. Pin deployment identity | `parseDeploymentConfig` and `pinned.cjs`: reviewed immutable `deployment-config.json`, SHA-256 pin, ID consistency check, repeated-byte salt refused, execute refused while unpinned; state must match admin, salt, ID and config hash; sample in the sample-preview document | sections 1 and 6 |
| 2. Exact footprints | `expectedFootprint` replaces the permissive type check; exact sets per operation, with evidence and an explicit "not yet observed at protocol 30" note for mints | section 2 |
| 3. Time bounds | `checkTimeBounds`: expired, not yet valid, missing, malformed, inverted, too wide; re-verified immediately before signing with a minimum of 15 s left; lifetime stays 120 s | section 4 |
| 4. State persistence | new `state-store.cjs`: atomic write, exclusive create with mode 0600, best-effort owner-only ACL, read-back verification, strict schema, PENDING-before-send, reconciliation | section 5 |
| 5. Resource ceilings | per-operation limits from live protocol-30 deploy simulation and on-chain protocol-29 mint; fee ceiling retained; fee-field consistency check | sections 3 and 7 |

## Files modified or created

Scratchpad `tst-signer/` (working copy):

- Modified: `tst-signer-core.cjs` (expected footprints and resource limits, time bounds, pinned config parser, reconciliation, pending-before-send, hash recording), `tst-signer.cjs` (config and store wiring; `init` now creates state from the pinned config instead of generating a salt), `test/tst-signer.test.cjs` (moved to shared helpers; one test rewritten for the new footprint model).
- Created: `state-store.cjs`, `pinned.cjs`, `make-deployment-config.cjs`, `test/helpers.cjs`, `test/hardening.test.cjs`, `mutate.cjs`, `dryrun-live.cjs`, `evidence.cjs`, `sample-gen.cjs`.
- Unchanged: `dpapi-key.cjs`, `sdk-loader.cjs`.

Repository documentation (`docs/product/architecture/phase-2c/`):

- Rewritten: `tst-signer-security-review.md`, `tst-signer-usage-guide.md`, `tst-signer-sample-preview.md`.
- Created: `tst-signer-hardening-change-report.md` (this file).
- Replaced with the new read-only copies: all files in `tst-signer-source/` (13 `.txt` files).
- The Phase 2C README already links the signer documents.

## Behaviour changes to note

- The public-address file for F is no longer used; F's address comes from the pinned `deployment-config.json`.
- `init` is refused until the configuration is pinned.
- State file format is version 2 (the earlier format was never written to disk).
- Defects found while hardening and fixed: the SDK computes the transaction fee from the Soroban data's resource fee, not the separately reported minimum (now cross-checked); `hash()` returns a byte array, not a Buffer (now converted before recording); the first mutation runner reported false kills because it was started incorrectly (now asserts a green baseline).

## Results

- Tests: 58 of 58 pass.
- Mutants: 41 of 41 killed (baseline green); initial survivors were fixed by new tests.
- Live read-only dry run of the deploy path at protocol 30: accepted by the exact footprint and resource rules.
- Unverified: see the security review (mint footprint and resources at protocol 30, real DPAPI, CLI glue, Windows file semantics, independent review).

---

# Revision 3: submission-reconciliation review

Written 2026-11-03. Scope: independence of the configuration pin, classification of every `sendTransaction` outcome, tests for ambiguous and interrupted outcomes. No F generated; no DPAPI or real key access; no Friendbot request; nothing signed, submitted, deployed, minted, transferred or extended; no state-changing network call (only read-only reading of the SDK package and the RPC documentation page). No edit of the deployment manifest or the final transaction manifest; no F address, salt or predicted contract ID was selected or changed (none exists; `pinned.cjs` remains `null`). No commit, push or PR.

## Exact file changes

Scratchpad `tst-signer/` (working copy):

| File | Change |
|---|---|
| `tst-signer-core.cjs` (376 to 438 lines) | Added `classifySubmission` and `pollTransaction`; rewrote the post-send part of `execute` (single submission, ENQUEUED / NOT_ENQUEUED_NOW / REJECTED / AMBIGUOUS handling, confirming lookup for rejections, audit label, failure reasons, block on rejected attempts); `reconcile` now treats a thrown or malformed lookup as "refuse", records on-chain failure as FAILED with a reason and EXPIRED with a reason; exports extended. No change to operation scope, verification, footprint, resource, time or key rules |
| `state-store.cjs` (117 to 140 lines) | Added optional `reason` (`ON_CHAIN_FAILED`, `SUBMISSION_REJECTED`, `WINDOW_PASSED_NOT_FOUND`) and `submission` audit label to the schema with validation; `markResult` accepts a reason; new `annotate` and `blocking` functions |
| `test/helpers.cjs` | The mocked `sendTransaction` can return any response, a computed hash, or throw |
| `test/tst-signer.test.cjs` | One superseded test reduced to the wrong-deployed-ID case (with a check that the success is still recorded) |
| `test/hardening.test.cjs` | Two superseded tests (polling timeout, rejected or failed submission) removed; they are replaced by the new suite |
| `test/submission.test.cjs` | **New**, 25 tests |
| `mutate.cjs` | Runs the new test file; 19 new mutants; two stale mutant definitions corrected; the baseline is still asserted green |
| `tst-signer.cjs`, `dpapi-key.cjs`, `sdk-loader.cjs`, `pinned.cjs`, `make-deployment-config.cjs`, `dryrun-live.cjs`, `evidence.cjs`, `sample-gen.cjs` | unchanged |

Repository documentation (`docs/product/architecture/phase-2c/`):

- Modified: `tst-signer-security-review.md`, `tst-signer-usage-guide.md`, `tst-signer-hardening-change-report.md` (this section).
- Replaced with the final copies: 14 files in `tst-signer-source/` (`.txt` copies of the sources and tests, including the new `submission.test.cjs.txt`).
- Created: `tst-signer-source/SHA256SUMS.txt` (hashes of the 14 files; the `.txt` copies were verified to hash identically to the working files).
- `tst-signer-sample-preview.md` and the README links need no change.

## Test output

```
node --test test/tst-signer.test.cjs test/hardening.test.cjs test/submission.test.cjs
ℹ tests 81   ℹ pass 81   ℹ fail 0
```

The suites: 25 core-rule tests, 31 hardening tests, 25 submission-reconciliation tests. Each submission test asserts the final record (PENDING, FAILED, SUCCEEDED or EXPIRED), that the transaction was sent at most once, and what a later run does.

## Mutation results

```
baseline {"fail":0,"pass":81}
mutants 60, survived or not applied 0
```

All 60 killed (41 earlier plus 19 for revision 3). During the work: one mutant survived (state-failure error type; fixed by asserting `instanceof Refusal`), two mutant definitions were stale after the source changed (corrected), and three tests failed for test-mock reasons (identical mock transaction hashes in one second; fixed with call-order mocks).

## Remaining uncertainties

1. RPC documentation defines no status beyond examples; the classification is conservative (only the chain proves success or an on-chain failure). A rejected submission is recorded as failed only after a confirming lookup, and a new attempt waits out the old envelope's window.
2. A NOT_FOUND lookup after the validity window plus 120 s is treated as "never applied"; a very slow or lagging RPC could in principle make that wrong.
3. Real RPC timing and behaviour were not exercised (mocks only).
4. The independence of the pin depends on the owner performing the preservation steps outside the signer; no code can enforce this. A stronger option (config-hash fragment in the typed phrase, a signed hash list) is proposed, not implemented.
5. Still unverified from earlier revisions: real DPAPI and `icacls`, the protocol-30 mint footprint and resources, the command-line wrapper, Windows file semantics, independent review.

---

# Revision 4: final signer review and Windows validation

Written 2026-11-04. No F generated; no real DPAPI file, key or wallet accessed; no Friendbot request, signature, submission, deployment, mint, transfer or TTL extension; no state-changing network call (read-only lookups only); no change to the deployment manifest or the final transaction manifest; no commit, push or PR.

## Exact file changes

Scratchpad `tst-signer/` (working copy):

| File | Change |
|---|---|
| `tst-signer-core.cjs` | New `windowClosedByNetwork()`; `reconcile()` uses it instead of the local clock; the rejected-attempt block lifts only on that evidence (and refuses if the chain shows the rejected transaction as included or the RPC is unreachable); exports extended |
| `state-store.cjs` | `bestEffortOwnerOnly()` replaced by `restrictOwnerOnly()` / `verifyOwnerOnly()` / `inspectAcl()` / `evaluateOwnerOnly()` (SID-based grant, ACL read back and judged, failure raises); the final file is verified after the rename; cleanup removes the temporary file only if this call created it (bug fix); `blocking()` no longer uses a clock; new `resolveRejected()`; new reason `SUBMISSION_REJECTED_WINDOW_CLOSED` |
| `dpapi-key.cjs` | The production script trims the text before `ConvertTo-SecureString` (bug fix: a trailing CRLF made every decrypt fail); `decryptWithDpapi({ env })` test seam (environment only, never passed by the CLI) |
| `test/expiry.test.cjs` | **New**, 13 tests |
| `test/windows.test.cjs` | **New**, 13 tests (real ACL, dummy DPAPI, NTFS, CLI refusals) |
| `test/hardening.test.cjs`, `test/submission.test.cjs` | Four tests updated from the local-clock rule to network-time evidence; nothing removed or weakened |
| `mutate.cjs` | Runs the new suites; the baseline now includes the Windows tests; DPAPI module tracked; per-mutant suite selection (fast offline suites versus the Windows suite); new mutants |
| `windows-validation.cjs`, `acl-experiment.cjs` | **New**, evidence scripts (disposable data; the first makes read-only lookups) |
| `patch-rev4.cjs`, `patch-rev4b.cjs`, `patch-rev4c.cjs`, `patch-tests-rev4.cjs`, `patch-expiry-tests.cjs`, `patch-mutate-rev4.cjs`, `finalize-docs-rev4.cjs` | One-off edit scripts, kept in the scratchpad only; not part of the signer and not copied or checksummed |
| `tst-signer.cjs`, `sdk-loader.cjs`, `pinned.cjs`, `make-deployment-config.cjs`, `dryrun-live.cjs`, `evidence.cjs`, `test/helpers.cjs`, `test/tst-signer.test.cjs` | unchanged |

Repository documentation (`docs/product/architecture/phase-2c/`):

- Modified: `tst-signer-security-review.md`, `tst-signer-usage-guide.md`, `tst-signer-hardening-change-report.md` (this section).
- Replaced with the final copies and checksummed: the `.txt` copies in `tst-signer-source/` (now 18 files: the previous 14, with the changed ones refreshed, plus `expiry.test.cjs.txt`, `windows.test.cjs.txt`, `windows-validation.cjs.txt`, `acl-experiment.cjs.txt`), and `tst-signer-source/SHA256SUMS.txt`.

## Defects found and fixed during this review

1. **Expiry from the local clock** (the review finding): replaced by network-time evidence.
2. **DPAPI decrypt could never succeed on a file written with `Set-Content`** (found only by running the production script on Windows with a dummy blob).
3. **Temporary-file cleanup could delete a file the call had not created** (found by the real-filesystem collision test).
4. **ACL step was unchecked and name-based** (verified by experiment to work on this machine, but hardened so it can no longer fail silently).

## Results

- Source integrity before changes: 14 of 14 working files and 14 of 14 copies matched `SHA256SUMS.txt`; baseline 81 of 81 green.
- Tests: 107 of 107 pass (25 + 31 + 25 + 13 + 13).
- Mutation: 85 mutants, all killed.
- Windows validation: ACL before 8 rules (7 other principals), after 1 rule (current user, FullControl, not inherited, protected); dummy DPAPI round trip passes after the fix; NTFS atomic update, read-only refusal, torn-file refusal, restrict-failure creates nothing; CLI refusal paths pass; `execute mint-C` against a nonexistent token is refused with no key access, no state change and no submission.
- Remaining blockers: see the end of the security review (revision 4).
