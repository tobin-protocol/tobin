# Friendbot funding plan (Phase 2C)

Written 2026-11-03. **No Friendbot request has been made.** This document prepares five individual requests for approval.

## Verified before approval (read-only)

| Check | Result | Method |
|---|---|---|
| Endpoint | `https://friendbot.stellar.org/` is the Friendbot URL that the Testnet Soroban RPC itself reports in `getNetwork` (with passphrase `Test SDF Network ; September 2015`, protocol version 30) | Read-only RPC call, 2026-11-03 |
| Request form | An HTTP **POST** to `https://friendbot.stellar.org/?addr=<URL-encoded G address>`, as implemented by `@stellar/stellar-sdk` 17.4.0 (`Server.requestAirdrop`, `lib/esm/rpc/server.js`). The Stellar documentation page fetched the same day names the endpoint but does not document the query form | Package source read |
| Expected amount | 10,000 XLM per new account, rate limited; also stated: Testnet resets clear accounts and balances | Stellar documentation (networks page) |
| Expected response | The SDK expects a JSON body with `hash` and optionally `result_meta_xdr`; if the meta is absent it calls `getTransaction(hash)` and requires status SUCCESS | Package source read; the live response format is Unverified until the first request |
| Accounts do not exist | All five returned HTTP 404 from Horizon (`/accounts/<address>`) and "not found" from the RPC account lookup | Read-only, 2026-11-03 |

## The five requests

| # | Account | Public address (equals [test-accounts.public.json](test-accounts.public.json)) | Request |
|---|---|---|---|
| F1 | A, creator | `GDRHND3Y4FO6TM6ZT2TU27QO2TRNKOIXXWYBC75NW73DCYSTNSMYT5CR` | `POST https://friendbot.stellar.org/?addr=GDRHND3Y4FO6TM6ZT2TU27QO2TRNKOIXXWYBC75NW73DCYSTNSMYT5CR` |
| F2 | B, joiner | `GB2G73P37CQCQR7U3RAZWRFJKLPEH2ONT3DC7E3FB5ADQRA3LPC4SV3T` | same form with this address |
| F3 | C, debtor 1 | `GCWK6QC7WTDVUVFY7PAPKXJAIJXOOMNJMSDU3TM2WIXWAMM6VYEXOGWL` | same form |
| F4 | D, debtor 2 | `GCFEEEECS4IRNQLIT6MFOX3TR6GBZ2IQ7SZ7RANG577QBLJ57TTR2DLJ` | same form |
| F5 | E, creditor | `GB3VBLUGDDFBOT6CWMUUQAMUKNU7JQMDQDFBFA7G4NZBMK25TJU6EXUL` | same form |

Each address was compared against the generated public manifest; they are identical to the stored public list.

## Execution rules (if approved)

1. One request per address, in the order F1 to F5, **no retries in a loop**; on a failure or rate-limit response, stop and report.
2. The request carries no credential and no secret; nothing is signed by any Tobin account.
3. Friendbot, not a Tobin account, pays the transaction fee and is the source; no existing project wallet is involved.
4. After each response: record the returned hash; confirm with `getTransaction(hash)` status SUCCESS on the RPC and with Horizon `/accounts/<address>` showing a native balance of about 10,000 XLM (and the account now existing).
5. Record only: address, hash, ledger, balance. Mark the result PASS only after the on-chain check.

## Side effects and risks

Creates five Testnet accounts that persist until the next Testnet reset; uses Friendbot rate allowance; 50,000 XLM of play money is more than needed but the amount is fixed. No effect on any Tobin contract, token supply or governance.

## Approval requested

APPROVE / DECLINE: five Friendbot POST requests F1 to F5 as above, Testnet only.
