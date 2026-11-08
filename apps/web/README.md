# Tobin web app (`apps/web`)

A new UI for Tobin's institutional workflows. It is a client of the web console's API (`apps/web-console`), reached through a server-side proxy. **Phase A of the build is complete** (see [Build status](#build-status)); later phases are not started.

Written to [`docs/web-app-plan.md`](../../docs/web-app-plan.md), which records the owner's decisions D1 to D6, and to the PRD and design specification it cites. Maturity: pre-production, Stellar Testnet only, same-author evidence. See the [terminology guide](../../docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md).

## Hosting: local only

**Hosting is local-only until a reachable backend exists.** The backend this app depends on is the web console: Next.js route handlers plus one SQLite file, bound to `127.0.0.1`, with request guards that refuse any foreign `Origin` and send no CORS headers. This app does not change those guards and adds no CORS (decision D2). It calls the console from its own server through the proxy in `app/api/[...path]/route.ts`. Deploying `apps/web` somewhere that cannot reach a console on loopback would give a UI with no backend. Do not deploy it to a public host.

## Which UI is canonical

Until `apps/web` reaches parity, **`apps/web-console` remains the canonical institutional UI**. Once every row marked Supported in the plan is implemented here, with tests and the owner's review, **`apps/web` becomes the canonical institutional UI** and the console's institutional pages are retired. The console stays as the backend, the owner-run Testnet tools and the local sandbox (decision D1).

## Run it

Both servers must run. From the repository root, after `npm ci`:

```bash
# 1. the backend (the web console) on 127.0.0.1:8787, with a throwaway database
cd apps/web-console && npm run build && TOBIN_DB_PATH=/tmp/tobin-web.sqlite npx next start --hostname 127.0.0.1 --port 8787

# 2. this app on 127.0.0.1:3000
npm run dev --workspace tobin-web          # or: npm run build --workspace tobin-web && npm run start --workspace tobin-web
```

Open `http://127.0.0.1:3000`. `TOBIN_API_URL` (default `http://127.0.0.1:8787`) points the proxy at a different console. No other environment variable is needed, and nothing secret is read.

`NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1` switches the data layer to a fictional `MockAdapter` and shows a persistent "Sample data" banner. It is **off by default**, and per decision D3 no feature that lacks a backend is mocked.

## How it works

- **Proxy** (`app/api/[...path]/route.ts`, policy in `lib/proxy-policy.ts`). Forwards only `GET` and `POST` to `/api/auth/*` and `/api/registry/*`, forwards the session cookie, drops the browser `Origin`, and adds the `x-tobin-request` header the console requires. The owner-run Stellar routes, the sandbox routes and the W0 mock API are not reachable through it.
- **Data layer** (`lib/tobin/`). A typed `TobinClient` with two adapters: `HttpAdapter` (real, default) and `MockAdapter` (sample, off). Features with no backend are `NotSupported` constants.
- **Wallet** (`lib/wallet/`). The pinned `@stellar/freighter-api` (decision D4). The text that is signed comes from the server, the signature is verified by the server, and no key or seed phrase is ever seen.
- **Permissions** (`lib/permissions/can.ts`). One `can(role, capability)` helper mirrors the backend's rules and is presentation only. The UI shows the real role names (Admin, Member, Reviewer); the product brief's role names appear in help text only (decision D5).
- **Derived data** (`lib/derived/overview.ts`). Overview counts that the API cannot provide are computed from per-session requests, capped at 10 sessions, and labelled "Derived from session data" with "Showing N of M sessions" whenever the cap applies (decision D6).
- **Confirmed rule** (`lib/stages.ts`). A transaction stage rail never shows Confirmed without a verified read-back, which no endpoint reports. A unit test and a source check enforce it.
- **Design tokens** (`packages/ui-tokens`). CSS variables and a Tailwind v4 theme. The ink and grey values equal the landing page's; the landing page does not consume the package yet.

## Build status

| Area | Phase A |
|---|---|
| Tokens, Tailwind theme, app shell (two header rows, environment indicator, organization selector, Freighter wallet cell, seven tabs, bottom bar under 768 px) | Done |
| Shared components with all states, and the gallery at `/dev/components` | Done |
| Sign-in (wallet and email), wallet connection failure states | Done |
| First-time onboarding (profile, create organization, join with an invitation code) | Done |
| Overview | Done, with real and derived data only |
| Clearing Sessions, Obligations, Organization, Activity, Wallets, Settings | Placeholder pages ("Not built yet"), phases B to E |

Real, derived and not supported are listed in the plan (sections 3 and 3a) and in the Phase A report. Notifications and global search render "Not supported".

## Test

```bash
npm run typecheck --workspace tobin-web
npm run lint      --workspace tobin-web
npm test          --workspace tobin-web          # node --test: permissions, derivation and cap, proxy policy, stage rule, wallet sequence, source check
cd apps/web && npx playwright test               # smoke tests; use the system Chrome, no backend needed
```

Review screenshots (1440, 900 and 390 px) are produced from the real UI against a real, seeded throwaway backend:

```bash
node apps/web/scripts/seed-review-data.mjs                       # fictional people and the documented arithmetic example, through the console's real API
node apps/web/scripts/review-screenshots.mjs docs/screenshots/phase-a
```

## Licence

Apache-2.0, like the rest of the repository. The Tobin name and logo are not covered by it (see `apps/landing/NOTICE`).
