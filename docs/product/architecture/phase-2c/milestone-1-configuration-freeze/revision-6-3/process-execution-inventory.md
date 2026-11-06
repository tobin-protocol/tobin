# Process-execution inventory (Revision 6.3 CANDIDATE, NOT APPROVED)

Generated facts (`inventory-eight-files.md`, produced by the analyzer) plus author inspection of the exact calls. There are **exactly three** process-execution calls in the eight files. The analyzer accepts these three and no other: the table `APPROVED_EXEC` matches on file, enclosing function declaration, literal first argument, and a maximum count (`X1`, `D1`). The operation itself is authorised by the table, **not** because its arguments look constant.

| # | Source file : line | AST node | Imported capability | Called as | Exact method | Enclosing function |
|---|---|---|---|---|---|---|
| 1 | dpapi-key.cjs : 41 | `CallExpression` | `require('child_process')` destructured `{ execFileSync }` | `execFileSync` (the import itself) | `child_process.execFileSync` | `decryptWithDpapi` |
| 2 | state-store.cjs : 64 | `CallExpression` | same, destructured | `exec` (a parameter whose default is `execFileSync`) | `child_process.execFileSync` | `inspectAcl` |
| 3 | state-store.cjs : 99 | `CallExpression` | same, destructured | `exec` (parameter, default `execFileSync`) | `child_process.execFileSync` | `restrictOwnerOnly` |

## Argument constraints enforced by the analyzer

* the call is a direct call of the capability binding or its parameter alias (not computed, not via `.call/.apply/.bind`, not via a wrapper, not via a stored reference);
* first argument: a **string literal equal to the table entry** (`powershell.exe` or `icacls`); not a variable, not environment-derived, not a template;
* 2 or 3 arguments; the second is an array literal **without spread** and without holes;
* the third, when present, is an object literal whose keys are limited to `encoding`, `stdio`, `windowsHide`, `env` — **no `shell`, no `cwd`, no `detached`, no `uid/gid`, no spread, no computed keys**;
* no more than the table's count of such calls per function.

What the analyzer does **not** constrain (author inspection):

| # | Fixed arguments | Variable content | Reason it is required | Environment assumptions |
|---|---|---|---|---|
| 1 | `['-NoProfile','-NonInteractive','-Command', DPAPI_SCRIPT]`; options `{ encoding:'buffer', stdio:['ignore','pipe','ignore'], windowsHide:true, env: opts.env \|\| process.env }` | `DPAPI_SCRIPT` is a module constant; `opts.env` is a caller option | decrypt the DPAPI-protected admin key file as the current user, in memory, stdout captured and never logged | runs `powershell.exe` found by the OS; **whole process environment inherited** (or `opts.env`); DPAPI decrypts only in the same Windows user context; stderr discarded |
| 2 | `['-NoProfile','-NonInteractive','-Command', ACL_INSPECT_SCRIPT]`; options `{ encoding:'utf8', windowsHide:true, env:{ ...env, TOBIN_ACL_PATH: file } }` | the state-file path is passed through the `TOBIN_ACL_PATH` environment variable, not interpolated into the script | read the ACL of the state file to verify owner-only access | `powershell.exe` found by the OS; environment inherited plus one variable; output parsed as JSON |
| 3 | `[file, '/inheritance:r', '/grant:r', \`*${me}:(F)\`]`; options `{ stdio:'ignore', windowsHide:true }` | `file` (state file path), `me` (the current user SID returned by call 2) | remove inherited ACEs and grant only the current user full control on the state file | `icacls` found by the OS; **no `env` option, so the whole environment is inherited**; no `cwd` option, so the current directory of the Node process is used |

No call uses a shell (`shell` is absent, and execFile semantics apply: no shell parsing), no call passes the secret on a command line, and call 1 does not log the child's output.

## Windows executable-resolution risk (unresolved; see the hardening proposal)

All three calls name the program by **bare name** (`powershell.exe`, `icacls`). On Windows, Node's `execFileSync` without `shell` resolves a bare name through the operating-system lookup used by libuv, which, to the best of the author's knowledge of libuv's `search_path`, considers the **current working directory first and then each directory of `PATH`** (this was not executed or tested here). A planted `powershell.exe` or `icacls.exe` in the working directory or in a writable `PATH` directory ahead of `System32` would run with the signer's user rights; in call 1 it would run *at the moment the admin key is decrypted*, in the signer's own process environment. Call 3 has no `env` and `cwd` pinning, and call 1 and 2 inherit the whole environment (including `PATH`).

This is **not fixed** in Revision 6.3 (the runtime files may not be changed in this task) and is a **mandatory pre-execution blocker**. See `absolute-path-hardening-proposal.md`.
