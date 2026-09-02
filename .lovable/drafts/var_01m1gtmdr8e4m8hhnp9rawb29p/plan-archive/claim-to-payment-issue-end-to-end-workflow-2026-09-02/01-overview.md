# Claim to Payment Issue — end-to-end workflow

This documents the actual path a claim takes in the current system, and the exact points where an **entitlement** and an **award** are created. Nothing here changes behaviour; the deliverable is a reference document (and diagram) added under the Benefits docs.

## The stages

| # | Status | Where it sits | What happens |
|---|---|---|---|
| 1 | DRAFT | not queued | Claim captured, banking + evidence entered |
| 2 | SUBMITTED / INTAKE | Intake Review | Registration validated, routed by product workflow |
| 3 | INTAKE_REVIEW | Intake Review | Identity, coverage, duplicate checks |
| 4 | ELIGIBILITY_CHECK | Eligibility | Contribution and qualifying-condition tests |
| 5 | EVIDENCE_REVIEW | Evidence | Required documents verified |
| 6 | CALCULATION | Calculation | Rate table + formula produce the payable amount |
| 7 | DECISION | Decision | Approve or deny (maker-checker where configured) |
| 8 | APPROVED | — | Post-approval orchestrator runs automatically |

## Where entitlement and award appear

- **Entitlement (`bn_entitlement`) is created at approval**, by the post-approval orchestrator. It records *what is payable*: benefit rate, start date, end date/duration, frequency, beneficiary. Every claim that is approved gets one — lump sum or periodic.
- **Award (`bn_award`) is created immediately after the entitlement, for periodic benefits only** (pensions, ongoing assistance). It is the standing instrument that a payment schedule hangs off; status moves `APPROVED → AWARD_SETUP` and the claim lands in the Award Setup basket.
- A **lump-sum** benefit has no award; it goes straight from APPROVED to PAYMENT_QUEUE with a single instruction.

## From award to money

| # | Status | Basket | What happens |
|---|---|---|---|
| 9 | AWARD_SETUP | Award Setup | Award confirmed; **payment schedule** rows generated per period (PROJECTED / DUE) |
| 10 | PAYMENT_QUEUE | Payment Preparation | Due schedule rows become **payment instructions** (READY) |
| 11 | — | Payment Preparation | **Batch operations**: open batch → add payables → validate → approve → release (maker-checker) |
| 12 | IN_PAYMENT | Payment Issue | "Begin Payment" hands over to the issuing desk |
| 13 | — | Payment Issue | **Issue**: cheque/EFT records written (`bn_issue_record`, legacy `cl_cheques`), duplicate guard applies |
| 14 | — | Post-Issue Review | Void / reissue / reconcile; instruction marked ISSUED |

For a recurring award, the next due schedule period re-enters at step 10 each cycle — the claim does not go back through decision.
