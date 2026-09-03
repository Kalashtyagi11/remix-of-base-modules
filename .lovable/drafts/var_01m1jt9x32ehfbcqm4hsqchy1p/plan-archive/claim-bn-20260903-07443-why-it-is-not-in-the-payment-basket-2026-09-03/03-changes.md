## What I will change

1. **Award Setup card gets the real hand-off button.** In the claim workbench, the Award Setup step will show a **Send to Payment** button next to "Open Payables Queue". It executes the existing governed transition (AWARD_SETUP → PAYMENT_QUEUE), not a new one, so role permissions, audit and event logging stay exactly as configured today. If the user's role is not permitted, the button appears disabled with the reason.

2. **Show where the claim currently sits.** The card will state the current basket ("Award Setup") and the basket it will move to ("Payment Preparation"), so it is obvious the claim has not yet been handed over.

3. **Refresh after the hand-off.** After the action succeeds, the workbench header, decision actions, queue assignment and payables panels refresh, so stale Decision-stage buttons like the ones in your screenshot no longer linger.

4. **Missing award record.** Investigate why `bn_award` was not written for this claim even though the award event was logged, and create the award for this claim through the existing award-creation path. A payment schedule cannot be built without it.

5. **The other 19 stranded claims.** Once the button is in place, they can be moved individually by an authorised officer. I will not bulk-transition anyone's claims without your say-so.

## Technical notes

- Frontend: `src/pages/bn/claims/ClaimWorkbench.tsx` and `src/components/bn/workbench/NextStepGuidance.tsx`, reusing `useBnAvailableActions` / `useBnExecuteAction` from the existing decision engine.
- No new tables, no new transition rules, no changes to `bn_payment_instruction` or the Payables Queue service.
- Routing after the transition continues through `routeClaimAfterStatusChange` → `routeClaimToWorkbasket`, which already maps PAYMENT_QUEUE to the Payment Preparation basket.
- Award investigation touches `bn_award` for this one claim only; existing history is preserved.

## Open question

Should the hand-off stay **manual** (officer clicks Send to Payment), or should approval automatically push periodic claims straight to Payment Preparation? Manual is what the current configuration expects, so that is what this plan implements.
