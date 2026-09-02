# Fix: Generate Payment Schedule fails with a database error

## What is happening

Generating a payment schedule in Benefit Management always fails with
"null value in column bn_award_id ... violates not-null constraint".

The payment schedule table requires three values on every row that the
generator never produces:

- the **Award** the payments belong to (`bn_award_id`)
- the schedule period date (`schedule_period`)
- the gross amount (`gross_amount`)

The generator only sends the entitlement, claim, period start/end, due date
and net amount. Because the Award is missing, the very first row is rejected
and nothing is saved. The schedule table is currently empty, so this path has
never succeeded.

## Decisions confirmed

- An Award is **required**. It is resolved automatically from the claim behind
  the entitlement. If no active Award exists, generation is blocked with a
  clear message instead of a database error.
- The fix is applied to **every** schedule creation path, not just the wizard.
