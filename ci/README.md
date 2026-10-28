# CI notes

Workflows live in `.github/workflows/`. They are **experimental-project checks**, not a release process: nothing here publishes, tags, deploys or needs a secret, and a green run is not an audit, a licence clearance or evidence for the public-testnet claims in the README. Release controls are in [release/CHECKLIST.md](../release/CHECKLIST.md).

## What runs

| Workflow | Runs on | Checks |
|---|---|---|
| `ci.yml` | pull requests, manual | **Required:** `cargo fmt --all --check`, Rust workspace tests (`--locked`), bridge build, TypeScript typecheck, bridge-backed TypeScript tests, console build, documentation links, release-gate file validity, and an unchanged working tree afterwards. **Advisory:** clippy warning count. |
| `integration.yml` | pushes to `main`, weekly, manual; the dependency report also on pull requests that touch dependency, `ci/` or `scripts/ci/` files | Contract Wasm build with Stellar CLI 28.0.0, a second build in another directory, Rust tests against the compiled Wasm, Wasm hash report, browser journey at 1200 px and 420 px, dependency metadata **report**. |
| `release-readiness.yml` | manual only | Runs `scripts/release/check-gates.mjs --target <target>`. It fails while any gate required for the target is unresolved, which is the expected state today. It cannot publish, tag or release. |

Each result is one of: **required** (fails the job), **advisory** (reported with a warning, never blocking), or **report-only** (printed in the job summary).

## Explicit exceptions and limits

* **One allowed skipped TypeScript test**: `the known-answer intent fixture is exactly what this code generates`. Its fixtures are not in this repository (attribution review pending). The allow-list is in `ci.yml`; any other skip, any failure and any extra occurrence fails `scripts/ci/test-skip-report.mjs`. If the allowed skip stops occurring, a warning asks for the allow-list to be reviewed.
* **Wasm hashes.** `ci/wasm-hashes-recorded.txt` is the historical Windows record and is never overwritten. `ci/wasm-hashes-linux.txt` is the Linux reference; its status is `PENDING`, so the comparison is **report-only**. It may be set to `ENFORCED` only after two independent hosted Linux runs on the same commit and pinned toolchain produced identical hashes and both runs' URLs, sizes and SHA-256 values are recorded in that file. Even then the claim is scoped to the exact pinned environment, not to other operating systems or toolchains. The in-job second build only shows determinism on one runner.
* **Dependency metadata is report-only.** `ci/dependency-baseline.csv` is the recorded Stage 2N inventory. The report separates new, changed or removed entries from the known open items (18 unassessed, 2 partially assessed, 2 workspace crates without a `license` field, 31 flagged) and states that it is not a licence-compatibility or compliance finding.
* **Clippy** warnings are shown but `-D warnings` is not enforced; the existing warnings have not been cleaned up.
* `ts/test/browser/badge.mjs` is not run in CI because it writes a browser profile inside the repository.
* The browser journey relies on the Chrome preinstalled on the `ubuntu-22.04` image and does not disable the browser sandbox. Whether it starts there is not yet verified.

## Toolchains

Rust 1.96.0 (pinned in the workflows by `RUSTUP_TOOLCHAIN`; no `rust-toolchain.toml` is committed so local toolchains are not changed), Stellar CLI 28.0.0 (downloaded from the official GitHub release; SHA-256 and commit verified in the job), Node 24.14.0, Google Chrome as preinstalled on the runner image. Third-party actions are pinned to full commit SHAs; update them only by a reviewed change that re-verifies each SHA against the official repository's release tag and checks the `with:` inputs against that revision's `action.yml`.

## Formatting

The Rust sources were reformatted once with the pinned toolchain's `cargo fmt` (formatting only: whitespace, added braces and commas, a semicolon after a `return` in a `let ... else`, and reordered `use`/`mod` items). Building the contracts from a clean target directory after the change produced Wasm byte-identical to the previously recorded artifacts.

## Not yet verified

These workflows have **not been executed on GitHub-hosted runners**. Linux behaviour of the bridge, the browser journey (Chrome sandbox, `TOBIN_BROWSER`) and the Wasm build is unverified; see `release/RELEASE-GATES.json` gates `E01` to `E05`. Repository settings (required checks, fork approval) are recommendations in [release/GITHUB-SETTINGS-CHECKLIST.md](../release/GITHUB-SETTINGS-CHECKLIST.md), not verified settings.
