# Global alias inventory (Revision 6.2 candidate, NOT APPROVED)

Source: static inspection of the eight runtime files plus the analyzer tables `GLOBAL_ALIASES`, `SENSITIVE_MEMBER_NAMES`, `ROOT_PATTERNS`, `PROCESS_MEMBERS` in `compute-baseline-hash.cjs`. Runtime facts about Node.js 24 are from the author's knowledge of the platform and were not re-verified against Node's source; the author's machine runs v24.14.0.

## Which global names exist in this runtime

| Name | Exists in Node.js 24 (CommonJS) | Notes |
|---|---|---|
| `globalThis` | yes, standard | the global object |
| `global` | yes, Node-specific | same object as `globalThis` |
| `self` | **no** (not defined by Node) | becomes an alias of the global object ONLY because `sdk-loader.cjs:24` assigns `globalThis.self = globalThis`. This is the route the Revision 6.1 bypass used: after the loader runs, `self.process` is the process object |
| `window`, `frames` | no | browser names; refused anyway so a future definition cannot be used |
| `process` | yes, Node global | the process object |
| `require`, `module`, `exports`, `__filename`, `__dirname` | module-wrapper locals, not global properties | `require` and `module` are reachable only as the bare identifiers the wrapper provides |

## Inventory

| Alias | Source (how obtained) | File where it occurs | Sensitive capabilities | Allowed usage | Restrictions (how enforced) | Test coverage (compute-baseline-hash.test.cjs) |
|---|---|---|---|---|---|---|
| `globalThis` | built-in global | sdk-loader.cjs lines 24 (twice), 26, 27 | every global: `process` (env, `getBuiltinModule`, `binding`), `require`-like routes via `process`, `eval`, `Function`, any property the SDK bundle defines | the 3 exact token patterns G1, G2, G3, once each, in sdk-loader.cjs only | R2: every token must lie inside an exact pattern; repeats refused; computed/optional/aliased/destructured use fails because the token then lies outside a pattern | 6.1 BYPASS table (53 constructs x 2 files), "approved patterns are exact", 6.2 table |
| `self` | created by `globalThis.self = globalThis` (G1) | sdk-loader.cjs line 24 (the property name only) | identical to `globalThis` after G1 runs | exactly one token: the property name `self` inside G1. **Never read by the signer code** (nothing in the eight files reads `self`; the SDK bundle reads it) | R7: refused as identifier, property name, object key and string text everywhere except the single aliasing token of G1; so no alias, argument, return, destructuring, default parameter, closure capture or container can hold it | 6.2: the `self` constructs of the 6.2 table x 2 files, G1-duplicate test, N16, N20, N23, N26 mutants |
| `global` | built-in (Node) | none | same as `globalThis` | none | R4 forbidden identifier (and R8 as property name, DANGEROUS_STRINGS as text) | 6.1 "globalThis.eval-style access", 6.2 `global.process` |
| `window`, `frames` | not defined in Node | none | would be the global object if ever defined | none | R7 (identifier/key/text), R8 (property name) | 6.2 `window`, `frames` |
| `process` | built-in global | many files | `env` (secrets in environment), `getBuiltinModule`/`binding`/`mainModule`/`dlopen` (module loading, native code), `stdin/out/err`, `exit` | only `process.<member>` for member in PROCESS_MEMBERS (env argv exit exitCode stdin stdout stderr platform cwd hrtime on once emitWarning nextTick version versions pid) | R2-process: `process` must be followed by `.` and an approved member; R8: `process` may not be a property of anything (`self.process`, `x?.process`); R6: no computed access on a value reached from `process` (`process.env[k]`, `process.stdout[k]`); R4 forbids `getBuiltinModule`, `binding`, `mainModule`, `dlopen`, `constructor`, reflective APIs | 6.1 and 6.2 tables, N10, N17, N19, N25 |
| `require` | module-wrapper local | all files that load modules | loads any module or built-in | `require('<string literal>')` only; relative targets in the approved closure; built-ins only for the files in BUILTIN_USERS | R1; R8 forbids it as a property (`x.require`); no alias, no `require.main.require` | 6.1 table, 6.2 `x.require`, "second vm require" |
| `module` | module-wrapper local | all files | `module.require`, `module.constructor._load`, parent/children | `module.exports` and `require.main === module` only | `module used other than` rule; R8 forbids it as a property | 6.1 table, N14 |
| `exports` (bare) | module-wrapper local | none | n/a | none (`module.exports` is used) | R4 | 6.1 |
| `vm` (module value) | `require('vm')` | sdk-loader.cjs lines 7, 25 | `runInThisContext`, `runInNewContext`, `compileFunction`, `createContext`: arbitrary code execution | the 2 patterns V1, V2 once each, sdk-loader.cjs only | R2 patterns; BUILTIN_USERS allows `vm` only for sdk-loader.cjs; R8 forbids `.vm` as a property; R4 forbids `createContext` | 6.1 vm test, 6.2 `x.vm`, `vm.createContext`, N24 |

## What the Revision 6.1 bypass actually used

`globalThis.self = globalThis` (G1, approved) created a second name for the global object. 6.1 treated `self` as an ordinary identifier, and treated `process` as a harmless name whenever it appeared as a *property* (`self.process`), because its process rule only looked at a bare `process`. Computed access with a plain identifier key was allowed (`p[k]`), and calling the result was allowed. Together: `self.process[k]('vm')` with `k` read from the environment.

## Result of the inventory

No approved global or object in the eight files is an additional route: the only global-object alias is the single `self` property written by G1, and the signer code never reads it. This is a statement about the eight reviewed files under the lexical rules; it is not a sandbox guarantee.
