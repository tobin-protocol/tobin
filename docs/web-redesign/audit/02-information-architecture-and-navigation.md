# 02 Information architecture and navigation (existing IA only)

Source: `components/shell/Shell.tsx`, `components/shell/PageFrame.tsx`, `components/sessions/Workspace.tsx`, `components/organization/Organization.tsx`.

## Sitemap (as implemented)

```
Signed out:  /sign-in   /onboarding (signed in, incomplete)
Signed in (Shell):
  Overview                    /
  Clearing Sessions           /sessions
     Create                   /sessions/new
     Session workspace        /sessions/[id]  ?tab= overview | participants | obligations | netting | approvals | settlement | activity
  Obligations (cross-session) /obligations
  Organization                /organization ?tab= profile | members | invitations | wallets
  Activity (cross-session)    /activity
  Wallets                     /wallets
  Settings                    /settings
  --- outside the 7 tabs ---
  Approvals (cross-session)   /approvals
  Notifications (unsupported) /notifications
  Discover (unsupported)      /discover
  /dev/components, /api/[...path]
```

## Navigation surfaces

| Surface | Items | Notes |
|---|---|---|
| Header row 1 (always) | Brand link, **Org selector** popover, Stellar Testnet chip popover, Wallet cell popover (Connect Freighter / Check again), Bell (desktop sm+), Search/command button (hidden below sm), Account popover (Settings, Sign out) | The Testnet chip and Wallet cell are popovers with explanatory text, not links |
| Header row 2 (md+) | 7 underline tabs: Overview, Clearing Sessions, Obligations, Organization, Activity, Wallets, Settings | `NAV` in Shell.tsx. A number follows "Clearing Sessions" when the reviewer has pending approvals |
| Bottom bar (<768px) | Overview, Sessions, **Approvals**, Activity, More (Search loaded sessions, Notifications, Obligations, Organization, Wallets, Settings) | Different set from desktop: Approvals promoted, Obligations/Organization/Wallets/Settings moved to More |
| Breadcrumbs | `PageFrame` breadcrumbs: Org name / Page. Session: Org / Clearing Sessions / Session name | Org name is plain text, not a link |
| Session workspace | Stepper (6 groups, each links to a tab), 7 underline tabs with counts on Participants and Obligations, right "Next action" panel | Tab state is in the query string, so it is deep-linkable |
| Command panel (Ctrl/Cmd+K) | "Go to": 7 pages + Approvals; "Future capability": Discover (not available); "Loaded sessions": up to 50 sessions already in the React Query cache | Filters by substring on label. Notice text states it is not a search of the org. Cache-dependent: empty until Sessions/Overview has loaded |

Active tab logic (`activeOf`): `/notifications` highlights nothing; `/approvals` highlights "/approvals" which is **not in the tab list** so no desktop tab is active on that page (source-derived).

## Context dependence

- **Organization context**: every call is scoped by `org.id` from `AppGate` (`me.lastOrgId`, switchable). Switching org (`auth/workspace`) removes all non-"me" queries and refetches. Sessions belong to one org; the workspace shows "Session not found... may belong to another organization" when the URL's session is in a different org. There is no cross-org view.
- **Session context**: only inside `/sessions/[id]`. Global pages (Obligations, Approvals, Activity) re-enter a session via links with `?tab=`.
- **Where context is lost / unclear**
  1. The "Approvals pending" count is displayed as a number on the **Clearing Sessions** tab (countLabel "approvals awaiting your review (derived from up to 10 sessions)"), while the Approvals page has no tab on desktop. Source: Shell.tsx `navItems`.
  2. On desktop, `/approvals` has no active tab; the user loses "where am I".
  3. Session Approvals tab vs global Approvals page vs Settlement tab "review" share the same word for different decisions (calculation review vs settlement-batch review).
  4. Org name in breadcrumbs is not linked; "Organization" page repeats org name in breadcrumb and title.
  5. Session workspace has no link back to the filtered list the user came from (breadcrumb goes to unfiltered `/sessions`).
  6. Org switch from within a session page leads to "Session not found" for the new org (no redirect to `/sessions`).

## Redundant or duplicate destinations

| Duplicate | Where |
|---|---|
| Wallets in two places | `/wallets` (own wallets + browser wallet + org verified accounts) and Organization > Wallets tab (org verified accounts + claims, same `OrgWallets` component rendered in both) |
| Account/default org | Org selector (header), Settings "Default organization" select, Account popover "Settings" link |
| Approvals | `/approvals` global, session Approvals tab, session Settlement tab, Overview Attention row and quick link, bottom bar item |
| Activity | `/activity`, session Activity tab, session Overview "Recent events", Overview "Recent activity", Settings "Account activity" (a different, account-level audit) |
| Obligations | `/obligations` (read-only global) vs session Obligations tab (record/void) |
| "Create session" | Overview primary action, Sessions list primary action, empty states |
| Sign out | Account popover and Settings "Sign out everywhere" (different meaning) |
| Role help | Settings "About access", Organization Members card, Wallets note |

## Hidden actions

- Command panel and Ctrl/Cmd+K (keyboard-only discoverability; the Search button is hidden below `sm`, but bottom-bar More has "Search loaded sessions").
- Discover only via command panel.
- Wallet connect only via header Wallet popover (there is no connect button on `/wallets`).
- Reviewer grant, role change, suspend, remove: inside a member side panel behind the row's "Open".
- Sign out: inside Account popover then confirmation dialog.
- One-time invitation token: shown once in a dialog after creating an invitation (cannot be retrieved).
- Settlement/review actions live in the right-hand action panel, which becomes a collapsed bottom sheet below 768px (open state in `sessionStorage`).

## Evaluation (facts, not redesign)

- 7 top-level tabs fit at 900px per the screenshot [screenshot]; the tab bar is `overflow-x-auto` so it scrolls horizontally if it does not fit (source).
- Desktop and mobile navigation differ in membership (Approvals is a mobile primary item, not a desktop one).
- The command panel offers 9 static destinations and only already-loaded sessions; its own notice says so.
- The IA expresses the backend boundary honestly (Notifications, Discover are explicit unsupported pages), but those two are reachable surfaces that contain no function.
- Depth: Org > Sessions > Session > Tab > record side panel is 4 levels; side panels (obligation, member, wallet, activity record, calculation details) are used instead of routes, so records have no URL except obligations (`?ob=`).
