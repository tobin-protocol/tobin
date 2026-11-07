<!-- title: docs(architecture): document the Stellar integration layer (lib/stellar) -->
<!-- labels: documentation -->

# DOC-08: docs(architecture): document the Stellar integration layer (lib/stellar)

## Problem statement

The execution page describes the contract steps but not the application modules that build the plan, read signer sets, talk to RPC and compare results.

## Why this is needed

Engineers changing execution, signing or reconciliation need a map of the modules, their inputs and what each is allowed to do.

## Intended audience

Engineers working on `apps/web-console/lib/stellar`.

## Exact scope

- Purpose, inputs, outputs and safety rules of `execution-plan`, `signer-set`, `rpc`, `compare`, `cosign`, `run`, `owner-validation`, `owner-access`, `retry-policy`, `freighter`.
- What may read the network and what may submit.
- Testnet-only restrictions and where they are enforced.

## Relevant source files and directories

- `apps/web-console/lib/stellar/`
- `docs/product/architecture/mvp-1.5/`
- `apps/web-console/test/` (stellar tests)

## Expected documentation pages

- New `architecture/stellar-integration.mdx`.

## Technical research required

- For each module, identify the tests that cover it and note modules without tests.
- Confirm Testnet-only enforcement points in code.

## Acceptance criteria

- Every module in the directory is described or explicitly marked as internal.
- Read-only and submitting operations are clearly separated.
- Links to canonical MVP-1.5 records are used for evidence.

## Testing and validation requirements

- Run `npm run dev --workspace tobin-docs` and read every new page in the browser, light and dark, desktop and 390 px wide.
- Run `npm run typecheck --workspace tobin-docs`, `npm run validate --workspace tobin-docs` and `npm run build --workspace tobin-docs`; all pass.
- Run `node scripts/ci/check-links.mjs` if a tracked `.md` file was edited.
- Every command, flag, path, name and number in the pages was checked against the source or run, and the pull request lists how.

## Dependencies on other issues

- None. Feeds DOC-09.

## Estimated complexity

medium

## Suggested priority

Medium

## Documentation approach

Hand-written

## Explicitly out of scope

- Running any network operation; changing the modules.
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
