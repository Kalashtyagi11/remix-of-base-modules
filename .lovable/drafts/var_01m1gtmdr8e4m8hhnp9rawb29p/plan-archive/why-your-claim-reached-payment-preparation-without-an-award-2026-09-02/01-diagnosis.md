# Why your claim reached Payment Preparation without an Award

## What the data shows

Claim `BN-20260902-36729` (Assistance Pension, LONG_TERM, PERIODIC, monthly) — and every other recently approved claim — followed this path:

- Event log records `AWARD_CREATED`, `APPROVED → AWARD_SETUP`, then `AWARD_SETUP → PAYMENT_QUEUE → IN_PAYMENT`.
- The claim has **1 entitlement** and **0 awards**.

Across the whole database: **21 entitlements, 3 awards, 0 payment schedules**. All 3 awards are seed rows (`AWD-SEED-0001..0003`); not one award has ever been created by the application.

## Root cause

There are two award-creating functions and neither runs on the path your claims take.

1. `postApprovalOrchestrator` is what actually runs at approval. It creates `bn_entitlement`, sets the claim to `AWARD_SETUP`, and writes a `bn_claim_event` of type `AWARD_CREATED` — but it never inserts a row into `bn_award`. The event name is misleading: no award record is produced.
2. `createAwardOnApproval` (the only caller of which is `determinationService`) would insert the award, but it is gated on `product_version.benefit_duration_type = LONG_TERM` **and** `award_creation_rule = ON_APPROVAL`. Almost every product version in the database has `award_creation_rule = NONE` — including the Assistance Pension version on your claim. The call is also wrapped in a swallow-the-error `try/catch`, so a failure is invisible.
3. `createAwardFromApprovedClaim` in the payment boundary service does the right thing, but **has no call sites in the UI at all**.

So `AWARD_SETUP` is only a claim *status*; nothing populates the Awards register. By the time the claim reaches Payment Preparation there is an entitlement to pay from but no award to schedule against — which is exactly why payment-schedule generation failed on the mandatory `bn_award_id`.
