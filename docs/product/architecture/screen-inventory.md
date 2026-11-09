# Screen inventory (MVP-1)

Deliverable F. Terms follow [README.md](README.md). Dependencies refer to contract functions and SDK calls in [protocol-capability-mapping.md](protocol-capability-mapping.md) (**PCM**) and to journeys J1 to J7 in [user-journeys.md](user-journeys.md). Interaction patterns are named functionally (table, stepper, review panel, status badge); their visual design is Phase 2 and is not specified here.

Classification: **MVP-1 REQUIRED**, **MVP-1 OPTIONAL**, **FUTURE**, **NOT APPLICABLE**.

## Global behaviour (applies to every screen unless a screen says otherwise)

- **Loading:** a placeholder for the content that is loading; ledger reads that are slow show "reading the ledger" and never a stale value as current.
- **Error:** a typed, readable message with the contract error name where one exists (SDK `TobinError`), the failed call, and "nothing was changed" when true. A rejected or failed transaction is never shown as progress.
- **Network:** a permanent Testnet indicator; a banner when the wallet is on another network.
- **Permissions:** actions a user cannot take are hidden or disabled with the reason, never silently absent.
- **Irreversibility:** every step that cannot be undone (create session, submit obligation, freeze, settle) has a review state first.
- **Honest status:** "Settled" appears only when the contract state is Settled; authorizations are described as signatures from wallets, never as application approvals.

## Authentication and onboarding

### S01 Sign in: MVP-1 REQUIRED
- Purpose: authenticate by proving control of a wallet. Roles: visitor. Entry: application root, protected links.
- Data: supported wallet list, challenge to sign. Primary: connect wallet and sign a challenge. Secondary: help, learn more.
- Patterns: wallet chooser, challenge prompt. Empty: no wallet installed (instructions). Error: signature refused, wrong network.
- Permission: public. Dependencies: application backend (NOT IMPLEMENTED), wallet message signing (UNVERIFIED).

### S02 Organization onboarding: MVP-1 REQUIRED
- Purpose: create or join an organization (J1). Roles: new user. Entry: after first sign-in; an invitation link.
- Data: organization name, description, visibility; invitation token. Primary: create; accept invitation. Secondary: skip profile details.
- Patterns: stepper (details, wallet, team optional, done). Empty: not applicable. Error: name taken, invitation invalid or expired.
- Permission: the creator becomes administrator. Dependencies: application backend (NOT IMPLEMENTED).

### S03 Wallet connection and network check: MVP-1 REQUIRED
- Purpose: link and verify wallet addresses and the network. Roles: administrator (link), any signed-in user (connect). Entry: onboarding, settings, any wallet action.
- Data: address, label, proof of control, network, balance of the session token if relevant. Primary: connect, switch account, add address. Secondary: disconnect.
- Patterns: connection panel. Empty: no wallet linked. Error: wrong network, wallet locked, address linked elsewhere.
- Permission: adding addresses is administrator-only. Dependencies: wallet; application backend.

### S04 Invitation landing: MVP-1 REQUIRED
- Purpose: show an invitation to join a session or an organization. Roles: invitee. Entry: link or notification.
- Data: inviter, session summary (creator, token, capacities, participants, state) from the ledger, conditions of joining (J3). Primary: accept (starts the signatures), decline. Secondary: open the session.
- Patterns: summary and review panel. Empty: expired or withdrawn invitation. Error: session frozen (`WrongState`), full (`TooManyParticipants`), already a participant.
- Permission: signed-in; the wallet must be linked. Dependencies: `get_session`; invitation records (NOT IMPLEMENTED).

## Workspace

### S05 Overview (organization workspace): MVP-1 REQUIRED
- Purpose: show what needs action and the current state (the "netting overview" lives here as a task list, see S12 note). Roles: administrator, member. Entry: after sign-in; primary navigation.
- Data: needs-action list (approvals pending, debtor authorizations, invitations), active sessions with state and next step, recent activity, wallet and network status. Primary: open a task or session; new session. Secondary: dismiss notifications.
- Patterns: task list, status badges, summary cards. Empty: "Start your first session". Error: partial ledger failure shows which sections could not load.
- Permission: members see their organization's items. Dependencies: session status reads (`getSessionStatus`), application backend for tasks (NOT IMPLEMENTED).

### S06 Sessions list: MVP-1 REQUIRED
- Purpose: list sessions my organization takes part in. Roles: administrator, member. Entry: navigation.
- Data: name, state, creator, token, participants count over capacity, obligations count over capacity, next action, last activity. Primary: open, new session, join by link or id. Secondary: filter by state, search.
- Patterns: table with filters and state badges. Empty: no sessions (create or join). Error: ledger unreachable.
- Dependencies: the application's session registry or an indexer (NOT IMPLEMENTED; PCM section 3); `get_session`.

### S07 New session wizard: MVP-1 REQUIRED
- Purpose: create a session (J2). Roles: administrator, allowed member. Entry: Sessions, Overview.
- Data: name, token, max participants (up to 4), max obligations (up to 16), creator wallet. Primary: review and create. Secondary: save draft (application only).
- Patterns: stepper with review panel, irreversible-action notice. Empty: not applicable. Error: `BadCapacity`, `SessionExists`, `BadAddressKind`, wallet refused.
- Dependencies: `create_session`, `prepareCreateSession`, transport and wallet (NOT IMPLEMENTED).

### S08 Session detail, Overview tab: MVP-1 REQUIRED
- Purpose: one-screen status of a session (state, parties, next action). Roles: participants, observers. Entry: Sessions list, links.
- Data: state, creator, token, capacities, participants, obligations count, commitment and proposal digest when present, nets summary, `next` steps from `SessionStatus`. Primary: the single next action for the user. Secondary: copy link.
- Patterns: status header, progress through Open, Committed, Approved, Settled, "what happens next". Empty: session not found. Error: ledger read failure.
- Permission: public read; actions follow roles. Dependencies: `getSessionStatus` (all reads).

### S09 Session detail, Obligations tab with add and details: MVP-1 REQUIRED
- Purpose: list and add obligations; show obligation details (a drawer, not a separate page). Roles: participants. Entry: session tab.
- Data: debtor, creditor, amount (formatted by decimals), id, application reference. Primary: add obligation (debtor's wallet signs). Secondary: filter, copy id.
- Patterns: table, add form with live validation, review panel with the permanence notice. Empty: no obligations. Error: `UnknownParty`, `SameParty`, `BadAmount`, `TooManyObligations`, `DuplicateObligation`, `WrongState`.
- Permission: adding is possible only while Open and only for a debtor wallet the user controls. Dependencies: `submit_obligation`, `get_obligations`, `prepareSubmitObligation`.

### S10 Session detail, Participants tab (participant management): MVP-1 REQUIRED
- Purpose: show participants and manage invitations (J3). Roles: participants; the creator for admission. Entry: session tab.
- Data: participants in admission order with organization names, creator marked, pending invitations, capacity. Primary: invite, co-sign admission (creator). Secondary: withdraw an invitation (application only).
- Patterns: list with status, invitation form, signature-request panel. Empty: only the creator. Error: `TooManyParticipants`, `ParticipantExists`, `WrongState`.
- Permission: only the creator can co-sign admissions. Dependencies: `join_session`, `prepareJoin`, invitation and signature-collection services (NOT IMPLEMENTED).

### S11 Session detail, Netting tab (netting details): MVP-1 REQUIRED
- Purpose: freeze, propose, review results and collect approvals (J6). Roles: participants. Entry: session tab.
- Data: advisory nets, frozen commitment, proposal (instructions, digest, revision, proposer), default-plan comparison, approvals and who is missing, gross versus net. Primary: freeze; propose or replace; approve. Secondary: show digest check; view the plan as a table.
- Patterns: nets table, plan editor, approval checklist, replacement warning (shows how many approvals will be cleared), review panel. Empty: not frozen yet; no proposal yet. Error: all contract errors of J6, `DigestMismatch`.
- Permission: any participant may freeze or propose; each approves for itself. Dependencies: `finalize_obligations`, `propose_settlement`, `approve_settlement`, engine, `verifyDigests`.

### S12 Session detail, Settlement tab (settlement details): MVP-1 REQUIRED
- Purpose: authorize and execute settlement; show the record (J7). Roles: debtors, participants. Entry: session tab.
- Data: each debtor's own total and transfers, authorization status per debtor, balances, submission status, settlement record (digest, ledger, total moved, transfer count, transaction hash). Primary: authorize (debtor), submit. Secondary: view transaction; retry with fresh authorization.
- Patterns: per-debtor authorization list, transaction tracker (prepared, awaiting signatures, submitted, confirmed or rejected), intent review for signers. Empty: the session is not Approved. Error: insufficient balance, expired authorization, `ReauthorizationRequired`, `AlreadySettled`.
- Permission: a debtor authorizes only its own transfers. Dependencies: `settle`, `get_settlement`, `prepareSettle`, `settlementIntent`; transport, wallet entry signing (NOT IMPLEMENTED / UNVERIFIED).
- Note: there is no separate "Netting overview" or "Settlement overview" screen. Cross-session views are the Overview task list (S05) and the filtered Sessions list (S06), which avoids duplicating the session.

### S13 Session Activity tab: MVP-1 OPTIONAL
- Purpose: the history of one session. Data: events (`SessionCreated`, `ParticipantJoined`, `ObligationSubmitted`, `ObligationsFinalized`, `SettlementProposed`, `Approved`, `Settled`) with actors and ledger references. May reuse S17 filtered by session.

### S14 Obligations register: MVP-1 OPTIONAL
- Purpose: all obligations involving my organization across sessions. Data: debtor, creditor, amount, token, session, state derived from the session. Primary: open the session. No create or edit (protocol). Empty: none yet. Dependencies: registry or indexer (NOT IMPLEMENTED).

## Institutions

### S15 Institutions directory: MVP-1 REQUIRED
- Purpose: find counterparties (J5). Roles: all signed-in users. Entry: navigation.
- Data: name, short description, listed since, number of public sessions. Primary: open, invite to a session. Secondary: search.
- Empty: no listed institutions. Error: directory unavailable. Dependencies: application backend (NOT IMPLEMENTED). Only opted-in organizations appear.

### S16 Institution detail: MVP-1 REQUIRED
- Purpose: a public profile. Data: name, description, website, published addresses, public session history derived from the ledger for those addresses. Primary: invite to a session. Empty: no public history. Dependencies: backend; indexer for history (UNVERIFIED).

## Account and history

### S17 Activity (organization): MVP-1 REQUIRED
- Purpose: auditable history (J4). Data: actor, action, subject, time, transaction hash and ledger, outcome (submitted, rejected, confirmed). Primary: filter by session, person, outcome. Empty: no activity. Dependencies: application activity records (NOT IMPLEMENTED).

### S18 Organization settings: MVP-1 REQUIRED
- Purpose: profile, visibility, wallets, default member permissions (J4). Roles: administrator. Data: profile, listing state, wallet addresses with proof, permissions. Primary: save; add wallet; set visibility. Error: proof failed, address linked elsewhere. Permission: members see read-only. Dependencies: backend.

### S19 Team management: MVP-1 OPTIONAL
- Purpose: invite members and set roles. Roles: administrator. Data: members, roles, invitations. Primary: invite, change role, remove. A single administrator is enough for a first run.

### S20 User profile: MVP-1 OPTIONAL
- Purpose: the signed-in user's details, linked wallet, sign out. Data: display name, linked wallet.

### S21 Notifications: MVP-1 OPTIONAL
- Purpose: tasks and events ("approval needed", "invitation received", "settled"). In-application only. Dependencies: backend.

### S22 Public session page: MVP-1 OPTIONAL
- Purpose: a read-only shareable view of a session for visitors. Data: the public ledger data of S08 to S12 without actions. Permission: public; the page notes that the data is public on the ledger. Dependencies: `get_session` reads (S for reading; page NOT IMPLEMENTED).

### S23 Wallet signing review (modal): MVP-1 REQUIRED
- Purpose: the review-and-sign step used by every on-chain action. Data: the exact call, which accounts must authorize, which have, what is irreversible, the network and fee, and the transaction tracker after submission. Primary: send to wallet, cancel. Error: wallet refused, signer mismatch, expired authorization.
- Dependencies: SDK prepared calls and intents; transport and wallet (NOT IMPLEMENTED).

## Out of MVP-1

| Screen | Classification | Reason |
|---|---|---|
| Discover (browse and search public sessions, opportunity matching) | FUTURE | No enumeration or matching in the protocol; needs an indexer, a public registry and a matching service (J5) |
| Developers / API access | FUTURE | Outside MVP scope |
| Netting overview and Settlement overview as separate screens | NOT APPLICABLE | Netting and settlement are stages of one session; covered by S05, S06, S11, S12 |
| Cancel or close session, edit or withdraw obligation | NOT APPLICABLE | The protocol has no such operations |
| Billing, KYC, compliance workflows | NOT APPLICABLE | Out of scope for MVP-1 |

## Traceability

Every REQUIRED screen maps to a journey step: S01 to S04 to J1 and J3; S05 to J1 and J6; S06 to S12 to J2, J3, J6 and J7; S15 and S16 to J5; S17 and S18 to J4; S23 to J2, J3, J6 and J7. Permissions follow [roles-and-permissions.md](roles-and-permissions.md).
