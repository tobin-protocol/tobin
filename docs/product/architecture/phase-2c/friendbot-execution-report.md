# Friendbot execution report (Phase 2C)

Executed 2026-11-03, 18:14:21 to 18:15:06 UTC, on the owner's explicit authorization: exactly five Friendbot POST requests, one per manifest address, Testnet only, no automatic retries.

## Pre-checks

- The manifest [test-accounts.public.json](test-accounts.public.json) holds exactly five unique addresses, each valid as a Stellar ed25519 public key (checked with the SDK's StrKey validator).
- Network: the manifest and the Testnet Soroban RPC both report the passphrase `Test SDF Network ; September 2015`; the RPC's reported Friendbot URL equals exactly `https://friendbot.stellar.org/`. The run would have aborted otherwise.
- Labels and addresses were printed before any request (below).

## Results

Each request: `POST https://friendbot.stellar.org/?addr=<address>`, one attempt, 90 second timeout (never reached), no retries. Every response was HTTP **200** with a JSON body containing exactly the fields `successful` (true), `hash` and `envelope_xdr`. The response did not include result meta, so confirmation came from the chain.

| Account | Role | Public address | HTTP | Transaction hash | RPC `getTransaction` | Horizon tx | Ledger | Fee charged | XLM balance (Horizon) | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| A | Session creator | `GDRHND3Y4FO6TM6ZT2TU27QO2TRNKOIXXWYBC75NW73DCYSTNSMYT5CR` | 200 | `4be2d98c78bec5a2706aa66b50f21939007d1fdf9870a8a08031dff5cc58427b` | SUCCESS | successful | 5541210 | 100 stroops | 10000.0000000 | **Funded** |
| B | Session joiner | `GB2G73P37CQCQR7U3RAZWRFJKLPEH2ONT3DC7E3FB5ADQRA3LPC4SV3T` | 200 | `0b3901b1b0b093f4eb8b466c94d93d4618081617d8545815d75e5c1d50a28a45` | SUCCESS | successful | 5541212 | 100 | 10000.0000000 | **Funded** |
| C | Debtor 1 | `GCWK6QC7WTDVUVFY7PAPKXJAIJXOOMNJMSDU3TM2WIXWAMM6VYEXOGWL` | 200 | `33ed881661c8bb6c0ceac176b24ba99d71583a406d4f7b6e2f7452c637daf86d` | SUCCESS | successful | 5541214 | 100 | 10000.0000000 | **Funded** |
| D | Debtor 2 | `GCFEEEECS4IRNQLIT6MFOX3TR6GBZ2IQ7SZ7RANG577QBLJ57TTR2DLJ` | 200 | `a7b5ec8a27c89e1031cfbf90b04b12961e8d107ecc139cbc697c30b83e0170c3` | SUCCESS | successful | 5541215 | 100 | 10000.0000000 | **Funded** |
| E | Creditor / recipient | `GB3VBLUGDDFBOT6CWMUUQAMUKNU7JQMDQDFBFA7G4NZBMK25TJU6EXUL` | 200 | `c8b6370c5b0da02041ad444824519e02fa1ea02523606fcaae421ee50934a2e0` | SUCCESS | successful | 5541217 | 100 | 10000.0000000 | **Funded** |

Each account now exists on Testnet with one signer and a native balance of exactly 10,000 XLM (read from Horizon, not assumed). The fee (100 stroops each) was charged to Friendbot as source, not to any Tobin account.

Summary: 5 funded, 0 failed, 0 inconclusive.

## Errors and uncertainty

None. No request timed out and none was repeated. Not examined: Friendbot's rate-limit headers (none acted on).

## Scope confirmation

No additional transaction was submitted by this task. No wallet was opened, no signature was made, no private key was read or displayed, no token transfer, mint or contract invocation occurred, and nothing was sent to any address outside the five in the manifest. No repository code, contract, landing or deployment file changed; the only repository edits were this report, the `activated` flags in the public manifest, and a README link. No commit, push, PR, deployment or Vercel change. The legacy-token transfers, setup transactions and wallet tests were not started.
