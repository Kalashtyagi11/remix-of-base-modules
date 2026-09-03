## What I will change

### 1. AMND-01 — every version gets an amendment policy (highest impact)

Stage an additive migration that adds an `AFTER INSERT` trigger on `bn_product_version` seeding `bn_product_amendment_policy` (`on conflict (product_version_id) do nothing` — the unique constraint already exists), plus a one-time backfill for the 64 versions currently missing a row. Because this draft shares the live database, the schema change applies when the draft is accepted, not now.

### 2. AMND-02 — banner tells the truth

`EditabilityBanner.tsx` renders the computed `lockedReason` whenever any area resolves to locked, and keeps the channel sentence only when nothing is locked.

### 3. ELIG-01 — one shared catalogue mapper with an import-time guard

New `src/services/bn/eligibility/catalogueRuleMapping.ts` exporting an operator map and `catalogueRuleDefinition(r)` that writes `field_key` alongside the existing `parameter/value_from/value_to/values` keys (additive — nothing the engine reads today is removed). `AddRulesByCategoryDialog`, `CataloguePickerDialog` and `AddRuleGroupFromCatalogueDialog` all call it, and refuse to import a rule whose `fact_key` resolves to no registered field, naming the offending rules in the toast.

### 4. ELIG-03 — one registry, one displayed field

`src/services/bn/registries/eligibilityFieldRegistry.ts` becomes a thin re-export of the authoritative `eligibility/fieldRegistry.ts`, keeping its current export names so `RuleBuilder`, `BlockInspector` and `bnRegistryValidationService` compile unchanged. Any authoritative key those screens genuinely need that is missing from `fieldRegistry.ts` gets added there rather than kept in a second list. Eligibility panels render the trace's own resolved `field_key`, so the screen can only show what was actually evaluated.

Plus a reported (not auto-applied) reconciliation query listing rules whose `fact_key` is not a registered key, for manual correction.

### 5. ELIG-02 — no change

Verified already fixed and covered by tests in `eligibility/__tests__/eligibilityEvaluator.test.ts`. I will add a regression test asserting that an all-unevaluable rule set yields `NOT_DETERMINED` / `overall: false`, so it cannot regress.

## Explicitly not in scope

The "not defects" section (SAP_MIN_PAID_CONTRIBUTIONS window, thresholds vs the test claimant, stale `fail_message`) is v4 configuration data for SAP-SANCHIT. I will report the exact rows to correct but will not silently edit product configuration.

## Verification

Vitest for the eligibility and amendment suites, typecheck and build, a live query proving 0 versions without a policy after the migration, and a catalogue import in the preview showing an unregistered rule refused.
