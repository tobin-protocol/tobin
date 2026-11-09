# W2 execution record review

Reviewed 2026-11-06 against source and the running helper. Nothing was signed or submitted; the helper is still in validation-only mode (no token exists, `sendTransaction` returns 403).

## Result
**Ready for owner approval after the corrections below.** The review found two things the record promised that the helper did not do; both were fixed in the helper and the record was amended.

## Checks
| Item | Result | Evidence |
|---|---|---|
| Contract IDs | OK. Clearing and governed-token IDs in the helper config equal `contracts/deployments/testnet.json` (taken from it programmatically); abbreviated in the tracked record | config built from the manifest |
| Network, RPC | OK: Testnet passphrase, `soroban-testnet.stellar.org`, protocol 30 | `getNetwork`, `getVersionInfo` |
| Signatures and arg types | OK against `lib.rs`: `create_session(Address, BytesN<32>, Address, u32, u32)`, `join_session(BytesN<32>, Address)`; helper encodes address, bytes32 (as `ScvBytes`), u32 | source; the entry check compares each simulated argument with the SDK-stated value (0 problems) |
| Session id | Random 32 bytes, unused: `get_session` path gives `SessionNotFound` (#1) in the join simulation; `create_session` simulates successfully (it would return `SessionExists` otherwise) | `evidence/sim-*.json` |
| Source account E | OK: used as source in every build; funded 10,000 XLM | Horizon |
| Entries, credential types | T-1: one entry, A, `AddressV2`. T-2: expected two (B, A); unverified until T-1 exists | simulation |
| Expiration | OK as designed: assigned at signing, per entry, rule `current < exp <= current+10`; the record correctly says the first signer's entry expires first | helper code, tests |
| Simulation output, fee | T-1 fee 559,331 stroops confirmed again by reading `evidence/sim-create.json` | evidence |
| 0.5 XLM cap | OK: `MAX_FEE_STROOPS = 5,000,000` (1 XLM = 10,000,000 stroops); enforced at prepare and finalize before any signature | `core.js`, `app.js` |
| **Three-attempt limit** | **Was not enforced** (stated in the record only). **Fixed**: server refuses a 4th `prepare` per operation with HTTP 429; tested (`attempts.test.mjs`) | helper |
| **Independent verification procedure** | **Was not implemented** (the helper could not read the session). **Fixed**: read-only "Read session S" button simulates `get_session`; failure paths show no data | helper |
| Signed entries survive reconstruction | OK: SDK `assembleTransaction` keeps existing auth entries and discards the simulation's ("advanced usage") | SDK source; mock-wallet test |
| Stop conditions | 7 in the record plus 2 added (items 8, 9) to cover your 12 conditions | record |
| Account change mid-signing | **Added**: after `signAuthEntry` returns the helper re-reads the wallet address and discards the result if it differs | `app.js` |

## Remaining uncertainties
1. Whether Freighter signs an `AddressV2` preimage (the central W2 question; see W2_ADDRESSV2_COMPATIBILITY.md).
2. T-2 fee and its two-entry shape are unverified until T-1 lands.
3. Ledger close time not yet measured; whether the first signer's 10-ledger window leaves enough time for the later steps.
4. The success-path decoding of `get_session` in the Read button has not run (no session exists); only its error path was exercised.
5. Submission is gated by process, not bound to an envelope hash; keep the authorization token specific to this run.
6. Accounts A, B, C, E remain controlled by one person.

## Corrections made
Helper: attempt limit, read-back button, account-change guard. Record: stop conditions 8 and 9, verification step 2. No change to the operations, fee cap, expiry policy, contracts, signer or baselines.
