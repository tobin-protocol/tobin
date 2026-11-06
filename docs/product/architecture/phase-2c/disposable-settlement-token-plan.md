# Disposable settlement token plan (Phase 2C)

Written 2026-11-03. **Preparation only. Nothing was generated on-chain, deployed, initialized, minted, transferred or signed.** The only network activity was read-only RPC queries. T6 and T7 are **still BLOCKED**: they are not unblocked until this fixture is deployed, funded and verified.

Purpose: replace the unreachable legacy token (see [legacy-holder-key-investigation.md](legacy-holder-key-investigation.md)) with a separate, disposable Testnet token, so that debtors C and D can pay creditor E in T6 and T7. The legacy and governed tokens, the administrative multisig and the clearing contract are not touched.

## 1. Technical compatibility findings

| Question | Finding | Evidence |
|---|---|---|
| What token interface does the clearing contract require? | Exactly one call: `transfer(from: Address, to: Address, amount: i128)`, made once per settlement instruction, through a local `TokenClient` (not the SDK's generic token client). Nothing else is called: no `balance`, `allowance`, `decimals` | `contracts/clearing/src/lib.rs`, trait `TokenTransfer` (lines 161 to 165) and `settle` |
| What does the session require of the token address? | A **contract** address (`create_session` returns `BadAddressKind` otherwise). No allow-list: any contract-kind token may be named (founder decision recorded in the project notes) | `create_session` |
| Authorization during settlement | Each payer authorizes `settle(session, digest, own total)` via `require_auth_for_args`; the token's `transfer` then requires `from.require_auth()` (a nested sub-invocation for the same payer). A failing transfer reverts the whole settlement | `settle`; `contracts/token/src/lib.rs` `transfer` |
| Can the existing token Wasm be reused unchanged? | **Yes.** `TobinTestToken` implements exactly `transfer` (plus mint and queries); it is a subset of SEP-41 and is what the clearing contract was built and tested against. No new build is needed | `contracts/token/src/lib.rs` |
| Is that Wasm already installed on Testnet? | **Yes (read-only check today, ledger about 5,541,560).** A ContractCode entry exists for the hash recorded for both existing tokens (`ef483732039f0ca62665b92b816c3a12dcf094c707f77e1edc53e60ea083241f`), 4,965 bytes, SHA-256 of the on-chain bytes **equals** that hash, and it is live until ledger 6,448,014 (about 900,000 ledgers or roughly 52 days at 5 s). The same hash and size appear in `ci/wasm-hashes-recorded.txt` and in the manifest for both existing tokens | RPC `getLedgerEntries`; manifest |
| So is an upload needed? | **No.** Deploying a new instance of an already-installed Wasm needs no upload transaction; the new instance references the hash | Soroban deployment model (general knowledge; not exercised here) |
| Does the Wasm run on the current network? | The governed token (same Wasm) was deployed and a mint executed successfully on this Testnet on 2026-11-03 (ledger 5,533,978 in the manifest). The RPC reports protocol version 30 while the repository tests use host 29; no incompatibility was observed. That same-Wasm evidence is about the network, not proof that a settlement runs on protocol 30 | Manifest; `getNetwork` |

## 2. Authority and supply model (the actual one)

The contract has **no fixed-supply mode**; it has a fixed **minter** and a fixed **cap**, both set once in the constructor and never changeable (`__constructor`, `mint`):

- The minter can mint any number of times, each time checked so that `total_supply + amount <= cap`.
- There is no burn, no allowance, no minter rotation, no pause, no upgrade path in the token code.

To avoid any residual mint capability, the plan **sets the cap equal to the intended supply and mints all of it**. After the second mint, `total_supply == cap`, and every further `mint` fails with `CapExceeded` whoever signs. The admin account then has no practical authority and its key can be discarded. If a mint were skipped, the remaining headroom would be mintable only by that admin, so the plan verifies `total_supply == cap` at the end.

## 3. Proposed parameters

| Parameter | Value |
|---|---|
| Name | Tobin Settlement Test Token |
| Symbol | TST (distinct from the existing TTT) |
| Decimals | 7 |
| Cap | 1,000,000 base units (0.1 TST) |
| Initial supply minted | 1,000,000 base units, all of it |
| Minter / administrator | New dedicated disposable account **F**, funded by Friendbot; not the governance multisig, not the legacy deployer |
| Wasm | `ef483732039f0ca62665b92b816c3a12dcf094c707f77e1edc53e60ea083241f`, already on-chain |
| Network | Stellar Testnet, passphrase `Test SDF Network ; September 2015` |

Constructor arguments (in order, as in `__constructor`): `minter = F`, `cap = 1000000`, `decimals = 7`, `name = "Tobin Settlement Test Token"`, `symbol = "TST"`.

## 4. Allocation

Minimum needs come from the proposed obligations (any positive amount is valid; they are test amounts): T6 C pays E 1,000; T7 C pays E 5,000 and D pays E 3,000. Minimum holdings: C 6,000, D 3,000, E 0.

| Account | Mint | Why |
|---|---|---|
| C | **600,000** | covers T6 (1,000) and T7 (5,000) with large margin for retries and further sessions |
| D | **400,000** | covers T7 (3,000) with margin |
| E | 0 | receives only |
| **Total** | **1,000,000 = cap** | no headroom is left, so no further mint is possible |

Leaner alternative (owner's choice): cap 30,000; mint C 20,000, D 10,000. It removes the surplus but leaves less retry margin.

Expected balances (all base units; sum always 1,000,000):

| After | C | D | E | Sum |
|---|---|---|---|---|
| mints | 600,000 | 400,000 | 0 | 1,000,000 |
| T6 settles (C pays E 1,000) | 599,000 | 400,000 | 1,000 | 1,000,000 |
| T7 settles (C 5,000, D 3,000 to E) | 594,000 | 397,000 | 9,000 | 1,000,000 |

## 5. Numbered execution plan (not executed)

Contract and Wasm are fixed above. "State change" marks every on-chain effect.

| # | Step | State change? | Detail |
|---|---|---|---|
| 0 | Create the admin identity F locally | No (local) | Generate a keypair with the same method as accounts A to E; store the secret only in the DPAPI-encrypted per-user store outside the repository; record only the public address. The key must be usable for the signing steps below without being shown to Claude |
| 1 | Fund F with Friendbot (one POST, as in the earlier funding request) | **Yes**: creates account F, 10,000 XLM expected | Verify as before (RPC `getTransaction`, Horizon balance) |
| 2 | Precompute the expected contract ID | No | The ID is `sha256(network id, contract-id preimage from F's address and a random 32-byte salt)`. Compute it offline from F and the salt **before** submitting |
| 3 | **Deploy**: one `InvokeHostFunction` of type create-contract with constructor (host function `createContractV2`), source F, Wasm hash above, salt, constructor arguments above | **Yes**: new contract instance and its storage | Signed by F as the transaction source; source-account authorization covers the creation. Equivalent CLI form: `stellar contract deploy --wasm-hash ef4837… --source-account F --salt … -- --minter F --cap 1000000 --decimals 7 --name "…" --symbol TST`. The Stellar CLI keystore is not to be used by Claude; an SDK-based local script is the alternative (see section 9) |
| 4 | Verify the deployment (read-only) | No | Transaction status SUCCESS; the new ContractData instance exists; the returned contract ID equals the precomputed one; its executable Wasm hash equals the expected hash |
| 5 | **Mint** 600,000 to C: `mint(C, 600000)`, source F, authorizer F | **Yes** | One transaction; checked against the cap |
| 6 | **Mint** 400,000 to D: `mint(D, 400000)`, source F, authorizer F | **Yes** | One transaction |
| 7 | Verify state (read-only simulation) | No | `name`, `symbol`, `decimals`, `minter`, `cap`, `total_supply`, `balance(C)`, `balance(D)`, `balance(E)`, `balance(F)` |
| 8 | Record the contract ID | No | See section 7 |

Verification pass criteria: name `Tobin Settlement Test Token`; symbol `TST`; decimals 7; minter F; cap 1,000,000; total supply 1,000,000; C 600,000; D 400,000; E 0; F 0; and a `mint` attempt (simulation only, never submitted) would fail with `CapExceeded`.

## 6. Transaction count and fees

| Group | Count |
|---|---|
| Friendbot request (F) | 1 |
| Soroban transactions | 3 (deploy, mint C, mint D) |
| Total new on-chain transactions | 4 |

Fees: not predicted precisely. Reference points recorded in the manifest: the governed token deployment charged 44,036 stroops; the multisig mint charged 130,150 stroops (more signatures). Single-signature deploy and mints are expected to be of the same order, well under 1 XLM each; the exact figures come from simulation before submission. F's Friendbot balance is far more than needed.

## 7. Recording the contract ID

The release gate G09 flags contract-ID-shaped strings outside `contracts/deployments/testnet.json`, and the deployment manifest must not be modified in this phase. Therefore the new ID is **not** written into the Phase 2C documents. Plan: record it in a local file outside the repository (the scratchpad or the key directory) and report it in the session; the owner decides whether to extend the manifest or the gate in a later, separate step. The settlement tests need a pinned deployment record naming this token; a test-only record kept outside the repository serves that.

## 8. Rollback and abandonment

| Failure point | State left | Action |
|---|---|---|
| Friendbot fails | Nothing | Report; no loop; owner decides |
| Deploy fails (simulation or submission) | No contract (a failed transaction leaves no instance); possibly a fee on F | Report; a retry uses a new salt only after review |
| Deploy succeeds but verification differs | Wrong instance exists | Abandon it: it has no value; deploy another with a new salt. Never use it in a session |
| Mint C fails or mint D fails | Partial supply, headroom remains | Retry that mint once, after reporting; supply must still reach exactly 1,000,000 |
| Anything unexpected afterwards | Disposable token | Abandon: discard F's key; with the cap reached, nobody can mint more. No burn exists, and none is needed |

Nothing is destructive to existing state: the fixture touches only its own new contract and account F.

## 9. Signing approach and what needs approval

Steps 3, 5 and 6 are transactions that only F can authorize. Options: (a) a local script in the scratchpad (not the repository) using the SDK bundle already downloaded and F's disposable key decrypted in memory, never printed; (b) F imported into Freighter and signed by the owner. This needs the script or Freighter import approved; the script would be shown to the owner before use. No existing repository tool signs for a fresh account (`scripts/multisig/governed-token.mjs` is build-only and tied to the multisig).

## 10. Test scenarios and expected results

| Test | Scenario | Expected |
|---|---|---|
| T6 | Session S7 uses the new token. A, C, E participate; C owes E 1,000; all approve; C signs one entry for `settle(S7, digest, 1000)` with the nested `transfer(C, E, 1000)` | Settled; C 599,000; E 1,000; total supply 1,000,000; one Transfer event; D untouched |
| T7 | Session S8 uses the new token. A, C, D, E; C owes E 5,000, D owes E 3,000; entries from C and D | Settled; C 594,000 (after T6), D 397,000, E 9,000; supply unchanged; two transfers |
| Negative | A payer without enough balance (not planned as a Testnet run) | Whole settlement reverts, state unchanged (covered by existing contract tests) |
| Invariants | Before and after each settlement: sum of balances of C, D, E, F equals 1,000,000; `total_supply` equals 1,000,000; session state Settled exactly once | |

Existing session plans must switch the session token from the legacy token to the new one in `create_session` for S7 and S8 (the join-only sessions S1 to S6 may use either). The legacy transfer plan X1 and X2 becomes unnecessary and is **superseded** by this fixture.

## 11. Security considerations

- The token is worthless and public; any account can create sessions with it (no allow-list by founder decision), which is acceptable for a test fixture.
- F is the sole minter and is disposable; the cap equals the supply so F's authority ends once step 6 succeeds. Discard F's secret afterwards.
- Never reuse or touch the legacy token, the governed token, the legacy holder, the legacy deployer or the multisig.
- Secrets: never printed, logged or committed; F's secret lives only in the encrypted per-user store.
- Settlement authorization: debtors' entries must name the new token's transfer exactly; the pre-signing intent check needs the pinned deployment record to include the new ID.
- Signed entries of a failed settlement remain reusable until expiry (EQ-20): collect fresh entries after any failure.

## 12. Outstanding assumptions and blockers

1. F does not exist yet; it needs creation, encrypted storage and a Friendbot request (approval).
2. Signing method for F (script or Freighter) not chosen.
3. The deployment mechanics (createContractV2 with constructor) are from the SDK and Soroban documentation and were **not exercised** here; simulation before submission will confirm.
4. The protocol 30 versus host 29 question remains open for settlement specifically.
5. Where to record the new contract ID (G09 policy; manifest edits not authorized).
6. T6 and T7 remain BLOCKED until steps 1 to 7 are done and verified, plus the earlier approvals for the setup transactions and the wallet session.

## 13. Exact approval requested

1. Create account F locally and fund it with **one** Friendbot request.
2. Deploy one new instance of the existing token Wasm with the constructor arguments in section 3, from F.
3. Two mints: 600,000 to C and 400,000 to D, by F.
4. The signing method for F in section 9.

Total: 1 Friendbot request and 3 Soroban transactions on Testnet; nothing else.
