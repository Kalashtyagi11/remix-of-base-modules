## Proposed fix

**1. Make every product resolve to a benefit field set.**
Extend the benefit key resolution so unrecognised product codes fall back to the product's category (LONG_TERM, SHORT_TERM, GRANT, SURVIVOR, INJURY, NON_CONTRIBUTORY, ASSISTANCE) instead of returning nothing. `ASST_PENSION` then resolves to the long-term/assistance field set and the wizard's Benefit-Specific Facts step renders real fields. Also add explicit aliases for the existing St. Kitts product codes (`ASST_PENSION` and siblings).

**2. Use one shared field vocabulary.**
The workbench Benefit Details tab and the intake catalogue will read the same canonical per-category field list, so a value captured at registration appears in the workbench under the same label and key. No new field registry is created — the workbench's category list becomes the single source and the intake catalogue derives from it.

**3. Promote captured facts into the benefit detail record at submission.**
Generalise the existing Funeral Grant promotion step so all captured benefit facts are written to the claim's benefit detail record (`detail_json`) on submission, not only archived in raw JSON. The raw application JSON stays untouched, keeping the citizen-submitted record immutable.

**4. Backfill display for existing claims.**
The tab already falls back to the raw application facts; with a shared vocabulary that fallback starts working for claims already registered. No data migration and no rewriting of history.

**5. Honest empty state.**
When a claim genuinely has no captured facts (like this one), the tab will say so explicitly — "No benefit-specific data was captured at registration" with a hint to enter it here — instead of showing dashes that look like a loading failure.

## About this specific claim

BN-20260903-07443 was registered with nothing to capture, so after the fix its Benefit Details tab will show the LONG_TERM fields as editable staff-entry fields with the honest empty state. Retirement Date and Pension Type can then be entered and saved by staff. No back-dated data will be invented for it.

## Technical notes

- Files: `src/services/bn/forms/sectionCatalogue.ts` (category fallback + aliases), `src/components/bn/workbench/BenefitDetailSection.tsx` (shared vocabulary, empty state), `src/services/bn/intake/claimIntakeService.ts` (generalised fact promotion), `src/pages/bn/intake/ClaimRegistration.tsx` (no change expected beyond field list).
- Tables: writes go to `bn_claim_detail` only, via the existing upsert path. `bn_claim` and `bn_claim_application` are not modified. No schema change, no migration, no RLS or permission change.
- Tests: add coverage for benefit key fallback by category, and for facts captured at intake appearing in the benefit detail record.
