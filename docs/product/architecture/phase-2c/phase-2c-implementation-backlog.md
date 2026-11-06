# Phase 2C implementation backlog

Written 2026-11-03. Planning only. Complexity S, M, L. Builds on `docs/product/architecture/phase-2b/phase-2b-implementation-plan.md` (an earlier-phase document intentionally not part of the pull request that introduced this file, so cited as text, not as a link); this file adds the findings of Phase 2C and does not rewrite it.

## Gate tickets (must come first)

| ID | Ticket | Depends on | Pri | Cx | Acceptance | Blockers |
|---|---|---|---|---|---|---|
| G-1 | Run T3 to T14 with the account holder present | Owner session; disposable funded accounts; scratch helper approval; settlement token balances sorted out | P0 | M | Wallet-validation-results shows PASS/FAIL per test with hashes and ledgers | Blockers 1 to 5 in wallet-validation-results |
| G-2 | Restore or replace missing `authvectors` test and fixture; resolve fixture attribution | Owner | P1 | S | Cross-implementation vector test runs | Attribution review |
| G-3 | Owner decisions H1, W1, C7, C8 periods | None | P0 | S | Register updated | Owner |

## MVP-1 tasks (start only after the stated gates)

| ID | Ticket | Depends on | Pri | Cx | Acceptance |
|---|---|---|---|---|---|
| M-1 | Shared design-token package, values unchanged | G-3 | P0 | M | Landing visually unchanged |
| M-2 | Database schema and migrations | G-3 (C7) | P0 | M | Entities per the data model; constraint tests |
| M-3 | Host-aware proxy and guard replacement | G-3 (H1) | P0 | M | Host matrix tests; landing routes unaffected |
| M-4 | Wallet sign-in | G-1 (T2/T3 for message signing) | P0 | M | Challenge, expiry, replay rejection |
| M-5 | Organizations, memberships, wallet linking | M-2, M-4 | P0 | M | Two organizations with verified wallets |
| M-6 | Soroban RPC transport and wallet adapter | G-1 | P0 | L | Reads and, with authorization, submits; adapter enforces expected-intent before every signature |
| M-7 | Session registry, indexer, reconciliation | M-2, M-6 | P0 | L | Idempotent, gap-aware, chain wins |
| M-8 | Create, join, obligations, finalize, netting, approval, settlement screens | M-1, M-6, M-7 | P0 | L | End-to-end journey on Testnet |
| M-9 | Session history and transaction references | M-7 | P1 | M | Both organizations see history |

## Post-MVP and deferred

Notifications, email contact, accessibility scanner, cross-browser review; Discover; cross-session netting; Mainnet.

## Explicit exclusions

No contract changes, no token supply changes, no wallet support beyond what G-1 evidences, no change to the 10-ledger policy without T9 data.
