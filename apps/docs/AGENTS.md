# AGENTS.md: apps/docs

This file adds to the repository's root [`AGENTS.md`](../../AGENTS.md); it does not replace it. Where they differ, the root file wins. Read the root file first: it defines the domain terms, trust boundaries, invariants and restricted actions that the documentation must describe correctly.

## What this app is

The Tobin developer documentation site: Fumadocs on Next.js App Router, TypeScript and Tailwind CSS v4, as the npm workspace `tobin-docs`. The pages are MDX files in `content/docs/`. See [README.md](README.md) for the layout.

Next.js 16 and Fumadocs 16 differ from older versions. When you change app code (not content), check the installed package's own documentation under `node_modules/fumadocs-ui` and `node_modules/next/dist/docs/` rather than relying on memory.

## Two categories of documentation

- **Category A** is this app's `content/docs/`. You may edit it.
- **Category B** is the root `docs/`, `release/`, `ci/` and `contracts/deployments/`: accepted milestone records, audits, security reviews, threat models, Testnet evidence and deployment manifests. **Do not copy, move, rename, reformat or rewrite them.** Link to them with `https://github.com/tobin-protocol/tobin/blob/main/<path>`; the target must be a tracked file.

## Common tasks

### Add a page

1. Create `content/docs/<section>/<slug>.mdx` with `title` and `description` frontmatter.
2. Add the slug to that section's `meta.json`.
3. Run `npm run validate --workspace tobin-docs`, then `npm run build --workspace tobin-docs`.

### Change navigation

Edit the `meta.json` of the section (or the root one for section order). The validator fails on entries that do not resolve and on pages that are not listed.

### Change the look

Tokens are in `app/global.css`, mapped from `apps/landing/src/app/globals.css`. Change a token there rather than adding one-off colours in components. Keep contrast at WCAG AA in both themes. Do not import the landing page's stylesheet, and do not use the iridescent symbol colours. Do not alter the logo path in `components/BrandMark.tsx`.

### Validate

```bash
npm run typecheck --workspace tobin-docs
npm run validate  --workspace tobin-docs
npm run build     --workspace tobin-docs
```

Also run `node scripts/ci/check-links.mjs` from the root if you edited a tracked `.md` file (such as this one or the README), and `node scripts/ci/update-npm-baseline.mjs --check` if you touched dependencies.

## Rules specific to this app

- Every command shown on a page must have been run, or checked against `package.json`, Cargo or CI configuration.
- State limitations. Never describe planned functionality as existing. There is no OpenAPI file and no institutional API reference; do not invent one.
- Never claim production readiness, Mainnet support, an independent audit, wallet compatibility beyond what the records show, or protocol conformance.
- Keep milestone names and statuses identical to the root README.
- No secrets, seed phrases, local paths, full contract ids or invented social or contact links in content. The validator flags several of these; do not rely on it alone.
- Do not add dependencies without need. A new dependency changes `package-lock.json` and requires regenerating `ci/dependency-baseline.csv` with `node scripts/ci/update-npm-baseline.mjs`.
- Do not edit `apps/landing` or `apps/web-console` from here.
- Do not commit, push or deploy unless the owner explicitly asks. Do not add AI attribution or co-author trailers.
