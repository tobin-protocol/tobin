<!-- title: docs(reference): document commitments, proposal digests and the settlement intent -->
<!-- labels: documentation -->

# DOC-02: docs(reference): document commitments, proposal digests and the settlement intent

## Problem statement

Digests are described in two sentences on the SDK page. The byte layout, domain tags, the role of the proposal revision, the network id and the settlement intent are not documented outside design records.

## Why this is needed

Approvals are bound to a digest. Anyone implementing a second client, reviewing an approval or debugging a `DigestMismatch` needs the exact definition and its limits.

## Intended audience

Engineers and reviewers working on approvals, signing or a second implementation.

## Exact scope

- The version 2 obligation commitment and proposal digest: inputs, canonical ordering, domain tags, encoding.
- How the proposal revision prevents replay of an earlier approval.
- The settlement intent (`intent.ts`) and what a signer must verify.
- Known limits: same-author verification, no independent cryptographic review, the network id used in fixtures.

## Relevant source files and directories

- `packages/mvp1-sdk/src/digest.ts`, `src/sdk/intent.ts`
- `packages/mvp1-sdk/DB-09-DIGEST-REVIEW.md`
- `contracts/clearing/tests/digest.rs` and `tests/fixtures/`
- `docs/reference/MVP-1-ABI-AND-AUTHORIZATION-REFERENCE.md`

## Expected documentation pages

- New `reference/digests.mdx`; link from `reference/sdk.mdx` and `concepts/clearing-lifecycle.mdx`.

## Technical research required

- Reproduce one fixture digest with the TypeScript code and show the steps.
- Compare the described byte layout with the Rust implementation; list any difference as a finding, do not paper over it.

## Acceptance criteria

- The layout is complete enough to reimplement and every field is traced to source.
- The page links to the canonical review record instead of restating its conclusions.
- Limits are stated plainly.

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

- Changing the digest format or reviewing it cryptographically.
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
