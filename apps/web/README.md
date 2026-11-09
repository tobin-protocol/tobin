# Tobin web app (`apps/web`)

The institutional web app for Tobin: a client of the web console's API (`apps/web-console`), reached through a server-side proxy. Institutions record the payment obligations of a session, run a deterministic netting calculation, have a reviewer approve the calculation and the settlement batch, and see the record of what happened.

## Status

**Specification and validation stage. Experimental. Stellar testnet with test assets only. Not production-ready. Not audited.** Nothing here moves real funds. It was reviewed by the people who wrote it; no independent review of any part of it has happened. The economic thesis is an untested hypothesis. See [`docs/web-redesign/open-items.md`](../../docs/web-redesign/open-items.md) for what only the owner can verify and [`docs/web-redesign/plan.md`](../../docs/web-redesign/plan.md) for how the rewrite was built and checked.

What the app **cannot** do, by design of the current backend: sign, submit or verify a Stellar transaction; link or verify a wallet; send notifications; list other institutions. A Tobin approval is a recorded decision, not a Stellar signature. "Confirmed" is never shown, because no endpoint reports an independently read-back transaction (only `lib/stages.ts` may name it).

Hosting is **local only** until a reachable backend exists: the console is Next.js route handlers plus one SQLite file bound to `127.0.0.1`. `apps/web-console` remains the canonical institutional UI until this app reaches parity and the owner says so.

## Run it

Needs Node 24 and, for the browser scripts, an installed Chrome. From the repository root, after `npm ci`, both servers must run:

```bash
# 1. the backend (the web console) on 127.0.0.1:8787, with a throwaway database
cd apps/web-console && npm run build && TOBIN_DB_PATH=/tmp/tobin-web.sqlite npx next start --hostname 127.0.0.1 --port 8787

# 2. this app on 127.0.0.1:3000
npm run dev --workspace tobin-web          # or: npm run build --workspace tobin-web && npm run start --workspace tobin-web
```

Open `http://127.0.0.1:3000`. Settlement can only be prepared when the operator has configured a supported asset (there is no API for it):

```bash
cd apps/web-console
TOBIN_DB_PATH=/tmp/tobin-web.sqlite node scripts/db.ts asset-add testnet USD <a Stellar account address as issuer>
```

### Environment variables

| Variable | Default | What it does |
|---|---|---|
| `TOBIN_API_URL` | `http://127.0.0.1:8787` | where the server-side proxy and `proxy.ts` reach the console |
| `NEXT_PUBLIC_TOBIN_SAMPLE_DATA` | off | `1` switches the data layer to a fictional `MockAdapter`, shows a persistent "Sample data" banner and turns server-side access control off. For previews only |
| `TOBIN_DEV_GALLERY` | off | `1` enables `/dev/components`, the component gallery with fictional values (also on in `next dev`) |
| `NODE_ENV` | set by Next | selects dev or production behaviour |

Nothing secret is configured here and nothing may be committed. The landing page's `Launch app` link is a separate setting (`NEXT_PUBLIC_TOBIN_APP_URL` in `apps/landing`): it points at `http://127.0.0.1:3000` in development and is disabled in production until a domain is chosen.

## Route map

Access is enforced on the server in `proxy.ts` (it asks the console who owns the cookie, then applies `lib/access/decide.ts`); the console's own guards are unchanged.

| Route | Access | Notes |
|---|---|---|
| `/discover` | public | explorer; empty until a public API exists |
| `/sign-in` | public | email and password, or the Connect wallet window |
| `/onboarding` | signed in, no organization | |
| `/` | signed in | Overview: derived attention items |
| `/sessions`, `/sessions/new` | signed in | list; create wizard |
| `/sessions/:id` | signed in | tabs Overview, Participants, Obligations, Netting, Settlement (five steps, `?step=review\|prepare\|batch\|execution\|sign`), Activity |
| `/obligations` | signed in | across sessions; opens the same detail sheet as the workspace |
| `/reviews` | signed in | calculations and settlement batches awaiting review; My reviews needs the Reviewer grant |
| `/activity` | signed in | across sessions; read-only |
| `/organization` | signed in | tabs Overview, Members and roles (invitations inside), Institutions, Wallets |
| `/settings`, `/notifications` | signed in | supported settings only; notifications is Not supported |
| `/approvals`, `/wallets` | redirects | to `/reviews` and `/organization?tab=wallets` |

## Role model

Real roles only: **Admin** and **Member**, plus a separate **Reviewer** grant that lets a person approve or reject. Nobody reviews a result they recorded, changed, calculated or prepared; the server enforces it and the UI states it. Role changes are administrator-only, take one confirmation that lists what the person gains and loses, and never remove the last active administrator.

## Real, derived, not supported

- **Real** (read from the console as it answers): sessions, obligations, calculations, authorizations, settlement batches, members, invitations, wallet records, account audit.
- **Derived** (computed here from per-session reads of the newest sessions, because the API has no aggregate endpoint): Overview, Reviews, global Obligations, global Activity and the sidebar Reviews count. Every one says how much it covers ("Based on N of M sessions") and "Load next 10 sessions" widens it. No figure is summed across assets.
- **Not supported** (shown with the shared component and a reason, never mocked): Notifications; Sign, Submit and Verify; collecting Stellar signatures; N-of-M approval; participants from other organizations; assets, deadlines and settlement parameters at session creation; institution directory; roles beyond Admin and Member; password change; list of active sessions. Wallet linking from this app is not available (the backend can link, the client has no call for it): the Connect a wallet button only opens a window that looks for a wallet in this browser. Disconnect removes the verified record and the sessions that used it; it cannot remove Tobin's permission inside Freighter.
- **Sample**: only with `NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1`, labelled. The Discover "how clearing works" figures are an illustrative example and say so.

## Scripts

```bash
npm run typecheck --workspace tobin-web   # ~30 s
npm run lint      --workspace tobin-web   # ~1 min
npm test          --workspace tobin-web   # ~10 s: node --test, 150 tests (permissions, derivation, proxy policy, Confirmed rule, source scans, roles, review queue)
```

Browser scripts need both servers running and a **fresh, seeded, throwaway** console database (`SEED_EXTRA_SESSIONS=12 SEED_WALLET=1 SEED_ASSET_REF=testnet:USD:G... node scripts/seed-review-data.mjs`). They drive the real UI and real API as Alice (admin), Bob (reviewer) and Carol (member); times are rough, on a laptop:

| Script | Covers | About |
|---|---|---|
| `node scripts/check-access.mjs` | signed-out client, every page and API route refused or redirected | 15 s |
| `node scripts/review-r1.mjs <dir>` | shell, access, Discover, sign-in | 3 min |
| `node scripts/review-r2.mjs <dir>` | Overview, Sessions, wizard, workspace shell | 6 min |
| `node scripts/review-r3.mjs <dir>` | workspace tabs, Settlement steps, Reopen | 10 min |
| `node scripts/review-r4.mjs <dir>` | global pages, Organization, Settings | 8 min |
| `AXE_PATH=... node scripts/review-wallet-states.mjs <dir>` | wallet popover states against a mock Freighter, axe with it open, Disconnect confirmation and one real Disconnect; needs the seed with `SEED_WALLET=1` | 4 min |
| `node scripts/review-r5.mjs <dir>` | axe on every route (signed-out, member, admin), overflow at 390 and 360, every dialog and sheet's copy; needs `AXE_PATH` | 10 min |
| `node scripts/review-screenshots{,-b,-c,-d,-e,-f}.mjs <dir>` | Stages A to F, the earlier acceptance runs | 3 to 10 min each |
| `node scripts/keyboard-walkthrough.mjs` | keyboard-only main flows | 2 min |
| `AXE_PATH=... node scripts/a11y-scan.mjs` | axe, 44px tap targets, overflow (admin) | 5 min |
| `node scripts/measure-requests.mjs <label>` | API requests per first load, per role | 2 min |
| `node scripts/contrast.mjs` | computed contrast pairs | seconds |
| `npx playwright test` | smoke tests, system Chrome, no backend; local only | 1 min |

axe-core is not a dependency: install it in a scratch folder and point `AXE_PATH` at `axe.min.js`.

## Known limits

- Same-author evidence. Chrome only (Edge, Firefox, Safari untested); no screen-reader pass; no hosted CI run of the browser scripts.
- Cross-session pages read at most the newest sessions you have loaded (10 at first); they are slow for large organizations and say so. An aggregate endpoint would replace the hook in `components/data/useCrossSession.tsx` only.
- The command panel lists up to the newest 300 loaded sessions and says when it is capped.
- A calculation's author is not exposed by the API, so Reviews cannot show it.
- Public Discover data does not exist; the page is an honest empty explorer.
- Light theme only, no theme switcher.
