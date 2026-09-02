# IA Master / Reference Data Register — 2026-09-02

Stage 1 (DISCOVERY) of the Master, Reference & Configuration Data Integrity
Convergence wave. **No remediation code has been written yet** — per section 3
of the mandate, classification is completed and published first.

Starting HEAD: `64991b10d` (accepted Phase-E closure baseline `64991b10d015…`).

Phase-E evidence is untouched: FY2032 plan remains `Closed`, all 20
engagements remain terminal, `docs/internal-audit/phase-e-final-closure-wave.md`
is unmodified.

## Classification legend

| Code | Meaning |
|---|---|
| A | ENTERPRISE_MASTER — platform-wide, IA must reuse |
| B | MODULE_REFERENCE_MASTER — IA-owned configurable reference |
| C | GOVERNED_WORKFLOW_VOCABULARY — lifecycle states, no admin CRUD |
| D | DERIVED_SYSTEM_VALUE — computed, never a master screen |
| E | TRANSACTIONAL_VALUE — record-specific narrative |

## Register

| # | Concept | Current source | Storage | Existing master? | Class | Risk | Decision |
|---|---|---|---|---|---|---|---|
| 1 | **Fiscal Year** | `new Date().getFullYear()` in `AnnualPlanForm.tsx:31`, `RiskAssessment.tsx:238/265/532`, `RiskRegister.tsx:53`, `PlanningWizard.tsx:36`, `CarryForwardBoard.tsx:18` | `ia_annual_plans.fiscal_year TEXT` | **NONE anywhere on the platform** (schema scan for `%fiscal%`/`%financial_year%` returned zero tables) | A (must become one) | **HIGH** | DEF-E2E-006. Create canonical platform Fiscal Year master; plan references `fiscal_year_id` with text snapshot |
| 2 | Department | `ia_departments` + `department_id` FK on plans/engagements | UUID | `ia_departments` (canonical for IA) | A | LOW | Reuse. 1 orphan engagement to remediate (see reconciliation) |
| 3 | Department Head | `ia_departments.head_profile_id` | UUID | yes | A | MED | Add Configuration Health rule: active auditable dept without resolvable head |
| 4 | Function | `ia_department_functions` + `function_id` | UUID | yes | A/B | LOW | Reuse; enforce Function→Department parent validation server-side |
| 5 | Process | `ia_rcm_processes` | UUID | yes (RCM) | B | MED | Reuse RCM process master; engagement-level process remains transactional where genuinely one-off |
| 6 | **Audit / Engagement Type** | three divergent hardcoded arrays: `AuditEngagements.tsx:29`, `AddEngagementToPlanForm.tsx:15`, `EditEngagementDialog.tsx:20` | `engagement_type TEXT`, no validation | none | B | **HIGH** | DEF-E2E-007. Single governed reference + server allow-list |
| 7 | **Coverage Category** | `EditEngagementDialog.tsx:22` local array; other screens free | `coverage_category TEXT` | none | B | **HIGH** | DEF-E2E-008 — live data proves the column is polluted with risk ratings |
| 8 | Risk Classification | `RISK_LEVELS` arrays in `RiskRegister.tsx:36`, `RiskAssessment.tsx:26`, `AuditEngagements.tsx:27`, `EditEngagementDialog.tsx:21` | `engagement_risk_rating TEXT` | `ia_risk_classification_thresholds`, `ia_risk_config_master`, `ia_risk_scoring_models` **already canonical** | B (derive) | MED | Do NOT create a new master — bind the UI arrays to the existing thresholds table |
| 9 | Finding Severity | `AuditActionCentre.tsx:31` | `ia_findings.severity`, history in `ia_finding_severity_history` | shares risk vocabulary | B | MED | Confirm identity with risk bands; reuse, do not duplicate |
| 10 | Impact Area | `AuditFindingsTab.tsx:22` | text | none | B | LOW | Candidate reference (low volume) |
| 11 | Finding Category / Root Cause | not modelled | free text | none | B | MED | Recommend `root_cause_category_id` + `root_cause_detail` |
| 12 | Evidence / Working Paper / Document Type | `ia_evidence`, `ia_working_papers`, `ia_document_templates`, `TemplatesManagement.tsx:15-16` | text | partial (`ia_document_template_settings`) | B | MED | Reuse IA document taxonomy, no new table |
| 13 | Report Type | `ia_audit_reports`, `ia_report_versions` | text | none | B | LOW | Evidence-driven; likely fixed canonical vocabulary |
| 14 | Follow-Up Type | `ia_follow_ups` | text, RPC accepts free text | none | B | MED | Governed reference + server DENY on unknown |
| 15 | Corrective Action Type | `ia_action_tracking` | text | none | B/E | LOW | Investigate only — no master unless analytics need proven |
| 16 | Activity Type | `ia_activity_types` | table | **yes** | B | LOW | Already governed — pattern to copy |
| 17 | Oversight Body / Committee | `ia_annual_plans.board_committee_name TEXT` | text | none central | B/E | LOW | Repeated bodies → reference; else retain text |
| 18 | Auditor identity | `ia_auditors` + profiles | UUID | yes | A | LOW | Reuse; `AUDIT_ROLES`/`SENIORITY_LEVELS`/`AVAILABLE_SKILLS`/`AVAILABLE_CERTIFICATIONS` in `AuditorProfiles.tsx:18-32` are hardcoded reference lists → class B |
| 19 | Leave / Work / Template type | `AuditorLeaveManagement.tsx:19`, `TimeTracking.tsx:16`, `TemplatesManagement.tsx:15` | text | none | B | LOW | Configurable reference candidates |
| 20 | **Quarter / Month** | manual `Q1..Q4` + `MONTHS` array (`EditEngagementDialog.tsx:64`) | `quarter TEXT`, `month TEXT` | none | **D** | **HIGH** | Must derive from fiscal calendar + planned dates; a Jan-start and Apr-start FY cannot share Q1 semantics |
| 21 | **Engagement code** | client `Date + Math.random()` — `AuditEngagements.tsx:33-34`, `EditEngagementDialog.tsx:357-358`, `AddEngagementToPlanForm.tsx:89-90` | `engagement_code TEXT` | platform numbering engine `core_number_sequence` / `core_generate_number` exists | **D** | **HIGH** | DEF-E2E-009. Not master data — move to server sequence per `docs/architecture/auto-code-standards.md` |
| 22 | Finding / WP / Action / Report / Query references | mixed | text | numbering engine | D | MED | Inventory each; server-generate |
| 23 | Lifecycle statuses (`STATUSES`, `ENGAGEMENT_STATUSES`, `ACTION_STATUSES`, `FINDING_STATUSES`, `LIFECYCLE_PHASES`, `LIFECYCLE_STAGES`, `RATINGS`) | hardcoded in 7+ files | text columns | server state machines exist (`ia_transition_execution_status`, `ia_close_engagement`) | **C** | MED | No admin CRUD. Converge duplicated constants into one canonical workflow contract shared by UI + server |
| 24 | Scope, objective, criteria, description, cause, effect, recommendation, notes, agenda | forms | text | n/a | E | — | Correctly transactional |
| 25 | Merge fields / fonts / table presets / colours / file MIME allow-list | UI constants | n/a | n/a | not business data | — | Out of scope |

## Counts

- Reusable concepts reviewed: **25**
- ENTERPRISE_MASTER (A): **5** (Fiscal Year, Department, Department Head, Function, Auditor identity)
- MODULE_REFERENCE_MASTER (B): **12**
- GOVERNED_WORKFLOW_VOCABULARY (C): **1 family (7 duplicated constant sets)**
- DERIVED_SYSTEM_VALUE (D): **3** (Quarter/Month, Engagement code, other references)
- TRANSACTIONAL_VALUE (E): **2 families**
- Existing platform/module masters identified for reuse: **8**
  (`ia_departments`, `ia_department_functions`, `ia_rcm_processes`, `ia_auditors`,
  `ia_activity_types`, `ia_risk_classification_thresholds`, `ia_risk_config_master`,
  `core_number_sequence`)
- Duplicate masters explicitly avoided: **4** (risk band master, quarter master,
  number master, department duplicate)
- New masters genuinely required: **1 enterprise (Fiscal Year) + 3–5 IA reference**
  (Audit Type, Coverage Category, Follow-Up Type, optional Root Cause / Impact Area)

## Hardcoded-list census

Configurable business lists currently hardcoded in the IA UI: **21**
(excluding pure presentation constants). Target after remediation: **0**.

Free-text authoritative reference columns: **6**
(`fiscal_year`, `engagement_type`, `coverage_category`, `engagement_risk_rating`,
`quarter`, `month`). Target after remediation: **0** authoritative
(text retained only as display snapshots beside an ID).
