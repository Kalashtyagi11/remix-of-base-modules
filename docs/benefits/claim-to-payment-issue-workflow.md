# Claim to Payment Issue — end-to-end workflow

How a claim travels from registration to a paid cheque/EFT, and exactly where the
**entitlement** and the **award** are created.

## 1. Assessment stages

| # | Status | Workbasket | What happens |
|---|--------|-----------|--------------|
| 1 | `DRAFT` | not queued | Claim captured; claimant, banking details and evidence entered |
| 2 | `SUBMITTED` / `INTAKE` | Intake Review | Registration validated; routed by the product's workflow template |
| 3 | `INTAKE_REVIEW` | Intake Review | Identity, coverage and duplicate-claim checks |
| 4 | `ELIGIBILITY_CHECK` | Eligibility | Contribution tests and qualifying conditions |
| 5 | `EVIDENCE_REVIEW` | Evidence | Required documents verified |
| 6 | `CALCULATION` | Calculation | Rate table + formula version produce the payable amount |
| 7 | `DECISION` | Decision | Approve or deny (maker-checker where the workflow requires it) |
| 8 | `APPROVED` | — | Post-approval orchestrator runs automatically |

Denied or withdrawn claims terminate here (`DENIED`, `WITHDRAWN`) and their queue
assignment is closed.

## 2. Entitlement and award — the two records people confuse

**Entitlement (`bn_entitlement`) — created at approval.**
Produced by the post-approval orchestrator the moment the claim reaches
`APPROVED`. It is the legal statement of *what is payable*: benefit rate,
effective start date, end date or duration, payment frequency, and the
beneficiary. Every approved claim gets one, lump sum or periodic.

**Award (`bn_award`) — created immediately after, for periodic benefits only.**
The award is the standing instrument a payment schedule hangs off. It is created
for pensions and other recurring benefits; the claim then moves
`APPROVED → AWARD_SETUP` and lands in the **Award Setup** basket.

**Lump sums have no award.** A one-off benefit goes straight from `APPROVED` to
`PAYMENT_QUEUE` with a single payment instruction.

If a periodic claim reaches Payment Preparation with no award, that is a defect —
use the *Create Award* repair action on the claim workbench.

## 3. Payment stages

| # | Status | Workbasket | What happens |
|---|--------|-----------|--------------|
| 9 | `AWARD_SETUP` | Award Setup | Award confirmed; **payment schedule** rows generated per period (`PROJECTED` / `DUE`) with claim number, frequency, period range and amount |
| 10 | `PAYMENT_QUEUE` | Payment Preparation | Due schedule rows are converted into **payment instructions** (`bn_payment_instruction`, status `READY`) |
| 11 | `PAYMENT_QUEUE` | Payment Preparation | **Batch operations**: open batch → add payables → validate → approve → release (maker-checker) |
| 12 | `IN_PAYMENT` | Payment Issue | "Begin Payment" hands the claim over to the issuing desk |
| 13 | `IN_PAYMENT` | Payment Issue | **Issue**: `bn_issue_record` written plus the legacy cheque row in `cl_cheques` (or EFT file); duplicate-payment guard blocks re-issue |
| 14 | — | Post-Issue Review | Void / reissue / reconcile; instruction marked `ISSUED` |

For a recurring award the cycle re-enters at step 10 for each new due period —
the claim is not re-assessed and does not return to Decision.

## 4. Holds and exits

- `PENDING_INFO` and `SUSPENDED` keep the claim in its **current** basket rather
  than un-routing it; work resumes in the same queue.
- `CLOSED`, `DENIED`, `WITHDRAWN` are terminal and close the active assignment.

## 5. Quick answers

- *When does the entitlement appear?* At approval, automatically.
- *When does the award appear?* Right after the entitlement, if the benefit is periodic.
- *Why is my claim in Payment Preparation and not Award Setup?* Because Award Setup
  is already done — the award exists and the schedule was generated.
- *Why did it move out of Payment Preparation after "Begin Payment"?* Preparation and
  issue are two different desks; `IN_PAYMENT` belongs to Payment Issue.
