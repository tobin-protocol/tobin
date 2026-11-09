# Phase 1 readiness report

Final architecture review of the package in [README.md](README.md). Written 2026-11-03 against `main` at `5fa621e`. Documentation and architecture only: no code, contract, SDK, deployment or governance change was made, and no Stellar transaction was initiated.

## 1. Verdict

**Phase 1 is complete as a specification, and ready for Phase 2 subject to the product-owner decisions marked "blocking" in section 7.** The package defines the product, roles, information architecture, journeys, domain model, lifecycles and MVP-1 screens, and aligns every claim with the repository. Its most important finding is that the redesigned product is mostly **new application and infrastructure work on top of an unchanged protocol**: identity, organizations, a network transport, wallet signing and discovery do not exist today.

## 2. Repository areas inspected

| Area | What was read |
|---|---|
| `contracts/clearing/src/lib.rs`, `contracts/token/src/lib.rs` | State enum, structs, 18 clearing functions, token functions, 27 error codes, constants, events, authorization calls |
| `contracts/deployments/`, `docs/governance/` | Deployed Testnet instances and governance evidence |
| `packages/mvp1-sdk/src/` | `sdk/client.ts`, `abi.ts`, `prepare.ts`, `transport.ts`, `errors.ts`, `intent.ts`; `engine/`; `local/bridge.ts` |
| `apps/web-console/` | `lib/console/controller.ts`, `view.ts`, `lib/server/api.ts`, routes, README, styles |
| `apps/landing/` | README (typography, tokens, motion), `globals.css`, component list: recorded as the design-system reference |
| `docs/spec/`, `docs/reference/`, `docs/reports/`, root `README.md`, `CONTRIBUTING.md`, `release/` | Baseline specification, ABI and authorization reference, reports, release gates |

## 3. Existing capabilities verified (IMPLEMENTED)

Verified by a programmatic comparison on 2026-11-03 and by reading source:

- The SDK's `CLEARING_FUNCTIONS` (18) equals the contract's public functions exactly.
- The contract has 27 error codes, three limits (4 participants, 16 obligations, 16 instructions) and eight events.
- The session lifecycle is exactly Open, Committed, Approved, Settled.
- All SDK calls named in the documents exist (`prepareCreateSession`, `prepareJoin`, `prepareSubmitObligation`, `prepareFinalize`, `preparePropose`, `prepareApprove`, `prepareSettle`, `getSessionStatus`, `verifyDigests`, `generateDefaultProposal`, `settlementIntent`).
- The Console drives the whole protocol lifecycle in a local sandbox with the real contracts, keeps honest status wording, and shows a permanent sandbox banner.
- The engine (nets, default proposal, advisory validator) and the digest scheme exist.

## 4. Missing capabilities identified (NOT IMPLEMENTED)

Users, sign-in, organizations, institution profiles, teams, invitations, notifications, persistence, a product API, an indexer or any session listing, a network transport, wallet integration and signing-entry collection across parties. A search of the Console, SDK and contract sources found no organization, login, institution or enumeration code, and the contract has no function to list, search, cancel, remove, withdraw, abort, leave or upgrade.

## 5. Protocol limitations that shape the product

1. The session is the unit; obligations exist only inside a session (4 participants, 16 obligations, one token).
2. Obligations are permanent, with no edit, cancel or close; a session may stall forever.
3. Admission needs two signatures (joiner and creator) and is permanent.
4. No enumeration, privacy, public/private flag, per-obligation metadata or cross-session netting.
5. Authorization entries for non-source accounts (join, each debtor at settlement) must be signed by wallets; this is UNVERIFIED with a browser wallet, and the repository's signer policy limits validity to 10 ledgers.

## 6. Important architectural decisions made in this package

- The **session is the primary object**; Netting and Settlement are session stages, not top-level sections (information-architecture.md).
- **Discover is deferred**; MVP-1 keeps join by link or id (D2).
- **Application roles never carry on-chain authority**; the application holds no keys (roles-and-permissions.md).
- **One Organization record with a public Institution profile**, not two entities.
- Candidate lifecycle states were validated: Draft is application-only; Closed and Failed or cancelled are not supported by the protocol; "Eligible for netting", "Netted" and "Awaiting settlement" are derived from session state.
- Existing design-system reference recorded (landing page); not changed.

## 7. Outstanding decisions (see open-decisions.md)

**Blocking for Phase 2 scope:** D1 (session as primary object), D2 (Discover deferral), D3 (wallet-based identity), D4 (lightweight server with no keys and no authority), D7 (wallet and entry-signing approach, with a spike), D14 (contracts treated as final).
**Non-blocking:** D5, D6, D8 to D13, D15.
**Assumptions needing approval:** A1 to A7.

## 8. Consistency review

| Check | Result |
|---|---|
| 1. Documents checked against the repository | Done; claims in section 3 verified programmatically and by source reading |
| 2. Capabilities marked implemented are implemented | Yes (section 3) |
| 3. Contract claims verified against source | Yes: functions, states, errors, limits, events, authorization calls |
| 4. Contradictions | Found and fixed during review: an unclear statement about where wallet entry signing had been demonstrated (now cites the Stage B local run and the author-reported Testnet note), and the Obligations register's MVP-1 status (now OPTIONAL in both the navigation and the screen inventory) |
| 5. All seven journeys documented | Yes, each with entry, intent, preconditions, steps, system responses, success, error and empty states, permissions and dependencies; gaps marked |
| 6. MVP screens map to requirements | Yes (screen-inventory.md "Traceability"); the user's "Netting overview" and "Settlement overview" are covered by S05, S06, S11, S12 and recorded as NOT APPLICABLE as separate screens |
| 7. Role permissions consistent | Yes; the screen permission lines follow the matrix; "allowed member" is the recommended default in both |
| 8. Entity relationships coherent | Yes; on-chain and off-chain entities are separated in domain-model.md and in the ER diagram |
| 9. Lifecycle transitions consistent | Yes; every session transition is a listed contract call; application-only states are labelled |
| 10. Unresolved decisions identified | Yes (section 7) |

Terminology is shared through the README glossary. Mermaid diagrams (sitemap, ER, five state diagrams) were written to standard syntax; **they were not rendered or validated by a Mermaid tool** in this environment.

## 9. Checks run

- Documentation links: all internal links in the package resolve (`scripts/ci/check-links.mjs`).
- Release-gate scan: 0 findings; no contract IDs appear in the package.
- No files outside `docs/product/architecture/` were created or changed.

## 10. Items needing your approval before Phase 2

1. The blocking decisions in section 7.
2. The recommended navigation (Overview, Sessions, Obligations (optional), Institutions, Activity; Discover reserved).
3. The MVP-1 scope in product-definition.md, including that network transport and wallet signing are in scope as the largest build item.
4. Treating the Testnet contracts as final (D14), with protocol requests for a possible later version collected separately.

Phase 2 (design system and visual design) has **not** been started.
