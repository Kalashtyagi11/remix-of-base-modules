# Why claim BN-20260902-76270 (SSN 900014) calculated 0 with a blank formula

Read-only diagnosis. No code or data was changed.

## What the stored calculation actually says

`bn_claim_calculation` row `7d7dabb6…` (calc at 12:19:45) has `formula_code = NULL`, `formula_version = NULL`, all rates 0.00, and its own trace names the cause at step 11:

```text
FORMULA / FORMULA_NONE (ERROR):
"Product version 02d8f5b9-faae-435f-940f-61d65ae72d51 has no formula_template_id
 — pick a formula from the Formula Library."
```

Eligibility (5 rules), contribution window (180 weeks LIFETIME) and wage aggregation (AIW 350) all succeeded — that is why the header figures look right while every money field is 0. The matching `bn_calc_run` `6e8a1a23…` is `COMPLETED` with `weekly_rate 0.00` and empty `errors`.

## Root cause

That error text comes from `loadProductCalculationConfig()` (`src/services/bn/productCalculationLoader.ts:58`), which reads only `bn_product_version.formula_template_id`. Both versions of SKN-INV have that column **NULL** — the product's calculation is configured in the **Formula Bindings** table instead:

- Binding `1c5a059a…` on version `02d8f5b9…` (v2, ACTIVE), `is_active = true`, stage PRIMARY, seq 10, output `weekly_amount`, rounding ROUND_HALF_UP.
- Pinned formula version `0d26eb16…` = `TIERED_PENSION_V1` v1, ACTIVE, MULTI_STEP: LOOKUP `AGE_PENSION_RATE_TABLE` by `total_contribution_weeks` → `pension_rate`, then `average_insurable_wage * pension_rate` → `weekly_amount`.
- 6 variable mappings exist: `average_insurable_wage` (FACT), `total_contribution_weeks` ← FACT `total_weeks`, plus 4 PRODUCT_PARAMETER keys (`base_rate` 0.30, `base_weeks` 500, `increment_rate` 0.01, `increment_unit_size` 50 — all registered in `bn_product_parameter`, so nothing is missing).

So the configuration is complete and correct; the run simply never reached it. `calculationEngine.ts:411-419` checks for bindings first, but wraps the lookup in a `try { … } catch { bindings = [] }` that silently swallows any failure and falls through to the legacy `formula_template_id` path. The binding row and its mappings both pre-date the 12:19 run, and the same query re-executed now through the API returns the binding successfully (grants open, RLS off on all binding/mapping/formula/rate tables). The most likely explanation is therefore a transient/stale-bundle failure of the dynamic `import('./calc/runProductCalculationV2')` in the browser session that ran the calculation — the same stale-preview symptom seen earlier — not a data or permission defect.

## Expected result on a correct re-run

180 weeks matches `AGE_PENSION_RATE_TABLE` row_order 1 (`min 150 / max 199`) → 0.160000 PERCENTAGE. With AIW 350:

```text
weekly_amount = 350 × 0.16 = 56.00  (ROUND_HALF_UP)
monthly ≈ 242.67 / annual ≈ 2,912.00, per the product's frequency rules
```

## Safest next UI action

1. Hard-reload the Benefits app (or republish, if the preview build is stale) so the current bundle is loaded — the binding path lives in a lazily imported chunk.
2. Open the claim's Calculation tab and click **Re-run**. It should record `calcType FORMULA_BINDING`, `formulaExpression TIERED_PENSION_V1`, and weekly 56.00.
3. Note: this claim's status is **CLOSED**. If Re-run is disabled or refuses on a closed claim, do not force it — recalculate on a fresh test claim for 900014 instead, and keep this one as the evidence record.
4. If the re-run still returns 0 with `FORMULA_NONE`, that proves the binding lookup is failing at runtime rather than intermittently; capture the browser console at that moment before any further action.

## Follow-up fixes to consider (not done here, no writes made)

- `calculationEngine.ts:415` should not swallow the bindings-lookup error — a failed lookup must surface as `FORMULA_BINDING_FAILED`, never as a silent fall-through to the legacy path that then reports a misleading "no formula_template_id".
- `productCalculationLoader` should either consult `bn_product_formula_binding` or emit an error that names bindings as the modern location, so the message stops pointing users at the Formula Library for products configured via bindings.
