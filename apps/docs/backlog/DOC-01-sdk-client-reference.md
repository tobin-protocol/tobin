<!-- title: docs(reference): document the TypeScript SDK client and prepared calls -->
<!-- labels: documentation -->

# DOC-01: docs(reference): document the TypeScript SDK client and prepared calls

## Problem statement

The SDK page lists the `prepare*` functions and the `TobinClient` method names in a table but gives no parameters, return types, preconditions, authorizations or examples. A new developer cannot use the SDK without reading the source.

## Why this is needed

The SDK is the shared interface between the application, the tests and the contracts. Its trust boundary (it prepares and states authorizations; it never signs or touches the network) must be explicit and findable.

## Intended audience

Engineers writing code or tests against `packages/mvp1-sdk`, and reviewers checking it.

## Exact scope

- Every export of `tobin-mvp1-sdk/sdk`: `prepare*` functions, `debtorAuthorizations`, `TobinClient` methods, `Transport`, `InvokeOptions`, `InvocationResult`, `Resources`, `NetworkTransportNotAuthorized`.
- Per function: purpose, parameters, return value, the contract function it maps to, the authorizations it requires, errors it can raise.
- A worked example that runs against the local bridge (`tobin-mvp1-sdk/local/bridge`).
- Split into sub-pages (prepared calls, client, transport) if one page becomes unwieldy.

## Relevant source files and directories

- `packages/mvp1-sdk/src/sdk/` (`prepare.ts`, `client.ts`, `transport.ts`, `abi.ts`, `errors.ts`, `intent.ts`)
- `packages/mvp1-sdk/src/local/bridge.ts`
- `packages/mvp1-sdk/test/` (usage examples)
- `packages/mvp1-sdk/README.md`

## Expected documentation pages

- Expand `apps/docs/content/docs/reference/sdk.mdx` or split it into `reference/sdk/*`; update `reference/meta.json` and `reference/index.mdx`.

## Technical research required

- Run the SDK tests with and without `TOBIN_BRIDGE_EXE` and note what is skipped.
- Confirm the authorizations each `prepare*` function states against `contracts/clearing/src/lib.rs`.
- Decide, with the maintainer, whether a TypeDoc-style generator is worth adding later (see DOC-03 for the same question on errors). The package is private and its doc comments are uneven, so start by hand.

## Acceptance criteria

- Every exported function and method is documented with parameters, returns and errors.
- No documented behaviour is absent from the source; no source export is undocumented without a stated reason.
- The example runs unchanged against the local bridge and its output is shown.
- The page states that there is no wallet or network transport.

## Testing and validation requirements

- Run `npm run dev --workspace tobin-docs` and read every new page in the browser, light and dark, desktop and 390 px wide.
- Run `npm run typecheck --workspace tobin-docs`, `npm run validate --workspace tobin-docs` and `npm run build --workspace tobin-docs`; all pass.
- Run `node scripts/ci/check-links.mjs` if a tracked `.md` file was edited.
- Every command, flag, path, name and number in the pages was checked against the source or run, and the pull request lists how.

## Dependencies on other issues

- None. Pairs with DOC-02 (digests) and DOC-03 (errors).

## Estimated complexity

large

## Suggested priority

High

## Documentation approach

Hand-written

## Explicitly out of scope

- Writing a network or wallet transport.
- Generating the reference automatically (a follow-up decision).
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
