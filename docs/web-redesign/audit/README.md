# Tobin web application audit (apps/web)

Read-only factual audit of `apps/web` (Next.js 16 app, branch `feat/web-redesign`) and the backend it talks to, `apps/web-console`. It describes what exists; it proposes no new IA or visual design.

## Documents

| # | Document |
|---|---|
| 01 | [Route and page inventory](01-route-and-page-inventory.md) |
| 02 | [Information architecture and navigation](02-information-architecture-and-navigation.md) |
| 03 | [Page layout and UX analysis](03-page-layout-and-ux-analysis.md) |
| 04 | [Component inventory](04-component-inventory.md) |
| 05 | [Functional and backend audit](05-functional-and-backend-audit.md) |
| 06 | [User flows as implemented](06-user-flows.md) |
| 07 | [Responsive and accessibility audit](07-responsive-and-accessibility-audit.md) |
| 08 | [Technology and architecture assessment](08-technology-and-architecture-assessment.md) |
| 09 | [Problems, risks and opportunities](09-problems-risks-and-opportunities.md) |
| 10 | [Redesign baseline](10-redesign-baseline.md) |

## Method and evidence labels

- Source of truth is the code. Files read: all of `apps/web/app`, `components`, `lib`, `e2e`, `scripts`, `test` (headers/structure), `packages/ui-tokens/tokens.css`, the package.json files of the monorepo, and in `apps/web-console` the registry HTTP handler (`lib/registry/http.ts`), auth handler (`lib/auth/http.ts`), the table list in `lib/db/database.ts`, and the console's package.json. The existing `docs/web-redesign/*.md` were read as context only and checked against source.
- Evidence labels used throughout: **[source]** read in code; **[screenshot]** seen in an existing static image; **[reported-not-rerun]** a result recorded in repo docs/scripts that I did not re-run; **[unknown]** could not be verified.
- **Nothing was executed.** No browser test, axe scan, keyboard walkthrough, unit test, backend test, build or server start was run by this audit. Only reading files, `npm ls` (read-only), and viewing images.
- **Viewports actually inspected** (all via existing static PNGs in `docs/screenshots/stage-f/`, produced by an earlier pass; not live pages): 1440 (Overview, session workspace Overview), 900 (global Approvals), 390 (Overview). **Not inspected at all:** 1280, 768, 360. Every responsive statement for other widths or other pages is **source-derived** (Tailwind breakpoints `sm` 640, `md` 768, `lg` 1024, `xl` 1280, plus `min-[900px]`).
- The screenshots are from the previous redesign pass and could be stale relative to HEAD (the 390 Overview image shows session names visibly clipped in "Sessions that matter now"; current source uses `break-words`, so this may already be fixed: unknown).

## Summary

- 15 page routes (12 in the signed-in shell, 2 signed-out, 1 dev gallery) plus one API proxy route handler. Inside pages, 7 session-workspace tabs and 4 organization tabs are query-string views, not routes. No `loading.tsx`, `error.tsx`, `not-found.tsx`, or server middleware in `apps/web`; auth gating is client-side (`AppGate`).
- The app is a client-rendered React Query SPA-in-App-Router. All data comes through one typed client (`lib/tobin/client.ts`) over a server-side proxy (`app/api/[...path]/route.ts`) to the console backend (SQLite).
- Backend-connected: auth (email and Freighter sign-in), organizations, members, roles, reviewer grants, invitations, sessions (draft), participants, obligations (record, void), netting, calculation review, settlement-batch preparation and review, read of execution records. **Not possible anywhere in the stack reachable from this UI:** signing, submitting, verifying, a Confirmed state, on-chain reads, notifications, search, Discover.
- Derived (frontend aggregation of per-session calls, capped at 10 sessions, `SESSION_REQUEST_CAP`): Overview counts/attention/recent, global Activity, global Approvals, global Obligations, and the approvals count badge in the nav.
- Backend capabilities present but with **no UI**: mark session ready / reopen / close, obligation update, org wallet claims (POST), organization wallet challenges, signer sets, linking a wallet to an email account, starting an execution and attempts. Consequence: from this UI a session can never leave "Being configured" and the Overview's "Ready or closed" will stay 0 unless another client is used (see 05).
- The UI is honest about limits (Not supported cards, state layers, "Not recorded" blockchain layer, derived notes). Main UX weaknesses are navigation structure (approvals badge on Sessions, Approvals outside the top nav, Organization vs Wallets duplication), heavy per-page request fan-out, long single-column workspace pages, and some a11y gaps (see 07, 09).

Headline problems are in 09; the invariants that must survive any redesign are in 10.
