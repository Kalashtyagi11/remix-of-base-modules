# Why Payment Schedule Management shows blank Claim, Frequency, Period and Amount

## What the data shows

Every row currently in the payment schedule table was created by the award/backfill
path, not by the schedule generator. Those rows carry only:

- award, schedule period, due date, gross amount, SSN, sequence number
- status `PENDING`, mode `INITIAL`

and leave these columns empty on all 16 rows:

- `claim_number` — null
- `frequency` — null
- `period_start` / `period_end` — null
- `amount` — null
- `entitlement_id` — null

The grid renders exactly those columns, so it correctly shows `—`, an empty
frequency chip, "Invalid — Invalid" for the period, and `—` for amount.

## Root cause

`createScheduleFromAward` in `src/services/bn/paymentBoundaryService.ts` inserts
only the columns the database marks NOT NULL. It never writes the display /
context columns that the schedule module owns. The richer generator
(`generateScheduleRows` in `scheduleService.ts`) does populate them, but it is
not the path that produced these rows.

Second, smaller issue: this insert uses `status: 'PENDING'`, which is not part of
the schedule module vocabulary (`PROJECTED`, `DUE`, `GENERATED`, ...). Those rows
therefore fall outside the metric cards, the status filter and every row action —
they are visible but inert.
