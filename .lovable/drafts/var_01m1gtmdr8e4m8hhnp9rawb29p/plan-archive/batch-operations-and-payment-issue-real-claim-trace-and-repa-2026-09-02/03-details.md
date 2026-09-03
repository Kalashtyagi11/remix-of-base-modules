## What I will change

### A. Make payables carry full context

`src/services/bn/postApprovalOrchestrator.ts` and
`src/services/bn/paymentBoundaryService.ts` — when a payable instruction is
raised (periodic first payment, lump sum, and the schedule-driven path),
populate `beneficiary_name`, `period_start`, `period_end`, `instruction_type`
and `office_code` alongside the existing fields. Align the schedule-driven path
with the rest: `status: 'READY'` (not `queued`) and a payment method drawn from
the same `CHEQUE` / `DIRECT_DEPOSIT` vocabulary the batch screen filters on
(bank account present → `DIRECT_DEPOSIT`).

### B. Fix batch item construction and validation

`src/services/bn/batchOperationsService.ts`, `addPayablesToBatch` — resolve the
claim through `bn_payment_instruction.claim_id → bn_claim.claim_number` (and
person name for `beneficiary_name`) instead of reading the non-existent
`p.claim_number`. Keep `period_start` / `period_end` from the instruction, and
fall back to `due_date` when the instruction predates change A.
`validateBatch` keeps its existing rules; the direct-deposit rule is tightened
to check `bank_account_snapshot` / `account_number` rather than beneficiary name.

### C. Fix the legacy cheque write

`src/services/bn/paymentIssueService.ts`, `writeToLegacyTable` — map to the real
legacy shape:

- `cl_cheques`: `claim_number`, `claim_seq`, `cheque_number`, `cheque_item`,
  `payment_amount`, `cheque_type`, `cheque_status`, `date_of_issue`,
  `date_period_start`, `date_period_end`, `batch_number`, `entered_by`,
  `date_entered`, `remarks`
- `cl_cheques_holding`: same plus its own `cheque_id` key and hold remarks
- `cl_cheques_survivor`: `survivor_number`, `claim_number`, `claim_seq`,
  `cheque_number`, `cheque_item`, `payment_amount`

`prepareIssueFromBatch` stops reading `instr.survivor_id` (no such column) and
resolves the survivor from the claim's participant/beneficiary record instead;
`hold_reason` is read from the instruction, which does have it.

Direct-deposit records are not written to `cl_cheques` with a fake cheque
number — they get a DD reference and are recorded on the issue record; the
cheque tables receive only cheque-method payments.

### D. Fix the post-issue back-link

The successful-issue update writes the reference to
`bn_payment_instruction.payment_reference` (existing column) and sets
`status: 'ISSUED_PENDING'`; the update error is checked and surfaced instead of
being swallowed, so a broken back-link can never look like a clean issue again.

### E. Data repair

- Backfill the 17 existing payables with beneficiary, period and office from
  their claim/entitlement.
- Re-derive `claim_number`, `beneficiary_name` and period on the 2 stuck batch
  items and reset them from `FAILED_VALIDATION` to `INCLUDED` so the batch can
  be re-validated.
- Cancel the 7 empty batches created by accident (no items, no financial effect).

## Verification

End-to-end on a real claim (`BN-20260902-36729`, XCD 255.00 monthly, READY):

1. Create a batch on `/bn/batch`, add the payable, confirm the item shows claim
   number, beneficiary, period and amount.
2. Validate → item VALIDATED, batch VALIDATED, no errors.
3. Approve as a second user (maker-checker), Release.
4. Prepare issue → one `bn_issue_record` routed to `cl_cheques`; confirm the
   duplicate check does not false-positive.
5. Execute issue → row lands in `cl_cheques` with a real cheque number, the
   batch item shows ISSUED, and the claim's payable shows the reference.
6. Re-run steps 4–5 on the same payable and confirm it is blocked as a duplicate.

I will report the trace with the actual ids and cheque number produced.
