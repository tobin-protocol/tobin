# MVP-1.3 audit: institutional clearing authorization

Written after MVP-1.2 was verified (see `../mvp-1.2/MVP-1.2-FREEZE.md`) and before any MVP-1.3 code.

## Existing model that MVP-1.3 builds on
- Identity: local accounts with server-side sessions. One user is one account; two browser sessions of the same account are the same person. The system cannot tell whether two accounts are two real people (no identity verification exists).
- Roles: per organization, `admin` or `member` (a CHECK-constrained column). No reviewer concept.
- Calculation snapshots (MVP-1.2): immutable rows with an id, the exact input (participants and active obligations with their revisions), an input hash, positions, creator and time. Currency (current, stale, none) is computed by comparing the hash of the present input with the snapshot's.
- Obligation rows carry `createdBy` and `updatedBy`; the activity history (append-only) records who created, updated or voided each obligation and who ran each calculation.
- Workflow: configuring, ready, closed. Edits and calculation only while configuring.
- All mutations run in `BEGIN IMMEDIATE` transactions in one process; activity is written in the same transaction.

## Gaps
- No way to say who may authorize a result, and nothing recording a decision.
- Administrators currently do everything (record, calculate, change workflow). If administrators could also approve, one person could record, calculate and approve alone.

## Decisions (engineering decisions within the brief, open to owner review)
1. **Reviewer capability, separate from admin.** A new table `org_reviewers` (organization, user, granted by, time). An administrator grants or revokes it for an existing member. Being an administrator does NOT make someone a reviewer, and being a reviewer does not allow editing. Rationale: adding a third value to the role column would require rebuilding `memberships` and would blur editing rights with approval rights.
2. **Separation of duties.** A reviewer cannot decide on a calculation if, within that calculation, they (a) ran the calculation, or (b) created, edited or voided any obligation that is part of its input (determined from the obligation rows and from the activity history, so an earlier editor of a later revision is still caught). Participant changes are not treated as a conflict (they set who takes part, not what is owed).
3. **Consequence to state plainly:** an organization needs at least two accounts (one who records and calculates, one reviewer) before anything can be approved. A single-person organization can never approve. This is intended; it is not a defect.
4. **Snapshot binding.** A decision stores the calculation id (UNIQUE: one decision per snapshot) and the client must name that id. Approval and rejection are accepted only for the latest snapshot while it is current and the session is not closed.
5. **Decisions are immutable rows; invalidation is a separate append-only row.** A decision is "active" only if it has no invalidation row, its snapshot is the latest, and the snapshot is current. All three are checked on every read and at decision time. In addition, every MVP-1.2 mutation that can change the input (obligation create, edit, void; participant add, remove; membership removal that ends a participation; a new calculation) records an invalidation, with an activity entry, in the same transaction. This is an additive hook in the MVP-1.2 service, not a change to its semantics.
6. **One decision per snapshot.** A second decision on the same snapshot (same or opposite) is refused (409). To review again after a rejection, recalculate: that creates a new snapshot and a new review. Recalculating never inherits an earlier decision.
7. **Rejection requires a reason** (1 to 500 characters, enforced by the API and by a database CHECK).
8. **What approval means.** An application-level authorization record. It is not a signature, not a Stellar transaction, not a settlement and not an on-chain fact. Nothing in MVP-1.3 reads a wallet, a key or a network.

## Out of scope (unchanged)
Transaction construction, wallets, signing, submission, settlement, contracts, minting, cross-organization authorization, identity-provider integration and MFA. The roadmap MVP-1.2 to 1.8 is unchanged.

## Risks to test
Self-approval paths (recorder, editor, calculator); approval of a stale or non-latest snapshot; tampering with the calculation id; double or conflicting decisions; races between a data change and a decision; closed sessions; rollback; isolation; activity completeness; decisions surviving invalidation as history.
