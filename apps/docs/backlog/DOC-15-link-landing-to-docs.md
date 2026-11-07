<!-- title: feat(landing): link the landing page to https://docs.tobinprotocol.xyz -->
<!-- labels: enhancement -->

# DOC-15: feat(landing): link the landing page to https://docs.tobinprotocol.xyz

## Problem statement

`apps/landing/src/lib/site.ts` has `docs: null` with a TODO because no docs site existed. Now the documentation URL is decided, but nothing on the landing page links to it.

## Why this is needed

The docs site links to the landing page; navigation should work both ways.

## Intended audience

Landing page maintainers; site visitors.

## Exact scope

- Set the docs link in `apps/landing/src/lib/site.ts` and make the existing components that read it show the link.
- Confirm the landing header and footer layouts at desktop and 390 px.

## Relevant source files and directories

- `apps/landing/src/lib/site.ts`
- `apps/landing/src/components/` (components that read `links.docs`)
- `apps/landing/AGENTS.md` (read before editing; its Next.js version differs from common knowledge)

## Expected documentation pages

- None.

## Technical research required

- Find every consumer of `links.docs`.
- Do this only after the docs site is live at the documentation URL.

## Acceptance criteria

- The link points to `https://docs.tobinprotocol.xyz`.
- `npm run build --workspace tobin-landing` and `npm run lint --workspace tobin-landing` pass.
- Screenshots at 1200 px and 420 px in the pull request.

## Testing and validation requirements

- Run `npm run dev --workspace tobin-docs` and read every new page in the browser, light and dark, desktop and 390 px wide.
- Run `npm run typecheck --workspace tobin-docs`, `npm run validate --workspace tobin-docs` and `npm run build --workspace tobin-docs`; all pass.
- Run `node scripts/ci/check-links.mjs` if a tracked `.md` file was edited.
- Every command, flag, path, name and number in the pages was checked against the source or run, and the pull request lists how.

## Dependencies on other issues

- The docs site must be deployed first; needs owner approval because it edits the landing page.

## Estimated complexity

small

## Suggested priority

Medium

## Documentation approach

Code change (not documentation)

## Explicitly out of scope

- Any other landing change.

## Working rules

Start from the latest `main`, work on a `docs/<short-description>` branch, edit only this scope, preview and validate locally, open a pull request, and merge only after approval. See `apps/docs/content/docs/resources/writing-docs.mdx`.
