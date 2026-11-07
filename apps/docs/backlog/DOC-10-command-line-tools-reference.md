<!-- title: docs(reference): document the repository scripts and command-line tools -->
<!-- labels: documentation -->

# DOC-10: docs(reference): document the repository scripts and command-line tools

## Problem statement

`reference/commands.mdx` covers npm scripts. The operator and owner-run scripts have no reference.

## Why this is needed

These scripts touch databases, accounts and signers. Their arguments, effects and safety conditions should be documented before someone runs them.

## Intended audience

Maintainers and engineers operating or reviewing the tools.

## Exact scope

- `apps/web-console/scripts/db.ts` commands, `testnet-*.mjs`, `scripts/multisig/*`, `scripts/accounts/*`, `scripts/ci/*`, `scripts/release/*`, `scripts/tst-signer/*`.
- Per script: purpose, arguments, inputs read, files or networks touched, whether it needs owner authorization.

## Relevant source files and directories

- The scripts directories above and their tests and READMEs
- `ci/README.md`
- `accounts/README.md`

## Expected documentation pages

- Extend `reference/commands.mdx` or add `reference/scripts.mdx`.

## Technical research required

- Read each script and its usage text. Run only offline, read-only help or tests; never run a script that contacts a network or touches keys.
- Record which scripts have no usage text.

## Acceptance criteria

- Every script is listed with its true arguments and side effects.
- Scripts that need authorization are labelled.
- No command was run that the repository rules forbid.

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

Hand-written from usage text

## Explicitly out of scope

- Adding help output to scripts (open a code issue).
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
