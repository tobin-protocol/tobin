# TST signer: test safety review and execution report (Phase 2C)

All outputs referenced here are in this folder. Every result is author-written and author-run; none is independent verification.

## 1. Safety review done before anything was run

Every test file and helper was read (or grepped for file, environment, network and child-process use) before execution.

| File | Tests | What it touches | Verdict |
|---|---|---|---|
| `authorization.test.cjs`, `expiry.test.cjs`, `hardening.test.cjs`, `submission.test.cjs`, `tst-signer.test.cjs` + `helpers.cjs` | 122 | in-memory fakes (fake RPC, in-memory file system, throwaway keypairs generated at run time); `authorization` reads one committed fixture read-only; the SDK bundle is loaded in-process | safe; no real key, state, network or environment use |
| `dpapi-cleanup.test.cjs` | 7 | starts `powershell.exe` with a fixed script and a **dummy** SecureString; creates no files | safe after review; process start is by bare name through `PATH` (the known hazard) |
| `windows.test.cjs` | 14 (13 original + 1 added) | `powershell.exe`, `icacls`, `attrib` on files it creates under `os.tmpdir()`; a dummy DPAPI blob under a redirected `LOCALAPPDATA`; the CLI as a child process from a temporary copy (now through the launcher) | safe **only** with `TEMP`/`TMP`/`LOCALAPPDATA` redirected: every path is a fresh `mkdtemp` folder; ACL changes (including granting Everyone read) apply only to disposable files in it; no real key, no real key folder, no network (the refusal paths end before any RPC client exists) |
| `baseline.test.cjs` (new) | 57 | temporary copies of the signer files; launcher child processes with **canary** application modules that only append a line to a marker file | safe; the real application is never run |
| `restore-sdk.test.cjs` (new), `verify-signer-baseline.test.cjs` (new) | 13, 38 | temporary copies; the SDK is unpacked, never executed | safe |

Not found in any test: network access, reading or writing `%LOCALAPPDATA%\TobinTestKeys`, a real key or seed, modification of user or production configuration, an unbounded child process (all `spawnSync`/`execFileSync` calls are bounded by short scripts and, for the CLI, a 60 s timeout).

## 2. How they were run

In a sandbox: a fresh throwaway folder with `TEMP`, `TMP` and `LOCALAPPDATA` pointed at it for the whole process tree, so even an accidental use of the default would land in the sandbox, never in the real profile.
Before and after the Windows/DPAPI runs the real key folder's metadata was compared (last-write time identical: `2026-11-03T18:02:43.5709801Z`; its contents were never listed or read). Afterwards the sandbox was empty and no `tst-cli-*` folder remained in the repository tree.

Commands (from `scripts/tst-signer/signer`, `node:test`, spec reporter): `node --test test/<files>`; from `scripts/tst-signer`: `node --test restore-sdk.test.cjs`; from `scripts/tst-signer-verify`: `node --test verify-signer-baseline.test.cjs`.

## 3. Results on the final (frozen) code

| Suite | Output file | Tests | Pass | Fail | Skipped |
|---|---|---|---|---|---|
| Existing in-memory suites | `1-pure-existing.txt` | 122 | 122 | 0 | 0 |
| Existing DPAPI cleanup | `2-dpapi-cleanup.txt` | 7 | 7 | 0 | 0 |
| Existing Windows validation (+1 added test) | `3-windows.txt` | 14 | 14 | 0 | 0 |
| **New**: gate and launcher | `4-gate-and-launcher.txt` | 57 | 57 | 0 | 0 |
| **New**: SDK restoration | `5-restore-sdk.txt` | 13 | 13 | 0 | 0 |
| **New**: external verifier | `6-external-tool.txt` | 38 | 38 | 0 | 0 |
| **Total** | | **251** | **251** | **0** | **0** |

The pre-existing tests are 122 + 7 + 13 = **142, matching the earlier author-reported figure**, now reproduced in this session on the migrated code. The one added Windows test is the stale-approval refusal.
Existing CLI tests were adapted only in how they invoke the CLI: the helper supplies the approved baseline computed for each temporary copy (as the launcher now requires), so each original assertion still tests the application's own refusal. The usage and refusal expectations were not weakened; a test that a stale approval is refused (exit 4) and that no approval is refused (exit 2) was added.

## 4. Do the tests detect a broken gate? (mutation check)

`7-gate-mutation-check-output.txt`: 31 deliberate weakenings of the gate and launcher (comparison always true, hash format unchecked, unexpected entries tolerated, files dropped from the closure, CR/BOM/UTF-8 checks removed, link checks removed, SDK identity or bundle not hashed, config not hashed, launcher exit codes wrong, application loaded before the gate,
approved hash read from the environment, proof not required/not passed/not frozen, …): **30 killed, 0 survived, 1 documented equivalent** (M19, the real-path containment check, which cannot differ from the link checks for a regular file directly inside a resolved directory; kept as defence in depth).
Script: `../tst-signer-b1/gate-mutation-check.cjs.txt`.

## 5. Coverage requested and where it lives

Exact match; runtime file modification (each of 10 files); SDK modification; missing runtime file (each); missing SDK; invalid approved hash (15 forms); malformed configuration; CRLF/BOM/invalid UTF-8; missing gate; modified bootstrap (external tool detects it); attempted bypass (environment variable, file in the directory, pinned value, flag order, repeated flag);
verification before application imports and refusal before key loading and before any SDK/network code (canary modules record zero loads on mismatch); preview behaviour (unpinned stops with exit 3, creates no state); fresh-clone SDK restoration.

## 6. Limits

* Tests ran on one machine (Windows 11, Node 24.14.0). No other platform or version.
* The Windows tests use the real `powershell.exe`/`icacls` found through `PATH`; the sandbox does not remove that known hazard.
* No test exercises the real application end to end with a real configuration, key or network: none of those exists or is authorised.
* Same-author tests and mutants; mutation coverage is the 31 patches listed, not exhaustive.
