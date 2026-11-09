# Railway Testnet pilot (interim deployment, 2026-11-09)

Status: **deployed and checked on Railway** for a demonstration and an SCF submission. Stellar Testnet only, test assets only. Specification and validation stage; experimental; not production-ready; unaudited. This is an **interim** setup that departs from ADR-0001 on purpose: it runs on **SQLite on a Railway volume with one replica** (the audit's recommended first step for a Testnet pilot) instead of PostgreSQL (BD-02), because PostgreSQL (P3 to P5) is not built yet. The owner approved the interim on 2026-11-09. The PostgreSQL migration remains the plan.

## What is deployed

| Item | Value |
|---|---|
| Railway project | `tobin-testnet-pilot`, environment `production` |
| `web` service | public; image `Dockerfile.web`; domain `https://web-production-8b8f56.up.railway.app` |
| `console` service | private (no public domain), reached as `console.railway.internal:8787`; image `Dockerfile.console`; volume mounted at `/data` holding `/data/tobin.sqlite` |
| Mode | `TOBIN_DEPLOYMENT_MODE=hosted` on both (fail-closed guards, shared proxy secret, security headers, CSP; see `HOSTING-CONFIGURATION.md`) |

Variable **names** set (values live only in Railway): both: `RAILWAY_DOCKERFILE_PATH`, `PORT`, `TOBIN_BIND_HOST` (`::`), `TOBIN_DEPLOYMENT_MODE`, `TOBIN_PROXY_SECRET`, `TOBIN_PUBLIC_ORIGIN`; web: `TOBIN_API_URL`, `TOBIN_TRUSTED_PROXY_HOPS` (`1`, unverified against Railway's edge: see below); console: `TOBIN_ALLOWED_HOSTS`, `TOBIN_HEALTH_HOSTS`, `TOBIN_DB_PATH`, `TOBIN_ASSET_ISSUER`. `NODE_ENV=production` is set in the images after the build.

## Verified on the live deployment

Public web liveness and security headers (CSP with nonce, HSTS, frame protection); web readiness reaches the private console and the console reports its database ready ("stellar: not checked"); register, session cookie, create organization; sign-in again after a redeploy of the console (the volume persisted the data); the public Discover endpoints answer (no institutions yet, because no organization has chosen public visibility). Not verified on Railway: the forwarded client address behaviour (`TOBIN_TRUSTED_PROXY_HOPS`), `::` binding on IPv4 (it works, as the web service reached the console), backups and restore of the volume, rollback, log retention.

## Public Discover API (new)

`GET /api/public/v1/stats`, `/institutions`, `/settlements`, `/assets` (unauthenticated, read-only, cursor paged). Only organizations whose administrators chose public visibility appear, with only name, institution type and jurisdiction. Settlements and asset use publish nothing and the statistics are `null`, because the backend never records an independently read-back transaction; `verifiedReadBack` cannot be true in this build. The web app's Discover screen is not yet wired to this API.

## Not included

Hosted signing, submission and confirmation of transactions: the owner-run tools stay local (BD-05) and execution actions stay disabled in the hosted app. Wallet linking, invitation-controlled registration (registration is **open** on this deployment), email verification and recovery, the separate batch-reviewer rule, PostgreSQL, backups and a restore test. Do not present this as production.

## Operating notes

- Redeploy: export the tracked files of the branch to a clean directory (never upload the working tree: it may hold private untracked files), link with `railway link`, then `railway up -s console --detach` and `railway up -s web --detach`. Use `MSYS_NO_PATHCONV=1` in Git Bash so paths such as `/data/tobin.sqlite` are not rewritten.
- The shared proxy secret was printed once by the CLI during setup and must be **rotated** (set a new value on both services, redeploy both) before any wider use.
- Interim: the console runs `db migrate` on every start (single replica only); asset seeding is idempotent.
