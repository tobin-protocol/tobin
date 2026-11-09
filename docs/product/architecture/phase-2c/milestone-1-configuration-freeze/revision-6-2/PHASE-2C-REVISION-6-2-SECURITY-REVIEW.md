# Phase 2C, Revision 6.2: self-alias and sensitive-property correction (CANDIDATE, NOT APPROVED)

Scope: static analysis, loading-policy enforcement, regression tests and evidence packaging only. No signer file, Revision 5, 6 or 6.1 evidence was changed. No key, secret, network, signing, deployment, `deployment-config.json`, account F, Part B, commit or push. B0 is **not approved** and execution is **not enabled**.

Candidate B0: `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` (header `v1`, config `ABSENT`). Label: **REVISION 6.2 CANDIDATE - NOT APPROVED**.

## 1. Preconditions verified before any change

| Check | Result |
|---|---|
| Revision 6.1 ZIP SHA-256 | `b9062623dacfb0ed1ef978fddd6a7dc215ea8867c0b6ed1a1b1fc03eb1a6deaf` (matches) |
| Its internal `SHA256SUMS.txt` (extracted copy) | 0 failures |
| Revision 5 ZIP SHA-256 | `01a3948e55bccc94975d46e304f024e0c858db91560d8af91a985d561494d609` (matches) |
| Eight runtime files vs. the Revision 5 archive | byte-identical, all 8 |
| Revision 6.1 manifest / B0 | recorded; the 6.2 manifest is byte-identical to it |

## 2. Exact cause of the `self.process` bypass

1. Pattern G1 (`globalThis.self = globalThis;`) is approved because the SDK bundle reads `self`. After it runs, `self` is a second name for the global object.
2. Revision 6.1 policed the roots `globalThis` and `vm` by exact patterns, but treated `self` as an ordinary identifier.
3. Its `process` rule inspected only a **bare** `process` token. `process` as a **property** (`self.process`) was skipped (`isMember`).
4. Computed access with a plain identifier key was allowed (`p[k]`), and calling the result was allowed.

So `const m = self.process[k]('vm'); m[r]('1 + 1');` with `k`, `r` from `process.env` was accepted: it obtains `process.getBuiltinModule('vm')` and `runInThisContext` without either name appearing in the source. Reproduced against the real 6.1 tool: `bypass-demonstration.txt` (exact review example, alias of `self`, and `p = self.process` are ACCEPTED by 6.1; all five variants are REFUSED by 6.2; the two others are refused by 6.1 for unrelated reasons, `globalThis` outside a pattern and `Reflect`, and the report says so).

## 3. What changed in the analyzer

Only `compute-baseline-hash.cjs`, its tests and the mutation harness changed. Rules R1 to R5 unchanged.

| Rule | Change |
|---|---|
| R7 | `self`, `window`, `frames` refused everywhere (identifier, property, object key, string text); the only exception is the `self` property token inside G1 (`aliases: [2]`). `global` stays R4. |
| R8a | `process`, `require`, `module`, `globalThis`, `self`, `window`, `frames`, `global`, `vm` may not be a property of anything. |
| R8b | `require('vm')` only inside V1 (added after the first mutation run, section 7). |
| R6a | A computed member may not be called or tag a template (`x[k](..)`, `x?.[k]?.(..)`). A template continuation after `]` is not mistaken for a tagged template. |
| R6b | No computed access on a value reached from `process`. |
| tables | `'self','window','frames'` added to `DANGEROUS_STRINGS`. |

The five approved patterns G1, G2, G3, V1, V2 are unchanged and each still may occur once. No exception was broadened. No signer file needed a change: all eight pass (`analysis-eight-files.txt`: 8 pass, 0 fail, 0 rejected constructs).

## 4. How `self` and its aliases are restricted

The only `self` token accepted is the property name inside `globalThis . self = globalThis ;` in sdk-loader.cjs, once. Everything else containing the word is refused: `self.process`, `self['process']`, `const g = self`, destructuring, `x = self` default parameter, `f(self)`, `{ global: self }`, `return self`, alias chains, reassignment, array storage, `module.exports = self`, closure capture, `self?.process`, `(self).process`, a second copy of G1, and the string `'self'`. Because the identifier can appear only at one token, no alias can be created by assignment, parameter defaults, destructuring or closure.

## 5. Computed properties and environment-derived names

- A sensitive object cannot be held as a value (sections 3, 4), so a key from `process.env`, a function, a parameter or a nested expression has nothing dangerous to be applied to.
- A computed member cannot be called, so `m[r](..)` is refused whatever `m` is.
- `process.env[k]` and any computed access rooted at `process` are refused.
- Reflection (`Reflect`, `Object.getOwnPropertyDescriptor`, `getPrototypeOf`, `__proto__`, `prototype`, `.constructor`) is refused by name (R4), including with environment-derived keys (`Reflect.get(p, process.env.K)`).
- **Residual (documented, tested as accepted):** a computed READ on an ordinary parameter, `function f(p, k) { return p[k]; }`, even if `process.stdout` is passed. I could not show a module-loading route from it without a refused construct, but this is not a proof.

## 6. Test results

| Run | Result |
|---|---|
| Regression suite, final tool | `tests 298, pass 298, fail 0, skipped 0` (`test-output.txt`) |
| Composition | 159 Revision 6.1 tests unchanged (no expectation edited; one expected message still matches because `global` keeps its R4 message) + 139 new |
| New tests | 66 constructs x 2 files (132 tests) (tst-signer-core.cjs, and sdk-loader.cjs where the five patterns live), the rule-attribution test of the exact bypass, G1-still-passes, harmless computed reads, all eight files pass + B0, template-continuation, second-vm-require, the documented residual |
| Positive checks | the five patterns still pass; all eight real files pass; B0 recomputed equal; determinism, CR, BOM, UTF-8 and 6.1 protections still tested |

## 7. Mutation testing (self-authored; not independent verification)

Final run, final tool (`mutation-output.txt`):

- Group A, tool mutants: **37 total, 37 killed, 0 survived** (10 original, 15 from 6.1, 12 new N16 to N27).
- Group B, signer-source mutants: **282 total, 282 refused, 0 accepted**; a harmless control is accepted.
- Group B refusals by rule (a mutant may trigger several): R1 24, R2 process member 40, R2 root outside pattern 104, R3 43, R4 constructor 16, R4 string 58, R4 identifier 72, R6 computed call 24, R7 87, R8 66.

The **first** run (`mutation-output-first-run-one-survivor.txt`) had one survivor: appending `const v2 = require('vm');` to sdk-loader.cjs (a second vm module value under another name) was accepted. I judged it a real gap, not equivalent: the alias cannot reach `runInNewContext` etc. because those names are counted, but an extra alias of the module should not exist. Fix: R8b. Tests and mutant N27 added; both runs are kept as evidence. In the course of fixing it, one older test (`vm outside the loader`) failed because the new rule fired first with a different message; I narrowed R8b to files approved for `vm` so the old expectation holds unchanged.

## 8. Review of the `vm` exception (source inspection, `sdk-loader.cjs`)

| Property | Finding |
|---|---|
| 1. executed bytes = hashed bytes | Yes. `bundle` is read once (line 21), hashed from that buffer (line 22), compared to the constant, and `bundle.toString('utf8')` of the **same** buffer is executed (line 25). No second read. Decoding is deterministic. |
| 2. replacement between check and use | None possible by other input: it is one in-process buffer. A hostile same-process actor is out of scope. |
| 3. environment-controlled redirection | `loadSdk(packageDir = DEFAULT_PACKAGE_DIR)`; the default is `__dirname/../pk/...`. The only caller (`tst-signer.cjs:45`) passes no argument, and no environment variable is read. A redirected directory would still need package.json name/version and a bundle with the pinned SHA-256. The files live in a user-writable location; a swap is detected by the hash, not prevented. |
| 4. vm obtainable another way | Not via the eight files under the lexical rules: `require('vm')` only in V1 (R8b), no `process.getBuiltinModule` (R4/R8a), `vm` not a property (R8a), no aliases. This is a lexical argument. |
| 5. limited to exact file and expression | Yes: V1 and V2 are exact token sequences, once each, in sdk-loader.cjs; BUILTIN_USERS allows `vm` only there. |
| 6. no general VM access elsewhere | Yes, same mechanisms; tests `x.vm`, `vm.createContext`, `vm` in other files. |
| 7. existing behaviour preserved | Yes: sdk-loader.cjs is byte-identical to Revision 5. |

Not guaranteed: what the verified bundle does once executed (full process privileges, covered only by the pin), and the non-existence of a gadget outside the lexical rules.

Why the exception remains: `require(path)` would read the file a second time after the hash check, and the bundle is a UMD/browser file that expects to be evaluated as a global script. Removing it requires changing runtime behaviour, which is out of scope.

## 9. Existing process-execution calls (documented, not changed)

| Item | `dpapi-key.cjs:41-42` | `state-store.cjs:64` | `state-store.cjs:99` |
|---|---|---|---|
| Call | `execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command', DPAPI_SCRIPT])` | `exec('powershell.exe', [same flags, ACL_INSPECT_SCRIPT])` (default `exec = execFileSync`, line 62) | `exec('icacls', [file, '/inheritance:r', '/grant:r', '*<SID>:(F)'])` |
| Executable resolution | bare name, not an absolute path | bare name | bare name |
| PATH influence | **yes**. Resolution is by the operating system; for a bare name on Windows Node/libuv searches the current directory and PATH (stated from knowledge of libuv; I did not test it here). A planted `powershell.exe` or `icacls` earlier in the search order would run. | same | same |
| Arguments | fixed constants | fixed script; the file path is passed in environment variable `TOBIN_ACL_PATH` (not on the command line) | `file` from the caller (state-file path) and a SID parsed from the inspection output |
| Shell | no shell (`execFileSync`, no `shell` option) | no shell | no shell |
| Environment | whole `process.env` (or `opts.env`) is inherited; the script reads `$env:LOCALAPPDATA` to locate the key file | `{...env, TOBIN_ACL_PATH}` inherited | default (inherited) |
| Trusted absolute path | **no** | **no** | **no** |

Interaction with the loading-policy issue: the policy can say where such calls exist but not what program a bare name resolves to; a planted executable or a hostile `LOCALAPPDATA`/`PATH` is a runtime-environment risk that no source analysis of these eight files covers. It is the largest remaining capability and unchanged. It needs a separate decision (absolute paths via `%SystemRoot%`, or a cleaned environment); I did not change it. `exec` is also an injectable parameter (`createStore` receives `restrict`); no production caller injects one.

## 10. Global alias inventory

See `global-alias-inventory.md`. Result: the only global-object alias is the `self` property written by G1; the signer never reads it; `global`, `window`, `frames` are unused.

## 11. B0 and manifest

No hashed input changed (eight files, absent config, SDK files). The manifest is byte-identical to Revision 6.1 and B0 is unchanged. Header stays `v1`. `pinned.cjs` still `PINNED_CONFIG_SHA256: null`. Not embedded anywhere. Node and PowerShell agree on 11/11 parity cases (same machine, same author).

## 12. Answers to the report questions

1. Cause: section 2.
2. Analyzer change: section 3.
3. `self`: section 4.
4. Computed properties through sensitive objects: sensitive objects unreachable, computed call refused, process-rooted computed refused.
5. Environment-derived names: section 5.
6. Reflective and prototype access: refused by name and by `.constructor` rule; not a data-flow proof.
7. VM exception: section 8.
8. Eight original files: pass unchanged, byte-identical to Revision 5.
9. Regression tests: 298 of 298.
10. Mutation: first run found one real gap (second `require('vm')`), fixed; final 37/37 and 282/282.
11. B0 changed: no.
12. Unverified: section 13.
13. Independent reproduction: possible (`REPRODUCTION.md`), **not yet done**.

## 13. Not verified / limits

- The policy is a lexical approximation. It is not a parser, not a sandbox, and the list of dangerous names is built from known routes in Node 24.
- Mutants and tests are by the same author as the tool: not independent security verification.
- The accepted residual in section 5, the unrestricted SDK bundle once verified, and the PATH-dependent executables in section 9 remain.
- Node/PowerShell agreement does not establish independence. No independent reproduction, no pinned parser, no review of Windows `CreateProcess` search order on a test machine.
- Configuration inventory: 21 pass, 3 flag, 2 blocker, 2 info (blockers/flags pre-existing items; C-23 live check not run, network off).

## 14. Decisions remaining with the founder

Approve or reject B0 after independent review; whether to bump the header to `v2` (not done); whether to accept the lexical policy or introduce a pinned parser; whether to schedule the absolute-path / clean-environment hardening of the executables; separately, account F and `deployment-config.json`.
