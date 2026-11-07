# MVP-1.5 closure

**FINAL VERDICT (2026-11-07): COMPLETE WITH LIMITATIONS.** See the closure statement at the end of this document and the execution record in MVP-1.5-TESTNET-VERIFICATION.md. Everything from here down to the closure statement records the state BEFORE the owner-run stages and is kept as history: its BLOCKED verdict is SUPERSEDED.

**Earlier verdict (superseded): BLOCKED.** The Stellar-facing integration is built and verified as far as it can be without owner interaction. The settlement itself is not done: **no transaction was signed, submitted or confirmed, and no Stellar state was changed.** MVP-1.5 is not declared complete, and none of the acceptance criteria that need a real wallet signature or a real settlement is claimed. All evidence is local and same-author; no independent review.

## What was done in this execution
- **Contract and protocol audit with real Testnet reads** (read-only; no key; no submission): protocol 30, RPC 30.0.0; the three deployed contracts exist and their Wasm hashes equal the record; clearing ceilings 4 / 16 / 16; the governed token's **total supply is 1 base unit, held by the administrative multisig**; real simulations of `create_session` and of a valid `join_session` succeed; the network returns `source_account` and `address_v2` credentials. Evidence: `evidence/`, `MVP-1.5-CONTRACT-COMPATIBILITY.md`, `MVP-1.5-TESTNET-VERIFICATION.md`.
- **Dependencies** (approved): `@stellar/stellar-sdk` 17.4.0 and `@stellar/freighter-api` 6.0.1, pinned in `apps/web-console`; one added export (`./digest`) in `packages/mvp1-sdk`.
- **Adapter, comparison, attempts, RPC and wallet layers** in `apps/web-console/lib/stellar/`, migration 6 (immutable attempts, append-only events, one transaction hash per attempt step), server-guarded attempt states with evidence-gated confirmation, UI (wallet box, attempts and plan view) and the owner-run page `/wallet-check` with its API.
- **Documents:** the eleven MVP-1.5 documents, including the contract compatibility matrix and the Edge/Freighter owner validation procedure.

## Results (this execution)
| Check | Result |
|---|---|
| `node --test test/*.test.ts` (apps/web-console) | 445 tests, 437 pass, 0 fail, 8 skipped (pre-existing skips). Baseline at the start of this execution: 416 / 408 / 0 / 8 |
| New this execution | 29 tests: adapter and comparison 8, attempts 14, RPC and wallet logic 7 (the network and wallet in these are MOCKS) |
| `tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run build:console` | succeeded (a route `/wallet-check` and `/api/stellar/validation` were added; a Turbopack file-tracing warning about reading the deployment record is informational) |
| settlement journey 1200 / 420 px | 90 of 90 / 90 of 90 (includes a real-browser UNAVAILABLE wallet result) |
| authorization / clearing / backend / sessions journeys, both widths | 44 / 71 / 42 / 78 of the same, all passing |
| W0 journey | 43 of 43 |
| Release scan (web-console lib, components, app, scripts, test; mvp-1.2 to mvp-1.5 docs) | 166 files, 0 findings (full contract ids were shortened in evidence and documents to satisfy the gate) |
| Real Testnet | read-only evidence only (see the verification document) |
Defects found by testing and fixed: obligation order made the plan fingerprint input-order dependent (found by the determinism test); a signature verification used the wrong accessor for SDK 17 signature objects (found by the wallet test); the owner page had a server/client hydration mismatch (found by the real-browser journey); a journey wait matched static text.

## Why it is BLOCKED (exact, with the smallest owner action for each)
1. **Freighter validation: RESOLVED for signing (owner run, 2026-11-07, all six checks PASS, real Edge and Freighter).** Remaining: on-chain acceptance of a signed entry is untested, and the negative variants and versions are unrecorded. Original text: **Freighter validation not run.** `signAuthEntry` with an AddressV2 entry is the one wallet capability a two-party settlement cannot avoid and nothing yet shows it works. Action: run `/wallet-check` in Edge with Freighter on Testnet (`MVP-1.5-FREIGHTER-OWNER-VALIDATION.md`) and paste back the evidence block.
2. **No second participant account.** (The owner ran the validation with the administrative account GCZD5U7G...HMU5MJ itself, so a second funded account is still needed.) Provide the public key of a funded Testnet account you own in Freighter (no secret).
3. **The only spendable supply is 1 base unit in the administrative multisig**, and Tobin cannot yet verify ownership of a multisig account (a key signature proves a signer, not the account). Decision needed: a signer-set aware ownership proof, or a different arrangement; minting remains unauthorized.
4. Attempt submission and polling have only been exercised with mocks, by design, until 1 to 3 are resolved.

## Limitations
Real-extension behaviour untested; shapes of non-empty contract getters unconfirmed against a live session; classic-asset-to-token mapping unimplemented; single RPC provider; account-based independence; concurrency tested across two connections sequentially; loading and retry states and focus not asserted; Chrome (not Edge) was the automated browser.

## Git
MVP-1.2 `b473ad8`, MVP-1.3 `d8db785`, MVP-1.4 `21ab215` are unchanged. The MVP-1.5 work is **not committed**: a commit titled "stellar settlement integration" would overstate a BLOCKED milestone. It can be committed as a work-in-progress checkpoint on request. Nothing was pushed.

## Closure statement (2026-11-07): COMPLETE WITH LIMITATIONS
Achieved and independently read from the chain (RPC and Horizon): a funded second account with proven ownership; a live-audited administrative multisig; Founder + Security co-signing; signer-set-aware authorization; and a real one-unit end-to-end settlement of the governed token through the Tobin clearing contract in eight owner-run transactions (create_session, join_session, submit_obligation, finalize_obligations, propose_settlement, approve by the second account, approve by the administrative account, settle). Result: administrative account 1 to 0, second account 0 to 1, total supply unchanged at 1; exact reconciliation with the approved plan. Per-transaction hashes and ledgers: MVP-1.5-TESTNET-VERIFICATION.md and evidence/settlement-run-2026-11-07.jsonl.

Limitations (these stand and must not be dropped): same-author evidence only; one actual owner-run execution; no independent third-party security review; no fuzzing; no second wallet and no hardware wallet validation (Freighter in Edge only); fees are recorded per transaction but not broken down; the Stage 6 reconciliation uses the same author's digest implementation (DB-09 v2); the Stage 1 ownership signature scheme (SEP-53) is the owner's recollection; the 30-ledger entry validity was an owner decision for this interactive run and does not change the recorded 10-ledger policy; Testnet only; failure and unknown-outcome paths were exercised with mocks, not on the network; the versioned-release and production gates remain BLOCKED. This is NOT Mainnet-ready and NOT production-ready, and the verdict is not upgraded to strict COMPLETE.

## Final regression (2026-11-07, re-run in full before the commit)
| Check | Result |
|---|---|
| `node --test test/*.test.ts` (apps/web-console), no Rust bridge | 465 tests, 457 pass, 0 fail, 8 skipped (the real-contract tests that need the Rust bridge) |
| same, with the existing Rust bridge exe (built 2026-10-28, not rebuilt) | 465 tests, 465 pass, 0 fail, 0 skipped |
| packages/mvp1-sdk tests, with the bridge | 64 tests, 63 pass, 0 fail, 1 skipped |
| `npm run typecheck` (root, all workspaces) | 0 errors |
| `npm run build:console` | succeeded (the Turbopack file-tracing note about reading the deployment record is informational) |
| Journeys, 1200 px and 420 px | W0 43/43 and 43/43; sessions 78/78 and 78/78; settlement 90/90 and 90/90; authorization 44/44 and 44/44; clearing 71/71 and 71/71; backend 42/42 and 42/42; the Console journey (needs the bridge) 128/128 and 128/128 |
| Release scan / gates | 854 files, 0 findings (a clean scan does not pass G09 by itself); private-remote-backup and public-source-release gates PASS, versioned-release and production BLOCKED |
| Migrations | 1 to 7 apply to a fresh database, a second run is a no-op (no pending), the signer-set immutability triggers exist |
Intermittent journey failures, stated plainly: across the full batches, two runs at 420 px failed once each (authorization journey, step 8 after a server restart; settlement journey, step 6) with the same cause: the journey read the page's main region while the document was blank right after a navigation (`innerText` of null). Each journey then passed on every re-run (authorization 3 of 3, settlement 4 of 4 at 420 px). No product defect was found. The settlement journey helper `main` (a file changed in this milestone) was hardened to wait for the main region (it still fails by timeout if the page stays blank); the accepted authorization journey was left unchanged, so it can still show this intermittent failure.
The bridge-dependent results use a bridge executable built earlier from the repository contracts; it was not rebuilt in this regression.
