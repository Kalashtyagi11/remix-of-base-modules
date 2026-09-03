# Internal Audit — Pre-Reset Snapshot (2026-09-04)

Read-only rebaseline taken **before** any deletion, per Section 2 of the
"Clean Test Reset + 50-Engagement Full E2E Certification" instruction.
No writes were performed while producing this snapshot.

## 1. Runtime / environment identity

| Item | Value |
| --- | --- |
| Git HEAD | `d59dadd72` — "Finalized IA Stage 2F audit" |
| Preceding commits | `aec84696d` Changes · `556765a72` Fixed draft plan update flow |
| Branch | `edit/edt-b3cb5c88-0559-4ab8-a899-3db83fc78d86` |
| Working tree | clean at snapshot time |
| Database | Lovable Cloud **TEST** backend (session-bound test environment) |
| Published/Live backend | separate environment — **not** touched by this exercise |
| Environment verdict | **CONFIRMED TEST** — the published application runs against a different backend instance |
| DB role in use | restricted read role (`sandbox_exec`), read-only for this snapshot |

## 2. Schema surface

- Internal Audit tables in `public` (`ia_*`): **123**
- Certified architecture in force: Stage 2A–2F + IA Multi-Tab Validation UX.
- Guard triggers active: `zz_ia_finding_reference_guard`, `zz_ia_working_paper_reference_guard`,
  `zz_ia_evidence_reference_guard`, `zz_ia_report_number_guard`,
  `zz_ia_leave_request_reference_guard`, `zz_ia_engagement_org_ref_guard`,
  `zz_ia_workflow_status_guard` family.

## 3. Transactional estate (pre-reset)

### 3.1 Root records

| Table | Rows |
| --- | --- |
| `ia_annual_plans` | 22 |
| `ia_audit_engagements` | 142 |

Annual plan status spread: Closed 15 · Approved 4 · Draft 2 · Removed 1.

Engagement status spread: Cancelled 74 · Closed 28 · Planned 22 ·
Carried Forward 17 · In Progress 1.

### 3.2 Non-empty IA tables (live tuple estimates)

```text
ia_action_extensions            7     ia_finding_severity_history      1
ia_action_progress_log         30     ia_findings                     51
ia_action_tracking             33     ia_fiscal_year_migration_map    18
ia_activities                  20     ia_follow_ups                   18
ia_annual_plans                22     ia_leave_requests                1
ia_approval_actions            60     ia_management_responses         49
ia_audit_checklists             1     ia_office_holder                18
ia_audit_engagements          142     ia_plan_amendments               7
ia_audit_event               1328     ia_plan_artifacts                4
ia_audit_reports               40     ia_plan_carry_forward           18
ia_audit_settings               4     ia_plan_change_log             201
ia_audit_universe              10     ia_plan_version_engagements    136
ia_auditors                    11     ia_plan_versions                12
ia_auto_notification_log      145     ia_plan_workflow_bindings        2
ia_auto_plan_candidates       278     ia_planning_parameters           1
ia_availability_conflicts      87     ia_planning_score_explanations 278
ia_comms_obligation_policy      3     ia_preparation_checklists       14
ia_comms_payload_alias         28     ia_preparation_documents         2
ia_comms_pre_release_quarantine 8     ia_quality_reviews              29
ia_comms_recovery_probe         6     ia_rcm_controls                 13
ia_comms_reminder_policy       14     ia_rcm_processes                 5
ia_comms_reminder_run_log      62     ia_rcm_risks                    12
ia_communication_stages       160     ia_recommendations              41
ia_control_tests               13     ia_reference_migration_map      14
ia_department_functions        55     ia_reference_type                3
ia_departments                 23     ia_reference_value              27
ia_distribution_recipients      1     ia_report_versions              33
ia_document_requests            1     ia_risk_assessments             43
ia_engagement_execution_log   195     ia_risk_recalc_log              19
ia_engagement_schedule_history 33     ia_risk_register                 5
ia_escalation_cert_log         28     ia_time_logs                     1
ia_evidence                    40     ia_working_papers               21
```

The remaining `ia_*` tables (of 123) are empty.

## 4. Dependency-ordered purge inventory (FK-derived, not guessed)

Derived recursively from `pg_constraint` from the roots
`ia_annual_plans` / `ia_audit_engagements`.

**Level 1 (direct children):**
`ia_action_tracking`, `ia_activities`, `ia_audit_checklists`, `ia_audit_closure`,
`ia_audit_plan_functions`, `ia_audit_queries`, `ia_audit_reports`,
`ia_availability_conflicts`, `ia_communication_stages`, `ia_communications`,
`ia_control_tests`, `ia_department_audits`, `ia_document_requests`,
`ia_engagement_execution_log`, `ia_engagement_risk_overrides`,
`ia_engagement_schedule_history`, `ia_evidence`, `ia_findings`, `ia_follow_ups`,
`ia_management_responses`, `ia_plan_artifacts`, `ia_plan_carry_forward`,
`ia_plan_change_log`, `ia_plan_distribution_logs`, `ia_plan_versions`,
`ia_preparation_checklists`, `ia_preparation_documents`,
`ia_prior_action_reference`, `ia_quality_reviews`, `ia_time_logs`,
`ia_working_papers`.

**Level 2 (grandchildren):**
`ia_action_extensions`, `ia_action_progress_log`, `ia_control_test_results`,
`ia_finding_severity_history`, `ia_quality_review_checklist`,
`ia_recommendations`, `ia_report_versions`.

**Additional ownership-by-column tables (no declared FK, resolved by column census):**
`ia_audit_event` (`annual_plan_id`, `engagement_id`),
`ia_auto_notification_log`, `ia_auto_plan_candidates`,
`ia_comms_reminder_run_log`, `ia_fiscal_year_migration_map`,
`ia_plan_amendments`, `ia_plan_version_engagements`, `ia_planning_assumptions`,
`ia_planning_score_explanations`, `ia_planning_wizard_state`,
`ia_resource_recommendations`, `ia_action_plan_milestones`,
`ia_action_plan_updates`.

Purge order for an in-place reset must be Level 2 → Level 1 → roots, with the
ownership-by-column tables removed alongside their matching level.

## 5. Immutable audit / event data

| Table | Rows | Window |
| --- | --- | --- |
| `ia_audit_event` | 1,328 | 2026-08-27 → 2026-09-03 |
| `ia_engagement_execution_log` | 195 | full estate |
| `ia_plan_change_log` | 201 | full estate |
| `ia_approval_actions` | 60 | full estate |

These are governed immutable evidence stores. Under the in-place fallback they
are **preserved** and reported separately; they are only zero under the
fresh-TEST-database route.

## 6. Master / reference / configuration baseline (must be preserved)

| Object | Count |
| --- | --- |
| `core_fiscal_year` | 7 (5 Open, 2 Closed) |
| `core_number_sequence` (INTERNAL_AUDIT) | 6 — ENGAGEMENT, FINDING, WORKING_PAPER, EVIDENCE, REPORT, LEAVE_REQUEST |
| `ia_reference_type` | 3 (Audit Type, Coverage Category, Follow-Up Type) |
| `ia_reference_value` | 27 |
| `ia_departments` | 23 |
| `ia_department_functions` | 55 |
| `ia_auditors` | 11–14 (active/total) |
| `ia_audit_universe` | 10 |
| `ia_rcm_processes` / `ia_rcm_risks` / `ia_rcm_controls` | 5 / 12 / 13 |
| `ia_audit_settings` | 4 |
| `ia_comms_reminder_policy` / `ia_comms_obligation_policy` | 14 / 3 |

Numbering counters are **not** to be reset; sequence gaps are valid history.

## 7. Object storage baseline

| Bucket | Objects |
| --- | --- |
| `ia-artifacts` | 38 |
| `audit-attachments` | 10 |
| `audit-assets` | 3 (configuration/branding — retain) |
| `audit-signatures` | 2 (configuration — retain) |
| Other non-IA buckets (`bn-evidence`, `core-documents`, `comm-assets`, `legal-*`, `ip-documents`, `ce-field-evidence`, `employer-documents`, `app-assets`) | not in scope |

Only `ia-artifacts` / `audit-attachments` paths provably keyed by deleted TEST
engagement UUIDs are eligible for removal, after a manifest is produced.

## 8. Communications baseline

| Object | State |
| --- | --- |
| `omni_comms_business_event_outbox` | 412 processed · 34 blocked · 0 pending |
| `ia_communication_stages` | 160 rows |
| `ia_comms_reminder_run_log` | 62 rows |
| `ia_comms_pre_release_quarantine` | 8 rows |
| `ia_auto_notification_log` | 145 rows |

No queued/pending outbox job exists at snapshot time; the 34 `blocked` rows are
governance-held and must be reconciled (cancelled/expired under Omni governance)
rather than deleted, before the new estate is seeded.

## 9. Snapshot verdict

- Environment confirmed **TEST**.
- Pre-reset estate fully characterised (roots, children, immutable stores,
  masters, storage, communications).
- Purge inventory derived from live schema evidence, not assumption.
- **No deletions have been performed.** The reset itself is the next wave.
