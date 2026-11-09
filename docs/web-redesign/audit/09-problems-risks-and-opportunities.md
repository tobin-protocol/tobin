# 09 Problems, risks and opportunities

Types: **D** defect (UI behaves wrongly or inconsistently), **G** gap (backend supports it, UI does not), **P** preference/UX judgement, **L** intentional limitation (listed for completeness; not a defect), **R** risk, **O** opportunity. Evidence paths relative to `apps/web/` unless noted. Suggested area = where improvement would happen, not a design.

## Critical
None found. Nothing in source presents an unsupported action as working or a settlement as confirmed; no data-loss path found by reading.

## High

| ID | Type | Where | Description | Evidence | Impact | Backend dependency | Suggested area |
|---|---|---|---|---|---|---|---|
| H-1 | D/L | Overview, `/obligations`, `/approvals`, `/activity`, nav badge | Cross-session pages see only the newest 10 sessions; totals, attention, approvals and the badge ignore older sessions | `lib/derived/overview.ts:6,33`; consumers listed in 05 | Reviewer may miss an approval in session #11+; counts look authoritative next to full counts | Needs aggregate/cross-session endpoints for an accurate fix | Data layer; summary presentation |
| H-2 | G | Session lifecycle | No UI to mark ready / reopen / close, though backend routes exist, so workflow never leaves "Being configured" and "Ready or closed" is always 0 from this UI | `lib/tobin/client.ts` (no method); `apps/web-console/lib/registry/http.ts:292-293` | Sessions cannot be closed; stat and workflow labels misleading | None (routes exist) | Session workspace actions |
| H-3 | G | Wallets | Email-account users cannot link/verify a wallet; page says "not built". Backend has `auth/wallet/link/*` | `components/wallets/Wallets.tsx:90`; `apps/web-console/lib/auth/http.ts:67-75` | Wallet feature half-complete; "Wallets" tab mostly read-only | None | Wallets page |
| H-4 | P | Session workspace Overview | Long single column of 5 cards duplicating stepper, next action and glance | `components/sessions/tabs.tsx:26-119`; [screenshot] | Slow to scan; dominant entry to the core flow | None | Workspace layout |
| H-5 | R | Shell | `useApprovalsPending` runs on every page for reviewers (1 + 2x10 requests) and Overview adds ~30 more; no server aggregate | `components/shell/Shell.tsx:240`, `approvals/usePending.ts`, `overview/Overview.tsx:38-53` | Latency and load grows with usage; failures are per-session | Aggregate endpoint would remove | Data fetching strategy |
| H-6 | R | Whole app | Protected content gated only client-side; no `loading/error/not-found`; backend unavailability shows generic error | `app/(app)/layout.tsx`, `components/shell/session.tsx` | Flash of skeleton; no route-level error boundary (unhandled render errors surface via Next defaults) | None | App architecture |

## Medium

| ID | Type | Where | Description | Evidence | Impact | Backend | Area |
|---|---|---|---|---|---|---|---|
| M-1 | P | Navigation | Approvals count is attached to the "Clearing Sessions" tab; Approvals is not a desktop tab, has no active tab, but is a primary mobile item | `Shell.tsx:30-31,240-241,215-216` | Desktop/mobile IA differ; approvers' main task has weak entry on desktop | None | IA |
| M-2 | D | Navigation | Wallets exist in two places (`/wallets`, Organization > Wallets) | `Wallets.tsx:21,107`, `Organization.tsx:37` | Duplicate destinations | None | IA |
| M-3 | G | Obligations | Backend `update` route unused; UI has void only | `http.ts:200` | Correction requires void + re-record | None | Obligations tab |
| M-4 | G | Settlement | Backend can start execution and begin attempts; UI only reads | `http.ts:257-262` | Execution record can never be created from this UI; StageRail shows only "Prepared" | None for UI; signing absent | Settlement |
| M-5 | D | Approvals count | Settlement batch count can include the user's own prepared batch | `approvals/usePending.ts` comment | Badge can overstate | list lacks preparer | Count logic |
| M-6 | D | Create session | Non-atomic: session then participants one by one | `CreateSession.tsx` | Partial result possible | Single-call create would fix | Flow |
| M-7 | D | Accessibility | Popover lacks focus management; command panel lacks listbox semantics | `ui/Overlays.tsx:66-123` | Keyboard/screen-reader friction on header controls | None | Overlay primitives |
| M-8 | D | Accessibility | Every session page has the same document title "Session" | `app/(app)/sessions/[sessionId]/page.tsx:4` | History, tabs, SR users cannot distinguish | None | Metadata |
| M-9 | D | Responsive | Hidden table columns on mobile lose data; per-page card fallbacks inconsistent; breakpoint 900 vs 768 | `ui/Data.tsx`, `GlobalObligations.tsx:80` | Inconsistent small-screen experience | None | Table pattern |
| M-10 | D | Dev route | `/dev/components` exposed in any build | `app/dev/components/page.tsx` | Unneeded public surface (local-only today) | None | Build config |
| M-11 | P | Sign-in | Wallet default method although it fails without the extension | `sign-in/page.tsx:116` | New users hit an error first | None | Sign-in |
| M-12 | P | Org members | Role/reviewer/suspend/remove require row Open -> side panel -> dialog | `Organization.tsx` | Many steps for admin tasks | None | Members |
| M-13 | R | Testing | Frontend tests cover pure logic only; no component or DOM tests, a11y/keyboard/browser scripts are manual and need external axe; e2e smoke needs no backend, so core flows are untested in CI | `package.json` scripts; `e2e/smoke.spec.ts`; `scripts/` | Regressions in UI flows detected only by manual scripts | None | Test strategy |
| M-14 | R | Duplication | Five copies of derive-over-sessions with `eslint-disable exhaustive-deps` | 08 | Maintenance and stale-data risk | | Data layer |
| M-15 | P | Copy | Settings exposes internal PRD vocabulary (`PRD_ROLE_HELP`) | `lib/permissions/can.ts:49-54`; `Settings.tsx` | Confusing for end users | None | Copy |
| M-16 | G/R | Navigation after org switch | Switching org while on a session URL yields "Session not found" | `Workspace.tsx:91-99` | Disorienting | None | Context handling |

## Low

| ID | Type | Description | Evidence |
|---|---|---|---|
| L-1 | D | Provenance filter lists values the app cannot produce (`chain-read`, `chain-confirmed`) | `lib/sessions/list.ts:47` |
| L-2 | P | Settings default-org select acts immediately | `Settings.tsx` |
| L-3 | D | Field hint not wired to `aria-describedby` | `ui/Form.tsx` |
| L-4 | P | Placeholder colour (#b1b1b1) low contrast | `Form.tsx` `control` |
| L-5 | P | Breadcrumb org name not a link; sessions breadcrumb loses list filters | `PageFrame.tsx`, `Workspace.tsx:89` |
| L-6 | D | Overview Attention and Sessions-that-matter overlap | [screenshot] |
| L-7 | P | Header consumes ~160px (two rows + testnet strip) | [screenshot 1440] |
| L-8 | D | `PermissionState`, `InputCard` direct use only in dev gallery | 04 |
| L-9 | R | Fonts via `next/font/google` (build-time network); Geist stands in for Gellix | `app/layout.tsx` |
| L-10 | P | No password reset / email verification in UI | `sign-in/page.tsx` (backend: unknown) |

## Intentional product limitations (not defects)
Unsupported and disclosed: signing, submission, verification, Confirmed stage (`lib/stages.ts`), blockchain layer "Not recorded" (`lib/sessions/layers.ts`), notifications, global search, Discover, N-of-M approval, Owner/Operator/Approver/Viewer roles, session list for auth sessions, invitation email delivery, sample data only by flag. Testnet-only, local hosting only.

## Opportunities
- O-1 Single hook/service for cross-session derivation (replace 5 copies) and a seam ready for a future aggregate endpoint.
- O-2 Expose already-supported backend actions: ready/reopen/close, wallet link, obligation update, execution start.
- O-3 Consolidate Wallets and Organization wallets; unify Approvals entry points.
- O-4 Page-level metadata for sessions; route-level `loading`/`error`.
- O-5 Adopt a single table/list pattern with a stacked-card mode.
- O-6 Strong foundation to reuse: typed `TobinClient`, `can()`, pure state functions, `NotSupported` honesty pattern, tokens package, native dialogs.
- O-7 Add UI-flow tests to CI (Playwright with a seeded backend) and axe as a declared dev dependency.
