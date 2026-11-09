# Tobin web console

The Next.js (App Router) application that hosts the repository's backend: the institutional API, the owner-run Testnet tools and the local sandbox. `apps/web` is the canonical user-facing application and a client of this API; the older institutional UI in this app overlaps with it. It contains four surfaces; read which one you are touching before you change it.

| Surface | Where | What it does | Network and keys |
|---|---|---|---|
| **Institutional application** | pages under `app/(institution)` (start at `/sign-in`), routes `/api/auth`, `/api/registry`, `/api/health` | Wallet-first sign-in, organizations and memberships, clearing sessions, obligations, deterministic calculations, reviewer authorization, settlement preparation. State is persisted in SQLite (`lib/db`). | Sign-in verifies a signature over a server-issued challenge; the server holds no wallet keys. It records and prepares; it does not submit transactions. |
| **Owner-run Stellar Testnet tools** | `/wallet-check`, `/cosign-check`, `/settle-run`, routes `/api/stellar/*`, code in `lib/stellar` | Verify wallet and multisig control, collect real Freighter signatures, submit the settlement transactions one step at a time after the owner's typed confirmation, and read results back from the network. | **Testnet only**, owner-run, with their own run log. Confirmed outcomes are not written back into the application's records. |
| **Local sandbox console** | page `/`, routes `/api/bootstrap`, `/api/rpc`, code in `lib/console` | The MVP-1 sandbox: the real `TobinClearingV1` and `TobinTestToken` contracts running in the Soroban test host behind the Rust development bridge. Needs `TOBIN_BRIDGE_EXE`. | No Stellar network, no keys, nothing signed; authorizations are simulated grants that the real contract still checks. Its state lives only in the memory of the server process. |
| **W0 console** | `/w0`, `/api/w0/*` | A non-executing foundation with a mock signer adapter (see the W0 section below). | Mock only. |

Locally, everything binds to the loopback interface (`127.0.0.1`) and refuses other Host names. With `TOBIN_DEPLOYMENT_MODE=hosted` (the Railway Testnet demonstration) the process instead requires configured allowed hosts and a shared proxy secret, serves only `/api/auth`, `/api/registry`, `/api/public` and the health probes, and does not serve the sandbox, W0 or `/api/stellar` routes; see [`docs/backend-implementation/RAILWAY-TESTNET-PILOT.md`](../../docs/backend-implementation/RAILWAY-TESTNET-PILOT.md). This is an implemented pre-production application: it runs on Stellar Testnet only, production deployment has not been approved, and no independent security review has been performed. See the [root README](../../README.md) for the milestone status and the [maturity terminology guide](../../docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md) for how to describe it.

## Layout
| Path | Role |
|---|---|
| `app/(institution)/` | the institutional pages (sign-in, onboarding, organizations, sessions, account) and the owner-run tool pages (`wallet-check`, `cosign-check`, `settle-run`) |
| `app/api/auth`, `app/api/registry`, `app/api/stellar`, `app/api/health` | route handlers for the institutional application and the owner-run tools |
| `lib/auth`, `lib/db`, `lib/registry`, `lib/stellar` | authentication and wallet challenges, SQLite and numbered migrations, the registry service (organizations, sessions, authorization, settlement preparation), and the Stellar adapter and owner-run tools |
| `scripts/` | database operator commands (`db.ts`) and Testnet read-only scripts |
| `app/layout.tsx`, `app/page.tsx`, `app/globals.css` | page shell (title, header text, landmarks), the dynamically rendered page, styles |
| `components/console-app.tsx` | client component: mounts the controller, renders its HTML into `#app`, wires `submit`, `click` and `change`, reports errors in `#error`; removes its listeners on unmount |
| `lib/console/` | `controller.ts` (behaviour), `view.ts` (pure HTML renderer), `http-transport.ts` (browser transport); unchanged logic from the earlier plain-DOM Console |
| `lib/server/` | `guards.ts` (Host/Origin/content-type guards, body limit, CSP, header constants), `api.ts` (the two endpoints as functions), `sandbox.ts` (process-wide bridge singleton), `deps.ts` |
| `app/api/bootstrap/route.ts`, `app/api/rpc/route.ts` | route handlers on the Node.js runtime, never cached |
| `proxy.ts` | runs before every request: local-only guards on everything and a per-request nonce Content-Security-Policy |
| `next.config.ts` | transpiles the workspace SDK `tobin-mvp1-sdk`; static security headers on every response |
| `test/` | unit tests (`guards`, `api`, `console-view`, `console-input`), tests against the real bridge (`console`), a running-server test (`next-server`), and the real-browser journey (`test/browser/journey.mjs`) |

## Security decisions (all inherited from the earlier server, now enforced in `proxy.ts` and the handlers)
* Host must be `127.0.0.1:PORT` or `localhost:PORT` for every request (DNS rebinding); a foreign `Origin` is refused on `/api/*`; POST bodies must be `application/json`; bodies are limited to 1,000,000 bytes (counted while streaming); `/api/rpc` accepts only calls to the sandbox's known contracts; no CORS header is ever sent.
* `Content-Security-Policy` with a fresh nonce per document request (Next.js applies it to its own scripts): `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`; no `unsafe-inline`, and `unsafe-eval` only in development. `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` on every response.
* Always start the server bound to the loopback interface (`--hostname 127.0.0.1`, as the scripts do) and keep `PORT` consistent with `--port`.

## Commands (from the repository root, after `npm ci`)
```
# once: build the Rust bridge and point to it
cd contracts && cargo build --offline -p tobin-clearing-v1 --example bridge
export TOBIN_BRIDGE_EXE=<target dir>/debug/examples/bridge.exe

npm run build:console                           # next build
npm run start --workspace tobin-web-console     # http://127.0.0.1:8787/
npm run dev   --workspace tobin-web-console     # development server, same address
npm test                                        # all workspaces; bridge tests are SKIPPED, visibly, when TOBIN_BRIDGE_EXE is unset
npm run db:migrate --workspace tobin-web-console   # idempotent; migrations also apply when the server starts
npm run db:status  --workspace tobin-web-console   # prints the schema version; exits 2 while migrations are pending
cd apps/web-console && TOBIN_WIDTH=420 node test/browser/journey.mjs <screenshot dir>   # real-browser journey (needs Chrome or Edge, a build, the bridge)
```
This repository's Next.js version differs from common knowledge; read `node_modules/next/dist/docs/` before changing framework code.

## W0: non-executing Web Console foundation (`/w0`)
Under `lib/w0/`, `app/w0/`, `app/api/w0/` and `components/w0/`. It uses a **mock signer adapter** and does not invoke the real signer, hold keys, sign, submit, contact RPC or deploy. Development identity only. See [docs/product/architecture/w0/W0-ARCHITECTURE.md](../../docs/product/architecture/w0/W0-ARCHITECTURE.md). Open `http://127.0.0.1:8787/w0` under `npm run dev`; in a production build set `W0_ALLOW_DEV_IDP=1` to enable the development identity provider. The MVP-1 sandbox page at `/` is unchanged.

Environment variables are listed in the [root README](../../README.md#environment-and-database).
