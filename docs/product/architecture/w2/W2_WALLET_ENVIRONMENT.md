# W2 wallet environment and manual test sheet

Filled in by the owner. Nothing here is invented; `OWNER TO FILL` means not yet supplied. Public keys only. Never write secrets, seed or recovery phrases, or passwords here.

## Environment
| Item | Value |
|---|---|
| Operating system | Windows 11 Pro 10.0.22000 (from the session environment) |
| Browser name and version | OWNER TO FILL |
| Freighter version | OWNER TO FILL |
| Helper URL | `http://127.0.0.1:8799` (running, validation-only, submission disabled) |
| Helper packages | `@stellar/freighter-api` 6.0.1, `@stellar/stellar-sdk` 17.4.0 |

## Profile mapping
| Profile | Account | Public key | Network selected in Freighter |
|---|---|---|---|
| 1 | A | `GDRHND3Y4FO6TM6ZT2TU27QO2TRNKOIXXWYBC75NW73DCYSTNSMYT5CR` (expected; owner to confirm) | OWNER TO FILL |
| 2 | B | `GB2G73P37CQCQR7U3RAZWRFJKLPEH2ONT3DC7E3FB5ADQRA3LPC4SV3T` (expected; owner to confirm) | OWNER TO FILL |
| Designated profile | E (source) | `GB3VBLUGDDFBOT6CWMUUQAMUKNU7JQMDQDFBFA7G4NZBMK25TJU6EXUL` (expected; owner to confirm) | OWNER TO FILL |

All accounts are disposable and controlled by one person: this is not independent organizational authorization.

## Manual test sheet (submission stays disabled; the owner operates the browser)
Status values: PASS, FAIL, BLOCKED, SIMULATED, NOT RUN. Evidence goes to `evidence/client-log.jsonl` in the helper scratch folder (state changes and signing timings are logged automatically).

| ID | Test | Status now | Real prompt? | Notes / actual outcome |
|---|---|---|---|---|
| W-01 | Freighter available | NOT RUN | n/a | needs the owner's browser |
| W-02 | Freighter unavailable | **PASS (OBSERVED)** in headless Chrome without the extension: `FREIGHTER_UNAVAILABLE` | no | `evidence/client-log.jsonl` |
| W-03 | Connect A | NOT RUN | | |
| W-04 | Connect B | NOT RUN | | |
| W-05 | Connect E | NOT RUN | | |
| W-06 | Disconnect | NOT RUN (logic SIMULATED) | | |
| W-07 | Change account; stale operation invalidated | NOT RUN (guard SIMULATED: result discarded if the address changes during signing) | | |
| W-08 | Testnet selected | NOT RUN (logic SIMULATED) | | |
| W-09 | Wrong network blocks operations | NOT RUN (logic SIMULATED) | | |
| W-10 | Prepare `create_session` | **PASS for preparation and simulation (OBSERVED, no wallet)**; wallet part NOT RUN | | fee 559,331 stroops |
| W-11 | Prepare `join_session` | **BLOCKED**: session does not exist until T-1 is on-chain | | `SessionNotFound` |
| W-12 | Simulation failure blocks signing | PASS for the simulation error path (OBSERVED); no-signing behavior in browser NOT RUN | | |
| W-13 | Wallet rejection shown accurately | NOT RUN | | |
| W-14 | Account mismatch rejected | NOT RUN (SIMULATED by unit test and by role check) | | |
| W-15 | `AddressV2` signing | **NOT RUN, the key question** | | see W2_ADDRESSV2_COMPATIBILITY.md |

## How to run W-15 without submitting
1. Profile 1 (A), Testnet: open the helper, press Connect, then in profile E (or any) **Prepare** with `T-1 create_session` (uses one of three preparation attempts).
2. In profile 1 press **Sign MY authorization entries**. Read the Freighter prompt. Record: did a prompt appear, what it shows (contract, function, arguments, or an opaque hash), the exact error text if any.
3. Do **not** press Finalize, Sign envelope or Submit. The result is logged as `signed` or `sign-fail`.
Signing an authorization entry does not itself change chain state, but it is a wallet signature; it is covered only by your explicit go-ahead for this wallet-only step.
