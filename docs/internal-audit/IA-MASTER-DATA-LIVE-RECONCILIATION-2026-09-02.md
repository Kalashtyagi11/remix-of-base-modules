# IA Live Data Integrity Reconciliation — 2026-09-02

Read-only scan of the TEST/PREVIEW database. **No data was modified.**

## 1. Fiscal Year (`ia_annual_plans.fiscal_year`)

No canonical Fiscal Year master exists on the platform, so **every** value is
classified `MISSING_MASTER`. Format drift is also present (three distinct
formats plus test literals).

| Value | Plans | Classification |
|---|---|---|
| 2025-2026 | 1 | MISSING_MASTER |
| 2026-2027 | 5 | MISSING_MASTER |
| 2027-2028 | 2 | MISSING_MASTER |
| 2027 | 2 | MISSING_MASTER + FORMAT_DRIFT |
| 2028 | 1 | MISSING_MASTER + FORMAT_DRIFT |
| 2029 | 1 | MISSING_MASTER + FORMAT_DRIFT |
| 2031 | 1 | MISSING_MASTER + FORMAT_DRIFT |
| 2032 | 1 | MISSING_MASTER + FORMAT_DRIFT (Phase-E plan) |
| 2027-CANARY / 2028-CANARY-B / 2029-CANARY-C | 3 | LEGACY_VALUE (test canaries) |
| 2099-2100 | 1 | LEGACY_VALUE (negative/edge test) |

Total plans: **18**. Master-backed: **0 / 18**.

## 2. Engagement type (`engagement_type`)

| Value | Rows | Classification |
|---|---|---|
| Planned Audit | 67 | UNKNOWN (no master; matches one hardcoded list only) |
| Operational | 19 | UNKNOWN — not present in ANY of the three UI arrays |
| Assurance | 15 | UNKNOWN — not present in any UI array |
| Compliance | 2 | UNKNOWN — not present in any UI array |

**36 of 103 engagements carry a type that no current UI dropdown can produce**,
proving values entered through non-UI paths (RPC/helper/migration).

## 3. Coverage category (`coverage_category`)

| Value | Rows | Classification |
|---|---|---|
| (null) | 36 | MISSING |
| High | 33 | **INVALID — risk rating stored in a coverage column** |
| Core Coverage | 13 | UNKNOWN |
| Critical | 8 | **INVALID — risk rating** |
| Medium | 5 | **INVALID — risk rating** |
| Risk-Driven | 4 | UNKNOWN |
| Cyclical | 3 | UNKNOWN |
| Compliance | 1 | matches UI array |

Only **1 of 103** rows carries a value from the screen's own list. 46 rows hold
risk-band values. This is the strongest single piece of evidence for DEF-E2E-008.

## 4. Risk rating (`engagement_risk_rating`)

Critical 22 / High 64 / Medium 16 / Low 1 — all four values align with the
existing `ia_risk_classification_thresholds` vocabulary. Classification: `VALID`
by value, `UNVALIDATED` by mechanism (no server allow-list, no FK).

## 5. Quarter

Q1 43 / Q2 25 / Q3 18 / Q4 8 / null 9. Manually selected, never derived from the
fiscal calendar. Cross-consistency with `planned_start_date` was **not** enforced
at entry and cannot be asserted retrospectively.

## 6. Relationship integrity

| Check | Count | Verdict |
|---|---|---|
| Engagements with null `department_id` | 0 | PASS |
| Engagements with `department_id` not in `ia_departments` | **1** | **ORPHAN** |
| Engagements with null `function_id` | 6 | MISSING (non-mandatory today) |
| Engagements with `function_id` not in `ia_department_functions` | 0 | PASS |
| Function belonging to a different department than the engagement | 0 | PASS |

Orphan record: engagement `6311e399-1692-4085-bc6d-f474da2fd2a1`
(code `IT Department `, note trailing space — itself format drift),
`department_id = 9f41ea43-2678-456c-9323-8ec514ad7f8c` (no such department).
It is **not** part of the FY2032 Phase-E plan.

## Summary counts

- Records scanned: 18 plans, 103 engagements.
- `VALID`: risk ratings only.
- `MISSING_MASTER`: 18 fiscal years.
- `UNKNOWN` classifications on active data: 103 engagement types, 67 coverage values.
- `ORPHAN`: 1.
- `FORMAT_DRIFT`: 5 fiscal-year values + 1 engagement code.
- Data mutated during this stage: **0**.
