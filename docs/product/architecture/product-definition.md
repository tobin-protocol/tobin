# Product definition

Deliverable A. Terminology and tags are defined in [README.md](README.md). Capability claims are anchored in [protocol-capability-mapping.md](protocol-capability-mapping.md).

## 1. Product vision

Tobin is infrastructure for **financial obligations and netting**: organizations record what they owe each other, agree a deterministic net settlement, and settle only the net amounts atomically. The web application is the professional workspace for doing this: an institutional fintech product that hides blockchain mechanics behind clear obligations, parties, positions and approvals, while never hiding what is irreversible or public.

What exists today is the protocol (Soroban contracts on Stellar Testnet) and a developer-oriented local sandbox Console (PARTIALLY IMPLEMENTED). What does not exist is everything that makes it a product for organizations: identity, organizations, a network connection and wallet signing, discovery and notifications (NOT IMPLEMENTED).

## 2. Objectives

1. Let an organization run a complete clearing session on Testnet end to end through the application: create, invite, join, record obligations, freeze, agree a net settlement, settle.
2. Make the protocol's rules visible and understandable: who must authorize what, what is final, what is public, who must act next.
3. Keep the contract authoritative. The application must never present anything as confirmed that the ledger has not confirmed.
4. Provide the organizational layer the protocol deliberately does not have (names, teams, invitations, activity) as an off-chain convenience that never gains authority over funds.

## 3. Target users

| User | Description | Primary need |
|---|---|---|
| **Treasury / operations analyst** at an institution | Prepares obligations, reviews net positions, approves and authorizes settlement | A clear, auditable workflow with no surprises |
| **Organization administrator** | Sets up the organization, wallets and members | Control over who can act for the organization |
| **Counterparty representative** | Invited into another organization's session | Understand exactly what they are authorizing before they sign |
| **Reviewer / observer** (read-only) | Compliance or management viewing positions and history | Trustworthy, shareable views of state |
| **Evaluator / integrator** (SCF reviewers, developers) | Inspects the product on Testnet | Evidence that the protocol works, and an honest status |

Retail users are out of scope.

## 4. Primary use cases

1. **Bilateral-to-multilateral netting for a small group.** Up to four organizations record obligations in one token and settle only the net.
2. **Verify what will happen before authorizing.** Review nets and the proposed transfers, check digests, understand each debtor's own authorization.
3. **Track the progress of a session** and who has to act next.
4. **Review the history** of sessions, approvals and settlements, with ledger references.
5. **Evaluate the protocol** safely on Testnet with test tokens.

## 5. Core value proposition

- Settle only net positions: less gross value moves than when each obligation settles on its own (the landing page's worked example: 250 gross versus 30 net, labelled illustrative).
- A deterministic, contract-validated result that every participant approves explicitly; no operator can override or manufacture approval.
- Non-custodial and atomic: transfers either all happen or none does.
- Honest by construction: an experimental Testnet product that states its limits.

## 6. Product boundaries

The application is an **interface and coordination layer**. It does not hold funds, does not settle anything itself, cannot approve for a participant, and has no authority over contracts. Organization roles in the application are conveniences; on-chain authorization always comes from wallet signatures.

## 7. MVP-1 scope (proposed)

The recommended MVP-1 product is the smallest application that lets real parties run the protocol's full happy path on Testnet. It is deliberately close to what the protocol offers.

| In MVP-1 | Why |
|---|---|
| Wallet-based sign-in; an organization record with one or more wallet addresses | Needed to act as an organization; no existing identity system |
| Sessions workspace: create, invite or join, submit obligations, freeze, propose, approve, settle, with a clear "next action" | The protocol's whole lifecycle |
| Network transport and wallet signing, including authorization entries and a signature-collection step across parties | Required for any of this to be real; the largest build and risk item |
| Session and obligation views, nets, approvals, debtor authorizations, settlement record with ledger and transaction references | Core visibility |
| Activity history per organization | Auditability |
| Institution profile and a small directory of organizations that opted in | Needed to name counterparties and invite them |
| Honest status language and Testnet banner | Existing Console rule worth keeping |

| Optional in MVP-1 | |
|---|---|
| Team members beyond one administrator (invitations, an administrator and a member role) | Useful, not required for a first run |
| Notifications (in-application) | Helpful for "waiting on you" |
| Public read-only session pages by link | Data is public on-chain anyway; low cost once an indexer exists |

## 8. Explicitly excluded from MVP-1

- Discover as a marketplace or public opportunity browser with matching and netting-opportunity detection (needs an indexer, a public registry and a different matching model; the protocol offers no enumeration). Reduced form: join by invitation or session id.
- Cancelling, closing or editing obligations, leaving a session (the protocol has no such operations).
- Private sessions or confidentiality (not possible on this protocol).
- Netting across sessions, more than four participants, more than one token per session.
- Multi-asset obligations, due dates, terms, collateral, deadlines, default handling, recovery (the protocol has none).
- Developer or API access for third parties.
- Mainnet, real value, fiat on or off ramps, KYC and compliance workflows, billing.
- Any administrator function over sessions or funds.
- Any change to the contracts (they are authoritative and immutable).

## 9. Product assumptions

| # | Assumption | Status |
|---|---|---|
| A1 | A wallet can sign Soroban authorization entries for the join and settle flows | UNVERIFIED (see the capability mapping, section 4) |
| A2 | Contract events (or an app-side registry) are enough to list a user's sessions | UNVERIFIED; RPC event retention was not checked |
| A3 | Organizations map to one or more Stellar addresses controlled by their members' wallets | PROPOSED |
| A4 | The four-participant, sixteen-obligation limits are acceptable for the MVP audience | PROPOSED; they are provisional engineering targets, not measured limits |
| A5 | Off-chain metadata (names, notes) bound to session and obligation ids is acceptable because it is not enforced by the contract | PROPOSED |
| A6 | A lightweight server is acceptable for identity, invitations, directory and signature coordination, as long as it holds no keys and has no authority | PROPOSED |
| A7 | Testnet-only; no value at risk | Stated in all existing project documents |

## 10. Outstanding decisions

Collected, with recommendations, in [open-decisions.md](open-decisions.md).

## Existing design-system reference (for Phase 2)

Recorded only; Phase 1 does not create or change a design system, and the landing page is not redesigned. The existing visual identity is implemented in `apps/landing` (Next.js, Tailwind v4) and described in `apps/landing/README.md`:

| Element | Where it is defined |
|---|---|
| Typefaces: Urbanist (headlines), Outfit (display numerals), Instrument Sans (body, UI), Space Grotesk (labels, axes) | `apps/landing/src/app/layout.tsx`; README "Typography" |
| Colour tokens (strictly greyscale surface: `ink`, `paper`, `grey-*`; data colours `chart-*`; accent `net` / `net-ink`) | `apps/landing/src/app/globals.css`; README "Design tokens" |
| Radii, type classes, motion and layout rules | same file; README "Motion and layout architecture" |
| Icons: Hugeicons | README "Icons" |
| Components: navigation pill, buttons, tiles, badges, charts, odometer, carousels | `apps/landing/src/components/` (for example `ui.tsx`, `chart.tsx`, `Odometer.tsx`) |
| Landing page accessibility and motion decisions, including the recorded WCAG 2.2.2 risk (no pause controls) | `apps/landing/README.md` "Accessibility and motion" |

The current application Console (`apps/web-console/app/globals.css`, 33 lines of plain CSS, system fonts) does **not** use this system. It is a developer sandbox. Reconciling the two is Phase 2 work.
