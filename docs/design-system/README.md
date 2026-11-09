# Tobin design-system reference (verified)

Status: **verified reference of what exists**, written 2026-11-03 from the source files named below (repository `main` at `5fa621e`). It records the visual language already implemented on the landing page so the console can extend it. It does **not** define a new system, change any code, or replace the landing page. Values marked **VERIFIED** were read from source. Items marked **RECOMMENDATION** are proposals and are not existing tokens. Items marked **UNKNOWN** or **GAP** are called out explicitly.

This document corrects the earlier Phase 2 research draft, which described a dark, lime-accented palette (`#090B09`, `#151915`, `#A3FF12`) and a React component library at `console/src/components/`. **None of that exists in the repository** (see [../product/architecture/phase-2-research-corrections.md](../product/architecture/phase-2-research-corrections.md)).

## 1. Where the design system lives

| Item | Location (VERIFIED) |
|---|---|
| All tokens and component classes | `apps/landing/src/app/globals.css` (Tailwind CSS v4 `@theme` blocks, `@layer components`) |
| Font loading | `apps/landing/src/app/layout.tsx` (`next/font/google`) |
| Reusable primitives | `apps/landing/src/components/ui.tsx` |
| Brand colours and logo assets | `apps/landing/brand-pack/` (colors.css, svg, png) and `apps/landing/src/components/BrandMark.tsx`, `Logo.tsx` |
| Prose description | `apps/landing/README.md` ("Typography", "Icons", "Design tokens", "Motion and layout architecture") |
| Tooling | Tailwind CSS 4.3.3 (`tailwindcss`, `@tailwindcss/turbopack`), Next.js 16.4.3, React 19.3.0, `motion`, `lenis`, `recharts`, `@hugeicons/react` |

**The system exists only inside `apps/landing`.** The console (`apps/web-console`) does not use Tailwind, these tokens or these fonts. There is no shared package, Storybook or token file outside `globals.css`. **GAP / DECISION REQUIRED:** how the console consumes the tokens (see section 9).

## 2. Character of the system

- **Light theme, strictly greyscale surface** (`html { color-scheme: light }`). Colour appears only in data visualisation, the netting arc, the manifesto phrases and the single "net / complete" accent.
- **Dark is a surface, not a theme.** `.surface-dark` (black ground) is used for sections such as the hero and the trust section; there is no dark-mode token set and no `prefers-color-scheme` handling on the landing page.
- Flat surfaces; the floating navigation pill is the **only shadowed element**.
- Large, tightly tracked headlines (Urbanist, Outfit), body in Instrument Sans, small labels in Space Grotesk.

## 3. Colour tokens (VERIFIED, `globals.css`)

### Greyscale and surfaces

| Token | Value | Use (from the file's own comments) |
|---|---|---|
| `--color-ink` | `#000000` | Dark sections, tiles |
| `--color-ink-soft` | `#1d1d1d` | Dark buttons, selection, focus ring on light |
| `--color-grey-850` | `#313131` | Body text on light cards; dark button hover |
| `--color-grey-600` | `#626262` | Secondary text (6.0:1 on white per the file) |
| `--color-grey-500` | `#818181` | Large text only, 24px and larger (3.9:1) |
| `--color-grey-400` | `#b1b1b1` | Text on dark; never body text on light |
| `--color-grey-200` | `#dedede` | Dividers, light button hover |
| `--color-grey-100` | `#f0f0f0` | Light buttons, shells, inputs ground |
| `--color-paper` | `#ffffff` | Page and cards |
| `--color-hairline-dark` | `rgb(255 255 255 / 0.12)` | Hairlines on dark |

Surface classes (set `--soft` for secondary text and `--rule` for dividers): `.surface-light` (paper; soft `grey-600`; rule `grey-200`), `.surface-grey` (grey-100; same soft and rule), `.surface-dark` (ink; soft `grey-400`; rule `hairline-dark`).

### Accent and data colours

| Token | Value | Use |
|---|---|---|
| `--color-net` | `#00b27a` | The one accent for a net or finished state |
| `--color-net-ink` | `#007a52` | Text and icon version for light grounds (5.4:1 on white) |
| `--color-chart-1` to `--color-chart-4` | `#e0ecff`, `#b9d2fa`, `#8cb1ed`, `#5a86cc` | Data visualisation only |
| `--color-chart-ink` | `#1c3966` | Chart ink |
| `--color-chart-green`, `--color-chart-green-soft` | `var(--color-net)`, `#c9e8d8` | Net-positions chart |
| `--color-purple`, `--color-purple-ink` | `#7e2ec9`, `#450e78` | Manifesto phrases, arc |
| `--color-green-ink` | `#004830` | Manifesto phrases |
| `--color-arc-orange`, `--color-arc-lilac`, `--color-arc-peach` | `#ee7b39`, `#d4a5ff`, `#ffe6d8` | Netting arc |
| `--color-magenta`, `--color-violet`, `--color-blue`, `--color-cyan` | `#e45bd0`, `#8a5cf0`, `#3f7bff`, `#3fd6e8` | The symbol only; never backgrounds, buttons or text (declared `static`, deliberately unused elsewhere) |

The file records contrast ratios for the greyscale pairs (for example ink on paper 21:1, grey-600 on white 6.0:1). Those figures are the author's; **they were not independently re-measured here.**

### Not present (GAP)

There are **no error, warning, info or success state colours** in the landing system. `--color-net` / `--color-net-ink` is the only positive accent. Console states such as rejected, failed, warning and pending therefore have **no defined colour tokens**. The existing console CSS defines its own (`--warn`, `--ok`, `--bad`, `--accent`) in `apps/web-console/app/globals.css`, which are not part of the landing system.

## 4. Typography (VERIFIED)

Fonts are loaded in `apps/landing/src/app/layout.tsx` with `next/font/google`. All are variable fonts, so every weight is available.

| Face | CSS variable (font family token) | Used for |
|---|---|---|
| Urbanist | `--font-heading` (from `--font-urbanist`) | Headlines `h1` to `h6`, `.t-h2` to `.t-h5` (weight 500) |
| Outfit | `--font-display` (from `--font-outfit`) | Hero headline, odometer numerals |
| Instrument Sans | `--font-sans`, alias `--font-serif` (from `--font-instrument-sans`) | Body, buttons, UI |
| Space Grotesk | `--font-label` (from `--font-space-grotesk`) | Labels, chart axes, tags, repository paths |
| System monospace | `--font-mono` = `ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace` | Not loaded as a web font |

Type classes in `@layer components`:

| Class | Size | Notes |
|---|---|---|
| `.t-h1` | `clamp(2.25rem, 4vw, 4rem)` | Display face, weight 500, line-height 1.05, tracking -0.02em |
| `.t-h2` | 2rem, 2.75rem at 600px, 3.5rem at 900px | Heading face |
| `.t-h3` | 1.75rem, 2.25rem, 3rem | same steps |
| `.t-h4` | 1.5rem, 1.75rem, 2.25rem | tracking -0.015em |
| `.t-h5` | 1.25rem, 1.5rem, 1.75rem | tracking -0.015em |
| `.t-lead` | 1rem, 1.125rem at 600px, 1.25rem at 900px | Instrument Sans 400, line-height 1.32, colour `var(--soft)` |
| `.t-body` | 1rem | line-height 1.4 |
| `.t-ui` | 0.875rem | weight 500, line-height 1.3 |
| `.t-label` | 0.75rem | weight 500, line-height 1.5 |
| `.t-mono` | 0.75rem | label face, wraps anywhere |
| `.t-odo` | `clamp(6rem, 10.4vw, 9.375rem)` | Display face, odometer |

Base body: 1rem, line-height 1.5. **Note:** these are marketing-scale headings (up to 56px at desktop). Console-density type sizes are not defined (GAP, see section 8).

## 5. Spacing, radii, shadows, layout, motion

| Aspect | VERIFIED value |
|---|---|
| **Spacing scale** | **None defined by Tobin.** The landing uses Tailwind's default `--spacing: 0.25rem` (4px base) through utility classes, plus fixed gutters below. (The earlier research invented named tokens `--spacing-xs` and so on; they do not exist) |
| Content column | `Container` in `ui.tsx`: `max-w-[94.5rem]` (1512px), horizontal padding 22px on phones and 44px from `md` |
| Section padding | `Section` in `ui.tsx`: 80 to 120px vertical (per its comment) |
| Radii | `--radius-chip` 4px, `--radius-btn` 8px, `--radius-nav` 12px, `--radius-card-s` 16px, `--radius-card` 24px, `--radius-shell` 32px |
| Shadow | `--shadow-nav` (three-layer, the nav pill only); everything else is flat |
| Easing | `--ease-ui: cubic-bezier(0.4, 0, 0.2, 1)`, `--ease-fold: cubic-bezier(0.65, 0, 0.35, 1)` |
| Focus ring | `:focus-visible { outline: 2px solid var(--color-ink-soft); outline-offset: 3px }`; white on `[data-surface="dark"]` |
| Selection | ink-soft on paper |
| Reduced motion | `.btn` transitions disabled; scroll smoothing and pinned scenes only with `prefers-reduced-motion: no-preference` |
| Motion libraries | `motion` (LazyMotion, loaded by `MotionProvider`), `lenis` (`SmoothScroll`) |
| Touch target | `.btn` min-height 2.75rem (44px) |

## 6. Breakpoints (VERIFIED)

The landing defines **no custom breakpoint tokens**. It uses:

- Tailwind v4 defaults (verified in `node_modules/tailwindcss/theme.css`): `sm` 40rem (640px), `md` 48rem (768px), `lg` 64rem (1024px), `xl` 80rem (1280px), `2xl` 96rem (1536px). Usage count in components: `md:` 62, `lg:` 46, `sm:` 8, `xl:` 6, `2xl:` 0.
- Custom `min-width` steps for type at **600px and 900px**, and a 1200px reference in the README.
- Hero and pinned-scene media queries tied to viewport width and height (for example `min-width: 1024px` with `min-height: 700px`, and the compact query `max-width: 1023px` with `min-height: 600px`), mirrored in `apps/landing/src/lib/stage.ts` (`PIN_QUERY`, `COMPACT_QUERY`, `HERO_PIN_QUERY`, `SHORT_QUERY`). These are specific to the landing page's pinned sections and are **not** general layout breakpoints.

## 7. Component conventions (VERIFIED)

CSS classes in `@layer components`:

| Class | Convention |
|---|---|
| `.btn` | inline-flex, centered, gap 0.5rem, min-height 44px, padding 10px 16px, radius 8px, 1rem, weight 500, 280ms colour transitions |
| `.btn-dark` | ink-soft background, white text; hover grey-850 |
| `.btn-light` | grey-100 background, ink text; hover grey-200 |
| `.btn-glass` | translucent grey on blurred glass, white text (over photography) |
| `.btn-pending-tag` | small uppercase label text for a "link pending" placeholder |
| `.eyebrow` | plain text above a heading, grey-600 (grey-400 on dark) |
| `.badge` | **plain small text, no container** (0.75rem, grey-600) |
| `.value-tag` | small label text, no container |
| `.tile` | 48px ink tile with a 24px line icon, radius 8px |
| `.rule-top` | 1px top rule using `--rule` |
| `.glass` | 40% ink-soft, 30px blur, hairline border |
| `.link` | underlined link with thickening hover |
| Surfaces | `.surface-light`, `.surface-grey`, `.surface-dark` |
| Navigation | `.nav-bar` and `.nav-link` (floating pill, radius 12px, the only shadow) |

Icons: Hugeicons (free stroke-rounded set, MIT) through `Icon` in `ui.tsx` (`HugeiconsIcon`). Chart colours and axes follow the chart tokens.

## 8. Reusable landing components

Exported names verified by search of `apps/landing/src/components/` (31 files):

| Component | File | Reuse for console |
|---|---|---|
| `Container`, `Section`, `ButtonLink`, `PendingLink`, `Eyebrow`, `Arrow`, `Icon` | `ui.tsx` | `Container`, `ButtonLink` (anchor-only), `Icon`, `Eyebrow`, `PendingLink` reusable as is or after adaptation; `Section` is marketing-scale |
| `BrandMark`, `BrandLockup`, `Logo`, `T_PATH` | `BrandMark.tsx`, `Logo.tsx` | Reusable for the shell and sign-in |
| `Nav` | `Nav.tsx` | Marketing pill with mobile menu (`role="dialog"`); **not** an application shell |
| `StatusBar` | `StatusBar.tsx` | Experimental/testnet banner pattern; adaptable |
| `Footer`, `FinalCta`, `Hero`, `HeroMedia`, `Manifesto`, `Problem`, `Trust`, `HowItWorks`, `Stellar`, `StatusLedger`, `ReadTheSource`, `StencilText`, `StencilWordmark`, `DotGlobe`, `NettingArc`, `StackIllustration` | `src/components/` | Landing-specific; not for the console |
| `ChartContainer`, `ChartTooltipContent` | `chart.tsx` | Reusable for netting and position charts (Recharts wrapper) |
| `ShowcaseCharts` (default), `StatCharts`, `StatCards`, `ClearingShowcase`, `BuiltStatus` | `ShowcaseCharts.tsx`, `StatCharts.tsx`, `ClearingShowcase.tsx`, `BuiltStatus.tsx` | Chart ideas for nets versus gross; the data is the illustrative example, not session data |
| `Odometer` | `Odometer.tsx` | Number display; adaptation needed for tabular financial figures |
| `Reveal`, `LineReveal`, `Parallax`, `MaskReveal`, `MotionProvider`, `SmoothScroll` | `Reveal.tsx`, `MotionProvider.tsx`, `SmoothScroll.tsx` | Motion layer; apply sparingly in a working application |

Internal, **not exported**: the tab-style switcher in `ClearingShowcase.tsx` (`TabbedShowcase`) and the segmented controls in `Manifesto.tsx`/`Trust.tsx` are file-local and cannot be imported.

## 9. Genuine gaps for a working application

None of the following exists in the landing system (verified by search; `Nav.tsx` is the only dialog):

| Gap | Note |
|---|---|
| Form controls: text input, number input, select, textarea, checkbox, radio, field label, helper and error text | Only the console's plain CSS styles inputs today |
| Table or data-grid styling, row states, sortable headers, pagination | The landing uses definition lists and cards; the console has an unstyled table |
| Tabs and segmented control as importable components | File-local only |
| Modal or dialog, drawer, popover or menu | Only the marketing mobile menu |
| Toast or banner pattern for states | The console has `.banner` and `.badge` with its own colours |
| State colours: error, warning, info, success, pending | **Not defined**; only `net` / `net-ink` |
| Status badge with a container | Landing `.badge` is plain text |
| Stepper or wizard, progress, timeline | None |
| Console-density type scale and tabular numerals | Landing type is marketing scale |
| Spacing and breakpoint tokens specific to the application | Tailwind defaults only |
| Dark theme tokens | None; dark is a surface only |
| Loading skeleton and spinner | None |
| Documentation or catalogue (Storybook) | None, and none is installed |

## 10. Decisions required

| # | DECISION REQUIRED | Consequence |
|---|---|---|
| DS1 | How the console consumes the tokens: (a) adopt Tailwind v4 in `apps/web-console` and import a shared token stylesheet, (b) extract the `@theme` block into a small shared workspace package consumed by both apps, or (c) duplicate the values | (a) and (b) keep one source of truth; (c) will drift. Both apps are npm workspaces under `apps/*` and `packages/*`, so (b) fits the repository layout. Phase 2 design work must not alter landing visuals |
| DS2 | State colours for the console (error, warning, info, success, pending) | Must be added as new tokens that stay consistent with the greyscale identity and meet contrast on the existing surfaces; they are RECOMMENDATIONS until approved |
| DS3 | Whether the console uses the light theme only (as the landing) or adds a dark theme | The landing has no dark-theme tokens |
| DS4 | Console type and spacing scale (density) | Marketing sizes are too large for tables and forms |
| DS5 | Component documentation tooling (for example Storybook) | None exists; adding it is a dependency decision |

## 11. How to keep this document honest

Update it from `globals.css`, `layout.tsx` and `ui.tsx` whenever they change. Do not add a value here that is not in source unless it is explicitly labelled RECOMMENDATION.
