# Tobin landing page

Landing page for Tobin Clearing Protocol. Next.js (App Router), TypeScript, Tailwind CSS v4, `motion` for React, and `lenis` for smooth scroll.

```bash
npm run dev     # local development
npm run lint
npm run build   # type-checks and prerenders the page statically
```

## Before you deploy

- **Links:** set `github` and `docs` in [src/lib/site.ts](src/lib/site.ts). Both are `null` because no URLs exist yet. Until they are set, the nav and footer omit those links and the final call to action shows clearly marked "Link pending" placeholders.
- **Site URL:** set `NEXT_PUBLIC_SITE_URL` (for example `https://tobin.example`) so Open Graph and Twitter images resolve to absolute URLs.
- **Display font license:** the headline face is Aalto Display, supplied with a **"Personal Use Only"** license. A public site is not personal use. Get a web/commercial license (or swap the face) before deploying. The font file is **not in this repository** (`public/fonts` is gitignored, so the licensed file is never redistributed). Put your licensed copy at `public/fonts/aalto-display-personal-use.otf`, or change the `@font-face` to point at yours. Without it, the `--font-display` stack falls back to Arial Narrow / Roboto Condensed and the layout still holds. To swap the face, change the `@font-face` and `--font-display` in [src/app/globals.css](src/app/globals.css); nothing else references the font by name.

## Design tokens

All in [src/app/globals.css](src/app/globals.css). The palette was sampled from the reference designs in `/designs` (Hisa, Stripe, Onramper); the Hisa colours lead. Surfaces are `paper` (default), `navy` (dark sections), `accent` (violet `#6935f1`), and `signal` (gold `#d5a857`, used with ink text only). `ink` is text and the nav pills. `sky` is the third institution colour. `accent-ink` is violet for text on light, and `accent-bright` is lavender for text and graphics on dark surfaces. The page has no glows, gradients or shadows, and cards are square. Surfaces announce themselves with `data-surface="dark|accent|signal"`, which drives body-copy colour, eyebrow colour and focus-ring colour.

## Motion and layout architecture

- **Pinned scenes** are a tall outer wrapper with a `sticky` inner. The next block rides up over it with a negative margin (a "curtain"). This only happens where there is room: width >= 1024px, height >= 700px, and no `prefers-reduced-motion`. The same query lives in two places and must stay in sync: `PIN_QUERY` in [src/lib/stage.ts](src/lib/stage.ts) and the `@media` blocks marked "Keep in sync" in `globals.css`.
- **Static fallback.** Outside that query (narrow, short, or reduced motion) the page is a plain flow layout: no sticky, no overlaps, no Lenis. `HowItWorks` renders both a static list and the pinned scene; CSS (`.pin-hide` / `.pin-only`) shows one so the other leaves the accessibility tree.
- **Scenes:** hero (`HeroStage`), How It Works (`HowScene`), Stellar curtain with wave (`Curtain`).
- **Nav tone.** The fixed nav samples which `[data-nav-tone]` element is under it and switches between light, dark and signal (open mobile sheet), so text and CTA are never ink-on-ink.
- **Pace.** Motion values follow the design spec except where this brand is calmer: Lenis 1.6s / wheel x0.8 (spec 2.5s / x0.6), hero pull-back scale .9 / rotate 1deg / opacity .2 (spec .8 / 2deg / .1), scene blur 3px (spec 4px).

## Structure

- `src/lib/clearing.ts`: the netting arithmetic. The example figures on the page are computed from it, not hard-coded.
- `src/components/ClearingVisual.tsx`: the clearing visualization. Uncontrolled in the hero (autoplays once, with stage buttons) and controlled by scroll inside `HowScene`.
