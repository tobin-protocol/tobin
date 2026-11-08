# Contributing to Tobin

Thank you for considering a contribution. This guide is the rulebook for humans. AI coding agents follow the same rules plus the extra instructions in [`AGENTS.md`](AGENTS.md).

- [Welcome and philosophy](#welcome-and-philosophy)
- [Ways to contribute](#ways-to-contribute)
- [Before you contribute](#before-you-contribute)
- [Development environment](#development-environment)
- [Branching](#branching)
- [Commit conventions](#commit-conventions)
- [Code quality standards](#code-quality-standards)
- [Testing requirements](#testing-requirements)
- [Financial correctness and settlement invariants](#financial-correctness-and-settlement-invariants)
- [Stellar and Soroban rules](#stellar-and-soroban-rules)
- [Authentication and authorization](#authentication-and-authorization)
- [Database and migration rules](#database-and-migration-rules)
- [API and application state rules](#api-and-application-state-rules)
- [Security rules](#security-rules)
- [Pull request requirements](#pull-request-requirements)
- [Review and merging](#review-and-merging)
- [AI-assisted contributions](#ai-assisted-contributions)
- [Documentation requirements](#documentation-requirements)
- [Contributor checklist](#contributor-checklist)
- [Questions and support](#questions-and-support)
- [Licensing of contributions](#licensing-of-contributions)

## Welcome and philosophy

Tobin is open-source clearing and settlement software for financial institutions on Stellar: it records obligations, computes net positions deterministically, requires reviewer approval of the exact result, and settles only the net amounts. Read the [README](README.md) first; it states what exists today and what does not. Tobin is pre-production infrastructure that runs on Stellar Testnet, and contributions must neither make it look more finished than the evidence shows nor understate what has been implemented. Follow the [communication and maturity terminology guide](docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md) when you write about the project.

Because this is financial and settlement infrastructure, three things are mandatory rather than nice to have:

- **Correctness.** A wrong amount, a stale approval or a double settlement is a real failure even on Testnet, because the design exists to prevent it.
- **Security and auditability.** Authority is checked on the server, records that matter are immutable, and every state change can be explained afterwards.
- **Tests.** A change without tests is incomplete. Passing tests are necessary but do not prove security or financial correctness; reviewers will look for the cases the tests do not cover.

Keep the code and the documentation in step. A change that makes a document untrue must fix the document in the same pull request.

**Keep the documentation honest.** Do not add invented partners, logos, testimonials, statistics, institutions, customers, benchmarks, results or URLs. Label example figures as illustrative. Do not imply audits, production deployments, Mainnet readiness or institutional adoption that do not exist.

## Ways to contribute

| Area | What helps | Start in |
|---|---|---|
| Frontend and web console | accessibility, responsive behaviour, clearer states and error messages | `apps/web-console/app`, `components` |
| Backend and APIs | validation, authorization checks, error handling | `apps/web-console/lib/registry`, `lib/auth`, `app/api` |
| Database and persistence | migrations, constraints, indexes, persistence tests | `apps/web-console/lib/db` |
| Stellar and Soroban integration | the execution plan, signer sets, RPC adapter, reconciliation | `apps/web-console/lib/stellar` |
| Smart contracts | clearing and token contract tests and review | `contracts/` |
| Security | threat-model review, abuse-case tests, vulnerability reports (privately, see [`SECURITY.md`](SECURITY.md)) | everywhere |
| Testing | regression, invariant and browser tests; reducing flaky tests by fixing synchronization | `apps/web-console/test`, `packages/mvp1-sdk/test` |
| Documentation | corrections, missing guides, an API reference for the institutional API | `docs/`, READMEs |
| Developer experience and CI | scripts, setup, faster feedback | `scripts/`, `.github/workflows`, `ci/` |

Useful right now: factual corrections, bug reports with reproductions, test gaps, and review of the security-sensitive code. The product requirements and the draft protocol specification are not published here, so there is nothing to review in them.

## Before you contribute

1. Read the [README](README.md) and the documents for the subsystem you will touch (the [documentation map](README.md#documentation-map) lists them).
2. Search the [issues](https://github.com/tobin-protocol/tobin/issues) and open pull requests for the same topic.
3. Understand the subsystem: read its code and its tests.
4. Check that your idea does not contradict an accepted design decision. Decisions are recorded in the milestone documents under `docs/product/architecture/` (for example the MVP-1.3 and MVP-1.5 documents).
5. **Open an issue first** for anything beyond a typo, a small correction or a small, obvious fix, and wait for agreement before building it.

An issue (or an approved design proposal) is **required before implementation** for: a database migration; a change to a contract, the ABI or the digest format; any change to authentication, sessions, roles, reviewer authority or signer-set handling; a new dependency; a change to a financial invariant; a new network or asset capability; and anything that touches release gates, CI or the scanner.

Do not rename established concepts, reorder or expand the milestones, or replace the architecture on your own initiative. The milestone list is in the [README](README.md#project-status-and-roadmap).

## Fork the repository

Contributors work from **their own fork** of the repository and open pull requests from it. Do not ask for, or rely on, write access to `tobin-protocol/tobin` to contribute.

1. Fork `tobin-protocol/tobin` on GitHub (the **Fork** button, or `gh repo fork tobin-protocol/tobin --clone`).
2. Clone your fork and add the original repository as `upstream`:

```bash
git clone https://github.com/<your-username>/tobin.git && cd tobin
git remote add upstream https://github.com/tobin-protocol/tobin.git
```

3. Keep your fork's `main` in step with upstream before every new branch:

```bash
git switch main
git fetch upstream
git merge --ff-only upstream/main      # fails rather than creating a merge commit; do not force it
git push origin main
```

4. Create your branch from that `main` (see [Branching](#branching)), push it to **your fork** (`git push -u origin <branch>`), and open the pull request against `tobin-protocol/tobin` `main` from your fork's branch.

Fork pull requests run the same checks as any other, but GitHub does not give workflows from a fork access to repository secrets, and none are needed: the project's CI uses no secrets. Never put a secret, key or seed phrase in a fork either; forks of a public repository are public.

## Development environment

Versions come from the repository's pins and CI configuration (`.github/workflows/ci.yml`), not from preference.

| Tool | Version |
|---|---|
| Node.js | 24 or later (CI: 24.14.0). `engines` requires `>=24` |
| npm | bundled with Node 24 (11.19.0 was used locally) |
| Rust | 1.96.0 with `rustfmt`, `clippy` and the `wasm32v1-none` target (CI: `RUSTUP_TOOLCHAIN`) |
| Stellar CLI | 28.0.0, only to build contract Wasm |
| Browser | Chrome or Edge for the browser journeys; set `TOBIN_BROWSER` if it is not found |
| Database | none to install: SQLite through `node:sqlite` (Node prints an experimental warning) |

```bash
# in your fork's clone (see "Fork the repository"); a plain read-only clone of the upstream repository also works for trying the code
npm ci                                       # CI uses: npm ci --ignore-scripts
npm run typecheck
npm test                                     # runs the web-console and SDK suites (the landing app has no tests); bridge-backed tests are skipped, visibly, without TOBIN_BRIDGE_EXE
npm run dev --workspace tobin-web-console    # http://127.0.0.1:8787
cd contracts && cargo test --locked --workspace
```

Build the Rust development bridge and set `TOBIN_BRIDGE_EXE` (see the [README](README.md#getting-started)) to run the bridge-backed tests instead of skipping them. Windows contributors: files are normalized to LF (`.gitattributes`); use PowerShell variable syntax (`$env:NAME = "value"`) and run workspace scripts through `npm run ... --workspace tobin-web-console`.

The landing page (`apps/landing`) uses a Next.js version that differs from common knowledge. Read `node_modules/next/dist/docs/` before changing it; it has its own [`AGENTS.md`](apps/landing/AGENTS.md).

## Branching

- Work in your [fork](#fork-the-repository). Start from the latest `main` (your fork's `main`, updated from `upstream`) and work on a dedicated branch. **Never push directly to `main`**, in your fork or in the upstream repository.
- Name branches `<type>/<short-description>`, where the type is one of:

| Type | Use for |
|---|---|
| `feat/` | new capability |
| `fix/` | bug fixes |
| `docs/` | documentation only |
| `refactor/` | behaviour-preserving restructuring |
| `test/` | tests only |
| `security/` | security hardening |
| `ci/` | CI-only changes (workflows and CI scripts) |
| `chore/` | tooling, dependencies, housekeeping |

- Keep a branch narrowly scoped. Do not bundle unrelated changes; split them into separate pull requests.
- Existing accepted commits are history. Do not rewrite, amend, reset or force-push them, and do not force-push a shared branch without the maintainer's explicit approval.
- All changes, including documentation and evidence updates, go through a pull request. A departure from this process is recorded in [`release/PROCESS-DEVIATIONS.md`](release/PROCESS-DEVIATIONS.md). GitHub enforces only part of this: an active repository ruleset on `main` requires a pull request with one approving review and blocks force pushes and branch deletion, but repository and organization admins can bypass it. The rest of these rules, and not bypassing the ruleset for routine changes, are project policy; follow them anyway.

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): imperative summary`.

| Type | Meaning |
|---|---|
| `feat` | new capability |
| `fix` | bug fix |
| `docs` | documentation |
| `test` | tests |
| `refactor` | no behaviour change |
| `security` | security hardening |
| `ci` | CI and workflows |
| `chore` | tooling and housekeeping |

The scope names the area or milestone (for example `auth`, `clearing`, `settlement`, `stellar`, `db`, `landing`, `mvp-1.5`). Examples:

```text
feat(clearing): add obligation validation
fix(auth): prevent wallet challenge replay
test(settlement): cover stale approval invalidation
docs(architecture): clarify settlement lifecycle
refactor(api): simplify authorization middleware
security(session): enforce session revocation
```

A message must describe what the commit really does; do not claim tests, security properties or behaviour the commit does not have. Prefer small, coherent commits. **Do not add AI attribution or co-author trailers** (for example `Co-authored-by: Claude` or generated-by lines). Disclose significant AI assistance in the pull request instead (see below). Human contributors are credited through Git authorship.

## Code quality standards

These rules describe the code as it is. Do not introduce a competing framework or style.

**TypeScript** (`tsconfig.base.json`): `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and `erasableSyntaxOnly`. In practice: use `import type` for types; no `enum`, `namespace` or constructor parameter properties; index access may be `undefined`; relative imports in `lib` and `components` carry their `.ts`/`.tsx` extension, because Node 24 runs the files directly (type stripping). Avoid `any`; validate `unknown` at the boundary. There is no Prettier or ESLint config for the console and SDK (ESLint exists only in the landing app); match the surrounding style.

**React and frontend.** Next.js App Router with React 19. Pages that need the per-request Content-Security-Policy nonce are rendered per request (`await connection()`). Client components talk to the server only through `components/api-client.ts`; the browser holds no tokens and never decides authorization. Handle loading, empty, error and retry states, label every control, caption every table, and check both 1200 px and 420 px.

**Backend and API.** Route handlers stay thin and delegate to `AuthService` or `Registry`. Services validate every input and throw `RegistryError(code, message)`; the HTTP layer maps codes to statuses. Follow the existing uniform-404 pattern for non-members and the generic errors for authentication.

**Error handling and logging.** Return precise errors for the caller's own mistakes and generic ones where detail would leak (sign-in, invitations, other organizations). Never log tokens, signatures, challenge text, keys or secrets. Do not swallow errors to make a test pass.

**Input validation.** Amounts are digit-only strings, positive, at most the i128 maximum, handled as `bigint`. Names and text go through the existing validators. Validate on the server regardless of what the client already checked.

**Rust and Soroban.** `cargo fmt --all --check` is enforced in CI; `cargo clippy` warnings are reported but not yet enforced, so do not add new ones. `overflow-checks` is on for release builds; use checked arithmetic for amounts (see the token contract). Build with `--locked`. Keep the contract's validation authoritative: TypeScript mirrors are advisory only.

**Modules and dependencies.** Keep module boundaries: the `Registry` and `AuthService` services do no network I/O; only `lib/stellar` talks to Stellar (the one registry route that reads the chain, signer-set recording, calls into `lib/stellar` after its authorization check). Prefer a small function over a new abstraction. Add a dependency only with an issue and a reason; pin it exactly; after changing `package-lock.json` run `node scripts/ci/update-npm-baseline.mjs` and review the diff, because CI fails when `ci/dependency-baseline.csv` is out of date.

## Testing requirements

Every functional change includes tests that would fail without it.

| Change | Required tests |
|---|---|
| Bug fix | a regression test that fails before the fix |
| New API endpoint | success and failure cases, including unauthenticated and wrong-organization callers |
| Authorization change | positive **and** negative cases, including privilege escalation attempts |
| Database change | a fresh-database test and an upgrade test from the previous version (see below) |
| Settlement change | conservation-of-value, staleness, duplicate-execution and reconciliation cases |
| Contract change | contract tests, plus the TypeScript tests that use the bridge |
| Frontend change | a browser journey step or component test, at 1200 px and 420 px |
| Security-sensitive change | abuse and failure scenarios: replay, expiry, substitution, tampering |

Tests label what they are: a mock is named as a mock, a stand-in is named as a stand-in, and neither is presented as evidence about the real wallet or network. Do not weaken, skip or delete a test to get a green result; fix the cause. Fix flaky browser tests by fixing the synchronization (wait for the condition), not by adding sleeps or hiding failures. **Report every skipped test and why.** Passing tests do not by themselves prove security or financial correctness.

## Financial correctness and settlement invariants

These are non-negotiable.

- Use integer or fixed-precision arithmetic for money (`bigint` in TypeScript, checked integers in Rust). Never use floating point for amounts or netting.
- **Preserve conservation of value.** Net positions sum to zero; a plan moves exactly what the obligations require, no more and no less; no value is created, dropped or duplicated.
- Validate inputs and outputs of every calculation, and re-check the contract's rules before anything is signed.
- **Prevent duplicate execution.** A session is created once; a completed step is never prepared again; there is no automatic retry.
- **Bind approvals to what they approve.** A reviewer decision binds to the exact calculation snapshot, and a batch approval to the instruction hash. When participants, obligations or the calculation change, earlier approvals are invalidated, not carried over.
- Keep state transitions auditable and immutable where the design says so.
- **Keep preparation, signing, submission and confirmation distinct.** A prepared batch is not a submitted transaction; a submitted one is not a confirmed one.
- **Never treat an API reply, a simulation or an SDK return value as proof of settlement.** Read the chain independently and **reconcile** the confirmed result against the approved Tobin batch. An unknown outcome (`NOT_FOUND`, a timeout) is neither success nor failure: read the original transaction hash again before doing anything else.
- Do not claim the netting result is globally optimal or the only valid plan; the contract accepts any valid plan and the engine's output is only a default.

## Stellar and Soroban rules

- **Stellar Testnet is the approved development environment.** The passphrase is `Test SDF Network ; September 2015`.
- **Mainnet is prohibited** unless the project owner explicitly authorizes it in writing for a specific change. Do not add Mainnet configuration, RPC endpoints, signers or settlement paths.
- **No token minting, supply change, contract redeployment, signer or threshold change, or governance change** without explicit owner authorization. The governed test token has a fixed supply that the validation relied on.
- Do not repurpose existing Testnet accounts or test assets for new experiments. Create your own disposable Testnet accounts and keep their keys outside the repository.
- **No private keys, seed phrases or secrets in the repository, issues, pull requests, logs or screenshots.** Never ask another contributor for a secret key. Public keys and public contract ids are fine where the existing rules allow them.
- Simulate before signing; sign only what was prepared; verify that a wallet returned the same transaction you asked it to sign; submit once; then verify by hash. Verify the network passphrase, the asset's `network:code:issuer` identity (or `network:contract:id`), and the issuer before trusting an asset.
- Use `@stellar/stellar-sdk` and `@stellar/freighter-api` as the existing code does; do not hand-assemble signatures. Authorization entries for a multisig account go through the transaction envelope, not an address credential.
- Contract changes: keep the on-chain validation authoritative, update the ABI reference, and run the contract tests natively and against Wasm.

## Authentication and authorization

Keep these concepts separate in code, data and documentation. None implies another.

1. **Wallet ownership**: a verified signature over a server-issued, single-use challenge.
2. **Authenticated Tobin identity**: an internal user with a server-side session.
3. **Institutional membership**: active or suspended, in one organization.
4. **Institutional role**: administrator or member.
5. **Reviewer authority**: an explicit grant, never implied by being an administrator.
6. **Settlement initiation authority**: governed by the batch and execution rules.
7. **Stellar signing authority**: held by keys on the chain, never by an application role.

Signing in with a wallet must never create a membership, a role, a reviewer grant or a signer. Authorization is enforced on the server on every request: resolve the user from the session, resolve the organization, check active membership and the needed role, then check that the resource belongs to that organization. Never accept a role, user id or organization id from the client as authoritative. Preserve reviewer separation of duties and the owner-tool gate (`lib/stellar/owner-access.ts`).

## Database and migration rules

- Migrations are entries in the `MIGRATIONS` list in `apps/web-console/lib/db/database.ts`, each with an increasing integer `version`, a descriptive `name` and its SQL. Each migration applies in its own transaction and a failure rolls it back completely.
- **Accepted migrations are immutable.** Never edit, reorder, renumber or delete a migration that has been merged. Fix forward with a new migration.
- Migrations are forward-only; there are no down-migrations. Think about rollback before you write one, and state in the pull request what recovery would look like.
- Preserve data. Prefer `ALTER TABLE ... ADD COLUMN` and new tables; rebuilding a table that other tables reference can cascade deletes, so avoid it. Add constraints, foreign keys and indexes; enforce immutability with triggers where records must not change.
- A database newer than the application is refused at startup; do not work around it.
- Test every migration on a fresh database **and** as an upgrade from the previous version with realistic data (see the existing `migration N upgrades a version-(N-1) database ...` tests). Adding a migration means updating the "latest version" assertions in the existing tests and the health check expectations; do that deliberately and mention it in the pull request.
- Never use a real operator database as a test database. Tests use temporary files or `:memory:`.

## API and application state rules

- Authenticate from the session cookie only. Every state-changing request needs the `x-tobin-request` header; keep it.
- Validate input; return consistent error shapes; do not leak internals.
- Do the authorization on the server (see above), including for resources reached by id.
- Make operations idempotent or single-shot where a retry could do harm (invitation acceptance, challenge consumption, execution steps).
- Record important privileged actions in the activity or audit trail; never record secrets.
- Do not log or return sensitive data you do not need.
- **Keep application state and independently verified chain state apart.** A database row that says a session is settled is not evidence that it is. The provenance labels `fixture`, `local-draft`, `chain-read` and `chain-confirmed` have precise meanings (see the README); do not blur them or add new ones without an approved proposal.

## Security rules

- Never commit credentials, keys, tokens, seeds or `.env` files. A secret scan runs in the release gate; do not rely on it.
- Never disable or weaken a security check, validation or authorization to make a test pass.
- Never bypass institutional authorization or add an unreviewed authentication shortcut or admin override.
- Never log signatures, tokens, challenge text or private material.
- Do not weaken validation without explicit approval.
- Report suspected vulnerabilities **privately**, following [`SECURITY.md`](SECURITY.md); never in a public issue or pull request.

## Pull request requirements

Open a pull request against `main` from your branch. The [pull request template](.github/pull_request_template.md) lists what to provide. Every pull request has:

- a descriptive title (use the Conventional Commit style);
- the problem, the proposed implementation and the affected components;
- links to the issues it addresses;
- tests and the exact validation results you obtained (counts of passed, failed and **skipped**);
- screenshots for meaningful UI changes, at 1200 px and 420 px;
- migration notes, if any, and security implications;
- breaking changes and remaining work (what this does not do or has not validated), stated plainly;
- the documentation updates it requires.

**Disclose every skipped test, check or validation you did not run, and why.** A claim you did not verify is not allowed in a pull request. If hosted CI did not run something that matters (it does not run most browser journeys on pull requests), run it locally and say so.

## Review and merging

- Every change is reviewed before merging. Respond to review comments, push fixes as new commits, and resolve conversations; do not resolve a comment you have not addressed.
- **Project policy requires** the **Rust, TypeScript and documentation checks** (`ci.yml`) to pass before a pull request is merged. **GitHub does not enforce this:** the `main` ruleset's required-status-checks rule currently lists no checks, so a merge is not technically blocked when that check fails. Do not merge while it fails. Resolve merge conflicts without discarding another contributor's work.
- The repository permits merge, squash and rebase merges. The maintainer chooses at merge time; accepted milestone history has been preserved as individual commits with merge commits. Do not rewrite history on a branch that is under review without saying so.
- Do not approve or merge your own change where GitHub does not allow it, and do not use bypass permissions for routine changes.
- `.github/CODEOWNERS` makes the repository owner (`@ebubechi-ihediwa`) the requested reviewer of every pull request, so GitHub requests that review automatically and you do not need to pick a reviewer. Ask the owner in the pull request if the request did not appear.
- The `main` ruleset requires one approving review on a pull request (it does not require code-owner review or that review threads are resolved). Beyond that, security-sensitive changes should have a reviewer who is not the author.

## AI-assisted contributions

AI-assisted development is welcome. You remain fully responsible for what you submit, and AI-generated code is held to exactly the same standard as human-written code.

- Understand every line you submit and review the whole diff yourself.
- Verify what an agent tells you. Agents invent APIs, flags, packages and test results. Check each against the code, `package.json`, `Cargo.toml` and CI.
- Run the relevant tests, the type check and the build yourself, and report real results.
- Take extra care with security-sensitive and financial code; test abuse cases.
- Do not accept new dependencies, commands or files you do not understand.
- Disclose significant AI assistance in the pull request (the template has a field). Do not add AI attribution trailers to commits.
- Coding agents must also follow [`AGENTS.md`](AGENTS.md).

## Documentation requirements

Update documentation in the same pull request when you change: a feature or its behaviour; an API; the architecture or a trust boundary; a dependency; an environment variable; a database migration; security behaviour; or an operational procedure. Keep milestone names and the status statements consistent with the [README](README.md); do not create a second source of truth. Run `node scripts/ci/check-links.mjs` to check relative links.

## Contributor checklist

Before you open a pull request:

- [ ] I started from the latest `main` on a correctly named branch and changed only what the PR is about.
- [ ] I read the relevant documentation and code, and discussed any major change in an issue first.
- [ ] Tests cover the change, including failure and abuse cases; I did not weaken or delete any.
- [ ] `npm run typecheck` passes; the production build passes; relevant suites pass; Rust is formatted (`cargo fmt --all --check`) where I touched it.
- [ ] I ran the relevant browser journeys at 1200 px and 420 px, or I explained why not.
- [ ] I listed every skipped test or unrun check and why.
- [ ] No secrets, keys, databases, logs or temporary files are in the diff; I read the whole diff.
- [ ] Authorization is enforced on the server; I preserved the trust boundaries.
- [ ] Migrations are new files, forward-only, and tested fresh and as upgrades.
- [ ] Documentation and the dependency baseline are updated.
- [ ] My commits follow Conventional Commits and carry no AI attribution trailer.

## Questions and support

Use [GitHub issues](https://github.com/tobin-protocol/tobin/issues) for bugs, feature proposals and questions (the issue forms help). GitHub Discussions are not enabled on this repository, and no other support channel exists. Never post secrets or exploit details; vulnerabilities go through [`SECURITY.md`](SECURITY.md). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licensing of contributions

The code, documentation and specification in this repository are licensed under the [Apache License 2.0](LICENSE), to the extent the project owner owns or controls them (see the [README](README.md#licence)). By submitting a contribution you agree that it may be distributed under those terms. The Tobin name, logo and brand assets are not covered by Apache-2.0 (see [`apps/landing/NOTICE`](apps/landing/NOTICE)).
