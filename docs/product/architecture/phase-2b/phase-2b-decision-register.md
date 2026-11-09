# Phase 2B decision register

Written 2026-11-03. Every item is **PROPOSED**; none is approved. Earlier decisions D1 to D15, DS1 to DS5 and SPK-1 are in [../open-decisions.md](../open-decisions.md) and Phase 2A documents.

| ID | Decision | Recommendation | Blocks | Depends on |
|---|---|---|---|---|
| W1 | Which wallet(s) MVP-1 supports for entry signing | Freighter only, until L3/L4 evidence exists; Albedo and Ledger-through-kit are unsupported | All signing tickets | Tests T3 to T7 |
| W2 | Authorize the Testnet wallet validation tests (T3 to T14) | Authorize a bounded run with disposable accounts | W1, W3, A4 wallet part | Founder authorization |
| W3 | Adequacy of the 10-ledger authorization window for human wallet round trips (policy, EQ-20; protocol ceiling is far larger) | Keep 10 until T9 timing exists; then decide with the replay review | Browser signing UX | T9 |
| A1 | Authentication: wallet-signature sign-in with organization memberships | Option 1 | Auth tickets | T2/T3 for message-signing variant |
| A2 | Backend inside the Next.js app behind a module boundary | Option 1 | Server tickets | None |
| A3 | Registry plus event reconciliation, chain authoritative | Option 3 | Sessions list | RPC retention re-measure |
| A4 | Add `@stellar/stellar-sdk` 17.4.0 and use Freighter API directly | Approve dependency review when building the transport | Transport ticket | W1 |
| A5 | Extract shared design tokens to a package without changing values | Option 2, first ticket | Console UI | Visual regression check |
| A6 | Separate hosting project and subdomain, Testnet banner permanent | Proposed | Deployment | Provider choice |
| D-B6 | Database/hosting provider | Founder choice; no provisioning yet | Server tickets | None |
| D-B8 | Retention and privacy of obligation data in the application database | Minimise; participants only | Data model | None |
| D-B9 | Treat the existing correction posture: no Phase 1 or 2A text required correction in Phase 2B | Informational | None | None |

## Approvals needed before implementation starts

W1, W2, A1, A2, A3, A4, A5, D-B6 at minimum. W3 may wait for evidence.

## Phase 2C additions (2026-11-03)

Phase 2C updates to the Phase 2B decisions: owner decided (D4) a separate Vercel project for the application at the application subdomain, landing unchanged (H1 closed); W1 and W3 remain pending because wallet tests T3 to T14 did not run. Details: [../phase-2c/technical-decision-closure.md](../phase-2c/technical-decision-closure.md).
