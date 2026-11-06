# Sensitive object and API policy (Revision 6.1 candidate, not approved)

This is the policy that `compute-baseline-hash.cjs` enforces on the eight runtime files. The tables in the tool (`ROOT_PATTERNS`, `FORBIDDEN_IDS`, `DANGEROUS_STRINGS`, `PROCESS_MEMBERS`, `BUILTIN_USERS`, `APPROVED_USES`) are the authority; this document explains them. Rule names R1 to R5 are defined in the header comment of the tool.

The analysis is lexical, not a JavaScript parser and not a sandbox (limits at the end).

## General principle

A sensitive root is never allowed "in general". Each use must match an exact approved token pattern in a named file, or be absent. This closes aliasing, destructuring, passing as an argument, optional chaining, parentheses and computed keys at once, because every one of them needs the root identifier to appear outside the approved pattern. Names that are only reachable through a root (for example `getBuiltinModule`) are additionally forbidden as identifiers and as string or template text.

## Audit list

| API or object | Status | Where and exact permitted form | Reason for the exception | Enforcement |
|---|---|---|---|---|
| `globalThis` | Prohibited, except 3 patterns | sdk-loader.cjs only: `globalThis.self = globalThis;` (G1), `if (!globalThis.StellarSdk)` (G2), `return globalThis.StellarSdk;` (G3), each at most once | The SDK bundle is a UMD/browser bundle that needs `self`, and defines `StellarSdk` on the global object; the loader sets one and reads the other | R2: any `globalThis` token outside an exact pattern is refused; any change of property or shape breaks the pattern; a second occurrence of a pattern is refused. R3 refuses computed access |
| `global` | Prohibited | none | not needed | R4 forbidden identifier |
| `process` | Restricted | any file: `process.<member>` with member in `env argv exit exitCode stdin stdout stderr platform cwd hrtime on once emitWarning nextTick version versions pid`. Never aliased, destructured, computed, optional or passed | environment, arguments, exit code, standard streams, platform | R2-process rule: `process` must be followed by `.` and an approved member; otherwise refused |
| `process.getBuiltinModule` | Prohibited | none | would load any built-in without `require` | not an approved member; also a forbidden identifier and forbidden string/template text |
| `process.binding`, `mainModule`, `dlopen` | Prohibited | none | native or internal module access | forbidden identifiers; not approved members |
| `require` | Restricted | `require('<literal>')` only. Relative: `./<name>` in the approved closure. Built-in: only for the files in `BUILTIN_USERS` | static, reviewable dependencies | R1: any other form (variable, concatenation, template, alias, member such as `require.main`, `.resolve`, `.cache`) is refused |
| `module` | Restricted | `module.exports` and `require.main === module` forms only | export of the file's API | refused in any other form (`module.require`, `module['x']`, `module.constructor`) |
| `exports` (bare) | Prohibited | none (`module.exports` is used) | not needed | R4 |
| `eval`, `Function`, `AsyncFunction`, `GeneratorFunction`, `new Function` | Prohibited | none | dynamic code | R4 forbidden identifiers; also forbidden as string text |
| `constructor` | Prohibited as member access | class constructor definitions only | reaching `Function` through a constructor chain | R4: `.constructor` and string `'constructor'` refused; a method definition `constructor(` is the only allowed form |
| `__proto__`, `prototype`, `getPrototypeOf`, `setPrototypeOf`, `defineProperty`, `defineProperties`, `getOwnPropertyDescriptor(s)`, `getOwnPropertyNames/Symbols`, `__define/lookup[GS]etter__`, `prepareStackTrace`, `caller`, `callee` | Prohibited | none | prototype or reflective access to reach hidden capabilities | R4 forbidden identifiers and string text |
| `Reflect`, `Proxy` | Prohibited | none | reflective access and interception | R4 |
| `WebAssembly`, `Worker`, `SharedArrayBuffer`, `importScripts` | Prohibited | none | other execution contexts | R4 |
| `vm` (module and object) | Prohibited, except 2 patterns | sdk-loader.cjs only: `const vm = require('vm');` (V1) and `vm.runInThisContext(` (V2), once each | executes the SDK bundle after name, version and SHA-256 are verified against constants. The same bytes that were hashed are executed (no second file read, so no check-then-use gap, which `require` of the path would have) | R2 pattern coverage; `vm` may be required only by sdk-loader.cjs (BUILTIN_USERS). Aliases, destructuring, `vm['runInThisContext']`, `runInNewContext`, `compileFunction`, `createContext`, `new vm.Script` are refused |
| `runInThisContext` | Restricted | one use, pattern V2 | as above | pattern V2 and the count in APPROVED_USES (1) |
| `runInNewContext`, `runInContext`, `compileFunction`, `createContext`, `Script` | Prohibited | none | other ways to run code | APPROVED_USES 0 for every file; `createContext` is also forbidden as identifier |
| Dynamic `import()`, static `import`, `export` | Prohibited | none | module loading outside the closure | R4 forbidden identifiers |
| `createRequire`, `Module`, `_load`, `_resolveFilename`, `_compile` | Prohibited | none | module-loading internals | R4 |
| Filesystem reads (`readFileSync`, `readFile`, `createReadStream`, `readSync`, `openSync`, `open`, `opendir*`, `readdir*`, `promises`) | Restricted by count | Only in the files and counts of `APPROVED_USES` (sdk-loader.cjs readFileSync 2; state-store.cjs readFileSync 2 and openSync 1; tst-signer.cjs readFileSync 1) | read the SDK package, the SDK bundle, the state file and the deployment configuration | R5 per file and count. R1 limits `require('fs')` to sdk-loader.cjs, state-store.cjs and tst-signer.cjs. A read of a source file followed by running it needs `vm`, `eval`, `Function`, `require` or `child_process`, each of which is controlled above or below |
| Child-process APIs (`execFileSync`, `exec`, `execSync`, `execFile`, `spawn`, `spawnSync`, `fork`) | Restricted by count | dpapi-key.cjs (execFileSync 2) and state-store.cjs (execFileSync 4, `exec` 9 as the injected-function name) | run `powershell.exe` and `icacls` by bare name for DPAPI decryption and ACL inspection | `require('child_process')` only in those two files; R5 counts. **Residual risk:** an approved exec call could be changed to run any program; the policy limits where such calls exist, a human must review what they run |
| `load`, `compile`, `register`, `children`, `cache` | Restricted by count | state-store.cjs `load` 3 (a local function name) | name collisions with module-loading APIs | R5 counts |
| Computed member access (`x[k]`) | Restricted | key must be a number, one plain identifier, or arithmetic over identifiers and numbers (`+` only next to a number). The files use keys `i`, `k`, `0`, `part`, `opName` | array and table lookups | R3: a string, template, call or nested-bracket key is refused; on a sensitive root it is refused by R2 anyway |
| String and template text equal to a forbidden or sensitive name | Prohibited | none | names must not be spelled as data (`'require'`, `'process'`, `'getBuiltinModule'`, ...) | DANGEROUS_STRINGS applied to every string and template chunk, after escape decoding |
| Escape sequences in strings and templates | Prohibited except `\n \t \\ \' \" \` \$` | | a name cannot be spelled with `\u` or `\x` | lexer |
| Escaped identifiers, backslash outside a literal | Prohibited | none | `eval` | lexer |
| `this` in a plain function | Not blocked, made harmless | all files must begin with `'use strict';` | in strict mode a plain call does not receive the global object | lexer-level check of the first two tokens |
| CR, NUL, U+2028, U+2029 | Prohibited anywhere | none | they end lines for the engine but not for the lexer, so code could hide in a "comment" | lexer |

## Limits (not hidden)

1. The analysis is lexical. It does not resolve scopes or values. It proves that listed roots, listed names and listed forms appear only where allowed; it does not prove that no other gadget exists.
2. A gadget that uses none of the listed names and none of the checked syntax is not detected. The list was built from the known routes to code execution and module loading in Node.js 24; new routes need new entries.
3. Approved APIs can be misused with hostile arguments: `fs.readFileSync` of any path, `execFileSync` of any program (including `node -e`). Where they appear is controlled; what they receive is a review matter.
4. The SDK bundle (1.88 MB) is executed under `vm.runInThisContext`. Its behaviour is covered by the SHA-256 pin, not by this analysis.
5. The regex-versus-division reading is exact for `)` (control heads are tracked) and refused where ambiguous (`}` and `++`/`--`). An unforeseen ambiguity could desynchronize the lexer; the result is normally a lexing error and therefore a refusal, but this is not proven.
6. Only the eight files are analyzed. Node.js itself, the operating system, the PATH-resolved programs and the SDK's own dependencies are outside it.
