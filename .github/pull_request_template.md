<!--
Thank you for contributing to Tobin. Read CONTRIBUTING.md first.
Never include secrets, private keys, seed phrases, credentials or real personal data anywhere in this pull request (description, comments, logs, screenshots).
Suspected vulnerabilities must NOT be reported here: use the private process in SECURITY.md.
-->

## Summary

<!-- One or two sentences: what does this pull request do? Use a Conventional Commit style title, for example `fix(auth): prevent wallet challenge replay`. -->

## Problem and motivation

<!-- What problem does it solve and why now? Link the issue. An issue (or approved proposal) is required first for migrations, contract/ABI/digest changes, authentication/authorization changes, new dependencies and changes to financial invariants. -->

Related issue: <!-- Closes #000 / Refs #000 -->

## Proposed solution

<!-- How does it work? Mention alternatives you rejected, if relevant. -->

## Scope of changes

<!-- Affected components and the main files. Keep the pull request narrow; split unrelated changes. -->

- [ ] Frontend / web console
- [ ] Backend / API
- [ ] Database / migrations
- [ ] Authentication / sessions / authorization
- [ ] Clearing / settlement preparation
- [ ] Stellar / Soroban integration
- [ ] Smart contracts
- [ ] Tests only
- [ ] Documentation only
- [ ] CI / tooling / release gates
- [ ] Other:

## Architecture impact

<!-- Does it change a trust boundary, a state machine, an interface or a documented design decision? Say "None" if not. -->

## Database migration impact

<!-- "None", or: the new migration number and name; what it adds; that no accepted migration was edited; how it was tested on a fresh database and as an upgrade from the previous version; rollback/recovery considerations (migrations are forward-only). -->

## Security considerations

<!-- Authentication, authorization, secrets, input validation, logging, new attack surface, abuse cases tested. Say "None identified" only if you looked. Do not describe an unfixed vulnerability here; use SECURITY.md. -->

- [ ] Authorization is enforced on the server; no client-supplied role or id is trusted.
- [ ] No secrets, keys, databases, logs or temporary files are in the diff.
- [ ] No Mainnet configuration, minting, supply, signer or contract-governance change (or the owner explicitly authorized it: link it).

## Testing performed

<!-- Exact commands and results. Give counts of passed, failed and SKIPPED tests. State what is a mock or stand-in and what is real. -->

| Check | Command | Result (passed / failed / skipped) |
|---|---|---|
| Type check | `npm run typecheck` | |
| Unit and integration | `npm test --workspace tobin-web-console` | |
| SDK | `npm test --workspace tobin-mvp1-sdk` | |
| Rust (if touched) | `cd contracts && cargo test --locked --workspace` | |
| Production build | `npm run build:console` | |
| Browser journeys at 1200 px and 420 px (if UI or flows changed) | | |

### Skipped or unrun tests and checks (required)

<!-- Every skipped test, check or validation you did not run, and why. Write "None" only if that is true. Hosted CI does not run most browser journeys on pull requests: run them locally and say so. A claim you did not verify is not allowed. -->

## Screenshots

<!-- For meaningful UI changes, before and after, at 1200 px and 420 px. Remove any secrets or personal data. Write "Not applicable" otherwise. -->

## Documentation updates

<!-- Which documents changed? Required when behaviour, an API, the architecture, a dependency, an environment variable, a migration, security behaviour or an operational procedure changes. -->

## Breaking changes

<!-- "None", or describe what breaks and how to migrate. -->

## Known limitations

<!-- What this does not do, what is not validated, follow-ups. Do not hide limitations. -->

## AI assistance disclosure

<!-- Describe significant AI assistance (tool and what it did), or write "None". You remain responsible for every line. Do not add AI attribution or co-author trailers to commits. -->

## Contributor checklist

- [ ] I started from the latest `main` on a correctly named branch, and changed only what this pull request is about.
- [ ] I read the relevant documentation and code, and discussed any major change in an issue first.
- [ ] Tests cover the change, including failure and abuse cases; I did not weaken, skip or delete any test to get a green result.
- [ ] I disclosed every skipped test and every check I did not run.
- [ ] Documentation and `ci/dependency-baseline.csv` (if dependencies changed) are updated.
- [ ] Migrations, if any, are new, forward-only and tested fresh and as upgrades; accepted migrations are untouched.
- [ ] I preserved the trust boundaries: application state is not chain state; wallet authentication is not institutional authorization; roles are not Stellar signing authority.
- [ ] My commits follow Conventional Commits and carry no AI attribution trailer.
