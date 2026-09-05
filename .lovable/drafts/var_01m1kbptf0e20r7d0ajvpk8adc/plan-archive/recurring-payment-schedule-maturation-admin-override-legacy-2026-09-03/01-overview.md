# Recurring Payment Schedule Maturation, Admin Override, Legacy Row Reconciliation

Three related fixes so that a recurring pension award keeps paying month after month, administrators are never blocked by a role gate, and the existing test claim's history is correct.

## 1. Automatic daily maturation of schedule rows

Today a generated schedule sits at PROJECTED forever: nothing marks a row DUE when its date arrives, and the "Generate Instruction" action only changes a status label without ever creating a payable. That is why only the first period of BN-20260903-07443 was paid.

What changes:

- A daily server job runs each morning and, for every active award, promotes schedule rows whose due date has arrived from PROJECTED to DUE.
- The same job then creates the payment instruction (payable) for each DUE row, using the claimant's payment profile — bank details where present, cheque otherwise — and links the instruction back to the schedule row, which becomes GENERATED.
- Rows that are SUSPENDED, SKIPPED, CANCELLED, or whose award/entitlement is not active are skipped and reported, never paid.
- Every generated payable lands in the existing Payables Queue and flows through the existing Batch → Validate → Approve → Release → Issue path. No new payment path is created.
- The Payment Schedules screen shows the maturation outcome per row (matured, generated, skipped with reason) and offers a manual "Run maturation now" action for supervisors/admins so the cycle can be tested without waiting a day.

The job is idempotent: running it twice on the same day produces no duplicate payables.

## 2. Administrators get full privilege

Menu visibility already bypasses permissions for administrators, but the Benefits action gates compare against hardcoded role name lists, so an administrator whose role is `Admin` fails checks written for `ADMIN`, `MANAGER`, etc.

What changes:

- A single server-verified administrator check is used by every Benefits action gate (schedules, payables, entitlements, batches, claim workbench, approvals).
- When the signed-in user is an administrator, every Benefits action is permitted, including approving or releasing something they created themselves.
- Every administrator override is written to the audit trail with the acting user, action, and record, so the bypass is visible and reviewable.

## 3. Claim closure question — no code change

A recurring pension claim must stay IN_PAYMENT while the award is ACTIVE and future periods remain. Closure belongs at award termination (death, medical review failure, age transfer, entitlement exhausted, or the final scheduled period paid). The CLAIM_CLOSURE task in Post-Issue Review is for one-off/lump-sum or final payments. Nothing in the closure rules changes; this plan just makes the remaining periods actually pay so the claim reaches its natural end.

## 4. Legacy row reconciliation for BN-20260903-07443

The claim has one stray legacy PENDING schedule row plus four generated monthly rows. The already-issued cheque FCB2000001 (255.00) is linked to no row at all.

- The legacy row is linked to the issued instruction and marked as paid/generated, recording that it corresponds to the September period.
- The four projected rows stay as future periods and will mature through the new job (September's is already due, so it will be reconciled rather than double-paid — the maturation job skips a period that already has an issued instruction).
- This is a one-off data correction on this claim only; no historical payment record is altered or deleted.
