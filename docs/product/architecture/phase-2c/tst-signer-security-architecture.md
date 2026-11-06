# TST signer: security architecture after Phase 2C hardening

Status: describes what was **implemented and tested** in `scripts/tst-signer/`. Nothing here approves a baseline or authorises execution. B1 is a candidate (self-verified); the deployment identity and configuration do not exist.

## 1. What is protected, and how

The signer is started only through a minimal **launcher** (`tst-signer.cjs`). Before any application module is loaded, the launcher calls the **gate** (`baseline.cjs`, Node built-ins only), which:

1. checks the process was not started with code-injection options (`--require`, `-r`, `--import`, `--loader`, `--inspect*`, `-e/-p`, or the same in `NODE_OPTIONS`) — a tripwire only (see 4.8);
2. lists the signer directory and refuses any entry that is not a closure file, `make-deployment-config.cjs`, `test/`, or `deployment-config.json`;
3. reads each of the 10 closure files once, requiring a regular file, not a symbolic link or junction, no CR, no BOM, valid UTF-8;
4. includes `deployment-config.json` when present, `ABSENT` when not; checks the SDK identity (`@stellar/stellar-sdk` 17.4.0) and hashes `package.json` and `dist/stellar-sdk.js`;
5. builds the manifest (canonical procedure v1) and compares its SHA-256, in constant time, with the **approved hash the operator passed on the command line** (exactly 64 lowercase hex characters, never read from a file, the environment, or `pinned.cjs`);
6. only on an exact match returns a frozen **proof object**; the launcher then requires the application and passes the proof. The application's entry function refuses to run without a proof the gate issued, so requiring it directly does not bypass the gate.

On any mismatch, missing or extra file, unreadable file, malformed input or unexpected exception the launcher exits non-zero (4 integrity, 2 invalid input) **before** `sdk-loader`, `tst-signer-core`, `dpapi-key`, `state-store`, `authorization`, `refusal`, `pinned` or the application are loaded. No key is read, no state touched, no RPC client created.
`preview` without an approved hash only prints the candidate baseline and stops (exit 3). `init` and `execute` without one exit 2.

An **external tool** (`scripts/tst-signer-verify/verify-signer-baseline.cjs`) is a separate implementation (it imports nothing from the signer) that takes the signer directory and the expected hash as explicit arguments, applies the same rules, and additionally checks by its own `require()` analysis that no runtime dependency is missing from the closure
(relative requires only to closure files, literal arguments, approved built-ins, no `import()`/`eval`/`Function`). It is the only thing that covers the launcher and gate files themselves.

## 2. The trust boundary and its assumptions

| Trusted | Why / what is assumed |
|---|---|
| **The operator's independently maintained record of the approved baseline hash** | kept outside the signer directory and outside any file the signer can write. The whole scheme is only as strong as this record |
| **A trusted copy of the external tool**, run before use | the in-signer gate cannot detect a modified launcher or gate: code that is already running cannot attest to itself. The operator procedure is: run the external tool from the trusted copy with the approved hash, then start the launcher with the same hash |
| The Node.js binary, the operating system, the CPU | not covered by any hash here |
| Windows DPAPI and the signer's OS account | DPAPI protects the key blob against other users and offline access; it does **not** protect against code running as the same user |
| `System32` binaries (`powershell.exe`, `icacls.exe`) | resolved by the OS lookup today (see 4.5) |

**What hashing does not do.** It does not stop an attacker who is administrator, or who can write to every trusted component at once (signer directory, the trusted copy of the tool, the hash record), or who controls the Node binary, the OS or the account that holds the DPAPI blob. It detects *change* relative to an approved state;
it does not show the approved state is safe, and it cannot detect a malicious change made before approval.

## 3. What the baseline covers

The 10 runtime files, the deployment configuration when present, and the SDK identity and bundle (see `tst-signer-b1/B1-MANIFEST-ENTRIES.md`). The mutable pieces deliberately outside it: the state file and DPAPI key file (outside the repository, owner-only ACL, validated by the application), `make-deployment-config.cjs`, `test/`, restore tooling.

## 4. Review of the attack surface

| # | Area | Status after this work | Residual |
|---|---|---|---|
| 4.1 | **Bootstrap bypass** | The application cannot load before the gate (tests with canary modules; the launcher requires the application only after `verifyApproved`; `run()` needs the gate's proof; `main` is not exported). A launcher that skips the gate, or a different gate, is **not** detectable by the gate itself | covered only by the external tool run from a trusted copy; no wrapper enforces that order yet |
| 4.2 | **Runtime dependency omission** | Closure checked three ways (launcher/gate structure test; external tool's `require()` check; PowerShell walk). No dynamic loading in the closure | the external tool's check is lexical (regular expressions), not a parser; the Revision 6.3 AST policy has not been extended to the three new files |
| 4.3 | **Mutable files outside the closure** | State and key files validated at use (state must equal the pinned config; the key must derive the configured F address; ACL owner-only). `make-deployment-config.cjs` is never loaded | an attacker who can write the state file can cause refusals (denial of service), not signing |
| 4.4 | **SDK substitution** | Bundle hash in the baseline *and* checked again by `sdk-loader.cjs`; identity checked; offline restore from the pinned tarball with every entry verified | the bundle's behaviour once running is trusted by hash only |
| 4.5 | **PATH-based executable substitution; PowerShell and `icacls` invocation** | **Not fixed.** `dpapi-key.cjs` and `state-store.cjs` start `powershell.exe` and `icacls` by bare name; the OS lookup may consider the working directory and `PATH`; the full environment is inherited; the `icacls` call has no `env`/`cwd`. The gate does not change this | **Mandatory pre-execution blocker.** A design is in `phase-2c/milestone-1-configuration-freeze/revision-6-3/absolute-path-hardening-proposal.md`. Fixing it changes the closure, so it requires a new B1 |
| 4.6 | **State-store tampering** | Atomic writes, owner-only ACL verified from the real ACL, torn or altered state refused (windows tests) | rollback by an attacker who owns the account |
| 4.7 | **Authorization and refusal bypass** | `authorization.cjs`, `refusal.cjs`, `tst-signer-core.cjs` are byte-identical to B0 and in the closure; the 142 pre-existing tests still pass | the logic is unchanged by this work, hence as reviewed before |
| 4.8 | **Windows environment manipulation** | `NODE_OPTIONS`/start-option tripwire for preload injection; `LOCALAPPDATA` redirection cannot make the signer use a different key (the key must derive F) | `PATH`, `PATHEXT`, `COMSPEC`, `TEMP`, `SystemRoot` and others are not sanitised; a preload runs before the tripwire, so the tripwire is advisory |
| 4.9 | **Path traversal** | The signer directory comes from `__dirname`; operations are a closed enumeration; no user-supplied path reaches the file system except via `LOCALAPPDATA` | – |
| 4.10 | **Symlink and junction attacks** | Refused for the signer directory, each closure entry, `test/`, the SDK directories and files; restore refuses links in the target path; tested with junctions | a swap *between* the hash and the later `require` (time-of-check/time-of-use) is possible for an attacker who can write the directory concurrently; such an attacker can equally replace the launcher |
| 4.11 | **Key loading before verification** | Structurally impossible: `dpapi-key.cjs` is not loaded until the proof exists; a wrong hash loads nothing (tests with canaries record zero loads) | – |
| 4.12 | **Network access before verification** | The SDK and the RPC client are created only inside the application | `preview` (after verification) reads from the RPC |
| 4.13 | **Inherited environment** | unchanged: children receive the full environment | see 4.5 |
| 4.14 | **Operator error** | invalid hashes, missing flags, wrong order are refused with distinct exit codes | an operator can still approve a hash for code they have not reviewed |

## 5. Residual risks, in priority order

1. **4.5 (executable resolution and inherited environment)** — blocks any execution. Not fixed here.
2. **Self-protection of the launcher and gate** — depends on an operator discipline (run the external tool from a trusted copy first). A future wrapper or a signed launcher could enforce it.
3. **B0/B1 approval** — B1 is self-verified; no independent reviewer has reproduced it; the founder has not approved it.
4. **Same-author evidence** — the code, tests, mutation checks and cross-checks were written by one author.
5. **TOCTOU** and **same-account compromise** (DPAPI) — accepted limits.
6. The deployment identity and configuration do not exist; `pinned.cjs` is `null`. Nothing can execute regardless of the gate.

## 6. Deliberate non-goals

No machine fingerprinting, clock-based expiry, or heartbeat checks were added: no demonstrated security requirement. No attempt was made to defend against an attacker with administrator rights.
