# Tobin Console (Next.js, local sandbox)

The MVP-1 Console: a Next.js App Router application that drives the **local sandbox**, the real `TobinClearingV1` and `TobinTestToken` contracts running in the Soroban test host behind the Rust development bridge. It is experimental and local only: it binds to `127.0.0.1`, talks to no Stellar network, holds no keys and signs nothing; authorizations are simulated grants that the real contract still checks. The sandbox lives only in the memory of the server process.

## Layout
| Path | Role |
|---|---|
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
cd apps/web-console && TOBIN_WIDTH=420 node test/browser/journey.mjs <screenshot dir>   # real-browser journey (needs Chrome or Edge, a build, the bridge)
```
This repository's Next.js version differs from common knowledge; read `node_modules/next/dist/docs/` before changing framework code.
