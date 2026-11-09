# User roles and access architecture

Deliverable B. Terms follow [README.md](README.md). On-chain facts follow [protocol-capability-mapping.md](protocol-capability-mapping.md).

## 1. Two separate layers

| Layer | Source of authority | Who holds it |
|---|---|---|
| **Application layer** (PROPOSED, nothing exists today) | The application's own records: users, organizations, roles | The application and its administrators |
| **On-chain layer** (IMPLEMENTED) | Wallet signatures checked by the contract with `require_auth()` | The holder of the Stellar account's keys |

**An application role never grants on-chain authority.** An organization administrator cannot make a contract call, approve for a participant, or authorize a debtor's transfer unless the wallet that controls that Stellar address signs. The application can only prepare calls and collect signatures. The contract has no administrator and no override, so there is no on-chain role for the application to hold.

## 2. Entities and relationships

| Concept | Definition | Needed for MVP-1? |
|---|---|---|
| Individual user | A person who signs in (wallet-based sign-in proposed) | Yes |
| Organization | The entity that owns obligations in the application; has one or more wallet addresses | Yes |
| Organization administrator | A user who manages the organization, its wallets, members and public profile | Yes |
| Organization member | A user who acts for the organization within the permissions it grants | Optional (a single administrator is enough for a first run) |
| Institution profile | The public face of an organization (name, description, visibility, optionally the addresses it publishes). One record with the organization, not a second entity | Yes (small) |
| Obligation creator | The party that created the session; on-chain this is the session `creator` address | Yes |
| Obligation participant | An admitted address in a session (maximum four); on-chain a participant is an address, in the application it is shown as the organization that owns the address | Yes |
| Protocol or external entity | A contract address as a participant. The contract accepts account or contract addresses (`BadAddressKind` otherwise), but a contract participant must itself be able to authorize | UNVERIFIED and out of scope for MVP-1; treat every participant as an organization's wallet |

Roles required for MVP-1: **Organization administrator**, **Organization member** (optional), **Visitor** (unauthenticated read-only on public pages). Everything else in the table is a relationship, not a role.

## 3. On-chain roles (per session, derived from the contract)

| On-chain role | How a party gets it | Powers |
|---|---|---|
| Creator | `create_session` | Authorizes every join; is admitted automatically; has no other special power |
| Participant | `join_session` (needs the joiner and the creator) | Submit obligations as debtor, finalize, propose, approve |
| Debtor / creditor | Named in an obligation | A debtor authorizes its obligation submission and, later, its own settlement transfers. A creditor's consent is its approval of the proposal |
| Proposer | `propose_settlement` | Any participant; no special status |
| Caller of `settle` | anyone | Submits; carries no authority |

## 4. Permissions matrix

Legend: **A** app permission only (no chain effect); **C** requires wallet authorization on-chain; **A+C** both; **–** not permitted; **n/a** not applicable or not supported by the protocol. "Org admin" and "Org member" act for their organization; "Org member" rights shown are the recommended defaults.

| Capability | Visitor | Org member | Org admin | On-chain authorization | Notes |
|---|---|---|---|---|---|
| Create an organization | A (sign-in first) | – | A | none | The creator becomes the first administrator |
| Join an organization | – | A (by invitation, accepted) | A | none | Membership is an application record |
| Administer an organization (profile, wallets, members, visibility) | – | – | A | none | Adding a wallet address needs proof of control (a signature), which is an off-chain check |
| Create an obligation set (a session) | – | A+C (if permitted) | A+C | `create_session`: creator signs | The wallet signing is the real act |
| Edit an obligation | – | n/a | n/a | not supported | Obligations are permanent once submitted; a draft before submission can be edited in the application only |
| Publish (submit) an obligation | – | A+C (if permitted) | A+C | `submit_obligation`: the debtor signs | Only a session participant can be debtor or creditor |
| Invite a participant | – | A | A | none until admission | An invitation is an application record |
| Accept or reject an invitation | – | A+C to accept | A+C to accept | `join_session`: the joiner **and** the creator sign | Rejecting is application-only; the contract has no rejection |
| Cancel or close a session or obligation | – | n/a | n/a | not supported | A session may stall forever; the UI can mark it "abandoned" as an application note only, never as a protocol state |
| Initiate netting (freeze, propose) | – | A+C (if permitted) | A+C | `finalize_obligations` / `propose_settlement`: any admitted participant | The freeze is final for that session |
| Approve a settlement | – | A+C (if permitted) | A+C | `approve_settlement`: the participant signs the current digest | An approval is not a debit authorization |
| Authorize settlement transfers | – | A+C (if permitted) | A+C | `settle`: each debtor signs its own transfers | |
| Submit `settle` | – | A+C | A+C | anyone may submit; carries no authority | |
| View public information (institution profiles, public session pages) | A | A | A | none | All session data is public on the ledger; application visibility only controls what the app shows |
| View private information (organization settings, members, drafts, invitations, notifications) | – | A (own org) | A (own org) | none | |
| Mint test tokens | – | – | A+C (administrators only, governed token) | `mint`: the token minter (the administrative multisig for the governed Testnet token) signs | Not an organization power: it needs the project's multisig, so it is a test-environment function, not a product feature |

"If permitted" means the organization administrator controls whether members may initiate wallet actions. Recommended default for MVP-1: members can prepare and view; only administrators (or members the administrator explicitly allows) can send actions to a wallet for signing.

## 5. Rules the application must enforce

1. Never present an application permission as on-chain authority, and never imply that a signature was given when it was not.
2. Every wallet action shows the exact call, the accounts that must authorize it and what is irreversible, before the wallet is invoked.
3. An organization record cannot be used to "approve for" another organization; approvals come only from the participant's own wallet.
4. The application holds no private keys (A6 in the product definition).
5. Role changes and wallet additions are recorded in the activity history.

## 6. Gaps

Identity, organizations, roles, invitations, wallet linking and proof of control are all NOT IMPLEMENTED. The matrix above is PROPOSED except the on-chain column, which is IMPLEMENTED and verified against the contract source.
