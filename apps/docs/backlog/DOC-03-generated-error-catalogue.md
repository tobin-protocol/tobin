<!-- title: docs(reference): generate the error-code catalogue from the SDK source -->
<!-- labels: documentation -->

# DOC-03: docs(reference): generate the error-code catalogue from the SDK source

## Problem statement

`reference/errors.mdx` was copied by hand from `packages/mvp1-sdk/src/sdk/errors.ts`. It will drift when a code is added.

## Why this is needed

Error tables are exactly the kind of reference that should come from one authoritative source. The SDK already has `CLEARING_ERRORS`, `TOKEN_ERRORS` and explanatory text, and a unit test (`sdk-unit.test.ts`) compares the tables with the Rust source.

## Intended audience

Engineers handling contract failures; maintainers who change error codes.

## Exact scope

- Add a small script under `apps/docs/scripts/` that reads the SDK error tables and writes or verifies the table in `errors.mdx`.
- Add a `--check` mode used by `npm run validate`, so CI fails when the page is stale.
- Add a hand-written section on how to handle each error kind (`contract`, `token`, `auth`, `host`, `transport`, `policy`).

## Relevant source files and directories

- `packages/mvp1-sdk/src/sdk/errors.ts`
- `packages/mvp1-sdk/test/sdk-unit.test.ts`
- `contracts/clearing/src/lib.rs`, `contracts/token/src/lib.rs`
- `apps/docs/scripts/validate-docs.mjs`

## Expected documentation pages

- `reference/errors.mdx` (generated table plus hand-written handling guidance).

## Technical research required

- Confirm the unit test really compares the tables with the Rust source and say precisely what it checks.
- Decide whether Node can import the `.ts` file directly in the docs workspace (Node 24 strips types) or whether the script must parse it; avoid a new dependency unless unavoidable.
- Check that the explanatory strings in `errors.ts` are suitable to publish.

## Acceptance criteria

- The table in the page is produced by the script; editing a code in `errors.ts` without regenerating makes `npm run validate` fail.
- No new npm dependency, or the dependency is justified in the pull request and `ci/dependency-baseline.csv` is regenerated.
- The script is documented in `apps/docs/README.md` and `resources/writing-docs.mdx`.

## Testing and validation requirements

- Run `npm run dev --workspace tobin-docs` and read every new page in the browser, light and dark, desktop and 390 px wide.
- Run `npm run typecheck --workspace tobin-docs`, `npm run validate --workspace tobin-docs` and `npm run build --workspace tobin-docs`; all pass.
- Run `node scripts/ci/check-links.mjs` if a tracked `.md` file was edited.
- Every command, flag, path, name and number in the pages was checked against the source or run, and the pull request lists how.

## Dependencies on other issues

- None. Informs DOC-01.

## Estimated complexity

medium

## Suggested priority

Medium

## Documentation approach

Generated, with a drift check

## Explicitly out of scope

- Generating any other reference.
- Changing error codes or messages.
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
