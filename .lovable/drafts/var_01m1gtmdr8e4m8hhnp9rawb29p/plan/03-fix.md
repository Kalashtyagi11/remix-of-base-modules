## Proposed fix

1. **Make the award path write complete rows.** In
   `createScheduleFromAward` (`src/services/bn/paymentBoundaryService.ts`),
   read the award's claim and entitlement context and populate the module's
   own columns on insert: `claim_id`, `claim_number`, `entitlement_id`,
   `frequency`, `period_start`, `period_end`, `amount`, `currency`,
   `rate_weekly` / `rate_monthly` / `rate_applied`, `generation_mode`.
   Keep `bn_award_id`, `schedule_period`, `due_date`, `gross_amount` as they are.

2. **Use the module's status vocabulary.** Insert `PROJECTED` (or `DUE` when the
   due date has passed) instead of `PENDING`, so the metric cards, status filter
   and row actions apply to these rows. Where `PENDING` is read downstream
   (`createInstructionsFromDueSchedule`), accept the new statuses too so nothing
   in the payables path breaks.

3. **Prefer the real generator for periodic awards.** When the award's benefit is
   periodic, generate the full run through `generateScheduleRows` rather than a
   single placeholder row, so Payment Schedule Management shows the actual
   pension schedule instead of one row.

4. **Repair the existing 16 rows.** One-off data pass backfilling
   `claim_number`, `entitlement_id`, `frequency`, `period_start`, `period_end`,
   `amount` and status from each row's award/claim/entitlement, so the current
   screen becomes readable without regenerating.

### Technical notes

- No schema change: every column involved already exists on
  `bn_payment_schedule` and is nullable.
- `fetchScheduleRows` already joins `bn_entitlement` and `bn_claim`; once
  `entitlement_id` / `claim_id` are set, the benefit name, claim status and
  entitlement balance also start resolving in the row drawer.
- Verification: reload `/bn/schedules` and confirm claim number, frequency,
  period range and amount render on every row, the metric cards count them,
  and the status filter returns them.
