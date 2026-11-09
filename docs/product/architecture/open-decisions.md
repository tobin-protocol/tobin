# Open decisions and assumptions requiring product-owner approval

Each item states the question, why it matters, the recommended answer and what is affected. Nothing here is decided. Terms follow [README.md](README.md); evidence is in [protocol-capability-mapping.md](protocol-capability-mapping.md).

## Decisions

| # | Decision | Why it matters | Recommendation | Affects |
|---|---|---|---|---|
| D1 | **Primary object: session, not obligation.** Adopt the clearing session as the working object, with Netting and Settlement as session stages | The protocol has no standalone obligations or cross-session netting; the user's proposed top-level "Obligations" and "Netting & Settlement" sections would mislead | Adopt (see information-architecture.md) | Navigation, all journeys, screens |
| D2 | **Discover in MVP-1.** Defer the marketplace; keep join by link or id and public session pages | The contract cannot list, search, restrict or match; it needs an indexer, registry and matching service | Defer to a later release | Navigation, scope |
| D3 | **Identity model.** Wallet-based sign-in (proof of control) with an application-side Organization record; no passwords | No identity system exists; a wallet is already required for every action | Wallet sign-in | Onboarding, roles |
| D4 | **Backend footprint.** Accept a lightweight server for identity, organizations, invitations, directory, activity and signature coordination, holding no keys and having no authority | Required by every organizational feature; the protocol is deliberately admin-free | Accept, with the "no keys, no authority" rule recorded | Architecture, security |
| D5 | **Member role in MVP-1.** Single administrator only, or administrator plus member | Team management is optional scope | Administrator plus member as a minimal model; team management screens OPTIONAL | Roles, S19 |
| D6 | **Session discovery of my own sessions.** Build an indexer over contract events, or keep an application registry of session ids created or joined through the product | Needed for the Sessions list; RPC event retention was not verified (A2) | Application registry first (simplest, authoritative for sessions made in the product), indexer later | Sessions list, Activity |
| D7 | **Wallet choice and entry signing.** Which wallet or wallets to support and how to prove signing of Soroban authorization entries across organizations | Joins and settlement depend on it (A1, UNVERIFIED); the first build task should be a spike | Run a Phase 2/3 spike with at least one wallet before committing screens that depend on it | J3, J7, S10, S12, S23 |
| D8 | **Signature collection UX across organizations.** Out-of-band request links, a shared signing page, or in-app requests | Authorizations have short validity (the repository's signer policy allows 10 ledgers); human coordination is hard | In-app signature requests with a live "waiting on" status; confirm the validity window with a spike | J3, J7 |
| D9 | **Capacity language.** Present the 4-participant and 16-obligation limits as fixed facts of the current protocol | Provisional engineering targets, not measured limits (A4) | Show them plainly in the wizard | S07, J2 |
| D10 | **Off-chain metadata.** Allow descriptions and references bound to obligation ids, labelled "not enforced by the contract" | The contract stores only id, parties and amount | Allow, with the label | S09 |
| D11 | **Abandoned sessions.** Allow an application-only "abandoned" note, never a protocol state | A session can stall forever | Allow as a private note with a clear label | Lifecycle, S06 |
| D12 | **Test token and minting in the product.** Whether the application exposes minting to administrators | Minting needs the project's multisig for the governed token; it is a test-environment function | Not a product feature; provide a documented faucet process outside the application | Roles, scope |
| D13 | **Public pages.** Whether public read-only session and institution pages are in MVP-1 | All data is public on-chain anyway; low cost once reads exist | OPTIONAL; institution pages are in, session pages optional | S16, S22 |
| D14 | **Contracts in the product.** Confirm that Phase 1 treats the Testnet contracts as final and unchangeable | Several desired features (cancel, edit, private, multi-asset) would need a new protocol version | Confirm; collect protocol requests separately for a possible later version | Whole package |
| D15 | **Terminology.** Confirm "clearing session" in the interface (versus a friendlier name) and "institution" as the public view of an organization | Consistency across the product | Use "Session" in navigation and "clearing session" on first mention | All documents |

## Assumptions needing approval

| # | Assumption | Status |
|---|---|---|
| A1 | A browser wallet can sign Soroban authorization entries for the join and settle flows | UNVERIFIED |
| A2 | Contract events (or an application registry) suffice to list a user's sessions | UNVERIFIED |
| A3 | An organization maps to one or more addresses controlled by its members | PROPOSED |
| A4 | The 4/16/16 limits are acceptable for the MVP audience | PROPOSED |
| A5 | Off-chain metadata bound to ids is acceptable | PROPOSED |
| A6 | A key-less lightweight server is acceptable | PROPOSED |
| A7 | Testnet only; the governed Testnet token is the product's token; the three signer wallets are controlled by one person, so no independent governance is claimed | Stated in project documents |

## Risks to carry into the next phase

1. Wallet signing of authorization entries (A1) could force a different signing flow.
2. No persistence, identity or indexer exists; the application backend is net-new work.
3. Provisional limits (4 participants, 16 obligations) may constrain the intended audience.
4. The shared Wasm code TTL decision for the Testnet token (see `docs/governance/governed-token-evidence.md`) is a separate operational item that affects the demo environment's lifetime.
