# Internal Audit — Stage 2E
## Workflow Vocabulary & Transition Contract Convergence (DEF-E2E-012)

Date: 2026-09-03
Scope: Internal Audit only. Stage 2A / 2B / 2C / 2D architecture unchanged.
Classification: **Class C — GOVERNED_WORKFLOW_VOCABULARY** (not administrator-maintainable master data).

---

## 1. Baseline

- Rebaselined on a clean working tree at the current Internal Audit HEAD.
- Stage 2A (Fiscal Calendar): PASS — unchanged.
- Stage 2B (Reference Masters): PASS — unchanged.
- Stage 2C (Authoritative Numbering): PASS — unchanged.
- Stage 2D (Department / Function Integrity): PASS — unchanged.
- FY2032 plan: CLOSED, 20/20 engagements — untouched.
- No Status Master table was created. No client-side state machine was introduced.

---

## 2. Live workflow state census (pre-change)

| Object | Column | Observed values |
|---|---|---|
| `ia_audit_engagements` | `execution_status` | Cancelled 55, Carried Forward 17, Closed 24, Closed – Actions Pending 3, Notification Sent 1, Planned 36 |
| `ia_audit_engagements` | `status` | Cancelled 74, Carried Forward 17, Closed 28, Planned 17 |
| `ia_findings` | `lifecycle_status` | Closed 25, Draft 2, Released 1, Responded 19, Withdrawn 3 |
| `ia_findings` | `status` (legacy) | Closed 26, Open 1, Released 1, Resolved 1, Responded 18, Withdrawn 3 |
| `ia_action_tracking` | `lifecycle_status` / `status` | Closed 21, In Progress 3, Open 5, Returned 2, Verification Required 1 |
| `ia_annual_plans` | `status` | Approved 3, Closed 15, Draft 1, Removed 1 |
| `ia_follow_ups` | `lifecycle_status` / `outcome` | Implemented 16, Scheduled 2 |
| `ia_audit_reports` | `status` | Draft 10, Issued 28 |
| `ia_quality_reviews` | `status` | Cleared 28, Superseded 1 |

No historical value was rewritten, normalised or deleted.

---

## 3. Server authority (source of the contract)

The frontend contract is derived from the governed commands, which remain the only
authority:

- Engagement — `ia_transition_execution_status`, `ia_launch_engagement`,
  `ia_close_engagement`, `ia_cancel_engagement`, `ia_evaluate_engagement_closure`,
  `ia_can_close_engagement`, `ia_can_start_engagement`, `ia_can_issue_report`.
- Finding — `ia_transition_finding` (Draft→Under Review/Withdrawn; Under Review→
  Confirmed/Draft/Withdrawn; Confirmed→Released/Withdrawn; Released→Responded/Withdrawn;
  Responded→Closed).
- Corrective action — `ia_action_submit_completion`, `ia_action_start_verification`,
  `ia_action_verify`, `ia_action_reject_verification`, `ia_action_close_v2`,
  `ia_action_cancel`, `ia_action_reopen`, `ia_action_update_progress`.
- Follow-up — `ia_followup_schedule`, `ia_followup_record_outcome`
  (In Verification / Implemented / Partially Implemented / Not Implemented / Reopened).
- Plan — `ia_submit_annual_plan`, `ia_decide_annual_plan`, `ia_close_annual_plan`,
  `ia_reopen_annual_plan`.
- Report / QA — `ia_issue_report`, `ia_start_quality_review`, `ia_conclude_quality_review`.

---

## 4. Canonical frontend contract

New: `src/config/auditWorkflowVocabulary.ts` — a typed, domain-specific mirror of the
governed vocabulary (engagement, finding, corrective action, follow-up, plan, report, QA,
plus non-governed fieldwork activity states). It provides canonical state lists, terminal
predicates, the finding transition matrix, legacy-readable value sets, and
`classifyWorkflowState()`.

Duplicate local arrays removed / rewired:

| Surface | Previous local vocabulary | Now |
|---|---|---|
| `src/pages/audit/AuditEngagements.tsx` | `STATUSES`, `PLAN_STATUS_OPTIONS` | derived from `ENGAGEMENT_STATES`, `PLAN_STATES` + legacy |
| `src/pages/audit/AuditActionCentre.tsx` | divergent action + finding arrays | `ACTION_STATES`, `FINDING_STATES` |
| `src/components/audit/EditEngagementDialog.tsx` | `ENGAGEMENT_STATUSES` + editable status field | removed; status now read-only and omitted from the generic save payload |
| `src/components/audit/execution/AuditFindingsTab.tsx` | `FINDING_STATUSES` | `FINDING_STATES` + legacy readable |
| `src/components/audit/execution/AuditActionsTab.tsx` | `ACTION_STATUSES` | `ACTION_STATES` |
| `src/components/audit/execution/AuditActivitiesTab.tsx` | activity + finding arrays | `ACTIVITY_STATES`, `FINDING_STATES` |
| `src/components/audit/execution/AuditFollowUpsTab.tsx` | outcome arrays | `FOLLOWUP_OUTCOMES(+_REQUIRING_NOTES)` |
| `src/components/audit/execution/FindingLifecycleControls.tsx` | hand-written `NEXT_STATUSES` | derived from `FINDING_TRANSITIONS` |
| `src/components/audit/workspace/AuditNextActionsPanel.tsx` | terminal set literal | `ENGAGEMENT_TERMINAL_STATES` |
| `src/hooks/useEngagementExecution.ts` | `EXECUTION_STATUSES` literal | re-export of `ENGAGEMENT_STATES` |

Lifecycle steppers (`LifecycleStepper`, `ExecutionLifecycleStepper`,
`AuditLifecycleStepper`) continue to render presentation phases; they now sit above a
single vocabulary source and no longer define enterable governed states of their own.

---

## 5. Direct-mutation protection

`useEngagementClosure.useEngagementLifecycle` previously wrote
`ia_audit_engagements.lifecycle_status` directly, including terminal completion. It now
routes any terminal disposition through the governed `ia_close_engagement` command;
`lifecycle_status` remains only a non-authoritative UI progress marker.

Database guard `public.ia_workflow_status_guard()` with trigger
`zz_ia_workflow_status_guard` (BEFORE UPDATE) now protects:

- `ia_audit_engagements` (`status`, `execution_status`)
- `ia_findings` (`lifecycle_status`)
- `ia_action_tracking` (`lifecycle_status`, `status`)
- `ia_annual_plans` (`status`)
- `ia_follow_ups` (`lifecycle_status`, `status`, `outcome`)
- `ia_audit_reports` (`status`)
- `ia_quality_reviews` (`status`)

Client roles (`anon`, `authenticated`) receive SQLSTATE `42501`
`IA_USE_GOVERNED_COMMAND`; governed SECURITY DEFINER commands (owned by `postgres`)
pass through unchanged. Migrations were additive and idempotent; no row data was altered.

---

## 6. Authenticated security / transaction matrix

Executed with a real least-privilege session (Head of Internal Audit) over PostgREST —
no service-role shortcut.

| # | Test | Result |
|---|---|---|
| 1 | PATCH engagement `execution_status` directly | 403 `IA_USE_GOVERNED_COMMAND` |
| 2 | PATCH engagement `status` directly | blocked (execution gate raised first, then guard) |
| 3 | PATCH engagement non-workflow field (`scheduling_notes`) | 200 — unrelated edits still work (probe value reverted) |
| 4 | Anonymous PATCH engagement status | 401 permission denied |
| 5 | PATCH `ia_findings.lifecycle_status` | 403 `IA_USE_GOVERNED_COMMAND` |
| 6 | PATCH `ia_action_tracking.lifecycle_status` | 403 `IA_USE_GOVERNED_COMMAND` |
| 7 | PATCH `ia_annual_plans.status` | 403 `IA_USE_GOVERNED_COMMAND` |
| 8 | PATCH `ia_follow_ups.lifecycle_status` | 403 `IA_USE_GOVERNED_COMMAND` |
| 9 | PATCH `ia_audit_reports.status` | 403 `IA_USE_GOVERNED_COMMAND` |
| 10 | PATCH `ia_quality_reviews.status` | 403 `IA_USE_GOVERNED_COMMAND` |
| 11 | `ia_transition_execution_status` with invalid state "Bananas" | rejected `IA_INVALID_STATUS` |
| 12 | `ia_transition_execution_status` to `Closed` | rejected `IA_USE_CLOSURE_COMMAND` |

### Disclosure — test-induced data touch (corrected)

Before the plan guard existed, negative test #7 succeeded and flipped annual plan
`3a11e7aa-6227-4b6e-a960-0005f1f1346b` (FY2030) from `Draft` to `Approved`. This was the
defect the test was looking for. The row was restored to `Draft` with its original
`updated_at`, the guard was then extended to `ia_annual_plans`, and the same test now
returns 403. No other record was affected; FY2032 remained untouched.

---

## 7. Configuration Health

New `src/hooks/audit/useIaWorkflowIntegrityHealth.ts` and a
"Workflow integrity checks (Stage 2E)" card on `AuditConfigurationHealth`. Checks
IA-WF-01..05 classify persisted values as CANONICAL (PASS), LEGACY_READABLE (HISTORICAL)
or UNKNOWN (CRITICAL). Legacy values are reported, never silently rewritten.

---

## 8. Tests and regressions

- New: `src/__tests__/auditWorkflowVocabulary.test.ts` — 9 parity tests covering the
  engagement transition set, closure separation, the finding transition matrix,
  action SoD (management cannot enter Verified/Closed), follow-up outcomes, plan states,
  terminal predicates and legacy classification. All pass.
- TypeScript project check: clean.
- Vitest full run: 6,905 passed. 31 failures in 12 files, all pre-existing and unrelated
  to Internal Audit (Communication Hub legacy drift — OBS-E2E-D — plus the pre-existing
  compliance scratch test `src/__tests__/tmp_findings_render.test.tsx`). No Internal Audit
  test failed.

---

## 9. Verdict

STAGE 2E — WORKFLOW VOCABULARY & TRANSITION CONTRACT CONVERGENCE: **PASS**
DEF-E2E-012: **CLOSED**
STAGE 2A: PASS (unchanged) · STAGE 2B: PASS (unchanged) · STAGE 2C: PASS (unchanged) · STAGE 2D: PASS (unchanged)
FY2032 PLAN: CLOSED · 20/20
STATUS MASTER: NOT CREATED (Class C governed vocabulary, by design)
STAGE 2F: NOT STARTED
