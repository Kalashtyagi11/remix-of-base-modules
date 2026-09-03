# INTERNAL AUDIT — STAGE 2D
## Department / Function Referential Integrity Convergence (DEF-E2E-011)

Date: 2026-09-03
Scope: Stage 2D only. DEF-E2E-012 (workflow status) and the five deferred Stage 2C
authoritative-number references are explicitly out of scope and untouched.

---

## 1. Read-only rebaseline

| Item | Value |
|---|---|
| Rebaseline HEAD | `0814d4d9b` — "Certified Stage 2C engagement codes" |
| Commits after Stage 2C certification commit `0814d4d9b…` | none at rebaseline |
| Working tree at rebaseline | clean |
| Closing HEAD | `7336906e6` |

Certified-state reconfirmation (live database, read-only):

| Baseline | Result |
|---|---|
| Stage 2A — `core_fiscal_year` | 7 fiscal years present — PASS |
| Stage 2B — `ia_reference_value` | 25 active values (9 Audit Type, 9 Coverage Category, 7 Follow-Up Type) — PASS |
| Stage 2C — `core_number_sequence` `INTERNAL_AUDIT/ENGAGEMENT` | active, current_number 27 at rebaseline → 31 after Stage 2D tests — PASS |
| FY2032 plan `5dd6a953-663c-4e70-9c72-e3d72dd01571` | Closed, 20 engagements, 20 terminal (20/20) |

No certified history was modified during rebaseline.

---

## 2. Full relationship census

Census at rebaseline (132 engagements) and after Stage 2D testing/disposition (136 engagements —
the 4 additional rows are Stage 2D test engagements, all disposed as Cancelled / inactive):

| Measure | Rebaseline | Final | Classification |
|---|---|---|---|
| Engagements total | 132 | 136 | — |
| Null `department_id` | 27 | 28 | OPTIONAL_NULL (standalone engagements are permitted) |
| Department ID not in `ia_departments` | 1 | 1 | ORPHAN → REQUIRES_BUSINESS_DECISION (§7) |
| References to inactive departments | 12 | 12 | INACTIVE_HISTORICAL |
| Null `function_id` | 33 | 35 | OPTIONAL_NULL |
| Function ID not in `ia_department_functions` | 0 | 0 | VALID |
| References to inactive functions | 12 | 12 | INACTIVE_HISTORICAL |
| Function belonging to a different Department | 0 | 0 | VALID |
| Functions whose Department no longer exists | 0 | 0 | VALID |
| Active functions under inactive Departments | 5 | 5 | INACTIVE_HISTORICAL (surfaced as WARNING in health) |
| Active departments with no `head_profile_id` | 2 | 2 | REQUIRES_BUSINESS_DECISION (organisation data, not integrity) |

Related tables:

| Table | Invalid Department | Invalid Function | Cross-parent |
|---|---|---|---|
| Risk assessments | 0 | 0 | 0 |
| Risk register | 0 | 0 | 0 |
| Annual plans | 0 | 0 | n/a |
| Findings | 0 | n/a | n/a |
| Follow-ups | 0 | n/a | n/a |
| Action tracking | 0 | 2 (ORPHAN, historical action rows) | n/a |
| Audit universe | 0 | 0 | 0 |
| RCM processes | 0 | n/a | n/a |

Nothing was silently repaired during census.

---

## 3. Canonical relationship

Department → Function → Process → Risk → Control → Audit Procedure is preserved.
`ia_departments` and `ia_department_functions` remain the sole masters; no duplicate
master, no parallel hierarchy, and Function is not conflated with Process.

---

## 4. Server-side validation (new)

Additive trigger `zz_ia_engagement_org_ref_guard` (BEFORE INSERT OR UPDATE OF
`department_id`, `function_id`) executing `public.ia_engagement_org_ref_guard()`:

| Condition | Deterministic error |
|---|---|
| Department ID not found | `IA_UNKNOWN_DEPARTMENT` |
| Department inactive | `IA_INACTIVE_DEPARTMENT` |
| Function ID not found | `IA_UNKNOWN_FUNCTION` |
| Function inactive | `IA_INACTIVE_FUNCTION` |
| Function parent ≠ engagement department (or function has no department) | `IA_INVALID_FUNCTION_PARENT` |

Historical rows are not revalidated: the guard fires only on insert or when a reference
actually changes, so existing records stay readable and editable for unrelated fields.
`EXECUTE` on the guard function is revoked from `PUBLIC`, `anon` and `authenticated`.

---

## 5. Database referential integrity (pre-existing, verified)

| Constraint | State |
|---|---|
| `ia_audit_engagements_department_id_fkey` → `ia_departments(id)` | valid, enforced |
| `ia_audit_engagements_function_id_fkey` → `ia_department_functions(id)` | valid, enforced |
| `ia_department_functions_department_id_fkey` → `ia_departments(id)` ON DELETE CASCADE | valid, enforced |

A direct orphan insert is rejected at foreign-key level. Parent consistency and active-status
rules are not expressible as FKs and are therefore enforced by the Stage 2D trigger.

---

## 6. Function reparenting protection

`ia_department_function_guard_reparent` retested under an authenticated Head-of-Internal-Audit
session:

- reparenting a function with audit history → rejected, `23514`: *"This function already has audit
  history and cannot be moved to another department. Deactivate it and create it under the new
  department instead."*
- reparenting a function with no audit history → permitted (legitimate configuration authority).

Recommended reorganisation pattern is unchanged: deactivate the old function, create the new one
under the new department.

---

## 7. Known orphan — disposition

| Attribute | Value |
|---|---|
| Engagement | `6311e399-1692-4085-bc6d-f474da2fd2a1` |
| Name | `IT Department ` (trailing space) |
| Missing department UUID | `9f41ea43-2678-456c-9323-8ec514ad7f8c` |
| `function_id` | NULL |
| Annual plan | `c3cae1a0-2abb-48b3-b6b7-4b6f8c35aacc` (not the certified FY2032 plan) |
| Status | Cancelled |
| Created | 2026-03-09 by `ASING` |

Evidence searched: change/event history, department audit links, source-department mapping,
other engagements referencing the same UUID, and plan-level references. **No deterministic trace
exists.** The only candidate ("Information Technology") rests on name similarity alone.

**Classification: `REQUIRES_BUSINESS_DECISION`.** No mapping was fabricated and the record was not
mutated. It remains visible, reported by Configuration Health check `IA-ORG-02` as a tolerated
historical exception, and its terminal (Cancelled) status means it cannot re-enter live audit work.

---

## 8. UI convergence

Inspected: `AuditEngagements.tsx`, `AddEngagementToPlanForm.tsx`, `EditEngagementDialog.tsx`,
`AuditPlanForm.tsx`, `AutoPlanSuggestions.tsx`, `DepartmentAuditForm.tsx`, `CoverageRiskTab.tsx`,
risk assessment/register surfaces, carry-forward, prior-audit history and Action Centre.

Findings — already converged, no changes required:

- All selectors consume the canonical hooks `useIADepartments()` (active-only, via
  `v_ia_departments`) and `useIADepartmentFunctions(departmentId)` (active-only, department-scoped).
- Changing Department clears the selected Function on every create/edit path.
- Historical readability is preserved through `formatDepartmentLabel()` and function name maps
  rather than by re-querying only active masters.
- No local duplicated master arrays were found in these surfaces.

Frontend filtering is treated as convenience only; the database guard is authority.

---

## 9. Transaction test matrix

Positive (governed paths):

| Case | Result |
|---|---|
| Engagement with active Department only | created, `IA-ENG-SKN-2026-000028` |
| Engagement with active Department + child Function | created, `…-000029` |
| Standalone engagement, no Department/Function | created, `…-000030` |
| Authenticated (HIA) REST create with valid Department + Function | created, `…-000031` |
| Function reparent without history | permitted |

Negative:

| Case | Result |
|---|---|
| Random Department UUID | `IA_UNKNOWN_DEPARTMENT` |
| Random Function UUID | `IA_UNKNOWN_FUNCTION` |
| Function from another Department | `IA_INVALID_FUNCTION_PARENT` |
| Inactive Department | `IA_INACTIVE_DEPARTMENT` |
| Inactive Function under active Department | `IA_INACTIVE_FUNCTION` |
| Function with no parent Department | `IA_INVALID_FUNCTION_PARENT` |
| Direct REST create with unknown Department (authenticated HIA) | rejected `P0001 IA_UNKNOWN_DEPARTMENT` |
| Direct REST create with cross-parent Function (authenticated HIA) | rejected `P0001 IA_INVALID_FUNCTION_PARENT` |
| Anonymous REST insert | `401 / 42501 permission denied for table ia_audit_engagements` |
| Team Member creates a Department | `403 / 42501 RLS violation` |
| Team Member updates a Department / reparents a Function | 0 rows affected (RLS `USING` blocks); no mutation |

All Stage 2D test engagements (`…-000028` … `…-000031`) and the temporary probe function
`STAGE2D INACTIVE PROBE` were dispositioned through the authenticated governed path as
Cancelled / inactive and retained as evidence. Nothing was hard-deleted.

---

## 10. Historical semantics

Deactivating a Department or Function does not cascade, does not rewrite engagements, and does not
remove historical readability. Inactive references stay resolvable on old records while being
unselectable for new work. No audit history was rewritten in this wave.

---

## 11. Configuration Health

New read-only hook `src/hooks/audit/useIaOrgIntegrityHealth.ts`, surfaced on
`src/pages/audit/AuditConfigurationHealth.tsx` as *"Department / Function integrity checks
(Stage 2D)"*:

| Check | Meaning | Current |
|---|---|---|
| IA-ORG-01 | Live engagement with non-existent Department (CRITICAL) | PASS (0) |
| IA-ORG-02 | Terminal engagement with unresolvable Department | HISTORICAL (1 — §7) |
| IA-ORG-03 | Engagement with non-existent Function (CRITICAL) | PASS (0) |
| IA-ORG-04 | Function paired with wrong parent Department (CRITICAL) | PASS (0) |
| IA-ORG-05 | Function whose parent Department no longer exists (CRITICAL) | PASS (0) |
| IA-ORG-06 | Active Function under inactive Department (WARNING) | 5 |
| IA-ORG-07 | Engagements referencing inactive Departments | HISTORICAL (12) |
| IA-ORG-08 | Active Department without a Department Head (WARNING) | 2 |

Live critical breaks and tolerated historical context are visually and semantically distinct.

---

## 12. Security / governance

- No IA role was broadened. Authority matrix confirmed live: only `audit.admin` and `audit.hia`
  hold `audit_configuration.configure`; Lead Auditor, Auditors, QA and all Management Respondent
  personas hold none.
- `ia_departments` / `ia_department_functions` remain RLS-protected with insert/update/delete gated
  on `ia_has('audit_configuration','configure') OR ia_is_audit_admin()`, read gated on `ia_is_ia_user()`.
- Actor identity is derived server-side; no client-supplied actor is trusted.
- Guard functions revoked from `PUBLIC`, `anon`, `authenticated`.
- Service-role shortcuts were not used for certification; all persona proofs ran through
  authenticated REST with least-privileged test users.
- Supabase linter output is the unchanged project-wide baseline; the wave introduced no new class
  of finding.

---

## 13. Regression

| Item | Result |
|---|---|
| Stage 2A fiscal master | PASS (7 fiscal years, governed RPCs untouched) |
| Stage 2B reference masters | PASS (25 active values) |
| Stage 2C numbering | PASS (sequence active, central allocation on all new rows) |
| Standalone + plan-linked engagement creation | PASS |
| Engagement editing, Annual Plan, Risk Assessment/Register, carry-forward, prior history, Action Centre | PASS (no code change required) |
| FY2032 integrity | Closed · 20/20 preserved |
| Typecheck | PASS |
| Build | build OK |
| Vitest (`src/__tests__`) | 5830 passed / 3 failed — all 3 pre-existing, unrelated drift (`omni-comms/build4a-certification-mechanism`, `comm-hub/readinessReadOnly`, `tmp_findings_render`), tracked under OBS-E2E-D |

---

## 14. Verdict

New invalid Department/Function relationships are impossible on every supported path: FKs block
non-existent references, the Stage 2D trigger blocks inactive references and wrong parents, RLS
blocks unauthorised master mutation, and the reparent guard protects functions with audit history.
The single historical orphan is explicitly classified with evidence rather than fabricated into a
false relationship, and Configuration Health distinguishes it from a live break.

STAGE 2D — DEPARTMENT / FUNCTION REFERENTIAL INTEGRITY CONVERGENCE: PASS
DEF-E2E-011: CLOSED
STAGE 2A: PASS (unchanged)
STAGE 2B: PASS (unchanged)
STAGE 2C: PASS (unchanged)
FY2032 PLAN: CLOSED · 20/20
KNOWN ORPHAN `6311e399-1692-4085-bc6d-f474da2fd2a1`: REQUIRES_BUSINESS_DECISION (tolerated, reported)
STAGE 2E: NOT STARTED
