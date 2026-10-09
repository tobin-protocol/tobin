# Tobin landing page

Landing page for Tobin Clearing Protocol. Next.js (App Router), TypeScript, Tailwind CSS v4, and `motion` for React.

```bash
npm run dev     # local development
npm run lint
npm run build   # type-checks and prerenders the page statically
```

## Before you deploy

- **Links:** set `github` and `docs` in [src/lib/site.ts](src/lib/site.ts). Both are `null` because no URLs exist yet. Until they are set, the nav and footer omit those links and the final call to action shows clearly marked "Link pending" placeholders.
- **Site URL:** set `NEXT_PUBLIC_SITE_URL` (for example `https://tobin.example`) so Open Graph and Twitter images resolve to absolute URLs.

## Structure

- `src/lib/clearing.ts`: the netting arithmetic. The example figures on the page are computed from it, not hard-coded.
- `src/components/ClearingVisual.tsx`: the hero visualization (the only substantial client component besides the nav and reveal wrappers).
- `src/app/globals.css`: design tokens, type scale, buttons, and the translucent nav material, including reduced-motion, reduced-transparency, and high-contrast variants.
