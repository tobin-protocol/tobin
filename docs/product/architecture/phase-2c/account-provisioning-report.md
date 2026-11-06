# Account provisioning report (Phase 2C)

Written 2026-11-03. Preparation only: no wallet was opened, no signature requested, no transaction submitted, T3 not started. Statuses: PASS, FAIL, BLOCKED, PARTIAL, NOT RUN.

## Summary

| Item | Status |
|---|---|
| Five keypairs generated and stored securely | **PASS** (with the limitation below) |
| Public addresses recorded | **PASS** ([test-accounts.public.json](test-accounts.public.json)) |
| Account activation and XLM funding | **NOT RUN**: needs separate approval |
| Legacy token investigation | **PASS** (read-only) |
| Token balances for the five accounts | **PASS** (all zero) |
| Settlement readiness (T6, T7) | **BLOCKED**: no token source within current authorization |
| Freighter import | **NOT RUN**: owner action; instructions in [test-account-plan.md](test-account-plan.md) |

## Accounts and storage

- Five accounts A to E (roles in [test-account-plan.md](test-account-plan.md)) were generated with `Keypair.random()` from `@stellar/stellar-sdk` 17.4.0 using the browser bundle **downloaded to a scratch directory outside the repository** (no dependency installed, nothing added to the repository, no project file changed). That library choice was not pre-approved; it is disclosed here.
- Secrets were written only to a Windows DPAPI-encrypted file in a per-user directory under the local application data folder, outside the repository. Temporary plaintext intermediates were deleted. The encrypted file was checked to contain no plaintext secret pattern; it decrypted, and every secret re-derived its recorded public address (5 of 5 match, 5 distinct). No secret was printed, logged, typed into a document or exposed to a browser.
- **Limitation:** DPAPI does not protect against processes running as the same Windows user, including this Claude Code session. The keys are disposable Testnet keys with no value.
- No `.gitignore` was modified; no secret is in the repository.

## Activation and funding

All five accounts were looked up read-only and **do not exist** on Testnet. Each needs creation and fees. Friendbot (`https://friendbot.stellar.org`; documented as funding a new account with 10,000 XLM, rate limited, per the Stellar documentation fetched 2026-11-03; the page lists no special requirement) is the intended route, **not requested**. Exact action awaiting approval: five Friendbot funding requests, one per public address. Funding more than needed is unavoidable because the amount is fixed. Testnet resets periodically.

## Legacy token and governed token (read-only, via Soroban RPC `simulateTransaction`, nothing submitted)

| Property | Legacy token | Governed token |
|---|---|---|
| Contract IDs | Match the manifest (read from it; not re-typed). The owner-supplied governed ID matched the manifest exactly | |
| Name, symbol, decimals | Tobin Test Token, TTT, 7 | Tobin Test Token, TTT, 7 |
| Total supply | 1,000,000,000 base units (100 TTT) | 1 base unit |
| Cap | 10,000,000,000,000 | 10,000,000,000,000 |
| Minter | The legacy deployer account (held by the project, recorded as never to be touched by tooling) | The administrative multisig account |
| Wasm | Same hash as the governed token in the manifest (identical code; only the minter differs) | |
| Interface | `mint`, `transfer`, `balance`, `total_supply`, `cap`, `minter`, `decimals`, `name`, `symbol`; custom, no allowance, no burn (`contracts/token/src/lib.rs`) | same |

**Clearing compatibility (confirmed in source).** `settle` calls `TokenClient::transfer(payer, payee, amount)` for each instruction (`contracts/clearing/src/lib.rs`, around lines 653 to 655); the session token must be a contract address (`create_session`, `BadAddressKind` otherwise). Both tokens therefore satisfy the clearing contract's use. The token's `transfer` requires `from.require_auth()`.

**Balances** of A to E on both tokens: **0** (read-only queries). The 100 TTT of legacy supply sits with accounts I did not enumerate (no on-chain holder listing was run).

**Usability for T6/T7:** the legacy token is technically usable (interface and cap fine), but the new accounts hold none of it. The governed token cannot be used (supply 1). Getting legacy balances to C and D needs either a transfer from an existing holder or a mint by the legacy minter, both outside the current authorization. **T6 and T7 are BLOCKED** until the owner approves one route.

## Balance requirements (proposal, derived from contract logic)

The contract accepts any positive `i128` amount. Proposed obligations: T6 C to E 1,000 units; T7 C to E 5,000 and D to E 3,000 (decimals 7, i.e. 0.0001 to 0.0005 TTT). Minimum holdings C 6,000, D 3,000; proposed allocation with margin for one retry: **C 10,000, D 6,000** base units. XLM: fees are small (earlier contract transactions cost 0.004 to 0.03 XLM); any Friendbot amount is ample.

## Test mapping

T3: A. T4/T5/T8/T9: A (creator) and B (joiner), five fresh sessions for T9. T6: A, C, E. T7: A, C, D, E (four participants, at the ceiling). T13: A, B, offline first. Details: [test-transaction-plan.md](test-transaction-plan.md). T13 preparation: reuse the existing offline mismatch tests (`authsigner` h1, h3, g3) and then compare an altered copy of the T4 entry with the intent before any submission.

## Outstanding approvals

1. Five Friendbot funding requests (exact action: one per public address, Testnet only).
2. Fixture transactions: create, join, obligation, finalize, propose, approve (about 8 + 5 + 3 + 2 + 2 + 7 sessions' transactions, listed in the transaction plan).
3. One route to give C and D legacy tokens (transfer from a holder, or mint by the legacy minter), with the amounts above.
4. Approval of the scratch helper page for T3 (from the previous report).

## Blockers

Settlement balances (T6, T7); unfunded accounts (T5 onward); no created sessions; no Freighter profile with the accounts imported; helper approval for T3.
