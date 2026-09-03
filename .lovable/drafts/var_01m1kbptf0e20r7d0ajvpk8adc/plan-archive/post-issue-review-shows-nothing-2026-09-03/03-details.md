## The fix

**1. Create the checklist automatically at issue time**
When a batch is issued and each payment's issue record reaches `ISSUED`, generate its post-issue tasks in the same step. The same call is added to the single-payment issue path, so both routes behave identically. Generation becomes idempotent: re-issuing or re-running never duplicates tasks for an issue record that already has them.

**2. Manual generate / repair action on the screen**
Add a "Generate tasks" action to Post-Issue Review that builds the checklist for any issued payment that is missing one. This covers records issued before the automatic step existed and gives operators a recovery path without needing support.

**3. Helpful empty state**
Instead of a blank list, show why it is empty: no payments issued yet, versus issued payments with no checklist generated (with the generate action inline).

**4. Backfill the existing payments**
Generate the checklist for the 4 payments already recorded as issued, including BN-20260903-07443, so the screen has real work in it immediately.

## Technical notes

- `generatePostIssueTasks(batchId, userCode)` in `postIssueService.ts` already builds tasks from `bn_issue_record` + instruction + entitlement context; it is only missing callers. Add an idempotency guard (skip issue records that already have `bn_post_issue_task` rows) and allow generation scoped to a single issue record, not only a whole batch.
- Call it from `issueBatch` in `batchOperationsService.ts` after the issue record flips to `ISSUED`, and from the single issue path in `paymentIssueService.ts`. Failures there are logged and surfaced, never allowed to roll back an issued payment.
- Post-Issue Review keeps reading `bn_post_issue_task` unfiltered; add a batch filter option and wire the existing `useGeneratePostIssueTasks` hook to the new button.
- Backfill is a data-only operation over the 4 existing `ISSUED` records, run through the same generation logic.
- No schema change is required — `bn_post_issue_task` already exists.
