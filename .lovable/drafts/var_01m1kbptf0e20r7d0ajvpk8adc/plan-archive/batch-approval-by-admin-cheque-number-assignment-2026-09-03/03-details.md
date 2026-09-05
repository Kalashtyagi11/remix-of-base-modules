## What I will change

### A. Admin exemption on batch approval

`src/services/bn/batchOperationsService.ts` — `approveBatch` keeps the
maker-checker rule for ordinary users, but skips it when the signed-in user is
an administrator, resolved server-side through the existing `is_admin` check
(the same one used elsewhere in Benefits configuration). The exemption is
recorded in the batch event log so the audit trail shows the approval was made
under the administrator exemption rather than silently bypassing the control.

Non-admin behaviour is unchanged: a normal maker still cannot approve their own
batch.

### B. Cheque book selection on the payment screen

- `src/components/bn/batch/PaymentExecutionPanel.tsx` — add a **Cheque Book**
  picker listing active cheque stock (bank account, series prefix, next number,
  remaining count). It defaults to the batch's bank account when set, otherwise
  to the only active book, otherwise the user chooses. Assigning cheques uses
  the selected book instead of guessing from the office code.
- The **Starting Number** field accepts digits only, shows the series prefix as
  a static adornment (`CHQ …`), and is validated before the call so a value like
  `Cheq-12345` is caught in the form with a clear message instead of surfacing as
  "no active cheque stock".
- When no active cheque stock exists at all, the panel says exactly that and
  links to Benefit Operations → Cheque Stock rather than showing the generic
  allocation error.

### C. Batches carry their bank account

- `src/services/bn/batchOperationsService.ts` — `createBatch` stores
  `bank_account_ref` when the create form supplies one; the create batch dialog
  gains an optional bank account field for cheque batches, sourced from the
  registered cheque stock accounts.
- Existing batches are not retro-edited; they simply use the on-screen picker.

### D. Clearer allocation errors

`src/services/bn/payment/chequeStockService.ts` — the allocation failure message
distinguishes the real causes: no active book for this account, requested start
below the next available number, or the range being too small for the number of
cheques required.

## Verification

On batch `BN-HQ-20260903-162610` (1 item, XCD 255.00, VALIDATED):

1. Approve as the admin that created it — succeeds, event log shows the
   administrator exemption.
2. Approve a second batch as a non-admin creator — still blocked.
3. Release, choose a cheque book, leave Starting Number blank — cheque number
   allocated from that book's next number, stock counters advance.
4. Repeat with `Cheq-12345` in Starting Number — rejected in the form with a
   "digits only" message, no allocation attempted.

No database schema change is required.
