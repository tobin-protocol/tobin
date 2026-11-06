# Environment access inventory (Revision 6.3 CANDIDATE, NOT APPROVED)

All reads of the process environment in the eight runtime files (from the analyzer's own inventory, three sites):

| Source file : line | Expression | What it feeds | Constraint enforced |
|---|---|---|---|
| dpapi-key.cjs : 42 | `opts.env \|\| process.env` | the `env` option of the execution call #1 | `process.env` as the operand of `\|\|` whose parent is the `env` property of an object literal |
| state-store.cjs : 62 | `env = process.env` (parameter default of `inspectAcl`) | `{ ...env, TOBIN_ACL_PATH: file }` in call #2 | parameter default (alias creation); the parameter is then an `env`-kind capability: it may only be spread into an object literal, read as `env.NAME`, or passed as an `env` option |
| tst-signer.cjs : 21 | `process.env.LOCALAPPDATA \|\| ''` | `KEY_DIR` path | non-computed property read `process.env.NAME` |

Other `process` members used (read-only information or control): `process.platform` (state-store.cjs 86, 96), `process.argv.slice(2)` (tst-signer.cjs 40), `process.exit` (tst-signer.cjs 43, 69), `process.stdin` / `process.stdout` (tst-signer.cjs 61, handed to `readline.createInterface`).

## What the policy does with environment-derived values

* `process.env` cannot be indexed with a computed key, enumerated, aliased (outside the parameter default), passed, returned or stored. `Object.keys(process.env)`, `const pe = process.env`, `sink(process.env)`, `process.env[k]` are refused (tests, category 34).
* A string read from it is an ordinary string. It cannot choose a module (`require` needs a literal), a method (`x[k]` needs a bounded loop key), an executable (first argument must be a table literal), or an object key (computed keys refused). Names such as `TOBIN_METHOD` and `TOBIN_RUN` are therefore inert in the analyzed language. See the capability specification for the full list of sinks.

## Environment risks that remain (not solved by this policy)

* Execution calls 1 and 3 inherit the **entire** environment (call 3 has no `env` option; call 1 uses `opts.env || process.env`; call 2 spreads it). This includes `PATH` (see the executable-resolution risk) and any secrets present in the signer's environment.
* `LOCALAPPDATA` decides where the key directory and the state file live. If it is attacker-influenced, the signer reads and writes elsewhere. The analyzer cannot judge this.
* The environment variables read by the PowerShell scripts themselves are not analyzed here (`DPAPI_SCRIPT`, `ACL_INSPECT_SCRIPT` are string constants; their behaviour is out of scope of a JavaScript analysis).
