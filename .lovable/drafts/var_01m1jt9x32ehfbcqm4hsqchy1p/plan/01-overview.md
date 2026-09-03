# Why BN-20260903-07443 was approved with a mandatory document outstanding

## What I confirmed in live data

- The product does carry a blocking requirement: `DOC-002 Birth Certificated`, level `MANDATORY`, `blocks_decision = true`, stage `EVIDENCE`.
- The claim's checklist row for it is still `OUTSTANDING`, `is_blocking = true` — it was never satisfied or waived.
- The claim history shows: `CLAIM_SUBMITTED` → `SUBMITTED_FOR_DECISION` → award created from `APPROVED` → `AWARD_SETUP` → `PAYMENT_QUEUE` → `IN_PAYMENT`. There is **no** `STATUS_CHANGE_APPROVE` event, which is the signature of the guarded approval path.
- The transition matrix is configured correctly: `DECISION → APPROVED (APPROVE)` has `requires_evidence_complete = true`.

## Root cause

There are three approval entry points, and only two of them enforce the document gate.

| Entry point | Enforces mandatory documents? |
|---|---|
| Claim Workbench action runner (`APPROVE`) | Yes — calls `checkApprovalPreconditions` |
| Approval Console | Yes — calls `checkApprovalPreconditions` |
| **Workbench "Approve" button in Next Step Guidance → `approveClaim`** | **No — no precondition check at all** |

The button the officer used calls `approveClaim` in the post-approval orchestrator. It resolves the approval level, writes the decision, sets the claim to `APPROVED`, and immediately orchestrates entitlement + payable. It never reads the evidence checklist, so the outstanding Birth Certificate never stopped it, and the claim carried straight through to payment.

A second, related hole: even the rule-driven `executeTransition` re-checks roles and status at execution time, but does **not** re-check `requires_evidence_complete` / `requires_eligibility_pass` / `requires_calculation` — those are only used to grey out buttons. Anything that reaches execution by another route slips past them.
