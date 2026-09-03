# Funeral Grant (FUNERAL-GRANT-2026) — verification of 5 reported discrepancies

I checked each item against the live configuration, the official Funeral Grant page, the Board's own December 2023 press release, and the rule-evaluation code. Verdict per item:

| # | Item | Your read | Verdict |
|---|---|---|---|
| 1 | Min contribution weeks = 50 | should be 26 | **Confirmed** — change to 26 |
| 2 | Filing deadline = 90 days | should be 6 months | **Confirmed** — change to 6 months |
| 3 | Age-3 amount = 550.00 | should be 500 | **Confirmed** — change to 500 |
| 4 | No dependent-child age/status gate | missing | **Confirmed missing**; supporting data exists but is not wired |
| 5 | Missing FG1 / birth cert / marriage cert | missing | **Confirmed**, plus a code-mismatch problem you did not report |

Safety context: this product version (`7591e864…`, v1, ACTIVE from 2026-09-01) currently has **zero claims**, so all corrections are configuration fixes with no historical decisions to preserve.

## What the official page actually says

- "must have been a member of the Social Security Fund for at least twenty-six (26) contribution weeks; **and** must have actually paid twenty-six (26) contributions"
- Claim form "no later than six (6) months after the date of death"
- Child scale: Under 3 $400 · 3 **$500** · 4 $700 · 5 $850 · 6 $1000 · 7 $1150 · 8 $1300 · 9 $1450 · 10+ $1600 — every band except age 3 already matches the database, which is strong evidence the 550 is a typo rather than a local uplift
- Dependent child = under 16, or under 25 in full-time education, or an invalid
- Evidence: approved FG1 form, death certificate, funeral invoice/receipt, deceased's birth certificate, marriage certificate where the deceased is the uninsured spouse; receipts must be in the claimant's name

## Two things I found that you did not report

**A. The adult grant may be out of date.** Source, as requested: the Board's own press release *"Increases to Minimum Age Pension, Assistance Pension and Funeral Grant"*, dated 29 December 2023, at `https://socialsecurity.kn/press/press-releases-2023/increases-to-minimum-age-pension-assistance-pension-and-funeral-grant/`. Verbatim: *"One additional increase is that of the Funeral Grant, which is a lump-sum paid upon the death of an insured member… Beginning 1 January 2024, the funeral grant will be increased from $2,500 to $3,500."* The same release raises the Minimum Age Pension $430 → $500 and the Assistance Pension $255 → $350. The database and the Funeral Grant benefit page both still say $2,500, so either the benefit page was never updated or the increase was not implemented as announced. I am **not** proposing to change it in this wave; it needs a ruling from the business against the current Benefits Schedule.

**B. The three existing document requirements use codes that do not exist in the catalogue.** `bn_doc_requirement` rows use `DEATH_CERTIFICATE`, `PROOF_OF_RELATIONSHIP`, `FUNERAL_EXPENSE_ESTIMATE`; the catalogue (`bn_service_doc_type`) defines `DEATH_CERT`, `PROOF_RELATION`, `FUNERAL_INVOICE_RECEIPT`. There is no foreign key, so the mismatch went unnoticed. Note that `fg.death_certificate_received` resolves against uploaded document type, so a claimant uploading the catalogue-correct `DEATH_CERT` and the requirement row asking for `DEATH_CERTIFICATE` are not guaranteed to agree.
