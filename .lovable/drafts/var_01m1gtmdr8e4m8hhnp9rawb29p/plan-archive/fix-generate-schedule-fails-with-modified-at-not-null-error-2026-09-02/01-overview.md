# Fix: Generate Schedule fails with "modified_at" not-null error

## What happens now
On `/bn/schedules`, choosing an entitlement and clicking **Generate N Rows** fails with:
`null value in column "modified_at" of relation "bn_payment_schedule" violates not-null constraint`.

## Confirmed cause
The schedule row builder (`generateScheduleRows` in `src/services/bn/scheduleService.ts`) explicitly sets `modified_at: null` on every generated row (both the one-time branch and the recurring loop). The database column `bn_payment_schedule.modified_at` is NOT NULL with a `now()` default — an explicit `null` overrides the default and the insert is rejected. This affects initial generation, regeneration, and arrears generation, since all three use the same builder.

## Fix
- Stop writing `modified_at: null`: set it to the generation timestamp (same value used for `entered_at`/audit `now`), and set `modified_by` to the acting user instead of null.
- Apply this once in the shared builder so initial, regenerate, and arrears paths are all covered.
- Audit the other NOT NULL columns of the table (`bn_award_id`, `schedule_period`, `due_date`, `gross_amount`, `status`, `sequence_number`) to confirm each is populated on every insert path, so no second constraint failure appears after this one is cleared.
