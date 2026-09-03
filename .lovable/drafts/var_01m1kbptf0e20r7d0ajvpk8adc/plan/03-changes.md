## Changes

1. **Fix the dead link** — in `src/components/bn/workbench/NextStepGuidance.tsx`, change both `navigate('/bn/batch')` calls (lines ~438 and ~451) to `/bn/batches`, matching the registered route.

2. **Order the guidance to match the real flow** — when a claim is `IN_PAYMENT` with no payable yet, the primary action stays **Open Payables Queue** and the secondary becomes **Open Payment Schedules** (`/bn/schedules`) instead of Batch Operations, since batching is only meaningful once a payable exists. Once the payable is in a batch or released, the primary action becomes **Open Batch Operations** as it is today.

3. **Sidebar order** — reorder Benefit Payments so the menu reads the same as the pipeline: Entitlements → Payment Schedules → Payables Queue → Batch Operations → Payment Issue → Post-Issue Review (today Payables Queue is listed above Payment Schedules).

Frontend/navigation only — no database, RPC, or business-logic changes.
