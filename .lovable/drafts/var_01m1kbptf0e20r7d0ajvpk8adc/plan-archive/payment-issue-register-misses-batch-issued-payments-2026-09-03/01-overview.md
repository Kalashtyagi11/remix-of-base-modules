# Payment Issue register misses batch-issued payments

## What I checked (live data, claim BN-20260903-07443)

- The payment really was made: cheque `FCB2000001`, XCD 255.00, batch
  `BN-HQ-20260903-162610`, dated today in the legacy cheque register.
- The batch item is `ISSUED`, the payable instruction is `ISSUED_PENDING`
  with reference `FCB2000001`, and the claim is `IN_PAYMENT`.
- There is **no issue record** for this payment (zero rows for this claim/SSN).

## Why the claim is missing from Payment Issue

The Payment Issue screen, its counters, and the Post-Issue Review basket all
read one register: the issue-record table. Two paths can pay a claim:

- **Payment Issue path** — creates an issue record, then writes the cheque.
- **Batch Operations "Issue" path** — writes the cheque only. No issue record.

Because this payment was made from Batch Operations, nothing was registered, so
Payment Issue shows nothing and Post-Issue Review has nothing to work on.
This is a gap in the batch path, not a lost payment.
