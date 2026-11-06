# TST signer: usage guide (revision 3)

Written 2026-11-03. **For use only after the final transaction manifest ([disposable-settlement-token-final-manifest.md](disposable-settlement-token-final-manifest.md)), the source ([tst-signer-source/](tst-signer-source/)) and the pinned configuration have been reviewed and execution is approved.** Nothing here has been run against a real key.

## Files

| File | Location | Content | Created by |
|---|---|---|---|
| `deployment-config.json` | next to the script (read-only) | `{version, network, admin, saltHex, predictedContractId}` | `make-deployment-config.cjs <F public address>`, after F exists; reviewed by a person |
| `pinned.cjs` | next to the script | `PINNED_CONFIG_SHA256`, currently `null` | edited by hand after the review of `deployment-config.json` |
| `settlement-token-admin.dpapi` | per-user `TobinTestKeys` directory | F's secret, DPAPI-encrypted | the F creation step (separate approval; not part of the signer) |
| `settlement-token-state.json` | per-user `TobinTestKeys` directory | state version 2: admin, salt, predicted ID, config hash, operation records | `init`, then updated atomically by `execute` |

The state file is written atomically with owner-only permissions where supported and must match the pinned configuration exactly.

## Commands (nothing else is accepted)

```
node make-deployment-config.cjs <F public address>   # writes deployment-config.json (read-only), prints its SHA-256; no key access
node tst-signer.cjs init                             # creates the state from the PINNED config (refused while the pin is null)
node tst-signer.cjs preview <deploy|mint-C|mint-D>   # build, verify, simulate; works unpinned (with a warning); never loads the key
node tst-signer.cjs execute <deploy|mint-C|mint-D>   # reconcile, preview, typed confirmation, then sign and submit ONE transaction
```

## Order and checks

1. (Approved separately) create F and fund it with the one Friendbot request.
2. `node make-deployment-config.cjs <F>`; **review** `deployment-config.json` (admin equals F, network testnet, predicted contract ID) and put the printed SHA-256 into `pinned.cjs`. This review is the point at which the deployment identity becomes immutable.
3. `init`.
4. `preview deploy`: read the intent, resource figures and fee. Stop on any difference from the manifest.
5. `execute deploy`: type exactly `DEPLOY TST CAP 30000 MINTER <first 8 characters of F>` within the transaction's validity (the intent is rechecked against the clock right before signing; with less than 15 s left the run refuses and must be repeated).
6. Verify read-only per the manifest checklist.
7. `preview mint-C`, then `execute mint-C`: phrase `MINT 20000 TO C GCWK6QC7`. **A refusal because the footprint differs from the table is expected to be possible for the first protocol-30 mint preview** (see the security review); stop, report the difference, and do not edit the table without review.
8. `preview mint-D`, then `execute mint-D`: phrase `MINT 10000 TO D GCFEEEEC`.
9. Final verification (supply 30,000; C 20,000; D 10,000; E 0; a further mint simulation fails), then delete F's key file.

## After an interruption

Re-run the same `execute`. It first reconciles any `PENDING` record with the chain and refuses while the outcome is unknown (wait until the transaction's validity window has passed, plus about two minutes). If the message says the local record could not be updated after a success, **do not re-run**: the transaction hash is in the message; reconcile first.

## Tests

```
cd tst-signer
node --test test/tst-signer.test.cjs test/hardening.test.cjs   # (revision 2 text) now 81 tests, see the end of this guide
node mutate.cjs                                                # now 60 mutants, see the end of this guide
node dryrun-live.cjs                                           # READ-ONLY live preview of the deploy path with a stand-in account
```

## Environment

Node 24.14.0; `@stellar/stellar-sdk` 17.4.0 browser bundle (SHA-256 pinned in `sdk-loader.cjs`); Windows PowerShell for DPAPI and `icacls`. No package installation is needed.

## Proposed deployment record (for review; kept in the key directory, never written to the repository by the signer)

The state file already holds the machine-readable record (status, hash, ledger per operation). A human-readable record after the run:

```json
{
  "version": 1,
  "network": "testnet",
  "token": { "contractId": "<predicted and verified>", "wasmHash": "ef48…41f", "name": "Tobin Settlement Test Token", "symbol": "TST", "decimals": 7, "cap": "30000", "minter": "<F>" },
  "configSha256": "<pinned hash>",
  "operations": [
    { "operation": "deploy", "txHash": "<hash>", "ledger": 0, "status": "SUCCEEDED" },
    { "operation": "mint-C", "txHash": "<hash>", "ledger": 0, "status": "SUCCEEDED" },
    { "operation": "mint-D", "txHash": "<hash>", "ledger": 0, "status": "SUCCEEDED" }
  ],
  "verifiedAt": "<UTC time of the read-only verification>"
}
```

Moving a contract ID into the repository is a separate decision.

---

# Revision 3 additions to the usage guide

## Before the first `execute`: preserve and verify the reviewed configuration independently

The pin in `pinned.cjs` is not an independent boundary (same directory, same user; see the security review, section A of revision 3). When the real `deployment-config.json` exists and has been reviewed:

1. Record its SHA-256 and the signer file hashes ([tst-signer-source/SHA256SUMS.txt](tst-signer-source/SHA256SUMS.txt), regenerated after any change) in **two** places outside the signer's directory: the Tobin repository (committed by the owner via a pull request) and a second location the owner controls.
2. In your own PowerShell window, run `Get-FileHash -Algorithm SHA256 deployment-config.json, pinned.cjs, tst-signer-core.cjs, state-store.cjs, tst-signer.cjs, dpapi-key.cjs, sdk-loader.cjs` and compare with the repository **remote** copy and the second copy.
3. Prefer to run from a fresh extraction of the reviewed tag in an empty directory.
4. Check F in the wallet, and the salt and predicted contract ID by eye, against the printed record.

Nothing in revision 3 selects or changes F, the salt or the predicted contract ID; `pinned.cjs` remains `null` until the real values are reviewed.

## What the signer does with each answer to the submission

The signer sends each signed transaction **once**. Then:

| Answer | Meaning | What you will see and what is recorded |
|---|---|---|
| `PENDING` | queued; inclusion not guaranteed | polls; SUCCEEDED on success, FAILED (`ON_CHAIN_FAILED`) if included and failed, otherwise PENDING |
| `DUPLICATE` | already seen by the node | same as `PENDING` |
| `TRY_AGAIN_LATER` | not accepted just now | no failure is recorded; polls; PENDING if never seen; EXPIRED after the window |
| `ERROR` with a result | refused by the node | one confirming lookup; if nothing is on chain: FAILED (`SUBMISSION_REJECTED`) and a wait until its validity window has passed before a new attempt |
| anything missing, malformed, mismatched, or an exception | unknown | PENDING; polls; never resubmitted |

If the message says the **outcome is not known**, do nothing except re-run the same `execute` later: it reconciles first and refuses while the outcome is unknown. Do not try to send the transaction by other means. If a record could not be written after a success, the message names the transaction hash and says **do not re-run**; the next `execute` reconciles it.

After an included **failed** transaction the sequence number and fee are spent; the next attempt builds a fresh transaction after the on-chain guards re-read the contract. After a transaction that was **never applied** the new one reuses the sequence, which is why the signer waits out the old envelope's validity window first. A repeated deploy cannot exist, and a repeated mint would exceed the 30,000 cap and revert.

## Tests (revision 3)

```
node --test test/tst-signer.test.cjs test/hardening.test.cjs test/submission.test.cjs   # 81 tests
node mutate.cjs                                                                         # 60 mutants against a verified green baseline
```

---

# Revision 4 additions to the usage guide (final review and Windows validation)

## What changed for the operator

1. **The DPAPI key file must be readable by the production script.** `settlement-token-admin.dpapi` (in the per-user `TobinTestKeys` directory) is the text produced by PowerShell `ConvertFrom-SecureString`, written with `Set-Content` or any other method. A defect was fixed in this revision: the decrypt step now trims a trailing newline, which `Set-Content` always adds; before the fix a file written that way could not be decrypted at all. The creation step for F (separate approval, not in the signer) must be checked once with a dummy value before the real one: run the dummy round trip in `test/windows.test.cjs` on the same machine.
2. **The state file's owner-only permission is now verified, not assumed.** `init` and every state update refuse if the real ACL does not end up as a single explicit FullControl rule for the current user. If it refuses on your machine, do not work around it; report the message (it lists what the inspected ACL contained).
3. **Pending records are resolved by network time, not by your clock.** A record becomes EXPIRED only when the `NOT_FOUND` answer itself shows a ledger that closed after the transaction's validity window and history that reaches back before the submission. Otherwise the signer refuses with the reason (for example "the latest ledger close time has not passed the end of the validity window"): wait a few minutes and re-run `execute`. A rejected submission blocks a new attempt in the same way. If the message says the RPC history does not cover the submission, the record is too old for automatic resolution and needs a person to review it against the chain. A transaction that appears on the chain as SUCCESS or FAILED is always recorded as such.
4. **Nothing is ever resubmitted by reconciliation or by a re-run;** a re-run builds a new transaction only after the previous record is resolved.

## Validating the signer on a Windows machine (disposable data only)

```
cd tst-signer
node --test test/windows.test.cjs     # 13 tests: real ACL inspection, dummy DPAPI round trip, NTFS atomic state, CLI refusals
node windows-validation.cjs           # prints the ACL before/after, the read-only-target behaviour and the mint-C refusal (read-only network lookups)
```

These use a fresh temp directory and a temporary copy of the signer; they never read the real key directory or a real DPAPI file.

## Before the real mint previews

After the real deployment, run `preview mint-C` and inspect the footprint and resources it reports against the table in the security review (the protocol-30 mint has not been observed). A refusal because the footprint differs is the intended safe behaviour: report it, do not edit the table without review. Approve each mint separately.

## Tests (revision 4)

```
node --test test/tst-signer.test.cjs test/hardening.test.cjs test/submission.test.cjs test/expiry.test.cjs test/windows.test.cjs   # 107 tests
node mutate.cjs                                                                                                                      # 85 mutants, all killed
```

## Checking the files before use

`tst-signer-source/SHA256SUMS.txt` lists the SHA-256 of every signer file (regenerated for revision 4). Compare with `Get-FileHash -Algorithm SHA256 <file>` in your own PowerShell window and against the repository remote copy once committed by you.
