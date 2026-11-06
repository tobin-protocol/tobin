# Reproduction instructions: Revision 6.1 candidate (NOT APPROVED)

Everything below is offline. Nothing needs a key, a secret, the network or a transaction. Do not run any of it from inside a directory you do not trust; use a fresh empty working directory and pass paths as arguments.

Candidate code baseline (B0): `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` (manifest header `v1`, unchanged from the Revision 6 candidate because no hashed input changed).

Environment used by the author: Node.js v24.14.0, Windows PowerShell 5.1.22000.2538, Windows 11 Pro 10.0.22000.

## 0. Layout of this package (`revision-6-1/`)

| Path | What |
|---|---|
| `runtime-sources/*.cjs` | the exact eight runtime signer files (real names) |
| `revision-5/tst-signer-revision-5-review.zip` | the immutable Revision 5 archive, SHA-256 `01a3948e55bccc94975d46e304f024e0c858db91560d8af91a985d561494d609` |
| `sdk-package/package.json`, `sdk-package/dist/stellar-sdk.js` | the pinned SDK files: `@stellar/stellar-sdk` 17.4.0, package.json SHA-256 `ee981053db93fce5c81310620d8198a493aa134ecd35d3e64540296687d72a62`, bundle SHA-256 `de18071d1f64bf6aa1806a4eb250b3be7c1811a8e8ecdfc3c103013cf1d9b92f` (the local copy that the signer's loader accepts; not re-downloaded) |
| `*.cjs.txt`, `*.ps1.txt` | the tool, test, report and demonstration scripts (suffix `.txt` so they are not run by accident; copy them to the real names to run) |
| `historical/compute-baseline-hash-revision-6.cjs.txt` | the Revision 6 tool, kept for `demonstrate-bypass.cjs` |
| outputs | `test-output.txt`, `mutation-output.txt`, `parity-evidence.txt`, `analysis-eight-files.txt`, `bypass-demonstration.txt`, `configuration-inventory.json`, `baseline-manifest-B0-revision-6-1.txt` |
| `SHA256SUMS.txt` | SHA-256 of every file in this directory except itself |

## 1. Verify the inputs yourself (do not trust the tool for this step)

```
sha256sum revision-5/tst-signer-revision-5-review.zip          # 01a3948e...d609
sha256sum sdk-package/package.json sdk-package/dist/stellar-sdk.js
sha256sum -c SHA256SUMS.txt                                     # every file; "OK" for all
```

Extract the Revision 5 ZIP into a NEW EMPTY directory (`X`). It holds the sources as `*.cjs.txt`. Compare each against `runtime-sources/`:

```
for f in authorization dpapi-key pinned refusal sdk-loader state-store tst-signer-core tst-signer; do
  cmp runtime-sources/$f.cjs X/tst-signer-revision-5/$f.cjs.txt && echo "same: $f"
done
```

(All eight were compared by the author: identical bytes.)

## 2. Build the manifest by hand and hash it

For each of the ten lines, take `sha256sum` of the file; sort the labels in ordinal order; write `"<sha256>  <label>"` with two spaces and LF line endings, preceded by the header `TOBIN-TST-SIGNER-BASELINE v1`, with a final LF. Labels: `file:<name>` for the eight runtime files, `config:deployment-config.json` (value `ABSENT`: no configuration exists), `external:@stellar/stellar-sdk@17.4.0/package.json`, `external:@stellar/stellar-sdk@17.4.0/dist/stellar-sdk.js`. The result must equal `baseline-manifest-B0-revision-6-1.txt`, and its SHA-256 is the baseline.

## 3. Run the tool (read the source first: `compute-baseline-hash.cjs.txt`)

Make a work directory and copy the tools under real names:

```
mkdir work && cd work
cp ../compute-baseline-hash.cjs.txt compute-baseline-hash.cjs
cp ../compute-baseline-hash.test.cjs.txt compute-baseline-hash.test.cjs
cp ../mutation-check.cjs.txt mutation-check.cjs
cp ../parity-demo.cjs.txt parity-demo.cjs
cp ../analyze-files.cjs.txt analyze-files.cjs
cp ../policy-report.cjs.txt policy-report.cjs
cp ../demonstrate-bypass.cjs.txt demonstrate-bypass.cjs
cp ../config-inventory.cjs.txt config-inventory.cjs
cp ../reproduce-in-powershell.ps1.txt reproduce-in-powershell.ps1
cp ../historical/compute-baseline-hash-revision-6.cjs.txt revision-6-tool.cjs
export TOBIN_SIGNER_DIR=$PWD/../runtime-sources TOBIN_SDK_PACKAGE=$PWD/../sdk-package
```

| Goal | Command | Expected |
|---|---|---|
| Source closure, loading-policy analysis, manifest, B0 | `node compute-baseline-hash.cjs --signer-dir ../runtime-sources --sdk-package ../sdk-package --verify 9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` | `VERIFY: MATCH`, exit 0 |
| Per-file analysis, sensitive roots, computed access, watched API uses | `node analyze-files.cjs ../runtime-sources` | `files: 8, pass: 8, fail: 0`; compare with `analysis-eight-files.txt` |
| globalThis allowlist and sensitive-API checks | `node policy-report.cjs ../runtime-sources > /tmp/g.md` and diff with `../globalThis-access-inventory.md` | identical |
| The original bypass and its closure | `node demonstrate-bypass.cjs ../runtime-sources ./revision-6-tool.cjs ./compute-baseline-hash.cjs` | three examples: Revision 6 ACCEPTED, Revision 6.1 REFUSED |
| Regression tests (159) | `node --test --test-reporter=spec compute-baseline-hash.test.cjs` | `pass 159, fail 0, skipped 0` (takes about 20 s; three tests start `powershell.exe`) |
| Mutation checks | `node mutation-check.cjs` | `GROUP A 25 killed, 0 survived; GROUP B 130 refused, 0 accepted; control accepted` (about 10 minutes) |
| Node/PowerShell parity | `node parity-demo.cjs ../runtime-sources ../sdk-package` | `cases: 11, agreeing: 11` |
| Inventory | `node config-inventory.cjs ../runtime-sources <repository root>` | JSON; compare with `configuration-inventory.json` (the repository root is only used to scan documentation for stale values and may be absent in your environment, which changes the document checks, not B0) |

PowerShell alone (non-authoritative; it does not check the closure or the policy):

```
powershell -NoProfile -File reproduce-in-powershell.ps1 -SignerDir ../runtime-sources -SdkPackage ../sdk-package -Verify 9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7
```

## 4. What each kind of evidence is

| Kind | Items |
|---|---|
| Automated test evidence (author-written) | the 159 tests, the 25 tool mutants, the 130 signer-source mutants, the parity demonstration |
| Static source inspection (author) | the `globalThis` inventory, the sensitive-API policy, the per-file analysis |
| Independent reproduction | **none yet.** Steps 1 and 2 are written so that an independent reviewer can do them without trusting the tool; Node and PowerShell agreeing on the author's machine is not independent verification |
| Unverified assumptions | listed in the review, section 11 |
