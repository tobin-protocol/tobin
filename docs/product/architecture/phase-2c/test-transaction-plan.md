# Test transaction plan (Phase 2C)

Written 2026-11-03. **Nothing here was submitted.** Contract functions are those of `contracts/clearing/src/lib.rs` and the token's `transfer`. Contract IDs are those in `contracts/deployments/testnet.json` (not repeated here). Fees are not predicted: earlier recorded Testnet figures for contract transactions are of the order of tens to hundreds of thousands of stroops (for example 130,150 stroops for a multisig mint), far below one XLM; measured fees for these calls do not yet exist.

## Classes

- **A. Already authorized** (explicitly listed by the owner: T4 to T9, T13): the transactions that are themselves the test.
- **B. Setup and funding requiring additional approval**: they create the preconditions. The owner's brief did not authorize funding, minting or setup transactions.
- **C. Unnecessary.**

## A. Authorized test transactions

| ID | Purpose | Source account | Authorization signers | Contract.method(args) | Token needed | Expected state change | Submits? | Prerequisite |
|---|---|---|---|---|---|---|---|---|
| T3 | Simple entry | none | A (entry) | clearing.`finalize_obligations(session, A)` example, never submitted | none | none | No | Funded? Not needed for signing; the account need not exist |
| T4 | Joiner entry | none | B (entry) | clearing.`join_session(S1, B)` | none | none | No | Open session S1 created by A (class B transaction) |
| T5 | Join | A or B (submitter, one only) | A and B entries over the same tree | clearing.`join_session(S1, B)` | none | S1 participants gain B | Yes | T4 passed; S1 exists; the source account funded |
| T6 | Single-debtor settlement | one of A/C/E | C entry covering `settle(S2, digest, total)` plus nested `token.transfer(C, E, amount)` | clearing.`settle`; token.`transfer` | C holds at least the amount | C balance down, E balance up by the amount; S2 Settled | Yes | S2 reached Approved (class B transactions) |
| T7 | Two-debtor settlement | one of A/C/D/E | C and D entries each with own nested transfer | clearing.`settle` | C and D hold their amounts | both debtors down, E up by the sum; S3 Settled | Yes | S3 Approved |
| T8 | Expired entry | one funded account | entry for a join or similar, deliberately expired | e.g. `join_session` | none | rejected, no change | Yes (one) | T5 working. Costs a fee; one attempt only |
| T9 | Timing, 5 repetitions | A or B | A and B per join | `join_session` on five fresh sessions S4 to S8 | none | five joins | Yes (5) | five sessions created (class B) |
| T13 | Tamper | none first | n/a | offline mismatch check; only if necessary a single altered submission | none | none | Only if necessary and safe | T4 |

Fixed policy: expiration at most current + 10 ledgers; read the current ledger from the RPC before each signing; a failed settlement means collecting fresh entries.

## B. Setup transactions requiring additional approval

| Item | Why needed | Who signs | Notes |
|---|---|---|---|
| Fund A to E with Testnet XLM via Friendbot | Accounts must exist and pay fees. Account B must exist to be a transaction source or sign envelopes | Not signed: a Friendbot request | Friendbot: `https://friendbot.stellar.org`, 10,000 XLM per new account, rate limited, as stated in the Stellar documentation fetched 2026-11-03. Not requested. Funding more than needed cannot be avoided (fixed amount) |
| `create_session` for S1 to S8 | Sessions for T4 to T9 | A | 8 transactions. T3 needs none |
| `join_session` for C, D, E into S2 and S3 | Settlement participants | creator A plus each joiner | 2 joins for S2 (C, E), 3 joins for S3 (C, D, E) |
| `submit_obligation` | Debtors' obligations | C (S2, S3), D (S3) | 3 transactions |
| `finalize_obligations`, `propose`, `approve` | Reach Approved | any participant, then every participant | S2: 1 + 1 + 3 approvals; S3: 1 + 1 + 4 approvals |
| **Token balances for C and D** | Settlement moves tokens | A token holder transfers, or the token's minter mints | See report: not possible within current authorization |

Proposed amounts (proposal only; any positive amount is valid, `BadAmount` otherwise): S2: C owes E 1,000 base units; S3: C owes E 5,000 and D owes E 3,000; T9 uses join only. Token decimals are 7, so these are 0.0001 to 0.0005 TTT. Minimum token holdings: C 6,000 and D 3,000; proposed allocation with margin: C 10,000, D 6,000 (about 0.0016 TTT total) so a failed attempt and a retry can be covered.

## C. Unnecessary

Minting to anyone, changing supply or governance, extending TTL, using the governed token (supply 1 base unit), cleanup transactions, and funding beyond the five accounts.

## Participant ceiling reminder

S3 has exactly four participants (A, C, D, E); B cannot join it.
