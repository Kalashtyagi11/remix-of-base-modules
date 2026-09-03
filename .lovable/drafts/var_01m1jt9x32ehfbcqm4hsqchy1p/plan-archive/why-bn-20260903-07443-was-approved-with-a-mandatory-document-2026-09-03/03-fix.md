# The fix

## 1. Close the bypass (primary)

`approveClaim` runs the same precondition gate the other two entry points already use, before it writes anything — before the recommendation path and before the full-approve path. If the gate refuses, nothing is written, the claim stays where it is, and the officer sees the named blockers ("Birth Certificate is still outstanding — upload and verify it, then approve").

The gate already handles everything correctly: mandatory / decision-blocking requirements, waivers per product policy, unreadable checklist treated as a refusal, eligibility and calculation staleness, maker-checker with the admin break-glass exemption.

## 2. Enforce transition requirements at execution, not just on the button

`executeTransition` re-checks role and status at execution time, but treats `requires_evidence_complete`, `requires_eligibility_pass` and `requires_calculation` as button-state only. Re-assert all three at execution and refuse with the same wording the button shows.

## 3. Officer-facing prompt

When approval is refused for outstanding documents, the workbench shows the blocker list with a direct link to the claim's Documents tab, so the officer uploads and verifies the certificate and then approves. No silent failure, no toast that disappears.

## 4. This claim, BN-20260903-07443

The claim is already `IN_PAYMENT` with a READY $255.00 payable. The code fix does not retro-correct it. Two options, your call — I will not act on the record without direction:

- **Leave it and remediate the document.** Upload and verify the Birth Certificate against the existing checklist row, so the file becomes compliant before the instrument is issued.
- **Reverse it through governed actions.** Suspend / hold the payable and take the claim back through decision. Heavier, and it leaves the reversal in the audit trail.

## Scope and safety

- Code only. No schema change, no RLS change, no migration, no backfill.
- No historical claim is modified.
- Files touched: the post-approval orchestrator (`approveClaim`), the decision engine (`executeTransition`), and the workbench guidance component for the blocker prompt.
- Verification: unit tests asserting approval is refused with an outstanding mandatory document on all three entry points, plus the existing Benefits suites, typecheck and build.

## Wider exposure

Any product with mandatory documents is affected, not just this one — the bypass is in a shared button, so any claim approved from the workbench Next Step panel since that path shipped skipped the document gate. After the fix I can run a read-only sweep listing approved or paid claims that still hold outstanding blocking requirements, so you can decide remediation per claim.
