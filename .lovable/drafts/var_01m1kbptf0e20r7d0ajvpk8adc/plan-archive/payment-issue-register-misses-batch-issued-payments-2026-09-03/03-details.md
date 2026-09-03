## Which basket the claim belongs in

For claim BN-20260903-07443, once the register is repaired it appears as:

- **Payment Issue (/bn/issue)** — status `ISSUED`, cheque `FCB2000001`. This is
  where void, stop, stale-date and reissue are performed.
- **Post-Issue Review** — the reconciliation and closure basket (bank
  confirmation, entitlement update, claim closure). It works from issue records.
- **Payables Queue** — the instruction stays `ISSUED_PENDING` until post-issue
  review confirms the payment; it is no longer actionable there.
- **Batch Operations** — batch `BN-HQ-20260903-162610` moves to `ISSUED`.

It should not appear in the claim workbasket any more; the claim is `IN_PAYMENT`.

## What I will change

### 1. Batch Issue registers each payment

`src/services/bn/batchOperationsService.ts` — for every item it issues, insert
an issue record (batch, batch item, instruction, SSN, claim, beneficiary,
amount, currency, method, period, instruction type, target table) with status
`ISSUED`, the cheque number or direct-deposit reference, issued timestamp and
issuing user. The record is created immediately before the legacy cheque write
and marked `FAILED` with the error message if the write fails, so failed items
also show in Payment Issue instead of vanishing.

Existing duplicate prevention is reused, so the same SSN / claim / period /
amount cannot be registered twice.

### 2. Backfill the payment already made

One-off data repair: create the missing `ISSUED` issue record for
BN-20260903-07443 / cheque `FCB2000001`, linked to its batch item and
instruction, so the existing payment appears in Payment Issue and Post-Issue
Review. Nothing about the cheque or the claim is altered. I will confirm with
you before running this write, since it touches live data.

### 3. Verification

- Re-check that /bn/issue lists the claim as `ISSUED` with cheque `FCB2000001`.
- Issue a second batch item and confirm the register is written by the batch
  path automatically.
- Confirm Post-Issue Review can generate its tasks for the batch.

No schema change is required.
