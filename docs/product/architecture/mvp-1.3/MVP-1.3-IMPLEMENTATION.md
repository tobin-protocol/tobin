# MVP-1.3 implementation: institutional clearing authorization

Paths relative to `apps/web-console/`. Application level only: no wallet, no key, no Stellar transaction, no signing, no submission, no settlement, no contract. An approval is a database record, not a signature.

## Architecture
- `lib/registry/authorization.ts`: pure rules (decision status, authorization state, separation-of-duties conflicts).
- `lib/registry/service.ts`: `grantReviewer`, `revokeReviewer`, `reviewers`, `authorization` (view with eligibility), `decide` (approve or reject), and a private `#invalidate` hook.
- `lib/registry/{store,sqlite-store}.ts`: reviewer, decision and invalidation persistence (SQLite and the in-memory test store).
- `lib/registry/http.ts`: routes below. `components/sessions/authorization-panel.tsx`: the Authorization tab. `components/organizations-app.tsx`: grant and revoke reviewer.

## Roles and separation-of-duties policy
- **Reviewer** is a capability an organization administrator grants to an existing member (`org_reviewers`). Administrators are not reviewers by default; reviewers cannot edit anything.
- A reviewer **cannot decide** on a calculation if they ran it, or created, edited or voided any obligation that is in its input. This is read from the obligation rows and from the append-only activity history, so someone who edited an earlier revision is still excluded. Participant changes are not a conflict.
- The policy uses accounts. The system cannot know whether two accounts are two real people, and a second browser session of the same account is the same person. An organization therefore needs at least two accounts, one to record and calculate and one reviewer, before anything can be approved.

## Snapshot-binding invariant
A decision row stores the calculation id (UNIQUE: one decision per snapshot), and the request must name that id. `decide` runs in one `BEGIN IMMEDIATE` transaction that checks, in order: membership (404 for outsiders), reviewer capability, session not closed, the id exists in this session, it is the latest snapshot, it is current (the SHA-256 of the present participants and obligations equals the snapshot's), no decision exists yet, separation of duties, a reason for a rejection; then writes the decision and its activity. A decision is **active** only if it has no invalidation row, its snapshot is the latest and the snapshot is current. This is evaluated on every read, so even an unrecorded change cannot leave an active decision.

## Invalidation
Every MVP-1.2 mutation that can change the input (obligation create, edit, void; participant add, remove; ending a membership that ends a participation) and every new calculation calls `#invalidate` inside its own transaction. It inserts an invalidation row (cause, time, actor) for each decision that has none and an `authorization.invalidated` activity entry. The decision stays untouched as history. This hook is the only change to the frozen MVP-1.2 service and changes none of its behaviour; the full MVP-1.2 suite passes unchanged apart from schema-version assertions.

## State transitions (of the current snapshot)
`no-calculation` -> (calculate) -> `awaiting-review` -> (approve) `approved` or (reject) `rejected`. Any data change moves a current snapshot to `stale` and invalidates its decision. Calculating again creates a new snapshot: `awaiting-review`, the old decision marked invalidated ("a new calculation superseded this one"). A decided snapshot cannot be decided again (409); review again by recalculating. Decision status in history: Current, Superseded by a newer calculation, No longer applies.

## Database (migration 3, migrations 1 and 2 untouched)
`org_reviewers` (foreign key to memberships, removed with the membership); `authorization_decisions` (immutable by trigger; `calculation_id` UNIQUE and a foreign key to `calculations`; CHECKs: decision values, rejection requires a non-blank reason, approval has none, length); `authorization_invalidations` (one per decision, immutable by trigger).

## API (session cookie; non-GET need `x-tobin-request: 1`; actor from the session only)
| Route | Method | Who |
|---|---|---|
| `/orgs/:org/reviewers` | GET | member |
| `/orgs/:org/reviewers/:uid/grant`, `/revoke` | POST | administrator |
| `/orgs/:org/sessions/:s/authorization` | GET (state, eligibility with reasons, history) | member |
| `.../authorization/approve` `{calculationId}` | POST | reviewer |
| `.../authorization/reject` `{calculationId, reason}` | POST | reviewer |
New error codes: `STALE` (409), `SEPARATION_OF_DUTIES` (403). Member list responses add a `reviewer` flag.

## Frontend
An Authorization tab (operational sessions only) shows a five-stage ladder (calculation readiness; institutional authorization; Stellar signing, submission and on-chain confirmation, each "not available"), the exact calculation under review with positions, whether the viewer may decide and, if not, every reason, approve and reject (reason required), and the full decision history with status and invalidation cause. The Organizations page adds Grant and Revoke reviewer buttons and an explanatory note. Activity shows readable labels for the new events.

## Files
Created: `lib/registry/authorization.ts`, `components/sessions/authorization-panel.tsx`, `test/authorization.test.ts`, `test/authorization-ops.test.ts`, `test/browser/authorization-journey.mjs`, the MVP-1.3 documents.
Modified: `lib/db/database.ts` (migration 3), `lib/registry/{types,store,sqlite-store,service,http,session-view}.ts`, `components/sessions/sessions-app.tsx`, `components/organizations-app.tsx`, `app/(institution)/sessions/sessions.css`, `package.json` (script), and schema-version assertions in `test/backend-db.test.ts`, `test/backend-security.test.ts`, `test/clearing-ops.test.ts`, `test/browser/backend-journey.mjs`.
