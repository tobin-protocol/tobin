<!-- title: docs(development): write the Testnet settlement execution and reconciliation procedure -->
<!-- labels: documentation -->

# DOC-09: docs(development): write the Testnet settlement execution and reconciliation procedure

## Problem statement

Owner-run execution and reconciliation are described conceptually. No procedure says what the owner runs, in which order, what to check at each step or what to do on an unknown outcome.

## Why this is needed

Execution must run one step at a time, never retry blindly and always reconcile. A written procedure from the records protects against double settlement.

## Intended audience

The project owner and engineers who operate or review Testnet runs.

## Exact scope

- Preconditions (verified accounts, signer sets, approved batch), step order, per-step verification, unknown-outcome handling, reconciliation and what a mismatch means.
- A glossary of the execution states and what each permits.
- Clear marking that this is Testnet-only and requires the owner's explicit authorization.

## Relevant source files and directories

- `apps/web-console/lib/stellar/run.ts`, `compare.ts`, `execution-plan.ts`
- `apps/web-console/lib/registry/settlement-state.ts`
- `docs/product/architecture/mvp-1.5/MVP-1.5-TESTNET-VERIFICATION.md`, `MVP-1.5-WALLET-AND-SIGNING.md`, `MVP-1.5-THREAT-MODEL.md`

## Expected documentation pages

- New `development/settlement-execution-procedure.mdx`.

## Technical research required

- Derive the procedure from code and the verification record; do not run it against any network.
- Ask the owner to review the final wording before merge.

## Acceptance criteria

- Each step names the code that enforces it.
- Unknown outcome and retry rules match `retry-policy.ts` and the records.
- The page contains no command that creates keys, submits transactions or contacts a network unless the record documents it and the page says it needs authorization.

## Testing and validation requirements

- Run `npm run dev --workspace tobin-docs` and read every new page in the browser, light and dark, desktop and 390 px wide.
- Run `npm run typecheck --workspace tobin-docs`, `npm run validate --workspace tobin-docs` and `npm run build --workspace tobin-docs`; all pass.
- Run `node scripts/ci/check-links.mjs` if a tracked `.md` file was edited.
- Every command, flag, path, name and number in the pages was checked against the source or run, and the pull request lists how.

## Dependencies on other issues

- DOC-08.

## Estimated complexity

large

## Suggested priority

Medium

## Documentation approach

Hand-written procedure

## Explicitly out of scope

- Running or automating execution; Mainnet.
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
