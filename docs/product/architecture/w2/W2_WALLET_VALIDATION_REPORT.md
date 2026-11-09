# W2 wallet validation report (interim, at the execution-record checkpoint)

Written 2026-11-06. Status words: PASS / FAIL / BLOCKED / NOT RUN / SIMULATED (local logic or mock wallet, not a real Freighter) / OBSERVED (real system, read-only). **No real Freighter was exercised in this session** (the session has no browser extension). Nothing below is a wallet result.

| Case | Status | What is known |
|---|---|---|
| Helper detects Freighter unavailable | OBSERVED | Real headless Chrome without the extension loaded the helper; the page logged state `FREIGHTER_UNAVAILABLE` (`evidence/client-log.jsonl`). This also caught and fixed a real defect (the page had not loaded `core.js`) |
| Freighter detection with the extension | NOT RUN | needs the owner's browser |
| Connect, address, account change, disconnect | NOT RUN | state machine implemented; classification of each state is SIMULATED by unit tests |
| Testnet identification and wrong-network rejection | SIMULATED | `walletState` returns `WRONG_NETWORK` for a mismatching passphrase; real wallet network reporting NOT RUN |
| Preparation and simulation (T-1) | OBSERVED | real Testnet simulation succeeded; entry check 0 problems; fee 559,331 stroops |
| Preparation and simulation (T-2) | BLOCKED | the session does not exist until T-1 is on-chain (`SessionNotFound`, observed) |
| Authorization-entry collection | SIMULATED | mock wallet with a throwaway key: sign, verify, rebuild; a signature by another account or over other bytes is rejected by the SDK |
| `signAuthEntry` with Freighter (T3, T14 display) | NOT RUN | unknown: input format, return encoding, AddressV2 support, what the prompt shows |
| Independent authorization by separate profiles | NOT RUN | and, if run, still one person controls all accounts |
| Wrong account for the requested signer | SIMULATED | helper refuses unless the connected role is allowed; entries only signed when the address matches |
| Tampered entry | SIMULATED | six tampering variants plus missing and extra entries are refused by the intent check |
| Participant rejection / disconnect during signing | NOT RUN | helper maps an error from the wallet to `AUTHORIZATION_REJECTED`, no state change |
| Failed simulation | OBSERVED | `join_session` against the unused session returned `Error(Contract, #1)`; the helper maps it to `SIMULATION_FAILED` |
| RPC timeout, unconfirmed transaction | SIMULATED | `classifyTx` never returns confirmed for anything but `SUCCESS` |
| Duplicate transaction | NOT RUN | analysis in W2_EXPIRY_ANALYSIS.md; non-submitting plan only |
| Expired authorization | SIMULATED / existing tests | helper rule and the Rust signer tests (19 passed) refuse out-of-policy expiry; no on-chain expiry result |
| Transaction submission and confirmation | NOT RUN | no submission authorized; helper blocks `sendTransaction` |

## Key finding already established (OBSERVED)
The Testnet RPC (protocol 30) returns **`SorobanCredentialsAddressV2` (CAP-71)** entries from simulation, which bind the address into the signed payload (a different preimage type). Tobin's offline signer deliberately accepts only the legacy `Address` credential and fails on `AddressV2`. Consequence: the existing signer cannot sign what protocol-30 simulation produces; a wallet adapter must handle V2 (the SDK 17 `authorizeEntry` does). Whether Freighter signs the V2 preimage is the main open wallet question.
