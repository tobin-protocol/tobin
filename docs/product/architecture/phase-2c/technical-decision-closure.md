# Technical decision closure (Phase 2C)

Written 2026-11-03. Statuses: **OWNER DECIDED** (explicit owner decision in the Phase 2C brief), **EVIDENCE-SUPPORTED**, **PROPOSED**, **PENDING OWNER**, **BLOCKED** (needs wallet evidence). Nothing is claimed approved unless the owner stated it.

| ID | Decision | Status | Final recommendation and evidence |
|---|---|---|---|
| C1 / A1 | Authentication | PROPOSED, **BLOCKED** for the signing method | Wallet-based sign-in, kept separate from entry signing. Methods: (1) `signMessage` (typed in Freighter 6.0.1; returns string or Buffer by response version; behavior not tested); (2) fallback: a signed, never-submitted transaction challenge using `signTransaction` (envelope signing was verified for Freighter). The fallback's costs: the wallet shows a transaction prompt that looks real; users may sign a look-alike transaction elsewhere; use an invalid sequence number and a distinct memo so it can never be valid on-network, show it as "sign-in, no funds move", and verify server-side that it is not submittable. Neither method was run |
| C2 / A2 | Backend in the Next.js app | PROPOSED | The server stores profiles, organizations, memberships, invitations, registry, activity and reconciliation state only. It never holds keys, signs, submits transactions for users, or overrides contract state. Hosting interacts: see H1 |
| C3 / A3 | Registry plus chain reconciliation | PROPOSED | See recovery analysis below |
| C4 / A4 | `@stellar/stellar-sdk` 17.4.0 and `Transport` extension | PROPOSED, **BLOCKED** for the wallet part | Evidence: the SDK exposes `authorizeEntry` with a `SigningCallback`, `inspectAuthEntry`, `checkAuthEntryReadiness` (Confirmed in the typings). Risks: browser bundle size, a new dependency surface, V2/delegate credential types that Tobin's signer rejects, no evidence that Freighter returns bytes accepted for Tobin's entries. The repository `Transport` has no wallet adapter; one must be added. No dependency was added |
| C5 / A5 | Design tokens | PROPOSED | Reuse the landing's tokens (`apps/landing/src/app/globals.css`); extract without changing values; landing unchanged |
| C6 / A6 | Hosting | **OWNER DECIDED (D4, supersedes earlier same-project decision)**: separate Vercel project at `app.tobinprotocol.xyz`; landing unchanged | See [hosting-and-domain-architecture.md](hosting-and-domain-architecture.md); H1 closed |
| C7 | Database | PENDING OWNER | Recommendation below |
| C8 | Retention and privacy | PENDING OWNER for periods | Model below |
| W1 | Wallet support | PENDING, BLOCKED | Freighter is the only candidate; evidence stays at L1 |
| W3 | Ten-ledger window | **UNRESOLVED** | T9 not run; do not change the policy; no recommendation from evidence |

**Rejected options:** Albedo and Ledger-through-the-kit for entry signing (unsupported by the integration, evidenced); a server that signs or submits for users (violates non-custody); a mock wallet as compatibility evidence; email-only identity for MVP-1.

## C3. Recovery analysis (session registry and events)

| Question | Answer |
|---|---|
| Recoverable from contract storage | Current state of any session whose id is known: state, participants, token, finalized obligations and commitment, current proposal and approvals, as exposed by the 18 functions (`getSessionStatus`). Session ids are not enumerable on-chain; a lost registry loses the list of ids unless they are recorded elsewhere (e.g. wallet history) |
| Recoverable from events | Eight event types. Soroban RPC keeps events for a limited window (about 120,960 ledgers, roughly 7 days per the earlier RPC query; re-measure before relying on it). Older events need an archive or a history source not yet chosen |
| Application-only | Organizations, memberships, wallet-to-organization links, invitations, labels, notification settings, off-chain activity |
| Unrecoverable if the database is lost | All application-only data; the list of sessions an organization took part in (unless re-discovered from wallet transaction history via an external history source); invitation history; human-readable labels |
| Indexer offline longer than retention | Events in the gap are lost to the RPC. Current state is still readable by session id, so state can be rebuilt but the detailed activity history for the gap cannot be claimed complete. Mark such ranges as "history incomplete" |
| Resume after downtime | Store the last processed ledger; on restart read events from there if still retained, otherwise reconcile by reading each known session's current state and mark a gap |
| Duplicates / out of order | Key every event by (ledger, transaction hash, event index); upsert idempotently; apply state only from reading the contract, never by folding events alone |

Historical completeness is **not** guaranteed and must not be claimed.

## C7. Database recommendation

Requirement: PostgreSQL, Vercel integration, migrations, backups, pooling, dev/prod separation. Candidate: Neon via the Vercel integration (serverless Postgres, branching for preview environments, connection pooling, point-in-time restore on paid tiers); alternative: Supabase Postgres. This comparison is from general knowledge, not checked against current vendor pages, pricing or data-residency terms in this session. **Recommendation: PROPOSED, subject to owner approval and a pricing and residency check; nothing was created or provisioned.** Use separate databases for production and preview, least-privilege roles, migrations in the repository, and backups tested by restore.

## C8. Data classification and retention (PROPOSED; periods pending owner)

| Data | Class | Visible to | Proposed retention |
|---|---|---|---|
| Public institution profile | Public | Anyone | Until the organization removes it |
| Private user profile | Personal | The user, organization admins | While the account exists; delete on request within a set period (owner to set) |
| Membership | Organizational | Organization members | While active; keep an audit entry after removal |
| Invitation | Organizational | Inviter, invitee | Expire in 14 days, keep minimal record 90 days (PENDING) |
| Session registry metadata | Participant-restricted | Participants of that session | Life of the registry; chain keeps the session regardless |
| On-chain obligations and transaction references | Public ledger data on a public network | Anyone with the ledger | **Cannot be deleted**; deleting an application row does not remove it |
| Cached contract state | Derived | Participants | Refreshed; discard after 30 days unused (PENDING) |
| Temporary signed authorization entries | Sensitive, short-lived | The collecting parties | Delete at expiry or after any failure; never persisted beyond the signing round; never logged |
| Activity records | Participant-restricted | Participants | 7 years is a common financial record period, but the legal requirement is **not** established here: PENDING owner and counsel |

Minimise: no obligation notes, no documents, no secrets. Restrict by session membership at the query layer.
