# Component inventory (verified)

Phase 2A. Every "actual file location" below was checked to exist in the repository on 2026-11-03 (`main` at `5fa621e`). A component without a location **does not exist**. Terms follow [README.md](README.md); the visual language is in [../../design-system/README.md](../../design-system/README.md); screens in [console-implementation-spec.md](console-implementation-spec.md); work order in [implementation-backlog.md](implementation-backlog.md).

Priority: **P0** needed for the minimum coherent MVP (see the backlog), **P1** needed for the full MVP-1, **P2** later or optional.

## 1. Existing and reusable

| Component | Actual file | Status | Purpose | Recommendation | Dependencies | Priority |
|---|---|---|---|---|---|---|
| `BrandMark`, `BrandLockup`, `T_PATH` | `apps/landing/src/components/BrandMark.tsx` | Exists | The T mark and lockup | Reuse in the shell and sign-in | none | P0 |
| `Logo` | `apps/landing/src/components/Logo.tsx` | Exists (older brand-pack logo; the landing's own docs describe it as unused) | Logo with props | Prefer `BrandMark`/`BrandLockup`; verify before reuse | `logo-art.ts` | P2 |
| `Icon` | `apps/landing/src/components/ui.tsx` | Exists | Hugeicons wrapper | Reuse as is | `@hugeicons/react`, `@hugeicons/core-free-icons` | P0 |
| `Container` | `apps/landing/src/components/ui.tsx` | Exists | Content column (max 94.5rem, 22 and 44px gutters) | Reuse; console may need a narrower or full-width variant | Tailwind | P0 |
| `Eyebrow`, `Arrow` | `apps/landing/src/components/ui.tsx` | Exists | Small plain text above headings; arrow icon | Reuse | none | P1 |
| `PendingLink` | `apps/landing/src/components/ui.tsx` | Exists | Non-interactive "link pending" placeholder | Reuse the pattern for not-yet-available destinations | none | P2 |
| `ChartContainer`, `ChartTooltipContent` | `apps/landing/src/components/chart.tsx` | Exists | Recharts wrapper with a config of labels and colours | Reuse for gross versus net and position charts | `recharts`, chart colour tokens | P1 |
| CSS classes `.btn`, `.btn-dark`, `.btn-light`, `.t-*`, `.surface-*`, `.tile`, `.rule-top`, `.link` | `apps/landing/src/app/globals.css` | Exists (CSS, not React) | Buttons, type, surfaces | Reuse by consuming the same stylesheet (DS1) | Tailwind v4 | P0 |

## 2. Existing but requires adaptation

| Component | Actual file | Status | Purpose | Recommendation | Dependencies | Priority |
|---|---|---|---|---|---|---|
| `ButtonLink` | `apps/landing/src/components/ui.tsx` | Exists; **anchor only** | A link styled as a button | The console needs a real `<button>` (submit, disabled, loading); extract a shared Button that `ButtonLink` also uses | `.btn` classes | P0 |
| `Section` | `apps/landing/src/components/ui.tsx` | Exists | Landing section with 80 to 120px padding | Not suitable as is; use only the surface tones | `.surface-*` | P2 |
| `StatusBar` | `apps/landing/src/components/StatusBar.tsx` | Exists | The experimental/testnet banner of the landing page | Adapt as the console's persistent Testnet notice | landing fold state (`lib/fold.ts`, `lib/stage.ts`): must be decoupled | P0 |
| `Nav` | `apps/landing/src/components/Nav.tsx` | Exists | Marketing navigation pill with a mobile menu (`role="dialog"`) | **Not** an application shell. Reuse only its mobile-menu accessibility pattern | fold state | P2 |
| `Odometer` | `apps/landing/src/components/Odometer.tsx` | Exists | Animated numerals | Adapt for static tabular figures; animation optional | `motion` | P2 |
| `MotionProvider`, `Reveal` family, `SmoothScroll` | `MotionProvider.tsx`, `Reveal.tsx`, `SmoothScroll.tsx` | Exist | Motion layer | Apply sparingly; scroll hijacking (`SmoothScroll`) is not appropriate for a working application | `motion`, `lenis` | P2 |
| `ConsoleApp` | `apps/web-console/components/console-app.tsx` | Exists | Client component that mounts the sandbox Console: it writes the controller's HTML strings into `#app` and wires form and click events | Replace; keep as a reference during migration | `ConsoleController`, `renderApp` | P1 |
| `ConsoleController` (with `parseU32`, `sessionIdFromLabel`, `obligationIdFrom`) | `apps/web-console/lib/console/controller.ts` | Exists (class, framework-free, tested) | Console behaviour and state (pending actions, grants, draft proposal, replacement notice, log) | **Keep the logic**; adapt to a real transport, real accounts and persistence. Remove demo personas | `tobin-mvp1-sdk` | P0 |
| `renderApp`, `statusLine`, `formatPlan`, `parsePlan`, `esc` | `apps/web-console/lib/console/view.ts` | Exist (functions returning HTML strings, not components) | Sandbox rendering and the honest-wording rules | Port the **wording rules and tests** to React components; the HTML string rendering is not reusable | `console-view.test.ts` | P0 |
| `HttpTransport` | `apps/web-console/lib/console/http-transport.ts` | Exists | Sends prepared calls to the local sandbox over `/api/rpc` | Not a network transport; replace with the real transport (blocked, see below) | local bridge | P0 |

## 3. Missing and required

None of these exists. (There is no `Button.tsx`, `Input.tsx`, `Card.tsx`, `Table.tsx`, `Modal.tsx` or `Avatar.tsx` anywhere in the repository.)

| Component | Actual file | Status | Purpose | Recommendation | Dependencies | Priority |
|---|---|---|---|---|---|---|
| `Button` (variants, disabled, loading) | none | Missing | Actions | Build on `.btn` tokens | DS1 | P0 |
| `FormField`, `TextField`, `AmountField`, `Select` | none | Missing | Forms with label, help, error | Build; `AmountField` parses integer base units and shows token decimals | state colours (DS2) | P0 |
| `AppShell`, `PrimaryNav`, `PageHeader` | none | Missing | Shell and page structure | Build per the shell specification | DS1, DS4 | P0 |
| `OrganizationSwitcher` / organization header | none | Missing | Active organization and its wallet | Build | identity and organization records (MISSING) | P1 |
| `NetworkBadge`, `Banner`, `Toast` | none | Missing | Testnet, wrong network, signatures requested, transient messages | Build | DS2 | P0 |
| `ContractStateBadge` | none | Missing | Open, Committed, Approved, Settled | Build; visually distinct from application statuses | DS2 | P0 |
| `ApplicationStatusBadge` | none | Missing | Invitation and transaction statuses | Build; labelled as application-side | DS2 | P0 |
| `DataTable` with stacked mobile mode | none | Missing | Sessions, obligations, participants, nets, proposal, approvals, activity | Build | DS4 | P0 |
| `Tabs` | none (landing switchers are file-local) | Missing | Session tabs | Build | none | P0 |
| `Stepper` / wizard container | none | Missing | New session, onboarding | Build | none | P0 |
| `SessionProgress` | none | Missing | Indicator through Open, Committed, Approved, Settled plus the next action. This replaces the research draft's `NettingTimeline` | Build; fed by `SessionStatus` | SDK | P0 |
| `AddressDisplay`, `CopyButton`, `AmountDisplay` | none | Missing | Shortened addresses with full on hover or copy; amounts with decimals | Build (existing helpers `short`/`sig` in `view.ts` show the intent) | token decimals | P0 |
| `EmptyState`, `Skeleton`, `Spinner`, `ErrorNotice` | none | Missing | Loading, empty and error states, with typed error names | Build | `sdk/errors.ts` | P0 |
| `Dialog` / modal | none | Missing | Confirmations and the signing review | Build (the `Nav` mobile menu shows the accessible pattern) | none | P0 |
| `ParticipantList` | none | Missing | Participants, creator marked, invitation statuses | Build | registry (MISSING) | P0 |
| `ObligationForm`, `ObligationTable` | none | Missing | Add and list obligations | Build; validation mirrors the contract (`UnknownParty`, `SameParty`, `BadAmount`, capacity, `DuplicateObligation`) | SDK, engine | P0 |
| `NetPositionsView`, `ProposalView`, `ApprovalChecklist` | none | Missing | Netting tab content | Build | SDK `SessionStatus`, engine | P0 |
| `TransactionTracker` | none | Missing | prepared, awaiting signatures, submitted, confirmed, rejected | Build | transport (blocked) | P0 |
| `ActivityList` | none | Missing | History | Build | application activity store (MISSING) | P1 |
| `InstitutionCard`/directory list, `InstitutionProfileForm` | none | Missing | Directory and profile | Build | registry (MISSING) | P1 |
| `Breadcrumbs`, `IconButton`, `Avatar` | none | Missing | see section 4 | | | P2 |

## 4. Proposed in the research but not currently justified

| Item (from the research draft) | Finding |
|---|---|
| `NettingTimeline` as a separate chart-library component | Netting is a stage of a session; a `SessionProgress` indicator is enough. No d3 or Chart.js is needed |
| `ParticipantCard` | Fold into `ParticipantList`; a card per participant adds little for at most four parties |
| `Footer` (rated Large in the draft) | A marketing `Footer` exists in the landing; an application footer is not needed for MVP-1 |
| `Avatar` with logos | There is no logo upload or storage; initials from the organization name suffice if needed |
| `Breadcrumbs` | The hierarchy is shallow (Sessions, session, tab); tabs and a page header are enough |
| `FormGrid`, `IconButton` as separate components | A layout utility class and a `Button` variant cover them |
| react-i18next / React-Intl | No i18n exists; not justified until a second language is a requirement (DECISION REQUIRED) |
| Jest, Cypress, Chromatic, Percy | The repository tests with `node --test`; see the backlog for the test approach actually in use |

## 5. Blocked by unresolved technical decisions

| Component | Blocked by | Note |
|---|---|---|
| `WalletControl`, `SigningReview` (wallet signing dialog) | Wallet and signing spike (A1, D7) | The review pattern can be built against a stub; the real flow depends on which wallets sign authorization entries |
| `SignatureRequestPanel` (collect a second party's signature) | A1 and the signature-collection service decision (D8) | Needed for admissions and settlement |
| `SessionRegistryList` (my sessions) | Registry versus indexer (D6) | The Sessions list cannot exist without one |
| Real network transport (`NetworkTransport`) | Dependency decision (`@stellar/stellar-sdk` or a server-side signer), A1 | The SDK has only `NetworkTransportNotAuthorized` |
| Discover browse and search | D2 and an indexer | FUTURE |
| Sign-in components | D3 (wallet-based versus email) | |
| Token selector | Which tokens are offered | Governed Testnet token is the intended MVP token |

## 6. Research claims checked against the repository

| Research draft claim | Result |
|---|---|
| `Button.tsx`, `Input.tsx`, `Table.tsx`, `Modal.tsx` "IMPLEMENTED/PARTIAL" under `console/src/components/` | **False.** No such files or directory; the console is `apps/web-console` and has no component library |
| `NavBar/Sidebar` "PARTIAL" in `console/src/layouts/` | **False.** No layouts directory; the console has one header in `app/layout.tsx` |
| Landing "likely" has `.btn-primary` and `.btn-secondary` | **False.** The classes are `.btn`, `.btn-dark`, `.btn-light`, `.btn-glass` |
| `packages/sdk`, `contracts/obligations.ts`, `contracts/clearing.ts` | **False.** The SDK is `packages/mvp1-sdk`; contracts are Rust (`contracts/clearing/src/lib.rs`, `contracts/token/src/lib.rs`) |
| React Router routes, `src/pages` | **False.** Next.js App Router with a single page (`apps/web-console/app/page.tsx`) and two API routes |
