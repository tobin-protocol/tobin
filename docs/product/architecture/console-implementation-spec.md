# Console implementation specification

Phase 2A. Builds on the Phase 1 baseline ([README.md](README.md)); it does not change Phase 1 decisions. Capability facts come from [protocol-capability-mapping.md](protocol-capability-mapping.md) and [integration-readiness.md](integration-readiness.md); visual facts from [../../design-system/README.md](../../design-system/README.md); components from [component-inventory.md](component-inventory.md); work order from [implementation-backlog.md](implementation-backlog.md). Screen IDs S01 to S23 are those of [screen-inventory.md](screen-inventory.md).

**Not implemented here.** This is a specification. Every behaviour below is PROPOSED unless it says it exists.

## 0. Conventions and status keys

**Data status keys** (used in every screen's "Data" line):

| Key | Meaning |
|---|---|
| CONTRACT | Readable or writable through a verified contract function (see capability mapping) |
| SDK | Provided by `packages/mvp1-sdk` today |
| SANDBOX | Exists only in the local sandbox Console (`apps/web-console`), with simulated authorizations and in-memory state |
| MISSING | Needs infrastructure that does not exist (identity, registry, indexer, backend, network transport, wallet) |
| GAP | The protocol cannot provide it |

**Two kinds of state are never mixed.** *Contract state* is Open, Committed, Approved or Settled and nothing else. *Application status* (for example invitation pending, transaction awaiting signatures, organization onboarding) is shown with a different visual treatment and a label that says it is application-side. There is no "Cancelled" or "Failed" session state; a failed or rejected transaction is a **transaction status**, and an abandoned session is at most a private note.

**Identity.** *Application identity* (a user, their organization, role) and *wallet identity* (a Stellar address that signs) are separate records. Application roles never grant on-chain authority.

**Wording rules kept from the existing Console** (`apps/web-console/lib/console/view.ts`, tested in `test/console-view.test.ts`): "settled" only when the contract reports Settled; authorizations are signatures, never application approvals; a stalled session is never described as completing by itself; an all-zero session never shows transfer activity.

**Limits shown as fixed facts:** at most 4 participants, 16 obligations and 16 settlement instructions per session; one token per session; amounts are positive integers in the token's base units.

## 1. Application shell

| Aspect | Specification |
|---|---|
| Regions | Header, primary navigation, content area, a banner strip, a toast area, modal layer |
| Header | Logo (`BrandMark`/`Logo` are reusable), organization context (name and switcher if several), network badge ("Testnet"), wallet control, user menu |
| Primary navigation | Overview, Sessions, Obligations (OPTIONAL), Institutions, Activity (Phase 1 information architecture); Discover reserved, not shown in MVP-1 |
| Account area | In the user menu: Organization settings, Team (OPTIONAL), Profile (OPTIONAL), Notifications (OPTIONAL), Wallet connection |
| Organization context | The active organization is always visible; actions are labelled with the acting organization and wallet |
| Wallet control | States: not connected, connected (address, network), wrong network, locked or disconnected, awaiting signature. It never shows the wallet as "approved" for anything |
| Banners | Testnet and experimental notice (persistent, same intent as the existing sandbox banner and the landing `StatusBar`); wrong-network banner; "signatures requested from you" strip |
| Page layout | A page header (title, status, primary action), then content. Session pages use a header with state and the single next action, then tabs |
| Responsive | Wide (from 1024px): persistent side or top navigation. Medium (768 to 1023px): collapsible navigation. Narrow (below 768px): navigation in a drawer; tables become stacked rows or cards; the primary action stays reachable. Breakpoints use Tailwind's defaults (`md` 768, `lg` 1024) unless DS1 changes them. No horizontal page scroll; data tables may scroll inside their own container |
| Accessibility | Landmarks (`header`, `nav` with `aria-label`, `main`), visible focus ring (existing 2px ink-soft ring), 44px touch targets, keyboard-operable menus, labels on icon-only buttons |
| Data / dependencies | Application session and organization (MISSING), wallet state (MISSING), network (MISSING) |
| Loading / empty / error | Shell renders immediately; the organization name shows a placeholder while loading; if the backend is unreachable the shell shows a limited mode and says which features are unavailable; the network badge shows "unknown" if the RPC cannot be reached |

## 2. Onboarding (S01 to S04)

### S01 Sign in
- **Purpose:** authenticate. **Users:** visitors. **Entry:** application root, protected links, invitation links.
- **Primary actions:** connect a wallet and sign a challenge. **Secondary:** help, what a wallet is.
- **Information:** supported wallets, what signing the challenge does (proves control of an address; no transaction, no fee).
- **Data dependencies:** backend challenge and session (MISSING); wallet message signing (API exists, behaviour UNVERIFIED, see readiness). **DECISION REQUIRED (D3):** wallet-based sign-in versus email sign-in with an added wallet. Wallet-based keeps application identity tied to an address; email sign-in separates them and needs account recovery.
- **Loading:** wallet detection spinner. **Empty:** no wallet found, with instructions. **Error:** refused signature, wrong network, backend down.
- **Permissions:** public. **Responsive:** single centred column. **Dependencies:** contract none; SDK none; backend and wallet required.

### S02 Organization onboarding
- **Purpose:** create an organization (the creator becomes administrator) or accept an invitation to one. **Entry:** after first sign-in.
- **Steps:** (1) organization name and description, (2) visibility (hidden by default), (3) link the signed-in wallet as the organization's first address, (4) invite teammates (OPTIONAL), (5) done.
- **Information shown:** what an organization is; that its wallet addresses are the on-chain participants; that application roles never carry on-chain authority.
- **Data:** application records (MISSING). **Errors:** name taken, invitation expired, wallet already linked to another organization. **Empty:** none. **Permissions:** signed-in user. **Responsive:** one step per screen on narrow widths.
- **Completion:** lands on Overview with the "Start your first session" empty state.

### S03 Wallet connection and network check
- **Purpose:** link and verify wallet addresses and the network. **Users:** administrator (link), any user (connect).
- **Information:** address, label, proof of control, network, balance of the session token when relevant.
- **Primary:** connect, switch account, add an address with a proof signature. **Secondary:** disconnect.
- **Behaviour on rejection, partial signing and disconnect:** see the signing model in the readiness document. Wrong network blocks signing and explains the fix.
- **Data:** wallet (MISSING), RPC reads (MISSING in the Console; the SDK has no network transport).

### S04 Invitation landing
- **Purpose:** show an invitation to a session (or organization) with the public session facts. **Entry:** link or notification.
- **Information:** inviter organization, session creator, token, capacities, participants, current contract state, conditions of joining (permanent admission, no leave, obligations may name this address, approval later, own transfers if a debtor).
- **Primary:** accept (starts the two-party admission, see S10), decline (application only). **Secondary:** open the session.
- **Data:** `get_session` (CONTRACT, but no network transport yet), invitation records (MISSING). **Errors:** session already frozen (`WrongState`), full (`TooManyParticipants`), already a participant (`ParticipantExists`), invitation expired.
- **Permissions:** signed-in, with a linked wallet. **Responsive:** summary above the actions on narrow widths.

## 3. Organization and institution management

### S18 Organization settings (includes the institution profile and wallets)
- **Purpose:** profile, visibility, wallet addresses, default permissions for members. **Users:** administrator (edit), members (read).
- **Information and actions:** name, description, website; listing visibility (hidden or listed); wallet addresses with proof of control and labels; whether members may send actions to a wallet for signing (default: administrators only).
- **Visibility note shown on the page:** a published wallet address already has public on-chain history.
- **Data:** application records (MISSING). **Errors:** proof failed, address linked elsewhere, name collision. **Responsive:** sections stack; forms single column.

### S19 Team management (OPTIONAL)
- **Purpose:** members, roles (administrator, member), invitations. **Users:** administrator.
- **Actions:** invite, change role, remove. **Data:** application records (MISSING). A single administrator is enough for a first run, so this screen can follow the first release.

### S15 and S16 Institutions (directory and detail)
- **Purpose:** find counterparties; present an organization. **Users:** all signed-in users (directory); visitors if public pages are enabled (S16).
- **Information:** name, description, website, published addresses, number of sessions the published addresses have created or joined.
- **Primary:** open, invite to a session. **Secondary:** search by name.
- **Data:** directory (MISSING, an application registry of organizations that opted in); on-chain history for published addresses (MISSING, needs an indexer or registry; see readiness). **Empty:** no listed institutions. **Error:** directory unavailable.

### S20 Profile (OPTIONAL) and S21 Notifications (OPTIONAL)
- Profile: display name, linked wallet, sign out. Notifications: tasks and events in the application ("approval needed", "invitation received", "settled"); backend required (MISSING).

## 4. Sessions and obligations

### S06 Sessions list
- **Purpose:** list sessions the organization takes part in. **Users:** administrators and members.
- **Information:** name, **contract state** (Open, Committed, Approved, Settled), creator, token, participants over 4, obligations over 16, the user's next action, last activity.
- **Primary:** open a session, new session, join by link or id. **Secondary:** filter by state, search.
- **Data:** the list of *my* sessions needs an application registry or an indexer (MISSING); each session's state is `get_session` (CONTRACT; reads need a network transport, MISSING in the Console). **There is no on-chain way to list sessions.**
- **Loading:** table placeholders. **Empty:** "No sessions yet" with create and join. **Error:** ledger unreachable (shows the last known snapshot, labelled with its age, never as current).
- **Responsive:** stacked rows on narrow widths.

### S07 New session wizard
- **Purpose:** create a session. **Users:** administrator, allowed member. **Entry:** Sessions, Overview.
- **Steps:** (1) name (application label) and token choice (a Testnet token; DECISION REQUIRED which tokens are offered), (2) capacities (max participants up to 4, max obligations up to 16, stated as fixed), (3) review: the creator wallet, what is irreversible (token and capacities), the signature required, (4) sign and submit, (5) confirmation with the new session.
- **Data:** `create_session` through `prepareCreateSession` (SDK, SANDBOX today); session id generation (the sandbox derives it from a label hash; a product needs an unguessable or collision-safe id, DECISION REQUIRED); network transport and wallet (MISSING).
- **Errors:** `BadCapacity`, `SessionExists`, `BadAddressKind`, wallet refused. **Permissions:** an administrator, or a member the administrator has allowed.

### S08 Session detail: header and Overview tab
- **Purpose:** one-screen status. **Users:** participants and observers.
- **Information:** contract state with a progress indicator through Open, Committed, Approved, Settled; creator, token, capacities; participants; obligation count; nets summary; the commitment and proposal digest when present; the single next action ("what happens next") from `SessionStatus.next`.
- **Data:** `getSessionStatus` (SDK; SANDBOX; reads need transport). **Empty:** session not found. **Error:** read failure. **Responsive:** header collapses to state and next action; tabs scroll horizontally on narrow widths.

### S09 Session Obligations tab (add obligation, obligation details)
- **Purpose:** list and add obligations; view one obligation. **Users:** participants.
- **Information:** debtor, creditor, amount formatted with the token decimals, obligation id, optional application reference.
- **Primary:** add obligation (only while the session is Open, signed by the debtor's wallet). **Secondary:** filter, copy id.
- **Form validation (immediate):** debtor and creditor are admitted participants and different (`UnknownParty`, `SameParty`), amount a positive integer (`BadAmount`), capacity (`TooManyObligations`), unique id (`DuplicateObligation`).
- **Review step:** states that a submitted obligation is **permanent**; no edit or delete exists.
- **Application metadata:** description or reference bound to the obligation id, labelled "not enforced by the contract" (DECISION REQUIRED, D10).
- **Data:** `submit_obligation`, `get_obligations` (CONTRACT); `prepareSubmitObligation` (SDK). **There is no on-chain draft**; a draft before submission exists only in the application (MISSING).
- **Responsive:** table becomes stacked cards.

### S10 Session Participants tab (participant management, invitations)
- **Purpose:** show participants and run admissions. **Users:** participants; the creator for co-signing.
- **Information:** participants in admission order with organization names, creator marked, pending invitations (application status), capacity.
- **Primary:** invite an organization, co-sign an admission (creator). **Secondary:** withdraw an invitation (application only).
- **The admission is one contract call needing two signatures** (joiner and creator). The page shows the application status of that exchange ("invited", "joiner signed", "awaiting creator", "admitted"). "Declined", "withdrawn" and "expired" are application statuses only.
- **Data:** `join_session` and `prepareJoin` (CONTRACT, SDK; SANDBOX); invitation and signature-collection service (MISSING); wallet signing of an authorization entry for a second account (UNVERIFIED).
- **Errors:** `TooManyParticipants`, `ParticipantExists`, `WrongState`, `BadAddressKind`.

### S14 Obligations register (OPTIONAL)
- Cross-session list of obligations involving the organization. Read-only; no create or edit. Data needs the same registry or indexer as the Sessions list (MISSING).

### S22 Public session page (OPTIONAL)
- Read-only shareable view for visitors with a note that session data is public on the ledger. Reads only; no network transport in the Console yet.

## 5. Discover

Phase 1 decision D2 recommends deferring Discover as a marketplace. This section specifies the intended experience and what each part needs, so the deferral is explicit rather than silent.

| Area | Intended UX | Data needed | Exists today? | Release |
|---|---|---|---|---|
| Institution discovery | Browse and search a directory; open a profile; invite to a session | Application registry of organizations that opted in (name, description, published addresses) | **MISSING**; no registry, no backend | MVP-1 (small directory, S15 and S16) |
| Protocol discovery | Find protocols (as participants) | A notion of "protocol" as an organization type with a published address. The contract accepts account or contract addresses as participants (`BadAddressKind` otherwise) but whether a contract can authorize as a participant is **UNKNOWN** and untested | **MISSING**; **UNKNOWN** | Later; needs investigation |
| Public session discovery | Browse open sessions, see which accept participants | A list of sessions with state and capacity. The contract has **no enumeration**. Needs an application registry or an indexer over events | **MISSING / GAP on-chain**. The Testnet RPC retains events for about 7 days only (120,960 ledgers measured on 2026-11-03), so an indexer must store its own history | Later |
| Search, filters, categories | Filter by state, token, capacity, participant | The same registry or indexer, plus application categories | **MISSING** | Later |
| Participation opportunities / netting opportunities | "Sessions you could join", "opportunities to net" | A matching service that proposes new sessions from obligations across organizations. The protocol has no cross-session netting and no restriction flag | **GAP**: a different product capability, not supported by the contract as is | FUTURE |

MVP-1 stand-in: join by link or session id (S04, S06), directory (S15, S16), optional public session page (S22). Any copy that says "discover" must not promise listing or matching.

## 6. Netting and settlement

Netting and settlement are **stages of one session** (Phase 1 decision D1). There is no separate "Netting" object beyond the session's proposal and approvals.

### S11 Session Netting tab
- **Purpose:** freeze, propose, approve. **Users:** participants.
- **Eligibility presentation:** the session is eligible to freeze when it is Open with at least 2 participants and 1 obligation. The tab shows the engine's advisory nets (net = outgoing minus incoming; positive means net debtor) labelled advisory.
- **Progress:** Frozen (contract Committed, no proposal), Proposed (Committed with a proposal, revision n), Agreed (Approved). The proposal's revision and digest are shown; replacing it warns that **all approvals are cleared** and shows how many.
- **Approval:** who has approved the current digest and who is missing; an approval is not a debit authorization.
- **Primary:** freeze (any participant, final), propose or replace (any participant), approve (each participant for itself). **Secondary:** digest check, plan table.
- **Data:** `finalize_obligations`, `propose_settlement`, `approve_settlement`, reads (CONTRACT); engine nets, default proposal, validator, `verifyDigests`, `prepareFinalize`, `preparePropose`, `prepareApprove` (SDK; SANDBOX); network and wallet (MISSING).
- **Errors:** `WrongState`, `NotParticipant`, `NoObligations`, `TooFewParticipants`, `FlowMismatch`, `OffsettingFlows`, `InstructionOrder`, `InstructionSelfPay`, `TooManyInstructions`, `DigestMismatch`, `NoProposal`.
- **Empty:** not frozen yet; no proposal yet. **Responsive:** plan and nets tables become stacked rows.

### S12 Session Settlement tab
- **Purpose:** authorize and execute settlement; show the record. **Users:** debtors and participants.
- **Information:** each debtor's own total and transfers, authorization status per debtor, token balances, submission status, and after settlement the record (digest, ledger, total moved, transfer count, transaction hash).
- **Transaction status (application-side):** prepared, awaiting signatures, submitted, confirmed, rejected. "Settled" appears only when the contract state is Settled. A rejected or failed attempt requires **fresh authorizations** (SDK `ReauthorizationRequired`).
- **Primary:** authorize (each debtor, own transfers), submit (anyone). **Secondary:** view the transaction, retry.
- **Data:** `settle`, `get_settlement` (CONTRACT); `prepareSettle`, `settlementIntent` (SDK); each debtor's authorization-entry signature (MISSING, UNVERIFIED with a browser wallet); the repository's signer limits authorization validity to 10 ledgers, which is short for cross-organization coordination.
- **Errors:** insufficient balance (the transfer fails and everything reverts), expired authorization, `AlreadySettled`, `DigestMismatch`.

### S17 Activity and transaction history
- **Purpose:** history of actions and transactions. **Information:** actor, action, subject, time, transaction hash and ledger, outcome (submitted, rejected, confirmed).
- **Data:** the application's own transaction and activity records (MISSING); on-chain events (CONTRACT, but the RPC retains about 7 days); the product must store its own history.
- **Per-session history (S13, OPTIONAL):** the same list filtered by session.

### S05 Overview
- "Needs your action" (approvals pending, debtor authorizations, invitations, signatures requested), active sessions with state and next step, recent activity, wallet and network status. Data: application tasks (MISSING) and session reads. Empty: "Start your first session".

### S23 Wallet signing review (modal)
- The review-and-sign pattern used by every on-chain action: the exact call, which accounts must authorize, who already has, what is irreversible, network and fee, then the transaction tracker. Behaviour on cancel, wrong account, wrong network and expired authorization is specified in the readiness document.

## 7. Cross-cutting requirements

| Requirement | Specification |
|---|---|
| Testnet only | Persistent notice; no Mainnet wording |
| Honest status | Contract state versus application status separated; no optimistic "settled" |
| Accessibility | Keyboard-operable forms and tables, visible focus, labels, 44px targets, status not conveyed by colour alone, `lang` set; contrast to be verified on any new state colours (DS2) |
| Responsiveness | As the shell; no horizontal page scroll; tables degrade to stacked rows |
| Internationalization | **DECISION REQUIRED:** the repository has no i18n library; plain English strings are acceptable for MVP-1 if copy is kept in one place so a library can be added later |
| Loading and error handling | Every ledger read has a loading state and a stale-data label; every error shows the typed contract or SDK error name from `sdk/errors.ts` |
| Security | The application holds no keys; the existing console's local-only guards and Content-Security-Policy (`connect-src 'self'`, host and origin checks) are designed for a sandbox and **must be redesigned** for a deployed product that calls an RPC and a wallet |
