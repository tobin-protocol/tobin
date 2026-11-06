# Disposable settlement token: final execution manifest (Phase 2C)

Written 2026-11-03 (UTC afternoon). **Preparation and verification only. Nothing in this document has been executed.** F was not generated, no Friendbot request was made, nothing was deployed, uploaded, initialized, minted, transferred, signed or submitted, and no TTL was extended. Evidence below comes from source reading, read-only RPC/Horizon queries and unsigned, unsubmitted simulations. Supersedes the parameters of [disposable-settlement-token-plan.md](disposable-settlement-token-plan.md) (cap 1,000,000 is replaced by the approved cap 30,000).

## 1. Approved configuration

| Parameter | Value |
|---|---|
| Name / symbol / decimals | Tobin Settlement Test Token / TST / 7 |
| Cap = initial supply | 30,000 base units = 0.003 TST |
| Allocation | C 20,000 (0.002 TST), D 10,000 (0.001 TST), E 0 |
| Admin and minter | New disposable account F (not yet created) |
| Network | Stellar Testnet (`Test SDF Network ; September 2015`) |
| Signing | Local scratchpad signer (specified in section 7; not written yet) |
| Wasm | Existing token Wasm `ef483732039f0ca62665b92b816c3a12dcf094c707f77e1edc53e60ea083241f`, verified in section 4 |

## 2. Allocation sufficiency (PASS)

Amounts are the test proposals of the Phase 2C transaction plan (any positive amount is valid for the contract); TST = base units / 10^7.

| Test | Session | Obligation(s) | Base units | TST |
|---|---|---|---|---|
| T6 | S7, independent | C pays E | 1,000 | 0.0001 |
| T7 | S8, independent | C pays E / D pays E | 5,000 / 3,000 | 0.0005 / 0.0003 |

T6 and T7 use different sessions, but the **same accounts' balances** serve both. Balances only fall when a settlement succeeds; a failed settlement reverts the whole call (`settle` writes the terminal state before the transfers and a failed transfer propagates, `contracts/clearing/src/lib.rs` lines 637 to 656).

| Account | Needed by T6 + T7 | Allocated | Margin | Sufficient |
|---|---|---|---|---|
| C | 1,000 + 5,000 = **6,000** (0.0006 TST) | 20,000 | 14,000 | **Yes** |
| D | **3,000** (0.0003 TST) | 10,000 | 7,000 | **Yes** |
| E | 0 (receives 9,000 in total) | 0 | n/a | Yes |

Stress cases still inside the allocation: if T9 were widened to five single-debtor settlements of 1,000 by C, C needs 11,000 of 20,000; repeating both T6 and T7 once more needs C 12,000 and D 6,000. The approved amounts are **not changed** and no shortfall exists. Expected final balances after T6 and T7: C 14,000, D 7,000, E 9,000; sum 30,000 = supply.

## 3. Token source compatibility (Confirmed in source)

| Requirement | Evidence |
|---|---|
| Clearing calls exactly `transfer(from, to, amount)` and nothing else on the token | `contracts/clearing/src/lib.rs` lines 161 to 165 (`TokenTransfer` trait, `contractclient TokenClient`) and line 655 (`token.transfer(&ins.payer, &ins.payee, &ins.amount)`) |
| The token implements that signature | `contracts/token/src/lib.rs` line 124: `pub fn transfer(env: Env, from: Address, to: Address, amount: i128)` |
| Transfer authorization | line 125: `from.require_auth()`; then `amount <= 0` rejected (126 to 128), insufficient balance rejected (129 to 132), balances updated only if `from != to` (133 to 139) |
| Session token must be a contract | `create_session`, clearing lines 276 to 279 |
| Minter and cap fixed at construction | `__constructor` lines 78 to 95 sets `Key::Minter`, `Key::Cap` once; no other function writes either (search for `set(&Key::Cap` and `set(&Key::Minter` finds only lines 90 and 91) |
| Cap cannot be raised | no function writes `Key::Cap` after construction; constructor requires `cap > 0` (`BadCap`) |
| Mint checks the cap | lines 101 to 122: `minter.require_auth()`, `amount > 0`, `total.checked_add(amount)`, `new_total > cap` returns `CapExceeded` before any write |
| No upgrade, burn, allowance or minter change | the token's public functions are exactly `__constructor`, `mint`, `transfer`, `balance`, `total_supply`, `cap`, `minter`, `decimals`, `name`, `symbol`; no search hit for `upgrade`, `update_current_contract_wasm`, `burn`, `approve`, `allowance`, `set_minter` or `set_cap` except the header comments (lines 10 to 12) that state their absence |
| Constructor arguments | `(minter: Address, cap: i128, decimals: u32, name: String, symbol: String)` |

Authority model: only F can mint, only up to 30,000 in total; after the two mints, `total_supply == cap` and every further mint fails with `CapExceeded` whoever signs.

## 4. Wasm identity and TTL (read-only, ledger 5,541,651, 2026-11-03 about 18:51 UTC)

| Check | Result |
|---|---|
| Code entry present | Yes |
| SHA-256 of the on-chain bytes | **equals** the manifest hash `ef483732…083241f` |
| Size | 4,965 bytes (equals `ci/wasm-hashes-recorded.txt`) |
| Live until | ledger **6,448,014** (unchanged from the earlier reading) |
| Ledgers remaining | **906,363** |
| Days remaining | about **52.5 days** at 5 s per ledger; about 62.9 days at 6 s (stated assumption: Testnet closes a ledger every 5 to 6 seconds; ledger 5,541,210 closed 18:14:50Z and 5,541,651 closed 18:51:35Z, i.e. about 5.0 s per ledger on that stretch) |
| Shared with existing tokens | **Yes.** Both the legacy and the governed token instances reference this one code entry (executable hash read from each instance equals the manifest hash). The clearing contract uses a different hash |
| Does a new instance change the code TTL? | A simulated deployment shows the code entry in the footprint as **read-only** and only a new `contractData` entry as read-write. So a deployment adds an instance and does not rewrite the code entry; TTL change is not shown and none is expected (inference from the footprint; the host's rent rules were not read) |
| Extension | Not performed |
| Enough for the schedule? | Yes for any plan measured in days. It expires by ledger 6,448,014 (about mid-December 2026 at 5 s per ledger), after which the Wasm would need restore or extension (separate approval) |

## 5. Protocol 30 versus host 29 (the key open risk)

**Facts (read-only):**

- The RPC reports version `30.0.0` with captive core `stellar-core 30.0.0`, protocol 30.
- Horizon shows protocol **29** at ledger 5,533,978 (2026-11-03 08:12Z, the governed token's mint) and protocol **30** at ledger 5,541,210 (18:14Z, the Friendbot funding). **The network upgraded to protocol 30 between those ledgers, on the same day.**
- The token Wasm's embedded environment metadata declares interface version **protocol 29, pre-release 0**; it was built with Stellar CLI 28.0.0. The repository builds against `soroban-sdk` 29.0.0 and the host 29 test harness.
- Consequence: **every earlier on-chain success was under protocol 29**: the governed token deploy and mint (ledgers 5,530,094 and 5,533,978), and the Phase E full settlement (ledger 5,411,256, reported protocol 29). A Wasm token deployment/mint success at protocol 29 is therefore **not** evidence for protocol 30, as the task states.

**Confirmed at protocol 30 today (unsigned, unsubmitted simulations against the live RPC; source account A used as a placeholder, not F):**

| Simulation | Result |
|---|---|
| Create-contract with constructor (existing token Wasm hash; minter, cap 30,000, decimals 7, name, symbol) | **OK.** minimum resource fee 55,971 stroops; one `SourceAccount` authorization; footprint: code read-only, new contract data read-write; no restore needed |
| Offline contract-ID prediction (sha256 of the network id and the from-address preimage) | **Predicted ID equals the simulated result** for the placeholder deployer: the method is verified |
| Clearing `create_session` (random session id, legacy token) | OK, fee 444,922 stroops, one authorization recorded |
| Legacy token `transfer` from an account holding 0 | Fails with token error 102 (InsufficientBalance) after authorization, as the source predicts |
| Clearing `finalize_obligations` on a nonexistent session | Fails with clearing error 1 (`NoSession`), as the source predicts |
| Read calls (`name`, `symbol`, `decimals`, `total_supply`, `cap`, `minter`, `balance`) on both tokens | OK (earlier today, protocol 30) |

**Not confirmed (inferred or unverified):**

| Item | Status |
|---|---|
| Mint on a fresh instance | **Unverified at protocol 30.** It cannot be simulated until the instance exists; the plan therefore simulates each mint immediately before signing |
| `settle` with nested `transfer` authorization (join/settle entries, `require_auth_for_args`) at protocol 30 | **Unverified.** Needs a session in the Approved state; the mock/host-29 tests and Phase E (protocol 29) are the only evidence |
| Authorization-entry format/signing behaviour at protocol 30 | Unverified; the signer and the known-answer tests are host 29. The simulations above recorded legacy (`SourceAccount`) credentials only |
| General backward compatibility (Wasm declaring an older interface version keeps running on a newer protocol) | Inference from the Soroban design; not demonstrated for these contracts |
| Whether any protocol 30 change affects these contracts | Not read in detail; no release notes were examined |

Sufficiency of offline host-29 tests: **sufficient for the logic** of the contracts (unchanged Wasm), **not sufficient** as evidence of behaviour on the live protocol 30 network for deployment-with-constructor (now simulated OK), mint (simulate before signing), settlement and entry authorization (only the real T6/T7 run can settle this). This is an additional reason to keep T6 and T7 as genuine experiments rather than assuming them.

## 6. Admin account F: preparation specification (not performed)

- Proposed identity name: `tobin-settlement-token-admin` (public label F). A new random Ed25519 keypair generated locally with the SDK in the scratchpad; never an existing account, never the multisig or legacy holder.
- Storage: the same per-user DPAPI-encrypted file approach already used for A to E, in a separate file in the key directory outside the repository (for example `settlement-token-admin.dpapi`). The secret exists in memory only while generating and signing; it is never written as plaintext, never passed as a command-line argument or environment variable, never printed.
- After generation: derive the public address from the stored secret and compare with the generated one; write only the public address into a public manifest.
- After the two mints the key is no longer needed; delete the file.

## 7. Scratchpad signer: specification and security review

Status: **specified, not written**. The implementation will be shown for review before any use; no signing code exists today.

Specification (all required):

1. Run from the scratchpad, outside the repository; uses the SDK bundle in the scratch download (version 17.4.0, verified at start by reading its package manifest) and the Testnet RPC only.
2. Load the DPAPI file; decrypt in memory through PowerShell DPAPI; derive and verify F's public address against the public manifest.
3. A hard-coded **approved manifest** of exactly three operations (section 8, O3 to O5). Each is accepted only if it matches field for field: network passphrase, source = F, host function type, contract/Wasm hash, function name, arguments (including the amounts and recipients), salt (fixed per run and recorded) and that the contract ID derived equals the predicted one.
4. Always simulate first; refuse if the simulation errors, if the footprint contains anything unexpected, if the required authorization is anything other than F's source-account credentials, or if the fee exceeds a stated ceiling (proposed: 0.05 XLM per transaction).
5. Print a human-readable intent (no secret, no XDR of the key) and require a typed confirmation of the operation number from the owner before signing.
6. No generic signing mode: no parameter accepts arbitrary XDR, arbitrary function names or other accounts; unknown operations are refused.
7. Sign only the envelope with F; submit only the approved operation; poll `getTransaction`; record hash, ledger, result and fee; stop on any failure with no automatic retry.
8. Refuse any network other than the Testnet passphrase and any RPC host other than the approved one.

Security review criteria (to be applied to the implementation before use): no secret in logs, arguments, environment, files or error messages; no code path that reaches a signing call without passing the manifest comparison and simulation; no dynamic evaluation; dependencies limited to the pinned SDK bundle; the decrypted secret is zeroed or dropped immediately after signing; the script is readable in full in one screen-sized review; it cannot read the Stellar CLI keystore or any other account's key (it opens one file). A review against this list is **pending the implementation**.

## 8. Exact numbered transaction manifest (not executed)

| # | Operation | Source | Target | Function and exact arguments | Authorization | Expected state change | Expected fee | Simulation result | Verification |
|---|---|---|---|---|---|---|---|---|---|
| O1 | Create F locally | n/a | n/a | local key generation | none | none on chain | none | n/a | public address derived and compared |
| O2 | Friendbot funding for F | Friendbot | F | `POST https://friendbot.stellar.org/?addr=<F>` (one request, no retry) | none | F created, about 10,000 XLM | paid by Friendbot (100 stroops) | n/a | `getTransaction` SUCCESS; Horizon balance |
| O3 | **Deploy and initialize** | F | new contract, Wasm `ef483732…083241f` | create-contract with salt (random 32 bytes, recorded) and constructor `(minter = F, cap = 30000 as i128, decimals = 7 as u32, name = "Tobin Settlement Test Token", symbol = "TST")` | `SourceAccount` credentials (envelope signed by F) | new instance entry, constructor sets minter, cap, decimals, name, symbol, total 0 | simulation at protocol 30 with placeholder deployer: **minimum resource fee 55,971 stroops** (about 0.0056 XLM) plus the inclusion fee (100 stroops base); final value re-simulated with F | **OK** (placeholder deployer A; F version re-run before signing) | status SUCCESS; instance exists; returned contract ID equals the predicted ID; instance executable hash equals the approved hash |
| O4 | **Mint to C** | F | new token | `mint(to = C, amount = 20000 as i128)` | F's authorization (`SourceAccount` when F is the source) | C balance 20,000; total 20,000; mint event | Same order as O3 (not predicted; the earlier multisig mint charged 130,150 stroops with extra signatures) | **Cannot be simulated before O3** (the instance does not exist); simulated immediately before signing | `balance(C) == 20000`, `total_supply == 20000` |
| O5 | **Mint to D** | F | new token | `mint(to = D, amount = 10000 as i128)` | F | D 10,000; total 30,000 = cap | As O4 | As O4 | `balance(D) == 10000`, `total_supply == 30000` |
| O6 | Read-only verification | none | new token | see section 9 | none | none | none | n/a | checklist |

**Transaction count: 4 on-chain transactions**: 1 Friendbot (fee paid by Friendbot) and 3 Soroban transactions (O3, O4, O5). Total fee to F: roughly 0.01 to 0.05 XLM (O3 simulated; O4 and O5 estimated by analogy, to be simulated before signing). State-changing operations: O2, O3, O4, O5 only.

**Predicted contract ID.** Method (verified against a simulation): `StrKey.encodeContract(sha256(HashIdPreimage ContractId{networkId = sha256(passphrase), contractIdPreimage = FromAddress{F, salt}}))`. It is computed after O1 (F) and a random salt are fixed, recorded in a local file outside the repository (not in the manifest or documents: the release gate G09 flags contract IDs in docs), re-computed by the signer, compared with the simulation result before signing and with the deployed result afterwards.

## 9. Post-deployment verification checklist (read-only)

1. Contract ID exists on Testnet and equals the predicted ID.
2. Its executable Wasm hash equals `ef483732…083241f`.
3. `name` = "Tobin Settlement Test Token"; `symbol` = "TST"; `decimals` = 7.
4. `minter` = F; `cap` = 30,000; `total_supply` = 30,000.
5. `balance(C)` = 20,000; `balance(D)` = 10,000; `balance(E)` = 0; `balance(F)` = 0.
6. Legacy and governed token IDs unchanged; their supplies still 1,000,000,000 and 1 base unit.
7. A further `mint` simulation (e.g. 1 unit to E) fails with `CapExceeded` (error 103) and is not submitted.
8. Code entry TTL unchanged (6,448,014) or reported if different.

For T6 and T7, verify after each settlement: the debtor's entry covers `settle(session, digest, own total)` with the nested `transfer(debtor, E, amount)`; the transaction result is SUCCESS; recipient and debtor balances move by exactly the instruction amounts; total supply remains 30,000 and the sum of C, D, E, F balances remains 30,000; `get_session` state is Settled and `get_settlement` returns the digest, `total_moved` and `instruction_count`; the settlement happens once. **T6 and T7 are not unblocked** until the token exists, is funded and verified, and the sessions and wallet tests actually pass.

## 10. Remaining risks and blockers

1. **Protocol 30 is untested for mint, settlement and entry authorization** (section 5). The mitigation is simulate-before-sign and treating T6/T7 as real experiments.
2. The signer implementation does not exist; its security review is pending.
3. Mint fees cannot be simulated before deployment.
4. The Wasm code entry expires around ledger 6,448,014; fine for days, not for months.
5. Where to record the new contract ID (G09; manifest edits not authorized): proposed local file outside the repository.
6. Setup transactions for the sessions (27 in the earlier plan) and the wallet session remain separately pending, as does the pinned deployment record naming the new token for the signing intents.
7. Friendbot rate limits, though one request is needed.

## 11. Approval requested

Explicit approval of this exact manifest: O1, O2, O3, O4, O5 as specified, after the signer implementation has been shown to you and reviewed. Nothing will run before that.
