# Reproduction instructions: Revision 6.3 candidate (NOT APPROVED)

Everything is offline. No key, secret, network, signing or transaction is involved. Use a **fresh empty directory** and pass paths as arguments (extracted archives are untrusted data: do not run interpreters from inside them).

Author's environment: Node.js v24.14.0, Windows PowerShell 5.1, Windows 11 Pro 10.0.22000. Git Bash was used for the shell commands below; PowerShell equivalents are straightforward.

## Layout of `revision-6-3/`

| Path | What |
|---|---|
| `PHASE-2C-REVISION-6-3-SECURITY-REVIEW.md` | the report (sections A to I) |
| `parser-identity.md`, `ast-allowlist-specification.md`, `capability-origin-specification.md`, `reflection-prototype-policy.md`, `sensitive-api-inventory.md`, `process-execution-inventory.md`, `environment-access-inventory.md`, `absolute-path-hardening-proposal.md`, `KNOWN-LIMITATIONS.md` | specifications, inventories and the hardening proposal |
| `tool/ast-policy.cjs.txt`, `tool/verify-baseline.cjs.txt`, `tool/inventory-report.cjs.txt`, `tool/analyze-files.cjs.txt`, `tool/legacy-fixtures.cjs.txt`, `tool/demonstrate-bypass63.cjs.txt` | the analyzer and helper scripts (`.txt` so they are not run by accident; copy to real names) |
| `tests/ast-policy.test.cjs.txt`, `tests/verify-baseline.test.cjs.txt`, `tests/legacy-62-tests.txt` | regression tests; the last is the Revision 6.2 test source whose three fixture tables are replayed unchanged |
| `mutation/mutation-check.cjs.txt`, `mutation/tool-mutation.cjs.txt` | real-file mutation suite and analyzer mutation check |
| `vendor/acorn/{acorn.js,package.json,LICENSE}`, `package.json`, `package-lock.json` | the pinned parser and dependency files |
| `runtime-sources/*.cjs` | the exact eight Revision 5 runtime files |
| `sdk-package/package.json`, `sdk-package/dist/stellar-sdk.js` | pinned SDK 17.4.0 files |
| `revision-5/tst-signer-revision-5-review.zip` | immutable Revision 5 archive (SHA-256 `01a3948e…d609`) |
| `revision-6-2/PHASE-2C-REVISION-6-2-EVIDENCE.zip` | the exact Revision 6.2 archive (SHA-256 `6692524d…7413`) |
| `historical/tool-revision-6-2.cjs.txt` | the Revision 6.2 hash tool, used only by the bypass demonstration |
| `fixtures/negative/*`, `fixtures/control/*` | 134 negative fixtures (+ the exact bypass) and the harmless control, exported from the test table |
| `b0/` | B0 manifest, plain-`sha256sum` reproduction, PowerShell parity output, Node verification output of the Revision 6.2 tool and of the 6.3 gate |
| `output/` | test outputs, mutation outputs (JSON and text), analyzer-mutation output, inventories, bypass demonstration, legacy replay, initial inspection |
| `SHA256SUMS.txt` | checksum of every other file |

## 1. Verify inputs without trusting the tool

```
sha256sum -c SHA256SUMS.txt
sha256sum revision-5/tst-signer-revision-5-review.zip   # 01a3948e55bccc94975d46e304f024e0c858db91560d8af91a985d561494d609
sha256sum revision-6-2/PHASE-2C-REVISION-6-2-EVIDENCE.zip # 6692524dd77b707ea209a63ad2666a23723511e1b075fb4a6a9881a256047413
sha256sum vendor/acorn/acorn.js vendor/acorn/package.json  # b95392d7…e9df  04d6fecaaf…c00
```
Extract the Revision 5 ZIP into a NEW EMPTY directory `X5` and compare each runtime file (`X5/tst-signer-revision-5/<name>.cjs.txt` against `runtime-sources/<name>.cjs`) with `cmp`.

B0 by hand (no project code): see `b0/b0-reproduction.txt` (a short shell script is shown there). The manifest has header `TOBIN-TST-SIGNER-BASELINE v1`, then 11 entries `<sha256>  <label>` in ordinal label order, LF, final LF; the baseline hash is the SHA-256 of the manifest. Expected `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7`.

## 2. Set up the working directory

```
mkdir work && cd work
cp -r ../vendor .
for n in ast-policy verify-baseline inventory-report analyze-files legacy-fixtures demonstrate-bypass63; do cp ../tool/$n.cjs.txt $n.cjs; done
for n in ast-policy.test verify-baseline.test; do cp ../tests/$n.cjs.txt $n.cjs; done
cp ../tests/legacy-62-tests.txt .
for n in mutation-check tool-mutation; do cp ../mutation/$n.cjs.txt $n.cjs; done
cp ../historical/tool-revision-6-2.cjs.txt tool-revision-6-2.cjs
export TOBIN_SIGNER_DIR=$PWD/../runtime-sources TOBIN_SDK_PACKAGE=$PWD/../sdk-package
```

## 3. Commands and expected results

| Goal | Command | Expected |
|---|---|---|
| The eight files under the AST policy | `node analyze-files.cjs ../runtime-sources` | `files: 8, pass: 8, fail: 0` |
| B0 with the AST gate | `node verify-baseline.cjs --signer-dir ../runtime-sources --sdk-package ../sdk-package --verify 9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` | `VERIFY: MATCH`, exit 0 |
| Regression tests (policy + legacy tables + positives) | `node --test --test-reporter=spec ast-policy.test.cjs` | `tests 183, pass 183, fail 0, skipped 0` (about 6 s) |
| Verification entry point tests | `node --test --test-reporter=spec verify-baseline.test.cjs` | `tests 9, pass 9, fail 0, skipped 0` (needs `TOBIN_SDK_PACKAGE`) |
| Real-file mutation suite | `node mutation-check.cjs ../runtime-sources` | `TOTAL 1896; killed 1823; controls accepted 73; SURVIVED 0`, exit 0 (about 5 s) |
| Analyzer mutation check | `node tool-mutation.cjs ../runtime-sources` | see `output/tool-mutation-output.txt` for the exact counts; exit 0 (about 5 minutes) |
| The 6.2 bypass against the real 6.2 tool and 6.3 | `node demonstrate-bypass63.cjs ../runtime-sources` | Revision 6.2: ACCEPTED, Revision 6.3: refused (four placements) |
| Inventories | `node inventory-report.cjs ../runtime-sources` | diff against `output/inventory-eight-files.md` |
| Replay of the Revision 6.2 fixture tables | `node legacy-run.cjs ../runtime-sources` (copy `tool/legacy-run.cjs.txt`; needs `legacy-62-tests.txt` in the working directory) | 290 checks, 2 accepted = the documented difference |
| PowerShell parity (non-authoritative) | `powershell.exe -NoProfile -File reproduce-in-powershell.ps1 -SignerDir ..\runtime-sources -SdkPackage ..\sdk-package -Verify 9b594c54…` | `VERIFY: MATCH` (script is in the Revision 6.2 archive; hash procedure only) |

## 4. Kinds of evidence

| Kind | Items |
|---|---|
| Automated test evidence (author-written) | regression tests, 134 fixtures, replay of the 145 Revision 6.2 fixture rows (26 + 53 + 66) into two files each (290 checks), real-file mutation suite, analyzer mutation check |
| Static source inspection (author) | allowlist, capability and reflection specifications; inventories; the execution-call review |
| Independent reproduction | **none yet.** The B0 manifest and hash can be recomputed with plain `sha256sum` without any project code (step 1). Agreement between this analyzer, the 6.2 tool and the PowerShell script is agreement between scripts by one author, not independence |
