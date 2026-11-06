# Capability-origin and alias analysis (Revision 6.3 CANDIDATE, NOT APPROVED)

## Principle

Revision 6.2 policed names it could see in the right place and lost track of a capability once a member was extracted from its parent (`const run = cp[method]; run(...)`). Revision 6.3 reasons about **values and their origin**:

1. A *capability* is a value that can reach beyond pure computation: a built-in module object, a function taken from one, the `process` object, the global object, or the process environment.
2. Capabilities have only a few **sources**, each recognised by exact AST structure and binding identity.
3. Every **reference** to a capability binding must be in an explicitly allowed **position**. A capability never becomes an ordinary value: it cannot be stored, aliased, returned, passed to an unknown function, indexed, spread, destructured, or selected by a condition. So there is nothing to "lose provenance" of.
4. Where the analyzer cannot show where a value came from, the operation is **refused**, not assumed harmless.

Because capabilities cannot be held as values, a property name that arrives from the environment, from a function return or from a parameter has nothing dangerous to be applied to.

## Capability kinds and their sources

| Kind | Source (the only way to obtain it) | Permitted positions |
|---|---|---|
| `module:<name>` (fs, path, crypto, readline, vm) | `const x = require("<name>");` at program level, approved for that file | `x.<approved member>(…)` only (call position); `vm` only inside pattern V2; may be handed to a local function whose parameter is declared to receive it (see "Flows") |
| `fn:child_process.execFileSync` | `const { execFileSync } = require("child_process");` (only that key) | call position only, and only for the three table entries; may be handed to a local function whose parameter is declared to receive it |
| `process` | the free identifier `process` | `process.<approved member>` only |
| `env` | `process.env` | read `process.env.NAME`; spread; value of an `env` option; parameter default; `||` operand in those positions |
| global object | the free identifier `globalThis` | only inside patterns G1, G2, G3 |

## Alias creation: the single permitted route

An alias of a capability can be created **only as a function parameter default**, because the eight files use that for test injection (`function f(file, exec = execFileSync, env = process.env)`, `{ platform = process.platform, exec = execFileSync, fs = nodeFs } = {}`). The parameter binding then carries the same capability kind and **inherits all the rules above**. Aliasing through any other construct is refused:

| Attempt | Result |
|---|---|
| `const f = execFileSync;` | `C1` (position) and `C2` (alias outside a parameter default) |
| `let z; z = execFileSync;` | `C1` |
| `execFileSync = other;` / reassignment of an alias parameter | `C2` |
| `const { x } = nodeFs;` / `const [a] = [nodeFs];` | `C1` |
| `const h = { run: execFileSync };`, `[execFileSync]`, `{ execFileSync }` | `C1` |
| `function g() { return nodeFs; }`, `() => execFileSync` | `C1` |
| `cond ? execFileSync : x`, `a || nodeFs` | `C1` |
| `(0, execFileSync)(…)`, `execFileSync?.(…)`, `nodeFs?.x` | `A1` (node type) |
| `execFileSync.call(…)`, `.apply`, `.bind`, `execFileSync['call']` | `C1` / `K1` (a capability cannot be the object of a member access except the approved call forms) |
| closure capture of a capability inside a nested function | allowed only as the same permitted uses (a reference is a reference; it does not escape) |

## Flows into other functions (Parameters and callbacks)

A capability may be passed to a function only when:

* the callee is a **local function declaration in the same file** called by name, and
* the receiving parameter is declared as an alias of **the same capability** (it has a default that is that capability, directly or inside an object pattern), and
* for an object argument `{ platform, exec, fs }`, each property is delivered to a pattern property of the same name whose default is the same capability.

This is what lets `verifyOwnerOnly(file, { platform, exec, fs })` and `inspectAcl(file, exec)` pass. Passing a capability to an unknown function, a callback, a method call, `new`, or as a computed property is `C1`. Calling an alias parameter is subject to the execution table like the original (a function `h3(f = execFileSync) { f('calc.exe') }` is `X1`).

## Environment-derived values

* The *environment object* (`process.env`) is a capability of kind `env` (positions above). It cannot be indexed (`process.env[k]` is `K1`), enumerated (`Object.keys(process.env)` is `E1`), aliased (`E1`) or passed (`E1`).
* *Strings read from it* (`process.env.NAME`) are ordinary strings. They cannot select an API because every selecting sink is closed:
  * `require(<non-literal>)` → `R1`;
  * `x[<string>]` → `K1` unless the key origin is a bounded loop key or literal (an env string is neither);
  * a string as the first argument of an execution call → `X1` (must be a literal from the table);
  * `x[<string>]()` → `K1`;
  * `eval`, `Function`, `import()`, `Reflect.*` → `G1`/`A1`;
  * `process[<string>]`, `globalThis[<string>]` → `C1`/`T1`;
  * an object key from a string (`{[k]: 1}`) → `K1`.
* Passing an env-derived string through several functions (`a1(process.env.K)` → `b1(y)` → `nodeFs[y]`) is refused at the sink (`nodeFs[y]` is `K1`: `y` is a parameter, not a bounded key).

## What "unresolved" means here

If a name is not declared in the file and is not one of the allowed free identifiers, or a computed key is not one of the bounded origins, or a capability appears in a position that is not in the lists, the result is a violation. There is no "unknown, therefore probably fine" branch.

## Known residuals (not hidden)

1. **Injection by callers.** A parameter like `exec = execFileSync` or `fs = nodeFs` can be *replaced* by a caller in another file. The analysis covers the eight files only. In the eight files the only caller of `createStore` passes no options, and no file calls `inspectAcl`, `verifyOwnerOnly`, `restrictOwnerOnly`, `loadAdminKey`, or `decryptWithDpapi` with a substitute; but a future caller or test could. This is the intended test seam and it is outside what a per-file analysis can prove.
2. **The explicit computed read** `cfg.resourceLimits[opName]` (`tst-signer-core.cjs`, once, matched by exact source text). `opName` is a parameter whose value ultimately comes from the command line. The object is the pinned configuration table; the result is only read by `Object.keys` and arithmetic comparison. If `opName` were `"constructor"`, the value would be a function and `Object.keys(fn)` is `[]`. This is argued, not proven, and it is the one place a runtime-chosen key is accepted.
3. **Arguments are not constrained for the approved module members.** `fs.readFileSync(p)`, `fs.openSync`, `fs.writeSync`, `fs.renameSync`, `fs.chmodSync`, `fs.unlinkSync`, `path.join`, `crypto.*` accept whatever path/arguments the code computes. The policy controls where the calls exist, not what they touch. Paths derive from `process.env.LOCALAPPDATA`, `__dirname`, a pinned config and command-line arguments.
4. **The SDK bundle** runs under `vm.runInThisContext`; after that, any behaviour of the 1.88 MB bundle is covered only by its SHA-256 pin. Values returned from it (`S = loadSdk()`, then `S.Keypair`, `S.TransactionBuilder`, …) are ordinary values to the analyzer.
5. **Values returned from approved calls** (for example `JSON.parse` of a config file) are ordinary data to the analyzer.
6. **Same-file reasoning only.** The relative `require` targets are checked by the B0 closure rules and by this analysis separately; there is no cross-file data-flow.
7. **Parser agreement with V8** is assumed (see parser-identity.md).
