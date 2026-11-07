<!-- title: docs(reference): document the contract interface, authorization matrix and storage rules -->
<!-- labels: documentation -->

# DOC-06: docs(reference): document the contract interface, authorization matrix and storage rules

## Problem statement

`reference/contracts.mdx` summarises functions. The per-function arguments, authorization requirements, errors, events and the token interface subset are only in a repository record.

## Why this is needed

The contracts are the part of Tobin that protects value. Their interface and authorization behaviour must be reachable from the developer docs and consistent with the canonical reference.

## Intended audience

Contract and SDK engineers, integrators, security reviewers.

## Exact scope

- Each `TobinClearingV1` and `TobinTestToken` function: arguments, who must authorize what, preconditions, errors, state change.
- Validation rules and ceilings, with the statement that ceilings are provisional.
- The authorization-failure behaviour (host errors, not contract errors).
- A short evaluation of whether the Soroban contract spec or ABI can be generated reliably; record the finding.

## Relevant source files and directories

- `contracts/clearing/src/lib.rs`, `contracts/token/src/lib.rs`
- `contracts/README.md`
- `docs/reference/MVP-1-ABI-AND-AUTHORIZATION-REFERENCE.md`
- `contracts/clearing/tests/`

## Expected documentation pages

- Expand `reference/contracts.mdx`; optionally add `reference/contracts/clearing.mdx` and `reference/contracts/token.mdx`.

## Technical research required

- Compare the canonical ABI reference with the current source; record any drift.
- Check whether `stellar contract build` output exposes a spec usable as an authoritative input. Do not run any network command.

## Acceptance criteria

- Each function is documented from source and agrees with the canonical reference, or the difference is reported.
- The page links to the canonical reference instead of replacing it.

## Testing and validation requirements

- Run `npm run dev --workspace tobin-docs` and read every new page in the browser, light and dark, desktop and 390 px wide.
- Run `npm run typecheck --workspace tobin-docs`, `npm run validate --workspace tobin-docs` and `npm run build --workspace tobin-docs`; all pass.
- Run `node scripts/ci/check-links.mjs` if a tracked `.md` file was edited.
- Every command, flag, path, name and number in the pages was checked against the source or run, and the pull request lists how.

## Dependencies on other issues

- None. Pairs with DOC-01 and DOC-02.

## Estimated complexity

medium

## Suggested priority

High

## Documentation approach

Hand-written; generation evaluated only

## Explicitly out of scope

- Contract changes; deployment; any Testnet action.
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
