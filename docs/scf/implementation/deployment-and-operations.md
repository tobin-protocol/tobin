# Deployment and operations

**Status:** how Tobin runs locally and on its Testnet demonstration deployment; 2026-11-09. Stellar Testnet only; not production.
**Evidence basis:** `docs/backend-implementation/HOSTING-CONFIGURATION.md`, `RAILWAY-TESTNET-PILOT.md` (the owner's working-tree record dated 2026-11-09, newer than the committed copy), `Dockerfile.web`, `Dockerfile.console`, `apps/*/scripts/start.mjs`, `docs/backend-audit/`. Apart from the Discover page check of 2026-11-09 (section 7), live deployments were not contacted for this document; deployment facts are the owner's records.

Label: **our own recommended documentation**. The scope of this submission is Stellar Testnet only; nothing here describes or claims a Mainnet deployment.

## 1. Local run

`AGENTS.md` section 9 (verified against `package.json`): `npm ci`, `npm run build:console`, `npm run dev --workspace tobin-web-console` (http://127.0.0.1:8787), `npm run db:migrate --workspace tobin-web-console`. The default mode accepts only loopback Host and Origin values and trusts no forwarded address. `apps/web` has its own start script (default port 3000). The owner-run Stellar tools (`/wallet-check`, `/cosign-check`, `/settle-run`) exist only in local mode.

## 2. Hosted topology (current)

| Piece | Where | Notes |
|---|---|---|
| `apps/web` (canonical user application) | Vercel project `tobin-app`, root `apps/web`, at `https://app.tobinprotocol.xyz`; production deployment `dpl_GtbBUWS6XoyqAo4KGKsjchmPEmtj` (2026-11-09 21:26 UTC), a clean export of `main` `8b2030d` uploaded with the Vercel CLI | HTTPS issued by Vercel. **No Git integration:** the commit identity is the uploader's `sourceCommit` metadata, not a Git SHA recorded by Vercel. The earlier production deployment `tobin-9cglhno59` (19:27 UTC) predated #51 and #52. A superseded Railway `web` service still exists but holds an old secret and cannot reach the console |
| `apps/web-console` (backend and API) | Railway project `tobin-testnet-pilot`, environment `production`, service `console`, image `Dockerfile.console`; public domain `console-production-84ae.up.railway.app`; deployment `37e219ca` SUCCESS 2026-11-09 19:16 UTC, uploaded with the Railway CLI (no commit hash recorded) | Public Railway domain with guards only (see section 4); runs `db migrate` on every start (single replica only); optional asset seeding from `TOBIN_ASSET_ISSUER` (section 3a) |
| Database | SQLite file `/data/tobin.sqlite` on a Railway volume mounted at `/data` | One replica; no PostgreSQL |
| Stellar | Testnet, RPC and Horizon, used only by local owner tools | Hosted app does not call the network for settlement |

Diagrams: [../diagrams/deployment-current.mmd](../diagrams/deployment-current.mmd), [../diagrams/deployment-planned.mmd](../diagrams/deployment-planned.mmd). This is a Testnet demonstration deployment, not an institutional pilot (MVP-1.8, planned).

## 3. Environment variables (names only)

Console (Railway): `TOBIN_DEPLOYMENT_MODE`, `PORT`, `TOBIN_BIND_HOST`, `TOBIN_PROXY_SECRET` (secret), `TOBIN_PUBLIC_ORIGIN`, `TOBIN_ALLOWED_HOSTS`, `TOBIN_HEALTH_HOSTS`, `TOBIN_DB_PATH`, `TOBIN_ASSET_ISSUER`, `RAILWAY_DOCKERFILE_PATH`; optional `TOBIN_ALLOWED_ORIGINS`. `NODE_ENV=production` is set in the image.
Web (Vercel): `TOBIN_DEPLOYMENT_MODE`, `TOBIN_PUBLIC_ORIGIN`, `TOBIN_API_URL`, `TOBIN_PROXY_SECRET` (secret, marked sensitive), `TOBIN_TRUSTED_PROXY_HOPS`.
Must be absent in hosted mode: `NEXT_PUBLIC_TOBIN_SAMPLE_DATA`, `TOBIN_DEV_GALLERY` (`HOSTING-CONFIGURATION.md` section 2). Local-only owner-tool variables (names): `TOBIN_SECOND_ACCOUNT`, `TOBIN_BATCH_ID`, `TOBIN_REPO_ROOT`, `TOBIN_DEPLOYMENT_RECORD`. No values are recorded in this package.

### 3a. Settlement asset configuration

An asset becomes selectable for obligations only after an operator configures it: `node scripts/db.ts asset-add <testnet|public> native` or `<CODE> <ISSUER>` (`apps/web-console/scripts/db.ts:27-40`). The command records a **classic** asset (kind `issued`, or `native`) as "operator-configured; no on-chain check"; it cannot add a Soroban token contract. When `TOBIN_ASSET_ISSUER` is set, `Dockerfile.console:11` runs `asset-add testnet USD $TOBIN_ASSET_ISSUER` on every start (idempotent). The Testnet execution-plan builder accepts only a Soroban token **contract** identity (`apps/web-console/lib/stellar/execution-plan.ts:80-81`), so a batch in the seeded USD asset can be prepared and approved in the application, but no execution plan can be built for it. The asset used in the recorded Testnet run is the governed test token contract in `contracts/deployments/testnet.json`, a different thing. The `public` network value is still accepted by `asset-add` for configuration; no Mainnet execution path exists.

## 4. Hosted controls

Hosted mode fails closed at start-up if configuration is missing. The console serves `/api/auth`, `/api/registry`, `/api/public` and probes (`HOSTED_PATHS`, `lib/server/config.ts:21`); everything else is 404 even with the secret. Every non-probe request needs the shared secret (at least 32 characters). Because Vercel functions cannot reach Railway's private network, the console has a public hostname and the secret plus the Host allow-list are the only barrier. Security headers and CSRF checks are in `apps/web`. Details: [../security/security-overview.md](../security/security-overview.md).

## 5. Health and readiness

`/api/live` (process answers), `/api/ready` (console: database answers, schema current; web: console reachable and ready), `/api/health` (compatibility). None reports Stellar connectivity. Railway's health check uses the host `healthcheck.railway.app` (admitted for probe paths by `TOBIN_HEALTH_HOSTS`) and runs only at deployment start. These are probes, not monitoring ([../security/monitoring-plan.md](../security/monitoring-plan.md)).

## 6. Deploy, backup, restore, rollback

| Topic | State |
|---|---|
| Redeploy | Owner procedure: export the tracked files of the branch to a clean directory (never upload the working tree), link the project, deploy each service with the Railway CLI; Vercel project for the web app. Not automated; no CI deploy job exists |
| Backup | **None configured or verified** for the volume |
| Restore | **Never tested** |
| Rollback | **Not verified** |
| Log retention | **Not verified** |
| Secret rotation | Proxy secret rotated once on 2026-11-09 by hand on Railway and Vercel; no written procedure |
| Migrations | Applied on console start; migration 8 was not tested on a real operator database (`AGENTS.md` section 13) |

## 7. Verified versus not verified (owner record, 2026-11-09)

Live-verified on 2026-11-09 (read-only observation of the deployed page): the Discover page at 1440, 768 and 390 px calls the four public API paths and each answers 200; details in [implementation-status.md](implementation-status.md) section 6.

Verified by the owner after deployment (owner record, not independently re-verified): console liveness; `/api/registry/orgs` without the secret answers 403; `/api/rpc`, `/api/bootstrap`, `/api/w0/*`, `/api/stellar/run` and `/` answer 404 even with the secret; through `app.tobinprotocol.xyz`: liveness, readiness reaching the console, Discover page with CSP and HSTS, register, login and `/api/auth/me` with a throwaway account, public API answers (no institutions yet), a cross-origin POST refused with `CSRF_ORIGIN`; sign-in after a console redeploy (the volume persisted data).

Not verified: that the last `X-Forwarded-For` entry from Vercel or Railway is the client address (`TOBIN_TRUSTED_PROXY_HOPS=1` is an assumption); serverless cold starts under load; rate limiting from Vercel egress addresses; backup, restore, rollback, log retention; behaviour under concurrent users.

Known limits: registration is open; email unverified; single replica; hosted app does not execute settlement.

## 8. Runbook gaps

No incident process; no restore drill; no alert routing; no documented rotation of the proxy secret; no staging environment (P6); no deploy automation; no capacity numbers. Each is listed for MVP-1.7. None of this describes Mainnet operations: none are planned in this submission. `[OWNER INPUT NEEDED: who operates the deployment day to day, and the backup schedule the owner intends]`

## 9. Planned PostgreSQL migration (MVP-1.7; not started)

Sequence from `docs/backend-implementation/IMPLEMENTATION-STATUS.md`: P3 asynchronous store refactor on SQLite; P4 PostgreSQL implementation; P5 SQLite backup, inspection and migration utility with rehearsals; P7 institutional backend gaps; P6 Railway staging; P8 hosted settlement execution (not approved). Target design: `docs/backend-audit/postgresql-target-architecture.md`, `sqlite-postgresql-migration-plan.md`, `railway-deployment-architecture.md`; decisions: `docs/backend-implementation/ADR-0001-approved-backend-decisions.md` (BD-02 chose PostgreSQL; the current SQLite setup is an approved interim); gate: the store conformance and isolation suites must pass on both stores ([testing-and-validation.md](testing-and-validation.md)). Railway private networking, `PORT` injection and `::` binding for the staging pair are listed in `HOSTING-CONFIGURATION.md` section 7.
