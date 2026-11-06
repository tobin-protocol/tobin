# Wallet validation results (T3 to T14)

Written 2026-11-03. **No wallet test was executed in this session.** No real signature was requested, no Testnet transaction was submitted, and no transaction hash exists to report. Every status below is BLOCKED or NOT RUN, with the exact reason. Nothing is marked PASS.

## Why the wallet tests did not run

| # | Blocker | Evidence |
|---|---|---|
| 1 | **No interactive wallet channel.** The tests need the Freighter browser extension, unlocked, with at least two disposable Testnet accounts, and a human approving each prompt. The Claude Code session has no control of an extension popup. Earlier envelope signing was done only by running a temporary localhost helper that the account holder operated in their own browser | Engagement record (governed-token activation) |
| 2 | **No browser-side Stellar library in the repository.** `@stellar/stellar-sdk`, `@stellar/freighter-api` and the wallet kit are not installed (`node_modules/@stellar` does not exist). Building entries and a wallet page needs them; installing dependencies is prohibited, and a helper is an "existing harness change" that the instructions say to report before making | Directory check; Phase 2C section 10 |
| 3 | **Settlement tests need token balances that cannot be created.** The governed token's recorded supply is 1 base unit (`contracts/deployments/testnet.json`, `supply.current`), and minting, supply changes and unapproved funding are prohibited. Balances of the legacy token held by participant accounts were not established | Manifest; Phase 2C section 2 |
| 4 | **Account identities and funding are unconfirmed.** No disposable account addresses, balances, extension version, browser version or current ledger have been recorded; the preconditions list for Workstream B was therefore not satisfiable | This session |
| 5 | **Source-account and join preconditions.** A join needs a session in the Open state with a creator account whose wallet is available; none has been confirmed | Contract source |

Per the instructions ("If the existing test environment lacks sufficient Testnet funds or tokens, STOP and report the blocker"), the affected tests were stopped, not worked around, and no mock was used as evidence.

## Test status

| Test | Objective | Status | What is and is not known |
|---|---|---|---|
| T3 | Freighter signs a simple entry | **BLOCKED** (1, 2, 4) | API signature known from the package; behavior unknown |
| T4 | Joiner entry | **BLOCKED** (1, 2, 4, 5) | Not run |
| T5 | Creator entry and join submission | **BLOCKED** (1, 2, 4, 5) | No transaction submitted |
| T6 | Single-debtor settlement | **BLOCKED** (1, 2, 3) | No transaction submitted |
| T7 | Two-debtor settlement | **BLOCKED** (1, 2, 3) | No transaction submitted |
| T8 | Expiration | **NOT RUN** | Offline expiry rules covered by T1 (see non-signing validation); no network result |
| T9 | Ten-ledger timing, five repetitions | **NOT RUN** | No measurements exist. **No recommendation on the 10-ledger policy can be made from evidence.** Only the structural facts in the Phase 2B B4 analysis stand |
| T10 | Wallet rejection | **NOT RUN** | Needs the wallet prompt |
| T11 | Wrong account | **NOT RUN** | Offline signer-identity checks covered by T1; wallet behavior unknown |
| T12 | Wrong network | **NOT RUN** | Network passphrase is part of the signed preimage (T1); wallet network detection unknown |
| T13 | Tampering | **PARTIAL** | Offline mismatch detection is covered by the existing signer and SDK tests (see non-signing validation). No Testnet tampering submission was attempted and none is needed to establish the offline result |
| T14 | Wallet signing display | **NOT RUN** | Needs the wallet UI |

## Transactions submitted

None. No transaction hashes, ledger numbers or fees exist for Phase 2C.

## What a session with the account holder would need

1. The two or more disposable Testnet addresses, the Freighter and browser versions, and confirmation that each account is funded with XLM and holds a usable token balance for settlement tests (or a decision on how balances may be obtained).
2. Approval to run a temporary localhost helper page in the scratchpad (not in the repository) that loads the SDK and Freighter API from a scratch download rather than installing into the repository.
3. The account holder present to approve each wallet prompt, with the run stopping at any condition in Phase 2C section 2.

Evidence levels after this session are unchanged from Phase 2B: Freighter L1 only.
