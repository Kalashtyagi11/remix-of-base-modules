# Batch approval by Admin + cheque number assignment

Two separate defects, both confirmed against the live code and data.

## 1. Admin cannot approve a payment batch

Batch approval currently blocks the approver whenever the batch was created by
the same user code, with no exception for administrators:

> Batch cannot be approved by creator (maker-checker)

That is why approval works as `benefits.payment@mishainfotech.com` (a different
maker) but fails from the admin account that created the batch. The platform's
own maker-checker rule already states that administrators are exempt and can
always act on their own records — payment batches never got that exemption.

## 2. "No active cheque stock can satisfy this allocation"

Two causes, both real:

- **The batch has no bank account.** Batches are created without a bank account
  reference, so the cheque screen falls back to the office code (`HQ`). The
  registered cheque books are held against real bank accounts —
  `RBC-OPS-001`, `FCB-OPS-001`, `SKNANB-OPS-001` and one other — so nothing ever
  matches `HQ` and every allocation fails.
- **The Starting Number field accepts text.** `Cheq-12345` was typed in; it is
  read as a number, becomes "not a number", and no cheque book can satisfy it.
  The prefix (e.g. `CHQ`) comes from the cheque book itself — the field expects
  only the numeric part.
