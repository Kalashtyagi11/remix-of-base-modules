## Item 6 (new) — the claimant test is financial, not familial

You are right, and the law text is unambiguous. Verbatim from the Board's Funeral Grant page:

> "The benefit may be paid to any person who: has met the funeral expenses of the deceased person; **or** has given an undertaking in writing to the Director of the Social Security Board to meet the funeral expenses of the deceased. If a claimant gives such an undertaking and then fails to meet the expenses, the grant must be repaid to the Social Security Board."

Family relationship is not a condition of *who may claim* anywhere in that text. It is only a condition of *whose death is covered* (insured person, spouse, dependent child). `FG_RELATIONSHIP_VALID` conflates the two.

### What is actually in the system

- `resolveFuneralGrantRelationshipValid` (`eligibilityFactResolver.ts:967`) reads `bn_claim_participant.relationship_to_insured` and passes only on `SPOUSE, WIDOW, WIDOWER, CHILD, DEPENDENT_CHILD, PARENT, DEPENDENT_PARENT, DEPENDENT, LEGAL_REPRESENTATIVE`.
- `bn_country_participant_type` has **`FUNERAL_ARRANGER`** (role `FUNERAL_HOME`) and **`EXECUTOR_OR_ESTATE`** (role `REPRESENTATIVE`) both active. Neither carries a family relationship, so both fail the set above — exactly the defect you describe. (`ESTATE` is a third, inactive duplicate.)
- **Correction to your framing:** there is no `funeral_responsibility_declaration` field. I searched the whole repository and the screen-template configuration; the only declaration on the SKN-FUN intake screen is the generic `declaration_accepted` checkbox that every intake template carries ("Declaration Accepted", DECLARATION_CHECKBOX). It is a truthfulness attestation, not a funeral-cost undertaking, and it cannot carry this proof.
- Also worth knowing: the resolver returns `null` (unknown) when no participant has a relationship recorded, and BUG-054 — noted in a comment in the resolver itself — means intake does not currently save `relationship_to_insured` at all. So today this rule is inert on every claim; the defect will surface the moment BUG-054 is fixed.

### Proposal

Replace the familial test with the statutory one, on this product version only.

1. **New fact `fg.claimant_funeral_cost_responsibility`**, resolved from the claimant participant plus evidence, returning one of true / false / null:
   - **true** — a funeral invoice or receipt (`FUNERAL_INVOICE_RECEIPT`) is on the claim **and** the claimant has affirmed cost responsibility; or a written undertaking is recorded.
   - **null (review)** — claimant is `FUNERAL_ARRANGER` or `EXECUTOR_OR_ESTATE` but neither proof is present yet.
   - **false** — the claimant explicitly declines both limbs.
2. **New rule `FG_CLAIMANT_ENTITLED`** (BLOCK) bound to that fact, added to the FUNERAL-GRANT-2026 active version.
3. **Retire `FG_RELATIONSHIP_VALID` on this version** by deactivating the rule row rather than deleting it, so the configuration history stays intact. Family relationship remains enforced where it belongs — on the deceased, through Item 4's dependent-child gate — not on the claimant.
4. **Capture the missing proof.** Two fields added to the SKN-FUN intake screen template only: a *funeral cost responsibility* declaration (met the expenses / undertake in writing to meet them) and, when the second is chosen, the undertaking reference. The seed template `TPL-GRANT-FUNERAL` and the live `SCR-SKN-FUN-O1-2796dd` screen are Funeral-specific, so no other product's intake changes.
5. **The repayment obligation** in the last sentence of the statute (undertaking given, expenses never met, grant recoverable) is a real downstream rule that belongs in Overpayments, not eligibility. I propose logging it as a follow-up rather than quietly leaving the impression it is covered.

Open question I am not deciding for you: should a claim by a Funeral Arranger pay the arranger directly, or the estate? That is a payee-routing policy question, separate from eligibility, and I have not touched payee logic.

## Item 7 (new) — provided documents never reach the readiness validator

Confirmed, and your read is correct. The data flow, traced end to end:

```text
ClaimRegistration.tsx:614   providedDocs = docState entries with status PROVIDED
ClaimRegistration.tsx:643   formPayload.documents = { provided, pending, waived }
claimIntakeService.ts:191   uploaded_document_codes: formPayload.uploaded_document_codes ?? []
intakeReadinessService.ts:182  validateRequiredDocuments(..., uploadedDocumentCodes)
```

Nothing anywhere writes `formPayload.uploaded_document_codes`. The staff screen writes `documents.provided`; the service reads `uploaded_document_codes`; the fallback `?? []` turns the mismatch into a silent empty array rather than an error. So `validateRequiredDocuments` compares every MANDATORY requirement against an empty set and reports all of them missing, regardless of what the officer marked Provided. It is a submit-time gate (`validateReadiness` throws `ClaimIntakeReadinessError` before any row is created), so where `blocks_submission` is set it blocks registration outright.

One nuance beyond your framing, which is why this has not been screaming in production: it only bites where mandatory requirements with `blocks_submission` actually exist. Funeral Grant's three current rows are the ones Item 5 is about to make mandatory and blocking — so **Item 5 would have turned this latent bug into a hard blocker on every funeral claim.** They have to ship together.

Proposed fix, at the seam in `claimIntakeService.ts` rather than in the screen or the validator:

```text
uploaded_document_codes:
     formPayload.uploaded_document_codes            // portal/API callers, unchanged
  ?? [...documents.provided, ...documents.waived.map(d => d.document_type_code)]
```

Reasoning for each part:
- **Fix at the service seam**, because `ClaimRegistration.tsx` is not the only caller — the portal apply wizard and any API submission path build their own payloads, and normalising once in the service fixes all of them rather than one screen.
- **Keep the old key working** so any caller that does send `uploaded_document_codes` is unaffected.
- **Count WAIVED as satisfied.** A waiver is a deliberate, permission-gated act (the screen already refuses it without the waive permission), and the reason is captured. Treating a waived document as still-missing would make the waiver feature useless. PENDING stays missing — that is exactly what it means.
- **Drop the silent `?? []`** in favour of a resolved list, so a genuinely absent documents block is visible rather than defaulting to "nothing provided".

This is a bug fix in shared intake code, not Funeral Grant configuration — see the exception noted below.

## Isolation confirmation

The configuration changes are all scoped to Funeral Grant: rule/fact/rate/document rows filtered to product version `7591e864-def2-491e-ad14-02dd5ac338ef`, one `UPDATE` on the single `fg.`-prefixed fact registry row, and screen-template edits limited to `SCR-SKN-FUN-O1-2796dd` / `TPL-GRANT-FUNERAL`.

New resolvers only, no shared resolver edits: `resolveQualifyingInsuredSsn` and the new facts are new functions. `resolveDeceasedContribTotalWeeks`, `deceasedWindowOrSnapshot`, `computeContributionTotals` and `resolveDeceasedSsn` are used by Survivors and Death Benefit and will **not** be modified — Item 4 repoints the Funeral rule at a new fact instead of changing the old one's behaviour. `evidenceService.ts` stays untouched per your ruling.

Two changes are honestly outside Funeral Grant, and I am naming them rather than burying them:

1. **Calendar-month arithmetic in `eligibilityEvaluator.ts` / `ruleEvaluator.ts`** (Item 2). Shared evaluator code, but zero active `DATE_DIFFERENCE` rules platform-wide use `MONTHS` or `YEARS` today, so no existing product's outcome changes.
2. **The `uploaded_document_codes` mapping in `claimIntakeService.ts`** (Item 7). Shared intake code by nature — the defect is in the shared seam, and fixing it only for Funeral Grant would mean special-casing one product inside a generic service. Its effect on other products is to start honouring documents they already mark as provided, which is the intended behaviour everywhere. If you would rather split this into its own ticket, say so — but then Item 5 must wait for it, because together they would block every funeral claim.

Verification I will run and report: rule/fact/rate/document state before and after; a real submitted claim walked through `eligibilityEvaluator` for an insured-person death, a dependent-child death and a Funeral-Arranger claim; the six-month boundary cases through the live path, not the Test Rule panel; a staff registration with documents marked Provided proving readiness now passes; targeted Vitest; typecheck; build.

