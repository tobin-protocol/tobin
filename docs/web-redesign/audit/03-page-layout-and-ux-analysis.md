# 03 Page-by-page layout and UX analysis

Severity: High / Medium / Low. Evidence: [source] code, [screenshot] static image. IDs reference doc 09. Intentional product limitations are marked **(limit)**, not defects.

Common frame: `PageFrame` = optional testnet strip ("sensitive"), max width 1200px, 24px gutters, breadcrumbs, 28px title, optional single action at right. Surfaces: grey `panel` (#f0f0f0) containing white `card`s (rounded 16/24px), no accent colour; only red `danger`. Typography 14px body, 12px labels, fixed tokens in `packages/ui-tokens/tokens.css`.

## Overview `/`
- Structure: title + one primary "Create session" (admin), quick-link row, summary panel (hero attention count + 6 stats), "Sessions that matter now" (<=5), Attention table, Recent activity table, right aside (Organization card + "Settled value: Not supported").
- Hierarchy: good single primary action [screenshot 1440]. Hero number "Needs your attention 4" is derived from capped reads.
- Problems:
  - **OV-1 (High)** Totals are partial. "Obligations recorded 15", "Voided", "Configuring 10" cover only the newest 10 of 20 sessions [screenshot]; only "Clearing sessions" and "Members" are complete. Disclosed by `DerivedNote`, but headline numbers sit next to full numbers with the same visual weight. Workflow: any admin/reviewer scanning status.
  - **OV-2 (Medium)** "Needs your attention" can understate (attention only from 10 sessions). Stale/awaiting items in older sessions never surface.
  - **OV-3 (Medium)** Load: ~30 session requests (10 x detail/obligations/authorization) + up to 20 more for a reviewer's approvals badge on every page [source: Overview.tsx 38-53, usePending.ts].
  - **OV-4 (Low)** "Ready or closed" is always 0 from this UI because the UI cannot mark sessions ready/closed (see 05).
  - **OV-5 (Low)** Attention and "Sessions that matter now" overlap (stale sessions appear in both) [screenshot].
  - At 390: stat grid readable; session names in the relevant list appear clipped in the older screenshot (may be stale) [screenshot].

## Clearing Sessions `/sessions`
- Search + record filter + sort + "has activity" quick filter, table (md+) or cards, pagination 10/page. All filtering over the full list in the browser, state in the URL.
- **SL-1 (Low)** "Record"/provenance filter exposes values (`fixture`, `local-draft`, `chain-read`, `chain-confirmed`) of which only local-draft is producible here; `chain-*` are unreachable (source: `lib/sessions/list.ts`).
- **SL-2 (Low)** Per-row counts are fetched per visible rows (derived).
- Not capped: works on the full list, unlike other global pages.

## Create session `/sessions/new`
- 3-step form (name, participants checkboxes, review) then result with per-participant add outcomes.
- **CS-1 (Medium)** Not transactional: session is created, then participants added one by one; failures are reported per participant but the session already exists (`CreateSession.tsx` loop). Workflow: admin creating session with 3+ members.
- **CS-2 (Low)** The "session" is a "local draft" with a server-generated 64-hex id; the page must explain this repeatedly. (limit)

## Session workspace `/sessions/[id]`
- Structure: summary panel (workflow, record type, created, avatars, 64-hex id + Copy), stepper card, tabs, two-column body (content + sticky 420px action panel at lg+), mobile bottom sheet.
- **WS-1 (High)** The Overview tab is a long single column of 5 cards (stands, layers, glance, events, readiness) [screenshot 1440, ~2000px tall] that repeat information already in the stepper and next-action card (duplication: stepper subLabel, "Where this session stands", state layers, at-a-glance). Workflow: everyone opening a session.
- **WS-2 (Medium)** The id (64 hex chars) is the dominant identifier in the summary; session label is only the title. (monospace, break-all)
- **WS-3 (Medium)** Stepper currentIndex logic stops at the first unreadable fact; after approval stage it shows "Settlement" and then ends: workflow "stops at Review" with no terminal state. (limit: no sign/submit/verify)
- **WS-4 (Medium)** Primary action lives in the right panel on lg+, in a collapsed bottom sheet below md. On the Overview tab, the disabled primary "Review the calculation" remains visible with an explanation when the user is not a reviewer [screenshot]. A disabled primary button as the most prominent control is a pattern for non-actors.
- **WS-5 (Medium)** Six parallel queries (detail, participants, obligations, readiness, authorization, settlement) must all resolve before anything renders; any single slow one keeps the skeleton (`factsPending`). Detail error is the only hard error; others degrade to "unread".
- **WS-6 (High, functional)** No control to mark a session ready, close or reopen although the backend supports it (05). The workflow label "Being configured" never changes.
- Tabs:
  - Participants: simple table + select (Low issues).
  - Obligations: search/status filters, record form is in the side column on lg (so form and list are separated by distance); review dialog before submit; void requires dialog. **OB-1 (Low)** Amount is "base units, whole number, no decimals" with no decimals/asset precision help.
  - Netting: dense: eligible inputs, excluded, positions by debtor/creditor/zero, original vs net, details panel. **NT-1 (Medium)** Several tables stacked per asset; heavy vertical length.
  - Approvals: tab and right panel; "N-of-M approval" Not supported card **(limit)**.
  - Settlement: Steps list with Sign/Submit/Verify "Not supported" **(limit)**, three Not supported cards at bottom; reconciliation diff blocks approval (good).

## Obligations `/obligations`, Approvals `/approvals`, Activity `/activity`
- All three: cross-session lists capped at 10 sessions, `DerivedNote` explains. **GL-1 (High)** a user with >10 sessions cannot see obligations, approvals or activity from older sessions anywhere on a global page; the only recourse is opening each older session. Approvals older than the newest 10 are invisible, including to the badge count.
- Approvals: card list, filter awaiting/decided/all; default "Awaiting review". The `youCanDecide` hint uses server eligibility for calculations, but for settlement batches the preparer may be counted (documented in `usePending.ts` comment) **GL-2 (Medium)**: count can be wrong for the preparer.
- Obligations: dual rendering (table >=900px, cards below) uses a different breakpoint (900) than the rest of the app (768). **GL-3 (Low)**.
- Activity: no cross-session events for members/invitations/reviewers (backend limit, disclosed).

## Organization `/organization`
- Tabs Profile / Members / Invitations / Wallets; members table + side panel with up to 4 actions; confirmation dialogs with consequences lists; last-admin guard in client and server.
- **OR-1 (Medium)** Member actions are hidden behind "Open" then a side panel then a dialog (3 steps for a role change).
- **OR-2 (Low)** Invitee can be email or Stellar address; no email is sent **(limit)**, so the admin must hand over a one-time token; the dialog states it is shown once.
- **OR-3 (Medium)** Wallets tab duplicates `/wallets` content (02).

## Wallets `/wallets`
- "Your wallets" table (from `me.wallets`), "Wallet in this browser" card, org verified accounts + claims, footer note on no authority.
- **WL-1 (High, functional)** An email-account user sees "linking is not built in this app yet"; the only wallet mutation is Disconnect. Backend has `wallet/link/challenge|verify` (05).
- **WL-2 (Medium)** No "Connect/verify" button on this page; connection is only available in the header popover.
- **WL-3 (Low)** Network column always "Stellar Testnet".

## Settings `/settings`
- Account (display name, sign out everywhere, account activity last 15) and Organization (default org select, About access).
- **ST-1 (Low)** "Default organization" select immediately switches the working org on change (no explicit save).
- **ST-2 (Low)** Role explanation (PRD role mapping) is internal-facing content ("PRD's Operator ...") visible to users via `PRD_ROLE_HELP` (`can.ts`) - exposes design vocabulary, not a product concept.

## Notifications, Discover
- Honest Not supported pages with no function. **(limit)** They are linked from the shell (bell) and command panel respectively; a user can spend a click to learn there is nothing.

## Sign-in `/sign-in`, Onboarding `/onboarding`
- Sign-in: Wallet / Email segmented control (wallet default), 2-step indicator, named failure states, email login/register forms (react-hook-form + zod). Good error states.
- **SI-1 (Medium)** Wallet is the default method; if Freighter is absent the first thing a new user does fails ("Freighter not found"); email is a second tab.
- **SI-2 (Low)** Email register and login are in the same segment control as method; two nested segmented controls.
- Onboarding: profile name -> choose create/join -> create (details, review) or join (code). **ON-1 (Low)** Back from profile step unavailable; "join" needs an out-of-band token.
- No password reset/forgot flow in the UI [source: sign-in/page.tsx has none; backend not checked for a route: unknown].

## Cross-cutting
- **X-1 (Medium)** The word "Application record" / "Local draft" / "Not recorded" repeats on almost every page; correct but verbose.
- **X-2 (Medium)** Consistency is generally good (same `PageFrame`, `Card`, `Panel`, `NotSupported`); inconsistent breakpoints (md 768 vs 900) and mixed list idioms (Table vs card list per page).
- **X-3 (Low)** Sticky 2-row header (64 + 48px) + testnet strip consumes ~ 160px at the top on desktop [screenshot 1440].
