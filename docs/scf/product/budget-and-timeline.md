# Tobin: budget framework and timeline

**Status:** budget framework for the SCF Build Award (Open Track) submission, dated 2026-11-09. It contains no cost figures; every amount is owner input.
**Evidence basis:** SCF handbook budget and deliverable guidelines (verified 2026-11-09) for the official rules; [roadmap](roadmap.md) for deliverable IDs.

## 1. Official rules (OFFICIAL, SCF handbook)

| Rule | Statement |
|---|---|
| Award size and duration | Up to USD 150,000 in XLM; typically 3 to 6 months, not over 6 |
| Eligible | Development costs |
| Ineligible | Audit costs (covered separately by the Audit Bank for eligible projects), marketing, legal fees, reimbursement of past work |
| Deliverables | Specific, verifiable, each with a cost |
| Tranches | OFFICIAL handbook structure: T0 10% on acceptance (no deliverable); T1 20% MVP; T2 30% Testnet or equivalent; T3 40% normally a Mainnet launch or equivalent. OUR PROPOSAL for this submission: T3 is the controlled institutional usage Testnet milestone (MVP-1.8, see the roadmap); Mainnet is not a deliverable. The handbook says the final tranche is normally a Mainnet launch and that jurisdiction-specific restrictions may modify this, for example a Testnet-only final tranche |
| Timing | Each tranche submitted within 90 calendar days of the previous payment or the balance is forfeited |

Scope (TEAM'S SCOPE): this submission is Stellar Testnet only; a Testnet-only final tranche relies on the handbook allowance above and is not an SCF decision. Mainnet is not a deliverable. Audit costs are outside this budget. Independent review is **planned** to be requested through the Audit Bank route; it has not been requested and no review has happened (roadmap D1.7-9).

## 2. Tranche table (the milestone column is OUR PROPOSAL)

Total requested: `[OWNER INPUT NEEDED: total requested in USD, not above 150,000]`

| Tranche | Official % | Amount | Milestone assigned (OUR PROPOSAL, see roadmap) |
|---|---|---|---|
| T0 | 10% | `[OWNER INPUT NEEDED: 10% of total]` | none (official) |
| T1 | 20% | `[OWNER INPUT NEEDED: 20% of total]` | MVP-1.6 |
| T2 | 30% | `[OWNER INPUT NEEDED: 30% of total]` | MVP-1.7 |
| T3 | 40% | `[OWNER INPUT NEEDED: 40% of total]` | MVP-1.8 controlled institutional usage (Testnet milestone) |

## 3. Deliverable cost table

Amounts cover development only. Past work (MVP-1.2 to MVP-1.5, wallet-first authentication, backend P0 to P2) is excluded.

| Deliverable | Tranche | Cost | Effort (person-weeks) |
|---|---|---|---|
| D1.6-1 Persist chain-confirmed outcomes | T1 | | |
| D1.6-2 Repeatable reconciliation | T1 | | |
| D1.6-3 Hosted settlement initiation path | T1 | | |
| D1.6-4 Backend gaps (aggregate reads, wallet linking, idempotency) | T1 | | |
| D1.6-5 Separate batch-reviewer rule | T1 | | |
| D1.6-6 Operational reporting views | T1 | | |
| D1.6-7 Measured resources and fees | T1 | | |
| D1.6-8 Second wallet and real-Freighter validation | T1 | | |
| D1.7-1 PostgreSQL store and migration | T2 | | |
| D1.7-2 Railway staging, backups, restore test | T2 | | |
| D1.7-3 Registration control, email verification, recovery | T2 | | |
| D1.7-4 Threat model and on-chain monitoring plan | T2 | | |
| D1.7-5 Fuzzing | T2 | | |
| D1.7-6 Hosted CI evidence | T2 | | |
| D1.7-7 Branch protection, dependency review | T2 | | |
| D1.7-8 Testnet signer governance | T2 | | |
| D1.7-9 Audit Bank request (effort only; audit cost excluded) | T2 | | |
| D1.7-10 Smart-contract open-source plan | T2 | | |
| D1.8-1 to D1.8-7 Controlled institutional pilot | T3 | | |

Cost cells: `[OWNER INPUT NEEDED: cost per deliverable; each tranche column must sum to the tranche amount]`

## 4. Team and timeline fields

| Field | Value |
|---|---|
| Team size | `[OWNER INPUT NEEDED: number of people and roles funded]` |
| Rate basis | `[OWNER INPUT NEEDED: hourly or monthly rates, currency]` |
| Start date | `[OWNER INPUT NEEDED: planned start]` |
| Duration | `[OWNER INPUT NEEDED: total months, not over 6]` |
| Per-milestone duration | `[OWNER INPUT NEEDED: weeks per milestone]` |
| Infrastructure costs | `[OWNER INPUT NEEDED: hosting, RPC, database, if funded]` |

Timing rule (OFFICIAL): submit each tranche within 90 calendar days of the previous payment. The timeline must fit this; the owner should state how milestone durations meet it. Open risk from the roadmap: MVP-1.8 depends on conditions outside this budget (named participating institutions, independent security review), so T3 timing is uncertain.
