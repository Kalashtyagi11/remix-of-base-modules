## Proposed work

1. **Establish why the re-route declined for this claim.** Make the routing outcome
   visible instead of console-only: record the outcome and reason on the claim event
   already written for every status change. This is the first step, and it turns the
   next occurrence into something readable from the claim timeline rather than a
   browser console.

2. **Correct the guidance card for In Payment.** When the claim is `IN_PAYMENT`, the
   card should say the claim is with the **Payment Issue** desk and offer *Open Payment
   Issue* as the primary action, with *Open Payables Queue* secondary. Today it repeats
   the Payment Preparation message.

3. **Show and repair a basket that disagrees with the status.** When the claim's active
   basket is not one the current status expects, the workbench shows a short warning and
   a **Move to the correct basket** action that re-runs the existing routing service.
   No new rule or status — it re-runs the same routing that Begin Payment triggers.
   This fixes BN-20260903-07443 and the two `PAYMENT_QUEUE` claims sitting in Payment
   Issue, one claim at a time, by an authorised officer.

4. **Verify.** Re-run the repair for BN-20260903-07443, then confirm its active
   assignment is Payment Issue and that the claim disappears from Payment Preparation
   and appears in the Payment Issue basket.

### Technical notes

- Routing entry point stays `routeClaimToWorkbasket` / `routeClaimAfterStatusChange`;
  `claimStatusStepMap` already maps `IN_PAYMENT → PAYMENT_ISSUE` and
  `stageBasketExpectation` already prefers `BN_PAYMENT_ISSUE` for that stage. No change
  to either map is planned.
- Outcome recording: `src/services/bn/decisionEngine.ts` (`executeTransition`) writes the
  returned outcome/reason into the existing `bn_claim_event.metadata`.
- UI: `src/components/bn/workbench/NextStepGuidance.tsx` — `IN_PAYMENT` branch plus the
  mismatch warning and repair action.
- Tables: read-only against `bn_claim`, `bn_workbasket`, `bn_workflow_template`;
  `bn_claim_queue_assignment` is written only by the existing routing service.
  No schema change, no migration, no bulk data repair.
