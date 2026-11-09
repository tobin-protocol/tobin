# W2 execution record (T-1 and T-2): FOR OWNER REVIEW, NOT AUTHORIZED

Written 2026-11-06. **Nothing in this record has been submitted.** The helper process refuses `sendTransaction` (HTTP 403, verified by test) until it is restarted with an owner authorization token; it is running without one. Contract IDs are abbreviated here so the release scan (G09) stays clean; full values are in `contracts/deployments/testnet.json` (clearing: `tobin_clearing_v1`, token: `tobin_test_token_governed`) and in the helper's scratch `config.json`.

## 1. Network and contracts
- Network: Stellar **Testnet**, passphrase `Test SDF Network ; September 2015`, RPC `https://soroban-testnet.stellar.org`, **protocol version 30** (read from `getNetwork`, 2026-11-06).
- Clearing contract `CCV3EFEC…PY4DT` (Wasm hash `80bea964…47e5e4`, immutable, no admin). Unchanged.
- Token named in the session: governed test token `CD5OK4ZS…VNOKYO`. It is only an address argument; it is **never called** by T-1 or T-2.

## 2. Exact method signatures (VERIFIED, `contracts/clearing/src/lib.rs`)
- `create_session(creator: Address, session_id: BytesN<32>, token: Address, max_participants: u32, max_obligations: u32) -> Result<(), Error>`. Requires `creator.require_auth()`. Fails with `SessionExists` (#2) if the id is used, `BadAddressKind` if `token` is not a contract address, `BadCapacity` unless participants are 2..4 and obligations 1..16.
- `join_session(session_id: BytesN<32>, participant: Address) -> Result<(), Error>`. Requires `participant.require_auth()` and `creator.require_auth()` (two entries). OPEN state only. `SessionNotFound` is #1.

## 3. Exact arguments and identifiers
| Item | Value |
|---|---|
| Session identifier `S` (random, generated 2026-11-06 for W2 only) | `f0b77708f52bfca94e0fc537e9aa015a3a4e5be875885ad06b16232f04752567` |
| A (creator) | `GDRHND3Y4FO6TM6ZT2TU27QO2TRNKOIXXWYBC75NW73DCYSTNSMYT5CR` |
| B (first joiner) | `GB2G73P37CQCQR7U3RAZWRFJKLPEH2ONT3DC7E3FB5ADQRA3LPC4SV3T` |
| C (not used by T-1/T-2) | `GCWK6QC7WTDVUVFY7PAPKXJAIJXOOMNJMSDU3TM2WIXWAMM6VYEXOGWL` |
| E (transaction source, fee payer, envelope signer) | `GB3VBLUGDDFBOT6CWMUUQAMUKNU7JQMDQDFBFA7G4NZBMK25TJU6EXUL` |
| T-1 | `create_session(A, S, governed-token, 3, 1)` |
| T-2 | `join_session(S, B)` |

All four accounts hold 10,000 XLM and have a single master signer with zero thresholds (Horizon read 2026-11-06, `evidence/horizon-balances.txt`).

## 4. Expected pre-transaction state
- `S` is unused: the helper's read-only simulation of `join_session(S, B)` returned `Error(Contract, #1)` = `SessionNotFound` (`evidence/sim-join_B.json`). A simulation of `create_session` with `S` succeeds, which it would not if `S` existed.
- No other session, token balance or admin state is read or written by T-1/T-2.

## 5. Simulation results (REAL Testnet simulation, read-only, ledger 5592181)
T-1 `create_session`, source E, unsigned:
- Result: success, no error; helper entry check (SDK `intent` layer versus the simulated entries): **0 problems**.
- Authorization entries: **1**, signer A, credential type **`sorobanCredentialsAddressV2` (CAP-71)**, root invocation `create_session`, no sub-invocations, expiration 0 (to be assigned at signing).
- Resources: instructions 1,687,060; disk read 144 bytes; write 528 bytes; footprint read-only 3 entries (account A, clearing instance, clearing code), read-write 2 entries (A's temporary nonce entry, the persistent `Session(S)` entry).
- **Minimum resource fee 558,331 stroops; assembled transaction fee 559,331 stroops (about 0.0559 XLM).**
- Events: 4 (diagnostic and contract events).

T-2 `join_session(S, B)`: **cannot be simulated successfully before T-1 is on-chain** (`SessionNotFound`). Its fee and entries are therefore **UNVERIFIED**; expected order of magnitude is the same as T-1 with two entries.

## 6. Authorization requirements
- T-1: one entry, A.
- T-2: two entries, B and A, same tree, separate nonces, separately signed in separate Freighter profiles.
- Envelope: E signs through Freighter `signTransaction` (this mechanism was used successfully for the governed-token work, not for auth entries).
- Entry signing uses Freighter `signAuthEntry` on the SDK-built preimage. **Whether Freighter signs that preimage correctly, and whether it handles the AddressV2 preimage (`ENVELOPE_TYPE_SOROBAN_AUTHORIZATION_WITH_ADDRESS`), is UNVERIFIED.** The helper verifies every returned signature offline against the SDK payload and refuses to continue if it does not verify.

## 7. Authorization-entry expiration
- Assigned by the helper at the moment each signer is asked to sign: `expiration = latest ledger + N`, N from 1 to 10 (default 10), re-read from the RPC immediately before each signature request. The helper applies the Tobin signer-tooling rule `current < expiration <= current + 10` (same rule as `contracts/clearing/signer/mod.rs`). This is a tooling policy, **not** a Stellar or contract rule. Unchanged.
- Each entry has its own expiration; the first signer's entry expires first. After the first signature the remaining steps (second signature, enforcing re-simulation, envelope signature by E, submission) must finish within about ten ledgers. The helper stops, without submitting, if any entry has expired before the enforcing simulation.
- Transaction time bounds: `maxTime` = preparation time + 300 s (a Stellar transaction rule, separate from authorization expiry).

## 8. Fee estimate and budget
- Expected: T-1 about 0.056 XLM; T-2 UNVERIFIED, expected similar. Total expected under 0.2 XLM, paid by E.
- **Hard budget enforced by the helper: 5,000,000 stroops (0.5 XLM) per transaction**; larger assembled fees are refused before any signature.

## 9. Exact operation sequence (requires your written go-ahead)
Part 0, no transaction (can run now, only needs Freighter): start helper; detect, connect, switch account, disconnect, wrong network, reject a prompt.
1. **T-1**: in profile E press Prepare (`create`); profile A presses Sign (A is asked for a `signAuthEntry`); any profile presses Finalize (enforcing simulation); profile E presses Sign envelope; **Submit** (`sendTransaction`, authorized only for this envelope); Poll until `SUCCESS`.
2. Independent verification of T-1 (the helper's read-only **Read session S** button, added in review, plus an independent `getTransaction` by hash and a public explorer): `get_session(S)` read through simulation shows state OPEN, participants [A], capacity 3/1; explorer link; compare with the helper log.
3. **T-2**: Prepare (`join_B`; now simulates); profile B signs; profile A signs (a different Freighter profile or browser); Finalize; E signs envelope; **Submit**; Poll until `SUCCESS`.
4. Independent verification of T-2: `get_session(S)` shows participants [A, B].
5. Non-submitting: re-simulate the signed T-2 envelope to show nonce/sequence replay protection (T-5 analysis, no submission).
Order of the two signatures in T-2 is a measurement variable; record it.

## 10. Expected state changes
- After step 1: `Session(S)` exists, OPEN, creator A, participants [A], token = governed token, 3/1; E balance down by the fee; A's temporary nonce entry written.
- After step 3: participants [A, B]. Nothing else changes anywhere.
- If an attempt fails for any reason before `sendTransaction`: nothing changes and no fee is charged.

## 11. Stop conditions (stop and report; do not retry past them)
1. Any wallet prompt that is not exactly the Testnet action described, or shows another network, contract or account.
2. A returned signature that does not verify, or Freighter signing with a different account.
3. Entry-versus-intent check reports any problem, or the fee exceeds the 0.5 XLM budget.
4. `sendTransaction` returns ERROR or anything other than accepted for processing: stop; no resubmission without your decision.
5. A transaction not found after 60 s: reported as UNCONFIRMED, never as success; wait and re-poll once, then stop.
6. An expired entry: discard all collected signatures and prepare again (fresh nonces), at most **three** preparation attempts per transaction; then stop and report.
7. Any observed change to a non-W2 account, contract or the token.
8. (added in review) A proposed operation, contract ID, argument or network that differs from this record; a prompt asking for unexpected permissions; an unexpected credential type (anything other than `AddressV2` or legacy `Address` from the RPC, or any source-account credential); any attempt to bypass the 10-ledger restriction; any secret in logs or reports; any state-changing operation without owner approval.
9. (added in review) The helper enforces the three-attempt limit itself (HTTP 429 after three `prepare` calls per operation per process; tested). Restarting the helper resets it, so a restart during T-1/T-2 counts as an attempt and must be reported.

## 12. Not authorized by this record
T-3 on-chain expired submission, T-4 extra submissions, T-5 on-chain replay, any mint or transfer, any admin or multisig operation, any other contract call, Mainnet.

## 13. What I need from you
Approve in writing: "Authorize the T-1 then T-2 sequence in section 9 exactly" (or edit it). Provide Freighter and browser versions, and tell me when Freighter holds A, B and E (profiles) so I can restart the helper with the submission token. Until then the helper cannot submit.
