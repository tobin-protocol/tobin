# Phase 2B implementation plan and backlog (Workstream D)

Written 2026-11-03. Plan only; nothing is built. The Phase 2A backlog ([../implementation-backlog.md](../implementation-backlog.md)) was **left unmodified** because Phase 2B forbids changing Phase 2A specifications except for verified factual errors; this file is the Phase 2B update and supersedes ordering where they differ. Ticket IDs continue the Phase 2A scheme.

Priority P0 to P2. Complexity S, M, L. "Blocking decisions" refer to [phase-2b-decision-register.md](phase-2b-decision-register.md).

## Minimum end-to-end journey

Two independent organizations; users authenticate; organizations are represented; one creates a session; another joins; obligations are created; session finalized; netting proposed and approved; settlement completed; both can inspect session and activity history. No marketplace; no cross-session netting.

## 1. MVP-1 blockers

| ID | Description | Depends on | Pri | Cx | Acceptance criteria | Blocking decisions | Test requirements |
|---|---|---|---|---|---|---|---|
| B-1 | Authorize and run bounded wallet validation (T3 to T14) | founder authorization | P0 | M | Evidence at L3 for Freighter; L4 for two profiles; T9 timings recorded | W2 | Per test plan |
| B-2 | Record wallet decision W1 and expiry decision W3 | B-1 | P0 | S | Decision register updated with evidence | W1, W3 | None |
| B-3 | Approve architecture decisions A1 to A6 | this package | P0 | S | Register shows approvals | A1 to A6, D-B6 | None |

## 2. MVP-1 tasks

| ID | Description | Depends on | Pri | Cx | Acceptance criteria | Test requirements |
|---|---|---|---|---|---|---|
| T-1 | Shared design-token package without value changes | B-3 (A5) | P0 | M | Landing renders identically; console consumes tokens | Visual comparison, link and build checks |
| T-2 | App shell, Testnet banner, base components | T-1 | P0 | L | Per component inventory P0 rows | Unit and CDP browser journey |
| T-3 | Database schema and migrations for data model | B-3 | P0 | M | Entities in [backend-data-model.md](backend-data-model.md) | Migration and constraint tests |
| T-4 | Wallet-signature sign-in and sessions | B-2, T-3 | P0 | M | Sign in with challenge; replay and expiry rejected | Auth tests |
| T-5 | Organizations, memberships, wallet linking and ownership verification | T-4 | P0 | M | Two organizations each with a verified wallet | Unit, integration |
| T-6 | `SorobanRpcTransport` (simulate, assemble, send, poll, read) | B-2 (A4) | P0 | L | Reads sessions from Testnet; submits only with explicit authorization | Offline fakes plus authorized Testnet run |
| T-7 | Wallet adapter and signing review dialog (decoded intent) | B-1, T-6 | P0 | L | Entries checked against intent before signing; typed errors for rejection, wrong account, wrong network | Browser journey with a stub, then T4 to T7 |
| T-8 | Session registry, invitations, event indexer | T-3, T-6 | P0 | L | Sessions list per organization; chain wins on conflict | Reconciliation tests |
| T-9 | Create and join session screens | T-5, T-7, T-8 | P0 | M | Join collects two signatures | Journey test |
| T-10 | Obligations, finalize, netting, proposal, approval screens | T-9 | P0 | L | Mirrors contract validation | Journey test |
| T-11 | Settlement with per-debtor entries and fresh authorization after failure | T-10 | P0 | L | Settles two debtors | Authorized Testnet run |
| T-12 | Session detail and activity history | T-8 | P1 | M | Both organizations see history | Journey test |
| T-13 | Hosting and environment configuration | D-B6 | P1 | M | Staging reachable, Testnet only | Release-gate scan |

## 3. Post-MVP

Organization settings and notifications; email contact (Option 3 of A1); richer institution profiles; accessibility scanner adoption; cross-browser and mobile review.

## 4. Deferred

Discover/marketplace; cross-session netting; mainnet; wallet kits beyond Freighter; additional tokens beyond the governed Testnet token; i18n.

## Sequence

B-3 and B-1 in parallel, then T-1 to T-5, T-6, then T-7 to T-11, with T-12 and T-13 last.
