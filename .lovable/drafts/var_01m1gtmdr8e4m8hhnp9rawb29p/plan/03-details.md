## Technical detail

**Award resolution helper** (`src/services/bn/scheduleService.ts`)

- Add `resolveAwardIdForEntitlement(entitlementId)`: reads
  `bn_entitlement.claim_id`, then the active `bn_award` for that
  `bn_claim_id` (most recent if several). Throws a business-worded error
  when none exists ("No active Award exists for this entitlement — approve
  the Award before generating a payment schedule").

**Row completion**

- Extend `GenerateScheduleParams` with `awardId`, and have
  `generateScheduleRows` emit `bn_award_id`, `schedule_period`
  (= `period_start`) and `gross_amount` (= row `amount`) on every row,
  including the `ONE_TIME` branch. Update `BnPaymentScheduleRow` typing
  accordingly.

**Call sites updated to resolve the award first**

- `src/components/bn/schedule/ScheduleGenerationWizard.tsx` — resolve the
  award when an entitlement is selected; show an inline warning and disable
  the Generate button when there is none, so the failure is caught before
  the insert.
- `scheduleService.regenerateSchedule` and `generateArrearsRows` — resolve
  and pass the award id.
- `src/pages/bn/awards/award-360/tabs/AwardScheduleTab.tsx` — pass the award
  already in context rather than re-resolving.

**Verification**

- Generate a 12-row schedule for an entitlement whose claim has an active
  award and confirm the rows persist with award, period and gross set.
- Select an entitlement with no award and confirm the wizard blocks with the
  business message instead of a database error.
- Add a unit test asserting `generateScheduleRows` never emits a row with a
  missing award id, schedule period or gross amount.

No database schema change is needed — the fix is entirely in the generation
code.
