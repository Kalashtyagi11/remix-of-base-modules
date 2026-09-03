## Item 1 — Minimum contribution weeks: 50 → 26

Set `rule_definition.value` to 26 and correct the fail message (it currently hard-codes "50-week"). I also want to flag a second, subtler problem in the same rule that your report did not cover:

- The fact behind it, `fg.deceased_contribution_weeks`, is a **windowed** aggregate: it counts weeks with wages in the 156 weeks before the date of death. The statutory test is a lifetime one ("member for at least 26 contribution weeks and actually paid 26 contributions"), so a long-retired insured person with 800 lifetime weeks but nothing in the last 3 years would fail. I propose recording this as a separate finding and widening the window only after the business confirms the lifetime reading — it is not part of the number fix.
- The official page states **two** conditions (26 weeks of membership, 26 contributions actually paid). Today one rule covers both. I propose keeping one rule for now and logging the split as a follow-up rather than inventing a membership-weeks fact that has no resolver.

## Item 2 — Filing deadline: 90 days → 6 months

Your instinct about month-end boundaries is right and it matters here. The evaluator (`src/services/bn/eligibility/ruleEvaluator.ts`) converts a `MONTHS` unit as `days / 30.4375`, so "6 MONTHS" today means roughly 182.6 days, not a true calendar-month difference. A death on 31 August with a claim on 28 February would be inside 6 calendar months but could read as outside on the approximation, or vice versa.

Proposal, in this order:
1. Add real calendar arithmetic for `MONTHS` and `YEARS` in the `DATE_DIFFERENCE` path so the comparison is a month-count difference with day-of-month handling, rather than an average-length divide. `DAYS` and `WEEKS` behaviour is untouched.
2. Set the rule to value 6, unit `MONTHS`, and correct the fail message (it currently says "3 months").
3. Cover the change with tests at the boundaries: 31 Aug → 28/29 Feb, 31 Mar → 30 Sep, exactly-6-months, and one day past.

## Item 3 — Age-3 amount: 550.00 → 500.00

Set `output_value` to 500.00 for the `AGE_3` row. All ten other bands already match the official scale, so this reads as a seed typo, not a local uplift. Row is dated `effective_from 2026-01-01` with no successor and no claims have used it.

## Item 4 — Dependent-child eligibility gate

Confirmed missing: nothing constrains who the deceased dependent may be, and the `OVER_9` band is open-ended, so a 40-year-old "dependent child" would be paid $1,600.

The data does exist. `ip_depend` carries `dob`, `date_of_death`, `relation`, `school_child` and `invalid` per dependant, and `fg.deceased_age_at_death` is already an implemented fact. What is missing is a fact resolver exposing the student/invalid status to the rule engine.

Proposal:
- Add one fact, `fg.dependent_child_qualifies`, resolved from the deceased dependant record: true when age at death is under 16; or under 25 with `school_child` set; or `invalid` set.
- Add one rule, `FG_DEPENDENT_CHILD_ELIGIBLE`, severity BLOCK, applied only when the claim is a dependent-child claim (the existing relationship fact identifies this) so spouse and insured-person claims are unaffected.
- If the deceased dependant cannot be matched to an `ip_depend` row, the rule must resolve to a review outcome rather than a silent pass — the same vacuous-success trap already seen on SKN-INV's empty evidence checklist.

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
