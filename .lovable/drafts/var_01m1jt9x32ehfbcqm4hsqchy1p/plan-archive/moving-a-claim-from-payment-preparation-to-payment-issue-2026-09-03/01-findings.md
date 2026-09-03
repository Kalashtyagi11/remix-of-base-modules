# Moving a claim from Payment Preparation to Payment Issue

## How it is meant to work

Preparation and issue are two different desks. **Begin Payment** is the hand-off: it
moves the claim status `PAYMENT_QUEUE → IN_PAYMENT`, and the routing service then
re-assigns the claim from the **Payment Preparation** basket to the **Payment Issue**
basket. There is no separate button to press for the basket move — it is automatic.

After that, the next steps for the officer are in **Payment Issue**: generate the
cheque / EFT instrument, then Post-Issue Review (void, reissue, reconcile).

## What the live data shows for BN-20260903-07443 (checked)

- Claim status is **IN_PAYMENT** (Begin Payment was recorded at 08:42 as
  `PAYMENT_QUEUE → IN_PAYMENT`).
- Its only active queue assignment is still **Payment Preparation** (assigned 08:38,
  never closed). So status and basket disagree for this one claim.
- Routing itself is working generally: **6 other IN_PAYMENT claims are correctly sitting
  in Payment Issue**, and both baskets exist and are active (`BN_PAYMENT_PREPARATION`,
  `BN_PAYMENT_ISSUE`, both staffed by `BN_PAYMENT_OFFICER`).
- The re-route call after a status change is deliberately non-blocking — when it fails
  or declines it only writes a browser console warning, so nothing in the UI or the
  claim timeline records that the basket move did not happen. That is why this went
  unnoticed. The exact reason it declined for this claim is **not yet established** and
  is the first step of the work below.
- Two `PAYMENT_QUEUE` claims currently sit in Payment Issue — the same disagreement in
  the other direction, so this is not a one-off.
- The guidance card also still reads "Claim is in the Payment Preparation basket" while
  the claim is In Payment, because that card treats `IN_PAYMENT` the same as
  `PAYMENT_QUEUE`.
