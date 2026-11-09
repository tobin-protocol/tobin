# Security policy

Tobin is pre-production institutional infrastructure that runs on Stellar Testnet. Production deployment has not yet been approved, Mainnet and real-value use are not authorized, and no independent security review or audit has been performed. Please read the [README](README.md#current-scope-and-remaining-engineering-work) for what exists and what remains.

## Supported development stage

There are no tagged releases and no production deployment. Only the current `main` branch is maintained, and only for the current implementation scope described in the README. No older version receives fixes. Reports about the contracts, the TypeScript engine and SDK, the web console (authentication, sessions, authorization, persistence, the Stellar tools) and the repository tooling are welcome.

## Reporting a vulnerability

Report suspected vulnerabilities **privately** through GitHub private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability** and describe the issue.

This is the primary route. If the **Report a vulnerability** option is missing, private reporting may have been switched off; use the email address below instead.

**By email (secondary route):** you can also report privately to the project maintainer at [ebubechiihediwa@gmail.com](mailto:ebubechiihediwa@gmail.com). Reports go to one person, the repository owner, not to a security team or an incident-response organization. Whichever channel you use, do not put exploit details, keys or other secrets in a public issue, pull request or discussion.

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

The repository owner, Ebubechi Ihediwa, receives vulnerability reports sent through GitHub private vulnerability reporting or to the email address above. There is no separate security team.

## What is not promised

No response-time target, fix timeline, disclosure schedule, bug bounty or legal safe-harbour is offered by this document. Reports are handled on a best-effort basis by the owner.

## Scope

**In scope:** the contracts, the TypeScript engine, SDK, web console and its Stellar tooling, scripts, workflows and documentation in this repository.

**Out of scope:** findings that depend on deployments the project did not make, on real-value use (which the project does not support), or on someone else's compromised machine or keys; vulnerabilities in third-party software (Stellar, Freighter, Next.js, Node.js and other dependencies), which should be reported to their maintainers; social engineering; and findings that only affect a modified fork.
