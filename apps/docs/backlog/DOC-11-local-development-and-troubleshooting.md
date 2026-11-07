<!-- title: docs(development): write local development setup details and a troubleshooting guide -->
<!-- labels: documentation -->

# DOC-11: docs(development): write local development setup details and a troubleshooting guide

## Problem statement

Setup is summarised, but common failures are undocumented: the bridge not found, skipped tests, Windows paths, a full disk, a stale Cargo target, browser not detected, port in use, migrations pending.

## Why this is needed

New contributors lose the most time here, and skipped tests are easy to misread as passes.

## Intended audience

Developers joining the project.

## Exact scope

- A symptom, cause, fix table built from real failures.
- The bridge build and `TOBIN_BRIDGE_EXE` on each OS, interpreting skipped tests, Windows and PowerShell specifics, disk space, browser journeys setup.

## Relevant source files and directories

- `README.md`, `CONTRIBUTING.md`, `AGENTS.md`
- `apps/web-console/test/`, `packages/mvp1-sdk/test/`
- `contracts/README.md`
- `.github/workflows/ci.yml`

## Expected documentation pages

- New `development/troubleshooting.mdx` and `development/local-environment.mdx`.

## Technical research required

- Follow the setup on a clean checkout and write down every failure you hit.
- Reproduce each listed symptom or cite where it is documented.

## Acceptance criteria

- Each entry has a symptom, cause and verified fix.
- Nothing is listed that was not reproduced or sourced.

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

High

## Documentation approach

Hand-written

## Explicitly out of scope

- Fixing the underlying issues.
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
