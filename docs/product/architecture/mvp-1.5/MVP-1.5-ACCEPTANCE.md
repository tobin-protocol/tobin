# MVP-1.5 acceptance (against the 19 criteria)

PASS (implemented and verified with real evidence), PARTIAL, BLOCKED, NOT TESTED. Mock-based results are marked MOCK and are not Stellar or wallet evidence. NR = real read-only Testnet reads. All evidence is same-author and local.

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 1 | Actual deployed contract interfaces audited | source, `config()`, getters, Wasm hash equality, simulations (NR); `MVP-1.5-CONTRACT-COMPATIBILITY.md` | PASS |
| 2 | Batch-to-contract mapping documented and implemented | `execution-plan.ts`; architecture; 8 plan tests; a plan built from real Testnet identifiers | PASS (design decisions recorded) |
| 3 | Signer requirements known and enforced | per-step signers as data; tests that the initiator signs for no one else; multisig constraint documented | PASS for known requirements; the multisig participant proof is PARTIAL (design gap) |
| 4 | On-chain and application results independently comparable | `compare.ts`; 21 mismatch cases (MOCK observations); a real not-started read (NR) | PARTIAL (not exercised on a live session with data) |
| 5 | Official Stellar SDK integrated | `@stellar/stellar-sdk` 17.4.0 pinned; used for construction, simulation, reads | PASS |
| 6 | Freighter API integrated and wallet compatibility demonstrated | integrated; real Edge + Freighter run by the owner: detect, connect, network, account, signTransaction and signAuthEntry all PASS (owner-reported evidence block) | PARTIAL: demonstrated for connect, network, signing; negative variants and versions not recorded; not exercised inside an attempt |
| 7 | AddressV2 and protocol compatibility verified | NR: protocol 30; credentials `source_account` and `address_v2` observed in real simulations; SDK `authorizeEntry` is the planned path | PARTIAL: network behaviour verified, and Freighter signed a real address_v2 entry that the official SDK accepted (owner run). Not shown: on-chain acceptance, and a multisig account meeting its threshold with one key |
| 8 | Execution attempts immutable and retry-safe | migration 6; 14 attempt tests incl. schema constraints, concurrency, atomicity | PASS (logic and schema; MOCK evidence for network reads) |
| 9 | Transaction construction works | real unsigned assembled transactions built from real sequence numbers (NR) | PASS for the steps whose prerequisites exist on chain |
| 10 | Soroban simulation works | real successful simulations of `create_session` and `join_session`; the other steps fail only for missing earlier steps (NR) | PASS (partial coverage by design) |
| 11 | Signing works | wrapper unit-tested with a MOCK wallet; real extension NOT RUN | BLOCKED (owner action) |
| 12 | Submission works | wrapper tested with a MOCK submitter; no real submission | BLOCKED (needs 11 and inputs) |
| 13 | Independent transaction verification works | real `getTransaction` reads: SUCCESS for the recorded mint, NOT_FOUND mapped to unknown (NR) | PASS for reading; not yet applied to a Tobin settlement |
| 14 | A real Testnet settlement has completed | none | BLOCKED (owner inputs; supply of 1 base unit; multisig participant) |
| 15 | Actual on-chain outcome reconciles with the approved batch | none | BLOCKED |
| 16 | Failure and unknown-outcome handling tested | 14 attempt tests, 11 state tests, 7 rpc/wallet tests (MOCK) | PASS (logic) |
| 17 | Existing milestone tests intact and passing | see closure | PASS |
| 18 | TypeScript and production build succeed | see closure | PASS |
| 19 | Documentation and threat model updated | 11 documents | PASS |

**Superseded (state before the owner-run stages of 2026-11-07):** by the milestone's own rule, criteria 6, 11, 12, 14 and 15 were then not met. See the final status below. The verdict is in `MVP-1.5-CLOSURE.md`.

## Stages 0 to 6 of the testnet account, multisig and end-to-end validation (2026-11-07)
Stage 0 pass. Stage 1 pass (second account, ownership proven with a Freighter SEP-53 signature by the owner's account; scheme per the owner's recollection). Stage 2 pass (live multisig audit). Stage 3 pass (signer-set-aware authorization, 17 tests; mocks labelled). Stage 4 pass (owner-run real Founder + Security co-signing, not submitted). Stage 5 pass: eight real Testnet submissions by the owner in Edge + Freighter, each confirmed by typed confirmation. Stage 6 pass: exact independent reconciliation (RPC and Horizon). Evidence files are listed in `MVP-1.5-TESTNET-VERIFICATION.md`.
Test results by kind: unit 465 tests (457 pass, 0 fail, 8 skipped); mock-integration as labelled in the test files; real Testnet read (preflight, simulation, multisig audit, account check, reconciliation); real signing (owner-run co-sign test and each settlement step); real submission (eight transactions); real reconciliation (RPC + Horizon); owner-run browser (Edge + Freighter). Typecheck clean; build passes; settlement journey 90 of 90 at 1200 px and at 420 px; release scan 854 files, 0 findings (G09 not passed by the scan alone); migrations 1 to 7 apply (health reports schema 7, no pending).

## Final status of the 19 criteria (2026-11-07, after the owner-run Testnet settlement)
Verdict: **COMPLETE WITH LIMITATIONS** (not strict COMPLETE; see `MVP-1.5-CLOSURE.md`). Evidence is same-author and from one actual owner-run execution.
| # | Final status | Basis |
|---|---|---|
| 1 | PASS | unchanged |
| 2 | PASS | the plan built from real identifiers was executed on Testnet |
| 3 | PASS with a recorded design limit | the administrative account is the debtor and transaction source, authorized by the Founder + Security envelope (live weight 6 of 6, verified by the server); the second participant is a single-key account; no proof of ownership OF the multisig account itself was built |
| 4 | PASS | the comparison ran on a live settled session: no mismatches (`evidence/settlement-reconciliation-2026-11-07.json`) |
| 5 | PASS | unchanged |
| 6 | PASS for Freighter in Edge only | owner-run: connect, network, account, signTransaction, signAuthEntry, message signature; no second wallet and no hardware wallet |
| 7 | PASS | the network accepted a Freighter-signed `address_v2` authorization entry together with a Founder + Security envelope (join_session, ledger 5606163) |
| 8 | PASS | unchanged (the real run needed no retry) |
| 9 | PASS | all eight steps were built from real sequence numbers |
| 10 | PASS | every step was simulated against the real state before signing |
| 11 | PASS | real signatures by the second account, Founder and Security through Freighter |
| 12 | PASS | eight real submissions, each with the typed confirmation, none retried |
| 13 | PASS | each transaction read back from the RPC and from Horizon by hash |
| 14 | PASS | a real Testnet settlement completed: exactly 1 base unit, administrative account 1 to 0, second account 0 to 1, supply 1 |
| 15 | PASS | reconciliation exact, with the same-author digest implementation |
| 16 | PASS (logic) | failure and unknown-outcome paths are tested with mocks; the real run had no failure, so they were not exercised on the network |
| 17 | PASS | final regression of 2026-11-07, see the closure |
| 18 | PASS | typecheck and production build |
| 19 | PASS | documents updated; superseded statements are marked as history |
