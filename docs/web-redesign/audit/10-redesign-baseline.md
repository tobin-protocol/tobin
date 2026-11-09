# 10 Consolidated redesign baseline

Factual summary of what a redesign starts from. It does not propose structure or visuals.

## What exists
- 15 pages + 1 proxy route; 7 desktop tabs, bottom bar on mobile; session workspace with 7 query-string tabs; organization with 4.
- Hand-built design system (`components/ui/`, tokens in `packages/ui-tokens`): monochrome, no accent colour, panels and cards, native dialogs.
- Typed client with HTTP and sample adapters; React Query; react-hook-form + zod; TanStack Table v9 row model.
- Real backend (SQLite) for auth, orgs, members, roles, reviewer grants, invitations, sessions, participants, obligations, netting, calculation review, settlement-batch prepare and review.

## What works well (source evidence)
- Honest unsupported states (`NotSupported`, `StatusMark kind=unsupported`) and derived notes; no mocked data unless flagged.
- Explicit permission reasons next to disabled actions; server errors surfaced (`reasonOf`).
- Confirmations with consequences for netting, void, remove, suspend, reject, approve, prepare, sign-out.
- Settlement reconciliation guard (server + browser) that blocks approval on mismatch.
- Pure, tested state logic (`lib/stages.ts`, `lifecycle.ts`, `layers.ts`, `next-action.ts`).
- Deep links (`?tab=`, `?ob=`, list query in URL). Skip link, focus ring, native dialog focus handling, status never colour-only.

## What is problematic
See 09: capped global views (H-1), missing lifecycle/wallet actions (H-2, H-3), long Overview tab (H-4), request fan-out (H-5), client-only gating (H-6), nav inconsistencies (M-1, M-2), overlay a11y (M-7), titles (M-8), table-on-mobile (M-9), thin UI-flow test coverage (M-13).

## Derived (frontend computed)
Overview stats/attention/relevant/recent; global Obligations, Approvals, Activity; approvals badge; Expired invitation state; session stage view; next action; reconciliation diff (re-check); sessions list filtering/sorting/pagination; command-panel session list.

## Unsupported (no backend route or no capability)
Sign, submit, verify, Confirmed; on-chain reads; notifications; global search; Discover/indexer; org-level activity events; N-of-M approval; extra roles; list of auth sessions; invitation email; wallet provider logos; org-level aggregates; session-level server pagination.

## Depends on backend change
Accurate cross-session counts and approvals (aggregate endpoints); search; notifications; Discover (indexer, public API, verification, privacy policy); signing/submission/verification; richer invitation states; preparer in settlement list (accurate badge).

## Can be redesigned independently of the backend
Shell/navigation, page layouts and hierarchy, workspace Overview, tables/lists pattern, forms, onboarding/sign-in presentation, overlay primitives, copy, responsive behaviour, wallet page presentation, exposing existing routes (ready/close, wallet link, obligation update, execution start: these need new UI only, backend exists).

## Must remain technically accurate (invariants)
1. **Confirmed rule**: Confirmed appears only when `verifiedReadBack === true` reported by the backend; today nothing reports it, the adapter passes `false` (`lib/stages.ts`). A state string "confirmed" alone must render "Submitted, awaiting verification". `test/no-confirmed.test.ts` fails if another source file renders the Confirmed label.
2. **Blockchain layer is always "Not recorded"** (`lib/sessions/layers.ts`); sessions are local drafts; every record is an application record on Stellar Testnet; no value is on-chain.
3. **No sign / submit / verify**: they are shown as Not supported; `BACKEND_RECORDS` says only Prepared is recorded.
4. **Roles are Admin, Member and a separate Reviewer grant.** Never Owner, Operator, Approver, Viewer as labels (`can.ts`). Application roles and wallet verification confer no signing authority.
5. **Approval in Tobin is not a Stellar signature**; one reviewer decides (no N-of-M); server enforces separation of duties; `can()` is presentational, the server wins.
6. **Derived totals must say "Showing N of M sessions"** while capped (`DerivedNote`); a count of nothing read is "No data", not 0.
7. **Testnet only**; wallet "connected" differs from "verified"; Freighter sign-in text comes from the server.
8. Invitation tokens are shown once; no email is sent. Obligations are voided, not edited or deleted; session changes invalidate calculation and reviews.
9. The proxy exposes only `/api/auth` and `/api/registry`; the console's guards stay unchanged.
10. Preserve the `TobinClient` interface and `NotSupported` pattern so new UI cannot invent data.

## Constraints and unknowns to resolve before redesigning
- 360 and 768 widths, and most pages at 390/900/1280, were not visually inspected here.
- Whether the backend has password reset/email verification routes (not checked).
- Server-side separation-of-duties rules were taken from code comments and UI copy, not read in `service.ts`.
- Current pass state of the repo's tests and scripts is unknown (not run).
- Deployment/production hosting posture is unknown (local only, "production not approved").
