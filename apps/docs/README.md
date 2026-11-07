# Tobin Docs

The developer documentation site for the Tobin Clearing Protocol repository. Built with [Fumadocs](https://www.fumadocs.dev) (UI, Core and MDX) on Next.js App Router, TypeScript and Tailwind CSS v4. It is an independent npm workspace (`tobin-docs`): it builds and runs without the landing page or the web console.

> Tobin is experimental software on Stellar Testnet. It is not production-ready, and Mainnet and real-value use are not authorised. The site says so on its homepage and in its footer; keep it that way.

## Run it

From the repository root:

```bash
npm ci                                        # CI uses: npm ci --ignore-scripts
npm run dev       --workspace tobin-docs      # http://localhost:3000
npm run typecheck --workspace tobin-docs      # next typegen && tsc --noEmit
npm run validate  --workspace tobin-docs      # links, navigation, frontmatter, images, forbidden strings
npm run build     --workspace tobin-docs      # production build (compiles every MDX page)
npm run start     --workspace tobin-docs      # serve the production build
```

The build downloads the four Google fonts through `next/font/google`, as the landing page does, so it needs network access the first time.

## Layout

| Path | Purpose |
|---|---|
| `content/docs/` | The pages (`.mdx`) and navigation (`meta.json`). **Category A** documentation, maintained here. |
| `app/(home)/` | The homepage at `/`. |
| `app/docs/` | The documentation layout and the catch-all page route. |
| `app/api/search/route.ts` | Self-hosted search (an in-process index built from the content; no external service). |
| `app/global.css` | Design tokens and the Fumadocs colour mapping. |
| `components/` | The brand mark and header title, the footer, and the MDX component map. |
| `lib/source.ts` | The Fumadocs content source. |
| `lib/layout.shared.tsx` | Header navigation and the GitHub link. |
| `lib/site.ts` | External URLs. Only public, real URLs belong here. |
| `scripts/validate-docs.mjs` | Content validation, run by `npm run validate` and by CI. |
| `AGENTS.md` | Instructions for AI coding agents working in this app. |

## Two kinds of documentation

- **Category A, maintained developer docs:** `content/docs/`. Edit freely, in step with the code.
- **Category B, canonical engineering records:** the root `docs/` directory (milestone acceptance and closure documents, audits, security reviews, threat models, Testnet evidence, deployment manifests, the contract reference). **Do not copy, move, rename or rewrite them.** Link to them with a GitHub URL on `main`; the validator checks that the target is a tracked file.

The rules are in the page [Documentation governance](content/docs/resources/documentation-governance.mdx). Authoring conventions are in [Writing documentation](content/docs/resources/writing-docs.mdx).

## Design system

The tokens come from `apps/landing/src/app/globals.css`: the greyscale `ink`, `grey-*` and `paper` scale, the 8px button radius, the hairline borders, the four font faces (Urbanist, Outfit, Instrument Sans, Space Grotesk), and the focus ring. The landing page is light-only, so the dark theme is derived from the same scale rather than inverted. `net` green is used only for success states. The iridescent colours of the symbol are not used. `components/BrandMark.tsx` draws the existing broken-T path unchanged; the Tobin name and logo are not covered by the Apache-2.0 licence (see `apps/landing/NOTICE`), so do not create or redraw a logo here.

## Configuration

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_LANDING_URL` | Optional. Overrides the main-website link. Defaults to the website named in the root README. |

No secrets are needed to build or run the site. Nothing in this app deploys itself.

## Licence

Apache-2.0, like the rest of the repository. See the root [LICENSE](../../LICENSE).
