# Legacy token transfer plan (Phase 2C)

Written 2026-11-03. **Nothing was minted or transferred; supply is unchanged.** All data below came from read-only Soroban RPC simulation and Horizon reads.

## Token facts

| Property | Value | Evidence |
|---|---|---|
| Contract | `tobin_test_token` in `contracts/deployments/testnet.json` (ID read from it); status "legacy", same Wasm hash as the governed token | Manifest |
| Name, symbol, decimals | Tobin Test Token, TTT, 7 | RPC `name`, `symbol`, `decimals` |
| Total supply, cap | 1,000,000,000 base units (100 TTT); cap 10,000,000,000,000 | RPC `total_supply`, `cap` |
| Minter | The legacy deployer account, recorded in the repository as one that tooling must never touch | RPC `minter`; `scripts/multisig/lib.mjs` |
| `transfer(from, to, amount)` | `from.require_auth()`; amount must be positive; insufficient balance is refused; moves balance (a self-transfer changes nothing); emits a transfer event; extends the instance TTL | `contracts/token/src/lib.rs` lines 124 to 143 |
| Clearing compatibility | `settle` calls the token's `transfer(payer, payee, amount)` and `create_session` requires a contract-kind token address | `contracts/clearing/src/lib.rs` |

## Holder identification (read-only)

- Events: none in the RPC's retention window (the query returned 0 events), so holders cannot be listed from events.
- Repository addresses: balances of 16 public addresses found in the repository were all 0 on the legacy token.
- **On-chain history:** Horizon shows the legacy minter account's operations: account creation, the token deployment, and **one `mint` of 1,000,000,000 base units** (transaction `3a1419e114150d5e332ecfcbbe6ce45815aaec008a1b45b874b558ea8507dcc4`, 2026-10-29) to the address below. No other mint exists in its history.

| Holder H | Value |
|---|---|
| Public address | `GB4WIKKCYDDQUKLTKBMMMCPLZJVXZWL36CJEGWXMKEYV7NNLS2MDE7G5` |
| Legacy balance | **1,000,000,000 base units (100 TTT)**, read 2026-11-03 |
| Governed balance | 0 |
| Account | Exists; native balance about 9,999.95 XLM; one signer of weight 1; thresholds 0 (so one signature suffices); created 2026-10-29 with one other operation in history |
| Appears in repository text? | No. Its relation to the project is **inferred** (it received the only mint made by the project's deployer), not recorded |

## Suitability and the unresolved fact

H is the only identified holder and holds the whole supply, so it can fund C and D with a negligible fraction (16,000 of 1,000,000,000). **Whether the project owner controls H's key is unknown** to me; the repository holds no record of it and I must not look for keys. If the key is unavailable, T6 and T7 are **BLOCKED** (the other route, a mint by the legacy minter, is outside this plan and outside the authorization).

## Proposed transfers

Amounts are base units; decimals 7.

| # | Call | Amount | In TTT | Authorizer | Suggested source account |
|---|---|---|---|---|---|
| X1 | `token.transfer(H, C, 10000)` | 10,000 | 0.001 | H (entry, or envelope if H is the source) | H |
| X2 | `token.transfer(H, D, 6000)` | 6,000 | 0.0006 | H | H |

Account C: `GCWK6QC7WTDVUVFY7PAPKXJAIJXOOMNJMSDU3TM2WIXWAMM6VYEXOGWL`; account D: `GCFEEEECS4IRNQLIT6MFOX3TR6GBZ2IQ7SZ7RANG577QBLJ57TTR2DLJ`.

Why 10,000 and 6,000: C owes 1,000 in T6 and 5,000 in T7 (6,000), D owes 3,000 in T7; the allocation leaves margin for one retry. Two transactions are needed (one contract invocation per Soroban transaction).

## Expected state transition

H: 1,000,000,000 to 999,984,000. C: 0 to 10,000. D: 0 to 6,000. Total supply 1,000,000,000 unchanged. Two transfer events. Governed token untouched.

## Verification after execution

Read `balance` for H, C, D by RPC simulation; read `total_supply` (must still be 1,000,000,000); confirm each transaction status SUCCESS and its ledger; record hashes. PASS only after those reads.

## Risks and fees

A transfer moves test tokens only; it does not touch the minter, supply or governance; fee considerations are those of a Soroban invocation (earlier Testnet contract transactions cost tens to hundreds of thousands of stroops, far under 1 XLM, paid by the source account, which for H is funded). C and D need not exist as classic accounts to hold balances (custom token storage), but they will exist after Friendbot.

## Authorization status

Not covered by the existing wallet-validation authorization. **Approval requested:** APPROVE / DECLINE X1 and X2, **and** confirm that you control H's key and how it will sign (it must not be given to Claude).
