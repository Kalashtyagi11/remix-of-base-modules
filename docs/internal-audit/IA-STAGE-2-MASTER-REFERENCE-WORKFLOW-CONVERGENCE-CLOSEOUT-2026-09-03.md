# Internal Audit — Stage 2 Convergence Closeout

Master Data · Reference Data · Derived Values · Organisational References · Workflow Vocabulary · Validation UX

Date: 2026-09-03 (UTC 2026-09-02T22:xx) · Certification / reconciliation wave (read-only)
Stage 2F: NOT STARTED.

## 1. Rebaseline

| Item | Value |
|---|---|
| Starting HEAD | `363756074c5b495f56c7f5b208117ec85849e558` |
| Final HEAD | `363756074c5b495f56c7f5b208117ec85849e558` (unchanged — no code or database change was required) |
| Branch | `edit/edt-a93cf966-01c7-4593-9417-6049c5d63579` |
| Working tree | clean |
| Commits since reference commit | 0 (HEAD **is** the reference commit) |
| Runtime / database | Lovable Cloud TEST project, live catalogue queried directly |
| Migrations applied in this wave | none |
| Code changes in this wave | none |

Because HEAD has not advanced past the certified commit, no post-Stage-2 work can have invalidated Stage 2A–2E or IA-UX-VAL-001. All findings below are live re-proofs, not restatements.

Probe hygiene: every write attempt in this wave was executed inside an aborted PL/pgSQL block; no Internal Audit row was created, changed or deleted. One central numbering value (`IA-ENG-SKN-2026-000032`) was consumed and discarded by the rolled-back numbering probe — expected non-gapless sequence behaviour, no data impact.

## 2. Final information-ownership register

| Business Concept | Class | Canonical Owner | UI Source | Server Validation | Historical Handling | Final State |
|---|---|---|---|---|---|---|
| Fiscal Year | A — Enterprise Master | `public.core_fiscal_year` | `useFiscalYears` / `usePlanningEligibleFiscalYears` | governed RPCs only; `authenticated` has SELECT only (INSERT/UPDATE/DELETE = false) | closed years readable; legacy text plans keep label when `fiscal_year_id` is null | CONVERGED |
| Fiscal Quarter | D — Derived | derived from fiscal calendar (`getQuarterFromDate(date, fiscalYears)`) | read-only derived display | derived server-side on governed writes | historical values readable | CONVERGED |
| Department | A — Enterprise Master | `ia_departments` (org master) | department selectors | `ia_engagement_org_ref_guard` (`IA_UNKNOWN_DEPARTMENT`) | 1 tolerated orphan (see §7) | CONVERGED |
| Business Function | A — Enterprise Master | `ia_department_functions` | function selector scoped by department | `IA_INVALID_FUNCTION_PARENT`, unknown/inactive rejection | 0 orphans | CONVERGED |
| User / actor identity | A — Enterprise Master | `profiles.id` | session identity | actor server-derived in governed commands | preserved | CONVERGED |
| Audit Type | B — IA Reference Master | `ia_reference_value` / `AUDIT_TYPE` | `IaReferenceSelect` | `ia_reference_assert_id`, `ia_reference_resolve`, `ia_engagement_reference_guard` | inactive values readable on history | CONVERGED |
| Coverage Category | B — IA Reference Master | `ia_reference_value` / `COVERAGE_CATEGORY` | `IaReferenceSelect` | same; risk-band labels rejected | historical nulls tolerated | CONVERGED |
| Follow-Up Type | B — IA Reference Master | `ia_reference_value` / `FOLLOW_UP_TYPE` | `IaReferenceSelect` | `zz_ia_follow_up_reference_guard` | historical text readable | CONVERGED |
| Risk band / rating | B (existing canonical risk architecture) | IA risk configuration (`riskEngine.ts` + risk config master) | risk screens | risk engine | unchanged | CONVERGED (no duplicate risk master) |
| Plan / Engagement / Finding / Action / Follow-Up / Report / QA states | C — Governed Workflow Vocabulary | server lifecycle functions; frontend mirror `src/config/auditWorkflowVocabulary.ts` | read-only status displays and governed commands | `zz_ia_workflow_status_guard` on 7 tables (`IA_USE_GOVERNED_COMMAND`) | legacy values classified `LEGACY_READABLE` | CONVERGED (no Status Master) |
| Engagement Code | D — Derived / System Generated | `core_number_sequence` → `INTERNAL_AUDIT / ENGAGEMENT` via `core_generate_number` | never entered | `zz_ia_engagement_code_guard`: browser value discarded, immutable after allocation | 105 legacy-format codes readable | CONVERGED |
| Finding / Working Paper reference | D — Derived (server, non-central) | table-local sequences + triggers | never entered | `ia_assign_finding_reference`, `ia_assign_working_paper_reference` | readable | DEFERRED to Stage 2F |
| Scope, objectives, rationale, notes, management response | E — Transactional / Narrative | transaction row | free text (intended) | length/presence validation only | preserved verbatim | CORRECT BY DESIGN |

AMBIGUOUS OWNERSHIP = **0**.

## 3. Stage 2A — Fiscal calendar closeout

- `core_fiscal_year` privileges for `authenticated`: SELECT = true, INSERT/UPDATE/DELETE = **false**, RLS enabled. Mutation is possible only through `core_fiscal_year_create` / `_update` / `_set_status` / `_set_active` (all present).
- Direct insert as `authenticated`: **DENIED** — `permission denied for table core_fiscal_year`.
- Actor and organisation remain server-derived inside the governed RPCs; operational IA roles (HIA, Lead, Team, QA, Management) hold no fiscal-master write privilege because the table grant itself excludes them — HIA does not inherit master-data administration.
- Live master state: 7 fiscal years (5 OPEN, 2 CLOSED); closed years and historical plans remain readable.
- Quarter is derived from the fiscal calendar (`getQuarterFromDate(date, fiscalYears)`); no manual quarter input exists in IA data entry.

Fiscal-year source census (`new Date().getFullYear()` in IA source) — every hit classified:

| Location | Classification |
|---|---|
| `AnnualPlanForm.tsx:34` | presentation — default *title* text only; fiscal year comes from `useFiscalYears` |
| `EditEngagementDialog.tsx:469` | presentation — advisory warning comparing start date to the plan's fiscal year |
| `RiskAssessment.tsx:275` | presentation — default assessment-year field (not fiscal master) |
| `AuditReportBuilderStudio.tsx`, `AuditReportTab.tsx`, `AuditPlanProfilesTab.tsx`, `planOutputMapper.ts`, `auditPlanRenderEngine.ts`, `TemplateCommunicationDialog.tsx` | presentation/report-label fallbacks |

AUTHORITATIVE IA FISCAL-YEAR HARDCODES = **0** · MANUAL AUTHORITATIVE QUARTER ENTRY = **0**.

## 4. Stage 2B — Reference master closeout

Live master: 27 values / 25 active — AUDIT_TYPE 9 active, COVERAGE_CATEGORY 9 active, FOLLOW_UP_TYPE 7 active (2 inactive retained for history).

Negative proofs at the server boundary (all rolled back):

| Test | Result |
|---|---|
| Fiscal Year id supplied as `AUDIT_TYPE` | REJECTED |
| Audit Type id supplied as `COVERAGE_CATEGORY` | REJECTED |
| Coverage Category id supplied as `FOLLOW_UP_TYPE` | REJECTED |
| Risk band label `Critical` resolved as Coverage Category | REJECTED (unresolvable) |
| Random UUID as `AUDIT_TYPE` | REJECTED |
| Direct `ia_reference_value` insert as `authenticated` | DENIED — `permission denied for table ia_reference_value` |

Reference tables are SELECT-only for `authenticated`; administration runs through governed reference commands and `AuditReferenceMasters.tsx`. `IaReferenceSelect` is the only UI source; historical inactive values remain selectable only when already stored on the record. Risk classification continues to use the existing risk architecture — no duplicate risk master exists.

DUPLICATED AUTHORITATIVE REFERENCE ARRAYS = **0** · FREE-TEXT AUTHORITATIVE ENTRY PATHS = **0**.

## 5. Stage 2C — Authoritative engagement numbering

- Registration `INTERNAL_AUDIT / ENGAGEMENT` present; `core_generate_number` present; `zz_ia_engagement_code_guard` active.
- Non-destructive canary: insert with a browser-supplied code `BROWSER-FAKE-0001` → stored code was **`IA-ENG-SKN-2026-000032`** (client value discarded); insert rolled back.
- Renumbering update: **REJECTED** — `IA_ENGAGEMENT_CODE_IMMUTABLE`.
- Live: 136 engagements, **0** without a code, 31 centrally generated, 105 legacy-format historical codes; uniqueness remains database-enforced with the single documented historical duplicate exception preserved.
- Source census: no `Math.random()` or browser date generator is authoritative for engagement code (`auditAttachmentUpload.ts` uses `Math.random()` only for a storage filename suffix — non-authoritative).
- The original destructive 25-row concurrency test was not repeated; the existing certification plus this single canary is sufficient.

CLIENT-GENERATED ENGAGEMENT CODES = **0**.

## 6. Stage 2D — Department / Function integrity

Live reconciliation:

| Measure | Count |
|---|---|
| Active Department orphans | 1 (known exception) |
| Function orphans | 0 |
| Function → Department parent mismatches | 0 |
| Engagements with null department | 28 |
| Engagements with null function | 35 |

Negative proofs: unknown department → `IA_UNKNOWN_DEPARTMENT`; function belonging to another department → `IA_INVALID_FUNCTION_PARENT`. Inactive department/function rejection and function reparent protection remain enforced by `ia_engagement_org_ref_guard` (unchanged since Stage 2D certification; HEAD unchanged).

`6311e399-1692-4085-bc6d-f474da2fd2a1` remains **REQUIRES_BUSINESS_DECISION**. No deterministic evidence of the correct historical department emerged; no text-similarity guess was made. Configuration Health continues to expose it via `useIaOrgIntegrityHealth`.

## 7. Stage 2E — Workflow vocabulary

`src/config/auditWorkflowVocabulary.ts` remains the canonical typed frontend mirror; `auditWorkflowVocabulary.test.ts` passes (parity with `ia_transition_execution_status`, `ia_transition_finding`, `ia_action_*`, `ia_followup_record_outcome`).

Direct client PATCH proofs, executed as role `authenticated` with a real IA user's JWT claim (26 engagements visible, so the probe was not vacuously RLS-filtered):

| Domain | Attempt | Result |
|---|---|---|
| Engagement | `status = 'Fieldwork In Progress'` | DENIED — `IA_USE_GOVERNED_COMMAND` |
| Finding | `lifecycle_status = 'Closed'` | DENIED — `IA_USE_GOVERNED_COMMAND` |
| Corrective Action | `lifecycle_status = 'Verified'` (management self-verification) | DENIED — `IA_USE_GOVERNED_COMMAND` |
| Annual Plan (FY2032, terminal) | `status = 'Draft'` | DENIED — `IA_PLAN_CLOSED` |

`zz_ia_workflow_status_guard` is installed on engagements, findings, action tracking, annual plans, follow-ups, reports and quality reviews. Source census found **0** direct authoritative status `.update({ status … })` calls in IA UI code. No Status Master exists or was introduced.

DUPLICATED AUTHORITATIVE WORKFLOW ARRAYS = **0** · DIRECT CLIENT WORKFLOW BYPASSES = **0**.

## 8. Multi-tab / validation UX closeout

`src/lib/audit/tabValidation.ts` exists and remains presentation-level only (no RPC, no authority). `auditTabValidation.test.ts` (14 cases) and the IA lib suite pass: 6 files / 62 tests green. Behaviour re-verified by contract: owning-tab routing in declared tab order, per-tab error badges, consolidated clickable summary, inline `role="alert"` errors, focus/scroll anchors, deterministic next blocker after correction, restricted-tab safe blockers, and governed server-error routing that preserves the server message verbatim.

HIDDEN-TAB LOCAL-SAVE ERRORS = **0** · FINAL-ACTION BLOCKERS WITHOUT NAVIGATION = **0** · TAB NAVIGATION DATA LOSS = **0**.

## 9. Cross-domain boundary attack results

All eight attempted misuses failed deterministically at the server boundary (frontend not involved): fiscal-id-as-audit-type, audit-type-as-coverage, coverage-as-follow-up, risk-band-as-coverage, random UUID reference, unknown department, cross-parent function, forced renumbering — plus four direct workflow PATCHes and two direct master-table writes.

CROSS-DOMAIN REFERENCE BYPASSES = **0**.

## 10. Historical exception register

| Exception | Count | Classification | Operational Impact | New Transactions Allowed? | Health Check |
|---|---|---|---|---|---|
| Engagement `6311e399…` with non-existent department | 1 | REQUIRES_BUSINESS_DECISION | none (Cancelled) | No — guard rejects | Org integrity card |
| Legacy-format engagement codes (`ENG-…`) | 105 | HISTORICAL_READABLE | none | No — server allocates `IA-ENG-SKN-…` | Numbering card |
| Historical duplicate `ENG-2026-2027-001` | 1 group | SEMANTICALLY_INVALID_HISTORICAL | none | No — partial unique index | Numbering card |
| Engagements without `engagement_type_id` | 89 | LEGACY_UNMAPPED | reporting only | No — guard resolves/validates on write | Reference card |
| Engagements without `coverage_category_id` | 134 | LEGACY_UNMAPPED | reporting only | No | Reference card |
| Engagements with null department / function | 28 / 35 | HISTORICAL_READABLE | planning completeness | New work validated | Org integrity card |
| Retired reference values still referenced by history | 2 inactive values (0 active-work uses) | HISTORICAL_READABLE | none | No — inactive rejected for new work | Reference card |

HISTORICAL EXCEPTIONS = **7** classes. None were erased to reach zero.

## 11. Configuration health consolidation

Five non-overlapping domains, one card each, all mounted in `AuditConfigurationHealth.tsx`:

| Domain | Source | Severity semantics |
|---|---|---|
| Fiscal Calendar | `useFiscalConfigurationHealth` | CRITICAL for missing/misconfigured open year |
| IA Reference Masters | `useIaReferenceConfigurationHealth` | CRITICAL for live invalid classification, INFO for legacy nulls |
| Engagement Numbering | `useIaNumberingHealth` | CRITICAL for missing sequence, HISTORICAL for legacy duplicate |
| Department / Function | `useIaOrgIntegrityHealth` | CRITICAL for live orphan on new work, HISTORICAL for tolerated exception |
| Workflow Integrity | `useIaWorkflowIntegrityHealth` | CRITICAL for unknown live state, INFO for legacy readable |

No duplicate checks report the same condition twice. NEW TRANSACTION INTEGRITY CRITICALS = **0**.

## 12. Stage-2 security reconciliation

| Persona | Fiscal Master | IA Reference Master | Engagement Code | Workflow State | Operational IA work |
|---|---|---|---|---|---|
| Audit System Administrator | No (platform master-data authority only) | Yes, via governed reference commands | server only | governed commands | per capability |
| HIA | **No** | No | server only | governed commands | yes |
| Lead Auditor | No | No | server only | governed commands | yes (scoped) |
| Audit Team Member | No | No | server only | governed commands | yes (scoped) |
| Quality Reviewer | No | No | server only | governed QA commands | review only |
| Management Respondent | No | No | server only | **cannot self-verify or self-close actions** | response only |

Configuration authority remains separate from operational authority; identity remains `profiles.id`; actor values are server-derived in governed commands; immutable audit evidence retained. No permission was created or granted during this closeout.

## 13. FY2032 (Phase-E) reconciliation

Plan `5dd6a953-663c-4e70-9c72-e3d72dd01571` — status **Closed**, engagements **20**, terminal **20**, undisposed **0**, before and after the closeout probes. The one write attempt against FY2032 (`status = 'Draft'`) was denied by `IA_PLAN_CLOSED`; no closeout test mutated FY2032.

## 14. Tests, typecheck, build

| Check | Result |
|---|---|
| Targeted IA Vitest (`auditTabValidation`, `auditWorkflowVocabulary`, `src/lib/audit/__tests__`) | 6 files / **62 passed** |
| Full Vitest | 6919 passed / **31 failed** / 11 skipped / 14 todo across 408 files |
| IA-attributable failures | **0** |
| Typecheck (`tsgo`, tsconfig.app.json) | PASS |
| Build | build OK |

The 31 failures are pre-existing non-IA drift: Communication Hub / Omni-Comms runtime harnesses (`commHubP3*`, `CommHub*`, `readinessReadOnly`, `activity-automation-route`, missing workflow file `omni-comms-build4a-certification.yml`), one Compliance scratch render test (`tmp_findings_render.tsx` — missing `QueryClientProvider`) and Compliance field-audit tests. This repository is **not** all-green; Internal Audit is.

## 15. Deferred to Stage 2F (recorded, not remediated)

| Reference | Current mechanism | Central? |
|---|---|---|
| Finding reference | `ia_assign_finding_reference` trigger + `ia_finding_ref_seq` (`FND-YYYY-#####`, last value 42) | No |
| Working Paper reference | `ia_assign_working_paper_reference` trigger + `ia_working_paper_ref_seq` (`WP-YYYY-#####`) | No |
| Evidence reference | table-local generation | No |
| Report reference | table-local generation | No |
| Leave Request reference | table-local generation | No |

Count = **5**. All are server-side (not browser-generated), so they are convergence debt, not a live integrity defect.

## 16. External production-readiness observations (not Stage-2 IA defects)

1. **Platform IP-access fail-open** — still present: `src/hooks/useIPAccessCheck.ts` returns `{ ip: 'unknown', allowed: true }` when the client IP cannot be resolved or the check times out. Remains an OPEN platform security observation until fixed or formally risk-accepted. Not an Internal Audit Stage-2 defect.
2. **Communication Hub test drift** — 31 pre-existing failures as listed in §14, tracked separately (OBS-E2E-D lineage).

Count = **2**.

## 17. Final defect ledger

| Defect | Status |
|---|---|
| DEF-E2E-006 | CLOSED |
| DEF-E2E-007 | CLOSED |
| DEF-E2E-008 | CLOSED |
| DEF-E2E-009 | CLOSED |
| DEF-E2E-010 | CLOSED |
| DEF-E2E-011 | CLOSED |
| DEF-E2E-012 | CLOSED |
| DEF-E2E-013 | CLOSED |
| IA-UX-VAL-001 | CLOSED |

No previously closed defect regressed.

## 18. Scope of this result

A PASS here means only that Internal Audit Stage-2 convergence is architecturally and transactionally closed. It does **not** certify infrastructure, disaster recovery, performance/load, provider delivery, penetration testing, or production cutover approval.

---

INTERNAL AUDIT STAGE 2 CONVERGENCE CLOSEOUT: PASS

STAGE 2A: PASS

STAGE 2B: PASS

STAGE 2C: PASS

STAGE 2D: PASS

STAGE 2E: PASS

IA MULTI-TAB VALIDATION UX: PASS

OPEN STAGE-2 DEFECTS: 0

NEW INVALID MASTER/REFERENCE TRANSACTIONS: 0

CROSS-DOMAIN REFERENCE BYPASSES: 0

DIRECT CLIENT WORKFLOW BYPASSES: 0

CLIENT-GENERATED ENGAGEMENT CODES: 0

UNEXPLAINED AUTHORITATIVE SOURCE DRIFT: 0

HISTORICAL EXCEPTIONS: 7

KNOWN ORG REFERENCE REQUIRING BUSINESS DECISION: 1

PHASE-E FY2032: CLOSED · 20/20

DEFERRED AUTHORITATIVE REFERENCES FOR STAGE 2F: 5

EXTERNAL PRODUCTION-READINESS OBSERVATIONS: 2

READY FOR STAGE 2F: YES

READY FOR PRODUCTION: NOT ASSESSED
