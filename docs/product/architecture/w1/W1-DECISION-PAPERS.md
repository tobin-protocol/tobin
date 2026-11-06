# W1 decision papers (options, implications, recommendation; **no decision is made or implemented here**)

Date: 2026-11-06. Four decisions block anything beyond the mock-only console. Each paper gives the requirement, the options, their implications and a recommendation. A recommendation is not an owner decision: nothing in the repository assumes it, and an implementation needs the owner's written decision first. Evidence base: `../phase-2c/tst-signer-web-console-integration-contract.md`, `../phase-2c/tst-signer-security-architecture.md`, `../phase-2c/technical-decision-closure.md`, `../w0/W0-ARCHITECTURE.md`, `W1-THREAT-MODEL.md`.

| ID | Decision | Blocks | Owner input needed | Recommendation in one line |
|---|---|---|---|---|
| D1 | Production identity provider | any non-local use of the console | which IdP the organization uses; who may be approver or requester; session policy | a managed OIDC provider with phishing-resistant MFA (passkeys / security keys), roles mapped from groups on the server |
| D2 | Durable audit and approval-intent storage | production readiness; removes the PARTIAL FAILURE convention | database choice (links to C7), retention periods (links to C8), who may read the audit | PostgreSQL with an insert-only database role and a hash-chained audit table; intent and audit written in one transaction |
| D3 | Multi-instance strategy | availability beyond one process | whether availability beyond one instance is needed at all | stay single-instance for now; revisit only after D1 and D2 |
| D4 | Signer transport | any real preview, and everything after | where the console runs relative to the signer host; whether previews may run on demand | do not build an inbound channel yet; start with operator-initiated import of redacted, hash-bound results |

## D1. Production identity provider

**Requirement.** Strong authentication of named people; roles viewer, requester, approver assigned by the organization; requester and approver must be different people; no shared accounts; no hidden administrative bypass; operator is never a web role (contract section 3).

| Option | For | Against |
|---|---|---|
| A. Managed OIDC with MFA (for example the organization's existing workforce IdP) enforcing passkeys or hardware keys | one place for joiners/leavers; phishing-resistant MFA; standard; roles from groups; nothing for us to store | external dependency; token validation must be exact (issuer, audience, signature, expiry, `sub` as the identity) |
| B. Self-hosted OIDC | full control | we then operate an authentication system: patching, MFA enrolment, recovery |
| C. Reverse-proxy / zero-trust SSO in front of the console, console trusts a signed header | quick to add | trust in a header is only as strong as the proxy and network path; harder to test |
| D. Wallet-based sign-in | aligns with the product app | wallet support is itself blocked (decision register W1/C1); not suited to staff roles |

**Implications.** Whatever is chosen, the server must (1) take identity from the verified token or session, never from the request body, (2) map groups to roles on the server, (3) refuse any unmapped identity, (4) keep `requestedBy !== approvedBy` by stable subject id, (5) remove the development provider from production builds rather than only disabling it, (6) keep `Secure`, `HttpOnly`, `SameSite=Strict` cookies, CSRF tokens and server-side expiry and logout invalidation.
**Recommendation.** Option A. **Needed from the owner:** the IdP, the group-to-role mapping, MFA policy, session length. **Verification when built:** reuse `w0-auth` expectations against the real provider using a local test issuer, never real credentials.

## D2. Durable audit and approval-intent storage

**Requirement.** Synchronous write before a response (contract section 9); append-only and tamper-evident; intents immutable once recorded; one intent per preview; `reserve`/`commit` uniqueness; fail closed when the store is unavailable; survives restart; retention and access defined.

| Option | For | Against |
|---|---|---|
| A. PostgreSQL, insert-only role (no UPDATE/DELETE grants, triggers that reject them), unique constraints for `approvalId`, `requestId`, one intent per preview, audit hash chain (`prev_hash`), one transaction for intent plus audit | removes the partial-failure window; matches the product-app database recommendation (C7, still pending the owner); backups and point-in-time restore | operational dependency; the database administrator can still alter data unless audit rows are also anchored elsewhere |
| B. SQLite or an append-only JSON-lines file with `fsync` and a hash chain on a single host | simple; matches contract section 9 wording; no network service | single writer and single host; backup and tamper resistance depend on file permissions |
| C. Managed append-only or write-once log service | strong tamper resistance | cost, vendor dependency, query limits for the viewer |

**Implications.** Retention periods are an owner decision (C8). The store must live off the signer host (the console is a separate service, `W0-ENTRY-READINESS.md` section 10). Hash chaining detects edits but does not prevent them; periodically publishing the chain head somewhere the database administrator cannot write would be needed for stronger claims.
**Recommendation.** Option A, with the chain head exported to a second location chosen later. **Needed from the owner:** database choice and hosting, retention periods, who may read the audit. **Verification when built:** the store must pass `w1-store-conformance` unchanged, plus new durability, crash-consistency (kill between reserve and commit), concurrency and role-privilege tests.

## D3. Multi-instance strategy

**Requirement.** Only if availability beyond one process is required. Sessions, rate limits, reservations and audit order must then be consistent across instances.

| Option | Implication |
|---|---|
| A. Stay single-instance | simplest; restart causes a brief outage and (after D2) no data loss; sessions lost on restart unless stored |
| B. Several instances with database-backed sessions and counters | needs D1 and D2 first; reservation uniqueness from database constraints; shared rate-limit state; clock skew handling for approval timestamps |
| C. Stateless signed session tokens | logout and revocation need a shared denylist, which brings back shared state |

**Recommendation.** Option A. A console used by a handful of approvers does not justify B. **Needed from the owner:** confirmation that single-instance availability is acceptable.

## D4. Signer transport

**Requirement.** The browser never talks to the signer; the only entry point is the launcher `tst-signer.cjs` with a fixed argument vector, `shell: false`, minimal environment, timeout (contract section 2); no execute, init, key, state or file endpoint; the approved baseline hash comes from operator configuration out of band. The process-invocation hazard (B2) must be fixed and a new baseline approved before any real preview.

| Option | For | Against |
|---|---|---|
| A. Console backend runs the launcher on the same host (the contract's baseline design) | simplest; matches the contract | the web-facing console and the signer share a host, enlarging the signer's attack surface; needs B2 first |
| B. Local agent behind loopback or a named pipe that wraps the launcher, console talks to it | separates processes | a new authenticated interface and component to secure and review |
| C. Operator runs the signer's preview locally and imports the redacted, hash-bound result into the console (no inbound path to the signer host) | smallest attack surface; keeps the operator in the loop; nothing in the console can reach the signer | slower, manual; results are only as trustworthy as the import's integrity check |
| D. Queue or message bus between console and signer host | decoupled | still an inbound command path unless it carries data only |

**Implications.** Every option except C creates a channel from a web-facing service toward a key-adjacent host. Any real adapter must pass `w1-adapter-contract` plus its own authorised tests, and requires independent review, B2, deployment identity and configuration decisions, and a separate written authorization (`../w0/W0-ENTRY-READINESS.md` section 8).
**Recommendation.** Option C first; defer A, B and D until B2, an independent review and the owner's written authorization exist. **Needed from the owner:** where the console will run relative to the signer host; whether previews must be on demand.

## What is not decided here
Deployment identity F, `deployment-config.json`, the non-null pin, B2, the public-path exposure decision, wallet support (decision register W1), the ten-ledger window, and independent review all remain with the owner.
