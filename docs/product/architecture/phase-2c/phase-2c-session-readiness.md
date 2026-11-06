# Phase 2C session readiness

Written 2026-11-03. State before the attended Freighter session. No wallet was opened and no signature requested. No secret appears here; none must ever be added.

## Repository state

Branch `main` at `5fa621e`. Working tree: untracked `docs/design-system/` and `docs/product/` only; no tracked file modified. Nothing committed, pushed or opened as a PR.

## Verified facts

| Item | Result | Source |
|---|---|---|
| Network passphrase (manifest) | `Test SDF Network ; September 2015` (Stellar Testnet) | `contracts/deployments/testnet.json` |
| RPC endpoint (manifest) | `https://soroban-testnet.stellar.org` | same |
| Clearing contract | Present in the manifest as `tobin_clearing_v1`, "immutable, no administrator or upgrade path"; ID is in the manifest, not repeated here | same |
| Governed token | The ID supplied by the owner was compared character for character with the manifest entry `tobin_test_token_governed`: **identical**. Status "intended MVP token"; recorded supply 1 base unit | same |
| Legacy token | Exists (`tobin_test_token`, status legacy, minter is the legacy deployer). Balances held by any account: **not established** | same |
| Authorization policy | `MAX_AUTH_LIFETIME_LEDGERS = 10` (`contracts/clearing/signer/mod.rs`): repository policy, not the protocol maximum (`sequence + max_entry_ttl - 1`, `soroban-env-host` 29.0.0) | source |
| Deployed Wasm hashes | Recorded in the manifest; not re-verified on-chain in this phase | manifest |

## Prerequisites still unconfirmed (owner to supply; public data only)

1. Disposable account addresses, labelled, for roles: creator, joiner, debtor 1, debtor 2 (T3 needs one).
2. Freighter version and browser version; Freighter set to Testnet.
3. XLM balances (Testnet) for fees, and for T6/T7 a usable token balance for each debtor. **The governed token cannot supply this** (supply 1 unit; minting prohibited). Whether the legacy token already gives the accounts balances is unknown; if not, T6 and T7 stay BLOCKED.
4. A session in the needed state for T4 to T7 (an open session with a known creator for joins; a settleable session for T6/T7). None is confirmed. Creating sessions or submitting obligations needs transactions that are in scope only where T5 to T9 list them; the owner should confirm which transactions may create the fixtures.

## Test readiness

| Test | Ready? | Note |
|---|---|---|
| T3 | **Ready once the helper is approved** | Needs one disposable account and no transaction |
| T4 | Not ready | Needs a real open session and creator/joiner accounts |
| T5 | Not ready | Same, plus two wallets (two Freighter profiles or browsers) |
| T6, T7 | Blocked | Token balances and a settleable session |
| T8, T9 | Not ready | Depend on T4/T5 working first |
| T10, T11, T12, T14 | Ready after T3 (same helper) | Wallet prompts only |
| T13 | Partly done offline; remainder after T3/T4 | Prefer pre-submission detection |

## Safety checklist (check before each prompt)

- Freighter network is Testnet; passphrase matches; helper shows it.
- Active account equals the expected disposable address shown by the helper.
- Contract ID, function and arguments in the helper equal the plan; the owner compares them with what Freighter displays.
- Entry expiration is above the current ledger and at most 10 ledgers ahead; entry not expired.
- No transaction is submitted unless the step says so.
- Stop on any mismatch; no retries with a different account or method without a report.
- No secrets in screenshots or documents.

## Proposed change needed to run T3 (awaiting owner approval; nothing created yet)

T3 cannot run with what is in the repository: there is no wallet page and no Stellar library installed. Proposal, with **no change to the repository**:

- A temporary static page and a tiny Node static server, both in the Claude scratchpad directory (outside the repository), bound to `127.0.0.1` only, deleted afterwards.
- It loads the already-downloaded browser bundles `stellar-sdk.min.js` (17.4.0) and Freighter `index.min.js` (6.0.1) from the scratch download (the repository gets no dependency).
- It reads the latest ledger from the Testnet RPC (read-only `getLatestLedger`) to set an expiration at current + 5.
- It builds one unsigned `SorobanAuthorizationEntry` for the owner's address with a harmless invocation of the clearing contract (`finalize_obligations(session 1, caller = owner)`), decodes and shows account, contract, function, arguments, network, nonce and expiration, then waits for the owner to click "Request signature".
- After Freighter returns, it verifies the signature offline against the preimage hash with the account's public key and checks the entry still equals the expected intent. It never submits anything.
- The page contains no key input.

If the owner approves, this is the **exact point where the attended session begins**: the owner opens the helper in the browser holding Freighter, confirms the displayed account and network, and operates the Freighter prompt.
