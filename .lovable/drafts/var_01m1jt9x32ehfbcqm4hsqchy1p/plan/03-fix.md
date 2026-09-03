## Proposed fix

1. **Guard the hand-off in the action layer** — when a claim is in Award Setup and has no award record, mark the Send to Payment action as blocked with the reason "Award record must be created first". It then renders in the blocked list of Decision Actions (that panel already supports blocked actions with a reason), instead of appearing as a live green button.

2. **Server-side guard** — add an award-existence check to the governed Award Setup → Payment Queue transition so the same rule holds if the transition is invoked outside the UI. This is a guard on the existing rule, not a new rule or status.

3. **No contradiction between panels** — with (1) in place, the guidance banner ("Create Award") and Decision Actions agree: create the award, then Send to Payment becomes available.

Nothing is changed for this claim's data. After the fix, the correct operator sequence for BN-20260903-07443 is: **Create Award → Send to Payment**.

### Technical notes

- Action availability: `useBnAvailableActions` / the transition-action builder feeding `src/components/bn/claim/ClaimDecisionPanel.tsx` (blocked + blockedReason already supported).
- Guidance banner: `src/components/bn/workbench/NextStepGuidance.tsx` — already correct, unchanged.
- Server guard: additive check inside the existing governed transition execution for `AWARD_SETUP → PAYMENT_QUEUE` (rule `a0346375-…`), verifying a `bn_award` row for the claim. Staged as an additive migration; it applies when the draft is accepted.
- Tables read only: `bn_claim`, `bn_award`, `bn_entitlement`, `bn_claim_queue_assignment`, `bn_claim_transition_rule`. No schema change to any of them.
