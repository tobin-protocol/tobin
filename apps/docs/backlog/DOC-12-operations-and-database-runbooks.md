<!-- title: docs(development): document the operational procedures that exist today -->
<!-- labels: documentation -->

# DOC-12: docs(development): document the operational procedures that exist today

## Problem statement

There is no developer-facing summary of backup, restore, migration and health-check procedures for the SQLite database, and none for release gates.

## Why this is needed

The application is single-instance with one database file. Operators need the real constraints (migrations, `TOBIN_DB_PATH`, health endpoint) without invented production procedures.

## Intended audience

Maintainers and anyone running the console beyond a laptop.

## Exact scope

- What the records and code establish: migrations on start, `db:status` semantics, the health route, required `TOBIN_DB_PATH` in production.
- Release gates and how `release/` and `ci/` are used.
- An explicit list of what is not defined (backup, restore, monitoring) so it is not assumed.

## Relevant source files and directories

- `docs/product/architecture/mvp-1.2/BACKEND_PERSISTENCE_OPERATIONS.md`
- `apps/web-console/app/api/health/route.ts`, `lib/db/database.ts`
- `release/`, `ci/README.md`
- `docs/product/architecture/phase-2c/hosting-and-domain-architecture.md`

## Expected documentation pages

- New `development/operations.mdx`.

## Technical research required

- Verify every operational claim against code. Mark anything defined only in a design record as design, not implemented.

## Acceptance criteria

- No procedure is described that is not backed by code or a record.
- Unknowns are listed.

## Testing and validation requirements

- Run `npm run dev --workspace tobin-docs` and read every new page in the browser, light and dark, desktop and 390 px wide.
- Run `npm run typecheck --workspace tobin-docs`, `npm run validate --workspace tobin-docs` and `npm run build --workspace tobin-docs`; all pass.
- Run `node scripts/ci/check-links.mjs` if a tracked `.md` file was edited.
- Every command, flag, path, name and number in the pages was checked against the source or run, and the pull request lists how.

## Dependencies on other issues

- DOC-05.

## Estimated complexity

medium

## Suggested priority

Low

## Documentation approach

Hand-written

## Explicitly out of scope

- Defining new production procedures; deployment of the console.
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
