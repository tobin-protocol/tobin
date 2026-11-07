# Clearing operations: implementation

Paths relative to `apps/web-console/`. Application level only: no wallet, no Stellar call, no signing, no settlement, no contract.

## Decisions
- **Participants** are members of the session organization (participant id = user id). Participation is distinct from membership, wallets and Stellar accounts. Cross-organization participants are NOT supported: adding another organization would need its authorization, which no mechanism here provides (deferred).
- **Removal** is soft (`status = removed`), refused while an active obligation names the participant ("void or correct them"). Re-adding reactivates. Ending an organization membership marks that user's participations removed, and is refused while active obligations depend on them.
- **Obligations**: debtor and creditor (active participants), amount (positive whole base units, digits only, at most the engine's i128 maximum; no rounding, no floats), asset (1 to 12 upper-case letters or digits; no asset registry exists, so the shape is the only "supported" test), optional reference. A revision counter records changes; voiding keeps the row. A session nets exactly one asset: a second asset is refused.
- **Netting** uses the existing `computeNets`. Participants map to deterministic handles (`partyHandle`, a derived Stellar-style key that is not a wallet). The server reads the persisted active obligations, runs the engine, checks the nets sum to zero, and stores an immutable snapshot with its exact input and SHA-256. The client supplies no input or result (anything sent is ignored).
- **Staleness**: a snapshot is current only if its input hash equals the hash of the present participants and active obligations. Any change (amount, revision, participant, asset, void) makes it stale.
- **Workflow**: `configuring -> ready -> (configuring | closed)`; `closed` is final. Edits and calculation are possible only while configuring. Ready means application consistency only.
- **Readiness checks**: state; at least two active participants; at least one active obligation; no obligation names an inactive participant; one asset; the engine accepts the input; a calculation exists; it is current; its positions sum to zero.
- **Activity**: `session.participant-added/removed`, `obligation.created/updated/voided` (updates carry `field old -> new`), `netting.calculated/failed`, `session.state-changed`, `session.readiness-evaluated`. Failure records are written after the failed transaction rolls back. User ids in details are shown as names. Activity stays append-only (database triggers).

## Schema (migration 2)
`sessions.workflow_state`; `session_participants` rebuilt with `status` and `removed_at`; `obligations` (CHECKs on id, digit-only amount without leading zero, asset shape, debtor <> creditor, status; composite foreign keys to participants of the same session); `calculations` (snapshot, `input_json`, `positions_json`, update and delete triggers). Existing data is preserved (tested on a version 1 database).

## API (session cookie required; every non-GET needs `x-tobin-request: 1`; the actor always comes from the session)
| Route under `/api/registry/orgs/:org/sessions/:s/` | Method | Who |
|---|---|---|
| `participants` | GET, POST `{userId}` | member, admin |
| `participants/:uid/remove` | POST | admin |
| `obligations` | GET, POST | member, admin |
| `obligations/:o` | GET | member |
| `obligations/:o/update`, `obligations/:o/void` | POST | admin |
| `calculate` | POST | admin |
| `calculation` | GET (`currency`: current, stale, none) | member |
| `readiness` | GET | member |
| `ready`, `reopen`, `close` | POST | admin |

Non-members get the same 404 as for a nonexistent organization. Fixture sessions answer 409 to every operation. Request bodies are capped at 4 KiB.

## Frontend
`components/sessions/session-operations.tsx` (Participants, Obligations, Net positions and Readiness panels, each with loading, empty, error, success, validation and permission-aware states) wired into `sessions-app.tsx`. Fixture sessions keep their static, labelled display. Activity shows readable labels. Row actions wrap in a flex row (the earlier mobile card issue).

## Files
Created: `lib/registry/clearing.ts`, `components/sessions/session-operations.tsx`, `test/clearing.test.ts`, `test/clearing-ops.test.ts`, `test/browser/clearing-journey.mjs`, the five `CLEARING_OPERATIONS_*.md`.
Modified: `lib/db/database.ts`, `lib/registry/{types,store,sqlite-store,service,http,session-view}.ts`, `components/sessions/sessions-app.tsx`, `app/(institution)/sessions/sessions.css`, `test/backend-db.test.ts`, `test/backend-security.test.ts` (schema version 2; removed participations are kept as history), `test/browser/{backend,sessions}-journey.mjs` (updated to the new behaviour and wording), `packages/mvp1-sdk/package.json` (one added export, `./strkey`; no behaviour change).
