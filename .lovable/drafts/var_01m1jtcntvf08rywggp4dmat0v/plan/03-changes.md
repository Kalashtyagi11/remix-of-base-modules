## Item 1 — Minimum contribution weeks: 50 → 26

Set `rule_definition.value` to 26 and correct the fail message (it currently hard-codes "50-week").

**Correction: you were right about the window, and I was wrong.** I had read the registry row, not the code. The runtime resolver at `src/services/bn/eligibility/eligibilityFactResolver.ts:433` is `deceasedWindowOrSnapshot(ctx, 'total', null)`, and the helper's `windowDays === null` branch returns the **lifetime** total from `computeContributionTotals` — no window is applied. So there is no 156-week restriction in behaviour, and the statutory lifetime reading is already satisfied.

What is real, and worth fixing, is a **metadata divergence**: the `bn_eligibility_fact` row for `fg.deceased_contribution_weeks` carries `window_type = WEEKS`, `window_size = 156`, `window_anchor = claim.death_date`. Those columns are descriptive only — nothing reads them at evaluation time — but they document behaviour the resolver does not have, and they are what misled me. Proposal: clear those three columns on that row so the registry states the lifetime semantics the code actually implements.

Second point, unchanged: the official page states **two** conditions (26 weeks of membership, 26 contributions actually paid). One rule covers both today. A distinct `resolveDeceasedContribPaidWeeks` resolver already exists, so splitting is cheap — but it is a scope decision, so I propose logging it as a follow-up rather than adding it here.


## Item 2 — Filing deadline: 90 days → 6 months

Your instinct about month-end boundaries is right and it matters here. The evaluator (`src/services/bn/eligibility/ruleEvaluator.ts`) converts a `MONTHS` unit as `days / 30.4375`, so "6 MONTHS" today means roughly 182.6 days, not a true calendar-month difference. A death on 31 August with a claim on 28 February would be inside 6 calendar months but could read as outside on the approximation, or vice versa.

Proposal, in this order:
1. Add real calendar arithmetic for `MONTHS` and `YEARS` in the `DATE_DIFFERENCE` path so the comparison is a month-count difference with day-of-month handling, rather than an average-length divide. `DAYS` and `WEEKS` behaviour is untouched.
2. Set the rule to value 6, unit `MONTHS`, and correct the fail message (it currently says "3 months").
3. Cover the change with tests at the boundaries: 31 Aug → 28/29 Feb, 31 Mar → 30 Sep, exactly-6-months, and one day past.

## Item 3 — Age-3 amount: 550.00 → 500.00

Set `output_value` to 500.00 for the `AGE_3` row. All ten other bands already match the official scale, so this reads as a seed typo, not a local uplift. Row is dated `effective_from 2026-01-01` with no successor and no claims have used it.

## Item 4 — Dependent claims: whose contribution record, and which child qualifies

You are right that my first version was half a fix. Two separate defects sit here, and the contribution one is the blocker.

**Fact-key check first:** `fg.deceased_age_at_death` does exist — it is an active row in `bn_eligibility_fact` bound to resolver `resolveDeceasedAgeAtDeath` (`eligibilityFactResolver.ts:442`), which reads the claim's `death_date` (falling back to `ip_master.date_died`) against the deceased's `dob`. If your registry check missed it, it may have been scoped to a product filter — its `applicable_products` array is empty.

### 4a — The contribution test targets the wrong person (the blocker)

`FG_MIN_CONTRIBUTION` binds to `fg.deceased_contribution_weeks`, whose resolver calls `resolveDeceasedSsn(ctx)` — the participant on the claim typed as deceased. For an insured-person death that is correct. For the death of a spouse or a dependent child it is wrong: that person has no contribution record of their own, the lifetime total comes back 0 (or null), and the claim fails at 26 weeks no matter how well it qualifies. This is exactly the end-to-end break you describe.

The statute is written around the **insured person's** record: the grant is payable on the death of an insured person, *their spouse*, or *their dependent child*. So the contribution test must always run against the insured member, whoever died.

Confirmed linkage: `ip_depend.ssn` is the **insured person's** SSN and `ip_depend.depend_ssn` is the dependant's own SSN, alongside `relation` (`CHI`, `DAU`, `SON`, `CLS`, `FAT`…), `dob`, `date_of_death`, `school_child` and `invalid` (both `Y`/`N` text). So the insured parent is found as `select ssn from ip_depend where depend_ssn = <deceased ssn>`.

Proposal — add one resolver, `resolveQualifyingInsuredSsn`, that decides whose record is tested:

```text
deceased is the insured person   → the deceased's own SSN
deceased is a spouse / dependant → ip_depend.ssn where depend_ssn = deceased SSN
neither resolvable               → null  →  rule reports NOT_IMPLEMENTED / review,
                                            never a silent pass or a silent zero
```

Then add `fg.qualifying_contribution_weeks` on top of it (same lifetime `computeContributionTotals` logic as today, just keyed on the resolved insured SSN) and repoint `FG_MIN_CONTRIBUTION` at that fact instead of `fg.deceased_contribution_weeks`. For an insured-person death the two are identical, so nothing about that path changes.

My answers to the two judgement calls, as my proposed default behaviour:

**(a) Multiple qualifying insured parents.** Evaluate every `ip_depend` row matching the deceased and pass if **any** linked insured person meets the 26-week test — the statute asks whether the child was the dependant of an insured member, not of a specific one, and picking "the first row" would make the outcome depend on arbitrary row order. The resolver returns the SSN that satisfied the test, and the calculation trace records both the chosen SSN and how many candidates were considered, so an officer can see which record carried the claim. If none of the parents qualifies, the fail message names the count considered rather than one SSN.

**(b) Deceased spouse/child absent from `ip_depend`.** Resolve to **null → review**, never false. A dependency that was never registered with the Board is a records gap, not evidence that the relationship did not exist, and auto-failing would deny a valid claim on data hygiene. The rule reports "insured member could not be determined from dependant records — verify against marriage/birth certificate and register the dependency", which lands the claim on an officer's desk with the resolving document already on the required-document list from Item 5. The rule must never silently pass in this state either — that is the SKN-INV vacuous-success trap.


### 4b — Which dependent child qualifies

Nothing constrains who the deceased dependant may be, and the `OVER_9` band is open-ended, so a 40-year-old "dependent child" would be paid $1,600.

- Add fact `fg.dependent_child_qualifies`, read from the matched `ip_depend` row: true when age at death is under 16; or under 25 with `school_child = 'Y'`; or `invalid = 'Y'`.
- Add rule `FG_DEPENDENT_CHILD_ELIGIBLE`, severity BLOCK, applied only when the deceased is a dependent child, so spouse and insured-person claims are unaffected.
- No matching `ip_depend` row must resolve to review, not a silent pass — the same vacuous-success trap already seen on SKN-INV's empty evidence checklist.

Note that `school_child` and `invalid` are point-in-time flags on the dependant record with no history, so a 20-year-old whose student flag was never updated will fail. That is a data-quality reality to state in the fail message, not something code can fix.


## Item 5 — Documents

First, align the three existing rows to real catalogue codes (`DEATH_CERT`, `PROOF_RELATION`, and either keep the estimate or replace it with `FUNERAL_INVOICE_RECEIPT`). Then add, reusing catalogue entries that already exist — none of these need a new document type:

| Add | Catalogue code | Level |
|---|---|---|
| FG1 claim form | `FUNERAL_CLAIM_FORM` | mandatory, blocks submission |
| Deceased's birth certificate | `BIRTH_CERT` | mandatory |
| Marriage certificate | `MARRIAGE_CERT` | conditional — uninsured-spouse claims only |
| Funeral invoice / receipt | `FUNERAL_INVOICE_RECEIPT` | mandatory |

One caution on the conditional row: `bn_doc_requirement.condition_json` is stored and editable in the admin UI, but the evidence checklist in `src/services/bn/evidenceService.ts` does **not** evaluate it — it treats every MANDATORY row as blocking. So a `MARRIAGE_CERT` row marked MANDATORY with a condition would block every funeral claim. Two honest options: register it at a non-blocking level with the condition documented, or teach the checklist to evaluate `condition_json`. I lean to the second because the same gap will bite every other product, but it is a wider change than this ticket and I would rather you choose.

**Invoice in the claimant's name** — there is no data anywhere that can verify this automatically; it is a human check on a scanned document. I propose adding it as an explicit verification instruction on the invoice requirement rather than pretending to enforce it in code.

## Not changing, but raising

The adult grant is $2,500 in the database and on the official page, while the Board's December 2023 press release says $3,500 from 1 January 2024. Needs a business ruling against the current Benefits Schedule before anyone touches the rate table.

## Technical notes

- Configuration corrections applied as an additive, idempotent migration keyed on the product version and rule/row codes.
- Code touched: the `DATE_DIFFERENCE` month arithmetic in `ruleEvaluator.ts`, the new dependent-child fact resolver alongside the existing Funeral Grant resolvers, and (only if you choose it) `condition_json` evaluation in `evidenceService.ts`.
- Verification: replay the eligibility evaluator against a fresh Funeral Grant claim for each scenario — 25 weeks vs 26, day 180 vs day 200, an age-3 death paying 500, a 30-year-old "dependent child" being blocked, and the document checklist listing all six requirements.
