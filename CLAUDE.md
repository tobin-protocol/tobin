# CLAUDE.md

Instructions for Claude Code in this repository. [`AGENTS.md`](AGENTS.md) is the canonical guide for all coding agents; this file only points to it and repeats the points that matter most. If the two ever differ, `AGENTS.md` and [`CONTRIBUTING.md`](CONTRIBUTING.md) win.

1. **Read [`AGENTS.md`](AGENTS.md) before any substantive work**, then the [README](README.md) and the documents for the subsystem you will touch (the reading order is in `AGENTS.md`, section 2).
2. **Follow every repository-wide rule** there on architecture, security, testing, Git and collaboration, including: no AI attribution or co-author trailers in commits or pull requests, no pushing to `main`, no merging, and no commit, push or pull request unless the user asked for it.
3. **Read the relevant technical documentation and code, and their tests, before modifying a subsystem.** Documents can be stale; `AGENTS.md` section 3 lists known discrepancies, and the code and its tests show what the system actually does.
4. **Inspect the working tree and branch before editing** (`git status`, `git branch --show-current`). Leave files you did not create alone, including untracked ones.
5. **Never assume an API, command, flag, file or feature exists.** Open it, or find the command in `package.json`, Cargo or a workflow, before you use or document it. Report checks you did not run as not run.
6. **Keep application state apart from independently verified on-chain state.** A prepared batch is not a submitted transaction; a submitted one is not a confirmed one; a confirmed one must be read back from the network and reconciled against the approved batch. Wallet authentication is not institutional authorization, and an institutional role is not Stellar signing authority.
7. **Follow [`docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md`](docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md)** whenever you write or change a project description, documentation or public-facing text.
8. **Never deploy to Mainnet or take any restricted action without explicit approval** from the project owner: minting or supply changes, contract or governance changes, signer changes, handling secrets, weakening security controls, or editing accepted evidence (the full list is in `AGENTS.md`, section 12). Tobin is Testnet-only and experimental.
