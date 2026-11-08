# Tobin web app: design specification (Ondo-led, from the PRD)

## Summary

This turns the Tobin web app PRD into a design specification. Look and feel come from the Ondo app teardown. Structure and a few patterns come from the Symbiotic teardown. Every screen is checked against the PRD's non-negotiable constraints.

**Decision rules, in order**

1. **PRD constraints win.** No fabricated numbers, approval is never shown as signing, prepared / signed / submitted / confirmed are four separate states, and the network and organization are always visible.
2. **Ondo wins on look.** White page, #F0F0F0 panels, white inner cards, 8/16/24/32 radii, one weight (500), one primary action per view, no borders, no shadows, no accent colour, no pills.
3. **Symbiotic wins on structure** where Ondo has nothing to offer: underline sub-tabs, honest "No data" empty states, the 3-column label/value grid, stacked avatars with +N, the same-layout skeleton loader, URL-driven sort.
4. **Neither wins on content.** Ondo is a trading app and Symbiotic is a staking app. Prices, charts, APY, points and TVL are rejected. Tobin's heroes are the obligation graph and the net position.

**Honesty note.** Both teardowns measured only part of each app (see their method sections). Hover, motion, mobile and populated states were not seen, so those are specified here as proposals, not as copies.

## Foundations

**Surfaces (Ondo)**

| Layer | Value | Use |
| --- | --- | --- |
| Page | #FFFFFF | app background |
| Panel | #F0F0F0, 24px radius | workspaces, side panels, summary blocks |
| Card | #FFFFFF, 16px radius, 16–24px padding | inner cards, form groups, table containers |
| Data card | neutral tint, 32px radius, 24px padding | the one headline figure on a screen |
| Divider | #1D1D1D at 10%, 1px | between table rows and inside cards (replaces borders; borrowed from Symbiotic's hairlines) |

**Ink:** #000 strong, #626262 muted, #B1B1B1 disabled. Buttons use #1D1D1D, with 10% and 5% translucent-ink variants.

**Type:** Geist as the stand-in for Gellix, weight 500 throughout. Scale from Ondo: 48 hero number, 28 page title, 18 primary button, 14 body and labels, 12 small muted uppercase labels (the Symbiotic label style, in Geist not mono). Identifiers, hashes and addresses use JetBrains Mono at 13px, the only mono in the app.

**Radii:** 8 buttons and inputs, 16 cards, 24 panels, 32 data card. **Shadow:** none, except a single soft shadow on menus and dialogs so they separate from the page. **Borders:** none, except inputs (1px ink at 20%).

**Status language (no pills, no accent colour)**

Only one semantic colour is allowed (red), and only for failures. Everything else is greyscale, so status relies on label and shape, not hue.

| State family | Treatment |
| --- | --- |
| In progress | 8px outlined dot + muted text |
| Done / confirmed | 8px filled #1D1D1D dot + text; confirmed on-chain additionally shows a check |
| Needs my action | filled dot + bold-looking 500 text + a quiet button on the row |
| Failed / refused / rejected | text in red (#B3261E, a data colour only) + cross icon |
| Not available / not supported | #B1B1B1 text + "Not supported" |

Red is the only colour in the UI. It appears on failures and destructive confirmations, never as decoration. This is a proposal to confirm, since you decided on greyscale only and a failure needs to be recognisable.

## App shell

Ondo uses a single top bar; Symbiotic uses a bordered header plus underline tabs. Tobin has seven destinations and four global indicators, so it needs two rows.

**Row 1: global bar (64px, white, 1px divider below)**

- Left: Tobin funnel-T mark and wordmark.
- Organization selector next to it: logo tile, name, type in muted 12px, chevron. This is the most prominent control in the bar because the PRD requires the organization to be unmistakable. The dropdown is a 24px-radius panel listing memberships, current one marked with a filled dot.
- Right, in order: **environment indicator**, wallet cell, notifications bell with unread count, account avatar menu.

**Environment indicator.** A 36px quiet button reading "Stellar Testnet" with an outlined dot. It is always in the bar. On any sensitive screen (obligation submit, approval, settlement review, signing) a full-width #F0F0F0 strip under the bar repeats it: "Testnet. Test assets only. Nothing here moves real funds." Mainnet, if ever supported, uses a filled #1D1D1D button with inverted text so the two can never look alike.

**Wallet cell** (Symbiotic pattern): avatar, shortened address (GABC…X7Q2), provider name in muted 12px, state dot. The menu shows connected vs verified separately, per the PRD.

**Row 2: primary navigation (48px)**

Seven underline tabs in the Symbiotic style but in Ondo type (14/500, active = black with 2px underline, inactive = #626262): Overview · Clearing Sessions · Obligations · Organization · Activity · Wallets · Settings. A badge count (plain number, no pill) follows a label when action is pending, for example "Clearing Sessions 3".

**Page frame:** content max width 1200px, 24px gutters, page title 28/500 with breadcrumbs above it in 14 muted, and page actions right-aligned (one primary at most).

**Global search:** a 36px quiet button with a search icon in row 1; opens a centred command panel (⌘K) grouped by record type.

## Component library

| Component | Spec | Source |
| --- | --- | --- |
| Button, primary | #1D1D1D, white 18/500, 8px radius, 52px tall (full width in panels), one per view | Ondo |
| Button, secondary / quiet | 10% / 5% translucent ink, 36px, 8px radius | Ondo |
| Button, destructive | white with red text and 1px red-at-30% border; confirm in a dialog | Tobin (PRD 19.5) |
| Panel | #F0F0F0, 24px radius | Ondo |
| Card / InputCard | white, 16px radius, 16px padding; muted 14 label above value | Ondo |
| DataCard | neutral tint, 32px radius, hero number 48/500 | Ondo |
| StatGrid | 3 columns, 12px muted uppercase label over 16/500 value, hairline above | Symbiotic |
| Tabs, page level | underline, 14/500 | Symbiotic |
| Tabs, filter level | quiet-button segments, active filled | Ondo |
| Table | no cell borders, 1px row dividers, 56px rows, sticky header, 12px muted uppercase headers, right-aligned numbers, mono ids | Ondo + Symbiotic |
| Entity row/card | logo circle, 20px name, muted mono address, StatGrid | Symbiotic |
| AvatarStack | overlapping 24px circles + "+N" | Symbiotic |
| StatusMark | dot or icon + text (see Foundations) | Tobin |
| Stepper / Timeline | see next section | Tobin |
| Sort bar | "Sort by" muted label, value + chevron, state in the URL | Symbiotic |
| Skeleton | same layout as the loaded view, #F0F0F0 blocks | Symbiotic |
| EmptyState | same size as the filled state, muted "No data" value plus one sentence and, if permitted, one action | Symbiotic + PRD 19.2 |
| PermissionState | disabled control + inline reason ("Only approvers can do this") | Tobin (PRD 19.4) |
| Dialog | 24px radius, soft shadow, summary card inside, primary + quiet button | Ondo |
| SidePanel | 480px right drawer on #F0F0F0 for record detail without leaving the list | Tobin |
| Banner | #F0F0F0 full-width strip, 14px, used for testnet and unverified notices | Ondo banner pattern |
| Amount | value + asset code always together, e.g. "1,200.00 USDC"; never a bare number | PRD 20 |
| Identifier | mono 13px, truncated middle, copy on click, full value in tooltip | Symbiotic address style |

## Lifecycle, approval vs signing, transaction stages

These three patterns carry the PRD's hardest constraints (7.4, 11.6, 12.5). They are Tobin-specific, so neither teardown supplies them; they are built from the Ondo surfaces.

**1. Session lifecycle stepper**

A horizontal stepper at the top of the session workspace, inside a white card on the #F0F0F0 panel. Twelve states are too many to show at once, so show the main path in six groups and let the current group expand:

Draft → Participation → Obligations → Netting → Approval → Settlement

- Completed group: filled dot and check, black text.
- Current group: filled ring and a 14px sub-label with the exact state (for example "Awaiting approval").
- Future group: outlined dot, #B1B1B1 text.
- Cancelled and Failed replace the line after the point they happened, in red text, with the reason on hover and in the Activity tab.
- Below the stepper, a **Next action** card: who must do what next, and whether it is the current user. This is the PRD's "what the current organization needs to do next".

The stepper must be driven by the real protocol state. Where a state exists only in the application, label it "Application record" in muted text (PRD 7.4).

**2. Approval is not signing**

Two separate, visually different blocks that never share a row or a button:

- **Application approval:** a white card titled "Approvals", listing approvers with their decision and timestamp. Its button reads *Approve* or *Reject*. Icon: check-in-circle.
- **Stellar authorization:** a #F0F0F0 card titled "Wallet signatures", listing signers, weight, and threshold ("2 of 3 required"), with state *Awaiting signature / Signed / Rejected*. Its button reads *Sign with wallet* and opens the wallet. Icon: key.

After an application approval, show a muted line: "Approval recorded in Tobin. This is not an on-chain signature." A role (Approver) never appears next to a signature state.

**3. Transaction stage rail**

Four fixed stages, always all visible, on every settlement instruction and in the activity record: **Prepared → Signed → Submitted → Confirmed**.

- Each stage has its own timestamp slot and evidence (prepared: instruction id; signed: signer; submitted: hash; confirmed: ledger number plus "Independently verified on Stellar").
- Only the stage actually reached is filled. Submitted never shows a check.
- *Confirmed* is shown only after the read-back verification. Until then the rail reads "Submitted, awaiting verification".
- Failed shows at the stage where it stopped, in red, with the reason and a *View on explorer* link when a hash exists. No automatic retry button; retry is a separate, confirmed action (PRD 12.7).

## Screen specs, part 1: access, onboarding, overview, sessions

**Sign-in and wallet connection (PRD 4)**

Centred 420px #F0F0F0 panel on the white page, the Ondo trade panel pattern reused. Inside: title, one white InputCard per method, one primary button. Account sign-in and wallet connection are two separate steps with a two-step indicator, because the PRD wants them distinguished. Wallet step lists providers as white rows (logo, name, "Not installed" or "Detected"). Every failure in 4.2 (rejected, expired challenge, invalid signature) is an inline message in the panel, not a toast. Copy states plainly that Tobin never asks for a seed phrase or private key.

**First-time user (PRD 4.3, 5)**

No empty dashboard. Two large white cards side by side on the panel: *Create an organization* and *Join with an invitation*. Create is a 3-step form (details, review, confirm) in the same centred panel. The review step states that creating an organization does not verify it legally (PRD 5.1).

**Overview (PRD 6.1)**

- Top: page title, then a #F0F0F0 panel containing one DataCard with the headline "Needs your attention" count, beside a StatGrid of real counts (sessions: total, active, completed, pending; obligations recorded; participants). Each count is real data or reads "No data".
- No sparklines, no charts, no value totals unless verifiable. "Settled value" appears only when confirmed on-chain, otherwise "Not available".
- Below: **Attention list**, a table of actions awaiting this organization (invitations, approvals, signatures, failures) with a quiet button per row. This is the primary content of the screen.
- Below that: **Recent activity**, five rows, then "View all".
- Organization summary (ids, accounts, members, network) sits in a narrow right column as a StatGrid.

**Clearing Sessions list (PRD 7.1)**

- Quick-filter segments: All · Created by my organization · Joined · Active · Awaiting my organization · Completed.
- Search field + status filter + date filter + sort bar (URL-driven). Primary button "Create session" top right if permitted, otherwise a disabled button with the reason.
- Table columns: Session (name and mono id), Initiator, Participants (AvatarStack), Obligations (count), Assets (codes), Status (StatusMark), Updated. Row click opens the session. Pagination below, with page size.
- Under about 900px width each row becomes a card with a StatGrid (Symbiotic entity card pattern).

**Create session (PRD 7.2)**

Five-step wizard inside one centred panel with a step rail above: Basics · Participants · Parameters · Review · Create. Participants step: search organizations, add as white rows with remove, initiator marked. Parameters step shows only fields the protocol supports; unsupported ones are not rendered. Review step is a white summary card; the primary button reads "Create session" and the result screen shows the session id in mono with a copy action and "Open session workspace".

**Session invitation (PRD 7.3)**

A full-page panel: initiator, participants (where permitted), parameters, then *Accept* (primary) and *Decline* (quiet). If joining needs an on-chain step, the button becomes *Continue to wallet* and the transaction stage rail appears after.

## Screen specs, part 2: the session workspace

The session workspace is the centre of the product (PRD 8). It is the Ondo asset page translated: a header block on top, a main column on the left, and a 420px #F0F0F0 **action panel** on the right that holds the one thing this user can do next.

**Header block (PRD 8.1):** session name (28/500), mono id with copy, StatusMark, initiator, created and updated timestamps, participant AvatarStack. Below it, the lifecycle stepper and Next action card (see above). Underline sub-tabs: Overview · Participants · Obligations · Netting · Approvals · Settlement · Activity, each with a count where one exists.

**Action panel (right, 420px).** It changes with state and role. Examples: *Add obligation* while collecting, *Run netting* when ready, *Approve / Reject* for an approver, *Prepare settlement* when approved, *Sign with wallet* for a signer. It always shows one primary button. If the user cannot act, the same panel shows the reason ("Waiting for Bank B to join") instead of hiding. This is the Ondo "connect-first panel" idea applied to permissions.

**Overview tab (8.3):** details StatGrid, participating organizations, gross and net headline (DataCard, only when netting exists), approval progress, settlement status, recent activity.

**Participants tab (8.4):** table of organizations (name, id, Stellar account in mono, participation status, joined date, authorization status). Row opens a SidePanel with history. "Invite participant" only if permitted.

**Obligations tab (8.5):** table with debtor, creditor, asset, amount, status, created. Filters for debtor, creditor, asset, status; search by reference. *Add obligation* opens the action panel form (see Obligations below).

**Netting tab (PRD 10) — the signature screen**

- Top: three-step strip *Eligible inputs → Calculation → Result*, with the current step active.
- **Inputs state:** table of eligible obligations and a separate table of excluded ones with the reason for each (never silently dropped, PRD 10.6). Primary action in the panel: "Run netting" with a one-line summary of what will be included.
- **Processing state:** the panel button becomes a progress row; the page keeps its layout (skeleton on the result area).
- **Result state:** a single DataCard comparing **Gross** and **Net** side by side with the reduction only if mathematically established. Illustrative layout only: for the Tobin example, gross 250 and net 30. Never show these numbers in the product unless they come from a real session.
- **Participant positions table:** organization, owed, receivable, net position, asset, direction (Pays / Receives / Zero), with net debtors, net creditors and zero positions grouped in that order and separate sections per asset (PRD 20, no cross-asset totals).
- **Original vs net:** two-pane view. Left, the bilateral obligation list (A→B, B→C, C→A); right, resulting net instructions. Hovering a row on one side highlights the connected rows on the other. A second view is a simple directed graph for three to ten participants. Both are optional views of the same data, a segment control switches them.
- **Calculation details (SidePanel or sub-page):** calculation id, version, timestamp, validation result, input records, per-participant breakdown.
- Failed calculation: red inline message in the panel with an "Inspect errors" link to a table of validation issues.

**Approvals tab (11):** the two-block pattern from the previous section. Application approvals as a white card with approver rows (name, role, decision, time). Required vs outstanding shown as "2 of 3 approved" text and a thin 4px progress line in #1D1D1D on #DEDEDE. Approve opens a review dialog containing the operation summary card, netting result and proposed instructions; Reject requires a reason field before the button enables.

**Settlement tab (12):** summary StatGrid (session, approved netting reference, asset, amount, instruction count, network); table of instructions (sender, receiver, asset, amount, stage rail, hash). Flow in the action panel, step by step: *Prepare* → *Review* → *Sign* → *Submit* → *Verify*, each a separate screen state so no single click can prepare, sign and submit. The review step shows a diff line when the prepared transaction differs from the approved settlement, in red, and disables the next button. Details show hash, network, source, destination, asset, amount, timestamps, verification status, and an explorer link.

**Activity tab (8.9):** chronological list (see Activity).

## Screen specs, part 3: obligations, activity, wallets, organization, settings

**Obligations (PRD 9)**

- *Global list:* same table as in a session plus a Session column. Filters: session, debtor, creditor, asset, status; search; sort; pagination.
- *Create:* Ondo trade-panel form. Panel with stacked white InputCards: Session (only eligible ones), Debtor, Creditor (only participants), Asset and Amount (amount input with asset selector on the right, exactly the Ondo spend card), Reference, Supporting info, optional due date. Primary button "Review obligation", then a review dialog with the summary, then "Record obligation". Validation messages appear under the field: ineligible participant, unsupported asset, precision, duplicate.
- *Detail:* DataCard with amount and asset, StatGrid of the fields, then a History timeline (created by, events, approvals, protocol references). No edit or delete controls. A correction, where supported, is a separate action that creates its own history entry.

**Activity (PRD 13)**

A list, not cards: each row has time, actor, operation, affected entity (link), result (StatusMark) and reference (mono). Filters: event type, user, session, date range, result, organization. Row click opens a SidePanel with the full record and the transaction evidence. Records are read-only; there are no edit affordances. Session Activity tab is the same component filtered to one session.

**Wallets (PRD 14)**

Table of wallets: address (mono, copy), provider, organization, network, connection state, verification state, date associated, primary mark. Connected and verified are two separate columns. Wallet detail: full address, network, provider, signer information (address, weight, threshold) where supported, and recent activity. *Disconnect* is a quiet button; its dialog says it does not delete the Stellar account. A note repeats that application roles do not grant signing authority.

**Organization (PRD 5)**

Sub-tabs: Profile · Members · Invitations · Wallets. Members is a table (name, email, role, status, joined, last activity) with Invite, Change role, Remove, Revoke. Change role opens a dialog that lists the permission differences before confirming. Remove lists the consequences; the owner row shows "Transfer ownership first" instead of a remove action. Invitation states (pending, accepted, rejected, expired, revoked) use StatusMarks.

**Settings (PRD 16):** two groups with a left sub-nav: Organization (profile, wallets, members, permissions) and Account (profile, security, active sessions with revoke, notification preferences). Only options with backend support are rendered.

**Notifications (PRD 15):** bell opens a 24px-radius dropdown panel: unread count, filter segments (All, Needs action), rows with icon, text, relative time; click goes to the entity; "Mark all as read" at the foot. A full page exists at /notifications with the same list.

**Global search (PRD 17):** command panel results grouped by type (Sessions, Organizations, Obligations, Settlements, Transactions, Activity), each with a type label and a direct route, filtered by the user's permissions.

## States, responsive rules, traceability, build order, open decisions

**State coverage (PRD 19)**

- *Loading:* skeleton with the loaded layout (Symbiotic). Long operations (netting, submission, verification) use a progress row in the action panel, never a blocking spinner.
- *Empty:* each list has a defined message and a next action only if the role allows it. Values read "No data", never 0.
- *Error:* inline in the panel or form, plain language, with the next step. Network errors get a retry quiet button.
- *Permission:* disabled control + reason line; whole-page denial is a panel titled "You don't have access to this session" with who can grant it.
- *Confirmation:* dialogs for every item in PRD 19.5, each containing a summary card and a primary button whose label is the action ("Reject operation", not "OK").

**Responsive (PRD 21)**

| Width | Behaviour |
| --- | --- |
| 1200px and up | full layout: two rows of nav, main column + 420px action panel |
| 768–1199px | action panel moves under the header block; tables keep key columns, others move into the SidePanel |
| under 768px | nav becomes a bottom bar for Overview, Sessions, Approvals, Activity, More; tables become stacked cards (Symbiotic card pattern); the action panel becomes a sticky bottom sheet with the primary button; environment strip stays pinned |

On mobile the netting comparison, review dialogs and the stage rail remain complete; nothing is dropped from a confirmation step.

**PRD traceability**

| PRD section | Where it lives in this spec |
| --- | --- |
| 3 Navigation and header | App shell |
| 4–5 Auth, onboarding, organization | Part 1, Part 3 |
| 6 Overview | Part 1 |
| 7 Sessions | Part 1, lifecycle stepper |
| 8 Session workspace | Part 2 |
| 9 Obligations | Part 3 |
| 10 Netting | Part 2 (Netting tab) |
| 11 Approvals | Lifecycle section, Part 2 |
| 12 Settlement | Transaction stage rail, Part 2 |
| 13–17 Activity, wallets, notifications, settings, search | Part 3 |
| 19–21 States, financial data, responsive | this section, Component library |
| 23 Constraints | Decision rules (Summary) and every screen |

**Suggested build order**

1. Tokens, shell, component library with all states.
2. Sign-in, wallet connection, onboarding, organization.
3. Sessions list, create session, session workspace shell and stepper.
4. Obligations (record, list, detail).
5. Netting tab with real test data.
6. Approvals, then settlement stages and verification.
7. Activity, notifications, search, settings.
8. Responsive pass and empty/error/permission audit.

Match the product's real maturity: build only what the protocol and backend support at each step and mark the rest "Not supported" or leave it out (PRD 23.12).

**Open decisions for you**

- Red for failures: allowed as the single semantic colour, or fully greyscale (icon and text only)?
- Two-row header vs a left sidebar for the seven destinations. This spec uses two rows because it matches Ondo's top bar.
- Whether the netting graph view ships in the first version or only the two-pane comparison.
- Accent for the logo (still unresolved).
- Unseen in both teardowns: hover and focus states, motion, mobile of the source apps. These are proposals above.
