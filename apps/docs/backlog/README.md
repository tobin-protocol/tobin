# Documentation backlog (drafts)

Detailed, assignable issue drafts for the documentation site, written after auditing the 36 existing pages against the source. **They have not been published as GitHub issues.** Each file is the full issue body; the first two lines carry the title and labels used by `publish.sh`.

Delete a draft once its issue exists (the issue becomes the source of truth), and delete this directory when the last one is published or dropped.

| ID | Title | Size | Priority | Approach | Depends on |
|---|---|---|---|---|---|
| DOC-01 | [docs(reference): document the TypeScript SDK client and prepared calls](DOC-01-sdk-client-reference.md) | large | High | Hand-written | None. Pairs with DOC-02 (digests) and DOC-03 (errors). |
| DOC-02 | [docs(reference): document commitments, proposal digests and the settlement intent](DOC-02-digest-and-intent-reference.md) | medium | High | Hand-written | None. |
| DOC-03 | [docs(reference): generate the error-code catalogue from the SDK source](DOC-03-generated-error-catalogue.md) | medium | Medium | Generated, with a drift check | None. Informs DOC-01. |
| DOC-04 | [docs(reference): document the institutional HTTP routes](DOC-04-institutional-api-reference.md) | large | High | Hand-written from handlers (no schema exists) | DOC-07 (authentication) can proceed in parallel; link between them. |
| DOC-05 | [docs(development): document the database schema, migrations and immutable tables](DOC-05-database-schema-and-migrations.md) | medium | Medium | Hand-written | None. |
| DOC-06 | [docs(reference): document the contract interface, authorization matrix and storage rules](DOC-06-contract-interface-and-authorization.md) | medium | High | Hand-written; generation evaluated only | None. Pairs with DOC-01 and DOC-02. |
| DOC-07 | [docs(architecture): write the developer guide to wallet sign-in, sessions and authorization checks](DOC-07-authentication-guide.md) | medium | Medium | Hand-written | DOC-04 (routes) in parallel. |
| DOC-08 | [docs(architecture): document the Stellar integration layer (lib/stellar)](DOC-08-stellar-integration-layer.md) | medium | Medium | Hand-written | None. Feeds DOC-09. |
| DOC-09 | [docs(development): write the Testnet settlement execution and reconciliation procedure](DOC-09-settlement-execution-runbook.md) | large | Medium | Hand-written procedure | DOC-08. |
| DOC-10 | [docs(reference): document the repository scripts and command-line tools](DOC-10-command-line-tools-reference.md) | medium | Medium | Hand-written from usage text | None. |
| DOC-11 | [docs(development): write local development setup details and a troubleshooting guide](DOC-11-local-development-and-troubleshooting.md) | medium | High | Hand-written | None. |
| DOC-12 | [docs(development): document the operational procedures that exist today](DOC-12-operations-and-database-runbooks.md) | medium | Low | Hand-written | DOC-05. |
| DOC-13 | [docs(architecture): write a developer security guide linking the threat models and reviews](DOC-13-developer-security-guide.md) | medium | Medium | Hand-written | None. |
| DOC-14 | [docs(development): catalogue the test suites and browser journeys](DOC-14-testing-guide-and-journeys.md) | small | Low | Hand-written | None. |
| DOC-15 | [feat(landing): link the landing page to https://docs.tobinprotocol.xyz](DOC-15-link-landing-to-docs.md) | small | Medium | Code change (not documentation) | The docs site must be deployed first; needs owner approval because it edits the landing page. |

## Publishing

`publish.sh` creates one issue per draft with `gh issue create`. It lists what it would do and asks nothing else, so review the drafts first. It never assigns anyone: GitHub identities and intended assignments are not recorded in the repository. Set the assignee afterwards in GitHub.

```bash
bash apps/docs/backlog/publish.sh --dry-run    # print titles and labels only
bash apps/docs/backlog/publish.sh              # create the issues (public; needs gh authenticated)
```

## Suggested grouping for assignment

| Track | Issues | Notes |
|---|---|---|
| SDK and contracts | DOC-01, DOC-02, DOC-03, DOC-06 | Best for someone comfortable with TypeScript and Rust reading. DOC-03 is the only generated reference. |
| Application backend | DOC-04, DOC-05, DOC-07 | Needs a local server and database. |
| Stellar and operations | DOC-08, DOC-09, DOC-10, DOC-12 | Read-only research; the owner should review DOC-09. |
| Onboarding and quality | DOC-11, DOC-13, DOC-14 | DOC-14 and DOC-11 suit newer contributors. |
| Owner decision | DOC-15 | Edits the landing page; do after the docs site is live. |

## Generated versus hand-written

Only the error-code catalogue (DOC-03) is proposed for generation now, because an authoritative, already-tested source exists. The SDK reference (DOC-01) and contract interface (DOC-06) are hand-written first; each includes a short research task on whether a generator would be reliable. No institutional API schema exists, so DOC-04 is hand-written from the handlers.
