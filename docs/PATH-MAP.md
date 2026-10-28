# Path map: repository layout before and after the monorepo move

Older documents (`docs/reports/`, `docs/reference/`, release-gate approval texts and the historical comments in some fixtures) were written against the earlier layout and are intentionally left as written. Read their paths through this table.

| Earlier path | Current path |
|---|---|
| `core/` (Rust workspace, contracts, signer, dev examples) | `contracts/` |
| `ts/src/**` (engine, digest, SDK, local bridge client) | `packages/mvp1-sdk/src/**` |
| `ts/test/**` except the Console tests and the browser journey | `packages/mvp1-sdk/test/**` |
| `ts/console/controller.ts`, `view.ts`, `http-transport.ts` | `apps/web-console/lib/console/` |
| `ts/console/main.ts`, `index.html`, `styles.css` | `apps/web-console/components/console-app.tsx`, `app/layout.tsx` + `app/page.tsx`, `app/globals.css` |
| `ts/console/server.mjs` (local server) | `apps/web-console/lib/server/`, `app/api/bootstrap/route.ts`, `app/api/rpc/route.ts`, `proxy.ts`, `next.config.ts` |
| `ts/test/console*.test.ts`, `ts/test/browser/**` | `apps/web-console/test/**` (`console-server.test.ts` became `next-server.test.ts`, plus new `guards` and `api` tests) |
| `ts/README.md`, `ts/DB-09-DIGEST-REVIEW.md` | `packages/mvp1-sdk/README.md`, `packages/mvp1-sdk/DB-09-DIGEST-REVIEW.md` |
| `ts/package.json`, `ts/package-lock.json`, `ts/tsconfig.json` | root `package.json` (npm workspaces), root `package-lock.json`, `tsconfig.base.json` and per-package `tsconfig.json` |
| the separate `tobin-landing` repository (all tracked files, 44 commits of history) | `apps/landing/` (git subtree import; landing's own `LICENSE`, `NOTICE`, `README.md` and `AGENTS.md` kept) |
| `scripts/`, `ci/`, `release/`, `docs/`, `.github/workflows/` | unchanged locations |

Commands changed accordingly: Rust commands run in `contracts/`; `npm ci`, `npm run typecheck`, `npm test` and `npm run build:console` (`next build`) run at the repository root.
