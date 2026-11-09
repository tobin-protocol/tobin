# Backend data model (Phase 2B, C1)

Written 2026-11-03. **PROPOSED; nothing is implemented** and no database exists. This refines [../domain-model.md](../domain-model.md). Rule: the blockchain is authoritative for session state, participants, obligations, proposals, approvals and balances. Application data never overrides it; if they disagree, the chain wins and the record is repaired.

Columns: **Source of truth** is where a conflict is resolved. **Managed** says whether the application writes it (APP) or derives it from the chain (CHAIN).

| Entity | Purpose | Key fields | Relationships | Source of truth | Managed |
|---|---|---|---|---|---|
| User | A person who signs in | id, created_at, status, notification_address (optional) | has Memberships, owns Wallets | Application | APP |
| Organization | The institution the user acts for | id, legal_name, display_name, jurisdiction, status | has Memberships, Wallets, Institution profile | Application | APP |
| Membership | Links a user to an organization with an application role | id, user_id, organization_id, role (admin, operator, viewer), status | User, Organization | Application. Roles carry **no** on-chain authority | APP |
| Wallet | A Stellar account an organization uses | id, organization_id, stellar_address, network, label, verified_at | belongs to Organization; has ownership verifications | Chain for the address; application for the label and link | APP |
| Wallet ownership verification | Proof that a user controls the address | id, wallet_id, challenge, signature, signed_at, expires_at, method | Wallet | Application record of a signature check; the signature itself is verifiable | APP |
| Institution profile | Public face of an organization | organization_id, description, website, visibility | Organization | Application | APP |
| Invitation | Invites an organization/address to a session or an organization | id, session_ref, invitee_address or org, status (sent, accepted, expired, revoked), expires_at | Session registry entry | Application; acceptance only matters once the join transaction succeeds on chain | APP |
| Session registry entry | Lets the application list sessions | id, chain session_id, contract, token, creator_wallet_id, created_at, last_synced_ledger | Wallets, Invitations, Activity | **Chain** for state and participants; application for the listing and labels | APP row, CHAIN state |
| Activity record | History shown to users | id, session_ref, kind, actor_wallet, ledger, tx_ref, occurred_at | Session, Transaction reference | **Chain events** where they exist; application events (invitation sent) otherwise | CHAIN or APP, tagged |
| Transaction reference | Tracks a submitted transaction | id, tx_hash, session_ref, purpose, status (prepared, awaiting_signatures, submitted, confirmed, failed), ledger, error | Session, Activity | Chain for confirmed/failed; application for the intermediate states | mixed |

## Not stored (by design)

- Private keys, seeds, secret material, wallet credentials: never.
- Signed authorization entries are short-lived, held only while a signature round is open, and deleted at expiry or after a failed settlement (a failed transaction leaves signed entries reusable until expiry, EQ-20).
- Obligation amounts and nets are read from the contract and cached only with a ledger stamp; the cache is never an input to a digest.

## Open points

- Retention and privacy of obligation data in the application database (D-B8).
- Whether Institution visibility other than "members of shared sessions" is in MVP-1 (Discover is deferred).
- Database product and hosting: not selected.
