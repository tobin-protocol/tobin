# 07 Responsive and accessibility audit

## What was actually inspected
- **Viewed (static images in `docs/screenshots/stage-f/`, earlier pass, may be stale):** Overview at 1440 and 390, session workspace Overview at 1440, global Approvals at 900.
- **Not viewed at all:** 1280, 768, 360, and any page other than those four at any width. All other statements are **source-derived**.
- **Not run by this audit:** axe, keyboard walkthrough, Playwright, any browser. Existing scripts and their recorded results are cited as **[reported-not-rerun]**.

## Breakpoints in use (source)
Tailwind defaults `sm 640 / md 768 / lg 1024 / xl 1280` plus one custom `min-[900px]` (GlobalObligations, `components/obligations/GlobalObligations.tsx`). Counts of responsive classes per file are highest in ActivityView, Overview, Shell, SessionsList, Data.tsx. Page max width 1200px with 16px (<640) / 24px gutters.

| Width | Behaviour (source-derived unless marked) |
|---|---|
| >= 1024 (lg) | Workspace and Overview are 2-column (content + 420px / 340px aside); action panel `lg:sticky top-24`. Wallet cell shows address text from lg. Search label from xl |
| 768-1023 (md) | Header row 2 tab bar visible; workspace stacks (panel above content); tables show all columns. 900px is visible in [screenshot Approvals 900]: 7 tabs fit |
| < 768 (max-md) | Tab row hidden; fixed bottom bar (h-16) with Overview, Sessions, Approvals, Activity, More; `ActionSheet` becomes a fixed bottom sheet above it; tap targets raised to 44px via `max-md:h-11 max-md:min-w-11`; `Table` hides columns marked `hideBelow:"md"`; content bottom padding `pb-24`/`max-md:pb-16` |
| < 640 (sm) | Bell hidden (and moved to More), Search button hidden (More has "Search loaded sessions"), org icon hidden, "Stellar Testnet" shortens to "Testnet" |
| 390 | [screenshot] Overview stacks; stat grid 2-up; relevant-sessions rows show clipped titles in the old image; attention table keeps 2 columns; bottom bar visible; no horizontal overflow visible in this image |
| 360 | Unknown / requires verification. Header row 1 contains brand, org selector (flex-1), Testnet chip, wallet cell, account button; at 360 the org selector may truncate heavily (source: `truncate`) |

Horizontal scroll risks (source): `PageTabs` is `overflow-x-auto` (intentional); `Table` wraps in `overflow-x-auto`; long ids use `break-all`.

## Semantics and structure
- Good: `<html lang="en">`; skip link "Skip to content" to `<main id="main" tabIndex=-1>` (root layout); one `<h1>` per page via `PageFrame` (auth pages have their own h1); `<nav aria-label>` for Primary, Breadcrumb, Session sections, Organization sections, Quick links; `aria-current="page"` on tabs; breadcrumb is an `<ol>`; tables have `<th scope="col">`, `aria-sort` support; list semantics for stat/lists; `role="status"`/`aria-busy` on skeleton regions (24 component files use role/aria-live).
- Gaps (source): `/approvals` active-tab handling means no `aria-current` item in the primary nav on that page; session `Stepper` and Overview use headings consistently? (h2 per card) but the workspace summary panel has no heading of its own, and `h1` is the session label. Headings in side panels use `h2` inside `<dialog>`, fine.
- Page `<title>` set per route via `metadata`; session title is the generic "Session" for all sessions (static `metadata`), so browser tabs/history cannot distinguish sessions.

## Keyboard and focus
- Global `:focus-visible` outline 2px #1d1d1d with 2px offset (`globals.css`). Form fields use `focus-within` outline on the card label.
- Modals (`Dialog`, `SidePanel`, `CommandPanel`) use native `<dialog>.showModal()`: focus trap, Escape and inert background are browser-provided; they have `aria-labelledby` (Dialog/SidePanel) or `aria-label` (CommandPanel). Initial focus is the browser default (first focusable) except CommandPanel (input focused by timeout).
- `Popover` (org selector, wallet, network, account, bottom More): Escape closes and returns focus to the trigger; outside click closes; trigger has `aria-expanded` + `aria-controls`; **no focus movement into the panel, no focus return when closing by selecting an item, no focus containment, no arrow-key navigation, no `aria-haspopup`** (source `ui/Overlays.tsx` 66-92). Selecting an org in the list closes the popover without refocusing the trigger.
- Command panel results are plain buttons in lists (no listbox/combobox roles, no arrow-key selection, no `aria-activedescendant`). Ctrl/Cmd+K opens it. The panel is keyboard usable with Tab.
- `SegmentTabs` use `aria-pressed` toggle buttons (acceptable; not a tablist).
- Session `PageTabs` are links in `<nav>` (not ARIA tabs): consistent with link navigation.
- [reported-not-rerun] `scripts/keyboard-walkthrough.mjs` asserts: skip link is first tab stop, sign in, navigate, create session with Space on checkboxes, record an obligation, every Tab stop shows a focus ring. Docs state it passes.

## Names, labels, forms
- Fields: `<label htmlFor>` wraps the whole card (`InputCard`); error text is linked with `aria-describedby` and `aria-invalid`; **hint text is not linked** to the control via `aria-describedby` (only the error id is) (`ui/Form.tsx`). Errors use `InlineError`; some pages use `role="alert"` (reconciliation diff, last-admin messages), others `role="status"`.
- Repeated "Open" buttons are given distinct `aria-label`s (`ButtonLink` forwards `aria-label`; defect fixed per `docs/web-redesign/application-audit.md` #14, source confirms).
- Icon-only buttons carry `aria-label` (Bell, Search, Account, Org selector, wallet). SVGs are `aria-hidden`.
- `ChoiceGroup` is a fieldset with `sr-only` radios.
- Date inputs (`type=date`) labelled "From (UTC)".
- Native `<select>` is used for pickers (good keyboard support).

## Colour and contrast
- Palette is monochrome: ink #000, muted #626262, disabled #b1b1b1, danger #b3261e, panel #f0f0f0 (`packages/ui-tokens/tokens.css`). Approximate contrast (computed by hand, not by tool): muted on white about 6:1; muted on #f0f0f0 about 5.2:1; danger on white about 6.5:1; disabled #b1b1b1 on white about 2:1 (disabled controls are exempt from WCAG contrast, but disabled primary buttons carry the only explanation text next to them).
- **Status is never colour-only**: `StatusMark` is dot or cross icon plus text; reconciliation failures use icon + text. The state difference between "done" (filled dot), "progress" (hollow dot), "action" (filled dot, bold) is subtle: filled vs hollow dot is a shape cue; "done" and "action" differ only by font weight.
- Input placeholder uses `disabled` grey (#b1b1b1) which is below 4.5:1 (placeholder text; only a hint like "100", "USD").

## Touch targets
- Desktop buttons are 36px high (`h-9`); below 768 raised to 44px; header icon buttons `h-9 min-w-9` desktop, 44px on mobile; large buttons 52px. Table row link buttons rely on the same. Tab links `h-12`. [reported-not-rerun] `a11y-scan.mjs` audits 44px targets at 390.

## Tables
Hand-rolled semantic `<table>` inside a scroll wrapper; `hideBelow="md"` hides cells with `hidden md:table-cell` (verified in source: header cells receive the same `hidden md:table-cell` class, so headers and cells stay aligned). Information in hidden columns on mobile (e.g. Reviewer, Since, Expires, Fingerprint) is not available as an alternative on small screens except via the row's detail panel, for some tables.

## Dialogs
Titles, descriptions, explicit action labels ("Reject settlement", never OK), destructive variant, Cancel always present. Dialog `description` is plain paragraph (not `aria-describedby`).

## Test coverage for accessibility
- `apps/web/scripts/a11y-scan.mjs`: manual script, needs `AXE_PATH` to an external axe-core file (axe-core 4.14.0 is installed in the monorepo root node_modules per `npm ls`-style lookup, but `@axe-core/playwright` is not); scans at 1440 and 390, tap-targets at 390, overflow at 1440/900/390 against a real seeded backend. Not part of CI (`package.json` scripts: `lint`, `typecheck`, `test` only).
- `scripts/keyboard-walkthrough.mjs`: manual, real backend.
- `e2e/smoke.spec.ts` (Playwright, 5 tests): gallery renders, StageRail never fills "Confirmed" without verified read-back, signed-out redirect, missing Freighter message, proxy refusals. No axe in e2e. No screen reader testing, no zoom/text-resize (200%/400%) testing, no `prefers-contrast`, no dark mode (`color-scheme: light` only). `prefers-reduced-motion` is honoured globally (`globals.css`).
- [reported-not-rerun] `docs/web-redesign/gap-analysis.md` states "axe: no violations on 66 page and width combinations"; not re-verified here.

## Biggest responsive and accessibility problems (ranked)
1. **A11Y-1 (Medium)** `Popover` lacks focus management (no move in, no containment, no return on selection) and the command panel lacks listbox/combobox semantics.
2. **A11Y-2 (Medium)** Static `<title>` "Session" for every session; no page-title distinction for changing tab state.
3. **A11Y-3 (Low)** Field hints not in `aria-describedby`.
4. **RESP-1 (Medium)** Hidden table columns on mobile drop information; per-page hand-rolled card alternatives are inconsistent (breakpoint 900 vs 768).
5. **RESP-2 (Medium)** Workspace bottom sheet (fixed above the fixed bottom bar) plus content padding: stacked fixed elements reduce viewport at small heights (source-derived; not viewed live).
6. **RESP-3 (Unknown)** 360px behaviour and 768px layout unverified.
7. **A11Y-4 (Low)** Approvals page has no active nav item on desktop.
