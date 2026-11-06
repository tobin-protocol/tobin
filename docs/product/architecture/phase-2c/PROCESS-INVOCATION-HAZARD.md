# Process-invocation hazard (`powershell.exe`, `icacls`): status and remediation design

Date: 2026-11-06. Status: **BLOCKED, deliberately not changed in this pass.** It remains the first execution blocker.

## Why it was not fixed here

Every spawn site is inside a file that is part of the owner-approved B1 (`dpapi-key.cjs`, `state-store.cjs`). Any change to them changes the B1 hash. The instructions for this pass forbid changing the approved hashes or manifests, and the owner approved exactly `83f11a7f…c8733e`. The correct sequence is therefore: owner decides to change the runtime → a new candidate (B2) is computed → B2 is verified → the owner approves B2 → B1 is superseded, not edited. Doing the code change now would leave the repository with a runtime that no longer matches the baseline the owner approved. The remedy also needs a target Windows machine (below), which this pass did not have.

## The three sites (complete list; searched `scripts/` and the signer closure)

| # | File and line | Call | What is wrong |
|---|---|---|---|
| 1 | `scripts/tst-signer/signer/dpapi-key.cjs:41` | `execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command', DPAPI_SCRIPT], { env: opts.env \|\| process.env, … })` | bare name, resolved through the search path; whole environment inherited; this process decrypts the admin key |
| 2 | `scripts/tst-signer/signer/state-store.cjs:64` | `exec('powershell.exe', [… ACL_INSPECT_SCRIPT], { env: { ...env, TOBIN_ACL_PATH } })` | same, for the ACL inspection |
| 3 | `scripts/tst-signer/signer/state-store.cjs:99` | `exec('icacls', [file, '/inheritance:r', '/grant:r', '*SID:(F)'], { stdio:'ignore' })` | bare name; no `env`, no `cwd`; the result is judged by re-inspecting the ACL (good), but the program that ran is not controlled |

Positive properties that already hold: argument arrays, no shell, `windowsHide`, generic error messages, the outcome of site 3 is verified from the real ACL, and site 1 never echoes child output.

## What the hazard is

A Windows process started by bare name is found by a search that includes the application directory, the current directory (in some configurations), the system directories and every `PATH` entry. A hostile `powershell.exe` or `icacls.exe` earlier in that search, or a hostile `PATH`/`PSModulePath`/`COMSPEC`-style variable inherited into PowerShell, runs with the operator's privileges. At site 1 it would receive the DPAPI-decrypt script and could capture the decrypted admin key. The integrity gate hashes the signer's files but cannot see the environment (`PATH`, `LOCALAPPDATA`), so the gate does not mitigate this.

## Required remediation (to be done with a new baseline)

1. **One deterministic resolver**, used by all three sites: compute `systemRoot` from the Windows API result, not from an environment variable alone (`process.env.SystemRoot` accepted only if it equals the value reported by the OS and is an absolute drive-letter path); build `<systemRoot>\System32\WindowsPowerShell\v1.0\powershell.exe` and `<systemRoot>\System32\icacls.exe`; refuse if the path is not a regular file, is a symlink or reparse point, or does not lie under the resolved system root.
2. **Identity check** of the selected binary: Authenticode signature by Microsoft verified by the OS (`Get-AuthenticodeSignature` cannot be trusted before PowerShell is trusted, so use `WinVerifyTrust` through a non-PowerShell route, or compare the file's SHA-256 against a recorded per-OS-build allow-list kept in the operator's out-of-band record). This is the part that must be done on the **target machine**: the exact binary hashes depend on the Windows build and cannot be fixed from this repository.
3. **Minimal explicit environment** for the child: only `SystemRoot`, `SystemDrive`, `LOCALAPPDATA`, `USERPROFILE`, `TOBIN_ACL_PATH` where needed; no `PATH`, no `PSModulePath`, no `NODE_OPTIONS`; and `-NoProfile -NonInteractive -ExecutionPolicy Restrict` plus a fixed `cwd` under the system root.
4. **Explicit failure handling**: timeout, non-zero exit, empty or malformed output, and unexpected resolution each map to a distinct refusal that fails closed and is redacted.
5. The launcher's existing environment tripwire (`checkProcessEnvironment`, preload variables) stays; the resolver is additional.

## Tests required when it is implemented (none exist for the hazard today)

PATH poisoning (a planted `powershell.exe`/`icacls.exe` earlier on `PATH` and in the current directory must never run); missing executable; symlink/reparse-point replacement; resolver result outside the system root; malformed, empty and oversized output; timeout; non-zero exit; environment scrubbing (a canary variable must not reach the child); and injected `exec` seams staying fail-closed. They run with dummy data in an isolated temporary directory.

## What must be verified on the target machine

The Windows build number and the SHA-256 and signer of `powershell.exe` and `icacls.exe` there; that `SystemRoot` is the real system directory; that no application-compatibility shim or `PATHEXT` trick redirects them; that the operator account's `LOCALAPPDATA` is the expected profile. None of this can be established from this environment.

## Relation to the Web Console

The integration contract (rule 4) tells the backend to pass an explicit minimal environment containing `LOCALAPPDATA` and no `NODE_OPTIONS`. Until site 1–3 are fixed, that environment must also **not** contain a `PATH` an unprivileged user can influence, and the Web Console adapter must be run only by an account that cannot write to any directory searched. This is a constraint on the W0 adapter, not a change to the contract.
