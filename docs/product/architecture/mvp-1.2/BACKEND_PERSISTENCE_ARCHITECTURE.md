# Backend and persistence: architecture

Status: implemented and verified locally (see `BACKEND_PERSISTENCE_TEST_REPORT.md`). Not production-ready: see Known limitations.

## 1. Current-state architecture (before this milestone) and audit findings
- Next.js 16 App Router, React 19, Node 24 running TypeScript directly. npm workspaces. Route group `app/(institution)/` for the institutional area, separate from `/w0` (signer console) and `/` (local sandbox console).
- `lib/registry/` held the Registry rules (organizations, memberships, invitations, wallet claims, sessions with provenance, activity) over a `RegistryStore` interface with ONE implementation: in-memory, lost on restart.
- Identity: an `IdentityProvider` interface and a development provider reading the header `x-tobin-dev-user: dev:<name>`. The page was hard-wired to `dev:demo`. A production build accepted it when `TOBIN_ALLOW_DEV_IDENTITY=1`.
- Fixture data was seeded on every process start, in every environment.
- No database dependency, no user accounts, no sessions, no migrations, no health endpoint.

Concrete findings that drove the design:
1. **Client-supplied identity** (critical): any caller could act as any user by sending a header. Replaced by server-side sessions.
2. **Production opt-in for the development identity**: one environment variable exposed everything. Removed; the provider cannot be constructed when `NODE_ENV=production`.
3. **Volatile state**: all organizations, invitations and drafts vanished on restart.
4. **Fixture seeding in production**: demo organizations appeared in any deployment. Seeding is now an explicit operator command that refuses to run in production.
5. **No atomicity**: multi-step operations (accept invitation = mark used + create membership + log) had no transaction. Now every mutating Registry call runs in a store transaction.
6. **Missing integrity constraints**: nothing stopped a draft carrying chain data, a duplicate membership, or an edited activity record. Now enforced by the schema (CHECK, FOREIGN KEY, UNIQUE, triggers).
7. **No CSRF defence beyond the origin check**: added a required request header on every state-changing request.
8. **No rate limiting** on sign-in or invitation-token guessing. Added (persisted).

## 2. Chosen architecture
```
Browser (HttpOnly cookie)  ->  proxy.ts (Host, Origin, JSON, CSP)  ->  route handlers (app/api/auth, app/api/registry, app/api/health)
                                                                          |
                    lib/auth/http.ts, lib/registry/http.ts  (validation, status codes, no identity from the client)
                                                                          |
              AuthService (accounts, sessions, rate limits)      Registry (all rules, authorization, provenance)
                                    \                                 /
                               lib/db (Database, migrations)  +  SqliteRegistryStore
                                                |
                                       SQLite file (TOBIN_DB_PATH)
```
Components: `lib/db/database.ts` (connection, transactions, versioned migrations, status), `lib/registry/sqlite-store.ts` (RegistryStore over SQLite), `lib/registry/store.ts` (interface plus in-memory store restricted to unit tests), `lib/registry/service.ts` (rules), `lib/auth/service.ts` and `lib/auth/http.ts` (authentication), `lib/server/backend.ts` (process singleton, configuration, fail-closed), `lib/registry/http.ts` (API), `scripts/db.ts` (operator commands).

## 3. Decisions
| # | Topic | Decision | Why / alternatives |
|---|---|---|---|
| 1 | Database | SQLite via Node built-in `node:sqlite` | Zero new dependencies, runs locally and in tests, durable, transactional, enforces foreign keys and CHECK constraints, trivially backed up. PostgreSQL is the better fit for multi-instance production but needs a service and credentials that do not exist; the `RegistryStore` interface is the seam for it. SQLite supports a SINGLE application instance writing the file. `node:sqlite` is marked experimental in Node 24 (prints a warning); recorded as a limitation. |
| 2 | Access layer | Hand-written prepared statements in one store class; no ORM | One schema, small surface, no second abstraction. |
| 3 | Migrations | Numbered SQL migrations, each in its own transaction, `schema_migrations` table, idempotent, newer-than-code database refused, status via `npm run db:status` and `/api/health` | Failed migration rolls back fully; the process then serves nothing (503). |
| 4 | Authentication | Local email and password accounts, scrypt (N=2^16, r=8, p=1, per-user salt, parameters stored in the hash, bounded on verify) | No external identity provider credentials exist, and fabricating one is forbidden. The `ActingUser` result is the boundary an OIDC or SAML provider would implement later. |
| 5 | Server-side session | 256-bit random token in an `HttpOnly; SameSite=Strict; Secure(production); Path=/` cookie; only SHA-256 stored; 8 hour absolute lifetime; logout revokes server-side | A database read does not yield a usable session; the server, not the cookie, decides expiry. |
| 6 | Identity mapping | `users.id` (opaque `usr_...`) is the only identity; memberships reference it by foreign key | Email is a login attribute and an invitation-binding attribute, never the identity key. |
| 7 | Authorization | Deny by default inside the Registry on every call: membership required, admin required for management; non-members get the same NOT_FOUND as for nonexistent resources | Not dependent on UI visibility. |
| 8 | Invitations | 192-bit random token returned once; SHA-256 stored; 7 day expiry; single use; revocable; email-addressed invitations only accept by that verified email; acceptance guesses rate limited | Token is a bearer credential; email binding limits a leaked token. |
| 9 | Delivery | No email provider exists. The API and UI say plainly that nothing was sent and show the one-time code to the administrator | Not pretending. |
| 10 | CSRF | Cookie SameSite=Strict, foreign-Origin refusal (proxy), JSON-only POST (proxy), plus required header `x-tobin-request: 1` | Cross-origin cannot add a custom header without a CORS preflight, which is never granted. |
| 11 | Fixtures | Never created automatically; `npm run db:seed-demo` (refused in production, needs `TOBIN_DEMO_PASSWORD`) | Fixtures cannot reach production data. |
| 12 | Development identity | Kept for unit tests only (`DevelopmentIdentityProvider`); throws if `NODE_ENV=production`; no route handler references it | Local development uses real accounts in a local database file. |

## 4. Data model
See `BACKEND_PERSISTENCE_DATA_MODEL.md`.

## 5. Authentication and authorization flow
1. `POST /api/auth/register` or `/login` (JSON, request header) verifies the password (or creates the account), issues a session, sets the cookie.
2. Every `/api/registry/*` call: `authenticateRequest` reads the cookie, hashes it, looks up a live unrevoked unexpired session of an enabled user. No match: 401.
3. `Registry` method: `#need(orgId, user, admin?)` requires membership (else NOT_FOUND) and the admin role where needed (else FORBIDDEN, only after membership is proven).
4. Mutations run inside `store.transaction`; activity is appended inside the same transaction.

## 6. Invitation flow
Admin creates (role chosen) -> token generated, hash stored, activity `invitation.created` -> admin gives the code to the invitee -> invitee signs in (own account) and posts it -> inside one transaction: hash lookup, status pending, not expired, not already a member, email binding, mark accepted, create membership, activity `invitation.accepted`. Any failure returns the same error. Revocation sets status; acceptance after that fails.

## 7. Persistence flow and provenance
Drafts are created with a server-generated random 32-byte id and provenance `local-draft`. The database CHECK constraints make it impossible to store chain data on a draft or fixture, or a confirmation hash without chain data. No route can set chain provenance; there is no chain reader in this milestone.

## 8. Environment configuration
See `BACKEND_PERSISTENCE_OPERATIONS.md`.

## 9. Migration strategy
Versioned SQL in `MIGRATIONS`; run on startup (`createBackend`) and by `npm run db:migrate`. In-memory development data from the earlier prototype cannot be migrated (it never existed durably) and is not. Fixtures are not migrated.

## 10. Backup and recovery implications
The database is one file plus WAL files. A consistent backup needs SQLite online backup, `VACUUM INTO`, or a filesystem snapshot with the application stopped; copying the main file alone while writes occur is unsafe. Restore = replace the files with the application stopped. No backup automation exists.

## 11. Known limitations
- Single application instance (file locking); not horizontally scalable. PostgreSQL via the store interface is the follow-on.
- `node:sqlite` experimental; the `@types/node` 20 in the repo has no types for it, so `lib/db/node-sqlite.d.ts` declares the small surface used.
- Local passwords only: no SSO, no MFA, no password reset, no email verification, no account lockout beyond per-email failure throttling, no CAPTCHA. Registration is open.
- No email delivery for invitations (code handed over manually).
- Rate limiting counts failures per email (sign-in) and per account (invitation guessing); there is no per-IP limit (reverse proxies make client IP unreliable here).
- Role changes do not revoke other sessions (roles are re-read on every request, so changes apply immediately).
- Wallet links remain unproven claims; participants are application records, not on-chain admission.
