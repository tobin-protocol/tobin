# Security policy draft (superseded)

> **Superseded on 2026-10-28:** the policy was adopted as `SECURITY.md` in the repository root (GitHub private vulnerability reporting; the owner monitors reports; no response-time commitment). This file is kept as background only.

**Reporting contact: PENDING (owner decision).** Do not invent or publish a contact before the owner approves it. Options for the owner to choose between (none is selected):
1. GitHub private vulnerability reporting on the hosted repository (needs the repository to exist, its settings to be verified, and the feature to be enabled by an administrator).
2. A dedicated monitored security mailbox for the project (needs the organization to hold a domain and mailbox; none exists today as far as this repository shows).
3. Another channel the owner names.

## Proposed content once a contact exists (for owner and legal review)
* **Scope.** The experimental MVP-1 clearing and test-token contracts, the TypeScript engine, SDK and local Console, and the signing tool in this repository. The project is experimental, not production-ready and has not been independently audited. No mainnet deployment is intended; only disposable test assets have been used.
* **What to report.** Authorization or replay weaknesses, accounting or rounding errors, state-machine violations, digest or encoding ambiguities, secret exposure in the repository, and dependency vulnerabilities with a concrete impact.
* **How to report.** Privately through the adopted channel, with affected commit, steps to reproduce and impact. Please do not publish exploit details for software that others might deploy before the maintainers have had a reasonable chance to respond.
* **What the project will do.** Response time targets, disclosure timeline and credit practices are to be decided by the owner; none is promised here.
* **Safe harbour and legal terms.** Any statement protecting good-faith researchers needs qualified legal review and must not be added without it.
* **Out of scope.** Findings that depend on deployments the project did not make, on real-value use, or on the excluded materials listed in the README.

## Supported versions (proposal for the owner)
The project is experimental and has no released versions. Until a release exists, only the current default branch would be treated as supported, and reports against older commits or against archived material would be handled on a best-effort basis. Do not state version-support commitments until the owner decides them.

## Information the owner must supply before this draft can be adopted
1. The reporting channel (GitHub private vulnerability reporting on the verified repository, a monitored mailbox the organization really controls, or another channel). No address is invented here.
2. Who monitors it, and what response-time and disclosure-timeline targets the owner is willing to commit to.
3. Whether any safe-harbour wording is wanted (this needs qualified legal review).
4. Confirmation that the channel is actually enabled and tested (send a test report and confirm receipt) before the file is renamed to `SECURITY.md` and the words PENDING and DRAFT are removed.
Until then gate `G06` stays BLOCKED and the README correctly says that a security policy has not been added.

## Status
On 2026-10-28 private vulnerability reporting was verified as enabled through authenticated GitHub tooling and `SECURITY.md` was adopted. This draft is no longer in force as a separate document.
