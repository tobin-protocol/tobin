# Security policy

Tobin is **experimental, Testnet-only software**. It is not production-ready, not approved for Mainnet or real value, and has not been independently audited. Please read the [README](README.md#known-limitations) for what exists and what does not.

## Supported development stage

There are no tagged releases and no production deployment. Only the current `main` branch is maintained, and only for the experimental scope in the README. No older version receives fixes. Reports about the contracts, the TypeScript engine and SDK, the web console (authentication, sessions, authorization, persistence, the Stellar tools) and the repository tooling are welcome.

## Reporting a vulnerability

Report suspected vulnerabilities **privately** through GitHub private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability** and describe the issue.

GitHub private vulnerability reporting is **enabled** on this repository (checked 2026-11-07). If the **Report a vulnerability** option is missing, it has been switched off: the repository owner has to re-enable it (Settings, Code security). In that case do not publish the details anywhere; open a public issue that says only "I need a private channel for a security report" and contains no technical detail, and wait for the maintainers to respond. No security email address is published, and none is invented here.

## What to include

- the affected commit or file, and the component (for example authentication, sessions, a migration, the execution plan, a contract);
- clear steps to reproduce, with a proof of concept that uses **throwaway Testnet accounts only**;
- the impact you expect: what an attacker could do, and what they would need first;
- your assessment of severity, and a suggested fix if you have one;
- how you would like to be credited, if at all.

## Handling keys, credentials and sensitive data

- **Never include a real private key, seed phrase, token, password or session cookie in a report.** Use disposable Testnet keys created for the test.
- If you find a real credential in the repository, history, an issue or a log, report it privately and treat it as compromised: it must be rotated, not just removed.
- Do not access, modify or retain data that is not yours, and stop once you have shown the issue.

## Responsible disclosure

Please give the maintainers a reasonable opportunity to understand and fix the issue before anyone else learns the details. **Do not publish exploitable details, and do not open a public issue or pull request describing a suspected vulnerability, before it is fixed or the maintainers have agreed to disclosure.** Do not test against deployments, accounts or services that are not yours.

## Who receives reports

The repository owner, Ebubechi Ihediwa, monitors vulnerability reports submitted through GitHub for this repository.

## What is not promised

No response-time target, fix timeline, disclosure schedule, bug bounty or legal safe-harbour is offered by this document. Reports are handled on a best-effort basis by the owner.

## Scope

**In scope:** the contracts, the TypeScript engine, SDK, web console and its Stellar tooling, scripts, workflows and documentation in this repository.

**Out of scope:** findings that depend on deployments the project did not make, on real-value use (which the project does not support), or on someone else's compromised machine or keys; vulnerabilities in third-party software (Stellar, Freighter, Next.js, Node.js and other dependencies), which should be reported to their maintainers; social engineering; and findings that only affect a modified fork.
