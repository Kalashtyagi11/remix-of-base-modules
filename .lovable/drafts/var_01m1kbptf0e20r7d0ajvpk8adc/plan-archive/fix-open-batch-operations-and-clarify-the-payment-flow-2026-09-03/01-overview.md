# Fix "Open Batch Operations" and clarify the payment flow

## What is broken

The workbench next-step card navigates to `/bn/batch`, but the Batch Operations page is registered at `/bn/batches` (sidebar, dashboard and Award 360 all use `/bn/batches`). So the button lands on a route that does not exist and nothing opens. Two places in `NextStepGuidance.tsx` use the wrong path.

## What the actual flow is

The payment chain in the codebase is award intent first, then money movement:

Award → Payment Schedule (when the money is due) → Payable / Payment Instruction → Batch → Validate → Approve → Release → Prepare Issue → Payment Issue → Post-Issue Review.

So your reading is right: Payment Schedules comes before Batch Operations. Payables Queue sits between them — the schedule generates the payable instructions, and Batch Operations groups those payables. Batch Operations itself never comes first and should not be the entry point when a claim has no payable yet.
