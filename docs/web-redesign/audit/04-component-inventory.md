# 04 Component inventory

All under `apps/web/components/` unless noted. Category: shell / shared (design-system primitives in `ui/`) / domain / utility. Assessment: keep / improve / consolidate / reconsider. Line counts from the file listing.

There is **no shadcn/ui, no Radix and no component library** in `apps/web`; every primitive is hand-written with Tailwind v4 token utilities (08). The only third-party UI logic is TanStack Table (rendering is custom).

## Shell and providers

| Component | File | Cat | Used by | Purpose / props | Data deps | Interactions | Reuse | Assessment |
|---|---|---|---|---|---|---|---|---|
| Providers | `Providers.tsx` (14) | shell | root layout | React Query client (retry false, staleTime 15s, no refetch on focus) + WalletProvider | none | none | single | keep |
| WalletProvider / useWallet | `wallet/WalletProvider.tsx` (42) | utility | Shell, sign-in, Wallets | Freighter detection state `{wallet, connect, refresh, api}` | `lib/wallet/freighter.ts` | connect | global | keep |
| AppGate, useMe, useWorkspace | `shell/session.tsx` (90) | shell | (app) layout, all pages | Auth gate, redirect to sign-in/onboarding, workspace context (me, orgs, org, actor, switchOrg) | `auth/me`, `members` | switch org | global | keep (note: mixes auth gate, org context and reviewer lookup) |
| Shell (+ OrgSelector, EnvIndicator, WalletCell, Bell, AccountMenu, SearchButton, BottomNav) | `shell/Shell.tsx` (266) | shell | (app) layout | Two-row header, bottom bar, popovers, command panel; exports `NAV` | `org`, `me`, `useApprovalsPending` (fires on every page) | many | single | **improve**: 8 sub-components in one file; approvals fan-out in global shell |
| PageFrame | `shell/PageFrame.tsx` (33) | shell | every page | Title, breadcrumbs, action, optional testnet strip | none | none | high | keep |
| Wordmark / BrandMark | `shell/BrandMark.tsx` (20) | shell | Shell, auth layout | logo | none | none | high | keep |

## Shared primitives (`ui/`)

| Component | File | Props (summary) | Used by | Notes / assessment |
|---|---|---|---|---|
| Button, ButtonLink | `ui/Button.tsx` | variant (primary/secondary/quiet/destructive), size, loading | everywhere | keep. ButtonLink accepts only `aria-label`, `title` (no other anchor attrs) |
| Table | `ui/Data.tsx` | columns `Col<T>` (id, header, cell, align, sortable, hideBelow:"md"), data, getRowId, loading/error/empty, sort, pagination | ~10 pages | keep/improve. TanStack Table v9 used only for row model; `hideBelow` drops columns on mobile, no stacked-card mode (pages hand-roll cards, e.g. GlobalObligations, SessionsList) |
| PageTabs, SegmentTabs | `ui/Data.tsx` | items, activeHref; value/onChange | Shell, Workspace, Organization; filters | PageTabs is link-based nav with `aria-current`; SegmentTabs uses `aria-pressed` buttons. keep |
| Identifier, Amount, AvatarStack | `ui/Data.tsx` | value/head/tail; value+asset; names | many | keep |
| Skeleton, EmptyState, NotSupported, PermissionState, AccessDenied, ErrorState, InlineError, StatusMark, CrossIcon | `ui/Feedback.tsx` (98) | feedback states | everywhere | keep. `PermissionState` used only in the dev gallery (unused in product) |
| Panel, Card, DataCard, StatGrid, Banner, TestnetStrip, SampleDataBanner, DerivedNote | `ui/Surfaces.tsx` (63) | surfaces | everywhere | keep. Panel and Card are nested everywhere (grey panel containing white cards) |
| TextField, TextAreaField, SelectField, ChoiceGroup, InputCard | `ui/Form.tsx` (72) | label, id, hint, error, right | forms | keep. Label/hint/error wiring in `InputCard`; `InputCard` used only via fields and the gallery |
| Dialog, SidePanel, Popover, CommandPanel | `ui/Overlays.tsx` (123) | open/onClose/title/primary...; Popover render props | Shell, Organization, Wallets, tabs | Dialog/SidePanel/CommandPanel use native `<dialog>.showModal()` (built-in focus trap and Esc). Popover is hand-rolled: Esc and outside click only, no focus move on open, no arrow keys. **improve** |
| Stepper, NextAction, StageRail, ApprovalBlock, SignatureBlock | `ui/Flow.tsx` (140) | lifecycle/stage views | Workspace, tabs, SettlementTab, ApprovalsTab | domain-flavoured; live in `ui/`. `SignatureBlock` is rendered with `signingSupported=false` only (signing unsupported). consider moving to domain |

## Domain components

| Component | File (lines) | Used by | Purpose | Data deps | Assessment |
|---|---|---|---|---|---|
| Overview | `overview/Overview.tsx` (184) | `/` | summary page | 5 query types + approvals pending + `derive()` | improve (page-coupled, heavy fan-out) |
| SessionsList | `sessions/SessionsList.tsx` (153) | `/sessions` | list/filter/sort | `sessions.list` | keep; hand-rolled card list duplicate |
| CreateSession | `sessions/CreateSession.tsx` (171) | `/sessions/new` | wizard | members, create, add participants | keep |
| Workspace | `sessions/Workspace.tsx` (184) | `/sessions/[id]` | shell of the workspace (queries, lifecycle, tabs, ActionSheet) | 6+ queries | improve: queries + layout + action panel switch in one component |
| OverviewTab, ParticipantsTab, ActivityTab | `sessions/tabs.tsx` (201) | Workspace | three tabs in one file | session data | improve (split) |
| ActionSheet | `sessions/ActionSheet.tsx` (37) | Workspace | right panel / mobile bottom sheet; state in sessionStorage via `useSyncExternalStore` | none | keep |
| shared (CopyButton, reasonOf) | `sessions/shared.tsx` (40) | many | utilities | none | keep (also imported by Organization/Wallets/Settings; naming implies sessions-only) |
| ObligationsTab / RecordObligationPanel / GlobalObligations | `obligations/*` (129/126/118) | workspace, `/obligations` | list, record form with review dialog, global list | obligations, assets | consolidate list logic between Tab and Global (similar filters/columns) |
| NettingTab / RunNettingPanel | `netting/NettingTab.tsx` (230) | workspace | results + run | calculation, obligations | improve (largest domain file) |
| ApprovalsTab / ReviewPanel / GlobalApprovals / usePending | `approvals/*` (80/104/97/36) | workspace, `/approvals`, Shell | review UI and cross-session pending count | authorization, settlement, calculation | usePending duplicates GlobalApprovals's per-session reads (shared keys); consolidate |
| SettlementTab / SettlementPanel / useSettlement / FailureNote | `settlement/*` (135/145/30/18) | workspace | prepared batch, steps, actions | settlement list, batch, execution, attempts, calculation | keep; hook is a good seam |
| ActivityView / GlobalActivity | `activity/*` (109/48) | `/activity`, session tab | filters + list + side panel | derived | keep |
| Organization (Profile/Members/Invitations tabs) | `organization/Organization.tsx` (238) | `/organization` | four tabs in one file | org APIs | improve (split per tab) |
| Wallets / OrgWallets | `wallets/Wallets.tsx` (139) | `/wallets`, Organization | wallet lists, detail panel, disconnect | `me`, Freighter, org verifications | consolidate with Organization Wallets tab |
| Settings | `settings/Settings.tsx` (94) | `/settings` | account/org settings | audit, profile | keep |

## Page-level (not in `components/`)
`app/(auth)/sign-in/page.tsx` (132: WalletSignIn, EmailSignIn, StepIndicator, SignInInner in one file), `app/(auth)/onboarding/page.tsx` (141: ProfileStep, CreateOrganization, JoinOrganization), `app/dev/components/page.tsx` (190).

## Duplicates, overloaded and page-coupled
- **Duplicated**: cross-session derivation pattern (Overview, GlobalActivity, GlobalApprovals, GlobalObligations, usePending each re-implement `selectForReading` + `useQueries` + a `stamp` string with `eslint-disable react-hooks/exhaustive-deps`). Candidate for one hook.
- **Duplicated**: card-list vs table dual rendering (SessionsList, GlobalObligations).
- **Overloaded**: `Shell.tsx`, `Workspace.tsx`, `Organization.tsx`, `tabs.tsx`, sign-in and onboarding pages each hold several components.
- **Page-coupled**: `Overview` and the global lists depend on `lib/derived/*`; `NextAction` logic is split between `lib/sessions/next-action.ts` and the card.
- **Unused in product**: `PermissionState`, `InputCard` (direct), `SignatureBlock` shows only unsupported state.
- **Pure logic is well separated** in `lib/` (stages, lifecycle, layers, next-action, rules, derive) and is unit-tested (09 / 07).
- Icons: inline SVG paths in Shell and Feedback; no icon library (08).
