# Correct stale basket guidance without forced movement

## Verified finding

Claim **BN-20260903-07443** is currently `IN_PAYMENT` with one active assignment in **Payment Issue**. Its former Payment Preparation assignment is completed and inactive.

The workbench warning is calculated from a cached client-side basket query. It also exposes a manual **Move to the correct basket** action that directly reruns routing. That repair action conflicts with the required workflow rule: officers must not force claims between baskets.

## Outcome

- Remove the manual basket-move action from the workbench.
- Refresh the active assignment from authoritative data when the workbench opens, regains focus, or a lifecycle action completes.
- Show normal **Payment Issue** guidance when status and the latest active assignment agree.
- If a real mismatch remains after a fresh read, show a non-actionable operational warning; correction must occur through the governed lifecycle/routing path, not an officer override.
- Make no database, workflow-rule, status, or assignment changes.
