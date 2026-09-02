## Technical detail

File: `src/services/bn/scheduleService.ts`
- In `generateScheduleRows`, both row literals (ONE_TIME branch and the recurring `while` loop) currently carry `modified_by: null, modified_at: null`. Change to `modified_by: performedBy, modified_at: <ISO now computed once per call>`.
- No change needed in `regenerateSchedule` / `generateArrearsRows` beyond inheriting the builder output; their `update` calls already set `modified_at`.
- No schema migration required — the column already has a `now()` default; the bug is the explicit null.

## Verification
- Run the schedule generation wizard for the entitlement in the screenshot (Monthly, 12 rows) and confirm rows are created without error.
- Confirm the new rows show Claim, Frequency, Period and Amount populated in the register grid.
- Run the existing schedule service tests.
