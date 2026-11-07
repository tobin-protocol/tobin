# Backend and persistence: operations

## Requirements
Node 24 (for `node:sqlite`; it prints an ExperimentalWarning). No database server. A writable directory for the database file, on persistent storage, for ONE application instance.

## Environment variables
| Variable | Where | Meaning |
|---|---|---|
| `NODE_ENV` | all | `production` activates fail-closed configuration and Secure cookies |
| `TOBIN_DB_PATH` | **required in production** | path of the SQLite file (parent directory is created). `:memory:` is rejected in production. Unset in development: `.data/tobin-dev.sqlite` relative to the working directory (git-ignored) |
| `TOBIN_DEMO_PASSWORD` | `db:seed-demo` only | password for the two demo accounts (12 to 128 characters); there is no default; refused in production |
| `PORT` | existing | listening port (the Host allow-list in `proxy.ts` uses it) |
No secret is required by the application itself: session tokens are random and stored hashed. `TOBIN_ALLOW_DEV_IDENTITY` no longer exists and is ignored.

Example (do not commit real values):
```
NODE_ENV=production
TOBIN_DB_PATH=/var/lib/tobin/tobin.sqlite
```

## Local development
```
npm install                                   # repository root
cd apps/web-console
npm run db:migrate                            # optional: the server also migrates on first request
npm run dev                                   # http://127.0.0.1:8787  -> register an account at /sign-in
# optional demo data (labelled fixture), never in production:
TOBIN_DEMO_PASSWORD='choose-a-long-password' npm run db:seed-demo   # demo@example.test and other@example.test
```
Previous in-memory development data is gone: it was never durable and is not migrated.

## Test database setup
Nothing to set up: tests create temporary SQLite files or `:memory:` databases and remove them. `npm test` runs everything; browser journeys: `npm run build:console` at the repository root, then `TOBIN_WIDTH=420|1200 node test/browser/backend-journey.mjs <absolute dir>` and `.../sessions-journey.mjs <absolute dir>` (use an absolute directory).

## Migrations
- Apply: `npm run db:migrate` (idempotent). Status: `npm run db:status` (prints JSON, exit code 2 when migrations are pending) or `GET /api/health` (`schemaVersion`, `pendingMigrations`).
- On startup the backend migrates automatically; a failed migration rolls back and the process answers 503 to everything. A database newer than the code is refused.
- Add a migration by appending a new numbered entry to `MIGRATIONS` in `lib/db/database.ts`; never edit an applied one.

## Startup and failure behaviour
Production without `TOBIN_DB_PATH` (or with `:memory:`), an unreadable file, or a failed migration: every `/api/auth`, `/api/registry` and `/api/health` request returns 503 with a generic body; the reason is logged once server-side (message only, no credentials). The pages themselves still render and show the error message. Verified live: a production server started without TOBIN_DB_PATH answered 503 to /api/health, /api/auth/login and /api/registry/orgs (a forged dev header changed nothing) and logged one line, "backend unavailable: TOBIN_DB_PATH is required in production". There is no fallback storage.

## Health
`GET /api/health` returns `{status, database, schemaVersion, pendingMigrations}` only: no path, no credentials, no user data. 200 when the schema is current, 503 otherwise.

## Backup and recovery
SQLite in WAL mode uses `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`. Take backups with SQLite's online backup (`sqlite3 file ".backup dest"`), `VACUUM INTO 'dest'`, or by stopping the application and copying all three files. Do not copy only the main file while the application runs. Restore: stop the application, replace the files, start it (migrations run). Sessions survive a restore only if the restored file contains them. No backup automation, retention policy or restore drill exists yet.

## Deployment requirements (not done here)
One instance only; persistent volume with restricted file permissions (the file contains password hashes and invitation hashes); TLS termination in front (the cookie is `Secure` in production, so plain HTTP will not keep a session outside loopback); a decided process for backups; log collection.

## Outstanding production configuration
- A PostgreSQL implementation of `RegistryStore` if more than one instance, managed backups or point-in-time recovery are needed.
- An identity provider (OIDC or SAML) and MFA if required; email verification; password reset.
- An email delivery provider for invitations. Until then invitations are NOT emailed: the administrator copies the one-time code (or link) from the screen and delivers it. The application says so on screen and in the API response (`delivery.sent = false`).
- Hosting, domain, TLS, monitoring, incident process, encryption at rest, retention policy for the activity history, independent security review.
