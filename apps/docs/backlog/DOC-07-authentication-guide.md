<!-- title: docs(architecture): write the developer guide to wallet sign-in, sessions and authorization checks -->
<!-- labels: documentation -->

# DOC-07: docs(architecture): write the developer guide to wallet sign-in, sessions and authorization checks

## Problem statement

The authentication page explains principles. There is no step-by-step description of the challenge flow, session lifecycle, role checks or how to add an authorized route correctly.

## Why this is needed

Authorization mistakes are the most damaging class of defect in this application. Contributors need a precise model and a checklist.

## Intended audience

Backend engineers adding or reviewing routes; security reviewers.

## Exact scope

- The challenge, signature, verification and session-creation sequence.
- Session cookie properties, rotation, expiry and revocation.
- Where membership, role and reviewer checks happen and how a new route should use them.
- The distinction between wallet sign-in and the organization-scoped wallet ownership proof.

## Relevant source files and directories

- `apps/web-console/lib/auth/`
- `apps/web-console/lib/registry/authorization.ts`, `identity.ts`, `wallet-proof.ts`
- `docs/product/architecture/wallet-first-auth/`
- `docs/product/architecture/mvp-1.3/MVP-1.3-AUTHORIZATION-SECURITY.md`

## Expected documentation pages

- Extend `architecture/authentication-and-authorization.mdx` or add `development/adding-an-authorized-route.mdx`.

## Technical research required

- Trace one sign-in and one authorized registry call through the code; include the trace in the pull request.
- Check each stated property against the code, not the architecture record.

## Acceptance criteria

- The sequence matches the code.
- A checklist for new routes is included and each item is enforced somewhere in code or tests.
- No secret or real key appears.

## Testing and validation requirements

- Run `npm run dev --workspace tobin-docs` and read every new page in the browser, light and dark, desktop and 390 px wide.
- Run `npm run typecheck --workspace tobin-docs`, `npm run validate --workspace tobin-docs` and `npm run build --workspace tobin-docs`; all pass.
- Run `node scripts/ci/check-links.mjs` if a tracked `.md` file was edited.
- Every command, flag, path, name and number in the pages was checked against the source or run, and the pull request lists how.

## Dependencies on other issues

- DOC-04 (routes) in parallel.

## Estimated complexity

medium

## Suggested priority

Medium

## Documentation approach

Hand-written

## Explicitly out of scope

- Changing authentication behaviour; account recovery design.
- Editing accepted records under the root `docs/` directory, contracts, deployment manifests, evidence or release gates.
- Changing application, SDK or contract behaviour. If the research finds a defect or an undocumented behaviour worth changing, open a separate issue.
- Describing planned functionality as if it existed; claiming production readiness, Mainnet support, audits or wallet compatibility beyond what the records show.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
