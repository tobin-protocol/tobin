# Monorepo migration: inventory, baseline and plan (Phase 1)

Status: inventory and plan only. No file was moved, deleted, renamed or rewritten; nothing was committed or pushed. Facts below were read from the repository on branch `feat/monorepo-foundation`, created from the verified `origin/main` (`cade265fcc21dc1910b60beff6a4899ef7a24e19`, the merge commit of pull request #1). Statements about the landing page come from the founder's local copy and from GitHub's public metadata.

## 1. Current layout and responsibilities
| Path | Responsibility | Files |
|---|---|---|
| `core/` | Rust workspace (`resolver = "2"`, members `token`, `clearing`): `TobinClearingV1`, `TobinTestToken`, Rust tests, fixtures, the local authorization signer (`clearing/signer/mod.rs`), dev examples `bridge` and `authsign`; `Cargo.lock` (216 entries) | 25 |
| `ts/` | One npm package (`tobin-mvp1-ts`, npm lockfile v3, exact pins `typescript` 5.9.3, `@types/node` 20.19.43, no workspaces): engine, digest, SDK, Node-only `src/local/bridge.ts`; the browser Console (`console/`); 13 test files (7 for the engine/SDK, 4 for the Console, 2 helpers), fixtures, browser journey (`test/browser/`) | 50 |
| `ts/console/` | Plain TypeScript + DOM page: `main.ts` (wiring), `controller.ts`, `view.ts` (HTML strings), `http-transport.ts`, `index.html`, `styles.css`, `server.mjs` (local Node server: static files, `GET /api/bootstrap`, `POST /api/rpc`, Host/Origin/JSON checks, security headers), `tsconfig.json` (emits to ignored `dist/`) | 8 |
| `scripts/ci`, `scripts/release` | Dependency-free Node helpers for CI and the release-gate checker | 7 |
| `ci/` | CI notes, dependency baseline CSV (219 rows), recorded Wasm hashes | 4 |
| `release/` | Gate records (`RELEASE-GATES.json`), checklists, superseded policy draft | 4 |
| `.github/workflows/` | `ci.yml`, `integration.yml`, `release-readiness.yml` | 3 |
| `docs/` | Baseline spec, reference, historical reports | 7 (+ this file) |
| Root | `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, `.gitignore`, `.gitattributes` | 6 |
| `archive/` | Untracked, never committed; stays out of Git | 6 |

Console architecture: the browser code talks to two HTTP endpoints. The Node server owns a singleton "sandbox" that spawns the Rust bridge executable (JSON lines over pipes, path from `TOBIN_BRIDGE_EXE`) and applies simulated authorizations. The UI renders strings into `#app` and wires `submit`, `click` and `change` events; there are no routes beyond `/`. Environment variables in use: `PORT`, `TOBIN_BRIDGE_EXE`, `TOBIN_BROWSER`, `TOBIN_WIDTH` (test harness), `TOBIN_CLEARING_WASM`, `TOBIN_TOKEN_WASM` (Rust tests), and in CI `CARGO_*`, `RUSTUP_TOOLCHAIN`, `STELLAR_*`. No secrets or `.env` files exist. Package manager: **npm** (Node >= 24 for type stripping; tests run `.ts` directly with `node --test`).

## 2. The landing page
* **Location:** a separate Git repository in the founder's workspace, a sibling directory named `tobin-landing/` next to this repository's directory. It is not nested in and not tracked by this repository. Its remote is `https://github.com/tobin-protocol/tobin-landing.git` (public, default branch `main`, Apache-2.0 by GitHub's detection, not archived).
* **State:** local branch `main` at `941352d2e43e800b0e4cd1d768f78b8fdaae42be`, which equals the remote `main` (checked through the GitHub API). One **uncommitted** change exists in its `README.md` (adds a link to the protocol repository); it is the founder's work and was not touched. 126 tracked files; `node_modules/` installed (292 entries).
* **Stack:** Next.js **16.4.0**, React 19.3.0, TypeScript ^5, Tailwind CSS v4 (`@tailwindcss/turbopack`), `motion`, `lenis`, ESLint 9; npm (`package-lock.json`); App Router in `src/app`, `src/components`, `src/lib`; `next.config.ts` enables `cacheComponents`, `partialPrefetching` and a Turbopack CSS rule; path alias `@/*` -> `./src/*`; one script `scripts/build-logo-art.mjs`. Scripts: `dev`, `build`, `start`, `lint`. Only environment variable: `NEXT_PUBLIC_SITE_URL`. No CI, no deployment file (`vercel.json` etc.) in the repository.
* **Notable:** `AGENTS.md` states this Next.js differs from common knowledge and tells contributors to read `node_modules/next/dist/docs/` first (that applies to the web console work too). It carries its own `LICENSE`, a `NOTICE` ("Copyright 2026 Tobin Protocol contributors", which differs from this repository's notice "Copyright 2026 tobin-protocol"), `brand-pack/` (2.7 MB), `logo-redesign-brief/` (2.1 MB, kept out of Git by a local exclude rule) and `public/brand/`. Its README says the Apache licence does not cover the Tobin name, logo or brand assets.
* **Local-only material that must not be imported:** `logo-redesign-brief/` (local exclude), `design-audit.md`, `public/fonts/` (an ignored personal-use font), `tsconfig.tsbuildinfo` and `next-env.d.ts` are ignored by Git and stay out. Fonts used by the page come from `next/font/google` (needs network at build time).
* **Integration approach (recommended):** import the repository's tracked files into `apps/landing/` and archive the old repository only after the monorepo deployment works. To keep history, use `git subtree add --prefix=apps/landing <landing remote> main` (needs network access to the public landing repository); otherwise copy the tracked files of `941352d` and keep the old repository as the history. Before importing, the founder commits (or discards) the local README change in the landing repository. The hosting project (if any; none is described in the repository) must have its "root directory" set to `apps/landing`; that is an external action.

## 3. Proposed target layout
```
contracts/                  Rust workspace (was core/): Cargo.toml, Cargo.lock, clearing/, token/, README.md
apps/web-console/           Next.js app (App Router): app/, components/, lib/console, lib/server, proxy.ts, test/
apps/landing/               imported Next.js landing page (own README, brand assets)
packages/mvp1-sdk/          engine, digest, SDK, Node-only local bridge client + their tests (see section 6)
scripts/ ci/ release/ docs/ .github/    unchanged locations, paths updated
package.json                npm workspaces: ["apps/*", "packages/*"]; one package-lock.json
tsconfig.base.json          shared compiler options
LICENSE SECURITY.md CONTRIBUTING.md README.md
```
No Turborepo, Nx, pnpm or extra shared package is proposed. `packages/mvp1-sdk` is the only package, justified in section 6.

## 4. Old path -> new path
| Old | New | How |
|---|---|---|
| `core/Cargo.toml`, `core/Cargo.lock` | `contracts/Cargo.toml`, `contracts/Cargo.lock` | `git mv core contracts` (history kept) |
| `core/clearing/**`, `core/token/**` (src, tests, fixtures, signer, examples) | `contracts/clearing/**`, `contracts/token/**` | same move; no content change |
| `core/README.md` | `contracts/README.md` | paths in text updated |
| `ts/src/**` (address, amount, digest, sha256, strkey, `engine/`, `sdk/`, `local/bridge.ts`) | `packages/mvp1-sdk/src/**` | `git mv` |
| `ts/test/` except console tests and `browser/` (digest, engine, interop, intent, primitives, sdk, sdk-unit, `helpers.ts`, `bridge-env.ts`, `fixtures/`) | `packages/mvp1-sdk/test/` | `git mv`; two fixture paths `../../core/clearing/tests/fixtures` -> `../../../contracts/clearing/tests/fixtures` |
| `ts/test/console*.test.ts` (4 files) | `apps/web-console/test/` | `console-server.test.ts` is rewritten (section 5); the others move with import fixes |
| `ts/test/browser/{journey,badge,cdp}.mjs` | `apps/web-console/test/browser/` | server start command and readiness check changed |
| `ts/console/controller.ts`, `view.ts`, `http-transport.ts` | `apps/web-console/lib/console/` | `git mv`, unchanged logic |
| `ts/console/main.ts` | `apps/web-console/components/console-app.tsx` (client component) | logic ported, same event wiring |
| `ts/console/index.html` | `apps/web-console/app/layout.tsx` + `app/page.tsx` | same text and landmarks |
| `ts/console/styles.css` | `apps/web-console/app/globals.css` | unchanged rules |
| `ts/console/server.mjs` | `apps/web-console/app/api/bootstrap/route.ts`, `app/api/rpc/route.ts`, `lib/server/sandbox.ts`, `lib/server/guards.ts`, `proxy.ts`, `next.config.ts` `headers()` | same checks and limits |
| `ts/console/tsconfig.json`, `ts/console/dist/` | removed | Next builds the app |
| `ts/package.json`, `ts/package-lock.json`, `ts/tsconfig.json` | root `package.json`, root `package-lock.json`, `tsconfig.base.json`, package-level `package.json`/`tsconfig.json` | merged; exact pins kept |
| `ts/README.md`, `ts/DB-09-DIGEST-REVIEW.md` | `packages/mvp1-sdk/README.md`, `packages/mvp1-sdk/DB-09-DIGEST-REVIEW.md` (+ a short `apps/web-console/README.md`) | text updated |
| `../tobin-landing/**` (tracked files) | `apps/landing/**` | subtree or copy (section 2) |
| `scripts/**`, `ci/**`, `release/**`, `.github/workflows/**`, `docs/**` | same locations | internal paths updated (section 8) |
| `archive/` | stays untracked; add `/archive/` to `.gitignore` | prevents accidental staging |

## 5. Preserving the Rust workspace and contract builds
* The workspace is self-contained: fixtures are read with `include_str!` relative to each test, `#[path = "../signer/mod.rs"]` is relative, and no Rust file refers to `ts/` or to the old directory name. A `git mv` therefore changes no Rust content.
* Commands become `cd contracts && cargo test --locked --workspace`, `cargo build --locked -p tobin-clearing-v1 --example bridge`, `stellar contract build --locked --manifest-path Cargo.toml --out-dir <dir>`; `CARGO_TARGET_DIR` stays outside the tree and `target/` stays ignored.
* The compiled Wasm does not depend on the directory (two clean builds in different directories were byte-identical earlier), so the recorded hashes (`80bea964…247e5e4`, `ef483732…83241f`) are the acceptance test for the move.
* TypeScript tests keep finding the bridge through `TOBIN_BRIDGE_EXE`; only the documented build commands change.

## 6. JavaScript workspace and package manager
* **Recommendation: npm workspaces** (`"workspaces": ["apps/*", "packages/*"]`) with one root `package-lock.json`. Both existing projects already use npm with lockfile v3; no new tool is needed. Root `engines.node` stays `>=24` (required by type stripping; Next 16.4.0 needs `>=20.9`). Exact pins stay: `typescript` 5.9.3 and `@types/node` 20.19.43 become root devDependencies; the landing page's caret ranges (`typescript ^5`, `@types/node ^20`) are aligned to those versions.
* **Why one package:** `packages/mvp1-sdk` holds the engine, digest and SDK because (1) it has its own seven-file test suite that must keep running under plain Node without Next, (2) the Next app imports it through `transpilePackages`, and (3) the Rust fixture generator and the bridge client are non-UI code. If the founder prefers fewer packages it can live under `apps/web-console/lib/`, at the cost of coupling those tests to the app.
* **Dependency governance impact (must be handled, not skipped):** the current inventory, `ci/dependency-baseline.csv`, `scripts/ci/dependency-report.mjs` and gate G12 describe **3 npm packages**. Next, React, Tailwind and the landing page add roughly 290 packages. The baseline CSV and the gate evidence text must be regenerated and re-approved for the new lockfile; until then the report would list hundreds of "new findings". This is a recorded-decision change (PC-1 and G12 mention the 3-package inventory), so the founder must approve the updated standard.

## 7. Next.js migration strategy for the Console
Principle: move the working code, do not rewrite it, and keep the 128-check browser journey as the regression net.
1. **Read the bundled docs first** (`node_modules/next/dist/docs/`, per the landing `AGENTS.md`): in Next 16 the `middleware` convention is renamed `proxy.ts`; route handlers use `route.ts`; `transpilePackages`, `serverExternalPackages`, `headers()` and `allowedDevOrigins` exist as config options.
2. **Spike (go/no-go):** a minimal `apps/web-console` that imports one SDK function. It must prove that Next/Turbopack accepts the repository's TypeScript settings (`.ts` import extensions, `erasableSyntaxOnly`, `verbatimModuleSyntax`) via `transpilePackages`; the fallback is to switch imports to extensionless paths with a path alias.
3. **Server side:** port `server.mjs` into route handlers. The sandbox singleton (spawns the bridge, `TOBIN_BRIDGE_EXE`) lives in `lib/server/sandbox.ts`, cached on `globalThis` and forced to the Node runtime; the Host allow-list (`127.0.0.1:PORT`, `localhost:PORT`), foreign-Origin refusal on `/api/*`, `application/json` requirement, 1 MB body limit and "known contracts only" check move into `lib/server/guards.ts` as pure functions (unit-testable) used by `proxy.ts` and the handlers. The app is started with `next start -H 127.0.0.1`. Headers added in Step 2 (`nosniff`, `no-referrer`, `X-Frame-Options: DENY`, CSP with `frame-ancestors 'none'`) move to `next.config.ts`; because Next injects inline hydration scripts, the CSP must use nonces (via `proxy.ts`) or an explicitly justified `script-src`; this is checked by the journey and a header test.
4. **Client side:** `components/console-app.tsx` (`'use client'`) mounts the existing `ConsoleController` and `renderApp` exactly as `main.ts` does (ref-owned container, same delegated listeners, same `#error` box). `layout.tsx`/`page.tsx` reproduce the page text and landmarks the journey asserts. No behavior change.
5. **Tests:** `controller`, `view`, `input` tests move unchanged. `console-server.test.ts` (spawns the server) is replaced by tests that call the route handlers and guard functions with `Request` objects plus one `next start` smoke test; the journey harness starts `next start` instead of `server.mjs`. Expected result: same 88 passed + 1 allow-listed skip across both packages, and 128/128 browser checks at 1200 px and 420 px.
6. **Later (separate step, optional):** convert string rendering to React components panel by panel behind the same journey.

## 8. CI and release-tooling changes after the move
* `ci.yml`, `integration.yml`: `working-directory: core` -> `contracts` (12 and 20 occurrences of old paths in the two files); `ts` steps become root-level workspace commands (`npm ci --ignore-scripts`, then `npm run typecheck|test|build` per workspace); add `apps/web-console` build, typecheck and lint; add `apps/landing` build and lint with a path filter; `release-readiness.yml` needs no path change. Path filters in `integration.yml` (`core/**/Cargo.toml`, `ts/package*.json`) become `contracts/**`, root `package*.json`, `apps/*/package.json`, `packages/*/package.json`. Action pins, permissions, concurrency and timeouts are kept; the bridge artifact path and the Wasm build command change only in directory.
* `scripts/ci/dependency-report.mjs` (4 hard-coded paths: `core/Cargo.lock`, `ts/package-lock.json`) and `ci/dependency-baseline.csv` (see section 6); `scripts/release/check-gates.mjs` (fixture allow-list paths `core/clearing/tests/fixtures`, `ts/test/fixtures`, `ts/test/primitives.test.ts`) and its mutation tests; `release/RELEASE-GATES.json` (3 path mentions); `ci/README.md`.
* The Browser journey job installs and builds the Next app before running (`TOBIN_BROWSER`, `TOBIN_WIDTH` unchanged).
* Gate records are not changed by the move; policy PC-1 is valid only for the original source-only scope, so any change that adds a deployed web app or new dependency classes should be reviewed against it.

## 9. Documentation and links affected
The string `core/` appears in 26 tracked files and `ts/` in 35 (living docs, READMEs, contract and SDK comments, workflows, scripts). Plan: update living documents and code comments mechanically with a reviewed script; leave historical reports (`docs/reports/*`) as written and add a short path-map note at their head; keep the link checker in CI. External: the README link to the separate landing repository becomes a monorepo path once imported.

## 10. Baseline checks (before any change; branch `feat/monorepo-foundation`, Windows, offline, existing installs)
| Command | Result |
|---|---|
| `cargo fmt --all --check` | exit 0 |
| `cargo test --locked --offline --workspace` | exit 0; 96 passed, 0 failed, 14 suites |
| `cargo clippy --locked --offline --workspace --all-targets` | exit 0; 9 warning lines (unchanged) |
| bridge build (`--example bridge`) | exit 0 |
| `stellar contract build --locked …` | exit 0; Wasm hashes `80bea964…` and `ef483732…` identical to the record |
| Rust tests against the compiled Wasm | exit 0; 87 passed |
| `npm run typecheck`; `npm run build:console` | exit 0; exit 0 (existing `node_modules`; no `npm ci`) |
| `npm test` with the bridge | exit 0; 89 tests, 88 passed, 0 failed, 1 skipped (the allow-listed known-answer test) |
| `node scripts/ci/check-links.mjs` | 17 Markdown files, 34 relative links, 0 broken |
| `node scripts/release/check-gates.mjs` | report exit 0; `public-source-release` all required gates PASS; versioned-release and production blocked as before |
| `node scripts/ci/dependency-report.mjs` | 0 new, 0 changed, 0 removed |
Not run in this phase: the browser journey (unchanged code and it needs about ten minutes; it is the regression net for implementation), the landing page build (it would write build output into the founder's separate repository), any hosted workflow.

## 11. Risks, open questions and validation criteria
| # | Risk / question | Mitigation or decision |
|---|---|---|
| 1 | Next 16.4.0 / React 19.3.0 differ from common knowledge | Read the bundled docs before coding; pin versions at the root |
| 2 | Repository TypeScript settings (`.ts` extensions, `erasableSyntaxOnly`) under Next/Turbopack | Spike first; fallback to alias imports |
| 3 | Bridge child process inside Next route handlers (lifecycle, HMR, single instance) | Node runtime, `globalThis` singleton, `next start` for tests; document dev-mode caveat |
| 4 | Local-only guarantee (bind 127.0.0.1, Host/Origin checks, headers) must survive | Guards as tested pure functions; header test; journey |
| 5 | CSP vs Next inline scripts | Nonce-based CSP via `proxy.ts`; no silent weakening |
| 6 | Landing brand assets inside an Apache-2.0 repository | Keep an explicit carve-out file for name, logo and brand assets (the README and landing README already exclude them); founder confirms |
| 7 | Landing `NOTICE` says "Copyright 2026 Tobin Protocol contributors" vs root "tobin-protocol" | Founder decision which notice applies to `apps/landing`; do not change silently |
| 8 | Local uncommitted landing README change | Founder commits or discards before import |
| 9 | npm inventory grows from 3 to about 290+ packages | Regenerate baseline/evidence; founder re-approves the dependency standard (G12/PC-1 text) |
| 10 | Lockfile merge and exact pins | One root lockfile; `npm ci` in CI must reproduce it |
| 11 | Hosting root directory for the landing page | External setting `apps/landing`; not in the repository |
| 12 | Historical docs link to old paths | Path-map note; link checker |
| 13 | `archive/` accidentally staged | Add `/archive/` to `.gitignore` |
Validation criteria for implementation: Rust baseline identical (96, 87, fmt, clippy exit 0, same Wasm hashes); TypeScript 88 passed + 1 allow-listed skip across the SDK and Console packages; journey 128/128 at 1200 px and 420 px; link check 0 broken; gate checker unchanged results; `npm ci` reproducible; landing build and lint pass from `apps/landing`; CI green on a pull request; no contract, interface or digest change, no excluded material added.

## 12. Blockers
None prevents starting implementation. Founder inputs needed early: (a) how to import the landing repository (subtree with network access, or copy), after settling its local README change; (b) which notice applies to `apps/landing`; (c) approval to regenerate the npm inventory and update the dependency standard; (d) confirmation that a single `packages/mvp1-sdk` package is acceptable.
