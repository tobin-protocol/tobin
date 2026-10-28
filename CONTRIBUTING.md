# Contributing to Tobin Clearing Protocol

> [!NOTE]
> **Status: initial guidelines.** This repository is at the specification and validation stage. It contains MVP-1, an experimental validation milestone (Soroban contracts, a TypeScript SDK and a local sandbox Console) that is distinct from the full protocol and its draft specification; it is not production-ready, has not been independently audited and is not for real-value use (see the [README](README.md#experimental-mvp-1)). The draft protocol specification and its review material are not published here (see the [README](README.md#development-status)). These guidelines will grow as the repository does.

## What is useful now

- **Corrections** to factual statements in the README, for example a wrong description of how Stellar, SEP-31 or Soroban works.
- **Questions and critique** about the problem statement, the proposed approach, the planned scope or the planned milestones.
- **Pointers** to prior art, data sources or analyses relevant to the planned ledger and economic validation (milestone M1).
- **Bug reports and corrections** for MVP-1 and its documentation.

The draft protocol specification is not in this repository, so there is nothing to review there. Before changing the MVP-1 contracts, ABI, or settlement digest format, open an issue to discuss the proposed change and its effect on compatibility and tests.

## How to propose a change

1. **Open an issue first** for anything beyond a typo or a small correction. Say what is wrong or unclear and, if you can, point to a source.
2. For a small fix: fork the repository, branch from `main`, keep the change focused, and open a pull request with the reason in the description.
3. Write imperative commit messages ("Correct the SEP-31 description").

Please be respectful and assume good faith.

## Working on MVP-1

MVP-1 lives in the `core/` (Rust and Soroban contracts) and `ts/` (TypeScript) directories, with its documentation under `docs/`. Developer guides: [core/README.md](core/README.md) (Rust and Soroban contracts) and [ts/README.md](ts/README.md) (TypeScript engine, SDK and local Console).

Prerequisites: a Rust toolchain, the Stellar CLI and Node.js 24 or later. The checks were last run locally with Rust 1.96.0, Stellar CLI 28.0.0, Node.js 24.14.0 and npm 11.19.0. The TypeScript dependencies are pinned in `ts/package.json` (`typescript` 5.9.3, `@types/node` 20.19.43) and locked in `ts/package-lock.json`; `npm ci` in `ts/` installs them, and in that setup `npm run typecheck`, `npm run build:console`, `npm test` (with `TOBIN_BRIDGE_EXE` pointing to a locally built Rust bridge, see [ts/README.md](ts/README.md)) and the browser journey script `ts/test/browser/journey.mjs` passed. Not every optional script has been verified: `ts/test/browser/badge.mjs` writes a browser profile inside the repository and has not been run. Use only disposable test keys and test assets with MVP-1, and never commit secrets, keys or credentials.

## Ground rules

**Keep the documentation honest.** Do not add invented partners, logos, testimonials, statistics, institutions, customers, benchmarks, results or URLs. Keep example figures labelled as illustrative. Do not imply audits, production deployments, mainnet readiness, wallet compatibility, funding or institutional commitments that do not exist, and do not describe MVP-1 testnet experiments as more than the MVP-1 documentation records. Keep what is proposed separate from what is built.

## Licensing of contributions

The code, documentation and specification in this repository are licensed under the [Apache License 2.0](LICENSE), to the extent the project owner owns or controls them (see the [README](README.md#licence)). The Tobin name, logo and brand assets are not covered by that licence. Please keep contributions to small corrections and issues for now, and expect that a maintainer may ask you to confirm that you have the right to offer a contribution under Apache-2.0.

## Security

Please report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md). No production system is deployed; MVP-1 has only been exercised in test environments, including a limited run on the Stellar public testnet with disposable accounts and test assets (an author-reported run whose evidence is not published and cannot be independently verified). Please do not publish exploit details for software or services belonging to the project or its participants in a public issue.
