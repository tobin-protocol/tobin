# Tobin: market and technical analysis

**Status:** market and differentiation analysis for the SCF Build Award (Open Track point 7, guidance), dated 2026-11-09. Business positioning the repository cannot support is left as owner input.
**Evidence basis:** external sources fetched on 2026-11-09 (listed in section 8, each with URL and date) and the repository (`README.md`, `contracts/clearing/src/lib.rs`, [PRD](prd.md)). No market size, competitor volume or pricing is stated, because none was sourced.

Source rule: every external claim carries a source number. Anything not sourced is marked **unverified** and does not feed the conclusions.

## 1. The problem in institutional payments

- Obligations between institutions can be settled gross (each on its own) or net. Sources describe the netting variants: bilateral net settlement (each pair settles its net), multilateral net settlement (each participant settles one net position), settlement netting (changes how obligations are discharged, not the obligations, and works for obligations with the same settlement date and currency), and close-out netting under master agreements on default [S2].
- Settlement risk is the risk that one side pays and does not receive the other leg; the CLS description names it Herstatt risk after the 1974 failure of Bankhaus Herstatt [S3].
- International standards for financial market infrastructure (payment systems, central securities depositories, securities settlement systems, central counterparties, trade repositories) are the Principles for financial market infrastructures [S1].

Tobin's own statement of the problem (fragmented obligations, manual reconciliation, weak approval structure, uncertainty between submission and confirmation) is in the [PRD](prd.md) and is a product claim, not a sourced market finding. The need among Stellar institutions is **unverified**.

## 2. Existing approaches

| Approach | What it does | Source |
|---|---|---|
| Bilateral and multilateral settlement netting | Reduces the number and size of payments settled between participants | [S2] |
| CLS (FX payment-versus-payment) | Settles both legs of matched FX instructions together when they pass risk tests; payments final and irrevocable; funding computed on a multilateral net basis per member | [S3] |
| CLS scale, as stated by CLS | On 20 June 2024: USD 19.1 trillion of instructions settled, USD 72 billion total funding, 0.38% of gross value. This is CLS's figure for FX, from a search summary of CLS material; **not independently checked** | [S3] |
| Central counterparties and other FMIs | Covered by the PFMI standards; provisions on netting and finality were not retrieved (the PDF was not readable by the fetch tool), so no statement about them is made here | [S1] |
| Stellar anchors and SEPs | Stellar supports deposits and withdrawals through anchors and defines SEPs such as SEP-24, SEP-31 and SEP-38 for interoperability | [S4] |
| Stellar-ecosystem settlement projects | One SCF submission found by search describes a Soroban escrow for delivery-versus-payment and does not mention netting. A search found no Stellar netting product or SDF announcement. Absence from one search is **not** proof that none exists | [S5] |

The CLS figure shows what multilateral netting achieved in one mature FX infrastructure. It says nothing about Stellar payment flows and is not evidence for Tobin.

## 3. Where Tobin differs (only what the code does)

| Aspect | What Tobin does | Evidence |
|---|---|---|
| Settlement venue | A Soroban contract validates a proposed plan and executes the transfers in one invocation; a failed transfer reverts it; checked arithmetic | `contracts/clearing/src/lib.rs:555-660` |
| Authorization | Each debtor authorizes its own transfer in the settlement call; join needs the joiner and the session creator; no operator key moves funds under the design | `lib.rs:287,332-333,384,631` |
| Plan validity | The contract accepts any plan meeting its rules (admitted parties, positive amounts, per-participant paid equals net debit, received equals net credit, ascending order); it does not demand the engine's output or a minimal plan | `README.md`; `lib.rs` `validate_plan` |
| Institutional workflow | Application layer with roles, reviewer separation of duties, approvals bound to one calculation, immutable batches | `apps/web-console/lib/registry/` |
| Verification | Outcomes read back by hash from RPC and Horizon and compared with the approved batch | `lib/stellar/compare.ts` |
| Ecosystem position | Sits above SEPs, defines no token, open source Apache-2.0 | `README.md` |

## 4. Where Tobin does not differ or is unproven

- It is not a central counterparty: it has no default fund, margin, collateral, default management or novation. Those ideas belong to the broader protocol design and are not on the roadmap.
- It does not provide payment-versus-payment across currencies in the sense of [S3]; a session settles one token.
- Netting benefit on Stellar flows: **unmeasured**. The only on-chain run settled 1 base unit between two accounts.
- Scale: contract ceilings of 4 participants, 16 obligations and 16 instructions are provisional constants; resource use unmeasured (gate P03).
- Institutional demand, adoption, partners, volumes: none in the repository.
- No independent review; same-author evidence; Testnet only.
- Multilateral netting among a small closed group is also possible off-chain with an operator; Tobin's claimed difference is the on-chain contract, split authorization and read-back verification. Whether institutions value that over an operated service is **untested**.

## 5. Value and to whom

Potential value, stated as potential (not demonstrated):

| Beneficiary | Potential value | Condition |
|---|---|---|
| Institutions with crossing obligations on Stellar | Lower gross settlement, one reviewed net result, explicit approval and verification trail | Flows are interconnected enough (unmeasured) and institutions adopt the workflow |
| Stellar ecosystem | An open-source reference for Soroban settlement with split authorization and read-back; more contract invocations if adopted | Adoption; see [on-chain growth](onchain-growth-and-metrics.md) |

## 6. Risks and open questions

Economic hypothesis unproven; thin institutional counterparties on Stellar may limit netting; operator trust in a single-instance application; regulatory exposure of participants; competition from off-chain netting services (no sourced competitor list); contract ceilings; no independent review.

## 7. Owner input

- `[OWNER INPUT NEEDED: named target segments and any evidence of demand, such as interviews or letters of intent]`
- `[OWNER INPUT NEEDED: pricing or sustainability model, if any]`
- `[OWNER INPUT NEEDED: go-to-market plan, first institutional contacts]`
- `[OWNER INPUT NEEDED: named comparable products the owner considers competitors, with sources]`
- `[OWNER INPUT NEEDED: any measured Stellar flow data supporting the interconnection hypothesis]`

## 8. Sources (all fetched or searched 2026-11-09)

| ID | Source | URL | Used for |
|---|---|---|---|
| S1 | BIS/CPMI-IOSCO, Principles for financial market infrastructures, publication page | https://www.bis.org/cpmi/publ/d101.htm | FMI types covered |
| S2 | Wikipedia, "Netting" (secondary source) | https://en.wikipedia.org/wiki/Netting | Netting definitions |
| S3 | CLS Group materials, found by web search (summary of CLS PDFs; CLS's own site returned 403 to the fetch tool) | https://www.cls-group.com/media/qxalffzp/clssettlement_overview_feb2022.pdf | PvP, Herstatt risk, multilateral net funding, 20 June 2024 figures (not independently checked) |
| S4 | Stellar developer documentation, apps overview | https://developers.stellar.org/docs/build/apps/overview | Anchors, SEPs |
| S5 | SCF submission found by web search | https://communityfund.stellar.org/submissions/recae8dUGgqW0mQbN | Example of a Stellar settlement project without netting (summary from search, page not read) |

Unverified and excluded from conclusions: the content of the PFMI netting and finality provisions; blog and vendor claims about Stellar institutional adoption returned by search; any market size.
