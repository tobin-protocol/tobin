# Phase 2C, Revision 6.1: loading-policy security correction

Status: **REVISION 6.1 CANDIDATE, NOT APPROVED.** Static-analysis, regression-test and evidence-packaging correction only. B0 is not approved, execution is not enabled, and nothing was signed, submitted, deployed, minted or transferred.

| | |
|---|---|
| Revision 6 candidate B0 (historical, preserved) | `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` |
| **Revision 6.1 candidate B0** | `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` (unchanged, see section 8) |
| Manifest header | `TOBIN-TST-SIGNER-BASELINE v1` (unchanged) |
| Revision 5 archive | SHA-256 `01a3948e55bccc94975d46e304f024e0c858db91560d8af91a985d561494d609`, verified before and after, included in this package |

## 1. Executive summary

The independent review found that the Revision 6 analyzer accepted computed access through sensitive roots, for example `globalThis['require']('./x')` and `globalThis['process']['getBuiltinModule']('vm')['runInThisContext']('...')`.

I reproduced it. Placing each of the three review examples in a copy of the real `sdk-loader.cjs` (in place of the line `return globalThis.StellarSdk;`, so that the name counts stay within their maxima) is **accepted by the Revision 6 tool and refused by the Revision 6.1 tool** (`bypass-demonstration.txt`).

Root cause: Revision 6 constrained sensitive roots by counting identifier names per file. A computed key such as `['require']` is a string, not an identifier, so it escaped the count, and an approved occurrence could be replaced by a different one without changing any count.

Correction: Revision 6.1 stops counting and instead requires every use of a sensitive root to lie inside an **exact approved token pattern** in a named file (R2). The five approved patterns are the five uses that exist in the signer today (`globalThis.self = globalThis;`, `if (!globalThis.StellarSdk)`, `return globalThis.StellarSdk;`, `const vm = require('vm');`, `vm.runInThisContext(`). Anything else involving `globalThis` or `vm` (alias, destructuring, argument, default parameter, optional chaining, parentheses, computed key, a changed property, a second occurrence, a new file) is refused, because the root identifier then appears outside its pattern. Computed member access (R3) with a string, template, call or nested-bracket key is refused everywhere. Forbidden names and sensitive names are refused as identifiers and as string or template text after escape decoding, escapes other than `\n \t \\ \' \" \` \$` are refused, and several lexer ambiguities that could hide code from the analysis now fail closed.

Results: the eight original runtime files pass **with no source change**; 159 of 159 tests pass (0 skipped); 25 of 25 tool mutants are killed and 130 of 130 signer-source mutants are refused. Hashed inputs did not change, so B0 and the manifest are byte-identical to the Revision 6 candidate.

This remains a lexical analysis, not a parser and not a sandbox (section 5). It does not approve B0.

## 2. Safety statement

- No secret, private key, DPAPI blob or credential was loaded, requested, generated or inspected. `%LOCALAPPDATA%\TobinTestKeys` was not opened.
- No network operation was performed. The optional live Wasm check of `config-inventory.cjs` was not run.
- No transaction was built, simulated, signed or submitted. Account F was not created; `deployment-config.json` does not exist; `pinned.cjs` still holds `PINNED_CONFIG_SHA256: null`.
- Revision 5 and every signer source file are unchanged; no signer constant, ceiling, fee, allocation, token parameter or phrase changed; Part B was not implemented; the manifest header stays `v1`.
- Nothing was committed, pushed, tagged or published.

## 3. Starting state verified

- Revision 6 evidence in `../revision-6/` and the Milestone 1 evidence in `../SHA256SUMS.txt` were left untouched; their checksum files still verify (checked before and after).
- Revision 5 ZIP SHA-256 equals `01a3948e...d609` before the work, after extraction and after copying it into this package.
- The eight runtime files are byte-identical to the copies inside the Revision 5 ZIP (`cmp`, eight of eight).
- The SDK package files hash to the approved values (`ee981053...2a62`, `de18071d...b92f`).

## 4. What changed (tooling only)

Files changed or added in this task (all under `revision-6-1/`, plus the working copy in the session scratchpad `baseline-tools-r61/`):

| File | Change |
|---|---|
| compute-baseline-hash.cjs.txt | analyzer rewritten: exact-pattern rule for sensitive roots, computed-access rule, string and template text rule, escape rule, lexer hardening, `use strict` rule, approved-use counts tightened to the actual values |
| compute-baseline-hash.test.cjs.txt | 47 earlier tests kept (3 expectations adapted, see section 7) plus 112 new |
| mutation-check.cjs.txt | 10 earlier mutants kept plus 15 new tool mutants; new group of 130 signer-source mutants and a control |
| config-inventory.cjs.txt | inventory schema 3, label 6.1, includes roots and computed accesses |
| policy-report.cjs.txt, analyze-files.cjs.txt, demonstrate-bypass.cjs.txt | new, read-only |
| globalThis-access-inventory.md, sensitive-api-policy.md | new, required deliverables |
| reproduce-in-powershell.ps1.txt, parity-demo.cjs.txt | unchanged from Revision 6 (byte-identical) |

The hashed inputs (the eight runtime files, the SDK package files, the absent configuration) did not change. The analyzer and the tests are not inputs of the baseline hash.

## 5. Loading policy, as enforced

Full tables: `sensitive-api-policy.md` (every API of your audit list, with status, permitted form, reason and enforcement) and `globalThis-access-inventory.md` (every occurrence with file, line, expression, property, purpose, approval and restriction).

Rules, in short:

- **R1** `require('<literal>')` only; relative targets in the approved closure; built-ins only for the approved files.
- **R2** `globalThis` and `vm` only inside the five exact approved patterns, each at most once, only in `sdk-loader.cjs`. `process` only as `process.<approved member>`. `module` only as `module.exports` or `require.main === module`.
- **R3** computed member access only with a number, one identifier or simple arithmetic as key.
- **R4** forbidden identifiers anywhere (including `getBuiltinModule`, `createContext`, `__proto__`, `prototype`, reflective `Object` APIs, `Reflect`, `Proxy`, `eval`, `Function`, `import`); `.constructor` member access; strings and templates equal to forbidden or sensitive names.
- **R5** watched filesystem-read and code-execution names only at the reviewed counts per file; the maxima equal the actual uses (a test checks this).
- **Lexer**: CR, NUL, U+2028 and U+2029 anywhere are refused (they end lines for the engine but not for the lexer, which would let code hide in a "comment"); a `/` after `}` or after `++`/`--` is refused as ambiguous; a `/` after the `)` of `if`/`while`/`for`/`with` is read as a regex, after any other `)` as division; every file must begin with `'use strict';`.

The deliberate `vm` use in `sdk-loader.cjs` was reviewed: the loader checks package name, version and the SHA-256 of the bundle against constants and then runs **the same bytes it hashed**. Loading the path with `require` would read the file a second time after the check. The exception is kept, is not broadened, and is limited to the two exact patterns (V1, V2).

Limits, stated plainly:

1. The analysis is lexical. It does not resolve scopes or values and is not full JavaScript semantic analysis.
2. A gadget that uses none of the listed names and none of the checked syntax is not detected. The lists come from the known routes to code execution and module loading in Node.js 24.
3. Approved APIs can be used with hostile arguments (`fs.readFileSync` of any path, `execFileSync` of any program, including `node -e`). The policy controls where such calls exist, not what they receive. This is the largest residual capability and needs human review of `dpapi-key.cjs` and `state-store.cjs`.
4. The SDK bundle is executed under `vm`; its behaviour is covered by its SHA-256 pin, not by this analysis.
5. Regex versus division is exact for the cases above and refused where ambiguous; a case not foreseen could desynchronize the lexer. That normally produces a lexing error and a refusal, but it is not proven.
6. Only the eight files are analyzed; Node.js, the operating system, the PATH-resolved programs and the SDK's dependencies are outside it.

## 6. Inventory of the real files

`analysis-eight-files.txt`: 8 of 8 pass, no rejected construct.

- `globalThis`: 4 tokens on 3 lines, all in `sdk-loader.cjs` (lines 24 twice, 26, 27), all approved (G1, G1, G2, G3). `vm`: 2 tokens (lines 7 and 25), approved (V1, V2). No other file has any sensitive-root use.
- Properties of `globalThis` used: `self` (write) and `StellarSdk` (read). Purpose: the SDK bundle is a UMD/browser bundle that reads `self` and defines `StellarSdk`.
- Computed member accesses: 22 token-level accesses, all with a number or a plain identifier as key (`i`, `k`, `0`, `part`, `opName`) in `authorization.cjs`, `state-store.cjs` and `tst-signer-core.cjs`; none on a sensitive root, none with a string or template key.
- Watched API uses equal the reviewed maxima: sdk-loader.cjs readFileSync 2 and runInThisContext 1; state-store.cjs readFileSync 2, execFileSync 4, exec 9, load 3, openSync 1; dpapi-key.cjs execFileSync 2; tst-signer.cjs readFileSync 1. (The Revision 6 table allowed 3 for `dpapi-key.cjs`; the actual use is 2, so the table was tightened.)
- Source changes required: **none**.

## 7. Tests

Environment: Node.js v24.14.0, Windows PowerShell 5.1.22000.2538, offline.

| | Count |
|---|---|
| Total tests | 159 |
| Passed | 159 |
| Failed | 0 |
| Skipped | 0 |
| Tests in the Revision 6 suite | 47 |
| New tests | 112 (53 bypass or related constructs, each run in two files, 106 tests; plus 6 policy and positive tests) |
| Tests removed | 0 |

Expectations changed in existing tests (none weakened; the same inputs are still refused):

1. "string-built dangerous key": the expected message is now the general `computed member access` message.
2. "dangerous name as string": the expected message now reads `text "eval" equals a forbidden or sensitive name`.
3. "comments and string text that merely mention forbidden words" and the regex/division positive sample: the sources now begin with `'use strict';` because the new rule requires it. The assertions are otherwise unchanged.

The 53 bypass constructs, each tested in `tst-signer-core.cjs` (where `globalThis` is not approved) and in `sdk-loader.cjs` (where approved patterns exist), include the three review examples and every variant requested: dot access, double-quoted and template keys, `process` computed, aliases of `globalThis`, `process`, `module` and `require`, destructuring, variable keys, optional chaining (dot and computed), parentheses, constant concatenation, template substitution, `\u` and `\x` escapes in strings and in identifiers, arguments and default parameters, `Reflect.get`, `Object.getOwnPropertyDescriptor`, prototype and constructor chains, `__proto__`, `this.constructor`, `module.parent`, `module.children`, `require.main.require`, and computed keys on ordinary objects. Further tests: an exact-pattern test with 10 edits of `sdk-loader.cjs` (every edit of property, shape or count is refused, and a duplicated pattern is refused), a new `globalThis` occurrence in each other runtime file, `vm` misuse, lexer cases (`use strict`, U+2028, NUL, ambiguous slash after `}` and `++`, escapes), and the positive tests (below).

Positive tests: the eight original files pass individually; the sensitive-root uses are exactly the six approved ones (G1 twice, G2, G3, V1, V2); every computed key in the real files is a number, an identifier or simple arithmetic; watched API uses equal the reviewed maxima; the policy output and B0 are deterministic; the SDK loader exception is limited to its two exact patterns; relative dependencies, the hash tool, the PowerShell parity and the `--verify` behaviour are covered by the retained tests.

## 8. B0 and the manifest

The analyzer, tests and documents are not hashed inputs. The eight runtime files, the two SDK files and the absent configuration did not change, so the manifest is byte-identical to the Revision 6 manifest (`diff` empty) and the baseline hash is unchanged. Label: **REVISION 6.1 CANDIDATE, NOT APPROVED.**

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

The expected value is not embedded in any hashed file; `pinned.cjs` is unchanged (`null`). One consequence for the reviewer: a security correction of the analyzer does not change the signer, so approving B0 means approving the eight signer files as they are, together with a policy check that the author wrote.

## 9. Mutation testing

`mutation-output.txt`. The mutants are my own and few; this is not comprehensive coverage.

| Group | Created | Killed | Survived |
|---|---|---|---|
| A: tool mutants (10 carried from Revision 6, 15 new: pattern coverage, computed access check, key simplicity, escapes, dangerous strings, `use strict`, U+2028 and NUL, slash after `}`, pattern repetition, process members, `.constructor`, optional-chained access, `getBuiltinModule`, `module` rule, forbidden identifiers) | 25 | 25 | 0 |
| B: signer-source mutants (15 dangerous snippets injected into each of the 8 files = 120, plus 10 edits: 8 of the approved `sdk-loader.cjs` patterns, one hidden concatenated `require` in `tst-signer.cjs`, one `globalThis` use in `pinned.cjs`) | 130 | 130 refused | 0 accepted |
| Control: harmless injected code is accepted | 1 | n/a | n/a |

Covered classes: computed `globalThis.require`, `globalThis.process`, `process.getBuiltinModule`, `vm.runInThisContext`; aliased and destructured sensitive references; `Reflect` and descriptor access; constructor and prototype access; dynamic property construction; unapproved `globalThis` properties; new sensitive calls in previously approved files.

Survivors: a first run produced two survivors (N13, removal of `getBuiltinModule` from the forbidden names; N14, removal of the `module` rule). Both were defence-in-depth overlaps: other rules already refused every tested form, so no test needed the rule on its own. Instead of accepting them, I added tests that only that rule can satisfy (`const o = { getBuiltinModule: 1 }`, `const m = module`, `module.parent`, `module.children`), reran the full mutation check on the final tool, and both are now killed. The final run shows 0 survivors.

The three PowerShell parity tests are skipped in the mutation runs of group A (`TOBIN_SKIP_PS`) because no mutant touches them; they run in the normal test run (0 skipped there).

## 10. Node and PowerShell parity

`parity-evidence.txt`: 11 cases, 11 agree (hash equal, or both refuse with exit 2), unchanged scripts. This is a single machine and a single author; it is not independent verification.

## 11. Unresolved issues and unverified assumptions

- B0 is not approved. No independent reproduction has been done; section 2 of `REPRODUCTION.md` is written so that a reviewer can recompute B0 without trusting the tool.
- The analysis is lexical (section 5). In particular, the largest remaining capability is the approved process execution in `dpapi-key.cjs` and `state-store.cjs`; the policy cannot say what program it runs.
- The analysis was designed against known Node.js 24 gadgets; a future Node.js feature could add a route not on the lists.
- `process.getBuiltinModule` exists in this Node.js version; its handling relies on the lists above, not on a runtime check.
- Tests ran on Windows PowerShell 5.1 and Node.js 24.14.0 only.
- The inventory was generated without the live Wasm check (network disabled); the 21 pass, 3 flag, 2 blocker, 2 info summary matches Revision 6.
- Still open from earlier milestones and out of scope: stale documents (F-1), unpinned code constants (F-2), shared writable directory (F-3), PATH and LOCALAPPDATA (F-4), `deployment-config.json` and F, the real DPAPI path, the protocol 30 mint footprint, independent code review.
- The manifest header was not bumped (explicit instruction).

## 12. Distinguishing the evidence

| Kind | Items |
|---|---|
| Automated test evidence (author-written) | 159 tests, 25 tool mutants, 130 source mutants, bypass demonstration, parity demonstration |
| Static source inspection (author) | `globalThis-access-inventory.md`, `sensitive-api-policy.md`, `analysis-eight-files.txt` |
| Independent reproduction | none |
| Unverified assumptions | section 11 |

## 13. Delivered files and SHA-256

| File | SHA-256 |
|---|---|
| REPRODUCTION.md | `e14b6483bc52ff79588a2dd99120be9bd972d36cdfe17fb6d8d64b78d81302fd` |
| analysis-eight-files.txt | `c8f6ef4a092a994ee45d6e37ac9a0a7681f764f4db557b2051ea904275d33bab` |
| analyze-files.cjs.txt | `1bc1ccc6f0c215cc076bf4a9dfdea1c4d830ab27db048cd06cc827d1a620cf41` |
| baseline-manifest-B0-revision-6-1.txt | `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` |
| bypass-demonstration.txt | `46f232a5e40c94810b1a20154016f2a5b9569967579d9e6ea3ff1e2b3d4178e4` |
| compute-baseline-hash.cjs.txt | `6ef7f5e8f60564b1cf3e4f10ddc52361645406f8e1977c98e981a12cf224e441` |
| compute-baseline-hash.test.cjs.txt | `d77b28937ac1df5035cf7fc3f4de9c1bbb4fecd25762d655f069dcf68d113224` |
| config-inventory.cjs.txt | `eb89b4f6b9f0b31f24f4faee827ab38f1447311e1a115e10877007fe92646a8e` |
| configuration-inventory.json | `b880ff543c67cecd779e98f3813e05c321ae8bb984dda342dddd3c8f315a6270` |
| demonstrate-bypass.cjs.txt | `1c0568c79a15210beb7c1b45faec66375c16fc62bb843ef0319c0e54303d5c49` |
| globalThis-access-inventory.md | `2ec4467feede793046e48bab16edab01607abf14ebe0744b28d22a55772f0e8a` |
| historical/compute-baseline-hash-revision-6.cjs.txt | `f62e700c3812ef5d70ddf26f3b492ee1772e13c001622ec3b43466b639da928a` |
| mutation-check.cjs.txt | `6aff01998b38f570bc48644967e5fea243ba8868dd059940a96e1e4b0dd9e74a` |
| mutation-output.txt | `e42f57326216689ce780b5f33352c61482e7f4f960afe98b3a1be22b6285c189` |
| parity-demo.cjs.txt | `1568fba25c3d39d803c2f25e9fd751546521138e02ab93f26cc8e040b8ceeee9` |
| parity-evidence.txt | `a1e74d6ae50584e28e6fe7e934888a4a16da3a7562a680950e614d4dbfbcaecd` |
| policy-report.cjs.txt | `addd62a35cb79876389e38a1d4bf137773165d26756f6a10e8a5d0e65b72e135` |
| reproduce-in-powershell.ps1.txt | `fa971c7c7555ce35c4c9aa582a1545a9acb73723e6dae798814d48b1b14b827d` |
| revision-5/tst-signer-revision-5-review.zip | `01a3948e55bccc94975d46e304f024e0c858db91560d8af91a985d561494d609` |
| runtime-sources/authorization.cjs | `ae3088b47d683f98b0c987afc086989aaf46c1e837d5c183272064e39bdef1b9` |
| runtime-sources/dpapi-key.cjs | `7acf06713e5ec9478515180333ba132060d3bb68d75b0c8002923e0c41b589de` |
| runtime-sources/pinned.cjs | `312ed3f24c83ed1f8e5e7ebc8f3501389374f3b18528698d638830cef8dff361` |
| runtime-sources/refusal.cjs | `562039b8d581894e4c9a5c79262a182bf7a603b85ce9031f39d3401607b46f3e` |
| runtime-sources/sdk-loader.cjs | `7bc1fedc451da5ea4e839ce7a25e048696548aad7fb794cfef1c0a14671817a9` |
| runtime-sources/state-store.cjs | `ae59de944e9b3c624d9f33c1c07c78f6eb0bb8c77ef81fdd781513115b5b393e` |
| runtime-sources/tst-signer-core.cjs | `207fc6b722bcad99189c030583bc0aa1b24ece7e5927c6eed084bcefaeafffc3` |
| runtime-sources/tst-signer.cjs | `5f55891425daf0f0f3480b461a9d2152affafbf1cb27e4c0d0837b86f3e93b6a` |
| sdk-package/dist/stellar-sdk.js | `de18071d1f64bf6aa1806a4eb250b3be7c1811a8e8ecdfc3c103013cf1d9b92f` |
| sdk-package/package.json | `ee981053db93fce5c81310620d8198a493aa134ecd35d3e64540296687d72a62` |
| sensitive-api-policy.md | `d22e5146e73d0d709feb61617b8b0f452b986864b07c384af14ebe22b81d6f09` |
| test-output.txt | `b9def19e49f1c6723a5f3f110d34888cf3d03095491d3dd39435ae675e7afb9d` |
| PHASE-2C-REVISION-6-1-SECURITY-REVIEW.md | in `SHA256SUMS.txt` (a file cannot contain its own hash) |

Decisions that remain with the founder or an independent reviewer: approve or reject B0; whether to bump the header to `v2`; whether the lexical policy is sufficient or a pinned parser should be introduced (I did not add one: a parser would be an unpinned dependency inside the verifier, so I stopped short of it as instructed); and separately authorizing the creation of F.
