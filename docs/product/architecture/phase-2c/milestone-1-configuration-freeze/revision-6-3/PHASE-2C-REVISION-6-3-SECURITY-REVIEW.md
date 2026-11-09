# Phase 2C, Milestone 1: Revision 6.3 review report

**REVISION 6.3 CANDIDATE — NOT APPROVED.** B0 is not approved. The signer is not execution-ready. Execution remains disabled.

Written for: the founder, and the independent reviewer who will decide whether B0 may be approved. Evidence is in this directory; `REPRODUCTION.md` explains how to rerun it.

---

## Initial inspection (done before any change)

Full output: `output/initial-inspection.txt`.

| Check | Result |
|---|---|
| Revision 6.2 archive SHA-256 | `6692524dd77b707ea209a63ad2666a23723511e1b075fb4a6a9881a256047413` — **matches the value in the task** |
| Extracted into a fresh directory | 35 files |
| Internal `SHA256SUMS.txt` | 34 OK, 0 failed |
| Revision 5 archive inside it | SHA-256 `01a3948e55bccc94975d46e304f024e0c858db91560d8af91a985d561494d609` (unchanged) |
| The eight runtime files vs the Revision 5 archive | all eight `cmp`-identical |
| B0 manifest hash | `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` — **matches** |
| B0 recomputed with plain `sha256sum`, no project code | same manifest, byte-identical, same hash (`b0/b0-reproduction.txt`) |

No discrepancy. Nothing was substituted.

---

## A. Summary

**What changed.** The security-policy mechanism was replaced. The Revision 6.2 *lexical* analyzer (tokens, name lists, token-pattern counts) is no longer used as a policy gate. In its place is `ast-policy.cjs`: a **pinned parser (acorn 8.19.0)**, an **explicit AST node allowlist**, **scope and binding resolution**, and **capability-origin tracking**. A new entry point, `verify-baseline.cjs`, makes that analyzer the only policy gate and applies the unchanged canonical B0 procedure (v1) on top.

**Why this parser.** It was already installed on this machine (a dependency of the sibling repository's tooling), has no dependencies, is mature, and its node vocabulary is the standard ESTree one. Selecting it needed **no download and no network call** (the task forbids network calls). Details, hashes and the pin mechanism: `parser-identity.md`.

**What the policy enforces.** The accepted language is exactly what the eight runtime files use (41 node types). Every sensitive object (`require`, `process`, `globalThis`, built-in modules, `execFileSync`, the environment) can be obtained only through one exact syntactic form, and every reference to one must sit in an explicitly allowed position. A capability therefore cannot be stored, aliased, indexed, returned, passed on, spread, destructured or selected at run time, so there is no value to "lose provenance" of. Where provenance cannot be shown, the operation is refused. The `vm` and `globalThis` exception in `sdk-loader.cjs` is preserved only as eight exact whole-statement AST patterns, in order, once each, with binding identity checked: strictly narrower than Revision 6.2.

**Do the eight original runtime files pass?** **Yes, unchanged.** 8 of 8 pass; all eight are byte-identical to the Revision 5 archive; none was modified. Nothing needed an exception to make it pass beyond the explicit, documented entries listed in `ast-allowlist-specification.md` (one explicit computed read, three execution-table entries, the eight SDK-loader statements).

---

## B. The demonstrated Revision 6.2 bypass

**Exact reproduction** (also `fixtures/negative/00-exact-revision-6-2-bypass.js.txt`):

```js
'use strict';
const cp = require('child_process');
const method = process.env.TOBIN_METHOD;
const run = cp[method];
run('powershell.exe', ['-NoProfile', '-Command', '...']);
```

I ran it against the **actual Revision 6.2 tool** (`historical/tool-revision-6-2.cjs.txt`) and against Revision 6.3 in four placements (`output/bypass-demonstration.txt`):

| Placement | Revision 6.2 | Revision 6.3 |
|---|---|---|
| standalone, named `dpapi-key.cjs` | **ACCEPTED** | refused: `R1`, `C1`, `K1` |
| standalone, named `state-store.cjs` | **ACCEPTED** | refused: `R1`, `C1`, `K1` |
| appended to the real `dpapi-key.cjs` | **ACCEPTED** | refused: `D1`, `C1`, `N1`, `K1` |
| appended to the real `state-store.cjs` | **ACCEPTED** | refused: `D1`, `C1`, `N1`, `K1` |

**Why Revision 6.2 accepted it.** The 6.2 lexer had no notion of what `cp` *is*. It policed the call `x[k](…)` (rule R6a), but `cp[method]` here is a computed **read** bound to a variable, and `run(...)` is a call of a plain identifier. 6.2 had in fact written this down as an accepted residual ("a computed READ on an ordinary parameter or object is allowed", `sensitive-api-policy.md`, limit 2), arguing that no module loader was reachable. That argument missed that `child_process` is itself a capability. Once `run` held `cp[method]`, the lexer could not connect it back to the module.

**Why Revision 6.3 refuses it** (several independent reasons, on purpose):
1. `require('child_process')` bound to a whole-module identifier is not an approved form (only `{ execFileSync }` in two files) → `R1`.
2. The binding is **still tracked as a capability even though its require was refused**, so `cp[method]` is refused as computed access on a capability → `K1`. (I found while testing that the first version stopped tracking when the require form was refused; mutant T18 now guards this.)
3. A key read from the environment is not a bounded origin → `K1` even on a non-capability object.
4. `run('powershell.exe', …)` would be a process-execution call outside the three-entry table → `X1`.

**Evidence and tests.** Test `6.3 the exact Revision 6.2 bypass …` and `6.3 the same extraction on every capability that IS approved is refused for its own reason`; `verify-baseline.test.cjs` shows the bypass added to a real runtime file is refused before any hash is trusted (exit 2); the demonstration above.

---

## C. Parser and policy

* **Parser:** `acorn` **8.19.0**, CommonJS build `dist/acorn.js`, 246,643 bytes, SHA-256 `b95392d79457d0357555c5ed3e56302d074b92dff119bcf3b44179500b10e9df`; `package.json` SHA-256 `04d6fecaafb5e3d20a38fc3b64fed84bb3830a7759a8c00400ebcb87331fec00`. Registry integrity (copied from the existing lockfile entry, **not recomputed**): `sha512-oJlA3XiRm7Cyk6qFD2Jn8ak9B7jSy0qy00ADO3+8dpT0LSjFihQYv4C02LFCSYJV3Q37xYwwRy5m+IpIiUzqWw==`. Verified before every analysis; refuses to run otherwise (tested). Configuration: ECMAScript 2022, script mode. No fallback lexer: a parse error is a refusal (`P0`).
* **Accepted node types (41, including `Program`):** statements `Program ExpressionStatement BlockStatement VariableDeclaration VariableDeclarator FunctionDeclaration ReturnStatement IfStatement ForStatement ForOfStatement SwitchStatement SwitchCase TryStatement CatchClause ThrowStatement ClassDeclaration ClassBody`; expressions and patterns `FunctionExpression ArrowFunctionExpression Identifier Literal TemplateLiteral TemplateElement ArrayExpression ObjectExpression Property ArrayPattern ObjectPattern AssignmentPattern RestElement SpreadElement CallExpression NewExpression MemberExpression AssignmentExpression UpdateExpression UnaryExpression BinaryExpression LogicalExpression ConditionalExpression AwaitExpression`. Each occurs in the eight files; the census is generated in `output/inventory-eight-files.md`.
* **Refused node types:** `ImportExpression`, `ChainExpression` (optional chaining), `SequenceExpression`, `TaggedTemplateExpression`, `ThisExpression`, `Super`, `MetaProperty`, `YieldExpression` and generators, `WithStatement`, `LabeledStatement`, `While/DoWhile/ForIn`, `Break/Continue`, `ClassExpression`, `MethodDefinition`, `PropertyDefinition`, `StaticBlock`, `DebuggerStatement`, and anything else not listed. Reasons in `ast-allowlist-specification.md`.
* **Explicit exceptions (the complete list):**
  * per-file `require` table (22 requires: 9 local, 13 built-in; the built-ins are `fs`, `path`, `crypto`, `readline`, `vm`, and `child_process` destructured to `execFileSync` in two files);
  * three process-execution calls (table `APPROVED_EXEC`);
  * the eight exact SDK-loader statements (P_CONST, P_BUNDLE, P_SHA, P_CHECK, G1, V2, G2, G3);
  * one explicit computed read, `cfg.resourceLimits[opName]`, `tst-signer-core.cjs`;
  * the 22 computed reads in the eight files: 21 have a proven bounded key, 1 is the explicit exception above;
  * regular-expression literals (values; four files use them);
  * a local parameter named `exec` (the approved alias of `execFileSync`).
* **Capability-flow analysis limitations:** `capability-origin-specification.md`, "Known residuals", and `KNOWN-LIMITATIONS.md`. In short: same-file only; callers in other files may inject substitutes for `exec`/`fs`/`restrict` parameters; approved module members accept any argument; the SDK bundle is trusted only by its hash.

---

## D. Test results

| Item | Result |
|---|---|
| Policy regression tests (`ast-policy.test.cjs`) | **183 tests, 183 pass, 0 fail, 0 skipped** |
| Verification entry-point tests (`verify-baseline.test.cjs`) | **9 tests, 9 pass, 0 fail, 0 skipped** |
| Hand-written negative fixtures | 134, covering all 30 required variant categories (+ extras for process execution, the SDK-loader exception, `process` and the environment); exported in `fixtures/negative/` with an index |
| Earlier Revision 6.0 to 6.2 fixture tables, replayed **unchanged** | 26 + 53 + 66 = 145 rows, each injected into two real files = **290 checks: 288 refused, 2 accepted** (see below) |
| Harmless control fixture | accepted (also 73 harmless controls in the mutation run) |
| Positive compatibility | the eight real files pass unchanged; B0 recomputed with the AST gate: `VERIFY: MATCH` |

**The two accepted legacy rows** are one construct, `const o = {}; o['k'];`, in two files. Revision 6.2 refused every string-keyed computed access because it was lexical. A constant, non-sensitive string key on a non-capability object is exactly equivalent to `o.k`, which is accepted, so I changed the expectation **deliberately and in the open** (a named test, `DOCUMENTED DIFFERENCE`, asserts both the acceptance and that `o['constructor']` is still refused). The security intent of the row (sensitive objects must not be reachable by computed keys) is preserved by the capability rules. No other earlier test was removed or weakened. The Revision 6.2 *test file* is not rerun as such: it tests the 6.2 lexer's internals and B0 tooling; its **fixtures** are what carry the security intent, and those are replayed. The unchanged 6.2 B0 tool still reproduces B0 (`b0/node-b0-verify-output.txt`), but it still contains the lexical policy that accepts the bypass and **must not be used as a policy gate**; `verify-baseline.cjs` replaces it.

**Mutation testing** (exact set and limits below):

| Group | Description | Mutants | Refused (killed) | Controls accepted | Survived |
|---|---|---|---|---|---|
| A | rewrite each of the real capability call sites in place, 14 operators (computed literal/env member, comma sequence, optional chaining, `Reflect.get`, arrow/function wrapper, array/object storage, `.call`, `.bind`, `\|\|` duplicate, conditional, and a parenthesised-callee control) | 450 | 417 | 33 | 0 |
| B | append a sensitive reference of 23 forms for each capability name of each file (aliasing, storage, destructuring, computed reads and calls, conditionals, optional chaining, reassignment, spread, `Reflect`, `getPrototypeOf`, `.constructor`, template, typeof, callback) | 1,035 | 1,035 | 0 | 0 |
| C | introduce 42 code-loading, reflective and syntax constructs into each of the eight files (dynamic import, aliased/variable `require`, `module.require`, `createRequire`, `eval`, `Function`, constructor chains, `Reflect`, `Proxy`, `process.binding`, `getBuiltinModule`, computed `process`, `globalThis`/`self`/`global`/`window`/`frames`, `__proto__`, `prototype`, `defineProperty`, 6.1 bypass, `child_process.exec`, `spawn`, other built-ins, second `vm` require, getters, generators, `this`, `while`, tagged template, unresolved global, shadowed `process`, non-ASCII identifier, syntax error) | 336 | 336 | 0 | 0 |
| D | edit the three execution calls and the SDK-loader statements (target, shell/cwd option, spread args, defaults, second `runInThisContext`, `runInNewContext`, hash check removed/inverted, hash constant, other bundle file, pinned hash from env, return the global, explicit computed site moved, argv/stdout misuse, …) | 35 | 35 | 0 | 0 |
| E | **harmless controls**: comment mentioning sensitive words, blank lines, pure helper, bounded loop, local rename, for each file | 40 | — | 40 | 0 |
| **Total** | | **1,896** | **1,823** | **73** | **0** |

Per-mutant record (identifier, file, transformation, expected, actual, rules, status): `output/mutation-results.json`; summary `output/mutation-output.txt`. Rules tripped across refusals (a mutant may trip several): `A1=201 C1=799 C2=13 D1=10 G1=224 K1=210 M1=176 N1=358 N2=8 P0=8 R1=256 S1=8 T1=262 X1=11`.

**Mutation testing of the analyzer itself** (does the test suite notice if a rule is weakened?). This mattered more than the table above, because zero survivors on hostile inputs says nothing about whether the tests would detect a broken rule:

| Id | Weakened rule | Result | Detected by |
|---|---|---|---|
| T01 | computed callee allowed (CallExpression) | KILLED | tests(1 failing) |
| T02 | computed access on a capability allowed | KILLED | tests(1 failing) |
| T03 | computed key origin always accepted | KILLED | tests(6 failing) + mutation-suite(2 survivors) |
| T04 | capability flow into any parameter accepted | KILLED | tests(24 failing) + mutation-suite(350 survivors) |
| T05 | environment object accepted in any position | KILLED | tests(3 failing) |
| T06 | exec call table bypassed | KILLED | tests(12 failing) + mutation-suite(6 survivors) |
| T07 | shell option permitted | KILLED | tests(3 failing) + mutation-suite(4 survivors) |
| T08 | require shape not enforced | KILLED | tests(11 failing) |
| T09 | constructor not blocked | KILLED | tests(9 failing) + mutation-suite(8 survivors) |
| T10 | module binding identity inside approved patterns not checked | KILLED | tests(4 failing) |
| T11 | pattern occurrence count loosened | KILLED | tests(1 failing) |
| T12 | reserved declaration names not checked | KILLED | tests(6 failing) + mutation-suite(8 survivors) |
| T13 | optional chaining allowed | KILLED | tests(4 failing) + mutation-suite(26 survivors) |
| T14 | sequence expression allowed | KILLED | tests(1 failing) |
| T15 | unknown free identifiers accepted | KILLED | tests(4 failing) + mutation-suite(8 survivors) |
| T16 | process.argv accepted anywhere | KILLED | mutation-suite(1 survivors) |
| T17 | capability reassignment accepted | KILLED | tests(2 failing) |
| T18 | capability not bound when the require form is refused | KILLED | tests(1 failing) |
| T19 | ASCII identifier rule removed | KILLED | tests(1 failing) + mutation-suite(8 survivors) |
| T20 | dynamic import allowed | KILLED | tests(4 failing) + mutation-suite(8 survivors) |
| T21 | module usage not restricted | KILLED | tests(4 failing) + mutation-suite(120 survivors) |
| T22 | alias of a capability through a non-parameter default accepted | KILLED | tests(2 failing) |
| T31 | bundle binding identity not checked (DOCUMENTED EQUIVALENT: unreachable by construction, JavaScript scoping already forbids it) | EQUIVALENT | nothing detected it |
| T23 | parser file hash not enforced | KILLED | tests(1 failing) |
| T24 | constructor call of a computed member accepted | KILLED | tests(1 failing) |
| T25 | getter/setter properties accepted | KILLED | tests(2 failing) + mutation-suite(8 survivors) |
| T26 | string-literal blocked names accepted | KILLED | tests(3 failing) |
| T27 | globalThis allowed everywhere | KILLED | tests(5 failing) + mutation-suite(120 survivors) |
| T28 | vm allowed everywhere | KILLED | tests(1 failing) + mutation-suite(14 survivors) |
| T29 | module member allowlist ignored | KILLED | tests(4 failing) |
| T30 | explicit computed site count unchecked | KILLED | tests(1 failing) |

**tool mutants: 31; killed: 30; documented equivalent (not detectable by any test): 1; survived: 0**

First run: six analyzer mutants survived (T01, T10, T11, T22, T24, T29). I did not change their expectations. Analysis: T01 and T24 were the same check written twice (generic walk and `computedRule`), so removing one was invisible; I removed the duplicate and added direct tests. T22 was redundant with the reference-position rule; I removed the redundant check, and found that the neighbouring check (a capability aliased through a destructuring default outside a parameter) had no test at all, so I added tests and a mutant (T22). T29 exposed a real test gap (no test used an unapproved member of an approved module); tests added. T11 (exactly-once rule for the SDK-loader patterns) was hidden by the coverage rule except for a harmless duplicate statement; test added. T10 targeted the identity of `bundle`, which cannot differ from its declaration by JavaScript scoping (a duplicate declaration is a parse error), so it is an equivalent mutant (T31, kept and labelled); the neighbouring module-identity check (`fs`/`path`/`crypto`/`vm` shadowed by a parameter of `loadSdk`) was reachable and untested, so tests were added and T10 now targets it. The first-run listing is transcribed in `output/tool-mutation-output-first-run-6-survivors.txt` (copied from the console output; the original file was overwritten by the rerun).

**Limits of the mutation evidence** (also `KNOWN-LIMITATIONS.md`): it is **not exhaustive**. Group A covers only call sites of known module/execution capabilities. Group B and C are sets of constructs I chose. Mutants are textual or AST-guided around known sites, not arbitrary program rewrites. Many mutants are refused by several rules; I did not measure rule independence. All author-written.

---

## E. Runtime integrity

| File | SHA-256 |
|---|---|
| authorization.cjs | `ae3088b47d683f98b0c987afc086989aaf46c1e837d5c183272064e39bdef1b9` |
| dpapi-key.cjs | `7acf06713e5ec9478515180333ba132060d3bb68d75b0c8002923e0c41b589de` |
| pinned.cjs | `312ed3f24c83ed1f8e5e7ebc8f3501389374f3b18528698d638830cef8dff361` |
| refusal.cjs | `562039b8d581894e4c9a5c79262a182bf7a603b85ce9031f39d3401607b46f3e` |
| sdk-loader.cjs | `7bc1fedc451da5ea4e839ce7a25e048696548aad7fb794cfef1c0a14671817a9` |
| state-store.cjs | `ae59de944e9b3c624d9f33c1c07c78f6eb0bb8c77ef81fdd781513115b5b393e` |
| tst-signer-core.cjs | `207fc6b722bcad99189c030583bc0aa1b24ece7e5927c6eed084bcefaeafffc3` |
| tst-signer.cjs | `5f55891425daf0f0f3480b461a9d2152affafbf1cb27e4c0d0837b86f3e93b6a` |

Comparison with the Revision 5 archive: all eight `cmp`-identical (`output/initial-inspection.txt`). **No discrepancy.** `pinned.cjs` is unchanged and still `PINNED_CONFIG_SHA256: null`.

---

## F. B0

| Item | Value |
|---|---|
| Baseline hash | `9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7` (**unchanged**) |
| Manifest header | `TOBIN-TST-SIGNER-BASELINE v1` (**unchanged**; no format incompatibility was found, so no version change) |
| Input closure | the eight runtime files, `config:deployment-config.json` = `ABSENT`, SDK `package.json` (`ee981053…2a62`) and `dist/stellar-sdk.js` (`de18071d…9b92f`): 11 entries |
| Changes to the B0 input set | **none.** Old and new manifests are byte-identical; no entry changed, so no old/new/changed-entries table applies |
| Label | **REVISION 6.3 CANDIDATE — NOT APPROVED** |

Reproduced four ways: plain `sha256sum` shell script (no project code); the unchanged Revision 6.2 Node tool; the non-authoritative PowerShell script; `verify-baseline.cjs` with the AST gate (all `MATCH`; outputs in `b0/`). Agreement among scripts by one author is not independence.

**Important and unresolved:** the analyzer, the parser and the scripts in this package are **tooling, not B0 inputs**. Approving B0 does not pin which analyzer version judged the files. If the founder wants the analysis itself to be part of what is approved, the tool hashes (in `SHA256SUMS.txt`) would have to enter a defined approval record. I did not alter the B0 input set to do this without an instruction.

**PowerShell.** The PowerShell script is unchanged, non-authoritative, and was run only as a manifest/hash reproduction (`VERIFY: MATCH`). It does **not** apply the loading policy and I did not give it a parser. The Node analyzer is the authoritative checker.

---

## G. Outstanding risks

1. **Absolute executable paths — MANDATORY PRE-EXECUTION BLOCKER, NOT FIXED.** `dpapi-key.cjs:41`, `state-store.cjs:64`, `state-store.cjs:99` start `powershell.exe` and `icacls` by bare name. To the best of my knowledge of libuv's Windows lookup (not tested here) a planted executable in the working directory or an earlier `PATH` entry would run as the signer's user; call 1 runs at the moment the admin key is decrypted. Exact calls, arguments, the narrowly scoped design, how the paths would be established and validated, and remaining assumptions: `process-execution-inventory.md`, `absolute-path-hardening-proposal.md`. Fixing it changes the runtime files and therefore B0 (a separate revision).
2. **Environment inheritance.** Calls 1 and 3 inherit the full environment (including `PATH`); call 3 has no `env` and no `cwd` option.
3. **Parser limits.** Pinned by file hash; registry tarball integrity not recomputed (no offline copy); parser/V8 agreement assumed.
4. **Capability-flow limits.** Same-file only; parameter injection from other files is the intended test seam and cannot be bounded here; approved module members take unconstrained arguments; the single explicit runtime-keyed computed read is argued, not proven.
5. **SDK bundle behaviour.** Only its SHA-256 is pinned. The loader exception proves the executed bytes equal the hashed bytes, not what they do.
6. **Not independently verified:** everything here is author-written, author-reviewed. No external reproduction exists.
7. **Not in B0:** the analyzer itself (see F).
8. **Tool findings during development** (kept for the reviewer; all fixed): the analyzer first stopped tracking a capability when its `require` form was refused; duplicated checks hid whether weakened rules were noticed; six analyzer-mutants initially survived the tests (listed in D), which showed real test gaps (unapproved members of approved modules, non-parameter default aliases, a harmless duplicate of the hash check) that I closed with new tests.

---

## H. Safety confirmation

I confirm, for this task:

* **No real key access:** no private key, secret, credential or key file was loaded, read, generated, imported or inspected.
* **No DPAPI secret access:** no DPAPI blob or stored signer secret was touched; the PowerShell scripts in `dpapi-key.cjs` and `state-store.cjs` were not executed.
* **No signing, no transaction submission, no simulation, no deployment, no minting, no transfer.**
* **No network calls.** The parser was not downloaded. An attempt to recompute its registry integrity used `npm pack --offline`; it failed with `ENOTCACHED` ("cache mode is only-if-cached"), i.e. no request was sent.
* **No account F.** **No `deployment-config.json`.** **No Part B.** **No execution enablement.** `pinned.cjs` unchanged and `null`; no B0 pin or approval.
* **No commits, pushes or tags.** No broad process-kill command was run; the only processes started were my own test and mutation runs.
* **No modification** of the eight runtime files or of any Revision 5 / 6 / 6.1 / 6.2 evidence. All new material is in `revision-6-3/` and its ZIP. The Revision 6.2 archive was only read, hashed and extracted into a temporary directory.
* Local processes that did run: `node` (tests, analyzer, mutation, hash scripts), `sha256sum`, `unzip`, `cmp`, and one run of the existing **non-authoritative PowerShell hashing script** (`reproduce-in-powershell.ps1`) to reproduce the manifest hash. I read the lockfile entry and the installed files of `acorn` in the sibling `tobin-landing/node_modules` (read-only). I did not read the Stellar CLI keystore or `~/.config/stellar`.

---

## I. Approval status

**REVISION 6.3 CANDIDATE — NOT APPROVED.**

B0 is **not** approved and remains unapproved until independent review. The signer is **not** execution-ready. The absolute-path hardening finding is an unresolved pre-execution blocker.

### Decisions left to the founder

1. Whether to submit this candidate for independent review (and whether the reviewer should also attack the analyzer with their own fixtures).
2. Whether the analyzer and parser must become part of the approved record (currently they are not B0 inputs).
3. Whether to schedule the absolute-path hardening as a new runtime revision before any execution milestone.
4. Whether to retire the Revision 6.2 lexical policy and its B0 tool from future packages (it is retained here only as `historical/`).
5. Separately, and only with explicit authorization: account F, `deployment-config.json`, Part B, any key or network activity.
