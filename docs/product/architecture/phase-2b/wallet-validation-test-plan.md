# Wallet validation test plan (Phase 2B, B5)

Written 2026-11-03. **None of these tests has been run.** Tests marked **PENDING EXPLICIT TESTNET AUTHORIZATION** need a real Testnet transaction or a real wallet signature and must not be executed until the founder authorizes them in writing. Every test uses disposable Testnet accounts with keys held only in the wallet or a disposable location outside the repository; no key, seed or keystore is read by Claude.

Common rules: Testnet only; record wallet name and version, browser and version, network passphrase, ledger numbers and timings; capture evidence without secrets; stop on any unexpected prompt to sign something other than Testnet.

| ID | Test | Real Testnet tx? | Gate |
|---|---|---|---|
| T1 | Offline: build the preimage for a known entry with the SDK and compare with the signer's known-answer fixture | No | May run now (offline) |
| T2 | Freighter API surface: confirm `signAuthEntry` signature and return type from the installed typings and official docs | No | May run now (read-only) |
| T3 | Freighter signs a **simple** entry (single invocation, one account) and the signature verifies offline | No (sign only, not submitted) | **PENDING EXPLICIT TESTNET AUTHORIZATION** (real wallet signature) |
| T4 | Freighter signs a Tobin **join** entry as the joiner | Yes | **PENDING EXPLICIT TESTNET AUTHORIZATION** |
| T5 | A second wallet profile signs the **creator** entry for the same join; the submitter assembles and submits | Yes | **PENDING EXPLICIT TESTNET AUTHORIZATION** |
| T6 | Freighter signs a **settlement** entry with nested token transfers (one debtor) | Yes | **PENDING EXPLICIT TESTNET AUTHORIZATION** |
| T7 | Two debtors in two wallets settle one session | Yes | **PENDING EXPLICIT TESTNET AUTHORIZATION** |
| T8 | Expired entry: sign, wait past expiration, submit; expect rejection | Yes | **PENDING EXPLICIT TESTNET AUTHORIZATION** |
| T9 | Round-trip timing against the 10-ledger policy (read ledger, request, review, sign, assemble, submit) | Yes | **PENDING EXPLICIT TESTNET AUTHORIZATION** |
| T10 | User rejects the signature prompt; the application recovers with no state change | No | **PENDING EXPLICIT TESTNET AUTHORIZATION** (real wallet prompt) |
| T11 | Wrong account connected for the requested signer; the application detects and refuses | No | **PENDING EXPLICIT TESTNET AUTHORIZATION** (real wallet) |
| T12 | Wrong network selected in the wallet; the application detects and refuses | No | **PENDING EXPLICIT TESTNET AUTHORIZATION** (real wallet) |
| T13 | Tampered entry: change an amount after signing; expect protocol rejection | Yes | **PENDING EXPLICIT TESTNET AUTHORIZATION** |
| T14 | What the wallet displays for an entry (opaque or decoded), recorded with screenshots | No | **PENDING EXPLICIT TESTNET AUTHORIZATION** (real wallet) |
| T15 | Stellar Wallets Kit: confirm Albedo and Ledger modules refuse `signAuthEntry`, and record the error | No | May run now if it needs no wallet; otherwise pending |

## Per-test detail

### T1 Offline preimage known-answer check
- **Preconditions:** repository checked out; `contracts/clearing/tests/fixtures/auth-vectors.json`; no network.
- **Wallet setup:** none.
- **Steps:** run the existing authvectors test (`contracts/clearing/tests/authvectors.rs`) and compare the SDK-side preimage construction in `packages/mvp1-sdk` with the fixture bytes.
- **Expected:** byte-identical preimage and digest.
- **Failure:** any difference means a browser-built preimage cannot be trusted.
- **Evidence:** test output. **Tx needed:** no.

### T2 API surface
- **Steps:** read the package typings for `signAuthEntry`; read the official Freighter documentation page for it.
- **Expected:** a documented input (preimage format) and output (signature encoding, signer address).
- **Failure:** the documentation contradicts the typings or omits the format; record as Unverified.
- **Evidence:** typings excerpt and documentation URL with date. **Tx needed:** no.

### T3 Simple entry
- **Preconditions:** a disposable Testnet account in Freighter; an entry built by the SDK for a trivial invocation never submitted.
- **Steps:** request signature; verify the signature offline against the preimage with the account's public key.
- **Expected:** signature verifies. **Failure:** invalid signature, wrong encoding, refusal.
- **Evidence:** preimage hash, signature, verification result. **Tx needed:** no submission; real wallet signature required, hence pending.

### T4 to T7 Tobin entries
- **Preconditions:** the Testnet deployment from Phase E or a fresh disposable deployment authorized separately; funded accounts; a session in the required state.
- **Steps:** the SDK prepares the call (`prepareJoin` or `prepareSettle`); the application reads the current ledger from the RPC and sets expiration within 10 ledgers; each party's wallet signs its own entry; the submitter signs the envelope and submits through the RPC; read the result and events.
- **Expected:** the transaction succeeds; the session state and balances change as expected.
- **Failure:** wallet refusal, signature rejection (`Auth` error), expiration, wrong preimage.
- **Evidence:** transaction hash, ledger, decoded result, events, timings. **Tx needed:** yes.

### T8 Expiry
- **Steps:** sign with expiration at current + 3; wait for ledger > expiration; submit.
- **Expected:** rejected with "signature has expired". **Failure:** accepted (would be a serious finding).

### T9 Timing
- **Steps:** repeat T4 five times with a human performing the approval; record elapsed ledgers from "request" to "submitted".
- **Expected:** a distribution; the policy is viable only if signing reliably completes within 10 ledgers.

### T10 to T12 Application behaviour
- **Expected:** the application shows typed, plain-language errors; no pending action is left; nothing is submitted.

### T13 Tamper
- **Expected:** the protocol rejects because the entry no longer matches (`Auth` error); the application's pre-signing intent check (as in `packages/mvp1-sdk/src/sdk/intent.ts`) catches it before signing.

### T14 Display
- **Expected:** record whether the wallet shows the contract, function, arguments and nested transfers. If it shows only a hash, blind signing applies and the application must show the decoded intent itself ([security-model.md](security-model.md)).

### T15 Kit modules
- **Expected:** Albedo and Ledger modules return an unsupported error for `signAuthEntry`.

## Success criteria for closing the wallet decision

- L3 reached for Freighter on T4, T5 and T6.
- L4 reached on T7 with two wallet profiles.
- T9 shows the 10-ledger policy workable, or the founder decides W3.
- L5 is claimed only after one full session (create, join, obligations, finalize, propose, approve, settle) with wallet signatures only.
