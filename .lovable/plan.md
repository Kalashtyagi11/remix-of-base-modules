# Re-run confirmed: the failure is reproducible, not transient

Read-only diagnosis. Nothing was modified.

## What the re-run produced

Yes — the click created brand-new records, and they are identical in outcome to the first attempt:

| Record | First run | Re-run |
| --- | --- | --- |
| `bn_calc_run` | `6e8a1a23…` 12:19:40, COMPLETED, weekly 0.00 | `9ddb0713…` 12:42:09, COMPLETED, weekly 0.00 |
| `bn_claim_calculation` | `7d7dabb6…` 12:19:45 | `5b6b60e2…` 12:42:14 |
| `formula_code` / `formula_version` | NULL / NULL | NULL / NULL |
| `calcType` in outputs | `NONE` | `NONE` |

Both runs carry the same two warnings (`CALC_ZERO`, `SCHED_EMPTY`) and an empty `errors` array, so the run is being recorded as a clean success that happens to be worth zero.

`bn_calc_trace` for the new run `9ddb0713…` holds the full layer-by-layer trace (eligibility, contribution window, wages) and step 11 is again, verbatim:

```text
FORMULA / FORMULA_NONE (ERROR)
"Product version 02d8f5b9-faae-435f-940f-61d65ae72d51 has no formula_template_id
 — pick a formula from the Formula Library."
```

## Was the formula-binding path reached? No.

There is no `FORMULA_BINDING` or `FORMULA_BINDING_FAILED` step in either run, and no per-binding trace rows. That message can only be emitted from `loadProductCalculationConfig()` (`src/services/bn/productCalculationLoader.ts:58`), which is the **legacy** path — the engine only falls there when its bindings lookup came back empty (`calculationEngine.ts:411-419`).

The data says the lookup should not be empty. Re-checked just now through the same REST API and column list the app uses: binding `1c5a059a…` on version `02d8f5b9…` returns fine, `is_active = true`, formula version pinned to `TIERED_PENSION_V1` v1 (ACTIVE), 6 variable mappings present, all 4 product parameters registered, `AGE_PENSION_RATE_TABLE` active with a matching 150–199 row at 0.16. Grants are open and RLS is off on every table involved.

So the previous "probably transient" reading is withdrawn. **Two consecutive runs, 23 minutes apart, produced the identical failure — this is reproducible and is a code/deploy defect, not data and not permissions.**

## Where the defect is

`calculationEngine.ts:411-419` wraps the binding lookup in `try { … } catch { bindings = [] }`. Any failure of the lazily imported `./calc/runProductCalculationV2` chunk — a chunk-load error from a stale served bundle, or an older bundle that predates the Formula Bindings branch altogether — is swallowed silently and the engine drops to the legacy path, which then reports a misleading "no formula_template_id" and writes a zero result with no error. Nothing in the run record distinguishes "no formula configured" from "could not load the formula code".

Expected output once the binding path executes: 180 weeks → rate 0.16 → `350 × 0.16 = 56.00` weekly (ROUND_HALF_UP).

## Safest next action (UI-only)

1. In the browser tab running the app, do a **hard reload** (Ctrl/Cmd+Shift+R) — an ordinary reload keeps cached JS chunks, and the binding code lives in a lazily loaded chunk. Then click Re-run once more.
2. Before clicking, open the browser console and keep it open. If a `Failed to fetch dynamically imported module` / chunk-load error appears at the moment of the click, that is the confirmation and the fix is a rebuild/republish of the app, not a data change.
3. If the hard reload still yields weekly 0.00 with `FORMULA_NONE` and no console chunk error, stop UI testing — the served build predates the Formula Bindings path and a code defect must be raised.

## Defect to raise if step 3 is reached

- **BN-CALC-BINDING-SILENT-FALLTHROUGH** — `calculationEngine.ts:415` must not swallow the bindings-lookup failure. It should record `FORMULA_BINDING_FAILED` with the underlying error and mark the run FAILED, instead of falling through to the legacy path and persisting a zero-value calculation that reads as successful.
- Secondary: the legacy loader message should name Formula Bindings as the modern configuration location, so operators are not sent to the Formula Library for a product that is correctly configured.

No writes were made; both zero-value calculation records remain in place as evidence.
