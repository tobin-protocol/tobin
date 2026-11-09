# W2 decision recommendations (interim, 2026-11-06)

W2 is **not complete**. No real Freighter was available to this session, so no wallet capability is confirmed. Labels: CONFIRMED / NOT TESTED / SIMULATED.

| # | Question | Answer |
|---|---|---|
| 1 | Can Freighter connect and identify the expected accounts? | NOT TESTED. Helper logic for each state is SIMULATED (unit tests); only the "unavailable" state was observed in a real browser without the extension |
| 2 | Does it identify Testnet correctly? | NOT TESTED. The helper compares the wallet's reported passphrase with the Testnet passphrase (SIMULATED) |
| 3 | Can it sign the current `AddressV2` entries? | NOT TESTED. The decisive test is W-15 (sign only, no submit). The package only forwards the string to the extension, so offline inspection cannot answer this. The SDK's side (building the V2 preimage and accepting a verified signature) is CONFIRMED with a throwaway key |
| 4 | Can two separate Freighter instances authorize the same logical operation? | NOT TESTED. The contract demands two entries for `join_session` (CONFIRMED in source); evidence from one person's profiles would not show organizational independence |
| 5 | Do SDK `prepare` and `intent` remain reusable? | CONFIRMED, unchanged and used by the helper. `Transport.invoke` is not sufficient for a network path (no phases) |
| 6 | Is a minimal wallet adapter sufficient? | Probably adapter plus a three-phase network transport (prepare, collect, submit/confirm). Not decided until W-15 and T-2 timings |
| 7 | Does the contract support the two-authorization join? | Contract side yes (source and earlier host tests). On Testnet with a wallet: NOT TESTED; `join_session` cannot even be simulated until T-1 exists |
| 8 | What does the 10-ledger restriction mean in practice? | It is Tobin signer-tooling policy, not a Stellar or contract rule. Entries have separate expirations, so the first signer's entry bounds the whole collection. Whether a human with two wallets fits in about ten ledgers is UNMEASURED |
| 9 | What remains outside W2? | `settle` and nested token authorization, tokens, real multi-organization independence, signing-room design, fee measurement beyond T-1, protocol-30 behavior of the rest of the lifecycle |
| 10 | What MVP-1.2 tasks proceed now? | Organizations, memberships, invitations, session registry, session screens on labelled fixtures, read-only Testnet reads, design-system integration (see the parallel-work notes in the final report) |

## Owner decisions still needed
1. Approve (or amend) the T-1/T-2 sequence in the execution record; until then nothing is signed or submitted.
2. Run the wallet-only checks (W-01 to W-15) and supply browser, Freighter versions and the profile mapping.
3. Confirm the AddressV2 policy as stated in your instructions (preserve the returned credential; Rust signer unchanged).
4. After T-2 timing, decide W3 (not changed here).

No change of product direction and no full wallet integration is recommended before the owner reviews the W2 evidence.
