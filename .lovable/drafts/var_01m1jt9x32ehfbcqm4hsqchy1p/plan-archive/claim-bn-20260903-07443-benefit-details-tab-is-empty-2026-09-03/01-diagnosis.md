# Claim BN-20260903-07443 — Benefit Details tab is empty

## What I found in the live data

Claim `BN-20260903-07443` (SSN 900013, Assistance Pension `ASST_PENSION`, LONG_TERM, status INTAKE) exists and is healthy. The Benefit Details tab is blank because **no benefit-specific data was ever captured or stored for it**:

- The claim has **no benefit detail record** at all. In fact the benefit detail table is empty for the whole system (0 rows) — no claim has ever stored these values.
- The saved application payload for this claim contains `benefit_facts: {}` — the registration wizard captured nothing.

## Why nothing was captured

Three separate causes chain together:

1. **The product code does not resolve to a benefit field set.** The intake wizard maps the product code to a benefit field catalogue by recognising tokens (`AGE`, `INV`, `SUR`, `FUN`, `NCP`, …). `ASST_PENSION` matches none of them, so the "Benefit-Specific Facts" step rendered "No benefit-specific fields configured" and the officer had nothing to fill in. Any future product with an unrecognised code behaves the same way.
2. **The configured intake screen has no benefit-specific section.** The OFFLINE channel screen for this product only defines claimant lookup, application context, banking, documents and declaration sections — so the configured path offers no benefit fields either.
3. **Even when facts are captured, they are never promoted to the benefit detail record.** Registration only archives them inside the raw application JSON; the only exception is a narrow Funeral Grant special case. So the workbench tab, which reads the benefit detail record first, has nothing to show.

On top of this the two sides use **different field vocabularies**: the workbench shows fixed LONG_TERM fields (Retirement Date, Pension Type, Best Years, Contribution Weeks) while the intake catalogue uses other codes (e.g. `retirement_date` + `pension_path` under AGE_BENEFIT). Even a captured value would often not line up with the displayed field.
