# Sensitive API inventory (Revision 6.3 CANDIDATE, NOT APPROVED)

Status values: **required** = used by the eight runtime files and accepted only in the stated form; **refused** = not used and refused everywhere. "Rule" is the analyzer rule id (`A1` node type, `R1` require form, `C1/C2` capability position/alias, `K1` computed access, `X1` execution table, `E1` environment position, `N1/N2` names, `G1` free identifier, `S1` shadowing, `T1` SDK-loader pattern, `M1` module, `D1` counts, `P0` parse failure).

## Objects

| Object | Status | Accepted form (only) | Rules |
|---|---|---|---|
| `require` | required | `const x = require("<literal>");` at program level, per-file table | R1, D1 |
| `module` | required | `module.exports = { … };` top-level statement | M1 |
| `exports` | refused (bare); allowed as the property name in `module.exports` | | N1, G1 |
| `process` | required | `process.<member>` in the positions of the allowlist specification | C1, E1, K1 |
| `process.env` | required (3 reads) | see environment inventory | E1, K1 |
| `globalThis` | required (sdk-loader only) | patterns G1, G2, G3 | T1 |
| `global`, `self`, `window`, `frames` | refused (`self` only as the G1 property token) | | G1, N1, T1 |
| `vm` | required (sdk-loader only) | pattern V2 | T1, R1 |
| `Reflect`, `Proxy` | refused | | G1 |
| `eval`, `Function`, `AsyncFunction`, `GeneratorFunction` | refused | | G1, N1, S1 |
| `Object` | required | `Object.keys / entries / freeze` called | G1 |
| `JSON`, `Math`, `Number`, `Buffer`, `Array`, `Date`, `console`, `String`, `BigInt`, `Boolean`, `Symbol`, `Uint8Array`, `Set`, `Promise`, `Error`, `isFinite`, `setTimeout` | required | per the free-identifier allowlist | G1 |
| `Worker`, `WebAssembly`, `SharedArrayBuffer`, `Atomics` | refused | not on any allowlist; also blocked as names | G1, N1 |

## Built-in modules

| Module | Status | Files | Accepted members | Rules |
|---|---|---|---|---|
| `fs` | required | sdk-loader, state-store, tst-signer | `chmodSync closeSync existsSync fsyncSync openSync readFileSync renameSync statSync unlinkSync writeSync` (call position only) | R1, C1 |
| `path` | required | sdk-loader, state-store, tst-signer | `basename dirname join` | R1, C1 |
| `crypto` | required | sdk-loader, state-store, tst-signer-core | `createHash randomBytes` | R1, C1 |
| `readline` | required | tst-signer | `createInterface` | R1, C1 |
| `vm` | required | sdk-loader | `runInThisContext` inside pattern V2 only | T1 |
| `child_process` | required | dpapi-key, state-store | destructured `execFileSync` only; three table calls | R1, X1, C1 |
| `module` (createRequire), `http`, `https`, `net`, `dgram`, `dns`, `tls`, `worker_threads`, `cluster`, `inspector`, `repl`, `wasi`, `os`, `v8`, anything else | refused | | R1 |

## Process execution and module-loading APIs

| API | Status | Rules |
|---|---|---|
| `child_process.execFileSync` | required: 3 calls, exact table | X1, D1 |
| `child_process.exec / execSync / execFile / spawn / spawnSync / fork` | refused | R1 (only `execFileSync` may be destructured), N1 |
| aliases, destructured copies, computed, optional, reflective, `.call/.apply/.bind`, wrappers, callbacks, stored in objects/arrays, returned, closure-captured of any of the above | refused | C1, C2, K1, A1, X1 |
| `require.resolve`, `require.main`, `require.cache`, `module.require`, `module.constructor`, `createRequire`, `import()` | refused | R1, M1, N1, A1 |
| `process.binding`, `process.mainModule`, `process.getBuiltinModule`, `process.dlopen`, `process.chdir`, `process.kill` … | refused | C1 |
| `vm.runInNewContext / runInContext / createContext / compileFunction / Script` | refused | T1, N1 |
| `new Function`, `eval`, `setTimeout(<string>)` (string form is inert in Node, but `setTimeout` is only a call/construct target) | `eval`/`Function` refused; `setTimeout` allowed as a call only | G1 |

## Reflection and prototype APIs

See `reflection-prototype-policy.md`.

## What an "accepted" row does not mean

Accepted rows mean the construct appears in the eight files and is accepted *in that form*. It does not mean the construct is safe with every argument: `fs.*` and `path.join` take whatever path the code computes; `execFileSync` runs whatever program the operating system resolves for the bare name (see the process-execution inventory); `crypto.*` and `JSON.*` are ordinary library calls.
