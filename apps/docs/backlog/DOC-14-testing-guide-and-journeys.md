<!-- title: docs(development): catalogue the test suites and browser journeys -->
<!-- labels: documentation,good first issue -->

# DOC-14: docs(development): catalogue the test suites and browser journeys

## Problem statement

The testing page lists layers and journey names but not what each suite or journey covers or how to run one in isolation.

## Why this is needed

Contributors choose which tests to run; a short catalogue prevents skipping the relevant one.

## Intended audience

New contributors.

## Exact scope

- One line per journey and per major test file: what it proves, how long it takes, its prerequisites.
- How to run a single test file.

## Relevant source files and directories

- `apps/web-console/test/`, `apps/web-console/test/browser/`
- `packages/mvp1-sdk/test/`
- `contracts/clearing/tests/`

## Expected documentation pages

- Extend `development/testing.mdx`.

## Technical research required

- Read each journey script header; run at least the unit suites to confirm the commands.

## Acceptance criteria

- Every journey listed exists and has the right npm script or invocation.
- Prerequisites such as a production build are stated.

## Testing and validation requirements

- Run `npm run dev --workspace tobin-docs` and read every new page in the browser, light and dark, desktop and 390 px wide.
- Run `npm run typecheck --workspace tobin-docs`, `npm run validate --workspace tobin-docs` and `npm run build --workspace tobin-docs`; all pass.
- Run `node scripts/ci/check-links.mjs` if a tracked `.md` file was edited.
- Every command, flag, path, name and number in the pages was checked against the source or run, and the pull request lists how.

## Dependencies on other issues

- None.

## Estimated complexity

small

## Suggested priority

Low

## Documentation approach

Hand-written

## Explicitly out of scope

- Writing new tests.
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
