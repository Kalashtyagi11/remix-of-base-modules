# Internal Audit — Stage 2B: Reference Master & Classification Convergence

**Verdict: PASS**
Scope: Audit Type, Coverage Category, Follow-Up Type. Stage 2C not started.

## 1. Canonical architecture

| Object | Purpose |
| --- | --- |
| `ia_reference_type` (PK `code`) | Typed classification domains: `AUDIT_TYPE`, `COVERAGE_CATEGORY`, `FOLLOW_UP_TYPE` |
| `ia_reference_value` | Governed values with stable code, display name, active/inactive lifecycle, provenance |
| `ia_reference_migration_map` | Legacy-text → canonical-value reconciliation record |

No duplicate masters were created for Fiscal Year, Department, Function, Process, auditor identity,
Activity Type, risk classification, severity, quarter/month or lifecycle status.

Live master: **25 active values** — 9 Audit Types, 9 Coverage Categories, 7 Follow-Up Types.

## 2. Server authority

Writes flow only through governed RPCs (`ia_reference_value_create`, `_update`, `_set_active`),
which derive the actor from `auth.uid()`, enforce `audit_configuration.configure`, and write audit
provenance (`IA_REFERENCE_VALUE_CREATED` / `_UPDATED`). Direct table DML is revoked.

Transactional guards `ia_engagement_reference_guard` and `ia_follow_up_reference_guard`
(SECURITY DEFINER, `search_path=public`) enforce, on every insert/update:

- canonical id must exist, be of the correct type and be active;
- display text is resolved against the active master when it changes (governed reclassification);
- a supplied id together with contradictory changed text is rejected;
- risk-band labels are rejected as coverage categories;
- stored text is always rewritten to the canonical display snapshot, so id and text can never diverge.

## 3. Live certification results

Positive (Head of Internal Audit persona):

| Case | Result |
| --- | --- |
| Governed create / update / deactivate / reactivate | 200, provenance recorded |
| Reclassify engagement coverage by canonical name | 200, id re-derived consistently |
| Valid follow-up type change | 200 |

Negative:

| Case | Error |
| --- | --- |
| Risk band as coverage (`High`) | `IA_INVALID_REFERENCE_SEMANTICS` |
| Unknown name (`Bogus`) | `IA_UNKNOWN_REFERENCE` |
| Wrong-type id (`RE_TEST` as coverage) | `IA_WRONG_REFERENCE_TYPE` |
| Id + contradictory changed text | `IA_REFERENCE_TEXT_CONFLICT` |
| Retired value by name / by id | `IA_UNKNOWN_REFERENCE` / `IA_INACTIVE_REFERENCE` |
| Direct REST insert/update/delete on reference tables | 403 |
| Lead Auditor, Team Member, Quality Reviewer, Management Respondent create | `IA_NOT_AUTHORIZED: audit_configuration.configure required` |
| Anonymous table read / RPC | 401 |

## 4. Security posture

`anon` and `authenticated` hold no table privileges beyond `SELECT`; service role retains
management. RLS enabled with an authenticated read policy on all three objects. `PUBLIC` and `anon`
EXECUTE was revoked from reference helper functions; only required authenticated helpers remain.

## 5. Frontend convergence

Single governed source of classification options:

- `src/services/audit/iaReferenceService.ts`
- `src/hooks/audit/useIaReferenceValues.ts`
- `src/components/audit/reference/IaReferenceSelect.tsx`
- `src/pages/audit/AuditReferenceMasters.tsx` (`/audit/reference-masters`, entitlement-gated)

Consumers rewired: `AuditEngagements.tsx`, `AddEngagementToPlanForm.tsx`, `EditEngagementDialog.tsx`,
`AuditFollowUpsTab.tsx`. Census confirms **no hardcoded classification arrays or defaults remain** in
`src/components/audit` / `src/pages/audit`; residual seed defaults (`Planned Audit`,
`Action Verification`) were removed so every value originates from the master.
Reference health is surfaced on `AuditConfigurationHealth.tsx`.

## 6. Historical integrity

FY2032 plan `5dd6a953-663c-4e70-9c72-e3d72dd01571` remains **Closed** with 20 closed engagements;
the migration deliberately excluded closed-plan records (`IA_PLAN_CLOSED` guard respected).
Reported, never rewritten, historical residue:

- 89 engagements without an audit type id
- 104 engagements without a coverage category id
- 47 legacy risk-band coverage values
- 1 follow-up without a type id

Retired values stay readable on the records that carry them and are non-selectable for new work.

## 7. Verification run

- Typecheck: pass
- Build: pass
- Vitest: 6896 passed / 31 failed — all failures in legacy `communication-hub` suites tracked as
  **OBS-E2E-D**; no Internal Audit or reference test failed.
- Test probe values `PROBE_HIA`, `PROBE_HIA2` deactivated through the governed lifecycle
  (physical delete correctly denied).

## 8. Open items carried forward

- OBS-E2E-D: legacy communication-hub test drift.
- Project-wide Supabase linter findings (4027) are pre-existing and platform-wide, not introduced by
  Stage 2B.
