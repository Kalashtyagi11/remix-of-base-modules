# Why the Issue popup stayed open

The Issue action did run — it just failed silently.

Batch `BN-HQ-20260903-162610` (CHEQUE, RELEASED) shows in the database:

- `issue_started_at` and `issue_completed_at` both set at 11:38
- `issued_items = 0`, `issue_error_count = 1`
- its single item is `ISSUE_FAILED` with the error
  `Could not find the 'amount' column of 'cl_cheques' in the schema cache`

So the payment write into the legacy cheque table was rejected. The code catches
that per item, marks the item failed, and still returns normally, so the screen
showed a success toast, the batch stayed RELEASED, and the panel stayed open
with nothing changed.

Two separate defects:

1. **Wrong column mapping into the legacy cheque table.** The issue step writes
   `amount`, `payment_method`, `period_start`, `period_end`, `issued_by`,
   `issued_date`, `status` and reads back `cheque_no`. The real table has
   `payment_amount`, `cheque_type`, `date_period_start`, `date_period_end`,
   `entered_by`, `date_of_issue`, `cheque_status`, `cheque_number`,
   plus mandatory `claim_seq` and `cheque_item`. The follow-up write also sets
   `cl_cheque_no` on the payment instruction, a column that does not exist there.
2. **Failures are reported as success.** Zero issued with one failure still ends
   in "Batch action ISSUE completed", and the drawer gives no signal at all.
