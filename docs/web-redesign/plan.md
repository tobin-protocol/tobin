# Rewrite plan (for review before any build)

Inputs: `spec.md` (design), `audit/`, `verified.md`. Branch `feat/web-redesign-v2`, created from `main` (PR #44 is merged). Nothing is built, pushed or opened as a PR.

## 1. Route map

| Route | Access | Enforced by | Replaces |
|---|---|---|---|
| `/discover` | public | none | `/discover` Not-supported page (rewritten) |
| `/sign-in` | public | none; reads `?next=` (same-origin paths only) | `(auth)/sign-in` |
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
