# Authorization security findings (Phase 2C)

Written 2026-11-03. Based on source and offline tests only; no wallet or network evidence was produced in this phase.

| Topic | Finding | Evidence | Label |
|---|---|---|---|
| Intent validation | A signer must compare every entry to an expected typed intent (contract, function, signer, arguments, nested transfers, network) before signing. The local signer does so and refuses mismatches atomically; the SDK builds the settlement intent from the debtor's own approved digest | `authsigner` h0 to h5, `authintents` p0, `packages/mvp1-sdk/src/sdk/intent.ts` | Confirmed in source; offline tests pass |
| Wallet signature is not proof of correctness | Nothing in the wallet API typings returns a verification of what was signed; the application must verify the returned signature against its own preimage | `freighter-api` typings | Confirmed in source |
| Browser enforcement | No browser adapter exists, so these checks are **not yet enforced in the browser flow** | Repository search | Confirmed in source |
| Replay | A failed transaction rolls back nonce consumption; signed entries stay reusable until expiry (founder record EQ-20; observed locally and on Testnet in earlier phases). SDK refuses a second round of one settlement authorization (`ReauthorizationRequired`) | `client.ts`; founder record | Confirmed in source; earlier experimental evidence, same author |
| Safe retry | After any failed settlement, discard all collected entries and re-collect fresh ones; never resubmit the same envelope. Within the remaining validity window a leaked signed entry could be submitted by anyone, but only for exactly the signed invocation | Policy plus contract design | Strong inference |
| Expiry | Policy 10 ledgers; protocol ceiling `sequence + max_entry_ttl - 1`. Offline boundary tests pass. **No wallet round-trip timing exists (T9 not run)**, so adequacy of 10 ledgers is unresolved | `signer/mod.rs`, `soroban-env-host` 29.0.0, `g5`, `g8` | Confirmed in source; adequacy Unverified |
| Nested invocation | Settlement entries carry token `transfer` sub-invocations; the signer rejects deviations in amount, recipient, order. The wallet's display of these is unknown | `h1` | Offline pass; wallet display Unverified |
| Error handling | Expired, partial and rejected signatures from a wallet are not characterized | Not run | Unverified |
| Wallet display | Unknown whether Freighter shows a decoded tree or an opaque payload (T14 not run). The application must therefore always show its own decoded, verified summary | Not run | Unverified |
| Credential kinds | Wallets may produce non-legacy credentials; the signer fails closed on `AddressV2`, `AddressWithDelegates`, `SourceAccount` | `g10` | Confirmed in source |
| Distinct concepts | Authentication, entry signing, envelope signing, submission, confirmation must stay separate states in the UI and data model | Design | Policy |
| Test-asset gap | Cross-implementation vector test (`authvectors`) and fixture are missing from this checkout; known-answer intent fixture withheld pending attribution review | Directory listing; skipped test message | Confirmed |

## Remaining threats

Blind signing if the wallet shows only a hash and the application's summary is wrong; a compromised front end showing a benign summary; signing-window pressure from the 10-ledger limit leading to rushed approvals; third-party submission of leaked, still-valid entries; unreviewed new dependencies in the browser.
