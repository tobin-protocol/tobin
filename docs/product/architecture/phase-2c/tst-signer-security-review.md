# TST signer: implementation and security review (revision 3: submission reconciliation)

Written 2026-11-03. The signer is implemented and tested **with fake keys, mocked RPC responses and an in-memory file system only**. F was not generated, no real key or DPAPI file was read, nothing was signed or submitted, no Friendbot request was made. The only network activity was read-only (RPC queries and unsigned simulations). This is a self-review by the author of the code, not an independent audit. What changed in this revision: [tst-signer-hardening-change-report.md](tst-signer-hardening-change-report.md).

## What exists

| Item | File (working copy in the scratchpad `tst-signer/`; read-only `.txt` copies in [tst-signer-source/](tst-signer-source/)) | Lines |
|---|---|---|
| Rules: operations, verification, footprint, resources, time bounds, simulation, submission classification, flows | `tst-signer-core.cjs` | 438 |
| Atomic persistent state | `state-store.cjs` | 140 |
| Key boundary (DPAPI, in memory) | `dpapi-key.cjs` | 43 |
| SDK loader (version and hash pin) | `sdk-loader.cjs` | 30 |
| Pin of the reviewed deployment config | `pinned.cjs` | 5 |
| Config generator for review (public address in, no key access) | `make-deployment-config.cjs` | 29 |
| CLI (`init`, `preview`, `execute`) | `tst-signer.cjs` | 69 |
| Tests (81) | `test/tst-signer.test.cjs`, `test/hardening.test.cjs`, `test/submission.test.cjs`, `test/helpers.cjs` | 213 + 319 + 242 + 110 |
| Mutation harness (60 mutants) | `mutate.cjs` | |
| Read-only evidence and dry-run scripts | `evidence.cjs`, `dryrun-live.cjs` | |

Dependencies: Node 24.14.0 built-ins only, plus `@stellar/stellar-sdk` **17.4.0** (browser bundle from a scratch download, loaded only if `package.json` says exactly that name and version and the bundle's SHA-256 equals `de18071d1f64bf6aa1806a4eb250b3be7c1811a8e8ecdfc3c103013cf1d9b92f`). Nothing was installed in the repository.

## Controls

| Control | Mechanism |
|---|---|
| Three operations only | `deploy`, `mint-C`, `mint-D`. The signer builds the transaction itself; there is no function that signs an externally supplied transaction. |
| Transaction equals manifest | Passphrase, source F, exactly one operation, no memo, unsigned, fee at most 0.05 XLM (500,000 stroops), and the host function must equal the approved one byte for byte (contract, function, arguments, Wasm hash, salt, deployer, constructor values, mint recipient and amount). Authorization entries (after assembly) must be source-account only. |
| **Pinned deployment identity** | `deployment-config.json` = `{version, network, admin F, saltHex, predictedContractId}`. Its SHA-256 is pinned in `pinned.cjs`. A changed byte is refused. Independently of the pin, the file's predicted contract ID must equal the ID derived from (F, salt, network); a repeated-byte salt is refused. While the pin is `null` the signer can **preview but never execute**. |
| **State must match the pin** | The state file carries admin, salt, predicted ID and config hash; all four must equal the pinned configuration, or every command refuses. |
| **No repeat of an approved deployment** | The contract ID is a function of (F, salt) and the contract exists after deployment, so a second deployment of the same identity is impossible on chain; the signer additionally refuses when the state records it, when the on-chain guard sees the instance, and when the state does not match the pin. Editing the state file cannot create a different deployment because the salt and ID are pinned. |
| **Exact footprints** | Per operation, the expected sets of ledger keys (as base64 XDR) must equal the simulation's read-only and read-write sets exactly: required entries present, no extra entries, correct contract, durability (persistent), key (instance or `Vec[Symbol("Balance"), recipient]`), Wasm hash, and access class. |
| **Resource ceilings** | Per operation (instructions, read bytes, write bytes) from the table below; any excess, or a missing or non-numeric figure, refuses. The 0.05 XLM fee ceiling is retained, and the simulation's two fee fields must agree. |
| **Time bounds** | Present, numeric, ordered; minimum not in the future; maximum not passed; lifetime at most 120 s plus a 10 s clock allowance; re-verified immediately before signing against a fresh clock reading with at least 15 s of validity left, else refused (no key loaded). The maximum lifetime of 120 s is unchanged. |
| **Atomic state** | Write to a unique temporary file created exclusively (mode 0600; best-effort `icacls` owner-only on Windows), flush, close, rename over the state file, read back and compare. Failure at any step leaves the previous state and removes the temporary file. A missing, torn or schema-violating state file is a refusal, never an empty state. |
| **Interrupted runs** | The operation is recorded `PENDING` with the real transaction hash **before** submission (no record, no submission). The result is recorded afterwards (`SUCCEEDED` or `FAILED`). A crash leaves `PENDING`; the next run reconciles it with the chain before anything else (`SUCCESS` or `FAILED` recorded; `NOT_FOUND` inside the validity window refuses; `NOT_FOUND` more than 120 s after the window marks `EXPIRED`). A "completed" record can only come from an observed on-chain success. |
| State guards on chain | deploy only if nothing exists at the predicted ID; mints only on a contract with the approved metadata and supply 0 (mint-C) or 20,000 (mint-D). |
| Typed confirmation | Names the operation and amount; wrong input refuses before the key is loaded. |
| Key handling | Unchanged: decrypted in memory only after confirmation, via a constant PowerShell command, no secret in arguments or messages, public key checked against F, buffer zero-filled; strings and the SDK keypair cannot be erased on demand. |

### Resource ceiling table and its basis

| Operation | Instructions | Read bytes | Write bytes | Basis |
|---|---|---|---|---|
| deploy | 1,800,000 | 10,000 | 1,000 | 2x a **live protocol-30 simulation** of this exact operation on 2026-11-03: 878,652 instructions, 0 disk-read bytes, 408 write bytes |
| mint-C, mint-D | 1,400,000 | 10,000 | 1,200 | 2x the declared resources of the **real on-chain mint** by the governed token (same Wasm), **protocol 29**, ledger 5,533,978: 663,465 instructions, 0 disk-read bytes, 544 write bytes. No protocol-30 mint exists to measure |

The read-byte figure of 10,000 is a stated floor (measured: 0), not a measurement.

### Footprint evidence

| Operation | Expected structure | Evidence |
|---|---|---|
| deploy | readOnly: code entry of the approved Wasm. readWrite: the new contract's instance entry (persistent) | **Observed** in the live protocol-30 simulation. The signer's own `preview` code path, run read-only against the live RPC with a stand-in account, accepted it |
| mint-C / mint-D | readOnly: code entry. readWrite: the contract's instance entry and the recipient's persistent `Balance` entry | **Observed** in the on-chain footprint of the governed token's real mint (protocol 29), and consistent with the token source. **Not observed at protocol 30 for a fresh instance.** If a protocol-30 mint preview differs, the signer refuses; a person must review the difference before this table changes |

## Test evidence

(Revision 2 text:) 58 tests passed at that revision; revision 3 below has 81. New in this revision: pinned config parsing and tampering (changed salt, changed ID, changed byte, recomputed pin with inconsistent ID, schema and salt rules, unpinned execution refused); state-versus-pin mismatches for salt, ID, admin and config hash; repeated deployment after state tampering (four variants); footprints for all three operations (missing, extra, other contract, other Wasm, other recipient, wrong durability, wrong access class, duplicates); resource limits for every operation and dimension including literal boundaries and omitted figures; fee ceiling and fee-field consistency; time bounds (expired, not yet valid, missing, malformed, inverted, too wide, too little validity, re-check before signing with a jumping clock); atomic writes failing at open, write, partial write, fsync and rename; leftover temporary files; torn state; read-back mismatch; file mode; pending-before-send; failure to record the pending operation (nothing sent) and the result (names the hash, says do not re-run); reconciliation in four situations; polling timeout; rejected and failed submissions.

**Mutation check, repeated for the new rules and the original ones:** 41 single-rule weakenings, each applied alone and followed by the whole suite, with a verified green baseline (58 passing). All 41 were killed. Two mutants initially survived and exposed weak tests (a missing-figure resource check and a self-referential ceiling test); both were fixed with new tests. An earlier harness defect (the runner pointing at a directory, which made every mutant look killed) was found and fixed before these results; the baseline is now asserted.

Read-only live check: `assembleTransaction` accepts a real simulation response; the live protocol-30 deploy simulation passed the exact footprint and resource rules; the offline contract-ID prediction equals the simulated one; the SDK builds the transaction fee from the Soroban data's resource fee (the signer therefore also checks that this equals the reported minimum).

## What remains unverified

1. **Never run with a real key or real DPAPI.** Tests inject a fake decryptor. The PowerShell DPAPI path and `icacls` are untested in this environment.
2. **Protocol-30 mint footprint and resources** (table above). Only deploy was measured at protocol 30.
3. **Settlement and nested authorization at protocol 30**: out of the signer's scope but still unverified for T6 and T7.
4. **CLI glue** (`tst-signer.cjs`) has no unit tests; it was only smoke-tested for argument and missing-file refusals.
5. **Windows atomic rename and `icacls`** behaviours are relied on as documented, not tested against a real disk here; the tests use an in-memory file system.
6. **RPC trust.** Footprint, return value and fee come from the RPC's simulation. The signer checks them against fixed expectations but cannot prove the RPC honest. `sendTransaction`/`getTransaction` response shapes were not exercised against the network.
7. **Operator control.** A typed phrase stops accidents, not someone who pipes it in; the pin protects the identity, not the person.
8. **Clock.** Time checks trust the local clock; a wrong local clock (beyond the 10 s allowance) is not detected independently of the RPC.
9. **Supply chain.** The SDK bundle is hash-pinned from a download made in this session; that proves it is unchanged since, not that it is authentic beyond npm's distribution.
10. **Same-user exposure.** Other processes running as the same Windows user could read the decrypted key during `execute`.
11. **Self-review.** The author of the code wrote this review; independent review is recommended before first use.

---

# Revision 3 additions: configuration pin boundary and submission reconciliation

Written 2026-11-03. Scope: only (A) the independence of the configuration pin, (B) correct classification of every submission outcome, (C) tests for ambiguous and interrupted outcomes. F is still not generated, `pinned.cjs` is still `null`, and no F address, salt or predicted contract ID exists or was chosen or changed; the deployment manifest and the final transaction manifest were not touched. Only fake keys, a mocked RPC and an in-memory file system were used, plus read-only documentation and package reading.

## A. The pin is not an independent security boundary

`pinned.cjs`, `deployment-config.json`, the signer code and the state file all sit in directories writable by the same Windows user, and that user is also the user under which `execute` runs. Therefore:

- The pin **does** catch accidental edits, an edit of the configuration alone, an edit of the state file, and a stale or swapped configuration.
- The pin **does not** stop a party that can write the signer directory from changing the configuration, the hash in `pinned.cjs` and the code that checks them together; nor can the signer prove that the file it hashes is the one a person reviewed. Only a copy of the reviewed hash held outside that directory can do that.

### Proposed independent preservation (nothing here changes any selected value)

1. **Two copies in different trust domains, recorded at review time:** the SHA-256 of `deployment-config.json` and the file-hash list of the signer ([tst-signer-source/SHA256SUMS.txt](tst-signer-source/SHA256SUMS.txt), refreshed after any change) go into (a) the Tobin repository, committed by the owner through the normal pull-request process, giving a history and a remote copy, and (b) a second place the owner controls that the scratchpad cannot reach (for example a note on another device or a printout).
2. **Verification by a person, outside the signer, before `execute`:** in the owner's own PowerShell window run `Get-FileHash -Algorithm SHA256` on `deployment-config.json`, `pinned.cjs`, `tst-signer-core.cjs`, `state-store.cjs`, `tst-signer.cjs`, `dpapi-key.cjs` and `sdk-loader.cjs`, and compare each digest with the copy fetched from the repository **remote** (not the local clone) and with the second copy.
3. **Run from a fresh extraction:** extract the reviewed tag into a new empty directory immediately before use and run the signer from there, so earlier edits in the scratchpad do not matter.
4. **Read the identity by eye:** compare F with the address shown in the wallet, and the salt and predicted contract ID with the printed record.
5. **Optional, needs a code change and is therefore only proposed:** include the first 12 hex characters of the configuration hash in the typed confirmation phrase, so the operator must read them from the independent record; and sign the hash list with a key held on another device.
6. File permissions (read-only attribute, a restrictive ACL) add friction only: a same-user process can undo them.

The reviewed values do not exist yet. The pin therefore remains `null`; the procedure above is to be followed when F, the salt and the predicted ID are created and reviewed.

## B. Submission outcomes

### Evidence

- Soroban RPC `sendTransaction` documentation (fetched 2026-11-03): the RPC "simply validates and enqueues the transaction", "does not wait for transaction completion", and clients "should call `getTransaction` to learn about transaction success/failure". The page lists the statuses PENDING, DUPLICATE, TRY_AGAIN_LATER and ERROR with examples only (DUPLICATE: "a valid, yet duplicate transaction"; TRY_AGAIN_LATER: an example "before an account's previously submitted transaction has settled"; ERROR: a base64 `TransactionResult`). It does **not** promise inclusion after PENDING and does not define resubmission rules.
- `@stellar/stellar-sdk` 17.4.0 (`lib/esm/rpc/server.js`, `parsers.js`, `jsonrpc.js`, `api.d.ts`): `sendTransaction` returns the RPC `result`, decoding `errorResultXdr` into `errorResult`; a JSON-RPC `error` member is thrown as the raw error object (not an `Error`); HTTP failures throw; a missing result or an undecodable `errorResultXdr` throws (so a throw can occur after the node did receive the transaction). `getTransaction` statuses are SUCCESS, FAILED (included in a ledger and failed) and NOT_FOUND.

### Classification implemented

| Answer | Class | Proves | Record |
|---|---|---|---|
| `PENDING` | ENQUEUED | accepted into the queue; **not** inclusion | PENDING until `getTransaction` shows SUCCESS or FAILED |
| `DUPLICATE` | ENQUEUED | the node has already seen this exact transaction; it is queued or applied; not a failure | same as PENDING |
| `TRY_AGAIN_LATER` | NOT_ENQUEUED_NOW | not accepted at this moment (for example another transaction of the account is unsettled); it does **not** prove the signed envelope can never land (any holder can submit it until it expires) | stays PENDING; never resubmitted by the signer; resolved by `getTransaction`, or EXPIRED after the validity window plus 120 s |
| `ERROR` with a decoded `errorResult` | REJECTED | the node refused it | one confirming `getTransaction`: NOT_FOUND gives FAILED (`SUBMISSION_REJECTED`) and a block on new attempts until the envelope's window has passed; SUCCESS or FAILED on chain wins; a lookup that throws or is malformed leaves PENDING |
| `ERROR` without a decoded result | AMBIGUOUS | nothing | PENDING |
| missing, null, non-object, unknown status (for example `FILTERED`), missing or malformed hash | AMBIGUOUS | nothing | PENDING |
| hash different from the locally computed one | AMBIGUOUS | nothing about our transaction | PENDING under the local hash |
| `sendTransaction` throws (timeout, reset, JSON-RPC error, undefined result) | AMBIGUOUS | the request may have reached the network | PENDING |

For every class except a confirmed rejection, the signer polls `getTransaction` for the local hash (up to 30 times, 2 s apart). A thrown, missing, malformed or unknown-status lookup answer is UNKNOWN and is never a verdict. SUCCESS records SUCCEEDED (also after a lost response). FAILED records FAILED (`ON_CHAIN_FAILED`). NOT_FOUND or UNKNOWN at the end of polling leaves PENDING with the error "outcome is not known ... not and will not be submitted again". **The signer submits each signed transaction at most once, in every class.**

### What happens next, and how sequence numbers and state guards bear on it

- While any record is PENDING, the next `execute` of **any** operation first reconciles every pending record by hash and refuses while an outcome is unknown or the RPC cannot answer; nothing is simulated, signed or sent in that case.
- **Included (SUCCESS or FAILED):** the account's sequence number and the fee are consumed. A later attempt builds a fresh transaction from the current account sequence, after the signer's on-chain state guards have re-read the contract. A FAILED mint left no state change (token calls revert), so the guard still sees supply 0 or 20,000 and a retry is meaningful.
- **Never applied (rejected, or not found after the window):** the sequence number is **not** consumed, so the new transaction reuses it. Two different signed transactions with the same sequence cannot both apply. To stop the old envelope from racing the new one, a rejected attempt blocks a new attempt until its validity window plus 120 s has passed, and a pending record becomes EXPIRED only after the same period.
- **If both could land anyway:** a second deploy is impossible (the contract ID is fixed by the pinned F and salt and the contract already exists); a repeated `mint-C` (20,000) or `mint-D` (10,000) would push the supply above the cap of 30,000 and revert with `CapExceeded`. The cap is the last line of defence; the signer's own state guards come before it.
- A failure to write the result after a success is reported with the hash and "do not re-run"; the record stays PENDING (never a false "completed") and the next run reconciles it.

## Test and mutation evidence (revision 3)

- **81 tests pass** (`node --test test/tst-signer.test.cjs test/hardening.test.cjs test/submission.test.cjs`). New: `test/submission.test.cjs` (25 tests) covering every class above, including accepted-but-response-lost, DUPLICATE, TRY_AGAIN_LATER, ERROR confirmed, unconfirmed and landed-anyway, timeout after submission with the lookup also failing, initially not found then successful, included and failed, malformed polling answers, secrets in thrown errors, refusing other operations while unknown, state-update failure after success and after failure, interruption before and after sending, schema of the new audit fields, and the single-submission invariant. Each test asserts the resulting record (PENDING, FAILED, SUCCEEDED or EXPIRED) and the number of submissions.
- **Mutation harness: 60 mutants, all killed, against a verified green baseline of 81.** The 19 new mutants include treating DUPLICATE or TRY_AGAIN_LATER as failures, treating ERROR without a result as a verdict, accepting a mismatched or malformed hash or an unknown status, recording a rejection without confirming, treating a thrown send error as a rejection, treating a lookup error as "not found", recording an on-chain failure as success, treating an unknown outcome as success, a second submission after an ambiguous answer, removing the rejected-attempt block, weakening the state-failure report, and weakening the reconcile and schema rules. One mutant (the type of the state-failure error) initially survived and prompted an `instanceof Refusal` assertion; two earlier mutant definitions no longer matched the changed source ("not applied") and were corrected.
- Three earlier tests encoded behaviour that this revision deliberately changed (`ERROR` without a result, the polling-timeout wording) and were replaced by the new suite; three new tests initially failed because the mock's hash was identical for two transactions built in the same second, which was a test defect (fixed with call-order mocks), not a signer defect.

## Remaining uncertainties (revision 3)

1. The RPC documentation does not define the statuses; the classification follows the documented flow ("enqueue, then poll") and the conservative rule that only the chain can establish success or an on-chain failure. The rule for TRY_AGAIN_LATER is deliberately conservative (it waits out the validity window instead of treating the answer as terminal).
2. `getTransaction` NOT_FOUND may also mean the RPC's retention window or a lagging node; the 120 s margin and the retention period (about a week) make a wrong EXPIRED unlikely but not impossible for a very slow node.
3. Real network behaviour was not exercised: the mocks reproduce the documented shapes, not real RPC timing.
4. Everything listed under "What remains unverified" above still stands (real DPAPI, protocol-30 mint footprint, CLI glue, Windows file semantics, independent review).
5. The independence of the pin depends on the owner actually performing the preservation steps; no code can enforce that.

---

# Revision 4: final signer review and Windows validation

Written 2026-11-04. Scope: resolve the remaining concrete findings, validate on Windows with disposable data, and report execution readiness. No redesign. F was not generated; no real DPAPI file, real key or wallet was accessed; no Friendbot request, signature, submission, deployment, mint, transfer or TTL extension; no state-changing network call. The only network use was read-only: one RPC lookup of a hash that cannot exist (to see the real shape of a `NOT_FOUND` answer) and the read-only lookups made by the refusal path of `execute mint-C`. The deployment manifest and the final transaction manifest were not touched. Existing tests were not weakened or removed; four tests that encoded the old local-clock expiry rule were updated to the new rule.

## 1. Source integrity (before any change)

All 14 working files matched [tst-signer-source/SHA256SUMS.txt](tst-signer-source/SHA256SUMS.txt), and all 14 `.txt` copies matched it too. The suite was green (81 of 81) before the first edit. The manifest in this directory was then regenerated for revision 4 (below).

## 2. Expiry reconciliation

**Finding.** `reconcile()` could mark a record EXPIRED from a single `NOT_FOUND` answer plus the local wall clock (`now > maxTime + 120`). That is not reliable: a wrong local clock, a lagging RPC (which has not yet ingested the ledger that included the transaction), or an RPC whose history does not reach back far enough could all produce a false EXPIRED. The record would then allow a fresh transaction while the old one might still have landed.

**Change (smallest defensible).** The `NOT_FOUND` answer from `getTransaction` already carries ledger-time fields (checked live: `latestLedgerCloseTime` and `oldestLedgerCloseTime`, as decimal strings). EXPIRED now requires all of:

1. the answer is `NOT_FOUND`;
2. both times are well-formed non-negative integers and consistent (latest not before oldest);
3. the latest ingested ledger **closed after the end of the validity window plus 30 s** (a transaction is only valid in ledgers that closed by its maximum time, so no ledger that could have included it is still missing from the RPC);
4. the RPC history **reaches back before the submission** (oldest close time at or before the submission time minus 60 s), so an earlier inclusion would still be visible;
5. the latest ledger time is not implausibly far in the future (the local clock is only a sanity bound, never the decision).

Otherwise the record stays PENDING and the run refuses with the reason. `SUCCESS` and `FAILED` stay authoritative, with or without usable time evidence. RPC errors and malformed answers stay PENDING. Nothing is ever resubmitted by reconciliation. The block that follows a rejected submission lifts by the same evidence (a rejected envelope may still be valid until its window closes); if the chain instead shows that transaction as included, the signer refuses and asks for manual review. Once the window is proven closed, the lift is recorded (`SUBMISSION_REJECTED_WINDOW_CLOSED`) so it is not re-checked.

**Fail-closed consequence.** A record submitted longer ago than the RPC's history (about a week) cannot be resolved automatically; the signer refuses and a person must review it. Live check against the Testnet RPC: for a window that closed 4 days ago the rule returns closed; for a submission older than the RPC history it returns "history does not clearly cover the submission window"; for a window still open it returns "not passed".

## 3. Windows ACL handling

**Inspection of the old `bestEffortOwnerOnly()`.** It called `icacls <file> /inheritance:r /grant:r <USERNAME>:(F)`, ignored the result, and swallowed any failure. A disposable-file experiment (a fresh temp file, ACL read back with PowerShell/.NET by SID) showed that on this machine the call **does** remove the other principals: before, 8 rules with 7 for other principals and inheritance on; after, one explicit Allow FullControl rule for the current user, inheritance blocked, owner the current user. So it did more than change inheritance. Its weaknesses were: it granted by user name rather than SID, it never inspected the result, and a failure was ignored, so a normal inherited ACL could have remained silently.

**Change.** `restrictOwnerOnly()` grants by SID, then reads the real ACL back and accepts it only if: inheritance is blocked, exactly one rule exists, it is an explicit Allow of FullControl for the current user's SID, and the file's owner is that SID. Any failure (icacls error, unreadable inspection, any other rule) raises an error, and `writeAtomic` turns it into a refusal before the rename; the final file is verified again after the rename. On non-Windows platforms mode 0600 is applied and checked.

**Results on real NTFS (disposable files only; 13 Windows tests):** the intended user retains read and write; none of the 7 other principals retains access; the verdict is judged from the inspected ACL; an `icacls` that "succeeds" without changing anything is refused; an `icacls` failure and a failed or unreadable inspection are refused; an extra principal added later (Everyone read, on the disposable file) is detected; the state file keeps its owner-only ACL through four atomic renames.

**What "owner-only" does and does not mean here.** No access rule other than the current user's exists. The object owner can always change the ACL, and an administrator can take ownership; processes running as the same user have the user's access. This is protection against other accounts, not against the same user or an administrator. The state file holds hashes and transaction references, not secrets.

## 4. Windows execution-boundary validation (disposable data)

| Area | Result |
|---|---|
| DPAPI round trip, production script, dummy secret | **A defect was found and fixed.** The production script used `Get-Content -Raw`, which keeps the trailing CRLF that `Set-Content` writes; `ConvertTo-SecureString` rejects it ("Input string was not in a correct format"). With the old script the real F key could never have been decrypted. The script now trims the text. After the fix the round trip passes (compared by hash, never printed). The production script ran unchanged against a dummy blob by redirecting `LOCALAPPDATA` for the child process only (test seam: `decryptWithDpapi({ env })`; the CLI never passes it). The F creation step may write the blob with `Set-Content` or any other method; the trim makes both work |
| Plaintext on disk | The blob contains no plaintext (checked as Latin-1 and UTF-16); the temp tree contains only the blob |
| Printing or logging | A separate process using the production code with a throwaway (never used) key printed only `OK G...`; stdout and stderr contained no secret; stderr was empty |
| Failure and mismatch handling | Missing or corrupted blob gives a generic message with no path or secret; a key for another address is refused without echoing; the decrypted buffer is zero-filled |
| Temporary-file behaviour | No `.tmp` residue after create/update/rename; a name collision no longer deletes the colliding file (**a second defect, found and fixed**: cleanup removed a temporary file even when this call had not created it) |
| Atomic state on NTFS | create, update, rename over an existing file, and read-back verified; a read-only target is refused with EPERM and the previous state is intact; a torn main file is refused and never replaced by an empty state; a failing permission step creates no file and no residue |
| CLI refusals (child process, temporary copy, temporary `LOCALAPPDATA`) | invalid arguments (nine variants) exit 2 with usage; missing configuration exits 1; unpinned configuration refuses `init` and `execute` before any network access and creates no state; a pinned configuration with missing state refuses; `init` creates owner-only state once and refuses a second time; a changed state salt, a torn state file and a changed byte in the configuration are each refused |

## 5. Protocol-30 mint preview

Not attempted (the token does not exist). Confirmed: `execute mint-C` against a token that does not exist is refused with "the TST contract does not exist yet; deploy first" (exit 1), the key file is not read, the state is unchanged, no pending record is written, nothing is signed or submitted. This was run through the CLI from a temporary copy with a fake pinned configuration; the only network access was the read-only network check and the read-only contract lookup. After the real deployment, the mint preview and its footprint and resources must be inspected and separately approved before either mint.

## 6. Tests and mutation results

- **107 tests, all passing** (`node --test test/tst-signer.test.cjs test/hardening.test.cjs test/submission.test.cjs test/expiry.test.cjs test/windows.test.cjs`): 25 core rules, 31 hardening, 25 submission reconciliation, 13 expiry reconciliation, 13 Windows validation.
- **Mutation harness: 85 mutants, all killed**, against a verified green baseline (106 for the full run, 107 for the targeted re-run after one test was added). The full run of 86 mutants (baseline 106 green) killed 82; one survived (the rule that rejects contradictory network-time evidence had no test of its own; a test was added) and three definitions no longer matched the changed source (one obsolete mutant removed, two re-defined). Those mutants were re-run against a green baseline of 107 and all were killed. New mutants cover: expiry from network time (each of the five conditions, the status check, and a reverted local-clock rule), the rejected-attempt block (no evidence, chain shows inclusion, RPC down, lift not recorded), ACL judgement (inheritance, owner, rule count, other principals, inherited rules, rights, exit code trusted, icacls failure ignored, verdict ignored), permission steps in the state writer (never applied, failure ignored, final file not verified), cleanup of a file not created by the call, and the two DPAPI defects (the newline trim and the buffer zeroing). 15 mutants run against the Windows suite, the rest against the offline suites.

## 7. Remaining blockers and uncertainties

1. **F does not exist**, so there is no real `deployment-config.json`, the pin is still `null`, and the real DPAPI file does not exist. The first real `execute` is therefore the first use of the real key file; the production DPAPI script has now been exercised only with dummy blobs.
2. The F creation step must produce a DPAPI blob in the expected location and name (`TobinTestKeys\settlement-token-admin.dpapi`, `ConvertFrom-SecureString` text); the creation step itself is not implemented.
3. Protocol-30 mint footprint and resources are still unobserved (waiting for the deployed contract).
4. Expiry evidence comes from the same RPC that says `NOT_FOUND`; an RPC that lies consistently could mislead it. A second, independent time source (for example Horizon) was not added.
5. A record older than the RPC's history cannot be resolved automatically.
6. The command-line wrapper's success path (a real `execute`) has not been run; only its refusal paths have.
7. Owner-only protection excludes the same user and administrators (see section 3).
8. Independent review of the code is still recommended.
