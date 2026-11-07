# Backend and persistence: data model

Source of truth: `apps/web-console/lib/db/database.ts` (migration 1). SQLite, `PRAGMA foreign_keys = ON`, WAL journaling for files, `busy_timeout` 5 s.

| Table | Key | Columns (summary) | Constraints and indexes |
|---|---|---|---|
| `schema_migrations` | version | name, applied_at | one row per applied migration |
| `users` | id | email (lower-case, unique), display_name, password_hash (scrypt string), created_at, disabled | CHECK email = lower(email) and length; CHECK display_name length |
| `auth_sessions` | token_hash (SHA-256 of the cookie token) | user_id FK users (cascade), created_at, expires_at, revoked_at | index on user_id |
| `rate_events` | id | key, at (ms) | index (key, at); pruned after 24 h |
| `organizations` | id | name 2-80, description <= 500, visibility, created_at, created_by FK users | CHECKs |
| `memberships` | (org_id, user_id) | role admin or member, since | FKs cascade; index user_id |
| `org_wallets` | (org_id, address) | proof none or signature-verified | CHECK address starts with G and is 56 long; the application only ever writes `none` |
| `invitations` | id | org_id FK, invitee, role, token_hash UNIQUE (64 hex), status pending/accepted/revoked, expires_at, created_by FK | index org_id; the token itself is never stored |
| `sessions` | session_id (64 lowercase hex) | org_id FK, label, provenance, created_at, chain_json, confirmed_tx_hash | UNIQUE (session_id, org_id); CHECK (provenance in chain-read/chain-confirmed) = (chain_json not null); CHECK (provenance = chain-confirmed) = (confirmed_tx_hash not null); CHECK hash is 64 hex; index (org_id, created_at) |
| `session_participants` | (session_id, user_id) | org_id, wallet_address (optional claim), added_by, added_at | FK (session_id, org_id) -> sessions; FK (org_id, user_id) -> memberships (cascade: removing a member removes the participant record) |
| `activity` | seq (autoincrement) | id UNIQUE, at, org_id FK, actor, kind, subject, detail | index (org_id, seq); triggers abort any UPDATE or DELETE ("activity records are immutable") |

## Relationships
organizations 1-n memberships n-1 users; organizations 1-n sessions 1-n session_participants; session_participants reference an existing membership of the same organization; organizations 1-n invitations, org_wallets, activity; users 1-n auth_sessions.

## Three separate notions (never conflated)
- Institutional membership: `memberships` (application role, no on-chain authority).
- Clearing-session participation: `session_participants` (application record, not on-chain admission).
- Wallet link: `org_wallets` (unproven claim, `proof = none`); a participant may reference one of the organization claims.

## Provenance integrity in the schema
A draft or fixture cannot carry chain data; chain-read must carry an observation; chain-confirmed must carry both an observation and a 64-hex hash; any other combination is rejected by the database itself, in addition to the Registry rules.

## Deletion behaviour
Deleting an organization or user is not an application operation. Foreign keys cascade for memberships and participants; activity rows are immutable.
