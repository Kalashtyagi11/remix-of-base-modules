## Proposed fix

Make the Award a real record on the approval path, and give operations a way to repair claims already past that point.

1. **Create the award in the orchestrator.** In `postApprovalOrchestrator`, when routing resolves to `AWARD_SETUP`, call the existing `createAwardFromApprovedClaim` (payment boundary service) before writing the `AWARD_CREATED` event, and link the resulting award id onto the entitlement. Keep it idempotent — it already reuses an existing ACTIVE award.
2. **Stop the silent skip.** Remove the gating mismatch: award creation should follow the same periodic/long-term decision the orchestrator already made, not a second `award_creation_rule = ON_APPROVAL` flag that is `NONE` on nearly every product version. Surface failures instead of `console.warn`.
3. **Repair action for existing claims.** Add a governed "Create Award" action on the claim workbench for approved claims that have an entitlement but no award, so `BN-20260902-36729` and the other in-flight claims can proceed without re-approval.
4. **Backfill.** One-off pass creating awards for the existing approved/AWARD_SETUP/PAYMENT_QUEUE/IN_PAYMENT claims that have an entitlement and no award, so Payment Preparation and schedule generation work for the current book.

### Technical notes

- Award creation stays in `paymentBoundaryService.createAwardFromApprovedClaim`; `awardCreationService.createAwardOnApproval` is folded into it or reduced to a thin wrapper so there is one path, not two.
- `createAwardOnApproval` currently requires `claim.status === 'APPROVED'`; called from the orchestrator after the status flips to `AWARD_SETUP` it would bail with `CLAIM_NOT_APPROVED`, so the status guard must accept the post-approval statuses.
- Backfill runs as data-only inserts against `bn_award`; no schema change is required — `bn_award`, `bn_payment_schedule` and their columns already exist.
