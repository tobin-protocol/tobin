# Absolute-path hardening: finding and proposal (Revision 6.3 CANDIDATE, NOT APPROVED)

**Status: UNRESOLVED. MANDATORY PRE-EXECUTION BLOCKER. NOT FIXED.** The eight Revision 5 runtime files were not and may not be modified in this task. Nothing below is implemented.

## 1. The finding (preserved from Revision 6.2)

| Call | Program | Arguments | Options |
|---|---|---|---|
| `dpapi-key.cjs:41` | `powershell.exe` (bare name) | `-NoProfile -NonInteractive -Command <DPAPI_SCRIPT>` | `encoding:'buffer'`, `stdio:['ignore','pipe','ignore']`, `windowsHide:true`, `env: opts.env \|\| process.env` |
| `state-store.cjs:64` | `powershell.exe` (bare name) | `-NoProfile -NonInteractive -Command <ACL_INSPECT_SCRIPT>` | `encoding:'utf8'`, `windowsHide:true`, `env:{...env, TOBIN_ACL_PATH:file}` |
| `state-store.cjs:99` | `icacls` (bare name) | `<file> /inheritance:r /grant:r *<SID>:(F)` | `stdio:'ignore'`, `windowsHide:true`; no `env`, no `cwd` |

Risk: with a bare program name the executable is found by the operating system's lookup at run time (current directory first, then `PATH`, to the best of the author's knowledge of libuv's Windows `search_path`; **not tested**). A malicious `powershell.exe` or `icacls.exe` earlier in the lookup order would run as the signer's user, and call 1 would run it at the moment the admin key is decrypted. The environment (including `PATH`) is inherited by all three.

## 2. Narrowly scoped design (proposal only)

Goal: the three calls may start only the two Windows system binaries, found at one fixed, validated absolute location, with a minimal environment and a fixed working directory.

1. **Fixed absolute paths**, no lookup:
   * `powershell.exe` → `<SystemRoot>\System32\WindowsPowerShell\v1.0\powershell.exe`
   * `icacls` → `<SystemRoot>\System32\icacls.exe`
2. **How `<SystemRoot>` is established.** Do not trust a bare environment read. Accept `process.env.SystemRoot` only if, case-insensitively, it equals the literal `C:\Windows` (the supported configuration); otherwise refuse to run (fail closed) and report. If other installation roots must be supported, they are an explicit, reviewed configuration value covered by B0, not an environment read.
3. **Validation before every use** (cheap, no execution): `fs.statSync(path).isFile()`; `fs.realpathSync(path)` equals the expected path ignoring case (no reparse-point redirection); the path is under the validated `System32`; refuse otherwise. This does not prove the file is genuine.
4. **Authenticity (choose one, requires a decision):** (a) pin the SHA-256 of the two binaries for the supported Windows builds in the reviewed configuration (breaks on Windows updates, needs a maintenance procedure); or (b) an Authenticode check through a mechanism that does not itself depend on the program being checked (not available from Node built-ins; would need a separately reviewed helper); or (c) accept the System32 location and its default ACLs as the trust anchor and document that explicitly. The author recommends (c) plus (3) as the minimum, with (a) considered for production.
5. **Fixed working directory:** pass `cwd: <SystemRoot>\System32` (rule: the options allowlist in the analyzer gains exactly `cwd` and only with that constant).
6. **Minimal environment:** pass an explicit `env` containing only what each script needs (to be determined by reading the scripts: at least `SystemRoot`, `windir`, and for call 1 the user-profile variables DPAPI needs; for call 2 `TOBIN_ACL_PATH`). `PATH` set to `<SystemRoot>\System32` only, or omitted. Never `...process.env`.
7. **Analyzer change that goes with it:** the first argument must be an identifier bound by a `const` to the result of one reviewed helper (for example `systemBinary('powershell')`) rather than a string literal; the table entry changes accordingly. The helper itself is covered by an exact-shape pattern, like the SDK-loader patterns.
8. **Tests to add (offline, no secrets):** a planted `powershell.exe`/`icacls.exe` in the working directory and in an earlier `PATH` entry (a harmless marker program, in a disposable directory) must **not** be executed; wrong `SystemRoot` must refuse; non-file or reparse-point must refuse.

## 3. Remaining assumptions even after this hardening

* The files in `System32` are trusted (anyone who can modify them already owns the machine).
* The process runs as the intended user, and DPAPI protects only against other users and offline access, not against code running as the same user.
* Environment variables are still inherited by the *signer itself* (only the children get a minimal one).
* This does not address the other open items (stale documents, Part B, protocol-30 footprint).

## 4. Consequence for B0

Changing the runtime files changes B0. This is therefore a separate revision (new runtime revision, new manifest, new review) and must precede any execution milestone. **Revision 6.3 does not fix it.**
