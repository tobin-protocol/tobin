# SQLite to PostgreSQL migration plan (proposal)

Status: **proposal, nothing executed.** No SQLite file was opened and no PostgreSQL database was created while writing this. Commands and the migration utility named here do not exist yet; they are described so they can be built and rehearsed.

Labels: **Verified**, **Recommendation**, **Inference**, **Unknown**, **Owner decision**. Companion documents: `sqlite-database-inventory.md` ("the inventory"), `postgresql-target-architecture.md` ("the target"). Paths are relative to the repository root.

## 1. Executive summary

1. **Verified.** The only durable store is one SQLite file with 32 application tables (inventory section 1). The product is Stellar Testnet only and pre-production; there is no evidence in the repository of a production database (section 2).
2. **Recommendation.** Build one purpose-made, read-only-source, single-transaction migration utility (TypeScript, in `apps/web-console/scripts/`), rehearse it on copies until two consecutive runs produce identical verification reports, and run it once at cutover during a short freeze of writes.
3. **Recommendation.** Migrate identity and institutional evidence (users and password hashes, wallets, organizations, memberships, sessions of the clearing registry, calculations, decisions, batches, executions, attempts, activity, audit). Do **not** migrate login sessions, sign-in challenges or rate counters.
4. **Recommendation.** Never run the utility against the live file. It reads a verified backup copy. The original SQLite file and its backup are kept, read-only, and are never deleted or overwritten by any step.
5. **Recommendation.** Rollback is "start the previous build against the untouched SQLite file". It is lossless only until the first write is accepted on PostgreSQL; the plan makes that boundary explicit.
6. **Recommendation, conditional.** If the owner confirms the only existing data is test or demo data, reduce the migration to schema creation plus a selective import (section 2). The full procedure below is still the one to rehearse, because it is the same code with a smaller filter.

## 2. Does real data exist? (evidence)

| Evidence | Source | Reading |
|---|---|---|
| "Stellar Testnet only", "pre-production", "Production deployment has not been approved" | `AGENTS.md` section 1 | **Verified.** No production tenant is expected |
| "migration 8 was not tested on a real operator database" | `AGENTS.md` (status paragraph) | **Verified.** Suggests no real operator database existed when migration 8 was delivered |
| `TOBIN_DB_PATH` is "required in production"; the architecture and operations documents describe one instance, no backup automation, no retention policy | `BACKEND_PERSISTENCE_OPERATIONS.md`, `BACKEND_PERSISTENCE_ARCHITECTURE.md` | **Verified.** A production process would have needed a configured path; no tracked deployment config sets it (no match in tracked JSON/YAML/TOML/Dockerfile) |
| A developer database exists locally: `apps/web-console/.data/tobin-dev.sqlite` (+ `-wal`, `-shm`), git-ignored | working tree listing | **Verified** it exists; **Unknown** its content (not opened). Main file 4,096 bytes with a 2.4 MB WAL |
| "one owner-run Testnet settlement" happened; "confirmed on-chain outcomes not written back to application records" | `AGENTS.md` | **Verified** statement. **Unknown** whether the application database that served that run still exists |
| `seed-demo` is "refused in production" | `scripts/db.ts:45` | demo data is labelled fixture (`(fixture data)` names, provenance `fixture`) |

**Conclusion.** **Inference:** every existing database is probably a developer or demo database holding Testnet and fixture data. **Unknown:** whether the owner runs an operator-hosted instance with data worth keeping. **Owner decision (blocking):** declare which databases exist and which data must survive.

Scenarios:

| Scenario | Action | Trade-off |
|---|---|---|
| A. Only developer/demo data, nothing needed | Create the PostgreSQL schema, run `asset-add` and, if wanted, `seed-demo`. Skip import. Archive the SQLite file. | Fastest and removes migration risk. Loses any app-side records of past Testnet exercises (including the owner-run settlement's application records, if they exist) |
| B. Some records matter (a demo organization, supported assets, specific sessions) | Selective import (`--include-org <id>` filter; section 5.6). | Moderate effort; filter logic must carry all children of an organization consistently (every tenant table has `org_id`) |
| C. A shared or operator database with real participants | Full migration with the cutover in section 8. | The procedure in this document |

**Recommendation:** if the answer is A, still build and rehearse the utility only if scenario B or C is plausible within the next milestones; otherwise spend the effort on the PostgreSQL store and keep this plan as the written procedure.

## 3. Approach: why a purpose-built utility

Options considered:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| `pgloader` | direct SQLite to PG, handles type casts | cannot derive `org_id` on child tables, cannot compute domain invariants or canonical hashes, awkward on Windows, adds an external tool whose cast rules would need review; `AUTOINCREMENT` and trigger/identity behaviour need hand tuning | rejected |
| SQLite dump to CSV, then `\copy` | simple per table | the type conversions (ISO text to `timestamptz`, 0/1 to boolean, JSON text), derived columns and validation all still need code; multi-step staging | rejected as primary; acceptable as a fallback for a flat table |
| One-time ad-hoc script | smallest | not repeatable, not tested, no report; poor for rehearsal | rejected |
| **Migration utility in the repository** | typed conversions in one place, reuses the application's own hash functions to verify, deterministic report, rehearsable, testable with a fixture database | must be written and reviewed (same-author risk, see section 9) | **chosen** |

The utility lives next to `scripts/db.ts` (proposal: `apps/web-console/scripts/migrate-sqlite-to-pg.ts`), is never imported by the application, and has two modes: `verify` (read-only on both sides) and `load` (write to an empty PostgreSQL schema).

## 4. Preconditions

1. PostgreSQL schema created from the baseline migration (target section 15), as `tobin_owner`, on an empty database. Created by the migration runner, not by the utility.
2. Source schema version is 8. If the **copy** is older, run the application's own `migrate()` on the copy only (`TOBIN_DB_PATH=<copy> node scripts/db.ts migrate`). Never on the live file as part of this procedure.
3. Free disk space for a second copy of the SQLite files, the migration host's scratch directory outside the repository, and the report.
4. `DATABASE_URL` for the owner role, held only in the migration session's environment.
5. Owner decisions answered (section 12).

## 5. Procedure details

### 5.1 Source handling (read-only, backup first)

1. **Stop writes** (section 8). In WAL mode a clean copy needs either `sqlite3 <db> ".backup <dest>"`, `VACUUM INTO '<dest>'`, or copying `-wal` and `-shm` along with the main file while the application is stopped (`BACKEND_PERSISTENCE_OPERATIONS.md`). Prefer `.backup` or `VACUUM INTO` run from a separate process: they produce a single consistent file with no sidecars.
2. Compute `sha256` of the original files (before) and of the backup; record both in the report; store the backup off the host.
3. Mark the original files read-only at the filesystem level and do not start the old application against them again until rollback is decided.
4. The utility opens **only the backup copy**, never the live path. It opens it read-only (`new DatabaseSync(path, { readOnly: true })` where the installed Node supports the option; **Unknown**, verify on the pinned Node 24 minor, `package.json` requires `>=24`). A read-only open of a WAL database may still need the `-shm`; using a `.backup` output (no WAL) avoids that.
5. The utility refuses to run if the source path equals `TOBIN_DB_PATH` of the running configuration, or if a `-wal` file with non-zero size sits next to it (a sign it is the live database).

### 5.2 Preflight checks on the source copy (before any write)

All are read-only queries; any **error** stops the run, **warnings** are listed in the report.

| # | Check | Severity |
|---|---|---|
| P1 | `PRAGMA integrity_check` = `ok`; `PRAGMA foreign_key_check` empty | error |
| P2 | `schema_migrations` max version = 8 and no gaps | error |
| P3 | Row count per table recorded | info |
| P4 | Every timestamp column matches `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$` | error (a differently formatted value would change meaning in `timestamptz`) |
| P5 | Every amount-like text (`amount`, `gross`, `total_amount`) matches `^(0\|[1-9][0-9]{0,38})$` and is `<= 2^127-1` | error |
| P6 | Every JSON column parses with `JSON.parse` | error |
| P7 | Every `G...` / `C...` value matches the strict strkey regexes of the target domains | error (owner decides: fix data or relax domain) |
| P8 | Soft references resolve: every `created_by`, `updated_by`, `decided_by`, `prepared_by`, `recorded_by`, `by_actor`, `initiator`, `actor`, `added_by`, `auth_audit.user_id` is a `users.id` | error if the target adds the FK (target section 5); otherwise warning |
| P9 | Every `settlement_instructions.payer/payee` is a `session_participants` row of that session | error |
| P10 | `settlement_instructions.source_account`/`destination_account` all NULL and `validation_status` all `'valid'` (they are dropped) | error |
| P11 | Derivable `org_id` values exist: each child's parent exists; `settlement_instructions.org_id` NULL rows get the batch's `org_id`; non-null values equal the batch's | error on mismatch |
| P12 | Composite binding: for every decision and batch, the named calculation exists in the **same** session and organization | error (new composite FK) |
| P13 | Booleans: `users.disabled` and `onboarding.profile_done` are 0 or 1 (guaranteed by CHECK) | info |
| P14 | Count of `provenance='fixture'` sessions and organizations named `*(fixture data)*` | warning (owner may exclude) |
| P15 | Count of `obligations.asset_identity='legacy-unresolved'` | info |

### 5.3 Load order (foreign-key dependency order)

All inserts are in primary-key/`seq` order of the source so identity sequences and any order-dependent reads are reproduced.

1. `users`
2. `organizations`
3. `user_wallets`
4. `onboarding` (optional, section 6)
5. `memberships`
6. `org_reviewers`, `org_wallets`, `invitations`
7. `supported_assets`
8. `sessions`, then `session_participants`
9. `obligations`
10. `calculations`
11. `authorization_decisions`, then `authorization_invalidations`
12. `settlement_batches`, then `settlement_instructions`, `settlement_batch_reviews`, `settlement_batch_invalidations`
13. `wallet_challenges`, then `wallet_verifications`
14. `settlement_executions`, then `settlement_execution_events`
15. `settlement_attempts`, then `settlement_attempt_events`, `settlement_attempt_transactions`
16. `signer_set_snapshots`
17. `activity`
18. `auth_audit`
19. Not migrated by default: `auth_sessions`, `auth_challenges`, `rate_events`, `schema_migrations` (section 6)

`activity` and `auth_audit` are loaded last so their foreign keys to users and organizations are satisfied without deferring constraints. No constraint is disabled at any point.

### 5.4 Transaction and batching

- **One PostgreSQL transaction for the whole load** (all-or-nothing). At Testnet scale this is simplest, keeps the target empty on failure, and makes the run restartable by re-running from scratch. **Unknown:** the actual data volume; if it proves large (more than a few hundred thousand rows), switch to one transaction per table with a progress ledger, since immutable-table triggers do not block `INSERT` and a partial load can be resumed after clearing the target schema (never in production without owner approval).
- Rows are inserted in batches of 500 to 1000 with `INSERT ... SELECT ... FROM unnest($1::text[], $2::timestamptz[], ...)` so no row-by-row round trip and no new dependency (`COPY` would need `pg-copy-streams`).
- Use `SET LOCAL lock_timeout`, `statement_timeout = 0` for the load transaction, and `SET LOCAL session_replication_role` is **not** used: constraints and triggers stay on.
- Identity columns are `GENERATED ALWAYS`; inserts use `OVERRIDING SYSTEM VALUE` to keep each source `seq`. After each such table: `SELECT setval(pg_get_serial_sequence('tobin.<t>','seq'), max(seq))`; for empty tables leave the sequence untouched.
- **Idempotence.** The utility first creates (in the baseline migration) a `tobin.migration_runs` table and refuses `load` if it already holds a row for this source `sha256` or if any migrated table is non-empty. Running `verify` repeatedly is always safe. Re-running `load` after a failed (rolled back) run is safe because nothing was committed.
- The utility never issues `DELETE`, `TRUNCATE` or `DROP` against the target in production mode. A rehearsal flag `--reset-scratch` may drop and recreate the scratch **schema**, and refuses unless the database name matches a configured scratch name.

### 5.5 Type conversion

| SQLite | PostgreSQL | Rule |
|---|---|---|
| ids and prefixed text | `text` | copy verbatim |
| 64-hex text | `hex64` | copy verbatim; domain check re-validates |
| ISO-8601 UTC text with ms | `timestamptz` | parse as UTC; preflight P4 guarantees the format. Read back, format to the same ISO text with milliseconds, and compare (section 7) |
| `rate_events.at` (integer ms) | `timestamptz` | `to_timestamp(ms/1000.0)`; only if migrated |
| `INTEGER 0/1` flags | `boolean` | `value === 1` |
| counters (`revision`, `attempt`, `seq` as data) | `integer` / identity `bigint` | as numbers (all far below 2^53) |
| amount `TEXT` | `numeric(39,0)` (domain `base_units`) | pass the **string** to PostgreSQL (`$n::numeric`); never through a JavaScript `Number`. `gross`/`total_amount` same |
| JSON `TEXT` | `json` | pass the exact text; PostgreSQL `json` stores it verbatim (not `jsonb`: key order must survive, target section 6.3) |
| `activity.detail`, `auth_audit.detail` | `text` | verbatim |
| NULLable `TEXT` | same | `NULL` stays `NULL`; empty string stays empty string |
| `asset_ref` etc. | `text` | verbatim |

Dropped on purpose: `settlement_instructions.source_account`, `destination_account`, `validation_status` (preflight P10 first). Added on purpose: `org_id` on child tables (derived, section 5.2 P11), no other values invented.

### 5.6 Immutable, append-only and historical records

- Triggers in the target forbid `UPDATE`/`DELETE`/`TRUNCATE` but allow `INSERT`; the utility only inserts. The role used is `tobin_owner`; the runtime role `tobin_app` has no migration privileges.
- Content is copied **byte-exactly** and never recomputed: `calculations.input_json/positions_json/input_hash`, `settlement_batches.instructions_hash`, `settlement_instructions.fingerprint`, `settlement_attempts.plan_fingerprint/plan_json`, signer fingerprints, tx hashes. The utility **verifies** them (section 7) but does not repair a mismatch.
- `seq` values are preserved, so the order of `latestCalculation` (highest `seq`) and event streams is identical.
- The migration itself is recorded in `tobin.migration_runs` (source checksum, tool version, counts, timestamps), not by inserting rows into `activity` or `auth_audit`, which are application-owned histories. **Owner decision:** whether to also append a single audit row "database migrated" (it would be the first row not originating from the old database).
- Selective import (scenario B): `--include-org <id>` restricts every tenant table by `org_id`, includes the users referenced by those rows, and requires that no excluded row is referenced by an included one (checked by running the FK validation on the target; a violation aborts). Cross-tenant references are not expected by the schema: the composite FKs bind children to one organization. Global tables (`users`, `user_wallets`, `auth_audit`) are filtered to referenced users.

## 6. Authentication data: migrate or invalidate

| Table | Decision | Reasoning |
|---|---|---|
| `users.password_hash` | **migrate verbatim** | The hash is a self-describing scrypt string `scrypt$cost$8$1$salt$key` (`auth/service.ts:56-60`) verified by `verifyPassword`, which reads parameters from the string and bounds them. It is portable and needs no re-hash. Wallet-only users hold the literal `'wallet-only'`, which `verifyPassword` rejects (algorithm is not `scrypt`) and `login` excludes by `auth_method='password'` (`:116`). Forcing a password reset is not an option: **Verified** there is no reset flow (architecture document, limitations). |
| `users` (other columns), `user_wallets`, `onboarding` | migrate | identity and wallet bindings. `onboarding` is a preference and may be skipped (the account view recomputes defaults, `auth/service.ts:346`) |
| `auth_sessions` | **do not migrate; all sessions end at cutover** | A row's `token_hash` is a bearer credential (valid 8 to 24 h). Not copying it means a leaked SQLite file or backup cannot yield a usable session on the new system, and it avoids any ambiguity about wallet-session `last_seen_at` idle rules. Cost: every user signs in once more (password users re-enter; wallet users sign a new challenge). Acceptable at this scale. **Owner decision** if a no-logout cutover is required: copy the rows with `expires_at > now` and not revoked; the code path is unchanged. |
| `auth_challenges` | **do not migrate** | 5-minute single-use challenges; any in flight at cutover simply fail and are re-requested |
| `rate_events` | **do not migrate** | 24-hour failure counters; starting empty resets lockout windows (a small, brief reduction in throttling; **Owner decision** to copy the last 24 h) |
| `auth_audit` | **migrate verbatim** | append-only security history; no token or signature in it (`auth/service.ts` comment at `:364`) |
| `invitations` | migrate | only `token_hash` is stored; pending invitations stay valid for up to 7 days; tokens are not re-issuable by the system |
| `wallet_challenges` | migrate all rows | verifications reference a challenge via NOT NULL unique FK; unused expired rows are tiny; **Owner decision** to drop expired unused ones |
| `schema_migrations` | not copied | PostgreSQL has its own ledger; the source version is recorded in `migration_runs` |

Session secrets, signatures and passwords never appear in the migration report.

## 7. Validation

The utility emits a JSON report (no secrets, no hashes of passwords) stored with the backup. A run is valid only if every **error** check passes; the load transaction commits only then.

### 7.1 Counts and checksums

1. Per table: source row count equals target row count (for non-migrated tables the target count is 0 and the report states why).
2. Per table: a **canonical row hash**. For each table the utility fixes the column order of the target schema, renders each row as a JSON array with: strings as is; booleans as 0/1; timestamps rendered as the original SQLite ISO text (`YYYY-MM-DDTHH:mm:ss.sssZ`); amounts as the decimal text (`numeric::text`); JSON columns as their stored text; NULL as `null`. Row hash = SHA-256 of that text. The table hash = SHA-256 of the row hashes concatenated in primary-key order. The source side is computed from SQLite values, the target side from PostgreSQL values read back through the same renderer. Equal table hashes mean every converted value round-trips (including timestamp and amount conversions). For `json` columns the comparison is on the stored text, which proves no re-serialisation occurred.
3. Sequences: for each identity table, `last_value` (or next value) > max(`seq`); a rehearsal inserts nothing in production.

### 7.2 Referential and structural integrity

4. All foreign keys exist as constraints and were validated by the load itself (nothing is deferred or disabled).
5. Orphan queries on the target as an independent check: for each soft-to-hard FK, `SELECT count(*) ... LEFT JOIN ... WHERE parent IS NULL` returns 0.
6. Derived `org_id` consistency: every child row's `org_id` equals its parent's.

### 7.3 Domain invariants (recomputed with the application's own functions where possible)

| # | Invariant | How it is checked |
|---|---|---|
| D1 | Each calculation's `input_hash` equals `inputHash(asset, input)` recomputed from the parsed `input_json` (`clearing.ts:44`) | recompute SHA-256 |
| D2 | Each calculation's stored positions equal `runNetting(sessionId, input)` (same `JSON.stringify` comparison the application makes, `service.ts:618`), net sum is 0, gross matches | re-run the engine; also proves key order survived |
| D3 | **Approved calculation hash equals input hash:** for every `approved` decision, the decision's calculation exists in the same session and organization, and its stored `input_hash` equals the recomputed hash of its `input_json` | joins plus D1 |
| D4 | At most one decision per calculation (`calculation_id` unique); at most one batch review per batch; at most one execution per batch; at most one batch per `(calculation_id, attempt)` | unique constraints in target; also counted on source |
| D5 | **At most one current calculation per session:** "current" = highest `seq`; verify the highest `seq` per session is unique and, as a warning, that `seq` order equals `created_at` order within a session | query |
| D6 | **Wallet uniqueness:** no two active `user_wallets` for the same `(network, public_key)`; `(org_id, network, public_key)` unique in `wallet_verifications`; a revoked wallet has `revoked_at` | partial unique index, constraint, query |
| D7 | Batch integrity: `instruction_count` and `total_amount` equal the instructions; `instructions_hash` equals `instructionsHash(calculationId, assetId, plan, attempt)`; every instruction `fingerprint` (where present) equals `instructionFingerprint(...)`; `integrityChecks(calc, assetId, plan)` all ok | the application's `settlement.ts` functions on stored data |
| D8 | State machines: for each execution and each attempt, the first transition event has `from_state` NULL, each next transition's `from_state` equals the previous `to_state`, and each transition is allowed by `canTransition` (`settlement-state.ts`) | walk events by `seq` |
| D9 | Every execution has at least one event; every attempt has at least one transition event; every attempt transaction references an attempt of the same organization | queries |
| D10 | Each organization has at least one active admin (warning: a violation is application-reachable only through a bug) | query |
| D11 | Provenance rules (three CHECKs) hold | enforced by target constraints |
| D12 | Instruction payers/payees are active-or-removed participants of the batch's session | FK in target |
| D13 | `activity` ids unique; for every session-scoped `kind` the subject is a session of the same organization (warning) | query |

Independent check: D1 to D3 and D7 reuse the application's own code, so they confirm the migration did not change data but are **same-author** checks of the data's internal consistency. Add two plain-SQL counterparts that do not use TypeScript: sums (`SUM(amount)` per batch equals `total_amount`; per session gross) and equality of `input_hash` columns between source and target (already covered by the table hash).

### 7.4 Application-level acceptance on the migrated data (rehearsal and cutover)

1. Start a **read-mostly** instance of the new build against the migrated database; sign in as a known migrated account (password and wallet where available).
2. For a sample of sessions (all, if few): fetch `calculation`, `authorization`, `settlement-batch` views from the PostgreSQL-backed instance and from a SQLite-backed instance of the **old** build running on the backup copy; compare JSON responses after normalising timestamps format. Differences are failures.
3. Run the repository's test suite against the PostgreSQL store (target section 10.3). Test results are not a validation of migrated data; the response comparison in step 2 is.

## 8. Cutover

Prerequisites: rehearsal complete (section 10), owner sign-off, rollback rehearsed, PostgreSQL backup policy active.

| Step | Action | Gate |
|---|---|---|
| 0 | Announce the maintenance window (Testnet users, if any) | |
| 1 | Deploy the **new build** (async store, PostgreSQL driver) to a staging slot pointing at an empty PG; run smoke tests. The old build keeps serving | green |
| 2 | **Freeze writes**: stop the old `apps/web-console` process (the `apps/web` proxy then returns upstream errors for `/api/auth/*` and `/api/registry/*`; `apps/web` itself has no database). **Unknown:** the application has no maintenance mode; stopping is the supported freeze. Confirm no process holds the file (`-wal` empties after a clean close) | process stopped |
| 3 | `sha256` of the original files; `.backup` or `VACUUM INTO` to a new file; `sha256` of the backup; copy off-host; mark originals read-only | checksums recorded |
| 4 | Preflight (section 5.2) on the backup; stop on any error | zero errors |
| 5 | `load` into the empty production PostgreSQL (single transaction) | commit |
| 6 | `verify` (section 7.1 to 7.3) against the committed data | all pass; report archived |
| 7 | Point the new build at the production database (`DATABASE_URL`), start it, run the read-mostly smoke tests (7.4); **no writes yet** | pass |
| 8 | Open traffic. From the first accepted write on, rollback is no longer lossless (section 9) | |
| 9 | Monitor: error rate, connection counts, lock waits, failed transitions; re-run counts after one hour | stable |
| 10 | Keep SQLite originals and backup read-only for the retention period decided by the owner; delete only the scratch copy created in step 3 for the migration host, after the report is archived | |

**Downtime estimate (Inference, not measured):** the freeze window covers steps 2 to 8. With data of the size implied by a Testnet pilot (small; actual **Unknown**) the file copy, preflight, load and verification are seconds to a few minutes; the window is dominated by deploy and smoke-test time. A rehearsal measures it; the plan promises no number before that. If the actual database is large, switch to per-table transactions (section 5.4) and re-estimate.

## 9. Rollback

| Point | Rollback | Data loss |
|---|---|---|
| Before step 2 | nothing to roll back; keep serving the old build | none |
| Steps 2 to 7 (no write accepted on PG) | restart the **old build** with the original `TOBIN_DB_PATH`; drop or keep the PG database for forensics (do not reuse it without a new empty target) | none: the SQLite file was frozen and only copied |
| After the first PG write (step 8) | restart the old build on the original SQLite file; writes made on PG since step 8 are **not** in SQLite | everything written on PG since cutover. Mitigation: keep the first hours in a supervised window; if rollback is needed, export those rows from PG (they are append-ordered by `seq`/`created_at`) and decide case by case |
| After a successful soak (owner-defined, for example 7 days) | no rollback; SQLite remains as an archive | n/a |

A reverse migration (PG to SQLite) is **not** provided and is not recommended: it would need a second tool and would reintroduce the sync driver. The single-writer SQLite file is the rollback target only for the window above.

**Safety rules (hard):** (1) the original SQLite files and the verified backup are never deleted, truncated, vacuumed in place, migrated in place or overwritten by any step; (2) the utility has no code path that writes to the SQLite source; (3) a failed `load` leaves the PG target empty (rolled back); (4) the old build is not started against the original file during steps 3 to 8; (5) deleting a scratch copy requires the report to be archived and the backup checksum verified.

## 10. Rehearsal and dual-run options

### 10.1 Rehearsal (required)

1. Take a backup copy of the real source (or, if none exists, a generated fixture database built by the application's own `migrate()` plus `seed-demo` and a scripted scenario that exercises: wallet and password users, organizations with reviewers, a session through calculation, approval, batch, review, execution, attempts with events and tx hashes, a signer snapshot, an invitation, a revoked wallet).
2. Create a scratch PostgreSQL database with the baseline schema; run preflight, `load`, `verify`; time each phase.
3. Fault injection: truncated copy, a row with a malformed timestamp, an amount above i128, a JSON column with invalid text, an orphan actor, a mutated `input_hash`; each must produce the documented error and leave the target empty.
4. Determinism: run `load` into two fresh scratch databases and compare the `verify` reports (table hashes must be identical).
5. Repeat until **two consecutive clean rehearsals**; record the report with the source checksum. Run the browser journeys (`apps/web-console/test/browser`) against the migrated data in a scratch environment.
6. Rehearse the rollback (start the old build on the original-copy file).

### 10.2 Dual-run options

| Option | Verdict | Reason |
|---|---|---|
| Dual-write (application writes SQLite and PostgreSQL) | **rejected** | No distributed transaction; any partial failure diverges; the SQLite side is synchronous and the PG side asynchronous so ordering and error handling differ; doubles the surface of a store refactor that is already the main risk (target section 10). Immutable tables make repairing divergence hard |
| Continuous replication / CDC from SQLite | **rejected** | No tool for SQLite, the single-writer WAL file is not a replication source, and the volume does not justify building one |
| Shadow read (old and new instances answer the same read requests; responses compared) | **recommended for rehearsal and the cutover smoke test only** | Gives real evidence the migrated data behaves identically (section 7.4) without writing to two stores |
| Blue/green with a short write freeze | **recommended** | It is the procedure in section 8 |

## 11. Migration of operator state outside the database

- `supported_assets` rows are operator configuration written by `scripts/db.ts` (`asset-add`). They are copied by the utility. **Unknown:** how `contract` assets are created (the script cannot); verify and re-seed or document before cutover.
- Environment: `TOBIN_STELLAR_CLEARING_CONTRACT` and other Stellar settings are unchanged; add `DATABASE_URL`; remove `TOBIN_DB_PATH` from production once cutover is complete (an unused SQLite fallback in production is not wanted).
- Cookies: sessions end at cutover; cookies remain valid strings but resolve to nothing, so users see the sign-in screen. The wording of the maintenance notice should say so (without claiming more than that).
- Documents to update after the work (not part of this proposal): `BACKEND_PERSISTENCE_DATA_MODEL.md` (already stale for migrations 2 to 8), the operations document (backup/restore).

## 12. Owner decisions required

1. Which databases exist and which data must survive (section 2). This selects scenario A, B or C and may remove most of this plan.
2. Approve the `pg` dependency and PostgreSQL hosting (target section 18).
3. Sessions: end all sessions at cutover (recommended) or copy live ones.
4. Rate counters: start empty (recommended) or copy the last 24 hours.
5. Whether to exclude fixture organizations and sessions from the import.
6. Retention period for the frozen SQLite files and the backup, and where they are stored (they contain password hashes and invitation hashes: access must be restricted, `BACKEND_PERSISTENCE_OPERATIONS.md`).
7. Whether a "database migrated" row is added to `activity` or `auth_audit` (recommended: no, use `migration_runs`).
8. Treatment of historical rows that fail the new FKs or domains (fix, relax the constraint, or exclude).
9. Rollback window length and who may call it.
10. Soak period before the SQLite archive is considered final.

## 13. Limits of this plan

- **Unknown:** data volume, number of databases, host capabilities (roles, backups), exact Node 24 minor for the read-only open option.
- The verification relies on the application's own hash code; it checks that stored evidence is self-consistent after migration, not that the evidence was ever correct. The evidence is same-author and no independent security review has been performed on the schema, the migration or the application.
- Nothing here has been run. Times and risk statements marked Inference must be replaced by rehearsal measurements.
