# Rewrite plan (for review before any build)

Inputs: `spec.md` (design), `audit/`, `verified.md`. Branch `feat/web-redesign-v2`, created from `main` (PR #44 is merged). Nothing is built, pushed or opened as a PR.

## 1. Route map

| Route | Access | Enforced by | Replaces |
|---|---|---|---|
| `/discover` | public | none | a real explorer that is empty until a public API exists (stats row, three sub-tabs, sort bar, tile lists; see section 13) |
| `/sign-in` | public | none; reads `?next=` (same-origin paths only) | `(auth)/sign-in`: split page (art panel, email, Continue with wallet) |
| `/onboarding` | signed in, no organization | server layout | `(auth)/onboarding` |
| `/` | signed in | server layout | Overview |
| `/sessions`, `/sessions/new`, `/sessions/[id]` | signed in | server layout | same |
| `/obligations`, `/activity` | signed in | server layout | same |
| `/reviews` | signed in | server layout | `/approvals` (old path redirects) |
| `/organization?tab=profile\|members\|invitations\|wallets` | signed in | server layout | `/organization` and `/wallets` (old path redirects) |
| `/settings`, `/notifications` | signed in | server layout | same |
| `/dev/components` | development builds only | `notFound()` in production | same |

Every route gets `loading.tsx`, `error.tsx`, `not-found.tsx` at the group level plus specific ones where the layout differs. Titles via `generateMetadata`. A switch of organization on `/sessions/[id]` redirects to `/sessions?notice=org-changed`.

## 2. Access control (R1)

1. Read `node_modules/next/dist/docs/` for this Next version (middleware or its replacement, cookies API) before writing it.
2. A server layout for the signed-in group reads the `tobin_session` cookie and calls the console's `/api/auth/me` from the server (same loopback path the proxy uses). No session: `redirect('/sign-in?next=...')`. No organization: `/onboarding`.
3. The client `AppGate` shrinks to hydrating user data from the server result; no protected content renders before the check.
4. Tests: a pure `decideAccess(path, session)` function (unit) plus a Playwright smoke that a signed-out request to `/obligations` lands on `/sign-in?next=/obligations` with no protected markup in the first response.
5. Sign-out returns to `/discover`.

## 3. Module structure

```
apps/web/
  app/
    (public)/discover, sign-in           no shell for sign-in; public shell for discover
    (app)/ ...                           signed-in shell, server access check
  components/
    shell/        Sidebar, TopBar, EnvironmentButton, WalletCell, HelpTile, Banner, MobileDrawer, OrgSelector (one file each)
    ui/           shadcn-generated primitives, restyled (button, input, select, tabs, dialog, sheet, popover, command, table, ...)
    tobin/        StatusMark, StageRail, ApprovalBlock, SignatureBlock, Amount, Identifier, DerivedNote, NotSupportedCard, ListTile, FilterBar, GroupSection
    data/         DataList (the one Table/List pattern: table >= 900px, tiles below)
    discover/, overview/, sessions/ (list, wizard, workspace/{Header,SummaryCard,ActionPanel,tabs/*}), settlement/ (CloseOut, steps/*), organization/, reviews/, activity/
  lib/
    cross-session/useCrossSession.ts     the one hook: cap, coverage, loadNext(), shaped for a future aggregate endpoint
    (kept) tobin/, stages.ts, sessions/layers.ts, derived/*, activity/*, obligations/*, settlement/*, permissions/can
packages/ui-tokens/                       tokens.css rewritten (light, 0 radius, accent), fonts mapping documented
```

Shell.tsx, Workspace.tsx, tabs.tsx and Organization.tsx are deleted after their content is moved into the modules above.

## 4. Kept, changed, deleted

- **Kept unchanged:** `lib/tobin/client.ts` and adapters, `can()` and role model, `lib/stages.ts` and `test/no-confirmed.test.ts`, `layers.ts`, `settlement/diff.ts`, rules, all pure derivation tests. The 81 unit tests must still pass.
- **Changed:** the five derive hooks collapse into `useCrossSession`; the derive functions keep their `cap` parameter and gain a coverage return where missing. `ButtonLink`, `Stepper`, `ActionSheet` are replaced by shadcn `Sheet`, a stage rail and a Settlement close-out.
- **Deleted:** hand-built `Popover`, `CommandPanel` (replaced by shadcn Popover and Command), the Wallets page (moved into Organization), the workspace Approvals tab (folded into Settlement), inline SVG icons (replaced by Hugeicons), the dark/rounded token set.
- **Not built (per spec):** execution start and attempts, obligation edit, wallet linking UI (flag OFF), notifications, search, real Discover data.

## 5. New backend-action UI

Mark ready (when readiness checks pass) and Close session (confirmed), in the session action panel. Client methods `markReady`, `closeSession` are added to `TobinClient` and both adapters; the console is unchanged. `reopen` stays unwired (not in the spec).

## 6. Dependencies (R1)

shadcn/ui via the CLI (after reading its current Tailwind v4 and React 19 notes): `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, the Radix packages each chosen component needs, `cmdk`, `sonner` only if used. Icons: `@hugeicons/react` 1.1.10 plus `@hugeicons/core-free-icons` 4.4.0 (the second is required for the icon data) and `@web3icons/react` 4.1.24, same versions as the landing, single-icon imports. Each added separately, baseline regenerated with `scripts/ci/update-npm-baseline.mjs`, and listed in the R1 report. `lucide-react` is not used in `apps/web`.

## 7. Design tokens and fonts

Rewrite `packages/ui-tokens/tokens.css` to the spec values (page #FFFFFF, tile #F4F4F4, ink-4% card, ink-20% hairline, muted ink-60%, disabled ink-40%, accent #B6FF3E, accent text #2F5D00, tint #EAFFC2, danger #B3261E, radius 0, no shadows). The old rounded and shadow tokens are removed, not kept alongside. `contrast.md` is generated from a script that reads the tokens and computes every text/background pair. Fonts are loaded in `apps/web/app/layout.tsx` through `next/font/google` as the landing does (Instrument Sans, Outfit, Space Grotesk, Urbanist; identifiers in the system mono stack), replacing Geist and JetBrains Mono. Open question 1 below.

## 8. Landing change (R1, diff shown before committing)

Only `apps/landing/src/components/Nav.tsx` (two places) and `src/lib/site.ts` (add `app: string | null` to `links`, read from an environment variable at build time). Button label "Launch app"; if `links.app` is null in a production build it renders disabled as "Launch app (soon)". The footer GitHub link stays. Landing tests/build rerun; nothing else changes.

## 9. Phases (stop after each)

- **R1:** tokens, fonts, shadcn init, shell (sidebar, top bar, help tile), server access control, `/discover`, `/sign-in`, `/onboarding`, landing button.
- **R2:** Overview (banner, attention list, coverage line, Load next 10), Sessions list and filter bar, create wizard with recovery panel, workspace header and single summary, action panel, Mark ready and Close session.
- **R3:** workspace tabs: Overview, Participants, Obligations, Netting, Settlement close-out, Activity.
- **R4:** global Obligations, Reviews, Activity, Organization with Wallets, Settings, Notifications.
- **R5:** hardening: axe on every route and width, keyboard walkthrough, responsive audit at 1440, 1024, 768, 390, request counts, contrast report, README and docs, final regression on a seeded throwaway database.

Each phase: typecheck, lint, unit tests (existing plus new for access redirects, the cross-session hook and Load next 10, the Confirmed rule), Playwright smoke, run against the real backend as admin, member and reviewer, 390px overflow check, screenshots into `docs/screenshots/` with names not containing the reserved words, at least 20 viewed, release gates. The existing review scripts (A to F) are rewritten for the new UI rather than left failing; they are updated in the phase that changes what they test.

## 10. Risks

- Rewriting every screen invalidates the five existing real-backend scripts and the 149-check Stage F run; each phase must replace its share or the regression coverage drops.
- Server-side session validation adds a loopback call per navigation; cache per request.
- `loading.tsx` on client-data pages only helps if the data load is also suspended; otherwise skeletons stay in the components.
- Restyling shadcn to 0 radius, no shadow and the accent changes focus rings and disabled states everywhere; contrast must be re-measured after, not trusted.

## 11. Open questions for you

1. **Fonts.** Use the landing's four families as mapped in section 7, or keep one family (Instrument Sans) plus the system mono for a simpler app?
2. **Accent.** The landing has no green. Approve #B6FF3E / #2F5D00 as new app colours (they will not appear on the landing), or restrict the app to the landing's greyscale?
3. **Launch app URL.** The app is local-only. Default `links.app` to `http://127.0.0.1:3000` in development and null in production (disabled button)?
4. **Branch.** Confirm `feat/web-redesign-v2` from `main` (PR #44 is merged), rather than the prompt's `feat/web-redesign`.
5. **Dependencies.** The prompt covers shadcn, Radix, cmdk and the two icon packages. `@hugeicons/core-free-icons` is needed as well; confirm it is in scope.

## 12. Decisions taken (2026-11-09) and phase status

Owner answers: the landing page's four fonts; greyscale like the landing page (no green; the primary action is black); Launch app defaults to `http://127.0.0.1:3000` in development and is disabled in a production build until a domain is given; branch `feat/web-redesign-v2` from `main`; `@hugeicons/core-free-icons` is in scope.

**R1 status.** Built on `feat/web-redesign-v2`, not pushed. Deviations from this plan: (1) the `/dev/components` gallery is gated by `TOBIN_DEV_GALLERY=1` rather than development-only, because the smoke tests run against a production build; (2) the shadcn `shadcn` package is a dev dependency (it supplies `shadcn/tailwind.css`) and the generated components live in `components/kit/` because `components/ui/Button.tsx` and the CLI's `button.tsx` collide on a case-insensitive file system; (3) the sidebar's Reviews item still opens `/approvals` until R4; (4) the card tone is the 4% ink value flattened to #f5f5f5 so nested cards keep their contrast; (5) the shadcn `cn` helper package was replaced by `clsx` plus `tailwind-merge`, as the dependency rule lists. The old `Popover` and `CommandPanel` in `components/ui/Overlays.tsx` are no longer used by the shell and are deleted once the component gallery stops showing them (R5).

## 13. Changes after the R1 review (2026-11-09)

Owner decision: the greyscale palette stays. Wherever the spec or earlier messages say green or accent (a selected filter value, the active state, tags), use black text with an underline or weight, a #f5f5f5 fill, or the black 2px edge.

**Discover replaces the "three Not supported cards" design.** It is a real explorer, built like Symbiotic's Discover, that is empty until a public API exists:

- A what-Tobin-is panel with the maturity line.
- A protocol stats row: settlements recorded, institutions opted in, assets in use, last settlement. All "No data".
- Sub-tabs SETTLEMENTS, INSTITUTIONS, ASSETS (URL-driven, `?tab=`), a URL-driven sort bar (`?sort=`, selected value in bold with an underline), and tile lists.
- Settlement tile: identifier, asset and amount, parties only if both institutions opted in, time, a link to the transaction on Stellar Expert with the network label, and the verified mark only when the record carries a verified read-back (through `verifiedMark` in `lib/stages.ts`, the only file allowed to name that stage). Institution tile: opted-in fields only.
- Each tab shows one tile-sized "No data" with "Public settlement data is not available yet." No sample rows, no backend endpoint, no request at all.
- A typed `DiscoverClient` (`lib/discover/types.ts`) whose only implementation, `unavailableClient`, reports "unavailable". `docs/web-redesign/discover-contract.md` is the public data contract a backend would need.
- A collapsed "How clearing works" card labelled "Illustrative example. Not live data." It is the only place the 250 and 30 appear.

**Two entry points when signed out** (top bar and sidebar footer): SIGN UP / LOG IN (primary, goes to `/sign-in`) and CONNECT WALLET (secondary, opens the connect dialog).

- Connect dialog: shadcn Dialog; wallets from a registry in code (`lib/wallet/registry.ts`; today only Freighter through the pinned library), installed ones first, labelled INSTALLED, NOT INSTALLED and LAST USED, an install link for a wallet that is not installed, a desktop-extension note, a search field only above six wallets, then the existing connect and signature flow (Connect wallet, then Verify ownership) with named failure states inline.
- `/sign-in`: split layout, an original illustration on the left (hidden under 900px), logo top-left, a close icon back to Discover, "Sign up or sign in", an Email address field, a Continue button disabled until the address is valid, an "Or" divider, Continue with wallet (opens the same dialog) and small testnet and help text. The backend supports an email and a password, not an email alone, so Continue leads to a second step (log in, or create an account with a name and password).

**Dependencies.** The `shadcn` package is not a dependency: its small stylesheet is vendored as `apps/web/app/shadcn.css` and the generator is run with `npx shadcn@latest` (apps/web/README.md).

## 14. R2: what the console offers (read from the service code, 2026-11-09) and what R2 builds

Source: `apps/web-console/lib/registry/service.ts` (`markReady`, `closeSession`, `reopenSession`, `#move`, `readiness`), `clearing.ts` (`readinessChecks`, `TRANSITIONS`), `http.ts` (routes, status codes). Read as code, not from comments.

### 14.1 Session states and transitions

A session has one workflow state: `configuring`, `ready` or `closed`. `TRANSITIONS`: configuring to ready; ready to configuring (reopen) or closed; closed to nothing. Every operation also refuses a `fixture` session (`FIXTURE`, 409). The state is an application record only; nothing is on-chain.

### 14.2 Mark ready: `POST /api/registry/orgs/:org/sessions/:id/ready`

- **Permission:** administrator only. `#need(orgId, user, admin = true)` throws `FORBIDDEN` ("administrator role required", 403) for a member, including a member with the reviewer capability. The reviewer grant gives nothing here.
- **Preconditions (all inside one transaction):** the session is `configuring` (else `INVALID_STATE` 409, "a ready session cannot become ready"); and every readiness check except the `state` check passes (else `INVALID_STATE`, "not ready: <labels>"). The checks: at least two active participants; at least one active obligation; every obligation names two active participants; all obligations use one asset; the obligations pass the netting engine; **a calculation exists; the latest calculation is current** (same inputs as now); net positions sum to zero.
- **Returns:** 200 with the readiness view `{ state, ready, checks, currency, note }`. A refused attempt is logged as `session.readiness-evaluated`; a success also logs `session.state-changed`.
- **Consequence the UI must state:** once ready, `#editable` refuses participant and obligation changes (they need `configuring`). The console has `POST .../reopen` (ready to configuring), but R2 does not offer it (not requested), so a session marked ready cannot be edited again from this app.
- **A precondition the UI cannot fully show:** "the latest calculation is current" is computed by the server from a hash of the inputs. The UI shows the console's own `GET .../readiness` checks (labels and fixes), which carry that result, so nothing is guessed; if that read fails the button says so instead of guessing.

### 14.3 Close session: `POST /api/registry/orgs/:org/sessions/:id/close`

- **Permission:** administrator only (same `#need`).
- **Preconditions:** the session is `ready` (the only state with a transition to `closed`; a `configuring` session gets `INVALID_STATE`, "a configuring session cannot become closed"); and the latest calculation has a settlement batch for that calculation whose status is `approved` and still eligible (else `INVALID_STATE`, "closing requires an approved, still-eligible settlement batch for the current calculation"). Closure is operational: nothing has settled.
- **Returns:** 200 with the readiness view.
- **Reachability:** a settlement batch is prepared and reviewed in the Settlement tab, which already exists, so a ready session with an approved batch can be closed from the UI. Preparing and reviewing a batch only refuse a closed session (the `session-open` check and `decide`), so the order calculate, review, mark ready, prepare, review the batch, close works. The server checks the batch against the latest calculation; the UI sees only the latest batch's status.
- **What R2 shows:** Close is available when the session is ready and the latest settlement batch the UI reads is approved; otherwise the reason names which is missing. The server still decides.

### 14.4 The Stepper mapping (kept from the old workspace)

`lib/sessions/lifecycle.ts` maps facts to six groups (Draft, Participation, Obligations, Netting, Approval, Settlement). It walks the facts in order and **stops at the first one that could not be read** ("... could not be read, so progress after this point is not shown"); it never counts an unread fact as done. A closed session is every group done. `next-action.ts` turns the view into the single next action. The R2 summary card shows "Step N of 6: <group>", that sub-label, the four-square stage rail (only Prepared can be reached: when a settlement is prepared; Signed, Submitted and the final stage read Not supported), and the next action. The workspace waits for every fact before drawing the card, so a request still in flight is never shown as unread.

### 14.5 What R2 builds, and what it keeps

- One cross-session hook (`components/data/useCrossSession.tsx`, pure parts in `lib/cross-session`): a window of 10 sessions, "Load next 10 sessions", the coverage sentence ("Based on N of M sessions"), and a passive mode that reads only the cache. It replaces the Overview's own bundle queries and the shell's per-session badge reads. It reads `detail` for every session and `authorization` only for administrators and reviewers (a member cannot act on one).
- Overview, Sessions list, create wizard (a single recovery panel, retry only what failed), workspace shell, Mark ready and Close session (one confirmed dialog each, administrator only, the reason shown when disabled), route-level loading, error and not-found files, specific titles, and the redirect to Sessions with a notice when the organization changes on a session URL.
- Kept working in the new shell: the Obligations, Netting, Approvals and Settlement tab bodies and their panels, so no flow is lost between phases. Approvals is no longer a tab: its content is the "Calculation review" view inside Settlement (`?tab=approvals` still opens it). R3 rebuilds these.
- Deviations from the spec, with reasons: (1) the Sessions list drops the per-row participant and obligation counts and the avatar stack from R1's tile anatomy, because they cost two requests per row and the list has no aggregate; (2) the Reviews count in the sidebar is passive: it appears once a page has loaded the data, and counts calculations only, not settlement batches; (3) the list's Status filter acts on the rows of the current page (the workflow state is read per visible row); (4) the Overview drops obligation totals (an extra request per session for a number that is only partial).

## 15. R2 follow-up: checks retired in R2, and Stage B's independence

Checks of the Stage A to F scripts that R2 retired or rewrote, and why. Everything else in those scripts was kept and passed on the final R2 build.

| Script | Check | Why it was retired or changed |
|---|---|---|
| B | "unsupported quick filters are labelled" (3 widths) | The Sessions list no longer has quick filters; the Status filter replaced them. |
| B | "Attention has an enabled Open link" read the first session link | The Overview's first attention item is now often Invitations (a link to the organization), and the stale session can fall outside the 10-session window. It now looks for the link to B's own stale session. |
| B, C, E, F, a11y | the "Open" link was found by the exact name "Open" | The list links are named for their session ("Open <name>"), so the selector became a pattern. Same check, new name. |
| D | "Submitted appears only as a stage name" counted the whole page | The session summary now also holds a stage rail; the check counts the tab content only. |
| F | "Overview lists the sessions that matter now" | The Overview's section is now "Needs your attention". Replaced by a check for that heading. |
| F | "Overview offers quick links" | The Quick links group was removed from the Overview in R2. |
| F | "Overview still says how many sessions it read" | Replaced by the coverage line (`Based on N of M sessions`) check. |
| F | Sessions list "Contents (derived)" with participant and obligation counts (3 checks) | The list no longer reads two extra requests per row; counts were dropped (R2 deviation 1). |
| F | "session shows its state layer by layer", "five layers", "blockchain layer reads Not recorded", "no layer claims settled or confirmed", "at-a-glance", "recent events" | The workspace Overview tab no longer repeats the summary. The layers card and the at-a-glance list were removed; the stage rail in the summary card now carries the Not supported reading. Replaced by checks on the summary card. |
| F | "At a glance leads to Netting", "a Stepper group leads to its section" | The Stepper and the at-a-glance links no longer exist. |
| F | "the command panel lists Discover as not available" | Discover is a real page and an ordinary item in the command panel since R1. |
| keyboard walkthrough | sign in with the "Email" tab and open the command panel by a text field id | The sign-in page and the command panel (shadcn Command) changed in R1. Same flows, new controls. |

**Stage B independence (2026-11-10).** Stage B no longer depends on the seeded sessions or on the order scripts run in. It makes its own sessions through the real API (one awaiting review, one stale, one draft), so it passes alone and in the combined order. The two seeded sessions it used for the Overview and the stale label are no longer needed.

## 16. R3: what the console does for Reopen, and every route the four tabs call (read from the code, 2026-11-10)

### 16.1 `POST /api/registry/orgs/:org/sessions/:id/reopen`

Source: `service.ts` `reopenSession` (one line), `#move`, `#editable`, `#invalidate`; `clearing.ts` `TRANSITIONS`; `http.ts` line for `ready|reopen|close`.

- **Role:** administrator only (`#need(orgId, u, true)`; FORBIDDEN 403 "administrator role required").
- **Preconditions:** the session is `ready`. `TRANSITIONS` is `configuring: [ready]`, `ready: [configuring, closed]`, `closed: []`, so only a ready session can go back to `configuring`; a configuring session gets INVALID_STATE ("a configuring session cannot become configuring") and a closed session gets INVALID_STATE. A fixture session gets FIXTURE (409).
- **What it does:** `#move` writes the new workflow state and logs `session.state-changed` (`ready -> configuring`). It calls `#invalidate` nowhere and writes no calculation, decision or batch: **reopening alone changes nothing else.** It returns the readiness view.
- **Effect on the calculation, reviews and settlement batches:** none at the moment of reopening. The calculation, every review decision and any prepared batch stay as they are, still "approved". The effect comes with the first change afterwards, because participants, obligations and netting all need `configuring` (`#editable`: "the session is marked ready: reopen it to make changes") and each of them calls `#invalidate` (participant added or removed, obligation recorded or voided, a new calculation): every decision then gets an invalidation record (status "No longer applies"), the calculation's input hash no longer matches (stale), and a batch's status becomes `invalidated` or `superseded` (it is "no longer eligible"). Nothing is deleted; the old records stay and are labelled. The session must then be calculated, reviewed, prepared, reviewed and marked ready again.
- **Not in the console:** there is no reopen for a closed session, and nothing that "discards" records.
- **UI (R3):** a Reopen session row appears only while the session is ready; administrator only, disabled with the reason otherwise; one confirmation whose text is `lib/sessions/reopen.ts` (checked against the service code by a test).

### 16.2 Console routes the four tabs call today

All are under `/api/registry/orgs/:org`, through the app's proxy.

| Tab | Route | Used for |
|---|---|---|
| Obligations | `GET /sessions/:id/obligations` | the table (also read by Netting, Settlement and the Overview tab) |
| | `POST /sessions/:id/obligations` | record an obligation (admin, configuring only) |
| | `POST /sessions/:id/obligations/:oid/void` | void (admin, configuring only; optional reason) |
| | `GET /sessions/:id/settlement` | the supported-asset list for the form (`assets`, `status: supported`) |
| | `GET /sessions/:id/participants` | debtor and creditor choices |
| | `GET /sessions/:id` | the session detail whose activity items give an obligation's history (there is no per-obligation history route; `GET /obligations/:oid` exists and is not called) |
| Netting | `GET /sessions/:id/calculation` | the current result and its currency |
| | `POST /sessions/:id/calculate` | run netting (admin, configuring only) |
| | `GET /sessions/:id/readiness` | the validation checks and the currency |
| | `GET /sessions/:id/obligations`, `/participants` | eligible and excluded tables |
| Settlement (and the old Approvals) | `GET /sessions/:id/authorization` | the review state |
| | `POST /sessions/:id/authorization/approve` and `/reject` | decide a calculation (reviewer; reject needs a reason) |
| | `GET /sessions/:id/calculation` | what is under review, and the diff |
| | `GET /sessions/:id/settlement` | the batches, the preparation checks, the assets |
| | `GET /sessions/:id/settlement/batches/:bid` | the prepared instructions and their validation |
| | `POST /sessions/:id/settlement/prepare` | prepare (admin; body `calculationId`, optional `attempt`) |
| | `POST /sessions/:id/settlement/batches/:bid/approve` and `/reject` | decide a batch (reviewer who did not prepare it; body `instructionsHash`, reject needs a reason) |
| | `GET /sessions/:id/settlement/batches/:bid/execution` and `.../execution/attempts` | the read-only execution record |
| Activity | `GET /sessions/:id` | `workspace.activity.items` (the only source; events with no session subject cannot be read) |
| Reopen (new) | `POST /sessions/:id/reopen` | section 16.1 |

Routes with no UI and still not built: obligation update, execution start and attempt begin, wallet claims and signer sets, session-level routes for notifications or search (none exist).

## 17. R3: what was built, and deviations

- **Reopen** in the workflow controls (panel and every tab's workflow card), ready sessions only.
- **Obligations tab:** table with search and status filter; record form in the action panel with only the backend's five fields (a supported-asset select, or a code field when none is configured); a review confirmation; the server's message under the field it concerns; a detail sheet (shadcn Sheet) with history; Void as its own confirmed action with its own history entry; no edit; one active total per asset, never across assets.
- **Netting tab:** Inputs, Calculation, Result strip; eligible and excluded tables (the backend excludes only voided obligations; an active obligation naming a removed participant is reported as blocking); Run netting with one confirmation; separate Gross and Net cards; positions grouped net debtors, net creditors, zero, a section per asset; the original-versus-net two panes with linked highlight; calculation details limited to fields the backend returns; a stale label; no graph.
- **Settlement tab:** one linear close-out (`lib/settlement/closeout.ts`, `components/settlement/CloseOut.tsx`, `Steps.tsx`): five numbered steps on a left rail, the shown step on the right, actions in the action panel with one confirmation each. Approval block ("Review decision", check icon) and signature block ("Wallet signatures", key icon) are separate, never in the same step. After an approval: "Approval recorded in Tobin. This is not an on-chain signature." The red diff blocks approval of a settlement (rejecting stays possible). `?tab=approvals` redirects. The duplicate "Transaction stages" list was removed; the stage rail stays once, in the session summary.
- **Activity tab:** `ActivityView` is the one shared component (filters for event type, date range and result; a side panel with the full record; read-only). R4's global page reuses it.
- **Overlays:** the R3 tabs use shadcn Dialog and Sheet through `components/tobin/Overlays.tsx` (`Confirm`, `DetailSheet`, drop-ins for the older native dialog and side panel, which remain for R4 screens).
- **Deviations and notes:**
  - The "excluded" table lists only what the backend reports. The prompt's second reason ("active obligation naming an inactive participant") is shown as blocking, as before; the backend refuses to net then.
  - Activity's "result" is derived from the event kind (the backend returns none) and is labelled that way.
  - An obligation's history comes from the session's activity log, matched by the first 8 characters of its id (no per-obligation history route).
  - The settlement "Prepared" stage fills when a batch is prepared; nothing else can fill (no route).
  - Mark ready and the workflow card text changed: ready sessions can be reopened, so the dialog no longer says the session cannot be reopened.

## 18. R4: the global pages. Routes read first, request counts, and what was built (2026-11-09)

**Stage D, root cause.** In the R3 combined run Stage D failed one check and passed alone after a script fix. The cause was not run order: D asserted the old single-page Settlement tab, which R3 split into five steps (`?tab=settlement&step=review|prepare|batch|execution|sign`). D was patched to open each step. D already builds its own session through the UI as Alice, Bob and Carol, and needs only what the seed provides to every script: the three users, the organization and one supported asset. It reads no session made by another script. It was proved once in the combined order in R4 (see the report).

**Routes each global page can call (read from `apps/web-console`).** The API has no cross-session or organization-wide aggregate for obligations, reviews or activity. Only the session list is organization-wide.

| Page | Console routes | Scope | Fan-out for an admin with 10 sessions |
|---|---|---|---|
| Reviews | `GET sessions`, per session `GET authorization`, `GET settlement` | per-session | 1 + 10 x 2 = 21 |
| Obligations | `GET sessions`, per session `GET obligations`, `GET sessions/:id` (activity for the sheet history) | per-session | 1 + 10 x 2 = 21 |
| Activity | `GET sessions`, per session `GET sessions/:id` | per-session | 1 + 10 = 11 |
| Organization overview/institutions | `GET orgs/:o` | organization | 1 |
| Members and roles | `GET members`; admin only `GET invitations` | organization | 1 (member), 2 (admin) |
| Wallets | `GET /api/auth/me` (account wallets), `GET wallet-verifications`, `GET wallets` (claims) | organization/account | 2 + me |
| Settings | `GET /api/auth/audit` (+ me) | account | 1 |
| Notifications | none (not supported) | n/a | 0 |

Page parts share the query keys `["xs", org, session, part]`, so navigating Reviews to Obligations to Activity re-reads only the parts not yet cached. The sidebar Reviews count is passive: it reads the cache and makes no request. Measured counts are in the R4 report.

**Built.** `/reviews` (My reviews and All; one `reviewQueue` function feeds the page and the sidebar count; separation of duties on each row; rows open the Settlement step; no decisions); `/approvals` redirects there. Global Obligations on the cross-session hook (search, asset, status and session filters, per-asset totals, coverage text, "Load next 10 sessions", rows open the same `ObligationDetail` sheet without Void). Global Activity on the same hook. Organization tabs Overview, Members and roles (invitations are a section; `?tab=invitations` and `?tab=profile` still work), Institutions, Wallets (`/wallets` redirects). Settings: password change shown as Not supported. Notifications unchanged (Not supported).

**Deviations and conflicts.**
- Link wallet. An earlier decision keeps wallet linking behind a feature flag, off, until the owner's Freighter test. The R4 brief says Link wallet opens the Connect wallet modal with no signing. Built as asked: the button opens the existing modal, which only detects wallets, writes nothing and signs nothing; the page says linking is not verification. No org claim is written. The wallet flow itself is unchanged.
- The Reviews list no longer repeats calculation amounts (the old Approvals list did, with an extra `calculation` read per session). Stage F's "amounts in the approvals list" check was retired for that reason; the session's own Settlement step shows the amounts.
- A calculation row cannot say who calculated it: the authorization view does not carry it, so the row says "Not shown for calculations".
- Stage C, D and E matched "Showing N of M sessions"; the cross-session pages now say "Based on N of M sessions" (or "all N"); those checks were updated.

**Measured requests per first load (R4 run, admin with 10 sessions read of 40+; `scripts/measure-requests.mjs`).** The totals include 3 to 4 shell requests (me, organizations, sessions list) on top of the per-session reads. Reviews 24 (20 per-session + 4), Obligations 24 (20 + 4), Activity 14 (10 + 4), Organization 3, Members and roles 4 (admin; 3 for others), Wallets 5, Settings 4, Notifications 3. Overview is 25 for an admin, 34 for a reviewer, 14 for a member. A member's Reviews and Obligations pages cost the same as an admin's. The estimates above (21, 21, 11) differ by the shell requests.

**R4 verification (final build).** Typecheck and lint clean; unit tests 140 plus the r4 file; `review-r4.mjs` all checks pass at 1440/1024/768/390; Stages A, D (fresh DB, combined order), E, F pass; keyboard walkthrough 90 stops; axe 78 page-width combinations clean. Skipped on purpose: R1 to R3 scripts and Stages B and C (the shell and data layer changed only in the cross-session hook, and C's coverage text was updated but not re-run), Playwright smoke, full regression (waits for R5). 20 screenshots viewed; the 1440px ones are in `docs/screenshots/stage-r4/`.
