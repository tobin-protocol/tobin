# W2 scope and method (Stage 1 checkpoint)

Written 2026-11-06. **Nothing has been submitted, signed, installed or contacted.** This file is the mandatory checkpoint. No state-changing transaction and no wallet signature happens until the owner approves section 9 in writing. Evidence labels: VERIFIED (read in source this session), DOCUMENTED (a repository document says so), UNVERIFIED.

## 1. Contract findings (VERIFIED, `contracts/clearing/src/lib.rs`)

| Function | Authorization | Notes |
|---|---|---|
| `create_session(creator, session_id, token, max_participants, max_obligations)` | `creator.require_auth()` | `token` must be a contract address; capacity 2..4 participants, 1..16 obligations; creator auto-admitted; `SessionExists` if the id is reused |
| `join_session(session_id, participant)` | `participant.require_auth()` **and** `creator.require_auth()` (two separate entries, same call) | OPEN state only; fails on duplicate or full session |
| `submit_obligation`, `finalize_obligations`, `propose_settlement`, `approve_settlement` | one address each | not needed for W2 |
| `settle(session_id, digest)` | each debtor via `require_auth_for_args` plus nested token `transfer` auth | needs token balances (see 7) |

Reads (`get_session` etc.) need no authorization.

## 2. SDK findings (VERIFIED)

- `Transport` (`packages/mvp1-sdk/src/sdk/transport.ts`) is `invoke(call, options)`: it takes a `PreparedCall` and returns a result. It has **no** notion of simulation, authorization-entry collection, signer callbacks, source account, fee, submission, polling or confirmation. The only network implementation is `NetworkTransportNotAuthorized`, which throws. **The existing SDK does not support Freighter or any network path.** The Transport interface alone is not enough for a wallet flow (see 3).
- `prepare.ts` (`prepareCreateSession`, `prepareJoin`, ...) states the call and its required signers as data (`AuthRequirement`). Reusable as is.
- `intent.ts` builds an `ExpectedIntent` from a `DeploymentRecord` and the requirements, to be compared against every entry before signing. Reusable as is; this is the anti-blind-signing check.
- No wallet or Stellar JS library is installed in the repository (DOCUMENTED, `wallet-validation-results.md`). Freighter evidence level today is L1 (a function exists in typings), nothing more.

## 3. Proposed wallet integration boundary

Keep `Transport`, `prepare` and `intent` unchanged. Add, **outside the repository**, a throwaway validation harness (scratch directory) containing:

1. `WalletAdapter` (validation form): `isAvailable`, `connect`, `getAddress`, `getNetwork`, `signAuthEntry(preimageXdr, {address, networkPassphrase})`, `signTransaction(envelopeXdr, ...)`. Thin wrappers over `@stellar/freighter-api` 6.0.1.
2. `RpcClient`: `getLatestLedger`, `simulateTransaction`, `sendTransaction`, `getTransaction`, `getEvents` over the public Testnet RPC.
3. A scripted flow: simulate, extract each unsigned `Address` entry, run the `intent.ts` check, set expiration, ask the wallet to sign the **preimage**, insert the signature, re-simulate, sign the envelope with the submitter's wallet, send, poll.

Why the existing abstraction is insufficient: `Transport.invoke` is a single synchronous-looking call, but a real invocation has a multi-party, multi-minute phase between simulation and submission. A network transport must therefore be split into **prepare (simulate, produce entries) / collect signatures / submit and confirm**. That is a finding to confirm in the report, not a design commitment for the product.

The harness serves only these fixed operations and refuses any entry whose tree is not exactly the expected one. No general "sign this XDR" path exists.

## 4. Test operation and arguments

Representative operation: **`join_session`**, the only existing call with two independent authorizations that needs no token balance, no minting and no shared or administrative state.

Setup uses a **new session** on the existing clearing contract (public Testnet, the address recorded in `contracts/deployments/testnet.json`): a fresh random 32-byte id, `token` = the governed token address (named only, never called), `max_participants` 3, `max_obligations` 1. The session is isolated; nothing existing is modified. The governed token is not touched (no mint, no transfer, no TTL extension).

Accounts (public keys, `test-accounts.public.json`; all disposable, funded by Friendbot on 2026-11-03, balances to be re-read before use):
- A `GDRHND3Y...T5CR` creator.
- B `GB2G73P3...SV3T` first joiner.
- C `GCWK6QC7...OGWL` second joiner (expiry and timing test).
- E `GB3VBLUG...EXUL` transaction source and fee payer only. Using a source distinct from A, B and C forces A, B and C to authorize through explicit `Address` credentials (signed entries with an expiration). If A or B were the source, its authorization would come from the envelope signature (source-account credential) and the entry expiry would not be tested.

## 5. Expected authorization entries

| Tx | Entries (credential kind Address) | Root invocation |
|---|---|---|
| T-1 `create_session` | one: A | `create_session(A, S, token, 3, 1)` |
| T-2 `join_session(S, B)` | two: B and A, same tree, **separate nonces and separately signed** | `join_session(S, B)` |
| T-4 `join_session(S, C)` | two: C and A | `join_session(S, C)` |

Expected from the SDK: `prepareCreateSession` and `prepareJoin` already declare exactly these requirements. To be confirmed by simulation (UNVERIFIED until run): simulation returns the entries with a placeholder expiration; the harness replaces it.

## 6. Expected state changes

- T-1: session S exists, OPEN, participants [A]; events SessionCreated and ParticipantJoined.
- T-2: participants [A, B].
- T-4: participants [A, B, C]; session full.
- Failures (expired, tampered, duplicate): no change. Everything else on-chain is untouched. XLM fees only, taken from E.

## 7. What W2 can and cannot show (honest limits)

- **Settlement (`settle`) is not testable**: it needs token balances for debtors, minting and transfers are prohibited, and the governed token supply is 1 base unit. W2 therefore establishes multi-party authorization with `join_session`, whose two-signer shape is the same as a multi-debtor `settle` entry set, but it does **not** demonstrate nested token-transfer authorization through a wallet. That remains open and is recorded as a limitation for W3.
- **Independence**: A, B, C and E are all disposable accounts controlled by one person. Using separate Freighter profiles or devices shows that separate wallet instances can sign the same logical operation. It is **not** evidence of independent organizational authorization and will not be reported as such. If a second person can hold B's key in their own Freighter, the report will say so and treat that as stronger evidence.
- Freighter's behavior with auth entries (what `signAuthEntry` expects and returns, what it displays) is UNVERIFIED and is the first thing tested.

## 8. Expiry methodology

Policy under test, unchanged: `current < expiration <= current + 10` (`contracts/clearing/signer/mod.rs`, `MAX_AUTH_LIFETIME_LEDGERS`). Where assigned: the signer or harness sets `signature_expiration_ledger` on each `Address` entry before signing; it is part of the signed preimage; the network enforces it at apply time against the ledger of inclusion. The 10-ledger cap is **policy enforced by our own tooling, not by Stellar or the contract**; the network maximum is separate and unmeasured (UNVERIFIED).

Measurements (all with a human approving wallet prompts):
1. Read the latest ledger L0 from the RPC immediately before building entries. Record wall-clock time and ledger at each step: entries built, prompt shown, A signed, B signed, assembled, re-simulated, submitted, included.
2. Shared or separate expiry: observe whether entries for the same operation carry independent expirations (expected: yes, each entry has its own nonce and expiration; the harness sets both to the same value). Test whether one expiration can be shorter than the other.
3. Delay: in T-4 the second signer waits deliberately; record the ledger elapsed and the result.
4. Expired: T-3, an entry signed with expiration at current + 3, submitted after the ledger passes (one attempt).
5. Reconstruction: after expiry, re-simulate; record whether previously signed entries can be reused (expected: no, the preimage includes the nonce and expiration, and a new simulation yields new nonces; to be confirmed), and that no earlier signature becomes valid for a changed tree.
6. Rejection: reject the wallet prompt; record the wallet error and that no state changes.
7. Ledger close time is measured from the observed ledger timestamps, not assumed (the repository assumes about 5 s, UNVERIFIED).

Never changed: the 10-ledger value, contract rules, thresholds.

## 9. Exact on-chain submissions requested for approval

| # | Submission | Source | Signers | Expected | Counts as |
|---|---|---|---|---|---|
| T-1 | `create_session(A, S, governed-token, 3, 1)` | E | A entry; E envelope | SUCCESS | setup |
| T-2 | `join_session(S, B)` | E | B entry, A entry; E envelope | SUCCESS | independent two-signer authorization |
| T-3 | `join_session(S, C)` with entries expiring at current + 3, submitted late | E | C, A entries; E envelope | REJECTED (expired), no change | expiry |
| T-4 | `join_session(S, C)` with fresh entries, deliberately delayed signing | E | C, A entries; E envelope | SUCCESS (or expiry, recorded either way) | delay and timing |
| T-5 | resubmission of the T-2 envelope unchanged | E | none new | REJECTED (duplicate or bad sequence/nonce), no change | duplicate submission |

At most **5 submissions**, XLM fees only (earlier Testnet contract transactions cost tens to hundreds of thousands of stroops each). If T-3 is rejected at simulation or at submission before inclusion, that is recorded as the result and no fee is spent.

Everything else (wrong network, wrong account, disconnected wallet, Freighter unavailable, failed simulation, tampered entry, invalid signature, RPC timeout, unconfirmed transaction) is tested **without submitting**: wallet prompts, simulation, offline preimage checks, and failure injection in the harness (a fault-injecting RPC wrapper). A pending, failed or unknown transaction is displayed as such, never as settled.

## 10. Safety assessment

- Only a new session on the existing clearing contract is created. No existing session, token, admin account, multisig, master key, TTL or deployment is touched. No contract call can mint, transfer or change governance: the proposed calls are `create_session` and `join_session` only.
- Contract ceilings: the new session uses 3 of 4 participants and 1 of 16 obligations; consumes a little persistent storage on Testnet (no cost issue). Testnet resets would remove it; nothing depends on it.
- No private key, seed, keystore or DPAPI material is read; keys are held only by the owner in Freighter. The real signer (`tst-signer.cjs`) is not run. B0/B1 baselines, manifests and the expiry policy are unchanged.
- Risk: Freighter may display an opaque payload (blind signing). Mitigation: the harness shows the decoded intent and refuses to request a signature unless the tree equals the expected one; the owner reviews each prompt.
- Risk: the harness downloads npm packages. They go to a scratch directory outside the repository and are never installed into it. Versions already inspected: `@stellar/freighter-api` 6.0.1, `@stellar/stellar-sdk` 17.4.0.

## 11. Dependencies and requirements for the owner

1. Approval of section 9 (and the package download in a scratch directory, and a localhost helper page I run for you to use in your browser).
2. Freighter installed, unlocked, set to Testnet, with disposable accounts A, B, C and E imported by **you** (I never see keys). Please state the Freighter and browser versions.
3. Preferably two separate Freighter profiles or devices (A in one, B in the other); ideally a second person for B.
4. You present to approve each wallet prompt, and confirmation that A, B, C and E still hold XLM (I will read balances from Horizon, read-only).

## 12. Expected evidence

Per test: id, status (PASS/FAIL/BLOCKED), public keys, network passphrase, contract address (abbreviated in tracked docs, to pass the release scan), session id, transaction hashes, ledgers, simulation output summaries, decoded entries (expiration, nonce, signer), wallet error strings, timings, and independent verification by reading `get_session` and the transaction through the RPC and a public explorer. Reports to be written after approval: `W2_WALLET_VALIDATION_REPORT.md`, `W2_AUTHORIZATION_FLOW.md`, `W2_EXPIRY_ANALYSIS.md`, `W2_EVIDENCE.md`, `W2_DECISION_RECOMMENDATIONS.md`.

## 13. Stage order after approval

1. Offline: T1 (known-answer preimage) and T2 (Freighter API typings), no wallet.
2. Wallet-only, no submission: detection, connect, account change, disconnect, network checks, rejection, a signature over a harmless entry (T3).
3. Submissions T-1 to T-5, stopping at the first unexpected result.
4. Reports, then stop for owner review.

**Stopped here. Awaiting owner approval.**

## Stage 2 implementation clarifications (2026-11-06)
- Stage 1 findings stand. New: Testnet is on protocol 30 and simulation returns `AddressV2` credentials; stellar-sdk 17 uses a new object model (plain typed objects, operations not write-through), so the helper rebuilds the transaction to insert signed entries.
- The exact operations are unchanged. T-2 cannot be simulated before T-1 is on-chain.
- The helper is in `docs/product/architecture/w2/helper/` (source only; run it with a scratch `node_modules` outside the repository and a local `config.json`). It exposes only `create`, `join_B`, `join_C`.
- Submission checkpoint: see `W2_EXECUTION_RECORD.md`.
