# Claim BN-20260903-07443 — why it is not in the Payment basket

## What the data actually shows (checked live)

- Claim status: **AWARD_SETUP**; its active work queue assignment is the **Award Setup** basket.
- An entitlement exists (ACTIVE, monthly 255) and a **payment instruction already exists** (READY, XCD 255, cheque, due 03/09/2026). That is why the workbench shows "Payment instruction created — Open Payables Queue": the *money* is already in the Payables Queue.
- What has **not** happened is the *claim* moving on: the claim only leaves Award Setup when its status changes to PAYMENT_QUEUE.
- A governed transition already exists for exactly this: **AWARD_SETUP → PAYMENT_QUEUE, action "Send to Payment"**, allowed for Supervisor, Award Officer, Payment Officer, Finance Supervisor, Claims Officer, Admin. Once executed, existing routing sends the claim to the **Payment Preparation** basket.
- So no new button, status or table is needed in the backend. The gap is that this action is not visible where the officer is looking: the Award Setup card only offers "Open Payables Queue", and the Decision Actions card in your screenshot is showing the previous (Decision-stage) buttons rather than "Send to Payment".
- Two further facts worth acting on: **no `bn_award` row was created** for this claim (an AWARD_CREATED event was logged, but the award record is absent), and **20 claims are currently parked in the Award Setup basket** while only 2 sit in PAYMENT_QUEUE — the same discoverability gap at scale.
