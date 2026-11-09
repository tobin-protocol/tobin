# Phase 2C, Milestone 1, Revision 6: configuration-baseline corrections

Status: **REVISION 6 CANDIDATE, NOT YET APPROVED.** Tooling and evidence correction only. It does not approve B0, enable execution, or authorize any deployment, signing, submission, minting or transfer.

New code baseline (Revision 6 candidate B0):

```
9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7
```

Superseded Milestone 1 candidate (kept as historical evidence, not deleted): `ccea8b5b94bf3358f295ec8dd85435f34505714ef927764e5f58c557c567aa92`.

## 1. Executive summary

The independent review found two blockers to approving B0 and one parity issue. All three are corrected in the tooling only. No signer file was touched.

| # | Finding | Correction | Evidence |
|---|---|---|---|
| A | `pinned.cjs` was loaded by the signer but excluded from the hash | `pinned.cjs` is now an input (`file:pinned.cjs`); a missing, changed or malformed copy fails or changes B0 | tests "pinned.cjs ...", mutant M1 killed |
| B | Closure discovery matched only literal `require('./x')` text and proved nothing about other loading forms | A lexer-based loading policy rejects dynamic, computed, aliased and `import()` loading, unlisted or missing dependencies, and unreviewed filesystem-read and code-execution API use | 26 rejection tests, mutants M2 to M8 killed |
| C | The PowerShell script had a hardcoded list, no UTF-8 validation, no closure claim control | Same eight files, strict UTF-8, BOM and CR refusal, same manifest bytes; it states that it does **not** check the closure or policy | parity tests, `parity-evidence.txt` (11 of 11 agree) |

Result: the Revision 6 candidate B0 is `9b594c54...bbb7`. It equals the old manifest plus one line (`file:pinned.cjs`). It was reproduced by the Node tool on the working copy, by the Node tool and the PowerShell script on files taken from the immutable Revision 5 ZIP, and the 47 tests and 10 mutants pass or are killed as stated below.

Nothing here approves B0. Approval belongs to the founder or an independent reviewer (section 11).

## 2. Safety statement

- No secret, private key, DPAPI blob or credential was loaded, requested, generated or inspected. `%LOCALAPPDATA%\TobinTestKeys` was not opened.
- No network operation was performed (no RPC, no Friendbot, no download). The optional `--live` Wasm lookup of `config-inventory.cjs` was **not** run; its check C-23 is therefore absent from the Revision 6 inventory (28 checks instead of 29). The Milestone 1 live result stays in the Milestone 1 evidence.
- No transaction was built, simulated, signed or submitted. Account F was not created. `deployment-config.json` was not created or modified. Nothing was deployed, minted or transferred.
- No signer constant, ceiling, fee, allocation, token parameter or confirmation phrase was changed. Part B was not implemented. `pinned.cjs` still holds `PINNED_CONFIG_SHA256: null`.
- Nothing was committed, pushed, tagged or published.

## 3. Starting state verified

| Item | Value | Check |
|---|---|---|
| Revision 5 ZIP | `C:\Users\Ebubechi\Downloads\tst-signer-revision-5-review.zip` | sha256 `01a3948e55bccc94975d46e304f024e0c858db91560d8af91a985d561494d609`, equal before and after this task |
| Milestone 1 B0 | `ccea8b5b...aa92` | unchanged file `../baseline-hash-B0.sha256` |
| Milestone 1 evidence | `../SHA256SUMS.txt` | all entries still verify (0 failures) |
| Signer working copy | `scratchpad/tst-signer/` (outside the repository) | the eight closure files hash identically to the copies inside the Revision 5 ZIP (section 7) |

The ZIP was extracted read-only into a fresh directory (`scratchpad/r5-extract`); the ZIP itself was never opened for writing. Revision 5 files inside the ZIP carry a `.txt` suffix; they were copied under their real names into `scratchpad/r5-signer-from-package` for hashing.

Working copy for Revision 6: `scratchpad/baseline-tools-r6/` (copied from `baseline-tools/`, which is left unchanged).

## 4. Runtime closure before and after

Entry point `tst-signer.cjs`. Static literal requires found by the policy:

| File | Relative requires | Built-ins |
|---|---|---|
| tst-signer.cjs | dpapi-key, pinned, sdk-loader, state-store, tst-signer-core | fs, path, readline |
| tst-signer-core.cjs | authorization, refusal | crypto |
| authorization.cjs | refusal | none |
| dpapi-key.cjs | refusal | child_process |
| sdk-loader.cjs | none | crypto, fs, path, vm |
| state-store.cjs | none | child_process, crypto, fs, path |
| refusal.cjs | none | none |
| pinned.cjs | none | none |

| | Runtime-loaded | Hashed | Hashed but not loaded | Loaded but not hashed |
|---|---|---|---|---|
| Milestone 1 | 8 files | 7 files | none | **pinned.cjs** |
| Revision 6 | 8 files | 8 files | none | none |

Not hashed (reported by name in the `notHashed` field of the build result and in the inventory): every other file in the signer directory (tests, mutation tools, evidence scripts, patch scripts, `make-deployment-config.cjs`). None is reachable from `tst-signer.cjs`. `make-deployment-config.cjs` is not loaded when signing; its **output**, `deployment-config.json`, is hashed.

Externally loaded code: the SDK bundle is executed with `vm.runInThisContext` in `sdk-loader.cjs` after its SHA-256 is checked against a constant. Its package metadata and bundle are inputs of the baseline hash (`external:` lines). The signer's own check and the baseline hash therefore both cover it.

`pinned.cjs` holds the hash of the reviewed `deployment-config.json`, never the baseline hash. The expected baseline hash is supplied from outside (`--verify`) and appears in none of the hashed files (a test checks the tool and all eight files for it). Consequence to note: once a configuration pin is set, `pinned.cjs` changes, so the code-only B0 no longer equals the hash of the files in use; the full pin P (with the configuration) is then the value to approve.

## 5. Loading policy and its limits

Implemented in `compute-baseline-hash.cjs`. No parser is installed in the signer environment, and adding a dependency (for example the TypeScript compiler from `tobin-landing/node_modules`) would put an unpinned package inside the verifier, so a conservative lexical policy was used instead. It fails closed.

Lexing: strings, template literals (with substitutions), comments, regular-expression literals and bracket balance. Refused: unterminated string, comment, template or regex; unbalanced brackets; any control or non-ASCII character outside a literal or comment; a backslash outside a literal (blocks `\u0065val`).

Rules over the tokens:

1. `require` must be exactly `require('<string literal>')`: not aliased, not a member, not called with an expression, concatenation or template.
2. A relative target must match `./<name>[.ext]` (no `..`, no sub-directory) and be in the approved closure. A non-relative target must be a listed built-in that the importing file is approved for (`vm` only in `sdk-loader.cjs`, `child_process` only in `dpapi-key.cjs` and `state-store.cjs`, and so on).
3. Forbidden identifiers anywhere: `eval`, `Function`, `import`, `export`, `createRequire`, `Module`, `mainModule`, `binding`, `dlopen`, `_load`, `_resolveFilename`, `_compile`, `WebAssembly`, `Worker`, `importScripts`, `global`, `Reflect`, `Proxy`, `SharedArrayBuffer`; `.constructor` member access; string literals equal to those names; computed member keys built from a string expression.
4. `process` only with an approved member; `module` only as `module.exports` or in `require.main === module`.
5. Reviewed maximum use counts per file for filesystem-read and execution names (`readFileSync`, `openSync`, `runInThisContext`, `vm`, `execFileSync`, `exec`, `load`, `globalThis`, and the other names in the `WATCHED_IDS` list). Current approved counts: sdk-loader.cjs readFileSync 2, runInThisContext 1, vm 2, globalThis 4; state-store.cjs readFileSync 2, execFileSync 4, exec 9, load 3, openSync 1; dpapi-key.cjs execFileSync 3; tst-signer.cjs readFileSync 1. Any other file, or one more use, is refused.

Limits (stated plainly):

- This is not a complete JavaScript static analysis and not a sandbox. It narrows what a reviewed change can introduce unnoticed.
- Obfuscated computed-property gadgets that do not use a listed name or a string-built key are not detected.
- The count table is keyed by identifier name, so it also counts unrelated local names (`exec` and `load` are parameter and function names in `state-store.cjs`). It is brittle on purpose: any change forces a reviewed edit of the tool.
- An approved API can still be used with a hostile argument (for example the `fs` read in `tst-signer.cjs` reads whatever path it is given). The policy limits where such calls exist, not what they read; a human reviews them.
- `exec` of `powershell.exe` and `icacls` by bare name (PATH-resolved) is unchanged and remains open item F-4 of Milestone 1; it runs programs, it does not load local source.
- Regex-versus-division after `)` or `}` is a heuristic; a misjudged case tends to produce a lexing error and therefore a refusal.
- The policy is applied to the eight closure files only. It says nothing about the SDK bundle (covered by hash) or about the Node runtime and the operating system.

## 6. Node and PowerShell parity

`reproduce-in-powershell.ps1` now hashes the same eight files (including `pinned.cjs`), applies strict UTF-8 decoding (`UTF8Encoding($false,$true)`), refuses a BOM and any CR byte, treats an absent configuration as `ABSENT`, hashes the same two SDK files, and writes the same labels, ordinal order, header, separators and final LF. It also supports `-ManifestOut` and `-Verify` with the same exit codes as the Node tool (0 match, 1 mismatch, 2 refused, 3 malformed expected value).

The script does **not** discover the require graph and does **not** apply the loading policy. It says so in its header, and a test checks that statement. It is a non-authoritative reproduction of the hash procedure for a given file set, not a second closure verifier.

Defect found by the parity tests and fixed: PowerShell `-notmatch` is case-insensitive, so an upper-case expected value was reported as MISMATCH (exit 1) where Node refuses it (exit 3). The script now uses `-cnotmatch`.

`parity-evidence.txt` (generated by `parity-demo.cjs`): 11 cases, 11 agree.

| Case | Node | PowerShell |
|---|---|---|
| unchanged, config absent | `9b594c54...bbb7` | same |
| unchanged, config present (throwaway fixture) | `be98c389...d800` | same |
| `pinned.cjs` pin set to a throwaway value | `2e967cd1...5318` | same |
| `pinned.cjs` plus one space | `21ffef79...a355` | same |
| `pinned.cjs` missing, CRLF, BOM, invalid UTF-8 | refused, exit 2 | refused, exit 2 |
| configuration with CRLF, BOM, invalid UTF-8 | refused, exit 2 | refused, exit 2 |

Both implementations also reproduce `9b594c54...bbb7` from the eight files taken from the Revision 5 ZIP.

Caution: Node and PowerShell run on the same machine, written by the same author in this session. This shows the procedure is implemented consistently, not independent verification (section 10).

## 7. Canonical manifest

Canonicalization is unchanged: header, per-file SHA-256, two-space separator, ordinal label order, LF, final newline, raw bytes after text validation. The only change is the input set: one added line, `file:pinned.cjs`. The header stays `TOBIN-TST-SIGNER-BASELINE v1`; a v1 manifest with eight `file:` lines therefore differs from the Milestone 1 one only by that line. The reviewer may prefer a version bump to `v2`; that would change B0 again and was not done without instruction.

Before and after:

| | Milestone 1 | Revision 6 |
|---|---|---|
| `file:` lines | 7 | 8 |
| added line | n/a | `312ed3f24c83ed1f8e5e7ebc8f3501389374f3b18528698d638830cef8dff361  file:pinned.cjs` |
| all other lines | identical | identical |
| baseline hash | `ccea8b5b94bf3358f295ec8dd85435f34505714ef927764e5f58c557c567aa92` | `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` |

Revision 6 manifest (`baseline-manifest-B0-revision-6.txt`, whose own SHA-256 is the baseline hash):

```
TOBIN-TST-SIGNER-BASELINE v1
ABSENT  config:deployment-config.json
de18071d1f64bf6aa1806a4eb250b3be7c1811a8e8ecdfc3c103013cf1d9b92f  external:@stellar/stellar-sdk@17.4.0/dist/stellar-sdk.js
ee981053db93fce5c81310620d8198a493aa134ecd35d3e64540296687d72a62  external:@stellar/stellar-sdk@17.4.0/package.json
ae3088b47d683f98b0c987afc086989aaf46c1e837d5c183272064e39bdef1b9  file:authorization.cjs
7acf06713e5ec9478515180333ba132060d3bb68d75b0c8002923e0c41b589de  file:dpapi-key.cjs
312ed3f24c83ed1f8e5e7ebc8f3501389374f3b18528698d638830cef8dff361  file:pinned.cjs
562039b8d581894e4c9a5c79262a182bf7a603b85ce9031f39d3401607b46f3e  file:refusal.cjs
7bc1fedc451da5ea4e839ce7a25e048696548aad7fb794cfef1c0a14671817a9  file:sdk-loader.cjs
ae59de944e9b3c624d9f33c1c07c78f6eb0bb8c77ef81fdd781513115b5b393e  file:state-store.cjs
207fc6b722bcad99189c030583bc0aa1b24ece7e5927c6eed084bcefaeafffc3  file:tst-signer-core.cjs
5f55891425daf0f0f3480b461a9d2152affafbf1cb27e4c0d0837b86f3e93b6a  file:tst-signer.cjs
```

## 8. Test results

Environment: Node.js v24.14.0, Windows PowerShell 5.1.22000.2538, Windows 11 Pro 10.0.22000, offline.

| | Count |
|---|---|
| Total tests | 47 |
| Passed | 47 |
| Failed | 0 |
| Skipped | 0 |
| Cancelled | 0 |
| Tests in the Milestone 1 suite | 9 |
| Milestone 1 tests kept (8, of which 3 adjusted, see below) | deterministic hash, single-byte change, CR/BOM/UTF-8, new or missing module, configuration part of the pin, SDK identity, `--verify` fail-closed, tool capability |
| Milestone 1 test inverted and replaced (1) | "pinned.cjs is NOT hashed" |
| New tests (including the replacement of the inverted one) | 39 |
| Tests removed | 0 |

Changed existing tests, with the reason, so a reviewer can judge whether any expectation was weakened:

1. "pinned.cjs ... NOT hashed" asserted blocker 1. It is **inverted** and replaced by tests that require `pinned.cjs` to be hashed, deterministic, and to fail when missing or malformed.
2. "new module ... or a missing one is refused": the error-message pattern was widened because the policy now rejects an unlisted dependency with a different message. A stricter test with exact messages was added next to it ("missing declared dependency pinned.cjs / state-store.cjs").
3. "`--verify` fails closed": setup now passes `--sdk-package` explicitly; the assertions are the same.
4. "the tool has no capability": the old text regex cannot be applied because the tool now contains policy tables that name `exec` and similar. The test now lexes the tool with its own lexer and asserts that none of a list of process, network and dynamic-code identifiers is used, and that the only `require` targets are `crypto`, `fs` and `path`. It is a different formulation, not a strict superset: the old regex also matched the words `http` and `net`, which are now excluded only through the import assertion.

Mutation check (`mutation-check.cjs`, output `mutation-output.txt`): 10 mutants, 10 killed, 0 survived.

| Mutant | Failing tests |
|---|---|
| M1 original blocker 1 (pinned.cjs loaded, not hashed) | 5 |
| M2 original blocker 2 (no loading form beyond literal relative requires is rejected) | 26 |
| M3 dynamic `import()` no longer forbidden | 3 |
| M4 non-literal require arguments accepted | 1 |
| M5 unlisted relative dependency accepted | 2 |
| M6 approved-use counts ignored | 1 |
| M7 missing declared dependency not reported | 3 |
| M8 closure equality check removed | 1 |
| M9 CR check removed | 4 |
| M10 invalid-UTF-8 check removed | 3 |

Both original blockers are detected by the suite. The mutants are my own, chosen by the author of the tool; they are not an independent mutation analysis. The tests use temporary copies and throwaway fixtures. They use no DPAPI, key, signing or network path, and give no evidence about those paths.

Rejection tests (each builds a modified copy and expects refusal): `require(moduleName)`, `require('./' + m)`, a template-literal require, aliased require, `module.require`, `import(m)`, `import('./' + m)`, `import('./literal.mjs')`, `eval`, `new Function`, `global`, `.constructor` gadget, string-built computed key, dangerous name as string, extra filesystem read of an unlisted source file, `vm` outside the loader, unapproved built-in, node_modules package, unlisted literal relative dependency, `../` and sub-directory targets, `process.binding`, unterminated string, unbalanced brackets, non-ASCII identifier, unicode-escaped identifier. All currently approved dependencies pass.

## 9. Reproduction

Commands run (bash, from `scratchpad/baseline-tools-r6/`; `$S` is the session scratchpad):

```
node --version                                   # v24.14.0
powershell -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'    # 5.1.22000.2538
node compute-baseline-hash.cjs --signer-dir $S/tst-signer --sdk-package $S/pk/x-stellar-stellar-sdk-17.4.0/package --manifest-out baseline-manifest-B0-revision-6.txt
powershell -NoProfile -File reproduce-in-powershell.ps1 -SignerDir $S/tst-signer -SdkPackage $S/pk/x-stellar-stellar-sdk-17.4.0/package
node --test --test-reporter=spec compute-baseline-hash.test.cjs        # 47 pass
node mutation-check.cjs                                                # 10 killed
node parity-demo.cjs $S/tst-signer $S/pk/x-stellar-stellar-sdk-17.4.0/package    # 11 agree
node config-inventory.cjs $S/tst-signer <repository root>               # inventory, no --live
```

An independent reviewer can reproduce B0 without trusting this report:

1. Obtain the Revision 5 ZIP and check its SHA-256 equals `01a3948e...d609`.
2. Extract it to a new empty directory; copy the eight files `authorization`, `dpapi-key`, `pinned`, `refusal`, `sdk-loader`, `state-store`, `tst-signer-core`, `tst-signer` from `*.cjs.txt` to `*.cjs` in another new empty directory.
3. Obtain `@stellar/stellar-sdk` 17.4.0 and confirm `dist/stellar-sdk.js` hashes to `de18071d...b92f` and `package.json` to `ee981053...2a62`.
4. Build the manifest of section 7 by hand (`sha256sum` of each file, ordinal sort of labels, LF, final newline) and hash it. Do not rely on the tool for this step.
5. Only then run the tool and the PowerShell script, from a copy of the tool you have read.

Input file list: the eight signer files above (their hashes are in the manifest), the SDK `package.json` and `dist/stellar-sdk.js`, and no configuration file.

## 10. Unresolved issues and unverified assumptions

- B0 is not approved and not independently verified. Agreement of Node and PowerShell on one machine, by one author, is not independent verification.
- The loading policy is conservative and lexical; it is not a full static analysis (section 5). A human must still read the eight files.
- `deployment-config.json` does not exist, so the full pin P cannot be calculated; F does not exist.
- After any configuration pin is set, B0 as computed here describes the code with `pinned.cjs = null` and will not equal the hash of the files then in use. Approve P, not B0, for execution.
- The header was not bumped to v2 (section 7).
- The tests were run on one machine with Windows PowerShell 5.1 only; PowerShell 7 was not tried.
- Still open from Milestone 1 and out of scope here: the stale-document flags (F-1), the unpinned code constants (F-2), the shared writable directory (F-3), PATH and LOCALAPPDATA (F-4), the SDK location, the real DPAPI path, the protocol 30 mint authorization and footprint, and independent code review.
- Part B (the in-signer, operator-typed baseline check) is not implemented and is not needed to review this correction.
- The live Wasm check C-23 was not re-run (network disabled).

## 11. Files

Created in `docs/product/architecture/phase-2c/milestone-1-configuration-freeze/revision-6/` (the Milestone 1 evidence one level up is unchanged and still verifies):

| File | SHA-256 |
|---|---|
| baseline-manifest-B0-revision-6.txt | `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` |
| compute-baseline-hash.cjs.txt | `f62e700c3812ef5d70ddf26f3b492ee1772e13c001622ec3b43466b639da928a` |
| compute-baseline-hash.test.cjs.txt | `6fd18b3ff0abb07ec20a5b13cedd9e7c00bfe2e8ddd00199a7a970e3e4c7a564` |
| config-inventory.cjs.txt | `7c13edc2f67793a026b0b20cc59dc2d660166d5300930aa3329f441fbe2c8581` |
| configuration-inventory.json | `303a80736aa7308870883002519da01877775fff5654b7979fd9f8450b956f15` |
| mutation-check.cjs.txt | `ceec0a398fff8002359b62d32cfaff8c2dd7efb397c209309eceda148386c290` |
| mutation-output.txt | `46c6ec493914a0feb4b9c5cb734b5808c052c880e0a9ccaf0d93821fda1a4860` |
| parity-demo.cjs.txt | `1568fba25c3d39d803c2f25e9fd751546521138e02ab93f26cc8e040b8ceeee9` |
| parity-evidence.txt | `74e5301b215fccef0f66c583919191a1536989db55571ef2d0e27c5cc8e32557` |
| reproduce-in-powershell.ps1.txt | `fa971c7c7555ce35c4c9aa582a1545a9acb73723e6dae798814d48b1b14b827d` |
| test-output.txt | `8cc5b27091dfb8cd9193ce2cbbc3ebe258dec2e608e8a8755d12e452bc07c725` |
| PHASE-2C-MILESTONE-1-REVISION-6-REVIEW.md | in `SHA256SUMS.txt` (a file cannot contain its own hash) |
| SHA256SUMS.txt | covers every other file in this directory |

The `.txt` suffix on tool, test and script copies matches the Milestone 1 convention and keeps them from being executed by accident. Run them under their real names (`.cjs`, `.ps1`).

Not modified: every signer source file, the Revision 5 ZIP and package, `deployment-config.json` (absent), `m0-review/`, the contracts and the application.

Only the founder or an independent reviewer can decide the next step: approve or reject the Revision 6 candidate B0, decide on a header version bump, and authorize (separately) the creation of F and the configuration whose hash would complete the full pin.
