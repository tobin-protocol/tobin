# Hosting and domain architecture (Phase 2C, revised after owner decision D4)

Written 2026-11-03. Design and instructions for a later deployment phase. **Nothing was created, configured or deployed**: no Vercel project, DNS record, domain attachment, environment variable or deployment. This revision replaces the earlier same-project analysis, which was superseded by the owner's decision D4: a **separate Vercel project** for the application at `app.tobinprotocol.xyz`; the landing page stays in its existing project, domain and behaviour.

## 1. Topology

| | Landing | Application (new) |
|---|---|---|
| Vercel project | Existing `tobin-landing` (local link file `.vercel/project.json`) | New, separate project (name chosen at creation) |
| Source | `apps/landing` | `apps/web-console` (to be evolved in MVP-1) |
| Domain | Existing apex domain, unchanged | `app.tobinprotocol.xyz` |
| Lifecycle | Unchanged | Independent builds, deploys, rollbacks |
| Environment variables | Unchanged | Its own set; nothing shared |

The monorepo workspaces are `apps/*` and `packages/*` (root `package.json`). A second Vercel project from the same repository sets its **Root Directory** to `apps/web-console`. The workspace package `tobin-mvp1-sdk` is consumed through `transpilePackages` (`apps/web-console/next.config.ts`), so the project must install from the repository root (Vercel's monorepo support); whether "include source files outside the root directory" is needed is a setting to verify at creation. Vercel project behaviour described here is from general knowledge and was not checked against current Vercel documentation or the dashboard in this phase (Unverified).

Because the projects are separate, the earlier landing-regression risk from a shared build disappears. Remaining coupling: the shared repository (path-filtered builds should be configured so a landing-only change does not redeploy the application and vice versa) and shared design tokens, once extracted to a package, which must be introduced without changing landing output.

## 2. Environment separation

| Concern | Production | Preview |
|---|---|---|
| Host | `app.tobinprotocol.xyz` | Vercel-generated preview URLs |
| Stellar network | Testnet only during MVP-1 development | Testnet only |
| Database | Production database | Separate database or branch; never the production one |
| Secrets | Project-level, never in the repository, never `NEXT_PUBLIC_` | Separate values |
| Sign-in origin | Exact production origin only | Not accepted unless explicitly listed |

Variables to define (names proposed): `STELLAR_NETWORK=testnet`, `STELLAR_NETWORK_PASSPHRASE`, `SOROBAN_RPC_URL`, `TOBIN_DEPLOYMENT` (read from the committed manifest, not an env value), `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`. No key material in any variable.

## 3. Protection against accidental Mainnet configuration

1. A single server-side config module is the only reader of network variables; it asserts the passphrase equals the Testnet passphrase and the RPC host is on an allow-list, and the process **refuses to start** otherwise.
2. A build-time check fails if a Mainnet passphrase string appears in the environment.
3. The contract IDs come from `contracts/deployments/testnet.json`, whose network field must equal `testnet`.
4. Before every signature request the client re-checks the wallet's network passphrase against the configured one and refuses a mismatch.
5. A persistent "Testnet, experimental" banner.
6. Production-promotion requires the release gates (`scripts/release/check-gates.mjs`) to be green.

## 4. Authentication and cookies

- Wallet-signature sign-in (D2): the server issues a short-lived, single-use challenge bound to the address, origin and expiry; the wallet signs it; the server verifies and issues a session. No OAuth redirect, so no callback URL exists for MVP-1. If email is added later, register only exact `https://app.tobinprotocol.xyz/...` callbacks, no wildcards.
- Session cookie: `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax` (or `Strict`), `Path=/`, **no `Domain` attribute** so it is host-only to `app.tobinprotocol.xyz` and never sent to the apex or other subdomains.
- The authentication signature never authorizes any contract operation (D2).

## 5. CORS, CSP, origins

- No CORS: application and API are same-origin; no `Access-Control-Allow-Origin` header; state-changing requests check `Origin` equals `APP_ORIGIN` and require `application/json`.
- CSP: keep the console's per-request nonce policy (`buildCsp` in `apps/web-console/lib/server/guards.ts`, applied in `proxy.ts`); change `connect-src` from `'self'` to `'self'` plus the exact Soroban RPC origin; no wildcards. The local-only host guard (`allowedHosts`) must be **replaced** by an allow-list of the real production host and, for previews, nothing but the preview host pattern Vercel assigns; it must not be loosened to accept any host.
- RPC endpoint: configurable per environment, Testnet public endpoint for development (the manifest records `https://soroban-testnet.stellar.org`); rate limits unknown (Unverified); a dedicated provider is a later decision.

## 6. Later deployment phase: instructions (not executed)

1. Create the new Vercel project from the repository; Root Directory `apps/web-console`; install at the repository root; set an ignored-build-step or path filter so landing-only commits do not rebuild it.
2. Set production and preview environment variables (section 2). Do not copy the landing project's variables.
3. Deploy a **preview** first and verify headers (CSP, no CORS, cookie attributes) and the Testnet guard.
4. Add the domain `app.tobinprotocol.xyz` to the new project; create the DNS record Vercel specifies (a CNAME or the record the dashboard shows; owner action at the DNS provider); wait for verification and certificate issuance.
5. Verify the apex site is unchanged (route, headers, content) and that it is still served by its own project.
6. Promote; record the deployment ID.

## 7. Rollback

Each deployment is immutable; roll back by promoting the previous production deployment of the application project (the landing project is untouched). Database migrations must be backward compatible for one release so a code rollback does not need a data rollback. Removing the domain from the application project returns `app.` to unresolved without touching the apex.

## 8. Risks

DNS or certificate misconfiguration affecting only the subdomain; accidental attachment of the domain to the landing project (verify the project selector); environment variable leakage through `NEXT_PUBLIC_`; preview deployments reaching a production database; unverified Vercel settings listed above.
