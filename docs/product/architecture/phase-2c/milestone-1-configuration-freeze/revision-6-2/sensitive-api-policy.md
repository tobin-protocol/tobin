# Sensitive object and API policy (Revision 6.2 candidate, NOT APPROVED)

The tables in `compute-baseline-hash.cjs` (`ROOT_PATTERNS`, `GLOBAL_ALIASES`, `SENSITIVE_MEMBER_NAMES`, `FORBIDDEN_IDS`, `DANGEROUS_STRINGS`, `PROCESS_MEMBERS`, `BUILTIN_USERS`, `APPROVED_USES`) are the authority; this document explains them. Rules R1 to R5 are unchanged from Revision 6.1 (see `../revision-6-1/sensitive-api-policy.md` in the 6.1 archive and the tool header). Revision 6.2 adds R6 to R8.

The analysis is lexical. It is not a JavaScript parser, not a scope or data-flow analysis and not a sandbox.

## Design principle (what changed in thinking)

Revision 6.1 policed *names it could see in the right place*. A name reached some other way slipped through. Revision 6.2 instead makes every sensitive object **unobtainable as a value** in the eight files:

- `globalThis` and `vm`: only inside five exact token patterns (R2, 6.1).
- `self`, `window`, `frames`, `global`: not at all, except the single property-name token of pattern G1 (R7).
- `process`, `require`, `module`, `globalThis`, `vm` as a *property* of anything: never (R8).
- `process` as a bare value: never; only `process.<approved member>` (R2).
- `require('vm')`: only inside pattern V1 (R8).

If no sensitive object can be held in a variable, passed, stored, returned, destructured, captured or reached through another object, then a property name that arrives from the environment, a function or a computed expression has nothing dangerous to be applied to. That is why the policy does not need to recognise `getBuiltinModule` or `runInThisContext` by spelling. The spelling checks remain as defence in depth.

## New rules in Revision 6.2

| Rule | Text | Why |
|---|---|---|
| R6a | A computed member (`x[k]`) must not be CALLED (`x[k](...)`, `x?.[k]?.(...)`) and must not tag a template (``x[k]`...` ``). | dynamic dispatch whose target no lexical rule can name; the exact shape of `m[r]('1 + 1')` |
| R6b | No computed access on any value reached from `process` (`process.env[k]`, `process.stdout[k]`). | environment-driven lookup through the process object |
| R7 | The names `self`, `window`, `frames` (and `global`, already R4) are refused everywhere: identifier, property, object key, string/template text. The only exception is the property-name token `self` inside pattern G1. | `self` becomes an alias of the global object after G1 runs |
| R8a | `process`, `require`, `module`, `globalThis`, `self`, `window`, `frames`, `global`, `vm` may not be a property of anything (`self.process`, `x?.require`, `o.vm`). | `self.process` passed 6.1 because only a bare `process` was checked |
| R8b | `require('vm')` is allowed only inside pattern V1. | a second `vm` module value bound to another name (found by the first 6.2 mutation run) |

## Audit list (additions and changes only)

| API or object | Status | Permitted form | Enforcement |
|---|---|---|---|
| `self` | Prohibited except the G1 property token | `globalThis.self = globalThis;` once, sdk-loader.cjs | R7 |
| `window`, `frames` | Prohibited | none | R7, R8a |
| `x.process`, `x.require`, `x.module`, `x.vm`, `x.globalThis` | Prohibited | none | R8a |
| `x[k](...)`, ``x[k]`...` ``, `x?.[k]?.()` | Prohibited | none | R6a |
| `process.<anything>[k]` | Prohibited | none | R6b |
| second `require('vm')` | Prohibited | only V1 | R8b |
| Reflective access with an environment-derived key (`Reflect.get(p, process.env.K)`, `Object.getOwnPropertyDescriptor`) | Prohibited | none | R4 (`Reflect`, `getOwnPropertyDescriptor` are forbidden identifiers) |
| `getBuiltinModule`, `runInThisContext`, `createContext` etc. | unchanged from 6.1 | unchanged | R4, R5, V2 |

## Environment-derived property names

A key read from `process.env` or returned by a function is a *value* the analyzer cannot see. It is handled by making the dangerous receiver unreachable (above) and by refusing the dynamic call (R6a). Examples refused in the regression tests: `self.process[k]('vm')`, `g.process[k]('vm')`, `p[k]('vm')`, `m[r]('1 + 1')`, `o[key()]()`, `function f(o, k) { return o[k](); }`, `Reflect.get(p, process.env.K)`.

## Limits (not hidden)

1. Lexical analysis only. A gadget that uses none of the listed names and none of the checked syntax is not detected.
2. **Documented residual, accepted on purpose:** a computed READ (not call) on an ordinary parameter or object is allowed (`function f(p, k) { return p[k]; }`), even if the object passed is `process.stdout`. It cannot reach a module loader without a refused construct (`.constructor`, a call of a computed member, a reflective API), but this is an argument, not a proof. A regression test records it.
3. Approved APIs can be misused with hostile arguments: `fs.readFileSync` of any path, `execFileSync` of any program found by the operating system. The policy controls where these calls exist, not what they run (see the executable-path review in the security review, section 9).
4. The SDK bundle (1.88 MB) runs in the main context under `vm.runInThisContext`. Its behaviour is covered by its SHA-256 pin only.
5. The regex-versus-division reading is exact for `)` and refused where ambiguous. An unforeseen ambiguity could desynchronize the lexer; the normal result is a refusal, not proven.
6. Only the eight files are analyzed. Node.js, Windows, PATH-resolved programs and the SDK's own dependencies are outside it.
