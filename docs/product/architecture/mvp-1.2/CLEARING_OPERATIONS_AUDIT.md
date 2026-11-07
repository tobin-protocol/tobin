# Clearing operations: audit (Phase 0)

Baseline found in the repository before this milestone (branch `main`; uncommitted work from the previous milestone present).

## Existing capabilities
- SQLite persistence (`node:sqlite`), numbered migrations (v1), `BEGIN IMMEDIATE` transactions, a `RegistryStore` interface with SQLite and in-memory implementations.
- Local accounts, server-side sessions, organizations, memberships (admin/member), invitations, unproven wallet claims, immutable activity.
- Sessions: local drafts with provenance; workspace tabs Overview, Participants, Obligations, Net positions, Activity. A participant record existed (user of the session organization, optional wallet claim) with an API but no UI and no removal.
- Netting engine `computeNets` in `packages/mvp1-sdk` (bigint, checked i128 arithmetic; rejects unknown parties, same party, duplicates). The UI used it only for FIXTURE data.

## Missing capabilities
Participant removal and status; persisted obligations; any calculation from persisted data; staleness; readiness; a workflow state; operational activity; UI for all of these.

## Reusable code
Registry service pattern (`#need`, `#log`, transactions), HTTP handler, API client, institution layout, session CSS, CDP browser driver, backend test helpers.

## Findings and risks
- The engine identifies parties by Stellar addresses; application participants are users. Decision: a deterministic bookkeeping handle per (session, user), never a wallet.
- The engine has no asset notion: mixed assets must be prevented by the application.
- `session_participants` had a foreign key to memberships with ON DELETE CASCADE: removing a member would erase history, or once obligations exist be blocked. Decision: rebuild the table without that key and mark participations removed.
- Obligations change in place, so a calculation needs a reproducible input reference. Decision: store the exact input with each snapshot plus its SHA-256.
- Authorization: all mutations admin-only; reads member-only; non-members must get the same 404 as for a missing organization.
- Testing gaps: no HTTP-level tests for any of this; two journeys asserted the old "a draft has no obligations" wording.
- Baseline before changes (previous milestone, re-run at the start of this one is NOT claimed; the full suite was re-run after the changes, see the closure report).

## Changes required
- Database: migration 2 (workflow state, participant status, obligations, calculations with immutability triggers).
- API: participant, obligation, calculation, readiness and workflow routes under `/api/registry/orgs/:org/sessions/:sid/`.
- Frontend: panels for three tabs and a readiness section on the Overview.

## Sequence
Migration and store; pure rules (`clearing.ts`); Registry methods; HTTP; unit and integration tests; UI; browser journey; regression; documents.
