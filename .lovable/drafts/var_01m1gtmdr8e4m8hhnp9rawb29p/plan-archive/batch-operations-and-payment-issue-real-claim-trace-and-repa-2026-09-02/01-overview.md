# Batch Operations and Payment Issue — real-claim trace and repair

I traced the live data from entitlement through to payment issue. The chain is
broken in three places, and no benefit payment has ever reached the cheque
tables.

What the live data shows right now:

- 22 entitlements, 19 awards, 17 schedule rows (15 DUE)
- 17 payable instructions — 15 READY, 2 SCHEDULED (in a batch)
- 9 payment batches — 7 completely empty, 2 with one item each
- both batch items sit at FAILED_VALIDATION with the reason "Missing claim number"
- 0 issue records, 0 cheques issued

So batches can be created and payables can be added, but no batch has ever been
able to pass validation, which means Approve, Release and Issue have never run.

## The three defects

**1. Payables carry no claim number, period or beneficiary.**
Every one of the 17 instructions has a claim id but a blank beneficiary name,
blank period start/end and blank office code. On top of that, when payables are
added to a batch the code copies a `claim_number` field from the instruction —
that field does not exist on the payables table (the claim is held as a claim
id). The batch item therefore always gets a blank claim number, and batch
validation always rejects it. This is the single reason both existing batches
are stuck.

**2. Payment issue would fail on every record even if a batch got through.**
The issue step writes to the legacy cheque tables using modern field names
(ssn, amount, period start/end, issued by, status). The legacy tables use
entirely different fields (claim number, claim sequence, cheque number, cheque
item, payment amount, date of issue, date period start/end). Every write would
be rejected by the database. The survivor route also reads a survivor field
from the payables table that does not exist there.

**3. The back-link after a successful issue targets a non-existent field.**
After writing a cheque, the code stamps the cheque number onto the payable in a
column the payables table does not have, so the payable would silently never
move to "issued pending" — the money would be out with no trace on the claim.

A fourth, smaller mismatch: awards raise instructions with method "EFT" and
status "queued", while the batch screen only picks up "READY" payables and
matches methods named "CHEQUE"/"DIRECT_DEPOSIT". Those award-raised payables are
invisible to batching.
