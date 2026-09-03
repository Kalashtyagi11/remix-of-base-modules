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

## Isolation confirmation

Every change above is scoped to Funeral Grant. Specifically:

- **New resolvers only, no shared edits.** `resolveQualifyingInsuredSsn` and the two new facts are new functions. `resolveDeceasedContribTotalWeeks`, `deceasedWindowOrSnapshot`, `computeContributionTotals` and `resolveDeceasedSsn` are used by Survivors and Death Benefit and will **not** be modified — Item 4 repoints the Funeral rule at a new fact instead of changing the old one's behaviour.
- **Rule/fact/rate/document rows** are filtered to product version `7591e864-def2-491e-ad14-02dd5ac338ef`; no other version's rows are touched.
- **Registry metadata clearing** is a single `UPDATE` on the one `fg.` prefixed fact row.
- **Screen template** changes touch `SCR-SKN-FUN-O1-2796dd` / `TPL-GRANT-FUNERAL` only.
- The one deliberate exception to raise before I start: if you approve teaching `evidenceService.ts` to evaluate `condition_json` (Item 5's caution), that **is** shared code affecting every product. If you would rather stay strictly inside Funeral Grant, say so and I will register the conditional marriage certificate as non-blocking instead.

Verification I will run and report: rule/fact/rate/document state before and after, a walkthrough of an insured-person death, a dependent-child death and a Funeral-Arranger claim through the evaluator, the deadline boundary cases around the six-month calendar test, targeted Vitest, typecheck and build.
