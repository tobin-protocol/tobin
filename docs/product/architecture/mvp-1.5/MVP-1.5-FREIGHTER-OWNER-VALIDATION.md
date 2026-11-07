# MVP-1.5 Freighter owner validation (Microsoft Edge, Stellar Testnet)

**Status: RUN once by the owner on 2026-11-07, all six checks PASS (evidence/owner-freighter-validation-2026-11-07.json).** Not yet recorded: the Edge and Freighter versions, the prompt texts and the negative variants (reject, wrong network, locked, disconnect). The account used was the administrative multisig account, not a second participant. Original status line: NOT RUN. This procedure needs the owner's installed Freighter extension in Microsoft Edge. No wallet result has been claimed. No fake or mocked wallet counts: the unit tests that use a hand-written wallet prove only Tobin's safety logic. Do not send private keys, seed phrases or signed envelopes; you will only paste back the non-secret evidence block.

## What this validates
Detection, connection, network, account, `signTransaction` of a harmless **unsubmitted** transaction, and `signAuthEntry` of a real network-returned **AddressV2** authorization entry through the official SDK. The last item is the single biggest unknown for a multi-party settlement (see the contract compatibility document). Nothing is submitted by this procedure.

## Prerequisites
1. Microsoft Edge with the Freighter extension installed. Freighter set to **Stellar Testnet** (Settings, Network). Use an account you control and that exists on Testnet (fund it from Stellar Friendbot if needed; this is a disposable test account, never a real-value account).
2. This repository checked out; Node 24; `npm install` done at the repository root (the SDK 17.4.0 and Freighter API 6.0.1 are pinned).
3. The application running locally, in production mode (the pages need the nonce-based CSP): `npm run build:console` at the root, then from `apps/web-console`: `TOBIN_DB_PATH=<a temp file> npm start`. Open **http://127.0.0.1:8787/sign-in** in Edge, register any local account and sign in.
4. Do not extract anything from Freighter's storage. Do not hardcode an extension id.

## Procedure
Open **http://127.0.0.1:8787/wallet-check** in Edge and press **Run validation**. Expected sequence and results:
| # | What happens | Expected |
|---|---|---|
| 1 | Detection | PASS if the browser is Edge and Freighter answers; otherwise FAIL with the state (UNAVAILABLE: extension missing or not answering) |
| 2 | Connect: Freighter shows a connection prompt for 127.0.0.1 | approve: PASS with a shortened public key. **Reject once on a separate run** and confirm FAIL "access refused" |
| 3 | Network | PASS only if the wallet reports Testnet. **Switch Freighter to Mainnet once** and confirm FAIL "wallet is on ..., expected Stellar Testnet" and that no signing prompt appears; switch back |
| 4 | Account check (read-only network read) | PASS if the account exists on Testnet |
| 5 | Freighter prompts to sign a transaction (a Soroban `create_session` call, source = your account) | review it: network Testnet, source your account, contract `CCV3EFEC...`, function `create_session`. Approve: PASS means the returned transaction is **identical** and carries a valid signature by your key. **Reject once on a separate run**: FAIL "REJECTED" is the correct result and nothing changes |
| 6 | Freighter prompts to sign an authorization entry (AddressV2) | approve: PASS means the SDK accepted the signature. A FAIL with an error message is **valuable evidence**: copy the message |
Also test: lock Freighter before pressing Run (expect NOT_ALLOWED or a FAIL at connect); close or disable the extension (expect UNAVAILABLE); change the active Freighter account between runs (a different public key is shown); refresh the page and rerun; disconnect or lock Freighter while a prompt is open (expect FAIL, no result recorded).

## Evidence to collect
After each run copy the **Evidence** block shown on the page (PASS/FAIL per step, browser name, shortened public key; no secrets) and note: Edge version, Freighter version (from the extension page), which prompts you saw, the exact text of the step 6 prompt if it appeared, and any error message. Paste these back.

## How the result is used
- Step 6 PASS: a single-key participant can authorize non-source steps through Freighter, so a two-party Testnet settlement becomes possible for single-key accounts.
- Step 6 FAIL: record the message. Options (owner decision, not taken here): another wallet path, or each non-source signer acts as the transaction source so no address entry is needed (possible only where a signer has no co-signer requirement and only one non-source party exists per transaction).
- Neither result changes the Rust signer, the contracts or the governance.

## Recovery
Nothing is submitted, so there is nothing to undo. If Freighter shows the wrong network, switch to Testnet and rerun. Remove the temp database file when finished. If anything unexpected is prompted (a payment, a send, an unknown contract), **reject it and stop**: this procedure never asks you to approve a transfer.

## Second session (2026-11-07): stage 1 and stage 4 owner procedures
Server: `http://127.0.0.1:8787` (production build; throwaway database). Edge, Freighter on Stellar Testnet.
**Stage 1: a separate funded account, ownership proven through Freighter.**
1. In Freighter add a NEW account (Add account / create), switch the network to Testnet and use Freighter's "Fund with Friendbot" (or the official Stellar Testnet Friendbot) for that account. Do not reuse the administrative account.
2. Open `/sign-in`, register a local account, create an organization on `/organizations`.
3. On `/organizations` under "Stellar account verification": network testnet, paste the NEW account's public key, "Request challenge", press **Sign with Freighter** (Freighter must be on that account; approve the message-signing prompt), then **Verify signature**. If the server refuses the SEP-53 scheme, choose raw and repeat the signing; report which scheme worked.
4. Send back the public key and what the page showed. I then run `scripts/testnet-account-check.mjs` (existence, funding, distinct from the administrative account) and record the evidence.
**Stage 4: co-signing the administrative account (harmless, cannot execute, not submitted).**
1. Open `/cosign-check`. Press 1 (prepare): the page reads the live signer set.
2. Switch Freighter to the **Founder** account (`GB4NFB...UME6OL`), press "Sign as founder", approve. Switch to the **Security** account (`GATMFO...25AP`), press "Sign as security", approve. Press "Verify with the server".
3. Expected: PASS, weight 6 of threshold 6, unchanged since prepared true, signer set fresh true, policy true. Paste back the Evidence block (no signatures are shown). If a Freighter prompt refuses because the transaction source is not the active account, copy the exact message: that is valuable evidence.
Reject any prompt that asks to send or pay. No step submits anything.
