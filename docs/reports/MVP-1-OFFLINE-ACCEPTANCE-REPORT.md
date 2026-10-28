# Tobin MVP-1: final offline acceptance report

> **Status note (added for publication, 2026-10-27).** This report records the offline acceptance state at the time it was written, before the public-testnet run of the specification's Phase E. Its statements that "The MVP is NOT complete" (section 1), that "MVP-1 is not complete" until the testnet slice has been run (section 8), and that the testnet vertical slice is "NOT RUN" (section 7) describe that earlier state. They predate the founder's completion decision of 2026-10-27, which recorded MVP-1 as complete for its experimental scope only; that decision does not imply production readiness, an independent audit, wallet or multisig compatibility, full-protocol implementation, or real-value readiness. Nothing in this offline report is itself public-testnet evidence.

> **Fixture note (added for pre-publication review).** This report cites the known-answer fixtures and tests `core/clearing/tests/fixtures/auth-vectors.json`, `core/clearing/tests/fixtures/auth-intent-v1.json` and `core/clearing/tests/authvectors.rs`. They are **not part of this repository** (attribution and redistribution review pending). The agreement of the signer with a second implementation, and the test counts that include these tests (for example 101 native tests here versus 96 in this repository), therefore cannot be reproduced from this repository. Treat those statements as unverified reports by the implementing author.

> **Identifier note (added for publication).** `DB-nn` and `EQ-nn` identify decisions and open questions recorded in internal, unpublished design records. Where this document relies on such a decision it states the resulting behaviour; the approved specification and the ABI reference are the public sources.

**Date:** 2026-10-27. **The implementing author is also the reviewer**: this is an evidence report, not an independent audit.

## 1. Summary and overall status

**Offline acceptance: PASS.** Every offline gate that could be run without installing anything, starting a network or touching credentials was run and passed, apart from one pre-existing formatting gate that fails and was deliberately not "fixed" because doing so would rewrite the approved contract sources (section 3, gate 6).

**The MVP is NOT complete.** The specification's Phase E (testnet demonstration) has not been authorized, run or evidenced, and the stronger claims below are unverified: wallet signing, real-network acceptance of the authorization entries, testnet resource limits and fees, independent audit. Offline acceptance means: the contracts, the SDK, the Console, the local signer and the fixtures behave as specified in the Soroban **test host** (native and compiled Wasm), in a real headless browser against the real contracts through the local bridge, and against one independent JavaScript SDK for the signing bytes. Local-network observations from Stage B (a disposable protocol-29 node) are reported in `MVP-1-MILESTONE-8-STAGE-B-REPORT.md` and were not re-run for this report.

## 2. Co-signer change (Option A) summary

No signer code changed: `sign_envelope` already validates the whole entry set and expected trees first, signs only entries of supplied keys, and carries other expected entries unchanged. Added `core/clearing/tests/authcosigners.rs` (4 tests; test host only): valid co-signer signature preserved and host-accepted; void, garbage, wrong-tree, wrong-network, altered-nonce, altered-expiry, empty-vector, two-signature, wrong-key, wrong-type, non-map and missing-key payloads preserved byte for byte, never signed by the tool, and rejected by the host; a far-future preserved expiration carried unchanged (the cap applies only to the tool's own entries); missing, duplicate, unexpected, intent-mismatched (even pre-signed), own-entry-already-signed, late-mismatch and unsupported-credential cases refused with the envelope byte-identical. Two seeded mutants (blank or alter preserved entries) were killed (4 of 4 tests fail each). Documented in the security review section 14 and ABI reference section 5.3 (the founder decision itself is recorded in internal, unpublished records, Update 7). Also in this run: clippy warnings in the files added during EQ-20/F2 were fixed (a type alias in the signer, `from_ref` and `into` in tests, a doc paragraph); no behavior changed.

## 3. Gates (command, result, evidence)

Environment: Windows, Rust 1.96.0, Node 24.14.0, `tsc` 5.9.3 borrowed from `tobin-landing/node_modules`, headless Chrome through the dependency-free CDP driver. All commands run offline (`CARGO_NET_OFFLINE=true`), `CARGO_INCREMENTAL=0`, `-j 2`, target directory in the session scratch area. `<T>` = that target directory, `<B>` = `<T>/debug/examples/bridge.exe`.

| # | Gate | Command (from) | Status | Evidence |
|---|---|---|---|---|
| 1 | Rust workspace tests, native | `cargo test --offline --workspace` (core) | **PASS** | 101 passed, 0 failed (includes authcosigners 4, authintents 1, authsigner 19, authvectors 5) |
| 2 | Wasm build | `stellar contract build --package tobin-test-token` and `--package tobin-clearing-v1` (core) | **PASS** | token 4,965 bytes, clearing 25,796 bytes (the sizes of the Stage B build); sha256 prefixes clearing `80bea96439b1f664`, token `ef483732039f0ca6` (recorded now as the baseline) |
| 3 | Rust workspace against the compiled Wasm | same with `TOBIN_TOKEN_WASM`, `TOBIN_CLEARING_WASM` set | **PASS** | 101 passed, 0 failed |
| 4 | TypeScript tests with the real contracts | `TOBIN_BRIDGE_EXE=<B> node --test test/*.test.ts` (ts) | **PASS** | 88 tests, 88 pass, 0 fail, 0 skipped |
| 5 | Type checking | `tsc --noEmit -p tsconfig.json` and `-p console/tsconfig.json` (ts) | **PASS** | exit 0 both |
| 6 | Rust formatting | `cargo fmt --all -- --check` (core) | **FAIL (pre-existing, not remediated)** | exit 1; 19 files differ, including the contract sources `clearing/src/lib.rs` (46 hunks) and `token/src/lib.rs` (7). The workspace has no `rustfmt.toml` and was never rustfmt-formatted. Running `cargo fmt` would rewrite the approved contract sources, which this task forbids; formatting only the new files would make the tree inconsistent. Recommendation: decide separately whether to adopt rustfmt with a separate, reviewed formatting-only change |
| 7 | Clippy | `cargo clippy --offline -p tobin-clearing-v1 --all-targets`, `-p tobin-test-token` (core) | **PASS with warnings** | exit 0, 0 errors; 5 style warnings remain, all in pre-existing files (2 in the contract `clearing/src/lib.rs` range checks, 1 doc item in `tests/catch.rs`, 2 in `tests/signed.rs`); token crate clean. The contract warnings were not touched |
| 8 | Console production build | `tsc -p console/tsconfig.json` (ts) | **PASS** | exit 0, `console/dist/console/main.js` written (3,815 bytes) |
| 9 | Browser journey, 1200 px | `TOBIN_WIDTH=1200 node test/browser/journey.mjs <dir>` (ts) | **PASS** | 128 of 128 checks, 0 FAIL lines, no horizontal overflow |
| 10 | Browser journey, 420 px | `TOBIN_WIDTH=420 ...` | **PASS** | 128 of 128 checks, 0 FAIL lines |
| 11 | Sticky badge check | `node test/browser/badge.mjs` (ts) | **PASS** | all 12 checks, both widths |
| 12 | DB-09 v2 digest fixtures regenerated from the real contracts | `node test/fixtures/generate.ts`, then `cmp` (ts) | **PASS** | 7 fixtures, byte-identical |
| 13 | Intent fixtures regenerated by the TypeScript code | `node test/fixtures/generate-intents.ts`, then `cmp` | **PASS** | deployment.TEST-ONLY, auth-intent-v1, intents-all-calls-v1 byte-identical (also asserted by `intent.test.ts`) |
| 14 | Known-answer fixture integrity | `sha256sum core/clearing/tests/fixtures/auth-vectors.json` | **PASS** | prefix `c734a62bf7aa0c891b69bf15`, same as when generated with `@stellar/stellar-base` 15.0.0; the 5 `authvectors.rs` tests pass in gate 1 |
| 15 | Protected documents | `sha256sum` of the baseline specification and the Phase A report | **PASS** | `022c57a641917c81`, `7c2b87b24366803d`. Internal check, not publicly verifiable: a separate review corpus that is not part of this repository was also checked against its own SHA-256 manifest and passed (351 of 351 files) |
| 16 | Contract, ABI and digest sources unchanged | source hashes and tests | **PASS (limited evidence)** | at the time of this report no edits were made to `clearing/src/lib.rs`, `token/src/lib.rs`, `ts/src/sdk/abi.ts` or `ts/src/digest.ts`; there is no earlier hash baseline for these files (the tree is not under Git), so the evidence is: no edits issued, Wasm sizes equal to the Stage B build, the SDK function-list/error-table test against the Rust source passes, and the digest fixtures regenerate byte-identically from the contracts. Hash prefixes recorded when this report was generated (original offline-acceptance source hashes): lib.rs `3d5973d320a2812f`, token lib.rs `ba7c32086c54de93`, abi.ts `b916e7e5dbb5d94a`, digest.ts `78c7bea2288e4acf`. Later, comment-only edits were made to `clearing/src/lib.rs` (no executable code changed); its current post-comment-edit hash prefix is `c4d994663bee5767`, while the other three prefixes are unchanged. The current source has not yet been rebuilt or checked against the Wasm artifacts. |
| 17 | Repository boundaries | `git status`, `git rev-parse` in each repository | **PASS** | section 8 |

Named regression families (all inside gates 1, 3 and 4): known-answer signing (`authvectors.rs`); intent parity with the real contracts (`authintents.rs`); digest parity (`digest.rs`, `digest.test.ts`, `interop.test.ts`); signing atomicity and input immutability (`authsigner.rs` h1 to h4, `authcosigners.rs`); replay and EQ-20 fresh-authorization policy (`authsigner.rs` g5 and g8 to g9, `sdk-unit.test.ts`, `console.test.ts`, journey step 10); settlement rollback (`catch.rs`, `settlement.rs`, `sdk.test.ts`); and the EQ-05 revision-bound approvals (`proposal.rs`, `sdk.test.ts`, journey).

## 4. Acceptance matrix: specification section 13 (and exclusions)

Evidence is the Soroban test host unless stated; "same author" means the tests were written by the implementing author.

| S§13 | Requirement | Evidence | Status |
|---|---|---|---|
| 1 | session creation and admission | `lifecycle.rs`; sdk.test; journey | PASS (host, browser) |
| 2 | non-admitted callers rejected | `lifecycle.rs`, `proposal.rs` | PASS (host) |
| 3 | zero amounts, self-payments, duplicate ids, overflow | `lifecycle.rs`, `property.rs` | PASS (host) |
| 4 | capacity limits, post-finalization mutation | `lifecycle.rs` | PASS (host) |
| 5 | deterministic netting against independent expectations | `engine.test.ts` (including 2000 generated sessions), `property.rs` | PASS (host); the oracle is same-author |
| 6 | incorrect, incomplete, duplicated, unbalanced instructions rejected | `proposal.rs` | PASS (host) |
| 7 | approval bound to the exact digest, mismatches rejected | `proposal.rs`, `sdk.test.ts` (EQ-05), journey | PASS (host, browser) |
| 8 | missing or invalid debit authorization | `settlement.rs`, `signed.rs`, `authsigner.rs`, `authcosigners.rs` (real ed25519 entries in the host) | PASS (host) |
| 9 | successful settlement with actual test-token balance changes | `settlement.rs`, `signed.rs`; Stage B B4 on a local node [reported, not re-run] | PASS (host); local-node observation reported |
| 10 | insufficient debtor balance | `settlement.rs`; Stage B B7 [reported] | PASS (host) |
| 11 | later transfer failure rolls back earlier transfers and state | `catch.rs`, `settlement.rs`; Stage B B7 [reported] | PASS (host) |
| 12 | duplicate settlement, reopening | `settlement.rs`; Stage B B9 [reported] | PASS (host) |
| 13 | cross-language digest and encoding vectors | `digest.rs`, `digest.test.ts`, `interop.test.ts`, fixtures regenerated byte-identical (gate 12) | PASS (host); Rust and TypeScript digest code is same-author |
| 14 | worst-case resources at the proposed bounds | `resources.rs` (host estimates); Stage B B10 single local-node runs [reported] | **PARTIAL**: no testnet limits or fees, single measurements, 16 instructions not run on a node |
| 15 | integration with the actual token contract | `settlement.rs`, `signed.rs` use the real custom token, native and Wasm | PASS (host) |
| property tests | conservation, determinism, net correctness | `property.rs`, `engine.test.ts` | PASS (host), same author |
| S§14 SDK / Console | typed methods, netting, digest, preparation, queries; status, nets, digest, who must approve/authorize, no "settled" from submission | `sdk*.test.ts`, `console*.test.ts`, browser journey 128 checks at two widths | PASS (local sandbox only; no wallet, no network transport) |
| S§16 exclusions | no default, abort, collateral, multi-token, carryover; no admin | contract inspection and tests; baseline specification section 16; ABI reference section 3 (functions deliberately absent) | PASS (inspection) |

## 5. Signing, authorization and policy acceptance (post-baseline founder work)

| Item | Evidence | Status |
|---|---|---|
| EQ-20: 10-ledger cap, fresh authorization after failed settlement | `authsigner.rs` g5/g8/g9, SDK guard and Console tests, journey step 10 | PASS (offline); cap not validated against any network maximum |
| F2: mandatory typed expected intent, pinned deployment record, strict verifier | `authsigner.rs`, `authvectors.rs`, `authintents.rs`, `intent.test.ts`; 17 mutants, one equivalent survivor | PASS (offline); not independently audited |
| Independent signing bytes | `authvectors.rs` against `@stellar/stellar-base` 15.0.0 | PASS (one second implementation, same-author inputs) |
| Co-signer handling (Option A) | `authcosigners.rs` | PASS (test host); cap not applied to preserved entries |
| Founder decisions recorded | internal, unpublished decision records (Updates 5, 6, 7) | recorded internally; not publicly verifiable |

## 6. Remaining risks and unverified behavior

- **No network acceptance of any signed entry through a wallet or on a public network.** The local-node run (Stage B) used a custom signer and an older interface; it was not repeated under the current intent-mandatory signer.
- Current ledger is caller-supplied (deferred by founder decision); the 10-ledger value is policy, not validated against a network maximum or practical relay latency.
- Resource and fee figures are single local-node runs; no testnet limits.
- Real wallets, multisig accounts and thresholds, non-canonical XDR, unused entries, entry order, delegated and V2 credentials: unverified.
- Pinned deployment record and the debtor's approved digest are trust anchors, not proofs.
- Storage lifetime constants are unmeasured placeholders; archival/restore untested.
- Same-author tests throughout; no independent audit; TypeScript intent builder has no mutation testing.
- Rust formatting gate fails (pre-existing, section 3 gate 6); five style clippy warnings remain in pre-existing files; no JavaScript linter is configured.
- Console accessibility and cross-browser review not done (one browser only).
- The internal design-phase documents (unpublished) remain partly outdated relative to the implementation (known drift); the ABI reference describes the implementation.

## 7. Testnet vertical slice (NOT RUN; steps and prerequisites only)

**Prerequisites (all require separate explicit authorization or decisions):**
1. Authorization for public-testnet access, deployment and test-token minting (DB-13 and the specification's Phase E: "deploy only after explicit authorization").
2. A decision on the current-ledger source (deferred by founder decision 6 of Update 6) and acceptance that 10 ledgers is workable on testnet (the cap leaves very little relay time).
3. A signing path: the stock Stellar CLI cannot sign non-source authorization entries; options are the local `authsign` tool with disposable keys (not a wallet) or a wallet pass (untested).
4. Disposable testnet accounts funded from the testnet faucet, kept outside the repositories; no personal wallets; secret scan afterwards.
5. A reviewed pinned deployment record created from the actual deployment, and a way to hold the debtor's approved digest independently.
6. Tool versions checked against the testnet protocol version of the day (the contracts require protocol 29; the local node had to be started at 29).
7. Separate approval before publishing any evidence.

**Steps:**
1. Preflight: tool versions, free disk, repository status, secret scan baseline.
2. Rebuild both Wasm files; check sizes 25,796 and 4,965 bytes and record the hashes against gate 2.
3. Create disposable accounts (minter, relayer, ≥2 debtors, ≥1 creditor); fund them.
4. Deploy the token (minter, cap, decimals, name, symbol) and the clearing contract; write and review the deployment record.
5. Mint test tokens to the debtors; create the session; join participants (joiner and creator both authorize each join); submit obligations (debtors authorize); finalize.
6. Propose the plan; collect all approvals; record each participant's approved digest.
7. Build the settlement intent from the approved digest and verified state (`settlementIntent`), never from the simulation.
8. Simulate the settlement, sign each debtor's entry with an expiration of at most 10 ledgers after the current ledger, have the relayer sign the envelope, submit, and confirm the contract reports SETTLED.
9. Verify balances, events and the stored settlement record; capture resources and fees per call.
10. Negative checks on testnet (optional, with fresh sessions): wrong signer, tampered argument, expired entry, replay of a used entry, reuse of the entries of a failed attempt after expiry.
11. Teardown: stop using the keys, delete key material, run the secret scan, record the results.
12. Evidence review before any publication.

## 8. Offline acceptance versus MVP completion

Offline acceptance is a necessary condition and is met (subject to gate 6). **MVP-1 is not complete** until step 8 above has been run and evidenced on the testnet and reviewed. Nothing in this report is wallet, testnet or production evidence, and the experimental MVP makes no claim of v0.2 conformance, audit or real-value readiness.

## 9. Repositories at the end of this run

- `tobin-clearing`: branch main, HEAD `952fac4` ("chore: establish Tobin Clearing Protocol repository"); working tree: ` M README.md` and `?? CONTRIBUTING.md` (both pre-existing, untouched).
- `tobin-landing`: branch main, HEAD `941352d`; working tree: ` M README.md` (pre-existing, untouched).
- `tobin-mvp-1/` and `m0-review/` are not in Git.
- No commits, pushes, deployments or publications were made; no network, RPC call, Docker, key, account or transaction was used; `~/.config/stellar` was not accessed; nothing was installed.
