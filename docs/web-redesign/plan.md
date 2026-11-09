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
