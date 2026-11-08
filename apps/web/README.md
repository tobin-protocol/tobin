# Tobin web app (`apps/web`)

A new UI for Tobin's institutional workflows. It is a client of the web console's API (`apps/web-console`), reached through a server-side proxy. **All five phases of the build (A to E) are complete**; see [What is real, derived and not supported](#what-is-real-derived-and-not-supported).

Built to [`docs/web-app-plan.md`](../../docs/web-app-plan.md), which records the owner's decisions D1 to D6, exactly which backend operations exist for each screen (sections 5a to 5d), and the final list of what remains Not supported (section 12). Maturity: pre-production, Stellar Testnet only, same-author evidence. See the [terminology guide](../../docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md).

## Hosting: local only

**Hosting is local-only until a reachable backend exists.** The backend this app depends on is the web console: Next.js route handlers plus one SQLite file, bound to `127.0.0.1`, with request guards that refuse any foreign `Origin` and send no CORS headers. This app does not change those guards and adds no CORS (decision D2). It calls the console from its own server through the proxy in `app/api/[...path]/route.ts`. Deploying `apps/web` somewhere that cannot reach a console on loopback would give a UI with no backend. Do not deploy it to a public host.

## Which UI is canonical

Until `apps/web` reaches parity, **`apps/web-console` remains the canonical institutional UI**. Once every row marked Supported in the plan is implemented here, with tests and the owner's review, **`apps/web` becomes the canonical institutional UI** and the console's institutional pages are retired. The console stays as the backend, the owner-run Testnet tools and the local sandbox (decision D1).

## Set up and run

Needs Node 24 and, for the browser scripts, an installed Chrome. From the repository root, after `npm ci`, both servers must run:

```bash
# 1. the backend (the web console) on 127.0.0.1:8787, with a throwaway database
cd apps/web-console && npm run build && TOBIN_DB_PATH=/tmp/tobin-web.sqlite npx next start --hostname 127.0.0.1 --port 8787

# 2. this app on 127.0.0.1:3000
npm run dev --workspace tobin-web          # or: npm run build --workspace tobin-web && npm run start --workspace tobin-web
```

Open `http://127.0.0.1:3000`. `TOBIN_API_URL` (default `http://127.0.0.1:8787`) points the proxy at a different console. No other environment variable is needed, and nothing secret is read.

Settlement can only be prepared when the operator has configured a supported asset (there is no API for it). For a throwaway database:

```bash
cd apps/web-console
TOBIN_DB_PATH=/tmp/tobin-web.sqlite node scripts/db.ts asset-add testnet USD <a Stellar account address as issuer>
```

`NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1` switches the data layer to a fictional `MockAdapter` and shows a persistent "Sample data" banner. It is **off by default**, and per decision D3 no feature that lacks a backend is mocked.

## Scripts

```bash
npm run typecheck --workspace tobin-web
npm run lint      --workspace tobin-web
npm test          --workspace tobin-web          # node --test: permissions, derivation and cap, proxy policy, stage rule, wallet sequence, lifecycle, netting,
                                                 # settlement diff, failed states, activity, roles, source checks
cd apps/web && npx playwright test               # smoke tests, system Chrome, no backend needed. LOCAL ONLY: not in CI
```

Real-backend review scripts (they assert behaviour, check horizontal overflow and save screenshots; run each on a fresh, seeded throwaway database):

```bash
# seed fictional people and sessions through the console's real API
SEED_EXTRA_SESSIONS=8 SEED_WALLET=1 SEED_ASSET_REF=<asset id, for example testnet:USD:G...> node apps/web/scripts/seed-review-data.mjs

node apps/web/scripts/review-screenshots.mjs   docs/screenshots/phase-a   # sign-in, onboarding, Overview
node apps/web/scripts/review-screenshots-b.mjs docs/screenshots/phase-b   # sessions list, create, workspace
node apps/web/scripts/review-screenshots-c.mjs docs/screenshots/phase-c   # obligations, netting
node apps/web/scripts/review-screenshots-d.mjs docs/screenshots/phase-d   # approvals, settlement
node apps/web/scripts/review-screenshots-e.mjs docs/screenshots/phase-e   # activity, wallets, organization, settings, bottom sheet

node apps/web/scripts/keyboard-walkthrough.mjs                            # keyboard-only main flows
AXE_PATH=<path to axe.min.js> node apps/web/scripts/a11y-scan.mjs         # axe scan, tap targets, overflow
```

`axe-core` is not a dependency of the repository: install it anywhere (for example `npm i axe-core` in a scratch folder) and point `AXE_PATH` at its `axe.min.js`.

## How it works

- **Proxy** (`app/api/[...path]/route.ts`, policy in `lib/proxy-policy.ts`). Forwards only `GET` and `POST` to `/api/auth/*` and `/api/registry/*`, forwards the session cookie, drops the browser `Origin`, and adds the `x-tobin-request` header the console requires. The owner-run Stellar routes, the sandbox routes and the W0 mock API are not reachable through it.
- **Data layer** (`lib/tobin/`). A typed `TobinClient` with two adapters: `HttpAdapter` (real, default) and `MockAdapter` (sample, off). Features with no backend are `NotSupported` constants.
- **Wallet** (`lib/wallet/`). The pinned `@stellar/freighter-api` (decision D4). The text that is signed comes from the server, the signature is verified by the server, and no key or seed phrase is ever seen.
- **Permissions** (`lib/permissions/can.ts`). One `can(role, capability)` helper mirrors the backend's rules and is presentation only; the server always decides. The UI shows the real role names (Admin, Member) and the separate Reviewer capability (decision D5).
- **Derived data** (`lib/derived/`, `lib/activity/`). Counts and lists the API cannot provide are computed from per-session requests, capped at 10 sessions, labelled "Derived from session data" with "Showing N of M sessions" whenever the cap applies (decision D6).
- **Confirmed rule** (`lib/stages.ts`). A stage rail never shows Confirmed without a verified read-back, which no endpoint reports. A unit test and a source check enforce it. Only Prepared is a stage the backend records; Signed, Submitted and Confirmed read "Not supported".
- **Design tokens** (`packages/ui-tokens`). CSS variables and a Tailwind v4 theme.
- **Responsive.** Tables become cards under 900 px; under 768 px the session action panel is a sticky bottom sheet above the bottom bar; tap targets are at least 44 px there.

## What is real, derived and not supported

| | |
|---|---|
| **Real** | Sign-in (wallet and email), onboarding, organization profile, members (role, reviewer grant, suspend, remove), invitations, wallets (own, verified accounts, claims, disconnect), sessions (list, create, participants), obligations (record, void, history), netting, calculation review, settlement preparation and batch review, execution record (read-only), account settings |
| **Derived** | Overview counts and attention, global Obligations, Activity and Approvals, the pending-approvals badge, list workflow state for visible rows, excluded items, activity outcome, invitation Expired |
| **Sample** | None shown. Failed execution states exist only as labelled fixtures in `/dev/components` |
| **Not supported** | Notifications, global search, cross-organization sessions, N-of-M approval, signing, submission, verification and confirmation, session list and revoke, extra roles. Each is rendered as such, never mocked. The full list with the backend work each needs is section 12 of the plan |

## Build status

| Phase | Scope | Status |
|---|---|---|
| A | Tokens, shell, shared components, sign-in, wallet connection, onboarding, Overview | Done |
| B | Sessions list, create wizard, session workspace (Stepper, next action, action panel, tabs) | Done |
| C | Obligations (record, void, history), netting, global Obligations | Done |
| D | Approvals, settlement preparation and review, stage rail, global Approvals | Done |
| E | Activity, wallets, organization, members, invitations, settings, notifications page, command panel, bottom sheet, accessibility pass | Done |

## Accessibility

Keyboard-only walkthrough of sign-in, navigation, the create wizard, recording an obligation, dialogs, the command panel and a drawer; a 2px focus ring everywhere; a skip link; axe-core with no violations on the key screens at 1440 and 390 px; tap targets of at least 44 px under 768 px. Not done: a screen-reader pass, cross-browser testing, or a test with the real Freighter extension.

## Licence

Apache-2.0, like the rest of the repository. The Tobin name and logo are not covered by it (see `apps/landing/NOTICE`).
