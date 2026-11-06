# Phase 2C: completion and outstanding-approval report (TST signer hardening)

**Short answer.** The signer is preserved, hardened, testable, documented and has a defined interface for the Web Console. **The signer is not authorised or ready to execute**, and Phase 2C as a whole (actual TST operations) is **not complete**: it is blocked on items below that need the founder, a reviewer, or a code change that creates a new baseline.
**Web Console development can safely begin** against the integration contract, as long as it stays read-only/preview-only and never executes.

## Status of each deliverable

| # | Deliverable | Where | Implemented | Tested | Independently verified | Self-verified | Awaiting founder | Blocked |
|---|---|---|---|---|---|---|---|---|
| 1 | Historical archive of the 33 omitted files | `phase-2c/tst-signer-historical/` (ZIP + SHA-256 inventory + README) | yes | 33/33 hashes re-verified from a fresh extraction | no | yes | – | – |
| 2 | Offline SDK restoration | `scripts/tst-signer/restore-sdk.cjs`, `README.md` | yes | 13 tests incl. simulated fresh clone, tampering, malformed tar | no | yes | – | – |
| 3 | B0 verification | `phase-2c/tst-signer-b0-verification/` | yes (PowerShell reimplementation) | both definitions reproduced, byte-identical to preserved manifests | **no (pending)** | yes | B0 definition choice and approval | – |
| 4 | Part A external hash tool | `scripts/tst-signer-verify/` | yes | 38 tests | no | yes | – | – |
| 5 | Part B pre-import gate and launcher | `scripts/tst-signer/signer/{tst-signer,baseline,tst-signer-main}.cjs` | yes | 57 tests + 31-mutant check (30 killed, 1 equivalent) | no | yes | – | – |
| 6 | Security and integrity test suite | `signer/test/baseline.test.cjs` and the two tool suites | yes | 251/251 across all suites | no | yes | – | – |
| 7 | Test execution and safety report | `phase-2c/tst-signer-test-evidence/` | yes | – | no | yes | – | – |
| 8 | B1 manifest and hash | `phase-2c/tst-signer-b1/` | candidate computed: `83f11a7f5ca4dce244dde39f69b19442711902137b8cba8ba3beb7f446c8733e` | cross-computed 4 ways | **no (pending)** | yes | **B1 approval** | – |
| 9 | B1 verification report | `tst-signer-b1/B1-MANIFEST-ENTRIES.md` | yes | – | no | yes | – | – |
| 10 | Security architecture | `phase-2c/tst-signer-security-architecture.md` | yes | – | no | – | review | – |
| 11 | Web Console ↔ signer contract | `phase-2c/tst-signer-web-console-integration-contract.md` | yes (design) | – | no | – | design decisions listed in it | – |
| 12 | This report | – | yes | – | – | – | – | – |

## What changed in the signer

Seven of the ten runtime files are byte-identical to B0 (authorization, dpapi-key, pinned, refusal, sdk-loader, state-store, tst-signer-core). `tst-signer.cjs` is now a small launcher; its former body is `tst-signer-main.cjs` (three mechanical edits plus a proof check); `baseline.cjs` is new. `pinned.cjs` is unchanged (`PINNED_CONFIG_SHA256 = null`) and is **not** trusted as a baseline.
The scratchpad was not deleted. No commit, push, tag or staging occurred. Repository changes are confined to `scripts/tst-signer/`, `scripts/tst-signer-verify/` and `docs/product/architecture/phase-2c/` (all untracked).

## Verification status, stated plainly

* **Implemented:** everything above.
* **Tested:** 251 tests pass in a sandbox (142 pre-existing reproduced + 109 new/added); 31-mutant gate check; the repository's release-scan rules report no findings on the 31 new trackable files under `scripts/` (the scanner itself, gate G09, was not run).
* **Independently verified:** **nothing.** Every computation, test and review here is by one author.
* **Self-verified:** B0 (both definitions) and B1 reproduced by independent *code* (Node gate, separate Node tool, oracle in tests, PowerShell), same author.
* **Awaiting founder:** which baseline definition governs; approval of B1 (or a successor); the placement `scripts/tst-signer/` (alternatives `tools/…`); whether to commit.
* **Blocked:** see below.

## Blockers to any execution (none is fixed by this work)

1. **Executable resolution and inherited environment** (`powershell.exe`, `icacls` by bare name; whole environment inherited; `icacls` call has no `env`/`cwd`). Needs a code change (design in the Revision 6.3 hardening proposal) and therefore a new B1.
2. **No deployment identity (account F) and no `deployment-config.json`**; `pinned.cjs` is `null`. These are separate required inputs and were not invented.
3. **B1 not approved and not independently verified.**
4. **Launcher and gate protect themselves only through an operator procedure** (run the external tool from a trusted copy first); no enforcing wrapper exists.
5. The Revision 6.3 AST policy has not been extended to the three new files (the external tool's dependency check is lexical).

## Can Web Console development begin?

**Yes, safely**, with these conditions: build against `tst-signer-web-console-integration-contract.md`; the console exposes only readiness, preview, approval *intent* and audit; it never calls `execute`/`init`, never holds keys or the approved hash from a browser, and always goes through the launcher.
Everything it needs for readiness (`restore-sdk.cjs --verify-only`, `verify-signer-baseline.cjs`, the launcher's `baseline` command) works today and does not require F, a configuration or any key. Until the blockers are cleared, the readiness report will correctly show **BLOCKED**.

## Not done, by instruction or necessity

No signer command was run (the launcher was exercised only on paths that load no application module, and in tests with canaries). No key, DPAPI blob or secret was read; the real key folder was not listed or opened (its metadata was unchanged). No network request, signing, deployment, transaction, F or configuration creation. No release gate, `.gitignore` or global configuration was changed, and no waiver was added.
