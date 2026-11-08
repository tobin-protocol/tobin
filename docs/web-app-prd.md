# TOBIN
# Web Application — Product Requirements Document (PRD)
**Document type:** UI/UX Product Design Brief  
**Product:** Tobin Institutional Clearing and Settlement Infrastructure  
**Platform:** Web application  
**Primary experience:** Desktop  
**Additional experiences:** Tablet and mobile  
**Audience:** UI/UX Designer, Product Designer, Product Team

---

# 1. Product Overview

## 1.1 What is Tobin?

Tobin is an institutional clearing protocol and application built on Stellar that enables organizations to coordinate financial obligations, calculate net positions, authorize clearing operations, and facilitate settlement.

The platform is designed for:

- Financial institutions.
- Companies and corporate treasury teams.
- Fintech companies.
- Payment service providers.
- Blockchain protocols.
- Financial infrastructure providers.
- Developers integrating clearing functionality into their products.

Tobin addresses the complexity of settling multiple bilateral financial obligations between participating organizations.

Rather than requiring every organization to independently manage and settle every bilateral obligation, Tobin provides a shared clearing process through which participants can record obligations, calculate their resulting net positions, review settlement requirements, and coordinate authorized settlement operations.

The web application is the primary operational interface through which organizations interact with the protocol.

## 1.2 Product Promise

An organization should be able to:

1. Create an account and establish an organizational workspace.
2. Invite colleagues and manage organizational permissions.
3. Connect and manage associated Stellar wallets.
4. Create or join a clearing session.
5. Identify and coordinate participating organizations.
6. Record, inspect, and manage financial obligations.
7. Calculate and review resulting net positions.
8. Participate in the required approval and authorization process.
9. Prepare supported settlement operations.
10. Authorize and execute supported settlement transactions.
11. Verify settlement results through Stellar.
12. Inspect a complete history of its clearing activities.

## 1.3 Product Experience Principles

The application should communicate the following throughout the user experience:

**Institutional operations:** Users should understand that they are operating within an organizational financial infrastructure platform, not a consumer wallet application.

**Clarity:** Financial obligations, participant positions, settlement requirements, approvals, and transaction outcomes must be easy to understand.

**Traceability:** Important actions should have identifiable actors, timestamps, statuses, and supporting references.

**Controlled operations:** Financial operations should have explicit review and authorization stages. Important actions should never happen unexpectedly.

**Transparency:** Users must be able to distinguish application records, calculated results, prepared transactions, submitted transactions, and independently confirmed blockchain transactions.

**Operational efficiency:** Frequent activities should be accessible without requiring users to navigate through unnecessary screens.

---

# 2. Target Users and Personas

The design should accommodate different types of users who interact with Tobin on behalf of an organization.

## 2.1 Organization Owner

The organization owner establishes and controls the organization's workspace.

Primary responsibilities:

- Create the organization.
- Manage organization information.
- Invite and remove members.
- Assign roles.
- Manage organizational settings.
- Manage associated wallets.
- Access all permitted organizational operations.
- Review organizational activity.

## 2.2 Organization Administrator

The administrator manages the organization's operational workspace.

Primary responsibilities:

- Update organization information.
- Manage members and invitations.
- Assign permitted roles.
- Manage operational settings.
- Review sessions and organizational activity.

## 2.3 Clearing Operator

The operator is responsible for day-to-day clearing activities.

Primary responsibilities:

- Create clearing sessions.
- Invite participating organizations where authorized.
- Record obligations.
- Inspect obligations.
- Initiate netting calculations.
- Prepare settlement operations.
- Monitor session progress.

## 2.4 Approver

The approver reviews and authorizes eligible financial operations.

Primary responsibilities:

- Review clearing sessions.
- Inspect obligations and net positions.
- Review settlement instructions.
- Approve or reject eligible operations.
- Inspect authorization history.
- Verify that the operation meets organizational requirements.

## 2.5 Viewer

The viewer has read-only access to permitted organizational information.

Primary responsibilities:

- Inspect clearing sessions.
- Review obligations.
- View netting results.
- Inspect settlement records.
- View organizational activity.

## 2.6 External Participant

An external participant is a representative of another organization participating in a shared clearing session.

Primary responsibilities:

- Receive session invitations.
- Review session information.
- Accept or decline participation.
- Submit or inspect obligations where permitted.
- Review its organization's net position.
- Participate in approval and settlement workflows where required.

## 2.7 User Permission Matrix

| Capability | Owner | Admin | Operator | Approver | Viewer |
|---|---|---|---|---|---|
| View organization | Yes | Yes | Yes | Yes | Yes |
| Edit organization | Yes | Yes | No | No | No |
| Manage members | Yes | Yes | No | No | No |
| Manage invitations | Yes | Yes | As permitted | No | No |
| Create sessions | Yes | As permitted | Yes | No | No |
| Join sessions | Yes | Yes | Yes | As permitted | View only |
| Create obligations | Yes | As permitted | Yes | No | No |
| View obligations | Yes | Yes | Yes | Yes | Yes |
| Initiate netting | Yes | As permitted | Yes | No | No |
| Review netting | Yes | Yes | Yes | Yes | Yes |
| Approve operations | As authorized | As authorized | No by default | Yes | No |
| Prepare settlement | Yes | As permitted | Yes | No | No |
| Authorize settlement | Subject to authorization rules | Subject to authorization rules | No by default | Subject to authorization rules | No |
| View activity | Yes | Yes | Yes | Yes | Yes |

Important:

This matrix describes intended application permissions. Actual authorization must follow backend enforcement and the protocol's signer requirements. Application roles must never be presented as proof of Stellar signing authority.

The designer should account for disabled actions, unavailable actions, and permission-denied states.

---

# 3. Application Information Architecture

## 3.1 Main Navigation

The authenticated application should contain seven primary navigation destinations:

1. Overview
2. Clearing Sessions
3. Obligations
4. Organization
5. Activity
6. Wallets
7. Settings

The navigation should remain consistent across the authenticated experience.

## 3.2 Application Header

The application header should provide:

- Tobin logo.
- Current organization selector.
- Current environment/network indicator.
- Wallet connection indicator.
- Notifications.
- User profile and account menu.

### Organization selector

Users who belong to multiple organizations should be able to switch between their organizational workspaces.

The selector should display:

- Organization name.
- Organization logo or identifying mark.
- Organization type, where useful.
- Current selection.

Switching organizations should update all organization-scoped information and navigation context.

The interface should make the current organization unmistakable to prevent users from accidentally performing operations under the wrong organization.

### Environment indicator

The application must clearly communicate the active network/environment.

For example:

- Stellar Testnet.
- Stellar Mainnet, if and when supported.

The environment indicator must remain visible during sensitive operational workflows.

A user must never mistake a Testnet transaction for a Mainnet transaction.

### Wallet indicator

Display:

- Connected wallet status.
- Wallet address in shortened form.
- Wallet provider, where available.
- Connection state.

Clicking the indicator should provide access to wallet details and available wallet actions.

## 3.3 Global Interaction Requirements

The application should provide consistent access to:

- Search, where relevant.
- Notifications.
- Breadcrumb navigation.
- Contextual actions.
- Confirmation dialogs.
- Success and failure feedback.
- Empty states.
- Loading states.
- Error states.
- Permission-denied states.

The interface should avoid placing destructive or financially consequential actions in positions where they can be triggered accidentally.

---

# 4. Authentication and Account Management

## 4.1 Authentication Entry

The authentication experience should provide a clear entry point into Tobin.

Required screens:

- Sign-in.
- Account creation, if supported by the authentication implementation.
- Wallet connection.
- Wallet verification.
- Authentication success.
- Authentication failure.
- Session expired.
- Sign-out confirmation.

The designer should account for the distinction between authenticating a Tobin user and connecting a Stellar wallet.

## 4.2 Sign-in Flow

Expected flow:

1. User opens Tobin.
2. User selects Sign In.
3. User enters the supported authentication flow.
4. User completes the required verification.
5. The application establishes the authenticated session.
6. User is directed to the appropriate organizational workspace.

If wallet-based authentication is used:

1. User initiates wallet authentication.
2. The application generates an authentication challenge.
3. User is prompted to sign through the supported wallet.
4. User reviews and approves the signing request.
5. The application verifies the signature.
6. The user is authenticated.
7. The application redirects the user to the workspace.

Design states:

- Wallet not installed.
- Wallet disconnected.
- Wallet connection rejected.
- Signing request pending.
- Signing request rejected.
- Invalid signature.
- Expired challenge.
- Session expired.
- Authentication successful.

Never request a wallet seed phrase or private key.

## 4.3 First-Time User Experience

A newly authenticated user who has no organizational membership should see an onboarding experience.

The two primary actions should be:

- Create an organization.
- Join an existing organization.

The user should not be placed in an empty operational dashboard without guidance.

## 4.4 Account Menu

The user profile menu should provide:

- Account information.
- Current organization.
- Organization switching.
- Account security.
- Session information.
- Sign out.

---

# 5. Organization Onboarding and Management

## 5.1 Organization Creation

A newly registered user should be able to create an organizational workspace.

### Required information

- Organization name.
- Organization description.
- Organization type.
- Website, where available.
- Country or jurisdiction, where appropriate.
- Organization logo, optional.
- Primary contact information.

Organization types should include:

- Financial institution.
- Company.
- Fintech company.
- Payment service provider.
- Blockchain protocol.
- Financial infrastructure provider.
- Developer organization.
- Other.

### Organization creation flow

1. User selects Create Organization.
2. User enters organization information.
3. User reviews the information.
4. User confirms creation.
5. The application creates the organizational workspace.
6. The user becomes the organization owner.
7. The user is redirected to the organization overview.

The designer should provide a clear indication of successful creation.

Do not imply that completing this form legally verifies the organization.

## 5.2 Joining an Organization

Users should be able to join an existing organization through an invitation.

Flow:

1. User receives an invitation.
2. User opens the invitation.
3. User reviews the organization information.
4. User reviews the invitation details and assigned role.
5. User accepts or rejects the invitation.
6. If accepted, the user joins the organization.
7. The organization appears in the user's organization selector.

Invitation states:

- Pending.
- Accepted.
- Rejected.
- Expired.
- Revoked.

## 5.3 Organization Member Management

Organization administrators should have a dedicated member management interface.

Display:

- Member name.
- Email or account identifier.
- Assigned role.
- Membership status.
- Date joined.
- Last activity, where available.

Available actions:

- Invite member.
- Change role.
- Remove member.
- View member details.
- Revoke pending invitation.

### Invite member flow

1. Administrator selects Invite Member.
2. Enters the invitee's email address.
3. Selects the intended role.
4. Reviews invitation details.
5. Sends invitation.
6. Invitation appears in the pending invitations list.

### Change role flow

1. Administrator selects a member.
2. Opens role management.
3. Selects the new role.
4. Reviews the permission changes.
5. Confirms the change.
6. The updated role is reflected in the member list.

### Remove member flow

1. Administrator selects a member.
2. Selects Remove Member.
3. Reviews the consequences.
4. Confirms removal.
5. The member loses the relevant organizational access.

Important member-management constraints should be communicated clearly, especially where the owner cannot remove themselves or where ownership transfer is required.

---

# 6. Organization Workspace

## 6.1 Organization Overview

The organization overview is the main operational dashboard for an organization.

It should provide a summary of its clearing activity and important outstanding actions.

### Suggested information

**Organization summary**
- Organization name.
- Organization identifier.
- Organization type.
- Associated Stellar accounts.
- Number of members.
- Current network.

**Operational metrics**
- Total clearing sessions.
- Active sessions.
- Completed sessions.
- Pending sessions.
- Number of participating organizations.
- Total obligations recorded.
- Outstanding obligations.
- Settled value, only where supported and verifiable.

**Operational attention**
- Sessions awaiting action.
- Pending approvals.
- Invitations awaiting response.
- Settlement operations awaiting authorization.
- Recent failed or refused operations.

**Recent activity**
- Latest clearing sessions.
- Latest obligations.
- Recent approvals.
- Recent settlement events.

### Dashboard interactions

Users should be able to:

- Open a clearing session.
- View all sessions.
- Review outstanding approvals.
- View obligations.
- Access organizational activity.
- Invite a colleague.

The dashboard should prioritize actionable information over decorative metrics.

All metrics must come from actual persisted application data or independently verified protocol data.

---

# 7. Clearing Sessions

Clearing sessions are the central product object in Tobin.

A session brings participating organizations and their financial obligations into a shared clearing process.

## 7.1 Clearing Session Listing

The Clearing Sessions page should provide a complete list of sessions accessible to the current organization.

### Information displayed

- Session name.
- Session identifier.
- Initiating organization.
- Number of participants.
- Number of obligations.
- Relevant assets.
- Session lifecycle status.
- Creation date.
- Last updated timestamp.

### Required functionality

- Search by session name or identifier.
- Filter by status.
- Filter by date.
- Filter by initiating organization, where relevant.
- Sort by creation date.
- Sort by last updated.
- Pagination.
- Open session details.

### Session categories

Consider providing quick filters:

- All Sessions.
- Created by My Organization.
- Joined Sessions.
- Active.
- Awaiting My Organization.
- Completed.
- Archived, if supported.

## 7.2 Session Creation

A permitted organization member should be able to create a clearing session.

### Creation flow

**Step 1 — Basic information**
- Session name.
- Session description.
- Optional reference.

**Step 2 — Participants**
- Select participating organizations.
- Search for organizations.
- Review selected participants.
- Define the initiating organization.

**Step 3 — Session parameters**
- Configure only parameters supported by the actual protocol.
- Select supported assets, where applicable.
- Review participation requirements.
- Review any applicable session constraints.

**Step 4 — Review**
Display a summary of:
- Session details.
- Initiating organization.
- Intended participants.
- Supported parameters.
- Any required actions.

**Step 5 — Create**
- Confirm session creation.
- Show creation result.
- Display the session identifier.
- Navigate to the new session workspace.

The designer must not introduce arbitrary configuration options without corresponding protocol support.

## 7.3 Session Invitations and Joining

An invited organization should be able to:

1. Open the invitation.
2. Review session details.
3. Inspect the initiating organization.
4. Inspect other participants, where permitted.
5. Review relevant session parameters.
6. Accept or decline participation.
7. Complete any required authorization.
8. See its membership reflected in the session workspace.

Where joining requires an on-chain operation, the interface must distinguish wallet authorization, transaction submission, and independently verified confirmation.

## 7.4 Session Lifecycle

The proposed application lifecycle is:

1. Draft.
2. Open for participation.
3. Active.
4. Obligations collection.
5. Ready for netting.
6. Netting completed.
7. Awaiting approval.
8. Approved.
9. Settlement prepared.
10. Settled.
11. Cancelled.
12. Failed.

This is a proposed application state model. It must be mapped to actual protocol states and explicitly identified off-chain states.

The designer should make the lifecycle understandable through:

- Current status.
- Progress indicator or timeline.
- Completed stages.
- Current stage.
- Outstanding actions.
- Next expected action.

Not every session must display every stage as an available action.

---

# 8. Session Workspace

Every clearing session should have a dedicated operational workspace.

The workspace should make it possible to understand the state of a session without navigating through multiple unrelated pages.

## 8.1 Session Header

Display:

- Session name.
- Session identifier.
- Current status.
- Initiating organization.
- Creation date.
- Last updated timestamp.
- Participant count.

Available actions should depend on the user's role and the session's state.

## 8.2 Session Navigation

The session workspace should contain:

1. Overview.
2. Participants.
3. Obligations.
4. Netting.
5. Approvals.
6. Settlement.
7. Activity.

## 8.3 Overview

The overview tab should summarize the entire session.

Display:

- Session details.
- Current lifecycle stage.
- Participating organizations.
- Total obligations.
- Relevant assets.
- Gross obligation value, where meaningful.
- Calculated net positions, when available.
- Approval progress.
- Settlement status.
- Upcoming actions.
- Recent activity.

The page should identify what the current organization needs to do next.

## 8.4 Participants

Display:

- Organization name.
- Organization identifier.
- Associated Stellar account, where available.
- Participation status.
- Join date.
- Relevant permissions.
- Required authorization status.

Available actions:

- Invite participant, where permitted.
- View organization details.
- View participant obligations.
- Inspect participation history.

## 8.5 Session Obligations

This tab should provide a session-specific view of all recorded obligations.

Users should be able to:

- View obligations.
- Search obligations.
- Filter by debtor.
- Filter by creditor.
- Filter by asset.
- Filter by status.
- Create an obligation, where permitted.
- Open obligation details.

## 8.6 Netting

The netting tab should display the result of the clearing calculation.

It must distinguish original obligations from calculated net positions.

The designer should make the relationship between these two views easy to understand.

## 8.7 Approvals

Display:

- Required approvals.
- Approval status.
- Authorized participants.
- Outstanding approvals.
- Approval history.
- Relevant transaction evidence.

The interface should clearly distinguish application approval from any required Stellar signing authorization.

## 8.8 Settlement

Display:

- Settlement summary.
- Required authorization status.
- Prepared transactions.
- Submission status.
- Stellar transaction hashes.
- Confirmation status.
- Verification evidence.

## 8.9 Activity

Display a chronological history of session events.

Events include:

- Session creation.
- Invitations.
- Participation changes.
- Obligation events.
- Netting events.
- Approval events.
- Settlement events.
- Failures and refusals.

---

# 9. Obligations Management

Obligations represent the financial commitments recorded between participating organizations.

## 9.1 Global Obligations Page

The global Obligations page should provide an organization-level view of obligations across accessible sessions.

### Information displayed

- Obligation identifier.
- Session.
- Debtor.
- Creditor.
- Asset.
- Amount.
- Status.
- Created timestamp.

### Required functionality

- Search.
- Filter by session.
- Filter by debtor.
- Filter by creditor.
- Filter by asset.
- Filter by status.
- Sort.
- Pagination.
- Open obligation details.

## 9.2 Obligation Creation

A permitted user should be able to create an obligation between eligible participants.

### Obligation creation flow

**Step 1 — Select session**
- Choose an active eligible clearing session.

**Step 2 — Define parties**
- Select debtor.
- Select creditor.

Only eligible session participants should be available.

**Step 3 — Enter financial information**
- Select supported asset.
- Enter amount.
- Enter reference identifier.
- Add supporting information.
- Add optional expiry or due date, if supported.

**Step 4 — Review**
Show:
- Debtor.
- Creditor.
- Asset.
- Amount.
- Reference.
- Session.

**Step 5 — Submit**
- Confirm creation.
- Display the result.
- Navigate to obligation details.

The implementation must validate participant eligibility, supported assets, amounts, precision, and protocol constraints.

## 9.3 Obligation Details

The details page should provide:

**Obligation information**
- Obligation identifier.
- Session.
- Debtor.
- Creditor.
- Asset.
- Amount.
- Reference.
- Supporting information.
- Current status.
- Creation timestamp.

**History**
- Created by.
- Creation event.
- Subsequent events.
- Associated approvals, where applicable.
- Relevant protocol references.

Users should be able to understand the source and current state of an obligation.

## 9.4 Obligation State and Actions

Potential states:

- Draft.
- Submitted.
- Recorded.
- Eligible for netting.
- Included in netting.
- Settled.
- Rejected.
- Cancelled.
- Disputed, if supported.

The designer should not assume that every state or action is available in the current protocol.

Obligations must not be silently modified or deleted in a way that undermines the audit trail.

Where correction is supported, show the correction as an explicit operation with its own history.

---

# 10. Netting Engine and Interface

Netting is one of Tobin's most important product capabilities.

The experience should make complex financial calculations understandable to both operators and approvers.

## 10.1 Netting Overview

The netting interface should communicate:

- Which obligations are eligible.
- Which obligations are excluded.
- Which assets are being processed.
- How participant positions are calculated.
- How gross obligations compare with net obligations.
- The resulting participant positions.
- How the result was produced.

If netting is performed off-chain, the application must clearly distinguish the calculation engine from the on-chain settlement protocol.

## 10.2 Initiating a Netting Calculation

Expected flow:

1. User opens a clearing session.
2. User navigates to Netting.
3. Application displays eligible obligations.
4. User reviews the included obligations.
5. User initiates the calculation.
6. The application processes the eligible obligations.
7. The result is displayed.
8. User inspects the calculation.
9. User can proceed to the next supported workflow.

The interface should show an appropriate processing state.

If the calculation fails, users should receive a meaningful explanation and a way to inspect the relevant errors.

## 10.3 Netting Results

The result page should present the following.

### Summary

- Gross obligations.
- Net settlement requirements.
- Number of obligations included.
- Number of participating organizations.
- Number of resulting net positions.
- Reduction in gross settlement requirements, where mathematically established.
- Calculation timestamp.
- Calculation version or identifier.

### Participant positions

For each organization, display:

- Organization.
- Total amount owed.
- Total amount receivable.
- Net position.
- Relevant asset.
- Settlement direction.

The presentation should make it easy to identify:

- Net debtors.
- Net creditors.
- Organizations with zero-net positions.

### Original versus net obligations

Provide a clear comparison between:

- Original bilateral obligations.
- Resulting net positions.
- Settlement requirements after netting.

The user should be able to inspect how the resulting figures were obtained.

## 10.4 Netting Calculation Details

Users should be able to open a calculation detail view.

Include:

- Input obligation records.
- Included obligations.
- Excluded obligations and reasons.
- Participant-level calculation breakdown.
- Resulting net positions.
- Calculation timestamp.
- Calculation identifier.
- Calculation version.
- Validation result.

The calculation should be inspectable and reproducible under the same inputs and calculation rules.

## 10.5 Netting Verification

The interface should provide access to the validation status of a calculation.

Relevant cases include:

- Two-party obligations.
- Three-party cycles.
- Multi-party obligations.
- Multiple assets.
- Zero-net positions.
- Duplicate records.
- Invalid participants.
- Invalid or unsupported assets.
- Rounding and precision.
- Missing or conflicting obligations.

Do not net different assets together unless the protocol explicitly supports the required conversion and accounting logic.

## 10.6 Netting Exceptions

Where an obligation cannot be included in the calculation, show:

- Obligation identifier.
- Reason for exclusion.
- Relevant validation information.
- Recommended next action, where appropriate.

Do not silently discard obligations.

---

# 11. Approval and Authorization Workflows

Approval and authorization are essential to institutional clearing operations.

The interface should make the difference between organizational approval and blockchain signing explicit.

## 11.1 Approval Overview

The Approvals interface should provide a consolidated view of operations requiring attention.

Display:

- Approval reference.
- Clearing session.
- Organization.
- Operation type.
- Requested by.
- Requested timestamp.
- Current approval status.
- Required approvers.
- Outstanding approvals.

Suggested filters:

- Awaiting My Approval.
- Awaiting Other Approvers.
- Approved.
- Rejected.
- Expired, if supported.

## 11.2 Approval Detail

When an approver opens an approval request, display:

- Operation details.
- Initiating organization.
- Related clearing session.
- Relevant obligations.
- Netting result.
- Proposed settlement instructions.
- Requested authorization.
- Required approval conditions.
- Previous approval events.

The approver should have enough information to make an informed decision without navigating through multiple unrelated screens.

## 11.3 Approval Flow

1. Operator prepares an eligible operation.
2. Operator submits it for approval.
3. The application records the approval request.
4. Required approvers are notified.
5. Approver opens the request.
6. Approver reviews the operation.
7. Approver approves or rejects it.
8. The application records the decision.
9. The session progresses when the required conditions are met.

## 11.4 Approve Operation

Before approval, show a review screen or confirmation dialog.

The approver should be able to:

- Inspect the operation.
- Review supporting information.
- Confirm the intended action.
- Approve the request.

After approval, show the updated approval state and the remaining required actions.

## 11.5 Reject Operation

A rejection should require a reason.

Flow:

1. Approver selects Reject.
2. Application requests a rejection reason.
3. Approver reviews the decision.
4. Approver confirms rejection.
5. The application records the rejection.
6. The initiating operator is notified.

The interface should show whether rejection returns the operation for correction or ends the current workflow.

## 11.6 Stellar Authorization

Where an operation requires Stellar signing authority:

1. User reviews the transaction request.
2. Application explains the signing purpose.
3. User initiates wallet authorization.
4. The supported wallet presents the signing request.
5. User approves or rejects.
6. Application processes the result.
7. The interface reports the actual authorization outcome.

A user must never be shown as having provided on-chain authorization merely because they clicked an application approval button.

---

# 12. Settlement Operations

Settlement is the process through which approved net positions are translated into supported settlement transactions.

The settlement experience must communicate each stage precisely.

## 12.1 Settlement Overview

The Settlement interface should show:

- Settlement reference.
- Associated clearing session.
- Participating organizations.
- Relevant assets.
- Settlement amount.
- Number of settlement instructions.
- Approval status.
- Signing status.
- Submission status.
- Confirmation status.

Provide filters for:

- Prepared.
- Awaiting authorization.
- Authorized.
- Submitted.
- Confirmed.
- Failed.
- Refused.

Only display statuses that the underlying implementation supports.

## 12.2 Settlement Preparation

Expected flow:

1. User opens an approved clearing session.
2. User navigates to Settlement.
3. Application retrieves the supported net settlement information.
4. User reviews the settlement summary.
5. Application prepares the supported transaction instructions.
6. User inspects the prepared operations.
7. The application presents the required authorization steps.

### Settlement summary

Display:

- Source clearing session.
- Approved netting result.
- Settlement asset.
- Settlement amounts.
- Sender and receiver details.
- Required signer information.
- Number of transactions.
- Relevant network.

Users should be able to inspect individual settlement instructions.

## 12.3 Settlement Review

Before authorization, provide a dedicated review experience.

The user should see:

- What will be transferred.
- Which accounts are involved.
- Which asset is involved.
- The amount of each transfer.
- The number of transactions.
- The relevant clearing session.
- The approved settlement reference.
- The active network.

The interface should clearly identify any difference between the approved settlement information and the prepared transaction.

A mismatch must not be hidden or treated as a successful review.

## 12.4 Settlement Authorization

Where wallet authorization is required:

1. User selects Authorize.
2. Application explains the requested action.
3. Wallet opens.
4. User reviews the signing request.
5. User approves or rejects.
6. Application displays the actual result.

Handle:

- Wallet disconnected.
- Wallet unavailable.
- User rejected signing.
- Signing timeout.
- Invalid signing response.
- Required signer unavailable.
- Insufficient authorization.

## 12.5 Transaction Submission

After successful authorization, the application may submit the supported transaction.

The interface must distinguish:

- Prepared.
- Signed.
- Submitted.
- Confirmed.
- Failed.

Submission must not be presented as confirmation.

## 12.6 Settlement Verification

After submission:

1. Application obtains the transaction reference.
2. Application checks the relevant Stellar network.
3. The transaction result is independently read back.
4. The application presents the verified result where supported.
5. The settlement record displays the appropriate confirmation state.

### Settlement details

Display:

- Stellar transaction hash.
- Network.
- Source account.
- Destination account.
- Asset.
- Amount.
- Submission timestamp.
- Confirmation timestamp, where available.
- Verification status.
- Associated clearing session.

Provide an external Stellar explorer link where appropriate.

## 12.7 Failed Settlement

When settlement fails, provide:

- Failure status.
- Transaction reference, if one exists.
- Failure reason, where available.
- Affected settlement instructions.
- Relevant session.
- Timestamp.
- Recommended next step, where supported.

Do not automatically retry a financially consequential operation without explicit safeguards and appropriate authorization.

## 12.8 Settlement History

Users should be able to inspect previous settlement operations.

Provide filtering by:

- Session.
- Date.
- Asset.
- Status.
- Transaction hash.
- Organization.

---

# 13. Activity and Audit History

The application must maintain an inspectable history of important operations.

## 13.1 Global Activity

The Activity page should provide an organization-level chronological history.

Events may include:

- User authentication events.
- Organization creation.
- Membership changes.
- Invitations.
- Session creation.
- Session joining.
- Obligation creation.
- Netting calculations.
- Approval activity.
- Transaction preparation.
- Transaction signing.
- Transaction submission.
- Transaction confirmation.
- Failures and refusals.

## 13.2 Activity Record

Each activity record should identify:

- Actor.
- Operation.
- Affected entity.
- Timestamp.
- Result.
- Relevant reference.

Where available, include:

- Related session.
- Related obligation.
- Transaction hash.
- Network.
- Approval reference.

## 13.3 Activity Filters

Users should be able to filter by:

- Event type.
- User.
- Session.
- Date range.
- Result.
- Organization.

## 13.4 Activity Details

Clicking an activity event should open a detail view containing the full available event information.

For example, clicking a settlement confirmation event should allow the user to inspect the associated settlement and transaction evidence.

Activity records should be presented as historical records, not editable content.

---

# 14. Wallet Management

The Wallets section should allow an organization to inspect and manage its associated Stellar accounts.

## 14.1 Wallet Overview

Display:

- Wallet address.
- Wallet provider.
- Associated organization.
- Network.
- Connection status.
- Verification status.
- Date associated.
- Primary wallet designation, if supported.

## 14.2 Connect Wallet

Flow:

1. User opens Wallets.
2. Selects Connect Wallet.
3. Chooses a supported wallet provider.
4. Wallet connection request opens.
5. User approves connection.
6. Application receives the public address.
7. Application performs any required ownership verification.
8. Wallet appears in the organization's wallet list.

The application must distinguish a connected wallet from a wallet whose ownership has been verified.

## 14.3 Wallet Details

Display:

- Full wallet address.
- Network.
- Wallet provider.
- Connection state.
- Verification status.
- Associated authorization information, where supported.
- Relevant transaction activity.

## 14.4 Wallet Disconnection

Users should be able to disconnect an available wallet session.

The interface should explain the consequences of disconnection.

Disconnection from the application must not be represented as deletion of the underlying Stellar account.

## 14.5 Wallet and Signer Information

Where supported, show:

- Signer address.
- Signer weight.
- Required signing threshold.
- Authorization status.
- Relevant signing requirements.

Do not imply that an organization member's application role automatically grants authority to sign Stellar transactions.

---

# 15. Notifications

The application should provide a notification experience for operational events.

## 15.1 Notification Types

Examples:

- Organization invitation received.
- Invitation accepted.
- Invitation rejected.
- New session invitation.
- Organization joined a session.
- New obligation recorded.
- Netting calculation completed.
- Approval requested.
- Approval completed.
- Approval rejected.
- Settlement prepared.
- Signing requested.
- Transaction submitted.
- Transaction confirmed.
- Settlement failed.

## 15.2 Notification Center

Users should be able to:

- View notifications.
- Open the associated entity.
- Mark notifications as read.
- Mark all as read.
- Filter notifications.
- View unread notification count.

Clicking a notification should take the user to the relevant operational context.

---

# 16. Settings

The Settings section should contain organization and user-level settings.

## 16.1 Organization Settings

- Organization profile.
- Organization information.
- Associated wallets.
- Member management.
- Invitations.
- Organizational permissions.
- Operational preferences, where supported.

## 16.2 User Settings

- User profile.
- Account information.
- Authentication and security.
- Active sessions.
- Notification preferences.
- Connected wallet information.

## 16.3 Security

Where supported, provide access to:

- Authentication information.
- Active sessions.
- Session revocation.
- Security-related activity.

Do not expose configuration options that have no corresponding backend implementation.

---

# 17. Global Search

The application should provide a search experience for locating operational records.

Searchable entities may include:

- Clearing sessions.
- Session identifiers.
- Organizations.
- Obligations.
- Settlement references.
- Transaction hashes.
- Activity records.

Search results should identify the record type and provide a direct route to its details.

Search results must respect the user's organizational permissions.

---

# 18. Core End-to-End User Journeys

The designer should create complete journey maps for the following scenarios.

## Journey 1 — New Organization Onboarding

1. User opens Tobin.
2. User signs in.
3. User has no organization.
4. User selects Create Organization.
5. User enters organization information.
6. User reviews the information.
7. User creates the organization.
8. User lands on the organization dashboard.
9. User is prompted to connect an associated wallet or invite colleagues, where supported.

**Expected outcome:** The user has an organizational workspace and understands the next steps.

## Journey 2 — Inviting Team Members

1. Owner opens Organization.
2. Owner navigates to Members.
3. Owner selects Invite Member.
4. Owner enters email.
5. Owner selects a role.
6. Owner sends invitation.
7. Invitation appears as Pending.
8. Invitee accepts.
9. Member appears in the organization list.

**Expected outcome:** The organization has a new member with the appropriate role.

## Journey 3 — Creating a Clearing Session

1. Operator opens Clearing Sessions.
2. Operator selects Create Session.
3. Operator enters session details.
4. Operator selects participating organizations.
5. Operator reviews supported session parameters.
6. Operator reviews the configuration.
7. Operator creates the session.
8. Application displays the session identifier.
9. Operator opens the session workspace.

**Expected outcome:** A clearing session is created and available for the next supported stage.

## Journey 4 — Joining a Clearing Session

1. Organization receives an invitation.
2. User opens the invitation.
3. User reviews the session details.
4. User inspects the initiating organization.
5. User accepts participation.
6. User completes any required protocol authorization.
7. Application displays the organization as a participant.

**Expected outcome:** The organization joins the session successfully.

## Journey 5 — Recording an Obligation

1. Operator opens a clearing session.
2. Operator selects Obligations.
3. Operator selects Add Obligation.
4. Operator selects debtor and creditor.
5. Operator selects asset.
6. Operator enters amount and reference.
7. Operator reviews the obligation.
8. Operator submits it.
9. Application displays the obligation record.

**Expected outcome:** An obligation is recorded and visible in the session.

## Journey 6 — Calculating Net Positions

1. Operator opens a session.
2. Operator navigates to Netting.
3. Application displays eligible obligations.
4. Operator reviews the inputs.
5. Operator initiates calculation.
6. Application processes the calculation.
7. Application displays gross obligations and resulting net positions.
8. Operator inspects participant-level results.
9. Operator reviews calculation details.

**Expected outcome:** The organization can inspect the calculated net positions and their supporting information.

## Journey 7 — Reviewing and Approving an Operation

1. Operator prepares an eligible operation.
2. Operator submits it for approval.
3. Approver receives a notification.
4. Approver opens the approval request.
5. Approver reviews the underlying session and financial information.
6. Approver approves or rejects.
7. Application records the decision.
8. The relevant operational status updates.

**Expected outcome:** The approval process is traceable and understandable.

## Journey 8 — Preparing and Executing Settlement

1. Operator opens an approved session.
2. Operator navigates to Settlement.
3. Operator reviews the approved net positions.
4. Operator prepares settlement instructions.
5. Application displays the settlement summary.
6. Operator reviews the transactions.
7. Required authorization is requested.
8. Authorized signer approves through the wallet.
9. Transaction is submitted.
10. Application obtains the transaction reference.
11. Stellar network result is checked.
12. Verified transaction outcome is displayed.

**Expected outcome:** The user can distinguish each stage and inspect the final verified transaction result.

## Journey 9 — Investigating a Failed Operation

1. User receives a failure notification.
2. User opens the affected operation.
3. Application displays its current state.
4. User inspects the failure details.
5. User opens the associated session or transaction.
6. User reviews the activity history.
7. User identifies the supported corrective action, if any.

**Expected outcome:** The user can understand what failed, what was affected, and what action is available.

## Journey 10 — Switching Organizations

1. User opens the organization selector.
2. User views their organizational memberships.
3. User selects another organization.
4. Application switches workspace context.
5. Dashboard, sessions, obligations, and permissions update accordingly.

**Expected outcome:** The user can manage multiple organizational workspaces without confusing their data or operational context.

---

# 19. Screen and State Requirements

The designer must provide more than ideal-state screen designs.

Every major workflow should account for the following states where applicable.

## 19.1 Loading

- Initial page loading.
- Data retrieval.
- Session creation processing.
- Obligation submission processing.
- Netting calculation processing.
- Wallet connection.
- Signing request processing.
- Transaction submission.
- Transaction verification.

## 19.2 Empty States

Examples:

- No organizations.
- No clearing sessions.
- No active sessions.
- No obligations.
- No netting results.
- No pending approvals.
- No settlement records.
- No connected wallets.
- No activity.
- No notifications.
- No search results.

Each empty state should explain what the user can do next, subject to their permissions.

## 19.3 Error States

Examples:

- Network error.
- Authentication failure.
- Permission denied.
- Invalid form information.
- Unsupported asset.
- Ineligible participant.
- Duplicate obligation.
- Failed netting calculation.
- Approval failure.
- Wallet disconnected.
- Signing rejected.
- Transaction submission failure.
- Transaction verification failure.
- Session expired.

Error messages should explain the problem in language that helps users understand what happened.

## 19.4 Permission States

The interface should account for:

- Read-only user.
- Operator without approval permission.
- Approver without signing authority.
- User without organization membership.
- User with expired invitation.
- User without access to a session.
- User attempting an unavailable operation.

Do not rely on hiding buttons alone. The interface should explain why an action is unavailable where that explanation is useful.

## 19.5 Confirmation States

Important actions should provide explicit review and confirmation.

Examples:

- Creating an organization.
- Sending an invitation.
- Removing a member.
- Creating a session.
- Joining a session.
- Recording an obligation.
- Submitting an approval.
- Rejecting an approval.
- Preparing settlement.
- Authorizing a transaction.
- Cancelling an eligible operation.

---

# 20. Financial Data Presentation Requirements

Financial information must be presented consistently and unambiguously.

The design should clearly identify:

- Amount.
- Asset.
- Debtor.
- Creditor.
- Sender.
- Receiver.
- Gross value.
- Net value.
- Settlement value.
- Transaction status.
- Network.
- Timestamp.

Never display a financial amount without identifying its asset.

Where multiple assets are involved, show separate asset groupings.

Do not combine unrelated asset amounts into a single total unless the system explicitly supports a valid conversion and accounting methodology.

For financial operations, provide an opportunity to inspect the full details before confirmation.

---

# 21. Responsive Design Requirements

Desktop is the primary operational experience.

The application must also work on tablet and mobile.

## Desktop

Prioritize:

- Full operational dashboards.
- Data tables.
- Multi-column financial summaries.
- Session workspaces.
- Detailed approval interfaces.
- Settlement review.
- Activity history.

## Tablet

Adapt:

- Navigation.
- Tables.
- Session workspaces.
- Financial summaries.
- Approval and settlement interfaces.

Preserve access to important information without requiring unnecessary horizontal scrolling.

## Mobile

Prioritize:

- Dashboard summaries.
- Notifications.
- Session inspection.
- Obligation details.
- Approval review.
- Wallet status.
- Activity history.

Complex tables may use alternative responsive presentations such as stacked records or detail views.

Financially consequential actions must remain clear and usable on smaller screens.

The mobile experience should not remove essential transaction information or confirmation steps.

---

# 22. Design Deliverables

The designer is expected to produce the following.

## 22.1 Information Architecture

- Complete application sitemap.
- Main navigation structure.
- Session workspace navigation.
- Organization workspace navigation.
- Account and settings navigation.

## 22.2 User Flows

Detailed user flows for all ten end-to-end journeys in Section 18.

Flows should include:

- Entry point.
- User action.
- System response.
- Decision points.
- Success paths.
- Failure paths.
- Alternative paths.
- Permission-dependent variations.

## 22.3 Screen Designs

Design all major screens, including:

**Authentication**
- Sign-in.
- Wallet connection.
- Authentication states.

**Onboarding**
- Create organization.
- Join organization.
- First-time user dashboard.

**Organization**
- Organization overview.
- Organization profile.
- Members.
- Invitations.
- Member details.
- Wallet associations.

**Clearing**
- Session listing.
- Session creation.
- Session invitation.
- Session overview.
- Participants.
- Obligations.
- Netting.
- Approvals.
- Settlement.
- Session activity.

**Obligations**
- Global obligation listing.
- Create obligation.
- Obligation details.

**Operations**
- Approval listing.
- Approval details.
- Settlement listing.
- Settlement preparation.
- Settlement review.
- Transaction status.
- Settlement details.

**Account**
- Activity.
- Notifications.
- Wallets.
- Wallet details.
- Settings.
- User profile.

## 22.4 Component and State Coverage

Provide designs for:

- Tables.
- Filters.
- Search.
- Forms.
- Confirmation dialogs.
- Side panels.
- Detail views.
- Status indicators.
- Progress timelines.
- Notification items.
- Financial summaries.
- Empty states.
- Loading states.
- Error states.
- Permission-denied states.

## 22.5 Interactive Prototype

Produce a clickable prototype demonstrating at least these complete flows:

1. First-time organization onboarding.
2. Creating a clearing session.
3. Recording obligations.
4. Reviewing netting results.
5. Reviewing an approval.
6. Preparing and reviewing settlement.
7. Inspecting transaction confirmation.
8. Investigating a failed operation.

The prototype should make it possible to understand how the application behaves, not merely how individual screens look.

---

# 23. Important Design Constraints

The following constraints are non-negotiable.

1. Do not design Tobin as a consumer cryptocurrency wallet.
2. Do not make the dashboard resemble a generic analytics template.
3. Clearing sessions must be the central operational concept.
4. The relationship between obligations and net positions must be easy to understand.
5. The settlement process must be presented as a sequence of distinct operational stages.
6. Application approvals must be distinguishable from Stellar signing authorization.
7. Prepared, signed, submitted, and confirmed transactions must have distinct states.
8. The active network must remain visible during sensitive operations.
9. Financial records must be traceable.
10. Users must always understand which organization they are operating under.
11. Role-based permissions must be reflected in the experience.
12. Do not invent capabilities that have no corresponding protocol or application support.
13. Do not imply that a transaction succeeded before the relevant result has been independently verified.
14. Do not display fabricated balances, financial volumes, transaction counts, or performance metrics.

The design should communicate that Tobin is institutional clearing and settlement infrastructure built on Stellar.

---

# 24. Final Design Objective

The final experience should make it possible for an organization to understand and operate its clearing activities from a single workspace.

A user should be able to move naturally through the following process:

**Organization → Clearing Session → Participants → Obligations → Netting → Approval → Settlement Preparation → Authorization → Execution → Verification → Activity History.**

The most important design challenge is making this entire process understandable, transparent, and operationally efficient.

The finished application should feel like a serious institutional financial operations platform, with clearing sessions at its center and Stellar providing the settlement infrastructure.

The designer should prioritize a coherent end-to-end operational experience over isolated, visually impressive screens.