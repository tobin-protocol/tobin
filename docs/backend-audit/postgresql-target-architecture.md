# PostgreSQL target architecture (proposal)

Status: **proposal, not applied.** No PostgreSQL database was created or touched while writing this. The DDL in section 15 is a design artefact to be reviewed; it is not a migration file.

Labels: **Verified** (read in code), **Recommendation**, **Inference**, **Unknown**, **Owner decision**. The current schema is described in `sqlite-database-inventory.md` (called "the inventory" below). The procedure to move data is in `sqlite-postgresql-migration-plan.md`. Paths are relative to the repository root.

## 1. Context and goals

- **Verified.** The application is a single Next.js process (`apps/web-console`) with one embedded database. `BACKEND_PERSISTENCE_ARCHITECTURE.md` (section 11) names the limits: single instance, no managed backup, experimental `node:sqlite`, and says PostgreSQL "via the store interface is the follow-on".
- **Verified.** The product is Stellar Testnet only and pre-production (`AGENTS.md`, section 1). Nothing in this proposal changes that, the contracts, token or signing authority.
- **Goals (Recommendation).** (1) A durable, backed-up, multi-connection database that preserves every guarantee the SQLite schema gives today. (2) No change to domain rules or API behaviour in the same step. (3) Make tenant isolation and audit immutability enforceable by the database, not only by the application. (4) Keep the design small: one database, one schema, hand-written SQL, no ORM.
- **Non-goals.** Microservices, event sourcing, cross-region replication, Mainnet readiness, changing hashing or digest formats.

## 2. Key finding: guarantees SQLite gives implicitly

These are the properties the code relies on without stating them. A PostgreSQL port must replace each one explicitly.

| Implicit SQLite property | Where the code relies on it | PostgreSQL replacement |
|---|---|---|
| All write transactions are serialized (`BEGIN IMMEDIATE`, single connection) | every read-check-write in `registry/service.ts` | per-organization advisory lock or row lock at transaction start (section 8) |
| `seq AUTOINCREMENT` order equals commit order | `latestCalculation` = highest `seq` (`sqlite-store.ts:90`); "last decision/batch" lists | identity column plus per-session serialization (section 8). Without it, concurrent commits can reorder sequence values |
| `TEXT` columns return the exact stored JSON text | `JSON.stringify(again.positions) === JSON.stringify(latest.positions)` at `registry/service.ts:618` | use `json` or `text`, **not** `jsonb` (section 6.3) |
| Constraint violation messages contain `UNIQUE` | `/UNIQUE/i` tests at `registry/service.ts:584, 670, 749, 878, 911`; `auth/service.ts:288` | map SQLSTATE `23505` to the same domain errors in the PG store |
| Trigger aborts also stop `ON DELETE CASCADE` | immutable tables under cascading parents | PG row triggers fire for cascaded deletes too; same behaviour |
| `foreign_keys = ON` per connection | every table | always on in PG; no pragma |
| Reads see the committing writer's data immediately (one process) | reads right after writes in the same request | same transaction or read-committed is sufficient |

## 3. Schema structure

**Recommendation: one database, one application schema named `tobin`, two roles.**

- Tables in a dedicated schema rather than `public`: privileges can be granted to exactly the schema, `public` can stay empty, and the `search_path` of the application role is explicit. Cost: every migration and the driver config sets `search_path = tobin`. Benefit over `public`: clean `REVOKE ALL ON SCHEMA public` posture independent of PostgreSQL version defaults (PostgreSQL 15 revoked `CREATE` on `public` from `PUBLIC` by default; older versions did not).
- **Not** multiple schemas (auth / registry / audit). The tables are coupled by foreign keys (`user_id`, `org_id` everywhere); splitting by schema would add qualified names without adding isolation. **Inference:** at this size one schema is the simplest correct choice.
- Roles: `tobin_owner` (runs migrations, owns objects) and `tobin_app` (runtime: `SELECT/INSERT/UPDATE/DELETE` where needed, no DDL). Railway's default database user is a single powerful role (**Unknown** for the specific plan; verify); creating two roles requires being able to `CREATE ROLE`. If it cannot be done, fall back to one role and rely on triggers for immutability, and record that as a weaker posture.
- Extensions: none required. (`pgcrypto`/`citext`/`uuid-ossp` are not needed under this design.)

## 4. Primary key strategy

**Recommendation: keep the existing text identifiers, including prefixes.** Do not move to `uuid`.

Reasons (all **Verified** unless stated):

1. Identifiers are part of hash inputs. `calculations.input_json` contains obligation ids, participant user ids and debtor/creditor ids; `inputHash` is SHA-256 over it (`clearing.ts:44`). Instruction ids embed a hash of ids (`settlement.ts:53`) and fingerprints cover ids (`settlement.ts:62`). Rewriting ids would invalidate stored immutable evidence.
2. Identifiers are in API responses, activity text (`registry/service.ts` log strings contain `short(id)`), cookies and URLs (`/api/registry/orgs/<id>/...`). A change is a visible API change.
3. 64-hex session and obligation ids are the Stellar on-chain `BytesN<32>` id (sessions) and a 256-bit random value (obligations). They are domain values, not surrogate keys.
4. The prefix (`usr_`, `org_`, `calc_`...) self-describes in logs and is generated in application code (`id()` at `registry/service.ts:34`); no database default is needed, so nothing changes.

Storage form: `text` for prefixed ids; `text` with a regex check (domain `tobin.hex64`) for 64-hex values. `bytea` for the 32-byte values would halve index size but require encode/decode in every query and in hash input; the saving is negligible at this scale (**Inference**), so rejected.

`seq` columns (activity, calculations, authorization_decisions, batches, reviews, execution/attempt events, signer snapshots, auth_audit, rate_events): `bigint GENERATED ALWAYS AS IDENTITY`. For imports, `OVERRIDING SYSTEM VALUE` plus `setval` afterward (migration plan, section 8). Stellar identifiers are stored as text: `G...`/`C...` strkeys (56 chars), 64-hex tx hashes and fingerprints. Contract ids and tx hashes are not generated by the database.

Natural composite keys that exist today are preserved: `(org_id, user_id)` memberships, `(session_id, user_id)` participants, `(org_id, network, public_key)` wallet verifications.

## 5. Foreign keys and referential design

**Recommendation: preserve every existing FK, turn the strongest soft references into real FKs, add `org_id` to child tables that lack it, and use composite FKs to bind children to the parent's organization.**

Current state (inventory section 6): strict composite FKs for session children; soft text references for "who" columns and for batch/instruction/attempt children.

Proposed changes, each with the reason:

| Change | Reason | Risk |
|---|---|---|
| `org_id` on `authorization_invalidations`, `settlement_batch_reviews`, `settlement_batch_invalidations`, `settlement_execution_events`, `settlement_attempts`, `settlement_attempt_events`, `settlement_attempt_transactions`, and `NOT NULL` on `settlement_instructions.org_id`, with composite FKs `(parent_id, org_id)` | Every private row then carries its tenant and the database refuses a child under another tenant's parent. Values are derivable by joining to the parent (Verified: each child has a mandatory parent) | requires a derive step in migration; validate no nulls (`settlement_instructions.org_id` is nullable today for legacy rows) |
| `calculations UNIQUE (id, session_id, org_id)`; `authorization_decisions` and `settlement_batches` FK `(calculation_id, session_id, org_id)` | today a decision or batch could name a calculation of another session if application code erred; only the id existence is checked | existing data must satisfy it; validation query provided in the migration plan |
| FK on `*_by` / `decided_by` / `actor` / `initiator` / `recorded_by` / `by_actor` to `users(id)` | users are never deleted (no delete path; `users` rows only have `disabled`) | historical test data with unknown actors would block the import; validation first, owner decides to drop FK or fix |
| `auth_sessions.wallet_id` FK `user_wallets(id)`; `auth_audit.user_id` FK `users(id)` | stated as relationships in code comments (`auth/service.ts:158`) but not declared | low |
| `settlement_instructions (session_id, payer)` and `(session_id, payee)` FK to `session_participants(session_id, user_id)` | participants are soft-removed, never deleted, so the FK holds forever | low |
| `settlement_instructions.approval_decision_id` FK `authorization_decisions(id)` | currently only filled, never constrained | nullable for legacy rows |
| Drop `settlement_instructions.source_account`, `destination_account`, `validation_status` | **Verified** dead: `CHECK (source_account IS NULL AND destination_account IS NULL)` (`database.ts:375`), `validation_status` is always `'valid'`, and the store's INSERT omits all three (`sqlite-store.ts:102`) | none for the application; **Owner decision** if the "stabilized instruction contract" must keep the names |

**Cascade behaviour (preserve, flag).** `memberships` removal cascades to `org_reviewers`, `wallet_challenges` and `wallet_verifications` (Verified, inventory 4.2 and 4.6). The last one deletes evidence of wallet ownership that settlement execution uses and that activity text refers to. Preserving it keeps behaviour identical; **Owner decision** whether to instead hang `wallet_verifications` off `users(id)` so removal of a member does not delete wallet proofs. I preserve it in the DDL and mark it.

**No `ON DELETE CASCADE` into immutable tables is exercised** (no deletion path); retained as in SQLite so a mistaken org delete aborts.

## 6. Data types

### 6.1 Timestamps

**Recommendation: `timestamptz` for every timestamp except values that are hash inputs.** Current format is ISO-8601 UTC text with milliseconds (`toISOString()`), lexicographically sortable (inventory section 10).

- Benefits: native comparisons and arithmetic for expiry and retention; interval purge queries; no format drift.
- Compatibility: PostgreSQL stores microseconds; input has milliseconds, so conversion is lossless. The pg driver returns JavaScript `Date`; the store must map to `date.toISOString()` to keep API strings identical (`2026-11-09T10:00:00.000Z`). **Verified:** no timestamp is part of any hash input found in `clearing.ts`, `settlement.ts` or the instruction fingerprint (`settlement.ts:62` lists ids, seq, parties, asset, amount). Timestamps inside JSON columns (for example `evidence_json`) remain text inside the JSON.
- Exception: `rate_events.at` is epoch-ms `integer` today; convert to `timestamptz` or keep `bigint`. Recommend `timestamptz` with `default now()`; the application currently supplies its own clock (tests inject clocks), so keep supplying values rather than `now()` defaults.

### 6.2 Amounts

**Recommendation: `numeric(39,0)` behind a domain, read as a string.**

Facts (**Verified**): amounts are decimal-digit strings of whole base units, 1..39 digits, positive for obligations/instructions, capped at `I128_MAX = 2^127-1` in code (`clearing.ts:12, 17-22`); computed with JavaScript `BigInt`; never summed in SQL. Net positions can be negative (`positions_json[].net`). `2^127-1` has 39 digits (170141183460469231731687303715884105727).

- `bigint` (int64, max 9.22e18) is **not** sufficient: the code and Soroban `i128` allow larger values, and a 7-decimal token multiplies quantities by 10^7. Stellar classic amounts are int64 stroops, but the application deliberately accepts up to i128.
- `numeric(39,0)` stores exact integers up to 10^39-1 and the domain `CHECK` narrows it to the i128 range, which `numeric(39,0)` alone does not. `pg` returns `numeric` as a string by default, matching today's contract with no float risk. **Verify in the PG store tests** that the driver type parser is not overridden to `Number`.
- Alternative kept for comparison: `text` with the existing digit CHECKs. Zero DB work, exact round trip, but no range check and no SQL arithmetic for future reporting. Rejected because the range check against i128 is currently application-only.
- **Unknown:** the decimal scale of "base units" (the registry never scales). Do not encode scale in the database type.

### 6.3 JSON: `json`, not `jsonb`, not normalised

**Recommendation: `json` (text-preserving) for all current JSON columns.**

**Verified hazard.** `registry/service.ts:618` computes `JSON.stringify(again.positions) === JSON.stringify(latest.positions)` where `latest.positions` comes from `JSON.parse(positions_json)`. `positions` are objects written as `{userId, net}`. `jsonb` does not preserve key order (it orders keys by length, then bytewise), so `net` would come back before `userId`, `JSON.stringify` would differ, the `recalculation` check would report false, and settlement preparation would fail for every calculation. `json` returns the stored text verbatim and avoids this. Using `jsonb` would require changing application comparison code (compare canonically) first.

- Nothing in `lib/` queries inside JSON (no `json_extract`), so `jsonb` operators and GIN indexes add no value today.
- Normalising now would not pay: `input_json`, `positions_json`, `plan_json`, `evidence_json`, `signers_json`, `thresholds_json`, `accounts_json`, `chain_json`, `validation_json` are snapshots whose exact content is evidence. Normalised tables would be a second representation to keep consistent with the hash.
- Candidates to normalise later (Recommendation, not now): `calculations.positions_json` (per-user net) if reporting by participant is needed; `signer_set_snapshots.signers_json`.
- `activity.detail` and `auth_audit.detail` stay `text`: the separation-of-duties rule parses `detail` with `startsWith('obligation <short>')` (`authorization.ts`, in `conflictedActors`), so its exact text is behaviour.

### 6.4 Other types

| Column kind | PG type | Notes |
|---|---|---|
| ids (prefixed) | `text` | section 4 |
| 64-hex values | domain `tobin.hex64` (`text` + regex) | session_id, obligation id, hashes, tx_hash |
| Stellar account `G...` | domain `tobin.g_address` (`^G[A-Z2-7]{55}$`) | existing CHECKs are weaker on some tables (length plus first letter only); the application uses this regex in `linkWallet` (`registry/service.ts:32`) and strkey checks elsewhere. Validate before import |
| Contract id `C...` | `tobin.c_address` | |
| enums (role, status, provenance...) | `text` + `CHECK (... IN (...))` | PG `ENUM` types are painful to shrink; CHECK matches the existing SQL and is trivially evolvable by migration |
| booleans stored 0/1 | `boolean` | `users.disabled`, `onboarding.profile_done`. Store layer converts (today code compares `=== 1`, `auth/service.ts:119`) |
| counters | `integer` | `revision`, `attempt`, `attempt_no`, `step_index`, `failures`, `instruction_count` |
| text lengths | `CHECK (char_length(x) BETWEEN a AND b)` | SQLite `length()` counts characters; same |
| free text | `text` | no `varchar(n)`; constraint carries the limit |

## 7. Constraints

Preserve all existing `CHECK`, `UNIQUE`, `NOT NULL` semantics; translate `GLOB` to regex (`~`). Specifics:

- Provenance integrity checks on `sessions` carry over verbatim (three CHECKs).
- Partial unique index `user_wallets_active_key` carries over (PostgreSQL supports `CREATE UNIQUE INDEX ... WHERE status = 'active'`).
- `supported_assets` identity CHECK (`id` = built string) carries over using `||`.
- New: amount range domain; `org_id` composite FKs (section 5).
- **Not enforceable by constraint, remain application rules (Verified):** one asset per session; at least one active admin per organization (section 8 for locking); one active `link` per user cap of five wallets; reviewer separation of duties; "a user may not belong to two orgs with names equal ignoring case/space" (`registry/service.ts:73-74`, a per-user cross-row rule).

## 8. Isolation level, locking and race-prone operations

### 8.1 What the code does

All Registry mutations run in `transaction()` which is `BEGIN IMMEDIATE` (serialized). Reads before writes are therefore race-free today. In PostgreSQL's default `READ COMMITTED`, two concurrent transactions can both pass a check and both write. The table lists the operations where this matters (**Verified** from the code, race analysis is **Inference**).

| Operation (service.ts) | Check then write | What stops a double-write in PG without locking | What is missing |
|---|---|---|---|
| `setRole`, `removeMember`, `setMemberStatus` (:105-149) | count active admins, then change one | nothing | two admins demoting each other concurrently leave zero admins. Needs a lock |
| `acceptInvitation` (:178-197) | read status `pending`, set `accepted`, insert membership | `memberships` PK blocks a second membership for the same user; nothing blocks two different users using one token | single use can break. Needs `UPDATE ... WHERE status='pending'` row count check or lock on the invitation |
| `createOrganization` (:65-84) | name-ambiguity check across user's orgs | nothing (rule only in app) | benign duplicate-ish orgs; accept or per-user advisory lock |
| `recordSession` (:218-229) | `getSession` then insert | PK on `session_id` | surfaces as raw PK error instead of `EXISTS`; map `23505` |
| `createObligation`/`updateObligation`/`voidObligation`, participant add/remove (:285-404) | `#editable` state check, then write, then `#invalidate` | nothing | a state change to `ready` or a `calculate` running concurrently can see half of an edit or miss an invalidation |
| `calculate` (:414-438) | read participants+obligations, compute, insert snapshot | nothing | snapshot may not match final state when an obligation commits in between; stale detection would catch it later, but invalidation of decisions could be skipped. Needs session lock |
| `decide` (:566-588) | latest check, currency check, decision uniqueness | `UNIQUE (calculation_id)` | a calculation superseded between the check and insert yields a decision on a stale snapshot. Needs session lock |
| `prepareSettlementBatch` (:646-674) | attempt number from `earlier.length+1`, `#evaluate`, insert | `UNIQUE (calculation_id, attempt)` | two concurrent preparers, one fails with `EXISTS` (acceptable); preparation vs concurrent edit not covered |
| `decideSettlementBatch` (:732-753) | status check, insert review | `UNIQUE (batch_id)` | invalidation race as above |
| `startSettlementExecution` (:800-819) | `executionOfBatch` then insert | `UNIQUE (batch_id)` on executions | fine, maps to `EXISTS` |
| `beginExecutionAttempt` (:855-882) | attempt_no = count+1; retry policy reads last attempt state | `UNIQUE (execution_id, attempt_no)` | two concurrent attempts: second fails (OK); but policy decision based on last state may be read stale |
| `advanceExecutionAttempt` / `advanceSettlementExecution` (:830-923) | read current state (last event), validate transition, insert event | tx hash PK and `(attempt, step)` unique cover submission duplicates | **two concurrent transitions from the same state can both succeed**: the event log has no `(attempt_id, expected_from)` guard. Needs a lock on the attempt, or a unique/conditional insert |
| `verifyWalletChallenge` (:771-788) | read challenge, verify signature, mark used, insert verification | `wallet_verifications` PK (org, network, key) | `markChallengeUsed` is `WHERE used_at IS NULL` but its row count is not checked (`sqlite-store.ts:124`) |
| `AuthService.verifySignIn`/`#consume` (:213-263) | single guarded `UPDATE ... consumed_at IS NULL` with row-count check | already correct | none; the new-user path relies on the partial unique index |
| `AuthService.issueLinkChallenge`/`verifyLink` (:267-291) | wallet cap and uniqueness | partial unique index | the cap of 5 wallets is count-then-insert |
| `login` rate limit (:111-126, 370-375) | count then fail-insert | nothing | tolerable race (a few extra attempts) |
| Sign-in `DELETE ... auth_challenges`/`rate_events` | cleanup on write path | n/a | lock contention only |

### 8.2 Recommendation

1. **Default isolation: `READ COMMITTED`** plus explicit locks. `SERIALIZABLE` would make the existing read-check-write code correct as written, but every conflicting transaction can fail with `40001` and the store would need a retry wrapper around every use; the service closures have side effects (random ids, hashed tokens, clock reads) that are safe to rerun, but at least `invite` returns a token generated inside the closure which a retry would regenerate. `READ COMMITTED` + locks keeps the code path deterministic. **Inference:** `SERIALIZABLE` is a reasonable second line if the owner prefers fewer hand-placed locks; test cost is higher.
2. **Lock rule: every `Registry` mutating transaction first takes a transaction-scoped advisory lock on its organization**, `pg_advisory_xact_lock(hashtextextended('org:' || org_id, 0))`. This reproduces SQLite's serialization at per-tenant granularity: sessions, obligations, calculations, decisions, batches, executions, attempts, memberships, invitations all have an `org_id`. Different organizations run in parallel. Requires the store interface to know the org: `transaction(scope: {orgId}, fn)` (section 10).
   - Alternative: `SELECT ... FROM tobin.organizations WHERE id = $1 FOR UPDATE`. Works (the table is mutable) and shows in `pg_locks` as a row lock. Prefer it over advisory locks if the owner wants lock visibility without custom hashing. Do **not** lock rows in immutable tables with `FOR UPDATE` if `UPDATE` privilege is revoked on them (PostgreSQL requires `UPDATE` privilege for `FOR UPDATE`).
   - Operations that do not know their org up front: `acceptInvitation` (token lookup first, then lock that invitation's org), `createOrganization` (no org yet: lock `user:<id>` for the name rule, optional), sign-in (guarded updates, no org).
3. **Always check row counts** on guarded updates (`markChallengeUsed`, invitation accept) and map `23505` to the same `RegistryError` codes the code gets from SQLite messages.
4. **Guard state transitions in SQL** for execution/attempt events: insert the event with `from_state` taken from the locked read; add a partial uniqueness guard (for example a unique index on `(attempt_id, from_state) WHERE kind='transition'` would be wrong because states can repeat, so rely on the org lock instead). **Recommendation:** rely on the org lock; do not add another constraint.
5. **Do not hold a transaction across hashing, signature verification, or a network read.** Currently `scrypt` is awaited outside DB access (`login`), and RPC/Horizon reads happen outside `Registry` transactions (`requireSignerSetAdmin` is a no-write check "before any network read", `registry/service.ts:956`); keep that, because PG connections are scarce.
6. Add `SET LOCAL lock_timeout = '5s'` and `statement_timeout` in each transaction so a stuck lock fails visibly (mirrors the 5 s `busy_timeout`).

## 9. Concurrency, connection pooling and Railway

- **Verified.** The backend is a process-wide singleton on `globalThis` (`backend.ts:37-55`); Next.js route handlers share it.
- **Recommendation: `pg.Pool`, `max` 10 to start**, `idleTimeoutMillis` 30 s, `connectionTimeoutMillis` 5 s, `idle_in_transaction_session_timeout` 30 s (server or per-connection `options`), `application_name = 'tobin-web-console'`. With a single app instance, 10 is generous: transactions are short. If more instances are ever run, `max` x instances must stay below the server's `max_connections` minus headroom. **Unknown:** Railway Postgres `max_connections` for the chosen plan; check.
- **Transaction-scoped features only** (`SET LOCAL`, `pg_advisory_xact_lock`): safe with PgBouncer transaction pooling if one is later added. Avoid session-level `SET`, session advisory locks, `LISTEN/NOTIFY`, and server-side prepared statements by name if a transaction pooler is introduced. Not needed now.
- **TLS:** use `sslmode=require` (or `verify-full` with the provider CA, if available) on the connection URL. **Unknown** whether Railway's internal network offers TLS; verify.
- **Config:** a `DATABASE_URL` environment variable (secret, never logged). Keep the existing fail-closed behaviour: production without it answers 503 (mirrors `backend.ts:20-24`). **Do not** keep a SQLite fallback in production.
- **Readiness:** `/api/health` already reports migration state (`app/api/health/route.ts` uses `migrationStatus`); the PG version should report the same plus a `SELECT 1`.

## 10. The store interface and the sync-to-async refactor

### 10.1 What exists

- **Verified.** `RegistryStore` has 59 methods (`store.ts:7-76`), all synchronous and returning plain values; `SqliteRegistryStore` implements them with `node:sqlite` `prepare().get/all/run` (synchronous). `Registry` (`service.ts`) calls the store 169 times (grep of `this.#s.*`), inside closures passed to `transaction(fn)`, which is synchronous.
- **Verified.** `AuthService` (`auth/service.ts`) does **not** use the interface; it issues SQL through `db.raw.prepare(...)` at 49 `db.raw` call sites (grep), including hand-written `BEGIN IMMEDIATE/COMMIT` in two methods. It will need its own store interface.
- **Verified.** `InMemoryRegistryStore` also implements the interface for unit tests (`store.ts:78-172`).
- **Verified.** `createBackend`/`getBackend` are synchronous and construct everything eagerly (`backend.ts:29-55`). `scripts/db.ts` and route handlers use them synchronously.

### 10.2 What a Postgres implementation must change

Postgres access (`pg`) is asynchronous. There is no synchronous PG driver in a Node server that should be used. The impact, stated precisely (**Inference** from counts above, not a measured estimate):

1. Every `RegistryStore` method returns a `Promise`. `Registry` methods (about 60, public and private, by grep) become `async`, and every internal helper that touches the store (`#role`, `#need`, `#opSession`, `#editable`, `#invalidate`, `#evaluate`, `#batchStatusOf`, ...) becomes `async`. 169 call sites gain `await`.
2. Closures that use the store inside array callbacks must become loops: for example `settlementBatches` maps over batches calling `#batchStatusOf` (`service.ts:708`), `#evaluate` filters batches then calls `#batchStatusOf` inside `.find` (`:626`), `#need` is called from many `filter/some` expressions. Each needs `for ... of` with `await`; behaviour must be kept.
3. `transaction(fn)` must give the closure a transaction-bound store (or use `AsyncLocalStorage`) so all queries inside use the same pooled client. Nested calls currently join the outer transaction by a depth flag (`database.ts:629`); the async version must preserve "nested joins" explicitly. **Recommendation:** `transaction<T>(scope, fn: (tx: RegistryStore) => Promise<T>)`, with `tx` being a store bound to one client; Registry methods called inside receive `tx` through an internal parameter or a per-call context.
4. `createBackend`, `getBackend`, `Registry` construction, route handlers, `scripts/db.ts` become async initialisation. `getBackend()` is called "per request" and is synchronous; the singleton promise pattern is needed.
5. Auth: `AuthService.verifySignIn`/`verifyLink` use manual `BEGIN IMMEDIATE ... COMMIT` with a commit-then-rethrow for failure bookkeeping (`auth/service.ts:233-262`). PG equivalent: two transactions (record failure and commit; then proceed), or a savepoint approach. Must be re-done carefully; the failure counters must persist even when the sign-in is refused.
6. Tests: at least 7 test files build a Registry/backend (grep of `new Registry|createBackend|new AuthService` in `apps/web-console/test`), plus the conformance helpers. They use synchronous calls and inject clocks; all become async. The in-memory store may be kept for unit tests but must become async to share the interface (or keep a thin sync-to-promise wrapper).
7. **Performance consequence (Inference).** Each store call is now a network round trip (sub-millisecond to a few ms in the same region) instead of an in-process call. `#evaluate` alone triggers many calls (`calculationView` runs three reads; `authorization` repeats them; `#batchStatusOf` is invoked per batch); one request such as "prepare batch" or "view batch" may issue dozens to a hundred or more queries (**not measured**). Mitigations, in order: (a) measure first; (b) per-request memoisation of repeated reads inside a transaction; (c) loaders that fetch a session aggregate (participants, obligations, latest calculation, decisions, invalidations) in a handful of queries; (d) add `activityOfSession` instead of fetching all activity of an org for separation-of-duties.

### 10.3 Recommended sequencing

1. Make the interface asynchronous while still backed by SQLite (wrap sync results in resolved promises). Tests and handlers migrate with no database change; the suite proves behaviour is unchanged. Risk: low. This isolates the refactor from the database change and is the main way to keep the PG cutover small.
2. Introduce `PostgresRegistryStore` and `PostgresAuthStore` and run the same test suite against both (the conformance harness exists as `test/w1-store-conformance.*`; **Unknown** whether it targets the registry store or the W1 mock).
3. Only then add locking (section 8) and the transaction-scope parameter.

## 11. Indexes and query performance

Derived from the real query patterns (inventory section 7). PostgreSQL does not index foreign keys automatically; because rows in parents are never deleted, only indexes that serve reads are listed.

| Index | Serves |
|---|---|
| PKs and UNIQUEs as in the DDL | token resolve, invitation hash, wallet uniqueness, tx hash |
| `memberships (user_id)` | `membershipsOfUser` on login/account view |
| `sessions (org_id, created_at)` | session list |
| `obligations (session_id, created_at)` | obligation list, netting input |
| `calculations (session_id, seq)` | latest calculation, list |
| `authorization_decisions (session_id, seq)` | decision list |
| `settlement_batches (session_id, seq)` | batch list |
| `settlement_*_events (parent, seq)` | state derivation |
| `activity (org_id, seq)` | org activity; add `activity (org_id, subject, seq)` (Recommendation) for per-session reads |
| `auth_sessions (user_id)`, `(wallet_id)`, **new** `(expires_at)` | revoke-all, wallet revoke, purge job |
| `auth_challenges (expires_at)` | purge |
| `rate_events (key, at)`, **new** `(at)` | window count and the 24 h purge (today the purge has no `at`-leading index) |
| `user_wallets (user_id, status)` and the partial unique | account view, uniqueness |
| `wallet_verifications (org_id, user_id)` | FK index for the cascade and `verificationsOfOrg` |
| `wallet_challenges (org_id, user_id)` | FK index |

**Inference:** at Testnet volumes none of this is performance critical; correctness of constraints and the sequence/locking behaviour matter more than index tuning. Recommend enabling `pg_stat_statements` (if the provider allows) and reviewing before adding more indexes.

## 12. Audit and immutability

**Recommendation: keep trigger-based immutability and add privileges, not a hash chain.**

- Port the 15 fully immutable tables' triggers (inventory section 5) as one generic function plus per-table triggers: `BEFORE UPDATE OR DELETE ... FOR EACH ROW` and `BEFORE TRUNCATE ... FOR EACH STATEMENT`, each raising the same message as today. Keep `user_wallets` revoke-only semantics.
- Add `REVOKE UPDATE, DELETE, TRUNCATE` on those tables from `tobin_app`. Then even a bug (or SQL injection with the app role) cannot rewrite history, while triggers still protect against the owner role's accidental statements. (**Caveat:** trigger and privilege protections do not stop a superuser or the table owner; backups and access to the owner credential are the real control.)
- Triggers apply to cascades, as today; an organization delete aborts.
- **Hash chain across rows: not warranted now.** Reasons: (a) the records are application-level, not evidence presented to third parties; (b) a chain forces ordered writes (already provided by the per-org lock but adds a write dependency to every activity insert); (c) an attacker able to alter rows can recompute a chain unless a root is anchored outside the database; (d) the stronger need is the existing per-record content hashes (batch instructions hash, plan fingerprint, input hash) which already bind the immutable chain of reasoning, and on-chain anchoring for settlement. **Recommendation:** instead export a daily per-organization digest of new `activity` rows to storage outside the database (or the repo release process) when tamper evidence is required; **Owner decision**.
- `activity` is also business-logic input (separation of duties). Treat it as primary data, not only a log: back it up and migrate it with the same care as `calculations`.

## 13. Multi-tenant isolation

**Recommendation: org-scoped schema now, row-level security later and only if it earns its cost.**

1. **Now.** `org_id NOT NULL` on every tenant-owned table and composite FKs binding children to the same organization (section 5). Every store read for a tenant-owned table takes `org_id` in its predicate (today `getObligation(id)`, `getSession(sessionId)`, `participantsOfSession(sessionId)` do not; tenancy is checked afterwards in `Registry`, e.g. `session()` compares `s.orgId !== orgId`, `service.ts:234`). **Recommendation:** extend the store methods to take `orgId` in the PG implementation so the SQL itself is scoped.
2. **Global tables (not tenant-owned):** `users`, `auth_sessions`, `auth_challenges`, `auth_audit`, `rate_events`, `user_wallets`, `onboarding`. Cross-tenant by nature.
3. **Row-level security (RLS)**, reasoned recommendation: **defer; do not enable in the first PostgreSQL release.**
   - Benefit: defence in depth if an application query forgets the `org_id` predicate.
   - Cost / interaction with a pooled connection: the policy needs the current tenant per transaction. With a pool the only safe mechanism is `SET LOCAL app.org_id = '<id>'` (or `set_config(..., true)`) at the start of each transaction; a session-level `SET` leaks the previous request's tenant to the next borrower of the connection. Every code path that crosses tenants (login and sign-in find a user across orgs; `myOrganizations`; `acceptInvitation` finds an invitation by token hash before the org is known; wallet uniqueness is global) needs either a policy exception or a `SECURITY DEFINER` function, or a second connection role. `FORCE ROW LEVEL SECURITY` is needed if the app connects as the table owner. Operator scripts need a bypass role. Query plans can change when policy predicates are not leakproof. Testing matrix grows.
   - Why defer: composite FKs plus an `org_id`-scoped store plus the existing `#need()` check already give three layers; the product has no direct SQL access by tenants; and RLS is easier to add later (the columns it needs exist after this design).
   - If enabled later: only on registry tables; policies `USING (org_id = current_setting('app.org_id', true))`; `FORCE`; a non-owner `tobin_app`; a test that issues each store method under the wrong `app.org_id` and expects zero rows.
   - **Owner decision** whether regulatory expectation requires RLS earlier.

## 14. Domain model: preserve or improve, table by table

| Table | Decision | Reason |
|---|---|---|
| `users` | preserve; types only | placeholder `.invalid` emails for wallet users are awkward (`email` NOT NULL UNIQUE) but changing it changes auth code; **Owner decision** later: make `email` nullable with a partial unique index |
| `auth_sessions` | preserve; add FK for `wallet_id` and purge index | |
| `rate_events` | preserve; `at` index; optionally `UNLOGGED` (owner decision: lockout counters lost on crash vs write cost) | |
| `user_wallets`, `auth_challenges`, `auth_audit`, `onboarding` | preserve | recent, tested design |
| `organizations`, `memberships`, `org_reviewers` | preserve | |
| `org_wallets` | preserve | unproven claims; may later be merged into `wallet_verifications` semantics (owner) |
| `invitations` | preserve; guarded single-use update | |
| `sessions` | preserve; the `session_id` stays the on-chain id | |
| `session_participants` | preserve | soft-removal design is deliberate |
| `obligations` | preserve; optional later `obligation_revisions` history | edits overwrite the row; earlier revisions survive only in snapshots and activity. Adding history is a behaviour/feature decision, not needed for migration |
| `calculations` | preserve; `json` columns; composite unique | |
| `authorization_decisions/_invalidations` | preserve; tenant columns and composite FKs | |
| `supported_assets` | preserve; operator-managed | |
| `settlement_batches`, `settlement_instructions`, reviews, invalidations | preserve; tenant columns; drop dead instruction columns | |
| `settlement_executions`, execution events | preserve | an execution state is derived from the last event; consider a `current_state` column only if reads become hot (not now) |
| `settlement_attempts`, attempt events, attempt transactions | preserve | |
| `signer_set_snapshots` | preserve | |
| `wallet_challenges`, `wallet_verifications` | preserve (flag cascade); long term, unify with `auth_challenges`/`user_wallets` | two overlapping mechanisms; unification is a product decision |
| `activity` | preserve; add `(org_id, subject, seq)` index | |

## 15. Proposed DDL (proposal; not applied)

This is a full proposed schema. It is a reading of the current schema with the changes of sections 5 to 7. Names are kept.

```sql
-- PROPOSAL. Not applied. Run as tobin_owner on an empty database.
CREATE SCHEMA tobin AUTHORIZATION tobin_owner;
SET search_path = tobin;

-- ---- domains ----
CREATE DOMAIN hex64     AS text CHECK (VALUE ~ '^[0-9a-f]{64}$');
CREATE DOMAIN g_address AS text CHECK (VALUE ~ '^G[A-Z2-7]{55}$');
CREATE DOMAIN c_address AS text CHECK (VALUE ~ '^C[A-Z2-7]{55}$');
CREATE DOMAIN base_units AS numeric(39,0)
  CHECK (VALUE >= 0 AND VALUE <= 170141183460469231731687303715884105727); -- 2^127 - 1
CREATE DOMAIN asset_code AS text CHECK (char_length(VALUE) BETWEEN 1 AND 12 AND VALUE ~ '^[A-Z0-9]+$');
CREATE DOMAIN network_t  AS text CHECK (VALUE IN ('testnet','public'));

-- ---- immutability helper ----
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '%', TG_ARGV[0] USING ERRCODE = 'integrity_constraint_violation'; END $$;

-- ---- identity ----
CREATE TABLE users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254),
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL,
  disabled      boolean NOT NULL DEFAULT false,
  auth_method   text NOT NULL DEFAULT 'password' CHECK (auth_method IN ('password','wallet')),
  updated_at    timestamptz
);

CREATE TABLE user_wallets (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  network text NOT NULL CHECK (network = 'testnet'),
  public_key g_address NOT NULL,
  status text NOT NULL CHECK (status IN ('active','revoked')),
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text,
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX user_wallets_active_key ON user_wallets (network, public_key) WHERE status = 'active';
CREATE INDEX user_wallets_user ON user_wallets (user_id, status);
CREATE FUNCTION user_wallets_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'wallet records are kept'; END IF;
  IF OLD.status = 'revoked' THEN RAISE EXCEPTION 'a revoked wallet record is final'; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.network IS DISTINCT FROM OLD.network
     OR NEW.public_key IS DISTINCT FROM OLD.public_key OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN RAISE EXCEPTION 'a wallet record cannot be moved to another user or key'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_wallets_guard BEFORE UPDATE OR DELETE ON user_wallets FOR EACH ROW EXECUTE FUNCTION user_wallets_guard();

CREATE TABLE auth_sessions (
  token_hash   text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  last_seen_at timestamptz,
  auth_method  text NOT NULL DEFAULT 'password' CHECK (auth_method IN ('password','wallet')),
  wallet_id    text REFERENCES user_wallets(id)
);
CREATE INDEX auth_sessions_user ON auth_sessions (user_id);
CREATE INDEX auth_sessions_wallet ON auth_sessions (wallet_id);
CREATE INDEX auth_sessions_expiry ON auth_sessions (expires_at);

CREATE TABLE rate_events (
  id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key text NOT NULL,
  at  timestamptz NOT NULL
);
CREATE INDEX rate_events_key_at ON rate_events (key, at);
CREATE INDEX rate_events_at ON rate_events (at);

CREATE TABLE auth_challenges (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
  purpose text NOT NULL CHECK (purpose IN ('sign-in','link-wallet')),
  network text NOT NULL CHECK (network = 'testnet'),
  public_key g_address NOT NULL,
  user_id text REFERENCES users(id),
  domain text NOT NULL CHECK (char_length(domain) BETWEEN 1 AND 100),
  nonce text NOT NULL CHECK (nonce ~ '^[0-9a-f]{32}$'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  failures integer NOT NULL DEFAULT 0,
  CHECK ((purpose = 'link-wallet') = (user_id IS NOT NULL))
);
CREATE INDEX auth_challenges_expiry ON auth_challenges (expires_at);

CREATE TABLE auth_audit (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL,
  user_id text REFERENCES users(id),
  kind text NOT NULL, subject text NOT NULL, detail text NOT NULL
);
CREATE INDEX auth_audit_user ON auth_audit (user_id, seq);

-- ---- organizations ----
CREATE TABLE organizations (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  visibility text NOT NULL CHECK (visibility IN ('private','public')),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL REFERENCES users(id),
  institution_type text CHECK (institution_type IN ('bank','payment-institution','broker-dealer','fintech','corporate-treasury','other')),
  jurisdiction text CHECK (jurisdiction ~ '^[A-Z]{2}$')
);
CREATE TABLE onboarding (
  user_id text PRIMARY KEY REFERENCES users(id),
  profile_done boolean NOT NULL DEFAULT false,
  last_org_id text REFERENCES organizations(id),
  updated_at timestamptz NOT NULL
);
CREATE TABLE memberships (
  org_id  text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    text NOT NULL CHECK (role IN ('admin','member')),
  since   timestamptz NOT NULL,
  status  text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX memberships_user ON memberships (user_id);
CREATE TABLE org_reviewers (
  org_id text NOT NULL, user_id text NOT NULL,
  granted_by text NOT NULL REFERENCES users(id), granted_at timestamptz NOT NULL,
  PRIMARY KEY (org_id, user_id),
  FOREIGN KEY (org_id, user_id) REFERENCES memberships (org_id, user_id) ON DELETE CASCADE
);
CREATE TABLE org_wallets (
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  address g_address NOT NULL,
  proof text NOT NULL CHECK (proof IN ('none','signature-verified')),
  PRIMARY KEY (org_id, address)
);
CREATE TABLE invitations (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invitee text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','member')),
  token_hash hex64 NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending','accepted','revoked')),
  expires_at timestamptz NOT NULL,
  created_by text NOT NULL REFERENCES users(id)
);
CREATE INDEX invitations_org ON invitations (org_id);

-- ---- clearing registry ----
CREATE TABLE sessions (
  session_id hex64 PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  provenance text NOT NULL CHECK (provenance IN ('fixture','local-draft','chain-read','chain-confirmed')),
  created_at timestamptz NOT NULL,
  chain_json json,
  confirmed_tx_hash hex64,
  workflow_state text NOT NULL DEFAULT 'configuring' CHECK (workflow_state IN ('configuring','ready','closed')),
  UNIQUE (session_id, org_id),
  CHECK ((provenance IN ('chain-read','chain-confirmed')) = (chain_json IS NOT NULL)),
  CHECK ((provenance = 'chain-confirmed') = (confirmed_tx_hash IS NOT NULL))
);
CREATE INDEX sessions_org ON sessions (org_id, created_at);

CREATE TABLE session_participants (
  session_id hex64 NOT NULL, org_id text NOT NULL, user_id text NOT NULL,
  wallet_address text, added_by text NOT NULL REFERENCES users(id), added_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  removed_at timestamptz,
  PRIMARY KEY (session_id, user_id),
  CHECK ((status = 'removed') = (removed_at IS NOT NULL)),
  FOREIGN KEY (session_id, org_id) REFERENCES sessions (session_id, org_id) ON DELETE CASCADE
);

CREATE TABLE supported_assets (
  id text PRIMARY KEY,
  network network_t NOT NULL,
  kind text NOT NULL CHECK (kind IN ('native','issued','contract')),
  code asset_code NOT NULL,
  issuer g_address, contract_id c_address,
  status text NOT NULL CHECK (status IN ('supported','disabled')),
  source text NOT NULL DEFAULT 'operator-configured' CHECK (source = 'operator-configured'),
  added_at timestamptz NOT NULL,
  CHECK ((kind = 'issued') = (issuer IS NOT NULL)),
  CHECK ((kind = 'contract') = (contract_id IS NOT NULL)),
  CHECK (kind <> 'native' OR code = 'XLM'),
  CHECK (id = CASE kind WHEN 'native' THEN network || ':native'
                        WHEN 'issued' THEN network || ':' || code || ':' || issuer
                        ELSE network || ':contract:' || contract_id END)
);

CREATE TABLE obligations (
  id hex64 PRIMARY KEY,
  session_id hex64 NOT NULL, org_id text NOT NULL,
  debtor text NOT NULL, creditor text NOT NULL,
  amount base_units NOT NULL CHECK (amount > 0),
  asset asset_code NOT NULL,
  reference text NOT NULL DEFAULT '' CHECK (char_length(reference) <= 200),
  status text NOT NULL CHECK (status IN ('active','voided')),
  revision integer NOT NULL CHECK (revision >= 1),
  created_at timestamptz NOT NULL, created_by text NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL, updated_by text NOT NULL REFERENCES users(id),
  asset_ref text,
  asset_identity text NOT NULL DEFAULT 'legacy-unresolved' CHECK (asset_identity IN ('canonical','legacy-unresolved')),
  CHECK (debtor <> creditor),
  CHECK (asset_identity = 'legacy-unresolved' OR asset_ref IS NOT NULL),
  FOREIGN KEY (session_id, org_id) REFERENCES sessions (session_id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (session_id, debtor)   REFERENCES session_participants (session_id, user_id),
  FOREIGN KEY (session_id, creditor) REFERENCES session_participants (session_id, user_id)
);
CREATE INDEX obligations_session ON obligations (session_id, created_at);

CREATE TABLE calculations (
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  session_id hex64 NOT NULL, org_id text NOT NULL,
  asset asset_code NOT NULL,
  input_hash hex64 NOT NULL,
  input_json json NOT NULL, positions_json json NOT NULL,
  gross base_units NOT NULL,
  created_at timestamptz NOT NULL, created_by text NOT NULL REFERENCES users(id),
  asset_ref text,
  UNIQUE (id, session_id, org_id),
  FOREIGN KEY (session_id, org_id) REFERENCES sessions (session_id, org_id) ON DELETE CASCADE
);
CREATE INDEX calculations_session ON calculations (session_id, seq);

CREATE TABLE authorization_decisions (
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  session_id hex64 NOT NULL, org_id text NOT NULL,
  calculation_id text NOT NULL UNIQUE,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500 AND ((decision = 'rejected') = (char_length(btrim(reason)) > 0))),
  decided_by text NOT NULL REFERENCES users(id), decided_at timestamptz NOT NULL,
  UNIQUE (id, org_id),
  FOREIGN KEY (calculation_id, session_id, org_id) REFERENCES calculations (id, session_id, org_id)
);
CREATE INDEX authorization_decisions_session ON authorization_decisions (session_id, seq);
CREATE TABLE authorization_invalidations (
  decision_id text PRIMARY KEY, org_id text NOT NULL,
  cause text NOT NULL CHECK (char_length(cause) BETWEEN 1 AND 300),
  at timestamptz NOT NULL, by_actor text NOT NULL REFERENCES users(id),
  FOREIGN KEY (decision_id, org_id) REFERENCES authorization_decisions (id, org_id)
);

CREATE TABLE settlement_batches (
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  session_id hex64 NOT NULL, org_id text NOT NULL,
  calculation_id text NOT NULL,
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  asset_id text NOT NULL, asset_network text NOT NULL, asset_kind text NOT NULL,
  asset_code text NOT NULL, asset_issuer text,
  instruction_count integer NOT NULL CHECK (instruction_count >= 0),
  total_amount base_units NOT NULL,
  instructions_hash hex64 NOT NULL,
  algorithm text NOT NULL, validation_json json NOT NULL,
  prepared_by text NOT NULL REFERENCES users(id), prepared_at timestamptz NOT NULL,
  UNIQUE (id, session_id, calculation_id), UNIQUE (id, org_id), UNIQUE (calculation_id, attempt),
  FOREIGN KEY (calculation_id, session_id, org_id) REFERENCES calculations (id, session_id, org_id)
);
CREATE INDEX settlement_batches_session ON settlement_batches (session_id, seq);

CREATE TABLE settlement_instructions (
  id text PRIMARY KEY,
  batch_id text NOT NULL, session_id hex64 NOT NULL, org_id text NOT NULL, calculation_id text NOT NULL,
  approval_decision_id text REFERENCES authorization_decisions (id),
  network text, seq integer NOT NULL CHECK (seq >= 1),
  payer text NOT NULL, payee text NOT NULL, asset_id text NOT NULL,
  amount base_units NOT NULL CHECK (amount > 0),
  fingerprint text,
  CHECK (payer <> payee),
  UNIQUE (batch_id, seq), UNIQUE (batch_id, payer, payee),
  FOREIGN KEY (batch_id, session_id, calculation_id) REFERENCES settlement_batches (id, session_id, calculation_id),
  FOREIGN KEY (batch_id, org_id) REFERENCES settlement_batches (id, org_id)
);
CREATE TABLE settlement_batch_reviews (
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  batch_id text NOT NULL UNIQUE, org_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500 AND ((decision = 'rejected') = (char_length(btrim(reason)) > 0))),
  decided_by text NOT NULL REFERENCES users(id), decided_at timestamptz NOT NULL,
  FOREIGN KEY (batch_id, org_id) REFERENCES settlement_batches (id, org_id)
);
CREATE TABLE settlement_batch_invalidations (
  batch_id text PRIMARY KEY, org_id text NOT NULL,
  cause text NOT NULL CHECK (char_length(cause) BETWEEN 1 AND 300),
  at timestamptz NOT NULL, by_actor text NOT NULL REFERENCES users(id),
  FOREIGN KEY (batch_id, org_id) REFERENCES settlement_batches (id, org_id)
);

CREATE TABLE wallet_challenges (
  id text PRIMARY KEY, org_id text NOT NULL, user_id text NOT NULL,
  network network_t NOT NULL, public_key g_address NOT NULL,
  nonce text NOT NULL CHECK (char_length(nonce) = 48), message text NOT NULL,
  issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz,
  FOREIGN KEY (org_id, user_id) REFERENCES memberships (org_id, user_id) ON DELETE CASCADE  -- see section 5: owner decision
);
CREATE INDEX wallet_challenges_member ON wallet_challenges (org_id, user_id);
CREATE TABLE wallet_verifications (
  org_id text NOT NULL, user_id text NOT NULL,
  network network_t NOT NULL, public_key g_address NOT NULL,
  scheme text NOT NULL CHECK (scheme IN ('raw','sep-53')),
  challenge_id text NOT NULL UNIQUE REFERENCES wallet_challenges (id),
  verified_at timestamptz NOT NULL,
  PRIMARY KEY (org_id, network, public_key),
  FOREIGN KEY (org_id, user_id) REFERENCES memberships (org_id, user_id) ON DELETE CASCADE
);
CREATE INDEX wallet_verifications_member ON wallet_verifications (org_id, user_id);

CREATE TABLE settlement_executions (
  id text PRIMARY KEY,
  batch_id text NOT NULL UNIQUE, session_id hex64 NOT NULL, org_id text NOT NULL,
  network network_t NOT NULL, accounts_json json NOT NULL,
  created_by text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL,
  UNIQUE (id, org_id),
  FOREIGN KEY (batch_id, org_id) REFERENCES settlement_batches (id, org_id)
);
CREATE TABLE settlement_execution_events (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  execution_id text NOT NULL, org_id text NOT NULL,
  from_state text, to_state text NOT NULL, actor text NOT NULL REFERENCES users(id),
  at timestamptz NOT NULL, detail text NOT NULL DEFAULT '', evidence_json json,
  FOREIGN KEY (execution_id, org_id) REFERENCES settlement_executions (id, org_id)
);
CREATE INDEX settlement_execution_events_exec ON settlement_execution_events (execution_id, seq);

CREATE TABLE settlement_attempts (
  id text PRIMARY KEY, execution_id text NOT NULL, org_id text NOT NULL,
  attempt_no integer NOT NULL CHECK (attempt_no >= 1),
  network network_t NOT NULL, plan_fingerprint hex64 NOT NULL, plan_json json NOT NULL,
  initiator text NOT NULL REFERENCES users(id), created_by text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL,
  UNIQUE (execution_id, attempt_no), UNIQUE (id, org_id),
  FOREIGN KEY (execution_id, org_id) REFERENCES settlement_executions (id, org_id)
);
CREATE TABLE settlement_attempt_events (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id text NOT NULL, org_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('transition','note')),
  from_state text, to_state text NOT NULL, actor text NOT NULL REFERENCES users(id),
  at timestamptz NOT NULL, detail text NOT NULL DEFAULT '', evidence_json json,
  CHECK (kind = 'transition' OR from_state = to_state),
  FOREIGN KEY (attempt_id, org_id) REFERENCES settlement_attempts (id, org_id)
);
CREATE INDEX settlement_attempt_events_attempt ON settlement_attempt_events (attempt_id, seq);
CREATE TABLE settlement_attempt_transactions (
  tx_hash hex64 PRIMARY KEY,
  attempt_id text NOT NULL, org_id text NOT NULL,
  step_index integer NOT NULL CHECK (step_index >= 1),
  network network_t NOT NULL, recorded_by text NOT NULL REFERENCES users(id), recorded_at timestamptz NOT NULL,
  UNIQUE (attempt_id, step_index),
  FOREIGN KEY (attempt_id, org_id) REFERENCES settlement_attempts (id, org_id)
);

CREATE TABLE signer_set_snapshots (
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  network network_t NOT NULL, account g_address NOT NULL, fingerprint hex64 NOT NULL,
  thresholds_json json NOT NULL, signers_json json NOT NULL,
  source text NOT NULL CHECK (source = 'horizon+rpc-agreed'),
  recorded_by text NOT NULL REFERENCES users(id), recorded_at timestamptz NOT NULL,
  UNIQUE (org_id, network, account, fingerprint)
);

CREATE TABLE activity (
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  at timestamptz NOT NULL,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor text NOT NULL REFERENCES users(id),
  kind text NOT NULL, subject text NOT NULL, detail text NOT NULL
);
CREATE INDEX activity_org ON activity (org_id, seq);
CREATE INDEX activity_org_subject ON activity (org_id, subject, seq);

-- ---- immutability triggers (generated for each immutable table) ----
-- Applies to: activity, calculations, authorization_decisions, authorization_invalidations, settlement_batches,
-- settlement_instructions, settlement_batch_reviews, settlement_batch_invalidations, settlement_executions,
-- settlement_execution_events, settlement_attempts, settlement_attempt_events, settlement_attempt_transactions,
-- signer_set_snapshots, auth_audit.
-- Example for one table; repeat with the same messages used by the SQLite triggers:
CREATE TRIGGER activity_immutable BEFORE UPDATE OR DELETE ON activity
  FOR EACH ROW EXECUTE FUNCTION forbid_change('activity records are immutable');
CREATE TRIGGER activity_no_truncate BEFORE TRUNCATE ON activity
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change('activity records are immutable');

-- ---- privileges ----
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA tobin TO tobin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tobin TO tobin_app;
-- then for each immutable table:
-- REVOKE UPDATE, DELETE, TRUNCATE ON tobin.<table> FROM tobin_app;
-- and for user_wallets: REVOKE DELETE, TRUNCATE.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA tobin TO tobin_app;
```

Design notes on the DDL:

- `seq ... UNIQUE` plus text `id PRIMARY KEY` keeps the SQLite shape (text id is the API key; `seq` orders). Event tables use `seq` as the primary key as today.
- Composite unique constraints on parents `(id, org_id)` exist only to be the target of composite FKs. They do not change application behaviour.
- The domain `base_units` allows 0 because `total_amount` can be 0 (`instruction_count >= 0`); obligations and instructions add `amount > 0`.
- `auth_audit.user_id` and `activity.actor` as FKs assume every id is a real user. See migration plan (preflight query).
- Triggers use SQLSTATE `23000` class (integrity violation); the Postgres store must map this to the same error the SQLite messages produced, if tests assert on messages.
- `FORCE ROW LEVEL SECURITY` and policies are intentionally absent (section 13).

## 16. Migrations tooling

**Recommendation: versioned plain `.sql` files plus a small in-repo runner derived from the existing `migrate()`; no ORM, no migration framework.**

- Current behaviour to keep (**Verified**, `database.ts:646-668`): numbered migrations, each in its own transaction, a `schema_migrations` ledger, refusal when the database is newer than the code, a status command.
- Add: an advisory lock (`pg_advisory_lock`) so two starting instances do not migrate concurrently; a stored checksum of each applied file and refusal on mismatch; run as `tobin_owner`, not the runtime role; migrations in files (not embedded template strings) so they are reviewable; `CREATE INDEX CONCURRENTLY` handled as a non-transactional migration type.
- Alternatives and why not: Prisma/Drizzle/TypeORM bring a schema DSL and generated clients while the code deliberately uses a thin hand-written store (`BACKEND_PERSISTENCE_ARCHITECTURE.md`, decision 2); `node-pg-migrate`, `dbmate`, `Flyway`, `sqitch` are sound but add a tool or runtime for roughly 100 lines of logic the project already has. If the owner prefers an external tool, `dbmate` (single binary, plain SQL) is the least intrusive.
- Driver: **`pg` (node-postgres)** with a pool, no query builder. It is a new runtime dependency (**Owner decision**: the repository currently avoids runtime dependencies for persistence).
- The Postgres baseline migration should be one migration that creates the final schema (section 15), not a replay of SQLite migrations 1 to 8. Replaying SQLite's table-rebuild history in PostgreSQL has no value.

## 17. Backup, recovery and retention

- **Backups (Recommendation).** Managed point-in-time recovery if the hosting plan provides it (**Unknown** for Railway; verify what is included, retention and restore time), plus a scheduled logical backup (`pg_dump -Fc`) stored off the database host, with a restore drill into a scratch database recorded in operations notes. Today no backup automation exists (`BACKEND_PERSISTENCE_OPERATIONS.md`). A backup that has never been restored is not evidence.
- **Roles and secrets.** The owner credential is the control that matters for immutability; keep it out of the application's environment.
- **Retention.** Proposed defaults are **Owner decisions**: purge `auth_sessions` that expired or were revoked more than 30 days ago; purge `auth_challenges` older than 1 day (existing behaviour); `rate_events` older than 1 day (existing); `invitations` keep. Immutable tables are never purged. A purge job must run as a role allowed to delete from the non-immutable tables only; `auth_audit` is immutable by design, so retention of it requires a deliberate owner-approved procedure (partition detach or privileged maintenance), not an ad-hoc `DELETE`.
- **Partitioning:** not needed at Testnet scale (**Inference**).

## 18. Risks, unknowns and owner decisions

Risks:

1. The async refactor touches nearly all of `Registry` and `AuthService` (section 10); the largest source of regression risk, mitigated by doing it first on SQLite.
2. `jsonb` would break the recalculation check silently (section 6.3). A guard test must assert key order survives a store round trip.
3. Concurrency semantics change from "global serialization" to explicit locking; every mutating path needs the org lock (section 8). A missed path is a latent race.
4. FK tightening may reject historical rows (section 5); preflight queries are in the migration plan.

Unknowns:

- Hosting plan details: roles, `max_connections`, backups/PITR, TLS, extensions, PG major version.
- Whether `w1-store-conformance` exercises `SqliteRegistryStore`.
- Decimal scale of base units; expected data volumes; whether any non-developer SQLite database exists.
- How `contract` kind assets are added operationally (`scripts/db.ts asset-add` cannot).

Owner decisions:

1. Adopt PostgreSQL and the `pg` dependency; hosting target.
2. Org lock mechanism: advisory locks vs row lock vs `SERIALIZABLE`.
3. RLS now or later (recommended later).
4. Preserve or change the cascade from memberships to wallet verification evidence.
5. FKs on actor columns (requires clean data) and removal of dead instruction columns.
6. Retention periods and the `rate_events` durability trade-off.
7. Whether tamper-evidence of `activity` needs external anchoring.
8. Two wallet mechanisms: unify (feature work) or keep.
