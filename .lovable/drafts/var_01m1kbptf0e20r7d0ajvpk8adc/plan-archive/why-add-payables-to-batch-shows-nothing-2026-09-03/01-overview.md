# Why "Add Payables to Batch" shows nothing

Checked the live data for claim `BN-20260903-07443`.

The payable does exist and is ready:

- Amount 255.00, type PERIODIC, status READY, not yet in any batch
- Payment method: **CHEQUE**
- Office: **not set (blank)**

Your batch `BN-HQ-20260903-155504` is:

- Method: **DIRECT_DEPOSIT**
- Office: **HQ**

The picker only lists payables whose method and office match the batch, so this
CHEQUE / no-office payable is filtered out. The screen is behaving correctly; the
mismatch is the real problem — and it is silent, which is why it looks broken.

Root cause upstream: the claim has no bank account recorded, so payment
preparation stamped the payable as CHEQUE, and no office was carried onto it.
