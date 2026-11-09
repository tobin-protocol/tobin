# 01 Route and page inventory

Source: `apps/web/app/**`. Count: **15 pages + 1 API route handler**. No `loading.tsx`, `error.tsx`, `not-found.tsx` or `proxy.ts/middleware.ts` exists in `apps/web` (searched). Unknown paths therefore get Next's default 404; the signed-in gate is client-side only (`components/shell/session.tsx` `AppGate`), so protected pages briefly render a skeleton before redirecting to `/sign-in?expired=1` on 401.

Layouts: root `app/layout.tsx` (fonts Geist and JetBrains Mono via `next/font/google`, skip link, `Providers` = React Query + WalletProvider); `app/(app)/layout.tsx` = `AppGate` + `Shell` (header with two rows, bottom bar under 768px); `app/(auth)/layout.tsx` = simple header (wordmark + Testnet chip), centred panel, testnet footer. `/dev/components` uses only the root layout.

Permission column: "Admin/Member/Reviewer" are the only real roles; `can()` in `lib/permissions/can.ts` is presentational, the server decides.

## Page table

| Route | Page | Purpose | Entry point | Auth | Layout | Main components | Data source | User actions | Permissions | Responsive | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | Overview | Org summary, sessions that matter, attention, recent activity | Brand link, tab "Overview", post sign-in | Yes | (app) Shell + PageFrame | `components/overview/Overview.tsx`, `DataCard`, `StatGrid`, `Table`, `DerivedNote` | `GET orgs/:id`, `/members`, `/invitations` (admin), `/sessions` + per session `detail`, `obligations`, `authorization` for newest 10 sessions, plus approvals-pending reads | Create session, quick links, open session/tab | Create session admin only (disabled + reason otherwise) | 2-column at lg (`lg:grid-cols-[1fr_340px]`), stacks below; tables hide columns below md | Derived (capped) |
| `/sessions` | Clearing Sessions list | Search, filter, sort, paginate sessions | Tab "Clearing Sessions", bottom bar "Sessions" | Yes | Shell + PageFrame | `SessionsList.tsx` | `GET orgs/:id/sessions` (full list, all filtering in browser, `lib/sessions/list.ts`, PAGE_SIZE 10) plus participants/obligation counts for visible rows (derived) | Search `q`, provenance filter, sort, "has activity", create, open | Create admin | Table at md+, card list below (source) | Implemented (client-side filter) |
| `/sessions/new` | Create session | 3-step wizard: details, participants, review, then created | "Create session" buttons | Yes | Shell + PageFrame | `CreateSession.tsx` | `POST orgs/:id/sessions {label}`, then one `POST .../participants` per chosen member; `GET members` | Name session, pick members, create, open workspace | Admin only; others see `AccessDenied` | Single column | Implemented |
| `/sessions/[sessionId]` | Session workspace | Heart of the app: stepper + 7 tabs + right action panel | Session links everywhere; `?tab=` deep links | Yes | Shell + PageFrame (sensitive: testnet strip) | `Workspace.tsx`, `tabs.tsx`, `ObligationsTab`, `NettingTab`, `ApprovalsTab`, `SettlementTab`, `ActionSheet`, panels | 5 parallel GETs (detail, participants, obligations, readiness, authorization) + settlement list, latest batch, execution, attempts, calculation | See tabs below | See tabs | Two columns at lg (content + 420px panel); `ActionSheet` collapses panel on small screens (source) | Implemented |
| `/obligations` | Obligations (global) | Obligations across sessions, totals per asset | Tab "Obligations" | Yes | Shell | `GlobalObligations.tsx` | per-session `obligations` for newest 10 sessions | Search, asset filter, status filter, page, open obligation in its session (`?tab=obligations&ob=`) | Read | Table at >=900px, cards below (`min-[900px]`) | Derived (capped) |
| `/approvals` | Approvals (global) | Calculation and settlement-batch reviews across sessions | Not in top tabs; bottom bar, nav badge, Overview quick link, command panel | Yes | Shell, sensitive strip | `GlobalApprovals.tsx` | per-session `authorization`, `settlement`, `calculation` for 10 sessions | Filter awaiting/decided/all, Open session tab | Read; deciding happens in workspace | Card list at all widths | Derived (capped) |
| `/activity` | Activity (global) | Recorded events across sessions | Tab "Activity" | Yes | Shell | `GlobalActivity.tsx`, `ActivityView.tsx` | per-session `detail` (activity items) for 10 sessions | Filter type, session, date range, result; open record in side panel | Read | Source-derived | Derived (capped) |
| `/organization` | Organization | Tabs: Profile, Members, Invitations, Wallets (`?tab=`) | Tab "Organization" | Yes | Shell | `organization/Organization.tsx`, `OrgWallets` | `GET orgs/:id`, `/members`, `/invitations`, `/wallet-verifications`, `/wallets`; writes: `update`, role, status, remove, reviewer grant/revoke, invite, revoke | Edit profile, manage members, invite (one-time token shown once), revoke | Writes admin only; Invitations tab `AccessDenied` for members | Tables hide columns below md; SidePanel full-width small | Implemented |
| `/wallets` | Wallets | User's own verified wallets, browser wallet, org verified accounts | Tab "Wallets" | Yes | Shell | `wallets/Wallets.tsx`, reuses `OrgWallets` | `GET auth/me` (wallets), Freighter in browser, org verifications/claims | View details, **Disconnect wallet** (`POST auth/wallet/remove`) | Own account | Source-derived | Partial: no connect/link action (see 05) |
| `/settings` | Settings | Display name, sign out everywhere, account audit, default org, role help | Tab "Settings", account menu | Yes | Shell | `settings/Settings.tsx` | `auth/audit`, `auth/profile`, `auth/logout-all`, `auth/workspace` | Save name, sign out everywhere, switch default org | Own | Single column | Implemented |
| `/notifications` | Notifications | States they are not supported | Bell icon (hidden below sm), More menu | Yes | Shell | `NotSupported` | none | Links to Overview/Approvals | n/a | n/a | Placeholder (unsupported) |
| `/discover` | Discover | States a future explorer needs an indexer | Command panel only ("Discover (not available)"), direct URL | Yes (inside gate) | Shell | `NotSupported`, `Banner`, `Card` | none (static copy) | Links to Obligations, Activity, Approvals | n/a | n/a | Placeholder (unsupported). Not reachable from visible navigation |
| `/sign-in` | Sign in | Wallet (Freighter, SEP-53 message) or email sign-in / create account | Redirect when signed out | No | (auth) | `sign-in/page.tsx` (WalletSignIn, EmailSignIn, SegmentTabs), `lib/wallet/signin.ts` | `POST auth/wallet/challenge`, `auth/wallet/verify`, `auth/login`, `auth/register` | Sign in, create account | Public | Centred 420px panel | Implemented |
| `/onboarding` | Onboarding | Profile name, then create org or join by one-time code | Redirect from `AppGate` until `onboarding.step==="done"` and at least 1 org | Signed in | (auth) | `onboarding/page.tsx` | `auth/profile`, `POST registry/orgs`, `POST registry/invitations/accept`, `auth/workspace` | Set name, create org (details + review), join | Signed in | Centred 640px | Implemented |
| `/dev/components` | Component gallery | Developer gallery of UI parts (used by e2e) | URL only | No | root layout only | `app/dev/components/page.tsx` | local state | Toggle states | n/a | n/a | Implemented, hidden dev route; shipped in the production build (no environment guard seen) |
| `/api/[...path]` | Proxy (route handler, GET/POST) | Forward `/api/auth/*` and `/api/registry/*` to `TOBIN_API_URL` (default `http://127.0.0.1:8787`) | Browser fetches via `lib/api/http.ts` | n/a (cookie forwarded) | none | `lib/proxy-policy.ts` | console backend | n/a | Refuses other methods (405), traversal (400), non-allowed paths (404), body > 8 KiB (413); 503 `BACKEND_UNAVAILABLE` | n/a | Implemented |

## Session workspace tabs (`?tab=`, default overview)

| Tab key | Contents | Actions | Gating |
|---|---|---|---|
| overview | Where it stands, state layers (5), at a glance (links), recent events, readiness checks | links only | none |
| participants | Table, add member select, remove dialog | add/remove | admin and workflow `configuring` |
| obligations | List with search/status filter, side panel with history, void dialog; right panel: record form with review dialog | record, void | admin, `configuring` |
| netting | Net positions by asset, eligible/excluded inputs, original vs net, calculation details side panel; right panel: Run netting with confirmation | run netting | admin |
| approvals | Review state, what is reviewed, no N-of-M card; right panel: Approve / Reject (reason required) | decide | reviewer grant (server enforces separation of duties) |
| settlement | Prepared batch, instructions, reconciliation diff, approval block, StageRail, Sign/Submit/Verify "Not supported" cards; right panel: Prepare / Approve / Reject | prepare (admin), decide (reviewer, not preparer) | per `can()` + server |
| activity | session activity via `ActivityView` | filter, open record | none |
Also a `?ob=<obligationId>` deep link opens the obligation side panel.

## Organization tabs (`?tab=`): profile (default), members, invitations, wallets (read-only `OrgWallets`).

## Reachable only through unusual paths

- `/discover`: command panel (Ctrl/Cmd+K) or typed URL. No visible link.
- `/approvals`: not one of the 7 top tabs; reachable via mobile bottom bar, Overview quick link/attention row, command panel, session nav badge area. On desktop there is no persistent link (the badge sits on "Clearing Sessions").
- `/notifications`: bell (desktop sm+), mobile More menu.
- `/dev/components`: typed URL.
- Deep links `?tab=...`, `?ob=...`, `/sessions?q=&provenance=&sort=&dir=&activity=1&page=`.
- `/onboarding`: only by gate redirect.

## Backend or mock switch

`NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1` swaps `HttpAdapter` for `MockAdapter` (`lib/tobin/mock-adapter.ts`, 84 lines) and shows a banner. Default is the real API.
