# B1 candidate baseline: manifest, entries and verification status

**REVISION: Phase 2C B1 CANDIDATE. NOT APPROVED. SELF-VERIFIED only; independent verification PENDING. Founder approval PENDING.**
B0 and every historical manifest are preserved unchanged and are not reused: B1 describes a *different* runtime closure.

| Item | Value |
|---|---|
| B1 candidate hash | `83f11a7f5ca4dce244dde39f69b19442711902137b8cba8ba3beb7f446c8733e` |
| Manifest | `baseline-manifest-B1.txt` (1,170 bytes, LF only, final LF, header `TOBIN-TST-SIGNER-BASELINE v1`, 13 entries = 14 lines) |
| Manifest file SHA-256 | equals the B1 hash (the baseline hash is the SHA-256 of the manifest bytes) |
| Procedure | canonical procedure version 1, unchanged from B0 (same header, labels, ordinal order, LF, text rules); only the **input set** differs |
| Deployment configuration | `ABSENT`: account F and `deployment-config.json` do not exist. Creating the configuration will change the baseline and require a new B1 approval |

## Every entry and why it is there

| Label | SHA-256 | Reason for inclusion | Relation to B0 |
|---|---|---|---|
| `file:authorization.cjs` | `ae3088b4…bdef1b9` | runtime: authorization checks of the transaction | **unchanged** from B0 |
| `file:baseline.cjs` | `9461162c…477b2e96` | runtime: the integrity gate; protected by the external tool only (it cannot vouch for itself) | **new** |
| `file:dpapi-key.cjs` | `7acf0671…c41b589de` | runtime: the only code that decrypts the admin key (loaded only after verification) | unchanged |
| `file:pinned.cjs` | `312ed3f2…8dff361` | runtime: holds `PINNED_CONFIG_SHA256` (currently `null`); required by the application; a change here is a change to what the signer accepts | unchanged; included (as in the candidate definition, excluded in the historical `ccea8b5b…`) |
| `file:refusal.cjs` | `562039b8…01607b46f3e` | runtime: refusal and redaction | unchanged |
| `file:sdk-loader.cjs` | `7bc1fedc…71817a9` | runtime: loads the pinned SDK bundle after checking its hash | unchanged |
| `file:state-store.cjs` | `ae59de94…15b393e` | runtime: atomic state, ACL inspection (starts `powershell.exe`, `icacls`) | unchanged |
| `file:tst-signer-core.cjs` | `207fc6b7…eafffc3` | runtime: the operation rules, previews and the typed-confirmation flow | unchanged |
| `file:tst-signer-main.cjs` | `3fee267b…74196e` | runtime: the application entry (old `tst-signer.cjs` body; requires the gate's proof) | **new** (derived from the old `tst-signer.cjs` with three mechanical edits and the proof check) |
| `file:tst-signer.cjs` | `ad951774…93284980` | runtime: the launcher, the only entry point; verifies before loading the application | **changed** (new launcher) |
| `config:deployment-config.json` | `ABSENT` | the reviewed configuration is an input to the baseline when it exists | unchanged (`ABSENT` in B0 too) |
| `external:@stellar/stellar-sdk@17.4.0/package.json` | `ee981053…d72a62` | SDK identity (name and version) | unchanged |
| `external:@stellar/stellar-sdk@17.4.0/dist/stellar-sdk.js` | `de18071d…f1d9b92f` | the bundle that `sdk-loader.cjs` executes | unchanged |

Not in the manifest, with reasons: `make-deployment-config.cjs` (configuration generator, never loaded by the signer), `test/` (tests), `restore-sdk.cjs` and the inventories (tooling), `LICENSE` of the SDK (not executed), the state file and the DPAPI key file (mutable by design, outside the repository), and
`verify-signer-baseline.cjs` (the external tool is the verifier, not a verified input). Seven of the ten runtime files are byte-identical to B0; the three that differ are exactly the launcher, its application body and the gate.

## Verification performed (all by one author)

| Implementation | What | Result |
|---|---|---|
| In-signer gate (`baseline.cjs`, via the launcher's `baseline` command) | computes the manifest | `83f11a7f…733e` |
| External tool (`verify-signer-baseline.cjs`, separate code) | computes and compares, `VERIFY: MATCH`; `--manifest` comparison with the preserved manifest | MATCH, exit 0 |
| Test oracle (written inside the test files from the specification) | manifest and hash for temporary copies and the real directory | equal |
| PowerShell script (`independent-b1-check.ps1.txt`; different language, own `require()` walk) | closure walk equals the 10 files; manifest byte-identical to the preserved file | MATCH (`run-independent-b1-check.txt`) |

**This is SELF-VERIFIED.** All four were written by the same author; they show that the arithmetic is consistent, not that the closure is the right one or that the code is safe. **Independent verification is pending:** a reviewer should rebuild the manifest from the specification without reading
these implementations, and review `baseline.cjs`, the launcher and the application entry in particular.

## What is still required before B1 may be relied on

1. A separate reviewer's independent reproduction of the B1 hash (pending).
2. Founder approval of B1, recorded outside the signer directory in the independently maintained trusted record. This work does not approve B1.
3. A decision on the unresolved runtime hazards (bare `powershell.exe`/`icacls`, inherited environment) which, if fixed, change the closure and therefore B1.
4. Creation of account F and the reviewed `deployment-config.json` (separate authorisation); that changes the `config:` entry and requires a fresh B1.
