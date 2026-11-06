# Setup transaction plan (Phase 2C)

Written 2026-11-03. **Nothing was submitted.** Functions and signatures come from `contracts/clearing/src/lib.rs`: `create_session(creator, session_id, token, max_participants, max_obligations)`, `join_session(session_id, participant)`, `submit_obligation(session_id, obligation{id, debtor, creditor, amount})`, `finalize_obligations(session_id, caller)`, `propose_settlement(session_id, proposer, instructions[{payer, payee, amount}])`, `approve_settlement(session_id, participant, digest)`, `settle(session_id, digest)`. Authorization calls: `creator.require_auth()` (create), `participant.require_auth()` and `creator.require_auth()` (join), `debtor.require_auth()` (obligation), `caller.require_auth()` (finalize), `proposer.require_auth()` (propose), `participant.require_auth()` (approve), `payer.require_auth_for_args(settle, session, digest, total)` plus the token's `from.require_auth()` (settle).

Common facts. Contract: the clearing contract and the legacy token from the manifest (IDs are read from it at run time). Session ids: fresh random 32-byte values, recorded. The session token: the **legacy token** (a contract address, required by `create_session`). "Source" is the one account that signs the envelope and pays the fee; all `require_auth` are satisfied either by the envelope signature (when that account is also the signer) or by separate authorization entries. Every transaction below changes persistent contract state unless noted. Fees: Soroban resource fee plus base fee, paid by the source; earlier recorded figures are tens to hundreds of thousands of stroops. Authorization entries expire at most 10 ledgers ahead (repository policy), set from the live ledger.

**Coverage key.** COVERED = a transaction that is itself one of T4 to T9 or T13 (already authorized by the owner). SETUP = precondition not covered by the existing authorization; needs approval (see [phase-2c-final-approval-package.md](phase-2c-final-approval-package.md)).

## Sequence 1: A/B join validation

Sessions: S1 (T4, T5), S2 to S6 (T9 repetitions 1 to 5; S6 is also where T8 first makes its single expired attempt). Parameters for all: creator A, token legacy, `max_participants` 2, `max_obligations` 1.

| ID | Method | Source | Arguments | Authorization signers | State transition | Depends on | Coverage |
|---|---|---|---|---|---|---|---|
| J-F | Fund A, B | Friendbot | see the funding plan | none | accounts created | none | SETUP |
| J-1 | `create_session` | A | (A, S1, legacy token, 2, 1) | A (envelope) | S1 Open, participants {A} | J-F | SETUP |
| T4 | none (entry only) | none | `join_session(S1, B)` | B entry; A entry may be shown but not requested | none | J-1 | COVERED (no tx) |
| T5 | `join_session` | A or B (one) | (S1, B) | A entry and B entry over the same tree, plus the source's envelope | S1 participants {A, B} | J-1, T4 | COVERED |
| J-2 to J-6 | `create_session` | A | (A, S2..S6, legacy token, 2, 1) | A | five Open sessions | J-F | SETUP |
| T8 | `join_session` | A or B | (S6, B) with an entry whose expiration ledger has already passed | A, B | rejected ("signature has expired"); **no state change**; fee still possible | J-6, T5 working | COVERED (one attempt only) |
| T9.1 to T9.5 | `join_session` | A or B | (S2..S6, B) | A and B entries | each session {A, B} | J-2..J-6 | COVERED |

Counts: SETUP transactions: 6 (`create_session` S1 to S6). COVERED transactions: 1 (T5) + 1 failing attempt (T8) + 5 (T9) = 7. Wallet prompts: per join, two entry signatures plus one envelope signature.

## Sequence 2: A/C/D/E settlement validation

Amounts (proposal, base units): S7: C owes E 1,000. S8: C owes E 5,000, D owes E 3,000. Obligation ids: fresh random 32-byte values. Instruction lists are in strictly ascending (payer, payee) address order as the contract requires (the order is computed from the addresses at run time, not assumed). The default netting plan is used: S7 = [C pays E 1,000]; S8 = [C pays E 5,000, D pays E 3,000].

### S7 (single debtor, T6): participants A, C, E; `max_participants` 3, `max_obligations` 1

| ID | Method | Source | Arguments | Signers | State transition | Depends on | Coverage |
|---|---|---|---|---|---|---|---|
| K-1 | `create_session` | A | (A, S7, legacy token, 3, 1) | A | Open {A} | funding | SETUP |
| K-2 | `join_session` | A | (S7, C) | A and C entries | {A, C} | K-1 | SETUP |
| K-3 | `join_session` | A | (S7, E) | A and E entries | {A, C, E} | K-2 | SETUP |
| K-4 | `submit_obligation` | C | (S7, {id, C, E, 1000}) | C | 1 obligation | K-3 | SETUP |
| K-5 | `finalize_obligations` | A | (S7, A) | A | Committed, commitment stored | K-4 | SETUP |
| K-6 | `propose_settlement` | A | (S7, A, [{C, E, 1000}]) | A | proposal and digest recorded | K-5 | SETUP |
| K-7 to K-9 | `approve_settlement` | A, C, E respectively | (S7, participant, digest) | each participant | Approved after the third | K-6 | SETUP |
| T6 | `settle` | any funded account | (S7, digest) | **C entry**: `settle(S7, digest, 1000)` with nested `token.transfer(C, E, 1000)`; no other debtor | Settled; C pays E 1,000 (balances below) | K-9; C holds token | COVERED |

Token effect of T6: C: 10,000 to 9,000; E: 0 to 1,000. S7 transactions: SETUP 9, COVERED 1.

### S8 (two debtors, T7): participants A, C, D, E (the ceiling of 4); `max_participants` 4, `max_obligations` 2

| ID | Method | Source | Arguments | Signers | State transition | Depends on | Coverage |
|---|---|---|---|---|---|---|---|
| L-1 | `create_session` | A | (A, S8, legacy token, 4, 2) | A | Open {A} | funding | SETUP |
| L-2 to L-4 | `join_session` | A | (S8, C), (S8, D), (S8, E) | A with each joiner | {A, C, D, E} | L-1 | SETUP |
| L-5 | `submit_obligation` | C | (S8, {id, C, E, 5000}) | C | | L-4 | SETUP |
| L-6 | `submit_obligation` | D | (S8, {id, D, E, 3000}) | D | | L-4 | SETUP |
| L-7 | `finalize_obligations` | A | (S8, A) | A | Committed | L-5, L-6 | SETUP |
| L-8 | `propose_settlement` | A | (S8, A, [C pays E 5000, D pays E 3000] in contract order) | A | proposal | L-7 | SETUP |
| L-9 to L-12 | `approve_settlement` | A, C, D, E | (S8, participant, digest) | each | Approved | L-8 | SETUP |
| T7 | `settle` | any funded account | (S8, digest) | **C entry** (total 5000, nested transfer C to E) and **D entry** (total 3000, nested transfer D to E) | Settled | L-12; balances | COVERED |

Token effect of T7: C 9,000 to 4,000 (after T6), D 6,000 to 3,000, E 1,000 to 9,000 (counting T6). S8 transactions: SETUP 12, COVERED 1.

## T13 preparation (offline first)

Take the T4 joiner entry; change one field of an unsigned copy (for example the participant argument or the expiration) and confirm the pre-signing intent check rejects it with the existing offline logic (`authsigner` h1, h3, g3 behaviour); confirm the application path refuses to submit. A Testnet submission is **not** planned; if later judged necessary, one `join_session` with an altered entry on a spare session would fail at authorization (expected cost: a fee only) and needs a fresh decision.

## Totals

SETUP transactions 27 (6 + 9 + 12), COVERED success transactions 8 (T5, T9 ×5, T6, T7) plus 1 deliberate failure (T8). Plus the funding plan (5 Friendbot requests) and the token plan (2 transfers).
