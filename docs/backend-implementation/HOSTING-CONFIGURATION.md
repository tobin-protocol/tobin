# Hosting configuration (P1)

Status: implemented and **Tested locally** (unit tests, a real-browser check, and a hosted-mode check against real production servers on loopback). **Not** tested on Railway, **not** CI-verified yet (a new CI job is added in the same pull request), not independently reviewed. Stellar Testnet only. Decisions: [`ADR-0001`](ADR-0001-approved-backend-decisions.md).

## 1. Two modes

- **Local (the default, unchanged).** The console accepts only `127.0.0.1:PORT` and `localhost:PORT` as Host and Origin; the web service accepts loopback origins; no shared secret; no forwarded address is trusted.
- **Hosted** (`TOBIN_DEPLOYMENT_MODE=hosted`, set on both services). Everything must be configured, a service refuses to start (and `web` refuses to build) if a required setting is missing or malformed, and development surfaces are refused.

## 2. Environment variables (hosted mode)

Values are never committed. The names below are the whole inventory introduced in P1. `S` marks a secret.

| Variable | Service | Required | Meaning |
|---|---|---|---|
| `TOBIN_DEPLOYMENT_MODE` | both | yes | `hosted` |
| `NODE_ENV` | both | yes | must be `production` |
| `PORT` | both | platform | listening port (digits, 1 to 65535); defaults 8787 (console) and 3000 (web) |
| `TOBIN_BIND_HOST` | both | for hosting | interface to listen on, for example `::` or `0.0.0.0`; default `127.0.0.1` |
| `TOBIN_ALLOWED_HOSTS` | console | yes | comma list of exact Host values the console serves, for example `console.railway.internal:8787`. No wildcards |
| `TOBIN_ALLOWED_ORIGINS` | console | no | exact Origins accepted on `/api`; normally empty (the web proxy sends no browser Origin) |
| `TOBIN_HEALTH_HOSTS` | console | no | Host values accepted **only** for `/api/live`, `/api/ready`, `/api/health` (the platform health check uses its own Host name) |
| `TOBIN_PROXY_SECRET` (S) | both | yes | shared secret, at least 32 characters; `web` sends it in `x-tobin-proxy-auth`, the console requires it on every non-probe request |
| `TOBIN_PUBLIC_ORIGIN` | both | yes | the one `https://` origin of the web application; the only Origin the API proxy accepts; also the wallet sign-in domain |
| `TOBIN_DB_PATH` | console | yes | the SQLite file (replaced by PostgreSQL configuration in P4) |
| `TOBIN_API_URL` | web | yes | the **private** console URL; never a public address |
| `TOBIN_TRUSTED_PROXY_HOPS` | web | yes | exactly `0` or `1` (see section 5) |

Must be absent in hosted mode: `NEXT_PUBLIC_TOBIN_SAMPLE_DATA` (a hosted build and a hosted start refuse it: it disables access control), `TOBIN_DEV_GALLERY`. The development identity-provider switch of the W0 mock API is irrelevant because the W0 API is refused outright.

## 3. What the hosted console serves

Only `/api/auth/*`, `/api/registry/*` and the probes `/api/live`, `/api/ready`, `/api/health`. Everything else (pages, the MVP-1 sandbox, the W0 mock API, `/api/rpc`, `/api/bootstrap`, the owner Stellar tools under `/api/stellar/*`) answers 404, **even with a valid secret**. `apps/web-console/test/guards-hosted.test.ts` enumerates every route handler in `app/api` and fails if a new one is neither served on purpose nor refused. `/api/rpc`, `/api/bootstrap` and the W0 route also refuse in their own handlers (second line).

Order of checks: Host (a probe Host is accepted for probe paths only), served path, Origin, JSON content type, proxy secret (not for probes). Local mode keeps its original order and messages.

## 4. Probes

| Path | Service | Meaning | Cost |
|---|---|---|---|
| `/api/live` | both | the process answers | none |
| `/api/ready` | console | database answers and the schema is current; reports `stellar: not checked` | one query |
| `/api/ready` | web | the console is reachable and ready (called with the proxy secret); reports only a status word | one call |
| `/api/health` | console | the earlier combined check, kept for compatibility | one query |

Neither probe says anything about Stellar connectivity. A separate Stellar check does not exist and is not implied.

## 5. Browser-facing proxy, CSRF and the client address

The web proxy (`apps/web/app/api/[...path]/route.ts`) validates the **real** browser request before it forwards (`lib/server/csrf.ts`): for a write, `application/json`, the `x-tobin-request: 1` header that the app's own client sets, an `Origin` exactly equal to the allowed origin (hosted: `TOBIN_PUBLIC_ORIGIN`; local: an `http` loopback origin), and `Sec-Fetch-Site: same-origin` when the browser sends it; for a read, `same-origin` or `none` when sent and an allowed `Origin` when sent. Only then does it add the header the console requires. `SameSite=Strict` on the session cookie stays.

Client address for per-address rate limits: with `TOBIN_TRUSTED_PROXY_HOPS=1`, the proxy uses the **last** `X-Forwarded-For` entry (the one the single trusted proxy appended) and sends it to the console as `x-tobin-client-ip`; earlier entries are client-supplied and ignored. The console trusts that header only in hosted mode and only on a request that already presented the proxy secret. With `0`, no address is trusted and the per-address limits do not apply (the per-user, per-key and global limits still do; there is never a shared "unknown" bucket). Whether Railway's edge appends the client address as the last `X-Forwarded-For` entry is **Unknown** (section 7).

## 6. Security headers on `apps/web`

`Content-Security-Policy` per request with a nonce (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src 'self' 'nonce-…'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, no `unsafe-inline`, no `unsafe-eval`), `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and `Strict-Transport-Security` in hosted mode. Required changes to keep the policy strict: pages render per request (`dynamic = "force-dynamic"` in the root layout) so Next attaches the nonce; a small client component hands the nonce to Radix's scroll lock through `__webpack_nonce__`; Zod's code generator is switched off (`z.config({ jitless: true })`) so it does not call `eval`. The Freighter extension talks to the page through `window.postMessage`, which a CSP does not govern; this was exercised with a **mock** extension, not the real one.

## 7. Railway facts checked against the official documentation (2026-11-09)

| Question | Documentation | Conclusion |
|---|---|---|
| Private DNS | https://docs.railway.com/networking/private-networking | services in the same project environment reach each other as `SERVICE_NAME.railway.internal` (example `http://api.railway.internal:PORT`); each environment has an isolated network |
| IPv4 and IPv6 | https://docs.railway.com/networking/private-networking/how-it-works | environments created after 2025-10-16: DNS names resolve to both internal IPv4 and IPv6; legacy environments: IPv6 only; any valid IPv6 or IPv4 traffic is allowed |
| Listen address | same page and https://docs.railway.com/networking/private-networking/library-configuration | **not stated** for Node.js or Next.js. The page shows `::,0.0.0.0` for MongoDB and `tcp` (dual-stack) for Fiber. **Decision:** the launcher takes `TOBIN_BIND_HOST`; the recommended value is `::` (dual-stack on Linux) so both address families reach the service; whether Next accepts `::` and answers on IPv4 as well is **Unknown** and is part of the staging validation plan |
| `PORT` | not found in the pages read | **Unknown**. The launcher reads `PORT` and falls back to the defaults; staging confirms the platform injects it |
| Health-check Host | https://docs.railway.com/reference/healthchecks | Railway uses the hostname `healthcheck.railway.app`; an app that restricts hosts must allow it or checks fail (for example status 400). **Applied:** `TOBIN_HEALTH_HOSTS=healthcheck.railway.app` admits that Host for the three probe paths only |
| Health-check timing | same page | default timeout 300 seconds (configurable with `RAILWAY_HEALTHCHECK_TIMEOUT_SEC`); any 2xx passes; it runs only at the start of a deployment, not afterwards |
| Not yet checked | | volumes, PostgreSQL limits and backups, pre-deploy command, domains and HTTPS, rollback, log retention, region, Node 24 support: P6 |

Staging validation plan for the Unknowns: deploy the pair to a staging environment with a throwaway secret; from the web service, call the console by its `.railway.internal` name over both families; read the actual `X-Forwarded-For` the web service receives from a request through the public domain and set `TOBIN_TRUSTED_PROXY_HOPS` accordingly; confirm the injected `PORT`; confirm the health check passes with the configured Host.

## 8. Verification evidence (P1, local)

See `IMPLEMENTATION-STATUS.md`. Scripts: `apps/web/scripts/check-hosted-config.mjs` (hosted servers on loopback), `apps/web/scripts/check-security-headers.mjs` (real Chrome against a running build), unit tests in both apps.
