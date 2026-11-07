<!-- title: docs(reference): document the institutional HTTP routes -->
<!-- labels: documentation -->

# DOC-04: docs(reference): document the institutional HTTP routes

## Problem statement

No reference exists for the application routes. `reference/http-routes.mdx` lists route groups only, and `W1-API-REFERENCE.md` covers only the mock `/api/w0/*` API.

## Why this is needed

Contributors need to know which routes exist, who may call them, and what they return, without reading every handler. There is no OpenAPI description, so this must be derived carefully.

## Intended audience

Backend and frontend engineers, reviewers of authorization changes.

## Exact scope

- `/api/registry/*`, `/api/auth/*`, `/api/stellar/*`, `/api/health`: method, path, request body, response shape, required authentication and role, error responses.
- The request guards (Host/Origin, CSRF header, content type) and rate limiting as they apply to routes.
- State plainly that this is an internal API of a local, single-instance application, not a stable public API.

## Relevant source files and directories

- `apps/web-console/app/api/**/route.ts`
- `apps/web-console/lib/registry/http.ts`, `lib/auth/http.ts`
- `apps/web-console/lib/server/` (guards, `proxy.ts`)
- `docs/product/architecture/wallet-first-auth/WALLET-FIRST-AUTH-ARCHITECTURE.md`

## Expected documentation pages

- Replace the table in `reference/http-routes.mdx` with an index and add `reference/http/registry.mdx`, `reference/http/auth.mdx`, `reference/http/stellar.mdx`.

## Technical research required

- Enumerate routes from the handlers, not from memory; list them in the pull request.
- Exercise each documented route against a local server with a throwaway database and record real responses.
- Decide, with the maintainer, whether introducing an OpenAPI file is worthwhile. Do not generate one from partial metadata.

## Acceptance criteria

- Every route that exists is listed once; none that does not exist is listed.
- Each entry names its authentication and authorization requirement as enforced by the code.
- Example requests and responses come from a real local run, with no secrets or real keys.

## Testing and validation requirements

- Run `npm run dev --workspace tobin-docs` and read every new page in the browser, light and dark, desktop and 390 px wide.
- Run `npm run typecheck --workspace tobin-docs`, `npm run validate --workspace tobin-docs` and `npm run build --workspace tobin-docs`; all pass.
- Run `node scripts/ci/check-links.mjs` if a tracked `.md` file was edited.
- Every command, flag, path, name and number in the pages was checked against the source or run, and the pull request lists how.

## Dependencies on other issues

- DOC-07 (authentication) can proceed in parallel; link between them.

## Estimated complexity

large

## Suggested priority

High

## Documentation approach

Hand-written from handlers (no schema exists)

## Explicitly out of scope

- Adding or changing routes, or publishing an OpenAPI file.
- The mock `/api/w0/*` API beyond a pointer to its existing record.
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
