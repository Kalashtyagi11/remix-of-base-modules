# IA Stage 2A — Enterprise Fiscal Calendar Convergence & Certification

Date: 2026-09-02
Starting HEAD: `9a4fa0b85eea81b8928567217ca31fdd3796faf5`
Final HEAD: `f8d8a53d8065e986b6f696b478db610e55fafe1c`

Stage-1 discovery evidence is unmodified. This document certifies Stage 2A only.

## 1. Stage-2A changes present since `0d18046d`

| Area | Artefact |
|---|---|
| Migration (foundation) | `supabase/migrations/20260902110600_0e400355-f6b6-47cc-87fd-6241e3d808d5.sql` |
| Migration (this wave) | fiscal Configuration Health function + `anon` write revoke on `core_fiscal_year` |
| Table | `public.core_fiscal_year` |
| Columns added | `ia_annual_plans.fiscal_year_id`, `ia_follow_ups.fiscal_year_id`, `ia_plan_carry_forward.target_fiscal_year_id` |
| Functions | `core_fiscal_year_guard`, `core_fiscal_year_set_updated_at`, `core_fiscal_year_for_date`, `core_fiscal_quarter_of`, `core_fiscal_year_planning_eligible`, `core_fiscal_calendar_epoch`, `zz_ia_annual_plan_fiscal_guard`, `zz_ia_engagement_fiscal_guard`, `zz_ia_follow_up_fiscal_guard`, `zz_ia_carry_forward_fiscal_guard`, `ia_fiscal_configuration_health` |
| Reconciliation | `ia_fiscal_year_migration_map` (explicit, no silent coercion) |
| Services / hooks | `src/services/core/fiscalCalendarService.ts`, `src/hooks/useFiscalYears.ts`, `src/hooks/useFiscalConfigurationHealth.ts` |
| UI routes | `/admin/fiscal-calendar` (platform master admin), `/audit/configuration-health` (IA diagnostics) |
| UI components converged this wave | `CarryForwardBoard.tsx`, `RiskAssessment.tsx`, `RiskRegister.tsx`, `PlanningWizard.tsx` (all fiscal selectors now master-backed; no `new Date().getFullYear()` authority) |
| Already converged | `AnnualPlanForm.tsx`, `AddEngagementToPlanForm.tsx`, `EditEngagementDialog.tsx` (quarter derived) |

## 2. Fiscal master structure

| Property | Value |
|---|---|
| Table | `public.core_fiscal_year` |
| Primary key | `id uuid` |
| Code | `code` (unique per organisation, case-insensitive) |
| Display label | `display_name` |
| Period | `start_date`, `end_date` (check `start_date <= end_date`) |
| Active status | `is_active` |
| Organisation scope | `organization_id → core_organization(id)` |
| Planning eligibility | `planning_open` + `status <> 'CLOSED'` + `is_active` |
| Lifecycle | `status ∈ DRAFT / OPEN / CLOSED`; years are never deleted |
| Overlap | inclusive `daterange` trigger per organisation |

Seeded: FY2025 (CLOSED) and FY2026–FY2030 (OPEN, planning open) — calendar-year
periods, consistent with `fiscal_year_start_month = 1` for SKN.

## 3. Legacy reconciliation of the 18 plans

| Classification | Plans |
|---|---|
| Deterministically mapped to master | 4 (`2027`, `2028`, `2029` family) |
| Retained legacy / test fixtures (`*-CANARY`, `2099-2100`) | 4 |
| Retained pending business decision (`2025-2026`, `2026-2027`, `2027-2028`) | 8 |
| Retained historical snapshots (`2031`, `2032`) | 2 |
| **Silent mappings** | **0** |

No fiscal-year master rows were fabricated for canary, negative-test or
dirty-format values.

## 4. FY2032 (Phase-E baseline)

- Plan `5dd6a953-663c-4e70-9c72-e3d72dd01571` — status **Closed**.
- Engagements: **20 total / 20 terminal** — unchanged.
- `fiscal_year_id` is NULL by design: FY2032 **remains a historical legacy test
  snapshot**, readable everywhere, lifecycle history not rewritten.

## 5. Negative tests (authenticated, all rolled back)

| # | Scenario | Result |
|---|---|---|
| N1 | New plan with no fiscal year | DENIED `IA_FISCAL_YEAR_REQUIRED` |
| N2 | Random fiscal-year id | DENIED `IA_FISCAL_YEAR_NOT_FOUND` |
| N3 | Inactive / closed year (FY2025) | DENIED `IA_FISCAL_YEAR_NOT_ELIGIBLE` |
| N4 | Overlapping fiscal year | DENIED `CORE_FISCAL_YEAR_OVERLAP` |
| N5 | Duplicate code | DENIED (unique index) |
| N6 | `start_date > end_date` | DENIED `CORE_FISCAL_YEAR_INVALID_RANGE` |
| N7 | Free-text carry-forward target | DENIED `IA_FISCAL_YEAR_REQUIRED` |
| N8 | Engagement outside the fiscal year | DENIED `IA_ENGAGEMENT_DATE_OUT_OF_FISCAL_YEAR` |
| N9 | Arbitrary follow-up fiscal text | Text neutralised — persisted `fiscal_year = NULL`, never authoritative |
| N10 | Manipulated quarter on insert | Overwritten by the derived value (Q3 for 2029-08-15) |

## 6. Positive canary (rolled back, no residue)

One FY2029 master-backed plan + engagement: `fiscal_year_id` persisted and FK
valid, text snapshot `FY2029`, `planned_start_date 2029-08-15` derived
`Q3` / `August`, out-of-period engagement denied, governed exception path
accepted. Transaction rolled back — **no unexplained open plan remains**.

## 7. Configuration Health — live result

`/audit/configuration-health` (`ia_fiscal_configuration_health`, authenticated only):

| Check | Result |
|---|---|
| FISCAL_MASTER_PRESENT | PASS (6 active years) |
| FISCAL_PLANNING_OPEN | PASS (5 eligible) |
| PLAN_MISSING_CANONICAL_YEAR | PASS (0) |
| PLAN_LEGACY_FISCAL_TEXT | HISTORICAL (14, informational) |
| ENGAGEMENT_DATES_IN_FISCAL_YEAR | PASS (0) |
| QUARTER_DERIVATION_CONSISTENT | PASS (0) |
| CARRY_FORWARD_TARGET_VALID | PASS (0) |
| FOLLOW_UP_FISCAL_GOVERNED | PASS (0) |

**Fiscal CRITICAL blockers: 0.** Legacy records are reported as historical, not
as current blockers.

## 8. Regression

Typecheck PASS · build PASS (`build OK` at final HEAD) · Phase-E baseline
integrity PASS. `anon` INSERT/UPDATE on `core_fiscal_year` revoked. Linter totals
are unchanged from the pre-existing platform baseline (documented no-RLS
architecture); no new class of finding was introduced. OBS-E2E-D remains open and
unchanged.

## 9. Verdict

| Gate | Result |
|---|---|
| Fiscal Master | PASS |
| Annual Plan master-backed | PASS |
| Legacy reconciliation | PASS |
| FY2032 history preserved | PASS |
| Quarter derived | PASS |
| Date validation | PASS |
| Follow-Up fiscal governance | PASS |
| Carry-forward fiscal governance | PASS |
| Report/filter consistency | PASS |
| Configuration Health | PASS |
| Positive canary | PASS |
| Negative tests | PASS |
| Phase-E baseline | PASS |
| Typecheck | PASS |
| Build | PASS |
| DEF-E2E-006 | CLOSED |
| **STAGE 2A** | **PASS** |
| **READY FOR STAGE 2B** | **YES** |

---

# Security Closure Addendum — Stage 2A-S (DEF-E2E-013)

Date: 2026-09-02 · Starting HEAD: `0a2f12bc2cd4e7d6827201618566ec1453b05bac`

The earlier Stage 2A PASS (functional/master-data convergence, DEF-E2E-006 CLOSED)
stands unchanged. This addendum records the remaining authorization gap and its
remediation. No Stage 2A design was rebuilt; FY2032 Phase-E estate untouched.

## 1. DEF-E2E-013 — Enterprise Fiscal Master mutation authorization

**Previous gap.** The foundation migration granted `authenticated` INSERT/UPDATE/DELETE
on `public.core_fiscal_year`, and `fiscalCalendarService` performed direct client DML
(`.insert()`, `.update()`), supplying `organization_id` (client-side `org_code='SKN-SSB'`
lookup) and `created_by`/`updated_by` (`userCode`) from the browser. Only `anon` write
revocation had been evidenced. UI `PermissionWrapper` was the only authority — not backend
authorization.

## 2. Remediation

Forward-only, additive migrations:

- Revoked `INSERT/UPDATE/DELETE` (and all privileges for `anon`) on `public.core_fiscal_year`;
  retained `SELECT` for `authenticated`; `service_role` retains administrative authority.
- Enabled RLS with a read-only `authenticated` SELECT policy.
- Central capability `public.core_master_data_actor_can(uuid)` — platform/system
  administration authority only (`is_admin`, or `has_permission(..., 'admin_master_data'|
  'enterprise_configuration_centre', 'manage')`). **No Internal Audit permission was created**;
  HIA, Lead Auditor, Audit Admin, Team Member, Quality Reviewer and Management Respondent
  receive no fiscal-master authority.
- Server-derived organisation: `public.core_current_organization_id()` (single-organisation
  deployment — `SKN-SSB`, the only row in `core_organization`; the browser can no longer name
  an organisation).
- Governed commands (SECURITY DEFINER, `search_path=public`, EXECUTE granted to
  `authenticated` only, authority enforced inside):
  `core_fiscal_year_create`, `core_fiscal_year_update`, `core_fiscal_year_set_status`,
  `core_fiscal_year_set_active`. Each derives `auth.uid()`, resolves the canonical profile and
  actor code, resolves the organisation, checks the capability, validates business rules
  (code required, dates required, status domain; existing overlap/range/unique guards retained)
  and writes provenance to `core_audit_log` (`CORE.FISCAL_YEAR.*`).
- Frontend: `src/services/core/fiscalCalendarService.ts` now calls the RPCs only; direct client
  DML and `getDefaultOrganizationId()` removed; `userCode` removed as mutation identity from
  `src/hooks/useFiscalYears.ts`. Client direct Fiscal Master DML remaining: **0**.

## 3. Live privilege proof (TEST, `pg_class.relacl`)

```
core_fiscal_year  rowsecurity = t
  postgres       = arwdDxtm
  authenticated  = rDxtm        (SELECT only — no a/w/d)
  service_role   = arwdDxtm
  anon           = (none)
```
Function ACLs: `core_fiscal_year_{create,update,set_status,set_active}` = `authenticated`,
`service_role` only; `_core_fiscal_require_admin`, `_core_fiscal_audit` = `service_role` only.

## 4. Negative authorization tests (real authenticated personas, live REST)

| Persona | Direct INSERT | Direct UPDATE | Direct DELETE | Governed RPC |
|---|---|---|---|---|
| anon | 401 denied | 401 denied | 401 denied | 401 denied (also SELECT denied) |
| IA_HEAD_OF_INTERNAL_AUDIT | 403 denied | 403 denied | 403 denied | 403 `FISCAL_MASTER_FORBIDDEN` |
| IA_LEAD_AUDITOR | 403 denied | 403 denied | n/a | 403 `FISCAL_MASTER_FORBIDDEN` |
| IA_AUDIT_ADMIN (no platform authority) | 403 denied | 403 denied | n/a | 403 `FISCAL_MASTER_FORBIDDEN` |
| IA_TEAM_MEMBER | 403 denied | 403 denied | n/a | 403 `FISCAL_MASTER_FORBIDDEN` |
| IA_MANAGEMENT_RESPONDENT | 403 denied | 403 denied | n/a | 403 `FISCAL_MASTER_FORBIDDEN` |

Read access for IA personas remains available (SELECT 200) — planning selectors unaffected.

## 5. Positive administrator test

Platform/System Configuration Administrator `admin@secureserve.gov` (role `Admin`):

- Governed create `FY2099-TEST` → 200; `organization_id` server-resolved
  (`69afc88b-…-199e1ee1d416`), `created_by = SAdmin` server-derived from the profile.
- Direct table PATCH on the same row as the same admin → **403 denied** (no bypass path).
- Governed update (display name) → 200, `updated_by = SAdmin`.
- Governed close → `status=CLOSED`, `planning_open=false`.
- Governed deactivate → `is_active=false`. Test entry retained (never deleted) per policy.
- Business guards through the governed path: overlap → `CORE_FISCAL_YEAR_OVERLAP`;
  reversed dates → `CORE_FISCAL_YEAR_INVALID_RANGE`; bad status → `FISCAL_YEAR_STATUS_INVALID`.
- Audit provenance: 4 `CORE.FISCAL_YEAR.*` rows in `core_audit_log` with actor
  `62c928c3-…` / “System Admin”, entity `core_fiscal_year`, outcome SUCCESS.

## 6. Read scope

`listFiscalYears()` is unscoped by design: the deployment is intentionally single-organisation
(`core_organization` holds exactly one row, `SKN-SSB`, and all 6 fiscal years belong to it), so
no cross-organisation fiscal year can reach IA planning. If a second organisation is ever
onboarded, `listFiscalYears()` must be filtered by `core_current_organization_id()`.

## 7. Regression and baseline

| Check | Result |
|---|---|
| Annual Plan fiscal selector / plan creation with existing FY | PASS |
| Quarter derivation · Follow-Up · Carry-Forward | PASS |
| Configuration Health (`ia_fiscal_configuration_health`) | PASS — 0 fiscal CRITICAL failures, 14 historical INFO |
| FY2032 plan `5dd6a953-…` | Closed — UNCHANGED |
| Phase-E engagements | 20/20 Closed — UNCHANGED |
| Vitest (fiscal / IA suites) | 145 passed |
| Typecheck · Build | PASS · PASS |

**DEF-E2E-006: CLOSED. DEF-E2E-013: CLOSED. STAGE 2A FINAL: PASS.**
