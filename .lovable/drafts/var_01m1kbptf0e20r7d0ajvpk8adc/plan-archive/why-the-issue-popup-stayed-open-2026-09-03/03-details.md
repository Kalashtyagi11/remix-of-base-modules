## What I will change

All changes are in existing Benefits payment code — no new tables, no schema change.

### 1. Correct the legacy cheque write (`src/services/bn/batchOperationsService.ts`, `issueBatch`)

Map to the real `cl_cheques` columns:

| Written now | Correct column |
| --- | --- |
| `amount` | `payment_amount` |
| `payment_method` | `cheque_type` (`C` cheque / `D` direct deposit) |
| `period_start` / `period_end` | `date_period_start` / `date_period_end` |
| `issued_by` | `entered_by` (plus `date_entered`) |
| `issued_date` | `date_of_issue`, `cheque_date` |
| `status` | `cheque_status` |
| — (missing) | `cheque_number`, `claim_seq`, `cheque_item`, `batch_number` |

`cheque_number` comes from the number already assigned to the item in the cheque
register (`bn_cheque_register.cheque_number` for that batch item); for
EFT/direct-deposit items it falls back to the batch-derived reference. `claim_seq`
and `cheque_item` are mandatory, so they are derived from the item's sequence
number in the batch. The read-back uses `cheque_number`, not `cheque_no`.

The follow-up update on `bn_payment_instruction` drops the non-existent
`cl_cheque_no` field and records the reference in `payment_reference` instead,
keeping the status move to `ISSUED_PENDING`.

The register row for a successfully issued cheque is left as-is apart from being
linked; printing/dispatch state is not overwritten.

### 2. Make failures visible (`src/pages/bn/batch/BatchOperations.tsx`, `BatchDetailDrawer.tsx`)

- `ISSUE` returns `{ issued, failed }`. When `issued === 0 && failed > 0` the page
  shows an error toast naming the first failure reason instead of "completed".
  Partial results show a warning with the counts.
- On a fully successful issue the detail panel closes and the list refreshes; on
  failure it stays open, showing the per-item error already stored on the item so
  the operator can see why.
- The batch item table gains the failure reason for `ISSUE_FAILED` rows.

### Verification

Re-run Issue on `BN-HQ-20260903-162610` (1 item, XCD 255.00, cheque assigned,
printed, dispatched): the item should move to `ISSUED`, the batch to `ISSUED`,
`cl_cheques` should gain one row carrying the assigned cheque number, and the
panel should close. Then confirm a deliberately broken item surfaces a red error
and leaves the panel open.
