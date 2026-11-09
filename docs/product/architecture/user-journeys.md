# User journeys

Deliverable D. Terms follow [README.md](README.md). Capability limits follow [protocol-capability-mapping.md](protocol-capability-mapping.md) (abbreviated **PCM** below); screens are in [screen-inventory.md](screen-inventory.md); states in [lifecycle-models.md](lifecycle-models.md). Each journey marks what is supported today (**S**), what needs build work on top of the protocol (**B**) and what the protocol cannot do (**GAP**). All journeys are Testnet only.

Two facts shape every journey. First, **wallet signing is required for anything on-chain**, and signing authorization entries for non-source accounts through a browser wallet is UNVERIFIED (PCM section 4). Second, **organizations, sign-in, invitations, discovery and persistence do not exist** (NOT IMPLEMENTED); the existing Console is a single-page local sandbox with demo personas.

---

## Journey 1: Organization onboarding

| Item | Specification |
|---|---|
| Entry point | The application's sign-in page, or an invitation link |
| User intent | Start using Tobin on behalf of an organization |
| Preconditions | A supported wallet is installed (Testnet); the user can sign a message |
| Status | **B**: identity, organizations, wallets, teams are all NOT IMPLEMENTED; the protocol is not involved |

Steps and system responses:
1. **Sign in** with the wallet. The system asks the wallet to sign a challenge (proof of control, no transaction, no fee) and creates or finds the User.
2. **Create or join an organization.** Create: name, description. Join: accept an invitation from an administrator. The creator becomes the administrator.
3. **Organization details and public profile** (name, description, visibility: hidden or listed). Default: hidden.
4. **Wallet configuration.** The signed-in wallet's address is linked with its proof of control. Additional addresses can be added later; each needs its own proof.
5. **Team invitations** (OPTIONAL in MVP-1): invite members by email or wallet address with a role.
6. **Completion:** the user lands on Overview with an empty state and a "Start your first session" action; the Testnet banner is visible.

Success state: signed in, organization Active with at least one verified wallet.
Error states: wallet not installed or on the wrong network; signature refused; wallet already linked to another organization; invitation expired or invalid.
Empty states: no organization yet (create or join); no wallets (add one).
Permissions: only the administrator can add wallets, change visibility or invite; members can view.
Dependencies: application backend for identity and organization records; wallet signing of a message. No contract or SDK call.

---

## Journey 2: Creating an obligation (a session and its obligations)

| Item | Specification |
|---|---|
| Entry point | Sessions, "New session"; Overview, "Start your first session" |
| User intent | Record what my organization owes or is owed within a small group and prepare it for netting |
| Preconditions | Signed in as an administrator or an allowed member; a linked wallet; a token available (the governed Testnet token) |
| Status | Protocol steps: **S** (contract and SDK implemented; the Console sandbox demonstrates them). Network transport and wallet signing: **B**. Terms, descriptions, due dates: **GAP** on-chain |

Steps and system responses:
1. **Start a session.** Choose the token (a Testnet token from a list), capacities (up to 4 participants and 16 obligations; the form explains both limits and that they are fixed), and an internal name. The system generates the session id.
2. **Review and create.** A review screen states what is irreversible (token and capacities cannot change) and which wallet signs. The system prepares `create_session`, the wallet signs, the transaction is submitted and tracked until confirmed. The creator is admitted automatically.
3. **Add participants** (see Journey 3 for the other side): invite organizations; each admission needs the invitee's and the creator's signatures.
4. **Enter an obligation**: debtor and creditor (admitted participants only), amount (integer in the token's base units, displayed with its decimals), optional internal reference. Validation is immediate: not the same party, positive amount, capacity, party admitted. An optional description is kept in the application only and is labelled as not enforced.
5. **Review each obligation.** The review states that a submitted obligation is permanent. The debtor's wallet signs `submit_obligation`; the system tracks it to confirmation.
6. **Track status.** Session detail shows the session state, obligations and what must happen next (Journey 6).

Success state: the obligation appears in the contract's list and in the session's Obligations tab, with its ledger reference.
Error states (typed, from the SDK): `UnknownParty`, `SameParty`, `BadAmount`, `TooManyObligations`, `DuplicateObligation`, `WrongState` (the session has been frozen), wallet refused or on the wrong network, transaction rejected.
Empty states: no sessions; a session with no obligations ("add the first obligation").
Permissions: only the debtor's wallet can submit an obligation (on-chain). Only an administrator, or an allowed member, can send a call to the wallet (application).
Dependencies: `create_session`, `submit_obligation`, `get_session`, `get_obligations`; SDK `prepareCreateSession`, `prepareSubmitObligation`; network transport and wallet (B).
Gaps: no editing, deleting or cancelling; no per-obligation asset, terms or due date on-chain; the only draft state is application-side.

---

## Journey 3: Joining an obligation (joining a session)

| Item | Specification |
|---|---|
| Entry point | An invitation (link or notification) or a session link or id |
| User intent | Take part in a session another organization created |
| Preconditions | Signed in; a verified wallet; the session is Open and below capacity |
| Status | On-chain admission: **S**. Invitation, discovery by browsing, and the two-party signature collection: **B**. Browsing and requesting without an invitation: **GAP** (no on-chain request; "Discover" is FUTURE) |

Steps and system responses:
1. **Open the invitation or session.** The page shows the creator, token, capacities, current participants, obligations already recorded and the state. All of this is public on-chain; the application adds names where known.
2. **Review participation conditions.** The page states what joining means: the address becomes a permanent participant (no leave), obligations naming it can be recorded by debtors, it must later approve a settlement, and if it is a debtor it will authorize its own transfers. It also states that the session never completes on its own.
3. **Accept** (the application-level request). The user's wallet signs its half of the admission; the system hands the creator a request to co-sign.
4. **The creator co-signs**; the call is submitted as one transaction and tracked.
5. **Participation status** is shown (invited, awaiting creator, admitted).

Success state: the address appears in the session's participants; the session is in the user's Sessions list.
Error states: `WrongState` (the session was already frozen), `TooManyParticipants`, `ParticipantExists`, `BadAddressKind`, creator declines or never signs (the invitation stays pending or is withdrawn or expires, application-side), wallet refused.
Empty states: no invitations; no sessions yet.
Permissions: the joiner's wallet and the creator's wallet must both authorize `join_session`. An organization administrator cannot admit an address they do not control.
Dependencies: `join_session`, `get_session`; SDK `prepareJoin`; signature-collection service and invitation records (B).
Gaps: no on-chain rejection, leave or removal; a "request to join" with no invitation is only an application message; the creator's signature is always required.

---

## Journey 4: Institution management

| Item | Specification |
|---|---|
| Entry point | Account area, Organization settings; Institutions, "My organization" |
| User intent | Keep my organization's details accurate and decide how visible it is |
| Preconditions | Signed in as an administrator |
| Status | **B** entirely off-chain; nothing exists |

Steps:
1. **Create or complete the institution profile** (name, description, website, published addresses).
2. **Manage organizational details** and wallet addresses (with proof of control), and the default permissions for members.
3. **Manage visibility and discoverability:** hidden (default) or listed in the directory. The page states that any published address already has public on-chain history.
4. **Review active sessions and obligations** (the organization's sessions list, filtered to non-settled).
5. **Review participation history** (the organization's Activity and settled sessions).

Success state: profile saved; directory shows the listing if chosen.
Error states: proof of control failed; address already linked elsewhere; name collision; unauthorized (member).
Empty states: no profile yet; no sessions yet.
Permissions: administrator edits; members view. Changes are recorded in Activity.
Dependencies: application backend only. On-chain history for published addresses comes from the ledger (indexer, B).

---

## Journey 5: Discover and Explore

| Item | Specification |
|---|---|
| Entry point | Institutions directory; shared session links; Discover (reserved) |
| User intent | Find counterparties, understand a session, see which are open |
| Preconditions | None for public pages |
| Status | **Mostly GAP or FUTURE** |

What is possible in MVP-1:
- Browse the **institution directory** (opted-in organizations), search by name. **B**, off-chain.
- Open a **session by link or id** and see its public details; understand whether it is **Open** (can still admit participants and take obligations) or **frozen or settled** (closed to joins); show remaining capacity (participants and obligations). **S/B**: reads are by session id (`get_session`, `get_obligations`).
- See an institution's published addresses and their on-chain session history if an indexer exists. **B**, UNVERIFIED indexing.

What is not possible:
- **Browse or search all obligations or sessions** and "discover netting opportunities": **GAP**. The contract has no enumeration, no public/private or restriction flag, and no matching. This needs an indexer, a public registry and a matching service that proposes new sessions; it is FUTURE.
- "Restricted" opportunities: **GAP**. The only restriction on-chain is that joining needs the creator's signature, so every session is effectively invitation-gated by the creator.

Success state: the user understands a session's status and can take an action (open it, request an invitation by message, invite).
Error states: unknown session id; the ledger is unreachable.
Empty states: no matching institutions; session not found.
Permissions: all public pages are readable by visitors.

---

## Journey 6: Netting

| Item | Specification |
|---|---|
| Entry point | Session detail, Netting tab; the Overview "Needs your action" queue |
| User intent | Agree what each party will pay or receive |
| Preconditions | The session is Open with at least 2 participants and 1 obligation; the user is a participant |
| Status | Protocol and SDK: **S**. Network transport and wallet: **B**. Netting across sessions: **GAP** |

Steps and system responses:
1. **Identify eligible work.** The Netting tab shows when a session is eligible (a "Freeze obligations" step is offered) and the Overview lists sessions awaiting action.
2. **Review the potential result before freezing.** The engine's advisory nets are shown (net = outgoing minus incoming; positive = net debtor), labelled advisory.
3. **Freeze** (`finalize_obligations`, any participant). The review states it is final for this session (participants, token, obligations).
4. **Propose** (`propose_settlement`, any participant). The default proposal is offered as a starting point and labelled as not authority; the contract accepts any valid plan. The user sees the transfers, the digest and revision.
5. **Understand the parties and positions:** each participant's net, the transfers, gross versus net comparison.
6. **Approve** (`approve_settlement`, every participant, the current digest only). The page shows who has approved and who is missing. An approval is not a debit authorization.
7. **Replacing a proposal** clears all approvals; the UI warns before it happens and shows what was invalidated.
8. **Review results:** the agreed net transfers and the digest, with the session in Approved.

Success state: every participant approved the current digest; the session is Approved.
Error states: `WrongState`, `NotParticipant`, `NoObligations`, `TooFewParticipants`, `FlowMismatch`, `OffsettingFlows`, `InstructionOrder`, `InstructionSelfPay`, `TooManyInstructions`, `DigestMismatch`, `NoProposal`.
Empty states: no eligible sessions; no proposal yet.
Permissions: any admitted participant's wallet can freeze or propose; each participant must approve with its own wallet.
Dependencies: `finalize_obligations`, `propose_settlement`, `approve_settlement`, reads; SDK `prepareFinalize`, `preparePropose`, `prepareApprove`, engine (default plan, validator), digest check; transport and wallet (B).
Gaps: netting across several sessions or automatic detection of opportunities does not exist; a stalled session has no timeout or abort.

---

## Journey 7: Settlement

| Item | Specification |
|---|---|
| Entry point | Session detail, Settlement tab; Overview queue |
| User intent | Execute the agreed net transfers |
| Preconditions | The session is Approved; each debtor of the proposal has the balance and can authorize |
| Status | `settle` and the intent model: **S** (sandbox and offline signer). Wallet signing of each debtor's authorization entries, signature collection, submission and confirmation: **B**, UNVERIFIED |

Steps and system responses:
1. **Review net positions and the required actions.** For each debtor: its own total and its transfers. Creditors need no authorization.
2. **Authorize transactions.** Each debtor's wallet authorizes exactly `settle(session, digest, own total)` plus its own token transfers. The signer sees an intent it can check (the SDK intent model). Approvals do not replace this step.
3. **Submit.** Any party may submit once every debtor's authorization is in hand. The system tracks it: prepared, awaiting signatures, submitted, confirmed or rejected.
4. **Track confirmation.** "Settled" is shown only when the contract reports state Settled.
5. **Review the settlement record:** digest, ledger, total moved, number of transfers, transaction hash, balances before and after.

Success state: the session is Settled; the record is final.
Error states: a debtor's authorization is missing or expired; insufficient token balance (the token transfer fails and everything reverts); a failed attempt requires **fresh** authorizations (`ReauthorizationRequired`); network or wallet errors; `DigestMismatch`, `AlreadySettled`.
Empty states: nothing awaiting settlement.
Permissions: each debtor's wallet only for its own authorization; anyone may submit.
Dependencies: `settle`, `get_settlement`, token `balance` and `transfer`; SDK `prepareSettle`, `settlementIntent`; signer and wallet (B).
Gaps: authorization lifetimes are policy-limited to 10 ledgers in the repository's signer, which leaves little time for human coordination across organizations (EQ-20); an all-zero session settles with no transfers and must be presented that way.
