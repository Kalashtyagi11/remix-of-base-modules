# Benefits workbench — honest "Open Payment Issue" guidance

## Problem

For claim `BN-20260903-07443` (status `IN_PAYMENT`, basket Payment Issue) the
workbench shows a success card with a primary button **"Open Payment Issue"**.
But the Payment Issue screen (`/bn/issue`) lists `bn_issue_record` rows, and
those are only created by `prepareIssueFromBatch` from a **released batch**.
This claim's payable (XCD 255.00, READY) is in **no batch**, so the button
sends the officer to a screen where their claim does not appear.

The workbasket assignment and the issue-screen visibility are two different
stages:

```
Payable READY ──> Batch (validate → approve → release) ──> prepareIssueFromBatch
                                                              │
                                              bn_issue_record rows ──> /bn/issue
```

Until the batch step runs, the correct next action is Payables Queue /
Batch Operations — not Payment Issue.

## Change (frontend guidance only, one file)

`src/components/bn/workbench/NextStepGuidance.tsx`, `IN_PAYMENT` branch:

1. Extend `fetchDownstream` to also fetch, for the claim's payable ids:
   - batch membership: `bn_batch_item` rows (and their batch status via
     `bn_payment_batch.status`) — not REMOVED items only
   - issue records: `bn_issue_record` rows for those instructions
2. Drive the guidance from that state:
   - **Payable not in any batch** → action tone: "Ready to batch for payment"
     with primary button **Open Payables Queue** (`/bn/payables`) and
     secondary **Open Batch Operations** (`/bn/batch`); body explains the
     payable must be batched, validated, approved and released before it
     appears in Payment Issue.
   - **Payable in a batch that is not yet RELEASED** → info tone naming the
     batch status; primary **Open Batch Operations**; no Payment Issue button.
   - **Issue record exists** → current success card with **Open Payment Issue**
     (button is then truthful).
3. No new routes, tables, RPCs or statuses. Read-only queries reuse existing
   tables the page already loads. No mutation, no database migration.

## Verification

- Typecheck + build.
- Reload the workbench for `BN-20260903-07443`: card should now say the
  payable must be batched first, with Payables Queue / Batch Operations
  buttons, and no "Open Payment Issue" button until a batch is released and
  issue prepared.
