<!-- title: docs(architecture): write a developer security guide linking the threat models and reviews -->
<!-- labels: documentation -->

# DOC-13: docs(architecture): write a developer security guide linking the threat models and reviews

## Problem statement

Security rules are spread across CONTRIBUTING, the threat models and the reviews. Developers have no single orientation page.

## Why this is needed

Engineers should know the key-handling rules, the trust boundaries and where the detailed analysis lives before they touch sensitive code.

## Intended audience

Every contributor; reviewers of security-sensitive changes.

## Exact scope

- Key and secret handling, signer and authorization rules, replay and expiry policy as recorded, what the reviews found and what remains open, how to report.
- A map from each sensitive area to its threat model or review.

## Relevant source files and directories

- `CONTRIBUTING.md` (Security rules), `SECURITY.md`
- `docs/product/architecture/mvp-1.5/MVP-1.5-THREAT-MODEL.md`
- `docs/reports/MVP-1-SIGNER-AND-REPLAY-SECURITY-REVIEW.md`
- `docs/product/architecture/wallet-first-auth/WALLET-FIRST-AUTH-SECURITY-REVIEW.md`

## Expected documentation pages

- New `architecture/security-model.mdx`.

## Technical research required

- Read the reviews; summarise findings and their recorded status without upgrading them (these are same-author reviews).
- Do not describe vulnerabilities in an exploitable way.

## Acceptance criteria

- Every claim cites a record or code.
- The page states that reviews are not independent audits.
- No exploit details.

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

- New security analysis; disclosure of unfixed vulnerabilities.
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
