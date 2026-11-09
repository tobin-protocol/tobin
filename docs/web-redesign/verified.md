# Verification of the audit's claims (2026-11-09)

The audit (`docs/web-redesign/audit/`) was written from source only by an agent that ran nothing. Before relying on a claim I checked it against the source. Everything below is a source reading unless stated; no browser, test or build was run for this document.

## Verified (true as the audit says)

| Claim | Evidence |
|---|---|
| The proxy forwards only `/api/auth` and `/api/registry` | `apps/web/lib/proxy-policy.ts`: `ALLOWED = /^\/api\/(auth\|registry)(\/\|$)/`; only GET and POST; the Stellar, bootstrap, rpc, W0 and health routes are unreachable |
| The console has no public read endpoint | `apps/web-console/lib/registry/http.ts` lines 48-51: every registry request runs `deps.authenticate` and answers 401 `UNAUTHENTICATED` before any route is matched. That includes `GET /assets`. So a signed-out Discover cannot read anything through the proxy |
| Discover has no backend | Same file: there is no public listing, directory or explorer route. `apps/web/app/(app)/discover/page.tsx` is the Not-supported page written in the earlier pass |
| Cross-session derived views are capped at 10 | `apps/web/lib/derived/overview.ts:6` `SESSION_REQUEST_CAP = 10`; the cap is a default parameter in `lib/activity/derive.ts`, `lib/derived/obligations.ts` and `overview.ts`, so it can already be passed in. This is what a "Load next 10" step can extend |
| Backend routes for ready, reopen and close exist and the UI has no client method | `http.ts:292` handles `ready`, `reopen`, `close`; `apps/web/lib/tobin/client.ts` has no matching method |
| Execution start and attempts routes exist, with no UI | `http.ts:239-262` |
| Wallet link (unproven claim) route exists | `http.ts:100-101` (`GET`/`POST` wallets). The spec keeps the UI behind a flag, OFF |
| Obligation update route exists | `http.ts:156` (`.../update`). The spec keeps editing out |
| No `loading.tsx`, `error.tsx` or `not-found.tsx` | `find apps/web/app` found none |
| The auth gate is client-side | `apps/web/app/(app)/layout.tsx` wraps pages in the client component `AppGate`; there is no `middleware.ts` or `proxy.ts` in `apps/web` |
| Overloaded files | `Shell.tsx` 255 lines, `Organization.tsx` 220, `tabs.tsx` 186, `Workspace.tsx` 170 (non-empty lines) |
| `@hugeicons/react` and `@web3icons/react` are installed for the landing only | `apps/landing/package.json` lines 13-15; `apps/web/package.json` has neither; no `components.json` in `apps/web` |

## Not verified

- The "about 21 requests per page for reviewers" and "about 30 more on the Overview" figures: not measured. I will count requests in R5 with a real browser.
- Contrast ratios in the audit and in the spec (#2F5D00 about 7.8:1, #B6FF3E with black about 16:1, ink 60% about 5.7:1): hand estimates. I will compute them programmatically in R1 and list them in `contrast.md`.
- The separation-of-duties rules in `apps/web-console/lib/registry/service.ts`: not read line by line. I will read them before the Settlement close-out in R3.
- Whether the earlier clipped session names at 390px persist: fixed in PR #44 and covered by its regression run; not re-checked here.

## Wrong or incomplete in the audit or the spec

- **Branch.** The prompt says to branch into `feat/web-redesign` from `feat/web-app-plan`. `feat/web-app-plan` was merged as PR #43 and PR #44 (`feat/web-redesign`) has since been merged too (merge commit `78f7317`; `main` is at `15248ff`, which also includes PR #42). The prompt says to branch from `main` in that case, so `feat/web-redesign-v2` was created from `main`. Its first commit is the docs commit; no PR is open.
- **Fonts.** The spec asks for the landing page's exact families. The landing loads four through `next/font/google` (`apps/landing/src/app/layout.tsx`): Urbanist (headings), Outfit (display), Instrument Sans (body and UI), Space Grotesk (labels). Its mono is a system stack (`ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas`), not a loaded font. The web app currently uses Geist and JetBrains Mono. Mapping I will use: UI and values = Instrument Sans, banner headline = Outfit, 12px uppercase labels = Space Grotesk, identifiers = the landing's system mono stack, page titles = Urbanist. This is a decision for you (see plan, open questions).
- **Colour.** The landing is strictly greyscale. It has no green. The spec's #B6FF3E and #2F5D00 are new, so "check each against the landing page's tokens" has an answer: they do not exist there. The grey values (#000, #1d1d1d, #626262, #f0f0f0) match `packages/ui-tokens`. The landing radii (12 to 32px) and nav shadow contradict the app's 0-radius, no-shadow rule; the landing is not being changed, so the two will differ.
- **Hugeicons needs two packages.** `@hugeicons/react` 1.1.10 is the renderer; the icons come from `@hugeicons/core-free-icons` 4.4.0. Both are MIT. `@web3icons/react` 4.1.24 is MIT. The prompt names only the first.
- **Landing GitHub button appears twice** in `Nav.tsx` (desktop at line 152, mobile menu at line 208). The footer already links GitHub (`Footer.tsx:12`), so no footer change is needed.
- **Server-side access control.** Next here is 16.4.3, and its docs may have renamed middleware (I have not read `node_modules/next/dist/docs/` yet). The session cookie is set by the console and forwarded by the proxy, so a server layout has to validate it by calling the console's `/api/auth/me` from the server. I will confirm both in R1.
- **Spec route rename.** `/approvals` becomes `/reviews`. Existing links and the five scripts that open `/approvals` need updating, and the old path should redirect.
