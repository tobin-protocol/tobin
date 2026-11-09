# 08 Technology and architecture assessment

Versions below were resolved from the installed `node_modules` in the monorepo root (read-only `require(...).version` and `npm ls`), and from the package.json files. Nothing was installed or changed.

## Monorepo
Root `package.json`: npm workspaces `apps/*`, `packages/*`; Node >= 24; TypeScript 5.9.3; no root lint/test runner beyond workspace scripts. Workspaces: `apps/web` (tobin-web), `apps/web-console` (backend + legacy console UI), `apps/landing` (marketing site), `apps/docs` (fumadocs), `packages/ui-tokens`, `packages/mvp1-sdk`.

## Stack: installed versions and usage

| Item | Declared | Installed | Used in apps/web? |
|---|---|---|---|
| Next.js | 16.4.3 (web, landing, console) | 16.4.3 | Yes, App Router, Turbopack, `next/font/google`, `next dev --hostname 127.0.0.1 --port 3000` |
| React / DOM | 19.3.0 | 19.3.0 | Yes (React 19 `ref` as prop pattern in fields) |
| TypeScript | ^5 (web) / 5.9.3 root | 5.9.3 | Yes; `.ts` import specifiers with extensions; tests run by `node --test` directly on TS (Node >= 24) |
| Tailwind CSS | ^4 | 4.3.3 | Yes, v4 CSS-first: `@import "tailwindcss"` + `@theme` tokens; no tailwind config file; `@tailwindcss/turbopack` loader 4.3.3 (not PostCSS) |
| Design tokens | `tobin-ui-tokens` 0.1.0 | workspace | Yes: `packages/ui-tokens/tokens.css` as `@theme` (colors, radii 8/16/24/32, type scale 12-48px). The landing page does not consume it ("values duplicated on purpose" per its header) |
| shadcn/ui | none | not installed; no `components.json` | **No.** No shadcn CLI, no registry components |
| Radix primitives | none | `@radix-ui/react-dialog` 1.3.1 present only as a transitive dependency of `fumadocs-ui` in `apps/docs`; `radix-ui` umbrella not installed | **No** (native `<dialog>` used instead) |
| class-variance-authority / clsx / tailwind-merge | none in web | cva 0.7.1, clsx 2.1.1 (transitive via docs/recharts); tailwind-merge not installed | No; local `cn()` in `lib/format.ts` |
| Icon libraries | web: none | `@hugeicons/react` 1.1.10, `@hugeicons/core-free-icons` 4.4.0, `@web3icons/react` 4.1.24 are dependencies of `apps/landing` only; `lucide-react` 1.70.0 transitive via fumadocs | **No.** `apps/web` uses inline SVG (Shell search/bell/chevron, Feedback cross). Grep for web3icons/hugeicons in `apps/web` returned no match |
| Stellar Wallet SDK (`@stellar/typescript-wallet-sdk`) | none | **not installed** | No |
| Stellar Wallets Kit | none | not installed | No (D4 decision to avoid) |
| Freighter API | 6.0.1 | 6.0.1 | Yes, dynamic `import()` in `lib/wallet/freighter.ts` |
| `@stellar/stellar-sdk` | console only (17.4.0) | 17.4.0 | No (web has no Stellar SDK; backend only) |
| Data fetching | `@tanstack/react-query` ^5.107.1 | 5.107.1 | Yes, everywhere (`useQuery`, `useQueries`), plain `fetch` in `lib/api/http.ts`; no server components data fetching, no Server Actions, no SWR |
| Tables | `@tanstack/react-table` ^9.3.1 | 9.3.1 | Yes, row model only (`tableFeatures({})`, `createColumnHelper`, `useTable`), custom markup |
| Forms | `react-hook-form` ^7.91.0, `zod` ^4.6.7 | 7.91.0, 4.6.7 | Yes. `@hookform/resolvers` not used; a local `zodResolver` in `lib/schemas.ts` (comment: not an approved dependency) |
| State | React state + Query cache + `useSyncExternalStore` (ActionSheet) | | No Redux/Zustand/Context beyond `WorkspaceContext`, `WalletProvider` |
| Testing | `@playwright/test` ^1.65.0; `node --test` | Playwright 1.65.0, ESLint 9.39.5 | 9 unit test files, 5 e2e smoke tests; no Vitest/Jest/Testing Library; axe-core 4.14.0 is present at root but not a declared dependency of `apps/web` (script requires `AXE_PATH`) |
| Lint | eslint ^9, `eslint-config-next` 16.4.3 | | `eslint.config.mjs` present |
| Fonts | `next/font/google` Geist and JetBrains Mono | | Geist stands in for "Gellix" |

## Preferred stack comparison

| Preferred | Installed in monorepo | Used in `apps/web` | Missing / notes |
|---|---|---|---|
| shadcn/ui | No | No | Not initialised (no `components.json`, no `cn` from shadcn, no Radix). Adopting means adding Radix primitives, cva, clsx/tailwind-merge. Existing `ui/` primitives (Button, Dialog, Popover, Form, Table) overlap one-to-one |
| Tailwind | Yes, v4.3.3 | Yes | shadcn's current Tailwind v4 flow is CSS-first, which matches the existing `@theme` tokens. Token names (`bg-panel`, `text-muted`, `rounded-card`, `text-body`) are custom and would need mapping to shadcn's semantic variables (`--background`, `--primary`, etc.). Landing and web duplicate token values by design |
| @web3icons/react | Yes (landing only) | No | Would be usable for wallet/network/asset logos; the backend returns no provider/logo data (`application-audit.md` "Opportunities not taken") so logos would be a front-end static mapping (Freighter only is ever used) |
| @hugeicons/react (+ core-free-icons) | Yes (landing only) | No | Would replace inline SVG; free icon pack only |
| Stellar Wallet SDK | No | No | Not present anywhere. Wallet work today = Freighter API only. Any signing flow would require this plus new backend routes (none exist) |

## Architecture observations
- **Client-only data layer.** All pages are client components behind a client-side gate; no server-rendered data, no `loading.tsx/error.tsx`. First paint on a protected route is a skeleton until `/api/auth/me` resolves. Auth gating by redirect in effects.
- **Typed client interface** (`TobinClient`, `lib/tobin/client.ts`) with `HttpAdapter` and `MockAdapter`: a clean seam for a redesign; types in `lib/tobin/types.ts` (168 lines).
- **Pure logic in `lib/`** (stages, lifecycle, layers, next-action, permissions, org/obligation/approval rules, derive, netting grouping, settlement diff) is framework-free and covered by node tests; this is the part most worth preserving.
- **Proxy** (`app/api/[...path]/route.ts` + `lib/proxy-policy.ts`) forwards cookies and a required `x-tobin-request` header; GET and POST only; no CORS changes to the console.
- **Request fan-out**: pages issue many parallel requests; React Query keys are shared across pages (`["session", org, id, part]`) to reuse cache. `Shell` runs `useApprovalsPending` for reviewers on every page (1 list + 2 requests per session x 10).
- **Duplication**: five copies of the derive-over-sessions pattern, each with `eslint-disable react-hooks/exhaustive-deps` on a `stamp` string key (`GlobalActivity.tsx`, `GlobalApprovals.tsx`, `GlobalObligations.tsx`, `Overview.tsx`, `usePending.ts`).
- **Dev route in production build**: `/dev/components` has no environment guard (grep for `NODE_ENV`/`notFound` found none).
- **Local-only posture**: dev/start bind to 127.0.0.1:3000; metadata `robots: noindex`; "Production deployment has not been approved" in footers. Deployment story: unknown.
- **Version compatibility concerns for a redesign**: React 19.3 / Next 16.4 / Tailwind 4.3 are recent; check shadcn and Radix compatibility with React 19.3 at adoption time (unknown without installing). TanStack Table v9 (`useTable`, `tableFeatures`) is a newer API than most shadcn data-table examples (which assume v8 `useReactTable`), so published recipes would need translation. `@tailwindcss/turbopack` loader is wired in `next.config.ts`, matching landing and docs.
- **Compat of monorepo hoisting**: web relies on root `node_modules`; there is no `apps/web/node_modules` listing in the check (the dir was empty or absent), i.e. a single hoisted tree.
