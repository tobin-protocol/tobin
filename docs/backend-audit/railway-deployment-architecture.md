# Railway deployment architecture (target design)

This is a design document. Nothing was deployed and no configuration was touched. Scope is Stellar Testnet; production deployment has not been approved (`AGENTS.md` section 1). Evidence labels: **Verified** (read in code or config), **Recommendation**, **Inference**, **Unknown**, **Owner decision**. Statements about Railway's platform are **Unknown (verify against current Railway documentation)** unless stated otherwise, because this audit used no network and does not rely on memory of a changing product.

## 1. Summary

1. **Verified, blocker.** The console (the backend) rejects every request whose `Host` header is not `127.0.0.1:<PORT>` or `localhost:<PORT>` with `403 forbidden host` (`apps/web-console/lib/server/guards.ts:16,35`). The guard runs in `proxy.ts` for every request (`apps/web-console/proxy.ts:8-16`, no `config.matcher`, so it covers `/api/health` too). On Railway the web service would call the console at a private hostname, and a platform health check would arrive with the platform's host. Both are refused today. A code change (an allow-list of hosts from configuration) is a prerequisite for any deployment that separates the two apps or health-checks the console.
2. **Verified.** Both start scripts bind to loopback: `next start --hostname 127.0.0.1 --port 3000` (`apps/web/package.json`) and `--port 8787` (`apps/web-console/package.json`). A container platform needs `0.0.0.0` and its own `PORT`.
3. **Verified.** The database is a SQLite file through `node:sqlite` (`lib/db/database.ts`). In production `TOBIN_DB_PATH` is mandatory and `:memory:` is refused (`lib/server/backend.ts:18-27`). The store interface is synchronous (`lib/registry/store.ts:7`), so a PostgreSQL store is a port of the service layer, not a driver swap (consequence: **Inference**).
4. **Verified.** The backend also reads repository files at runtime from paths relative to the working directory: `contracts/deployments/testnet.json`, `accounts/testnet-admin.json` (`lib/stellar/cosign.ts:15`, `owner-validation.ts:14`, `run.ts:23-25`). The runtime image must contain them or be given `TOBIN_REPO_ROOT`, `TOBIN_DEPLOYMENT_RECORD`, `TOBIN_ADMIN_ACCOUNT_RECORD`.
5. **Verified.** No Dockerfile, `railway.json`, Nixpacks file, `Procfile`, `.nvmrc` or `.node-version` exists in tracked files (`git ls-files`); the only platform file is `apps/docs/vercel.json`. Node 24 is required by `engines` in the root and both apps, and CI pins `24.14.0` (`.github/workflows/ci.yml`, `env.NODE_VERSION`).
6. **Recommendation (decision, section 9).** Two Railway services plus one database: a public `web` service (`apps/web`) and a private `console` service (`apps/web-console`), with the console reachable only on the private network. A single Next service is not feasible without restructuring (section 9).
7. **Verified.** Cookies: `tobin_session`, `HttpOnly; SameSite=Strict; Path=/; Max-Age`, plus `Secure` when `NODE_ENV=production` (`lib/auth/http.ts:20-21`, `backend.ts:25-26`). The browser receives the cookie from the web origin because the proxy copies `Set-Cookie` from the console reply (`apps/web/app/api/[...path]/route.ts:37`). No cookie `Domain` is set, so it is host-only on the web service's domain.
8. **Verified, flag.** Several pieces of state are in-process and single-instance by design (section 7.2).

## 2. Inventory of what exists

### 2.1 Deployment files and build/start commands
| Item | Finding |
|---|---|
| Dockerfile, `railway.json`, `railway.toml`, Nixpacks/Railpack config, Procfile | none tracked (**Verified**, `git ls-files`) |
| Vercel | `apps/docs/vercel.json` (framework nextjs, `buildCommand: npm run build`); `apps/docs/README.md` section "Hosting on Vercel" documents the docs site as its own Vercel project; `apps/landing/src/app/layout.tsx:28-32` reads `VERCEL_ENV`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`. No workflow deploys to Vercel; deployment is by Vercel's own git integration (**Unknown** from this repository). `apps/landing` has no `vercel.json`. |
| Node | root `engines.node >=24`; each of `apps/web`, `apps/web-console` the same; no `.nvmrc`. `node:sqlite` is imported without flags (`lib/db/database.ts`), and `scripts/db.ts` is executed as `node scripts/db.ts` (TypeScript type stripping), both Node 24 behaviours. |
| Workspaces | root `package.json` workspaces `apps/*`, `packages/*`; apps import `tobin-mvp1-sdk` (workspace) and `tobin-ui-tokens`; `web-console/next.config.ts` has `transpilePackages: ['tobin-mvp1-sdk']`. A build must run from the repository root with workspace install (`npm ci`). |
| `apps/web` scripts | `dev`, `build: next build`, `start: next start --hostname 127.0.0.1 --port 3000`, `lint: eslint`, `typecheck: next typegen && tsc --noEmit`, `test: node --test test/*.test.ts` |
| `apps/web-console` scripts | `build: next build`, `start: next start --hostname 127.0.0.1 --port 8787`, `typecheck`, `test: node --test test/*.test.ts`, `db:migrate`, `db:status`, `db:seed-demo` |
| `apps/landing` scripts | `build`, `start: next start`, `lint` (landing `package.json`) |
| `apps/docs` scripts | `build`, `start`, `typecheck`, `validate` |
| Output mode | no `output: "standalone"` in either `next.config.ts` (**Verified**) |

### 2.2 Environment variables actually read (grep over `app`, `lib`, `components`, `scripts`, `proxy.ts`, `next.config.ts` of web, web-console, landing, docs)

Defaults and meaning are from the cited code. "Secret?" means the value must not be exposed; none of these hold a Stellar signing key.

| Name | App | Required? | Secret? | Default | Meaning | Source |
|---|---|---|---|---|---|---|
| `NODE_ENV` | web-console, web | set by `next start` | no | none | `production` turns on `Secure` cookies and makes `TOBIN_DB_PATH` mandatory; dev identity provider refused | `backend.ts:19,25`; `lib/registry/identity.ts:25`; `lib/w0/deps.ts:33` |
| `TOBIN_DB_PATH` | web-console | yes in production | no (path) | dev: `.data/tobin-dev.sqlite` | SQLite file; `:memory:` refused in production; parent directories are created | `backend.ts:20-26`; `database.ts` `openDatabase` |
| `TOBIN_STELLAR_CLEARING_CONTRACT` | web-console | needed to begin attempts | no (public id) | none | clearing contract id (`^C[A-Z2-7]{55}$`); without it `beginExecutionAttempt` refuses | `backend.ts:33`; `service.ts:855-865` |
| `PORT` | web-console | optional | no | `8787` | used ONLY to compute the allowed Host values; does not change the listening port (the script passes `--port 8787`) | `guards.ts:66-69,71` |
| `TOBIN_API_URL` | web | yes in any non-loopback deployment | no | `http://127.0.0.1:8787` | where the proxy route and `proxy.ts` reach the console | `apps/web/app/api/[...path]/route.ts:8`; `apps/web/proxy.ts:7` |
| `NEXT_PUBLIC_TOBIN_SAMPLE_DATA` | web | no | no | unset (off) | `1` switches to the fictional adapter and disables access enforcement; must be unset in production. **Baked at build time** | `apps/web/lib/tobin/index.ts:5`; `proxy.ts:25` |
| `TOBIN_DEV_GALLERY` | web | no | no | unset | `1` enables `/dev/*` gallery in production; must stay unset | `apps/web/app/dev/layout.tsx:8` |
| `NEXT_PUBLIC_TOBIN_APP_URL` | landing | recommended | no | production: `null` ("Launch app (soon)" disabled link); dev: `http://127.0.0.1:3000` | where the landing "Launch app" button points. **Baked at build time** | `apps/landing/src/lib/site.ts:13-15` |
| `NEXT_PUBLIC_SITE_URL` | landing | yes in production | no | none | absolute origin for Open Graph image URLs. **Baked at build time** | `apps/landing/src/app/layout.tsx:28` |
| `TOBIN_REQUIRE_SITE_URL` | landing | no | no | unset | `1` makes the build throw when the site URL is missing | `layout.tsx:36` |
| `VERCEL_ENV`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL` | landing | no | no | platform-set on Vercel | derive the site URL | `layout.tsx:30-32` |
| `TOBIN_REPO_ROOT` | web-console | needed if cwd is not `apps/web-console` | no | `resolve(cwd, '../../')` | root for `contracts/deployments/testnet.json` and the JSONL evidence log | `run.ts:23` |
| `TOBIN_DEPLOYMENT_RECORD` | web-console | optional | no | `resolve(cwd,'../../contracts/deployments/testnet.json')` | deployment manifest path for the owner validation | `owner-validation.ts:14` |
| `TOBIN_ADMIN_ACCOUNT_RECORD` | web-console | optional | no | `resolve(cwd,'../../accounts/testnet-admin.json')` | public record of the administrative multisig account | `cosign.ts:15` |
| `TOBIN_SECOND_ACCOUNT` | web-console | needed for owner tools | no (public key) | none (`run.ts` throws) | the second participant's public key; also extends the owner-tool access list | `run.ts:28`; `owner-access.ts:9` |
| `TOBIN_BATCH_ID` | web-console | no | no | `bat_mvp15_oneunit_01` | batch id used by the one-unit run | `run.ts:30` |
| `TOBIN_VALIDATION_CREATOR` | web-console | no | no | none | owner-validation helper input | `owner-validation.ts` (read; exact use not traced) |
| `TOBIN_DEMO_PASSWORD` | web-console script | only for `seed-demo` | yes | none; `seed-demo` refused when `NODE_ENV=production` | demo accounts | `scripts/db.ts:45-47` |
| `TOBIN_BRIDGE_EXE` | web-console | only for the local sandbox `/` and `/api/rpc` | no | none | path to the Rust development bridge; not for deployment | `lib/server/sandbox.ts:23` |
| `W0_ALLOW_DEV_IDP`, `W0_MOCK_SCENARIO` | web-console | no | no | unset | W0 mock console (separate, in-memory); a hosted-environment marker (including `RAILWAY_ENVIRONMENT`) always refuses the dev identity provider | `lib/w0/deps.ts:16-38` |
| `TOBIN_BROWSER`, `TOBIN_WIDTH` | test scripts | no | no | none | browser journeys only | `test/browser/*` |

No variable carries a Stellar secret. There is no variable for the Stellar RPC or Horizon URL (they are constants in code: `rpc.ts:12`, `live.ts:7`).

### 2.3 Health endpoint (Verified)
`apps/web-console/app/api/health/route.ts` returns JSON with `status`, `database`, `schemaVersion`, `pendingMigrations`; HTTP 200 if no migration is pending, 503 when degraded or the backend cannot open the database. It opens the backend (`getBackend()`), so it exercises the database and, because `createBackend` runs `migrate(db)` (`backend.ts:30-33`), it also applies pending migrations on first call. It does not check the Stellar RPC or Horizon, the contract id, or any file. It sits behind the host guard (section 1, finding 1).

`apps/web` has no health route; its `app/api` contains only the catch-all proxy, which returns 404 for anything but `/api/auth/*` and `/api/registry/*` (`proxy-policy.ts:7,17`).

### 2.4 How `apps/web` finds the backend (Verified)
- Page gating: `apps/web/proxy.ts` calls `${TOBIN_API_URL}/api/auth/me` with the `tobin_session` cookie (4 s timeout); an unreachable console is treated as signed out, never signed in (`proxy.ts:11-22`).
- API proxy: `apps/web/app/api/[...path]/route.ts` forwards `GET` and `POST` only, drops the browser `Origin`, forwards only the `cookie` header, adds `x-tobin-request: 1` on POST, caps the POST body at 8 KiB (`proxy-policy.ts:8`), and does not follow redirects.
- Unreachable console: 503 `BACKEND_UNAVAILABLE`.
- `apps/web` cannot reach `/api/stellar/*`, `/api/w0`, `/api/rpc`, `/api/bootstrap` or `/api/health` (**Verified**, `proxy-policy.ts:7`).

### 2.5 Loopback-only guards (Verified, read carefully)
`checkRequest` (`guards.ts:34-39`): (1) `Host` must be in `{127.0.0.1:PORT, localhost:PORT}` else 403 "forbidden host"; (2) if an `Origin` is present and not in `{http://127.0.0.1:PORT, http://localhost:PORT}` and the path starts with `/api/`, 403 "forbidden origin"; (3) any `POST` without a `Content-Type` starting with `application/json` gets 415. No CORS headers are ever sent (comment, `guards.ts:4`). `proxy.ts` applies this to every request that reaches the Next server; `lib/server/api.ts` applies the same guard again in the sandbox handlers.

Consequences on Railway: a server-side `fetch` from the web service to `http://<console-private-host>:<port>` sends a `Host` of that private name, so it gets 403 at the console. A browser never talks to the console (the web proxy does), so the Origin rule is not triggered by the proxy (the server-side `fetch` sends no `Origin`).

## 3. Evaluation by topic

| Topic | Assessment |
|---|---|
| Web deployment | `apps/web` is a normal Next 16 server (Node runtime, route handler proxy, `proxy.ts`). Needs: `next start --hostname 0.0.0.0 --port $PORT`, `TOBIN_API_URL`, no `NEXT_PUBLIC_TOBIN_SAMPLE_DATA`. **Recommendation:** add a small `GET /api/health` to the web app (it has none) so the platform has a check that is independent of the console. |
| Backend/API deployment | The console is a Next server whose API is route handlers. Needs the host-guard change, `0.0.0.0` binding, the repository files (section 1 item 4), `NODE_ENV=production` (set by `next start`), `TOBIN_DB_PATH`, `TOBIN_STELLAR_CLEARING_CONTRACT`. The pages of the console (`/`, `/w0`, `/settle-run`, `/wallet-check`, `/cosign-check`, `/organizations`, ...) are served by the same process. **Recommendation:** on a hosted console, do not expose those pages publicly; the console service should have no public domain (section 4). The owner tools are then reachable only by temporarily running the console locally or through a tunnel, which is an **Owner decision** (they need the console's own origin for Freighter). |
| PostgreSQL provisioning | Not used by any code today. See section 6. |
| Internal communication | Railway private networking: **Unknown (verify)** — as understood, services in a project/environment resolve each other at `<service>.railway.internal` over IPv6-capable internal DNS and the target service must listen on the interface/port used. Verify that the Node `fetch` in `apps/web` can reach the IPv6 internal address and that `next start --hostname 0.0.0.0` (IPv4 only) is reachable; Railway documents a dual-stack requirement for some runtimes (`::`). |
| Env vars and secrets | Section 8. No Stellar secret exists; the only true secret is the database credential (when Postgres is used). |
| Build/start | Section 8. |
| Health/readiness | Console: `GET /api/health` (after the guard change). The check passes when the database opens and no migration is pending; it does not prove Stellar connectivity. **Recommendation:** add a separate readiness route that reads the RPC `getHealth` and the latest ledger, and keep the liveness check cheap. Railway's check semantics, timeout and Host header: **Unknown (verify)**. |
| Migrations | The app applies pending migrations itself on first backend use (`backend.ts:32`); each migration is atomic; a database newer than the code is refused (`database.ts` `migrate`). With one instance this is safe. **Recommendation:** also run `npm run db:migrate --workspace tobin-web-console` (`node scripts/db.ts migrate`, idempotent) as a pre-deploy command, so a failing migration stops the release instead of failing the first request. Whether Railway offers a pre-deploy command: **Unknown (verify)**. |
| Logging | Server logs go to stdout/stderr; the only explicit server-side log line found is `[tobin] backend unavailable: <message>` (`backend.ts:52`). No structured logging, request ids or log redaction beyond the W0 redactor. **Recommendation:** add request id and status logging before relying on it. Railway collects stdout: **Unknown (verify)** retention. |
| Monitoring | None exists (no metrics endpoint, no error tracker). **Unknown**/missing. |
| Domains and HTTPS | Public domain only on `web`. TLS termination is the platform's: **Unknown (verify)**. The `Secure` cookie requires the browser to see HTTPS on the web domain. The console's `Secure` cookie is emitted to the web service over plain internal HTTP, which is harmless because the web service re-emits it to the browser. |
| CORS | Not needed: the browser only calls the web origin (same-origin `/api/*`), and the web service calls the console server-side. The console sends no CORS headers by design and refuses foreign `Origin` on `/api/`. Do not add CORS. |
| Connection pooling | N/A with SQLite (one connection, `busy_timeout = 5000`, WAL). With Postgres the port must define pool size; an async service layer is required (section 6). |
| Persistent storage | SQLite needs a volume (section 6). The repository also writes an evidence log under `docs/product/architecture/mvp-1.5/evidence/` from `run.ts:62`; on an ephemeral filesystem that write is lost silently (errors are swallowed). |
| Background workers | None exist. Needed: a confirmation/verification loop (see `stellar-settlement-architecture.md` section 11). Expired-session or invitation cleanup: `rate_events` are pruned inside the auth service on use (`lib/auth/service.ts:372`); no scheduled cleanup exists or was found necessary. |
| Rollback | Application rollback is a redeploy of a previous build. **Verified constraint:** migrations are forward-only (no down scripts) and the app refuses a database newer than its code, so a rollback across a schema change needs the database restored or a forward fix. Railway deployment rollback features: **Unknown (verify)**. |
| Backup/recovery | See section 6.3. |
| Cost-neutral sizing | Section 10. |

## 4. Decision: separate services or one

**Question:** should `apps/web` and `apps/web-console` be separate Railway services or one?

**Recommendation: two services (plus the database).** Justification:
1. **Verified structure.** They are two independent Next applications with their own `package.json`, `next.config.ts`, ports and build outputs. Merging them would mean combining two Next apps, route trees and `proxy.ts` files into one (`apps/web/proxy.ts` and `apps/web-console/proxy.ts` have unrelated jobs and conflicting matchers). That is a rewrite, which the brief rules out without a technical reason.
2. **Attack surface.** The console carries the database, the session store, the owner-run Stellar tools (`/api/stellar/*`, reachable by any signed-in wallet user who is on the owner list), the W0 mock API, the sandbox bridge endpoints and the local pages. The web app exposes only the proxy allow-list `/api/auth` and `/api/registry` (`proxy-policy.ts:7`). Keeping the console off the public internet reduces the exposed surface to that allow-list. A single public service would expose `/api/stellar/*`, `/api/w0`, `/api/rpc`, `/api/bootstrap` directly.
3. **Independent scaling.** The web tier is stateless and can have several replicas (subject to section 7.2); the console owns the SQLite file and must have exactly one (Verified, `BACKEND_PERSISTENCE_OPERATIONS.md` "One instance only").
4. **Cost.** Two small services plus one volume or database; the memory floor of a Next server is modest, but exact usage is **Unknown** (not measured).
5. **Alternative considered: one container, two processes** (start both with a process manager so `TOBIN_API_URL` stays `http://127.0.0.1:8787` and no guard change is needed). It avoids the blocker but couples the two release cycles, makes the web tier unable to scale, and hides one service's crash from the platform. Acceptable only as a short interim for a demonstration. **Owner decision.**

Services required:
| Service | Source | Public domain | Replicas | Notes |
|---|---|---|---|---|
| `web` | `apps/web` | yes | 1 initially (can be more later) | proxy to `console` |
| `console` | `apps/web-console` | **no** | exactly 1 | owns the database and the repository files |
| database | SQLite volume on `console`, or Railway Postgres after a port | no | n/a | section 6 |
| `worker` (optional) | same code as `console`, different start command | no | exactly 1 | only after the verifier job exists; may instead run inside `console` |
| landing, docs | **not on Railway**: documented as Vercel projects (`apps/docs/README.md`; `apps/landing/src/app/layout.tsx` reads Vercel variables) | n/a | n/a | the only coupling is `NEXT_PUBLIC_TOBIN_APP_URL` on the landing build |

## 5. Required code and config changes before a deployment (proposals, none made)

1. **Host allow-list** in `guards.ts`: replace the fixed loopback set with `loopback + TOBIN_ALLOWED_HOSTS` (comma-separated `host:port`), keeping the default identical; add tests to `test/guards.test.ts` (the existing negative cases must still pass). The Origin allow-list needs no change because the proxy sends no Origin. **Recommendation.**
2. **Bind address and port:** start commands `next start --hostname 0.0.0.0 --port $PORT` for both apps, and set console `PORT` equal to that port because the allowed Host includes the port (`guards.ts:66-71`). **Recommendation** (package scripts currently hard-code loopback and the ports).
3. **Repository files at runtime:** ship `contracts/deployments/testnet.json` and `accounts/testnet-admin.json` in the runtime image, or point `TOBIN_DEPLOYMENT_RECORD`/`TOBIN_ADMIN_ACCOUNT_RECORD` at copied files. Public metadata only.
4. **RPC/Horizon URLs as configuration** (still Testnet-only). Needed only if a different provider is wanted.
5. **Web health route** for the platform check.
6. **Node version** pin (`.nvmrc` or platform setting) at 24.x; the mechanism Railway uses to select Node: **Unknown (verify)**.
7. **Replace the evidence log** write in `run.ts:62` before running the owner tools on an ephemeral filesystem.

## 6. Database

### 6.1 Today
SQLite in WAL mode, `foreign_keys = ON`, `busy_timeout = 5000`, migrations 1-8, immutability by trigger, all multi-statement operations in `BEGIN IMMEDIATE` transactions (`database.ts:627-630`). The operations document says one instance and a persistent volume with restricted permissions (`BACKEND_PERSISTENCE_OPERATIONS.md` lines 46-53) and names a PostgreSQL implementation of `RegistryStore` as the route to more than one instance, managed backups or point-in-time recovery.

### 6.2 Options
| Option | What it takes | Risk |
|---|---|---|
| A. SQLite file on a Railway volume attached to `console` | volume mounted at e.g. `/data`, `TOBIN_DB_PATH=/data/tobin.sqlite`, one replica | volumes: single service, no horizontal scaling, brief downtime at redeploy (**Unknown (verify)**); backups are your responsibility (section 6.3) |
| B. Railway PostgreSQL | port `RegistryStore`, `AuthService` and the store tests to an async Postgres implementation; translate SQLite-specific DDL (`INTEGER PRIMARY KEY AUTOINCREMENT`, `GLOB` CHECKs, triggers with `RAISE(ABORT)`); `DATABASE_URL` injected by the platform | substantial work: `Registry` (974 lines), `AuthService`, `Database.tx` are synchronous; **Inference:** a pg driver forces `async/await` through every method and every route handler |

**Recommendation:** for the Testnet pilot, option A is the lowest-risk and cost-neutral choice; plan option B as a separate milestone with the existing conformance and security tests re-run against Postgres (`testing-and-acceptance-plan.md`). **Owner decision.**

### 6.3 Backup and recovery
- **Verified:** SQLite backup procedure from the repository: online backup (`.backup`), `VACUUM INTO`, or stop and copy all three files (`.sqlite`, `-wal`, `-shm`) (`BACKEND_PERSISTENCE_OPERATIONS.md:47`). The file contains password hashes and invitation hashes.
- **Unknown (verify against Railway docs):** whether Railway volumes have snapshots/backups, their frequency and retention, and whether managed Postgres on the plan in use has automated backups or point-in-time recovery. Do not assume.
- **Recommendation:** a scheduled job (cron service or an external runner) that runs the online backup to object storage, with a restore drill documented and tested before any real use. The integrity of immutable tables can be checked after restore by re-running the batch and fingerprint recomputations that already exist in `Registry`.

## 7. Process model

### 7.1 Start sequence (console)
`next start` -> first request to a route handler -> `getBackend()` -> `readBackendConfig` (fails closed in production without `TOBIN_DB_PATH`, `backend.ts:21-24`) -> `openDatabase` -> `migrate` -> singleton on `globalThis[Symbol.for('tobin.backend')]`. A failure is cached and every request answers 503 without detail (`backend.ts:40-54`). Note: the database is opened lazily on the first request, not at process start.

### 7.2 Single-instance assumptions (Verified flags)
| State | Where | Effect with more than one instance |
|---|---|---|
| SQLite file and WAL | `database.ts` | one writer file; multiple instances on separate volumes would diverge; on one shared volume WAL over a network filesystem is unsafe (**Inference**) |
| Owner-run attempts and prepared transactions | `run.ts:58,60` (`ATTEMPTS`, `PREPARED` maps), `cosign.ts:22` (`PREPARED`) | instance A cannot see instance B's attempts: breaks "never resend" |
| Backend singleton | `globalThis` | fine per process |
| W0 mock console state and its rate limiters | `lib/w0/stores.ts`, `lib/w0/http.ts:46` `RateLimiter`, `SessionStore` (all in memory, `lib/w0/deps.ts:50-65`) | separate per instance; W0 is a mock, not production data |
| Sandbox | `lib/server/sandbox.ts` (bridge process, in memory) | local only; not used in a deployment |
| Auth rate limiting | persisted in `rate_events` (`auth/service.ts:371-375`) | shared through the database, survives restart |
| Sessions | persisted (`auth_sessions`, hash at rest) | shared through the database |
| `apps/web` | stateless apart from React Query in the browser | may scale; the proxy has no cache |

### 7.3 Request-pattern facts that matter for sizing
The web app has no aggregate API. The cross-session hook reads the newest sessions one by one (`apps/web/components/data/useCrossSession.tsx:3`; window of 10 sessions at first and "Load next 10 sessions", `lib/cross-session/window.ts:5`), so a dashboard page load issues roughly 3 requests per session for up to 10 sessions plus a few global calls (see `testing-and-acceptance-plan.md` section 11 for the measured/derived budget). Each browser request becomes one server-side `fetch` from the web service to the console, so the web service's outbound fan-out equals the browser's request count. Latency between services therefore multiplies: keep both in the same Railway region (**Unknown (verify)** that region is selectable per service).

## 8. Proposed environment and build configuration (proposal)

**web service**
| Variable | Value | Secret | When |
|---|---|---|---|
| `TOBIN_API_URL` | `http://<console private hostname>:<console PORT>` | no | runtime |
| `NEXT_PUBLIC_TOBIN_SAMPLE_DATA` | unset | no | build (baked) |
| `TOBIN_DEV_GALLERY` | unset | no | runtime |
| `PORT` | platform-provided | no | runtime |
| build | `npm ci --ignore-scripts` then `npm run build --workspace tobin-web` | | |
| start | `npm run start --workspace tobin-web` after the bind change (`next start --hostname 0.0.0.0 --port $PORT`) | | |

**console service**
| Variable | Value | Secret | When |
|---|---|---|---|
| `NODE_ENV` | `production` (set by `next start`) | no | runtime |
| `PORT` | same value as the `--port` argument | no | runtime |
| `TOBIN_ALLOWED_HOSTS` | proposed new variable: the private hostname with port | no | runtime (after the code change) |
| `TOBIN_DB_PATH` | `/data/tobin.sqlite` (option A) | no | runtime |
| `DATABASE_URL` | Postgres connection string (option B only, after the port) | **yes** | runtime |
| `TOBIN_STELLAR_CLEARING_CONTRACT` | the clearing contract id from `contracts/deployments/testnet.json` | no | runtime |
| `TOBIN_SECOND_ACCOUNT` | only if the owner tools are used on this host | no | runtime |
| `TOBIN_DEPLOYMENT_RECORD`, `TOBIN_ADMIN_ACCOUNT_RECORD` | only if the files are not at the default relative paths | no | runtime |
| build | `npm ci --ignore-scripts` then `npm run build:console` | | |
| pre-deploy | `npm run db:migrate --workspace tobin-web-console` | | |
| start | `next start --hostname 0.0.0.0 --port $PORT` (after the bind change) | | |

**landing (Vercel, unchanged)**: `NEXT_PUBLIC_TOBIN_APP_URL` = the web service's public URL; `NEXT_PUBLIC_SITE_URL` = the landing origin. Both are baked at build time, so changing the web URL needs a landing rebuild.

No Stellar secret key, seed or private signing material belongs in any variable. If a proposal ever needs one, it contradicts the signing-authority constraint (the backend must never sign).

## 9. Why a single Next service is not recommended
- Two `proxy.ts` files (`apps/web/proxy.ts` gates pages by calling `/api/auth/me`; `apps/web-console/proxy.ts` enforces loopback guards and sets a per-request CSP nonce). Their matchers and CSP expectations differ (`web-console` CSP `default-src 'self'`, `connect-src 'self'`, nonce based).
- Both apps define top-level pages such as `/` and `/sign-in` (console `app/(institution)/sign-in`; web `(auth)` group).
- Both would need to be one package or one routing tree; that is a rewrite with no technical benefit stated by the code.

## 10. Cost-neutral sizing guidance
Proposed, not measured (no load test exists): one small instance per service; the console is CPU-light (SQLite, synchronous handlers); RPC calls dominate latency only in the owner tools. Concurrency is limited by synchronous SQLite handlers on one Node thread: a request holding `BEGIN IMMEDIATE` blocks others in that process. Begin with the smallest plan, watch memory during `next build` (a monorepo with two Next builds is the most likely build-time pressure point: **Unknown**), and measure with `apps/web/scripts/measure-requests.mjs` before choosing sizes.

## 11. Open items
- **Unknown:** Railway private-network addressing and IPv4/IPv6 behaviour; health-check Host header and timeout; volume snapshot/backup features; Postgres backup features; pre-deploy command support; region selection; Node version selection mechanism; log retention.
- **Owner decision:** two services versus one container; SQLite on a volume versus a Postgres port now; whether the owner tools run on the hosted console or only locally; who may reach the console pages.
- **Not verified:** the actual memory/CPU footprint; whether `next build` of both apps fits the plan's build resources; `TOBIN_VALIDATION_CREATOR` usage in detail.
