# Tobin web app redesign: access model, light Symbiotic x ProofBridge design, and Claude Code rewrite prompt

Nov 9, 2026 · @Ebubechi Ihediwa

## Summary and decisions

This is a full rewrite of the Tobin web app's UI and UX, not a re-skin. It keeps the tested logic (data layer, permissions, derivation, Confirmed rule) and replaces the shell, navigation, pages and components.

**Your decisions, applied**

1. The Symbiotic x ProofBridge direction is confirmed for the app. The landing page is not changed except for one button (below).
2. **Light theme only**, because the landing page is light.
3. **Fonts come from the landing page.** Claude Code reads `apps/landing` and reuses its exact families; no new typeface is introduced (so no pixel font).
4. The **banner appears only on Overview and Sessions.**
5. **New access model:** the landing page's navbar button "GitHub" becomes "Launch app". It opens the web app, where a signed-out visitor can see only **Discover**. Everything else needs a wallet or account sign-in, on its own separate page.

**What the audit changes**

- The 10-session cap on global views is the top problem. The redesign replaces the fixed cap with one cross-session data hook and a user-controlled "Load next 10 sessions" step, so headline numbers say exactly how much they cover.
- Navigation is inconsistent (approvals count on the wrong tab, Wallets in two places, Discover unreachable). The new sidebar fixes all three.
- The session workspace repeats the same state in three summaries and the approval flow takes about seven dialogs. The redesign has one summary and a single linear close-out flow.
- Backend actions with no UI are surfaced where it is safe: marking a session ready and closing it. Wallet linking waits for your Freighter test. Starting executions and editing obligations stay out, as decided before.

**A truth problem you need to know about.** Discover has no backend today (the audit lists it as unsupported), and the console has no public read endpoint. A public Discover page therefore cannot show real sessions, institutions or volumes. This spec gives it honest content and marks the rest Not supported (details in the next section). If you want real public data, that is a backend decision, separate from this rewrite.

## Access model and information architecture

**Journey**

Landing page → **Launch app** → `/discover` (public) → any locked item or "Connect wallet" → `/sign-in` (separate full page) → `/onboarding` if the account has no organization → `/` (Overview).

**Route map**

| Route | Access | Notes |
| --- | --- | --- |
| /discover | public | the only page a signed-out visitor can use; also the default entry for signed-out visitors |
| /sign-in | public | full page, no sidebar; wallet and email sign-in; reads `?next=` and returns there after sign-in |
| /onboarding | signed in, no organization | create or join with a code |
| / (Overview) | signed in | banner |
| /sessions, /sessions/new, /sessions/\[id\] | signed in | banner on the list only |
| /obligations | signed in | cross-session |
| /reviews | signed in | the global approvals queue, renamed Reviews |
| /activity | signed in | cross-session |
| /organization (tabs: Profile, Members, Invitations, Wallets) | signed in | Wallets is no longer a top-level page |
| /settings, /notifications | signed in | notifications stays Not supported |
| /dev/components | development builds only |  |

A signed-out visit to any signed-in route redirects to `/sign-in?next=<route>`. The check happens on the server (middleware or layout), not after a client-side flash. Signing out returns to `/discover`.

**Sidebar (256px)**

Signed out: logo, a single active item DISCOVER, then the other items shown **locked** (lock icon, 50% text); clicking one goes to `/sign-in?next=...` so people see what the product contains. At the bottom a primary "CONNECT WALLET" button.

Signed in: logo, organization selector, then NAVIGATION: Discover, Overview, Sessions, Obligations, Reviews (pending count on this item only), Activity, Organization, Settings. Then EXTERNAL: Documentation, Repository, Share feedback. Discover stays reachable at all times, which fixes the audit's finding that it was reachable only by typed URL.

**Discover page (public), honest content only**

1. A short panel: what Tobin is, in one paragraph, with the maturity line "Specification and testnet validation stage. Experimental. Test assets only. Not audited."
2. **How clearing works:** a diagram of three institutions and their obligations with gross 250 and net 30, in a bordered card labelled "Illustrative example. Not live data." This is the one place the example numbers may appear.
3. **Network:** "Stellar Testnet". A live status line only if a public status endpoint exists; otherwise omitted.
4. Three further sections, **Public sessions, Institutions, Supported assets**, each rendered as a Not supported card that says what it would show and that no public read API exists yet. They are sized like real lists so the page layout survives when data arrives.
5. A call to action: Connect wallet to participate, and a link to documentation.

No banner, no counts, no listings that are not real.

**Session workspace tabs (reduced from 7 to 6)**

Overview · Participants · Obligations · Netting · Settlement · Activity. Approvals are folded into a linear close-out inside Settlement (see screen specs). Approval and wallet-signature blocks stay visually separate.

## Light design system

The Symbiotic structure (hairlines, square corners, uppercase labels, green accent) on a white page, framed the ProofBridge way (sidebar, slim top bar, banner). The values below are proposals derived by inverting Symbiotic's dark tokens; Claude Code must check each against the landing page's tokens and the contrast rules.

| Token | Value | Notes |
| --- | --- | --- |
| Page | #FFFFFF | matches the landing page |
| Row tile | #F4F4F4 | Symbiotic's #1A1A1A tile, inverted |
| Card | ink at 4% | Symbiotic's white-at-5% card, inverted |
| Border / hairline | ink at 20% | 1px; borders and dividers only |
| Text | #000000 |  |
| Muted text | ink at 60% (about 5.7:1) | never lighter for readable text |
| Disabled | ink at 40% | disabled controls only; exempt from contrast |
| Accent fill | #B6FF3E | always with black text (about 16:1); never as text on white |
| Accent text, links, tags | #2F5D00 (about 7.8:1) on white or on #EAFFC2 |  |
| Accent tint | #EAFFC2 | tags, active nav fill |
| Failure | #B3261E | failures, refusals, destructive actions only |
| Radius | 0 | everywhere |
| Shadow | none; overlays use a 1px border and a 40% ink scrim |  |

**Type.** Use the landing page's families exactly (Claude Code reads `apps/landing` to find them). Interface and values in the landing's sans; identifiers, hashes and addresses in its mono; the banner headline in its display face. Labels are 12px uppercase with a little tracking; body and rows 14px; nav and buttons 14–16px uppercase; page titles 28px; banner headline about 64px on desktop. Tabular numerals for amounts.

**Green means active or actionable, never success.** Active nav, selected filter value, the primary action and the current stage use green. Completion and confirmation use filled squares and words. A Confirmed state still cannot render.

**Frame**

- **Sidebar, 256px:** white, 1px right hairline. Section labels (NAVIGATION, EXTERNAL) in 12px uppercase muted. Active item: accent tint fill, black text, 2px black left edge. Locked items: lock icon, muted.
- **Top bar, 58px, 1px bottom hairline:** page title; help; **environment button** ("STELLAR TESTNET" with a square dot); wallet cell (avatar, truncated address, connected/verified state); notifications. Signed out: a single CONNECT WALLET button.
- **Banner (Overview and Sessions only), about 110px:** a grey grain band (#E6E6E6 with fine noise, produced with CSS or a tiny generated image; no new asset dependencies) and a large headline with a real count, for example SESSIONS: 3. If the count is unavailable the headline reads SESSIONS: NO DATA. Square corner blocks may use ink at 10%; no colour.
- **Help button:** a fixed square tile, bottom right, linking to documentation. It does not imply an assistant.
- **Mobile:** the sidebar becomes a drawer from a menu icon; tables become tiles; the action panel is a bottom sheet.

**Components**

| Component | Spec |
| --- | --- |
| Primary button | accent fill, black text, uppercase, 0 radius, 40px (52px in action panels); one per view |
| Secondary button | transparent, 1px ink-20% border, black text |
| Icon tile button | 32×32; accent fill with black icon (primary) or ink-10% fill (secondary) |
| Tag | rectangular, #2F5D00 on #EAFFC2, 12–14px 500 |
| Chip | rectangular, #F4F4F4 with 1px ink-20% border |
| Select | bordered box with a tiny FILTER BY label; selected value in #2F5D00 |
| Filter bar | selects separated by hairlines, a Filters button at the right, then a full-width search field |
| List tile | #F4F4F4, 86px, 8px gap, three-line anatomy (identifier + tag; muted title; value + chips); the action button appears on hover **and** on keyboard focus, and is always visible on touch |
| Table | 12px uppercase muted headers, 1px dividers, hover #F4F4F4, mono ids, asset code on every amount |
| Group section | bordered container with a heading, collapse chevron and SHOW N MORE |
| Stage rail | four squares: Prepared, Signed, Submitted, Confirmed; only reached stages are filled; unsupported ones read Not supported; Confirmed unreachable |
| Approval block / Signature block | two bordered boxes with different titles and icons, never in the same row; "Approval recorded in Tobin. This is not an on-chain signature." |
| Not supported card | dashed 1px ink-20% border, muted text, one line on what it would show |
| Skeleton | same-layout #F4F4F4 blocks |
| Dialog / SidePanel | white, 1px border, 0 radius, focus trapped, focus returns on close |
| Popover, command panel | proper focus management, arrow keys, listbox roles (the audit found both missing) |

**UI kit and icons (added after review)**

- **shadcn/ui is the component foundation.** It gives the app tested focus management, keyboard behaviour and ARIA for dialogs, sheets, popovers, selects, tabs and the command panel, which is exactly what the audit found missing. Components are copied into the repo as source and restyled; nothing about shadcn's default look survives.
- **Theme shadcn to this spec:** `--radius: 0`, no shadows, shadcn's colour variables mapped to the tokens above (primary = accent fill with black text, destructive = #B3261E, ring = a visible 2px focus ring), and no default neutral palette left behind.
- **Tobin components stay custom** and are built on shadcn primitives: StatusMark, stage rail, approval block, signature block, Amount, Identifier, DerivedNote, Not supported card.
- **Icons:** `@hugeicons/react` for every interface icon, in one stroke style and three sizes (16, 20, 24). `@web3icons/react` only for crypto assets, networks and wallets, and only for ones Tobin actually supports (Stellar, XLM, Freighter, the supported assets). If a web3 icon is missing, show the text code. shadcn's default icon library (lucide) is not shipped.
- Both icon packages are already installed for `apps/landing`; reuse the same versions through the workspace baseline and import single icons, not whole barrels.

## Screen specs for the rewrite

**Sign-in page (/sign-in), separate and full-page.** No sidebar. A centred bordered panel, 440px: title, a two-step indicator of squares (Sign in, then Connect wallet), the wallet path (Freighter only; the desktop-extension hint; every named failure state inline) and the email path as the existing app supports it. Reads `?next=` and returns there. The signed message names the console host, and the page says so. Never asks for a seed phrase or key. Link back to Discover.

**Onboarding.** Same centred panel: Create organization or Join with a code, then review, then confirm. States that this does not verify the organization.

**Discover.** As specified in the access section. Page title DISCOVER, no banner. A signed-in user sees the same page with a "Go to Overview" action.

**Overview (banner: SESSIONS: N).** Two rows. Row 1: one "Needs your attention" list (invitations, reviews, settlement steps, failures) as list tiles with a hover action. Row 2: a StatGrid of real and derived counts with a coverage line ("Based on 10 of 24 sessions") and a **Load next 10 sessions** button that extends the cross-session hook. Recent activity below, five rows. No sparkline, no totals that cannot be verified.

**Sessions (banner: SESSIONS: N).** Filter bar (Status select with Derived workflow state, Search, Sort with green value, URL-driven), list tiles under 900px and a table above it. A tile shows the session identifier and status tag, label, participant AvatarStack, obligation count, assets and updated time. OPEN appears on hover and focus. Primary action: CREATE SESSION. Create wizard stays four steps (Details, Participants, Review, Created) but is made atomic in the UI: if adding participants fails, show a single recovery panel with a retry for only the failed ones.

**Session workspace.** Header: label, identifier with copy, one StatusMark, created time, participant AvatarStack. **One summary only**: a card with the four-square stage rail and a Next action line. The 420px action panel stays on the right and always shows one primary button or the reason there is none. New in the panel, because the backend supports it: **Mark ready** when readiness checks pass, and **Close session** as a confirmed action. Tabs:

1. Overview: details, readiness checklist (real checks), recent activity. It no longer repeats the stage and netting summaries.
2. Participants: tiles, add and remove for admins.
3. Obligations: table, record in the panel, void as a separate confirmed action. No edit.
4. Netting: inputs, run, result (Gross vs Net cards, positions grouped per asset, original vs net two-pane), calculation details.
5. Settlement: a **single linear close-out** with five numbered steps on a left rail and the current step on the right: Review calculation (reviewer) → Prepare settlement (admin) → Review settlement (second reviewer) → Execution record (read-only) → Sign, submit, verify (Not supported). Each step has one confirm, not a chain of dialogs. The approval box and the signature box remain separate and labelled. A mismatch between approved and prepared shows a red diff and blocks the step. The stage rail sits at the top.
6. Activity: one shared activity component.

**Obligations (global).** Derived list with coverage line and Load next 10 sessions; stacked tiles under 900px so Status is always visible.

**Reviews (global).** The approvals queue: tiles for calculation reviews and settlement reviews awaiting this user, with the pending count in the sidebar. Non-reviewers see a Not available state with the reason.

**Activity (global).** One component, filters for event type, session, date and result, side panel for detail, same coverage line.

**Organization.** Tabs Profile, Members, Invitations, Wallets. Members as tiles on mobile and a table on desktop, with the role-change and remove dialogs that list real consequences. Wallets shows connected and verified as separate columns. Wallet linking is hidden behind a feature flag until your Freighter test passes.

**Settings.** Account and Organization groups, only supported options. **Notifications:** Not supported page, bell popover shows the same one line.

**Route-level states.** Every route gets `loading.tsx`, `error.tsx` and `not-found.tsx`. Page titles are specific ("Session: \<label>", not "Session"). Switching organization while on a session URL redirects to Sessions with a notice instead of "Session not found".

## Landing page change, audit requirements, open decisions

**Landing page (one change only).** In `apps/landing`'s navbar, replace the GitHub button with **Launch app**. The target comes from a config value `links.app`, not a hard-coded URL, because the web app is local-only today. If `links.app` is unset in a production build, the button renders disabled with the label "Launch app (soon)" instead of linking nowhere. Keep the GitHub link in the footer so the repository stays reachable. Nothing else on the landing page changes.

**Audit requirements carried into the rewrite**

- One cross-session data hook replaces the five duplicates; it takes a session cap, reports coverage, and is shaped so an aggregate endpoint can replace it later.
- One Table/List pattern replaces the mix of tables and hand-built card lists.
- Overloaded files (Shell, Workspace, tabs, Organization) are split into small modules.
- Accessibility: Popover and command panel get focus management and listbox roles; unique page titles; field hints linked with `aria-describedby`; axe checks added as a script (CI wiring is a separate decision).
- Route-level loading, error and not-found files; fewer requests on page load (the shell badge no longer fires about 21 requests for reviewers).
- Invariants kept: Confirmed only with a verified read-back, blockchain layer "Not recorded", roles only Admin, Member and Reviewer, a Tobin approval is not a Stellar signature, derived totals say how much they cover.
- Audit limits to respect: the agent read the source only and viewed four screenshots, so Claude Code must verify the claims it relies on (for example Discover having no backend, and the proxy forwarding only `/api/auth` and `/api/registry`).

**Open decisions (defaults proposed)**

1. **Public Discover content:** the honest default above (explanation, illustrative example, Not supported lists). Real public data would need a backend API and a privacy decision about what institutions are happy to expose.
2. **Hosting:** the app is still local-only, so "Launch app" needs a real URL before it can go live.
3. **Merging Approvals into Settlement:** deviates from the PRD's separate Approvals tab; proposed because the audit found the flow too long.
4. **Accent colours on light:** #B6FF3E and #2F5D00 are my derivations, to be confirmed visually.
5. **Fonts:** the landing page's families, whatever they are in the code; no pixel face.
