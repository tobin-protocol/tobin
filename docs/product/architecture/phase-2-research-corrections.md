# Corrections to the Phase 2 research draft

Phase 2A. The research draft "Phase 2 Research: Design System Audit & Console Redesign" is kept unmodified in its original location (outside the repository, in the reviewer's local downloads folder as `deep-research-report.md`, 363 lines, 29,485 bytes at the time of review). It is treated as an input. This document records every material claim that does not match the repository, and what the verified fact is. It does not replace the draft; the corrected specifications are [../../design-system/README.md](../../design-system/README.md), [console-implementation-spec.md](console-implementation-spec.md), [component-inventory.md](component-inventory.md), [integration-readiness.md](integration-readiness.md) and [implementation-backlog.md](implementation-backlog.md).

The draft states that its repository audit was by inference ("key files may include", "likely"). Those inferences were checked, and most were wrong.

## 1. Design system

| Draft claim | Verified fact | Evidence |
|---|---|---|
| The landing page is dark with a lime accent: background `#090B09`, surface `#151915`, accent `#A3FF12`, muted `#A5AAA3` | **False.** The landing page is a **light, strictly greyscale** system: `paper #ffffff`, `ink #000000`, `ink-soft #1d1d1d`, greys `#313131` to `#f0f0f0`, and one green accent `--color-net #00b27a` (`--color-net-ink #007a52`). The lime values appear nowhere in the source | `apps/landing/src/app/globals.css` (`@theme`); a search of `apps/landing/src` for `A3FF12`, `090B09`, `151915` found nothing |
| The palette came from "Phase 1 docs" | Phase 1 documents contain no palette values; the Phase 1 package records the landing page only as a reference | `docs/product/architecture/product-definition.md` |
| Token names `--color-bg`, `--color-surface`, `--color-text-primary`, `--color-accent`, `--color-success`, `--color-error` | None exist. Actual names are `--color-ink`, `--color-ink-soft`, `--color-paper`, `--color-grey-*`, `--color-net`, `--color-net-ink`, `--color-chart-*` and others | `globals.css` |
| Spacing tokens `--spacing-xxs` to `--spacing-xl` (4, 8, 16, 24, 32, 48) | **No custom spacing tokens.** The landing uses Tailwind's default `--spacing: 0.25rem` and fixed container gutters (22px and 44px) | `node_modules/tailwindcss/theme.css` line 325; `apps/landing/src/components/ui.tsx` |
| Typography tokens `--font-base 16px`, `--font-h1 32px` and so on | **No such tokens.** Type is defined as classes `.t-h1` to `.t-h5`, `.t-lead`, `.t-body`, `.t-ui`, `.t-label`, `.t-mono`, `.t-odo` with marketing-scale sizes (headings up to 56px) | `globals.css` `@layer components` |
| Fonts "Inter or SF Mono" | **False.** Urbanist, Outfit, Instrument Sans and Space Grotesk, loaded with `next/font/google`; system monospace for `--font-mono` | `apps/landing/src/app/layout.tsx` |
| Breakpoints `--bp-sm 640`, `--bp-md 768`, `--bp-lg 1024`, `--bp-xl 1280` as tokens | The landing defines **no breakpoint tokens**. It uses Tailwind defaults (640, 768, 1024, 1280, 1536), custom steps at 600 and 900px for type, and landing-specific hero and pinned-scene media queries | `theme.css`; `globals.css`; `apps/landing/src/lib/stage.ts` |
| Buttons `.btn-primary`, `.btn-secondary` with accent background; radius 4px; shadow | **False.** `.btn`, `.btn-dark`, `.btn-light`, `.btn-glass`; radius 8px; no button shadow (the nav pill is the only shadowed element) | `globals.css` |
| Cards with radius 6px and `rgba(255,255,255,0.05)` borders | **False.** Radii are 4, 8, 12, 16, 24 and 32px (`--radius-*`); surfaces are flat white or grey | `globals.css` |
| Icon sets Feather or Material | **False.** Hugeicons | `apps/landing/src/components/ui.tsx`, `package.json` |
| "The design is dark by default"; a theme switch via CSS variables | **False.** `color-scheme: light`; dark is a section surface (`.surface-dark`), not a theme; there are no dark-theme tokens | `globals.css` (`html`, `.surface-dark`) |
| Contrast "lime on dark has about 8.6:1" | Not applicable: no lime in the system | n/a |
| "No heavy framework is present"; tokens as CSS variables with styled-components or CSS Modules | The landing uses **Tailwind CSS v4** with `@theme` tokens and Next.js 16; no styled-components or CSS Modules | `apps/landing/package.json` |
| Tokens to be documented in `docs/design-system/tokens.md` | The verified reference is `docs/design-system/README.md`, a single document of verified values | this package |

## 2. Repository structure and components

| Draft claim | Verified fact | Evidence |
|---|---|---|
| Console in `apps/console/` or `packages/console-ui`, with `src/routes`, `src/layouts`, `src/components`, `src/pages` | **None exist.** The console is `apps/web-console` (Next.js 16 App Router): one page (`app/page.tsx`), `app/layout.tsx`, one client component (`components/console-app.tsx`), two API routes (`app/api/bootstrap`, `app/api/rpc`), and framework-free logic in `lib/console/` | `apps/web-console/` |
| SDK at `packages/sdk/` with `transport.ts`, `clearing.ts` | The SDK is `packages/mvp1-sdk` (`src/sdk/client.ts`, `abi.ts`, `prepare.ts`, `transport.ts`, `errors.ts`, `intent.ts`; `src/engine/`; `src/local/bridge.ts`) | `packages/mvp1-sdk/` |
| Contracts `obligations.ts`, `clearing.ts` | The contracts are Rust: `contracts/clearing/src/lib.rs`, `contracts/token/src/lib.rs` | `contracts/` |
| Tests in `__tests__`, `packages/console-tests/` | Tests use Node's built-in runner: `apps/web-console/test/*.test.ts`, `packages/mvp1-sdk/test/*.test.ts`, a Chrome DevTools Protocol browser journey at `apps/web-console/test/browser/journey.mjs`, and Rust tests in `contracts/` | `package.json` scripts |
| Button, Input, Table, Modal "IMPLEMENTED/PARTIAL"; Card, Avatar "MISSING" | **None of these components exist anywhere.** Only the landing primitives in `ui.tsx` exist (`Container`, `Section`, `ButtonLink`, `PendingLink`, `Eyebrow`, `Arrow`, `Icon`) | [component-inventory.md](component-inventory.md) |
| Existing NavBar "PARTIAL" | The landing has a marketing nav pill (`Nav.tsx`); the console has only a heading in `layout.tsx` | files named |
| `NettingTimeline` (Large) as a chart-library visual | Not justified: netting is a stage of a session; a session progress indicator suffices | Phase 1 decision D1 |
| Footer rated Large | Not needed for the application | |
| Storybook, Jest, Cypress, Chromatic, Percy, axe in CI, react-i18next | **None is in the repository.** Tests use `node --test`; an accessibility scanner and i18n would be new decisions | root and app `package.json` files |
| Forms, inputs, wizard "not in the landing page" | Correct, and the gap is larger than stated: there are no form-control styles, table styles, dialogs (apart from the marketing mobile menu), tabs components, toasts or state colours in the design system | design-system README section 9 |

## 3. Protocol and integration

| Draft claim | Verified fact | Evidence |
|---|---|---|
| The minting flow: `signTransaction` returns "signed XDR(s) (Founder, Security)" from the wallet in one call | Misleading. A single wallet call signs for one account. Multi-account authorization requires collecting separate signatures; in this project each signer's wallet signed the same envelope in turn | engagement record; `docs/governance/governed-token-evidence.md` |
| Founder alone needed for TTL extension "so only one signature" | Correct in outcome (a low-threshold operation), but the draft did not note that adding a second, unneeded signature **is rejected** (`TxBadAuthExtra`) | `docs/governance/governed-token-evidence.md` |
| The SDK "provides `submitTransaction(XDR)` and `signTransaction(XDR, network)`" | **False.** The SDK has no submission or signing; `NetworkTransportNotAuthorized` refuses every call | `packages/mvp1-sdk/src/sdk/transport.ts` |
| Submit through Horizon `sendTransaction` | Soroban transactions are submitted to the Soroban RPC (`sendTransaction`, `getTransaction`); Horizon is a separate classic API | verified against the RPC on 2026-11-03 |
| "No new contracts or backend changes are needed; the frontend will call the existing SDK" | **False.** No backend, identity, organization storage, registry, indexer, network transport or wallet integration exists; these are net-new work | [integration-readiness.md](integration-readiness.md) |
| A spike should check that Freighter can sign "the exact authorization entry for another account" | Correct and essential; it is promoted to the blocking ticket SPK-1. The API `signAuthEntry` exists in `@stellar/freighter-api` 6.0.1; whether it fits this flow is UNVERIFIED | integration-readiness.md section 9 |
| Wallet options "Freighter, Albedo or WalletConnect" | Albedo and Ledger modules of the wallet kit state that they do **not** support `signAuthEntry`; Albedo is therefore unsuitable for the settlement and join flows | `@creit.tech/stellar-wallets-kit` 2.8.0 module code |
| Obligation Wizard with "assets, participants, dates" | The contract has **one token per session**, no per-obligation asset, no dates and no description; the wizard must create a session first and then add obligations (id, debtor, creditor, amount) | `contracts/clearing/src/lib.rs` |
| "Participate button opens the sign modal" and "ParticipantCard with institution logo" | Participation is a **two-signature admission** (joiner and creator); logos and institution data are application-side, not on-chain | capability mapping |
| Backlog of 20 component tickets starting from design tokens and buttons | Reorganised around complete journeys with a dependency order and the minimum coherent product; the critical path is the wallet spike, the network transport and the backend, none of which the draft lists | [implementation-backlog.md](implementation-backlog.md) |

## 4. Items in the draft that stand

| Item | Note |
|---|---|
| Accessibility principles (landmarks, labels, focus, contrast, keyboard) | Sound; adopted in the specification. The landing's existing focus ring and 44px targets are the baseline |
| Mobile-first layout, tables that degrade gracefully | Adopted |
| Externalizing strings for translation | Adopted as a DECISION REQUIRED, not a build item |
| A QA strategy with unit, accessibility, end-to-end and responsive checks | Adopted with the repository's actual tools (`node --test`, the CDP browser harness) and a decision on adding an accessibility scanner |

## 5. How the draft was reviewed

Each claim above was checked by reading the named files, searching the repository for the claimed values and paths, reading the contents of the named npm packages and querying the Testnet RPC read-only. Where the repository cannot answer a question (for example RPC rate limits, wallet behaviour for authorization entries), the specification says UNKNOWN or UNVERIFIED rather than guessing.
