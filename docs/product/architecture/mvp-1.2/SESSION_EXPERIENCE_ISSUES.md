# Session experience: remaining issues

> Update (backend and persistence milestone): the production-identity, in-memory and fixture-seeding limitations below are SUPERSEDED. Identity is now real server-side sessions, storage is durable SQLite, fixtures are never seeded automatically, and /sessions requires sign-in. The browser journey now signs in for real and has 78 checks per width. See BACKEND_PERSISTENCE_*.md. The other limitations (chain states untested, one browser, dark theme only, contrast, screen readers) still apply.

## Navigation and header
- Navigation entry added (owner chose Option A): `/sessions` is served from the route group directory `app/(institution)` (not part of the URL), whose layout renders an Institution navigation (`components/institution-nav.tsx`). The root layout is unchanged, so `/w0` and `/` show no such navigation.
- OPEN LIMITATION: there is no link from `/` or `/w0` to `/sessions` (deliberate, to keep the signer console separate). A user must know the `/sessions` URL to enter the institutional area. The nav has one entry.
- The root header reads "Tobin Console / MVP-1, experimental. Everything here runs in a local sandbox on this machine." and the tab title "Tobin Console (local sandbox)". For the current page this is accurate (local, in memory, no network). It would be misleading for a hosted deployment. Not changed.

## Production identity and fixture seeding (inspected, not changed)
- The page sends the fixed header `x-tobin-dev-user: dev:demo`. Anyone who can reach the server can send `dev:demo` or `dev:other` and act as that user. This is not authentication, and the page banner says so.
- In a production build the API returns 503 unless `TOBIN_ALLOW_DEV_IDENTITY=1`. Setting it on any reachable host lets anyone who knows a development name act as that user. The browser journey runs this way deliberately.
- The in-memory registry is seeded on every process start, in every environment, with "Demo Institution (fixture data)", "Other Institution (fixture data)" and one fixture session. All are labelled fixture in the UI. A production deployment with the opt-in would still show demo organizations, would lose all drafts on restart, and would hold separate state per instance.
- Implication: the current build suits local or controlled demonstration only. A real deployment first needs an identity provider, a persistent store and a decision on seeding (all out of scope and unapproved).
- Isolation is tested between different development identities. A forged identity cannot be distinguished by design.

## Untested states
- Chain-read and chain-confirmed workspaces cannot be produced through the application (no route and no reader, by design). They are covered only by unit tests of the view model. NOT TESTED in the browser.
- The empty-list state is unit-tested only: the seeded organization always has a fixture row, and no production path was altered to empty it.

## Other limitations
- One browser engine (Chrome 156) with CDP viewport emulation. No Edge, Firefox, Safari, real mobile or touch.
- Dark theme only was rendered.
- Contrast not measured numerically; no screen-reader testing; no arrow-key navigation in the tab list.
- Not every screenshot was inspected by eye. Inspected: both navigation screenshots, listing-420, and the net-positions screenshots at 420 and 1200; the rest passed programmatic layout checks only.
- The store is a process singleton; each journey run starts a fresh server.
- The existing W0 journey was not re-run: this work changed only session files, the new institutional layout and nav, and one `package.json` script.
- The active-state check covers only `/sessions` (the nav has one entry).
- Empty-list, chain-read and chain-confirmed browser states, the light theme, contrast ratios and screen-reader behaviour remain unverified (see the acceptance record).

## Blocked verification
None. An initial launch failure came from passing a relative artifact directory (used as the browser profile path). Run the journey with an absolute directory.
