<!-- title: docs(development): document the database schema, migrations and immutable tables -->
<!-- labels: documentation -->

# DOC-05: docs(development): document the database schema, migrations and immutable tables

## Problem statement

The persistence page summarises properties but there is no table catalogue, no migration history and no guidance on writing a migration.

## Why this is needed

The schema enforces important rules with triggers. Contributors adding a table or migration need to know the conventions and what must never be updated or deleted.

## Intended audience

Backend engineers writing migrations or queries; reviewers.

## Exact scope

- Migrations 1 to 8: what each introduced.
- Table catalogue grouped by area (identity, organizations, sessions, calculations, authorization, settlement, execution, authentication).
- Which tables are immutable or append-only and which triggers enforce it.
- How to write, test and review a migration; the operator commands `db:migrate`, `db:status`, `db:seed-demo` and the asset commands in `scripts/db.ts`.

## Relevant source files and directories

- `apps/web-console/lib/db/database.ts` (`MIGRATIONS`)
- `apps/web-console/scripts/db.ts`
- `apps/web-console/lib/registry/sqlite-store.ts`
- `docs/product/architecture/mvp-1.2/BACKEND_PERSISTENCE_DATA_MODEL.md`

## Expected documentation pages

- New `development/database.mdx`; update `architecture/persistence.mdx` to link to it.

## Technical research required

- Create a throwaway database with `TOBIN_DB_PATH` and list the schema with SQLite tooling.
- Cross-check the canonical data model record and note any drift as a finding.

## Acceptance criteria

- Every table in a freshly migrated database appears in the catalogue.
- Immutable tables and their triggers are listed accurately.
- The migration how-to is followed once, end to end, in the pull request.

## Testing and validation requirements

- Run `npm run dev --workspace tobin-docs` and read every new page in the browser, light and dark, desktop and 390 px wide.
- Run `npm run typecheck --workspace tobin-docs`, `npm run validate --workspace tobin-docs` and `npm run build --workspace tobin-docs`; all pass.
- Run `node scripts/ci/check-links.mjs` if a tracked `.md` file was edited.
- Every command, flag, path, name and number in the pages was checked against the source or run, and the pull request lists how.

## Dependencies on other issues

- None.

## Estimated complexity

medium

## Suggested priority

Medium

## Documentation approach

Hand-written

## Explicitly out of scope

- Schema changes; production database operations (DOC-11).
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
