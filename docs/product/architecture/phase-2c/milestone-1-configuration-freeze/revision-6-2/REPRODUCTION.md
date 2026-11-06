# Reproduction instructions: Revision 6.2 candidate (NOT APPROVED)

Everything is offline. No key, secret, network or transaction is involved. Use a fresh empty working directory and pass paths as arguments.

Candidate code baseline B0: `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` (manifest header `v1`; identical to Revision 6.1 because no hashed input changed).

Author's environment: Node.js v24.14.0, Windows PowerShell 5.1.22000.2538, Windows 11 Pro 10.0.22000.

## Layout of `revision-6-2/`

| Path | What |
|---|---|
| `runtime-sources/*.cjs` | the exact eight runtime signer files |
| `revision-5/tst-signer-revision-5-review.zip` | immutable Revision 5 archive, SHA-256 `01a3948e55bccc94975d46e304f024e0c858db91560d8af91a985d561494d609` |
| `sdk-package/package.json`, `sdk-package/dist/stellar-sdk.js` | pinned SDK 17.4.0 files, SHA-256 `ee981053...2a62` and `de18071d1f64bf6aa1806a4eb250b3be7c1811a8e8ecdfc3c103013cf1d9b92f` |
| `*.cjs.txt`, `*.ps1.txt` | tool, tests and scripts (`.txt` so they are not run by accident; copy to real names) |
| `historical/compute-baseline-hash-revision-6-1.cjs.txt` | the Revision 6.1 tool, used by `demonstrate-bypass62.cjs` |
| outputs | `test-output.txt`, `mutation-output.txt`, `mutation-output-first-run-one-survivor.txt`, `parity-evidence.txt`, `analysis-eight-files.txt`, `bypass-demonstration.txt`, `configuration-inventory.json`, `baseline-manifest-B0-revision-6-2.txt`, `globalThis-access-inventory.md`, `global-alias-inventory.md`, `sensitive-api-policy.md` |
| `PHASE-2C-REVISION-6-2-SECURITY-REVIEW.md`, `SHA256SUMS.txt` | review; checksum of every other file in this directory |

## 1. Verify inputs without trusting the tool

```
sha256sum revision-5/tst-signer-revision-5-review.zip       # 01a3948e...d609
sha256sum sdk-package/package.json sdk-package/dist/stellar-sdk.js
sha256sum -c SHA256SUMS.txt                                  # all OK
```
Extract the Revision 5 ZIP into a NEW EMPTY directory `X` (sources are `*.cjs.txt`) and compare:
```
for f in authorization dpapi-key pinned refusal sdk-loader state-store tst-signer-core tst-signer; do
  cmp runtime-sources/$f.cjs X/tst-signer-revision-5/$f.cjs.txt && echo "same: $f"; done
```
SHA-256 of the eight files:
```
ae3088b47d683f98b0c987afc086989aaf46c1e837d5c183272064e39bdef1b9  authorization.cjs
7acf06713e5ec9478515180333ba132060d3bb68d75b0c8002923e0c41b589de  dpapi-key.cjs
312ed3f24c83ed1f8e5e7ebc8f3501389374f3b18528698d638830cef8dff361  pinned.cjs
562039b8d581894e4c9a5c79262a182bf7a603b85ce9031f39d3401607b46f3e  refusal.cjs
7bc1fedc451da5ea4e839ce7a25e048696548aad7fb794cfef1c0a14671817a9  sdk-loader.cjs
ae59de944e9b3c624d9f33c1c07c78f6eb0bb8c77ef81fdd781513115b5b393e  state-store.cjs
207fc6b722bcad99189c030583bc0aa1b24ece7e5927c6eed084bcefaeafffc3  tst-signer-core.cjs
5f55891425daf0f0f3480b461a9d2152affafbf1cb27e4c0d0837b86f3e93b6a  tst-signer.cjs
```
(each must equal the value printed by `sha256sum` and the matching line of the manifest).

## 2. Manifest by hand

Ten lines `<sha256>  <label>` (two spaces), ordinal-sorted by label, LF, header `TOBIN-TST-SIGNER-BASELINE v1` first, final LF. Labels: `file:<name>` x8, `config:deployment-config.json` = `ABSENT`, `external:@stellar/stellar-sdk@17.4.0/package.json`, `external:@stellar/stellar-sdk@17.4.0/dist/stellar-sdk.js`. Must equal `baseline-manifest-B0-revision-6-2.txt`; its SHA-256 is B0.

## 3. Run the tool (read `compute-baseline-hash.cjs.txt` first)

```
mkdir work && cd work
for n in compute-baseline-hash compute-baseline-hash.test mutation-check config-inventory policy-report analyze-files demonstrate-bypass62 parity-demo; do cp ../$n.cjs.txt $n.cjs; done
cp ../reproduce-in-powershell.ps1.txt reproduce-in-powershell.ps1
cp ../historical/compute-baseline-hash-revision-6-1.cjs.txt revision-6-1-tool.cjs
export TOBIN_SIGNER_DIR=$PWD/../runtime-sources TOBIN_SDK_PACKAGE=$PWD/../sdk-package
```

| Goal | Command | Expected |
|---|---|---|
| Closure, loading policy, manifest, B0 | `node compute-baseline-hash.cjs --signer-dir ../runtime-sources --sdk-package ../sdk-package --verify 9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` | `VERIFY: MATCH`, exit 0 |
| Per-file analysis of the eight files | `node analyze-files.cjs ../runtime-sources` | `files: 8, pass: 8, fail: 0` |
| The 6.1 bypass and its closure | `node demonstrate-bypass62.cjs ../runtime-sources ./revision-6-1-tool.cjs ./compute-baseline-hash.cjs` | 5 examples, 3 accepted by 6.1, 5 refused by 6.2 |
| Regression tests | `node --test --test-reporter=spec compute-baseline-hash.test.cjs` | `tests 298, pass 298, fail 0, skipped 0` (about 40 s; three tests start `powershell.exe`) |
| Mutation checks | `node mutation-check.cjs` | `GROUP A 37 killed, 0 survived; GROUP B 282 refused, 0 accepted; control accepted`, exit 0 (about 15 to 20 min) |
| Node/PowerShell parity | `node parity-demo.cjs ../runtime-sources ../sdk-package` | `cases: 11, agreeing: 11` |
| Inventory | `node config-inventory.cjs <signer dir with ../pk layout> <repository root>` | JSON; summary 21 pass, 3 flag, 2 blocker, 2 info (it needs the signer next to a `pk/` directory like the author's layout; the document checks need the repository) |
| Global-alias / globalThis report | `node policy-report.cjs ../runtime-sources` | diff with `globalThis-access-inventory.md` |

## 4. Kinds of evidence

| Kind | Items |
|---|---|
| Automated test evidence (author-written) | the 298 tests, 37 tool mutants, 282 signer-source mutants, parity demonstration |
| Static source inspection (author) | alias inventory, sensitive-API policy, vm-exception review, executable-path review (in the review, sections 8 and 9) |
| Independent reproduction | **none**. Steps 1 and 2 let a reviewer recompute B0 without the tool. Two scripts by one author agreeing is not independence |
